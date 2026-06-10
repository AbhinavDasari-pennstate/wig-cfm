// WIG-CFM run driver — launches the FastAPI app, smokes the API surface, and
// drives the dashboard UI in headless Edge (Playwright `channel: "msedge"` —
// no browser download needed on Windows).
//
// Usage (from the repo root):
//   node .claude/skills/run-wig-cfm/driver.mjs smoke            # API only
//   node .claude/skills/run-wig-cfm/driver.mjs shots            # UI screenshots
//   node .claude/skills/run-wig-cfm/driver.mjs all              # both (default)
//   node .claude/skills/run-wig-cfm/driver.mjs shots --no-server  # reuse a running server
//
// Env: WIG_PORT (default 8013). Screenshots land in _shots/run/.
//
// Exit code 0 = every check passed. Any failure prints FAIL and exits 1.

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const PORT = process.env.WIG_PORT || '8013';
const BASE = `http://localhost:${PORT}`;
const SHOTS = path.join(ROOT, '_shots', 'run');

const args = process.argv.slice(2);
const mode = args.find((a) => !a.startsWith('--')) || 'all';
const noServer = args.includes('--no-server');

let failures = 0;
const ok = (name, cond, detail = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) failures++;
};

async function healthy() {
  try {
    const r = await fetch(`${BASE}/health`);
    return r.ok && (await r.json()).status === 'ok';
  } catch {
    return false;
  }
}

async function startServer() {
  if (await healthy()) {
    console.log(`(server already healthy on :${PORT} — reusing)`);
    return null;
  }
  if (noServer) {
    console.error(`FAIL no server on :${PORT} and --no-server given`);
    process.exit(1);
  }
  const proc = spawn('python', ['-m', 'uvicorn', 'orchestrator.main:app', '--port', PORT],
    { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await healthy()) return proc;
  }
  console.error('FAIL server did not become healthy within 20s');
  proc.kill();
  process.exit(1);
}

async function post(url, body) {
  const r = await fetch(`${BASE}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: r.ok ? await r.json() : await r.text() };
}

// ---------------------------------------------------------------- API smoke
async function smoke() {
  const h = await (await fetch(`${BASE}/health`)).json();
  ok('GET /health', h.status === 'ok', JSON.stringify(h));

  const demo = await (await fetch(`${BASE}/api/demo`)).json();
  ok('GET /api/demo: 6 scenarios', (demo.scenarios || []).length === 6);
  const spikes = (demo.snapshot?.quality_alerts || []).filter((a) => a.alert_type === 'velocity_spike');
  ok('determinism: exactly 2 velocity alerts', spikes.length === 2,
    spikes.map((s) => `${s.brand} ${s.product_sku}`).join(', '));
  ok('determinism: 7 brands in metrics', Object.keys(demo.brand_metrics || {}).length === 7);
  ok('determinism: 7-day trend', (demo.daily_trend || []).length === 7);
  ok('guardrail: 0 transactional tools wired',
    demo.safety_summary?.transactional_tools_available === 0);

  // Live ingestion: email → Agent 1 triage → warranty routing.
  const email = await post('/feedback/email', {
    from: 'fatima@example.com', name: 'Fatima',
    subject: 'Geepas kettle stopped working',
    body: 'My Geepas kettle stopped working after two months. I would like a replacement.',
  });
  ok('POST /feedback/email routes to AGENT2', email.body?.routing === 'AGENT2',
    `ticket ${email.body?.sap_ticket_id}`);
  const emailTicket = email.body?.sap_ticket_id;

  // QR kiosk → Agent 5 three-case diagnosis (RF-AF250 seeds as case 1).
  const qr = await post('/feedback/qr', {
    customer_id: 'qr-001', feedback_text: 'air fryer missing from shelf',
    store_code: 'NESTO-DXB-12', store_name: 'NESTO Barsha', product_sku: 'RF-AF250',
  });
  ok('POST /feedback/qr → case 1, human buyer notified',
    qr.body?.diagnosis?.case === 1 && qr.body?.diagnosis?.action === 'human_buyer_notified');
  const qrTicket = qr.body?.sap_ticket_id;

  // Human-confirmation webhooks close the loop and write scores back.
  const restock = await post('/restock-confirmed', { sap_ticket_id: qrTicket, aisle: '7' });
  ok('POST /restock-confirmed closes loop', restock.body?.status === 'customer_notified');
  const fulfil = await post('/fulfillment-confirmed', { sap_ticket_id: emailTicket, tracking: 'TRK-9001' });
  ok('POST /fulfillment-confirmed closes loop', fulfil.body?.status === 'loop_closed');
}

// ----------------------------------------------------------------- UI shots
const NAV = [
  ['overview', 'Overview'],
  ['quality', 'Quality Alerts'],
  ['queue', 'Human Queue'],
  ['runs', 'Agent Runs'],
  ['guardrails', 'Guardrails'],
  ['loop', 'Closed Loop'],
];

async function shots() {
  const { chromium } = await import('playwright');
  mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('.sb-item', { timeout: 15000 });

    for (const [key, label] of NAV) {
      await page.click(`.sb-item[title="${label}"]`);
      await page.waitForTimeout(600); // section-animate transition
      await page.screenshot({ path: path.join(SHOTS, `${key}.png`) });
      console.log(`ok   shot ${key}.png`);
    }

    // Open the first Human Queue item → 3-column approval copilot.
    await page.click(`.sb-item[title="Human Queue"]`);
    await page.waitForSelector('.data-row');
    await page.click('.data-row');
    await page.waitForSelector('.cp', { timeout: 10000 });
    await page.waitForTimeout(800); // fren greeting renders on a 400ms timer
    await page.screenshot({ path: path.join(SHOTS, 'copilot.png') });
    console.log('ok   shot copilot.png');

    // Global fren dock: open, ask a question, capture the reply.
    await page.click('.cp-back'); // leave copilot first (fab hides under it)
    await page.click('.fren-fab');
    await page.waitForSelector('.fren-input');
    await page.fill('.fren-input', 'how is GEEPAS doing');
    await page.press('.fren-input', 'Enter');
    await page.waitForTimeout(1500); // scripted reply lands after 750ms
    const msgs = await page.locator('.fren-dock .fren-msg').count();
    await page.screenshot({ path: path.join(SHOTS, 'fren.png') });
    console.log('ok   shot fren.png');
    ok('fren replied in dock', msgs >= 2, `${msgs} messages rendered`);
  } finally {
    await browser.close();
  }
}

// -------------------------------------------------------------------- main
const server = await startServer();
try {
  if (mode === 'smoke' || mode === 'all') await smoke();
  if (mode === 'shots' || mode === 'all') await shots();
} catch (e) {
  console.error('FAIL unhandled:', e.message);
  failures++;
} finally {
  if (server) server.kill();
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
