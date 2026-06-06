import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../App.jsx';
import { buildSearchIndex, notifications } from '../lib/data.js';
import { gstTime } from '../lib/format.js';

export default function TopBar() {
  const app = useApp();
  const [time, setTime] = useState(gstTime());
  const [q, setQ] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const searchRef = useRef(null);
  const bellRef = useRef(null);
  const userRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const id = setInterval(() => setTime(gstTime()), 10000);
    return () => clearInterval(id);
  }, []);

  // Close popovers on outside click.
  useEffect(() => {
    const h = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setSearchOpen(false);
      if (bellRef.current && !bellRef.current.contains(e.target)) setBellOpen(false);
      if (userRef.current && !userRef.current.contains(e.target)) setUserOpen(false);
    };
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  }, []);

  // ⌘K focus search, Esc clears.
  useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); inputRef.current?.focus(); }
      if (e.key === 'Escape') { setSearchOpen(false); inputRef.current?.blur(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const actions = useMemo(
    () => ({ setNav: app.setNav, openCopilot: app.openCopilot, openRun: app.openRun }),
    [app.setNav, app.openCopilot, app.openRun]
  );
  const index = useMemo(() => buildSearchIndex(app.report, actions), [app.report, actions, app.report.snapshot.human_queue.length]);
  const notes = useMemo(() => notifications(app.report, actions), [app.report, actions, app.report.snapshot.human_queue]);

  const hits = q.trim() ? index.filter((x) => (x.t + ' ' + x.m + ' ' + x.group).toLowerCase().includes(q.trim().toLowerCase())).slice(0, 12) : [];
  let lastGroup = null;

  return (
    <header className="topbar">
      <button className="nav-toggle" id="nav-toggle" title="Toggle navigation (⌘B)" onClick={app.toggleNav}>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M2 4h12M2 8h12M2 12h12" /></svg>
      </button>
      <div className="tb-brand">
        <div className="tb-live-dot" />
        <div><div className="tb-wordmark">Wonderful<span>×</span>WIG</div></div>
      </div>

      <div className="tb-search" ref={searchRef}>
        <span className="tb-search-ic">⌕</span>
        <input
          ref={inputRef}
          type="text"
          id="tb-search-input"
          placeholder="Search feedback, brands, agents…"
          autoComplete="off"
          value={q}
          onChange={(e) => { setQ(e.target.value); setSearchOpen(true); }}
          onFocus={() => setSearchOpen(true)}
        />
        <kbd className="tb-kbd">⌘K</kbd>
        <div id="search-pop" style={{ display: searchOpen && q.trim() ? 'block' : 'none' }}>
          {searchOpen && q.trim() && (hits.length === 0 ? (
            <div className="sp-empty">No matches</div>
          ) : (
            hits.map((h, i) => {
              const showGroup = h.group !== lastGroup;
              lastGroup = h.group;
              return (
                <div key={i}>
                  {showGroup && <div className="sp-group">{h.group}</div>}
                  <div className="sp-item" onClick={() => { setSearchOpen(false); setQ(''); h.go(); }}>
                    <span className="sp-t">{h.t}</span>
                    <span className="sp-m">{h.m || ''}</span>
                  </div>
                </div>
              );
            })
          ))}
        </div>
      </div>

      <div className="tb-right">
        <div className="tb-badge"><span className="dot" />Live</div>

        <div className="tb-bell" id="tb-bell" style={{ position: 'relative' }} ref={bellRef} onClick={(e) => { e.stopPropagation(); setBellOpen((o) => !o); }}>
          ◉<span className="tb-bell-count" id="bell-count" style={{ display: notes.length ? '' : 'none' }}>{notes.length}</span>
          {bellOpen && (
            <div className="bell-pop">
              <div className="bell-head">Notifications · {notes.length}</div>
              {notes.length === 0 && <div className="bell-empty">Nothing needs your attention.</div>}
              {notes.map((nt, i) => (
                <div className="bell-item" key={i} onClick={() => { setBellOpen(false); nt.go(); }}>
                  <span className="bell-dot2" style={{ background: nt.color }} />
                  <div><div className="bell-t">{nt.t}</div><div className="bell-s">{nt.s}</div></div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="tb-user" ref={userRef} style={{ position: 'relative' }} onClick={(e) => { e.stopPropagation(); setUserOpen((o) => !o); }}>
          <div className="tb-avatar">AA</div>
          <div><div className="tb-uname">Ahmed Al-Mansoori</div><div className="tb-urole">Dept Head · All Brands</div></div>
          {userOpen && (
            <div className="user-pop">
              <div className="up-head">Ahmed Al-Mansoori</div>
              <div className="up-row"><span className="k">Role</span><span className="v">Dept Head</span></div>
              <div className="up-row"><span className="k">Scope</span><span className="v">All Brands</span></div>
              <div className="up-row"><span className="k">Session</span><span className="v">demo · no real auth</span></div>
            </div>
          )}
        </div>

        <div className="tb-time" id="tb-time">{time}</div>
      </div>
    </header>
  );
}
