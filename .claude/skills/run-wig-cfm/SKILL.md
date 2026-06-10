---
name: run-wig-cfm
description: Run, start, smoke-test, screenshot, or drive the WIG-CFM app (FastAPI backend + React dashboard). Use when asked to run the app, verify a change in the real app, take dashboard screenshots, or exercise the feedback-ingestion API end-to-end.
---

# Run WIG-CFM

WIG-CFM is a FastAPI app (`orchestrator/main.py`) serving a **committed** React
build (`web-react/dist`) plus a JSON API. It runs fully offline — no API keys,
no database, no Node build step needed just to run it. The driver at
`.claude/skills/run-wig-cfm/driver.mjs` launches the server, smokes the whole
API surface (including the determinism invariants and the propose-don't-transact
guardrail), and drives the dashboard in headless Edge with screenshots.

All paths below are relative to the repo root.

## Prerequisites

- Python 3.12 with `pip install -r requirements.txt` (fastapi, uvicorn, pydantic, httpx, pytest)
- Node 20+ (only for the UI driver, not for the app itself)
- One-time driver setup: `cd .claude/skills/run-wig-cfm && npm install`
  (installs Playwright; **no browser download needed** — the driver uses the
  system Edge via `channel: "msedge"`)

## Run (agent path) — the driver

```bash
node .claude/skills/run-wig-cfm/driver.mjs all
```

Starts uvicorn on port 8013 (or reuses a healthy one), runs every check, kills
the server it started, exits 0/1. Subcommands:

| Command | What it does |
|---|---|
| `smoke` | API only: `/health`, `/api/demo` (asserts **exactly 2 velocity alerts, 7 brands, 7-day trend, 0 transactional tools wired**), email ingest → AGENT2 routing, QR ingest → case-1 diagnosis, both human-confirmation webhooks |
| `shots` | Headless Edge: screenshots every nav view + the approval copilot + the fren dock (asks fren a question, asserts a reply rendered) into `_shots/run/*.png` |
| `all` | Both (default) |
| `--no-server` | Don't auto-start; require a server already on the port |

Env: `WIG_PORT` overrides the port (default 8013).

Expected tail of a good run: `ALL CHECKS PASSED`, exit 0. Screenshots land in
`_shots/run/` — **look at them** (`overview.png`, `copilot.png`, `fren.png`).

## Run (human path)

```bash
python -m uvicorn orchestrator.main:app --port 8013
# open http://localhost:8013
```

Frontend dev loop (only when editing `web-react/src`):
`cd web-react && npm install && npm run dev` (proxies `/api` → backend).
After any src change: `npm run build` and **commit `web-react/dist/`** —
Render deploys with no Node build step, the committed dist is what ships.

## Direct API invocation (verified examples)

```bash
curl -s http://localhost:8013/health
curl -s http://localhost:8013/api/demo            # the full dashboard report (cached; ?refresh=1 rebuilds)
curl -s -X POST http://localhost:8013/feedback/email -H "Content-Type: application/json" \
  -d '{"from":"fatima@example.com","name":"Fatima","subject":"Geepas kettle stopped working","body":"My Geepas kettle stopped working after two months."}'
# → {"routing":"AGENT2","sap_ticket_id":"CRM-0000N",...}
curl -s -X POST http://localhost:8013/feedback/qr -H "Content-Type: application/json" \
  -d '{"customer_id":"qr-001","feedback_text":"air fryer missing from shelf","store_code":"NESTO-DXB-12","store_name":"NESTO Barsha","product_sku":"RF-AF250"}'
# → case 1 diagnosis, human buyer notified (RF-AF250 seeds with regular purchase history)
curl -s -X POST http://localhost:8013/restock-confirmed -H "Content-Type: application/json" \
  -d '{"sap_ticket_id":"<from the qr response>","aisle":"7"}'
curl -s -X POST http://localhost:8013/fulfillment-confirmed -H "Content-Type: application/json" \
  -d '{"sap_ticket_id":"<from the email response>","tracking":"TRK-9001"}'
```

## Test

```bash
python -m pytest -q
```

As of 2026-06-10: **3 known stale failures** (`test_velocity`, one in
`test_safety`, one in `test_diagnosis`) — seed-data drift, fixes are Tasks 1–3
of `docs/superpowers/plans/2026-06-10-wig-cfm-real-llm.md`. The guardrail
proofs in `test_safety.py` (no transactional tools) pass. If you see more than
3 failures, something is actually broken.

## Gotchas

- **The backend is in-memory and per-process.** `sap_ticket_id`s from a
  previous server run don't exist after a restart — create the ticket and fire
  its webhook against the *same* server session.
- **Playwright must use `channel: 'msedge'`** on this machine. Plain
  `chromium.launch()` fails with "Executable doesn't exist" because the
  Playwright-managed browsers were never downloaded (saves ~120 MB).
- **The fren FAB is hidden while a copilot is open** — click `.cp-back` to
  return to the queue before clicking `.fren-fab`.
- **Timed UI**: fren replies land on a ~750 ms timer and view switches run a
  ~600 ms `section-animate` transition. Screenshot too early and you capture
  the thinking dots / mid-fade. The driver waits accordingly.
- **Selectors**: sidebar items are `div.sb-item[title="<label>"]` (labels:
  Overview, Quality Alerts, Human Queue, Agent Runs, Guardrails, Closed Loop);
  queue rows are `.data-row`; the copilot root is `.cp`; fren messages are
  `.fren-msg`.
- **Port 8000 is often busy** on this machine (README suggests 8770). The
  driver defaults to 8013.
- `/api/demo` is cached after the first call; pass `?refresh=1` to rebuild
  (e.g. to re-anchor relative timestamps).

## Troubleshooting

- `FAIL server did not become healthy within 20s` → run
  `python -m uvicorn orchestrator.main:app --port 8013` in the foreground and
  read the traceback (usually a missing dep → `pip install -r requirements.txt`).
- `Cannot find package 'playwright'` → you skipped the one-time
  `cd .claude/skills/run-wig-cfm && npm install`.
- Blank screenshots / `waitForSelector('.sb-item')` timeout → the committed
  `web-react/dist` is stale or missing; `cd web-react && npm run build`.
