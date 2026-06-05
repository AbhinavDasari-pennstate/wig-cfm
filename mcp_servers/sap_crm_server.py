"""SAP CRM MCP server — read + record + notify tools.

Tool *implementations* are plain async functions over a backend (unit-testable
with no SDK). ``create_sap_crm_server`` wraps them as in-process SDK MCP tools for
production; the import is localized so this module loads even without the SDK.
"""

from __future__ import annotations

from core.backend import DemoBackend

TOOL_NAMES = [
    "create_feedback_ticket",
    "update_ticket_resolution",
    "search_tickets",
    "raise_quality_alert",
]

# These would commit money/goods/orders — they must never exist on this server.
FORBIDDEN_TOOLS: list[str] = []


async def create_feedback_ticket(backend: DemoBackend, args: dict) -> dict:
    return backend.create_ticket({
        "customer_id": args.get("customer_id"),
        "brand": args.get("brand"),
        "category": args.get("category"),
        "urgency_score": args.get("urgency_score"),
        "language": args.get("language"),
        "raw_text": args.get("raw_text"),
        "channel": args.get("channel"),
        "store_name": args.get("store_name"),
        "product_sku": args.get("product_sku"),
    })


async def update_ticket_resolution(backend: DemoBackend, args: dict) -> dict:
    return backend.update_resolution(
        args["sap_ticket_id"], args.get("resolution_notes", ""),
        args.get("csat_score"), args.get("nps_score"), args.get("ces_score"),
    )


async def search_tickets(backend: DemoBackend, args: dict) -> dict:
    rows = backend.search_tickets(args.get("brand"), args.get("category"),
                                  args.get("days_back", 7))
    if not args.get("include_scores"):
        rows = [{k: v for k, v in r.items()
                 if k not in ("csat_score", "nps_score", "ces_score")} for r in rows]
    return {"count": len(rows), "tickets": rows}


async def raise_quality_alert(backend: DemoBackend, args: dict) -> dict:
    return backend.raise_quality_alert(args)


def create_sap_crm_server(backend: DemoBackend):
    """Build the in-process SDK MCP server (production path)."""
    from claude_agent_sdk import create_sdk_mcp_server, tool  # localized import

    @tool("create_feedback_ticket", "Create a customer feedback ticket in SAP CRM",
          {"customer_id": str, "brand": str, "category": str, "urgency_score": int,
           "language": str, "raw_text": str, "channel": str, "store_name": str,
           "product_sku": str})
    async def _create(args):
        return {"content": [{"type": "text", "text": str(await create_feedback_ticket(backend, args))}]}

    @tool("update_ticket_resolution",
          "Mark a SAP CRM ticket resolved and record CSAT, NPS and CES",
          {"sap_ticket_id": str, "resolution_notes": str, "csat_score": int,
           "nps_score": int, "ces_score": int})
    async def _update(args):
        return {"content": [{"type": "text", "text": str(await update_ticket_resolution(backend, args))}]}

    @tool("search_tickets", "Search CRM tickets for quality analysis",
          {"brand": str, "category": str, "days_back": int, "include_scores": bool})
    async def _search(args):
        return {"content": [{"type": "text", "text": str(await search_tickets(backend, args))}]}

    @tool("raise_quality_alert", "Raise a quality alert in SAP",
          {"alert_type": str, "brand": str, "product_sku": str, "category": str,
           "description": str, "velocity_pct": float, "ticket_count": int})
    async def _alert(args):
        return {"content": [{"type": "text", "text": str(await raise_quality_alert(backend, args))}]}

    return create_sdk_mcp_server(name="sap-crm", version="1.0.0",
                                 tools=[_create, _update, _search, _alert])
