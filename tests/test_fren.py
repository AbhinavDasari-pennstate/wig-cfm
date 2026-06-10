"""POST /api/fren — LLM answer when available, explicit fallback otherwise."""

from fastapi.testclient import TestClient

import orchestrator.main as om


def test_fren_scripted_mode_returns_fallback():
    client = TestClient(om.app)
    r = client.post("/api/fren", json={"question": "how is GEEPAS doing"})
    assert r.status_code == 200
    assert r.json() == {"answer": None, "fallback": True}


def test_fren_empty_question_is_422():
    client = TestClient(om.app)
    assert client.post("/api/fren", json={"question": "  "}).status_code == 422


def test_fren_uses_runner_and_report_context(monkeypatch):
    seen = {}

    class FakeSDKRunner:
        fallbacks = 0

        async def fren(self, question, context, item_context=None):
            seen["question"], seen["context"], seen["item"] = question, context, item_context
            return "GEEPAS leads on NPS this week."

    monkeypatch.setattr(om, "_RUNNER", FakeSDKRunner())
    client = TestClient(om.app)
    r = client.post("/api/fren", json={"question": "how is GEEPAS",
                                       "item_context": "Warranty approval WF-1"})
    assert r.json() == {"answer": "GEEPAS leads on NPS this week.", "fallback": False}
    assert "GEEPAS" in seen["context"]          # brand metrics included
    assert "propose" not in seen["question"]    # question passed through verbatim
    assert seen["item"] == "Warranty approval WF-1"
    # PDPL: the context must carry aggregates only — never customer identities.
    assert "customer_name" not in seen["context"]


def test_fren_runner_failure_returns_fallback(monkeypatch):
    class FailingRunner:
        async def fren(self, question, context, item_context=None):
            return None  # SDKRunner returns None on any internal failure

    monkeypatch.setattr(om, "_RUNNER", FailingRunner())
    client = TestClient(om.app)
    r = client.post("/api/fren", json={"question": "how is GEEPAS"})
    assert r.json() == {"answer": None, "fallback": True}
