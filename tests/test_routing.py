"""Agent 1 routing is a deterministic table — urgency 4/5 always escalates."""

from core.backend import DemoBackend
from core.llm import ScriptedLLMRunner
from agents import agent1_intake
from models.feedback_ticket import (Brand, FeedbackCategory, FeedbackChannel,
                                     FeedbackTicket, Language)


def _ticket(text, **kw):
    return FeedbackTicket(raw_text=text, channel=FeedbackChannel.EMAIL, **kw)


async def _route(text, **kw):
    backend, runner = DemoBackend(), ScriptedLLMRunner()
    return await agent1_intake.process_intake(_ticket(text, **kw), backend, runner)


async def test_english_warranty_routes_to_agent2():
    r = await _route("My Geepas blender is broken, I need a warranty replacement.")
    t = r["updated_ticket"]
    assert t.customer_language == Language.ENGLISH
    assert t.brand == Brand.GEEPAS
    assert t.category == FeedbackCategory.WARRANTY_RETURN
    assert r["routing"] == "AGENT2"


async def test_safety_complaint_forces_hitl():
    r = await _route("The Krypton iron gave my child an electric shock — this is dangerous!")
    assert r["updated_ticket"].urgency_score == 5
    assert r["routing"] == "HITL"


async def test_out_of_stock_routes_to_agent5():
    r = await _route("The shelf is empty, this item is out of stock at your store.")
    assert r["updated_ticket"].category == FeedbackCategory.OUT_OF_STOCK
    assert r["routing"] == "AGENT5"


async def test_compliment_goes_to_buffer():
    r = await _route("Thank you, excellent service from the NESTO team!")
    assert r["routing"] == "BUFFER"


async def test_arabic_is_detected():
    r = await _route("الخلاط جيباس لا يعمل، أرجو الاستبدال تحت الضمان.")
    assert r["updated_ticket"].customer_language == Language.ARABIC
    assert r["routing"] == "AGENT2"
