import { useState } from 'react';
import { useApp } from '../App.jsx';

const auditDetail = (entry) =>
  Object.entries(entry).filter(([k]) => !['kind', 'ts'].includes(k)).map(([k, v]) => `${k}: ${v}`).join(' · ');

export default function Guardrails() {
  const { report } = useApp();
  const ss = report.safety_summary;
  const caps = report.capabilities || {};
  const events = report.snapshot.safety_events || [];
  const audit = report.snapshot.audit || [];
  const [expanded, setExpanded] = useState(false);

  const hero = [
    { k: 'Purchase orders auto-created', v: ss.purchase_orders_created, cls: 'zero', sub: 'No agent has spend authority' },
    { k: 'Transactional tools wired', v: ss.transactional_tools_available, cls: 'zero', sub: 'Across all 3 MCP servers' },
    { k: 'Manipulation attempts contained', v: ss.manipulation_attempts_contained, cls: ss.manipulation_attempts_contained > 0 ? 'alert' : '', sub: 'Prompt-injection attacks absorbed' },
    { k: 'HITL escalations triggered', v: ss.human_approval_tasks, cls: '', sub: 'By deterministic rule, not model' },
  ];
  const shown = expanded ? audit : audit.slice(0, 10);
  const crumbStyle = { padding: '14px 16px 0', fontSize: '11px', fontWeight: 800, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--faint)' };
  const titleStyle = { marginBottom: '10px', fontSize: '11px', fontWeight: 800, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--faint)' };

  return (
    <div>
      <div className="sec-head">
        <div className="sec-crumb">Trust &amp; Safety · Propose, Don't Transact</div>
        <div className="sec-title">Guardrails</div>
        <div className="sec-sub">Deterministic offline demo. The guarantee holds because the capability is absent — not because a prompt asks nicely.</div>
      </div>

      <div className="sec-body section-animate">
        <div className="hero-tiles">
          {hero.map((t) => (
            <div className={'hero-tile ' + t.cls} key={t.k}><div className="k">{t.k}</div><div className="v">{t.v}</div><div className="sub">{t.sub}</div></div>
          ))}
        </div>

        <div className="sec-crumb" style={crumbStyle}>Capability Manifest</div>
        <table className="caps-table">
          <thead><tr><th>MCP Server</th><th>Wired · read · record · notify</th><th>Transactional · absent</th></tr></thead>
          <tbody>
            {Object.entries(caps).map(([name, c]) => (
              <tr key={name}>
                <td><div className="srv-name">{name}</div><div className="srv-meta">{c.wired.length} tools wired</div></td>
                <td>{c.wired.length ? c.wired.map((t) => <span className="tg ok" key={t}>✓ {t}</span>) : <span style={{ color: 'var(--faint)' }}>—</span>}</td>
                <td>{c.absent_transactional.length ? c.absent_transactional.map((t) => <span className="tg no" key={t}>{t}</span>) : <span style={{ color: 'var(--faint)' }}>none defined</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {events.length > 0 && (
          <>
            <div className="sec-crumb" style={titleStyle}>Contained This Session</div>
            {events.map((ev, i) => (
              <div className="attack-panel" key={i}>
                <div className="hd">◆ Contained Manipulation</div>
                <div className="row">
                  <div><span className="lab">Attempted action</span><b>{ev.attempted_action || 'place_purchase_order'}</b></div>
                  <div><span className="lab">Capability available</span><b>{ev.capability_available === false ? 'NO — not implemented' : '—'}</b></div>
                </div>
                <div className="attack-phrases">{(ev.injected_phrases || []).map((p, j) => <span className="ph" key={j}>{p}</span>)}</div>
                <div className="attack-outcome">✓ <b>{ev.outcome || 'contained — routed to human buyer'}</b></div>
              </div>
            ))}
          </>
        )}

        <div className="sec-crumb" style={titleStyle}>Audit Log</div>
        <div className="brand-table">
          {shown.map((entry, i) => (
            <div className="audit-entry" key={i}>
              <span className="ts">{new Date(entry.ts).toISOString().slice(11, 19)}</span>
              <span className="kind">{entry.kind}</span>
              <span>{auditDetail(entry).slice(0, 80)}</span>
            </div>
          ))}
          {audit.length > 10 && !expanded && (
            <div style={{ padding: '10px 14px', fontSize: '12px', color: 'var(--teal)', cursor: 'pointer', fontWeight: 600 }} onClick={() => setExpanded(true)}>
              Show all {audit.length} entries →
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
