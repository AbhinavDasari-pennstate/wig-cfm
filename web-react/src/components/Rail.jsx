import { useEffect, useRef, useState } from 'react';
import { press } from '../lib/a11y.js';
import { useApp } from '../App.jsx';
import { BRAND_REGIONS, SKU_NAMES } from '../lib/constants.js';
import { getAlerts, pendingQueue, brandSnapshot } from '../lib/data.js';
import { csatClass, npsClass, fmtCSAT, fmtNPS, trendArrow, channelLabel, langLabel, isHighPriority } from '../lib/format.js';

/* ── nothing-selected per-section briefing ── */
function briefing(active, report) {
  const bm = report.brand_metrics || {};
  const brands = Object.keys(bm);
  const alerts = getAlerts(report);
  const queue = pendingQueue(report);
  const high = queue.filter(isHighPriority).length;
  const ss = report.safety_summary || {};

  if (active === 'quality') {
    const aBrands = [...new Set(alerts.map((a) => a.brand))];
    return {
      crumb: 'Quality · Agent 3', title: 'Scan summary', sub: 'Daily scan · 06:00 GST',
      stats: [{ k: 'Velocity alerts', v: alerts.length, cls: alerts.length ? 'neg' : '' }, { k: 'Brands hit', v: aBrands.length }],
      sections: [{ k: 'Flagged products', rows: alerts.map((a) => [`${a.brand} ${a.sku || a.product_sku}`, a.velocity_pct == null ? 'new SKU' : '+' + a.velocity_pct + '%']) }],
      hint: 'Select an alert to inspect the cluster.',
    };
  }
  if (active === 'queue') {
    const proc = queue.filter((i) => i.type === 'PROCUREMENT_APPROVAL').length;
    const warr = queue.filter((i) => i.type === 'WARRANTY_FULFILLMENT').length;
    return {
      crumb: 'Human-in-the-loop', title: 'Queue summary', sub: 'Agents drafted every reply',
      stats: [{ k: 'Pending', v: queue.length }, { k: 'High priority', v: high, cls: high ? 'neg' : '' }],
      sections: [{ k: 'By type', rows: [['Procurement', proc], ['Warranty', warr]] }],
      hint: 'Open an item to work it with fren.',
    };
  }
  if (active === 'runs') {
    const sc = report.scenarios || [];
    const ch = report.channel_breakdown || {};
    return {
      crumb: 'Agent activity', title: 'Run summary', sub: 'All agents · today',
      stats: [{ k: 'Runs', v: sc.length }, { k: 'Failures', v: 0, cls: 'pos' }],
      sections: [{ k: 'Channels', rows: Object.entries(ch).map(([c, n]) => [channelLabel(c), n]) }],
      hint: 'Select a run to see its full trace.',
    };
  }
  if (active === 'guardrails') {
    return {
      crumb: 'Trust & safety', title: 'Safety posture', sub: "Propose, don't transact",
      stats: [{ k: 'POs auto-created', v: ss.purchase_orders_created ?? 0, cls: 'pos' }, { k: 'Txn tools wired', v: ss.transactional_tools_available ?? 0, cls: 'pos' }],
      sections: [{ k: 'This session', rows: [['Manipulation contained', ss.manipulation_attempts_contained ?? 0], ['HITL escalations', ss.human_approval_tasks ?? 0]] }],
      hint: 'The guarantee holds because the capability is absent.',
    };
  }
  if (active === 'loop') {
    const rows = report.closed_loop || [];
    const csats = rows.map((r) => r.csat).filter((v) => v != null);
    const avg = csats.length ? (csats.reduce((a, b) => a + b, 0) / csats.length).toFixed(1) : '—';
    return {
      crumb: 'Resolution', title: 'Closed-loop summary', sub: 'Written back to SAP',
      stats: [{ k: 'Loops closed', v: rows.length }, { k: 'Avg CSAT', v: avg, cls: csatClass(parseFloat(avg) || 0) }],
      sections: [{ k: 'Record', rows: [['System of record', 'SAP'], ['Owned by agents', 'No']] }],
      hint: 'Select a case to see the SAP write-back.',
    };
  }
  const topAlert = alerts[0];
  const watch = brands.length ? brands.map((x) => [x, bm[x].nps]).sort((a, b) => a[1] - b[1])[0] : null;
  return {
    crumb: 'Overview · all brands', title: "Today's briefing", sub: 'Snapshot across all brands',
    stats: [{ k: 'Quality alerts', v: alerts.length, cls: alerts.length ? 'neg' : '' }, { k: 'Awaiting you', v: queue.length, cls: high ? 'neu' : '' }],
    sections: [{ k: 'Where to look', rows: [
      ['Top alert', topAlert ? `${topAlert.brand} ${topAlert.sku || topAlert.product_sku}` : 'none'],
      ['Watch brand', watch ? `${watch[0]} (${fmtNPS(watch[1])})` : '—'],
      ['High priority', high],
      ['Safety contained', ss.manipulation_attempts_contained ?? 0],
      ['Last scan', '06:00 GST'],
    ] }],
    hint: 'Click any brand or queue row for full detail.',
  };
}

function RailEmpty({ active, report }) {
  const b = briefing(active, report);
  return (
    <>
      <div className="rail-head">
        <div className="rail-crumb">{b.crumb}</div>
        <div className="rail-title">{b.title}</div>
        <div className="rail-sub">{b.sub}</div>
      </div>
      <div className="rail-body">
        {b.stats && (
          <div className="stat-pair">
            {b.stats.map((s, i) => (
              <div className="stat-box" key={i}><div className="k">{s.k}</div><div className={'v ' + (s.cls || '')}>{s.v}</div></div>
            ))}
          </div>
        )}
        {b.sections.map((s, i) => s.rows.length > 0 && (
          <div className="rail-section" key={i}>
            <div className="rail-section-k">{s.k}</div>
            {s.rows.map((r, j) => (
              <div className="rail-kv" key={j}><span className="k">{r[0]}</span><span className="v">{r[1]}</span></div>
            ))}
          </div>
        ))}
        <div className="propose-note">{b.hint}</div>
      </div>
    </>
  );
}

function RailBrand({ data }) {
  const { report, setNav, openCopilot } = useApp();
  const { name, m, p } = data;
  const trC = trendArrow(m.csat, p ? p.csat : null);
  const trN = trendArrow(m.nps, p ? p.nps : null);
  const trE = trendArrow(m.ces, p ? p.ces : null);
  const snap = brandSnapshot(report, name);
  const maxCat = snap.byCategory.length ? snap.byCategory[0][1] : 1;
  return (
    <>
      <div className="rail-head">
        <div className="rail-crumb">Brand Detail</div>
        <div className="rail-title">{name}</div>
        <div className="rail-sub">{BRAND_REGIONS[name] || ''} · {m.tickets} tickets this week</div>
      </div>
      <div className="rail-body">
        <div className="rail-section">
          <div className="rail-section-k">This week</div>
          <div className="stat-pair">
            <div className="stat-box"><div className="k">CSAT</div><div className={'v ' + csatClass(m.csat)}>{fmtCSAT(m.csat)}</div></div>
            <div className="stat-box"><div className="k">NPS</div><div className={'v ' + npsClass(m.nps)}>{fmtNPS(m.nps)}</div></div>
          </div>
          <div className="stat-pair">
            <div className="stat-box"><div className="k">CES</div><div className={'v ' + csatClass(m.ces)}>{fmtCSAT(m.ces)}</div></div>
            <div className="stat-box"><div className="k">Tickets</div><div className="v">{m.tickets}</div></div>
          </div>
        </div>
        {p && (
          <div className="rail-section">
            <div className="rail-section-k">vs prior week</div>
            <div className="rail-kv"><span className="k">CSAT</span><span className="v"><span className={'arrow ' + trC.cls}>{trC.sym}</span> {trC.note} (was {fmtCSAT(p.csat)})</span></div>
            <div className="rail-kv"><span className="k">NPS</span><span className="v"><span className={'arrow ' + trN.cls}>{trN.sym}</span> {trN.note} (was {fmtNPS(p.nps)})</span></div>
            <div className="rail-kv"><span className="k">CES</span><span className="v"><span className={'arrow ' + trE.cls}>{trE.sym}</span> {trE.note} (was {fmtCSAT(p.ces)})</span></div>
          </div>
        )}
        {snap.byCategory.length > 0 && (
          <div className="rail-section">
            <div className="rail-section-k">Category mix · all recorded cases</div>
            {snap.byCategory.map(([cat, n]) => (
              <div className="cat-bar" key={cat}>
                <span className="cb-label">{cat.replace(/_/g, ' ').toLowerCase()}</span>
                <span className="cb-track"><span className="cb-fill" style={{ width: Math.max(8, (n / maxCat) * 100) + '%' }} /></span>
                <span className="cb-n">{n}</span>
              </div>
            ))}
            {snap.rec && (
              <div className="rail-kv" style={{ marginTop: 6 }}>
                <span className="k">Resolution rate</span>
                <span className="v">{Math.round((snap.rec.resolved / Math.max(1, snap.rec.total)) * 100)}% ({snap.rec.resolved}/{snap.rec.total})</span>
              </div>
            )}
          </div>
        )}
        {(snap.alerts.length > 0 || snap.queueItems.length > 0) && (
          <div className="rail-section">
            <div className="rail-section-k">Needs attention now</div>
            {snap.alerts.map((a, i) => (
              <div className="rail-kv link" key={'a' + i} {...press(() => setNav('quality'))}>
                <span className="k">⚠ {a.sku || a.product_sku}</span>
                <span className="v" style={{ color: 'var(--blood)', fontWeight: 600 }}>{a.velocity_pct == null ? 'new-SKU spike' : '+' + a.velocity_pct + '%'}</span>
              </div>
            ))}
            {snap.queueItems.map((item, j) => (
              <div className="rail-kv link" key={'q' + j} {...press(() => openCopilot(item))}>
                <span className="k">◷ {item.workflow_task_id}</span>
                <span className="v">{item.type === 'PROCUREMENT_APPROVAL' ? 'awaiting buyer' : 'awaiting desk'} →</span>
              </div>
            ))}
            <div className="propose-note">Open an item to review and approve — agents don't transact.</div>
          </div>
        )}
      </div>
    </>
  );
}

function RailAlert({ alert, report, toast }) {
  const watchList = report.scenarios.find((s) => s.id === 'velocity_digest')?.result?.watch_list || [];
  const watchEntry = watchList.find((w) => w.includes(alert.sku || alert.product_sku)) || '';
  const isNew = alert.velocity_pct == null;
  // Proposed-state lives in React (keyed per alert), not in DOM attributes —
  // the old DOM mutation leaked "done" state across alerts on node reuse.
  const [proposed, setProposed] = useState({});
  useEffect(() => setProposed({}), [alert.alert_id]);
  const onChip = (label) => {
    if (proposed[label]) return;
    const team = label.toLowerCase().includes('product') ? 'the Product Team' : 'Quality Review';
    toast(`Proposed to ${team} — ${alert.brand} ${alert.sku || alert.product_sku}. A person will action it.`);
    setProposed((p) => ({ ...p, [label]: true }));
  };
  const Chip = ({ label, sub }) => (
    <div className="action-chip" style={proposed[label] ? { opacity: 0.6 } : undefined} {...press(() => onChip(label), { 'aria-pressed': !!proposed[label] })}>
      <div><div className="label">{label}</div><div className="sub">{sub}</div></div>
      <span>{proposed[label] ? '✓' : '→'}</span>
    </div>
  );
  return (
    <>
      <div className="rail-head">
        <div className="rail-crumb">Quality Alert · {isNew ? 'New SKU' : 'Velocity Spike'}</div>
        <div className="rail-title">{alert.brand} — <span className="mono">{alert.sku || alert.product_sku}</span></div>
        <div className="rail-sub">{alert.category || 'PRODUCT_QUALITY'} · Detected 06:00 GST</div>
      </div>
      <div className="rail-body">
        <div className="rail-section">
          <div className="rail-section-k">Spike detail</div>
          <div className="stat-pair">
            <div className="stat-box"><div className="k">Prior 3d</div><div className="v">{alert.prior ?? 0}</div></div>
            <div className="stat-box"><div className="k">Recent 3d</div><div className="v" style={{ color: 'var(--blood)' }}>{alert.recent ?? alert.ticket_count ?? '—'}</div></div>
          </div>
          <div className="rail-kv"><span className="k">Change</span><span className="v" style={{ color: 'var(--blood)', fontWeight: 700 }}>{alert.velocity_pct != null ? '+' + alert.velocity_pct + '%' : '∞'}</span></div>
          <div className="rail-kv"><span className="k">Total (7d)</span><span className="v">{alert.total ?? alert.ticket_count ?? '—'} tickets</span></div>
          <div className="rail-kv"><span className="k">Vol-15 threshold</span><span className="v" style={{ color: 'var(--teal)' }}>UNDER — would be silent</span></div>
        </div>
        {watchEntry && (
          <div className="rail-section"><div className="rail-section-k">Watch list entry</div><div style={{ fontSize: '12px', color: 'var(--dim)', fontStyle: 'italic', lineHeight: 1.5 }}>"{watchEntry}"</div></div>
        )}
        <div className="rail-section">
          <div className="rail-section-k">Recommended actions</div>
          <div className="action-chips">
            <Chip label="Notify Product Team" sub="Raise awareness of quality signal" />
            <Chip label="Escalate to Quality Review" sub="Open formal investigation" />
          </div>
          <div className="propose-note">Proposing notifies a person — agents don't transact</div>
        </div>
      </div>
    </>
  );
}

function RailLoop({ r }) {
  return (
    <>
      <div className="rail-head"><div className="rail-crumb">Closed Loop</div><div className="rail-title">{SKU_NAMES[r.product] || r.product}</div><div className="rail-sub">{r.brand} · {r.category}</div></div>
      <div className="rail-body">
        <div className="rail-section"><div className="rail-section-k">Resolution scores</div>
          <div className="stat-pair"><div className="stat-box"><div className="k">CSAT</div><div className={'v ' + (r.csat != null ? csatClass(r.csat) : '')}>{r.csat ?? '—'}</div></div><div className="stat-box"><div className="k">NPS</div><div className={'v ' + (r.nps != null ? npsClass(r.nps) : '')}>{r.nps != null ? fmtNPS(r.nps) : '—'}</div></div></div>
          <div className="stat-pair"><div className="stat-box"><div className="k">CES</div><div className="v">{r.ces ?? '—'}</div></div><div className="stat-box"><div className="k">Channel</div><div className="v" style={{ fontSize: '14px' }}>{channelLabel(r.channel)}</div></div></div>
        </div>
        <div className="rail-section"><div className="rail-section-k">SAP write-back</div><div className="rail-kv"><span className="k">Ticket</span><span className="v mono">{r.sap_ticket_id || '—'}</span></div><div className="rail-kv"><span className="k">Language</span><span className="v">{langLabel(r.language)}</span></div></div>
        {r.notes && <div className="rail-section"><div className="rail-section-k">Resolution notes</div><div className="doc-rec">{r.notes}</div></div>}
      </div>
    </>
  );
}

export default function Rail() {
  const { report, active, sel, railOpen, setRailOpen, toast } = useApp();
  const ref = useRef(null);
  useEffect(() => {
    if (!railOpen) return;
    const h = (e) => {
      if (ref.current && !ref.current.contains(e.target) && !e.target.closest('.data-row,.bt-row,.alert-card,.qp-row,.cl-row')) setRailOpen(false);
    };
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  }, [railOpen, setRailOpen]);

  let body;
  if (!sel) body = <RailEmpty active={active} report={report} />;
  else if (sel.type === 'brand') body = <RailBrand data={sel.data} />;
  else if (sel.type === 'alert') body = <RailAlert alert={sel.data} report={report} toast={toast} />;
  else if (sel.type === 'loop') body = <RailLoop r={sel.data} />;
  else body = <RailEmpty active={active} report={report} />;

  return <aside className={'rail' + (railOpen ? ' open' : '')} id="rail" ref={ref}>{body}</aside>;
}
