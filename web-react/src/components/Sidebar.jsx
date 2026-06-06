import { useApp } from '../App.jsx';
import { NAV_ITEMS } from '../lib/constants.js';
import { pendingQueue } from '../lib/data.js';

function badgeCount(item, report) {
  if (item.badge === 'alerts') return (report.snapshot.quality_alerts || []).length || null;
  if (item.badge === 'queue') return pendingQueue(report).length || null;
  return null;
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
              <span className="sb-dot" style={{ background: item.dot }} />
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
