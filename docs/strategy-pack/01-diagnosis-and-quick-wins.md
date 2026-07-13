# 01. Diagnosis and Quick Wins

```yaml
agent_contract:
  spec: 01-diagnosis-and-quick-wins
  goal: Raise the bot's decision sample rate and ground its cost assumption in measured data. No new strategy logic.
  creates:
    - src/autopilot/rehearsal-stats.ts       # pure median/percentile helpers over structured rehearsal rows
    - tests for both changes
  edits:
    - path: src/autopilot/store.ts
      change: new RehearsalRow type + rehearsals table (JSON doc rows, rolling cap 2000) + appendRehearsal/rehearsals methods, following the web3_memory pattern
    - path: src/autopilot/daemon.ts
      change: in the rehearseFill callback (~line 977-981), ALSO call store.appendRehearsal with the structured SwapRehearsal fields; edge gate (~line 314) reads measured cost when >= 10 samples exist for the mint
    - path: src/autopilot/v3/shadow.ts
      change: remove "xsec" from enabledModulesFor (keep module + tests)
  operator_action_not_code:
    - Apply the parameter changeset below via store.applyParamChangeset or the dashboard
  verify:
    - bun run typecheck
    - bun test tests
    - npm run privacy:audit
  done_when: changeset visible in param_changelog; rehearsal rows accumulate structured; edge gate logs which cost source it used; no xsec candidates in any regime
```

## Problem

The bot generates almost no trades, so the Analyst learning loop, attribution, and the v3 candidate store are starved. Every downstream improvement needs sample size first.

Evidence (verified against source 2026-07-12):

- `src/autopilot/daemon.ts:176` `decide()`, entries at `:251-321`: entry requires, in one tick, ALL of: 24h trend in [2.5%, 25%], 1h trend >= 0%, 13-min move in [-1.2%, +0.6%], 24h volume >= $500k, liquidity >= $250k, and target >= 3x an assumed 0.6% round-trip cost.
- `src/autopilot/params.ts` `DEFAULT_STRATEGY_PARAMS`: `max_trades_per_day: 3`, `cooldown_ms: 2h`, `entry_spacing_ms: 20m`, one entry per tick, 9 symbols.
- `src/autopilot/daemon.ts:68`: `ROUND_TRIP_COST_PCT = PAPER_FEE_RATE * 2 * 100 = 0.6%` flat.
- Rehearsal data exists but is unusable for math: `rehearseFill` results land only as free-text summaries in `web3_memory` (`daemon.ts:977-981` via `describeRehearsal`, 400-char cap). The measured `live_cost_vs_paper_pct` number is never stored structured. This spec fixes that first; Spec 05 builds on it.
- `docs/BACKLOG.md`: xsec, the only v3 scoring module, is inverted.

## Solution

### A. Parameter changeset (operator action, no code)

Apply as ONE `applyParamChangeset` call (atomic for the Analyst's auto-revert). All values inside `PARAM_CLAMPS`:

| Param | Current | New |
|---|---|---|
| `entry_min_h24_pct` | 2.5 | 1.5 |
| `entry_pullback_min_pct` | -1.2 | -2.0 |
| `entry_pullback_max_pct` | 0.6 | 1.0 |
| `min_edge_over_cost` | 3.0 | 2.0 |
| `max_trades_per_day` | 3 | 6 |
| `cooldown_ms` | 7_200_000 | 2_700_000 |
| `entry_spacing_ms` | 1_200_000 | 600_000 |

Reason string: "Paper-mode sample-rate increase per strategy-pack 01. Revert if 5-day expectancy degrades vs prior window."

This is NOT a claim that v2 becomes profitable. A paper bot trading 4-6x/day teaches you something; one trading 2x/week teaches nothing. Risk caps (`DEFAULT_AUTOPILOT_CAPS`: max_trade_usd 25, daily loss 50, drawdown halt 20%) are untouched.

### B. Structured rehearsal rows (prerequisite for all cost work)

1. `store.ts`: add
```typescript
export type RehearsalRow = {
  id: string; ts: string;
  mint: string; symbol: string; side: "buy" | "sell";
  notional_usd: number;
  live_cost_vs_paper_pct: number | null;   // signed; positive = live route worse than paper fill
  price_impact_pct: number | null;
  status: "quoted" | "no-route" | "error";
};
```
with `appendRehearsal` / `rehearsals(limit)` methods and a rolling cap of 2000, copying the `web3_memory` pattern (rows are JSON docs via `insertRow`; no SQL migration needed).
2. `daemon.ts` rehearseFill callback: keep the existing web3_memory summary line, add `store.appendRehearsal({...rehearsal fields, mint: intent.mint})`. `SwapRehearsal` (`rehearsal.ts:37-50`) already carries every field except mint.
3. `rehearsal-stats.ts` (pure): `medianRoundTripCostPct(rows, mint, minSamples=10): number | null` and `p95CostPct(...)`. Median over the last 50 rows for the mint where `status === "quoted"`.

### C. Edge gate reads measured cost

In `decide()`'s edge gate (`daemon.ts:314`), replace the flat constant with: measured median (via a value computed in the shell and passed through `DecisionInput`, keeping `decide()` pure) when >= 10 samples exist for that mint, else the existing `ROUND_TRIP_COST_PCT`. Record `cost_source: "measured" | "flat"` and the value in the decision's signals snapshot.

### D. Retire xsec from ranking

`v3/shadow.ts` `enabledModulesFor`: remove the `"xsec"` add for `risk_on`. Keep the module, tests, and calibration path; BACKLOG's refit plan at 150+ labeled snapshots stands (Spec 08 formalizes it). An inverted scorer pollutes `best_rejected` analytics and decision labels.

## Implementation checklist (ordered)

1. Add `RehearsalRow` + store methods + unit test (append, cap, ordering).
2. Wire `appendRehearsal` into the daemon's rehearseFill callback.
3. Write `rehearsal-stats.ts` + tests (median, fallback under min samples, per-mint filtering, non-quoted rows excluded).
4. Thread measured cost into `DecisionInput` and the edge gate; stamp `cost_source` in signals; regression test: with no rehearsal rows, behavior is byte-identical to today.
5. Remove xsec from `enabledModulesFor`; update shadow tests to assert no xsec candidates in any regime.
6. Run verify commands. Apply the parameter changeset (operator).

## Constraints

- Do not raise `AutopilotCaps`. Sample rate comes from gate width, not position size.
- `decide()` stays pure: the shell computes measured cost and passes it in.

## Expected observable outcome

Within 3-5 days: 5-15 entries/week (vs ~0-2), skip reasons redistribute away from "trend below gate", the Analyst gets >= 5 round trips per window, and `rehearsals` accumulates the dataset Spec 05 needs. Sharply negative expectancy at the higher sample rate is information: v2's setup logic is weak, which Specs 02-03 replace.
