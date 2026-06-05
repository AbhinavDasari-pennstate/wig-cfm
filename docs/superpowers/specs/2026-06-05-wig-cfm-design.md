# WIG Customer Feedback Intelligence System — Design Spec

**Project:** Wonderful.ai × Western International Group (WIG)
**Date:** 2026-06-05
**Status:** Awaiting approval (no code written yet)
**Stack:** Python 3.12 · Claude Agent SDK · MCP (in-process) · FastAPI · httpx · pytest

---

## 0. Purpose of this document

This is the agreed design **before any code is written**. It exists to prove the
system is sound — in particular the **transaction-safety guardrail** the customer
asked for — and to drive the implementation plan. Nothing in `agents/`,
`mcp_servers/`, or `orchestrator/` is built until this spec is approved.

---

## 1. The headline rule: **Propose, don't transact**

> **For Phase 1, no agent may perform any action that commits money, goods, or an
> order. Agents may only read, record feedback, draft messages, and *notify a human*
> who then decides. Every purchase order is reviewed and approved by a human.**

### 1.1 Why this is enforced by *capability removal*, not by prompting

The threat model is an attacker (or a confused customer) **manipulating an agent via
its text input** into placing orders that aren't needed. A system prompt that says
"don't create unnecessary POs" is not a real control — a sufficiently clever prompt
injection can talk past instructions.

The real control: **the order-placing tool does not exist in the agent's toolset.**

- No transactional tool is registered on the procurement server, and none appears in
  any agent's `allowed_tools` list.
- Therefore, even an agent that has been fully jailbroken **physically cannot** place
  an order, generate a courier label, or dispatch goods. There is no function to call.
- The only procurement-side write the agent can perform is `notify_human_buyer`, which
  creates a SAP Workflow approval task for a person. That is "telling a human," which
  is explicitly the allowed action.

This is the property we want proof of, and it holds by construction.

### 1.2 Per-tool capability classification

Every tool across the three MCP servers is classified. Only **read**, **record**, and
**notify-human** tools are wired to agents. Anything that commits money/goods/orders is
**removed from the toolset** (not merely discouraged).

| Server | Tool | Class | Phase-1 status |
|---|---|---|---|
| sap-crm | `search_tickets` | read | ✅ wired to agents |
| sap-crm | `create_feedback_ticket` | record (logs the customer's own feedback; no financial/goods effect) | ✅ wired |
| sap-crm | `update_ticket_resolution` | record (resolution notes + CSAT/NPS/CES) | ✅ wired |
| sap-crm | `raise_quality_alert` | notify-human (QA team) | ✅ wired |
| warranty | `check_warranty_eligibility` | read | ✅ wired |
| warranty | `track_shipment` | read | ✅ wired |
| warranty | `flag_spare_part_shortage` | notify-human (QA team) | ✅ wired |
| warranty | `request_fulfillment_approval` | notify-human (warranty desk) — **replaces** label/dispatch | ✅ wired |
| warranty | ~~`generate_return_label`~~ | **transaction** (courier label = money + goods) | ⛔ **not wired** — gated behind human approval |
| warranty | ~~`dispatch_replacement`~~ | **transaction** (ships goods) | ⛔ **not wired** — gated behind human approval |
| procurement | `check_existing_po` | read | ✅ wired |
| procurement | `get_purchase_history` | read | ✅ wired |
| procurement | `check_inventory_level` | read | ✅ wired |
| procurement | `notify_human_buyer` | notify-human (SAP Workflow approval task) | ✅ wired |
| procurement | ~~`create_purchase_order`~~ | **transaction** (places an order) | ⛔ **not implemented** — see §1.3 |

> **Why CRM record-writes stay autonomous:** `create_feedback_ticket` /
> `update_ticket_resolution` only persist what a customer said and how their case was
> resolved. They commit no money, goods, or orders, and blocking them would make the
> system unable to even log feedback without a human. They carry no procurement-manipulation
> risk, so they remain autonomous. This distinction (record vs. transact) is the line we draw.

### 1.3 The deliberately-absent PO tool

`create_purchase_order` is **not implemented** in Phase 1. Re-enabling it later is a
deliberate, two-step act that this spec requires be done as its own reviewed change:
1. implement the SAP MM `POST` handler, and
2. add `mcp__procurement__create_purchase_order` to an agent's `allowed_tools`.

Until both happen, the capability is absent. The AED 500 threshold from the original
guide is therefore **moot for autonomy in Phase 1** (nothing auto-transacts); it is
retained only as a *priority hint* inside the recommendation an agent sends to a human.

### 1.4 Scope note to confirm

I have applied the rule to **all** money/goods commitments, which means **Agent 2
(Warranty) no longer auto-generates return labels or dispatches replacements** — it
validates eligibility and routes fulfillment to a human, symmetric to Agent 5. This is
the conservative reading of "no transactional activity for now." If the intent was
**procurement-only** gating (Agent 2 keeps fulfilling autonomously), that is a one-line
change to §6.2 and I will revert Agent 2's fulfillment path; procurement stays gated
either way.

---

## 2. Other architectural decisions (carried from prior design)

1. **Guardrails in deterministic Python, not prompts.** Routing (urgency 4–5 → HITL),
   Agent 5's three-case diagnosis sequencing, Agent 3's velocity math, and NPS/CES
   formulas are plain code. The LLM is used only for language detection, classification,
   urgency scoring, theme summarisation, and drafting natural-language messages. The
   embedded system prompts from the guide remain, but code is the backstop.

2. **SDK is optional at test time.** `claude-agent-sdk` is not installed and the suite
   must pass offline with no creds. Each MCP tool's real work is a plain
   `async def _tool_impl(args) -> dict` (httpx, unit-testable with a mocked transport);
   the `@tool` / `create_sdk_mcp_server` wrappers are thin adapters built only inside the
   `create_*_server()` factories. Agents take an injectable **LLM runner** (default =
   real SDK-backed) so tests pass a fake. SDK imports are localized so core logic + the
   full pytest suite run even when the package is absent. We still `uv add
   claude-agent-sdk` for real runs.

3. **Agents return structured JSON.** Each agent instructs the model to emit a final
   JSON object matching its documented return shape; Python parses it, validates against
   Pydantic, and merges into the `FeedbackTicket`. Deterministic fields (routing,
   `sap_ticket_id`) are set by code, never the model.

---

## 3. Project layout

```
wig-cfm/
├── core/                      # shared infra [addition to the guide]
│   ├── http.py                # httpx client base, env config, graceful {"error":...}
│   ├── llm.py                 # injectable LLM runner (SDK-backed default + JSON extractor)
│   └── config.py              # env loading, thresholds, base URLs
├── models/feedback_ticket.py  # Pydantic v2 models (FeedbackTicket, ResolutionNotification, enums)
├── mcp_servers/
│   ├── sap_crm_server.py      # 4 tools (read/record/notify only)
│   ├── warranty_server.py     # read + notify tools; NO label/dispatch
│   └── procurement_server.py  # read + notify_human_buyer only; NO create_purchase_order
├── agents/
│   ├── agent1_intake.py       # triage + routing
│   ├── agent2_warranty.py     # eligibility + route fulfillment to human + loop-close/survey
│   ├── agent3_quality.py      # velocity detection + weekly digest (CSAT/NPS/CES)
│   ├── agent4_coaching.py     # regional coaching (team-level only, NPS/CES)
│   └── agent5_procurement.py  # OOS diagnosis (3 cases) → notify human; restock notify
├── channels/                  # email, whatsapp, ecomm, qr → FeedbackTicket
├── orchestrator/main.py       # FastAPI + APScheduler + approval/confirmation webhooks
├── tests/                     # pytest-asyncio, mocked httpx + fake LLM runner, fixtures/
├── CLAUDE.md  ·  .mcp.json  ·  Makefile  ·  requirements.txt  ·  .env.example
```

Data flow: channel listener → `FeedbackTicket` → orchestrator → Agent 1 triage →
route to Agent 2 / Agent 5 / HITL / buffer → MCP tools (read/record/notify) → SAP.
Schedulers fire Agents 3 & 4. Human-action webhooks (`/restock-confirmed`,
`/fulfillment-confirmed`) trigger the loop-close + survey.

---

## 4. Models (`models/feedback_ticket.py`)

Pydantic v2. Enums: `FeedbackChannel`, `Language`, `Brand`, `FeedbackCategory` (values
per the guide). `FeedbackTicket` with all guide fields incl. `nps_score`, `ces_score`,
`store_aisle`. `ResolutionNotification` model per the guide.

---

## 5. MCP servers

### 5.1 `sap_crm_server.py` — `create_sap_crm_server()`
Tools: `create_feedback_ticket`, `update_ticket_resolution`, `search_tickets`
(accepts `include_scores`), `raise_quality_alert`. All via `httpx.AsyncClient`, all
return `{"error": str}` on failure, never raise.

### 5.2 `warranty_server.py` — `create_warranty_server()`
Tools: `check_warranty_eligibility` (read), `track_shipment` (read),
`flag_spare_part_shortage` (notify), **`request_fulfillment_approval`** (notify-human:
creates a warranty-desk approval task with claim id, eligibility, declared value, and the
drafted customer messages attached). **No** `generate_return_label`, **no**
`dispatch_replacement`.

### 5.3 `procurement_server.py` — `create_procurement_server()`
Tools: `check_existing_po` (read), `get_purchase_history` (read; computes
`avg_interval_days`/`is_regular` as *advisory metadata only*), `check_inventory_level`
(read), `notify_human_buyer` (notify; `reason` ∈ {`NO_PURCHASE_HISTORY`,
`IRREGULAR_ORDERING`, `REGULAR_REORDER_RECOMMENDED`, `PO_VALUE_HIGH`}, payload carries a
human-readable recommendation). **No** `create_purchase_order`.

---

## 6. Agents

### 6.1 Agent 1 — Intake & Triage (`process_intake`)
LLM: detect language, classify brand + category, urgency 1–5, draft ack in customer's
language. Code: call `create_feedback_ticket`; apply routing table — urgency 4–5 →
`HITL`; `WARRANTY_RETURN` → `AGENT2`; `OUT_OF_STOCK` → `AGENT5`; else `BUFFER`. Returns
`{updated_ticket, acknowledgment, routing}`.

### 6.2 Agent 2 — Warranty & Returns (`process_warranty`) — **reworked for §1**
1. `check_warranty_eligibility` (read).
2. Ineligible → LLM drafts polite decline in customer's language → `update_ticket_resolution`
   (closed) → survey flow (§6.6). Stop.
3. Eligible → `request_fulfillment_approval` (notify-human): a person approves and performs
   the label/dispatch. Agent does **not** transact.
4. `flag_spare_part_shortage` if the same part was requested 3+ times in 7 days (notify).
5. Loop-close (Gap A) + NPS/CES/CSAT survey (Gap C) fire when a human confirms fulfillment
   via the `/fulfillment-confirmed` webhook — drafted by the LLM in the customer's language,
   personalised with name + product + tracking, then `update_ticket_resolution`.
   AED 500 declared value → flagged in the approval task as high-value (HITL priority).

### 6.3 Agent 3 — Quality Intelligence
`run_daily_quality_scan()`: `search_tickets` (7 days); group by
`(brand, product_sku, category)`; **velocity** = recent-3-day vs prior-3-day count; if
rate up >50% **and** recent ≥3 → `raise_quality_alert(alert_type="velocity_spike",
velocity_pct=...)` (primary trigger). Secondary fallback: any `(brand, sku)` ≥15 in 7 days
→ `raise_quality_alert(alert_type="volume_threshold")`. All math in Python.
`generate_weekly_digest()`: per-brand avg CSAT, NPS = `%promoters(9–10) − %detractors(0–6)`,
avg CES, counts, top-3 categories, watch list; LLM formats the markdown. Flags brands with
<10 survey responses.

### 6.4 Agent 4 — Regional Coaching (`generate_coaching_reports`)
`search_tickets` (30 days, scored) grouped by `(brand, region)`, ≥5 tickets. Python
computes CSAT/NPS/CES; LLM summarises top-3 themes + coaching note. **Hard guardrail in
code + prompt: never name individual staff** — team-level only. POST to SuccessFactors.

### 6.5 Agent 5 — Out-of-Stock & Procurement (`process_out_of_stock`) — **reworked for §1**
Deterministic three-case sequence:
1. `check_inventory_level`. If `backroom>0 and shelf==0` → **Case 3 restocking**: notify
   store manager only. Return `{case:3}`.
2. If `total==0`, `check_existing_po`. If open PO undelivered → **Case 2 delay**:
   `track_shipment`, notify procurement + store manager with PO/ETA/delay. Return `{case:2}`.
3. If no PO → **Case 1**: `get_purchase_history` (advisory), then **always**
   `notify_human_buyer` with a recommendation (suggested qty, cadence, last price,
   estimated value, and reason). **Never** auto-creates a PO. Return
   `{case:1, action:"human_buyer_notified", reason}`.

`notify_customer_on_restock(ticket, aisle)`: on `/restock-confirmed`, LLM drafts a
proactive message in the customer's language ("your feedback was heard — [Product] is now
in Aisle [X] at [Store]"), then `update_ticket_resolution` + survey (§6.6).

### 6.6 Shared post-resolution survey (Gap C)
CSAT (1–5), NPS (0–10), CES (1–5) questions, LLM-generated in the customer's language;
responses written back via `update_ticket_resolution`. Used by Agents 2 and 5.

---

## 7. Channels & orchestrator
Channels (`parse_email`, `parse_whatsapp`, `parse_ecomm_webhook`, `parse_qr_scan`)
normalise inbound payloads to `FeedbackTicket`. QR scans are pre-classified NESTO /
OUT_OF_STOCK and bypass Agent 1. FastAPI endpoints per the guide, plus
`/fulfillment-confirmed` (Agent 2 loop-close) alongside `/restock-confirmed` (Agent 5).
APScheduler: daily 06:00 GST scan, Monday 07:00 digest, Monday 07:30 coaching.

---

## 8. External APIs & error handling
All outbound calls via `httpx.AsyncClient` to **configurable base URLs** from env. Every
tool catches HTTP/network errors → returns `{"error": str}`, never raises. Nothing live is
called during the build; correctness is proven by the mock suite.

---

## 9. Testing (test-first per component)
`pytest` + `pytest-asyncio`. httpx mocked via `httpx.MockTransport`; LLM runner replaced
with a fake returning canned JSON. Fixtures per the guide. Key cases include the
guide's Step-13 set **plus** the new safety cases:
- **No agent exposes a PO-creation or label/dispatch tool** — assert these names are absent
  from every server's tool list and from every agent's `allowed_tools`. (Proof of §1.)
- Agent 5 with regular purchase history still routes to `notify_human_buyer` (never creates a PO).
- Agent 5 Case 3 (backroom stock) notifies store manager only; Case 2 notifies procurement+store.
- Agent 2 eligible → `request_fulfillment_approval` (no label/dispatch call made).
- Velocity spike fires before volume threshold (8 complaints, +300% → alert).
- Weekly digest includes CSAT/NPS/CES per brand; coaching never names individuals.
- Loop-close + restock messages render in Arabic/English/Hindi.

---

## 10. Phasing (drives the implementation plan)
0 scaffold (uv+git, structure, requirements, `.env.example`) → 1 models + `core/` →
2 SAP-CRM MCP → 3 Warranty MCP → 4 Procurement MCP → 5 Agent 1 → 6 Agent 2 →
7 Agent 3 → 8 Agent 4 → 9 Agent 5 → 10 channels → 11 orchestrator + scheduler +
webhooks → 12 `CLAUDE.md` + `.mcp.json` + `Makefile` + full suite green. Each phase ends
with its tests passing.

---

## 11. Out of scope (YAGNI)
The six rejected gaps (CDP/identity, churn scoring, DXA/session replay, industry
benchmarking, custom BI dashboard, speech analytics); **any live transaction** (PO
creation, courier label, dispatch); and the architecture poster.

---

## 12. Assumptions / open items
- SAP MM OData v4 filter syntax + endpoints are placeholders pending WIG IT (read-only
  tools only in Phase 1, so risk is low).
- WhatsApp outbound templates need Meta approval; Phase 1 customer-facing channel is email.
- UAE PDPL: no customer PII cached/logged in agent memory; PII writes go to SAP only.
- `CLAUDE.md` carries the shared brand/tone/guardrail context including §1.
```

