PORT ?= 8000

.PHONY: install demo run test scan digest restock-test

install:
	pip install -r requirements.txt

demo:                 ## narrated terminal demo (offline, no API key)
	python -m demo.cli

run:                  ## serve the dashboard at http://localhost:$(PORT)
	uvicorn orchestrator.main:app --reload --port $(PORT)

test:
	pytest -q

scan:                 ## trigger the daily quality scan manually
	python -c "import asyncio; from core.backend import DemoBackend; from agents.agent3_quality import run_daily_quality_scan; print(asyncio.run(run_daily_quality_scan(DemoBackend())))"

digest:               ## print the weekly MIS digest
	python -c "import asyncio; from core.backend import DemoBackend; from core.llm import ScriptedLLMRunner; from agents.agent3_quality import generate_weekly_digest; print(asyncio.run(generate_weekly_digest(DemoBackend(), ScriptedLLMRunner()))['digest_markdown'])"

restock-test:         ## POST a test restock webhook (needs `make run` first)
	curl -s -X POST http://localhost:$(PORT)/restock-confirmed -H 'content-type: application/json' -d '{"sap_ticket_id":"CRM-00001","aisle":"12"}'
