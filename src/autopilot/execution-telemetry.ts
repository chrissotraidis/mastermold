import { medianRoundTripCostPct } from "./rehearsal-stats";
import type { BotTradeRow, RehearsalRow } from "./store";

export type LatencySummary = {
  day: string;
  sample_count: number;
  p50_decision_to_fill_ms: number | null;
  p95_decision_to_fill_ms: number | null;
};

function nearestRank(values: number[], quantile: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)];
}

export function summarizeDecisionToFill(trades: BotTradeRow[], day: string): LatencySummary {
  const durations = trades
    .filter((trade) => trade.ts.slice(0, 10) === day)
    .map((trade) =>
      typeof trade.t_decision_ms === "number" && typeof trade.t_fill_ms === "number"
        ? trade.t_fill_ms - trade.t_decision_ms
        : NaN,
    )
    .filter((duration) => Number.isFinite(duration) && duration >= 0);
  return {
    day,
    sample_count: durations.length,
    p50_decision_to_fill_ms: nearestRank(durations, 0.5),
    p95_decision_to_fill_ms: nearestRank(durations, 0.95),
  };
}

export function formatLatencySummary(summary: LatencySummary): string {
  if (summary.sample_count === 0) return `Execution latency ${summary.day}: n=0 (no timed fills).`;
  return `Execution latency ${summary.day}: n=${summary.sample_count}, decision-to-fill p50 ${summary.p50_decision_to_fill_ms}ms, p95 ${summary.p95_decision_to_fill_ms}ms.`;
}

export type ModelDrift = { mint: string; symbol: string; median_gap_bps: number };

/** A quoted-paper rehearsal gap is the residual model error, expressed here in bp. */
export function modelDriftAlerts(
  rows: RehearsalRow[],
  assets: Array<{ mint: string; symbol: string }>,
  thresholdBps = 25,
): ModelDrift[] {
  const alerts: ModelDrift[] = [];
  for (const asset of assets) {
    const medianPct = medianRoundTripCostPct(rows, asset.mint, 10);
    if (medianPct === null) continue;
    const medianGapBps = Math.round(medianPct * 100 * 100) / 100;
    if (Math.abs(medianGapBps) > thresholdBps) alerts.push({ ...asset, median_gap_bps: medianGapBps });
  }
  return alerts;
}
