"""NESTO in-store QR kiosk adapter → FeedbackTicket.

QR scans are pre-classified (NESTO / OUT_OF_STOCK) and bypass Agent 1.
"""

from __future__ import annotations

from core.llm import detect_language
from models.feedback_ticket import (Brand, FeedbackCategory, FeedbackChannel,
                                     FeedbackTicket)


async def parse_qr_scan(payload: dict) -> FeedbackTicket:
    text = payload.get("feedback_text", "")
    ticket = FeedbackTicket(
        raw_text=text,
        channel=FeedbackChannel.QR_KIOSK,
        customer_id=payload.get("customer_id"),
        customer_name=payload.get("customer_name"),
        brand=Brand.NESTO,                       # QR kiosks are NESTO-only in Phase 1
        category=FeedbackCategory.OUT_OF_STOCK,  # pre-classified
        store_name=payload.get("store_name"),
        store_code=payload.get("store_code"),
        product_sku=payload.get("product_sku"),
        product_name=payload.get("product_name"),
    )
    ticket.customer_language = detect_language(text)
    return ticket
