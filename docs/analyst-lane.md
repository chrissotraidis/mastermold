# Polymarket Analyst Lane

> Decision date: 2026-08-08. Supersedes the momentum/book_pressure exploration
> lane, whose 2026-08-05..08 sample (173 round trips, -$28.47, negative forward
> returns at every horizon across 2,087 labeled observations) falsified
> price-chasing signals on this venue. `POLYMARKET_EXPLORATION` is now off.

## Problem

Price-only signals have no edge here; prediction-market prices mean-revert
after moves. Winning requires an informational edge: an independent probability
estimate that is better calibrated than the market price, used only when the
divergence exceeds trading costs.

## Solution

An LLM analyst (`src/polymarket/analyst.ts`) prices selected binary markets
independently and paper-bets only on large divergence. The design follows the
published forecasting results: retrieval-grounded LLM forecasting approaches
crowd calibration (Halawi et al. 2024, arXiv:2402.18563), and conditioning on
the market price as a prior beats the market baseline (arXiv:2607.20441).

Per cycle (default every 3 hours, `POLYMARKET_ANALYST_CYCLE_HOURS`):

1. Grade pending forecasts against Gamma resolutions (model and market Brier).
2. Select up to 5 candidates: active binary CLOB markets, no neg-risk, no fees,
   >= $20k liquidity, YES between 5c and 95c, resolution 1-14 days out, not
   forecasted in the last 20h, no open position on the market.
3. For each, fetch the Gamma resolution criteria and ask the model
   (`POLYMARKET_ANALYST_MODEL`, default `deepseek/deepseek-v4-flash:online` via
   OpenRouter with web grounding) for strict-JSON `{probability, confidence,
   rationale}`, with the market price given explicitly as the prior.
4. Journal every forecast to `polymarket_analyst_forecasts` (in the brain
   sqlite DB) whether or not it bets — the calibration record is the product.
5. Bet only when model-vs-executable-ask edge >= 10 points and confidence is
   medium+: $5 stake, max 3 open analyst positions, shared paper policy caps,
   entries via the standard displayed-depth walk and brain paper ledger.

Analyst positions hold to resolution (no price stop, no hold limit): the
hypothesis under test is the probability estimate, not a price path. Settlement
happens through the existing resolved-market path in the paper engine.

## Inference — where the model comes from

The lane uses the `OPENROUTER_API_KEY` already configured in `.env.local`.
That key predates this lane: it has powered the Master Mold chat fallback and
the Web3 autopilot Analyst since those shipped (see `.env.example`). No new
provider or credential was added for this lane; usage is billed to the same
OpenRouter account and is visible in its dashboard.

- Model: `POLYMARKET_ANALYST_MODEL`, default `deepseek/deepseek-v4-flash:online`.
  The `:online` suffix is OpenRouter's web-grounding plugin — each call
  retrieves current web results so forecasts are not stale-knowledge guesses.
- Budget ceiling: at most 5 calls per cycle, cycles every 3 hours — <= ~40
  calls/day on a cheap model. Swap models by changing the env var and
  restarting; no code change needed.

## The learning loop (idea log -> iteration)

Every forecast is an idea logged to the database, and the loop is closed
deterministically:

1. `polymarket_analyst_forecasts` stores each estimate with its rationale,
   the market prior, and the asks at forecast time — whether or not it bet.
2. Resolution grading writes the outcome and Brier scores (model vs market)
   back onto the same row.
3. Each new forecast batch feeds the model its own graded track record
   (overall calibration plus the latest resolved calls) so it can correct
   systematic bias — chronic overconfidence, a category it keeps misreading.
   Track record is context, not precedent; the rails (edge threshold, stake,
   caps) are never model-adjustable.

"Participate only where it can win" is enforced structurally: the candidate
filter keeps it out of markets it cannot beat (extreme prices, thin books,
fee-bearing, too-near or too-far resolution), and the >= 10pt edge gate means
agreeing with the market — the common case — produces a journal entry, not a
bet. Category-level win/loss stats (which market types it actually beats) come
out of the same table once the resolved sample is large enough, and can then
tighten the filter to proven-winnable categories.

## Constraints

- Paper only. Live execution stays locked; no wallet/CLOB credentials exist in
  this lane.
- Forecasting runs even when paper mode is off; entries require armed paper
  mode via the shared entry policy.
- LLM budget: <= 5 calls per 3h cycle (~40/day ceiling) on a cheap model.

## Promotion gate (to any live-money discussion)

1. >= 50 resolved forecasts.
2. Mean model Brier <= mean market Brier (the market's own price at forecast
   time, scored on the same markets).
3. Positive realized paper P&L on `tier='analyst'` closes.

Approved live canary, once the gate passes and the operator provides the
exported Polymarket key + funder address: $200 bankroll, $10 max per position,
max 2 open, hard kill at $50 total drawdown. Not before.

## Open questions

- Whether `:online` grounding is fresh enough for fast-moving geopolitical
  markets, or whether those should be filtered out by category.
- Per-event concentration caps if the volume-ranked universe clusters again.
