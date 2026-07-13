import type { CusumEvent } from "./cusum";
import type { CandidateSignal, ExecutionCost } from "./signal";
import { toExpectedValue } from "./signal";
import { mlConfidence, type FreshMlSignal } from "./ml-signals";

export const CUSUM_BARRIER_MULT = 2.2;
export const CUSUM_INITIAL_EDGE_RATIO = 0.15;
export const CUSUM_HORIZON_SEC = 86_400;
/** Published Drift Tier 1 taker fee is 3.5bp/leg; this is round trip. */
export const DRIFT_PERP_ROUND_TRIP_TAKER_BPS = 7;
export const DRIFT_FEE_VERIFIED_ON = "2026-07-12";

export type CusumTbInput = {
  symbol: string;
  mint: string;
  price_usd: number;
  event: CusumEvent;
  h_pct: number;
  held: boolean;
  h1_pct: number | null;
  h24_pct: number | null;
  liquidity_usd: number | null;
  volume_h24_usd: number | null;
  sigma_daily_pct: number | null;
  edge_ratio: number;
  /** Shell-validated exact-event signal. Missing/stale/unapproved stays null. */
  ml?: FreshMlSignal | null;
  perp?: { market: string; funding_rate_8h_pct: number | null } | null;
};

export function driftPerpShortCost(fundingRate8hPct: number | null): ExecutionCost {
  const fundingCreditBps = (fundingRate8hPct ?? 0) * 100 * (CUSUM_HORIZON_SEC / (8 * 3600));
  const total = Math.max(0, DRIFT_PERP_ROUND_TRIP_TAKER_BPS - fundingCreditBps);
  return { dex_fee_bps: DRIFT_PERP_ROUND_TRIP_TAKER_BPS, price_impact_bps: 0, spread_bps: 0, slippage_bps: 0, priority_fee_bps: 0, failed_tx_bps: 0, total_bps: Math.round(total * 100) / 100 };
}

export function cusumTbCandidate(input: CusumTbInput, cost: ExecutionCost): CandidateSignal | null {
  if (!Number.isFinite(input.price_usd) || input.price_usd <= 0 || !Number.isFinite(input.h_pct) || input.h_pct <= 0) return null;
  const perpShort = input.event.direction === "down" && !input.held && input.perp ? input.perp : null;
  if (input.event.direction === "down" && !input.held && !perpShort) return null;
  // ML replaces only the direction filter for NEW exposure. A protective exit
  // from an already-held spot position can never be blocked by a classifier.
  if (input.ml && !input.held) {
    if (input.event.direction === "up" && input.ml.p_up <= 0.60) return null;
    if (input.event.direction === "down" && input.ml.p_up >= 0.40) return null;
  }
  if (input.event.direction === "up") {
    if (input.h1_pct === null || input.h1_pct < -1) return null;
    if (input.h24_pct === null || input.h24_pct < -5 || input.h24_pct > 40) return null;
  }

  const barrierBps = Math.round(CUSUM_BARRIER_MULT * input.h_pct * 100 * 100) / 100;
  const edgeRatio = Math.min(0.3, Math.max(0.05, input.edge_ratio));
  const expectedReturnBps = edgeRatio * barrierBps;
  const aligned = (input.h1_pct ?? -Infinity) >= 0 && (input.h24_pct ?? -Infinity) >= 0;
  const side = input.event.direction === "up" ? "buy" as const : "sell" as const;
  const effectiveCost = perpShort ? driftPerpShortCost(perpShort.funding_rate_8h_pct) : cost;
  return {
    strategy_id: "cusum_tb",
    token_mint: input.mint,
    symbol: input.symbol,
    side,
    horizon_sec: CUSUM_HORIZON_SEC,
    expected_return_bps: Math.round(expectedReturnBps * 100) / 100,
    cost: effectiveCost,
    expected_value_bps: toExpectedValue(expectedReturnBps, effectiveCost),
    confidence: input.ml ? mlConfidence(input.ml.p_up) : aligned ? 0.62 : 0.55,
    max_loss_bps: barrierBps,
    liquidity_usd: input.liquidity_usd ?? 0,
    features: {
      h_pct: input.h_pct,
      event_ts: input.event.ts_ms,
      magnitude: input.event.magnitude,
      direction: input.event.direction,
      h1_pct: input.h1_pct ?? 0,
      h24_pct: input.h24_pct ?? 0,
      sigma_daily_pct: input.sigma_daily_pct ?? 0,
      edge_ratio: edgeRatio,
      barrier_bps: barrierBps,
      volume_h24_usd: input.volume_h24_usd ?? 0,
      venue: perpShort ? "drift_perp" : "spot",
      perp_market: perpShort?.market ?? "",
      funding_rate_8h_pct: perpShort?.funding_rate_8h_pct ?? 0,
      funding_horizon_bps: perpShort ? Math.round((DRIFT_PERP_ROUND_TRIP_TAKER_BPS - effectiveCost.total_bps) * 100) / 100 : 0,
      ml: input.ml ? "fresh" : "absent",
      p_up: input.ml?.p_up ?? 0,
      model_id: input.ml?.model_id ?? "",
    },
    reason: perpShort
      ? `CUSUM down-breach Drift short (${perpShort.market})`
      : input.event.direction === "down"
      ? "CUSUM down-breach exit"
      : `CUSUM up-breach at ${(input.event.magnitude * 100).toFixed(2)}%; symmetric ${CUSUM_BARRIER_MULT}x barriers`,
  };
}
