# Intelligent Financial Agent — Build-Level Blueprint (v3)

**Date:** May 29, 2026
**For:** Chris
**Builds on:** v1 (`financial-agent-research-blueprint.md`) and v2 (`financial-agent-blueprint-v2-deep.md`). This v3 adds the **engineering layer**: data infrastructure, LLM cost/latency economics, a concrete funding-carry spec, the on-chain security threat model, UI/competitor teardowns, the anti-self-deception evaluation harness, orchestration/MCP architecture, the commercial whitespace, and alt-data + proactivity design.
**Posture:** Deep technical, buildable. Skeptical by default.

---

## 0. The whitespace, named (the strategic reason to build this)

Three rounds of research converge on one strategic conclusion: **the market is saturated at the commodity layers and at the token-narrative layer, but wide open at the personal-orchestration layer.**

- **Commodity (rent, don't build):** execution & exchange connectivity (Freqtrade, Hummingbot, CCXT), market/fundamental data (buy it), grid/DCA bots (Pionex/3Commas/Cryptohopper), robo allocation (Wealthfront/Betterment), vault yield (Yearn/Beefy/Ethena/Giza), order routing (CoW/UniswapX), signal feeds (Danelfin/Numerai).
- **Token narrative (avoid):** the 2024–26 "autonomous crypto AI agent" wave is ~90% collapsed — ai16z/ElizaOS, Virtuals, aixbt all down 70–90% from peak. A small real residue ("DeFAI": Giza ARMA, Almanak, Theoriq) does *one* thing — stablecoin yield rotation — tied to a token/protocol.
- **The open lane:** *no one* offers a **personal, owned, always-on, multi-asset brain + copilot + bounded-autonomy executor that reasons over your real consolidated holdings and acts only within bounds you set.** Every incumbent fails ≥1 axis: multi-asset, owned/private, personalized, integrated-with-real-holdings, bounded-autonomy (the missing middle between pure-advice and full-auto), transparent.

**And a regulatory guardrail that doubles as positioning:** Delphia got the SEC's first "AI-washing" enforcement action ($225–400k) for claiming AI it didn't have. Build for transparency and never overclaim — it's both the ethical line and, if you ever touch others' money, your compliance posture. (Managing only your own money needs no RIA/CTA registration.)

**So the thesis for the build:** *build the brain and the guardrails; rent everything below them.*

---

## 1–9 (v1/v2 recap in one paragraph)

The honest core hasn't changed: the infrastructure is production-grade, the alpha is not. Backtest Sharpe ~doesn't predict live returns (Quantopian R²<0.025); the best-documented full-cycle LLM experiment lost 17%; ~80% of backtested strategies fail live; short-term-gains tax roughly doubles the bar a high-turnover bot must clear. Money for a solo operator comes from **structural crypto yield** (T-bill-backed stablecoin lending ~4–6%; delta-neutral funding carry ~8–15% gross, can go negative) and from the **Copilot as a genuinely useful daily decision-support brain with you at the trigger** — not from price prediction. Fork **TradingAgents** (reasoning) + **FinMem's BrainDB** (memory) + **Hummingbot/AgentKit** (execution) and validate in **nautilus_trader**. Risk layer: fractional Kelly (capped), EWMA vol-targeting to 10–15%, HRP, CVaR not VaR. Self-improving brain via drift detection + champion/challenger + human gate. Full detail in v1/v2.

---

## 10. Data engineering layer (NEW)

**The single most important thing in the whole stack is point-in-time (PIT) discipline** — it decides whether your backtests are honest. Two failure modes to engineer out: restated fundamentals/index membership (survivorship + selection bias) and knowledge-time-vs-event-time leakage.

- **Bitemporal storage:** stamp every fact with *valid time* (when true in the world) AND *knowledge time* (when you learned it); never overwrite, append versions; "as-of T" queries filter `knowledge_time <= T`. ArcticDB gives versioning/time-travel as a poor-man's bitemporal for market data.
- **Buy, don't build, your history:** PIT fundamentals from **Norgate** (affordable) or **Compustat PIT** (premium); crypto tick/orderbook from **Tardis.dev / CoinAPI** (Parquet+Zstd). Reconstructing it yourself creates gaps and burns engineering.
- **Storage by data shape:** **QuestDB** for live tick ingest + last-point queries; **Parquet+Zstd on R2/B2/S3** (5–15× compression) as the archive substrate; **ArcticDB** for versioned pandas-native research storage (top solo pick); **DuckDB** as the research/backtest query lens; **ClickHouse** if you need big-scan analytics; **kdb+/KDB-X** only if microsecond as-of joins are your edge. **Sample the L2 orderbook** (top-20 levels @1s + trade tape), don't store the full delta firehose (terabytes/month).
- **Feature store:** a solo builder almost never needs one. Use a **single feature-computation library that runs in batch (training) and stream (inference) mode** → no train/serve skew by construction; enforce PIT with as-of joins (`pd.merge_asof`/DuckDB `ASOF JOIN`). Add **Feast** only when models multiply.
- **Highest-alpha features (2025–26 empirical):** **Order Flow Imbalance dominates** short-horizon prediction (43% importance, AUC ~88% in a 2025 SPY study); plus bid-ask spread (regime), depth imbalance, VWAP-to-mid deviation, trade intensity. On-chain: exchange netflows, MVRV (cycle context only), funding rates. Microstructure features transfer reasonably across crypto symbols.
- **Leakage traps to kill:** label-overlap (use **purged + embargoed CV / CPCV**, López de Prado), knowledge-time joins, scaler-fit-on-full-data, bar-timestamp-at-open-with-close-price, survivorship in the universe, backward forward-fill.
- **Ingestion:** websocket consumers (reconnect/resync, seq-gap detection, dedup) → **Redpanda** (Kafka API without the cluster) → **Bytewax/Quix** stream processing → same archive + online store. Batch side: **Dagster/Prefect** for fundamentals/on-chain pulls + QC. Validate every batch with **Pandera**.

> One-paragraph stack: buy PIT/tick history; land as Parquet+Zstd on object storage; version via ArcticDB; query with DuckDB; run websocket→Redpanda→Bytewax for live, writing the same archive + QuestDB/Redis online features with the *same feature code*; stamp event+knowledge time, never overwrite, validate with Pandera, enforce PIT with as-of joins + purged/embargoed CV. Skip Tecton/Chronon/Kafka/kdb+ until you're not solo.

---

## 11. LLM cost/latency economics (NEW)

**Model routing is a 5–10× cost lever — bigger than any price negotiation.** A naive all-frontier always-on system runs **$400–700+/mo**; tiered routing + caching + batch brings it to **$15–80/mo**.

- **Pricing reality (May 2026, verify live — it's the most volatile input, ~80% drop over the past year):** Claude Opus ~$5/$25 per M in/out, Sonnet ~$3/$15, Haiku ~$1/$5; GPT-5.4 ~$2.50/$15; Gemini Flash ~$0.30/$2.50; DeepSeek V3.2 ~$0.14/$0.28; local/open ~$0 marginal. (Note: new Opus tokenizer can emit +35% tokens — effective cost up even at "unchanged" rates.)
- **The architecture: split into a fast lane and a slow lane.**
  - **Fast lane (local/cheap, high frequency):** news/market triage, sentiment classification (FinGPT LoRA, <$300 to train), routine summarization → local Qwen3-32B / Llama 3.3 70B (private, ~$0 marginal) or Haiku/Flash. Keeps the *call count* free and holdings data private.
  - **Slow lane (frontier API, low frequency, batchable):** the TradingAgents deep/quick split — Sonnet for most reasoning/debates, Opus reserved for the final portfolio-manager call. Run nightly briefings + reflection on the **batch API (–50%)** with **prompt caching** on the static spine (system prompt, portfolio context, rubrics → 90% off cached reads on Anthropic).
- **Worked numbers:** a nightly multi-agent briefing is ~$2.38/run all-Opus → **~$16–17/mo** tiered+cached+batched. Continuous monitoring is the blow-up risk: all-Opus triage of 2,000 items/day ≈ $300/mo → **$2–20/mo** with cheap/local triage + escalating only ~3% to frontier.
- **Latency:** mostly irrelevant for daily advisory (batch it); matters only for execution-adjacent paths — never put a reasoning model in a latency-critical loop; pre-compute policy in the slow lane, apply in the fast lane.
- **Local vs API:** API is cheaper than dedicated GPU rental below ~50M tokens/mo; a *bought* box (Mac Studio / DGX Spark ~$4k) shines for high-frequency cheap calls (triage/sentiment/reflection) at ~zero marginal cost + privacy for financial data.
- **Fine-tune vs RAG vs prompt:** prompt first; RAG for current/proprietary facts; cheap LoRA fine-tune only for a high-volume narrow task (sentiment) to push it onto a local model.
- **Cost control:** `max_budget_usd` per run (Claude SDK, *not* on by default — set it), Langfuse/Helicone per-agent cost tracing, cap escalation rate, cap debate rounds, alert on cache-hit-ratio drops.

---

## 12. Delta-neutral funding-carry — buildable spec (NEW)

**Skeptical headline:** mechanically sound, but in the compressed mid-2026 funding regime the net edge at $1k–$10k is thin and fragile. ~4 taker legs cost ~0.20–0.40% round-trip; at ~6% funding you need to hold well past a ~24-day fee-breakeven; short-term tax takes ~35%. Honest net: **low-single-digit to low-teens APR in normal regimes, with fat left-tail risk** (Oct 2025: $19B liquidated, USDe hit $0.65, dYdX offline 8h). Build it as infrastructure + for opportunistic high-funding windows, not a reliable yield machine.

- **Venue:** best single-venue is **Hyperliquid** (hourly funding = granular exit, low fees, clean SDK, self-custody removes withdrawal-freeze risk) or a **Bybit/Binance unified-margin account** where **spot collateralizes the perp short** (the key capital-efficiency unlock for a small account). Avoid Coinbase spot (fees eat the edge) and dYdX-as-only-venue (Oct 2025 outage). Classic structure: long spot + short perp on the *same* venue.
- **The loop:** `INIT→SCAN→ENTER→MONITOR⇄REBALANCE→EXIT`, plus `SAFE_MODE`. Enter when per-period funding annualizes above ~10–15% net of the 4-leg round-trip AND basis < ~0.10%. Size delta-neutral: `N = C/(1+m)` (m = perp margin fraction; 2–4× leverage for small ops), `qty = N/spot_px`. Fire both legs concurrently (minimize leg risk); if one fills and the other rejects, immediately flatten. Rebalance when `|net_delta| > 0.5–1%`. Exit on funding flipping negative for N periods (hysteresis), basis convergence, or risk trigger.
- **Liquidation buffer:** at 4× (m=0.25, mm≈0.005) you can withstand ~+24% before liquidation standalone — but the real risk is a margin call on the short *before* spot gains mobilize as collateral (worst cross-venue). Same-venue unified margin + a maintained buffer (keep `P_liq` ≥40–50% above mark) + auto-deleverage both legs proportionally rather than letting the exchange liquidate the short and leave you naked-long.
- **Forkable repos:** **ynhy513/funding-rate-arbitrage** (most complete long-spot+short-perp skeleton: state machine, CCXT, Telegram alerts, drawdown kill, auto-exit on negative funding — fork & harden, it's unaudited), **aoki-h-jp/funding-rate-arbitrage** (mature multi-CEX *scanner*, 288★, no execution), **hyperliquid-python-sdk** (official execution: `bulk_orders`, `update_isolated_margin`, `user_state` gives `liquidationPx`). **Hummingbot** has a native `spot_perpetual_arbitrage` V1 strategy + `v2_funding_rate_arb` controller + `hyperliquid_perpetual` connector (works but has known bugs — #7295 double-fill, #7814 testnet, #6933 stale funding; test on testnet).
- **Worked $5k example (Bybit unified, BTC, 8h):** deploy $4k, round-trip fees ~$12.40. Normal ~12% funding → +$27 pre-tax (~8.2% APR) → ~$17.6 after 35% tax (~5.3%). Compressed ~6% → +$7.3 (~2.2%) — barely above noise. **Don't trade the floor; only worth it in normal-to-rich windows.**
- **Tax flag:** IRC §1259 *constructive sale* may treat long-spot + short-perp against an appreciated position as a taxable event — crypto treatment unsettled; get professional advice before scaling.
- **Monitor:** funding (current + predicted), net delta, margin ratio/`liquidationPx`, basis, venue health (API latency, websocket heartbeat, stale-funding). Kill conditions auto-flatten → SAFE_MODE.

---

## 13. On-chain security threat model (NEW — non-negotiable for real capital)

**The one principle:** *the agent proposes, cryptographically-enforced agent-external policy disposes.* The 2025 IACR "AI Agents in Cryptoland" study proved (against ElizaOS) that prompt injection, indirect injection, and **memory injection** all drive unintended transfers — "no silver bullet" at the model layer. Containment lives in infrastructure, not the prompt.

- **Threat vectors → mitigations:** raw-key compromise → agent never holds the key (MPC/TEE/session key); prompt/indirect/memory injection → allowlist + caps the LLM can't override + mandatory sim gate; malicious/rugged contracts → allowlist-only + honeypot sim; **unlimited ERC-20 approvals** (a top drain vector) → Permit2 + scoped/time-boxed approvals, never `MAX`, auto-revoke; address poisoning (270M+ attempts, a $50M loss Dec 2025) → recipient allowlist, never source addresses from history; oracle manipulation → only allowlist robust-oracle (Chainlink/TWAP) protocols; MEV → tight slippage + private RPC; **supply-chain** (Sept 2025 npm `chalk` drainer hit 2B weekly downloads in 16 min; Feb 2026 Lazarus 800+ packages) → pin/hash-lock deps, isolate signer from runtime; compromised RPC → own node / cross-check.
- **Recommended bounded-authority architecture (defense in depth):**
  1. **Cold vault** = Safe multisig 3-of-5+ (hardware wallets, ≥1 external signer, 24–48h timelock guard); agent is NOT an owner; funds the working account on a schedule.
  2. **Working smart account** = ERC-4337 (or Safe + modules) with on-chain-enforced per-tx cap, daily cap, recipient allowlist, contract+selector allowlist, per-token approval ceilings, time/rate limits. **This bounded float is the maximum loss.**
  3. **Agent holds only a scoped, expiring, revocable session key** here; keys live in MPC/TEE (Coinbase CDP policy engine / Turnkey / Privy), never in the agent process.
  4. **Mandatory pre-sign gate (fail CLOSED):** allowlist check → **Tenderly** simulation with balance-diff assertion → **Blockaid/Pocket-Universe** scan (red=block, yellow=escalate) → policy check. Sim/scan error ⇒ reject, never auto-approve. (Attackers evade sim via TOCTOU and forced-sim-failure, so layer in post-execution invariant checks + monitoring.)
- **Protocol vetting checklist before allowlisting:** ≥6–12 months live; stable/growing TVL (DeFiLlama); clean in rekt.news / De.Fi REKT / DeFiLlama hacks; **verified source** (unverified = reject); ≥2 reputable audits (read findings, not the badge); admin keys/upgradeability behind timelock+multisig (no-timelock upgradeable proxy = reject); robust oracle; bounded callable surface. Default deny.
- **Why "audited" isn't enough:** Balancer ($120M+, Nov 2025) was mature and heavily audited and still fell. And Anthropic's Dec 2025 red-team showed agents autonomously exploit fresh contracts at ~$1.22/scan — bias hard toward battle-tested, high-TVL targets.
- **Ops:** secrets never in runtime; monitor/alert every signed tx; anomaly detection; drilled kill switch (pause module + session-key revocation + approval sweep + timelock veto).

---

## 14. UI/UX & competitor teardowns (NEW)

Your two strongest differentiators: **human-in-the-loop** (vs Public.com's auto-execution) and a **pre-market daily briefing personalized to actual holdings**.

- **Steal Danelfin's explainability UX wholesale:** one glanceable **1–10 conviction score** + expandable **ranked, color-coded (green/red) drivers** + an explicit **time horizon** + **published track record by confidence tier**. Tickeron's cautionary reviews show high-confidence-but-wrong-with-no-accountability destroys trust — *if you show confidence you must show realized hit-rate.*
- **Present uncertainty explicitly** ("~70% confident, here's the bear case") — research shows it's transformative for calibrated trust. Always show **bull AND bear case** and **"why now."** Build a graceful "I got this wrong" error-repair pattern (causal attribution + boundary specification).
- **Gamify like Numerai/Stash, not Robinhood:** the 2025 Toronto study + the Massachusetts Robinhood enforcement make this a real reputational line. Reward **calibrated prediction, research, patience, diversification** over multi-week horizons; gate risky features behind learning modules (Stash); confine competition to a **paper-trading sandbox** (Alpaca paper). **No confetti on real trades.** Streaks tied to *reviewing the briefing*, never to trading.
- **Stack:** dark-first (avoid pure black/white), 5–7 metrics with progressive disclosure, **TradingView Lightweight Charts** for price (handles 50k+ candles) + Chart.js for allocation widgets, WebSockets/SSE for live, priority-queued notifications, mobile (glance+approve) and web (deep research) in tandem.
- **Five surfaces:** Daily Briefing (home — 3–5 cards, each headline+why-now+relevance+suggested action with bull/bear+score+horizon; explicit "nothing actionable today" when true), Alert Feed (priority-queued, success-filtered, one-tap "see rationale"), Portfolio (unified cross-account, concentration scoring), Paper-Trading Game (Numerai-style multi-week-scored sandbox), Agent Chat (scaffolded prompts, context-persistent, references dashboard elements, experience-adaptive persona).
- **Don't AI-wash** (Delphia/SEC). Cite data sources visibly (Incite's failure). Maintain conversation context (Magnifi's failure).

---

## 15. Anti-self-deception evaluation harness (NEW — the most important discipline)

The governing idea (from the 2026 *Alpha Illusion* paper): **reported alpha is not deployment evidence.** A good backtest is the start of an investigation into whether you're fooling yourself.

- **Net, never gross.** Charge commission + spread + slippage/impact + **token/latency cost**. The *Alpha Illusion* reproduction dropped TradingAgents' Sharpe 0.43→0.22 and QuantAgent's −0.96→−1.15 with realistic friction — both below buy-and-hold.
- **Risk-adjusted, never raw return**, each with a confidence interval: Sharpe (with SE ≈ √((1+SR²/2)/T) — a published LLM result was Sharpe 1.51 ±1.08, CI nearly touching zero), Sortino, Calmar, max drawdown (depth + duration), profit factor, expectancy, turnover. Use **Rank IC** for signal quality (mean IC >0.05 real, >0.10 strong; low IC std).
- **Deflate for the search you actually do.** Every prompt/window/threshold/model tweak is a trial → hurdle t ≈ **3.0** not 2.0 (Harvey-Liu-Zhu); compute **Deflated Sharpe Ratio** (the single most important "am I fooling myself" number), **PBO** (via CSCV), **Minimum Track Record Length**, **White's Reality Check / Hansen's SPA** across variant sets, and **bootstrap/Monte Carlo the equity curve** (report the distribution, not one path).
- **The staged validation funnel with pre-registered gates:** backtest-with-costs → walk-forward → **paper trade (live shadow on Alpaca paper)** → small live → scale. Promote only if criteria written *before* looking pass. Tolerance: live Sharpe ≥ ~50–60% of backtest is often acceptable; a *sign flip* or below-benchmark is a hard fail; if live falls outside your Monte Carlo 5–95% band, the backtest was wrong, not unlucky.
- **LLM-specific gates (Alpha Illusion P1–P6, fail any = disqualify):** **P1 temporal integrity** — evaluate primarily on data *after* the model's knowledge cutoff (FinMem's return dropped ~72%, QuantAgent's Sharpe ~51% crossing the cutoff — "the backtest measures memory, not prediction"); P2 dynamic survivorship-free universe; P3 counterfactual robustness (feed reverse evidence, check it updates); P4 calibration (LLM verbal confidence is miscalibrated — measure ECE before sizing off it); P5 realistic costs incl. tokens; P6 prove multi-agent beats single-agent net of cost.
- **Decision-journal scoring (luck vs skill):** log thesis + reason + conviction + falsification condition *before* outcome; score each call on outcome AND **process** (did the thesis play out for the stated reason). **Always beat naive baselines** net of cost: buy-and-hold, 1/N, random.
- **Tools:** quantstats/empyrical (tearsheets), Rank IC/Alphalens, DSR/PBO/MinTRL reference code (López de Prado AFML repo), Alpaca paper for the live shadow, vectorbt (sweeps) → backtrader/QuantConnect (realistic).

---

## 16. Orchestration & MCP architecture (NEW)

**The key insight: the three subsystems should NOT share one orchestration model** — their failure tolerances differ. Match framework to control profile. More reversible/read-only → more agentic; more irreversible/money-moving → more deterministic workflow with the LLM only at gated decision points.

- **Brain → multi-agent orchestrator-worker** (Anthropic's research-system pattern: lead plans + saves plan to memory, spawns 3–5 subagents with explicit objective/format/tools/boundaries, parallelize two levels, subagent output to filesystem/store passing references back, CitationAgent for provenance). Framework: **Claude Agent SDK** (subagents in fresh contexts, per-agent model/tools/mcpServers, `max_budget_usd` per run). Cost: multi-agent ~15× chat tokens — justified for open-ended research, not elsewhere.
- **Copilot → single agent + many tools** (conversational, shares context with the human; multi-agent here just adds telephone-loss). Claude Agent SDK or OpenAI Agents SDK (guardrails + tracing). It calls the Brain as a subagent/tool, not a peer.
- **Web3 Executor → LangGraph StateGraph (deterministic, checkpointed) inside a Temporal workflow** for durable "watch-and-act-over-days" semantics that survive crashes. Human-in-the-loop = Temporal Signals + durable timers (approval can pause for hours without losing state).
- **State flows between subsystems as typed, schema-validated records through an external store (Postgres + Redis + artifact store), never as shared conversation context.** Brain→Copilot: compact cited summary by reference. Copilot→Executor: a structured, validated, idempotent proposed-trade object — the *only* money-moving channel.
- **The central MCP pattern: read liberally, gate writes — physically.** Two server profiles: **finance-READ** (CoinGecko, ccxt-data, Financial Datasets, Alpaca read toolset) exposed to Brain + Copilot; **finance-EXECUTE** (Alpaca orders, Hummingbot, on-chain) exposed *only* to the gated Executor. Alpaca's `ALPACA_TOOLSETS` allowlist + `ALPACA_PAPER_TRADE=True` default is the template. The Claude Agent SDK lets you assign different `mcpServers` per subagent so the Brain *literally cannot* call a trade tool — a security boundary, not a prompt instruction.
- **Tool reliability for money:** idempotency keys + two-phase (`create_draft`→approve→`confirm`) + server-side bounds (per-tx/daily caps, allowlists, slippage) + bounded retries + DLQ. Never infinite-retry a side-effecting call. Good tool descriptions matter (Anthropic got a 40% task-time drop from rewriting one).
- **Context engineering:** compaction + external memory (Copilot), subagent isolation + just-in-time retrieval (Brain), deliberately tiny context with durable state in Temporal (Executor) to avoid context rot. Consider **Code-Mode MCP** (tools as code APIs in a sandbox — Anthropic reported 150K→2K tokens, and intermediate sensitive data never enters model context — privacy win for holdings).
- **Observability:** Langfuse (OTel, system-wide, self-hostable) + LangSmith on the LangGraph Executor. Evals: start ~20 queries, LLM-as-judge on a rubric, end-state evaluation for the Executor.

---

## 17. Alt-data alpha & proactivity (NEW)

**Part A — what actually has edge (skeptical, ranked).** The durable edge is the *system + look-ahead hygiene + continuous re-discovery*, not any feed — design for a **~12-month alpha half-life**. Three traps screen every claim: look-ahead (the LLM version is severe — anonymize entities + strictly PIT), alpha decay/crowding (~50% of published alpha dies post-publication; anything free on Crypto Twitter is near its half-life end), and retail-signal reflexivity.

1. **Funding/OI/liquidation crowding (crypto) — the cleanest real edge.** Mechanical, *contrarian* (fade the crowd, which is less crowded than the momentum read), grounded in measurable leverage. Funding >0.1%/8h = overheated; extremes precede sharp reversals.
2. **Attention/volume *deltas*** (Google Trends, social mention-count changes, narrative-share rotation) — as **regime/volatility features**, not directional triggers. Change-in-attention beats polarity (which everyone scores).
3. **Exchange/stablecoin flows + whale accumulation** — coincident-to-slightly-leading features; Nansen "smart money" is label-noisy (retroactive PnL labeling = built-in look-ahead) — a weak-moderate feature, useless as a literal copy-trade.
4. **Point-in-time, entity-anonymized news/earnings NLP** — interpretation edge (not the latency game you can't win), *only* with rigorous look-ahead controls; **FinBERT** as the clean frozen-weights baseline.

**Deprioritize/avoid:** MVRV-family (cycle context only — thresholds broke in 2025), StockTwits aggregate (47.6% next-day = sub-coin-flip), WSB-as-return-predictor (dead post-2021), options-flow/dark-pool "follow smart money" products (crowded retail, mostly misread), any LLM-sentiment backtest spanning the training window (assume contaminated), satellite/cards (institutional-only). **Architecture: a regime-aware feature ensemble** (every metric works in some regimes, fails in others), not standalone signals.

**Part B — proactivity design.** Governing rule: **default to silence, earn the right to interrupt, tier by consequence.** Never let the agent execute trades — surface, human acts. Three HITL patterns (LangChain): **Notify** (FYI), **Question** (need input), **Review** (approve before any action — mandatory for trades). Three urgency tiers: **T0** critical/interrupt (rare, action-window-limited — funding extreme on your crowded position, held name gapping, risk-limit breach); **T1** notable/batched (into next briefing or a midday digest); **T2** informational/pull (dashboard only). Use **dynamic z-score thresholds** (vs trailing distribution), not static ones, and a **critic layer** ("would a sharp trader actually care right now?") before anything reaches the user — every suppressed false positive protects the next real alert's credibility. Personalize to actual positions (an extreme funding event in an asset you don't hold is T2).

**Daily loop:** **morning briefing** (~07:00 local — the anchor ritual; overnight regime read, position/watchlist deltas, narratives, and an explicit "nothing actionable today" when true), **intraday** (silent by default, T0 interrupts only, optional midday T1 digest, hard cap ~2–3 interrupts/day unless declared high-vol), **end-of-day review** (what fired, did it play out — accountability builds trust), **weekly reflection** (signal-performance review since you must watch your own alpha decay; threshold adjustments delivered as Question/Review). Anti-spam: quiet hours, dedupe/cooldown, snooze-feedback raising a class's threshold, treat user attention as a depletable budget.

---

## 18. The assembled v3 architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│  External State / System of Record: Postgres + Redis + artifact store      │
│  (typed records flow between subsystems — never shared conversation context)│
└───────────▲────────────────────▲───────────────────────▲──────────────────┘
            │ cited summary       │ approved intent        │ receipts/status
   ┌────────┴───────┐   ┌─────────┴────────┐   ┌───────────┴────────────────┐
   │     BRAIN      │   │     COPILOT      │   │      WEB3 EXECUTOR          │
   │ Claude Agent   │◄──│ Claude/OpenAI    │──►│ LangGraph graph in Temporal │
   │ SDK orchestr.+ │tool│ Agent SDK,       │HITL│ (durable, signal-approved) │
   │ subagents      │   │ single agent     │gate│ bounded-autonomy policy     │
   │ (Opus lead,    │   │ +guardrails      │   │                              │
   │ Sonnet/Haiku)  │   │ Danelfin-style   │   │ Strategy: stablecoin lending │
   │ + FinMem mem   │   │ UI: briefing,    │   │ + delta-neutral funding carry│
   │ + drift/regime │   │ alerts, paper-   │   │ on Base/Solana via private   │
   │ + reflection   │   │ trade game, chat │   │ RPC; CDP/Turnkey session key │
   └───────┬────────┘   └────────┬─────────┘   └──────────┬───────────────────┘
           │ FAST LANE (local triage/sentiment, ~$0) + SLOW LANE (frontier, batched)
           ▼                     ▼                         ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ MCP layer (streamable-HTTP, OAuth-scoped):                                  │
│   finance-READ (CoinGecko, ccxt-data, Financial Datasets, Alpaca read)      │
│        → Brain + Copilot                                                    │
│   finance-EXECUTE (Alpaca orders, Hummingbot, on-chain) → Executor ONLY,    │
│        idempotent + two-phase + server-side bounds + Tenderly/Blockaid gate │
└──────────────────────────────────────────────────────────────────────────┘
  Data plane: PIT/tick (Norgate/Tardis) → Parquet+Zstd/ArcticDB → DuckDB;
  live websocket→Redpanda→Bytewax→QuestDB/Redis; same feature code batch+stream
  Observability: OpenTelemetry → Langfuse (all subsystems) + LangSmith (Executor)
  Eval harness: Alpaca paper live-shadow + decision journal + DSR/PBO gates
```

**Five invariants:** (1) trade tools physically unreachable from the Brain; (2) every money-moving call idempotent + two-phase + server-bounded + (above threshold) human-approved via durable signal; (3) state flows as typed records, never shared context; (4) `max_budget_usd` + loop/turn caps everywhere; (5) Executor context stays tiny, durable state in Temporal.

---

## 19. Phased build plan (v3 — refined)

**Phase 0 — Data + Brain skeleton (wk 1–3).** PIT data sources (Norgate + buy crypto tick), Parquet+Zstd/ArcticDB + DuckDB, the shared feature-computation library (batch+stream), purged/embargoed CV from day one. Brain skeleton on Claude Agent SDK + FinMem memory pattern + Notion MCP source-of-truth. finance-READ MCPs. Langfuse + `max_budget_usd`. Fast-lane local triage model.

**Phase 1 — Copilot v1 + eval harness (wk 4–6).** SnapTrade (read-only) + Coinbase view key. Nightly briefing (z-score anomalies → LLM narration, Danelfin-style score+drivers+horizon+bull/bear). Next.js + Lightweight Charts. **Crucially: stand up the Alpaca paper live-shadow + decision journal now** so every suggestion is scored from day one. Suggestions only, zero capital at risk. Proactivity: default-silent + morning briefing + critic layer.

**Phase 2 — Reasoning + quant + gamification (wk 7–10).** Fork TradingAgents, swap `dataflows/` toward your holdings + the alt-data ensemble (funding crowding, attention deltas, FinBERT). Quant layer (HRP, vol-target, ½-Kelly, CVaR, drawdown governor). Reflection loop writing to FinMem memory. Numerai-style paper-trading game. Run DSR/PBO/MinTRL gates; validate on post-cutoff data only.

**Phase 3 — Web3 custody & risk layer FIRST (wk 11–14).** Bounded authority before any real trade: cold Safe + working ERC-4337 account with on-chain caps/allowlists + CDP/Turnkey session keys + Tenderly+Blockaid fail-closed gate + kill switch. Executor as LangGraph-in-Temporal. Protocol-vetting checklist for the allowlist. Hummingbot paper-trade; stablecoin lending first.

**Phase 4 — Live Web3 micro-tranche (wk 15+).** $100–200 real on Base/Solana via private RPC: stablecoin lending, then delta-neutral funding carry in normal-funding windows. Measure net P&L after gas/fees/tax. Scale toward $1k only if net-positive and every loss understood.

**Ongoing:** walk-forward + DSR every change (count all trials), drift-triggered shadow retrains, weekly signal-decay review, dependency hash-locking + signer isolation, Koinly tax tracking from trade #1.

---

## 20. Open decisions (unchanged + sharpened)

1. **Host/runtime:** roll-your-own (Claude/OpenAI Agents SDK, max control) vs Zo (fastest) vs Hermes (privacy/local). For the fast-lane local models, a bought Mac Studio/DGX Spark pays off.
2. **Chain for Web3 v1:** Base (AgentKit-native, EVM tooling — my lean) vs Solana (cheapest, Jupiter/Jito).
3. **Funding-carry venue:** Hyperliquid (hourly, self-custody) vs Bybit unified (spot collateralizes short)?
4. **Copilot model:** local (FinBERT + small model, private holdings) vs frontier API (smarter)?
5. **Next deliverable:** a **buildable Phase 0–1 PRD** (data + Brain + Copilot v1 + eval harness) — fastest path to daily usefulness with zero capital at risk. Strongly recommended as the next step.

---

## 21. Sources (wave 3)

(v1/v2 sources in their files.)

**Data engineering:** Bitemporal modeling https://en.wikipedia.org/wiki/Bitemporal_modeling · ArcticDB https://github.com/man-group/ArcticDB · KX TSBS benchmark https://kx.com/blog/benchmarking-kdb-x-vs-questdb-clickhouse-timescaledb-and-influxdb-with-tsbs/ · QuestDB vs ClickHouse https://questdb.com/blog/clickhouse-vs-questdb-comparison/ · Tardis.dev https://tardis.dev/ · CoinAPI https://www.coinapi.io/ · Feature store comparison https://mlopsplatforms.com/posts/feature-store-comparison-2026/ · OFI microstructure (arXiv 2506.05764) https://arxiv.org/html/2506.05764v2 · Purged CV https://blog.quantinsti.com/cross-validation-embargo-purging-combinatorial/ · Compustat PIT https://www.oreilly.com/library/view/equity-valuation-and/9780470929919/chap12-sec33.html · Norgate https://norgatedata.com/accessibility.php

**LLM economics:** Anthropic pricing https://platform.claude.com/docs/en/about-claude/pricing · prompt caching https://platform.claude.com/docs/en/build-with-claude/prompt-caching · OpenAI pricing https://openai.com/api/pricing/ · Gemini pricing https://ai.google.dev/gemini-api/docs/pricing · DeepSeek pricing https://api-docs.deepseek.com/quick_start/pricing · FinLoRA (<$100 fine-tune) https://arxiv.org/abs/2505.19819 · Claude SDK cost control https://code.claude.com/docs/en/agent-sdk/cost-tracking · self-hosted costs https://www.sitepoint.com/local-llm-vs-cloud-api-cost-analysis-2026/

**Funding carry:** Hyperliquid funding https://hyperliquid.gitbook.io/hyperliquid-docs/trading/funding · CoinGlass https://www.coinglass.com/FundingRate · aoki-h-jp https://github.com/aoki-h-jp/funding-rate-arbitrage · ynhy513 https://github.com/ynhy513/funding-rate-arbitrage · Hyperliquid SDK https://github.com/hyperliquid-dex/hyperliquid-python-sdk · Hummingbot spot-perp arb https://hummingbot.org/strategies/v1-strategies/spot-perpetual-arbitrage/ · Oct 2025 crash https://www.coingecko.com/learn/october-10-crypto-crash-explained · IRC §1259 https://www.law.cornell.edu/uscode/text/26/1259

**On-chain security:** Anthropic SCONE-bench https://red.anthropic.com/2025/smart-contracts/ · AI Agents in Cryptoland (IACR) https://eprint.iacr.org/2025/526.pdf · Permit2 https://revoke.cash/learn/approvals/what-is-permit2 · Safe + Tenderly/Blockaid https://help.safe.global/en/articles/259531-safe-wallet-security-with-tenderly-blockaid · Blockaid bypasses https://www.blockaid.io/blog/bypasses-how-attackers-evade-transaction-simulation · SEAL multisig https://frameworks.securityalliance.org/wallet-security/secure-multisig-best-practices/ · ERC-4337 session keys https://docs.erc4337.io/smart-accounts/session-keys-and-delegation.html · npm Sept 2025 attack https://www.sygnia.co/threat-reports-and-advisories/npm-supply-chain-attack-september-2025/ · address poisoning (CMU) https://cylab.cmu.edu/news/2026/01/07-blockchain-address-poisoning.html · Balancer hack https://blog.trailofbits.com/2025/11/07/balancer-hack-analysis-and-guidance-for-the-defi-ecosystem/

**UI/UX & competitors:** Composer "Trade with AI" https://www.businesswire.com/news/home/20251021050436/en/ · Magnifi review https://www.wallstreetzen.com/blog/magnifi-review/ · Numerai staking https://docs.numer.ai/numerai-tournament/staking · Danelfin https://danelfin.com/how-it-works · Public Alpha/Agents https://public.com/alpha · Delphia SEC action https://www.sec.gov/newsroom/press-releases/2024-36 · gamification harm (Toronto) https://www.investmentexecutive.com/news/research-and-markets/study-finds-gamified-apps-push-diy-traders-to-make-riskier-investments/ · FINRA 25-07 https://www.finra.org/rules-guidance/notices/25-07 · trust/uncertainty UX https://www.smashingmagazine.com/2025/09/psychology-trust-ai-guide-measuring-designing-user-confidence/ · TradingView Lightweight Charts https://github.com/tradingview/lightweight-charts

**Evaluation:** The Alpha Illusion (arXiv 2605.16895) https://arxiv.org/html/2605.16895 · Alpaca paper trading https://docs.alpaca.markets/us/docs/paper-trading · Deflated Sharpe https://www.davidhbailey.com/dhbpapers/deflated-sharpe.pdf · PBO https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2326253 · PSR/MinTRL https://portfoliooptimizer.io/blog/the-probabilistic-sharpe-ratio-hypothesis-testing-and-minimum-track-record-length-for-the-difference-of-sharpe-ratios/ · Harvey-Liu evaluating strategies https://www.stat.berkeley.edu/~aldous/157/Papers/harvey.pdf · quantstats https://github.com/ranaroussi/quantstats

**Orchestration/MCP:** Anthropic multi-agent research system https://www.anthropic.com/engineering/multi-agent-research-system · Building effective agents https://www.anthropic.com/research/building-effective-agents · Code execution with MCP https://www.anthropic.com/engineering/code-execution-with-mcp · context engineering https://howaiworks.ai/blog/anthropic-context-engineering-for-agents · Claude Agent SDK subagents https://platform.claude.com/docs/en/agent-sdk/subagents · Temporal for AI / HITL https://docs.temporal.io/ai-cookbook/human-in-the-loop-python · Alpaca MCP https://github.com/alpacahq/alpaca-mcp-server · Hummingbot MCP https://hummingbot.org/mcp/ · MCP transports https://modelcontextprotocol.io/specification/2025-03-26/basic/transports

**Commercial landscape:** AI agent token collapse https://crypto.news/ai-tokens-ai16z-virtual-plunge-profit-leaders-dump/ · AgentFi 101 https://lex.substack.com/p/agentfi-101-the-definitive-guide · Giza seed https://www.crunchbase.com/funding_round/giza-seed--2c13745e · Freqtrade https://github.com/freqtrade/freqtrade · DeFi vaults https://www.tokenmetrics.com/blog/top-yield-aggregators-vaults-2025 · Polymarket ecosystem https://defiprime.com/definitive-guide-to-the-polymarket-ecosystem

**Alt-data & proactivity:** Glasserman & Lin look-ahead (arXiv 2309.17322) https://arxiv.org/pdf/2309.17322 · AI-driven alpha decay (arXiv 2605.23905) https://arxiv.org/html/2605.23905 · Twitter informational role https://www.sciencedirect.com/science/article/abs/pii/S0378426620302314 · StockTwits efficiency https://www.sciencedirect.com/science/article/abs/pii/S0378426618302115 · funding as contrarian signal https://www.ainvest.com/news/btc-perpetual-futures-long-short-ratios-contrarian-indicator-crypto-traders-2509/ · Nansen smart money https://www.nansen.ai/post/top-smart-money-indicators-in-crypto-how-to-identify-and-track-whale-activity · LangChain ambient agents https://blog.langchain.com/introducing-ambient-agents/ · IBM alert fatigue https://www.ibm.com/think/insights/alert-fatigue-reduction-with-ai-agents

> **Source-quality note:** Repo internals read from actual GitHub trees; pricing/yields reflect a volatile mid-2026 environment — verify live before sizing. Performance claims from arXiv/vendor sources flagged throughout as unverified; load-bearing claims rest on peer-reviewed/large-sample work (Quantopian, Bailey–López de Prado, Moreira-Muir, Lopez-Lira & Tang, Glasserman-Lin, Alpha Illusion, IMF, Anthropic red-team) and primary docs (repos, IRS/FINRA/SEC, exchange + framework docs).
