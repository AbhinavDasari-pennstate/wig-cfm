// Report-derived selectors. All take the fetched report (and, where needed, an
// `actions` object so navigation links can be wired by the caller).
import { BRAND_REGIONS, SKU_NAMES, FALLBACK_FREN } from './constants.js';
import { fmtNPS, channelLabel, isHighPriority } from './format.js';

export function getAlerts(report) {
  const vel = (report.scenarios || []).find((s) => s.id === 'velocity_digest');
  const alerts = vel ? vel.result.alerts || [] : [];
  const qa = report.snapshot.quality_alerts || [];
  return alerts.map((a) => {
    const rec = qa.find((q) => q.alert_id === a.alert_id) || {};
    return {
      ...a,
      category: a.category || rec.category || '',
      description: a.description || rec.description || '',
    };
  });
}

export const pendingQueue = (report) =>
  (report.snapshot.human_queue || []).filter((i) => !i._actioned);

// actions: { setNav(key), openCopilot(item) }
export function notifications(report, actions) {
  const out = [];
  getAlerts(report).forEach((a) =>
    out.push({
      color: 'var(--blood)',
      t: `Velocity alert: ${a.brand} ${a.sku || a.product_sku}`,
      s: (a.velocity_pct == null ? 'new SKU' : '+' + a.velocity_pct + '%') + ` · ${a.total || a.recent} tickets`,
      go: () => actions.setNav('quality'),
    })
  );
  (report.snapshot.human_queue || [])
    .filter((i) => !i._actioned && isHighPriority(i))
    .forEach((item) =>
      out.push({
        color: 'var(--brass)',
        t: `High-priority approval: ${item.product || item.sku}`,
        s: (item.workflow_task_id || '') + ' · awaiting sign-off',
        go: () => actions.openCopilot(item),
      })
    );
  return out;
}

// actions: { setNav(key), openCopilot(item), openRun(sc) }
export function buildSearchIndex(report, actions) {
  const idx = [];
  Object.keys(report.brand_metrics || {}).forEach((b) =>
    idx.push({ group: 'Brands', t: b, m: BRAND_REGIONS[b] || '', go: () => actions.setNav('overview') })
  );
  getAlerts(report).forEach((a) =>
    idx.push({ group: 'Quality alerts', t: `${a.brand} · ${a.sku || a.product_sku}`, m: 'velocity', go: () => actions.setNav('quality') })
  );
  (report.snapshot.human_queue || []).forEach((item) => {
    const isProc = item.type === 'PROCUREMENT_APPROVAL';
    const name = isProc ? SKU_NAMES[item.sku] || item.sku : item.product || 'Warranty claim';
    idx.push({ group: 'Human queue', t: name, m: item.workflow_task_id || '', go: () => actions.openCopilot(item) });
  });
  (report.scenarios || []).forEach((sc) =>
    idx.push({ group: 'Agent runs', t: sc.title, m: (sc.channel || '').split(' ')[0], go: () => actions.openRun(sc) })
  );
  return idx;
}

// Keyword-matched answer for the global fren dock.
export function frenAnswer(report, q) {
  const t = q.toLowerCase();
  const bm = report.brand_metrics || {};
  const pw = report.prior_week_metrics || {};
  const brands = Object.keys(bm);
  const b = brands.find((x) => t.includes(x.toLowerCase()));
  if (b) {
    const m = bm[b];
    const p = pw[b];
    let s = `${b}: CSAT ${m.csat}/5, NPS ${fmtNPS(m.nps)}, CES ${m.ces}/5 across ${m.tickets} tickets this week.`;
    if (p) {
      const d = m.nps - p.nps;
      s += ` NPS is ${Math.abs(d) < 1 ? 'flat' : d > 0 ? 'up' : 'down'} vs last week (was ${fmtNPS(p.nps)}).`;
    }
    return s;
  }
  if (/alert|velocity|quality|spike/.test(t)) {
    const a = getAlerts(report);
    if (!a.length) return 'No quality alerts right now.';
    return (
      `${a.length} velocity alert${a.length > 1 ? 's' : ''}: ` +
      a.map((x) => `${x.brand} ${x.sku || x.product_sku} (${x.velocity_pct == null ? 'new SKU' : '+' + x.velocity_pct + '%'})`).join(', ') +
      '. Open Quality Alerts for the breakdown.'
    );
  }
  if (/queue|approv|pending|sign.?off|action/.test(t)) {
    const q2 = pendingQueue(report);
    const hi = q2.filter(isHighPriority).length;
    return `${q2.length} item${q2.length !== 1 ? 's' : ''} awaiting approval${hi ? `, ${hi} high priority` : ''}. Every reply is already drafted — you approve, the agents don't transact.`;
  }
  if (/purchase order|\bpo\b|transact|spend|guardrail|safe|inject|manipulat/.test(t)) {
    const ss = report.safety_summary;
    return `Guardrails: ${ss.purchase_orders_created} purchase orders auto-created, ${ss.transactional_tools_available} transactional tools wired, ${ss.manipulation_attempts_contained} manipulation attempt${ss.manipulation_attempts_contained !== 1 ? 's' : ''} contained this session. Agents propose, never transact.`;
  }
  if (/channel/.test(t)) {
    const mx = report.channel_mix || {};
    const tot = Object.values(mx).reduce((a, v) => a + v, 0) || 1;
    return 'Channel mix: ' + Object.entries(mx).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${channelLabel(k)} ${Math.round((v / tot) * 100)}%`).join(', ') + '.';
  }
  if (/worst|lowest|attention|risk|concern|problem|weak/.test(t)) {
    if (!brands.length) return FALLBACK_FREN;
    const r = brands.map((x) => [x, bm[x].nps]).sort((a, b) => a[1] - b[1])[0];
    return `${r[0]} has the lowest NPS (${fmtNPS(r[1])}) — worth a look. The quality alerts explain most of the drop.`;
  }
  if (/best|top|strong|highest|leading/.test(t)) {
    if (!brands.length) return FALLBACK_FREN;
    const r = brands.map((x) => [x, bm[x].nps]).sort((a, b) => b[1] - a[1])[0];
    return `${r[0]} leads on NPS (${fmtNPS(r[1])}).`;
  }
  if (/run|agent|scenario/.test(t)) {
    const n = (report.scenarios || []).length;
    return `${n} agent runs completed today across 5 agents, 0 failures. See Agent Runs for the per-run trace.`;
  }
  if (/csat|nps|ces|metric|overall|how are|summar|overview|week|doing/.test(t)) {
    if (!brands.length) return FALLBACK_FREN;
    const n = brands.length;
    const ac = (brands.reduce((a, x) => a + bm[x].csat, 0) / n).toFixed(1);
    const an = Math.round(brands.reduce((a, x) => a + bm[x].nps, 0) / n);
    const tot = brands.reduce((a, x) => a + bm[x].tickets, 0);
    return `Across ${n} brands: ${tot} tickets this week, avg CSAT ${ac}/5, avg NPS ${fmtNPS(an)}. ${getAlerts(report).length} quality alert(s) and ${pendingQueue(report).length} item(s) in the approval queue.`;
  }
  if (/who|what are you|help|hello|^hi|hey|thanks|thank you/.test(t)) {
    return "I'm fren — your co-solver. Ask me about any brand's CSAT/NPS/CES, the quality alerts, the approval queue, channel mix, or the guardrails. Try 'how is KRYPTON' or 'what's in the queue'.";
  }
  return FALLBACK_FREN;
}

export const api = {
  async fetchReport() {
    const r = await fetch('/api/demo');
    if (!r.ok) throw new Error(r.status);
    return r.json();
  },
};
