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
    data_cache.py       Stage 0 shared yfinance price/volume fetch + cache
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

Requires Python 3.10+ (the deterministic unit tests also run on 3.9). Uses `uv`, or
the bundled Codex Python works locally:

```bash
cd engine
uv venv && uv pip install -e .            # add the fork to dependencies first
cp .env.example .env                      # then put ANTHROPIC_API_KEY in .env
```

For a local TradingAgents graph smoke without touching system Python:

```bash
python3.12 -m venv engine/.venv
engine/.venv/bin/python -m pip install -e ref/TradingAgents -e engine
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

Stage 0 intentionally starts small: one yfinance price/volume read per configured
symbol, cached under `engine/out/cache/<date>/`. If a ticker cannot be fetched, the
run uses the existing synthetic fallback for that symbol and records the fallback in
`run.stages.data_refresh_detail`. Fresh market news, social, on-chain, and background
portfolio refresh are not part of this slice.

A quiet day — nothing clears the screener — runs Stage 0 + Stage 1 only, costs **zero
LLM spend**, and writes a bundle whose single card is `nothing_actionable`.

`bin/engine-briefing` (repo root) is a thin wrapper around the run entry point.

## TradingAgents graph smoke

The engine has two agent paths:

- `MASTERMOLD_ENGINE_ADAPTER=auto` tries `TradingAgentsGraph.propagate` first, then
  records a structured fallback reason and uses direct OpenRouter card synthesis.
- `MASTERMOLD_ENGINE_ADAPTER=tradingagents` is strict: if graph propagation cannot
  produce cards, the run fails instead of silently falling back.

After installing `ref/TradingAgents` into `engine/.venv`, a one-symbol / one-analyst
strict smoke has been verified with OpenRouter:

```bash
MASTERMOLD_ENGINE_ADAPTER=tradingagents engine/.venv/bin/python - <<'PY'
from pathlib import Path
from mastermold_engine.run_briefing import load_config, load_market_signals, run_screener_stage, run_agent_stage
cfg = load_config(Path("engine/config.yml"))
cfg["watchlist"] = [next(item for item in cfg["watchlist"] if item["symbol"] == "NVDA")]
cfg["always_run"] = ["NVDA"]
cfg["selected_analysts"] = ["market"]
signals, data_refresh_status, data_refresh_detail = load_market_signals("2026-06-08", cfg["watchlist"])
screens, triggered = run_screener_stage(cfg["watchlist"], signals, lookback=30, trigger_z=1.5, always_run={"NVDA"})
cards, cost, status, detail = run_agent_stage(
    config=cfg,
    screens=screens,
    triggered=triggered,
    run_date="2026-06-08",
    event_time="2026-06-08T13:30:00.000Z",
    knowledge_time="2026-06-08T13:42:11.000Z",
)
print(status, detail, len(cards))
PY
```

Current finding: graph initialization and one-symbol propagation work with OpenRouter
config, but full multi-ticker / multi-analyst runs are too slow for an interactive
morning page. Keep the graph on a scheduled/flagged-only path; Today should read the
latest bundle rather than trigger graph work on page load.

## Offline tests

The deterministic mapping (conviction, screener, adapter, beliefs, journal bridge) is
covered without keys or network, on a plain Python:

```bash
cd engine && python tests/test_deterministic.py     # 16 tests, no deps
```

The **integration** test proves the fork delta against the *real* TradingAgents
pydantic schemas — the additive fields apply to the actual `ResearchPlan` /
`PortfolioDecision`, a DriverList validates, and real structured-agent output flows
through the adapter into a bundle where every artifact carries non-backdated
`event_time` / `knowledge_time`. It needs pydantic (the engine venv) but no keys, and
writes a fixture that the dashboard's `tests/engine-integration-contract.test.ts`
validates against the zod contract (a cross-language round-trip):

```bash
python -m venv .venv && .venv/bin/pip install pydantic
.venv/bin/python tests/test_integration.py
```

The only thing these cannot cover is live LLM inference — that needs provider keys
and the full graph; the seam itself is proven without them.

## Cost & safety

- Two-tier models (config.yml): quick-think (Haiku-class) for analysts/debaters,
  deep-think (Sonnet-class) for the two judges only.
- `budget.usd_per_run_cap` aborts a run before it overspends; actuals land in
  `run.cost` and surface on `/review`.
- `knowledge_time` is stamped at file-write time and never backdated, so as-of replay
  stays honest.
- Where it runs (local cron vs. Zo) is a Phase 4 decision; local keeps keys off the
  server.
