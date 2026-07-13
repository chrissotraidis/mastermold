# 07. Spec: ML Pipeline (ResNet-LSTM on CUSUM/Triple-Barrier Labels)

```yaml
agent_contract:
  spec: 07-ml-pipeline
  goal: Per-event p(up) predictions from a ResNet-LSTM, consumed by cusum_tb as calibrated confidence, via the engine's file-based contract. Python scores; TypeScript decides.
  depends_on: 02 (cusum_tb live for >= 4 weeks in shadow), engine/ uv setup
  creates:
    - engine/ml/{data,events,labels,features,model,train,infer}.py
    - engine/ml/fixtures/cusum-parity.json (+ barrier-parity fixtures)
    - npm script "ml:train"
    - pytest suite + bun parity tests
  edits:
    - path: src/autopilot/v3/cusum-tb.ts
      change: consume fresh signals from engine/out/ml/signals.jsonl; map p_up to confidence; degrade to rule-based when absent/stale; stamp features.ml
  verify:
    - bun run typecheck && bun test tests
    - cd engine && uv run pytest
    - npm run privacy:audit
  done_when: parity fixtures pass in BOTH test suites; end-to-end dry run (fixture data -> tiny model -> signals.jsonl -> TS candidate with mapped confidence); degradation test passes; first real MODELCARD written
```

Source: Gradzki 2025, the full pipeline. Winner: ResNet-LSTM binary classifier on 96-step windows of 33 features over CUSUM event bars, triple-barrier labels, quarterly expanding-window retrains, top-3 validation ensemble, 3 seeds averaged. ETH (CUSUM 2%, TB 5%): +91.6%/yr net, Sharpe 1.42; grid peaks Sharpe 2.0 at (2.5%, 5-6%). XGBoost had the highest accuracy and lost money. Transformers failed to learn. Trade filter: long if p(up) > 0.60, short if < 0.40, else flat. Removing the indicator block flipped BTC from +20.4% to -24.2%: features matter even at ~53% accuracy.

## Problem

Rule-based cusum_tb trades every trend-aligned up-breach identically. The paper shows a classifier sorts breaches worth taking from breaches that mean-revert, and that this sorting carries the ML value-add. This is Phase 3: do not start until rule-based cusum_tb has >= 4 weeks of shadow history to compare against.

## Solution

A Python package in the existing engine sidecar producing per-event `p_up`, consumed through files (matches `engine/CONTRACT.md` philosophy: files, not RPC). The ML layer replaces only the direction heuristic and static confidence; barriers, EV gate, router, and promotion stay.

## Architecture

### Package layout (`engine/ml/`)

```
data.py        # OHLCV acquisition + parquet cache
events.py      # CUSUM extraction (parity with TS)
labels.py      # triple-barrier labels + purging/embargo
features.py    # the 33-feature block per event bar
model.py       # ResNet-LSTM (PyTorch, CPU-capable)
train.py       # walk-forward loop, hyperband, seeds, ensembling
infer.py       # long-running scorer: watch events, emit signals.jsonl
fixtures/      # shared JSON fixtures for TS<->Py parity
```

Dependencies via the engine's uv setup: pytorch, pandas, pandas-ta, optuna, pyarrow. No API keys.

### Data (`data.py`)

- Majors: 1-min OHLCV from Coinbase Exchange public candles and/or Kraken OHLC (keyless, US-accessible), >= 3 years where available, cached as parquet under `engine/out/cache/ohlcv/` (git-ignored).
- Solana-native tier B: GeckoTerminal keyless OHLCV (5-min). Tokens with < 6 months of history are excluded from training and stay rule-based.
- Record per-source `fetched_at`; never mix sources for one symbol within one run.

### Parity (`events.py`, `labels.py` + fixtures): the non-negotiable part

Reimplement `cusumStep` and `cusumThresholdPct` exactly (log returns, reset-on-breach, same clamps), and the barrier math. Shared fixtures (`fixtures/cusum-parity.json`: price series -> expected events; barrier fixtures likewise) are asserted by BOTH pytest and bun test. If parity drifts, training data no longer matches live events and every prediction is silently wrong. Include an edge-case fixture with consecutive breaches.

### Labels (`labels.py`)

- TP = SL = 2.2 x h (matching Spec 02), vertical = 24 event bars. Label = first barrier hit; vertical expiries label by sign of return AND carry a `vertical: true` flag (the paper is silent on ties; make it explicit, test both drop/keep in the grid).
- Purged walk-forward with embargo (the paper used only quarterly splits; triple-barrier windows overlap, so add Lopez de Prado's purging): drop training events whose barrier window overlaps validation/test; embargo 2 days after each test block.

### Features (`features.py`)

The paper's 33, computed on event bars, standardized on train stats only: OHLCV; EMA and rolling std of close (5/10/15/20/50); MACD(12,26); RSI(6/10/14); Stochastic %K/%D(14); Williams %R(14); Bollinger(5, 2 sigma); bar returns; CMF(21); MFI(14); sin/cos hour and weekday. Input: 96 events x 33. Do not add features in v1; the ablation showed this block matters and grid discipline beats creativity.

### Model and training (`model.py`, `train.py`)

- ResNet-LSTM: 3 x (conv1d + batchnorm + ReLU) with skip connection, dropout, LSTM head, sigmoid.
- Hyperband (optuna) on the FIRST validation split only, then frozen. 3 seeds; top-3 validation configs ensembled by mean probability.
- Quarterly expanding walk-forward, per symbol; minimum 800 events to train a symbol (below: rule-based path).
- Success criterion, frozen before results: ensemble beats the rule-based heuristic on held-out events by BOTH hit rate and simulated net expectancy (Spec 05 cost constants). No beat, no deploy for that symbol.

### Contract with the daemon

- v1 keeps it simple: `infer.py` recomputes features from its own cached data and needs only (mint, event_ts) keys, which it derives by running the same CUSUM extraction on its own feed. Feature-parity risk is contained by the fixtures.
- `infer.py` appends to `engine/out/ml/signals.jsonl`: `{ mint, event_ts, p_up, model_id, trained_through, scored_at }`.
- `cusum-tb.ts`: when a fresh signal exists for the event (scored within 60s, model trained within 100 days): `confidence = clamp(0.3, 0.9, 0.5 + (p_up - 0.5) * 0.4)` (p_up 0.75 -> 0.60, exactly the EV gate floor; deliberately conservative until calibration accumulates), and take longs only when p_up > 0.60 (the paper's filter). Stale/missing: rule-based path with `features.ml = "absent"` so calibration separates the two paths.
- Degradation: signals stale > 1h while events flow -> one throttled activity warning; the bot must degrade silently and safely.

### Cadence and artifacts

Quarterly retrain via `npm run ml:train` -> `uv run python -m ml.train`; the daemon never trains. Models under `engine/out/ml/models/` (git-ignored), `model_id` = content hash. Every run writes a `MODELCARD.md`: data ranges, splits, per-symbol metrics vs the rule-based baseline, frozen-criterion verdicts.

## Constraints

- Python scores, TypeScript decides. No order/intent logic in Python.
- CPU training must finish overnight for <= 15 symbols; if not, cut symbols, not seeds.
- The 60/40 filter and the confidence map are frozen before evaluation.
- ML outputs land in candidate-store features so the per-strategy promotion gate (Spec 02) arbitrates rule-based vs ML on realized labels, not backtest claims.

## Implementation checklist (ordered)

1. Fixtures first: generate cusum + barrier parity fixtures from the TS implementation; wire pytest + bun assertions.
2. `data.py` + cache + source-consistency checks.
3. `events.py`/`labels.py` against fixtures; purging/embargo tests (no training event's barrier window overlaps test; assert on generated splits).
4. `features.py` (pandas-ta) + standardization-leakage test (train stats only).
5. `model.py`/`train.py`; tiny-run smoke test (1 seed, 1 quarter, fixture data).
6. `infer.py` + signals.jsonl; TS consumption + degradation tests.
7. First real training run; MODELCARD reviewed by the operator BEFORE the confidence mapping activates in shadow.
8. Verify commands.

## Open questions

1. 5-min GeckoTerminal bars vs 1-min CEX bars: the vol-anchored h absorbs scale differences, but verify event-frequency parity between sources before pooling anything cross-symbol.
2. Pooled vs per-symbol models: paper is per-symbol; start there.
