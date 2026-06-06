# WIG-CFM — Immersive Run View + Human Intervene Loop

**Date:** 2026-06-06
**Status:** Approved design (Approach A), ready for implementation plan
**Approach:** Frontend-only. All run data already ships in `/api/demo` scenarios; the
intervene loop is client-side session state (same pattern as the queue's optimistic
`_actioned`). No backend changes. Must not destabilise the deterministic demo.

## Goal

The Agent Runs detail currently crams a rich multi-agent trace into the 320px right
rail, where tool-name chips **clip** (`.ts-tool` is `nowrap`). Replace it with an
immersive run view (like the queue copilot), and make a *closed* run actionable: the
human can **Intervene** — request a rework or an added action — which routes back
through the Human Queue under propose-don't-transact. Bundle three audit fixes.

## Run data (already in the report)

Each scenario: `id`, `title`, `tagline`, `channel`, `input{customer,lang,text}`,
`stages[{agent, steps[{label, tool, detail}]}]`, `messages[{language,label,text}]`,
`result`, `edge`. No structured scores — they appear inside a step `detail`
(e.g. "CSAT 5/5 · NPS 9/10 · CES 5/5") and are parsed out for the score strip.

---

## 1. Immersive run view (Approach A)

Clicking a run sets a new `RUNVIEW` state (parallel to `COPILOT`) and adds the
`.copilot` class to `#app` (reusing the existing sidebar/rail-hide + `#main` full
width). `render()` branches: `if(RUNVIEW) renderRunView()` before the section
dispatch, mirroring the existing `if(COPILOT)` branch. `closeRunView()` clears it and
removes the class. Render into `#main` a `.cp`-style shell, but **run-specific**.

**Header bar:** `◁ Runs` back (calls the existing `closeCopilot`/equivalent), title,
outcome pill, agent pills, channel · lang. Right side: **⚑ Intervene** button (brass).

**Layout:** `grid-template-columns: 1fr 360px` by default — **Trace** (wide) +
**Artifacts**. When Intervene is active, a third column slides in:
`grid-template-columns: 1fr 360px 340px` with a `.25s` transition.

### Trace (left, wide)
Agent-thread stages from `sc.stages`. Each stage = a node on a vertical thread
(reuse `thread-stage`/`ts-agent` styling, widened). Each step: `label` (left,
~120px), then the tool chip + `detail` (right, **wrapping**). The human-approval
stage gets a brass node. Tool chips **must wrap** (fix below), so nothing clips.

### Artifacts (right)
- **Score strip** (CSAT/NPS/CES) — only when parseable from step details via regex
  `/CSAT\s*(\d)/`, `/NPS\s*([+-]?\d+)/`, `/CES\s*(\d)/`. Hidden otherwise (pending/
  contained/escalated runs legitimately have none).
- **Inbound** — `sc.input.text` (RTL when `lang==='ARABIC'`).
- **Messages** — every `sc.messages[]` entry (drafted reply, acknowledgment),
  RTL-aware. (Today's rail shows only the first; the wide view shows all.)
- **Edge** — `sc.edge` as a "why it wins" quote (reuse `edge-quote`).

**Improvement:** the run view's fren uses a **brass** accent (vs teal co-solver
elsewhere) so the two fren surfaces read as distinct modes.

---

## 2. Intervene → Human Queue loop (full)

**⚑ Intervene** toggles the fren column (`.fren-open` class on the run shell). fren
opens with a brass header and an intent banner: *"You're reviewing a closed run.
Anything you request is drafted and sent to the Human Queue for approval — nothing is
re-sent automatically."*

**Context-aware chips** (by run type, derived from `agentNums`/`channel`/category in
the trace):
- Warranty run → "Redo the reply — warmer tone", "Reclassify (not WARRANTY_RETURN)",
  "Also flag to the quality team", "Add a goodwill gesture proposal".
- Procurement run → "Adjust order quantity", "Hold the reorder", "Switch supplier",
  "Escalate to category manager".
- Safety/contained run → "Add to block-list review", "Notify security" (minimal).
- Default → a generic set.

**On a chip click (or free-text):** fren shows a thinking beat, replies with a drafted
result, and creates a Human-Queue item:

```js
{ workflow_task_id: 'WF-IV-<n>', type: 'INTERVENTION',
  source_run: sc.id, source_title: sc.title, kind: '<chip label>',
  request: '<human text>', drafted_message: '<agent draft>',
  summary: '<one-line>', assigned_to: '<desk by kind>',
  status: 'pending_approval', priority: 'standard', _origin: 'human',
  ts: new Date().toISOString() }
```

Push to `REPORT.snapshot.human_queue`, call `refreshBadges()` (Human Queue badge +
bell update via the existing `pendingQueue()` path). A **toast** confirms
*"Proposal added to the Human Queue · linked to this run."*

**Improvement — audit trail:** append a stage to `sc.stages` and re-render the trace:
```
{ agent: 'Human · Intervention', steps: [
  {label:'Requested', tool:null, detail:<request>},
  {label:'Drafted by agent', tool:'draft', detail:<summary>},
  {label:'Queued for approval', tool:null, detail:<workflow_task_id>} ] }
```
Set `sc._reopened = true`; the Agent Runs list shows a small **"reopened"** marker on
that run.

**Approving the intervention (copilot variant):** opening an `INTERVENTION` queue item
opens the copilot. `renderCopilot` gains a third branch:
- **Left (ctx):** source run (title + `◁ open run`), a short timeline
  (Human intervened → agent drafted → awaiting approval), the human's `request`.
- **Center (doc):** the `drafted_message`/action, RTL-aware; header "Human
  intervention · <kind>".
- **Right (fren):** standard co-solver (teal), seeded with the intervention context.
- **Footer:** "Apply / Release →" → existing `showConfirmModal` → `_actioned`
  (propose-don't-transact note unchanged). Gap Check still available.

No transaction occurs anywhere; the intervention is a proposal a person signs off, and
the run records that it happened.

---

## 3. Audit fixes (bundled)

1. **Trace clipping** — make tool chips wrap. The run-view trace tool chip uses
   `white-space:normal` (or `word-break:break-word`); the existing `.ts-tool`
   `nowrap` stays for the (now unused-for-runs) rail but the run view does not clip.
2. **`tb-user` dead control** — the top-right avatar/name has `cursor:pointer` and no
   handler. Wire a small popover: "Signed in as Ahmed Al-Mansoori · Dept Head · All
   Brands · demo session (no real auth)." Click-toggles, closes on outside click
   (same pattern as the bell).
3. **Trend-arrow contradiction** — in the **brand table** (`viewOverview`), render the
   trend arrow glyph + delta in a **neutral faint colour** rather than green/red, so a
   still-negative NPS that improved no longer shows a green ↑ beside a red −25. The
   value cell's red/green remains the single health signal. KPI-tile arrows (Overview
   top strip) are unchanged.

---

## Constraints (unchanged, enforced)

- Propose, don't transact — interventions are proposals; approval is a human action;
  no transactional capability added.
- No staff named; no SAP/PO IDs shown to customers; PDPL (no customer PII cached —
  intervention `request`/notes are operator text, session-only).
- Deterministic demo intact: 2 velocity alerts (GEEPAS GK-NEW, KRYPTON KT-IRON21),
  7 brands, trend=7; report cache behaviour unchanged.
- Single-file `index.html`; reuse existing patterns (copilot shell, queue optimistic
  update, toast, fren plumbing).

## Out of scope

- Server-side persistence of interventions (session-only, like `_actioned`).
- A live LLM behind fren (scripted/keyword, as today).
- Editing the SAP record from the browser.

## Verification

- `node --check` on the inline script after each change.
- `build_report` assertions unchanged (2 alerts, 7 brands, trend 7).
- Server smoke: `/health`, `/`, `/api/demo` → 200.
- Manual: open each run → immersive trace (no clipping) + artifacts; Intervene slides
  fren in; a chip creates a Human-Queue item (badge +1) + appends the trace stage +
  toast; the run list shows "reopened"; opening the intervention item in the copilot
  shows the intervention variant and Apply marks it actioned. `tb-user` popover opens/
  closes. DELCASA trend arrow is neutral, value still red.
- Delete `web/mockup.html` before finishing.
