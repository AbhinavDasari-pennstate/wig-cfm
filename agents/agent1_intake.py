"""Agent 1 — Intake & Triage.

LLM detects language/brand/category/urgency and drafts the acknowledgment.
Python owns the routing decision (a deterministic table), so urgency-4/5
escalation can never be argued away by the model.
"""

from __future__ import annotations

from core.backend import DemoBackend
from core.llm import LLMRunner
from models.feedback_ticket import Brand, FeedbackCategory, Language, FeedbackTicket

SYSTEM_PROMPT = """You are the intake agent for Western International Group's customer feedback system.
WIG brands: GEEPAS (electronics), NESTO (hypermarkets), ROYALFORD, PARAJOHN, OLSENMARK, KRYPTON, DELCASA, JAZP (e-commerce), WIGME (e-commerce).
You serve customers across the Gulf region. Always detect language first.
Acknowledgment messages must be in the customer's language, formal, and respectful.
Urgency 5: safety risk or regulatory complaint. Urgency 4: repeated unresolved issue or angry escalation.
Never disclose internal ticket IDs or routing decisions to the customer."""


def _route(urgency: int, category: FeedbackCategory) -> str:
    if urgency >= 4:
        return "HITL"
    if category == FeedbackCategory.WARRANTY_RETURN:
        return "AGENT2"
    if category == FeedbackCategory.OUT_OF_STOCK:
        return "AGENT5"
    return "BUFFER"


async def process_intake(ticket: FeedbackTicket, backend: DemoBackend,
                         runner: LLMRunner) -> dict:
    steps: list[dict] = []

    out = await runner.run("intake_triage", {
        "raw_text": ticket.raw_text,
        "customer_name": ticket.customer_name,
        "brand_hint": ticket.brand,
    })
    ticket.customer_language = Language(out["language"])
    ticket.brand = Brand(out["brand"])
    ticket.category = FeedbackCategory(out["category"])
    ticket.urgency_score = out["urgency_score"]
    acknowledgment = out["acknowledgment"]
    steps.append({"label": "Classified", "tool": None,
                  "detail": f"{ticket.customer_language.value} · {ticket.brand.value} · "
                            f"{ticket.category.value} · urgency {ticket.urgency_score}/5"})

    created = backend.create_ticket({
        "customer_id": ticket.customer_id, "brand": ticket.brand.value,
        "category": ticket.category.value, "urgency_score": ticket.urgency_score,
        "language": ticket.customer_language.value, "raw_text": ticket.raw_text,
        "channel": ticket.channel.value, "store_name": ticket.store_name,
        "product_sku": ticket.product_sku,
    })
    ticket.sap_ticket_id = created["sap_ticket_id"]
    steps.append({"label": "Logged to SAP CRM", "tool": "create_feedback_ticket",
                  "detail": ticket.sap_ticket_id})

    routing = _route(ticket.urgency_score, ticket.category)
    steps.append({"label": "Routing decision", "tool": None,
                  "detail": routing + (" (deterministic, urgency-gated)"
                                       if routing == "HITL" else "")})

    return {"updated_ticket": ticket, "acknowledgment": acknowledgment,
            "routing": routing, "steps": steps}
