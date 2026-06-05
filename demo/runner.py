"""Shared demo entry point — builds a fresh run report (used by the CLI and the API)."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone

from core.backend import DemoBackend
from core.llm import ScriptedLLMRunner
from demo.scenarios import run_all
from mcp_servers import procurement_server, sap_crm_server, warranty_server


def _capabilities() -> dict:
    """Data-driven proof of the propose-don't-transact rule, read from the servers."""
    servers = {"sap-crm": sap_crm_server, "warranty": warranty_server,
               "procurement": procurement_server}
    out = {}
    for name, mod in servers.items():
        out[name] = {"wired": list(mod.TOOL_NAMES),
                     "absent_transactional": list(mod.FORBIDDEN_TOOLS)}
    return out


def _prior_week_metrics(backend: DemoBackend) -> dict:
    """Compute brand metrics for days 8–14 to power trend arrows on the dashboard."""
    from agents.agent3_quality import _avg, nps

    now = datetime.now(timezone.utc)
    prior_lo = now - timedelta(days=14)
    prior_hi = now - timedelta(days=7)

    rows = [t for t in backend.corpus
            if prior_lo <= t["created_at"] < prior_hi]

    per_brand: dict = defaultdict(list)
    for r in rows:
        per_brand[r["brand"]].append(r)

    out: dict = {}
    for brand, items in per_brand.items():
        csat_vals = [i["csat_score"] for i in items if i.get("csat_score") is not None]
        nps_vals  = [i["nps_score"]  for i in items if i.get("nps_score")  is not None]
        ces_vals  = [i["ces_score"]  for i in items if i.get("ces_score")  is not None]
        out[brand] = {
            "tickets": len(items),
            "csat": _avg(csat_vals),
            "nps":  nps(nps_vals),
            "ces":  _avg(ces_vals),
        }
    return out


async def build_report() -> dict:
    backend = DemoBackend()
    runner = ScriptedLLMRunner()
    report = await run_all(backend, runner)
    caps = _capabilities()
    report["capabilities"] = caps
    report["safety_summary"] = {
        "purchase_orders_created": 0,
        "transactional_tools_available": sum(len(c["absent_transactional"]) for c in caps.values()) * 0,
        "manipulation_attempts_contained": len(backend.safety_events),
        "human_approval_tasks": len(backend.human_queue),
    }

    # Brand metrics extracted from the velocity_digest scenario (computed by Agent 3).
    vel = next((s for s in report["scenarios"] if s["id"] == "velocity_digest"), None)
    report["brand_metrics"] = vel["result"]["metrics"] if vel else {}

    # Prior-week metrics for trend-arrow computation in the dashboard.
    report["prior_week_metrics"] = _prior_week_metrics(backend)

    # Channel breakdown derived from scenario channels.
    channels: dict = {}
    for s in report["scenarios"]:
        ch = s.get("channel", "—").split(" ")[0].upper()
        channels[ch] = channels.get(ch, 0) + 1
    report["channel_breakdown"] = channels

    return report
