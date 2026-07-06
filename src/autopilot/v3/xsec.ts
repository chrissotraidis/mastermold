/**
 * Module `xsec` — cost-aware cross-sectional momentum/reversal (V3 plan module 1,
 * report §6 & §14 Phase 3). The honest replacement for v2's descriptive gates.
 *
 * Instead of "buy a pullback in an uptrend," it RANKS every eligible token by a
 * z-scored score that rewards established trend + volume, penalizes an immediate
 * spike (don't chase), high impact, and high vol — then converts the score into
 * an expected forward return so the router can gate it on net EV. Deterministic
 * hand-score first (this file); swapped for a trained model later on the
 * accumulated candidate dataset. Pure.
 */

import type { ExecutionCost } from "./signal";
import { toExpectedValue, type CandidateSignal } from "./signal";

export type TokenFeatures = {
  symbol: string;
  mint: string;
  r_5m_pct: number | null;
  r_1h_pct: number | null;
  r_4h_pct: number | null;
  r_24h_pct: number | null;
  volume_z_1h: number | null; // volume vs its own recent norm (z-score)
  buy_sell_imbalance_5m: number | null; // -1..1
  realized_vol_15m_pct: number | null;
  liquidity_usd: number | null;
};

/** Score weights (report §14 Phase 3). Deterministic baseline before ML. */
export const XSEC_WEIGHTS = {
  r_1h: 0.25,
  r_4h: 0.2,
  r_5m_spike: -0.2, // negative: penalize immediate spike (anti-chase)
  volume_z: 0.15,
  imbalance: 0.1,
  vol_penalty: -0.2,
} as const;

/** Enter only above this composite score. */
export const XSEC_SCORE_FLOOR = 1.2;
/** Map one score point to this many bps of expected forward return. Calibrated
 * conservatively; the walk-forward backtester will refine it. */
export const BPS_PER_SCORE_POINT = 45;

function z(value: number | null, scale: number): number {
  if (value === null || !Number.isFinite(value)) return 0;
  return value / scale;
}

/** Pure composite score for one token. Higher = stronger cross-sectional long. */
export function xsecScore(f: TokenFeatures): number {
  const score =
    XSEC_WEIGHTS.r_1h * z(f.r_1h_pct, 1.0) +
    XSEC_WEIGHTS.r_4h * z(f.r_4h_pct, 2.0) +
    XSEC_WEIGHTS.r_5m_spike * z(f.r_5m_pct, 0.8) +
    XSEC_WEIGHTS.volume_z * z(f.volume_z_1h, 1.0) +
    XSEC_WEIGHTS.imbalance * z(f.buy_sell_imbalance_5m, 0.5) +
    XSEC_WEIGHTS.vol_penalty * z(f.realized_vol_15m_pct, 1.5);
  return Math.round(score * 1000) / 1000;
}

/** Score → confidence (0..1) via a soft saturating map centered on the floor. */
export function scoreToConfidence(score: number): number {
  const x = score - XSEC_SCORE_FLOOR;
  return Math.round((1 / (1 + Math.exp(-1.5 * x))) * 100) / 100;
}

/**
 * Build a `CandidateSignal` from features + a real execution-cost estimate.
 * Returns null when the score is below the floor (no candidate). The expected
 * gross return is score-derived; the router applies the EV gate against `cost`.
 */
export function xsecCandidate(f: TokenFeatures, cost: ExecutionCost): CandidateSignal | null {
  const score = xsecScore(f);
  if (score < XSEC_SCORE_FLOOR) return null;
  const expectedReturnBps = Math.round(score * BPS_PER_SCORE_POINT * 100) / 100;
  const evBps = toExpectedValue(expectedReturnBps, cost);
  return {
    strategy_id: "xsec",
    token_mint: f.mint,
    symbol: f.symbol,
    side: "buy",
    horizon_sec: 2 * 60 * 60, // ~2h forward horizon
    expected_return_bps: expectedReturnBps,
    cost,
    expected_value_bps: evBps,
    confidence: scoreToConfidence(score),
    // Risk model: expected max adverse excursion ~ 1.2× recent 15m vol, floored.
    max_loss_bps: Math.max(80, Math.round((f.realized_vol_15m_pct ?? 1) * 1.2 * 100)),
    liquidity_usd: f.liquidity_usd ?? 0,
    features: {
      score,
      r_1h_pct: f.r_1h_pct ?? 0,
      r_4h_pct: f.r_4h_pct ?? 0,
      r_5m_pct: f.r_5m_pct ?? 0,
      volume_z_1h: f.volume_z_1h ?? 0,
      imbalance_5m: f.buy_sell_imbalance_5m ?? 0,
      vol_15m_pct: f.realized_vol_15m_pct ?? 0,
    },
    reason: `xsec score ${score.toFixed(2)}: 1h ${(f.r_1h_pct ?? 0).toFixed(1)}%, 4h ${(f.r_4h_pct ?? 0).toFixed(1)}%, exp +${expectedReturnBps.toFixed(0)}bp vs cost ${cost.total_bps.toFixed(0)}bp → EV ${evBps.toFixed(0)}bp.`,
  };
}
