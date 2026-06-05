"""Email channel adapter → FeedbackTicket."""

from __future__ import annotations

from models.feedback_ticket import FeedbackChannel, FeedbackTicket


async def parse_email(raw_email: dict) -> FeedbackTicket:
    sender = (raw_email.get("from") or "").strip()
    customer_id = sender or None
    subject = raw_email.get("subject", "")
    body = raw_email.get("body", "")
    return FeedbackTicket(
        raw_text=f"{subject}\n\n{body}".strip(),
        channel=FeedbackChannel.EMAIL,
        customer_id=customer_id,
        customer_name=raw_email.get("name"),
    )
