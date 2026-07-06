/**
 * Feature builder (V3 plan §6.2) — the pure bridge from raw market data the
 * daemon already collects (per-mint price windows + DexScreener feed rows) into
 * the `TokenFeatures` xsec consumes and the `RegimeInput` the classifier reads.
 *
 * The daemon holds a rolling ~13-minute price window (40 × 20s samples) per
 * mint and a per-symbol feed row (1h/24h change, volume, liquidity). This
 * module turns those into short-horizon returns, a volume z-proxy, and the
 * breadth/vol aggregates — no IO, fully testable.
 */

import type { MarketFeedRow } from "../feed";
import type { RegimeInput } from "./regime";
import type { TokenFeatures } from "./xsec";

const TICK_MS = 20_000;

/** Return over the last `minutes` of a price window, as a percent, or null. */
export function windowReturnOverMinutes(prices: number[], minutes: number): number | null {
  if (prices.length < 2) return null;
  const samples = Math.max(1, Math.round((minutes * 60_000) / TICK_MS));
  const startIdx = Math.max(0, prices.length - 1 - samples);
  const first = prices[startIdx];
  const last = prices[prices.length - 1];
  if (!Number.isFinite(first) || first <= 0 || !Number.isFinite(last)) return null;
  return ((last - first) / first) * 100;
}

/** Realized short-window volatility proxy: stdev of successive % changes. */
export function realizedVolPct(prices: number[]): number | null {
  if (prices.length < 3) return null;
  const rets: number[] = [];
  for (let i = 1; i < prices.length; i += 1) {
    if (prices[i - 1] > 0) rets.push(((prices[i] - prices[i - 1]) / prices[i - 1]) * 100);
  }
  if (rets.length < 2) return null;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length;
  return Math.sqrt(variance) * Math.sqrt(rets.length); // scale to the window
}

export type FeatureBuildInput = {
  symbol: string;
  mint: string;
  window: number[]; // chronological prices for this mint
  feed: MarketFeedRow | undefined; // DexScreener row for this symbol
  /** Rough baseline of this token's typical 1h volume, for the z-proxy. */
  volume_baseline_usd?: number | null;
  /** 4h return computed from persisted minute bars (the tick window is too short). */
  r_4h_pct?: number | null;
};

/** Build TokenFeatures for one token from its window + feed row. */
export function buildTokenFeatures(input: FeatureBuildInput): TokenFeatures {
  const { window, feed } = input;
  const vol24 = feed?.volume_h24_usd ?? null;
  const baseline = input.volume_baseline_usd ?? null;
  // Volume z-proxy: how the current 24h volume compares to a baseline, in
  // rough sigma. Without a persisted baseline this stays 0 (neutral).
  const volumeZ = vol24 !== null && baseline !== null && baseline > 0 ? (vol24 - baseline) / baseline : null;
  return {
    symbol: input.symbol,
    mint: input.mint,
    r_5m_pct: windowReturnOverMinutes(window, 5),
    r_1h_pct: feed?.change_h1_pct ?? null,
    r_4h_pct: input.r_4h_pct ?? null, // from persisted minute bars when available
    r_24h_pct: feed?.change_h24_pct ?? null,
    volume_z_1h: volumeZ,
    buy_sell_imbalance_5m: null, // needs trade-flow data (DexScreener txns); ML-era
    realized_vol_15m_pct: realizedVolPct(window),
    liquidity_usd: feed?.liquidity_usd ?? null,
  };
}

/** Aggregate the universe's feed rows into the regime classifier's input. */
export function buildRegimeInput(rows: {
  sol: MarketFeedRow | undefined;
  btc: MarketFeedRow | undefined;
  all: MarketFeedRow[];
}): RegimeInput {
  const withH1 = rows.all.filter((r) => r.change_h1_pct !== null);
  const upFrac = withH1.length > 0 ? withH1.filter((r) => (r.change_h1_pct ?? 0) > 0).length / withH1.length : 0.5;
  const meanAbs1h = withH1.length > 0 ? withH1.reduce((a, r) => a + Math.abs(r.change_h1_pct ?? 0), 0) / withH1.length : 0;
  return {
    sol_return_1h_pct: rows.sol?.change_h1_pct ?? null,
    sol_return_24h_pct: rows.sol?.change_h24_pct ?? null,
    btc_return_24h_pct: rows.btc?.change_h24_pct ?? null,
    breadth_up_frac: upFrac,
    realized_vol_1h_pct: meanAbs1h,
  };
}
