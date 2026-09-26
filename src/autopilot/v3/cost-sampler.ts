/**
 * W3 (docs/research-2026-09/solana-web3-bots.md): measure what landing a
 * transaction actually costs instead of assuming it. Reads the public Jito
 * tip floor and the SOL price, converts to basis points of the bot's trade
 * size for a round trip, and compares with the cost model's fixed
 * priority + failed-transaction allowance. No transaction is sent.
 */
import { FAILED_TX_BPS, PRIORITY_FEE_BPS } from "./execution-cost";

export type CostSample = {
  sampled_at: string;
  notional_usd: number;
  sol_usd: number;
  tip_p50_bps: number;
  tip_p75_bps: number;
  tip_p95_bps: number;
  base_fee_bps: number;
  /** Round trip at the 75th-percentile tip, grossed up for failed attempts. */
  measured_round_trip_bps: number;
  modeled_round_trip_bps: number;
  failure_rate_assumed: number;
  verdict: "model_ok" | "model_understates";
};

const BASE_FEE_SOL = 0.000005; // one signature
/** Bot failure rate from the ISSTA 2025 study (arXiv version); final version reports higher. */
export const BOT_FAILURE_RATE = 0.58;

export function computeCostSample(input: {
  notional_usd: number;
  sol_usd: number;
  tips_sol: { p50: number; p75: number; p95: number };
  now?: Date;
}): CostSample {
  const toBps = (sol: number) => ((sol * input.sol_usd) / input.notional_usd) * 10_000;
  const perAttemptP75 = toBps(input.tips_sol.p75) + toBps(BASE_FEE_SOL);
  // Expected attempts per landed tx = 1 / (1 − failure rate); failed attempts still pay the base fee.
  const failedAttempts = BOT_FAILURE_RATE / (1 - BOT_FAILURE_RATE);
  const measured = 2 * (perAttemptP75 + failedAttempts * toBps(BASE_FEE_SOL));
  const modeled = PRIORITY_FEE_BPS + FAILED_TX_BPS;
  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    sampled_at: (input.now ?? new Date()).toISOString(),
    notional_usd: input.notional_usd,
    sol_usd: round(input.sol_usd),
    tip_p50_bps: round(toBps(input.tips_sol.p50)),
    tip_p75_bps: round(toBps(input.tips_sol.p75)),
    tip_p95_bps: round(toBps(input.tips_sol.p95)),
    base_fee_bps: round(toBps(BASE_FEE_SOL)),
    measured_round_trip_bps: round(measured),
    modeled_round_trip_bps: modeled,
    failure_rate_assumed: BOT_FAILURE_RATE,
    verdict: measured > modeled ? "model_understates" : "model_ok",
  };
}

const KEY = Symbol.for("mastermold.autopilot.costSamples");
type Holder = { [KEY]?: CostSample[] };

export function recentCostSamples(): CostSample[] {
  return (globalThis as Holder)[KEY] ?? [];
}

export async function sampleExecutionCosts(notionalUsd: number, fetcher: typeof fetch = fetch): Promise<CostSample | null> {
  const get = async (url: string) => {
    const response = await fetcher(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8_000) });
    return response.ok ? response.json() : null;
  };
  const [tips, price] = await Promise.all([
    get("https://bundles.jito.wtf/api/v1/bundles/tip_floor").catch(() => null),
    get("https://lite-api.jup.ag/price/v3?ids=So11111111111111111111111111111111111111112").catch(() => null),
  ]);
  const floor = Array.isArray(tips) ? (tips[0] as Record<string, number>) : null;
  const solUsd = Number((price as Record<string, { usdPrice?: number }> | null)?.So11111111111111111111111111111111111111112?.usdPrice);
  if (!floor || !Number.isFinite(solUsd) || solUsd <= 0) return null;
  const sample = computeCostSample({
    notional_usd: notionalUsd,
    sol_usd: solUsd,
    tips_sol: { p50: floor.landed_tips_50th_percentile, p75: floor.landed_tips_75th_percentile, p95: floor.landed_tips_95th_percentile },
  });
  (globalThis as Holder)[KEY] = [sample, ...recentCostSamples()].slice(0, 50);
  return sample;
}
