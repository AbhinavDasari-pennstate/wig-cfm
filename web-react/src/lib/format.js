// Pure formatting + classification helpers, ported from the legacy dashboard.
import { OUTCOMES } from './constants.js';

export const npsClass = (v) => (v >= 30 ? 'pos' : v >= 0 ? 'neu' : 'neg');
export const csatClass = (v) => (v >= 4.0 ? 'pos' : v >= 3.0 ? 'neu' : 'neg');
export const fmtNPS = (v) => (v >= 0 ? '+' : '') + v;
export const fmtCSAT = (v) => v.toFixed(1);

export function trendArrow(cur, prior) {
  if (prior == null) return { sym: '→', cls: 'flat', note: 'no prior data' };
  const d = cur - prior;
  if (Math.abs(d) < 0.05) return { sym: '→', cls: 'flat', note: 'stable' };
  return d > 0
    ? { sym: '↑', cls: 'up', note: '+' + Math.abs(d).toFixed(1) }
    : { sym: '↓', cls: 'dn', note: '−' + Math.abs(d).toFixed(1) };
}

export function timeAgo(ts) {
  if (!ts) return '—';
  const d = Math.max(0, (Date.now() - new Date(ts).getTime()) / 60000);
  if (d < 1) return 'just now';
  if (d < 60) return Math.round(d) + 'm ago';
  if (d < 1440) return Math.round(d / 60) + 'h ago';
  return Math.round(d / 1440) + 'd ago';
}

export function gstTime() {
  const now = new Date();
  const gst = new Date(now.getTime() + 4 * 3600000);
  return gst.toISOString().slice(11, 16) + ' GST';
}

export function greeting() {
  const h = new Date(Date.now() + 4 * 3600000).getUTCHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export const langLabel = (l) =>
  ({ ARABIC: 'AR', ENGLISH: 'EN', HINDI: 'HI', MALAYALAM: 'ML', '—': '—' }[l] || l);

export const channelLabel = (c) =>
  ({ EMAIL: 'Email', QR_KIOSK: 'QR Kiosk', WHATSAPP: 'WhatsApp', ECOMMERCE: 'eCommerce', SCHEDULED: 'Scheduled' }[c] || c);

export function agentNums(stages) {
  const nums = [];
  (stages || []).forEach((s) => {
    const m = (s.agent || '').match(/Agent\s+(\d+)/i);
    if (m && !nums.includes(m[1])) nums.push(m[1]);
  });
  return nums;
}

export const outcomeFor = (sc) => OUTCOMES[sc.id] || { label: 'RESOLVED', cls: 'resolved' };

export const isHighPriority = (item) =>
  !!(item.priority && item.priority.toString().toUpperCase().startsWith('HIGH'));

export const isRTLLang = (l) => l === 'ARABIC';
