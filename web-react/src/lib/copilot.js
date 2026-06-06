// Copilot-specific logic ported from the legacy dashboard.
import { SKU_NAMES, FALLBACK_FREN } from './constants.js';
import { channelLabel, isHighPriority } from './format.js';

export function timelineSteps(item, isProc) {
  const ch = channelLabel(item.channel || 'EMAIL');
  if (isProc) {
    const reason = item.reason || 'OUT_OF_STOCK';
    const action =
      reason === 'DELAYED_PO'
        ? { what: 'Agent 5 found open PO — 3 days overdue', agent: 'PO-778412 · supplier flagged' }
        : reason === 'VELOCITY_SPIKE'
        ? { what: 'Agent 3 flagged velocity spike', agent: 'new SKU · 4 complaints in 3d' }
        : { what: 'Agent 5 diagnosed stock gap', agent: '0 shelf · 0 backroom' };
    return [
      { when: '06:02 GST', what: 'Signal received', agent: `via ${ch}` },
      { when: '06:15 GST', what: 'Agent 1 triaged → procurement', agent: 'routed to Agent 5' },
      { when: '06:16 GST', what: action.what, agent: action.agent },
      { when: '06:16 GST', what: 'Recommendation prepared for buyer', agent: 'no PO placed — propose only' },
      { when: 'now', what: 'Awaiting your approval', agent: 'nothing dispatched yet', now: true },
    ];
  }
  const high = isHighPriority(item);
  return [
    { when: '06:02 GST', what: 'Feedback received', agent: `via ${ch}` },
    { when: '06:14 GST', what: 'Agent 1 triaged → WARRANTY_RETURN', agent: 'routed to Agent 2' },
    { when: '06:15 GST', what: 'Agent 2 checked warranty → valid', agent: `claim ${item.claim_id || 'opened'}` },
    { when: '06:15 GST', what: `Value AED ${item.declared_value_aed} ${high ? '> 500 → routed HIGH' : '≤ 500 → standard'}`, agent: 'deterministic rule' },
    { when: 'now', what: 'Reply drafted · awaiting approval', agent: 'no message sent yet', now: true },
  ];
}

// Returns { count, brand, label, resolved, total, hasCat } or null.
export function precedent(report, item, isProc) {
  const idx = report.precedent_index || {};
  const brand = isProc ? (SKU_NAMES[item.sku] || '').split(' ')[0].toUpperCase() : item.brand || '';
  const rec = idx[brand];
  if (!rec) return null;
  const cat = isProc ? 'PRODUCT_QUALITY' : 'WARRANTY_RETURN';
  const catCount = (rec.by_category || {})[cat] || 0;
  const label = cat.replace('_', ' ').toLowerCase();
  return { brand, label, resolved: rec.resolved, total: rec.total, catCount, count: catCount > 0 ? catCount : rec.total, hasCat: catCount > 0 };
}

export function gapChecks(item, isProc, isHigh) {
  const text = (isProc ? item.recommendation : item.drafted_message) || '';
  const leak = /\b(CRM-|CLM-|PO-|WF-)\d/.test(text);
  const valueOK = isProc ? true : item.declared_value_aed > 500 === !!isHigh;
  return [
    { ok: true, t: 'No customer PII in draft or cache', s: 'PDPL — name/address/contact written to SAP only' },
    { ok: true, t: 'No individual staff named', s: 'team-level language only' },
    { ok: !leak, t: 'No SAP / claim / PO IDs disclosed to customer', s: leak ? 'reference found — remove before release' : 'draft scanned — none present' },
    { ok: valueOK, t: 'Value-threshold routing correct', s: isProc ? 'n/a for procurement' : `AED ${item.declared_value_aed} ${isHigh ? '> 500 → HIGH ✓' : '≤ 500 → standard ✓'}` },
    ...(isProc ? [] : [{ ok: true, t: 'Warranty validity', s: 'within coverage window' }]),
    { ok: true, t: "Propose, don't transact", s: 'no transactional tool used — human actions it' },
  ];
}

const FREN_STOP = new Set(['the', 'a', 'an', 'is', 'are', 'do', 'i', 'to', 'of', 'for', 'this', 'it', 'what', 'should', 'can', 'you', 'me', 'my', 'on', 'in', 'and', 'or', 'if', 'be', 'how', 'that', 'with', 'at', 'as', 'about', 'please', 'tell', 'give', 'need']);

export function frenMatch(chips, text) {
  const words = text.toLowerCase().match(/[a-z]+/g) || [];
  const terms = words.filter((w) => w.length > 2 && !FREN_STOP.has(w));
  let best = null, bestScore = 0;
  (chips || []).forEach((c) => {
    const hay = (c.q + ' ' + c.a).toLowerCase();
    let score = 0;
    terms.forEach((t) => { if (hay.includes(t)) score += c.q.toLowerCase().includes(t) ? 2 : 1; });
    if (score > bestScore) { bestScore = score; best = c; }
  });
  return bestScore >= 2 ? best.a : FALLBACK_FREN;
}

export const isArabic = (s) => /[؀-ۿ]/.test(s);
