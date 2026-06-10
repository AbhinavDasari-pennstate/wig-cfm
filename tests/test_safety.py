"""Proof of the propose-don't-transact guarantee.

These tests fail loudly if anyone ever wires a money/goods/order tool to an agent.
"""

from core.backend import DemoBackend
from core.llm import ScriptedLLMRunner
from mcp_servers import procurement_server, sap_crm_server, warranty_server
from agents import agent5_procurement
from demo.scenarios import scenario_manipulation

TRANSACTIONAL = {"create_purchase_order", "generate_return_label", "dispatch_replacement",
                 "issue_refund", "place_order"}


def test_no_server_exposes_a_transactional_tool():
    for mod in (sap_crm_server, warranty_server, procurement_server):
        assert TRANSACTIONAL.isdisjoint(set(mod.TOOL_NAMES)), mod.__name__


def test_procurement_has_no_create_po_implementation():
    # Not just unwired — the function does not exist on the module at all.
    assert not hasattr(procurement_server, "create_purchase_order")
    assert "create_purchase_order" in procurement_server.FORBIDDEN_TOOLS


def test_warranty_has_no_label_or_dispatch():
    assert not hasattr(warranty_server, "generate_return_label")
    assert not hasattr(warranty_server, "dispatch_replacement")
    assert set(warranty_server.FORBIDDEN_TOOLS) == {"generate_return_label", "dispatch_replacement"}


async def test_injection_cannot_place_an_order():
    backend = DemoBackend()
    res = await scenario_manipulation(backend, ScriptedLLMRunner())
    # The agent could only notify a human buyer — never transact.
    assert res["result"]["case"] == 1
    assert res["result"]["action"] == "human_buyer_notified"
    assert res["result"]["pos_created"] == 0
    assert len(backend.safety_events) == 1
    assert backend.safety_events[0]["capability_available"] is False
    # No audit entry represents a placed order.
    assert not any("purchase_order_created" in a["kind"] for a in backend.audit)


async def test_regular_history_still_routes_to_human_not_auto_po():
    from models.feedback_ticket import (Brand, FeedbackCategory, FeedbackChannel,
                                        FeedbackTicket)
    backend = DemoBackend()
    queue_before = len(backend.human_queue)
    ticket = FeedbackTicket(raw_text="air fryer missing from shelf",
                            channel=FeedbackChannel.QR_KIOSK, brand=Brand.NESTO,
                            category=FeedbackCategory.OUT_OF_STOCK,
                            store_code="NESTO-DXB-12", product_sku="RF-AF250")
    res = await agent5_procurement.process_out_of_stock(ticket, backend, ScriptedLLMRunner())
    assert res["case"] == 1 and res["reason"] == "REGULAR_REORDER_RECOMMENDED"
    assert any(a["kind"] == "buyer_notified" for a in backend.audit)
    # Exactly one new approval task was appended — a person must approve.
    new_items = backend.human_queue[queue_before:]
    assert len(new_items) == 1
    assert new_items[0]["reason"] == "REGULAR_REORDER_RECOMMENDED"
