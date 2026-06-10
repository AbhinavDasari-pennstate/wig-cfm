import { useState } from 'react';
import { press } from '../lib/a11y.js';
import { useApp } from '../App.jsx';
import { RUN_TIMES } from '../lib/constants.js';
import { agentNums, outcomeFor, channelLabel, langLabel } from '../lib/format.js';

export default function Runs() {
  const { report, openRun } = useApp();
  const [filter, setFilter] = useState('all');
  const scenarios = report.scenarios || [];

  // Counts are derived from the data — the old literals went stale as soon as
  // the report changed.
  const byChannel = (key) => scenarios.filter((s) => s.channel && s.channel.toUpperCase().startsWith(key));
  const tabs = [
    { key: 'all', label: 'All', n: scenarios.length },
    { key: 'EMAIL', label: 'Email', n: byChannel('EMAIL').length },
    { key: 'QR_KIOSK', label: 'QR Kiosk', n: byChannel('QR_KIOSK').length },
    { key: 'WHATSAPP', label: 'WhatsApp', n: byChannel('WHATSAPP').length },
    { key: 'ECOMMERCE', label: 'eCommerce', n: byChannel('ECOMMERCE').length },
    { key: 'SCHEDULED', label: 'Scheduled', n: byChannel('SCHEDULED').length },
  ].filter((t) => t.key === 'all' || t.n > 0);
  const filtered = filter === 'all' ? scenarios : byChannel(filter);

  return (
    <div>
      <div className="sec-head">
        <div className="sec-crumb">Agent Activity · All Agents</div>
        <div className="sec-title">Agent Runs</div>
        <div className="sec-sub">{scenarios.length} runs completed · 5 agents active · {scenarios.filter((s) => s.failed).length} failures</div>
      </div>

      <div className="filter-tabs">
        {tabs.map((t) => (
          <div key={t.key} className={'ftab' + (filter === t.key ? ' active' : '')} {...press(() => setFilter(t.key))}>
            {t.label}<span className="cnt">{t.n}</span>
          </div>
        ))}
      </div>

      <div className="sec-body section-animate">
        <div className="data-list">
          {filtered.length === 0 && <div>No runs matching this filter.</div>}
          {filtered.map((sc) => {
            const nums = agentNums(sc.stages);
            const time = sc.time || RUN_TIMES[scenarios.indexOf(sc)] || '—';
            const out = outcomeFor(sc);
            const ch = sc.channel ? sc.channel.split(' ')[0] : '—';
            const lang = sc.input ? sc.input.lang : '—';
            return (
              <div className="data-row" key={sc.id} {...press(() => openRun(sc))}>
                <div className="dr-main">
                  <div className="dr-top">
                    <div className="agent-pills">{nums.map((n) => <span key={n} className={'a-pill a' + n}>Agent {n}</span>)}</div>
                    <span className={'outcome ' + out.cls}>{out.label}</span>
                  </div>
                  <div className="dr-title">{sc.title}</div>
                  <div className="dr-foot">
                    <span className="badge outline">{channelLabel(ch)}</span>
                    {lang && lang !== '—' && <span className="badge outline">{langLabel(lang)}</span>}
                  </div>
                </div>
                <div className="dr-right"><div className="dr-meta">Today {time}</div><div className="dr-meta">GST</div></div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
