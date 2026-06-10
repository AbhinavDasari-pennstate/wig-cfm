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
from datetime import datetime, timezone
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


def _fren_context(report: dict) -> str:
    """Compact, PII-free dashboard summary for fren. Aggregates only —
    no customer names, no raw ticket text (UAE PDPL)."""
    lines = ["Weekly brand metrics (CSAT /5, NPS, CES /5, tickets):"]
    for brand, m in sorted((report.get("brand_metrics") or {}).items()):
        lines.append(f"- {brand}: CSAT {m['csat']}, NPS {m['nps']:+d}, "
                     f"CES {m['ces']}, {m['tickets']} tickets")
    snapshot = report.get("snapshot") or {}
    alerts = snapshot.get("quality_alerts") or []
    lines.append(f"Quality alerts: {len(alerts)}")
    for a in alerts:
        lines.append(f"- {a.get('brand')} {a.get('product_sku')}: {a.get('description')}")
    queue = snapshot.get("human_queue") or []
    lines.append(f"Human approval queue: {len(queue)} item(s) pending — "
                 "humans approve everything outward.")
    ss = report.get("safety_summary") or {}
    lines.append(f"Safety: {ss.get('purchase_orders_created', 0)} POs auto-created, "
                 f"{ss.get('transactional_tools_available', 0)} transactional tools wired, "
                 f"{ss.get('manipulation_attempts_contained', 0)} manipulation attempt(s) contained.")
    mix = report.get("channel_mix") or {}
    if mix:
        lines.append("Channel mix (tickets): " + ", ".join(
            f"{k} {v}" for k, v in sorted(mix.items(), key=lambda kv: -kv[1])))
    return "\n".join(lines)


@app.post("/api/fren")
async def api_fren(payload: dict) -> dict:
    """fren co-solver. {answer, fallback}; fallback=True → client uses its
    local keyword logic (offline mode keeps working unchanged)."""
    question = (payload.get("question") or "").strip()
    if not question:
        raise HTTPException(422, "question is required")
    fren = getattr(_RUNNER, "fren", None)
    if fren is None:
        return {"answer": None, "fallback": True}
    global _REPORT_CACHE
    if _REPORT_CACHE is None:
        _REPORT_CACHE = await build_report()
    answer = await fren(question, _fren_context(_REPORT_CACHE),
                        item_context=payload.get("item_context"))
    if not answer:
        return {"answer": None, "fallback": True}
    return {"answer": answer, "fallback": False}


# Operator decisions the dashboard can record. All are notify/record actions —
# none commits money, goods, or an order (a desk human performs the real-world
# step after being notified).
_ACTION_LABELS = {"Forwarded", "Released", "Applied"}


@app.post("/api/queue/{task_id}/action")
async def queue_action(task_id: str, payload: dict) -> dict:
    """Persist an operator's queue decision into the cached report so it
    survives page reloads (session-scoped; ?refresh=1 rebuilds from scratch)."""
    label = (payload.get("label") or "").strip()
    if label not in _ACTION_LABELS:
        raise HTTPException(422, f"label must be one of {sorted(_ACTION_LABELS)}")
    global _REPORT_CACHE
    if _REPORT_CACHE is None:
        _REPORT_CACHE = await build_report()
    snapshot = _REPORT_CACHE.get("snapshot") or {}
    item = next((i for i in snapshot.get("human_queue", [])
                 if i.get("workflow_task_id") == task_id), None)
    if item is None:
        raise HTTPException(404, f"unknown queue item {task_id}")
    now = datetime.now(timezone.utc).isoformat()
    item["_actioned"] = True
    item["_actionLabel"] = label
    item["_actioned_at"] = now
    note = (payload.get("note") or "").strip()
    if note:
        item["_note"] = note[:500]
    snapshot.setdefault("audit", []).append({
        "kind": "human_action", "ts": now, "workflow_task_id": task_id,
        "label": label, "actor": "operator"})
    return {"status": "recorded", "workflow_task_id": task_id, "label": label}


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
