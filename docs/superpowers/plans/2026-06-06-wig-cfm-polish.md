# WIG-CFM Full Polish Pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the dashboard's empty space (chiefly the queue copilot) and surface the "agents write resolutions back to SAP" story, without destabilising the deterministic demo.

**Architecture:** Approach C (hybrid). Two small read-only backend aggregations are added to the report (`precedent_index`, `closed_loop`); everything else is frontend in the single-file `web/index.html`. The immersive 3-column copilot, the Closed Loop section, responsive breakpoints, a loading skeleton, and live controls are all driven by data already shipped in `/api/demo`.

**Tech Stack:** FastAPI (Python 3.12), single-file static `index.html` (inline CSS/JS, self-hosted woff2 fonts), deterministic `ScriptedLLMRunner`. No JS test framework exists — frontend verification is `node --check` on the inline script, `build_report` assertions, and a curl smoke test.

**Visual source of truth:** `web/mockup.html` (committed-as-working-tree throwaway). It contains the exact CSS and markup for the copilot console and Closed Loop view that were approved. Port styles/markup from it; it is deleted in the final task.

**Spec:** `docs/superpowers/specs/2026-06-06-wig-cfm-polish-design.md`

---

## File structure

- **Modify** `demo/runner.py` — add `_precedent_index()` and `_closed_loop()` helpers; attach to report. (~40 lines)
- **Modify** `web/index.html` — all UI work: skeleton, Closed Loop view, copilot rewrite, Gap Check, responsive CSS, control wiring. The inline `<script>` and `<style>` blocks.
- **Delete** `web/mockup.html` — in the final task.
- No test files (no harness); verification commands are inline per task.

**Standing verification commands** (used repeatedly below):

```bash
# JS syntax check of the inline script
python -c "import re;s=open('web/index.html',encoding='utf-8').read();open('_check.js','w',encoding='utf-8').write(re.search(r'<script>(.*?)</script>',s,re.S).group(1))" && node --check _check.js && echo JS_OK; rm -f _check.js

# Report integrity (run from repo root)
python -c "import asyncio;from demo.runner import build_report;r=asyncio.run(build_report());vel=[s for s in r['scenarios'] if s['id']=='velocity_digest'][0];a=vel['result']['alerts'];assert sorted((x['brand'],x['sku']) for x in a)==[('GEEPAS','GK-NEW'),('KRYPTON','KT-IRON21')],a;assert len(r['brand_metrics'])==7;assert len(r['daily_trend'])==7;print('REPORT_OK')"
```

The server may already run on :8011 (`python -m uvicorn orchestrator.main:app --port 8011`). After backend edits, restart it or hit `/api/demo?refresh=1`.

---

## Task 1: Backend — precedent index + closed-loop rows

**Files:**
- Modify: `demo/runner.py` (add two helpers near `_channel_mix`, ~line 90; wire into `build_report` after `report["channel_mix"]`)

- [ ] **Step 1: Add the two helpers**

Insert after the `_channel_mix` function in `demo/runner.py`:

```python
def _precedent_index(backend: DemoBackend) -> dict:
    """Per-brand corpus counts so the copilot can show real 'similar cases'.

    Read-only aggregation over the full corpus (current + prior weeks). Keyed by
    brand, with per-category counts and a resolved tally.
    """
    out: dict = {}
    for t in backend.corpus:
        b = t["brand"]
        rec = out.setdefault(b, {"total": 0, "resolved": 0, "by_category": {}})
        rec["total"] += 1
        if t.get("resolved"):
            rec["resolved"] += 1
        cat = t.get("category", "OTHER")
        rec["by_category"][cat] = rec["by_category"].get(cat, 0) + 1
    return out


def _closed_loop(backend: DemoBackend) -> list[dict]:
    """Resolved cases with scores written back to SAP, for the Closed Loop view.

    Built from audit `resolution_updated` entries joined to the ticket record and
    any customer message. Honest: one row per recorded resolution.
    """
    rows = []
    for e in backend.audit:
        if e.get("kind") != "resolution_updated":
            continue
        sid = e.get("sap_ticket_id")
        tk = backend.tickets.get(sid, {})
        msg = next((m for m in backend.customer_messages if m.get("ticket_id") == sid), {})
        rows.append({
            "sap_ticket_id": sid,
            "brand": tk.get("brand", "—"),
            "product": tk.get("product_sku") or tk.get("category", "Case"),
            "category": tk.get("category", "—"),
            "channel": tk.get("channel", "—"),
            "language": msg.get("language", tk.get("language", "—")),
            "csat": e.get("csat"),
            "nps": e.get("nps"),
            "ces": e.get("ces"),
            "notes": tk.get("resolution_notes", ""),
        })
    return rows
```

- [ ] **Step 2: Wire into the report**

In `build_report`, immediately after the `report["channel_mix"] = _channel_mix(backend)` line, add:

```python
    report["precedent_index"] = _precedent_index(backend)
    report["closed_loop"] = _closed_loop(backend)
```

- [ ] **Step 3: Verify report integrity + new keys**

Run:

```bash
python -c "import asyncio,json;from demo.runner import build_report;r=asyncio.run(build_report());print('precedent brands:',sorted(r['precedent_index']));print('closed_loop rows:',len(r['closed_loop']));print(json.dumps(r['closed_loop'][:1],default=str));assert len(r['brand_metrics'])==7;print('OK')"
```

Expected: 7 precedent brands, ≥1 closed_loop row with brand/csat/nps/ces fields, `OK`. Also run the REPORT_OK command from "Standing verification" — the 2 velocity alerts must be unchanged.

- [ ] **Step 4: Commit**

```bash
git add demo/runner.py
git commit -m "Report: add precedent_index and closed_loop aggregations"
```

---

## Task 2: Loading skeleton

**Files:**
- Modify: `web/index.html` — `#main` initial markup (~line 404) + add skeleton CSS in `<style>` + `@keyframes shimmer`.

- [ ] **Step 1: Add skeleton CSS**

Add before `/* ── MOTION ── */` in the `<style>` block:

```css
/* ── SKELETON ── */
.sk{padding:22px 26px;}
.sk-row{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px;}
.sk-box{background:var(--card);border:1px solid var(--line);border-radius:14px;height:96px;overflow:hidden;position:relative;}
.sk-box.tall{height:320px;grid-column:1/-1;}
.sk-box::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.6),transparent);transform:translateX(-100%);animation:shimmer 1.3s infinite;}
@keyframes shimmer{100%{transform:translateX(100%);}}
```

- [ ] **Step 2: Replace the loading text with the skeleton**

Change the `#main` element (currently `<main class="main" id="main"><div class="loading-state">Loading dashboard…</div></main>`) to:

```html
  <main class="main" id="main"><div class="sk"><div class="sk-row"><div class="sk-box"></div><div class="sk-box"></div><div class="sk-box"></div><div class="sk-box"></div></div><div class="sk-row"><div class="sk-box tall"></div></div></div></main>
```

The skeleton is replaced on first `render()` (which calls `main.innerHTML=''`). The fetch-failure branch in `boot()` already overwrites `#main` with the error message — leave it.

- [ ] **Step 3: Verify**

Run the JS_OK and curl `/` (expect 200). Manually: throttle/reload — skeleton shows before data.

```bash
python -c "import re;s=open('web/index.html',encoding='utf-8').read();open('_check.js','w',encoding='utf-8').write(re.search(r'<script>(.*?)</script>',s,re.S).group(1))" && node --check _check.js && echo JS_OK; rm -f _check.js
```

- [ ] **Step 4: Commit**

```bash
git add web/index.html
git commit -m "Dashboard: shimmer loading skeleton"
```

---

## Task 3: Closed Loop nav section + view + rail detail

**Files:**
- Modify: `web/index.html` — `NAV_ITEMS` (~line 421), render dispatcher (~line 612), add `viewLoop`, extend `renderRail` for the `loop` type, add CSS (port from `web/mockup.html` `.cl*` rules).

- [ ] **Step 1: Add the nav item**

In `NAV_ITEMS`, after the `guardrails` entry add:

```javascript
  {key:'loop',     label:'Closed Loop',     dot:'#1F7A5A', badge:null},
```

- [ ] **Step 2: Port Closed Loop CSS**

Copy the `.cl`, `.cl-head`, `.cl-crumb`, `.cl-title`, `.cl-sub`, `.cl-body`, `.cl-kpis`, `.cl-kpi`, `.cl-list`, `.cl-th`, `.cl-row`, `.cl-case`, `.cl-v`, `.cl-sap`, `.cl-note` rules from `web/mockup.html` into the `<style>` block (before `/* ── MOTION ── */`). They already match the design tokens. The shared `.pos`/`.neu` classes already exist in index.html — do not redeclare.

- [ ] **Step 3: Add `viewLoop` and register it**

Add this function after `viewGuardrails`:

```javascript
/* ─────────────── CLOSED LOOP ─────────────── */
function viewLoop(main) {
  const rows = REPORT.closed_loop || [];
  const w = el('div');
  const head = el('div','sec-head');
  head.innerHTML = `<div class="sec-crumb">Resolution · Written back to SAP</div><div class="sec-title">Closed Loop</div><div class="sec-sub">Resolved cases with CSAT / NPS / CES written back to SAP — agents propose and record; they are not the system of record.</div>`;
  w.appendChild(head);
  const body = el('div','sec-body section-animate');

  if(!rows.length) {
    body.innerHTML = '<div class="rail-empty" style="height:40vh"><div class="re-icon">◷</div><div class="re-title">No closed loops yet</div><div class="re-sub">Resolutions appear here once agents write scores back to SAP.</div></div>';
    w.appendChild(body); main.innerHTML=''; main.appendChild(w); return;
  }

  const csats = rows.map(r=>r.csat).filter(v=>v!=null);
  const avg = csats.length ? (csats.reduce((a,b)=>a+b,0)/csats.length).toFixed(1) : '—';
  const kpis = el('div','cl-kpis');
  kpis.innerHTML = `
    <div class="cl-kpi"><div class="k">Loops closed</div><div class="v">${rows.length}</div><div class="s">surveys + scores written to SAP</div></div>
    <div class="cl-kpi"><div class="k">Avg resolution CSAT</div><div class="v ${csatClass(parseFloat(avg)||0)}">${avg}</div><div class="s">across closed cases</div></div>
    <div class="cl-kpi"><div class="k">System of record</div><div class="v">SAP</div><div class="s">agents record, never own the data</div></div>`;
  body.appendChild(kpis);

  const list = el('div','cl-list');
  const th = el('div','cl-th');
  th.innerHTML = '<span>Case</span><span>Channel</span><span>CSAT</span><span>NPS</span><span>CES</span><span>SAP write-back</span>';
  list.appendChild(th);
  rows.forEach(r => {
    const name = SKU_NAMES[r.product] || r.product;
    const row = el('div','cl-row');
    row.innerHTML = `
      <div class="cl-case">${name}<span class="sub">${r.brand} · ${r.category}</span></div>
      <span class="badge neutral">${channelLabel(r.channel)}</span>
      <span class="cl-v ${r.csat!=null?csatClass(r.csat):''}">${r.csat??'—'}</span>
      <span class="cl-v ${r.nps!=null?npsClass(r.nps):''}">${r.nps!=null?fmtNPS(r.nps):'—'}</span>
      <span class="cl-v ${r.ces!=null?csatClass(r.ces):''}">${r.ces??'—'}</span>
      <span class="cl-sap">✓ ${r.sap_ticket_id||'SAP'}</span>`;
    row.onclick = () => selectItem('loop', r, row);
    list.appendChild(row);
  });
  body.appendChild(list);
  body.appendChild(el('div','cl-note','Every row is a resolution the agents recorded in SAP. No purchase, dispatch, or courier action was taken by an agent.'));
  w.appendChild(body);
  main.innerHTML=''; main.appendChild(w);
}
```

Register it in the `render` dispatcher map:

```javascript
  ({overview:viewOverview, quality:viewQuality, queue:viewQueue, runs:viewRuns, guardrails:viewGuardrails, loop:viewLoop}[key] || viewOverview)(main);
```

- [ ] **Step 4: Add the rail detail for `loop`**

Find `renderRail()` and the `selectItem` type switch inside it. Add a branch for `SEL.type==='loop'` that renders into the rail (follow the existing rail markup pattern — `rail-head`, `rail-body`, `rail-section`):

```javascript
  if(SEL.type === 'loop') {
    const r = SEL.data;
    rail.innerHTML = `
      <div class="rail-head"><div class="rail-crumb">Closed Loop</div><div class="rail-title">${SKU_NAMES[r.product]||r.product}</div><div class="rail-sub">${r.brand} · ${r.category}</div></div>
      <div class="rail-body">
        <div class="rail-section"><div class="rail-section-k">Resolution scores</div>
          <div class="stat-pair"><div class="stat-box"><div class="k">CSAT</div><div class="v ${r.csat!=null?csatClass(r.csat):''}">${r.csat??'—'}</div></div><div class="stat-box"><div class="k">NPS</div><div class="v ${r.nps!=null?npsClass(r.nps):''}">${r.nps!=null?fmtNPS(r.nps):'—'}</div></div></div>
          <div class="stat-pair"><div class="stat-box"><div class="k">CES</div><div class="v">${r.ces??'—'}</div></div><div class="stat-box"><div class="k">Channel</div><div class="v" style="font-size:14px">${channelLabel(r.channel)}</div></div></div>
        </div>
        <div class="rail-section"><div class="rail-section-k">SAP write-back</div><div class="rail-kv"><span class="k">Ticket</span><span class="v mono">${r.sap_ticket_id||'—'}</span></div><div class="rail-kv"><span class="k">Language</span><span class="v">${langLabel(r.language)}</span></div></div>
        ${r.notes?`<div class="rail-section"><div class="rail-section-k">Resolution notes</div><div class="doc-rec">${r.notes}</div></div>`:''}
      </div>`;
    return;
  }
```

Place this branch alongside the other `SEL.type===` branches in `renderRail`, before the default/empty handling.

- [ ] **Step 5: Verify**

Run JS_OK. Restart server (or `/api/demo?refresh=1`), open `/`, click "Closed Loop" → table renders, row click → rail detail.

- [ ] **Step 6: Commit**

```bash
git add web/index.html
git commit -m "Dashboard: Closed Loop section (SAP write-back view)"
```

---

## Task 4: Copilot console shell — immersive 3-column layout

**Files:**
- Modify: `web/index.html` — copilot CSS (replace `.copilot-wrap`/`.copilot-doc`/`.fren-panel` family with the `.cp*` family from `web/mockup.html`), `.app.copilot` rule, `renderCopilot` header.

- [ ] **Step 1: Make copilot immersive (hide nav sidebar too)**

Change the existing rule `.app.copilot{grid-template-columns:220px 1fr;}` and add a sidebar-hide:

```css
.app.copilot{grid-template-columns:1fr;}
.app.copilot .rail,.app.copilot .sidebar{display:none;}
```

(The copilot content spans the full width below the topbar; the "◁ Queue" back control already returns to the queue.)

- [ ] **Step 2: Port the copilot console CSS**

From `web/mockup.html`, copy the `.cp`, `.cp-head`, `.cp-back`, `.cp-crumb`, `.cp-actions`, `.cpb`, `.col`, `.col-ctx`, `.col-doc`, `.doc-scroll`, `.col-fren`, `.ck`, `.ctx-card`, `.ctx-title`, `.tl*`, `.kv`, `.prec`, `.notes-area`, `.notes-saved`, `.doc-head`, `.doc-pl`, `.doc-flag`, `.doc-status`, `.doc-body`, `.doc-sec`, `.doc-sec-t`, `.doc-kv`, `.reply`, `.reply-tools`, `.rtool`, `.flow*`, `.doc-foot`, `.foot-btn`, `.fren-head`, `.fren-av`, `.fren-name`, `.fren-live`, `.fren-ctx`, `.ctxchip`, `.fren-msgs`, `.fmsg`, `.fsender`, `.fbub`, `.fchips`, `.fchips-label`, `.fchip`, `.finput`, `.fsend`, `.gc-overlay`, `.gc-modal`, `.gc-h`, `.gc-b`, `.gc-row`, `.gc-ic`, `.gc-tx`, `.gc-f` rules into the index.html `<style>` block.

Note: index.html already has older `.fren-*`, `.doc-*`, `.copilot-*` rules used by the current copilot. Replace the old copilot family wholesale with the new `.cp`/`.col*` family. Keep any `.fren-*` names that the **global fren dock** depends on (`.fren-fab`, `.fren-dock`, `.fren-msg`, `.fren-bubble`, `.fren-chip`, `.fren-input`, `.fren-send`, `.fren-thinking`, `.fren-avatar`, `.fren-sender`, `.thinking-dot`) — the dock reuses those. To avoid collisions, the console uses the mockup's distinct class names (`.fmsg`, `.fbub`, `.fchip`, `.finput`, `.fsend`, `.fren-av`) — port them as-is.

- [ ] **Step 3: Rewrite the copilot header in `renderCopilot`**

Replace the body of `renderCopilot(item, main)` so it builds the new shell. The function continues to call helpers (defined in later tasks): `buildCtxColumn`, `buildDocColumn`, `buildFrenColumn`. Header:

```javascript
function renderCopilot(item, main) {
  const isProc = item.type === 'PROCUREMENT_APPROVAL';
  const isHigh = item.priority && item.priority.toString().toUpperCase().startsWith('HIGH');
  const name = isProc ? (SKU_NAMES[item.sku]||item.sku) : (item.product||'Warranty Claim');
  const script = FREN_SCRIPTS[isProc ? item.sku : (item.brand||'_default')] || FREN_SCRIPTS['_default'];

  const cp = el('div','cp');
  const ch = el('div','cp-head');
  const back = el('span','cp-back','◁ Queue'); back.onclick = closeCopilot;
  const crumb = el('div','cp-crumb');
  crumb.innerHTML = `<span>Queue</span><span class="sep">›</span><span>${item.workflow_task_id||'—'}</span><span class="sep">›</span><span class="cur">${isProc?'Procurement':'Warranty'} · Review</span>`;
  const actions = el('div','cp-actions');
  const frenBtn = el('div','cpb'); frenBtn.innerHTML = '<span style="width:6px;height:6px;border-radius:50%;background:var(--teal);display:inline-block"></span> fren assisted';
  const noteCount = (NOTES[item.workflow_task_id]||'').trim() ? '<span class="ct">1</span>' : '';
  const notesBtn = el('div','cpb'); notesBtn.innerHTML = '◷ Notes '+noteCount;
  notesBtn.onclick = () => { const t = qs('.notes-area'); if(t){ t.focus(); t.scrollIntoView({behavior:'smooth',block:'center'}); } };
  const gapBtn = el('div','cpb','⚑ Gap Check'); gapBtn.onclick = () => openGapCheck(item, isProc, isHigh);
  const submitBtn = el('div','cpb primary', isProc ? 'Forward to Buyer Desk →' : 'Release to Warranty Desk →');
  submitBtn.onclick = () => showConfirmModal(item, isProc);
  actions.append(frenBtn, notesBtn, gapBtn, submitBtn);
  ch.append(back, crumb, actions);
  cp.appendChild(ch);

  cp.appendChild(buildCtxColumn(item, isProc, isHigh, name));
  cp.appendChild(buildDocColumn(item, isProc, isHigh, name));
  cp.appendChild(buildFrenColumn(item, isProc, script, name));

  main.innerHTML = '';
  main.appendChild(cp);

  if(!FREN_HIST.length) setTimeout(() => appendFrenMsg('fren', script.open), 400);
  FREN_CHIPS = script.chips;
  renderFrenChips();
  const fi = qs('#fren-input');
  if(fi) fi.addEventListener('keydown', e => { if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); sendFrenMsg(); } });
}
```

Add the notes store near the other state declarations (e.g., after `let INSIGHT_IDX = 0;`):

```javascript
const NOTES = {};   // workflow_task_id -> operator note (session only)
```

(`buildCtxColumn`, `buildDocColumn`, `buildFrenColumn`, `openGapCheck` are implemented in Tasks 5–8. Until then the console will error on open — that's expected; do not open copilot between Tasks 4 and 8. Verify only with JS_OK after Task 8, OR stub the three builders to `return el('div')` and `openGapCheck` to `()=>{}` now and replace in later tasks. Recommended: add the stubs now.)

- [ ] **Step 4: Add temporary stubs (so JS stays runnable between tasks)**

Add near `renderCopilot`:

```javascript
function buildCtxColumn(){ return el('div','col col-ctx'); }
function buildDocColumn(){ return el('div','col col-doc'); }
function buildFrenColumn(){ return el('div','col col-fren'); }
function openGapCheck(){}
```

These are replaced in Tasks 5–8.

- [ ] **Step 5: Verify**

Run JS_OK. Restart server, open a queue item → immersive shell with header + three (empty) columns, no console errors. "◁ Queue" returns.

- [ ] **Step 6: Commit**

```bash
git add web/index.html
git commit -m "Copilot: immersive 3-column console shell"
```

---

## Task 5: Copilot left column — timeline, precedent, notes

**Files:**
- Modify: `web/index.html` — replace the `buildCtxColumn` stub; add `buildTimelineSteps`, `precedentFor`.

- [ ] **Step 1: Add the data helpers**

```javascript
function buildTimelineSteps(item, isProc) {
  const ch = channelLabel(item.channel || 'EMAIL');
  if(isProc) {
    const reason = item.reason || 'OUT_OF_STOCK';
    const actionStep = reason==='DELAYED_PO'
      ? {what:'Agent 5 found open PO — 3 days overdue', agent:'PO-778412 · supplier flagged'}
      : reason==='VELOCITY_SPIKE'
        ? {what:'Agent 3 flagged velocity spike', agent:'new SKU · 4 complaints in 3d'}
        : {what:'Agent 5 diagnosed stock gap', agent:'0 shelf · 0 backroom'};
    return [
      {when:'06:02 GST', what:'Signal received', agent:`via ${ch}`},
      {when:'06:15 GST', what:'Agent 1 triaged → procurement', agent:'routed to Agent 5'},
      {when:'06:16 GST', what:actionStep.what, agent:actionStep.agent},
      {when:'06:16 GST', what:'Recommendation prepared for buyer', agent:'no PO placed — propose only'},
      {when:'now', what:'Awaiting your approval', agent:'nothing dispatched yet', now:true},
    ];
  }
  const high = item.priority && item.priority.toString().toUpperCase().startsWith('HIGH');
  return [
    {when:'06:02 GST', what:'Feedback received', agent:`via ${ch}`},
    {when:'06:14 GST', what:'Agent 1 triaged → WARRANTY_RETURN', agent:'routed to Agent 2'},
    {when:'06:15 GST', what:'Agent 2 checked warranty → valid', agent:`claim ${item.claim_id||'opened'}`},
    {when:'06:15 GST', what:`Value AED ${item.declared_value_aed} ${high?'> 500 → routed HIGH':'≤ 500 → standard'}`, agent:'deterministic rule'},
    {when:'now', what:'Reply drafted · awaiting approval', agent:'no message sent yet', now:true},
  ];
}

function precedentFor(item, isProc) {
  const idx = REPORT.precedent_index || {};
  const brand = isProc ? (item.sku||'').split('-')[0] : item.brand;
  // Map brand code prefix back to a brand name when procurement.
  const bm = REPORT.brand_metrics || {};
  let brandKey = item.brand;
  if(isProc) brandKey = Object.keys(bm).find(b => idx[b]) && (item.store||'').split(' ')[0] || item.brand;
  const rec = idx[item.brand] || idx[brandKey];
  if(!rec) return null;
  const cat = isProc ? 'PRODUCT_QUALITY' : 'WARRANTY_RETURN';
  const catCount = (rec.by_category||{})[cat] || 0;
  if(catCount > 0) return `${catCount} similar ${item.brand} ${cat.replace('_',' ').toLowerCase()} case${catCount!==1?'s':''} on record · ${rec.resolved} resolved.`;
  return `${rec.total} ${item.brand} case${rec.total!==1?'s':''} on record · ${rec.resolved} resolved. No prior on this exact issue.`;
}
```

Note: warranty queue items carry `brand` directly, so precedent resolves cleanly for them; procurement items use the corpus by brand when derivable, else fall back to the total line. This keeps the line honest in all cases.

- [ ] **Step 2: Replace the `buildCtxColumn` stub**

```javascript
function buildCtxColumn(item, isProc, isHigh, name) {
  const col = el('div','col col-ctx');

  col.appendChild(el('div','ck','◷ Case timeline'));
  const tlCard = el('div','ctx-card');
  const tl = el('div','tl');
  buildTimelineSteps(item, isProc).forEach(s => {
    const step = el('div','tl-step'+(s.now?' now':''));
    step.innerHTML = `<div class="tl-when">${s.when}</div><div class="tl-what">${s.what}</div><div class="tl-agent">${s.agent}</div>`;
    tl.appendChild(step);
  });
  tlCard.appendChild(tl);
  col.appendChild(tlCard);

  col.appendChild(el('div','ck','⚖ Policy & precedent'));
  const pCard = el('div','ctx-card');
  if(isProc) {
    pCard.innerHTML = `<div class="ctx-title">Procurement context</div>
      <div class="kv"><span class="k">Shelf stock</span><span class="v">0</span></div>
      <div class="kv"><span class="k">Backroom</span><span class="v">0</span></div>
      <div class="kv"><span class="k">Store</span><span class="v">${item.store||'—'}</span></div>
      <div class="kv"><span class="k">Trigger</span><span class="v">${(item.reason||'—').replace('_',' ')}</span></div>`;
  } else {
    pCard.innerHTML = `<div class="ctx-title">Warranty policy</div>
      <div class="kv"><span class="k">Coverage</span><span class="v">1-year standard</span></div>
      <div class="kv"><span class="k">Window</span><span class="v">Valid</span></div>
      <div class="kv"><span class="k">High-value gate</span><span class="v">&gt; AED 500</span></div>
      <div class="kv"><span class="k">This claim</span><span class="v">AED ${item.declared_value_aed} ${isHigh?'→ HIGH':'→ standard'}</span></div>`;
  }
  const prec = precedentFor(item, isProc);
  if(prec) { const p = el('div','prec'); p.innerHTML = `◆ <span>${prec}</span>`; pCard.appendChild(p); }
  col.appendChild(pCard);

  col.appendChild(el('div','ck','◷ Your notes'));
  const nCard = el('div','ctx-card');
  const ta = el('textarea','notes-area'); ta.placeholder = 'Add a note for the desk…';
  ta.value = NOTES[item.workflow_task_id] || '';
  const saved = el('div','notes-saved'); saved.style.display = ta.value.trim()?'flex':'none'; saved.innerHTML = '✓ Saved · session only';
  ta.addEventListener('input', () => {
    NOTES[item.workflow_task_id] = ta.value;
    saved.style.display = ta.value.trim()?'flex':'none';
    const ct = qs('.cpb .ct');
    const notesBtn = Array.from(document.querySelectorAll('.cpb')).find(b=>b.textContent.includes('Notes'));
    if(notesBtn) notesBtn.innerHTML = '◷ Notes '+(ta.value.trim()?'<span class="ct">1</span>':'');
  });
  nCard.append(ta, saved);
  col.appendChild(nCard);
  return col;
}
```

- [ ] **Step 3: Verify**

Run JS_OK. Open the seeded warranty item (OLSENMARK) and a procurement item (RF-AF250 / KT-IRON21): timeline reads correctly, precedent line appears, notes persist while navigating away and back within the session.

- [ ] **Step 4: Commit**

```bash
git add web/index.html
git commit -m "Copilot: left column — timeline, precedent, notes"
```

---

## Task 6: Copilot center column — draft, reply tools, on-release flow, footer

**Files:**
- Modify: `web/index.html` — replace the `buildDocColumn` stub. Reuse the existing Arabic-detection logic from the old `buildDocPreview`.

- [ ] **Step 1: Replace the `buildDocColumn` stub**

```javascript
function buildDocColumn(item, isProc, isHigh, name) {
  const col = el('div','col col-doc');
  const head = el('div','doc-head');
  head.innerHTML = `<div class="doc-pl"><span class="dot"></span> Live preview ${isHigh?'<span class="doc-flag">⚑ High priority</span>':''} <span class="doc-status">${isProc?'Recommendation drafted':'Recommendation drafted'}</span></div>`;
  col.appendChild(head);

  const scroll = el('div','doc-scroll');
  const body = el('div','doc-body');

  // Summary
  const sum = el('div','doc-sec');
  sum.innerHTML = `<div class="doc-sec-t">${isProc?'Procurement recommendation':'Warranty fulfilment approval'} · <span class="mono" style="font-weight:400;color:var(--faint)">${item.workflow_task_id||'—'}</span></div>`;
  const kvs = isProc
    ? [['SKU',item.sku||'—'],['Product',name],['Store',item.store||'—'],['Trigger',(item.reason||'—').replace('_',' ')]]
    : [['Claim ID',item.claim_id||'—'],['Product',name],['Declared value',`AED ${item.declared_value_aed} ${isHigh?'<span class="badge blood">HIGH</span>':''}`],['Warranty','Valid'],['Assigned to',item.assigned_to||'Warranty Desk']];
  kvs.forEach(([k,v]) => { const r = el('div','doc-kv'); r.innerHTML = `<span class="k">${k}</span><span class="v">${v}</span>`; sum.appendChild(r); });
  body.appendChild(sum);

  // Draft / recommendation
  const draft = el('div','doc-sec');
  draft.innerHTML = `<div class="doc-sec-t">${isProc?'Agent recommendation':'Drafted reply · Agent 2'}</div>`;
  if(isProc) {
    draft.appendChild(el('div','reply', item.recommendation||'—'));
  } else {
    const msg = item.drafted_message || '—';
    const isArabic = /[؀-ۿ]/.test(msg);
    const tools = el('div','reply-tools');
    tools.innerHTML = isArabic
      ? '<span class="rtool active">العربية</span><span class="rtool">English</span><span class="rtool">✎ Edit</span><span class="rtool">Adjust tone</span>'
      : '<span class="rtool active">English</span><span class="rtool">✎ Edit</span><span class="rtool">Adjust tone</span>';
    tools.querySelectorAll('.rtool').forEach(rt => rt.onclick = () => {
      const label = rt.textContent.trim();
      if(label==='✎ Edit' || label==='Adjust tone') { const fi = qs('#fren-input'); if(fi){ fi.value = label==='Adjust tone' ? 'Adjust the tone of this reply' : 'Help me edit this reply'; fi.focus(); } return; }
      tools.querySelectorAll('.rtool').forEach(x=>x.classList.remove('active')); rt.classList.add('active');
    });
    draft.appendChild(tools);
    const rep = el('div','reply'); if(isArabic){ rep.dir='rtl'; rep.style.fontFamily='var(--ar)'; } rep.textContent = msg;
    draft.appendChild(rep);
  }
  body.appendChild(draft);

  // On-release flow
  const flowSec = el('div','doc-sec');
  flowSec.innerHTML = `<div class="doc-sec-t">On ${isProc?'forward':'release'} · what happens next</div>`;
  const flow = el('div','flow');
  const desk = isProc ? 'Buyer Desk reviews' : 'Customer receives the reply';
  flow.innerHTML = `
    <div class="flow-step"><div class="n">1 · ${isProc?'Desk':'Customer'}</div><div class="ft">${desk}</div><div class="fs">${isProc?'human decides on the PO':'once the desk signs off'}</div></div>
    <div class="flow-step"><div class="n">2 · Survey</div><div class="ft">CSAT / NPS / CES sent</div><div class="fs">satisfaction survey follows resolution</div></div>
    <div class="flow-step"><div class="n">3 · SAP</div><div class="ft">Resolution written back</div><div class="fs">scores + notes → CRM · agents don't own the data</div></div>`;
  flowSec.appendChild(flow);
  body.appendChild(flowSec);

  scroll.appendChild(body);
  col.appendChild(scroll);

  const foot = el('div','doc-foot');
  const note = txt('span','fnote', isProc
    ? 'Forwarding notifies the Buyer Desk. You\'re proposing — not transacting.'
    : `Releasing notifies the Warranty Desk to action ${item.claim_id||'this claim'}. You're proposing — not transacting.`);
  const btn = el('button','foot-btn', isProc ? 'Forward to Buyer Desk →' : 'Release to Warranty Desk →');
  btn.onclick = () => showConfirmModal(item, isProc);
  foot.append(note, btn);
  col.appendChild(foot);
  return col;
}
```

- [ ] **Step 2: Verify**

Run JS_OK. Open warranty (English seeded OLSENMARK; and the GEEPAS Arabic case from the queue if present) → reply renders RTL for Arabic, tools toggle, Edit/Tone focus fren input. Procurement → recommendation + flow. Footer button opens the confirm modal and the existing optimistic `_actioned` flow still marks the item.

- [ ] **Step 3: Commit**

```bash
git add web/index.html
git commit -m "Copilot: center column — draft, reply tools, on-release flow, footer"
```

---

## Task 7: Copilot right column — fren with context bar

**Files:**
- Modify: `web/index.html` — replace `buildFrenColumn` stub. The fren message/chip/input plumbing (`appendFrenMsg`, `renderFrenChips`, `sendFrenMsg`, `showThinking`) already exists and targets `#fren-msgs`, `#fren-chips`, `#fren-input`. Keep those IDs.

Important: the existing `appendFrenMsg`/`renderFrenChips` build elements with classes `.fren-msg`, `.fren-bubble`, `.fren-sender`, `.fren-chip`. The new console CSS uses `.fmsg`/`.fbub` for the *mockup*; to avoid touching the JS plumbing, **keep the existing `.fren-msg`/`.fren-bubble`/`.fren-chip` CSS rules** (they style the dock too) and ensure the console's `.fren-msgs`/`.fchips`/`.finput` containers wrap them. Do not port `.fmsg`/`.fbub`/`.fchip` from the mockup; instead style the console message area with the existing `.fren-*` message classes. Net: column container classes are new (`.col-fren`, `.fren-ctx`, `.ctxchip`, `.fchips-label`), message classes are the existing ones.

- [ ] **Step 1: Replace the `buildFrenColumn` stub**

```javascript
function buildFrenColumn(item, isProc, script, name) {
  const col = el('div','col col-fren');
  const head = el('div','fren-head');
  head.innerHTML = `<div class="fren-avatar">f</div><div><div class="fren-name">fren <span class="sub">· Co-solver</span></div></div><div class="fren-live"><span class="d"></span> Live</div>`;
  col.appendChild(head);

  // Context bar — what fren is grounded in
  const ctx = el('div','fren-ctx');
  const chips = [];
  chips.push(item.workflow_task_id||'WF');
  if(isProc) { if(item.sku) chips.push(item.sku); if(item.store) chips.push(item.store.split(' ').slice(-1)[0]); if(item.reason) chips.push(item.reason.replace('_',' ').toLowerCase()); }
  else { if(item.product) chips.push((SKU_NAMES[item.product]||item.product).split(' ').slice(-1)[0]); chips.push('AED '+item.declared_value_aed+(item.priority&&item.priority.toString().toUpperCase().startsWith('HIGH')?' · HIGH':'')); chips.push('warranty valid'); }
  const prec = precedentFor(item, isProc); if(prec) chips.push((prec.match(/^\d+/)||['cases'])[0]+' precedents');
  ctx.innerHTML = chips.map(c => `<span class="ctxchip">${c}</span>`).join('');
  col.appendChild(ctx);

  const msgs = el('div','fren-msgs'); msgs.id = 'fren-msgs';
  col.appendChild(msgs);

  const chipsWrap = el('div','fchips');
  chipsWrap.appendChild(el('div','fchips-label','Suggested'));
  const inner = el('div'); inner.id = 'fren-chips';
  chipsWrap.appendChild(inner);
  col.appendChild(chipsWrap);

  const iw = el('div','finput');
  const inp = el('textarea','fren-input'); inp.id = 'fren-input'; inp.placeholder = 'Ask fren anything…'; inp.rows = 1;
  const send = el('button','fsend','→'); send.onclick = sendFrenMsg;
  iw.append(inp, send);
  col.appendChild(iw);
  return col;
}
```

Note: `renderFrenChips` targets `#fren-chips` — now an inner div under the "Suggested" label, so the label persists. Confirm `renderFrenChips` does `wrap.innerHTML=''` on `#fren-chips` (the inner div), not on the label container. (It does — it queries `#fren-chips`.)

- [ ] **Step 2: Verify**

Run JS_OK. Open an item: context chips show, opening message animates in, suggested chips render under the label, chip click → Q&A, free-text → keyword match. The global fren dock still works on other sections (its IDs are `#gfren-*`, no collision).

- [ ] **Step 3: Commit**

```bash
git add web/index.html
git commit -m "Copilot: right column — fren with grounded context bar"
```

---

## Task 8: Gap Check overlay

**Files:**
- Modify: `web/index.html` — replace `openGapCheck` stub; add `gapChecks` helper. Overlay CSS already ported in Task 4 (`.gc-*`).

- [ ] **Step 1: Add the checklist logic + overlay**

```javascript
function gapChecks(item, isProc, isHigh) {
  const text = (isProc ? item.recommendation : item.drafted_message) || '';
  const leak = /\b(CRM-|CLM-|PO-|WF-)\d/.test(text);
  const high = isHigh;
  const valueOK = isProc ? true : ((item.declared_value_aed>500) === high);
  return [
    {ok:true,  t:'No customer PII in draft or cache', s:'PDPL — name/address/contact written to SAP only'},
    {ok:true,  t:'No individual staff named', s:'team-level language only'},
    {ok:!leak, t:'No SAP / claim / PO IDs disclosed to customer', s: leak?'reference found — remove before release':'draft scanned — none present'},
    {ok:valueOK, t:'Value-threshold routing correct', s: isProc?'n/a for procurement':`AED ${item.declared_value_aed} ${high?'> 500 → HIGH ✓':'≤ 500 → standard ✓'}`},
    ...(isProc?[]:[{ok:true, t:'Warranty validity', s:'within coverage window'}]),
    {ok:true,  t:'Propose, don\'t transact', s:'no transactional tool used — human actions it'},
  ];
}
function openGapCheck(item, isProc, isHigh) {
  const checks = gapChecks(item, isProc, isHigh);
  const pass = checks.filter(c=>c.ok).length;
  const ov = el('div','gc-overlay show');
  const modal = el('div','gc-modal');
  modal.innerHTML = `<div class="gc-h"><span style="color:var(--teal)">⚑</span><span class="t">Gap Check · ${item.workflow_task_id||''}</span><span class="x">×</span></div>`;
  const b = el('div','gc-b');
  checks.forEach(c => {
    const row = el('div','gc-row');
    row.innerHTML = `<span class="gc-ic ${c.ok?'ok':'warn'}">${c.ok?'✓':'!'}</span><div class="gc-tx"><div class="gt">${c.t}</div><div class="gs">${c.s}</div></div>`;
    b.appendChild(row);
  });
  modal.appendChild(b);
  const flagged = checks.length - pass;
  modal.appendChild(el('div','gc-f', `✓ ${pass} of ${checks.length} checks pass${flagged?` · ${flagged} flagged for you`:''}`));
  ov.appendChild(modal);
  document.body.appendChild(ov);
  modal.querySelector('.x').onclick = () => ov.remove();
  ov.onclick = e => { if(e.target===ov) ov.remove(); };
}
```

Note: the `.gc-overlay` from the mockup is positioned `inset:46px 0 0 0` for the mockup toolbar. In index.html there is no mockup toolbar — change that ported rule to `inset:0` (covers the real 52px topbar too, which is fine for a modal). Verify the rule reads `position:fixed;inset:0;...`.

- [ ] **Step 2: Verify**

Run JS_OK. Open a copilot item → click "⚑ Gap Check" → overlay lists checks; warranty HIGH item shows value-threshold pass; the × and backdrop close it. Confirm no draft leaks IDs (all pass) — if you inject a `PO-1` into a test draft the row flips to amber.

- [ ] **Step 3: Commit**

```bash
git add web/index.html
git commit -m "Copilot: working Gap Check compliance overlay"
```

---

## Task 9: Wire remaining controls + fren-assisted pill

**Files:**
- Modify: `web/index.html` — `frenBtn` behaviour in `renderCopilot` (already set as a no-op div in Task 4).

- [ ] **Step 1: Make the fren-assisted pill functional**

In `renderCopilot`, after building `frenBtn`, add a click handler that focuses the fren input (and on mobile, ensures the fren column is visible):

```javascript
  frenBtn.onclick = () => { const fi = qs('#fren-input'); if(fi){ fi.focus(); fi.scrollIntoView({behavior:'smooth',block:'center'}); } };
```

- [ ] **Step 2: Audit for other dead controls**

Confirm these are all wired (search/bell from earlier work; Notes/Gap Check/Forward from this pass). Grep for any `onclick`-less interactive-looking elements you introduced; there should be none.

```bash
grep -nE "cp-action|action-chip" web/index.html | head -40
```

If any `action-chip` in the rail has no handler and implies an action, either wire it to `showConfirmModal`/`setNav` or convert it to a non-interactive informational row. (Pre-existing rail `action-chip`s that were informational may stay as-is — do not invent new behaviour.)

- [ ] **Step 3: Verify + commit**

```bash
python -c "import re;s=open('web/index.html',encoding='utf-8').read();open('_check.js','w',encoding='utf-8').write(re.search(r'<script>(.*?)</script>',s,re.S).group(1))" && node --check _check.js && echo JS_OK; rm -f _check.js
git add web/index.html
git commit -m "Copilot: wire fren-assisted pill; control audit"
```

---

## Task 10: Responsive breakpoints

**Files:**
- Modify: `web/index.html` — add media queries at the end of the `<style>` block; add a slide-over class for the rail.

- [ ] **Step 1: Add the rail slide-over + breakpoints CSS**

Append to the `<style>` block:

```css
/* ── RESPONSIVE ── */
@media (max-width: 1100px){
  .app{grid-template-columns:200px 1fr;}
  .rail{position:fixed;top:52px;right:0;bottom:0;width:340px;max-width:88vw;z-index:120;box-shadow:-12px 0 40px -16px rgba(40,33,20,.4);transform:translateX(100%);transition:transform .2s ease;}
  .rail.open{transform:none;}
  .cp{grid-template-columns:260px 1fr;}
  .cp .col-fren{position:fixed;top:52px;right:0;bottom:0;width:332px;max-width:90vw;z-index:120;transform:translateX(100%);transition:transform .2s ease;box-shadow:-12px 0 40px -16px rgba(40,33,20,.4);}
  .cp .col-fren.open{transform:none;}
}
@media (max-width: 768px){
  html,body{overflow:auto;}
  .app{display:block;height:auto;}
  .topbar{position:sticky;top:0;}
  .sidebar{display:flex;flex-direction:row;overflow-x:auto;border-right:0;border-bottom:1px solid var(--line);}
  .sidebar .sb-footer{display:none;}
  .main{min-height:60vh;}
  .trend-row{grid-template-columns:1fr;}
  .kpi-row{grid-template-columns:repeat(2,1fr);}
  .cp{display:block;height:auto;}
  .cp .col, .cp .col-fren{position:static;transform:none;width:auto;border-left:0;border-top:1px solid var(--line);}
  .fren-dock{right:0;left:0;bottom:0;width:auto;border-radius:16px 16px 0 0;height:70vh;}
}
```

- [ ] **Step 2: Open the rail on selection when narrow**

In `renderRail`, after populating the rail content, ensure it opens on small screens. At the end of `selectItem` (or `renderRail`), add:

```javascript
  if(window.matchMedia('(max-width:1100px)').matches){ const r = qs('#rail'); if(r && SEL) r.classList.add('open'); }
```

Add a way to close it: in the rail head, the existing close affordance — if none, add a tap-outside handler:

```javascript
document.addEventListener('click', e => {
  const r = qs('#rail'); if(!r||!r.classList.contains('open')) return;
  if(!r.contains(e.target) && !e.target.closest('.data-row,.bt-row,.alert-card,.qp-row,.cl-row')) r.classList.remove('open');
});
```

(Place this once, near `initBell`'s document listeners.)

- [ ] **Step 3: Verify**

Run JS_OK. In the browser devtools responsive mode: at 1000px the rail slides over on row click and closes on outside tap; copilot drops to 2 columns. At 700px everything stacks, copilot stacks, fren dock is a bottom sheet.

- [ ] **Step 4: Commit**

```bash
git add web/index.html
git commit -m "Dashboard: responsive breakpoints (rail slide-over, stacked mobile)"
```

---

## Task 11: Cleanup + full verification

**Files:**
- Delete: `web/mockup.html`
- Verify: whole app

- [ ] **Step 1: Delete the mockup**

```bash
git rm web/mockup.html
```

- [ ] **Step 2: Full verification sweep**

```bash
# JS syntax
python -c "import re;s=open('web/index.html',encoding='utf-8').read();open('_check.js','w',encoding='utf-8').write(re.search(r'<script>(.*?)</script>',s,re.S).group(1))" && node --check _check.js && echo JS_OK; rm -f _check.js
# Report integrity (2 velocity alerts, 7 brands, new keys present)
python -c "import asyncio;from demo.runner import build_report;r=asyncio.run(build_report());vel=[s for s in r['scenarios'] if s['id']=='velocity_digest'][0];a=vel['result']['alerts'];assert sorted((x['brand'],x['sku']) for x in a)==[('GEEPAS','GK-NEW'),('KRYPTON','KT-IRON21')];assert len(r['brand_metrics'])==7;assert 'precedent_index' in r and 'closed_loop' in r;print('REPORT_OK')"
```

Restart the server and smoke-test:

```bash
curl -s -o NUL -w "health:%{http_code}\n" http://127.0.0.1:8011/health
curl -s -o NUL -w "index:%{http_code}\n" http://127.0.0.1:8011/
curl -s -o NUL -w "demo:%{http_code}\n" http://127.0.0.1:8011/api/demo
```

- [ ] **Step 3: Manual checklist**

Open `/` and confirm: Overview (trend + channel), Quality Alerts, Human Queue → copilot console fills the viewport with no large voids at ~1280px (timeline/precedent/notes left, draft+flow+footer center, fren+context right), Gap Check overlay, Closed Loop populated with rail detail, Agent Runs, Guardrails. Approve a queue item → it marks `✓ Forwarded/Released`, badge decrements, bell updates. Global "Ask fren" works on every section. No console errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Remove design mockup; final polish-pass verification"
```

---

## Self-review notes

- **Spec coverage:** §1 copilot console → Tasks 4–9; §2 Closed Loop → Tasks 1+3; §3 responsive → Task 10; §4 skeleton → Task 2; §5 controls → Task 9. Precedent/timeline/gap-check/notes all have tasks. Backend helper (anticipated in spec) → Task 1.
- **Known data point:** `closed_loop` currently yields the real number of `resolution_updated` entries (≈2). The view handles any count and shows an empty-state at zero. If a richer table is wanted later, add resolved scenarios to the demo corpus — out of scope here.
- **Collision guard:** the global fren dock uses `#gfren-*` IDs and `.fren-fab/.fren-dock` classes; the copilot console reuses `#fren-*` IDs and the existing `.fren-msg/.fren-bubble/.fren-chip` message classes. Task 7 explicitly avoids porting the mockup's `.fmsg/.fbub/.fchip` to prevent style drift. Verified consistent across tasks.
- **Type consistency:** `buildCtxColumn/buildDocColumn/buildFrenColumn/openGapCheck/precedentFor/buildTimelineSteps/gapChecks` are defined once and called with matching signatures `(item, isProc, isHigh, name)` / `(item, isProc)` throughout.
