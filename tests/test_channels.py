"""Channel adapters normalise inbound payloads into FeedbackTickets."""

from channels import (ecomm_listener, email_listener, qr_listener, whatsapp_listener)
from models.feedback_ticket import Brand, FeedbackCategory, FeedbackChannel, Language


async def test_email_parses_sender_and_text():
    t = await email_listener.parse_email(
        {"from": "ahmed@example.ae", "subject": "Broken blender", "body": "It stopped working."})
    assert t.channel == FeedbackChannel.EMAIL
    assert t.customer_id == "ahmed@example.ae"
    assert "Broken blender" in t.raw_text and "stopped working" in t.raw_text


async def test_whatsapp_extracts_phone_and_body():
    t = await whatsapp_listener.parse_whatsapp({"from": "+9715551234", "text": {"body": "hello"}})
    assert t.channel == FeedbackChannel.WHATSAPP
    assert t.customer_id == "+9715551234" and t.raw_text == "hello"


async def test_ecomm_maps_store_to_brand():
    t = await ecomm_listener.parse_ecomm_webhook(
        {"store": "JAZP.com", "product_sku": "X1", "feedback_text": "late"})
    assert t.channel == FeedbackChannel.ECOMMERCE and t.brand == Brand.JAZP
    assert t.product_sku == "X1"


async def test_qr_is_preclassified_nesto_oos():
    t = await qr_listener.parse_qr_scan(
        {"store_name": "NESTO X", "store_code": "NESTO-DXB-12", "product_sku": "RF-AF250",
         "feedback_text": "الرف فارغ"})
    assert t.brand == Brand.NESTO
    assert t.category == FeedbackCategory.OUT_OF_STOCK
    assert t.customer_language == Language.ARABIC  # detected from the scan text
