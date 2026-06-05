"""Shared Pydantic v2 data models for the WIG Customer Feedback system.

These models are the contract between channels, agents, MCP tools and the
orchestrator. They are the *only* place ticket state is shaped — SAP remains
the system of record at runtime.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, Field


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class FeedbackChannel(str, Enum):
    EMAIL = "EMAIL"
    WHATSAPP = "WHATSAPP"
    QR_KIOSK = "QR_KIOSK"
    ECOMMERCE = "ECOMMERCE"
    SOCIAL = "SOCIAL"


class Language(str, Enum):
    ARABIC = "ARABIC"
    ENGLISH = "ENGLISH"
    HINDI = "HINDI"
    MALAYALAM = "MALAYALAM"
    OTHER = "OTHER"


class Brand(str, Enum):
    GEEPAS = "GEEPAS"
    NESTO = "NESTO"
    ROYALFORD = "ROYALFORD"
    PARAJOHN = "PARAJOHN"
    OLSENMARK = "OLSENMARK"
    KRYPTON = "KRYPTON"
    DELCASA = "DELCASA"
    JAZP = "JAZP"
    WIGME = "WIGME"
    OTHER = "OTHER"


class FeedbackCategory(str, Enum):
    WARRANTY_RETURN = "WARRANTY_RETURN"
    OUT_OF_STOCK = "OUT_OF_STOCK"
    PRODUCT_QUALITY = "PRODUCT_QUALITY"
    STORE_EXPERIENCE = "STORE_EXPERIENCE"
    DELIVERY = "DELIVERY"
    COMPLIMENT = "COMPLIMENT"
    GENERAL = "GENERAL"


class FeedbackTicket(BaseModel):
    """A single piece of customer feedback as it flows through the system."""

    ticket_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    raw_text: str
    channel: FeedbackChannel

    customer_id: str | None = None
    customer_name: str | None = None

    # Filled by Agent 1 (Intake & Triage)
    customer_language: Language | None = None
    brand: Brand | None = None
    category: FeedbackCategory | None = None
    urgency_score: int | None = None  # 1..5

    # Filled after a SAP CRM write
    sap_ticket_id: str | None = None

    # Post-resolution metrics
    csat_score: int | None = None  # 1..5
    nps_score: int | None = None   # 0..10
    ces_score: int | None = None   # 1..5

    created_at: datetime = Field(default_factory=_utcnow)
    resolved_at: datetime | None = None

    store_name: str | None = None
    store_code: str | None = None
    store_aisle: str | None = None   # for out-of-stock restocking notifications
    region: str | None = None        # for Agent 4 regional coaching
    product_sku: str | None = None
    product_name: str | None = None


class ResolutionNotification(BaseModel):
    """A customer-facing message dispatched when a case is closed."""

    ticket_id: str
    customer_id: str
    customer_language: Language
    message: str
    channel: FeedbackChannel
    sent_at: datetime | None = None
