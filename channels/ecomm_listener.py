"""Jazp.com / Wigme.com order-feedback webhook adapter → FeedbackTicket."""

from __future__ import annotations

from models.feedback_ticket import Brand, FeedbackChannel, FeedbackTicket

_STORE_BRAND = {"jazp": Brand.JAZP, "wigme": Brand.WIGME}


async def parse_ecomm_webhook(payload: dict) -> FeedbackTicket:
    store = (payload.get("store") or "").lower()
    brand = next((b for k, b in _STORE_BRAND.items() if k in store), None)
    return FeedbackTicket(
        raw_text=payload.get("feedback_text") or payload.get("review") or "",
        channel=FeedbackChannel.ECOMMERCE,
        customer_id=payload.get("customer_id"),
        customer_name=payload.get("customer_name"),
        brand=brand,
        product_sku=payload.get("product_sku"),
        product_name=payload.get("product_name"),
        store_name=payload.get("store"),
    )
