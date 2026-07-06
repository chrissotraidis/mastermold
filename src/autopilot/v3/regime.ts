/**
 * Market regime classifier (V3 plan §11.4). v2 had no market brain — it took
 * the same long-only setup in every tape. V3 gates strategy modules on regime:
 * directional longs only when risk-on, mean-reversion in chop, market-neutral
 * (funding/arb) always.
 *
 * Pure: derived from SOL/BTC trend, cross-sectional breadth (how many universe
 * tokens are up on the hour), and realized volatility. No IO.
 */

import type { MarketRegime } from "./signal";

export type RegimeInput = {
  sol_return_1h_pct: number | null;
  sol_return_24h_pct: number | null;
  btc_return_24h_pct: number | null;
  /** Fraction 0..1 of the universe up over the last hour (breadth). */
  breadth_up_frac: number;
  /** Realized 1h volatility proxy, percent (e.g. mean abs 1h move). */
  realized_vol_1h_pct: number;
};

/** Above this 1h realized-vol proxy the tape is "extreme" — stand down longs. */
export const EXTREME_VOL_PCT = 6;
/** Breadth thresholds for risk-on / risk-off. */
export const RISK_ON_BREADTH = 0.55;
export const RISK_OFF_BREADTH = 0.35;

export function classifyRegime(input: RegimeInput): MarketRegime {
  const sol1h = input.sol_return_1h_pct ?? 0;
  const sol24h = input.sol_return_24h_pct ?? 0;
  const btc24h = input.btc_return_24h_pct ?? 0;

  // Extreme volatility is never a clean directional environment.
  if (input.realized_vol_1h_pct >= EXTREME_VOL_PCT) return "risk_off";

  const trendUp = sol24h > 0 && sol1h > -0.5 && btc24h > -2;
  const trendDown = sol24h < 0 && sol1h < 0;

  if (trendUp && input.breadth_up_frac >= RISK_ON_BREADTH) return "risk_on";
  if (trendDown || input.breadth_up_frac <= RISK_OFF_BREADTH) return "risk_off";
  return "chop";
}

/** Human-readable one-liner for the trace/terminal. */
export function describeRegime(regime: MarketRegime, input: RegimeInput): string {
  const breadth = `${Math.round(input.breadth_up_frac * 100)}% breadth`;
  const sol = input.sol_return_24h_pct === null ? "SOL 24h ?" : `SOL 24h ${input.sol_return_24h_pct >= 0 ? "+" : ""}${input.sol_return_24h_pct.toFixed(1)}%`;
  const label = regime === "risk_on" ? "RISK-ON (directional longs enabled)" : regime === "chop" ? "CHOP (mean-reversion, reduced size)" : "RISK-OFF (market-neutral only)";
  return `${label} — ${sol}, ${breadth}, vol ${input.realized_vol_1h_pct.toFixed(1)}%.`;
}
