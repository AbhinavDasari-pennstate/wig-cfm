"""Runner selection: scripted by default; /health reports the active mode."""

from fastapi.testclient import TestClient

import orchestrator.main as om
from core.llm import ScriptedLLMRunner


def test_default_runner_is_scripted():
    assert isinstance(om._select_runner(), ScriptedLLMRunner)


def test_sdk_requested_without_key_falls_back_to_scripted(monkeypatch):
    monkeypatch.setenv("WIG_RUNNER", "sdk")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
    assert isinstance(om._select_runner(), ScriptedLLMRunner)


def test_health_reports_runner_mode():
    client = TestClient(om.app)
    body = client.get("/health").json()
    assert body["status"] == "ok"
    assert body["runner"] == "scripted"
    assert body["llm_fallbacks"] == 0
