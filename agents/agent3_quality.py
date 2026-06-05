"""Agent 3 — Quality Intelligence.

Velocity-based trend detection is the PRIMARY trigger (catches new-product failures
early); the legacy 15-in-7-days volume rule is the secondary fallback. All maths is
deterministic Python. The weekly digest reports CSAT, NPS and CES per brand.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone

from core.backend import DemoBackend
from core.llm import LLMRunner

SYSTEM_PROMPT = """You are the quality intelligence agent for WIG. You analyse patterns across all feedback.
Surface insights, not noise. A velocity spike on a brand-new product is more actionable than a slow
volume build on an established one. The weekly digest is read by senior leadership: metrics, trends,
watch list, no filler. Always include CSAT, NPS and CES per brand and flag thin data (<10 responses)."""

VELOCITY_THRESHOLD_PCT = 50.0
VELOCITY_MIN_RECENT = 3
VOLUME_THRESHOLD = 15


def _now() -> datetime:
    return datetime.now(timezone.utc)


def nps(values: list[int]) -> int:
    if not values:
        return 0
    promoters = sum(1 for v in values if v >= 9)
    detractors = sum(1 for v in values if v <= 6)
    return round((promoters - detractors) / len(values) * 100)


def _avg(values: list[int]) -> float:
    return round(sum(values) / len(values), 1) if values else 0.0


async def run_daily_quality_scan(backend: DemoBackend) -> dict:
    rows = backend.search_tickets(None, None, 7)
    groups: dict[tuple, list[datetime]] = defaultdict(list)
    for r in rows:
        groups[(r["brand"], r["product_sku"], r["category"])].append(r["created_at"])

    now = _now()
    recent_lo, prior_lo = now - timedelta(days=3), now - timedelta(days=6)
    alerts, watch_list = [], []

    for (brand, sku, category), dates in groups.items():
        recent = sum(1 for d in dates if d >= recent_lo)
        prior = sum(1 for d in dates if prior_lo <= d < recent_lo)
        total = len(dates)

        spike = False
        velocity_pct = None
        if recent >= VELOCITY_MIN_RECENT:
            if prior == 0:
                spike, velocity_pct = True, None  # brand-new: any cluster is a spike
            else:
                velocity_pct = round((recent - prior) / prior * 100, 1)
                spike = velocity_pct > VELOCITY_THRESHOLD_PCT

        if spike:
            res = backend.raise_quality_alert({
                "alert_type": "velocity_spike", "brand": brand, "product_sku": sku,
                "category": category,
                "description": f"{recent} complaints in last 3d vs {prior} prior 3d"
                               + (f" (+{velocity_pct}%)" if velocity_pct is not None else " (new SKU)"),
                "velocity_pct": velocity_pct, "ticket_count": total,
            })
            alerts.append({"alert_id": res["alert_id"], "type": "velocity_spike",
                           "brand": brand, "sku": sku, "recent": recent, "prior": prior,
                           "velocity_pct": velocity_pct, "total": total})
            watch_list.append(f"{brand} {sku}: +{velocity_pct or '∞'}% velocity "
                              f"({recent} in 3d, {total} total — under volume-{VOLUME_THRESHOLD})")
        elif total >= VOLUME_THRESHOLD:
            res = backend.raise_quality_alert({
                "alert_type": "volume_threshold", "brand": brand, "product_sku": sku,
                "category": category, "description": f"{total} complaints in 7 days",
                "velocity_pct": None, "ticket_count": total,
            })
            alerts.append({"alert_id": res["alert_id"], "type": "volume_threshold",
                           "brand": brand, "sku": sku, "total": total})

    return {"alerts": alerts, "watch_list": watch_list, "groups_scanned": len(groups)}


async def generate_weekly_digest(backend: DemoBackend, runner: LLMRunner) -> dict:
    rows = backend.search_tickets(None, None, 7)
    per_brand: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        per_brand[r["brand"]].append(r)

    scan = await run_daily_quality_scan(backend)
    metrics = {}
    lines = ["# WIG Customer Feedback — Weekly MIS Digest", ""]
    lines.append(f"_Window: last 7 days · {sum(len(v) for v in per_brand.values())} tickets · "
                 f"{len(scan['alerts'])} quality alert(s)_")
    lines.append("")
    lines.append("| Brand | Tickets | CSAT | NPS | CES | Top categories |")
    lines.append("|---|---|---|---|---|---|")

    for brand, items in sorted(per_brand.items()):
        csat = _avg([i["csat_score"] for i in items if i.get("csat_score") is not None])
        npsv = nps([i["nps_score"] for i in items if i.get("nps_score") is not None])
        ces = _avg([i["ces_score"] for i in items if i.get("ces_score") is not None])
        cats: dict[str, int] = defaultdict(int)
        for i in items:
            cats[i["category"]] += 1
        top = ", ".join(c for c, _ in sorted(cats.items(), key=lambda kv: -kv[1])[:3])
        thin = " ⚠thin data" if len(items) < 10 else ""
        metrics[brand] = {"tickets": len(items), "csat": csat, "nps": npsv, "ces": ces}
        lines.append(f"| {brand} | {len(items)}{thin} | {csat}/5 | {npsv:+d} | {ces}/5 | {top} |")

    lines.append("")
    lines.append("## Watch list")
    if scan["watch_list"]:
        for w in scan["watch_list"]:
            lines.append(f"- 🔴 {w}")
    else:
        lines.append("- (no velocity alerts this week)")

    return {"digest_markdown": "\n".join(lines), "metrics": metrics,
            "alerts": scan["alerts"], "watch_list": scan["watch_list"]}
