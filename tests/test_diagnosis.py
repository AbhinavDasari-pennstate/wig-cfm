"""Agent 5 — the three out-of-stock diagnosis paths + HR-safe coaching."""

from core.backend import DemoBackend
from core.llm import ScriptedLLMRunner
from agents import agent4_coaching, agent5_procurement
from models.feedback_ticket import (Brand, FeedbackCategory, FeedbackChannel,
                                     FeedbackTicket)


def _oos(sku):
    return FeedbackTicket(raw_text=f"{sku} missing from shelf", channel=FeedbackChannel.QR_KIOSK,
                          brand=Brand.NESTO, category=FeedbackCategory.OUT_OF_STOCK,
                          store_code="NESTO-DXB-12", product_sku=sku)


async def _diag(sku):
    backend = DemoBackend()
    res = await agent5_procurement.process_out_of_stock(_oos(sku), backend, ScriptedLLMRunner())
    return backend, res


async def test_case3_backroom_stock_notifies_store_manager_only():
    backend, res = await _diag("RF-BL100")  # backroom 8, shelf 0
    assert res["case"] == 3 and res["action"] == "store_manager_notified"
    kinds = [a["kind"] for a in backend.audit]
    assert "store_manager_notified" in kinds
    assert "buyer_notified" not in kinds  # no procurement action


async def test_case2_open_po_notifies_procurement_and_store():
    backend, res = await _diag("DC-PAN20")  # total 0, an open late PO exists
    assert res["case"] == 2
    kinds = [a["kind"] for a in backend.audit]
    assert "procurement_notified" in kinds and "store_manager_notified" in kinds


async def test_case1_no_po_routes_to_human_buyer():
    backend, res = await _diag("RF-AF250")  # total 0, no PO, regular history
    assert res["case"] == 1 and res["action"] == "human_buyer_notified"
    assert backend.human_queue[0]["type"] == "PROCUREMENT_APPROVAL"


async def test_coaching_never_names_an_individual():
    backend = DemoBackend()
    reports = await agent4_coaching.generate_coaching_reports(backend, ScriptedLLMRunner())
    assert reports, "expected at least one coaching report"
    for r in reports:
        assert "team" in r["coaching_summary"].lower()
        # team-level references only — no first/last-name patterns
        assert "@" not in r["coaching_summary"]
    royalford = next(r for r in reports if r["brand"] == "ROYALFORD")
    assert royalford["nps_score"] < agent4_coaching.WIG_NPS_AVERAGE  # the coaching target
