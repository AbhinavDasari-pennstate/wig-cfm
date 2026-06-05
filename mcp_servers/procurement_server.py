"""Procurement MCP server (SAP MM) — read + notify tools only.

THE transaction-safety centrepiece. This server exposes NO ``create_purchase_order``
tool. The only write an agent can perform here is ``notify_human_buyer``, which opens
a SAP Workflow approval task for a person. A fully manipulated agent therefore cannot
place an order — the capability does not exist (see FORBIDDEN_TOOLS).
"""

from __future__ import annotations

from core.backend import DemoBackend

TOOL_NAMES = [
    "check_existing_po",
    "get_purchase_history",
    "check_inventory_level",
    "notify_human_buyer",
]

# The order-placing capability is deliberately absent in Phase 1.
FORBIDDEN_TOOLS = ["create_purchase_order"]


async def check_existing_po(backend: DemoBackend, args: dict) -> dict:
    return backend.check_existing_po(args["product_sku"], args["store_code"])


async def get_purchase_history(backend: DemoBackend, args: dict) -> dict:
    return backend.get_purchase_history(args["product_sku"], args["store_code"])


async def check_inventory_level(backend: DemoBackend, args: dict) -> dict:
    return backend.check_inventory(args["product_sku"], args["store_code"])


async def notify_human_buyer(backend: DemoBackend, args: dict) -> dict:
    return backend.notify_human_buyer(
        args["product_sku"], args["store_code"], args["reason"],
        args.get("recommendation", ""), context=args.get("context", ""),
        original_ticket_id=args.get("original_ticket_id"))


def create_procurement_server(backend: DemoBackend):
    from claude_agent_sdk import create_sdk_mcp_server, tool  # localized import

    @tool("check_existing_po", "Check for an open PO for a SKU at a store",
          {"product_sku": str, "store_code": str})
    async def _po(args):
        return {"content": [{"type": "text", "text": str(await check_existing_po(backend, args))}]}

    @tool("get_purchase_history", "Retrieve PO history to gauge ordering cadence",
          {"product_sku": str, "store_code": str, "lookback_days": int})
    async def _hist(args):
        return {"content": [{"type": "text", "text": str(await get_purchase_history(backend, args))}]}

    @tool("check_inventory_level", "Check shelf + backroom stock for a SKU at a store",
          {"product_sku": str, "store_code": str})
    async def _inv(args):
        return {"content": [{"type": "text", "text": str(await check_inventory_level(backend, args))}]}

    @tool("notify_human_buyer", "Open a SAP Workflow approval task for a human buyer",
          {"product_sku": str, "store_code": str, "reason": str,
           "recommendation": str, "context": str, "original_ticket_id": str})
    async def _notify(args):
        return {"content": [{"type": "text", "text": str(await notify_human_buyer(backend, args))}]}

    return create_sdk_mcp_server(name="procurement", version="1.0.0",
                                 tools=[_po, _hist, _inv, _notify])
