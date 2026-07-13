# 06. Spec: Cross-Venue Gap Scout and Perps Short Lane

```yaml
agent_contract:
  spec: 06-cross-venue-and-perps
  goal: Measure whether DEX-CEX edge exists at our size (no accounts, no orders), and express cusum_tb down-breaches as shadow Drift shorts.
  depends_on: 05 (cost model), 02 (cusum_tb)
  creates:
    - src/autopilot/v3/cex-gap.ts        # pure gap math + weekly evidence summary
    - shell fetchers for Coinbase Exchange + Kraken public tickers
    - tests
  edits:
    - path: src/autopilot/store.ts
      change: cex_gap_observations table (JSON doc rows, cap ~20k) + venue listing cache
    - path: src/autopilot/daemon.ts
      change: fire-and-forget scout every 5 min for listed symbols (never awaited in the hot path); weekly summary into the Analyst memo
    - path: src/autopilot/v3/cusum-tb.ts
      change: down-breach on a mint present in PERP_MARKET_BY_MINT emits a shadow sell candidate with features.venue="drift_perp", cost including Drift taker fee + funding over horizon
    - path: src/autopilot/v3/promotion.ts (call site)
      change: per-strategy promotion (Spec 02) excludes candidates with features.venue === "drift_perp" from paper co-pilot until a Drift paper adapter exists
  verify:
    - bun run typecheck
    - bun test tests
    - npm run privacy:audit
  done_when: observation rows accumulate for listed symbols; weekly summary renders; drift short candidates land in snapshots and are excluded from co-pilot
```

Source: Schwertfeger, Vogt 2026. Relevant findings: (a) aggregator routing keeps intra-Solana pools aligned, so pool-vs-pool arb (the existing `quote_arb` StrategyId idea) is a dead end; do not build it; (b) realized edges lived in DEX-CEX gaps (23-162bp realized spreads) on pairs where the DEX side was NOT aggregator-routed; (c) opportunities cluster and persist within episodes, so streak length matters more than averages; (d) their SEI system (closest Solana analog: sub-second blocks, sub-cent fees) needed a 75bp quoted spread against a ~50bp cost stack and took 22% small-loss trades; (e) minimum viable spread is a formula: quote only when spread > f_CEX_limit + f_CEX_market + f_DEX + s_CEX + s_DEX, with net profit after fixed fees and drift.

Operator constraint: US-based; no KuCoin/Binance. This spec requires NO accounts; Coinbase Exchange and Kraken public market data are keyless.

## Problem

The bot has no evidence about whether cross-venue edge exists for its universe at its size. CEX execution, inventory management, and passive quoting are a large build that should be bought with data, not optimism (the other article's actual lesson: a thousand Polymarket bots died skipping this step). Separately, every module in this pack is long-only in spot, which halves cusum_tb's expressible edge (the paper's results were long/short).

## Solution

1. `cex_gap` scout: measurement-only job (NOT a router module; it emits no candidates and does not touch `StrategyId`). Continuously price the gap between Jupiter executable prices and Coinbase/Kraken books; apply the full fee-aware formula; accumulate evidence; weekly verdict. Only a sustained yes buys the next step (a Kraken account and passive-quote replication of the paper's design).
2. Drift short lane (shadow): cusum_tb down-breaches on perp-listed mints become EV-gated, snapshotted, forward-labeled `sell` candidates with `features.venue = "drift_perp"`, never executed. Doubles cusum_tb's labeled dataset at near-zero cost and answers whether the short half of the edge exists before any Drift execution work. Reuses `fetchDriftFunding` / `PERP_MARKET_BY_MINT` (`v3/perps.ts`) and the carry-book pattern if synthetic P&L is wanted sooner.

## Architecture

### A. `cex_gap` scout

Listing probe (daily): `GET https://api.exchange.coinbase.com/products/{SYM}-USD/ticker` (404 = unlisted); Kraken `/0/public/Ticker?pair=...`. Cache the listing map in the store. Expect SOL, JUP, BONK, WIF, JTO, PYTH, RAY on at least one venue; the probe is the truth, not this list. Tier B tokens (Spec 04) enter automatically when listed.

Every 5 minutes per listed symbol (fire-and-forget, like the Analyst; never awaited in the tick):

1. Jupiter side: effective buy and sell price for a $200 clip from the Spec 05 cost model (quote-derived, cached).
2. CEX side: best bid/ask from the public ticker. Top-of-book only in v1; at $200 that is sufficient and understating depth is conservative.
3. Both directions in bps: `gap_buy_dex_sell_cex = (cex_bid - jup_buy_eff) / jup_buy_eff * 10_000`, and the mirror.
4. `net_bps = gap_bps - (cex_taker_fee_bps + jup_total_cost_bps + transfer_amortization_bps + drift_allowance_bps)`.
   - `cex_taker_fee_bps`: config per venue, set from the venue's CURRENT published base-tier schedule at implementation time (do not trust numbers baked into any doc, including this one); store with a `verified_on` date.
   - `transfer_amortization_bps = 5` (withdrawals are not free; amortized over an assumed 20-trade cycle; parameter).
   - `drift_allowance_bps = 5` (the paper's requote threshold; a taker leg cannot requote, so budget it).
5. Persist `{ts, symbol, venue, direction, gap_bps, net_bps, jup_cost_bps, cex_mid, jup_eff}`.

Weekly evidence summary (pure, into the Analyst memo): per symbol-venue: count and share of `net_bps > 0` observations, p95 net, longest positive streak. Graduation rule, frozen now: consider CEX execution only if some symbol shows net_bps > 25 in >= 2% of observations across >= 3 consecutive weeks. Otherwise the scout drops to monthly cadence and archives.

If graduation ever triggers, the follow-on spec (not written) covers: Kraken account scoping, maker-side quoting per the paper (limit order on the CEX leg, Jupiter hedge on fill), inventory bands, and the autorebalancing trade-off (their 22% small-loss trades were the price of avoiding transfer fees).

### B. Drift short lane (shadow)

- `cusumTbCandidate` down-breach path: when `!held` and the mint has a Drift market (`PERP_MARKET_BY_MINT`), emit side `"sell"` with `features.venue = "drift_perp"` instead of null. Cost: Drift taker fee in `dex_fee_bps` (keep the `ExecutionCost` shape) plus expected funding drag/credit over `horizon_sec` from the already-fetched `fundingByMint`.
- Barriers symmetric per Spec 02. Candidates are EV-gated, snapshotted, forward-labeled like all others.
- Excluded from paper co-pilot promotion (filter `features.venue !== "drift_perp"` at the per-strategy promotion check) until a Drift paper-execution adapter exists. Live Drift execution stays deferred (BACKLOG already says so).

### C. Maker lane (appendix, no work now)

If a CLOB lane opens (Kraken via graduation, or Phoenix on Solana), start from the Stoikov calibrations: total spread ~4-5x recent volatility (their cross-30-coin Optuna fit, high R^2), 2 quote levels, refresh 3-5 min, stop-loss cooldown 8-9 min, triple-barrier on every fill's inventory, BP (Spec 03) as the reference-price skew in place of MACD, and a one-sided quoting suspension in strong trends (their GALA adverse-selection failure).

## Constraints

- No accounts, no keys, no order placement anywhere in this spec.
- Public rate limits: 5-min cadence for <= 10 symbols is far under both venues' public limits; still batch Kraken pairs into one Ticker call.
- The scout must never delay or fail a tick.

## Implementation checklist (ordered)

1. `cex-gap.ts` pure math + tests (fixture books both directions, net stack assembly, streak computation, graduation boundaries).
2. Store table + listing cache + tests.
3. Shell fetchers with timeout/error discipline (a 404 removes the symbol from the map without error spam) + integration test on fixtures.
4. Daemon wiring (throttled, fire-and-forget) + weekly summary into Analyst memo.
5. cusum-tb down-breach venue path + tests (fixture emits sell candidate with funding-adjusted cost; co-pilot exclusion asserted).
6. Verify commands.

## Open questions

1. Kraken lists USD and USDT quotes with different depth; scout whichever the probe finds, record the pair used per observation.
2. Whether BONK/WIF tick sizes on CEXs distort top-of-book gaps at $200: record `cex_mid` and inspect in the first weekly summary before adding depth fetching.
