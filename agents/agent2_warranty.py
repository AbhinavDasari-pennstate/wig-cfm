"""Agent 2 — Warranty & Returns (transaction-safe).

Validates eligibility (read-only), then routes fulfillment to a human — it never
generates a courier label or dispatches goods itself. The personalised loop-close
message (Gap A) and the CSAT/NPS/CES survey (Gap C) fire once a human confirms
fulfillment, mirroring Agent 5's restock flow.
"""

from __future__ import annotations

from core.backend import DemoBackend
from core.llm import LLMRunner
from models.feedback_ticket import FeedbackTicket

SYSTEM_PROMPT = """You are the warranty and returns agent for WIG. You handle claims with empathy and efficiency.
Always communicate in the customer's language; for Arabic use formal address.
The loop-close message must feel personal — use the customer's name and specific product.
Never promise a delivery date you cannot confirm. You cannot place orders, generate labels, or dispatch goods;
those require human approval. Declared value over AED 500 is flagged HIGH priority for the human."""


async def process_warranty(ticket: FeedbackTicket, backend: DemoBackend,
                           runner: LLMRunner, *, purchase_date: str,
                           declared_value_aed: float = 0.0,
                           product_model: str | None = None) -> dict:
    steps: list[dict] = []
    lang = ticket.customer_language.value
    brand = ticket.brand.value
    product = ticket.product_name or ticket.product_sku or "your item"
    model = product_model or ticket.product_sku or product

    elig = backend.check_warranty(purchase_date)
    steps.append({"label": "Warranty check", "tool": "check_warranty_eligibility",
                  "detail": f"eligible={elig['eligible']} (ends {elig['warranty_end_date']})"})

    if not elig["eligible"]:
        msg = (await runner.run("draft_decline", {
            "language": lang, "brand": brand,
            "customer_name": ticket.customer_name, "product_name": product}))["message"]
        backend.send_customer_message(ticket.sap_ticket_id, lang, ticket.channel.value, msg)
        backend.update_resolution(ticket.sap_ticket_id, "Out of warranty — declined.",
                                  None, None, None)
        steps.append({"label": "Polite decline sent", "tool": "send_customer_message",
                      "detail": "out of warranty · ticket closed"})
        return {"outcome": "declined", "customer_message": msg, "steps": steps,
                "approval_task": None}

    # Eligible → draft the loop-close now and route fulfillment to a human.
    loop_close = (await runner.run("draft_loop_close", {
        "language": lang, "brand": brand, "customer_name": ticket.customer_name,
        "product_name": product, "tracking": "to be assigned on approval"}))["message"]
    task = backend.request_fulfillment_approval(
        elig["claim_id"], brand, product, declared_value_aed, loop_close)
    steps.append({"label": "Fulfillment routed to human", "tool": "request_fulfillment_approval",
                  "detail": f"{task['workflow_task_id']} · {task['priority']} "
                            f"(declared AED {declared_value_aed:.0f})"})

    return {"outcome": "pending_human_approval", "claim_id": elig["claim_id"],
            "drafted_loop_close": loop_close, "approval_task": task, "steps": steps}


async def complete_fulfillment(ticket: FeedbackTicket, backend: DemoBackend,
                               runner: LLMRunner, *, tracking: str,
                               survey: tuple[int, int, int] = (5, 9, 5)) -> dict:
    """Simulates the /fulfillment-confirmed webhook after a human approves & ships."""
    steps: list[dict] = []
    lang = ticket.customer_language.value
    product = ticket.product_name or ticket.product_sku or "your item"

    msg = (await runner.run("draft_loop_close", {
        "language": lang, "brand": ticket.brand.value,
        "customer_name": ticket.customer_name, "product_name": product,
        "tracking": tracking}))["message"]
    backend.send_customer_message(ticket.sap_ticket_id, lang, ticket.channel.value, msg)
    steps.append({"label": "Loop-close sent", "tool": "send_customer_message",
                  "detail": f"personalised · {lang} · tracking {tracking}"})

    questions = (await runner.run("draft_survey",
                                  {"language": lang, "brand": ticket.brand.value}))["questions"]
    csat, nps, ces = survey
    backend.update_resolution(ticket.sap_ticket_id, "Replacement dispatched (human-approved).",
                              csat, nps, ces)
    steps.append({"label": "Survey + scores recorded", "tool": "update_ticket_resolution",
                  "detail": f"CSAT {csat}/5 · NPS {nps}/10 · CES {ces}/5"})

    return {"outcome": "resolved", "loop_close": msg, "survey_questions": questions,
            "scores": {"csat": csat, "nps": nps, "ces": ces}, "steps": steps}
