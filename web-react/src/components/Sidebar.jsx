import { useApp } from '../App.jsx';
import { NAV_ITEMS } from '../lib/constants.js';
import { pendingQueue } from '../lib/data.js';

function badgeCount(item, report) {
  if (item.badge === 'alerts') return (report.snapshot.quality_alerts || []).length || null;
  if (item.badge === 'queue') return pendingQueue(report).length || null;
  return null;
}

// Recognizable line icon per nav item (16px, inherits the item's accent colour).
const ICONS = {
  overview: <><rect x="2" y="2" width="5" height="5" rx="1" /><rect x="9" y="2" width="5" height="5" rx="1" /><rect x="2" y="9" width="5" height="5" rx="1" /><rect x="9" y="9" width="5" height="5" rx="1" /></>,
  quality: <><path d="M8 2.3l5.6 10.4H2.4z" /><path d="M8 6.6v3" /><path d="M8 11.4h.01" /></>,
  queue: <><rect x="2.5" y="3.5" width="11" height="9" rx="1.3" /><path d="M2.5 9h3l1 1.4h3L10.5 9h3" /></>,
  runs: <path d="M1.5 8h3l1.8-4.6L9 12.6l1.7-4.6h3" />,
  guardrails: <><path d="M8 1.8l5 1.9v3.6c0 3-2.1 4.8-5 5.9-2.9-1.1-5-2.9-5-5.9V3.7z" /><path d="M5.9 8l1.5 1.5L10.3 6.6" /></>,
  loop: <><path d="M13 8a5 5 0 1 1-1.5-3.55" /><path d="M13.4 3v2.4h-2.4" /></>,
};

function NavIcon({ name, color }) {
  return (
    <span className="sb-ico" style={{ color }}>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {ICONS[name]}
      </svg>
    </span>
  );
}

export default function Sidebar() {
  const { report, active, setNav } = useApp();
  return (
    <aside className="sidebar" id="sidebar">
      <div className="sb-section">
        {NAV_ITEMS.map((item) => {
          const count = badgeCount(item, report);
          return (
            <div
              key={item.key}
              className={'sb-item' + (item.key === active ? ' active' : '')}
              title={item.label}
              onClick={() => setNav(item.key)}
            >
              <NavIcon name={item.key} color={item.dot} />
              <span className="sb-label">{item.label}</span>
              {count && <span className={'sb-badge' + (item.key === 'queue' ? ' brass' : '')}>{count}</span>}
            </div>
          );
        })}
      </div>
      <div className="sb-footer">
        <div className="sb-seal">
          <div className="sb-seal-k">Autonomous spend</div>
          <div className="sb-seal-n">{report.safety_summary.purchase_orders_created}</div>
          <div className="sb-seal-s">purchase orders placed by an agent this session</div>
        </div>
      </div>
    </aside>
  );
}
