# 1. Overview

> A personal **financial copilot web dashboard** — the user-facing surface of an
> "Intelligent Financial Agent." It gives a single operator a personalized
> pre-market briefing, a prioritized alert feed, a consolidated read-only portfolio
> view, a decision journal with a published track record, a gamified paper-trading
> sandbox, and an agent chat. It is **advisory only**: the app never has authority to
> place a trade or move funds. This is a multi-asset (equities + crypto + on-chain),
> owned, transparent fintech web app built on Next.js with TradingView Lightweight
> Charts.

This V0 build is the **dashboard layer with seeded demo data**. Every external
integration (brokerage, exchange, on-chain, LLM) is stubbed or credential-gated and
disclosed in-app. There is **no trade-execution code, no real capital, and no live
chain interaction** anywhere in this build. The deeper subsystems described in the
source PRDs — always-on ingestion, the bounded-autonomy Web3 executor, the live
evaluation/statistics harness — are represented as display-only surfaces over seeded
data and documented on a Review-Readiness page as "promised, not yet live."

**Classification note for the build pipeline:** the RDS intake labeled this build
`app_type: game`. That is an upstream misclassification — the source artifacts
describe a financial agent, not a game (the only game-shaped element is the
paper-trading sandbox). Treat this as a **fintech web app (`nextjs_fullstack` +
`fintech` domain)**.

# 2. Users / Personas

- **Operator (Chris)** — primary, single user. Technical builder; reviews the morning
  briefing, explores theses in chat, logs/reviews decisions, plays the paper-trading
  sandbox. Executes any real equity/crypto trade himself, outside this app.
- **Time-pressed operator** — same person; wants a <5-minute morning read and to trust
  "nothing actionable today" when true.
- **Reviewer** — an RDS reviewer (or Chris in eval mode). Uses the Review-Readiness
  surface and a seeded review persona to see what is real vs. demo.

This is a **single-tenant personal tool**. No public signup, no multi-user, no
managing anyone else's money (that would trigger RIA/CTA registration — explicitly a
non-goal). Authority rules, always enforced:

- The Copilot/dashboard is **read-only** on every account; no code path places a trade.
- The Web3 executor's authority would be bounded **on-chain** (spend caps, allowlists,
  expiring session key) — but in V0 it is **display-only and signs nothing**.

# 3. Entities / Models

Read-only over seeded data unless noted. `event_time` = when true in the world;
`knowledge_time` = when the System learned it (bitemporal — no look-ahead).

- **Account**: id, kind (`coinbase` | `robinhood` | `onchain_wallet`), label,
  integration_status (`connected` | `stubbed` | `credential_gated`), scope
  (always `read_only`). *No write/trade scope field exists, by construction.*
- **Asset**: id, symbol, name, asset_class (`equity` | `crypto` | `defi`), venue.
- **Holding**: id, account_id → Account, asset_id → Asset, quantity, cost_basis,
  market_value, as_of. Derived `weight`.
- **Portfolio** (derived view): consolidated holdings, total_value, concentration
  score (top-position %, HHI), per-class allocation.
- **PriceBar**: id, asset_id → Asset, ts (event_time), open/high/low/close/volume,
  knowledge_time.
- **NewsItem**: id, asset_id → Asset (nullable), headline, source, url, event_time
  (published), knowledge_time (ingested), sentiment (nullable).
- **FundingObservation**: id, asset_id → Asset, period_ts, funding_rate,
  open_interest, knowledge_time.
- **BriefingCard**: id, date, rank, headline, why_now, relevance_note, bull_case,
  bear_case, conviction (1–10), horizon, status (`actionable` |
  `nothing_actionable`), asset_ids[]; has many **Driver**; has one
  **DecisionJournalEntry**.
- **Driver**: id, briefing_card_id → BriefingCard, label, direction
  (`bullish` | `bearish`), weight, color, source_citation.
- **DecisionJournalEntry**: id, briefing_card_id → BriefingCard (nullable), thesis,
  signals[], conviction, horizon, falsification_condition, logged_at. *Written
  BEFORE the outcome window — enforced.*
- **OutcomeScore**: id, journal_entry_id → DecisionJournalEntry, resolved_at,
  pnl_note, thesis_played_out (bool), process_score, outcome_score. Powers
  track-record-by-confidence-tier.
- **Alert**: id, asset_id → Asset, tier (`T0` | `T1` | `T2`), z_score, message,
  rationale, created_at, acknowledged (bool), useful_feedback (nullable).
- **StrategyBelief**: id, name, statement, confidence, updated_at.
- **ReflectionUpdate**: id, strategy_belief_id → StrategyBelief, evidence_summary,
  significance_passed (bool), applied (bool), created_at. *A single outcome cannot
  flip a belief — significance gate.*
- **PaperTradingRound**: id, week_label, opens_at, closes_at, status; has many
  **PaperPrediction**; has one **RoundScore**.
- **PaperPrediction**: id, round_id → PaperTradingRound, asset_id → Asset, direction,
  conviction, rationale, submitted_at.
- **RoundScore**: id, round_id → PaperTradingRound, calibration, patience,
  diversification, total. *Rewards process, not P&L. No confetti.*
- **ExecutorStrategy** (display-only): id, name (`stablecoin_lending` |
  `delta_neutral_funding_carry`), status (`paused` | `safe_mode` | `running_demo`),
  venue, net_delta, margin_ratio, funding_rate, basis.
- **GuardrailConfig** (config-only): id, per_tx_cap, daily_cap, contract_allowlist[],
  recipient_allowlist[], session_key_expiry. *Editing never signs anything.*
- **IntegrationStatus**: id, service, status (`connected` | `stubbed` |
  `credential_gated`), detail.
- **DataProvenance**: source label + as_of timestamp attached to surfaced facts.

# 4. Routes / Views

Next.js App Router. All data endpoints are read-only; there is no order/trade
endpoint anywhere.

| Route | View → purpose |
|---|---|
| `/` | **Daily Briefing** (home) → 3–5 ranked cards (headline + why-now + relevance + bull/bear + 1–10 conviction + horizon); explicit "nothing actionable today" empty state |
| `/briefing/[id]` | **Card detail** → expandable ranked, color-coded drivers + cited sources + linked journal entry |
| `/alerts` | **Alert Feed** → priority-queued T0/T1/T2, success-filtered, one-tap "see rationale", snooze/feedback |
| `/portfolio` | **Portfolio** → consolidated cross-account holdings + DeFi positions + concentration scoring; TradingView Lightweight Charts |
| `/journal` | **Decision Journal** → suggestions logged before outcome (thesis + falsification condition), scored after; track record by confidence tier |
| `/paper` | **Paper-Trading Game** → Numerai-style multi-week-scored sandbox; rewards calibration/patience/diversification; zero capital, no confetti |
| `/chat` | **Agent Chat** → scaffolded suggested prompts, context-persistent, references dashboard elements (canned unless LLM key supplied) |
| `/executor` | **Web3 Executor (monitor)** → display-only strategy status + funding/net-delta/margin panels + guardrail-config editor + kill-switch UI (signs nothing) |
| `/review` | **Review Readiness / Truthfulness** → what works, what is seeded, what is stubbed/credential-gated, missing PRD promises, review-mode persona/credentials |
| `/settings/integrations` | **Integrations** → connect/disconnect external services; all show gated state; entering keys is optional and isolated to `.env.local` |
| `/api/{briefing,portfolio,journal,paper,alerts,status,executor}` | **JSON API** → read-only backing data |

Persistent nav across the five primary surfaces (Briefing, Alerts, Portfolio, Paper
Game, Chat) plus the Executor monitor, an always-visible **Review** entry, and a
first-run banner linking to `/review`.

# 5. Acceptance Criteria

- [ ] App boots and is fully usable with **zero credentials and zero capital**; all
      surfaces render from seeded data.
- [ ] The home Briefing renders 3–5 cards, each showing headline + why-now +
      relevance + bull case + bear case + a 1–10 conviction score + an explicit time
      horizon.
- [ ] A "**nothing actionable today**" state is reachable and rendered as a designed
      empty state, not an error.
- [ ] Each briefing card detail shows ranked, color-coded drivers and cites its data
      sources.
- [ ] **Read-only by construction:** there is no trade/order/write API route or
      client action anywhere; an automated check (grep/test) confirms no
      execution endpoint exists for any account.
- [ ] Every decision-journal entry stores a thesis and a falsification condition with
      a `logged_at` timestamp, and is later shown with an outcome + process score; the
      journal displays a **track record grouped by confidence tier**.
- [ ] **Bitemporal as-of replay:** a UI control (or `/api` query) can request data
      "as of" a past timestamp and returns only facts whose `knowledge_time` ≤ that
      timestamp (no look-ahead) over the seeded dataset.
- [ ] Portfolio view shows consolidated holdings + DeFi positions + a concentration
      score, with each account's integration status visible.
- [ ] The paper-trading sandbox accepts predictions, scores rounds on
      calibration/patience/diversification, and shows **no confetti / no real-trade
      celebration**.
- [ ] The Executor monitor renders strategy status, funding/net-delta/margin panels, a
      guardrail-config editor, and a kill-switch button — and **none of these sign a
      transaction or call a chain**.
- [ ] The **`/review` surface exists, is linked from a first-run banner**, and
      truthfully lists what works, what is seeded, what is stubbed/credential-gated,
      and which PRD promises are not yet implemented.
- [ ] Any surface backed by a stubbed integration shows an inline "demo data"
      disclosure chip.
- [ ] Optional BYOK / credential entry is never required to run and is isolated to
      `.env.local` (never committed).

# 6. Build Assumptions

Every default below was chosen unattended to unblock the build; each maps to a
question in `wiki/review/product-owner-questions.md` and is restated in-app on
`/review`.

- **A1 (Q001) — Product identity.** Build the financial-copilot **web dashboard**, not
  a game; include the paper-trading sandbox as one surface. Author the spec as
  fintech web so Scaffold classifies it correctly.
- **A2 (Q002) — Data.** **Seeded demo data everywhere.** No live integrations stood up.
- **A3 (Q003) — Web3 Executor.** **Display-only**; guardrail editor + kill-switch UI
  that sign nothing; no execution code path.
- **A4 (Q004) — Surfaces.** Build **all five** named surfaces + Executor monitor +
  Integrations + the Review-Readiness page.
- **A5 (Q005) — Model lane.** Reasoning/chat is **stubbed**; calls an LLM only via
  optional BYOK (cheap+fast API, holdings abstracted to ratios). No model bundled.
- **A6 (Q006) — Auth.** **Single operator, single tenant**, local session auth, a
  seeded `reviewer@demo.local` persona. No public signup.
- **A7 (Q007) — Runtime.** **Next.js**, intended to run on Zo (build → serve),
  reconnect/idempotent-safe. Always-on ingestion Services/Automations out of V0.
- **A8 (Q008) — Tax/legal.** **Not applicable to V0** (no real capital); surfaced on
  `/review` as "blocking before live." No legal/tax logic implemented.
- **A9 (Q009) — Time series.** **Seeded sample bars** stamped with event_time +
  knowledge_time to demonstrate as-of replay; charts via TradingView Lightweight
  Charts.
- **A10 (Q010) — Eval harness.** **Surface, don't compute.** Show journal +
  track-record-by-tier over seeded scored decisions; document the full DSR/PBO/
  post-cutoff methodology on `/review` as "promised, not yet computed."
- **A11 — Stack defaults.** Next.js + TypeScript, server-side seeded data store
  (SQLite or a JSON fixture layer is acceptable for V0), dark-first UI with
  progressive disclosure, TradingView Lightweight Charts for price + a lightweight
  chart lib for allocation. No external network calls required to run.

# 7. Review Readiness / Truthfulness (in-app surface — required)

The app **must ship a reachable `/review` screen** (linked from a first-run banner)
that states the truth about this build. This is a UI requirement, not just
documentation — because the app runs on seeded data, fake numbers, and stubbed
integrations, the app itself must disclose those facts. `/review` must show:

- **What works (real in V0):** Daily Briefing, card detail with drivers, Alert Feed,
  Portfolio consolidation + concentration, Decision Journal + track-record-by-tier,
  Paper-Trading sandbox scoring, Agent Chat shell, Executor monitor (display), Review
  page, bitemporal as-of replay over seeded data.
- **What is seeded / sample / demo:** all holdings, prices, news, funding, briefing
  cards, alerts, journal outcomes, paper-trading rounds, and executor metrics are
  **fabricated demo data** — no real money, positions, or P&L. Fake monetary figures
  are labeled as such.
- **What is stubbed or credential-gated:** Coinbase CDP (view-only key), Robinhood via
  SnapTrade (read-only OAuth), on-chain via Zerion, and the LLM for chat/reasoning —
  all show `stubbed` or `credential_gated` and are inert until keys are supplied in
  `.env.local`.
- **What PRD promises remain missing in V0:** always-on PIT ingestion pipeline; live
  layered memory + reflection significance gate (shown, not computed); the full
  anti-self-deception eval harness (DSR/PBO/MinTRL, Alpaca paper live-shadow,
  post-cutoff validation); the bounded-autonomy Web3 executor as a **live** actor
  (custody, on-chain spend caps, Tenderly/Blockaid fail-closed gate, real kill
  switch); CPA tax sign-off (§1092 straddle, funding-as-ordinary-income) required
  before any real capital.
- **Review-mode access:** a seeded persona (`reviewer@demo.local`) and instructions to
  explore every surface; a note that **no credentials are required** to evaluate the
  app, and that entering real keys is optional and isolated.

# 8. Non-Goals (V0)

- No real trade execution, on any account, ever (architectural).
- No live capital, no live chain transaction, no transaction signing.
- No multi-user / managing others' money (RIA/CTA + AI-washing exposure).
- No bundled local LLM (Zo has no GPU); reasoning is BYOK-optional.
- No claim of predictive edge — the app is a briefing/decision-support and
  transparency tool first; honest "no edge" is an acceptable finding.

# 9. Verification

- Boot the app with no env vars → every surface renders from seeded data; `/review`
  and the first-run banner are present.
- Grep the codebase → no order/trade/write endpoint or client mutation against any
  external account exists.
- Exercise the as-of replay → past-timestamp query excludes facts with later
  knowledge_time.
- Open `/executor` → editing guardrails or pressing kill-switch performs no network
  call to any chain and signs nothing.
- Confirm every stubbed surface displays a "demo data" disclosure chip and that
  `/review` enumerates seeded/stubbed/missing items accurately.

<!-- RDS_TASTE_BRIEF_V1 -->

## RDS Taste Brief

Detected product type: **dashboard**.

This section is generated by the RDS taste layer. Treat it as binding acceptance criteria unless it conflicts with an explicit user requirement.

### Taste Position

Build 1. Overview as a coherent dashboard with a strong primary experience, not as a feature checklist.

### Quality Bar

- Preserve the user's original intent, but do not settle for a generic demo.
- Make the first 10 seconds clear without explanatory copy that reads like documentation.
- Prefer one excellent core workflow over a broad set of shallow features.
- Include meaningful empty, loading, failure, and success states where the product shape calls for them.
- Use visual hierarchy, spacing, motion/feedback, and responsive layout deliberately.
- Design around the primary job-to-be-done, not around a feature checklist.
- Make the main workflow obvious, fast, and repeatable.
- Use realistic sample data and states so the product feels inhabited.
- Expose power and status where a real operator would need confidence.

### Anti-Goals

- Empty shell dashboard with decorative metrics.
- Buttons and filters that exist but do not change anything meaningful.
- Unclear information hierarchy or workflows hidden behind generic cards.

### Taste Acceptance Criteria

- A user can complete the primary workflow without guessing.
- There is meaningful state change after interaction.
- The interface handles empty/error/success states gracefully.
- The app has enough density and specificity to avoid feeling like a toy.

### Builder Instruction

- If the literal prompt would produce a boring or toy-like result, improve the concept while preserving the core intent.
- During implementation, spend effort on depth, polish, feedback, and the primary loop before adding breadth.
- Before declaring the build done, inspect it as a real user and fix the highest-leverage weakness.

## RDS QA Scenarios

These scenarios are binding implementation and QA requirements. Do not treat browser boot or a passing unit test as sufficient unless these user-facing paths are implemented and verifiable.

### Complete the primary workflow
- main action is visible
- controls change durable state
- success/error state is shown
- QA actions:
  - click: Submit order|Create order|New order
- QA expectations:
  - state-change: 
- Blocking if missing: yes

### Exercise search/filter/settings/export-style controls
- visible controls are not no-ops
- sample data is realistic
- empty/loading/error states exist
- QA actions:
  - click: Search
  - click: Filter|Settings
- QA expectations:
  - state-change: 
- Blocking if missing: yes

### Verify operator confidence and responsive layout
- status/history/progress is visible
- mobile layout is usable
- no clipped controls or horizontal overflow
- QA expectations:
  - text: status
- Blocking if missing: yes

### Verify PRD promise: A personal **financial copilot web dashboard** — the user-facing surface of an
- A personal **financial copilot web dashboard** — the user-facing surface of an
- visible runtime evidence exists
- not implemented as placeholder text only
- QA actions:
  - goto: /
- QA expectations:
  - text: personal|financial|copilot|dashboard
- Blocking if missing: yes

### Verify PRD promise: Intelligent Financial Agent." It gives a single operator a personalized
- Intelligent Financial Agent." It gives a single operator a personalized
- visible runtime evidence exists
- not implemented as placeholder text only
- QA actions:
  - goto: /
- QA expectations:
  - text: Intelligent|Financial|Agent|gives
- Blocking if missing: yes

### PRD Promises To Preserve
- A personal **financial copilot web dashboard** — the user-facing surface of an
- Intelligent Financial Agent." It gives a single operator a personalized
- evaluation/statistics harness — are represented as display-only surfaces over seeded
- Operator (Chris)** — primary, single user. Technical builder; reviews the morning
- briefing, explores theses in chat, logs/reviews decisions, plays the paper-trading
