import { useState } from 'react';
import { press } from '../lib/a11y.js';
import { useApp } from '../App.jsx';
import { getAlerts } from '../lib/data.js';

export default function Quality() {
  const { report, sel, selectItem } = useApp();
  const [filter, setFilter] = useState('all');
  const alerts = getAlerts(report);
  const qAlerts = report.snapshot.quality_alerts || [];

  // The alert payload distinguishes new-SKU clusters (no baseline →
  // velocity_pct == null) from true velocity spikes. The old filter keyed on a
  // `type` field the data never carries, so both sub-tabs were always empty.
  const kindOf = (a) => (a.velocity_pct == null ? 'new_sku' : 'spike');
  const tabs = [
    { key: 'all', label: 'All', n: alerts.length },
    { key: 'new_sku', label: 'New SKU', n: alerts.filter((a) => kindOf(a) === 'new_sku').length },
    { key: 'spike', label: 'Velocity Spike', n: alerts.filter((a) => kindOf(a) === 'spike').length },
  ];
  const filtered = filter === 'all' ? alerts : alerts.filter((a) => kindOf(a) === filter);

  return (
    <div>
      <div className="sec-head">
        <div className="sec-crumb">Quality Intelligence · Agent 3</div>
        <div className="sec-title">Quality Alerts</div>
        <div className="sec-sub">Daily scan · {alerts.length} velocity alert{alerts.length !== 1 ? 's' : ''} · {qAlerts.length} total alert{qAlerts.length !== 1 ? 's' : ''} raised{qAlerts.length ? ' · Last scan: 06:00 GST' : ''}</div>
      </div>

      <div className="filter-tabs">
        {tabs.map((t) => (
          <div key={t.key} className={'ftab' + (filter === t.key ? ' active' : '')} {...press(() => setFilter(t.key))}>
            {t.label}<span className="cnt">{t.n}</span>
          </div>
        ))}
      </div>

      <div className="sec-body section-animate">
        {filtered.length === 0 ? (
          <div>No alerts matching this filter.</div>
        ) : (
          filtered.map((alert) => {
            const isNew = alert.velocity_pct == null;
            const active = sel && sel.type === 'alert' && sel.data.alert_id === alert.alert_id;
            return (
              <div
                key={alert.alert_id}
                className={'alert-card' + (isNew ? ' blood' : '') + (active ? ' active' : '')}
                {...press(() => selectItem('alert', alert), { 'aria-pressed': active })}
              >
                <div className="ac-top">
                  <span className={'badge ' + (isNew ? 'blood' : 'brass')}>{isNew ? 'NEW SKU' : 'VELOCITY SPIKE'}</span>
                  <span style={{ fontSize: '12.5px', fontWeight: 600 }}>{alert.brand} · <span className="mono">{alert.sku || alert.product_sku}</span>{alert.category ? ' · ' + alert.category : ''}</span>
                </div>
                <div className="ac-grid">
                  <div className="ac-stat"><div className="k">Prior 3d</div><div className="v">{alert.prior ?? 0}</div></div>
                  <div className="ac-stat"><div className="k">Recent 3d</div><div className="v" style={{ color: 'var(--blood)' }}>{alert.recent ?? alert.ticket_count ?? '—'}</div></div>
                  <div className="ac-stat"><div className="k">Change</div><div className="v" style={{ color: 'var(--blood)' }}>{alert.velocity_pct != null ? '+' + alert.velocity_pct + '%' : '∞'}</div></div>
                  <div className="ac-stat"><div className="k">Total (7d)</div><div className="v">{alert.total ?? alert.ticket_count ?? '—'}</div></div>
                  <div className="ac-stat"><div className="k">Vol-15</div><div className="v" style={{ color: 'var(--faint)', fontSize: '12px' }}>UNDER</div></div>
                </div>
                {alert.description && <div className="ac-desc">"{alert.description}"</div>}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
