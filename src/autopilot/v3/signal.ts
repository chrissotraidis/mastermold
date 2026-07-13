/**
 * The V3 alpha router's common currency (docs/roadmap/2026-07-05-v3-alpha-router-plan.md).
 *
 * Every strategy module — cross-sectional, funding/basis, pair, arb — emits the
 * SAME `CandidateSignal`. The router ranks candidates by net expected value and
 * the policy engine vetoes anything that isn't positive-EV after real cost.
 * v2 asked "does this match my setup?"; V3 asks "does this executable trade have
 * measurable positive EV?". Everything here is pure and typed.
 */

export type StrategyId = "xsec" | "funding_basis" | "pair_rv" | "quote_arb" | "new_token_event" | "trending" | "copy_wallets" | "cusum_tb" | "bar_portion";

export type CandidateSide = "buy" | "sell" | "long_spot_short_perp" | "short_spot_long_perp" | "atomic_arb";

/** Executable cost breakdown in basis points (1bp = 0.01%). */
export type ExecutionCost = {
  dex_fee_bps: number;
  price_impact_bps: number;
  spread_bps: number;
  slippage_bps: number; // p95 estimate — we budget for the bad case
  priority_fee_bps: number;
  failed_tx_bps: number; // expected cost of a failed/landed-late tx, amortized
  total_bps: number;
};

export type CandidateSignal = {
  strategy_id: StrategyId;
  token_mint: string;
  symbol: string;
  side: CandidateSide;
  horizon_sec: number;
  /** Model/route expected GROSS return before cost. */
  expected_return_bps: number;
  cost: ExecutionCost;
  /** expected_return_bps − cost.total_bps. The number the router ranks on. */
  expected_value_bps: number;
  /** Calibrated 0..1. */
  confidence: number;
  /** Risk model's expected max loss (not merely the stop distance). */
  max_loss_bps: number;
  liquidity_usd: number;
  /** Feature snapshot behind the signal — stored for training/attribution. */
  features: Record<string, number | string | boolean>;
  reason: string;
};

/** The interface every strategy module implements. Pure: given a market view,
 * return zero or more scored candidates. IO (fetching quotes) happens in the
 * daemon shell and is passed in as already-computed features/costs. */
export type StrategyModule = {
  readonly id: StrategyId;
  /** True when this module should run in the current regime (see regime.ts). */
  enabledIn(regime: MarketRegime): boolean;
};

export type MarketRegime = "risk_on" | "chop" | "risk_off";

/** Compose expected_value_bps from a gross forecast and a cost estimate. */
export function toExpectedValue(expectedReturnBps: number, cost: ExecutionCost): number {
  return Math.round((expectedReturnBps - cost.total_bps) * 100) / 100;
}
