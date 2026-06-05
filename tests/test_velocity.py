"""Agent 3 — velocity detection is primary; digest carries CSAT/NPS/CES."""

from core.backend import DemoBackend
from core.llm import ScriptedLLMRunner
from agents import agent3_quality


async def test_velocity_spike_fires_before_volume_threshold():
    backend = DemoBackend()
    scan = await agent3_quality.run_daily_quality_scan(backend)
    spikes = [a for a in scan["alerts"] if a["type"] == "velocity_spike"]
    assert len(spikes) == 1
    s = spikes[0]
    assert (s["brand"], s["sku"]) == ("GEEPAS", "GK-NEW")
    assert s["recent"] == 6 and s["prior"] == 2
    assert s["velocity_pct"] == 200.0
    # The spike fired even though total (8) is under the legacy volume threshold (15).
    assert s["total"] < agent3_quality.VOLUME_THRESHOLD
    assert not any(a["type"] == "volume_threshold" for a in scan["alerts"])


def test_nps_formula():
    # 5 promoters, 2 detractors, 3 passives → (50% - 20%) = +30
    vals = [10, 10, 9, 9, 9, 7, 8, 8, 6, 5]
    assert agent3_quality.nps(vals) == 30


async def test_weekly_digest_has_all_three_metrics_per_brand():
    backend = DemoBackend()
    digest = await agent3_quality.generate_weekly_digest(backend, ScriptedLLMRunner())
    assert {"GEEPAS", "NESTO", "ROYALFORD"}.issubset(digest["metrics"].keys())
    for brand, m in digest["metrics"].items():
        assert "csat" in m and "nps" in m and "ces" in m
    md = digest["digest_markdown"]
    assert "CSAT" in md and "NPS" in md and "CES" in md
    assert "GK-NEW" in md  # watch list surfaces the velocity spike
