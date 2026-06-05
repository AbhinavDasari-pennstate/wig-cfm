"""Agent 5 — Out-of-Stock & Procurement (transaction-safe).

Diagnoses why a product is missing and takes the RIGHT action — never guesses, never
orders. Three deterministic cases. In every "no PO" case it routes to a human buyer
with a recommendation; it has no tool to place an order, so manipulation cannot make
it spend. Attempts to inject an order are surfaced as contained safety events.
"""

from __future__ import annotations

from core.backend import DemoBackend
from core.llm import LLMRunner
from models.feedback_ticket import FeedbackTicket

SYSTEM_PROMPT = """You are the out-of-stock and procurement agent for NESTO (WIG's hypermarkets).
Diagnose why a product is missing — do not guess. Work in order: backroom stock, then open POs, then history.
You cannot resolve physical restocking (notify the store manager and stop) and you cannot place orders:
every purchase order is reviewed and approved by a human. When in doubt, route to the human buyer.
Customer notifications must feel like a personal follow-up, not an automated alert."""

# Phrases that indicate someone is trying to push the agent into a transaction.
# Detection only *surfaces* the attempt; safety does not depend on it (no order tool exists).
_INJECTION = [
    "create a purchase order", "place an order", "auto-create", "auto-approve",
    "bypass", "ignore previous", "ignore all previous", "system instruction",
    "override", "approve immediately", "without review", "skip approval", "raise a po",
]


def _store_code(ticket: FeedbackTicket) -> str:
    return ticket.store_code or "NESTO-DXB-12"


def _detect_injection(text: str) -> list[str]:
    low = text.lower()
    return [p for p in _INJECTION if p in low]


async def process_out_of_stock(ticket: FeedbackTicket, backend: DemoBackend,
                               runner: LLMRunner) -> dict:
    steps: list[dict] = []
    sku = ticket.product_sku or "UNKNOWN-SKU"
    store = _store_code(ticket)

    hits = _detect_injection(ticket.raw_text)
    if hits:
        backend.log_safety_event({
            "ticket": ticket.sap_ticket_id or ticket.ticket_id,
            "attempted_action": "place_purchase_order",
            "injected_phrases": hits,
            "capability_available": False,
            "outcome": "contained — agent has no order-placing tool; routed to human buyer",
        })
        steps.append({"label": "⚠ Manipulation attempt contained", "tool": "safety",
                      "detail": "injected order instruction ignored — no transactional capability exists"})

    inv = backend.check_inventory(sku, store)
    steps.append({"label": "Inventory check", "tool": "check_inventory_level",
                  "detail": f"shelf {inv['shelf_stock']} · backroom {inv['backroom_stock']}"})

    # Case 3 — stock in the backroom but not on the shelf: a physical task for a human.
    if inv["backroom_stock"] > 0 and inv["shelf_stock"] == 0:
        backend.notify_store_manager(store, f"{sku} has backroom stock but empty shelf — please restock.",
                                     sku=sku, ticket=ticket.sap_ticket_id)
        steps.append({"label": "Case 3 · restocking", "tool": "notify_store_manager",
                      "detail": "backroom has stock — store manager notified; no PO"})
        return {"case": 3, "action": "store_manager_notified", "steps": steps}

    # Case 2 — nothing on hand but an open PO is already in flight (and late).
    if inv["total_stock"] == 0:
        po = backend.check_existing_po(sku, store)
        steps.append({"label": "Open PO check", "tool": "check_existing_po",
                      "detail": f"po_exists={po['po_exists']}"
                                + (f" · {po['po_number']} · {po['delay_days']}d late" if po["po_exists"] else "")})
        if po["po_exists"]:
            track = backend.track_shipment(po["po_number"])
            backend.notify_procurement(
                f"{sku}: PO {po['po_number']} is {po['delay_days']} day(s) late "
                f"(ETA {po['expected_delivery_date']}, {track['status']}).", sku=sku)
            backend.notify_store_manager(store, f"{sku}: replenishment delayed, PO {po['po_number']}.",
                                         sku=sku)
            steps.append({"label": "Case 2 · shipment delayed", "tool": "track_shipment + notify",
                          "detail": "procurement + store manager notified; customer not contacted yet"})
            return {"case": 2, "po_number": po["po_number"],
                    "expected_delivery": po["expected_delivery_date"],
                    "action": "procurement_and_store_notified", "steps": steps}

    # Case 1 — no stock and no PO: ALWAYS route to a human buyer with a recommendation.
    hist = backend.get_purchase_history(sku, store)
    steps.append({"label": "Purchase history", "tool": "get_purchase_history",
                  "detail": f"{hist['order_count']} orders · avg {hist['avg_interval_days']}d · "
                            f"regular={hist['is_regular']}"})

    if hist["is_regular"]:
        last = hist["orders"][0]
        est = last["quantity"] * last["unit_price_aed"]
        reason = "REGULAR_REORDER_RECOMMENDED"
        rec = (f"Regularly stocked (every ~{hist['avg_interval_days']}d). Suggest reorder "
               f"{last['quantity']} units @ AED {last['unit_price_aed']:.0f} "
               f"(est. AED {est:.0f}) from last supplier. Awaiting human approval.")
    elif hist["order_count"] == 0:
        reason, rec = "NO_PURCHASE_HISTORY", "No purchase history — buyer to decide whether to stock this SKU."
    else:
        reason, rec = "IRREGULAR_ORDERING", "Irregular ordering cadence — buyer to review demand before reordering."

    task = backend.notify_human_buyer(sku, store, reason, rec,
                                      context=ticket.raw_text[:120],
                                      original_ticket_id=ticket.sap_ticket_id)
    steps.append({"label": "Case 1 · routed to human buyer", "tool": "notify_human_buyer",
                  "detail": f"{task['workflow_task_id']} · {reason} (no PO created)"})
    return {"case": 1, "action": "human_buyer_notified", "reason": reason,
            "recommendation": rec, "steps": steps}


async def notify_customer_on_restock(ticket: FeedbackTicket, backend: DemoBackend,
                                     runner: LLMRunner, aisle: str,
                                     survey: tuple[int, int, int] = (5, 8, 4)) -> dict:
    """Simulates the /restock-confirmed webhook once the product is back on shelf."""
    steps: list[dict] = []
    lang = ticket.customer_language.value if ticket.customer_language else "ENGLISH"
    product = ticket.product_name or ticket.product_sku or "your item"

    msg = (await runner.run("draft_restock", {
        "language": lang, "customer_name": ticket.customer_name, "product_name": product,
        "aisle": aisle, "store_name": ticket.store_name}))["message"]
    backend.send_customer_message(ticket.sap_ticket_id, lang, ticket.channel.value, msg)
    steps.append({"label": "Proactive restock notice", "tool": "send_customer_message",
                  "detail": f"{lang} · Aisle {aisle}"})

    csat, nps, ces = survey
    backend.update_resolution(ticket.sap_ticket_id, f"Restocked in Aisle {aisle}; customer notified.",
                              csat, nps, ces)
    steps.append({"label": "Survey + scores recorded", "tool": "update_ticket_resolution",
                  "detail": f"CSAT {csat}/5 · NPS {nps}/10 · CES {ces}/5"})
    return {"outcome": "resolved", "restock_message": msg,
            "scores": {"csat": csat, "nps": nps, "ces": ces}, "steps": steps}
