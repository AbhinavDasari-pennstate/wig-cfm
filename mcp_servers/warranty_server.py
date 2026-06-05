"""Warranty MCP server — read + notify tools only.

Phase-1 transaction-safety rule: this server exposes NO tool that creates a
courier label or dispatches goods. Warranty fulfillment is routed to a human via
``request_fulfillment_approval``. ``generate_return_label`` / ``dispatch_replacement``
are intentionally absent (see FORBIDDEN_TOOLS).
"""

from __future__ import annotations

from core.backend import DemoBackend

TOOL_NAMES = [
    "check_warranty_eligibility",
    "track_shipment",
    "flag_spare_part_shortage",
    "request_fulfillment_approval",
]

# Transactional capabilities that must never be wired in Phase 1.
FORBIDDEN_TOOLS = ["generate_return_label", "dispatch_replacement"]


async def check_warranty_eligibility(backend: DemoBackend, args: dict) -> dict:
    return backend.check_warranty(args["purchase_date"])


async def track_shipment(backend: DemoBackend, args: dict) -> dict:
    return backend.track_shipment(args["tracking_number"])


async def flag_spare_part_shortage(backend: DemoBackend, args: dict) -> dict:
    return backend.flag_spare_part_shortage(
        args["part_name"], args["product_model"], args["brand"],
        args.get("request_count", 0))


async def request_fulfillment_approval(backend: DemoBackend, args: dict) -> dict:
    """Route an eligible warranty claim to a human for label + dispatch approval."""
    return backend.request_fulfillment_approval(
        args["claim_id"], args["brand"], args["product"],
        args.get("declared_value_aed", 0.0), args.get("drafted_message", ""))


def create_warranty_server(backend: DemoBackend):
    from claude_agent_sdk import create_sdk_mcp_server, tool  # localized import

    @tool("check_warranty_eligibility", "Check if a product is within warranty",
          {"product_model": str, "purchase_date": str, "brand": str})
    async def _check(args):
        return {"content": [{"type": "text", "text": str(await check_warranty_eligibility(backend, args))}]}

    @tool("track_shipment", "Get tracking status for a shipment",
          {"tracking_number": str, "carrier": str})
    async def _track(args):
        return {"content": [{"type": "text", "text": str(await track_shipment(backend, args))}]}

    @tool("flag_spare_part_shortage", "Flag a repeatedly requested spare part to QA",
          {"part_name": str, "product_model": str, "brand": str, "request_count": int})
    async def _flag(args):
        return {"content": [{"type": "text", "text": str(await flag_spare_part_shortage(backend, args))}]}

    @tool("request_fulfillment_approval",
          "Route an eligible warranty claim to a human for label + dispatch approval",
          {"claim_id": str, "brand": str, "product": str,
           "declared_value_aed": float, "drafted_message": str})
    async def _approve(args):
        return {"content": [{"type": "text", "text": str(await request_fulfillment_approval(backend, args))}]}

    return create_sdk_mcp_server(name="warranty", version="1.0.0",
                                 tools=[_check, _track, _flag, _approve])
