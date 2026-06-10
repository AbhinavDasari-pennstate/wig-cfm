import { useState } from 'react';
import { press } from '../lib/a11y.js';
import { useApp } from '../App.jsx';
import { BRAND_REGIONS, SKU_NAMES } from '../lib/constants.js';
import { getAlerts, pendingQueue } from '../lib/data.js';
import { fmtCSAT, fmtNPS, csatClass, npsClass, trendArrow, timeAgo, greeting, isHighPriority } from '../lib/format.js';
import { TrendPanel, ChannelPanel } from '../components/Panels.jsx';

export default function Overview() {
  const { report, setNav, selectItem } = useApp();
  const [insightIdx, setInsightIdx] = useState(0);

  const bm = report.brand_metrics || {};
  const pw = report.prior_week_metrics || {};
  const brands = Object.entries(bm);
  const ss = report.safety_summary;
  const queue = pendingQueue(report);
  const alerts = getAlerts(report);

  const avg = (sel) => (brands.length ? brands.reduce((a, [, m]) => a + sel(m), 0) / brands.length : 0);
  const avgCSAT = avg((m) => m.csat);
  const avgNPS = Math.round(avg((m) => m.nps));
  const avgCES = avg((m) => m.ces);
  const pwB = Object.values(pw);
  const prev = (sel) => (pwB.length ? pwB.reduce((a, m) => a + sel(m), 0) / pwB.length : null);
  const prevCSAT = prev((m) => m.csat);
  const prevNPS = pwB.length ? Math.round(prev((m) => m.nps)) : null;
  const prevCES = prev((m) => m.ces);
  const totalTickets = brands.reduce((a, [, m]) => a + m.tickets, 0);

  const kpis = [
    { k: 'Avg CSAT', v: fmtCSAT(avgCSAT), trend: trendArrow(avgCSAT, prevCSAT), sub: '/5.0', cls: csatClass(avgCSAT) },
    { k: 'Avg NPS', v: fmtNPS(avgNPS), trend: trendArrow(avgNPS, prevNPS), sub: '', cls: npsClass(avgNPS) },
    { k: 'Avg CES', v: fmtCSAT(avgCES), trend: trendArrow(avgCES, prevCES), sub: '/5.0', cls: csatClass(avgCES) },
    { k: 'Queue Depth', v: queue.length, trend: { sym: '', cls: 'flat', note: 'items pending' }, sub: '', cls: '' },
  ];

  const daily = report.daily_trend || [];
  const mix = report.channel_mix || {};
  const top = alerts.length ? alerts[insightIdx % alerts.length] : null;

  return (
    <div>
      <div className="sec-head">
        <div className="sec-crumb">Overview · All Brands</div>
        <div className="sec-title">{greeting()}, Ahmed.</div>
        <div className="sec-sub">{totalTickets} feedback tickets this week · {alerts.length} quality alert{alerts.length !== 1 ? 's' : ''} · {queue.length} awaiting approval · {ss.manipulation_attempts_contained} safety event{ss.manipulation_attempts_contained !== 1 ? 's' : ''} contained</div>
      </div>

      <div className="sec-body section-animate">
        {top && (
          <div className="insight-card">
            <div className="ins-top">
              <span className="ins-badge">⚠ VELOCITY ALERT</span>
              <span className="ins-tag">grounded · cited</span>
            </div>
            <div className="ins-body">
              {alerts.length === 1 ? '1 product' : alerts.length + ' products'} flagged before volume thresholds would trigger{alerts.length > 1 ? '.' : `: ${top.brand} ${top.sku}.`}
            </div>
            <div className="ins-detail">
              {alerts.length > 1 ? (
                alerts.map((a, i) => (
                  <span key={i}>
                    {i > 0 && '  ·  '}
                    <b style={{ color: 'rgba(255,255,255,.75)' }}>{a.brand} {a.sku}</b>: {a.velocity_pct == null ? '∞% (new SKU)' : '+' + a.velocity_pct + '%'} velocity — {a.recent} in 3d, {a.total} total
                  </span>
                ))
              ) : (
                <span>
                  <b style={{ color: 'rgba(255,255,255,.75)' }}>{top.brand} {top.sku}</b>: {top.velocity_pct == null ? 'new SKU, no prior baseline' : `prior 3d ${top.prior}, recent 3d ${top.recent} (+${top.velocity_pct || '∞'}%)`} — {top.total} total, under the volume-15 threshold.
                </span>
              )}
            </div>
            <div className="ins-chips">
              <span className="ins-chip primary" {...press(() => setNav('quality'))}>Open Quality Alerts →</span>
              <span className="ins-chip" {...press(() => setNav('runs'))}>View agent runs</span>
            </div>
            {alerts.length > 1 && (
              <div className="ins-nav">
                <button className="ins-nav-btn" onClick={() => setInsightIdx((i) => Math.max(0, i - 1))}>◁</button>
                <button className="ins-nav-btn" onClick={() => setInsightIdx((i) => (i + 1) % alerts.length)}>▷</button>
              </div>
            )}
          </div>
        )}

        <div className="kpi-row">
          {kpis.map((t) => (
            <div className="kpi-tile" key={t.k}>
              <div className="kpi-k">{t.k}</div>
              <div className={'kpi-v ' + t.cls}>{t.v}<span style={{ fontSize: '14px', color: 'var(--faint)', fontFamily: 'var(--sans)', fontWeight: 400 }}>{t.sub}</span></div>
              <div className="kpi-trend"><span className={'arrow ' + t.trend.cls}>{t.trend.sym}</span><span className="label">{t.trend.note} vs last week</span></div>
            </div>
          ))}
        </div>

        {(daily.length || Object.keys(mix).length) > 0 && (
          <div className="trend-row">
            {daily.length > 0 && <TrendPanel daily={daily} />}
            {Object.keys(mix).length > 0 && <ChannelPanel mix={mix} />}
          </div>
        )}

        <div className="brand-table">
          <div className="bt-head"><span>Brand</span><span>Tickets</span><span>CSAT</span><span>NPS</span><span>CES</span><span>Trend</span></div>
          {brands.map(([name, m]) => {
            const p = pw[name];
            const tr = trendArrow(m.nps, p ? p.nps : null);
            return (
              <div className="bt-row" key={name} {...press(() => selectItem('brand', { name, m, p }))}>
                <div className="bt-brand">{name}<span className="region">{BRAND_REGIONS[name] || ''}</span></div>
                <div className="bt-val" style={{ fontSize: '14px' }}>{m.tickets}</div>
                <div className={'bt-val ' + csatClass(m.csat)}>{fmtCSAT(m.csat)}</div>
                <div className={'bt-val ' + npsClass(m.nps)}>{fmtNPS(m.nps)}</div>
                <div className={'bt-val ' + csatClass(m.ces)}>{fmtCSAT(m.ces)}</div>
                <div className="bt-trend"><span className="arrow" style={{ fontWeight: 700, color: 'var(--faint)' }}>{tr.sym}</span><span style={{ fontSize: '11px', color: 'var(--faint)', marginLeft: '3px' }}>{tr.note}</span></div>
              </div>
            );
          })}
        </div>

        {queue.length > 0 && (
          <div className="queue-preview">
            <div className="qp-head">
              <span className="title">Human Queue</span>
              <span className="qp-head link" onClick={() => setNav('queue')}>View all →</span>
            </div>
            {queue.slice(0, 3).map((item, i) => {
              const isProc = item.type === 'PROCUREMENT_APPROVAL';
              const name = isProc ? SKU_NAMES[item.sku] || item.sku : item.product || 'Warranty claim';
              const meta = isProc ? item.store : `${item.brand} · AED ${item.declared_value_aed}`;
              return (
                <div className="qp-row" key={i} {...press(() => setNav('queue'))}>
                  <div><span className={'badge ' + (isProc ? 'brass' : 'teal')}>{isProc ? 'Procurement' : 'Warranty'}</span></div>
                  {isHighPriority(item) && <div><span className="badge blood">HIGH</span></div>}
                  <div className="qp-info"><div className="qp-name">{name}</div><div className="qp-meta">{meta}</div></div>
                  <div className="qp-age">{timeAgo(item.ts)}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
