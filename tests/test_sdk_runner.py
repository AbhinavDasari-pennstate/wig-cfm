"""SDKRunner — real-LLM runner: shape compatibility + fallback guarantees.

Uses a fake client; no network or API key is ever needed in the suite.
"""

from types import SimpleNamespace

import pytest

from core.llm import ScriptedLLMRunner
from core.llm_sdk import SDKRunner, IntakeResult, DraftedMessage


class _FakeMessages:
    def __init__(self, parsed=None, error=None, text=None):
        self.parsed, self.error, self.text = parsed, error, text
        self.calls = []

    async def parse(self, **kwargs):
        self.calls.append(kwargs)
        if self.error:
            raise self.error
        return SimpleNamespace(parsed_output=self.parsed)

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        if self.error:
            raise self.error
        return SimpleNamespace(content=[SimpleNamespace(type="text", text=self.text)])


def _runner(**kw) -> SDKRunner:
    return SDKRunner(client=SimpleNamespace(messages=_FakeMessages(**kw)),
                     model="claude-opus-4-8")


async def test_intake_triage_returns_scripted_compatible_shape():
    parsed = IntakeResult(language="ARABIC", brand="GEEPAS",
                          category="WARRANTY_RETURN", urgency_score=3,
                          acknowledgment="حضرتكم...")
    runner = _runner(parsed=parsed)
    out = await runner.run("intake_triage", {"raw_text": "المكواة لا تعمل",
                                             "customer_name": "Fatima",
                                             "brand_hint": None})
    assert out == {"language": "ARABIC", "brand": "GEEPAS",
                   "category": "WARRANTY_RETURN", "urgency_score": 3,
                   "acknowledgment": "حضرتكم..."}
    # The scripted runner returns the identical key set for this task.
    scripted = await ScriptedLLMRunner().run(
        "intake_triage", {"raw_text": "Geepas iron not working",
                          "customer_name": "Fatima", "brand_hint": None})
    assert set(out) == set(scripted)


async def test_draft_tasks_return_message_dict():
    runner = _runner(parsed=DraftedMessage(message="Dear Fatima, ..."))
    for task in ("draft_decline", "draft_loop_close", "draft_restock"):
        out = await runner.run(task, {"language": "ENGLISH", "brand": "GEEPAS",
                                      "customer_name": "Fatima",
                                      "product_name": "Steam Iron"})
        assert out == {"message": "Dear Fatima, ..."}


async def test_api_failure_falls_back_to_scripted_result():
    runner = _runner(error=RuntimeError("simulated outage"))
    payload = {"language": "ENGLISH", "brand": "GEEPAS",
               "customer_name": "Fatima", "product_name": "Steam Iron",
               "tracking": "TRK-1"}
    out = await runner.run("draft_loop_close", payload)
    scripted = await ScriptedLLMRunner().run("draft_loop_close", payload)
    assert out == scripted          # caller cannot tell the difference
    assert runner.fallbacks == 1    # but the event is counted


async def test_unknown_task_keeps_scripted_contract():
    runner = _runner(parsed=None)
    with pytest.raises(ValueError):
        await runner.run("not_a_task", {})


async def test_guardrail_routing_is_runner_independent():
    """Urgency 4-5 HITL routing is Python code — the runner cannot change it."""
    from agents import agent1_intake
    from core.backend import DemoBackend
    from models.feedback_ticket import FeedbackChannel, FeedbackTicket

    parsed = IntakeResult(language="ENGLISH", brand="GEEPAS",
                          category="PRODUCT_QUALITY", urgency_score=5,
                          acknowledgment="Dear customer, ...")
    runner = _runner(parsed=parsed)
    ticket = FeedbackTicket(raw_text="the kettle sparked and burned my hand",
                            channel=FeedbackChannel.EMAIL)
    res = await agent1_intake.process_intake(ticket, DemoBackend(), runner)
    assert res["routing"] == "HITL"


async def test_fren_returns_answer_text():
    runner = _runner(text="GEEPAS NPS is +38 this week.")
    out = await runner.fren("how is GEEPAS", "GEEPAS: NPS +38")
    assert out == "GEEPAS NPS is +38 this week."


async def test_fren_failure_returns_none_and_counts():
    runner = _runner(error=RuntimeError("simulated outage"))
    out = await runner.fren("how is GEEPAS", "GEEPAS: NPS +38")
    assert out is None
    assert runner.fallbacks == 1
