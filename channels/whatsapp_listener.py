"""WhatsApp Business API webhook adapter → FeedbackTicket."""

from __future__ import annotations

from models.feedback_ticket import FeedbackChannel, FeedbackTicket


async def parse_whatsapp(payload: dict) -> FeedbackTicket:
    # Minimal tolerant parse of a WhatsApp Cloud API message payload.
    phone = payload.get("from") or payload.get("wa_id")
    text = payload.get("text", {})
    body = text.get("body") if isinstance(text, dict) else (text or payload.get("body", ""))
    return FeedbackTicket(
        raw_text=body or "",
        channel=FeedbackChannel.WHATSAPP,
        customer_id=phone,
        customer_name=payload.get("profile_name"),
    )
