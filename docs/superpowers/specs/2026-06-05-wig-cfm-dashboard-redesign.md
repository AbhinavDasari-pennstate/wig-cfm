# WIG-CFM Dashboard Redesign — Design Spec

**Date:** 2026-06-05  
**Status:** Approved (build)  
**Scope:** Full rebuild of `web/index.html` + backend enrichment. No changes to agents, MCP servers, or tests.

## Goal

Replace the narrative pitch site with a dense, operational dashboard for a WIG Department Head covering all brands. Interaction model mirrors ACME Procurement Intelligence (right-rail drill-down, co-pilot workspace) using the existing WIG editorial aesthetic.

## Layout

```
grid-template-columns: 220px 1fr 320px
grid-template-rows:    52px  1fr
```

- **Topbar (52px, dark ink bg):** logo · search · ● Live · user role · time
- **Sidebar (220px):** five nav sections with badge counts
- **Main (1fr, scrollable):** section content
- **Rail (320px, scrollable):** focused item detail (hidden in co-pilot mode)

## Navigation

| Section | Primary data | Right rail |
|---------|-------------|------------|
| Overview | brand_metrics + safety_summary + queue preview | brand detail or queue item |
| Quality Alerts | snapshot.quality_alerts + velocity_digest result.alerts | spike breakdown |
| Human Queue | snapshot.human_queue | fren · Co-solver full workspace |
| Agent Runs | scenarios[] | full scenario thread |
| Guardrails | capabilities + safety_events + audit | static trust explainer |

## Overview

- Greeting with time-of-day salutation
- Live ticker: tickets · alerts · queue depth · safety events
- Insight card (top quality alert, ARIA-style, ink background)
- 4 KPI tiles: Avg CSAT / Avg NPS / Queue depth / Safety events — each with trend arrow vs prior week
- Brand performance table: 7 brands, columns CSAT/NPS/CES/tickets/trend, colour-coded, clickable
- Queue preview: 3 most recent items

## Quality Alerts

- Scan summary bar: groups scanned · alerts raised
- Filter tabs: All / Velocity Spike / Volume Threshold
- Alert list: type badge · brand · SKU · change % · recent vs prior · detected time
- Right rail: two count tiles (prior/recent), velocity %, watch list quote, contributing tickets sample, recommended action chips (display-only)

## Human Queue

### Mode 1 — List
- Filter tabs: All / Procurement / Warranty / High Priority
- Queue rows: WF ID · type badge · brand+product · value or store · priority · time pending

### Mode 2 — fren · Co-solver (full workspace, replaces main+rail)
- Breadcrumb + action bar
- Left: document preview (recommendation or drafted reply with flagged sections)
- Right: fren chat with scripted opening, 4 suggestion chips per item, free-text input
- Action chips: Forward to Buyer Desk / Release to Warranty Desk (display-only, show confirm modal)

## Agent Runs

- Feed rows: timestamp · title · agent pills · outcome badge · channel · language chip
- Filter tabs: All / Email / QR Kiosk / WhatsApp / eCommerce / Scheduled
- Right rail: inbound message → agent thread (stages/steps/tool calls) → drafted reply → edge quote

## Guardrails

- 4 hero stat tiles: 0 POs / 0 transactional tools / N attacks contained / N HITL escalations
- Capability manifest table: MCP server × wired tools (teal) × absent transactional (oxblood strikethrough)
- Contained attacks panel (from snapshot.safety_events)
- Audit log: last 10 entries from snapshot.audit, expandable

## Backend changes

| Change | File |
|--------|------|
| Add PARAJOHN, KRYPTON, OLSENMARK, DELCASA to corpus (days 4–6) | core/backend.py |
| Add prior-week corpus (days 8–14) for all brands — creates trend arrows | core/backend.py |
| Add KRYPTON KT-IRON21 velocity cluster (days 0.5–2.0) | core/backend.py |
| Pre-seed 3 human queue items (DC-PAN20 procurement, OLSENMARK warranty, KT-IRON21 procurement) | core/backend.py |
| Add brand_metrics, prior_week_metrics, channel_breakdown to build_report() | demo/runner.py |

## Design tokens (extensions)

- Topbar bg: `--ink` (#1A1A18) — dark header, dashboard feel
- Score colours: CSAT/CES ≥4.0 teal, ≥3.0 neutral, <3.0 blood; NPS ≥30 teal, ≥0 neutral, <0 blood
- Trend: ↑ teal, ↓ blood, → faint
- Outcome badges: RESOLVED=teal, PENDING=brass, ESCALATED=brass, CONTAINED=blood

## fren scripted responses

One opening message + 4 chips per queue item, keyed by `sku` (procurement) or `brand` (warranty). Free-text input shows `fren is thinking…` then a scripted fallback. No live LLM calls from browser.

## Out of scope

Agent logic, new API endpoints, persistence, auth, React/build tooling.
