"""POST /api/queue/{id}/action — operator decisions persist server-side.

The dashboard previously marked approvals in browser state only; these tests
pin the new behaviour: the cached report is mutated, audited, and the action
survives a page reload (GET /api/demo serves the same cached object).
"""

from fastapi.testclient import TestClient

import orchestrator.main as om


def _client():
    return TestClient(om.app)


def test_action_persists_into_cached_report(monkeypatch):
    report = {"snapshot": {"human_queue": [{"workflow_task_id": "WF-1",
                                            "type": "WARRANTY_FULFILLMENT"}],
                           "audit": []}}
    monkeypatch.setattr(om, "_REPORT_CACHE", report)
    r = _client().post("/api/queue/WF-1/action",
                       json={"label": "Released", "note": "checked precedents"})
    assert r.status_code == 200
    assert r.json()["status"] == "recorded"
    item = report["snapshot"]["human_queue"][0]
    assert item["_actioned"] is True
    assert item["_actionLabel"] == "Released"
    assert item["_note"] == "checked precedents"
    audit = report["snapshot"]["audit"][-1]
    assert audit["kind"] == "human_action" and audit["workflow_task_id"] == "WF-1"


def test_action_unknown_item_is_404(monkeypatch):
    monkeypatch.setattr(om, "_REPORT_CACHE", {"snapshot": {"human_queue": []}})
    r = _client().post("/api/queue/WF-9/action", json={"label": "Released"})
    assert r.status_code == 404


def test_action_invalid_label_is_422(monkeypatch):
    monkeypatch.setattr(om, "_REPORT_CACHE", {"snapshot": {"human_queue": []}})
    r = _client().post("/api/queue/WF-1/action", json={"label": "Place order"})
    assert r.status_code == 422


def test_action_survives_report_refetch(monkeypatch):
    report = {"snapshot": {"human_queue": [{"workflow_task_id": "WF-1"}]}}
    monkeypatch.setattr(om, "_REPORT_CACHE", report)
    c = _client()
    c.post("/api/queue/WF-1/action", json={"label": "Forwarded"})
    body = c.get("/api/demo").json()
    assert body["snapshot"]["human_queue"][0]["_actioned"] is True
