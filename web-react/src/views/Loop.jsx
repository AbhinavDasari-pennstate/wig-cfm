import { useApp } from '../App.jsx';
import { press } from '../lib/a11y.js';
import { SKU_NAMES } from '../lib/constants.js';
import { csatClass, npsClass, fmtNPS, channelLabel } from '../lib/format.js';

export default function Loop() {
  const { report, sel, selectItem } = useApp();
  const rows = report.closed_loop || [];

  const header = (
    <div className="sec-head">
      <div className="sec-crumb">Resolution · Written back to SAP</div>
      <div className="sec-title">Closed Loop</div>
      <div className="sec-sub">Resolved cases with CSAT / NPS / CES written back to SAP — agents propose and record; they are not the system of record.</div>
    </div>
  );

  if (!rows.length) {
    return (
      <div>
        {header}
        <div className="sec-body section-animate">
          <div className="rail-empty" style={{ height: '40vh' }}>
            <div className="re-icon">◷</div>
            <div className="re-title">No closed loops yet</div>
            <div className="re-sub">Resolutions appear here once agents write scores back to SAP.</div>
          </div>
        </div>
      </div>
    );
  }

  const csats = rows.map((r) => r.csat).filter((v) => v != null);
  const avg = csats.length ? (csats.reduce((a, b) => a + b, 0) / csats.length).toFixed(1) : '—';

  return (
    <div>
      {header}
      <div className="sec-body section-animate">
        <div className="cl-kpis">
          <div className="cl-kpi"><div className="k">Loops closed</div><div className="v">{rows.length}</div><div className="s">surveys + scores written to SAP</div></div>
          <div className="cl-kpi"><div className="k">Avg resolution CSAT</div><div className={'v ' + csatClass(parseFloat(avg) || 0)}>{avg}</div><div className="s">across closed cases</div></div>
          <div className="cl-kpi"><div className="k">System of record</div><div className="v">SAP</div><div className="s">agents record, never own the data</div></div>
        </div>

        <div className="cl-list">
          <div className="cl-th"><span>Case</span><span>Channel</span><span>CSAT</span><span>NPS</span><span>CES</span><span>SAP write-back</span></div>
          {rows.map((r, i) => {
            const name = SKU_NAMES[r.product] || r.product;
            const active = sel && sel.type === 'loop' && sel.data.sap_ticket_id === r.sap_ticket_id;
            return (
              <div className={'cl-row' + (active ? ' active' : '')} key={i} {...press(() => selectItem('loop', r), { 'aria-pressed': active })}>
                <div className="cl-case">{name}<span className="sub">{r.brand} · {r.category}</span></div>
                <span className="badge neutral">{channelLabel(r.channel)}</span>
                <span className={'cl-v ' + (r.csat != null ? csatClass(r.csat) : '')}>{r.csat ?? '—'}</span>
                <span className={'cl-v ' + (r.nps != null ? npsClass(r.nps) : '')}>{r.nps != null ? fmtNPS(r.nps) : '—'}</span>
                <span className={'cl-v ' + (r.ces != null ? csatClass(r.ces) : '')}>{r.ces ?? '—'}</span>
                <span className="cl-sap">✓ {r.sap_ticket_id || 'SAP'}</span>
              </div>
            );
          })}
        </div>
        <div className="cl-note">Every row is a resolution the agents recorded in SAP. No purchase, dispatch, or courier action was taken by an agent.</div>
      </div>
    </div>
  );
}
