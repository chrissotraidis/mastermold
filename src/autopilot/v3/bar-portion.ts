import type { CandidateSignal, ExecutionCost } from "./signal";
import { toExpectedValue } from "./signal";

export const BAR_PORTION_INITIAL_EDGE_RATIO = 0.25;
export const BAR_PORTION_HORIZON_SEC = 15 * 60;
export const BAR_PORTION_STOP_ATR_MULT = 2;

export type BarPortionInput = {
  symbol: string;
  mint: string;
  price_usd: number;
  bp: number | null;
  atr_bps: number | null;
  ema_close: number | null;
  held: boolean;
  h1_pct: number | null;
  h24_pct: number | null;
  liquidity_usd: number | null;
  edge_ratio: number;
};

export function bpCandidate(input: BarPortionInput, cost: ExecutionCost): CandidateSignal | null {
  if (
    input.bp === null || !Number.isFinite(input.bp) || Math.abs(input.bp) < 0.6 ||
    input.atr_bps === null || !Number.isFinite(input.atr_bps) || input.atr_bps <= 0 ||
    input.ema_close === null || !Number.isFinite(input.ema_close) || input.ema_close <= 0 ||
    !Number.isFinite(input.price_usd) || input.price_usd <= 0
  ) return null;
  const side = input.bp <= -0.6 ? "buy" as const : "sell" as const;
  if (side === "sell" && !input.held) return null;
  if (input.h1_pct === null || input.h1_pct < -1.5 || input.h24_pct === null || input.h24_pct < -5) return null;
  const emaDistanceBps = Math.abs(input.price_usd / input.ema_close - 1) * 10_000;
  if (emaDistanceBps > 1.5 * input.atr_bps) return null;

  const edgeRatio = Math.min(0.5, Math.max(0.05, input.edge_ratio));
  const expectedReturnBps = Math.round(edgeRatio * input.atr_bps * Math.abs(input.bp) * 100) / 100;
  const withMargin = input.h1_pct >= 0 && input.h24_pct >= 0 && emaDistanceBps <= input.atr_bps;
  return {
    strategy_id: "bar_portion",
    token_mint: input.mint,
    symbol: input.symbol,
    side,
    horizon_sec: BAR_PORTION_HORIZON_SEC,
    expected_return_bps: expectedReturnBps,
    cost,
    expected_value_bps: toExpectedValue(expectedReturnBps, cost),
    confidence: withMargin ? 0.62 : 0.55,
    max_loss_bps: Math.round(BAR_PORTION_STOP_ATR_MULT * input.atr_bps * 100) / 100,
    liquidity_usd: input.liquidity_usd ?? 0,
    features: {
      bp: input.bp,
      atr_bps: input.atr_bps,
      ema_close: input.ema_close,
      ema_distance_bps: Math.round(emaDistanceBps * 100) / 100,
      h1_pct: input.h1_pct,
      h24_pct: input.h24_pct,
      edge_ratio: edgeRatio,
      score: Math.round(Math.abs(input.bp) * input.atr_bps * 100) / 100,
      direction: side,
    },
    reason: `Bar Portion ${input.bp.toFixed(2)} fade ${side}: expected ${expectedReturnBps.toFixed(1)}bp from ${input.atr_bps.toFixed(1)}bp ATR`,
  };
}
