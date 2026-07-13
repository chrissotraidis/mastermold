# 08. Spec: Replay Harness, Promotion Criteria, Anti-Overfit Rules

```yaml
agent_contract:
  spec: 08-backtest-and-promotion
  goal: Replay pure strategy modules over long external OHLCV history with the real cost model; freeze promotion/demotion criteria; codify anti-overfit rules.
  depends_on: 02 (modules to replay), 05 (cost model)
  creates:
    - scripts/replay.ts + src/autopilot/v3/replay/
    - scripts/fetch-replay-data.ts        # keyless candle fetcher (works without the Python engine)
    - npm script "replay"
    - tests incl. a golden fixture
  edits:
    - path: src/autopilot/v3/promotion.ts (and its call sites)
      change: per-strategy promotion (with Spec 02) + the extended criteria table below + automatic demotion check in the daily Analyst block
  verify:
    - bun run typecheck
    - bun test tests
    - npm run privacy:audit
  done_when: golden fixture reproduces exact trades/PnL; walk-forward enforcement throws on future-data configs; demotion triggers in a losing-streak fixture; reports land under docs/private/replay-reports/
```

Sources: Deutscher thread (the one good idea: never promote a strategy you have not replayed and refined from its own trade log); Gradzki 2025 (discipline worth copying: parameters frozen before evaluation, all experiments reported including failures, walk-forward only); Schwertfeger 2026 (warning: backtests systematically overstate realized results; the gap is cost, ordering, and fills, which Spec 05 narrows).

## Problem

`scripts/v3-backtest.ts` validates against the candidate store's own labeled snapshots: right for calibration, but it cannot answer "how would cusum_tb have done over the last 18 months?" because stored history is ~7 days of 5-min closes (`PRICE_HISTORY_CAP = 2016`). And promotion is currently a single GLOBAL flag (`store.v3Promotion()`, computed from `calibrate()` over all strategies pooled, `daemon.ts:835`): one module's history can promote or block another's. There is also no demotion path and no written standard for what a module must prove, which is how overfitting sneaks in.

## Solution

1. A replay harness running the SAME pure functions as production over long external history with the Spec 05 cost model.
2. A frozen promotion/demotion rulebook, per strategy.
3. An anti-overfit constitution for humans and the Analyst alike.

## Architecture

### A. Replay harness (`scripts/replay.ts` + `src/autopilot/v3/replay/`)

- Input: per-symbol OHLCV (1-min or 5-min). Primary source: the Spec 07 parquet cache when present; standalone fallback: `scripts/fetch-replay-data.ts` pulling Coinbase/Kraken/GeckoTerminal candles keylessly to JSON. The harness must run without the Python engine.
- Engine: step through bars; maintain `CusumState`, `BarBuilderState`, rolling features; call the pure builders (`cusumTbCandidate`, `bpCandidate`) exactly as the shadow shell does; apply the EV gate; fill at next-bar open plus the cost model's `total_bps` (taker, adverse half-spread). Barrier resolution intra-bar via H/L; when TP and SL both lie inside one bar's range, count SL (pessimistic tie-break, stated in every report).
- Costs: a fixed cost-model snapshot per run, recorded in the report; a 2x-cost sensitivity row is mandatory in every report.
- Determinism: no wall-clock reads inside the loop; same inputs + config -> byte-identical report modulo timestamps.
- Output per run -> `docs/private/replay-reports/<date>-<module>.md`: config hash, data ranges/source, trades, hit rate, net expectancy bps/trade, Sharpe (daily marks), max DD, exposure %, events/day per symbol, the 2x-cost row, exact parameter set. Every run gets a report, including bad ones (failures are data).
- Walk-forward mode: quarterly splits; parameters for quarter k may derive only from data before k. Enforced: the harness takes a parameter schedule, not a single config, when grid-searching, and throws if a schedule entry references future data.

### B. Promotion rulebook (per strategy; extends `promotion.ts`; frozen now)

Shadow -> paper co-pilot requires ALL, computed over snapshots filtered to the module's `strategy_id`:

| Check | Threshold | Where |
|---|---|---|
| Labeled snapshots | >= 150 (existing constant) | candidate store |
| Hit rate | >= 0.5 (existing) | candidate store |
| Enter-vs-skip separation | enter 2h mean > skip 2h mean (existing) | candidate store |
| Net shadow expectancy | >= +20bp/trade after modeled cost, >= 40 would-enters | candidate store |
| Calibration sanity | predicted-EV vs realized-return slope in [0.3, 1.5] | calibration extension |
| Replay confirmation | same config positive net expectancy over >= 2 walk-forward quarters AND survives the 2x-cost row | replay report |

Paper co-pilot -> live-routing candidate additionally requires the existing go-live gate (untouched) plus >= 4 weeks in paper with net expectancy >= 0 and no risk-halt events attributable to the module.

Demotion (new, automatic): a promoted module returns to shadow when rolling 40-trade net expectancy < -15bp/trade or calibration slope leaves [0.2, 2.0]. Checked in the daily Analyst block. Demotion is automatic; promotion never is (operator confirms via dashboard, consistent with the kill switch's never-auto-resume philosophy).

### C. Anti-overfit constitution (the Analyst prompt should quote it)

1. Parameters are frozen before an evaluation window opens; mid-window edits reset the window.
2. One change at a time (the Analyst's single-changeset rule, extended to humans).
3. Every replay run produces a report; deleting bad reports is falsifying data.
4. Minimum samples before any conclusion: 40 trades or 150 labeled snapshots, whichever the check specifies.
5. Grid searches happen only in the replay harness, walk-forward only, and the chosen config's neighboring cells must not be catastrophic (a Sharpe spike surrounded by losses is noise; Gradzki's sweet-spot reasoning).
6. When shadow and replay disagree, shadow wins: it saw real quotes and real costs.

## Constraints

- The harness runs the SAME pure functions as production. Reimplementing strategy logic for replay is where replay lies come from; if a module cannot be replayed without IO, fix the module.
- Replay reports live under `docs/private/` (ignored), never tracked.
- No always-on processes; replay is operator-invoked: `npm run replay -- --module cusum_tb --from 2025-01-01`.

## Implementation checklist (ordered)

1. `fetch-replay-data.ts` + fixture-backed tests.
2. Replay engine + golden test: a hand-built 200-bar fixture with two engineered CUSUM events and known barrier outcomes reproduces exact trades, PnL, and the pessimistic tie-break.
3. Determinism test (two runs, identical output).
4. Walk-forward schedule enforcement (+ throw test).
5. Report writer + 2x-cost row.
6. Per-strategy promotion criteria + demotion check + boundary tests.
7. Baseline run: replay v2 trend-pullback itself over 12-18 months. It sets the bar the v3 modules must beat and quantifies what the current strategy actually is.
8. Verify commands.

## Open questions

1. Intra-bar barrier resolution at 5-min bars is coarse for tight tier B barriers; if replay systematically disagrees with shadow, move affected symbols to 1-min data before distrusting the module.
2. Whether replay should model the BP overlay's one-bar deferral: yes once Spec 03 ships; add as a flag so overlay-on/off is its own report row.
