# 05. Spec: Honest Execution Costs and Faster Execution

```yaml
agent_contract:
  spec: 05-execution-cost-and-speed
  goal: One quote-derived cost model feeding v3 ExecutionCost, paper fills, and the v2 edge gate; the 5bp requote rule; latency accounting.
  depends_on: 01 (structured rehearsals table)
  creates:
    - tests for every pure addition
  edits:
    - path: src/autopilot/v3/execution-cost.ts
      change: extend fetchExecutionCost(mint, notionalUsd) with reverse-quote spread estimation and rehearsal-derived slippage p95; keep conservativeCost()/memecoinConservativeCost() as fallbacks
    - path: src/autopilot/executor.ts
      change: PaperExecutorOptions gains fillFor?: (intent) => { price_usd: number; fee_usd: number } | null (same options pattern as feeRateForMint); flat model remains the fallback
    - path: src/autopilot/daemon.ts
      change: quote top-3 ranked candidates + open-position exits; requote-before-execute rule; fill_basis stamp on trades; t_* latency fields; edge gate uses per-mint modeled cost
    - path: src/autopilot/store.ts
      change: BotTradeRow optional fields fill_basis?, t_signal_ms?, t_decision_ms?, t_quote_ms?, t_fill_ms? (JSON doc rows, no migration)
  verify:
    - bun run typecheck
    - bun test tests
    - npm run privacy:audit
  done_when: fresh-quote paper fills use quoted effective price and route fee; requote fixture aborts with the exact reason string; daily latency summary row appears
```

Source: Schwertfeger, Vogt 2026. Their realized-vs-backtest gap decomposed into slippage, ordering uncertainty, partial fills, front-running, stale state, fixed fees, transfer costs, and reference-price drift; real cost stacks ran ~50-65bp per round trip; their bots cancel and requote when any reference price moves > 5bp; they priced from simulated pending state, not last-published state.

## Problem

1. Paper fills use flat per-side fees (`executor.ts`: `PAPER_FEE_RATE = 0.003` majors, `MEMECOIN_PAPER_FEE_RATE = 0.0125` off-universe) at the intent's reference price with zero slippage, and the v2 edge gate reasons against the derived 0.6% constant. The memecoin tier is at least research-based (the file cites 1.5-4% real round trips); the majors tier is a guess in both directions, and neither is per-mint.
2. `v3/execution-cost.ts` already has the right skeleton: `fetchExecutionCost(mint, notionalUsd)` builds an `ExecutionCost` from a live Jupiter quote's price impact plus constants (`DEX_FEE_BPS = 25`, `BASE_SPREAD_BPS = 5`, `PRIORITY_FEE_BPS = 3`, `FAILED_TX_BPS = 4`). What is missing: measured spread (reverse quote) and measured slippage (rehearsal history) instead of constants.
3. Spec 01's structured `rehearsals` table now accumulates real route-vs-paper gaps; nothing consumes them yet.
4. Decision-to-execution latency is unmeasured; no requote discipline exists.

## Solution

Make the quote the price. Extend the existing cost model with two measured components, fill paper trades at quoted prices, requote when stale, and measure latency before optimizing anything.

## Architecture

### A. Extend the cost model (`v3/execution-cost.ts`)

For a candidate (mint, side, notional):

1. Keep the existing quote fetch and `impactFromQuoteBody` for `price_impact_bps`; dex fee from the route when present, else `DEX_FEE_BPS`.
2. `spread_bps` (new): reverse-quote round trip. Quote buy (USDC -> token) and sell (token -> USDC of the buy's expected out-amount); `spread_bps = max(0, (1 - usdc_out/usdc_in) * 10_000 - fees_and_impact_both_legs)`. Cache per mint 5 minutes. Verification step before trusting it: Jupiter's `priceImpactPct` may already include pool fees on some routes; check three known routes and adjust the subtraction so components are not double-counted.
3. `slippage_bps` (new): p95 of `live_cost_vs_paper_pct` from the Spec 01 `rehearsals` table for the mint (>= 10 samples, `status === "quoted"`), else tier fallback (majors 20bp, tier B 60bp). Pure helper lives in `rehearsal-stats.ts`.
4. `priority_fee_bps`: keep the constant in paper mode (microscopic at $25 clips); live mode later reads `getRecentPrioritizationFees` p75. Keep it a field, not a hardcode inside total.
5. `total_bps` = sum. Persist the full breakdown into candidate features (snapshots already store features) so calibration can regress predicted vs realized cost.

Budget: quote only the top-3 router-ranked candidates plus open-position exits; everything else uses `conservativeCost()` / `memecoinConservativeCost()` exactly as today. Respect the existing 429 backoff machinery.

### B. Paper fills at quoted prices (`executor.ts` + daemon)

Extend `PaperExecutorOptions` (options-object pattern already established by `feeRateForMint`):

```typescript
export type PaperExecutorOptions = {
  feeRateForMint?: (mint: string) => number;
  /** When set and returning non-null, the fill uses the modeled price/fee
   *  (from a fresh Jupiter quote, < 30s old). Null falls back to flat. */
  fillFor?: (intent: TradeIntent) => { price_usd: number; fee_usd: number } | null;
};
```

Daemon supplies `fillFor` backed by the decision-time quote when fresh; stamp `fill_basis: "quoted" | "flat_fallback"` on the trade row (optional field, JSON doc rows, no migration). `rehearseFill` then verifies the model instead of being the only measurement: alert via throttled activity row when a mint's rolling median rehearsal gap exceeds 25bp (model drift).

v2 edge gate: per-mint modeled `total_bps * min_edge_over_cost` when available, else Spec 01's rehearsal median, else the flat constant. Stamp `cost_source` in signals (extends Spec 01's field: `"modeled" | "measured" | "flat"`). Expected effect: majors loosen, thin names tighten. Both are corrections.

Ledger integrity: cash stays ledger-derived (`derivePaperCash`, `daemon.ts:366`); quoted fills change price/fee inputs, never the accounting identity.

### C. Requote discipline (the 5bp rule)

Record `quote_price` and `quote_ts` at intent build. Immediately before `executor.execute`: if |current price - quote_price| > 5bp or quote age > 20s, refresh the quote once and rebuild the intent numbers; if refreshed EV (v3) or edge (v2) no longer clears its gate, abort with a `blocked` decision, reason "requote: edge gone". Never execute against a stale price you would not choose now. "Current" = the Jupiter quote (the executable venue), not DexScreener (display data).

### D. Latency accounting (measure before optimizing)

Optional trade-row fields `t_signal_ms, t_decision_ms, t_quote_ms, t_fill_ms` (tick start / decision / quote / fill timestamps). One activity summary per day: p50/p95 decision-to-fill. Only after two weeks decide whether the 20s tick or the quote path deserves optimization. Do not shorten `TICK_MS` preemptively: the lite price endpoint already 429s (`PRICE_BACKOFF_MS = 90_000` exists because of it), and Spec 02's event-driven entries reduce dependence on tick frequency.

### E. Live-lane notes (deferred, documented)

If the go-live gate ever passes: dynamic priority fee at p75 with a hard SOL cap per tx; Jito bundles only if measured failed-tx rate > 5%; `LIVE_SLIPPAGE_BPS = 50` and `MAX_PRICE_IMPACT_PCT = 1.0` stay. No code now.

## Constraints

- Quote budget as specified; no per-tick quoting of the whole universe.
- No change to live executor guards.
- All fallback paths preserve current behavior exactly (regression tests).

## Implementation checklist (ordered)

1. `rehearsal-stats` p95 helper (if not from Spec 01) + tests.
2. Cost model extensions + tests (fixture quotes -> exact component math; double-count verification documented in a test comment with the three routes checked).
3. `fillFor` option + tests (property: fresh quote -> fill price equals quoted effective price and fee equals route fee, never flat; null -> flat, `fill_basis` stamped).
4. Requote rule + tests (5bp boundary, 20s age boundary, edge-gone abort with exact reason).
5. Edge gate cost source chain + regression test (no data -> identical to today).
6. Latency fields + daily summary.
7. Verify commands.

## Open questions

1. Whether reverse-quote spread should be measured at the intent notional or a standard $200 clip: use intent notional (it is the executable question), fall back to $200 for the cached scout use (Spec 06).
