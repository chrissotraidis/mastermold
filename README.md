# Master Mold

Master Mold is a personal financial decision app and the user-facing surface of a
larger Intelligent Financial Agent: a personal, owned system that combines a daily market
read, prioritized alerts, read-only portfolio context, a decision journal, paper trading,
global chat, and a future bounded Web3 executor model.

It began as a seeded RDS demo (the original public service at
`https://rds-rds-product-type-game-8a408d-kahris.zocomputer.io/` has been taken down).
It is now being evolved into the real thing: a Python sidecar **engine** (a fork of
[TradingAgents](https://github.com/TauricResearch/TradingAgents)) computes the briefing,
alerts, journal/memory loop, and suggested paper trades, and the Next.js app ingests
that output through a thin, schema-validated layer — falling back to sample data
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
optional profile. You can fill it in, or skip setup and explore the sample data right away.
Nothing here can move money; the app is advisory-only by construction.

### Your profile (backup & restore)

Your profile preferences live in your browser (localStorage). App activity such as
journal entries, paper trades, alert feedback, manual holdings, and market-memory runs
lives in the local app store so it can survive reloads.

- **Set it up:** name + risk posture + asset focus on `/welcome`, or later in **Settings → Profile**.
- **Check or import accounts (optional):** enter account credentials under **Settings → Connection checks**.
  The app sends them to this local server for the selected test or holdings snapshot import; imports create Portfolio holdings only after you press import and still cannot trade.
- **Export:** **Settings → Profile → Export** downloads a single `mastermold-profile-*.json`
  bundling your preferences and saved test fields.
- **Import:** drop that file into **Import profile** (or **Restore from a backup** on the
  welcome screen) on any machine to pick up exactly where you left off.
- **Start from scratch:** wipes all local state and returns you to the getting-started screen.

This makes the project portable and personal at once: anyone can clone it and start fresh,
and you can back up and move your own setup between machines with one file.

## Current State

The app boots fully with **zero credentials and no saved market scan**, rendering
from local seeded data. When the engine has written a run, the briefing, alerts, journal
past-call review, score accuracy, paper trading, and chat context are computed from
that saved scan instead. The UI labels saved scans, sample data, and manual entries plainly
so reviewers can tell what is real, what is local, and what is still only sample data.
The **Performance** page (`/review`) separates what is scan-backed vs. sample vs. not
built, including per-run cost.

Implemented so far:

- **Phase 0** — the Python engine scaffold: an alert-filtered funnel, the additive
  TradingAgents schema delta, and the deterministic mapping logic, all unit-tested.
- **Phase 1** — the zod ingestion layer; briefing and alerts go engine-backed with
  honest provenance.
- **Phase 1.5** — durable `bun:sqlite` persistence so operator-created journal entries,
  paper trades, and alert feedback survive a restart.
- **Phase 2** — the journal/memory loop: score-bucket history and the reflection
  significance gate computed from resolved engine decisions.
- **Phase 3** — confidence checks, engine context in chat, the human-vs-engine paper
  trading loop, and the alert-feedback → alert-rule tuning loop.

What still requires credentials/ops (not yet done): scheduled market scans
(market-data keys + the full LangGraph dependency tree + Python 3.10 for the complete
multi-agent path), always-on cron scheduling, prompt caching, batch reflections, and
broad account-sync coverage beyond the explicit holdings snapshot import buttons in Settings.

The central invariant is unchanged: **advisory-only, read-only by construction.** The
app never places a trade or moves funds; the engine only reads data and writes
JSON. A static enforcement test fails if a trade/order/write endpoint is ever introduced.

## Architecture: the engine and the app

The two worlds talk through **files, not RPC**. The engine writes one schema-validated
JSON bundle per dated run; the app reads the newest valid bundle and falls back to
seeds when none exists. Pydantic validates on write, zod validates on read. See
[`engine/CONTRACT.md`](engine/CONTRACT.md).

The engine runs as a staged funnel (cost scales with market activity, not the calendar):

```text
Stage 0  Data refresh (free)   shared per-ticker + one global news fetch, cached
Stage 1  Alert filter (free)   raw market moves -> prioritized alert JSON AND
                               the list of tickers that earn a full agent run
Stage 2  Agent runs (paid)     full TradingAgents pipeline ONLY for triggered tickers
Stage 3  Outcome resolution    Phase B for pending journal entries; scores paper rounds
Stage 4  Export                adapter writes the briefing + alerts + journal-sync bundle
```

A quiet day where nothing needs review costs zero LLM spend and renders an honest
"nothing urgent today." Every engine artifact carries `event_time` and
`knowledge_time`; the app rejects future-stamped bundles and normalizes malformed older
saved scans so visible knowledge time never appears before event time. That keeps
bitemporal "as-of" replay honest with no look-ahead.

The additive fork delta is small and lives in the engine package
([`engine/mastermold_engine/schemas.py`](engine/mastermold_engine/schemas.py)), proven
against the real upstream schemas by the integration test: a `DriverList` schema,
`bull_case_summary` / `bear_case_summary` on `ResearchPlan`, and `falsification_condition`
on the PM `PortfolioDecision`.

## Product Intent

The long-range Master Mold concept is a personal financial agent with three layers:

1. **Brain** — a self-maintaining market and memory engine with point-in-time data
   discipline, reflection, and a significance-gated belief loop.
2. **Copilot** — a daily read, alerts, portfolio advisor, decision journal, and chat
   that reasons over the operator's holdings. Advisory only — the operator executes every
   real trade themselves.
3. **Executor** — a future bounded Web3 automation layer with capped authority,
   approved contracts, preflight checks, and human approval.

The app now has saved-scan Copilot reasoning plus a local memory snapshot used by chat.
The full always-on Brain, broad connected-portfolio coverage, and automated Executor remain
future work; the Executor is still a display-only monitor that signs nothing.

## What Works In This Repo

- Today page with a short daily read, prioritized ideas, relevance, bull/bear detail,
  confidence, horizon, and market notes; saved-scan-backed when a run exists, seeded otherwise.
- Briefing detail with market notes, evidence timing, and the linked, falsification-stamped
  decision-journal entry.
- Alert inbox and full Alert Feed with plain severity labels, "why it matters," dismiss,
  restore, and useful/not-useful feedback; raw source detail is hidden by default.
- Portfolio view with total value, today's move, manual holdings, explicit account
  holdings snapshots, freshness labels, on-chain positions, allocation,
  net-worth-over-time, and concentration scoring.
- Decision journal with pre-outcome call logging, "what would prove this wrong"
  checks, outcome scoring, confidence tracking, and a reflection significance
  gate computed from resolved engine decisions.
- Paper trading that compares the operator's paper trades with Master Mold's simulated calls —
  zero capital, no confetti.
- Global Master Mold chat plus the `/chat` route. Chat uses live OpenRouter, Anthropic,
  or OpenAI inference when a key is available, and falls back to a fixed advisory read.
- Market-memory snapshot plus a schedule-check endpoint that local automation can call;
  automatic broad internet/news scanning is still off by default.
- Executor preview with display-only metrics, guardrail controls, and a kill-switch drill
  that signs nothing.
- `/review` Performance & Trust surface with an engine-status card, per-run cost,
  ingested run history, alert feedback, and what is real/sample/not built.
- Honest status labels ("Saved scan", "Sample", "Manual portfolio", and "Imported portfolio") on surfaced facts; bitemporal
  as-of replay over both engine and seeded data.
- Durable `bun:sqlite` store behind journal/paper/alerts with idempotent engine ingestion.
- A static read-only enforcement test plus broad TypeScript route, copy, persistence,
  and user-journey coverage; the Python engine also has deterministic tests and an
  integration test against the real TradingAgents schemas.

## What Does Not Exist Yet

Intentionally not implemented / blocked on credentials or ops:

- The **scheduled full multi-agent engine run** (market-data keys, the LangGraph/LangChain
  dependency tree, Python 3.10+). Live chat works when a chat key is available,
  but the always-on run cadence is still ops work.
- Always-on cron scheduling, Anthropic prompt caching, and batch-API reflections (Phase 4).
- Broad live brokerage, exchange, or wallet sync. Settings can explicitly import some
  Coinbase, SnapTrade, and Zerion holdings snapshots, but unknown-asset pricing, full account
  coverage, and scheduled refresh are not complete.
- Automated equity trading (architectural non-goal — permanent).
- Real Web3 execution, signing, simulation, custody, on-chain spend caps, or chain RPC.
- The full forward-evaluation harness with baselines, costs, enough resolved calls,
  and pass/fail gates written before seeing results.
- CPA-reviewed tax treatment before any real capital.
- Multi-user accounts, public signup, or managing anyone else's money.

## Safety Boundaries

The central invariant is read-only advisory behavior.

- The app must never place a trade or move funds. The engine only reads market data
  and writes JSON; it never touches a brokerage.
- The `/api/executor` route is a seeded local monitor endpoint only, allowlisted in the
  read-only test because it is not a brokerage or wallet write path.
- Credential entry is optional and local. The app runs with zero credentials. AI-service
  keys live only in `engine/.env` or `.env.local` and are never committed.
- `knowledge_time` is stamped at engine write time; ingestion rejects future-stamped
  bundles and clamps malformed older saved files forward when a row would otherwise
  appear known before its event time.
- Any future live integration must preserve physical separation between read tools and
  execute tools, and any executor must fail closed behind enforceable policy boundaries.

## Tech Stack

App:

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
components/                  App UI components and shared primitives
src/db/                      Schema, seeds, bitemporal helpers, and:
  engine-data.ts             zod ingestion of engine bundles + provenance/run history
  store.ts                   durable bun:sqlite store (journal/paper/alerts) + fallback
  screener-feedback.ts       alert-feedback -> alert-rule tuning
engine/                      Python sidecar engine (own runtime, own .env)
  CONTRACT.md                the JSON bundle schema both sides validate
  config.yml                 watchlist, models, screener thresholds, budget cap
  mastermold_engine/         conviction/screener/adapter/beliefs/journal_bridge/...
  tests/                     deterministic + real-schema integration tests
tests/                       read-only enforcement, UAT, and engine-on test suites
tests/fixtures/engine/       contract-faithful engine bundles used by app tests
docs/ref/                    original first-party Master Mold PRDs and buildspec
spec.md, runbook.md          generated RDS implementation spec and runbook
ref/                         integration plan + the TradingAgents study clone (untracked)
```

## Main Routes

| Route | Purpose |
| --- | --- |
| `/` | Today page with the daily read (engine-backed or seeded) |
| `/briefing/[id]` | Briefing card detail with drivers + linked journal |
| `/alerts` | Alert Feed (saved market scan or sample data) |
| `/portfolio` | Consolidated read-only portfolio |
| `/journal` | Decision journal, saved calls, result scoring, and belief gate |
| `/paper` | Paper trading with a simulator account, paper trades, and results |
| `/chat` | Full-page chat; the global chat drawer is available from the app shell |
| `/executor` | Executor preview; display-only and signs nothing |
| `/review` | Performance & Trust: past calls, real/sample status, cost, and run history |
| `/settings/integrations` | Manual holdings, market-memory init, and connection tests |
| `/api/health` | Health check |

## Local Development

### App

```bash
bun install
bun run dev            # http://localhost:3000 (or set the port)
bun run test           # typecheck + the full Bun test suite
```

To see the app with a saved scan, point it at the bundled fixtures and use a local DB:

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

# Full run (needs the fork + market-data keys in engine/.env):
uv venv && uv pip install -e .
cp .env.example .env                         # add your market-data key
uv run python -m mastermold_engine.run_briefing --date 2026-06-05
```

`bin/engine-briefing` (repo root) is a thin wrapper around the run entry point. The
app ingests the newest `engine-run-*.json` from `engine/out/` automatically.

### Scheduling the daily scan

Three ways to keep the read fresh, all writing the same run history (every attempt —
including failures — is recorded and shown in the app):

1. **In-app:** the **Run today's scan** button on Today calls `POST /api/scan`,
   which spawns the engine, ingests the bundle, settles due paper rounds, and
   refreshes chat context. Use this when running interactively.
2. **Local schedule (cron/launchd):** hit the same endpoint on a cadence while the
   app is running, e.g. `30 13 * * 1-5 curl -s -X POST http://localhost:3000/api/scan
   -H 'Content-Type: application/json' -d '{"trigger":"cron"}'` — or run
   `bin/engine-briefing` directly; the app ingests the newest bundle on the next
   page load.
3. **Zo (the primary deployment):** register `bin/zo-start` as a Service and an
   Automation that runs `bin/engine-briefing` (or curls `/api/scan`) each
   weekday before the market opens — see [docs/deploy-zo.md](docs/deploy-zo.md)
   for the full recipe. Zo restarts are safe: runs are idempotent by date and
   the app falls back to the last saved read.

Interactive scans default to the engine's direct synthesis path
(`MASTERMOLD_ENGINE_ADAPTER=direct`); set `MASTERMOLD_ENGINE_ADAPTER=auto` to let
scheduled runs attempt the full TradingAgents graph first.

## Documentation

- `engine/CONTRACT.md` — the engine ⇄ app JSON contract.
- `engine/README.md` — engine setup, the fork delta, and how to run it.
- `ref/mastermold-integration-plan.md` — the phased integration roadmap.
- `docs/ref/financial-agent-PRD.md` and `-blueprint-v3-buildspec.md` — original PRD/spec.
- `spec.md`, `runbook.md` — the generated RDS implementation spec and runbook.

## License

No license has been declared yet. Treat this as private, all rights reserved unless Chris
adds an explicit license.
