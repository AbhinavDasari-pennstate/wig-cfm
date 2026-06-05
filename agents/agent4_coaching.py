"""Agent 4 — Regional Coaching.

Team-level coaching summaries per (brand, region) with CSAT/NPS/CES context.
Hard guardrail (code + prompt): coaching output never names an individual — only
team-level patterns ("the returns desk team", "front-of-store staff").
"""

from __future__ import annotations

from collections import defaultdict

from core.backend import DemoBackend
from core.llm import LLMRunner
from agents.agent3_quality import nps, _avg

SYSTEM_PROMPT = """You are the regional coaching agent for WIG. You turn satisfaction data into help for
store managers. Tone: constructive, specific, data-backed. CRITICAL: never name individual employees —
team-level patterns only. Include CSAT, NPS and CES context in every report. Frame coaching positively."""

WIG_NPS_AVERAGE = 32  # benchmark used in coaching framing

# Map complaint categories to team-level (never individual) references.
_TEAM = {
    "STORE_EXPERIENCE": "the front-of-store team",
    "WARRANTY_RETURN": "the returns desk team",
    "DELIVERY": "the fulfillment team",
    "PRODUCT_QUALITY": "the floor merchandising team",
    "OUT_OF_STOCK": "the replenishment team",
}


async def generate_coaching_reports(backend: DemoBackend, runner: LLMRunner) -> list[dict]:
    rows = backend.search_tickets(None, None, 30)
    groups: dict[tuple, list[dict]] = defaultdict(list)
    for r in rows:
        groups[(r["brand"], r.get("region") or "Unknown")].append(r)

    reports = []
    for (brand, region), items in sorted(groups.items()):
        if len(items) < 5:
            continue
        csat = _avg([i["csat_score"] for i in items if i.get("csat_score") is not None])
        npsv = nps([i["nps_score"] for i in items if i.get("nps_score") is not None])
        ces = _avg([i["ces_score"] for i in items if i.get("ces_score") is not None])

        themes = (await runner.run("summarise_themes",
                                   {"texts": [i["category"] for i in items]}))["themes"]
        team = _TEAM.get(themes[0], "the customer service team") if themes else "the team"

        nps_gap = npsv - WIG_NPS_AVERAGE
        summary = (
            f"NPS is {npsv:+d} vs the WIG retail average of {WIG_NPS_AVERAGE:+d} "
            f"({'above' if nps_gap >= 0 else f'{abs(nps_gap)} below'}). "
            f"CSAT {csat}/5 and CES {ces}/5. The most common theme is "
            f"{themes[0].replace('_', ' ').lower() if themes else 'general'} — a good focus area for "
            f"{team}. " + ("Effort score suggests resolution is hard for customers; review the "
                           "returns desk process. " if ces <= 2.5 else "")
            + "Keep reinforcing what is working; coach at the team level."
        )

        backend._log("coaching_pushed", brand=brand, region=region)  # → SAP SuccessFactors
        reports.append({"brand": brand, "region": region, "tickets": len(items),
                        "csat_avg": csat, "nps_score": npsv, "ces_avg": ces,
                        "themes": themes, "coaching_summary": summary})
    return reports
