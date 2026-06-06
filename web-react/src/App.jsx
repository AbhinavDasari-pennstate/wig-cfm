import { createContext, useContext, useCallback, useEffect, useState } from 'react';
import { api } from './lib/data.js';
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

const Skeleton = () => (
  <div className="sk">
    <div className="sk-row"><div className="sk-box" /><div className="sk-box" /><div className="sk-box" /><div className="sk-box" /></div>
    <div className="sk-row"><div className="sk-box tall" /></div>
  </div>
);

export default function App() {
  const [report, setReport] = useState(null);
  const [error, setError] = useState(false);
  const [active, setActive] = useState(() => (location.hash || '#overview').slice(1) || 'overview');
  const [sel, setSel] = useState(null);            // rail selection {type, data}
  const [copilot, setCopilot] = useState(null);    // queue item under review
  const [runview, setRunview] = useState(null);    // scenario in immersive view
  const [rvFrenOpen, setRvFrenOpen] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(() => {
    try { return localStorage.getItem('wig-nav') === 'collapsed'; } catch { return false; }
  });
  const [railOpen, setRailOpen] = useState(false); // mobile drawer
  const [toasts, setToasts] = useState([]);
  const [, setTick] = useState(0);
  const bump = useCallback(() => setTick((t) => t + 1), []); // re-render after in-place report mutations

  useEffect(() => { api.fetchReport().then(setReport).catch(() => setError(true)); }, []);

  const setNav = useCallback((key) => {
    setActive(key); setSel(null); setCopilot(null); setRunview(null); setRailOpen(false);
    history.replaceState(null, '', '#' + key);
  }, []);
  const selectItem = useCallback((type, data) => {
    setSel({ type, data });
    if (window.matchMedia('(max-width:1100px)').matches) setRailOpen(true);
  }, []);
  const openCopilot = useCallback((item) => { setRunview(null); setCopilot(item); }, []);
  const closeCopilot = useCallback(() => setCopilot(null), []);
  const openRun = useCallback((sc) => { setActive('runs'); setCopilot(null); setRvFrenOpen(false); setRunview(sc); }, []);
  const closeRun = useCallback(() => { setRunview(null); setRvFrenOpen(false); }, []);
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

  const immersive = !!(copilot || runview);

  useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); if (!immersive) toggleNav(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [toggleNav, immersive]);

  if (error)
    return (
      <div className="loading-state">
        Could not reach <span className="mono">/api/demo</span> — run <span className="mono">make run</span> or <span className="mono">uvicorn orchestrator.main:app</span>
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

  const ctx = {
    report, bump, active, setNav, sel, selectItem,
    copilot, openCopilot, closeCopilot,
    runview, openRun, closeRun, rvFrenOpen, setRvFrenOpen,
    navCollapsed, toggleNav, railOpen, setRailOpen, toast,
  };

  const appCls = 'app' + (immersive ? ' copilot' : '') + (navCollapsed && !immersive ? ' nav-collapsed' : '');
  const ActiveView = VIEWS[active] || Overview;

  return (
    <AppCtx.Provider value={ctx}>
      <div className="grain" />
      <div className={appCls} id="app">
        <TopBar />
        {!immersive && <Sidebar />}
        <main className="main" id="main">
          {runview ? <RunView sc={runview} /> : copilot ? <Copilot item={copilot} /> : <ActiveView />}
        </main>
        {!immersive && <Rail />}
      </div>
      {!immersive && <FrenDock />}
      <Toasts items={toasts} />
    </AppCtx.Provider>
  );
}
