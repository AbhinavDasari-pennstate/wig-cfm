import { useState } from 'react';
import { press } from '../lib/a11y.js';
import { useApp } from '../App.jsx';
import { SKU_NAMES } from '../lib/constants.js';
import { timeAgo, isHighPriority } from '../lib/format.js';

export default function Queue() {
  const { report, openCopilot } = useApp();
  const [filter, setFilter] = useState('all');
  const queue = report.snapshot.human_queue || [];
  const pend = queue.filter((i) => !i._actioned);

  const tabs = [
    { key: 'all', label: 'All', n: queue.length },
    { key: 'proc', label: 'Procurement', n: queue.filter((i) => i.type === 'PROCUREMENT_APPROVAL').length },
    { key: 'warr', label: 'Warranty', n: queue.filter((i) => i.type === 'WARRANTY_FULFILLMENT').length },
    { key: 'high', label: 'High Priority', n: queue.filter(isHighPriority).length },
  ];
  let items = queue;
  if (filter === 'proc') items = queue.filter((i) => i.type === 'PROCUREMENT_APPROVAL');
  else if (filter === 'warr') items = queue.filter((i) => i.type === 'WARRANTY_FULFILLMENT');
  else if (filter === 'high') items = queue.filter(isHighPriority);

  return (
    <div>
      <div className="sec-head">
        <div className="sec-crumb">Human-in-the-Loop · Approval Queue</div>
        <div className="sec-title">Human Queue</div>
        <div className="sec-sub">{pend.length} items pending · {pend.filter(isHighPriority).length} high priority · agents drafted all replies</div>
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
          {items.length === 0 && <div className="dr-main">No items matching this filter.</div>}
          {items.map((item, i) => {
            if (item.type === 'INTERVENTION') {
              return (
                <div key={i} className={'data-row' + (item._actioned ? ' dr-row-done' : '')} {...press(() => openCopilot(item))}>
                  <div className="dr-main">
                    <div className="dr-top">
                      <span className="badge brass">Intervention</span>
                      {item._actioned && <span className="badge done">✓ {item._actionLabel}</span>}
                      <span className="dr-id">{item.workflow_task_id}</span>
                    </div>
                    <div className="dr-title">{item.kind}</div>
                    <div className="dr-sub">↩ {item.source_title}</div>
                  </div>
                  <div className="dr-right">
                    <div className="dr-meta">{timeAgo(item.ts)}</div>
                    <div className="dr-meta">{item.assigned_to || '—'}</div>
                  </div>
                </div>
              );
            }
            const isProc = item.type === 'PROCUREMENT_APPROVAL';
            const high = isHighPriority(item);
            const name = isProc ? SKU_NAMES[item.sku] || item.sku : item.product || 'Warranty Claim';
            const meta = isProc ? `${item.store || '—'} · ${item.reason || '—'}` : `${item.brand || '—'} · AED ${item.declared_value_aed}`;
            return (
              <div key={i} className={'data-row' + (item._actioned ? ' dr-row-done' : '')} {...press(() => openCopilot(item))}>
                <div className="dr-main">
                  <div className="dr-top">
                    <span className={'badge ' + (isProc ? 'brass' : 'teal')}>{isProc ? 'Procurement' : 'Warranty'}</span>
                    {high && <span className="badge blood">HIGH</span>}
                    {item._actioned && <span className="badge done">✓ {item._actionLabel}</span>}
                    <span className="dr-id">{item.workflow_task_id || '—'}</span>
                  </div>
                  <div className="dr-title">{name}</div>
                  <div className="dr-sub">{meta}</div>
                </div>
                <div className="dr-right">
                  <div className="dr-meta">{timeAgo(item.ts)}</div>
                  <div className="dr-meta">{item.assigned_to || '—'}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
