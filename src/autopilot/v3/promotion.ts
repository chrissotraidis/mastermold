/**
 * V3 paper-promotion gate (2026-07-09): the evidence bar a shadow module must
 * clear before its candidates co-pilot the PAPER book alongside v2. Same
 * philosophy as the go-live gate — pure derivation, "not yet" by default, and
 * the promotion is to paper only: live routing keeps its own, stricter gate.
 *
 * The V3 shadow has been recording would-enter/skip snapshots and forward
 * labels since 2026-07-05; this converts that accumulating calibration record
 * into a yes/no with visible checks, so "the bot learns as it makes more good
 * trades than bad" is an auditable mechanism instead of a hope.
 */

import { realizedNetBps, type CalibrationSummary } from "./calibration";
import type { CandidateSnapshotRow } from "./candidate-store";
import type { ReplayPromotionEvidence } from "./replay/types";

export const PROMOTION_MIN_LABELED = 150;
export const PROMOTION_MIN_HIT_RATE = 0.5;
export const PROMOTION_MIN_ENTERS = 40;
export const PROMOTION_MIN_NET_EXPECTANCY_BPS = 20;
export const PROMOTION_MIN_CALIBRATION_SLOPE = 0.3;
export const PROMOTION_MAX_CALIBRATION_SLOPE = 1.5;

/** Perp shorts are shadow evidence only until a Drift paper adapter exists. */
export function paperPromotionSnapshots(rows: CandidateSnapshotRow[], strategyId: string): CandidateSnapshotRow[] {
  return rows.filter((row) => row.strategy_id === strategyId && row.features.venue !== "drift_perp");
}

export function isPaperCopilotCandidate(candidate: { features: Record<string, number | string | boolean> }): boolean {
  return candidate.features.venue !== "drift_perp";
}

export type PromotionCheck = {
  key: "dataset" | "edge" | "hit_rate" | "not_inverted" | "net_expectancy" | "calibration" | "replay";
  label: string;
  pass: boolean;
  detail: string;
};

export type V3Promotion = {
  ready: boolean;
  checks: PromotionCheck[];
};

export function evaluateV3Promotion(calibration: CalibrationSummary, replay: ReplayPromotionEvidence | null = null): V3Promotion {
  const dataset: PromotionCheck = {
    key: "dataset",
    label: `≥${PROMOTION_MIN_LABELED} forward-labeled snapshots`,
    pass: calibration.labeled_snapshots >= PROMOTION_MIN_LABELED,
    detail: `${calibration.labeled_snapshots} labeled so far`,
  };

  const enterMean = calibration.enter_mean_2h_bps;
  const skipMean = calibration.skip_mean_2h_bps;
  const edge: PromotionCheck = {
    key: "edge",
    label: "would-enters realized a positive 2h mean, ahead of skips",
    pass: enterMean !== null && enterMean > 0 && (skipMean === null || enterMean > skipMean),
    detail:
      enterMean === null
        ? "no labeled would-enters yet"
        : `enters ${enterMean}bp vs skips ${skipMean ?? "n/a"}bp over 2h`,
  };

  const hitRate: PromotionCheck = {
    key: "hit_rate",
    label: `≥${PROMOTION_MIN_HIT_RATE * 100}% of would-enters beat their modeled cost`,
    pass: calibration.enter_hit_rate !== null && calibration.enter_hit_rate >= PROMOTION_MIN_HIT_RATE,
    detail: calibration.enter_hit_rate !== null ? `${Math.round(calibration.enter_hit_rate * 100)}% hit rate` : "no labeled enters yet",
  };

  // An inverted score (high-score bucket underperforming low) means the signal
  // is anti-predictive — the one outcome that must hard-block promotion.
  const buckets = calibration.score_buckets;
  const spread =
    buckets.length === 3 && buckets[2].mean_2h_bps !== null && buckets[0].mean_2h_bps !== null
      ? (buckets[2].mean_2h_bps ?? 0) - (buckets[0].mean_2h_bps ?? 0)
      : null;
  const notInverted: PromotionCheck = {
    key: "not_inverted",
    label: "high-score bucket does not underperform low",
    pass: spread === null ? false : spread > -10,
    detail: spread === null ? "insufficient scored coverage for buckets" : `high-vs-low spread ${spread.toFixed(0)}bp`,
  };

  const netExpectancy: PromotionCheck = {
    key: "net_expectancy",
    label: `≥${PROMOTION_MIN_NET_EXPECTANCY_BPS}bp net shadow expectancy after cost with ≥${PROMOTION_MIN_ENTERS} enters`,
    pass: calibration.enter_count >= PROMOTION_MIN_ENTERS && calibration.enter_net_mean_bps !== null && calibration.enter_net_mean_bps >= PROMOTION_MIN_NET_EXPECTANCY_BPS,
    detail: `${calibration.enter_count} enters at ${calibration.enter_net_mean_bps ?? "n/a"}bp net/trade`,
  };

  const calibrationSlope: PromotionCheck = {
    key: "calibration",
    label: `predicted-EV calibration slope ${PROMOTION_MIN_CALIBRATION_SLOPE}–${PROMOTION_MAX_CALIBRATION_SLOPE}`,
    pass: calibration.ev_realized_slope !== null && calibration.ev_realized_slope >= PROMOTION_MIN_CALIBRATION_SLOPE && calibration.ev_realized_slope <= PROMOTION_MAX_CALIBRATION_SLOPE,
    detail: calibration.ev_realized_slope === null ? "insufficient EV variance/coverage" : `slope ${calibration.ev_realized_slope}`,
  };

  const replayCheck: PromotionCheck = {
    key: "replay",
    label: "replay has ≥2 positive walk-forward quarters and survives 2× cost",
    pass: replay !== null && replay.positive_walk_forward_quarters >= 2 && replay.doubled_cost_positive,
    detail: replay === null ? "no operator-recorded replay evidence" : `${replay.positive_walk_forward_quarters} positive quarters; 2× cost ${replay.doubled_cost_positive ? "positive" : "failed"}`,
  };

  const checks = [dataset, edge, hitRate, notInverted, netExpectancy, calibrationSlope, replayCheck];
  return { ready: checks.every((check) => check.pass), checks };
}

export type V3Demotion = { demote: boolean; reasons: string[]; rolling_40_net_bps: number | null; calibration_slope: number | null };

/** Automatic downside-only circuit: it can remove paper authority, never grant it. */
export function evaluateV3Demotion(
  rows: CandidateSnapshotRow[],
  calibration: CalibrationSummary,
  paperTrades: ModulePaperTrade[] = [],
): V3Demotion {
  const strategyId = rows[0]?.strategy_id ?? paperTrades.find((trade) => trade.strategy_id)?.strategy_id ?? "";
  const buys = new Map<string, ModulePaperTrade[]>();
  const returns: number[] = [];
  for (const trade of paperTrades.filter((row) => row.mode === "paper" && row.strategy_id === strategyId).sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))) {
    if (trade.side === "buy") {
      buys.set(trade.mint, [...(buys.get(trade.mint) ?? []), trade]);
      continue;
    }
    const queue = buys.get(trade.mint) ?? []; const buy = queue.shift(); buys.set(trade.mint, queue);
    if (buy && buy.value_usd > 0) returns.push(((trade.value_usd - trade.fee_usd - buy.value_usd - buy.fee_usd) / buy.value_usd) * 10_000);
  }
  const newest = returns.slice(-40);
  const rolling = newest.length === 40 ? newest.reduce((sum, value) => sum + value, 0) / 40 : null;
  const reasons: string[] = [];
  if (rolling !== null && rolling < -15) reasons.push(`rolling 40 net expectancy ${rolling.toFixed(1)}bp/trade below -15bp`);
  if (calibration.ev_realized_slope !== null && (calibration.ev_realized_slope < 0.2 || calibration.ev_realized_slope > 2)) {
    reasons.push(`EV calibration slope ${calibration.ev_realized_slope} outside 0.2–2.0`);
  }
  return { demote: reasons.length > 0, reasons, rolling_40_net_bps: rolling, calibration_slope: calibration.ev_realized_slope };
}

export type V3LiveCandidateInput = {
  existing_go_live_gate_passes: boolean;
  paper_observation_days: number;
  paper_net_bps: number;
  module_risk_halts: number;
};

export function evaluateV3LiveCandidate(input: V3LiveCandidateInput): { ready: boolean; reasons: string[] } {
  const reasons = [
    !input.existing_go_live_gate_passes ? "existing go-live gate is not open" : null,
    input.paper_observation_days < 28 ? `${input.paper_observation_days}/28 paper days` : null,
    input.paper_net_bps < 0 ? `paper net ${input.paper_net_bps}bp is negative` : null,
    input.module_risk_halts > 0 ? `${input.module_risk_halts} module risk halt(s)` : null,
  ].filter((reason): reason is string => reason !== null);
  return { ready: reasons.length === 0, reasons };
}

export type ModulePaperTrade = {
  ts: string;
  side: "buy" | "sell";
  mint: string;
  value_usd: number;
  fee_usd: number;
  strategy_id?: string;
  mode: "paper" | "live";
};

export type V3LiveCandidate = ReturnType<typeof evaluateV3LiveCandidate> & {
  paper_observation_days: number;
  paper_round_trips: number;
  paper_net_bps: number | null;
  module_risk_halts: number;
};

/** Pair module-tagged paper fills FIFO; legacy/untagged fills cannot qualify. */
export function evaluateModuleLiveCandidate(input: {
  trades: ModulePaperTrade[];
  strategy_id: string;
  now_ms: number;
  existing_go_live_gate_passes: boolean;
  module_risk_halts: number;
}): V3LiveCandidate {
  const rows = input.trades.filter((trade) => trade.mode === "paper" && trade.strategy_id === input.strategy_id)
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  const buys = new Map<string, ModulePaperTrade[]>();
  const returns: number[] = [];
  for (const row of rows) {
    if (row.side === "buy") {
      buys.set(row.mint, [...(buys.get(row.mint) ?? []), row]);
      continue;
    }
    const queue = buys.get(row.mint) ?? [];
    const buy = queue.shift();
    buys.set(row.mint, queue);
    if (!buy || !(buy.value_usd > 0)) continue;
    returns.push(((row.value_usd - row.fee_usd - buy.value_usd - buy.fee_usd) / buy.value_usd) * 10_000);
  }
  const first = rows[0] ? Date.parse(rows[0].ts) : input.now_ms;
  const days = Math.max(0, (input.now_ms - first) / 86_400_000);
  const net = returns.length ? returns.reduce((sum, value) => sum + value, 0) / returns.length : null;
  const verdict = evaluateV3LiveCandidate({
    existing_go_live_gate_passes: input.existing_go_live_gate_passes,
    paper_observation_days: days,
    paper_net_bps: net ?? -Infinity,
    module_risk_halts: input.module_risk_halts,
  });
  if (returns.length === 0) verdict.reasons.push("no completed module-attributed paper round trips");
  return {
    ...verdict, ready: verdict.ready && returns.length > 0,
    paper_observation_days: Math.round(days * 100) / 100,
    paper_round_trips: returns.length,
    paper_net_bps: net === null ? null : Math.round(net * 100) / 100,
    module_risk_halts: input.module_risk_halts,
  };
}
