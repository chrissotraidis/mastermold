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

The central invariant is unchanged for real capital: **advisory-only, read-only by
construction.** The app never places a real trade or moves funds; Web3 automation is
confined to the local paper ledger unless signer, custody, relay, approval, and kill-switch
gates are explicitly built and cleared. A static enforcement test fails if an unguarded
trade/order/write endpoint is ever introduced.

### Web3 autonomous paper daemon

The Web3 trading workspace can be driven without the browser by the bounded paper daemon:

```bash
npm run daemon:web3 -- --base-url=http://localhost:4010 --ticks=1 --heartbeat-when-gated --json
npm run forward:web3 -- --base-url=http://localhost:4010 --ticks=6 --min-net-pnl=0 --json
npm run forward-suite:web3 -- --base-url=http://localhost:4010 --ticks=2 --min-net-pnl=0 --json
npm run forward-repeat:web3 -- --base-url=http://localhost:4010 --ticks=2 --runs=3 --min-net-pnl=0 --min-hit-rate-pct=100 --min-deployed-alpha=0 --max-drawdown=1000 --min-consistency-score=80 --json
npm run monitor:web3 -- --base-url=http://localhost:4010 --source=live-dex --json
npm run preflight-live:web3 -- --base-url=http://localhost:4010 --ticks=2 --runs=2 --json
npm run reconcile-settlement:web3 -- --base-url=http://localhost:4010 --json
npm run guard-mirror:web3 -- --base-url=http://localhost:4010 --json
npm run verify:web3 -- --base-url=http://localhost:4010
npm run verify:web3 -- --base-url=http://localhost:4010 --wallet=<public-solana-address> --require-operator-wallet
npm run verify:web3 -- --base-url=http://localhost:4010 --require-jupiter-order
npm run verify:web3 -- --base-url=http://localhost:4010 --require-dex-live
```

The runner calls `/api/web3-trading` with the persisted daemon lease guard, records JSON
receipts, refuses real-capital autonomy, and exits on conflicting runners. It is intended
for local/paper monitoring and rehearsal only; live signing, transaction submission, and
fund custody remain credential-gated future work. The market monitor command calls live DEX
discovery plus auto-resolved GeckoTerminal OHLCV, writes a local candle-proof receipt back
to the cockpit, appends a sanitized local monitor history at
`data/web3-market-monitor-history.json`, exposes it through
`/api/web3-market-monitor-history`, and keeps signing, submission, live execution, and
wallet mutation blocked.
When the public candle provider is throttled, it returns an observed/degraded receipt and
keeps fresh paper buys blocked instead of crashing or loosening execution gates.
The forward run resets the local paper
ledger, runs bounded daemon ticks, compares start/end wallet equity, and reports whether
the paper loop met the requested net-PnL target. The forward suite repeats that proof across
base, breakout, and rug-risk sample regimes so reviewers can see aggregate PnL, traded
regimes, worst/best scenario outcomes, full-wallet hot-coin baseline alpha, and same-notional
deployed-capital alpha versus the best visible coin; add `--fail-under-target` when that
report should gate deployment. The repeat proof reruns the bounded suite or scenario with
`--runs=N` and reports hit rate, average PnL, cumulative drawdown, consistency score, and
repeat deployed-capital alpha so a single lucky tape is harder to mistake for durable edge.
When `--fail-under-target` is set on repeat proof, net PnL, hit rate, drawdown, deployed
alpha, and consistency thresholds all have to pass before the report grants paper-promotion
permission. The live-capital preflight then combines the live-readiness audit, daemon
handoff boundary, and repeat proof gate; by default it fails closed if real-capital readiness
appears without explicit `--allow-live-ready` review, and it never signs, submits, or moves
funds. The settlement reconciliation drill inspects only local relay, lifecycle, and audit
metadata; it requires relayed transactions to keep signature/request/payload evidence and
can poll the latest audited relayed signature with Solana `getSignatureStatuses` through
the guarded `confirmation_poll` API path. Confirmed transactions must map to a landed
lifecycle before any portfolio mirror could be treated as reconciled. A guarded
`fill_reconcile` path can then read Solana `getTransaction` metadata for token-balance
deltas, infer side/price/quantity for simple USDC-versus-token swaps, and emit a reviewed
`mirror_apply_request` only when the fill is clean; it blocks ambiguous, missing, failed,
or over-cap fills instead of guessing. The portfolio mirror guard then requires that landed fill
to also have relay signature, request id, payload hash, a deterministic idempotency key,
and bounded autonomous handoff notional before a future reviewed mirror writer could treat
the fill as audit-ready. The Web3 trading API also accepts a guarded `portfolio_mirror`
apply request for the persistent paper mirror; it still blocks unless confirmed settlement
evidence, fill price, filled quantity, handoff notional, and idempotency all reconcile, and
it never grants live execution or wallet mutation permission. `verify:web3` is a Node-only
operator check for machines without Bun: against a running app, it snapshots the saved
public wallet/risk scope, proves health receipts, execution input validation, public-wallet
dry-run scope save, credential validate-only redaction, text-only `/api/web3-wallet-ownership`
receipt boundaries, manual live-review packet boundaries, deterministic DEX discovery receipt
boundaries, one-shot Jupiter rehearsal redaction, private-field rejection, and the live
execution/wallet mutation locks, then restores the saved public wallet/risk scope before exit. Add
`--require-jupiter-order` after a `JUPITER_API_KEY`
or `WEB3_VERIFY_JUPITER_API_KEY` is available to fail closed until quote and unsigned-order
readiness are both proven without returning transaction bytes. Add `--require-operator-wallet`
with `--wallet=<public-solana-address>` or `WEB3_VERIFY_WALLET_PUBLIC_KEY` to fail closed
until the sample all-ones wallet has been replaced by a dedicated public trading wallet.
Add `--require-dex-live` to fail closed until the live DEX scanner returns current live
candidate and pair evidence with no failed discovery sources while execution, transaction
submission, wallet mutation, private-key storage, and secret echo remain blocked; if public
discovery is temporarily throttled, the strict gate can fall back to auto-resolved
GeckoTerminal OHLCV proof or a recent recorded live-dex candle proof for a Solana pool while
preserving the same live locks.
`/api/web3-dex-discovery?source=live-dex` is the compact read-only scanner receipt for
current public DEX Screener discovery evidence: profiles, boosts, ads, paid orders, pair
mapping, top symbols, and scanner intake status. It is paper-only evidence and still blocks
live execution, transaction submission, wallet mutation, private-key storage, and secret echo.
`/api/web3-ohlcv?auto=true&source=live-dex` is the read-only candle-proof fallback for a
chartable Solana pool. It returns GeckoTerminal candle data, local signal/noise and paper
sizing evidence, and explicit live-execution/wallet-mutation/transaction-submission/private-key
blocks; it does not sign, submit, custody funds, or store wallet authority.
`/api/web3-live-capital-preflight?source=live-dex` is the compact go/no-go receipt for
the researched real-capital path: operator wallet, provider rail, live DEX scanner,
Jupiter order rehearsal, risk caps, kill switch, signer/custody, settlement, profit proof,
and manual review. It reports blockers and next actions while still refusing signing,
transaction submission, account creation, private-key storage, and wallet mutation.
`/api/web3-live-usability-blockers?source=live-dex` is the single "what is left"
receipt for real-money Web3 usability. It reconciles the usability status, cutover
board, operator runbook, live-capital preflight, supervised runway, and manual live-review
packet into missing operator inputs, signoff counts, safe next actions, verifier commands,
the latest sanitized credential-doctor status, the next ordered unlock step, and live-lane readiness while keeping autonomous live trading, signing, submission,
wallet mutation, private-key storage, seed-phrase storage, and secret echo blocked.
It also groups missing rows by owner and evidence source so operators can see whether
the next work belongs to wallet setup, security, ops, accounting, strategy, or review.
Use `rows=all` on that same endpoint to return every dependency-ranked missing row for
external review; the default response stays compact for dashboard panels.
`/api/web3-credential-doctor` is the localhost-only in-app refresh endpoint for the
sanitized Web3 credential doctor receipt used by Settings and live-usability summaries.
It requires `operator_ack: true`, supports preview mode for `npm run verify:web3`, accepts
only status fields, forces live-execution approval flags off while running the doctor, and
keeps signing, submission, wallet mutation, private-key storage, seed-phrase storage, and
secret echo blocked.
`/api/health` also exposes a compact `web3_live_usability` summary for monitors with
the same receipt hash, missing-input counts, total-versus-listed live-usability row counts,
live-lane counts, next ordered unlock step, next action, and blocked live-execution/signing/wallet/secret
permissions without returning secrets or transaction bytes.
`/api/web3-operator-credential-handoff` is the redacted credential handoff contract for
operators and external research agents. It lists allowed inputs, never-requested fields,
safe collection surfaces, env target names, next input, verifier commands, and a compact
live-usability summary with real-capital blocker count, total-versus-listed row counts,
live-lane counts, the next ordered unlock step, and the same live-execution/wallet-mutation/
transaction-submission/private-key/seed-phrase/secret-echo blocks without returning raw secrets.
`/api/web3-operator-request-packet` turns that same handoff into a shareable redacted
setup packet with the live-usability summary embedded in JSON and text form, so another
helper sees blocker counts, listed rows, the next unlock step, safe inputs, and never-provide
boundaries in one pasteable artifact.
`/api/web3-research-handoff-packet?source=live-dex` is the paste-ready research brief for
another helper. It includes the next ordered unlock step, the six-step operator unlock
sequence, compact live-usability summary, open operator inputs, live-capital blockers,
source endpoints, and research questions while keeping secrets, transaction bytes, signing,
wallet mutation, and live execution blocked.
The Settings credential console can also detect or connect a browser Solana wallet only
far enough to read the public address into the dry-run scope, then optionally prove wallet
ownership with a text-only signature whose local audit receipt stores only challenge and signature hashes.
The sample all-ones Solana wallet remains allowed for demo/public-scope rehearsal, but the
account setup and provider-readiness receipts mark it as demo-only and keep the dedicated
operator-wallet gate missing until a real public trading wallet is scoped.
It does not request transaction signatures, store wallet secrets, submit transactions, or
mutate balances.

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
- Long-horizon live/out-of-sample forward evaluation with external baseline comparisons,
  real route costs, enough resolved calls, and pass/fail gates written before seeing results.
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
npm run verify:web3    # Node-only Web3 credential/readiness gate against localhost:4010
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
