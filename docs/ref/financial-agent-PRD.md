# PRD — Intelligent Financial Agent ("the System")

**Author:** Chris (with Claude)
**Date:** May 29, 2026
**Status:** Draft v1 — for build
**Source research:** `financial-agent-research-blueprint.md` (v1), `-v2-deep.md` (v2), `-v3-buildspec.md` (v3)
**Locked decisions:** Full-system scope (all phases) · Runtime: **Zo Computer** · Model: **hybrid local fast-lane + frontier slow-lane** · Read accounts: **Coinbase (view-only), Robinhood via SnapTrade (read-only OAuth), on-chain wallet (read-only)**

---

## 0. One-paragraph summary

A personal, owned, always-on financial agent with three subsystems: a **Brain** (a self-maintaining knowledge engine that ingests market/news/on-chain data and remembers your theses and outcomes), a **Copilot** (a daily-briefing + alerts + portfolio advisor that reasons over your *real consolidated holdings* and where **you execute every trade**), and an **Autonomous Web3 Executor** (a bounded-authority agent that runs *structural-yield* strategies — not price prediction — on a small, hard-capped tranche of real capital). It occupies the open whitespace no incumbent fills: multi-asset, owned/private, personalized, bounded-autonomy, transparent. The guiding constraints: the Copilot never has trade authority; the Executor's authority is cryptographically bounded; and every claim is evaluated after-cost, after-tax, and primarily on post-model-training-cutoff data because *reported alpha is not deployment evidence.*

---

## 0.5. Open-question resolutions (May 29, 2026 research iteration)

A focused research pass resolved the build-blocking open questions. Net: the plan holds, with **one material change** (Zo has no GPU → the "local fast-lane" can't run on Zo).

**RESOLVED — Q1 Zo hosting (with one caveat).** Zo (Basic, $18/mo, **4 CPU / 32 GB RAM, always-on**) is a real root-Linux server that *can* host the Brain + Copilot + always-on ingestion as supervised **Services** (websocket consumer, localhost Postgres/Redis, web UI/API), plus **Automations** (natural-language scheduled tasks — their own example is literally a morning briefing). Two caveats: (1) **No GPU on any tier** → a local 7B–32B model is *not* viable on Zo. (2) Zo **restarts periodically even on paid plans** to snapshot, so ingestion must be registered as a Service (auto-restarts) and be reconnect/idempotent-safe. Portability is good (open container-image format), with moderate lock-in only if you lean on Zo's built-in tools. → **Decision:** host everything on Zo Basic to start; resolve the "fast lane" below.

**CHANGED — the "hybrid local fast-lane."** Because Zo is CPU-only, the fast lane can't be a self-hosted local model on Zo. Three realistic options: **(a, recommended default)** keep the fast lane *cheap+fast API* via Zo BYOK pointed at **Groq / Haiku / Gemini Flash / OpenRouter** — preserves the cost benefit, loses strict local-privacy (mitigate by abstracting holdings to ratios + zero-retention terms); **(b)** add an **adjacent GPU box** (Hetzner GPU / RunPod / a Mac Studio you own) running Ollama/vLLM, exposed to Zo as an OpenAI-compatible endpoint — true local privacy, +cost/ops; **(c)** defer local entirely, all-API. *This is now an explicit decision for Chris (see Q1-b below); the PRD assumes (a) unless you choose otherwise.*

**RESOLVED — Q3 custody + chain → Coinbase CDP on Base.** Use **CDP Server Wallet v2 Smart Account + on-chain Spend Permission (rolling cap = working float) + CDP Policy Engine (contract/recipient allowlists, per-tx caps) + Tenderly/Blockaid pre-sign gate**. This is the only single-vendor stack that puts the spend cap **on-chain** (survives total infra/key compromise) *and* gives TEE-enforced allowlists, is **free at our scale** (5k ops/mo free; ops are $0.005), and has the best agent SDK (AgentKit, Base-native). **Chain = Base** because it's the only chain that supports the on-chain bounded-custody stack (Solana has no AA standard → TEE-only bounds). Runner-up: **Turnkey + ERC-4337** (vendor-neutral, more assembly). Note: Hyperliquid now supports CCTP deposits from Base (Arbitrum bridge being deprecated) — verify live before the funding-carry leg.

**RESOLVED — Q4/B1 integrations, Phase-1 cost = $0.** **SnapTrade** is available to individuals self-serve; **Free tier = 1 connected user with real-time data** (ideal for solo), and its Robinhood integration is **read-only with trading structurally impossible** (credentials stay with you via OAuth). *(Correcting earlier research: the real free tier is 1 connected user, not "$1.50/user" — that's the paid multi-user rate.)* **Coinbase**: create a **CDP API key with View scope only** (legacy keys were killed Feb 5, 2025 — must use the new CDP key). **On-chain**: **Zerion API free tier** (~3k calls/day, EVM+Solana, **decodes DeFi positions** not just balances) is the load-bearing piece; Alchemy/Helius free for raw balances; **avoid Etherscan free tier** (Base/BNB now paywalled). All-in Phase-1 read cost: **$0/mo**.

**SHARPENED, NOT RESOLVED — Q2 tax (needs CPA).** Good news: §1259 *constructive sale* likely **does not apply to crypto today** (crypto is property, not a §1259-covered asset) — though it's **proposed to change**. But two real frictions: **(1) §1092 straddle rules** likely apply to long-spot/short-perp (defers losing-leg losses, suspends long-term holding period) — this bites *now*; **(2) funding income is ordinary income** (up to 37%), so the headline funding APR **overstates the net** — model carry as an ordinary-income stream, not a capital-gains play. Perp characterization (§1256 vs NPC vs capital) is genuinely unsettled and venue-dependent. A sharpened 9-question list for a crypto-savvy CPA is in the research doc (`-v3` / this iteration) — **engage one before any real Web3 capital.**

**Data honesty note (affects eval harness X6).** There is **no free survivorship-bias-free / point-in-time equities data** — honest equity backtests require buying **Norgate Platinum** (the cheapest bias-free + PIT-constituents source) or Sharadar for fundamentals. **Crypto funding-carry, by contrast, can be backtested honestly on free data** (exchange dumps + CoinGlass funding history); only pay for **Tardis.dev** when you need historical L2 orderbook for execution modeling. → First paid data dollar goes to Norgate *only if* an equity strategy reaches the backtest-of-record stage; crypto stays $0 until orderbook microstructure matters.

---

## 1. Problem statement

Chris actively manages money across equities (Robinhood), crypto (Coinbase), and on-chain wallets, but the work of staying informed — reading filings, news, on-chain flows, funding rates, and sentiment, then deciding what matters *today* for *his actual holdings* — is a daily 20–40 minute cognitive tax that no existing tool solves. The market is saturated with commodity tools (robo-advisors that only allocate, crypto bots that only run grids, signal feeds you act on manually) and a graveyard of hyped autonomous "AI agent" tokens, but **nothing reasons across all his assets, integrates his real consolidated positions, remembers his reasoning over time, and acts only within bounds he sets.** The cost of not solving it: continued time drain, decisions made on incomplete information, and missed structural-yield opportunities (e.g., funding-rate carry) that *can* be safely automated. The research base (three rounds) confirms the whitespace is real and the infrastructure to build it is now production-grade.

---

## 2. Goals

1. **Cut daily research time from ~30 min to <5 min** via a personalized pre-market briefing that surfaces only what's relevant to Chris's holdings and watchlist, with rationale and confidence.
2. **Achieve a positive, honestly-measured decision edge** — the Copilot's scored suggestions beat naive baselines (buy-and-hold, 1/N) net of cost on a forward-tested, post-cutoff basis, with a published track record by confidence tier.
3. **Run a bounded autonomous Web3 strategy that is net-positive after all costs** (gas, fees, tax) on a small tranche, with zero unbounded-loss incidents.
4. **Maintain a self-improving knowledge base** — the Brain demonstrably learns from tracked outcomes (reflection updates strategy beliefs) without overfitting to noise.
5. **Own it end-to-end** — self-hostable on Chris's Zo VPS, holdings data kept private (local fast-lane), every suggestion and action transparent and auditable.

---

## 3. Non-goals

1. **No automated equity trading.** Robinhood automated trading violates ToS and risks account freeze; the Copilot is advisory only — Chris executes equities manually. (Architectural, permanent.)
2. **No managing anyone else's money.** Triggers RIA/CTA registration and "AI-washing" liability (the Delphia precedent). Personal use only for the foreseeable future.
3. **No rebuilding commodity layers.** Execution/connectivity (Hummingbot/CCXT/Freqtrade), market data (buy it), grid/DCA logic, vault infrastructure (Yearn/Beefy/Ethena) are rented/integrated, not built.
4. **No price-prediction autotrading with real capital.** The autonomous side runs *structural* (non-predictive) yield strategies only; predictive signals stay advisory (human-gated). Research shows solo predictive autotrading reliably loses to costs/MEV.
5. **No high-frequency / latency-edge strategies.** Not winnable solo; also tax-inefficient (short-term gains). Out of scope.
6. **No "AI fund" token / public product (this version).** Avoid the token-narrative trap; this is a personal tool first.

---

## 4. Personas

- **Chris-as-operator** (primary): technical builder, wants control, transparency, and to learn; reviews briefings, approves Web3 strategy changes, executes equity trades himself.
- **Chris-as-time-pressed-user**: wants the 5-minute morning read and to trust "nothing urgent today" when it's true.
- **The System-as-agent** (internal personas): Brain (researcher), Copilot (advisor), Executor (bounded trader) — distinct subsystems with distinct authority.

---

## 5. User stories

**Brain / knowledge engine**
- As the operator, I want the System to continuously ingest market, news, and on-chain data and store it with point-in-time integrity, so that its reasoning is never contaminated by hindsight.
- As the operator, I want the System to remember my theses, past decisions, and their outcomes, so that it reasons in the context of what I believe and what has/hasn't worked.
- As the operator, I want the Brain to periodically reflect on tracked outcomes and update its strategy beliefs, so that it improves over time — but only when evidence is statistically meaningful, so it doesn't chase noise.

**Copilot (advisory, human-in-the-loop)**
- As a time-pressed user, I want a single pre-market briefing of 3–5 prioritized items relevant to my holdings, each with a "why now," a bull/bear case, a confidence score, and a time horizon, so that I know what matters in under 5 minutes.
- As the operator, I want the Copilot to read my real consolidated holdings (Coinbase + Robinhood + on-chain wallet, all read-only), so that its analysis reflects my actual positions and concentration.
- As the operator, I want intraday alerts only for validated, position-relevant anomalies, so that I'm not spammed and I trust each ping.
- As the operator, I want to ask the agent "what's the bear case on X?" or "explain today's biggest mover," with context preserved, so that I can explore a thesis conversationally.
- As the operator, I want every suggestion logged before the outcome is known and later scored on both P&L and whether the thesis played out for the stated reason, so that I can tell skill from luck.
- As a time-pressed user, I want the briefing to say "nothing actionable today" when true, so that the System never manufactures action.

**Autonomous Web3 Executor (bounded autonomy)**
- As the operator, I want the agent to run structural-yield strategies (stablecoin lending, delta-neutral funding carry) on a small, hard-capped tranche, so that I capture yield that's genuinely automatable.
- As the operator, I want the agent's authority bounded on-chain (spend caps, contract/token allowlists, session keys it can't override), so that even a fully-compromised agent can only lose the small working float.
- As the operator, I want every proposed transaction simulated and scanned before signing, and the whole thing pausable with one kill switch, so that I'm protected from malicious contracts and prompt injection.
- As the operator, I want to approve any strategy change or any action above a threshold, so that the agent operates autonomously only within the envelope I set.

**Edge/error cases**
- As the operator, when a data feed is stale or an exchange API is down, I want the System to flag it and degrade gracefully (not act on bad data), so that outages don't cause bad decisions or trades.
- As the operator, when the Executor hits a drawdown limit, funding flips negative, or N transactions fail, I want it to auto-flatten and enter SAFE_MODE, so that losses are bounded.
- As the operator, when the Copilot was wrong, I want a causal "here's why this missed + here's what I can't reliably predict" rather than silence, so that I can recalibrate trust.

---

## 6. Requirements

### Subsystem A — The Brain (knowledge engine)

**P0 (Must-have)**
- A1. Data ingestion pipeline pulling, on schedule, market data (Coinbase/CoinGecko, equities via the read integrations), news/sentiment (Finnhub/Benzinga free), and on-chain (DefiLlama, funding rates) — deduped, embedded, written to memory with **event-time + knowledge-time stamps**.
  - *Acceptance:* Given a news item published at time T, when the Brain stores it, then it records both publish time and ingest time, and an "as-of" query before T excludes it.
- A2. Memory store: a layered memory (FinMem-style short/mid/long + reflection) backed by a vector store (Qdrant or pgvector) + bi-temporal facts. Retrieval scored by recency + importance + relevance.
- A3. Decision/outcome journal: every Copilot suggestion and every Executor action logged *before outcome* with thesis, signals, confidence, horizon, and falsification condition; scored after the horizon resolves.
- A4. Reflection loop: periodic pass that turns scored outcomes into updated strategy beliefs, **gated** by a statistical-significance check (Deflated Sharpe / minimum-sample) so single outcomes can't flip beliefs.

**P1 (Should-have)**
- A5. Drift detection (KSWIN on features + ADWIN/Page-Hinkley on PnL residuals) that flags regime change and triggers a shadow re-evaluation, not a live change.
- A6. Regime layer (HMM/BOCPD) used as a risk scaler / strategy router, not a price predictor.

**P2 (Future)**
- A7. Voyager-style skill library (reusable strategy code as procedural memory).
- A8. Champion/challenger shadow-deployment promotion for Brain strategy modules.

### Subsystem B — The Copilot (advisory)

**P0**
- B1. Read-only holdings aggregation (**resolved, $0/mo**, see §0.5): **Coinbase CDP View-scope key** + **Robinhood via SnapTrade Free tier (1 connected user, real-time, read-only OAuth — trading structurally impossible)** + **on-chain via Zerion API free tier** (EVM+Solana, decodes DeFi positions; Alchemy/Helius for raw balances). Consolidated into one portfolio view with concentration analysis. No write/trade scope anywhere.
  - *Acceptance:* Given linked accounts, when the portfolio loads, then it shows consolidated holdings + DeFi positions + concentration, and no code path can place a trade on any of them.
- B2. Daily pre-market briefing: 3–5 ranked cards, each = headline + "why now" + relevance-to-holdings + suggested action + **bull/bear** + **1–10 conviction score** + **explicit time horizon**; explicit "nothing actionable today" state.
- B3. Multi-agent reasoning (forked TradingAgents pattern): analysts → bull/bear debate → risk → portfolio-manager synthesis, producing the auditable rationale behind each card.
- B4. Quant overlay on any sizing suggestion: ½-Kelly (capped), vol-target context (10–15%), CVaR/drawdown framing — surfaced as *informational* sizing guidance, never auto-executed.
- B5. Conversational interface: scaffolded suggested prompts, **context-persistent**, able to reference dashboard elements; experience-appropriate tone; confidence hedging + bull/bear built into the voice.
- B6. Transparency: every recommendation shows its ranked, color-coded drivers and cites its data sources; **published track record by confidence tier**.

**P1**
- B7. Prioritized alert feed: dynamic z-score thresholds + a critic layer ("would a sharp trader care right now?") before surfacing; T0 interrupt / T1 batched / T2 dashboard-only tiers.
- B8. Gamified paper-trading layer (Numerai-style, multi-week-scored, rewards calibrated prediction/patience/diversification) on Alpaca paper — **no confetti on real trades**, streaks tied to *reviewing*, not trading.
- B9. End-of-day review + weekly reflection (signal-decay accountability).

**P2**
- B10. Alt-data ensemble features (funding crowding, attention deltas, FinBERT sentiment) as regime-aware inputs.
- B11. Mobile glance-and-approve surface.

### Subsystem C — The Autonomous Web3 Executor (bounded autonomy)

**P0**
- C1. Bounded-authority custody (**resolved → Coinbase CDP on Base**, see §0.5): **CDP Smart Account + on-chain Spend Permission (rolling cap = working float) + CDP Policy Engine (contract/recipient allowlists, per-tx caps, Permit2/never-MAX approvals)**; agent holds only a **scoped, expiring, revocable session key**; keys in CDP TEE. The spend cap is enforced **on-chain** (survives total key/infra compromise); allowlists in the TEE. Runner-up if vendor-neutrality is needed: Turnkey + ERC-4337.
  - *Acceptance:* Given a fully-compromised agent process AND leaked API creds, when it attempts any action, then it cannot exceed the on-chain rolling spend cap or transact with non-allowlisted contracts/recipients.
- C2. Mandatory pre-sign gate (**fail closed**): allowlist check → Tenderly simulation with balance-diff assertion → Blockaid/Pocket-Universe scan → policy check; sim/scan error ⇒ reject.
- C3. Strategy set v1: **stablecoin lending** (T-bill-backed/blue-chip) first, then **delta-neutral funding carry** — *structural yield only*, on Base or Solana via private RPC (Flashbots/Jito).
- C4. Risk controls: per-trade/per-day limits, liquidation buffer, funding-sign-flip hysteresis exit, drawdown circuit breaker, **one-tap kill switch** (pause + session-key revocation + approval sweep), full audit log.
- C5. Protocol-vetting checklist enforced before any contract is allowlisted (≥6–12mo live, verified source, ≥2 audits, no-timelock-proxy = reject, robust oracle, clean exploit history).
- C6. Human-in-the-loop gate (Temporal signals): autonomous within the envelope; explicit approval required for strategy changes or any action above threshold.

**P1**
- C7. Multi-strategy allocation across the structural-yield menu with ERC/HRP-style sizing.
- C8. Real-time monitoring dashboard (funding, net delta, margin ratio, basis, venue health) with alerting.

**P2**
- C9. Additional venues / cross-venue carry; prediction-market or other agent-native strategies only if a vetted edge is demonstrated.

### Cross-cutting (platform)

**P0**
- X1. Runtime on **Zo Computer Basic** (4 CPU/32 GB, always-on; see §0.5): ingestion + UI/API as supervised **Services** (reconnect/idempotent-safe — Zo restarts to snapshot), morning briefing/EOD/ingestion cadence as **Automations**; localhost Postgres/Redis; architected portably (open container format) for a later VPS move.
- X2. **Model routing** (see §0.5 — Zo has no GPU): **fast lane = cheap+fast API via BYOK (Groq/Haiku/Flash/OpenRouter)** for triage/sentiment/reflection (abstract holdings to ratios for privacy), default unless Chris opts for an adjacent GPU box for true-local; **slow lane = frontier API** (Sonnet, Opus for the final call) with prompt caching + batch for nightly jobs; `max_budget_usd` + per-run caps.
- X3. Orchestration: Brain = orchestrator+subagents (Claude Agent SDK); Copilot = single agent + tools; Executor = deterministic graph (LangGraph) in a durable workflow (Temporal). State flows between subsystems as **typed records via an external store**, never shared conversation context.
- X4. MCP layer with **physically separated read vs. execute scopes**: finance-READ exposed to Brain+Copilot; finance-EXECUTE exposed only to the gated Executor. OAuth-scoped where remote.
- X5. Observability: Langfuse (OTel, all subsystems) + spend tracking; every signed tx and every suggestion traced.
- X6. Evaluation harness: Alpaca paper live-shadow + decision journal + DSR/PBO/MinTRL gates + post-cutoff-only validation; staged promotion (backtest→walk-forward→paper→small live→scale) with pre-registered gates.

**P1**
- X7. Secrets management (no keys in agent runtime), dependency hash-locking, signer isolation.
- X8. Tax record-keeping integration (Koinly/CoinTracker) from the first transaction.

---

## 7. Success metrics

**Leading (weeks)**
- *Briefing usefulness:* operator opens the briefing ≥5 of 7 days/week; self-rated "useful" ≥80% of days; median read time <5 min. (Measure: usage log + a one-tap 👍/👎.)
- *Alert precision:* <20% of T0 alerts marked "not useful" (snooze/feedback loop). Target stretch: <10%.
- *Coverage:* ≥95% of holdings successfully aggregated and refreshed daily across the three read integrations.
- *Cost:* all-in LLM + infra spend ≤ $80/month (target $30–60). (Measure: Langfuse + Zo billing.)

**Lagging (months)**
- *Decision edge (the real bar):* Copilot suggestions beat buy-and-hold AND 1/N **net of cost, on post-cutoff/forward-tested data**, measured by Rank IC > 0.05 and a Deflated-Sharpe-significant positive expectancy over ≥100 scored decisions. Honest "no edge" is an acceptable finding that keeps the System advisory-only.
- *Web3 net yield:* funding-carry + lending tranche net-positive after gas/fees/tax over ≥8 weeks; **zero unbounded-loss incidents** (hard gate — any breach = stop).
- *Brain learning:* reflection-driven belief updates that pass the significance gate correlate with improved forward decision quality (process score trend), not just recent-noise chasing.
- *Trust calibration:* realized hit-rate within the confidence band the System advertised (calibration error measured and trending down).

**Kill/Pivot criteria:** if after the staged funnel the Copilot can't beat naive baselines net of cost on post-cutoff data, it remains a (still-valuable) research/briefing tool and the predictive-suggestion feature is shelved. If the Web3 tranche is net-negative after 8 weeks net of costs, halt and reassess venue/strategy — do not scale.

---

## 8. Acceptance criteria (representative, by P0)

- [ ] **Brain ingestion is PIT-correct:** a replay "as of" any past timestamp returns only data whose knowledge-time ≤ that timestamp (no look-ahead).
- [ ] **Holdings are read-only everywhere:** automated security check confirms no trade/write scope on Coinbase, Robinhood (SnapTrade), or the wallet; attempting a trade call fails by construction.
- [ ] **Briefing format:** every card renders headline + why-now + relevance + bull/bear + 1–10 score + horizon; "nothing actionable today" appears when no card clears the bar.
- [ ] **Suggestion logging:** every suggestion is written to the journal with thesis + falsification condition *before* the outcome window; later scored on outcome AND process.
- [ ] **Executor authority is bounded on-chain:** in a red-team test, a deliberately "hijacked" agent cannot exceed caps or touch non-allowlisted contracts/recipients.
- [ ] **Pre-sign gate fails closed:** when Tenderly or Blockaid errors or flags red, the transaction is rejected, never auto-approved.
- [ ] **Kill switch works:** one action pauses the module, revokes session keys, and sweeps approvals; verified in a drill.
- [ ] **Eval honesty:** the harness reports net (not gross) metrics with confidence intervals and refuses to "pass" a strategy evaluated only on pre-training-cutoff data.
- [ ] **Cost guardrail:** a runaway loop is hard-stopped by `max_budget_usd` before exceeding the per-run cap.

---

## 9. Phasing (maps to v3 build plan)

- **Phase 0 — Data + Brain skeleton (wk 1–3):** A1–A3, X1–X5 minimal; PIT data + memory + journal + read MCPs on Zo; local fast-lane model; Langfuse.
- **Phase 1 — Copilot v1 + eval harness (wk 4–6):** B1, B2, B6 + X6; daily briefing, read-only holdings, Alpaca paper live-shadow + journal scoring from day one. **Suggestions only, zero capital at risk.**
- **Phase 2 — Reasoning + quant + gamification (wk 7–10):** B3, B4, B5, B7, B8, A4; fork TradingAgents, quant overlay, reflection loop, paper-trading game; DSR/PBO gates; post-cutoff validation.
- **Phase 3 — Web3 custody & risk FIRST (wk 11–14):** C1, C2, C4, C5, C6, X7; bounded authority + fail-closed gate + kill switch *before any real trade*; Hummingbot paper-trade; stablecoin lending first.
- **Phase 4 — Live Web3 micro-tranche (wk 15+):** C3 live; $100–200 real on Base/Solana via private RPC; measure net P&L after gas/fees/tax; scale toward $1k only if net-positive.
- **Ongoing:** drift-triggered shadow retrains, weekly signal-decay review, dependency hardening, tax tracking.

---

## 10. Open questions

**Resolved this iteration (see §0.5)**
- Q1 *(infra)* — ✅ Zo Basic ($18/mo, 4 CPU/32 GB, always-on) hosts Brain+Copilot+ingestion as Services + Automations; caveats: no GPU, periodic restarts (build reconnect-safe).
- Q3 *(custody/chain)* — ✅ Coinbase CDP (Smart Account + on-chain Spend Permission + Policy Engine) + Tenderly/Blockaid, on **Base**. Runner-up Turnkey+4337.
- Q4 *(integrations)* — ✅ SnapTrade Free (Robinhood read-only) + Coinbase CDP View key + Zerion free; Phase-1 read cost $0.

**Still blocking (need Chris's decision or a professional)**
- **Q1-b *(model, NEW from §0.5)* — DECISION NEEDED:** fast lane = cheap API via Zo BYOK (Groq/Haiku — default) vs adjacent GPU box for true-local privacy vs all-API. PRD assumes the API default.
- Q2 *(legal/tax, before Phase 4)* — ⚠️ Needs a crypto-savvy CPA. Sharpened: §1259 likely N/A to crypto today (but proposed to change); the live frictions are **§1092 straddle** (loss deferral) and **funding = ordinary income** (headline APR overstates net). 9-question CPA list ready.
- Q4-b *(data budget)* — no free survivorship-bias-free equity data → buy **Norgate Platinum** only when an equity strategy reaches backtest-of-record; crypto carry stays free until L2 orderbook needed (then Tardis).

**Non-blocking (resolve during)**
- Q5 *(model)*: If choosing true-local (Q1-b), which model (Qwen3-32B vs Llama 3.3 70B vs fine-tuned FinBERT) and hardware.
- Q6 *(UI):* Web-first dashboard now, mobile later — confirm the Next.js + Lightweight Charts stack and whether to host the UI on Zo.
- Q7 *(eval):* Exact promotion thresholds between funnel stages (e.g., acceptable live-vs-backtest Sharpe degradation band).
- Q8 *(scope):* Whether the paper-trading game (B8) is a Phase 2 priority or deferred.

---

## 11. Risks & mitigations (carried from research)

| Risk | Mitigation |
|---|---|
| No real predictive edge (most likely outcome) | Eval harness is honest by design; System stays valuable as a briefing/research tool even with zero predictive alpha; Web3 yield is structural, not predictive. |
| Robinhood ToS / account freeze | Read-only via SnapTrade OAuth; all equity execution manual. |
| Prompt injection / agent compromise | Bounded on-chain authority; fail-closed sim gate; read/execute MCP separation; secrets out of runtime. |
| Backtest self-deception | DSR/PBO, post-cutoff-only validation, decision-journal process scoring, naive baselines. |
| Tax drag erasing edge | Evaluate after-tax; favor structural yield + lower turnover; Koinly from day one; §1259 sign-off. |
| Cost blowup | Hybrid routing, caching/batch, `max_budget_usd`, escalation caps. |
| Alert fatigue | Default-silent, dynamic thresholds, critic layer, snooze-feedback, attention budget. |
| Gamification → reckless behavior | Reward research/patience/diversification, paper-trading sandbox, no confetti on real trades. |

---

## 12. What we explicitly rent, not build

Execution/connectivity (Hummingbot/CCXT/AgentKit), market & fundamental data (vendors), grid/DCA logic, vault yield (Yearn/Beefy/Ethena/Giza), order routing (CoW/UniswapX), signal feeds (ingest Danelfin/Numerai as inputs if useful), brokerage read aggregation (SnapTrade), custody/MPC (Coinbase CDP/Turnkey), simulation/scanning (Tenderly/Blockaid), observability (Langfuse). **We build the brain, the bounded-autonomy guardrails, the personalization, and the transparency/eval layer — the differentiated core.**
