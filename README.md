# Master Mold

Master Mold is a personal financial-copilot dashboard and the user-facing surface of a
larger Intelligent Financial Agent: a personal, owned system that combines a market
briefing, a prioritized alert feed, read-only portfolio context, a decision journal with
a published track record, a paper-trading sandbox, an agent chat, and a bounded Web3
executor model.

It began as a seeded RDS demo (the original public service at
`https://rds-rds-product-type-game-8a408d-kahris.zocomputer.io/` has been taken down).
It is now being evolved into the real thing: a Python sidecar **engine** (a fork of
[TradingAgents](https://github.com/TauricResearch/TradingAgents)) computes the briefing,
alerts, journal/memory loop, and paper predictions, and the Next.js dashboard ingests
that output through a thin, schema-validated layer — falling back to seeded demo data
whenever the engine has not run. The original product reference documents are preserved
in `docs/ref`.

## Getting started

Master Mold is built to **clone and run with zero setup** — no credentials, no engine, no
external accounts required. It boots on seeded sample data so you can explore the whole app
immediately.

```bash
bun install
bun dev            # then open the printed http://localhost:<port> URL
```

The first time you open it, a **getting-started screen** (`/welcome`) walks you through an
optional profile. You can fill it in — or click **Skip** and explore the demo right away.
Nothing here can move money; the app is advisory-only by construction.

### Your profile (backup & restore)

Everything personal — your name, preferences, and which accounts you connect — lives in
**your browser only** (localStorage). There is no account and no server-side user data.

- **Set it up:** name + risk posture + asset focus on `/welcome`, or later in **Settings → Profile**.
- **Connect accounts (optional):** add read-only API keys under **Settings → Connections**.
  Keys never leave your browser and never gain trade authority.
- **Export:** **Settings → Profile → Export** downloads a single `mastermold-profile-*.json`
  bundling your preferences *and* connected accounts.
- **Import:** drop that file into **Import profile** (or **Restore from a backup** on the
  welcome screen) on any machine to pick up exactly where you left off.
- **Start from scratch:** wipes all local state and returns you to the getting-started screen.

This makes the project portable and personal at once: anyone can clone it and start fresh,
and you can back up and move your own setup between machines with one file.

## Current State

The dashboard boots fully with **zero credentials and zero engine output**, rendering
from local seeded data. When the engine has written a run, the briefing, alerts, journal
track record, calibration curve, paper arena, and chat context are **computed from real
engine output** instead, each labelled honestly with an "Engine output" provenance chip
(versus "Demo data" for seeds). The **Transparency** page (`/review`) separates, live, what
is engine-computed vs. sample vs. dormant, including per-run cost.

Implemented so far (branch `engine-integration`):

- **Phase 0** — the Python engine scaffold: a screener-gated funnel, the additive
  TradingAgents schema delta, and the deterministic mapping logic, all unit-tested.
- **Phase 1** — the zod ingestion layer; briefing and alerts go engine-backed with
  honest provenance.
- **Phase 1.5** — durable `bun:sqlite` persistence so operator-created journal entries,
  paper predictions, and alert feedback survive a restart.
- **Phase 2** — the journal/memory loop: track-record-by-tier and the reflection
  significance gate computed from resolved engine decisions.
- **Phase 3** — calibration curve, engine context in chat, the human-vs-engine paper
  arena, and the alert-feedback → screener-threshold tuning loop.

What still requires credentials/ops (not yet done): the **live LLM run** itself (provider
keys + the full LangGraph dependency tree + Python 3.10), always-on cron scheduling,
prompt caching, batch reflections, and real brokerage/exchange/wallet integrations.

The central invariant is unchanged: **advisory-only, read-only by construction.** The
dashboard never places a trade or moves funds; the engine only reads data and writes
JSON. A static enforcement test fails if a trade/order/write endpoint is ever introduced.

## Architecture: the engine and the dashboard

The two worlds talk through **files, not RPC**. The engine writes one schema-validated
JSON bundle per dated run; the dashboard reads the newest valid bundle and falls back to
seeds when none exists. Pydantic validates on write, zod validates on read. See
[`engine/CONTRACT.md`](engine/CONTRACT.md).

The engine runs as a staged funnel (cost scales with market activity, not the calendar):

```text
Stage 0  Data refresh (free)   shared per-ticker + one global news fetch, cached
Stage 1  Screener (free)       deterministic z-scores -> Alert JSON (T0/T1/T2) AND
                               the list of tickers that earn a full agent run
Stage 2  Agent runs (paid)     full TradingAgents pipeline ONLY for triggered tickers
Stage 3  Outcome resolution    Phase B for pending journal entries; scores paper rounds
Stage 4  Export                adapter writes the briefing + alerts + journal-sync bundle
```

A quiet day where nothing clears the screener costs zero LLM spend and renders an honest
"nothing actionable today." Every engine artifact carries `event_time` and
`knowledge_time` (stamped at write time, never backdated), so bitemporal "as-of" replay
stays honest with no look-ahead.

The additive fork delta is small and lives in the engine package
([`engine/mastermold_engine/schemas.py`](engine/mastermold_engine/schemas.py)), proven
against the real upstream schemas by the integration test: a `DriverList` schema,
`bull_case_summary` / `bear_case_summary` on `ResearchPlan`, and `falsification_condition`
on the PM `PortfolioDecision`.

## Product Intent

The long-range Master Mold concept is a personal financial agent with three layers:

1. **Brain** — a self-maintaining market and memory engine with point-in-time data
   discipline, reflection, and a significance-gated belief loop.
2. **Copilot** — a daily briefing, alerts, portfolio advisor, decision journal, and chat
   that reasons over the operator's holdings. Advisory only — the operator executes every
   real trade themselves.
3. **Executor** — a bounded-authority Web3 strategy runner for structural yield, with
   on-chain spend caps, allowlists, simulation gates, and human approval.

The engine now implements the Brain/Copilot reasoning and the memory loop; the Executor
remains a display-only monitor that signs nothing.

## What Works In This Repo

- Daily Briefing with ranked cards (why-now, relevance, bull/bear, 1–10 conviction,
  horizon, ranked color-coded drivers), engine-backed when a run exists, seeded otherwise.
- Briefing detail with drivers, source citations, and the linked, falsification-stamped
  journal entry.
- Alert Feed with T0/T1/T2 tiers, rationale, acknowledgement, and useful/not-useful
  feedback that tunes the screener; engine alerts carry the triggering screener signal.
- Portfolio view (read-only) with consolidated holdings, DeFi positions, allocation, and
  concentration scoring.
- Decision Journal with pre-outcome thesis logging + falsification, outcome scoring, a
  track record by confidence tier, a calibration curve, and a reflection significance
  gate computed from resolved engine decisions.
- Paper-Trading arena that pits the operator against the engine's own per-card prediction,
  scored on calibration/patience/diversification — zero capital, no confetti.
- Agent Chat shell whose context now carries today's engine briefing (canned responses
  when no model key is present).
- Web3 Executor monitor with display-only metrics, guardrail controls, and a kill-switch
  UI that signs nothing.
- `/review` truthfulness surface with a live engine-status card, per-run cost, ingested
  run history, and the screener-tuning feedback.
- Honest provenance ("Engine output" vs "Demo data") on every surfaced fact; bitemporal
  as-of replay over both engine and seeded data.
- Durable `bun:sqlite` store behind journal/paper/alerts with idempotent engine ingestion.
- A static read-only enforcement test plus broad engine-on coverage (54 TypeScript tests
  across 12 files) and the Python engine tests (16 deterministic + an integration test
  against the real TradingAgents schemas).

## What Does Not Exist Yet

Intentionally not implemented / blocked on credentials or ops:

- The **live LLM run** (provider keys, the LangGraph/LangChain dependency tree, Python
  3.10+). The engine's deterministic stages and the full integration seam are proven with
  fixtures and the real upstream schemas; only live inference is pending.
- Always-on cron scheduling, Anthropic prompt caching, and batch-API reflections (Phase 4).
- Live brokerage, exchange, or wallet integrations (Coinbase, Robinhood/SnapTrade, Zerion,
  on-chain).
- Automated equity trading (architectural non-goal — permanent).
- Real Web3 execution, signing, simulation, custody, on-chain spend caps, or chain RPC.
- The full evaluation harness (DSR/PBO/MinTRL, Alpaca live-shadow, post-cutoff validation).
- CPA-reviewed tax treatment before any real capital.
- Multi-user accounts, public signup, or managing anyone else's money.

## Safety Boundaries

The central invariant is read-only advisory behavior.

- The dashboard must never place a trade or move funds. The engine only reads market data
  and writes JSON; it never touches a brokerage.
- The `/api/executor` route is a seeded local monitor endpoint only, allowlisted in the
  read-only test because it is not a brokerage or wallet write path.
- Credential entry is optional and local. The app runs with zero credentials. LLM/provider
  keys live only in `engine/.env` or `.env.local` and are never committed.
- `knowledge_time` is stamped at engine write time and never backdated; ingestion rejects
  future-stamped (look-ahead) bundles.
- Any future live integration must preserve physical separation between read tools and
  execute tools, and any executor must fail closed behind enforceable policy boundaries.

## Tech Stack

Dashboard:

- Next.js App Router, React, TypeScript, Bun runtime
- Tailwind CSS, Radix Slot/Label primitives, Lucide icons, TradingView Lightweight Charts
- `zod` for engine-output validation; `bun:sqlite` for durable persistence (zero new deps)
- Local seeded data + engine ingestion in `src/db`; Bun test runner

Engine (`engine/`, separate runtime):

- Python 3.10+ managed with `uv`; pydantic v2
- A fork of TradingAgents (LangGraph multi-agent framework) pinned as a dependency, with
  the small additive schema delta in the engine package
- Deterministic mapping modules (conviction, screener, adapter, beliefs, journal bridge,
  cost, export) are dependency-light and unit-testable on a plain Python

## Repository Structure

```text
app/                         Next.js pages and read-only API routes
components/                  Dashboard UI components and shared primitives
src/db/                      Schema, seeds, bitemporal helpers, and:
  engine-data.ts             zod ingestion of engine bundles + provenance/run history
  store.ts                   durable bun:sqlite store (journal/paper/alerts) + fallback
  screener-feedback.ts       alert-feedback -> screener-threshold tuning
engine/                      Python sidecar engine (own runtime, own .env)
  CONTRACT.md                the JSON bundle schema both sides validate
  config.yml                 watchlist, models, screener thresholds, budget cap
  mastermold_engine/         conviction/screener/adapter/beliefs/journal_bridge/...
  tests/                     deterministic + real-schema integration tests
tests/                       read-only enforcement, UAT, and engine-on test suites
tests/fixtures/engine/       contract-faithful engine bundles used by the dashboard tests
docs/ref/                    original first-party Master Mold PRDs and buildspec
spec.md, runbook.md          generated RDS implementation spec and runbook
ref/                         integration plan + the TradingAgents study clone (untracked)
```

## Main Routes

| Route | Purpose |
| --- | --- |
| `/` | Daily Briefing home (engine-backed or seeded) |
| `/briefing/[id]` | Briefing card detail with drivers + linked journal |
| `/alerts` | Alert Feed (engine screener or seeded) |
| `/portfolio` | Consolidated read-only portfolio |
| `/journal` | Decision Journal, track record, calibration curve, belief gate |
| `/paper` | Paper-Trading arena (human vs. engine) |
| `/chat` | Agent Chat shell |
| `/executor` | Display-only Web3 Executor monitor |
| `/review` | Truthfulness surface + live engine status, cost, and run history |
| `/settings/integrations` | Stubbed/credential-gated integration settings |
| `/api/health` | Health check |

## Local Development

### Dashboard

```bash
bun install
bun run dev            # http://localhost:3000 (or set the port)
bun run test           # typecheck + the full Bun test suite
```

To see the app with engine output, point it at the bundled fixtures and use a local DB:

```bash
ENGINE_OUT_DIR="$(pwd)/tests/fixtures/engine" \
MASTERMOLD_DB="$(pwd)/.data/mastermold.db" \
bun run dev
```

With no `ENGINE_OUT_DIR` (the default), every surface renders from seeds — the permanent
zero-config fallback.

### Engine

The engine is a self-contained Python package with its own venv and keys (`engine/.env`,
gitignored). Its deterministic mapping is testable without keys or network:

```bash
cd engine
python tests/test_deterministic.py          # 16 tests, plain Python, no deps

# Integration test vs the real TradingAgents schemas (needs pydantic):
python -m venv .venv && .venv/bin/pip install pydantic
.venv/bin/python tests/test_integration.py

# Full run (needs the fork + provider keys in engine/.env):
uv venv && uv pip install -e .
cp .env.example .env                         # add your provider key
uv run python -m mastermold_engine.run_briefing --date 2026-06-05
```

`bin/engine-briefing` (repo root) is a thin wrapper around the run entry point. The
dashboard ingests the newest `engine-run-*.json` from `engine/out/` automatically.

## Documentation

- `engine/CONTRACT.md` — the engine ⇄ dashboard JSON contract.
- `engine/README.md` — engine setup, the fork delta, and how to run it.
- `ref/mastermold-integration-plan.md` — the phased integration roadmap.
- `docs/ref/financial-agent-PRD.md` and `-blueprint-v3-buildspec.md` — original PRD/spec.
- `spec.md`, `runbook.md` — the generated RDS implementation spec and runbook.

## License

No license has been declared yet. Treat this as private, all rights reserved unless Chris
adds an explicit license.
