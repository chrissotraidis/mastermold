/**
 * The EV gate (V3 plan, "the one rule that defines V3"): no trade unless
 * estimated net expected value is positive after executable cost, with a
 * margin. Strategy-agnostic and pure — the router ranks by EV, this gate is
 * the hard veto that sits in front of the executor alongside the existing
 * risk-cap policy engine.
 *
 * The margin rule (report §5.1): EV must clear the LARGER of 2× cost or 25bp,
 * so a trade is only taken when the edge meaningfully exceeds its own friction.
 */

import type { CandidateSignal } from "./signal";

export const MIN_CONFIDENCE = 0.6;
export const MAX_PRICE_IMPACT_BPS = 25;
export const MIN_EV_FLOOR_BPS = 25;
export const EV_COST_MULTIPLE = 2;

export type EvVerdict = { pass: true } | { pass: false; reason: string };

/** The minimum net EV (bps) a candidate must clear given its own cost. */
export function requiredEvBps(costTotalBps: number): number {
  return Math.max(EV_COST_MULTIPLE * costTotalBps, MIN_EV_FLOOR_BPS);
}

export function passesEvGate(signal: CandidateSignal, opts: { min_liquidity_usd: number }): EvVerdict {
  if (!Number.isFinite(signal.expected_value_bps)) return { pass: false, reason: "EV is not a finite number" };
  const required = requiredEvBps(signal.cost.total_bps);
  if (signal.expected_value_bps < required) {
    return {
      pass: false,
      reason: `net EV ${signal.expected_value_bps.toFixed(1)}bp under the ${required.toFixed(1)}bp floor (2× cost or 25bp)`,
    };
  }
  if (signal.confidence < MIN_CONFIDENCE) {
    return { pass: false, reason: `confidence ${signal.confidence.toFixed(2)} under ${MIN_CONFIDENCE}` };
  }
  if (signal.cost.price_impact_bps > MAX_PRICE_IMPACT_BPS) {
    return { pass: false, reason: `price impact ${signal.cost.price_impact_bps.toFixed(1)}bp over the ${MAX_PRICE_IMPACT_BPS}bp ceiling` };
  }
  if (signal.liquidity_usd < opts.min_liquidity_usd) {
    return { pass: false, reason: `liquidity $${Math.round(signal.liquidity_usd)} under the $${opts.min_liquidity_usd} floor` };
  }
  return { pass: true };
}
