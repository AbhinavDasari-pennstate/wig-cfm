# WIG-CFM — Real LLM behind the Agents and fren — Design Spec

**Project:** Wonderful.ai × Western International Group (WIG)
**Date:** 2026-06-10
**Status:** Approved (design); implementation plan to follow
**Depends on:** existing `LLMRunner` protocol (`core/llm.py`), FastAPI orchestrator, React dashboard

---

## 0. Goal

Replace the deterministic `ScriptedLLMRunner` with a real Claude-backed runner for the
**live** surfaces of the system — channel ingestion (`POST /feedback/*`) and the fren
co-solver — while keeping:

1. **Propose, don't transact** — structural, unchanged. The LLM never drives tools;
   it performs language tasks only. All tool sequencing, routing, and thresholds stay
   in deterministic Python inside `agents/`.
2. **The demo path reproducible** — `GET /api/demo` (the dashboard report) continues to
   use `ScriptedLLMRunner` unconditionally. Determinism invariants are untouched:
   exactly 2 velocity alerts (GEEPAS GK-NEW, KRYPTON KT-IRON21), 7 brands, 7-day trend.
3. **The demo unable to fail live** — any LLM failure transparently falls back to the
   scripted brain.

## 1. Decisions made (with the operator)

| Decision | Choice |
|---|---|
| API surface | **Official `anthropic` Python SDK, direct Messages API calls** — not the Claude Agent SDK. The runner's five tasks are single-call classification/drafting jobs; no agent loop or model-driven tool use. The MCP servers remain the capability manifest for a later agentic phase. |
| Scope | **Agents + fren** in this pass. fren gets a real backend endpoint; the frontend keeps keyword logic as offline fallback. |
| Failure behaviour | **Fall back to scripted** on any error (timeout, rate limit, validation failure), recorded via logging + a fallback counter surfaced on `/health`. |
| Model | `claude-opus-4-8` default, overridable via `WIG_LLM_MODEL`. |

## 2. Configuration & selection

- New env vars, read once at orchestrator startup:
  - `WIG_RUNNER` — `scripted` (default) or `sdk`.
  - `ANTHROPIC_API_KEY` — required when `WIG_RUNNER=sdk` (standard SDK resolution).
  - `WIG_LLM_MODEL` — default `claude-opus-4-8`.
- `WIG_RUNNER=sdk` with a missing/broken key → log a warning at startup and run scripted.
  A deploy with no new env vars behaves byte-for-byte as today.
- `requirements.txt` gains `anthropic`.
- Wiring in `orchestrator/main.py`:
  - `_RUNNER` (live ingestion + webhooks) = selected runner.
  - `build_report()` for `/api/demo` = always `ScriptedLLMRunner` (explicitly constructed).
  - `/health` returns `{status, runner: "sdk"|"scripted", llm_fallbacks: N}`.

## 3. `core/llm_sdk.py` — `SDKRunner`

Implements the `LLMRunner` protocol: `async run(task: str, payload: dict) -> dict`.
Agents are not modified.

### 3.1 Per-task structured outputs

One `client.messages.parse()` call per task with a Pydantic output model, so malformed
JSON is structurally impossible:

| Task | Output model | Notes |
|---|---|---|
| `intake_triage` | `IntakeResult`: `language`, `brand`, `category` (enums from `models/feedback_ticket.py`), `urgency_score` (int, clamped 1–5 client-side), `acknowledgment` (str) | Routing and `sap_ticket_id` remain set by Python code in Agent 1 — never the model. |
| `draft_decline` / `draft_loop_close` / `draft_restock` | `DraftedMessage`: `message` (str) | Drafted in the customer's language. |
| `draft_survey` | `SurveyQuestions`: `questions` (list[str], exactly 3: CSAT 1–5, NPS 0–10, CES 1–5) | |
| `summarise_themes` | `ThemeSummary`: `themes` (list[str], ≤3) | |

Return shapes match `ScriptedLLMRunner` exactly (e.g. `{"message": ...}`), so the two
runners are drop-in interchangeable.

### 3.2 Prompts

- A stable per-task system prompt encoding the CLAUDE.md rules: formal Gulf-market tone
  per language (Arabic حضرتكم / formal RTL; professional British English; respectful
  Hindi/Malayalam), **never** name individual staff, **never** disclose SAP ticket IDs /
  PO numbers / internal references, **never** reference non-live channels in
  customer-facing text. Brand list included for classification.
- Volatile content (ticket text, names, payload fields) goes in the user turn only.
- Request shape: `max_tokens` ~2000, no sampling params (removed on Opus 4.8), no
  explicit thinking config (tasks are simple single-shot calls; structured outputs
  constrain the response). SDK default retries (2) and a request timeout of ~30s.

### 3.3 Fallback

`SDKRunner` embeds a `ScriptedLLMRunner`. On `anthropic.APIError`, timeout, or Pydantic
validation failure: log a warning with the task name (no payload contents — PDPL),
increment `self.fallbacks`, and return the scripted result for the same `(task, payload)`.
The caller cannot tell the difference; the demo cannot fail live.

### 3.4 Testability

Constructor accepts an injectable client (`SDKRunner(client=...)`). Tests pass a fake
whose `messages.parse` returns canned parsed objects or raises typed SDK errors. No
network or key in the test suite.

### 3.5 PDPL

Ticket text and customer names are sent to the Anthropic API transiently for processing
(equivalent to production SAP-adjacent processing); nothing is cached or logged in agent
memory, and fallback log lines carry task names only — never payload contents.

## 4. fren — `POST /api/fren`

- Request `{question: str}` → response `{answer: str|null, fallback: bool}`.
- Server builds a compact **PII-free** context from the cached demo report: per-brand
  CSAT/NPS/CES + ticket counts, velocity alerts, pending human-queue counts (and
  high-priority count), channel mix, safety summary. No customer names, no raw ticket
  text.
- System prompt: fren persona — concise co-solver for a department head; knows the
  guardrails ("agents propose, never transact; humans approve everything outward");
  answers from the provided context only; British English.
- In scripted mode, or on any LLM failure: `{answer: null, fallback: true}`.

### Frontend changes (`web-react/`)

- fren answering becomes async: try `POST /api/fren`; on HTTP error or `fallback: true`,
  use the existing local keyword `frenAnswer(report, q)` — today's behaviour is the
  floor, never lost, and offline mode is unaffected.
- A subtle "thinking…" indicator while the request is in flight. No visual redesign;
  all three fren surfaces (dock, copilot teal, intervene brass) route through the same
  shared answer function.
- After changes: `npm run build`, commit `web-react/dist/` (Render serves the committed
  build; no Node build step at deploy time).

## 5. Testing

**Prerequisite housekeeping (before this feature lands):** repair the 3 stale
seed-coupled test failures so the suite is green —

- `tests/test_velocity.py` asserts 1 spike; the stated invariant is exactly 2
  (GEEPAS GK-NEW + KRYPTON KT-IRON21). Update to assert both.
- `tests/test_safety.py::test_regular_history_still_routes_to_human_not_auto_po`
  asserts absolute queue length against seeded data; assert the *delta* caused by the
  call (one new `REGULAR_REORDER_RECOMMENDED` task appended).
- `tests/test_diagnosis.py::test_coaching_never_names_an_individual` assumes ROYALFORD
  NPS below the coaching threshold; align the assertion with current seed data while
  keeping the actual guardrail check (no individual staff names) intact.

**New tests (`tests/test_sdk_runner.py`, `tests/test_fren.py`):**

- Each task maps to the right output model and returns the scripted-compatible shape.
- Fallback fires on a typed SDK error and on a validation error: scripted result
  returned, `fallbacks` incremented, no exception propagates.
- Agent 1 routing decisions are identical under `SDKRunner` (faked) and
  `ScriptedLLMRunner` for the same classification result — guardrails are
  runner-independent.
- `/api/fren` returns `{fallback: true}` in scripted mode; returns an answer when the
  runner is a faked SDK runner.
- Existing safety tests (`tests/test_safety.py` capability-absence proofs) unchanged.

## 6. Ops / rollout

- Enable: set `WIG_RUNNER=sdk` + `ANTHROPIC_API_KEY` (+ optional `WIG_LLM_MODEL`) on
  Render. Disable: unset. No migration, no persistence change.
- `/health` exposes runner mode and fallback count for quick smoke checks.
- Cost note: live ingestion volume in Phase 1 is demo-scale; single short calls on
  `claude-opus-4-8` are negligible. Revisit model choice if volume grows.

## 7. Out of scope (this pass)

- Model-driven tool use / wiring the MCP `create_*_server()` factories to a live agent
  loop (future agentic phase; capability manifest already in place).
- LLM-generated dashboard report (`/api/demo` stays scripted by design).
- Durable human queue, auth, live email ingestion (separate roadmap items).
