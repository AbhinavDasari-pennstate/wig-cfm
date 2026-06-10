# WIG Customer Feedback Intelligence — Demo

**Wonderful.ai × Western International Group.** A 5-agent customer-feedback system for
WIG's Gulf brands (GEEPAS, NESTO, ROYALFORD, JAZP, WIGME …), built on the Claude Agent
SDK + MCP, with a deterministic offline "brain" so the demo is reliable in front of a
client.

## Run it

```bash
pip install -r requirements.txt        # fastapi, uvicorn, pydantic, httpx, pytest…

# 1) Client dashboard (recommended)
uvicorn orchestrator.main:app --port 8000      # then open http://localhost:8000
#    (port 8000 busy? use --port 8770)

# 2) Narrated terminal demo (no browser, no API key)
python -m demo.cli

# 3) Tests
pytest -q
```

No API keys or network needed — the demo runs entirely offline.

### Real LLM (optional)

To put real Claude behind live ingestion (`POST /feedback/*`) and the fren
co-solver (`POST /api/fren`):

```bash
export WIG_RUNNER=sdk
export ANTHROPIC_API_KEY=sk-ant-...
# optional: export WIG_LLM_MODEL=claude-opus-4-8
uvicorn orchestrator.main:app --port 8000
```

`GET /api/demo` (the dashboard report) always uses the deterministic scripted
brain, so the demo invariants never change. Any LLM failure transparently falls
back to scripted — check `GET /health` for `runner` and `llm_fallbacks`.

## What the demo shows

Six scenarios run the **real agents** end-to-end:

| # | Scenario | Differentiator |
|---|----------|----------------|
| 1 | Arabic warranty claim, closed end-to-end | Multilingual + closed-loop reply; a human still approves the shipment |
| 2 | NESTO out-of-stock via QR → reorder **recommended** | Agentic root-cause diagnosis; no autonomous spend |
| 3 | Prompt-injection ordering 500 units | **Structurally contained** — the agent has no order tool |
| 4 | Velocity spike + weekly MIS digest | Fires at 8 complaints; a volume-15 threshold stays silent |
| 5 | Hindi intake + regional coaching | Native multilingual; team-level coaching (never names staff) |
| 6 | Safety complaint → HITL | Urgency 4–5 escalated by code, not model discretion |

## The headline guarantee: propose, don't transact

The agents can **read, record feedback, draft messages, and notify a human** — they hold
**no tool that commits money, goods, or an order.** `create_purchase_order`,
`generate_return_label`, and `dispatch_replacement` are not implemented and not wired to
any agent (`mcp_servers/*.py` → `FORBIDDEN_TOOLS`; proven in `tests/test_safety.py`). A
prompt-injected, jailbroken agent still cannot spend, because the capability is absent —
not because a prompt asks it not to.

## Architecture

```
channel → FeedbackTicket → Agent 1 (triage) ─┬─ HITL (urgency 4–5)
                                             ├─ Agent 2 Warranty  → request human approval → loop-close + survey
                                             ├─ Agent 5 OOS/Proc  → diagnose → notify human buyer → restock notice
                                             └─ buffer
   scheduled:  Agent 3 Quality (velocity + MIS digest)   Agent 4 Coaching (team-level, NPS/CES)
```

- **`agents/`** — deterministic orchestration; the LLM is used only for language,
  classification, and drafting. Guardrails (routing, AED-500, velocity, the three OOS
  cases) are plain Python.
- **`mcp_servers/`** — SAP CRM, Warranty, Procurement tools. Tool logic is plain async
  functions (unit-tested without the SDK); `create_*_server()` wraps them for production.
- **`core/llm.py`** — `LLMRunner` protocol. `ScriptedLLMRunner` (deterministic, used here)
  vs a production `SDKRunner` on the Claude Agent SDK — a one-line swap, guardrails unchanged.
- **`core/backend.py`** — in-memory SAP/MM/courier stand-in for the demo; a `HttpBackend`
  (httpx → real SAP) drops in via `WIG_BACKEND`.

## Design spec
`docs/superpowers/specs/2026-06-05-wig-cfm-design.md` — the agreed design, including the
full transaction-safety model.
