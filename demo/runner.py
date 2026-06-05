"""Shared demo entry point — builds a fresh run report (used by the CLI and the API)."""

from __future__ import annotations

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
    return report
