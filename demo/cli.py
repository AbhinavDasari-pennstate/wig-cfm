"""Narrated terminal demo. Run with:  python -m demo.cli

Works fully offline (no API key). A reliable fallback if a browser isn't handy.
"""

from __future__ import annotations

import asyncio
import sys

from demo.runner import build_report

try:  # Windows consoles default to cp1252; the demo prints Arabic/Hindi/box chars.
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

R = "\033[0m"; B = "\033[1m"; DIM = "\033[2m"
CYAN = "\033[36m"; GREEN = "\033[32m"; YELLOW = "\033[33m"; RED = "\033[31m"; MAG = "\033[35m"


def _rule(char="─", n=78):
    print(DIM + char * n + R)


def _print_scenario(i: int, s: dict) -> None:
    print()
    _rule("━")
    print(f"{B}{CYAN}SCENARIO {i} · {s['title']}{R}")
    print(f"{DIM}{s['tagline']}  ·  channel: {s['channel']}{R}")
    _rule()
    inp = s["input"]
    print(f"  {B}Customer{R} ({inp['lang']}): {inp['customer']}")
    print(f"  {B}Message {R}: {inp['text']}")
    print()
    for stage in s["stages"]:
        print(f"  {B}{MAG}▸ {stage['agent']}{R}")
        for st in stage["steps"]:
            tool = f"{DIM}[{st['tool']}]{R} " if st.get("tool") else ""
            mark = RED if str(st["label"]).startswith("⚠") else GREEN
            print(f"      {mark}•{R} {st['label']}: {tool}{st['detail']}")
    if s.get("messages"):
        print()
        for m in s["messages"]:
            print(f"  {B}{YELLOW}✉ {m['label']} ({m['language']}){R}")
            print(f"      {m['text']}")
    print()
    print(f"  {B}{GREEN}➜ Why it wins:{R} {s['edge']}")


async def main() -> None:
    report = await build_report()
    print()
    print(f"{B}{CYAN}WONDERFUL.AI × WESTERN INTERNATIONAL GROUP{R}")
    print(f"{DIM}Customer Feedback Intelligence — live agent demo (deterministic, offline){R}")

    for i, s in enumerate(report["scenarios"], 1):
        _print_scenario(i, s)
        if s["id"] == "velocity_digest":
            print()
            print(DIM + "  — — — Weekly MIS digest (as sent to WIG leadership) — — —" + R)
            for line in s["digest_markdown"].splitlines():
                print("  " + line)

    print()
    _rule("━")
    ss = report["safety_summary"]
    print(f"{B}{GREEN}TRANSACTION-SAFETY SCORECARD{R}")
    print(f"  Purchase orders auto-created by agents .......... {B}{ss['purchase_orders_created']}{R}")
    print(f"  Transactional tools available to agents ........ {B}{ss['transactional_tools_available']}{R}")
    print(f"  Manipulation attempts contained ................ {B}{ss['manipulation_attempts_contained']}{R}")
    print(f"  Decisions routed to a human for approval ....... {B}{ss['human_approval_tasks']}{R}")
    _rule("━")
    print()


if __name__ == "__main__":
    asyncio.run(main())
