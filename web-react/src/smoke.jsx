// SSR smoke test: renders every view and shell component against the sample
// report through the real AppCtx. Catches runtime render errors that a
// successful build would miss. Run: npm run smoke
import React from 'react';
import { renderToString } from 'react-dom/server';
import { AppCtx } from './App.jsx';
import sample from './lib/sample.json';
import TopBar from './components/TopBar.jsx';
import Sidebar from './components/Sidebar.jsx';
import Rail from './components/Rail.jsx';
import FrenDock from './components/FrenDock.jsx';
import Overview from './views/Overview.jsx';
import Quality from './views/Quality.jsx';
import Queue from './views/Queue.jsx';
import Runs from './views/Runs.jsx';
import Guardrails from './views/Guardrails.jsx';
import Loop from './views/Loop.jsx';
import Copilot from './views/Copilot.jsx';
import RunView from './views/RunView.jsx';
import { reportReducer } from './lib/store.js';

const noop = () => {};
const baseCtx = {
  report: sample, active: 'overview', setNav: noop, sel: null, selectItem: noop,
  copilot: null, openCopilot: noop, closeCopilot: noop,
  runview: null, openRun: noop, closeRun: noop, rvFrenOpen: false, setRvFrenOpen: noop,
  actionItem: noop, intervene: noop,
  navCollapsed: false, toggleNav: noop, railOpen: false, setRailOpen: noop, toast: noop,
};
const wrap = (ctx, node) => renderToString(<AppCtx.Provider value={ctx}>{node}</AppCtx.Provider>);

let failures = 0;
const check = (name, fn) => {
  try {
    const html = fn();
    if (!html || html.length < 20) throw new Error('suspiciously empty output');
    console.log(`✓ ${name} (${html.length} chars)`);
  } catch (e) {
    failures++;
    console.error(`✗ ${name}: ${e.message}`);
  }
};

check('TopBar', () => wrap(baseCtx, <TopBar />));
check('Sidebar', () => wrap(baseCtx, <Sidebar />));
check('FrenDock', () => wrap(baseCtx, <FrenDock />));
['overview', 'quality', 'queue', 'runs', 'guardrails', 'loop'].forEach((k) =>
  check(`Rail briefing · ${k}`, () => wrap({ ...baseCtx, active: k }, <Rail />))
);
check('Rail · brand detail', () => wrap({ ...baseCtx, sel: { type: 'brand', data: { name: 'GEEPAS', m: sample.brand_metrics.GEEPAS, p: sample.prior_week_metrics.GEEPAS } } }, <Rail />));
check('Rail · alert detail', () => wrap({ ...baseCtx, sel: { type: 'alert', data: sample.scenarios.find((s) => s.id === 'velocity_digest').result.alerts[0] } }, <Rail />));
check('Rail · loop detail', () => wrap({ ...baseCtx, sel: { type: 'loop', data: sample.closed_loop[0] } }, <Rail />));
check('Overview', () => wrap(baseCtx, <Overview />));
check('Quality', () => wrap(baseCtx, <Quality />));
check('Queue', () => wrap(baseCtx, <Queue />));
check('Runs', () => wrap(baseCtx, <Runs />));
check('Guardrails', () => wrap(baseCtx, <Guardrails />));
check('Loop', () => wrap(baseCtx, <Loop />));
sample.snapshot.human_queue.forEach((item) =>
  check(`Copilot · ${item.workflow_task_id} (${item.type})`, () => wrap(baseCtx, <Copilot item={item} />))
);
sample.scenarios.forEach((sc) =>
  check(`RunView · ${sc.id}`, () => wrap(baseCtx, <RunView sc={sc} />))
);

// Intervention path: reducer round-trip + render of the resulting queue item.
const ivItem = {
  workflow_task_id: 'WF-IV-1', type: 'INTERVENTION', source_run: 'oos_recommend',
  source_title: 'Out-of-stock reorder — Royalford Air Fryer', kind: 'Adjust order quantity',
  request: 'Adjust order quantity', drafted_message: 'Drafted at your request.',
  summary: 'Human-requested change', assigned_to: 'Procurement Buyer Desk',
  status: 'pending_approval', priority: 'standard', ts: new Date().toISOString(),
};
const ivStage = { agent: 'Human · Intervention', steps: [{ label: 'Requested', tool: null, detail: 'Adjust order quantity' }] };
check('store · intervene + action_item round-trip', () => {
  let r = reportReducer(sample, { type: 'intervene', runId: 'oos_recommend', item: ivItem, stage: ivStage });
  if (r === sample) throw new Error('reducer returned same identity');
  if (sample.snapshot.human_queue.some((i) => i.type === 'INTERVENTION')) throw new Error('reducer mutated original report');
  r = reportReducer(r, { type: 'action_item', id: 'WF-IV-1', label: 'Applied' });
  const it = r.snapshot.human_queue.find((i) => i.workflow_task_id === 'WF-IV-1');
  if (!it._actioned || it._actionLabel !== 'Applied') throw new Error('action_item failed');
  const sc = r.scenarios.find((s) => s.id === 'oos_recommend');
  if (!sc._reopened || sc.stages[sc.stages.length - 1].agent !== 'Human · Intervention') throw new Error('stage not appended');
  return wrap({ ...baseCtx, report: r }, <Copilot item={it} />);
});

console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll smoke checks passed.');
process.exit(failures ? 1 : 0);
