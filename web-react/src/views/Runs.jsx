import { useState } from 'react';
import { useApp } from '../App.jsx';
import { RUN_TIMES } from '../lib/constants.js';
import { agentNums, outcomeFor, channelLabel, langLabel } from '../lib/format.js';

export default function Runs() {
  const { report, openRun } = useApp();
  const [filter, setFilter] = useState('all');
  const scenarios = report.scenarios || [];

  const tabs = [
    { key: 'all', label: 'All', n: scenarios.length },
    { key: 'EMAIL', label: 'Email', n: 1 },
    { key: 'QR_KIOSK', label: 'QR Kiosk', n: 2 },
    { key: 'WHATSAPP', label: 'WhatsApp', n: 1 },
    { key: 'ECOMMERCE', label: 'eCommerce', n: 1 },
    { key: 'SCHEDULED', label: 'Scheduled', n: 1 },
  ];
  const filtered = filter === 'all' ? scenarios : scenarios.filter((s) => s.channel && s.channel.toUpperCase().startsWith(filter));

  return (
    <div>
      <div className="sec-head">
        <div className="sec-crumb">Agent Activity · All Agents</div>
        <div className="sec-title">Agent Runs</div>
        <div className="sec-sub">{scenarios.length} runs completed · 5 agents active · 0 failures</div>
      </div>

      <div className="filter-tabs">
        {tabs.map((t) => (
          <div key={t.key} className={'ftab' + (filter === t.key ? ' active' : '')} onClick={() => setFilter(t.key)}>
            {t.label}<span className="cnt">{t.n}</span>
          </div>
        ))}
      </div>

      <div className="sec-body section-animate">
        <div className="data-list">
          {filtered.length === 0 && <div>No runs matching this filter.</div>}
          {filtered.map((sc, i) => {
            const nums = agentNums(sc.stages);
            const out = outcomeFor(sc);
            const ch = sc.channel ? sc.channel.split(' ')[0] : '—';
            const lang = sc.input ? sc.input.lang : '—';
            return (
              <div className="data-row" key={sc.id} onClick={() => openRun(sc)}>
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
                <div className="dr-right"><div className="dr-meta">Today {RUN_TIMES[i] || '—'}</div><div className="dr-meta">GST</div></div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
