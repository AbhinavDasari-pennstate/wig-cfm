"""FastAPI app: serves the client demo dashboard, the live demo JSON, and the
real channel ingestion endpoints from the implementation guide.

Run:  uvicorn orchestrator.main:app --port 8000   (or `make run`)

Two surfaces:
  • GET /api/demo        — runs all scenarios on a fresh backend (powers the dashboard)
  • POST /feedback/*      — live ingestion against an app-level backend (accumulates state)
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from agents import agent1_intake, agent5_procurement, agent2_warranty
from channels import (ecomm_listener, email_listener, qr_listener, whatsapp_listener)
from core.backend import DemoBackend
from core.llm import ScriptedLLMRunner
from demo.runner import build_report
from models.feedback_ticket import Brand, FeedbackChannel, FeedbackTicket, Language

app = FastAPI(title="WIG Customer Feedback Intelligence — Demo")
# The dashboard is the built React app (web-react/dist). dist/ is committed so the
# host serves it directly — there is no Node build step at deploy time.
DIST = Path(__file__).resolve().parent.parent / "web-react" / "dist"

# Vite emits hashed JS/CSS plus the self-hosted editorial fonts under dist/assets,
# all referenced from index.html as /assets/*. Not an API surface; serves files only.
app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

def _select_runner():
    """WIG_RUNNER=sdk + ANTHROPIC_API_KEY → real LLM for live ingestion + fren.
    Anything else (including a broken key) → scripted, logged, never fatal.
    The /api/demo report ALWAYS uses ScriptedLLMRunner (see demo/runner.py)."""
    if os.environ.get("WIG_RUNNER", "scripted").lower() == "sdk":
        try:
            from core.llm_sdk import SDKRunner
            return SDKRunner()
        except Exception as exc:
            logging.getLogger("wig.llm").warning(
                "WIG_RUNNER=sdk but SDKRunner unavailable (%s) — running scripted", exc)
    return ScriptedLLMRunner()


# App-level backend for live ingestion (the dashboard uses a fresh one per call).
_BACKEND = DemoBackend()
_RUNNER = _select_runner()


async def _intake_and_route(ticket: FeedbackTicket) -> dict:
    a1 = await agent1_intake.process_intake(ticket, _BACKEND, _RUNNER)
    routing = a1["routing"]
    out = {"routing": routing, "acknowledgment": a1["acknowledgment"],
           "sap_ticket_id": ticket.sap_ticket_id, "brand": ticket.brand.value,
           "category": ticket.category.value, "urgency": ticket.urgency_score}
    if routing == "HITL":
        _BACKEND._log("hitl_escalation", sap_ticket_id=ticket.sap_ticket_id)
    elif routing == "AGENT5":
        out["diagnosis"] = await agent5_procurement.process_out_of_stock(ticket, _BACKEND, _RUNNER)
    return out


@app.get("/health")
async def health() -> dict:
    return {"status": "ok",
            "runner": "sdk" if hasattr(_RUNNER, "fren") else "scripted",
            "llm_fallbacks": getattr(_RUNNER, "fallbacks", 0)}


_REPORT_CACHE: dict | None = None


@app.get("/api/demo")
async def api_demo(refresh: bool = False) -> JSONResponse:
    """Serve the report from memory. It is deterministic, so build once and cache;
    pass ?refresh=1 to rebuild (e.g. to re-anchor relative timestamps)."""
    global _REPORT_CACHE
    if _REPORT_CACHE is None or refresh:
        _REPORT_CACHE = await build_report()
    return JSONResponse(_REPORT_CACHE)


@app.post("/feedback/email")
async def feedback_email(raw_email: dict) -> dict:
    return await _intake_and_route(await email_listener.parse_email(raw_email))


@app.post("/feedback/whatsapp")
async def feedback_whatsapp(payload: dict) -> dict:
    return await _intake_and_route(await whatsapp_listener.parse_whatsapp(payload))


@app.post("/feedback/ecomm")
async def feedback_ecomm(payload: dict) -> dict:
    return await _intake_and_route(await ecomm_listener.parse_ecomm_webhook(payload))


@app.post("/feedback/qr")
async def feedback_qr(payload: dict) -> dict:
    """QR scans bypass Agent 1 and route straight to the procurement agent."""
    ticket = await qr_listener.parse_qr_scan(payload)
    created = _BACKEND.create_ticket({
        "customer_id": ticket.customer_id, "brand": ticket.brand.value,
        "category": ticket.category.value, "urgency_score": ticket.urgency_score,
        "language": ticket.customer_language.value, "raw_text": ticket.raw_text,
        "channel": ticket.channel.value, "store_name": ticket.store_name,
        "product_sku": ticket.product_sku})
    ticket.sap_ticket_id = created["sap_ticket_id"]
    diag = await agent5_procurement.process_out_of_stock(ticket, _BACKEND, _RUNNER)
    return {"sap_ticket_id": ticket.sap_ticket_id, "diagnosis": diag}


def _reconstruct(sap_ticket_id: str) -> FeedbackTicket:
    rec = _BACKEND.tickets.get(sap_ticket_id)
    if not rec:
        raise HTTPException(404, f"unknown ticket {sap_ticket_id}")
    t = FeedbackTicket(raw_text=rec.get("raw_text", ""),
                       channel=FeedbackChannel(rec.get("channel", "EMAIL")),
                       customer_id=rec.get("customer_id"),
                       product_sku=rec.get("product_sku"),
                       store_name=rec.get("store_name"))
    t.sap_ticket_id = sap_ticket_id
    t.customer_language = Language(rec.get("language", "ENGLISH"))
    t.brand = Brand(rec.get("brand", "OTHER"))
    return t


@app.post("/restock-confirmed")
async def restock_confirmed(payload: dict) -> dict:
    """SAP inventory webhook → proactively notify the original customer (Agent 5 / Gap A)."""
    t = _reconstruct(payload["sap_ticket_id"])
    res = await agent5_procurement.notify_customer_on_restock(
        t, _BACKEND, _RUNNER, aisle=payload.get("aisle", "—"))
    return {"status": "customer_notified", "scores": res["scores"]}


@app.post("/fulfillment-confirmed")
async def fulfillment_confirmed(payload: dict) -> dict:
    """Warranty desk confirms dispatch → send the loop-close + survey (Agent 2 / Gaps A & C)."""
    t = _reconstruct(payload["sap_ticket_id"])
    res = await agent2_warranty.complete_fulfillment(
        t, _BACKEND, _RUNNER, tracking=payload.get("tracking", "—"))
    return {"status": "loop_closed", "scores": res["scores"]}


@app.get("/")
async def index() -> FileResponse:
    return FileResponse(DIST / "index.html")
