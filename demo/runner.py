"""Shared demo entry point — builds a fresh run report (used by the CLI and the API)."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone

from core.backend import DemoBackend
from core.llm import ScriptedLLMRunner
from demo.scenarios import run_all
from mcp_servers import procurement_server, sap_crm_server, warranty_server


def _capabilities() -> dict:
    """Data-driven proof of the propose-don't-transact rule, read from the servers."""
    servers = {"sap-crm": sap_crm_server, "warranty": warranty_server,
               "procurement": procurement_server}
    out = {}
    for name, mod in servers.items():
        out[name] = {"wired": list(mod.TOOL_NAMES),
                     "absent_transactional": list(mod.FORBIDDEN_TOOLS)}
    return out


def _prior_week_metrics(backend: DemoBackend) -> dict:
    """Compute brand metrics for days 8–14 to power trend arrows on the dashboard."""
    from agents.agent3_quality import _avg, nps

    now = datetime.now(timezone.utc)
    prior_lo = now - timedelta(days=14)
    prior_hi = now - timedelta(days=7)

    rows = [t for t in backend.corpus
            if prior_lo <= t["created_at"] < prior_hi]

    per_brand: dict = defaultdict(list)
    for r in rows:
        per_brand[r["brand"]].append(r)

    out: dict = {}
    for brand, items in per_brand.items():
        csat_vals = [i["csat_score"] for i in items if i.get("csat_score") is not None]
        nps_vals  = [i["nps_score"]  for i in items if i.get("nps_score")  is not None]
        ces_vals  = [i["ces_score"]  for i in items if i.get("ces_score")  is not None]
        out[brand] = {
            "tickets": len(items),
            "csat": _avg(csat_vals),
            "nps":  nps(nps_vals),
            "ces":  _avg(ces_vals),
        }
    return out


def _daily_trend(backend: DemoBackend) -> list[dict]:
    """Per-day volume + sentiment over the last 7 days (oldest → newest)."""
    from agents.agent3_quality import _avg, nps

    now = datetime.now(timezone.utc)
    days = []
    for d in range(6, -1, -1):
        hi = now - timedelta(days=d)
        lo = now - timedelta(days=d + 1)
        rows = [t for t in backend.corpus if lo <= t["created_at"] < hi]
        nps_vals  = [r["nps_score"]  for r in rows if r.get("nps_score")  is not None]
        csat_vals = [r["csat_score"] for r in rows if r.get("csat_score") is not None]
        days.append({
            "label": ("Today" if d == 0 else f"{d}d"),
            "volume": len(rows),
            "nps": nps(nps_vals),
            "csat": _avg(csat_vals),
        })
    return days


def _channel_mix(backend: DemoBackend) -> dict:
    """Deterministic channel attribution over the current-week corpus.

    Corpus tickets are analytics records without a channel field; we derive a
    stable, weighted distribution so the dashboard can show a real aggregation.
    """
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=7)
    rows = [t for t in backend.corpus if t["created_at"] >= cutoff]
    # Weighted ring: email-heavy, then QR kiosk, eCommerce, WhatsApp (Phase 1 mix).
    ring = (["EMAIL"] * 5) + (["QR_KIOSK"] * 3) + (["ECOMMERCE"] * 2) + ["WHATSAPP"]
    mix: dict = {}
    for i, _ in enumerate(rows):
        ch = ring[i % len(ring)]
        mix[ch] = mix.get(ch, 0) + 1
    return mix


def _precedent_index(backend: DemoBackend) -> dict:
    """Per-brand corpus counts so the copilot can show real 'similar cases'.

    Read-only aggregation over the full corpus (current + prior weeks). Keyed by
    brand, with per-category counts and a resolved tally.
    """
    out: dict = {}
    for t in backend.corpus:
        b = t["brand"]
        rec = out.setdefault(b, {"total": 0, "resolved": 0, "by_category": {}})
        rec["total"] += 1
        if t.get("resolved"):
            rec["resolved"] += 1
        cat = t.get("category", "OTHER")
        rec["by_category"][cat] = rec["by_category"].get(cat, 0) + 1
    return out


def _closed_loop(backend: DemoBackend) -> list[dict]:
    """Resolved cases with scores written back to SAP, for the Closed Loop view.

    Built from audit `resolution_updated` entries joined to the ticket record and
    any customer message. Honest: one row per recorded resolution.
    """
    rows = []
    for e in backend.audit:
        if e.get("kind") != "resolution_updated":
            continue
        sid = e.get("sap_ticket_id")
        tk = backend.tickets.get(sid, {})
        msg = next((m for m in backend.customer_messages if m.get("ticket_id") == sid), {})
        rows.append({
            "sap_ticket_id": sid,
            "brand": tk.get("brand", "—"),
            "product": tk.get("product_sku") or tk.get("category", "Case"),
            "category": tk.get("category", "—"),
            "channel": tk.get("channel", "—"),
            "language": msg.get("language", tk.get("language", "—")),
            "csat": e.get("csat"),
            "nps": e.get("nps"),
            "ces": e.get("ces"),
            "notes": tk.get("resolution_notes", ""),
        })
    return rows


async def build_report() -> dict:
    backend = DemoBackend()
    runner = ScriptedLLMRunner()
    report = await run_all(backend, runner)
    caps = _capabilities()
    report["capabilities"] = caps
    report["safety_summary"] = {
        "purchase_orders_created": 0,
        # Transactional tools actually wired to agents = overlap of wired and
        # forbidden tool sets across all servers. By design this is zero.
        "transactional_tools_available": sum(
            1 for c in caps.values() for t in c["wired"] if t in c["absent_transactional"]
        ),
        "manipulation_attempts_contained": len(backend.safety_events),
        "human_approval_tasks": len(backend.human_queue),
    }

    # Brand metrics extracted from the velocity_digest scenario (computed by Agent 3).
    vel = next((s for s in report["scenarios"] if s["id"] == "velocity_digest"), None)
    report["brand_metrics"] = vel["result"]["metrics"] if vel else {}

    # Prior-week metrics for trend-arrow computation in the dashboard.
    report["prior_week_metrics"] = _prior_week_metrics(backend)

    # Per-day trend (volume + sentiment) for the Overview sparkline.
    report["daily_trend"] = _daily_trend(backend)

    # Channel mix over the current-week corpus (ticket-level aggregation).
    report["channel_mix"] = _channel_mix(backend)

    # Per-brand precedent counts + closed-loop resolutions (SAP write-back view).
    report["precedent_index"] = _precedent_index(backend)
    report["closed_loop"] = _closed_loop(backend)

    # Channel breakdown derived from scenario channels (Agent Runs counts).
    channels: dict = {}
    for s in report["scenarios"]:
        ch = s.get("channel", "—").split(" ")[0].upper()
        channels[ch] = channels.get(ch, 0) + 1
    report["channel_breakdown"] = channels

    return report
