# 03. Spec: Bar Portion Signal (`bar_portion`)

```yaml
agent_contract:
  spec: 03-bar-portion
  goal: BP entry-timing overlay on all buy entries (primary), plus a standalone contrarian shadow module (secondary).
  creates:
    - src/autopilot/v3/bars.ts           # pure OHLC bar builder, BP, ATR, EMA, bpEntryGate
    - src/autopilot/v3/bar-portion.ts    # pure standalone candidate builder
    - tests for both
  edits:
    - path: src/autopilot/v3/signal.ts
      change: add "bar_portion" to StrategyId union
    - path: src/autopilot/store.ts
      change: new veto_watches table (JSON doc rows, own type; ExitWatchRow requires trade_id and has no kind field, so do NOT reuse it)
    - path: src/autopilot/daemon.ts
      change: BarBuilderState per mint in TickContext; bpEntryGate check before buy intents; veto counterfactual marking alongside processExitWatches
    - path: src/autopilot/v3/shadow.ts
      change: register bar_portion for chop and risk_on
  verify:
    - bun run typecheck
    - bun test tests
    - npm run privacy:audit
  done_when: full-body-up-bar fixture blocks a buy for one bar then allows it; veto_watches rows get 30m marks; standalone candidate EV math exact in tests
```

Source: Stoikov et al. 2024 (Cornell FEM, SSRN 5066176). BP = (Close - Open) / (High - Low), bounded [-1, +1], self-normalizing. Quintile analysis on 30 top coins at 1-min: next-bar returns monotonically DECREASING in BP for 73% of the universe. Mean-reversion signal: full-body up bar predicts a down move next bar. Middle quintiles predict flat. Fee-free backtest +45.84%/Sharpe 0.78 over 9 days vs MACD -0.59%/-0.01; live maker test made $1-3/day per $500. Known weakness: raw 1-min signal cannot survive taker fees, which shapes both uses below.

## Problem

Master Mold buys via Jupiter as a taker and ignores intrabar microstructure: v2 happily buys right after a full-body up candle, the statistically worst moment per the paper. The bot also lacks any validated short-horizon signal.

## Solution

1. Entry-timing overlay (primary, ships first): a BP gate on other modules' BUY entries. Adds no trades, removes the worst-timed ones, costs one function call.
2. Standalone contrarian candidates (secondary, shadow-only): fade extreme bars where expected move clears the EV gate, which in practice means high-ATR names in volatile regimes. It should rarely fire on majors; that is correct behavior.

## Architecture

### OHLC bar builder (pure, `src/autopilot/v3/bars.ts`)

`store.price_history` is close-only 5-min bars (`daemon.ts:643-658`); BP needs OHLC. Build in-memory 5-min OHLC bars per mint from the 20s tick stream (15 samples/bar):

```typescript
export type OhlcBar = { ts_open_ms: number; o: number; h: number; l: number; c: number; samples: number };
export type BarBuilderState = { current: OhlcBar | null; closed: OhlcBar[] };  // keep last 60 closed (5h)

/** Feed one sample; returns the just-closed bar when a boundary passes. */
export function barStep(state: BarBuilderState, price: number, ts_ms: number, bar_ms = 300_000): OhlcBar | null;
```

Boundary = `floor(ts / bar_ms)` change; discard the partial first bar after boot. Persist nothing initially (bars rebuild within 5h of uptime); if replay needs persisted OHLC later, add a capped table then. H/L are 20s-sampled so true extremes are understated; fine as long as live and replay sample identically.

Also in `bars.ts` (pure): `atrBps(closed, n=14)` (mean true range in bps), `emaClose(closed, n=20)`, and:

```typescript
export function barPortion(bar: OhlcBar): number | null {
  if (bar.samples < 9 || bar.h <= bar.l) return null;
  return (bar.c - bar.o) / (bar.h - bar.l);
}
```

Thresholds from the paper's quintile structure: extreme = |BP| >= 0.6; dead zone = |BP| <= 0.2.

### Use 1: entry-timing overlay

```typescript
export type BpVerdict = { allow: true } | { allow: false; reason: string };

/** Veto BUY entries fired right after a full-body up bar. Never vetoes sells/exits. */
export function bpEntryGate(lastClosedBp: number | null, lastBarAgeMs: number | null): BpVerdict {
  if (lastBarAgeMs !== null && lastBarAgeMs > 600_000) return { allow: true }; // stale bars pass through
  if (lastClosedBp !== null && lastClosedBp >= 0.6) {
    return { allow: false, reason: `BP ${lastClosedBp.toFixed(2)} full-body up bar; deferring entry one bar` };
  }
  return { allow: true };
}
```

Wiring: in the daemon, before converting any buy `Decision`/candidate to a `TradeIntent`, check `bpEntryGate`. On veto: log a `blocked` decision (throttled like other blocks) with `bp_deferred: true` in features. Do NOT cancel the setup; if it still holds next closed bar, it fires then. Max deferral: 5 minutes.

Measurement (mandatory before trusting it): `ExitWatchRow` requires a `trade_id` and has no kind field (`store.ts:184-197`), so add a separate small table:

```typescript
export type VetoWatchRow = {
  id: string; ts: string;
  mint: string; symbol: string;
  price_at_veto_usd: number;
  bp: number;
  mark_30m_usd: number | null;
  done: boolean;
};
```

Marking runs alongside `processExitWatches` (`daemon.ts:463`) from the same price map. After 40+ vetoes the Analyst compares mean 30m forward return of vetoed moments vs taken entries; if deferral does not help, delete the gate (one call site).

### Use 2: standalone contrarian candidates

`bpCandidate` in `src/autopilot/v3/bar-portion.ts`, template `xsecCandidate`:

- Trigger: last closed bar BP <= -0.6 -> side "buy" (fade the down bar). BP >= +0.6 while held -> side "sell". No naked shorts.
- Knife-catch guard (Stoikov's GALA failure: contrarian fills against strong trends bleed): require `h1_pct >= -1.5`, `h24_pct >= -5`, and price within 1.5 x ATR of the 20-bar EMA.
- `expected_return_bps = bp_edge_ratio * atr_bps * |BP|`, `bp_edge_ratio` initial 0.25, recalibrated like cusum_tb's edge_ratio (>= 40 labeled rows filtered to `strategy_id === "bar_portion"`, clamp [0.05, 0.5]).
- `horizon_sec = 900` (3 bars). `confidence` 0.62 when guards pass with margin, else 0.55.
- Exits when promoted: `tp_pct = sl_pct = 2 * atr_pct`, `deadline_ts = entry + 30min` (Spec 02's position fields).
- Regimes: `chop` and `risk_on`.

Honesty note for the implementing agent: on SOL-class majors, 5-min ATR is often 10-30bp, so expected_return_bps of ~2-8bp will never clear the EV floor (25bp) and the module emits nothing. Correct. It activates on high-ATR names (Spec 04 tier B). Do not lower the EV gate to make it fire.

## Constraints

- Overlay ships before standalone; both share `bars.ts`.
- No new API calls.
- Never veto exits or sells. Risk-off flattening always wins.

## Implementation checklist (ordered)

1. `bars.ts` + tests: boundary handling, partial-first-bar discard, degenerate/undersampled BP null, ATR/EMA against hand-computed fixtures, gate boundaries (0.6, staleness).
2. `VetoWatchRow` + store methods + marking loop + tests.
3. Overlay wiring at the buy-intent call site + integration test (full-body up bar -> blocked -> next bar -> entry).
4. `signal.ts` union + `bar-portion.ts` + tests (trigger signs, guards, EV math; `h24_pct = -8` fixture yields null).
5. Shadow registration + snapshot integration test.
6. Verify commands.

## Open questions

1. Bar size: 5-min matches existing cadence and fee reality; if replay shows the effect washed out, test 3-min before abandoning.
2. Whether the overlay should also defer on BP <= -0.6 for SELL exits (symmetric logic) is deliberately out of scope: never delay risk reduction.
