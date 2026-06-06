# WIG-CFM Dashboard — Full Polish Pass

**Date:** 2026-06-06
**Status:** Approved design, ready for implementation plan
**Approach:** C — Hybrid. Derive everything from data already in the report
(`stages`, `audit`, `corpus`, `customer_messages`, scores) plus small, honest
helpers. ~90% frontend; minimal backend additions; must not destabilise the
deterministic demo or the velocity-alert story (exactly GEEPAS GK-NEW + KRYPTON
KT-IRON21).

## Goal

The dashboard reads as a live operational console, not a half-empty report. Two
problems drive this pass: (1) the queue copilot page is mostly white space, and
(2) the "agents write resolutions back to SAP" half of the story is invisible.

## Scope

1. Queue copilot → 3-column review console (immersive)
2. New "Closed Loop" nav section (SAP write-back)
3. Responsive breakpoints (rail + copilot)
4. Loading skeleton
5. Wire remaining dead controls

Reference mockup: `web/mockup.html` (throwaway — **delete during implementation**).

---

## 1. Copilot review console (immersive, 3 columns)

Replace the current 2-column copilot (`copilot-wrap`, `renderCopilot`,
`buildDocPreview`, `buildFrenPanel`) with an immersive layout that also hides the
220px nav sidebar (a "◁ Queue" back control already exists). Columns scroll
independently — no page-level scroll.

**Layout:** `grid-template-columns: 288px 1fr 332px` under a 50px header bar.

### Left — Case context (`288px`)
- **Case timeline** — vertical thread reusing existing `thread-line` CSS.
  - For scenario-backed items: build steps from the scenario's `stages` (agent +
    step) and matching `audit` entries.
  - For seeded queue items (no scenario): synthesise deterministically from the
    item's own fields — received (channel/lang) → Agent 1 triage (category) →
    Agent 2/5 action → threshold/routing decision → "awaiting approval" (now).
  - Last step marked `now` (brass node).
- **Policy & precedent** card.
  - Warranty: coverage (1-yr), window/validity + days remaining, the AED-500
    high-value gate, and how this claim maps to it.
  - Procurement: inventory snapshot (shelf/backroom = 0), supplier, reorder
    cadence.
  - **Precedent line** = real count from `corpus`: number of tickets matching the
    same `product_sku`/model, with how many resolved/approved. Honest aggregation,
    no fabrication. If zero matches, show "no prior cases on record."
- **Your notes** card — textarea persisted in a session-local JS map keyed by
  `workflow_task_id` (`NOTES[id]`). Shows "✓ Saved · session only". Header "Notes"
  button shows a count badge.

### Center — The draft (`1fr`, flex column)
- Sticky header: Live preview + High-priority flag + status chip (existing).
- Scroll body:
  - Claim/recommendation summary (existing `doc-kv`).
  - Drafted reply with a **reply-tools** row. Warranty GEEPAS case has both
    Arabic + English content → EN/AR toggle is real; Edit/Adjust-tone are
    affordances that focus fren with a pre-filled prompt (no live editing of the
    SAP record). For items with only one language, show only that toggle.
  - **"On release · what happens next"** 3-step flow: Customer receives reply →
    CSAT/NPS/CES survey sent → resolution written back to SAP. Static,
    explanatory; previews the Closed Loop section.
- Pinned footer: propose-don't-transact note + the primary Release/Forward
  button → existing `showConfirmModal` → existing optimistic `_actioned` update.

### Right — fren (`332px`)
- Existing contextual fren panel, plus:
  - **Context bar** under the header: mono chips showing what fren is grounded in
    (task id, SKU, value/priority, validity, precedent count).
  - "Suggested" label above the scripted chips.
- Unchanged: scripted opening message, chip Q&A, free-text keyword match
  (`frenMatch`), thinking animation.

### Gap Check (header button → overlay)
Overlay (`gc-overlay`) over the center column. Checklist run against the actual
guardrail rules, each a pass (green) or manual-flag (amber):
- No customer PII in draft/cache (PDPL).
- No individual staff named (scan draft text).
- No SAP/claim/PO IDs disclosed to customer — regex-scan `drafted_message`/
  `recommendation` for `CRM-`, `CLM-`, `PO-`, `WF-`; pass if absent.
- Value-threshold routing correct (HIGH iff declared value > 500).
- Warranty validity / within policy (warranty items).
- Propose-don't-transact: no transactional tool used (always pass — none wired).
Footer summarises "N of M automated checks pass · K manual step(s) flagged".

---

## 2. Closed Loop view (new nav section)

New sidebar item after Guardrails: `{key:'loop', label:'Closed Loop', dot:teal}`.
Tells the resolution half of the story.

**Data source:** `snapshot.audit` entries of kind `resolution_updated` (carry
`sap_ticket_id`, `csat`, `nps`, `ces`) joined with `customer_notified` entries;
fall back to scenario results that include scores. Each row = a resolved case the
agents recorded in SAP.

**Layout:**
- Header (crumb/title/sub) in the standard `sec-head` pattern.
- 3 KPI tiles: loops closed, avg resolution CSAT, avg turnaround.
- Table: Case (+ short action) · Channel · CSAT · NPS · CES · SAP write-back
  (`✓ CRM-xxxxx`).
- Footer note: every row is a recorded resolution; no purchase/dispatch/courier
  action was taken by an agent.
- Row click → right-rail detail (reuse rail pattern) with the resolution notes +
  which agent closed it.

If no resolution data exists in a given run, show the existing empty-state
pattern rather than an empty table.

---

## 3. Responsive breakpoints

Currently fixed `220px 1fr 320px` with `overflow:hidden`. Add:
- **≤ 1100px:** hide the fixed right rail; selecting a row opens detail as a
  slide-over overlay from the right instead. Copilot center/right stay; left
  context column collapses into a toggle ("Context") if needed.
- **≤ 768px:** sidebar collapses to a top row of icon/labels or a hamburger;
  main is full width; copilot stacks vertically (context → draft → fren); the
  global fren dock becomes full-width bottom sheet.
- Allow vertical scroll on `body` at small sizes (relax `overflow:hidden` via the
  breakpoint).
- The trend/channel `trend-row` already uses a 2-col grid → stack at ≤ 768px.

No JS layout engine — pure CSS media queries plus a class toggle for the
slide-over rail.

## 4. Loading skeleton

Replace the plain "Loading dashboard…" text in `#main` with a shimmer skeleton:
KPI-row placeholder (4 tiles) + table placeholder rows, using a CSS
`@keyframes shimmer` gradient. Removed on first `render()`. Helps the cold-start
Render dyno look intentional. Keep the existing error-state text for fetch
failure.

## 5. Wire remaining dead controls

- Copilot "fren assisted" pill → toggles active state / scrolls fren into view
  (mobile: opens fren). No-op pills become real or are removed.
- Audit any remaining decorative buttons; either wire or drop.
- (Search, bell, Save Notes, Gap Check covered above / already live.)

---

## Constraints (unchanged, enforced)

- Propose, don't transact — no new transactional capability anywhere.
- No individual staff named; no SAP/PO IDs shown to customers.
- PDPL: no customer PII cached in agent memory / frontend state. Notes are
  operator notes (no customer PII), session-local only.
- Deterministic demo must still produce exactly the two expected velocity alerts;
  report cache behaviour unchanged.
- Single-file `index.html` ethos preserved (inline CSS/JS, self-hosted fonts).

## Data / backend touch points

Mostly frontend. Possible small backend helper: a per-item context slice
(timeline steps + precedent count) attached to each `human_queue` item in the
report, so the frontend doesn't re-derive corpus matches client-side. Decide
during planning — frontend-derivation is acceptable since the full `corpus`,
`audit`, and `stages` already ship in the report.

## Out of scope

- Live LLM-backed fren (separate future upgrade).
- Real server-side persistence of notes/approvals.
- Editing the actual SAP record from the browser.

## Testing / verification

- `node --check` on the inline script after each change.
- `python -c build_report` asserts: 2 velocity alerts (GEEPAS GK-NEW, KRYPTON
  KT-IRON21), 7 brand_metrics keys, daily_trend len 7, channel_mix present.
- Server smoke: `/health`, `/`, `/api/demo`, `/assets/...` return 200.
- Manual: each section renders; copilot console fills the viewport with no large
  voids at ~1280px; Closed Loop populated; responsive at 1000px / 700px; skeleton
  shows before data.
- Delete `web/mockup.html` before finishing.
