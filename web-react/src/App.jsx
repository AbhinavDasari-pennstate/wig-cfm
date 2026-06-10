import { createContext, useContext, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { api } from './lib/data.js';
import { reportReducer, findQueueItem, findScenario, interventionCount } from './lib/store.js';
import TopBar from './components/TopBar.jsx';
import Sidebar from './components/Sidebar.jsx';
import Rail from './components/Rail.jsx';
import FrenDock from './components/FrenDock.jsx';
import Toasts from './components/Toasts.jsx';
import Overview from './views/Overview.jsx';
import Quality from './views/Quality.jsx';
import Queue from './views/Queue.jsx';
import Runs from './views/Runs.jsx';
import Guardrails from './views/Guardrails.jsx';
import Loop from './views/Loop.jsx';
import Copilot from './views/Copilot.jsx';
import RunView from './views/RunView.jsx';

export const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

const VIEWS = { overview: Overview, quality: Quality, queue: Queue, runs: Runs, guardrails: Guardrails, loop: Loop };

/* ── hash routing ──
 * #overview …#loop        section views
 * #run=<scenario id>      immersive run view (deep-linkable)
 * #review=<workflow id>   copilot review (deep-linkable)
 * The hash is the source of truth, so browser back/forward works. */
const parseHash = (prevActive = 'overview') => {
  const h = decodeURIComponent((location.hash || '#overview').slice(1));
  if (h.startsWith('run=')) return { active: 'runs', runId: h.slice(4), reviewId: null };
  if (h.startsWith('review=')) return { active: prevActive, runId: null, reviewId: h.slice(7) };
  return { active: VIEWS[h] ? h : 'overview', runId: null, reviewId: null };
};

const Skeleton = () => (
  <div className="sk">
    <div className="sk-row"><div className="sk-box" /><div className="sk-box" /><div className="sk-box" /><div className="sk-box" /></div>
    <div className="sk-row"><div className="sk-box tall" /></div>
  </div>
);

export default function App() {
  const [report, dispatch] = useReducer(reportReducer, null);
  const [error, setError] = useState(false);
  const [route, setRoute] = useState(() => parseHash());
  const [sel, setSel] = useState(null);            // rail selection {type, data}
  const [rvFrenOpen, setRvFrenOpen] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(() => {
    try { return localStorage.getItem('wig-nav') === 'collapsed'; } catch { return false; }
  });
  const [railOpen, setRailOpen] = useState(false); // mobile drawer
  const [toasts, setToasts] = useState([]);

  const [llmLive, setLlmLive] = useState(false);

  useEffect(() => {
    api.fetchReport().then((r) => dispatch({ type: 'load', report: r })).catch(() => setError(true));
    api.fetchHealth().then((h) => setLlmLive(h?.runner === 'sdk'));
  }, []);

  // Hash is the single source of truth for navigation.
  useEffect(() => {
    const onHash = () => setRoute((prev) => {
      const next = parseHash(prev.active);
      if (!next.runId) setRvFrenOpen(false);
      if (!next.runId && !next.reviewId && next.active !== prev.active) { setSel(null); setRailOpen(false); }
      return next;
    });
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const setNav = useCallback((key) => { location.hash = key; }, []);
  const openCopilot = useCallback((item) => { location.hash = 'review=' + encodeURIComponent(item.workflow_task_id); }, []);
  const closeCopilot = useCallback(() => { location.hash = route.active; }, [route.active]);
  const openRun = useCallback((sc) => { location.hash = 'run=' + encodeURIComponent(sc.id); }, []);
  const closeRun = useCallback(() => { location.hash = 'runs'; }, []);

  // Ref mirror so intervene() can read the latest report without re-creating.
  const reportRef = useRef(report);
  reportRef.current = report;

  // Store actions (immutable updates via the reducer). Decisions are also
  // persisted server-side so they survive a reload (no-op when offline or for
  // client-only intervention items).
  const actionItem = useCallback((id, label, note) => {
    dispatch({ type: 'action_item', id, label });
    api.recordAction(id, label, note);
  }, []);
  const intervene = useCallback((runId, kind, draft, desk) => {
    const item = {
      workflow_task_id: 'WF-IV-' + (interventionCount(reportRef.current) + 1),
      type: 'INTERVENTION',
      source_run: runId, source_title: findScenario(reportRef.current, runId)?.title || runId,
      kind, request: kind, drafted_message: draft,
      summary: 'Human-requested change to ' + (findScenario(reportRef.current, runId)?.title || runId),
      assigned_to: desk, status: 'pending_approval', priority: 'standard',
      _origin: 'human', ts: new Date().toISOString(),
    };
    const stage = { agent: 'Human · Intervention', steps: [
      { label: 'Requested', tool: null, detail: kind },
      { label: 'Drafted by agent', tool: 'draft', detail: item.summary },
      { label: 'Queued for approval', tool: null, detail: item.workflow_task_id },
    ] };
    dispatch({ type: 'intervene', runId, item, stage });
    return item;
  }, []);


  const selectItem = useCallback((type, data) => {
    setSel({ type, data });
    if (window.matchMedia('(max-width:1100px)').matches) setRailOpen(true);
  }, []);
  const toast = useCallback((msg) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000);
  }, []);
  const toggleNav = useCallback(() => {
    setNavCollapsed((c) => {
      const n = !c;
      try { localStorage.setItem('wig-nav', n ? 'collapsed' : 'expanded'); } catch {}
      return n;
    });
  }, []);

  // Resolve routed objects fresh from the store every render, so reviews and
  // runs always see the latest (post-action) data.
  const copilotItem = route.reviewId ? findQueueItem(report, route.reviewId) : null;
  const runSc = route.runId ? findScenario(report, route.runId) : null;
  const immersive = !!(copilotItem || runSc);

  useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); if (!immersive) toggleNav(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [toggleNav, immersive]);

  const ctx = useMemo(() => ({
    report, active: route.active, setNav, sel, selectItem,
    copilot: copilotItem, openCopilot, closeCopilot,
    runview: runSc, openRun, closeRun, rvFrenOpen, setRvFrenOpen,
    actionItem, intervene, llmLive,
    navCollapsed, toggleNav, railOpen, setRailOpen, toast,
  }), [report, route.active, setNav, sel, selectItem, copilotItem, openCopilot, closeCopilot,
       runSc, openRun, closeRun, rvFrenOpen, actionItem, intervene, llmLive, navCollapsed, toggleNav, railOpen, toast]);

  if (error)
    return (
      <div className="loading-state">
        Could not load the demo report. <button className="retry-btn" onClick={() => location.reload()}>Retry</button>
      </div>
    );

  // Loading shell: render a bare topbar + skeleton until the report arrives,
  // so TopBar/Sidebar/Rail (which all read `report`) never mount with null.
  if (!report)
    return (
      <>
        <div className="grain" />
        <div className="app" id="app">
          <header className="topbar">
            <div className="tb-brand"><div className="tb-live-dot" /><div><div className="tb-wordmark">Wonderful<span>×</span>WIG</div></div></div>
          </header>
          <aside className="sidebar" id="sidebar" />
          <main className="main" id="main"><Skeleton /></main>
          <aside className="rail" id="rail" />
        </div>
      </>
    );

  const appCls = 'app' + (immersive ? ' copilot' : '') + (navCollapsed && !immersive ? ' nav-collapsed' : '');
  const ActiveView = VIEWS[route.active] || Overview;

  return (
    <AppCtx.Provider value={ctx}>
      <div className="grain" />
      <div className={appCls} id="app">
        <TopBar />
        {!immersive && <Sidebar />}
        <main className="main" id="main">
          {runSc ? <RunView sc={runSc} /> : copilotItem ? <Copilot item={copilotItem} /> : <ActiveView />}
        </main>
        {!immersive && <Rail />}
      </div>
      {!immersive && <FrenDock />}
      {report._offline && <div className="offline-pill" title="The FastAPI backend is not reachable; showing the bundled sample report.">◌ Standalone demo data</div>}
      <Toasts items={toasts} />
    </AppCtx.Provider>
  );
}
