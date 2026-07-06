/**
 * Module `funding_basis` — funding/basis arbitrage (V3 plan module 2, report §9).
 * The highest-EV path for a small operator now that Solana perps are in scope.
 *
 * Delta-neutral: long spot + short perp when funding is positive and the carry
 * over the hold clears round-trip cost with a basis-risk buffer. Direction of
 * SOL price is offset, so this earns the funding stream, not a price bet. Pure
 * candidate logic here; the perps venue adapter (Drift / Jupiter Perps reads)
 * and paper carry accounting live in the daemon shell / a later slice.
 *
 * Market-neutral → enabled in EVERY regime (including risk-off), unlike the
 * directional xsec module.
 */

import type { CandidateSignal, ExecutionCost, MarketRegime } from "./signal";

export type FundingInput = {
  symbol: string;
  mint: string;
  /** Current funding rate per 8h as a percent (perp longs pay shorts when +). */
  funding_rate_8h_pct: number | null;
  /** How many hours we intend to hold the delta-neutral position. */
  hold_hours: number;
  /** Perp mark vs spot, percent — the basis we enter/exit across. */
  basis_pct: number | null;
  /** Round-trip execution cost to open+close BOTH legs, bps. */
  cost: ExecutionCost;
  liquidity_usd: number | null;
  /** How many recent 8h windows funding has stayed the same sign (persistence). */
  funding_persistence_windows: number;
};

/** Require funding to have held its sign this many 8h windows before trusting it. */
export const MIN_FUNDING_PERSISTENCE = 2;
/** Basis-risk buffer added to cost before a carry trade is worthwhile (bps). */
export const BASIS_RISK_BUFFER_BPS = 15;

/** funding_basis is market-neutral — it runs regardless of directional regime. */
export function fundingEnabledIn(_regime: MarketRegime): boolean {
  return true;
}

/**
 * Expected carry over the hold, in bps: funding collected minus the basis we
 * expect to give back. Positive funding + short perp = we RECEIVE funding.
 */
export function expectedCarryBps(input: FundingInput): number | null {
  if (input.funding_rate_8h_pct === null) return null;
  const windows = input.hold_hours / 8;
  const fundingBps = input.funding_rate_8h_pct * 100 * windows; // % → bps × windows
  const basisGiveback = Math.abs(input.basis_pct ?? 0) * 100 * 0.5; // assume half the basis converges against us
  return Math.round((fundingBps - basisGiveback) * 100) / 100;
}

/**
 * Build a delta-neutral candidate. Positive funding → long spot / short perp.
 * Returns null when funding is unknown, too fresh (not persistent), or the
 * carry doesn't clear cost + buffer.
 */
export function fundingCandidate(input: FundingInput): CandidateSignal | null {
  if (input.funding_rate_8h_pct === null || input.funding_rate_8h_pct <= 0) return null; // only harvest positive funding for now
  if (input.funding_persistence_windows < MIN_FUNDING_PERSISTENCE) return null;
  const carry = expectedCarryBps(input);
  if (carry === null) return null;
  const evBps = Math.round((carry - input.cost.total_bps - BASIS_RISK_BUFFER_BPS) * 100) / 100;
  if (evBps <= 0) return null;
  return {
    strategy_id: "funding_basis",
    token_mint: input.mint,
    symbol: input.symbol,
    side: "long_spot_short_perp",
    horizon_sec: Math.round(input.hold_hours * 3600),
    expected_return_bps: carry,
    cost: input.cost,
    expected_value_bps: evBps,
    // Delta-neutral: confidence is high when funding is persistent, capped.
    confidence: Math.min(0.9, 0.6 + 0.1 * (input.funding_persistence_windows - MIN_FUNDING_PERSISTENCE)),
    // Max loss is basis blowout, not a directional stop — bounded by basis buffer.
    max_loss_bps: Math.max(30, Math.round(Math.abs(input.basis_pct ?? 0.3) * 100 * 2)),
    liquidity_usd: input.liquidity_usd ?? 0,
    features: {
      funding_rate_8h_pct: input.funding_rate_8h_pct,
      hold_hours: input.hold_hours,
      basis_pct: input.basis_pct ?? 0,
      persistence: input.funding_persistence_windows,
      carry_bps: carry,
    },
    reason: `funding carry: +${input.funding_rate_8h_pct.toFixed(3)}%/8h × ${(input.hold_hours / 8).toFixed(1)} windows = ${carry.toFixed(0)}bp, EV ${evBps.toFixed(0)}bp after cost+basis buffer.`,
  };
}
