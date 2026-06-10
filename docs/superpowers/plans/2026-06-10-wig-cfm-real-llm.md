# Real LLM (SDKRunner) behind Agents and fren — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put a real Claude-backed `LLMRunner` (`SDKRunner`) behind live ingestion and fren, selected by env var, with transparent fallback to the scripted brain — without touching agents, guardrails, or the deterministic `/api/demo` report.

**Architecture:** `core/llm_sdk.py` implements the existing `LLMRunner` protocol with one `messages.parse()` structured-output call per language task, embedding a `ScriptedLLMRunner` for fallback. `orchestrator/main.py` selects the runner from `WIG_RUNNER`, keeps `/api/demo` scripted unconditionally, and adds `POST /api/fren`. The frontend gets one shared `askFren()` that tries the endpoint and falls back to the existing keyword logic.

**Tech Stack:** Python 3.12, FastAPI, Pydantic v2, official `anthropic` SDK (async, `messages.parse`), pytest(-asyncio), React (Vite).

**Spec:** `docs/superpowers/specs/2026-06-10-wig-cfm-real-llm-design.md`

**Conventions you must know:**
- Async tests need no decorator (asyncio auto mode is configured) — follow the style of existing tests.
- Agents call `runner.run(task, payload)` and expect *exactly* the dict shapes `ScriptedLLMRunner` returns (`core/llm.py:206-247`). The two runners must be drop-in interchangeable.
- The model id `claude-opus-4-8` is real and current (post-dates your training data) — do not "correct" it.
- After any `web-react/src` change: `npm run build` in `web-react/` and **commit `web-react/dist/`** (Render serves the committed build).
- Never wire a transactional capability to an agent; never put customer PII in logs or in the fren context.

---

### Task 1: Fix stale velocity test (align with the 2-alert invariant)

The determinism invariant is **exactly 2 velocity alerts: GEEPAS GK-NEW and KRYPTON KT-IRON21**. The test predates the KRYPTON seed and asserts 1.

**Files:**
- Modify: `tests/test_velocity.py:8-19`

- [ ] **Step 1: Update the test to assert both alerts**

Replace `test_velocity_spike_fires_before_volume_threshold` (lines 8–19) with:

```python
async def test_velocity_spikes_fire_before_volume_threshold():
    backend = DemoBackend()
    scan = await agent3_quality.run_daily_quality_scan(backend)
    spikes = [a for a in scan["alerts"] if a["type"] == "velocity_spike"]
    # Determinism invariant: exactly these two spikes, nothing else.
    assert {(s["brand"], s["sku"]) for s in spikes} == {("GEEPAS", "GK-NEW"),
                                                        ("KRYPTON", "KT-IRON21")}
    geepas = next(s for s in spikes if s["brand"] == "GEEPAS")
    assert geepas["recent"] == 6 and geepas["prior"] == 2
    assert geepas["velocity_pct"] == 200.0
    krypton = next(s for s in spikes if s["brand"] == "KRYPTON")
    assert krypton["prior"] == 0 and krypton["velocity_pct"] is None  # new SKU
    assert krypton["recent"] >= agent3_quality.VELOCITY_MIN_RECENT
    # Both fired while total stays under the legacy volume threshold (15).
    for s in spikes:
        assert s["total"] < agent3_quality.VOLUME_THRESHOLD
    assert not any(a["type"] == "volume_threshold" for a in scan["alerts"])
```

- [ ] **Step 2: Run the file**

Run: `python -m pytest tests/test_velocity.py -q`
Expected: 3 passed

- [ ] **Step 3: Commit**

```bash
git add tests/test_velocity.py
git commit -m "test: align velocity test with the 2-alert determinism invariant"
```

---

### Task 2: Fix stale safety test (delta-based queue assertion)

`test_regular_history_still_routes_to_human_not_auto_po` asserts `len(backend.human_queue) == 1`, but the seeded backend already contains queue items. Assert the **delta** caused by the call.

**Files:**
- Modify: `tests/test_safety.py:46-57`

- [ ] **Step 1: Rewrite the test delta-based**

Replace the whole `test_regular_history_still_routes_to_human_not_auto_po` function with:

```python
async def test_regular_history_still_routes_to_human_not_auto_po():
    from models.feedback_ticket import (Brand, FeedbackCategory, FeedbackChannel,
                                        FeedbackTicket)
    backend = DemoBackend()
    queue_before = len(backend.human_queue)
    ticket = FeedbackTicket(raw_text="air fryer missing from shelf",
                            channel=FeedbackChannel.QR_KIOSK, brand=Brand.NESTO,
                            category=FeedbackCategory.OUT_OF_STOCK,
                            store_code="NESTO-DXB-12", product_sku="RF-AF250")
    res = await agent5_procurement.process_out_of_stock(ticket, backend, ScriptedLLMRunner())
    assert res["case"] == 1 and res["reason"] == "REGULAR_REORDER_RECOMMENDED"
    assert any(a["kind"] == "buyer_notified" for a in backend.audit)
    # Exactly one new approval task was appended — a person must approve.
    new_items = backend.human_queue[queue_before:]
    assert len(new_items) == 1
    assert new_items[0]["reason"] == "REGULAR_REORDER_RECOMMENDED"
```

- [ ] **Step 2: Run the file**

Run: `python -m pytest tests/test_safety.py -q`
Expected: 5 passed

- [ ] **Step 3: Commit**

```bash
git add tests/test_safety.py
git commit -m "test: make regular-history safety test robust to seeded queue items"
```

---

### Task 3: Fix stale coaching test (drop seed-coupled NPS assertion)

`test_coaching_never_names_an_individual` asserts ROYALFORD's NPS (now 36) is below `WIG_NPS_AVERAGE` (32). That assertion is seed-data trivia; the *guardrail* under test is "never name an individual."

**Files:**
- Modify: `tests/test_diagnosis.py:43-52`

- [ ] **Step 1: Replace the seed-coupled assertion**

Replace lines 51–52 (the `royalford = ...` and final assert) with:

```python
    # Every report frames performance against the WIG benchmark (no seed-coupled
    # assumptions about which brand sits above or below it).
    for r in reports:
        assert isinstance(r["nps_score"], int)
        assert "WIG retail average" in r["coaching_summary"]
    assert any(r["brand"] == "ROYALFORD" for r in reports)
```

- [ ] **Step 2: Run the file, then the whole suite**

Run: `python -m pytest tests/test_diagnosis.py -q`
Expected: 4 passed

Run: `python -m pytest -q`
Expected: **21 passed** (suite fully green)

- [ ] **Step 3: Commit**

```bash
git add tests/test_diagnosis.py
git commit -m "test: decouple coaching guardrail test from seed NPS values"
```

---

### Task 4: Add the `anthropic` dependency

**Files:**
- Modify: `requirements.txt`

- [ ] **Step 1: Add the dependency**

In `requirements.txt`, add after the `claude-agent-sdk>=0.2` line:

```
anthropic>=0.60
```

- [ ] **Step 2: Install and verify import**

Run: `pip install -r requirements.txt`
Run: `python -c "import anthropic; print(anthropic.__version__)"`
Expected: a version string, no error

- [ ] **Step 3: Commit**

```bash
git add requirements.txt
git commit -m "deps: add anthropic SDK for the production LLM runner"
```

---

### Task 5: `SDKRunner` — structured language tasks with scripted fallback

**Files:**
- Create: `core/llm_sdk.py`
- Create: `tests/test_sdk_runner.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_sdk_runner.py`:

```python
"""SDKRunner — real-LLM runner: shape compatibility + fallback guarantees.

Uses a fake client; no network or API key is ever needed in the suite.
"""

from types import SimpleNamespace

import pytest

from core.llm import ScriptedLLMRunner
from core.llm_sdk import SDKRunner, IntakeResult, DraftedMessage


class _FakeMessages:
    def __init__(self, parsed=None, error=None, text=None):
        self.parsed, self.error, self.text = parsed, error, text
        self.calls = []

    async def parse(self, **kwargs):
        self.calls.append(kwargs)
        if self.error:
            raise self.error
        return SimpleNamespace(parsed_output=self.parsed)

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        if self.error:
            raise self.error
        return SimpleNamespace(content=[SimpleNamespace(type="text", text=self.text)])


def _runner(**kw) -> SDKRunner:
    return SDKRunner(client=SimpleNamespace(messages=_FakeMessages(**kw)),
                     model="claude-opus-4-8")


async def test_intake_triage_returns_scripted_compatible_shape():
    parsed = IntakeResult(language="ARABIC", brand="GEEPAS",
                          category="WARRANTY_RETURN", urgency_score=3,
                          acknowledgment="حضرتكم...")
    runner = _runner(parsed=parsed)
    out = await runner.run("intake_triage", {"raw_text": "المكواة لا تعمل",
                                             "customer_name": "Fatima",
                                             "brand_hint": None})
    assert out == {"language": "ARABIC", "brand": "GEEPAS",
                   "category": "WARRANTY_RETURN", "urgency_score": 3,
                   "acknowledgment": "حضرتكم..."}
    # The scripted runner returns the identical key set for this task.
    scripted = await ScriptedLLMRunner().run(
        "intake_triage", {"raw_text": "Geepas iron not working",
                          "customer_name": "Fatima", "brand_hint": None})
    assert set(out) == set(scripted)


async def test_draft_tasks_return_message_dict():
    runner = _runner(parsed=DraftedMessage(message="Dear Fatima, ..."))
    for task in ("draft_decline", "draft_loop_close", "draft_restock"):
        out = await runner.run(task, {"language": "ENGLISH", "brand": "GEEPAS",
                                      "customer_name": "Fatima",
                                      "product_name": "Steam Iron"})
        assert out == {"message": "Dear Fatima, ..."}


async def test_api_failure_falls_back_to_scripted_result():
    runner = _runner(error=RuntimeError("simulated outage"))
    payload = {"language": "ENGLISH", "brand": "GEEPAS",
               "customer_name": "Fatima", "product_name": "Steam Iron",
               "tracking": "TRK-1"}
    out = await runner.run("draft_loop_close", payload)
    scripted = await ScriptedLLMRunner().run("draft_loop_close", payload)
    assert out == scripted          # caller cannot tell the difference
    assert runner.fallbacks == 1    # but the event is counted


async def test_unknown_task_keeps_scripted_contract():
    runner = _runner(parsed=None)
    with pytest.raises(ValueError):
        await runner.run("not_a_task", {})


async def test_guardrail_routing_is_runner_independent():
    """Urgency 4-5 HITL routing is Python code — the runner cannot change it."""
    from agents import agent1_intake
    from core.backend import DemoBackend
    from models.feedback_ticket import FeedbackChannel, FeedbackTicket

    parsed = IntakeResult(language="ENGLISH", brand="GEEPAS",
                          category="PRODUCT_QUALITY", urgency_score=5,
                          acknowledgment="Dear customer, ...")
    runner = _runner(parsed=parsed)
    ticket = FeedbackTicket(raw_text="the kettle sparked and burned my hand",
                            channel=FeedbackChannel.EMAIL)
    res = await agent1_intake.process_intake(ticket, DemoBackend(), runner)
    assert res["routing"] == "HITL"
```

- [ ] **Step 2: Run to verify failure**

Run: `python -m pytest tests/test_sdk_runner.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'core.llm_sdk'`

- [ ] **Step 3: Implement `core/llm_sdk.py`**

```python
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
```

- [ ] **Step 4: Run the new tests**

Run: `python -m pytest tests/test_sdk_runner.py -q`
Expected: 5 passed

- [ ] **Step 5: Run the full suite**

Run: `python -m pytest -q`
Expected: 26 passed

- [ ] **Step 6: Commit**

```bash
git add core/llm_sdk.py tests/test_sdk_runner.py
git commit -m "feat: SDKRunner — Claude-backed LLM runner with scripted fallback"
```

---

### Task 6: `SDKRunner.fren()` — co-solver answers

**Files:**
- Modify: `core/llm_sdk.py` (append)
- Modify: `tests/test_sdk_runner.py` (append)

- [ ] **Step 1: Write the failing tests** (append to `tests/test_sdk_runner.py`)

```python
async def test_fren_returns_answer_text():
    runner = _runner(text="GEEPAS NPS is +38 this week.")
    out = await runner.fren("how is GEEPAS", "GEEPAS: NPS +38")
    assert out == "GEEPAS NPS is +38 this week."


async def test_fren_failure_returns_none_and_counts():
    runner = _runner(error=RuntimeError("simulated outage"))
    out = await runner.fren("how is GEEPAS", "GEEPAS: NPS +38")
    assert out is None
    assert runner.fallbacks == 1
```

- [ ] **Step 2: Run to verify failure**

Run: `python -m pytest tests/test_sdk_runner.py -q`
Expected: 2 failures — `AttributeError: 'SDKRunner' object has no attribute 'fren'`

- [ ] **Step 3: Implement** — append to `core/llm_sdk.py` (module level constant, then method inside `SDKRunner`)

Add after `_TONE`:

```python
_FREN_SYSTEM = (
    "You are fren, the co-solver inside WIG's customer-feedback dashboard, advising a "
    "department head. Answer in 1-3 sentences of professional British English, using ONLY "
    "the dashboard context provided. Core facts you may always state: the AI agents read, "
    "classify, draft and recommend, but hold no transactional tools — they propose, never "
    "transact; a human approves every outward action. Never invent numbers; if the context "
    "does not contain the answer, say so briefly. Never name individual staff."
)
```

Add this method to `SDKRunner`:

```python
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
```

- [ ] **Step 4: Run the tests**

Run: `python -m pytest tests/test_sdk_runner.py -q`
Expected: 7 passed

- [ ] **Step 5: Commit**

```bash
git add core/llm_sdk.py tests/test_sdk_runner.py
git commit -m "feat: SDKRunner.fren — LLM answers for the co-solver"
```

---

### Task 7: Orchestrator — runner selection + `/health` runner status

**Files:**
- Modify: `orchestrator/main.py:36-37` (runner construction) and `:53-55` (`/health`)
- Create: `tests/test_orchestrator_runner.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_orchestrator_runner.py`:

```python
"""Runner selection: scripted by default; /health reports the active mode."""

from fastapi.testclient import TestClient

import orchestrator.main as om
from core.llm import ScriptedLLMRunner


def test_default_runner_is_scripted():
    assert isinstance(om._select_runner(), ScriptedLLMRunner)


def test_sdk_requested_without_key_falls_back_to_scripted(monkeypatch):
    monkeypatch.setenv("WIG_RUNNER", "sdk")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
    assert isinstance(om._select_runner(), ScriptedLLMRunner)


def test_health_reports_runner_mode():
    client = TestClient(om.app)
    body = client.get("/health").json()
    assert body["status"] == "ok"
    assert body["runner"] == "scripted"
    assert body["llm_fallbacks"] == 0
```

- [ ] **Step 2: Run to verify failure**

Run: `python -m pytest tests/test_orchestrator_runner.py -q`
Expected: FAIL — `AttributeError: module 'orchestrator.main' has no attribute '_select_runner'`

- [ ] **Step 3: Implement in `orchestrator/main.py`**

Add `import logging` and `import os` to the stdlib imports at the top. Then replace lines 35–37:

```python
# App-level backend for live ingestion (the dashboard uses a fresh one per call).
_BACKEND = DemoBackend()
_RUNNER = ScriptedLLMRunner()
```

with:

```python
def _select_runner():
    """WIG_RUNNER=sdk + ANTHROPIC_API_KEY → real LLM for live ingestion + fren.
    Anything else (including a broken key) → scripted, logged, never fatal.
    The /api/demo report ALWAYS uses ScriptedLLMRunner (see demo/runner.py)."""
    if os.environ.get("WIG_RUNNER", "scripted").lower() == "sdk":
        try:
            from core.llm_sdk import SDKRunner
            return SDKRunner()
        except Exception as exc:
            logging.getLogger("wig.llm").warning(
                "WIG_RUNNER=sdk but SDKRunner unavailable (%s) — running scripted", exc)
    return ScriptedLLMRunner()


# App-level backend for live ingestion (the dashboard uses a fresh one per call).
_BACKEND = DemoBackend()
_RUNNER = _select_runner()
```

Replace the `/health` handler:

```python
@app.get("/health")
async def health() -> dict:
    return {"status": "ok",
            "runner": "sdk" if hasattr(_RUNNER, "fren") else "scripted",
            "llm_fallbacks": getattr(_RUNNER, "fallbacks", 0)}
```

- [ ] **Step 4: Run the tests**

Run: `python -m pytest tests/test_orchestrator_runner.py -q`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add orchestrator/main.py tests/test_orchestrator_runner.py
git commit -m "feat: env-selected LLM runner; /health reports runner mode"
```

---

### Task 8: `POST /api/fren` endpoint with PII-free report context

**Files:**
- Modify: `orchestrator/main.py` (add `_fren_context` + endpoint, after the `/api/demo` handler)
- Create: `tests/test_fren.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_fren.py`:

```python
"""POST /api/fren — LLM answer when available, explicit fallback otherwise."""

from fastapi.testclient import TestClient

import orchestrator.main as om


def test_fren_scripted_mode_returns_fallback():
    client = TestClient(om.app)
    r = client.post("/api/fren", json={"question": "how is GEEPAS doing"})
    assert r.status_code == 200
    assert r.json() == {"answer": None, "fallback": True}


def test_fren_empty_question_is_422():
    client = TestClient(om.app)
    assert client.post("/api/fren", json={"question": "  "}).status_code == 422


def test_fren_uses_runner_and_report_context(monkeypatch):
    seen = {}

    class FakeSDKRunner:
        fallbacks = 0

        async def fren(self, question, context, item_context=None):
            seen["question"], seen["context"], seen["item"] = question, context, item_context
            return "GEEPAS leads on NPS this week."

    monkeypatch.setattr(om, "_RUNNER", FakeSDKRunner())
    client = TestClient(om.app)
    r = client.post("/api/fren", json={"question": "how is GEEPAS",
                                       "item_context": "Warranty approval WF-1"})
    assert r.json() == {"answer": "GEEPAS leads on NPS this week.", "fallback": False}
    assert "GEEPAS" in seen["context"]          # brand metrics included
    assert "propose" not in seen["question"]    # question passed through verbatim
    assert seen["item"] == "Warranty approval WF-1"
    # PDPL: the context must carry aggregates only — never customer identities.
    assert "customer_name" not in seen["context"]


def test_fren_runner_failure_returns_fallback(monkeypatch):
    class FailingRunner:
        async def fren(self, question, context, item_context=None):
            return None  # SDKRunner returns None on any internal failure

    monkeypatch.setattr(om, "_RUNNER", FailingRunner())
    client = TestClient(om.app)
    r = client.post("/api/fren", json={"question": "how is GEEPAS"})
    assert r.json() == {"answer": None, "fallback": True}
```

- [ ] **Step 2: Run to verify failure**

Run: `python -m pytest tests/test_fren.py -q`
Expected: FAIL — 404/405 (`/api/fren` does not exist)

- [ ] **Step 3: Implement** — add to `orchestrator/main.py` directly below the `api_demo` handler:

```python
def _fren_context(report: dict) -> str:
    """Compact, PII-free dashboard summary for fren. Aggregates only —
    no customer names, no raw ticket text (UAE PDPL)."""
    lines = ["Weekly brand metrics (CSAT /5, NPS, CES /5, tickets):"]
    for brand, m in sorted((report.get("brand_metrics") or {}).items()):
        lines.append(f"- {brand}: CSAT {m['csat']}, NPS {m['nps']:+d}, "
                     f"CES {m['ces']}, {m['tickets']} tickets")
    snapshot = report.get("snapshot") or {}
    alerts = snapshot.get("quality_alerts") or []
    lines.append(f"Quality alerts: {len(alerts)}")
    for a in alerts:
        lines.append(f"- {a.get('brand')} {a.get('product_sku')}: {a.get('description')}")
    queue = snapshot.get("human_queue") or []
    lines.append(f"Human approval queue: {len(queue)} item(s) pending — "
                 "humans approve everything outward.")
    ss = report.get("safety_summary") or {}
    lines.append(f"Safety: {ss.get('purchase_orders_created', 0)} POs auto-created, "
                 f"{ss.get('transactional_tools_available', 0)} transactional tools wired, "
                 f"{ss.get('manipulation_attempts_contained', 0)} manipulation attempt(s) contained.")
    mix = report.get("channel_mix") or {}
    if mix:
        lines.append("Channel mix (tickets): " + ", ".join(
            f"{k} {v}" for k, v in sorted(mix.items(), key=lambda kv: -kv[1])))
    return "\n".join(lines)


@app.post("/api/fren")
async def api_fren(payload: dict) -> dict:
    """fren co-solver. {answer, fallback}; fallback=True → client uses its
    local keyword logic (offline mode keeps working unchanged)."""
    question = (payload.get("question") or "").strip()
    if not question:
        raise HTTPException(422, "question is required")
    fren = getattr(_RUNNER, "fren", None)
    if fren is None:
        return {"answer": None, "fallback": True}
    global _REPORT_CACHE
    if _REPORT_CACHE is None:
        _REPORT_CACHE = await build_report()
    answer = await fren(question, _fren_context(_REPORT_CACHE),
                        item_context=payload.get("item_context"))
    if not answer:
        return {"answer": None, "fallback": True}
    return {"answer": answer, "fallback": False}
```

Note: `_REPORT_CACHE` is declared above `api_demo` in the same file — this endpoint reuses it; do not create a second cache.

- [ ] **Step 4: Run the tests, then the full suite**

Run: `python -m pytest tests/test_fren.py -q`
Expected: 4 passed

Run: `python -m pytest -q`
Expected: 35 passed

- [ ] **Step 5: Commit**

```bash
git add orchestrator/main.py tests/test_fren.py
git commit -m "feat: POST /api/fren — LLM co-solver endpoint with PII-free context"
```

---

### Task 9: Frontend — shared `askFren()` + global FrenDock

**Files:**
- Create: `web-react/src/lib/fren.js`
- Modify: `web-react/src/components/FrenDock.jsx:27-38` (the `ask` function)

- [ ] **Step 1: Create `web-react/src/lib/fren.js`**

```js
// Shared fren answer path used by all three fren surfaces (global dock,
// copilot, intervention). Tries the backend LLM endpoint; on offline,
// scripted mode, or any error it returns the caller's local keyword answer —
// today's behaviour is the floor, never lost.
export async function askFren(question, { itemContext = null, fallback }) {
  try {
    const r = await fetch('/api/fren', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, item_context: itemContext }),
    });
    if (r.ok) {
      const data = await r.json();
      if (!data.fallback && data.answer) return data.answer;
    }
  } catch {
    /* backend unreachable — standalone/offline demo */
  }
  return fallback();
}
```

- [ ] **Step 2: Wire FrenDock**

In `web-react/src/components/FrenDock.jsx`, add the import:

```js
import { askFren } from '../lib/fren.js';
```

Replace the `ask` function (lines 27–38) with:

```js
  const ask = async (text) => {
    const t = text.trim();
    if (!t) return;
    setValue('');
    setHistory((h) => [...h, { role: 'user', text: t }]);
    setThinking(true);
    const reply = await askFren(t, { fallback: () => frenAnswer(report, t) });
    setThinking(false);
    setHistory((h) => [...h, { role: 'fren', text: reply }]);
  };
```

- [ ] **Step 3: Verify it compiles and behaves in dev**

Run (in `web-react/`): `npm run build`
Expected: build succeeds, no errors

Manual check (optional but recommended): `python -m uvicorn orchestrator.main:app --port 8011` + `npm run dev`, open the dock, ask "how is GEEPAS" — in scripted mode the keyword answer appears (via fallback path).

- [ ] **Step 4: Commit (source only — dist is rebuilt and committed in Task 11)**

```bash
git add web-react/src/lib/fren.js web-react/src/components/FrenDock.jsx
git commit -m "feat(web): shared askFren path; global dock tries /api/fren with keyword fallback"
```

---

### Task 10: Frontend — copilot frens (standard + intervention)

Chip clicks keep their instant scripted answers; **free-typed** questions go to the LLM with a PII-free item summary, falling back to `frenMatch`.

**Files:**
- Modify: `web-react/src/views/Copilot.jsx` (both `ask` functions; add import)

- [ ] **Step 1: Add the import**

In `web-react/src/views/Copilot.jsx`, add:

```js
import { askFren } from '../lib/fren.js';
```

- [ ] **Step 2: StandardCopilot — item context + async ask**

Inside `StandardCopilot`, directly above the `ask` function, add (note: task id / SKU / AED value only — never the drafted message, which contains the customer's name):

```js
  const itemContext = isProc
    ? `Procurement approval ${item.workflow_task_id || ''}: SKU ${item.sku || '—'} (${name}), trigger ${(item.reason || '—').replace('_', ' ')}, store ${item.store || '—'}. Recommendation awaiting human buyer approval.`
    : `Warranty approval ${item.workflow_task_id || ''}: ${name}, declared value AED ${item.declared_value_aed}${isHigh ? ' (HIGH priority — above the AED 500 gate)' : ''}, warranty valid, reply drafted and awaiting desk release.`;
```

Replace the `ask` function (lines 81–89) with:

```js
  const ask = async (text, scripted) => {
    const t = (text || '').trim();
    if (!t) return;
    setFrenInput('');
    setHist((h) => [...h, { role: 'user', text: t }]);
    setThinking(true);
    if (scripted != null) {
      setTimeout(() => { setThinking(false); setHist((h) => [...h, { role: 'fren', text: scripted }]); }, 700);
      return;
    }
    const reply = await askFren(t, { itemContext, fallback: () => frenMatch(script.chips, t) });
    setThinking(false);
    setHist((h) => [...h, { role: 'fren', text: reply }]);
  };
```

- [ ] **Step 3: InterventionCopilot — same transformation**

Inside `InterventionCopilot`, directly above its `ask` function, add:

```js
  const itemContext = `Human intervention ${item.workflow_task_id}: operator requested "${item.request}" on run "${item.source_title}", assigned to ${item.assigned_to}, drafted and awaiting apply/release.`;
```

Replace its `ask` function (lines 271–279) with:

```js
  const ask = async (text, scripted) => {
    const t = (text || '').trim();
    if (!t) return;
    setFrenInput('');
    setHist((h) => [...h, { role: 'user', text: t }]);
    setThinking(true);
    if (scripted != null) {
      setTimeout(() => { setThinking(false); setHist((h) => [...h, { role: 'fren', text: scripted }]); }, 700);
      return;
    }
    const reply = await askFren(t, { itemContext, fallback: () => frenMatch(chips, t) });
    setThinking(false);
    setHist((h) => [...h, { role: 'fren', text: reply }]);
  };
```

- [ ] **Step 4: Build check**

Run (in `web-react/`): `npm run build`
Expected: build succeeds

- [ ] **Step 5: Commit**

```bash
git add web-react/src/views/Copilot.jsx
git commit -m "feat(web): copilot frens route free-typed questions through /api/fren"
```

---

### Task 11: Rebuild and commit `dist/`

**Files:**
- Modify: `web-react/dist/**` (generated)

- [ ] **Step 1: Production build**

Run (in `web-react/`): `npm run build`
Expected: Vite build succeeds, hashed assets emitted to `web-react/dist/`

- [ ] **Step 2: Serve-and-smoke**

Run: `python -m uvicorn orchestrator.main:app --port 8011`
Open `http://localhost:8011` — dashboard loads from the new dist; open the fren dock; ask a question; the keyword answer appears (scripted mode fallback). `GET /health` shows `{"status":"ok","runner":"scripted","llm_fallbacks":0}`.

- [ ] **Step 3: Commit the build**

```bash
git add web-react/dist
git commit -m "build: rebuild dist for fren LLM wiring"
```

---

### Task 12: Docs + final verification

**Files:**
- Modify: `README.md` (Run it section)

- [ ] **Step 1: Document the switch** — in `README.md`, after the run commands, add:

```markdown
### Real LLM (optional)

The demo is fully offline by default. To put real Claude behind live ingestion
(`POST /feedback/*`) and fren:

```bash
export WIG_RUNNER=sdk
export ANTHROPIC_API_KEY=sk-ant-...
# optional: export WIG_LLM_MODEL=claude-opus-4-8
uvicorn orchestrator.main:app --port 8000
```

`GET /api/demo` (the dashboard report) always uses the deterministic scripted
brain, so the demo invariants never change. Any LLM failure transparently falls
back to scripted — check `GET /health` for `runner` and `llm_fallbacks`.
```

- [ ] **Step 2: Full suite + manual smoke**

Run: `python -m pytest -q`
Expected: 35 passed

Optional live smoke (needs a real key; not part of CI):
`$env:WIG_RUNNER="sdk"; $env:ANTHROPIC_API_KEY="sk-ant-..."; python -m uvicorn orchestrator.main:app --port 8011`
then `POST /feedback/email` with `{"from": "...", "subject": "...", "body": "My Geepas kettle stopped working"}` and `POST /api/fren` with `{"question": "how is GEEPAS"}` — expect a real drafted acknowledgment and a real fren answer; `/health` shows `"runner": "sdk"`.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document WIG_RUNNER=sdk real-LLM switch"
```

---

## Self-review notes

- **Spec coverage:** §2 config/selection → Task 7; §3 SDKRunner (+3.1 models, 3.2 prompts, 3.3 fallback, 3.4 testability, 3.5 PDPL) → Tasks 5–6; §4 fren endpoint + frontend → Tasks 8–10 (+11 dist); §5 prerequisite test fixes → Tasks 1–3; new tests → Tasks 5–8; §6 ops/docs → Tasks 7 (health), 12 (README). No gaps.
- **Type consistency:** `SDKRunner(client=, model=)`, `runner.fren(question, context, item_context=None)`, `_select_runner()`, `askFren(question, {itemContext, fallback})` used identically across tasks.
- **Counts:** suite goes 21 (after Task 3) → 26 (Task 5) → 28 (Task 6) → 31 (Task 7) → 35 (Task 8). Final expectation 35 passed.
