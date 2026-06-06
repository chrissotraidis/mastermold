# 1. Overview — Development Runbook

This document is progressively updated as each task completes. It captures the
exact steps to run and test the application at every stage of development.

## Prerequisites

- **Primary:** Next.js
- **Router:** App Router
- **Language:** TypeScript
- **Runtime:** Bun
- **Deployment:** Zo HTTP service

## Quick Start

```bash
bun install
```

## Starting the Application

```bash
bunx next dev --hostname 0.0.0.0 --port 3000
```

## Health Checks

- `http://localhost:3000/api/health` — expected status 200
- `http://localhost:3000/` — expected status 200

## Task Progress

<!-- Task runbook entries are appended below as tasks complete -->

### Task 0: Bootstrap Next.js project with data layer and full seed

After this task the app boots via `bunx next dev` with a dark-themed shell, persistent nav, and all entity tables pre-seeded with demo data; verify by opening / to see the nav and first-run banner, then hitting /api/health for a 200 JSON response.

### Task 1: Daily briefing home with ranked cards and empty state

The home page renders 3–5 ranked briefing cards from seeded data with full field disclosure and a 'Demo data' chip; clicking any card navigates to /briefing/[id], and switching seed cards to nothing_actionable status (or clearing the list) surfaces the designed empty-state component. Verify via GET / (200, cards visible) and GET /api/briefing (200, typed JSON array).

### Task 2: Briefing card detail with ranked color-coded drivers

After this task the operator can click any card on the home briefing page and land on a color-coded driver breakdown with cited sources and a working journal link; verify by opening /briefing/<seeded-id> in a browser and confirming green/red driver rows, the DataProvenance chip, the journal link, and that the breadcrumb returns to the home list.

### Task 3: Alert feed with priority tiers and acknowledgement

After this task the operator can visit /alerts and see a priority-sorted feed of seeded T0/T1/T2 alerts with tier badges and z-scores; they can expand rationale inline, acknowledge alerts to dim them, mark feedback as useful or not useful with instant UI reflection, and filter the feed by tier. Verify by opening /alerts in the browser and exercising each interaction, and by hitting /api/alerts directly to confirm 200 with typed JSON.

### Task 4: Portfolio consolidation with TradingView charts

After this task the operator can visit /portfolio and see a fully populated read-only view of seeded holdings across all accounts, including DeFi positions, HHI-based concentration scoring, an allocation chart, a live TradingView candlestick for a seeded asset, and per-account integration badges; verify by opening /portfolio in the browser and exercising the asset selector for the chart, then hitting /api/portfolio directly to confirm a 200 typed JSON response.

### Task 5: Decision journal with track record by confidence tier

The operator can open /journal to review all seeded decisions with conviction tiers, see resolved outcomes and process scores, inspect the track-record table grouped by confidence tier, browse strategy beliefs with their significance-gated reflection history, and submit a new decision via the inline form; verify by opening /journal in the browser to confirm seeded rows and tier groupings render, submitting the form to confirm persistence, and hitting /api/journal directly to confirm a 200 typed JSON response.

### Task 6: Bitemporal as-of replay on portfolio and journal APIs

After this task the operator can open /portfolio or /journal, select any past timestamp from the date/time picker, and see holdings, price bars, and journal entries filtered to only facts known at that moment with an 'As of [timestamp]' label confirming the active snapshot; verify by picking a timestamp between the two seeded PriceBar knowledge_times and confirming the later bar is absent, then clearing the picker to confirm the full dataset returns.

### Task 7: Paper-trading sandbox with process-based scoring

After this task the operator can open /paper to view the active paper-trading round, submit a prediction that immediately appears in the round's prediction list, and scroll to a completed seeded round whose RoundScore displays as a neutral four-metric panel; verify by submitting a prediction in the browser and confirming persistence, then hitting /api/paper directly to confirm a 200 typed JSON response.

### Task 8: Agent chat shell with scaffolded prompts and BYOK

The operator can open /chat, click a scaffolded chip or type a message, and see a user bubble followed by an advisory response bubble (canned from seeded data by default, or live LLM output when a key is set in .env.local); verify by loading /chat in the browser and confirming the four chips render, sending a message produces both bubbles, and the advisory banner stays visible while scrolling.

### Task 9: Web3 executor monitor with display-only guardrail controls

The operator can open /executor to see seeded strategy rows with status badges, funding/net-delta/margin values, a FundingObservation trend panel, editable guardrail fields that persist only in React state, and a kill-switch that locally flips status to paused — none of which trigger any chain call; verify by loading /executor in the browser to confirm seeded rows, toggling guardrail fields and kill-switch to confirm no network requests fire, and hitting /api/executor to confirm a 200 typed JSON response.

### Task 10: Integrations settings with stubbed and credential-gated states

The operator can open /settings/integrations from the persistent nav and see all four integration cards with correct status badges and demo-data chips; entering an API key in any card persists it in localStorage and survives a page reload without ever leaving the browser. Verify by loading the page, typing into a key field, refreshing to confirm localStorage persistence, and hitting /api/status directly to confirm a 200 JSON response listing all four services.

### Task 11: Review readiness page with truthful disclosure and reviewer persona

After this task the operator can open /review from the first-run banner on / and read all four disclosure sections plus the reviewer persona note without logging in or setting any env vars; verify by loading / in the browser, clicking the banner link to /review, and confirming each of the four section headings and the persona block render with their correct content.

### Task 12: Read-only enforcement automated verification

After this task the project has an automated safety gate: running bun run test executes a static scan of every API route file and fails the suite if any file introduces a trade, order, execute, transfer, or withdraw handler or brokerage write import. Verify by running bun test tests/read-only-enforcement.test.ts and confirming it exits 0 with "No execution endpoints found" in the output.

### Task 13: Global UI polish, loading states, and responsive layout

After this task every route greets the operator with a matching loading skeleton during fetch and a retry-able error fallback on failure; the nav correctly highlights whichever section is active, collapses to a mobile-friendly control at 375px, and no route clips or overflows horizontally; verify by opening each route in a 375px DevTools viewport, throttling the network to 'Slow 3G' to observe skeletons, then running bun run build and loading the production server in the browser with the console open to confirm zero hydration warnings.

### Task 14: Build verification and final smoke check

After this task the full production build is clean: every route is reachable, the health endpoint is live, all tests pass, and the app renders without hydration warnings. Verify by running `bun run build && bunx next start`, then hitting each route and `/api/health` with curl, and opening the browser console on `/` to confirm zero warnings and a visible `/review` banner link.

### Task 15: UAT Walkthrough

After this task every primary spec flow is demonstrably functional with seeded data: an operator can sign in as the seed account and walk through each dashboard section — briefing, portfolio, alerts, journal, paper trading, chat, and review — and find real content at each stop; verify by loading the app with seed data active and confirming no route shows a blank or lorem-ipsum state.
