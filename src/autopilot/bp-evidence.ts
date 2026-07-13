import type { BotTradeRow, VetoWatchRow } from "./store";
import type { PriceObservation } from "./v3/candidate-store";

export type BpTimingEvidence = {
  veto_samples: number;
  veto_mean_30m_bps: number | null;
  taken_samples: number;
  taken_mean_30m_bps: number | null;
  ready: boolean;
};

function mean(values: number[]): number | null {
  return values.length > 0 ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : null;
}

function returnBps(from: number, to: number): number {
  return ((to / from) - 1) * 10_000;
}

export function summarizeBpTimingEvidence(
  vetoes: VetoWatchRow[],
  trades: BotTradeRow[],
  priceSeriesByMint: Map<string, PriceObservation[]>,
): BpTimingEvidence {
  const vetoReturns = vetoes
    .filter((row) => row.done && row.mark_30m_usd !== null && row.price_at_veto_usd > 0)
    .map((row) => returnBps(row.price_at_veto_usd, row.mark_30m_usd as number));
  const takenReturns: number[] = [];
  for (const trade of trades) {
    if (trade.side !== "buy" || trade.price_usd <= 0) continue;
    const tradeMs = Date.parse(trade.ts);
    if (!Number.isFinite(tradeMs)) continue;
    const target = tradeMs + 30 * 60_000;
    const observation = (priceSeriesByMint.get(trade.mint) ?? []).find(
      (row) => row.ts >= target && row.ts <= target + 10 * 60_000,
    );
    if (observation) takenReturns.push(returnBps(trade.price_usd, observation.price));
  }
  return {
    veto_samples: vetoReturns.length,
    veto_mean_30m_bps: mean(vetoReturns),
    taken_samples: takenReturns.length,
    taken_mean_30m_bps: mean(takenReturns),
    ready: vetoReturns.length >= 40,
  };
}

export function describeBpTimingEvidence(evidence: BpTimingEvidence): string {
  if (!evidence.ready) return `BP TIMING EVIDENCE: ${evidence.veto_samples}/40 vetoes marked; do not judge the overlay yet.`;
  return `BP TIMING EVIDENCE: vetoed moments mean ${evidence.veto_mean_30m_bps ?? "n/a"}bp over 30m (n=${evidence.veto_samples}) vs taken buys ${evidence.taken_mean_30m_bps ?? "n/a"}bp (n=${evidence.taken_samples}). If vetoes do not underperform taken buys, delete the gate.`;
}
