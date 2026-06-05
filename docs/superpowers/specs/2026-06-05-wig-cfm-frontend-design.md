# WIG-CFM Demo Frontend — Design Spec

**Date:** 2026-06-05
**Status:** Approved (build)
**Scope:** Presentation layer only. Rebuild `web/index.html` against the existing
`GET /api/demo` contract. No changes to `agents/`, `mcp_servers/`, `core/`, `demo/`,
the orchestrator API surface, or tests.

## Goal

Make the demo client-ready for a Wonderful.ai × WIG (Gulf enterprise) pitch whose
headline is trust — *"propose, don't transact."* Replace the generic dark dashboard
with a distinctive, production-grade **Editorial Trust** interface.

## Decisions (locked with the user)

1. **Aesthetic:** Editorial Trust — light, refined, FT/premium-consultancy feel.
2. **Build:** Single static `web/index.html` (inline CSS+JS), zero build step, served
   by FastAPI as-is. Reliability over toolchain.
3. **Motion:** Cinematic playback — scenario agent-stages cascade in on a timed
   sequence with a `▶ Run / Replay` control; auto-plays on first view.
4. **Navigation:** Refined sidebar, keeping the Trust / Live scenarios / Leadership
   grouping.

## Design system

- **Type:** Display = *Fraunces* (high-contrast old-style serif). Body = humanist sans
  (*Hanken Grotesk* / *Spline Sans*). Mono = *Spline Sans Mono* / JetBrains Mono for
  tool names and SAP/PO/workflow IDs. Self-hosted `woff2` so the offline demo keeps
  its look on any OS. **Fallback stack** (used if a font file is unavailable):
  `Sitka, Cambria, "Hoefler Text", Palatino, Georgia, serif` for display; a clean
  system sans for body. The design must look intentional under the fallback too.
- **Palette:** paper `#F7F4EE`, card `#FFFFFF`/`#FCFAF5`, ink `#1A1A18`, secondary
  `#5C5A54`, faint `#928E84`, hairline `#E4DFD4`; accent teal `#0E6E64`, brass
  `#B8893B`; semantic muted — safe `#1F7A5A`, warn `#B5781E`, contained/danger
  oxblood `#A8412A`.
- **Atmosphere:** faint SVG paper-grain overlay, hairline rules, generous whitespace,
  small-caps letterspaced kickers, large tabular serif numerals.
- **i18n:** RTL-aware (Arabic `dir="rtl"`, larger size). Hindi/Malayalam render in
  their scripts via the font fallback chain.
- **Motion:** `prefers-reduced-motion` honoured; hero figures count up; nav cross-fades;
  scenario stages cascade with a drawn connector thread.

## Font delivery

Keep the dashboard a single served file with **no new server routes**: base64-embed
the woff2 in the inline CSS (fully offline). If embedding is impractical (file size /
editability), the alternative is a minimal `StaticFiles` mount serving `web/fonts/`.
If neither font can be sourced, ship the curated fallback stack — no files, no mount.

## Views (all rendered from `/api/demo`)

1. **Trust & Safety (landing):** manifesto hero "Propose, don't transact."; four big
   serif stat figures from `safety_summary`; editorial capability manifest table
   (`capabilities`: wired ✓ vs absent ✗); "Contained this session" panels from
   `snapshot.safety_events`.
2. **Six scenarios:** inbound message card → cinematic agent-stage thread (`stages[].steps[]`,
   each with optional `tool`/`detail`, warn rows start with ⚠) → drafted replies
   (`messages[]`, RTL-aware) → "Why it wins" pull-quote (`edge`). Manipulation scenario
   shows the contained-attack panel (`result.safety_event`). Per-scenario Run/Replay.
3. **Executive MIS digest:** per-brand CSAT/NPS/CES cards (`velocity_digest` scenario
   `result.metrics`), velocity watch list (`result.watch_list`), delivered digest
   (`digest_markdown`).
4. **Human approval queue:** `snapshot.human_queue` items (PROCUREMENT_APPROVAL /
   WARRANTY_FULFILLMENT) with priority badges; never expose staff names.

## Robustness

- Graceful loading + error states (server down → clear message).
- Pure read of `/api/demo`; no writes, no PII cached client-side.
- Single file; degrades to fallback fonts without breaking layout.

## The skill (separate deliverable)

Create the `frontend-design` skill from the user-provided content at
`~/.claude/skills/frontend-design/SKILL.md` (personal, reusable). Authored via the
`writing-skills` skill for correct frontmatter/format.

## Out of scope

Backend/agent logic, new API endpoints, persistence, auth, React/build tooling.
