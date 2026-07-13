# 02. Spec: CUSUM Event Engine (`cusum_tb`)

```yaml
agent_contract:
  spec: 02-cusum-event-engine
  goal: Event-driven entries (CUSUM filter) with symmetric triple-barrier exits, as a shadow-first v3 strategy module.
  creates:
    - src/autopilot/v3/cusum.ts          # pure filter + threshold math
    - src/autopilot/v3/cusum-tb.ts       # pure candidate builder
    - tests for both + exit-engine regression tests
  edits:
    - path: src/autopilot/v3/signal.ts
      change: add "cusum_tb" to the StrategyId union (line ~11)
    - path: src/autopilot/store.ts
      change: add optional fields tp_pct?, deadline_ts? to BotPositionRow (JSON doc rows; no SQL migration). Add per-strategy promotion state (see wiring step 7)
    - path: src/autopilot/intent.ts
      change: optional tp_pct?, deadline_ts? passthrough on TradeIntent
    - path: src/autopilot/daemon.ts
      change: per-mint CusumState in TickContext; feed cusumStep each tick; pass events into ShadowInput; exit engine honors tp_pct/deadline_ts; upsertPosition (~line 985) threads the new fields
    - path: src/autopilot/v3/shadow.ts
      change: extend ShadowInput with cusumEvents; call cusumTbCandidate; add "cusum_tb" to enabledModulesFor (risk_on, chop); event candidates bypass the 5-min shadow throttle
    - path: src/autopilot/v3/calibration.ts
      change: calibrate() callers pre-filter snapshots by strategy_id (see wiring step 7)
  verify:
    - bun run typecheck
    - bun test tests
    - npm run privacy:audit
  done_when: synthetic drift fixture produces exactly one cusum_tb candidate in the candidate store; exit engine regression tests pass for legacy positions; event counts in replay land in 0.5-5/day per mint
```

Source: Gradzki, Wojcik, Lessmann 2025, Financial Innovation 11:136. CUSUM sampling (h=2%) + triple-barrier labels (+-5%, 24-bar vertical) + classifier: ETH +91.6%/yr net of 0.1%/side fees, Sharpe 1.42 (up to 2.0 in the (2.5%, 5-6%) grid), 58.1% profitable trades, max DD 25.1%, vs buy-and-hold -44% over the same 5 quarters. BTC marginal (+20.4%, Sharpe 0.51). Dollar bars and next-bar labeling lost money. Parameters are asset-specific (MATIC works at (2.5%, 6%); LINK needs (5%, 8%)).

The edge decomposes: CUSUM events are "when to look", barriers are the risk management, the ML classifier adds ~53% directional accuracy on top. This spec ships the rule-based decomposition (direction = sign of breaching drift). Spec 07 adds the classifier later. The paper did not test the rule-based baseline; its expectancy is unknown until shadow data says otherwise. That is what the shadow lane is for.

## Problem

v2 samples time (20s ticks, fixed windows) and waits for arbitrary moments. Information-driven sampling trades when cumulative drift says something happened; events fire precisely in the volatile episodes where the paper's profits concentrated.

## Solution

1. Per tradable mint, run a symmetric CUSUM filter over the 20s tick closes already held in `windows` (warm-start `last_price` from the newest `store.priceHistory()` row on boot).
2. Up-breach (S+ >= h): emit a `buy` `CandidateSignal`. Down-breach: emit `sell` only if the mint is held (spot cannot short; Spec 06 adds the Drift short lane in shadow).
3. Positions opened from cusum_tb candidates carry symmetric triple-barrier exits: TP = SL = `barrier_mult x h`, plus an unconditional deadline.
4. Shadow-first through the existing router, EV gate, candidate store, and promotion machinery.

## Architecture

### CUSUM filter (pure, `src/autopilot/v3/cusum.ts`)

```typescript
export type CusumState = {
  s_pos: number;      // running positive sum of log returns, floored at 0
  s_neg: number;      // running negative sum, capped at 0
  last_price: number;
  events: number;     // lifetime count (diagnostics)
};

export type CusumEvent = { direction: "up" | "down"; magnitude: number; ts_ms: number };

/** Feed one price sample. Returns an event iff a threshold breached.
 *  h_pct in percent (2.0 = 2%). Resets both sums on breach (Gradzki Eqs. 10-12).
 *  Pure: caller owns the state object. */
export function cusumStep(state: CusumState, price: number, h_pct: number, ts_ms: number): CusumEvent | null {
  if (!(price > 0) || !(state.last_price > 0)) { state.last_price = price; return null; }
  const r = Math.log(price / state.last_price);
  state.last_price = price;
  state.s_pos = Math.max(0, state.s_pos + r);
  state.s_neg = Math.min(0, state.s_neg + r);
  const h = h_pct / 100;
  if (state.s_pos >= h) {
    const magnitude = state.s_pos;
    state.s_pos = 0; state.s_neg = 0; state.events += 1;
    return { direction: "up", magnitude, ts_ms };
  }
  if (state.s_neg <= -h) {
    const magnitude = -state.s_neg;
    state.s_pos = 0; state.s_neg = 0; state.events += 1;
    return { direction: "down", magnitude, ts_ms };
  }
  return null;
}
```

Property that must survive review: a +1% then -2% sequence breaches h=2% even though no single close-to-close move did. Do not simplify to a price-vs-last-event-price check (that is a range bar, which the paper found strictly worse).

### Threshold h per mint (same file)

The paper used static h, found 2-2.5% optimal for ETH-class vol and ~5% for high-vol alts, and showed parameters are asset-specific (Table 7). Make h volatility-anchored so it self-adapts across tiers:

```typescript
/** sigma_daily_pct: EWMA std of 5-min log returns from store.priceHistory(),
 *  scaled to daily (x sqrt(288)). Recompute at most hourly per mint. */
export function cusumThresholdPct(sigma_daily_pct: number | null): number {
  if (sigma_daily_pct === null || !Number.isFinite(sigma_daily_pct)) return 2.5;
  return clamp(1.5, 5.0, 0.5 * sigma_daily_pct);
}
```

SOL-class daily vol ~3-5% gives h in [1.5, 2.5] (the paper's ETH optimum); memecoin vol ~8-12% gives h in [4, 5] (the LINK finding). The 0.5 multiplier and clamps get tuned in Spec 08's replay harness, nowhere else.

### Barriers

- TP = SL = `barrier_mult x h`, `barrier_mult = 2.2` (paper sweet spot: barrier 2-2.4x the threshold; below 2x collapses toward next-bar labeling, which loses money).
- Vertical barrier: deadline = entry + 24h wall clock, exit at market unconditionally (v2's time stop is trend-conditional and cannot be reused).
- `PARAM_CLAMPS` bounds params, not per-position stops; `BotPositionRow.stop_pct` accepts values above `max_stop_pct` directly.

### Position exit support (store + daemon changes)

The v2 exit engine (`daemon.ts:187-213`) computes TP as `stop_pct x params.take_profit_r` (asymmetric, R=2). cusum_tb needs symmetric barriers and an unconditional deadline:

1. `BotPositionRow` (`store.ts:118`) gains optional `tp_pct?: number` and `deadline_ts?: string`. Positions are JSON doc rows (`insertRow` id/ts/data), so this is a type change plus the `upsertPosition` call sites; no SQL migration. Legacy rows load with both fields undefined.
2. Exit engine: if `position.tp_pct` is set, `targetPrice = entry * (1 + position.tp_pct / 100)` instead of the R-multiple; if `position.deadline_ts` is set and now >= deadline, exit at market with reason "Vertical barrier: deadline reached." (checked before the trend-conditional time stop, which remains for positions without a deadline).
3. `TradeIntent` (`intent.ts`) gains optional `tp_pct`, `deadline_ts`; the daemon's buy handler (`daemon.ts:985` `upsertPosition`) stamps them onto the position. v2 intents leave them undefined; nothing changes for existing behavior.

### Candidate construction (pure, `src/autopilot/v3/cusum-tb.ts`)

Template: `xsecCandidate` (`v3/xsec.ts:73`).

```typescript
export type CusumTbInput = {
  symbol: string; mint: string; price_usd: number;
  event: CusumEvent;
  h_pct: number;
  held: boolean;
  h1_pct: number | null;          // MarketFeedRow.change_h1_pct
  h24_pct: number | null;
  liquidity_usd: number | null;
  volume_h24_usd: number | null;
  edge_ratio: number;             // calibrated; initial 0.15
};

export function cusumTbCandidate(input: CusumTbInput, cost: ExecutionCost): CandidateSignal | null;
```

Rules:

- down + not held -> null. down + held -> side "sell", reason "CUSUM down-breach exit".
- up: side "buy" iff `h1_pct >= -1.0` AND `h24_pct` in [-5, 40]. Otherwise null (no buying breaches inside a collapsing day or a blow-off; regime lesson from the paper's Fig. 13 plus Stoikov's GALA failure).
- `barrier_bps = barrier_mult * h_pct * 100`.
- `expected_return_bps = edge_ratio * barrier_bps` (paper: 58% wins on symmetric barriers implies expectancy ~0.16 x barrier; 0.15 starts conservative).
- `expected_value_bps = toExpectedValue(expected_return_bps, cost)` (`v3/signal.ts:59`).
- `confidence`: 0.62 when `h1_pct >= 0 && h24_pct >= 0`, else 0.55. The EV gate's `MIN_CONFIDENCE = 0.6` then vetoes misaligned events, but they still land in the candidate store as skips and get forward-labeled, so calibration learns whether the filter is too strict.
- `max_loss_bps = barrier_bps`; `horizon_sec = 86_400`.
- `features`: `{ h_pct, magnitude, direction, h1_pct, h24_pct, sigma_daily_pct, edge_ratio }`.

### Calibration of `edge_ratio`

Weekly, alongside the Analyst: from labeled `candidate_snapshots` filtered to `strategy_id === "cusum_tb"`, compute realized mean `return_2h_bps` vs `barrier_bps` over would-enters. New `edge_ratio = clamp(0.05, 0.30, realized_mean_return_bps / mean_barrier_bps)`, requiring >= 40 labeled rows; otherwise keep prior. Persist with a dated `web3_memory` note. If events carry no follow-through, EV collapses below the gate and the module goes quiet on its own.

### Daemon wiring (ordered)

1. `StrategyId` union (`v3/signal.ts:11`): add `"cusum_tb"`.
2. `TickContext`: `cusumStates: Map<string, CusumState>`; feed every tick's price per tradable mint; warm-start `last_price` from the newest `priceHistory` row on boot.
3. On event, stash into a per-tick map and extend `ShadowInput` (`v3/shadow.ts`) with `cusumEvents?: Map<string, CusumEvent & { h_pct: number }>`; `evaluateV3Shadow` calls `cusumTbCandidate` with the shell-provided `costByMint` entry.
4. `enabledModulesFor`: add `"cusum_tb"` for `risk_on` and `chop` (long-only module; not `risk_off` until the Spec 06 short lane exists).
5. Throttle bypass: events are sparse (target 0.5-3/mint/day) and must not wait for the 5-minute shadow throttle. Run shadow evaluation in the same tick as any event, reusing already-fetched prices and cached costs; non-event shadow work keeps the throttle.
6. Promotion to paper co-pilot uses the existing gate thresholds, BUT the current promotion state is a single global flag (`store.v3Promotion()`, fed by `calibrate(store.candidateSnapshots(2000))` over ALL strategies pooled, `daemon.ts:835`). Make it per-strategy: filter snapshots by `strategy_id` before `calibrate()` (the row carries `strategy_id`, `candidate-store.ts:28`), and store promotion state keyed by strategy (`v3_promotion_by_strategy` JSON doc rows, same pattern as bot_state). The co-pilot entry path then checks the flag for the candidate's own `strategy_id`. Without this, cusum_tb's promotion would ride on xsec's polluted history.
7. When promoted, intents carry `strategy: "v3-alpha-router"` (existing union), `stop_pct = tp_pct = barrier_mult * h_pct`, `deadline_ts = entry + 24h`.

## Constraints

- Spot-only, long-only. Down-breaches are exits (and later Drift shorts), never spot sells of unheld tokens.
- No new API calls: consumes prices, feed rows, and costs the shell already fetches.
- All new logic pure and unit-tested; impure surface is limited to the ShadowInput fields, TickContext state, and position stamping.
- Do not change `PARAM_CLAMPS`, caps, or exit behavior for positions without the new fields.

## Implementation checklist (ordered)

1. `cusum.ts` + tests: accumulation property (+1%/-2% at h=2% triggers), reset-on-breach, threshold clamps, non-finite price handling.
2. `signal.ts` union + `cusum-tb.ts` + tests: every rule above, EV math exact, feature completeness.
3. Store: `tp_pct`/`deadline_ts` on `BotPositionRow`; per-strategy promotion state methods + tests.
4. Intent passthrough + daemon stamping; exit engine changes + regression tests (legacy rows byte-identical behavior; deadline exit fires against positive trend; tp_pct overrides R-multiple).
5. Shadow wiring (ShadowInput, enabledModulesFor, throttle bypass) + integration test: synthetic 2.5% drift series -> exactly one cusum_tb candidate snapshotted with features.
6. Per-strategy calibration filter at all `calibrate()` call sites; co-pilot path reads per-strategy flag.
7. Replay sanity (Spec 08, or minimal now): event counts per mint over 7 days of stored history in [0.5, 5]/day; if outside, adjust the h multiplier BEFORE promotion.
8. Verify commands.

## Open questions

1. 20s ticks are finer than the paper's 1-min closes, making CUSUM slightly more trigger-happy at equal h. If replay shows too many events, step to 1-min closes (every third tick). Decide from replay data.
2. Should down-events tighten stops on held positions (ratchet) instead of hard-exiting? Exit is simpler; revisit with data.
3. `barrier_mult` 2.0/2.2/2.4: Spec 08 grid, frozen before evaluation.
