# MasterMold engine

TradingAgents ([TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents),
Apache 2.0) wrapped as a **Python sidecar** that produces the artifacts the MasterMold
dashboard already expects. The dashboard stays TypeScript; the two talk through
**files, not RPC** — one JSON bundle per dated run (see [`CONTRACT.md`](./CONTRACT.md)).

The engine never touches a brokerage. It reads market data and writes JSON. This is
why the dashboard's advisory-only / read-only invariant is unaffected: no new path
mutates anything external.

## Layout

```
engine/
  config.yml            watchlist, provider/models, screener thresholds, budget
  CONTRACT.md           the bundle schema both sides validate (Pydantic write, zod read)
  .env.example          provider keys live in engine/.env (gitignored), never committed
  mastermold_engine/
    conviction.py       PM rating -> 1-10 conviction magnitude + direction + status   (pure)
    screener.py         Stage 1 deterministic z-scores: alerts + triggered tickers     (pure)
    adapter.py          agent outputs -> bundle JSON, field-for-field vs schema.ts      (pure)
    beliefs.py          reflection significance gate (N consistent outcomes)            (pure)
    journal_bridge.py   memory log <-> journal/outcome JSON                             (pure core)
    cost.py             StatsCallbackHandler totals -> run.cost                         (pure)
    export.py           atomic bundle write, idempotent by run date                    (pure)
    data_cache.py       Stage 0 shared fetch + cache (network seam)
    schemas.py          the additive fork delta: DriverList + 3 fields
    run_briefing.py     entry: the staged funnel
    resolve_outcomes.py entry: Phase B outcome resolution
  out/                  data drop (gitignored): engine-run-*.json + cache/ + memory/
  tests/                offline unit tests for the deterministic modules
```

## The fork delta

Per the plan, engine changes are additive and small. Fork TradingAgents, keep upstream
as a remote, and apply exactly three additions (all spelled out in
[`mastermold_engine/schemas.py`](./mastermold_engine/schemas.py)):

1. `DriverList` schema + one Driver-Extractor call over all four analyst reports.
2. `ResearchPlan.bull_case_summary` / `.bear_case_summary` (card bull/bear cases, free).
3. `PortfolioDecision.falsification_condition` (journal falsification, PM-generated).

Plus, in Phase 4, an Anthropic `cache_control` breakpoint after the analyst system
block (Optimization 3). Until the fork is published, the engine imports the delta from
`schemas.py` and registers it with the graph.

## Setup

Requires Python 3.10+ (the deterministic unit tests also run on 3.9). Uses `uv`.

```bash
cd engine
uv venv && uv pip install -e .            # add the fork to dependencies first
cp .env.example .env                      # then put ANTHROPIC_API_KEY in .env
```

## Run

```bash
# Full funnel for a session (Stage 0 fetch + screen + agent runs on triggered tickers):
uv run python -m mastermold_engine.run_briefing --date 2026-06-08

# Phase B: resolve outcomes for pending journal entries (reuses Stage 0 cache):
uv run python -m mastermold_engine.resolve_outcomes --date 2026-06-08
```

Both write into `engine/out/`. The dashboard ingests the newest `engine-run-*.json`
automatically; if `engine/out/` is empty or a bundle is invalid, the dashboard boots
on seeds (the permanent zero-config fallback) and says so on `/review`.

A quiet day — nothing clears the screener — runs Stage 0 + Stage 1 only, costs **zero
LLM spend**, and writes a bundle whose single card is `nothing_actionable`.

`bin/engine-briefing` (repo root) is a thin wrapper around the run entry point.

## Offline tests

The deterministic mapping (conviction, screener, adapter, beliefs, journal bridge) is
covered without keys or network:

```bash
cd engine && python -m pytest -q          # or: python tests/run_offline.py
```

## Cost & safety

- Two-tier models (config.yml): quick-think (Haiku-class) for analysts/debaters,
  deep-think (Sonnet-class) for the two judges only.
- `budget.usd_per_run_cap` aborts a run before it overspends; actuals land in
  `run.cost` and surface on `/review`.
- `knowledge_time` is stamped at file-write time and never backdated, so as-of replay
  stays honest.
- Where it runs (local cron vs. Zo) is a Phase 4 decision; local keeps keys off the
  server.
