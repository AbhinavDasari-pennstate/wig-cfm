# Immersive Run View + Human Intervene Loop — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the clipping 320px Agent-Runs rail with an immersive run view (Trace + Artifacts + on-demand fren), let a human **Intervene** on a closed run to route a drafted correction back through the Human Queue, and ship three audit fixes.

**Architecture:** Frontend-only. All run data already ships in `/api/demo` scenarios; interventions are client-side session state (same pattern as the queue's optimistic `_actioned`). New `RUNVIEW` state runs parallel to `COPILOT`, reusing the existing `.copilot` shell class on `#app` (hides sidebar + rail, full-width `#main`). Everything lives in the single static file `web/index.html`. No backend changes.

**Tech Stack:** Vanilla JS + inline CSS in `web/index.html`, design tokens (`--paper`, `--teal`, `--brass`, `--blood`, …), served by FastAPI (`orchestrator/main.py`).

**Testing note (read before starting):** This codebase has **no JS test harness** — verification is the established pattern: `node --check` on the extracted inline script after every change, plus a manual visual check, plus a final server smoke. Backend Python is untouched by this plan, so `build_report` determinism (2 alerts, 7 brands) cannot regress; we smoke it once at the end. There is no TDD-style failing-test-first step because there is nothing to run unit tests against; the "verify" step in each task is `node --check` + the described manual check.

**Standing constraints (do not violate):**
- Propose, don't transact. Interventions are proposals a human signs off; no transactional capability is added.
- No staff named in customer-facing text; no SAP/PO IDs shown to customers; PDPL (intervention `request`/notes are operator text, session-only — never written to agent memory).
- Commits: branch is `master` (Render watches it). **Do NOT add a `Co-Authored-By: Claude` line** — the user removed it earlier.

---

## Reusable helper reference (already defined in `web/index.html`)

These exist and are used by the new code — do not redefine them:
- `el(tag, cls, html)` — create element; `txt(tag, cls, text)` — create element with textContent; `qs(sel)` — `querySelector`.
- `agentNums(stages)` → array of agent numbers; `outcomeFor(sc)` → `{label, cls}`; `channelLabel(c)`, `langLabel(l)`.
- `refreshBadges()` — updates sidebar badges + bell from `pendingQueue()`; `pendingQueue()` → `human_queue` filtered by `!_actioned`.
- `toast(msg)`, `appendFrenMsg(role,text)`, `sendFrenMsg()`, `renderFrenChips()`, `frenMatch(text)`, `showThinking()`/`hideThinking()`.
- `openCopilot(item)` / `closeCopilot()` — set/clear `COPILOT` and the `.copilot` class.
- Globals: `COPILOT`, `SEL`, `ACTIVE`, `FREN_HIST`, `FREN_CHIPS`, `REPORT` (the loaded report; queue lives at `REPORT.snapshot.human_queue`, scenarios at `REPORT.scenarios`).

## Verification command (used in every task)

Run this from the repo root after each change. It extracts the inline script and syntax-checks it; **no output = pass** (exit 0):

```powershell
$h = Get-Content web/index.html -Raw; $m = [regex]::Match($h, '(?s)<script>\s*"use strict";(.*?)</script>'); Set-Content tmp_check.js $m.Groups[1].Value -Encoding utf8; node --check tmp_check.js; Remove-Item tmp_check.js
```

Bash equivalent (if using the Bash tool):

```bash
node -e 'const fs=require("fs");const h=fs.readFileSync("web/index.html","utf8");const m=h.match(/<script>\s*"use strict";([\s\S]*?)<\/script>/);fs.writeFileSync("tmp_check.js",m[1]);' && node --check tmp_check.js && rm tmp_check.js
```

---

## File structure

Only one file changes: `web/index.html`. New code is grouped:
- **CSS:** one block inserted immediately before `</style>` (line ~584).
- **State:** `RUNVIEW`, `RV_FREN_OPEN` added beside the existing `let COPILOT = null;` (line ~710).
- **Run view:** `openRunView`/`closeRunView`, `renderRunView`, `buildRunTrace`, `buildTraceStage`, `parseScores`, `buildRunArtifacts` — placed in the `/* ─── COPILOT ─── */` region (after `closeCopilot`, ~line 1458).
- **Intervene loop:** `RV_FREN_OPEN`, `toggleIntervene`, `buildIntervenePanel`, `initIntervene`, `ivAppend`, `ivThinking`, `interveneChips`, `renderIvChips`, `deskForKind`, `draftForKind`, `ivSubmit`, `appendTraceStage`, `markReopened` — placed right after the run-view functions.
- **Copilot variant:** `renderInterventionCopilot`, `showInterventionConfirm` — placed after `showConfirmModal` (~line 1795).
- **Audit fixes:** small edits at the brand-table row (~1193), a new `initUserMenu()` called from `boot()` (~778), and the `.rv-tool` CSS (in the run-view CSS block).
- Delete `web/mockup.html` at the end.

A `dist/` directory and `web/fonts/` exist untracked from earlier work — ignore them; they are not part of this plan.

---

## Task 1: Audit fix — neutral brand-table trend arrow

**Files:** Modify `web/index.html` (~line 1193, inside `viewOverview`'s brand-table loop).

The brand-table row renders the NPS trend arrow with `class="arrow ${tr.cls}"`. The fix makes the glyph a neutral faint colour so a still-negative-but-improved NPS no longer shows a green ↑ beside a red value; the value cell's red/green stays the single health signal.

- [ ] **Step 1: Replace the brand-table trend cell**

Find this line (inside the `brands.forEach(([name, m]) => {` loop):

```javascript
      <div class="bt-trend"><span class="arrow ${tr.cls}" style="font-weight:700">${tr.sym}</span><span style="font-size:11px;color:var(--faint);margin-left:3px">${tr.note}</span></div>
```

Replace with (force the glyph to `var(--faint)`, drop the `tr.cls` colour dependency):

```javascript
      <div class="bt-trend"><span class="arrow" style="font-weight:700;color:var(--faint)">${tr.sym}</span><span style="font-size:11px;color:var(--faint);margin-left:3px">${tr.note}</span></div>
```

- [ ] **Step 2: Verify syntax**

Run the verification command. Expected: no output (pass).

- [ ] **Step 3: Manual check**

Start the server if not running (`uvicorn orchestrator.main:app --port 8011`), open `http://127.0.0.1:8011/`, Overview → brand table. The DELCASA (and any improved-but-negative) NPS row now shows a grey arrow + grey delta; the NPS value itself is still red. KPI-tile arrows at the top are unchanged (still green/red).

- [ ] **Step 4: Commit**

```bash
git add web/index.html
git commit -m "fix: neutralise brand-table trend arrow colour"
```

---

## Task 2: Audit fix — wire the `tb-user` avatar to a popover

**Files:** Modify `web/index.html` — add `initUserMenu()` (near `initBell`, ~line 1004) and call it from `boot()` (~line 778).

The top-right avatar/name has `cursor:pointer` (CSS line 71) but no handler. Add a click-toggled popover that closes on outside click, matching the bell pattern.

- [ ] **Step 1: Add the `initUserMenu` function**

Insert immediately **after** the `initBell` function (which ends with `document.addEventListener('click', e => { const p = qs('.bell-pop'); if(p && !bell.contains(e.target)) p.remove(); });\n}` at ~line 1025):

```javascript
function initUserMenu() {
  const u = qs('.tb-user');
  if(!u) return;
  u.style.position = 'relative';
  u.onclick = e => {
    e.stopPropagation();
    const existing = qs('.user-pop');
    if(existing) { existing.remove(); return; }
    const pop = el('div','user-pop');
    pop.innerHTML = `
      <div class="up-head">Ahmed Al-Mansoori</div>
      <div class="up-row"><span class="k">Role</span><span class="v">Dept Head</span></div>
      <div class="up-row"><span class="k">Scope</span><span class="v">All Brands</span></div>
      <div class="up-row"><span class="k">Session</span><span class="v">demo · no real auth</span></div>`;
    u.appendChild(pop);
  };
  document.addEventListener('click', e => { const p = qs('.user-pop'); if(p && !u.contains(e.target)) p.remove(); });
}
```

- [ ] **Step 2: Call it from `boot()`**

Find this block (~line 777):

```javascript
  initSearch();
  initBell();
  mountFren();
```

Replace with:

```javascript
  initSearch();
  initBell();
  initUserMenu();
  mountFren();
```

- [ ] **Step 3: Add popover CSS**

Insert this immediately **before** `</style>` (~line 584):

```css
/* ── USER MENU ── */
.user-pop{position:absolute;top:38px;right:0;width:230px;background:var(--card);border:1px solid var(--line2);border-radius:10px;box-shadow:var(--sh2);z-index:300;overflow:hidden;padding:4px 0;}
.user-pop .up-head{font-family:var(--serif);font-size:13.5px;font-weight:600;color:var(--ink);padding:10px 14px 8px;border-bottom:1px solid var(--line);}
.user-pop .up-row{display:flex;justify-content:space-between;gap:10px;font-size:11.5px;padding:6px 14px;}
.user-pop .up-row .k{color:var(--faint);}
.user-pop .up-row .v{color:var(--ink2);font-weight:500;}
```

- [ ] **Step 4: Verify syntax**

Run the verification command. Expected: no output (pass).

- [ ] **Step 5: Manual check**

Reload. Click the avatar/name top-right → popover opens with the four lines. Click elsewhere → it closes. Click the avatar again → toggles closed.

- [ ] **Step 6: Commit**

```bash
git add web/index.html
git commit -m "fix: wire tb-user avatar to a session-info popover"
```

---

## Task 3: Immersive run view (state, render, trace, artifacts)

**Files:** Modify `web/index.html` — add state (~line 710), render branch (~line 1088), run-view functions (after `closeCopilot`, ~line 1458), CSS (before `</style>`), wire the run-list click (~line 1854), guard nav toggle (~line 790).

This is the core view. Tool chips wrap here (**audit fix #1**). The Intervene button is present but its handler is added in Task 4 — it is wired through a `typeof` guard so it is safe (a no-op) until then.

- [ ] **Step 1: Add the `RUNVIEW` state global**

Find (~line 710):

```javascript
let COPILOT = null;   // queue item
```

Replace with:

```javascript
let COPILOT = null;   // queue item
let RUNVIEW = null;   // scenario being viewed immersively
```

- [ ] **Step 2: Add the render branch**

Find (~line 1088, inside `render(key)`):

```javascript
  if(COPILOT) { renderCopilot(COPILOT, main); return; }
```

Replace with:

```javascript
  if(RUNVIEW) { renderRunView(RUNVIEW, main); return; }
  if(COPILOT) { renderCopilot(COPILOT, main); return; }
```

- [ ] **Step 3: Add open/close + render functions**

Insert immediately **after** the `closeCopilot` function (the one ending `render(ACTIVE);\n}` at ~line 1458, just before `const NOTES = {};`):

```javascript
/* ─────────────── RUN VIEW (immersive) ─────────────── */
function openRunView(sc) {
  RUNVIEW = sc;
  RV_FREN_OPEN = false;
  FREN_HIST = [];
  qs('#app').classList.add('copilot');
  render(ACTIVE);
}
function closeRunView() {
  RUNVIEW = null;
  RV_FREN_OPEN = false;
  qs('#app').classList.remove('copilot');
  render(ACTIVE);
}
function renderRunView(sc, main) {
  const out = outcomeFor(sc);
  const nums = agentNums(sc.stages);
  const lang = sc.input ? sc.input.lang : '—';
  const ch = sc.channel ? sc.channel.split(' ')[0] : '—';

  const rv = el('div','rv');
  const head = el('div','rv-head');
  const back = el('span','cp-back','◁ Runs'); back.onclick = closeRunView;
  const title = el('div','rv-htitle');
  title.innerHTML = `<span class="rv-name">${sc.title}</span><span class="outcome ${out.cls}">${out.label}</span>${sc._reopened?'<span class="rv-reopened">⟲ reopened</span>':''}`;
  const meta = el('div','rv-hmeta');
  meta.innerHTML = `<div class="agent-pills">${nums.map(n=>`<span class="a-pill a${n}">Agent ${n}</span>`).join('')}</div><span class="rv-chan">${channelLabel(ch)} · ${langLabel(lang)}</span>`;
  const actions = el('div','rv-actions');
  const ivBtn = el('button','rv-iv','⚑ Intervene');
  ivBtn.onclick = () => { if(typeof toggleIntervene === 'function') toggleIntervene(sc); };
  actions.appendChild(ivBtn);
  head.append(back, title, meta, actions);
  rv.appendChild(head);

  const grid = el('div','rv-grid');
  grid.appendChild(buildRunTrace(sc));
  grid.appendChild(buildRunArtifacts(sc));
  rv.appendChild(grid);

  main.innerHTML = '';
  main.appendChild(rv);
}
function buildRunTrace(sc) {
  const col = el('div','rv-trace');
  col.appendChild(txt('div','rv-colk','◷ Agent trace'));
  const thread = el('div','rv-thread');
  (sc.stages||[]).forEach(stage => thread.appendChild(buildTraceStage(stage)));
  col.appendChild(thread);
  return col;
}
function buildTraceStage(stage) {
  const human = /human/i.test(stage.agent);
  const node = el('div','rv-stage'+(human?' human':''));
  node.innerHTML = `<div class="rv-stage-agent">${stage.agent}</div>`;
  const steps = el('div','rv-steps');
  (stage.steps||[]).forEach(step => {
    const warn = String(step.label).startsWith('⚠') || String(step.label).startsWith('🔴');
    const row = el('div','rv-step');
    row.innerHTML = `<span class="rv-step-lbl" style="${warn?'color:var(--blood)':''}">${step.label}</span><span class="rv-step-body">${step.tool?`<span class="rv-tool ${step.tool==='safety'?'safety':''}">${step.tool}</span>`:''}${step.detail||''}</span>`;
    steps.appendChild(row);
  });
  node.appendChild(steps);
  return node;
}
function parseScores(sc) {
  let blob = '';
  (sc.stages||[]).forEach(st => (st.steps||[]).forEach(s => { blob += ' ' + (s.detail||''); }));
  const csat = blob.match(/CSAT\s*(\d)/i);
  const nps  = blob.match(/NPS\s*([+-]?\d+)/i);
  const ces  = blob.match(/CES\s*(\d)/i);
  if(!csat && !nps && !ces) return null;
  return { csat: csat?csat[1]:null, nps: nps?nps[1]:null, ces: ces?ces[1]:null };
}
function buildRunArtifacts(sc) {
  const col = el('div','rv-art');
  const lang = sc.input ? sc.input.lang : '—';
  const isRTL = lang === 'ARABIC';

  const sr = parseScores(sc);
  if(sr) {
    col.appendChild(txt('div','rv-colk','◆ Resolution scores'));
    const strip = el('div','rv-scores');
    strip.innerHTML =
      `<div class="rv-score"><div class="k">CSAT</div><div class="v">${sr.csat??'—'}</div></div>`+
      `<div class="rv-score"><div class="k">NPS</div><div class="v">${sr.nps!=null?((+sr.nps>0?'+':'')+sr.nps):'—'}</div></div>`+
      `<div class="rv-score"><div class="k">CES</div><div class="v">${sr.ces??'—'}</div></div>`;
    col.appendChild(strip);
  }

  if(sc.input && sc.input.text) {
    col.appendChild(txt('div','rv-colk','✉ Inbound'));
    const mb = el('div','msg-block');
    mb.innerHTML = `<div class="lang">${sc.input.customer||'—'} · ${langLabel(lang)}</div><div class="msg-body" ${isRTL?'dir="rtl"':''}>${sc.input.text}</div>`;
    col.appendChild(mb);
  }

  if(sc.messages && sc.messages.length) {
    col.appendChild(txt('div','rv-colk','✎ Messages'));
    sc.messages.forEach(m => {
      const rtl = m.language === 'ARABIC';
      const mb = el('div','msg-block');
      mb.innerHTML = `<div class="lang">${m.label} · ${langLabel(m.language)}</div><div class="msg-body" ${rtl?'dir="rtl"':''}>${m.text||'—'}</div>`;
      col.appendChild(mb);
    });
  }

  if(sc.edge) {
    const eq = el('div','edge-quote');
    eq.innerHTML = `<div class="q">"${sc.edge}"</div><div class="src">Why it wins</div>`;
    col.appendChild(eq);
  }
  return col;
}
```

- [ ] **Step 4: Wire the run-list row click to open the view**

Find (~line 1854, inside `renderRunList`):

```javascript
    row.onclick = () => selectItem('run', sc, row);
```

Replace with:

```javascript
    row.onclick = () => openRunView(sc);
```

(The old `railRun` rail renderer and the `'run'` branch in `renderRail` become unreachable for runs — leave them defined; they are harmless and the spec keeps the rail's `.ts-tool nowrap` for other uses.)

- [ ] **Step 5: Guard the nav toggle against the run view**

Find (~line 790, inside `initNavToggle`'s `toggle`):

```javascript
    if(COPILOT) return;
```

Replace with:

```javascript
    if(COPILOT || RUNVIEW) return;
```

- [ ] **Step 6: Add the run-view CSS**

Insert this block immediately **before** `</style>` (~line 584):

```css
/* ── IMMERSIVE RUN VIEW ── */
.rv{display:flex;flex-direction:column;height:calc(100vh - 52px);overflow:hidden;}
.rv-head{display:flex;align-items:center;gap:14px;padding:0 22px;height:50px;border-bottom:1px solid var(--line);background:var(--paper2);flex:none;}
.rv-htitle{display:flex;align-items:center;gap:10px;min-width:0;}
.rv-name{font-family:var(--serif);font-size:15px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:40vw;}
.rv-reopened{font-size:10px;font-weight:700;letter-spacing:.06em;padding:2px 8px;border-radius:999px;background:var(--brass-soft);color:var(--brass-ink);flex:none;}
.rv-hmeta{display:flex;align-items:center;gap:10px;font-size:11px;color:var(--dim);}
.rv-chan{color:var(--faint);}
.rv-actions{margin-left:auto;display:flex;gap:8px;}
.rv-iv{font-size:12px;font-weight:600;padding:7px 14px;border-radius:8px;border:1px solid var(--brass);background:var(--brass-soft);color:var(--brass-ink);cursor:pointer;display:flex;align-items:center;gap:6px;}
.rv-iv:hover,.rv-iv.on{background:var(--brass);color:#fff;}
.rv-grid{flex:1;display:grid;grid-template-columns:1fr 360px;overflow:hidden;transition:grid-template-columns .25s ease;}
.rv.fren-open .rv-grid{grid-template-columns:1fr 360px 340px;}
.rv-trace,.rv-art{overflow-y:auto;padding:20px 22px 40px;}
.rv-trace{border-right:1px solid var(--line);background:var(--card2);}
.rv-art{background:var(--card);}
.rv-colk{font-size:10px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:var(--faint);margin:0 0 14px;display:flex;align-items:center;gap:7px;}
.rv-art .rv-colk:not(:first-child){margin-top:26px;}
.rv-thread{position:relative;padding-left:22px;}
.rv-thread::before{content:"";position:absolute;left:7px;top:4px;bottom:4px;width:1px;background:linear-gradient(180deg,var(--teal),#CFE0DD);}
.rv-stage{margin-bottom:20px;}
.rv-stage-agent{font-family:var(--serif);font-size:14px;font-weight:600;color:var(--ink);margin-bottom:8px;display:flex;align-items:center;gap:8px;}
.rv-stage-agent::before{content:"";width:11px;height:11px;border-radius:50%;background:var(--card);border:2px solid var(--teal);flex:none;margin-left:-20px;}
.rv-stage.human .rv-stage-agent{color:var(--brass-ink);}
.rv-stage.human .rv-stage-agent::before{background:var(--brass);border-color:var(--brass);box-shadow:0 0 0 3px var(--brass-soft);}
.rv-steps{display:flex;flex-direction:column;}
.rv-step{display:flex;gap:12px;padding:7px 0;border-bottom:1px dashed var(--line);font-size:12px;color:var(--dim);align-items:flex-start;}
.rv-step:last-child{border-bottom:0;}
.rv-step-lbl{color:var(--ink);font-weight:500;width:120px;flex:none;}
.rv-step-body{flex:1;min-width:0;line-height:1.55;}
.rv-tool{font-family:var(--mono);font-size:10px;color:var(--teal-ink);background:var(--teal-soft);border:1px solid #CDE0DC;padding:1px 6px;border-radius:4px;margin-right:6px;white-space:normal;word-break:break-word;display:inline-block;}
.rv-tool.safety{color:var(--blood);background:var(--blood-soft);border-color:#E8CFC6;}
.rv-scores{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:6px;}
.rv-score{background:var(--card2);border:1px solid var(--line);border-radius:10px;padding:12px;text-align:center;}
.rv-score .k{font-size:9.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);}
.rv-score .v{font-family:var(--serif);font-size:24px;font-weight:600;color:var(--ink);margin-top:4px;}
@media (max-width: 900px){
  .rv{height:auto;}
  .rv-grid,.rv.fren-open .rv-grid{grid-template-columns:1fr;}
  .rv-name{max-width:55vw;}
}
```

- [ ] **Step 7: Verify syntax**

Run the verification command. Expected: no output (pass).

- [ ] **Step 8: Manual check**

Reload, go to Agent Runs, click each run. Each opens full-width: left **Agent trace** (vertical thread, tool chips **wrap** — no clipping), right **Artifacts** (score strip only on resolved runs; inbound; all messages — Arabic runs render RTL; edge quote). `◁ Runs` returns to the list. The `⚑ Intervene` button is visible but does nothing yet (expected).

- [ ] **Step 9: Commit**

```bash
git add web/index.html
git commit -m "feat: immersive Agent Runs view (trace + artifacts), wrapping tool chips"
```

---

## Task 4: Intervene loop — fren column → Human Queue item

**Files:** Modify `web/index.html` — add `RV_FREN_OPEN` state + intervene functions (after the run-view functions from Task 3), edit `renderRunView` to mount the third column, add the INTERVENTION branch to `renderQueueList` (~line 1418), add CSS.

- [ ] **Step 1: Add the `RV_FREN_OPEN` global**

Find (the line added in Task 3, ~line 711):

```javascript
let RUNVIEW = null;   // scenario being viewed immersively
```

Replace with:

```javascript
let RUNVIEW = null;   // scenario being viewed immersively
let RV_FREN_OPEN = false;
```

- [ ] **Step 2: Mount the intervene column in `renderRunView`**

In `renderRunView` (added in Task 3), find:

```javascript
  const rv = el('div','rv');
```

Replace with:

```javascript
  const rv = el('div','rv'+(RV_FREN_OPEN?' fren-open':''));
```

Then find:

```javascript
  const ivBtn = el('button','rv-iv','⚑ Intervene');
```

Replace with:

```javascript
  const ivBtn = el('button','rv-iv'+(RV_FREN_OPEN?' on':''),'⚑ Intervene');
```

Then find:

```javascript
  const grid = el('div','rv-grid');
  grid.appendChild(buildRunTrace(sc));
  grid.appendChild(buildRunArtifacts(sc));
  rv.appendChild(grid);

  main.innerHTML = '';
  main.appendChild(rv);
}
```

Replace with:

```javascript
  const grid = el('div','rv-grid');
  grid.appendChild(buildRunTrace(sc));
  grid.appendChild(buildRunArtifacts(sc));
  if(RV_FREN_OPEN) grid.appendChild(buildIntervenePanel(sc));
  rv.appendChild(grid);

  main.innerHTML = '';
  main.appendChild(rv);
  if(RV_FREN_OPEN) initIntervene(sc);
}
```

- [ ] **Step 3: Add the intervene functions**

Insert immediately **after** `buildRunArtifacts` (the last run-view function from Task 3):

```javascript
/* ─────────────── INTERVENE LOOP ─────────────── */
function toggleIntervene(sc) {
  RV_FREN_OPEN = !RV_FREN_OPEN;
  renderRunView(sc, qs('#main'));
}
function buildIntervenePanel(sc) {
  const col = el('div','rv-fren');
  const head = el('div','fren-head rv-fren-head');
  head.innerHTML = `<div class="fren-avatar brass">f</div><div><div class="fren-name">fren <span class="sub">· Intervention</span></div></div><div class="fren-live brass"><span class="d"></span> Drafting</div>`;
  col.appendChild(head);

  const banner = txt('div','rv-iv-banner', 'You’re reviewing a closed run. Anything you request is drafted and sent to the Human Queue for approval — nothing is re-sent automatically.');
  col.appendChild(banner);

  const msgs = el('div','fren-msgs'); msgs.id = 'iv-msgs';
  col.appendChild(msgs);

  const chipsWrap = el('div','fchips');
  chipsWrap.appendChild(txt('div','fchips-label','Request a change'));
  const inner = el('div'); inner.id = 'iv-chips';
  chipsWrap.appendChild(inner);
  col.appendChild(chipsWrap);

  const iw = el('div','finput');
  const inp = el('textarea','fren-input'); inp.id = 'iv-input'; inp.placeholder = 'Describe what else should happen…'; inp.rows = 1;
  const send = el('button','fsend brass','→'); send.onclick = () => ivSubmit(sc, qs('#iv-input').value);
  iw.append(inp, send);
  col.appendChild(iw);
  return col;
}
function initIntervene(sc) {
  const msgs = qs('#iv-msgs');
  if(msgs && !msgs.childElementCount) setTimeout(() => ivAppend('fren', 'What should change about this run? Pick a request or describe it — I’ll draft it and route it to the Human Queue for sign-off.'), 300);
  renderIvChips(sc);
  const inp = qs('#iv-input');
  if(inp) inp.addEventListener('keydown', e => { if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); ivSubmit(sc, inp.value); } });
}
function ivAppend(role, text) {
  const msgs = qs('#iv-msgs'); if(!msgs) return;
  const m = el('div','fren-msg '+(role==='fren'?'fren-side':'user-side'));
  m.append(txt('div','fren-sender', role==='fren'?'fren · Intervention':'You'), txt('div','fren-bubble', text));
  msgs.appendChild(m); msgs.scrollTop = msgs.scrollHeight;
}
function ivThinking(on) {
  const msgs = qs('#iv-msgs'); if(!msgs) return;
  if(on){ const t = el('div','fren-thinking'); t.id='iv-thinking'; t.innerHTML='<div class="thinking-dot"></div><div class="thinking-dot"></div><div class="thinking-dot"></div>'; msgs.appendChild(t); msgs.scrollTop=msgs.scrollHeight; }
  else { const t = qs('#iv-thinking'); if(t) t.remove(); }
}
function interveneChips(sc) {
  const nums = agentNums(sc.stages);
  const blob = (sc.title+' '+(sc.tagline||'')).toLowerCase();
  if(nums.includes(5) || /procure|reorder|stock|supplier/.test(blob))
    return ['Adjust order quantity','Hold the reorder','Switch supplier','Escalate to category manager'];
  if(/safety|injection|manipulat|contained|block/.test(blob))
    return ['Add to block-list review','Notify security'];
  if(nums.includes(2) || /warrant|return|refund|replace/.test(blob))
    return ['Redo the reply — warmer tone','Reclassify (not WARRANTY_RETURN)','Also flag to the quality team','Add a goodwill gesture proposal'];
  return ['Redo the reply','Add a follow-up action','Escalate to a manager','Flag to the quality team'];
}
function renderIvChips(sc) {
  const wrap = qs('#iv-chips'); if(!wrap) return;
  wrap.innerHTML = '';
  interveneChips(sc).forEach(c => {
    const chip = txt('button','fren-chip', c);
    chip.onclick = () => ivSubmit(sc, c);
    wrap.appendChild(chip);
  });
}
function deskForKind(kind) {
  const k = (kind||'').toLowerCase();
  if(/quant|reorder|supplier|category|order|hold/.test(k)) return 'Procurement Buyer Desk';
  if(/security|block-list|block list/.test(k)) return 'Trust & Safety';
  if(/quality/.test(k)) return 'Quality Review';
  return 'Warranty Desk';
}
function draftForKind(sc, kind) {
  return `Drafted at your request: "${kind}". A revised proposal for ${sc.title} has been prepared for the ${deskForKind(kind)} to review and action. Nothing has been re-sent to the customer.`;
}
function ivSubmit(sc, raw) {
  const text = (raw||'').trim(); if(!text) return;
  const inp = qs('#iv-input'); if(inp) inp.value = '';
  const wrap = qs('#iv-chips'); if(wrap) wrap.innerHTML = '';
  ivAppend('user', text);
  ivThinking(true);
  setTimeout(() => {
    ivThinking(false);
    const desk = deskForKind(text);
    const draft = draftForKind(sc, text);
    ivAppend('fren', draft + ' I’ve added it to the Human Queue — open it there to approve.');
    const n = (REPORT.snapshot.human_queue||[]).filter(i => i.type==='INTERVENTION').length + 1;
    const item = {
      workflow_task_id: 'WF-IV-'+n, type:'INTERVENTION',
      source_run: sc.id, source_title: sc.title, kind: text, request: text,
      drafted_message: draft, summary: 'Human-requested change to '+sc.title,
      assigned_to: desk, status:'pending_approval', priority:'standard',
      _origin:'human', ts: new Date().toISOString()
    };
    (REPORT.snapshot.human_queue = REPORT.snapshot.human_queue || []).push(item);
    appendTraceStage(sc, item);
    sc._reopened = true;
    markReopened();
    refreshBadges();
    toast('Proposal added to the Human Queue · linked to this run.');
  }, 800);
}
function appendTraceStage(sc, item) {
  const stage = { agent:'Human · Intervention', steps:[
    {label:'Requested', tool:null, detail:item.request},
    {label:'Drafted by agent', tool:'draft', detail:item.summary},
    {label:'Queued for approval', tool:null, detail:item.workflow_task_id}
  ]};
  (sc.stages = sc.stages || []).push(stage);
  const thread = qs('.rv-thread');
  if(thread) thread.appendChild(buildTraceStage(stage));
}
function markReopened() {
  const title = qs('.rv-htitle');
  if(title && !title.querySelector('.rv-reopened')) title.appendChild(txt('span','rv-reopened','⟲ reopened'));
}
```

- [ ] **Step 4: Render INTERVENTION rows in the Human Queue list**

In `renderQueueList` (~line 1418), find the start of the `items.forEach`:

```javascript
  items.forEach(item => {
    const isProc = item.type === 'PROCUREMENT_APPROVAL';
```

Replace with (insert the INTERVENTION branch ahead of the existing logic):

```javascript
  items.forEach(item => {
    if(item.type === 'INTERVENTION') {
      const row = el('div','data-row'+(item._actioned?' dr-row-done':''));
      row.innerHTML = `
        <div class="dr-main">
          <div class="dr-top">
            <span class="badge brass">Intervention</span>
            ${item._actioned?`<span class="badge done">✓ ${item._actionLabel}</span>`:''}
            <span class="dr-id">${item.workflow_task_id}</span>
          </div>
          <div class="dr-title">${item.kind}</div>
          <div class="dr-sub">↩ ${item.source_title}</div>
        </div>
        <div class="dr-right">
          <div class="dr-meta">${timeAgo(item.ts)}</div>
          <div class="dr-meta">${item.assigned_to||'—'}</div>
        </div>`;
      row.onclick = () => openCopilot(item);
      list.appendChild(row);
      return;
    }
    const isProc = item.type === 'PROCUREMENT_APPROVAL';
```

- [ ] **Step 5: Add intervene-panel CSS**

Insert immediately **before** `</style>` (~line 584):

```css
/* ── INTERVENE PANEL ── */
.rv-fren{display:flex;flex-direction:column;border-left:1px solid var(--line);background:var(--card);overflow:hidden;}
.rv-fren-head{background:linear-gradient(135deg,var(--brass-soft),var(--card));}
.fren-avatar.brass{background:var(--brass);}
.fren-live.brass{color:var(--brass-ink);}
.fren-live.brass .d{background:var(--brass);}
.fsend.brass{background:var(--brass);}
.rv-iv-banner{font-size:11px;line-height:1.5;color:var(--brass-ink);background:var(--brass-soft);border-bottom:1px solid var(--line);padding:10px 14px;}
```

- [ ] **Step 6: Verify syntax**

Run the verification command. Expected: no output (pass).

- [ ] **Step 7: Manual check**

Reload, open a warranty run, click `⚑ Intervene`. A third **brass** fren column slides in (button turns solid brass) with the intent banner, a greeting, and context-aware chips (warranty set). Click "Redo the reply — warmer tone": fren shows a thinking beat, replies with a draft, a **toast** appears, the trace gains a brass **Human · Intervention** stage, the title gains a **⟲ reopened** pill, and the Human Queue sidebar badge increments by 1. Open a procurement run (e.g. a reorder) → chips are the procurement set. Go to Human Queue → the new **Intervention** row shows kind + `↩ source title`.

- [ ] **Step 8: Commit**

```bash
git add web/index.html
git commit -m "feat: human Intervene loop routes drafted corrections to the Human Queue"
```

---

## Task 5: Copilot INTERVENTION variant (approve the intervention)

**Files:** Modify `web/index.html` — add an early branch to `renderCopilot` (~line 1460), add `renderInterventionCopilot` + `showInterventionConfirm` after `showConfirmModal` (~line 1795).

- [ ] **Step 1: Branch `renderCopilot` for interventions**

Find the start of `renderCopilot` (~line 1460):

```javascript
function renderCopilot(item, main) {
  const isProc = item.type === 'PROCUREMENT_APPROVAL';
```

Replace with:

```javascript
function renderCopilot(item, main) {
  if(item.type === 'INTERVENTION') { renderInterventionCopilot(item, main); return; }
  const isProc = item.type === 'PROCUREMENT_APPROVAL';
```

- [ ] **Step 2: Add the variant renderer + confirm modal**

Insert immediately **after** the `showConfirmModal` function (it ends with `overlay.onclick = e => { if(e.target === overlay) overlay.remove(); };\n}` at ~line 1795):

```javascript
function renderInterventionCopilot(item, main) {
  FREN_HIST = [];
  const cp = el('div','cp');

  const ch = el('div','cp-head');
  const back = el('span','cp-back','◁ Queue'); back.onclick = closeCopilot;
  const crumb = el('div','cp-crumb');
  crumb.innerHTML = `<span>Queue</span><span class="sep">›</span><span>${item.workflow_task_id}</span><span class="sep">›</span><span class="cur">Intervention · Review</span>`;
  const actions = el('div','cp-actions');
  const openRunBtn = el('div','cpb','◷ Open source run');
  const goRun = () => { const sc = (REPORT.scenarios||[]).find(s => s.id===item.source_run); if(sc){ closeCopilot(); openRunView(sc); } };
  openRunBtn.onclick = goRun;
  const submitBtn = el('div','cpb primary','Apply / Release →');
  submitBtn.onclick = () => showInterventionConfirm(item);
  actions.append(openRunBtn, submitBtn);
  ch.append(back, crumb, actions);
  cp.appendChild(ch);

  // ── ctx column
  const ctx = el('div','col col-ctx');
  ctx.appendChild(txt('div','ck','↩ Source run'));
  const srcCard = el('div','ctx-card');
  srcCard.innerHTML = `<div class="ctx-title">Reopened run</div><div class="kv"><span class="k">Run</span><span class="v">${item.source_title}</span></div><div class="kv"><span class="k">Assigned</span><span class="v">${item.assigned_to}</span></div>`;
  const openLink = txt('div','prec','◷ open run'); openLink.style.cursor='pointer'; openLink.onclick = goRun;
  srcCard.appendChild(openLink);
  ctx.appendChild(srcCard);

  ctx.appendChild(txt('div','ck','◷ What happened'));
  const tlCard = el('div','ctx-card');
  const tl = el('div','tl');
  [{what:'Human intervened',agent:item.kind},{what:'Agent drafted change',agent:'no message sent'},{what:'Awaiting approval',agent:'nothing dispatched yet',now:true}].forEach(s => {
    const step = el('div','tl-step'+(s.now?' now':''));
    step.innerHTML = `<div class="tl-when">now</div><div class="tl-what">${s.what}</div><div class="tl-agent">${s.agent}</div>`;
    tl.appendChild(step);
  });
  tlCard.appendChild(tl); ctx.appendChild(tlCard);

  ctx.appendChild(txt('div','ck','✎ Your request'));
  const rq = el('div','ctx-card'); rq.innerHTML = `<div class="reply" style="font-size:13px">${item.request}</div>`;
  ctx.appendChild(rq);
  cp.appendChild(ctx);

  // ── doc column
  const doc = el('div','col col-doc');
  const dhead = el('div','doc-head');
  dhead.innerHTML = `<div class="doc-pl"><span class="dot"></span> Human intervention · ${item.kind} <span class="doc-status">Drafted</span></div>`;
  doc.appendChild(dhead);
  const scroll = el('div','doc-scroll'); const body = el('div','doc-body');
  const sec = el('div','doc-sec');
  sec.innerHTML = `<div class="doc-sec-t">Drafted change · ${item.workflow_task_id}</div>`;
  const msg = item.drafted_message||'—';
  const isAr = /[؀-ۿ]/.test(msg);
  const rep = el('div','reply'); if(isAr){ rep.dir='rtl'; rep.style.fontFamily='var(--ar)'; } rep.textContent = msg;
  sec.appendChild(rep); body.appendChild(sec);
  const flowSec = el('div','doc-sec');
  flowSec.innerHTML = `<div class="doc-sec-t">On apply · what happens next</div><div class="flow"><div class="flow-step"><div class="n">1 · Desk</div><div class="ft">${item.assigned_to} reviews</div><div class="fs">a person actions the change</div></div><div class="flow-step"><div class="n">2 · Run</div><div class="ft">Linked run updated</div><div class="fs">intervention recorded on the trace</div></div><div class="flow-step"><div class="n">3 · SAP</div><div class="ft">Outcome written back</div><div class="fs">agents record — never own the data</div></div></div>`;
  body.appendChild(flowSec);
  scroll.appendChild(body); doc.appendChild(scroll);
  const foot = el('div','doc-foot');
  const note = txt('span','fnote', `Applying notifies ${item.assigned_to}. You're proposing — not transacting.`);
  const fbtn = el('button','foot-btn','Apply / Release →'); fbtn.onclick = () => showInterventionConfirm(item);
  foot.append(note, fbtn); doc.appendChild(foot);
  cp.appendChild(doc);

  // ── fren column (teal co-solver)
  const fcol = el('div','col col-fren');
  const fhead = el('div','fren-head');
  fhead.innerHTML = `<div class="fren-avatar">f</div><div><div class="fren-name">fren <span class="sub">· Co-solver</span></div></div><div class="fren-live"><span class="d"></span> Live</div>`;
  fcol.appendChild(fhead);
  const fctx = el('div','fren-ctx');
  fctx.innerHTML = [item.workflow_task_id, 'intervention', item.assigned_to].map(c=>`<span class="ctxchip">${c}</span>`).join('');
  fcol.appendChild(fctx);
  const fmsgs = el('div','fren-msgs'); fmsgs.id='fren-msgs'; fcol.appendChild(fmsgs);
  const fchips = el('div','fchips'); fchips.appendChild(txt('div','fchips-label','Suggested')); const fInner = el('div'); fInner.id='fren-chips'; fchips.appendChild(fInner); fcol.appendChild(fchips);
  const fiw = el('div','finput'); const finp = el('textarea','fren-input'); finp.id='fren-input'; finp.placeholder='Ask fren anything…'; finp.rows=1; const fsend = el('button','fsend','→'); fsend.onclick = sendFrenMsg; fiw.append(finp,fsend); fcol.appendChild(fiw);
  cp.appendChild(fcol);

  main.innerHTML=''; main.appendChild(cp);

  FREN_CHIPS = [
    {q:'Is this safe to apply?', a:'Yes — applying only notifies '+item.assigned_to+' to action your requested change. No purchase, dispatch, or customer message is sent automatically. A person signs off.'},
    {q:'What did the human ask for?', a:'The request was: "'+item.request+'". I drafted a proposal for the desk to review.'},
    {q:'Will the customer be re-contacted?', a:'Not automatically. Any new customer message would itself be drafted and approved before sending — propose, don’t transact.'}
  ];
  if(!FREN_HIST.length) setTimeout(() => appendFrenMsg('fren', 'This is a human-requested change to "'+item.source_title+'". Review the draft on the left; Apply routes it to '+item.assigned_to+' for sign-off.'), 400);
  renderFrenChips();
  const fi = qs('#fren-input');
  if(fi) fi.addEventListener('keydown', e => { if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); sendFrenMsg(); } });
}
function showInterventionConfirm(item) {
  const overlay = el('div','cp-modal-overlay');
  const modal = el('div','cp-modal');
  modal.innerHTML = `<h3>Apply intervention</h3><p>This will notify <strong>${item.assigned_to}</strong> to action ${item.workflow_task_id}. You are <strong>proposing</strong> — not transacting. A person at the desk makes the final decision.</p><div class="cp-modal-btns"><button class="cp-modal-btn cancel">Cancel</button><button class="cp-modal-btn confirm">Confirm →</button></div>`;
  overlay.appendChild(modal); document.body.appendChild(overlay);
  modal.querySelector('.cancel').onclick = () => overlay.remove();
  modal.querySelector('.confirm').onclick = () => {
    overlay.remove();
    item._actioned = true; item._actionLabel = 'Applied';
    refreshBadges();
    document.querySelectorAll('.cp-actions .cpb.primary, .doc-foot .foot-btn').forEach(b => { b.textContent='✓ Applied'; b.style.opacity='.7'; b.onclick=null; });
    appendFrenMsg('fren', 'Done — '+item.workflow_task_id+' has been released to '+item.assigned_to+'. They will review and action it. It is marked applied in the queue.');
  };
  overlay.onclick = e => { if(e.target === overlay) overlay.remove(); };
}
```

- [ ] **Step 3: Verify syntax**

Run the verification command. Expected: no output (pass).

- [ ] **Step 4: Manual check**

Reload. Create an intervention (Task 4 flow), go to Human Queue, click the **Intervention** row. The copilot opens in the intervention variant: left shows the source run (with `◷ open run` → reopens the immersive run view), the timeline, and your request; centre shows the drafted change + "what happens next"; right is the teal co-solver fren (its suggested chips answer safety/what-was-asked/re-contact). Click **Apply / Release →** → confirm modal → both Apply buttons become "✓ Applied", the queue badge drops, and fren confirms. Arabic drafts (if any) render RTL.

- [ ] **Step 5: Commit**

```bash
git add web/index.html
git commit -m "feat: copilot intervention variant to approve human-requested changes"
```

---

## Task 6: Cleanup + full smoke

**Files:** Delete `web/mockup.html`; run the server smoke; final commit.

- [ ] **Step 1: Delete the mockup**

`web/mockup.html` was a brainstorming artifact. Confirm it is not referenced anywhere first:

```bash
grep -rn "mockup" web/index.html orchestrator/main.py
```

Expected: no matches. Then delete it:

```bash
rm web/mockup.html
```

(If `git rm web/mockup.html` reports it is untracked, the plain `rm` above is correct.)

- [ ] **Step 2: Final syntax verification**

Run the verification command. Expected: no output (pass).

- [ ] **Step 3: Server smoke (determinism + endpoints intact)**

If port 8011 is busy, free it first (PowerShell):

```powershell
Get-NetTCPConnection -LocalPort 8011 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

Start the server in the background and smoke the three endpoints:

```powershell
Start-Process -NoNewWindow uvicorn -ArgumentList 'orchestrator.main:app','--port','8011'
Start-Sleep -Seconds 3
(Invoke-WebRequest http://127.0.0.1:8011/health).StatusCode
(Invoke-WebRequest http://127.0.0.1:8011/).StatusCode
$r = (Invoke-WebRequest 'http://127.0.0.1:8011/api/demo').Content | ConvertFrom-Json
"alerts=$($r.snapshot.quality_alerts.Count) brands=$($r.brand_metrics.PSObject.Properties.Count) trend=$($r.daily_trend.Count)"
```

Expected: `200`, `200`, and `alerts=2 brands=7 trend=7` (the backend is untouched, so these must be unchanged).

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: remove run-view mockup artifact"
```

- [ ] **Step 5: Push (only if the user asks)**

The user typically pushes for Render. If asked: `git push origin master`.

---

## Self-review — spec coverage

- §1 Immersive run view → Task 3 (state, `renderRunView`, trace, artifacts, score-strip regex, RTL, edge, back button). ✓
- §1 brass fren accent → Task 4 (`rv-fren-head`, `.fren-avatar.brass`, `.fren-live.brass`, `.fsend.brass`). ✓
- §2 Intervene toggle + `.fren-open` third column → Task 4 (`toggleIntervene`, grid transition). ✓
- §2 intent banner → Task 4 (`rv-iv-banner`). ✓
- §2 context-aware chips → Task 4 (`interveneChips` by `agentNums`/keywords: warranty/procurement/safety/default). ✓
- §2 queue item shape (all fields incl. `WF-IV-<n>`, `_origin:'human'`) → Task 4 (`ivSubmit`). ✓
- §2 `refreshBadges()` + toast → Task 4. ✓
- §2 appended trace stage + `_reopened` marker → Task 4 (`appendTraceStage`, `markReopened`, `.rv-reopened`). ✓
- §2 copilot INTERVENTION variant (ctx/doc/fren + Apply via confirm) → Task 5. ✓
- §3 audit fix 1 (tool-chip wrap) → Task 3 (`.rv-tool` `white-space:normal;word-break:break-word`). ✓
- §3 audit fix 2 (`tb-user` popover) → Task 2. ✓
- §3 audit fix 3 (neutral brand-table arrow) → Task 1. ✓
- Constraints: no transactional capability added; no PII persisted (session-only `request`/notes); determinism smoked in Task 6. ✓
- Out of scope honoured: no server-side persistence, no live LLM, no SAP edits. ✓
- Verification: `node --check` each task + endpoint smoke + mockup deletion → Task 6. ✓

**Type/name consistency:** `RUNVIEW`/`RV_FREN_OPEN` globals; `buildTraceStage` reused by both initial render and `appendTraceStage`; `openRunView`/`closeRunView`, `ivSubmit`/`ivAppend`/`ivThinking`, `renderInterventionCopilot`/`showInterventionConfirm` are each referenced exactly as defined. The `toggleIntervene` forward reference in Task 3 is `typeof`-guarded, so Task 3 runs standalone and Task 4 activates it. No gaps found.
