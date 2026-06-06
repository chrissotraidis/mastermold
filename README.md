# Master Mold

Master Mold is a V0 personal financial-copilot dashboard generated through RDS. It is the user-facing surface for a larger Intelligent Financial Agent concept: a personal, owned, always-on system that combines market briefing, portfolio context, decision journaling, paper-trading practice, and a bounded Web3 executor model.

This repository is the archived standalone version of the RDS build that previously ran at `https://rds-rds-product-type-game-8a408d-kahris.zocomputer.io/`. That public service has been taken down. The repo preserves the deployed snapshot plus the original product reference documents in `docs/ref`.

## Current State

This is a seeded demo dashboard, not a live financial agent.

The app runs entirely from local seeded data by default. It has no real account connections, no real holdings, no real P&L, no trade execution, no transaction signing, and no live chain interaction. The product intentionally ships a `/review` truthfulness surface that separates what works from what is seeded, stubbed, credential-gated, or still missing.

## Product Intent

The long-range Master Mold concept is a personal financial agent with three layers:

1. Brain: a self-maintaining market and memory engine with point-in-time data discipline.
2. Copilot: a daily briefing, alerts, portfolio advisor, decision journal, and chat layer that reasons over the operator's real holdings.
3. Executor: a bounded-authority Web3 strategy runner for structural yield, with on-chain spend caps, allowlists, simulation gates, and human approval.

This V0 implements the Copilot dashboard shell and reviewable demo workflows. The Brain and Executor are represented through seeded surfaces and disclosure, not production systems.

## What Works In This Repo

- Daily Briefing with ranked cards, why-now rationale, relevance to holdings, bull case, bear case, conviction, horizon, and demo-data provenance.
- Briefing detail pages with ranked color-coded drivers, citations, and linked journal context.
- Alert Feed with T0/T1/T2 priority tiers, rationale expansion, acknowledgement, feedback, and seeded z-score behavior.
- Portfolio view with consolidated seeded holdings, DeFi positions, allocation breakdowns, concentration scoring, and chart data.
- Decision Journal with pre-outcome thesis logging, falsification conditions, outcome scoring, and track record grouped by confidence tier.
- Bitemporal as-of replay over seeded data using `event_time` and `knowledge_time` fields.
- Paper-Trading sandbox that rewards calibration, patience, and diversification rather than real-money action.
- Agent Chat shell with scaffolded prompts and canned advisory responses when no model key is present.
- Web3 Executor monitor with display-only strategy metrics, guardrail controls, and kill-switch UI that signs nothing.
- Integrations settings page with stubbed and credential-gated states.
- Review Readiness page that states what is real, fake, stubbed, placeholder, and missing.
- Static read-only enforcement test that fails if trade/order/write endpoints are introduced.
- UAT tests over seeded data for primary product journeys.

## What Does Not Exist Yet

These are intentionally not implemented in V0:

- Live brokerage, exchange, or wallet integrations.
- Live account aggregation from Coinbase, Robinhood, SnapTrade, Zerion, or on-chain sources.
- Automated equity trading.
- Real Web3 execution, signing, transaction simulation, custody, spend caps, allowlists, or chain RPC calls.
- Always-on market/news/on-chain ingestion.
- Production Brain memory, reflection, drift detection, or significance-gated learning.
- Full evaluation harness with DSR/PBO/MinTRL, Alpaca live-shadow paper trading, post-cutoff validation, or real net-of-cost strategy scoring.
- CPA-reviewed tax treatment for funding carry, straddles, or any real capital deployment.
- Multi-user accounts, public signup, or managing anyone else's money.

## Safety Boundaries

The central invariant is read-only advisory behavior.

- The dashboard must never place a trade or move funds.
- The `/api/executor` route is a seeded local monitor endpoint only. It is allowlisted in the read-only test because it is not a brokerage or wallet write path.
- Credential entry is optional and local-review oriented. The app should run with zero credentials.
- Any future live integration must preserve physical separation between read tools and execute tools.
- Any future executor must fail closed and require external, enforceable policy boundaries, not prompt-only rules.

## Tech Stack

- Next.js App Router
- React
- TypeScript
- Bun runtime
- Tailwind CSS
- Radix Slot and Label primitives
- Lucide icons
- TradingView Lightweight Charts
- Local seeded data in `src/db`
- Bun test runner

The Next.js config uses `output: "standalone"` because the app was originally deployed as an RDS-managed production service.

## Repository Structure

```text
app/                         Next.js pages and API routes
app/api/                     Read-only JSON endpoints and health check
components/                  Dashboard UI components and shared primitives
components/ui/               Small local UI primitives
src/db/                      Seed data accessors, schema, bitemporal helpers
data/                        Demo seed payloads
tests/                       Read-only enforcement and UAT tests
docs/                        Repo documentation
docs/ref/                    Original first-party Master Mold PRDs from RDS
spec.md                      Generated implementation spec used by RDS
runbook.md                   Generated development and verification runbook
AGENTS.md                    Local project guidance for future agents
```

## Main Routes

| Route | Purpose |
| --- | --- |
| `/` | Daily Briefing home |
| `/briefing/[id]` | Briefing card detail |
| `/alerts` | Alert Feed |
| `/portfolio` | Consolidated seeded portfolio |
| `/journal` | Decision Journal and track record |
| `/paper` | Paper-Trading sandbox |
| `/chat` | Agent Chat shell |
| `/executor` | Display-only Web3 Executor monitor |
| `/review` | Truthfulness and review-readiness surface |
| `/settings/integrations` | Stubbed/credential-gated integration settings |
| `/api/health` | Health check returning `{ "status": "ok" }` |

## API Surface

All API routes are read-only or local seeded workflow endpoints.

- `GET /api/health`
- `GET /api/briefing`
- `GET /api/briefing/[id]`
- `GET /api/alerts`
- `GET /api/portfolio`
- `GET /api/journal`
- `GET /api/paper`
- `GET /api/executor`
- `GET /api/status`
- `POST /api/chat`

The test suite scans API route files for execution-like route names, handler text, and brokerage write methods.

## Local Development

Install dependencies:

```bash
bun install
```

Run the dev server:

```bash
bun run dev
```

Run a production build:

```bash
bun run build
```

Start the production server after building:

```bash
bun run start
```

Run typecheck and tests:

```bash
bun run test
```

Run only the read-only enforcement test:

```bash
bun test tests/read-only-enforcement.test.ts
```

Run only seeded UAT tests:

```bash
bun test tests/uat-user-journeys.test.ts
```

## Environment

The app should run without any environment variables.

Optional live model behavior may be added behind local `.env.local` keys, but the archived V0 defaults to canned advisory responses and seeded data. Do not commit real secrets, API keys, tokens, brokerage credentials, wallet keys, or private account data.

The copied `.env` from the RDS snapshot only contained a local host-port setting at archive time. Treat `.env.local` as the correct place for any future local-only developer secrets.

## Seeded Data Model

Seeded data lives under `src/db` and demonstrates the product shape without connecting to real services.

Important entities include:

- Account
- Asset
- Holding
- PriceBar
- NewsItem
- FundingObservation
- BriefingCard
- Driver
- DecisionJournalEntry
- OutcomeScore
- Alert
- StrategyBelief
- ReflectionUpdate
- PaperTradingRound
- PaperPrediction
- RoundScore
- ExecutorStrategy
- GuardrailConfig
- IntegrationStatus
- DataProvenance

Several views accept an `as_of` query parameter to exercise point-in-time replay over seeded `knowledge_time` values.

## Documentation

Start here:

- `docs/README.md`: documentation map.
- `docs/ref/README.md`: reference packet index and provenance.
- `docs/ref/financial-agent-PRD.md`: original first-party PRD from the RDS input packet.
- `docs/ref/financial-agent-blueprint-v3-buildspec.md`: original build-level research and architecture blueprint from the RDS input packet.
- `spec.md`: generated RDS implementation spec for this V0 dashboard.
- `runbook.md`: generated build and verification runbook.

## RDS Provenance

Original RDS intake:

```text
RDS Product Type: Game
Using these PRDS and plans, build out Master Mold
```

The RDS intake labeled this as `game`, but the source documents describe a fintech financial-agent dashboard. The paper-trading surface is game-shaped, but the product itself is a personal financial copilot.

Source input packet copied into this repo:

```text
Programs/Artifact-RDS/inbox/attachments/1780157887879-Using-these-PRDS-and-plans-build-out-Master-Mold/
```

Archived standalone repo path on Zo:

```text
/home/workspace/Projects/mastermold
```

GitHub repo:

```text
https://github.com/chrissotraidis/mastermold
```

## Future Work

The next useful step is not more UI polish. It is deciding whether Master Mold remains a reviewed demo/prototype or becomes a real private financial agent.

If it becomes real, the next phase should be narrow and safety-first:

1. Keep the current dashboard read-only.
2. Replace seeded portfolio data with one read-only integration at a time.
3. Add a real point-in-time ingestion store before any claim of signal quality.
4. Stand up decision-journal scoring before adding more recommendations.
5. Keep Web3 execution out of scope until custody, spend caps, simulation gates, and kill-switch drills exist outside the model.

## License

No license has been declared yet. Treat this as private, all rights reserved unless Chris adds an explicit license.
