/**
 * Module `pair_rv` — pair / relative-value mean reversion (V3 plan module 3,
 * report §7). Looks for temporary divergence between two correlated Solana
 * assets and bets on convergence. TRUE market-neutral needs the perp short leg
 * (now in scope): long the underpriced token, short the overpriced one.
 *
 * Pure z-score logic here; the spread history + beta come from the daemon's
 * rolling data, and the perp leg executes through the perps adapter. Enabled in
 * chop and risk-off (mean reversion), disabled in strong risk-on trends where
 * divergence can persist.
 */

import type { CandidateSignal, ExecutionCost, MarketRegime } from "./signal";

export type PairInput = {
  symbol_a: string;
  mint_a: string;
  symbol_b: string;
  mint_b: string;
  /** Current spread = log(priceA) − beta·log(priceB). */
  spread: number;
  /** Rolling mean and stdev of the spread. */
  spread_mean: number;
  spread_std: number;
  /** Estimated mean-reversion half-life in hours; deteriorating = don't trust. */
  half_life_hours: number;
  cost: ExecutionCost; // round trip, both legs
  liquidity_usd: number | null;
};

export const PAIR_ENTRY_Z = 2.0;
export const PAIR_STOP_Z = 3.5;
export const MAX_HALF_LIFE_HOURS = 12; // beyond this, reversion is too slow to be worth cost

/** Mean reversion works in chop/risk-off; a strong risk-on trend can keep a
 * spread diverging, so it's disabled there. */
export function pairEnabledIn(regime: MarketRegime): boolean {
  return regime !== "risk_on";
}

export function spreadZ(input: PairInput): number | null {
  if (!Number.isFinite(input.spread_std) || input.spread_std <= 0) return null;
  return (input.spread - input.spread_mean) / input.spread_std;
}

/**
 * Build a relative-value candidate. z > +entry → short A / long B; z < −entry →
 * long A / short B. Expected return ≈ the z-distance back to the mean × spread
 * std, translated to bps. Null when inside the band, too stretched (stop), or
 * reversion is too slow.
 */
export function pairCandidate(input: PairInput): CandidateSignal | null {
  const z = spreadZ(input);
  if (z === null) return null;
  const absZ = Math.abs(z);
  if (absZ < PAIR_ENTRY_Z || absZ > PAIR_STOP_Z) return null;
  if (input.half_life_hours > MAX_HALF_LIFE_HOURS || input.half_life_hours <= 0) return null;

  // Expected convergence: from current z back to ~0.5z, in spread units → bps.
  const convergenceZ = absZ - 0.5;
  const expectedReturnBps = Math.round(convergenceZ * input.spread_std * 10_000 * 100) / 100;
  const evBps = Math.round((expectedReturnBps - input.cost.total_bps) * 100) / 100;
  if (evBps <= 0) return null;

  // z>0: A rich vs B → short A, long B. Represent the candidate on the leg we
  // BUY (long B). The daemon pairs it with the short A perp leg.
  const longIsA = z < 0;
  return {
    strategy_id: "pair_rv",
    token_mint: longIsA ? input.mint_a : input.mint_b,
    symbol: `${longIsA ? input.symbol_a : input.symbol_b} vs ${longIsA ? input.symbol_b : input.symbol_a}`,
    side: longIsA ? "long_spot_short_perp" : "short_spot_long_perp",
    horizon_sec: Math.round(input.half_life_hours * 3600),
    expected_return_bps: expectedReturnBps,
    cost: input.cost,
    expected_value_bps: evBps,
    confidence: Math.min(0.85, 0.55 + 0.1 * (absZ - PAIR_ENTRY_Z)),
    max_loss_bps: Math.round((PAIR_STOP_Z - absZ) * input.spread_std * 10_000),
    liquidity_usd: input.liquidity_usd ?? 0,
    features: { z, spread: input.spread, spread_std: input.spread_std, half_life_hours: input.half_life_hours },
    reason: `pair RV: z=${z.toFixed(2)} (${longIsA ? `${input.symbol_a} cheap vs ${input.symbol_b}` : `${input.symbol_a} rich vs ${input.symbol_b}`}), half-life ${input.half_life_hours.toFixed(1)}h, EV ${evBps.toFixed(0)}bp.`,
  };
}
