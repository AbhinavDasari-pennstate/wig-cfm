"""Claude-backed LLM runner (production brain) with scripted fallback.

``SDKRunner`` implements the same ``LLMRunner`` protocol as
``ScriptedLLMRunner`` and returns byte-compatible result shapes, so agents are
drop-in unchanged. Every task is a single Messages API call with a structured
output (``messages.parse`` + a Pydantic model) — the LLM never drives tools.

Failure policy (per the 2026-06-10 design spec): on ANY error — API, timeout,
validation — fall back to the embedded ``ScriptedLLMRunner`` so the demo can
never fail live. Fallbacks are counted and logged with the task name only
(never payload contents — UAE PDPL).
"""

from __future__ import annotations

import logging
import os

from pydantic import BaseModel, Field

from core.llm import ScriptedLLMRunner
from models.feedback_ticket import Brand, FeedbackCategory, Language

log = logging.getLogger("wig.llm")

DEFAULT_MODEL = "claude-opus-4-8"


# --------------------------------------------------------------------------- #
# Structured output models (one per task)
# --------------------------------------------------------------------------- #

class IntakeResult(BaseModel):
    language: Language
    brand: Brand
    category: FeedbackCategory
    urgency_score: int = Field(ge=1, le=5)
    acknowledgment: str


class DraftedMessage(BaseModel):
    message: str


class SurveyQuestions(BaseModel):
    questions: list[str] = Field(min_length=3, max_length=3)


class ThemeSummary(BaseModel):
    themes: list[str] = Field(max_length=3)


_OUTPUT_MODELS: dict[str, type[BaseModel]] = {
    "intake_triage": IntakeResult,
    "draft_decline": DraftedMessage,
    "draft_loop_close": DraftedMessage,
    "draft_restock": DraftedMessage,
    "draft_survey": SurveyQuestions,
    "summarise_themes": ThemeSummary,
}


# --------------------------------------------------------------------------- #
# Prompts — the CLAUDE.md tone/guardrail rules, encoded once
# --------------------------------------------------------------------------- #

_TONE = """You write for Western International Group (WIG), a UK-incorporated Gulf retailer.
Brands: GEEPAS (electronics/appliances), NESTO (hypermarkets), ROYALFORD (kitchenware),
PARAJOHN (household), OLSENMARK (appliances), KRYPTON (appliances), DELCASA (homeware),
JAZP.com and WIGME.com (e-commerce).
Mandatory rules:
- Gulf-market formal tone, never casual. English: professional British English (no Americanisms).
- Arabic: formal address (حضرتكم / سيدي). Hindi/Malayalam: respectful register.
- NEVER name individual staff members.
- NEVER include SAP ticket IDs, PO numbers, claim IDs or any internal reference.
- NEVER mention channels or capabilities other than email (the Phase 1 live channel)."""

_CATEGORY_NAMES = ", ".join(c.value for c in FeedbackCategory)

_FREN_SYSTEM = (
    "You are fren, the co-solver inside WIG's customer-feedback dashboard, advising a "
    "department head. Answer in 1-3 sentences of professional British English, using ONLY "
    "the dashboard context provided. Core facts you may always state: the AI agents read, "
    "classify, draft and recommend, but hold no transactional tools — they propose, never "
    "transact; a human approves every outward action. Never invent numbers; if the context "
    "does not contain the answer, say so briefly. Never name individual staff."
)


def _build_prompt(task: str, payload: dict) -> tuple[str, str]:
    lang = payload.get("language", "ENGLISH")
    name = payload.get("customer_name") or "Valued Customer"
    brand = payload.get("brand") or "WIG"
    product = payload.get("product_name") or payload.get("product_sku") or "the item"

    if task == "intake_triage":
        hint = payload.get("brand_hint")
        hint = hint.value if hasattr(hint, "value") else (hint or "none")
        system = (_TONE + "\nClassify customer feedback for triage. "
                  "Urgency 5 = safety hazard or regulatory complaint; "
                  "4 = repeat escalation, legal threat or extreme anger; "
                  "3 = warranty or out-of-stock; 2 = other complaints; 1 = compliments.")
        user = (f"Brand hint: {hint}\nCustomer name: {name}\n"
                "Detect the language, brand, category and urgency (1-5) of this feedback, "
                "and draft a 2-3 sentence acknowledgment in the customer's own language:\n\n"
                f"{payload['raw_text']}")
        return system, user

    if task in ("draft_decline", "draft_loop_close", "draft_restock"):
        intents = {
            "draft_decline": ("Politely decline the warranty claim — the product is outside "
                              "its warranty period — and offer to advise on a paid repair."),
            "draft_loop_close": ("Confirm the replacement has been dispatched. Tracking "
                                 f"number: {payload.get('tracking') or 'to be assigned'}."),
            "draft_restock": ("Proactively tell the customer their feedback was heard and the "
                              f"product is back in stock in Aisle {payload.get('aisle') or '—'} "
                              f"at {payload.get('store_name') or 'their NESTO store'}."),
        }
        system = _TONE + ("\nDraft one short customer message (2-4 sentences) in the "
                          "customer's language. Output only the message text.")
        user = (f"Language: {lang}\nBrand: {brand}\nCustomer name: {name}\n"
                f"Product: {product}\nIntent: {intents[task]}")
        return system, user

    if task == "draft_survey":
        system = _TONE + ("\nWrite exactly three post-resolution survey questions, in the "
                          "customer's language, in this order: satisfaction with handling "
                          "(scale 1-5), likelihood to recommend the brand (scale 0-10), "
                          "ease of resolution (scale 1-5). Include the scale in each question.")
        user = f"Language: {lang}\nBrand: {brand}"
        return system, user

    # summarise_themes
    system = (_TONE + "\nSummarise the dominant complaint themes (at most 3). Each theme "
              f"MUST be one of these labels exactly: {_CATEGORY_NAMES}.")
    user = "Complaint texts:\n" + "\n".join(f"- {t}" for t in payload.get("texts", []))
    return system, user


def _to_result(task: str, parsed) -> dict:
    if task == "intake_triage":
        return {"language": parsed.language.value, "brand": parsed.brand.value,
                "category": parsed.category.value, "urgency_score": parsed.urgency_score,
                "acknowledgment": parsed.acknowledgment}
    if task in ("draft_decline", "draft_loop_close", "draft_restock"):
        return {"message": parsed.message}
    if task == "draft_survey":
        return {"questions": parsed.questions}
    return {"themes": parsed.themes}


# --------------------------------------------------------------------------- #
# Runner
# --------------------------------------------------------------------------- #

class SDKRunner:
    """Real Claude brain. Same protocol and result shapes as ScriptedLLMRunner."""

    def __init__(self, client=None, model: str | None = None) -> None:
        if client is None:
            if not (os.environ.get("ANTHROPIC_API_KEY")
                    or os.environ.get("ANTHROPIC_AUTH_TOKEN")):
                raise RuntimeError("WIG_RUNNER=sdk requires ANTHROPIC_API_KEY")
            import anthropic  # localized so the module imports without the SDK
            client = anthropic.AsyncAnthropic(timeout=30.0)
        self._client = client
        self._model = model or os.environ.get("WIG_LLM_MODEL", DEFAULT_MODEL)
        self._fallback = ScriptedLLMRunner()
        self.fallbacks = 0

    async def run(self, task: str, payload: dict) -> dict:
        output_model = _OUTPUT_MODELS.get(task)
        if output_model is None:
            # Unknown task: keep the scripted contract (raises ValueError).
            return await self._fallback.run(task, payload)
        try:
            system, user = _build_prompt(task, payload)
            resp = await self._client.messages.parse(
                model=self._model,
                max_tokens=2000,
                system=system,
                messages=[{"role": "user", "content": user}],
                output_format=output_model,
            )
            return _to_result(task, resp.parsed_output)
        except Exception as exc:  # deliberate: ANY failure → scripted (spec §3.3)
            log.warning("LLM task %r failed (%s) — falling back to scripted",
                        task, type(exc).__name__)
            self.fallbacks += 1
            return await self._fallback.run(task, payload)

    async def fren(self, question: str, context: str,
                   item_context: str | None = None) -> str | None:
        """Answer a dashboard question. None means: use the local keyword fallback."""
        try:
            user = f"Dashboard context:\n{context}\n"
            if item_context:
                user += f"\nItem under review:\n{item_context}\n"
            user += f"\nQuestion: {question}"
            resp = await self._client.messages.create(
                model=self._model, max_tokens=600,
                system=_FREN_SYSTEM,
                messages=[{"role": "user", "content": user}],
            )
            return next((b.text for b in resp.content if b.type == "text"), None)
        except Exception as exc:
            log.warning("fren LLM call failed (%s) — falling back", type(exc).__name__)
            self.fallbacks += 1
            return None
