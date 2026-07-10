/**
 * Play accountability (2026-07-10): the daily report recommends actions on
 * real holdings (trim VOO, hold AAPL) — and until now nothing ever checked
 * whether those calls were right. The web3 lane grades every decision
 * against realized outcomes; the tradfi lane must meet the same bar or its
 * "learning" is a story.
 *
 * Pure derivation over the daily-report history the store already keeps:
 * each report carries its plays AND that day's closes (market_rows), so a
 * play from day D is graded against the first report ≥ N days later that
 * has the symbol's close. No new tables, no write path, recomputed on read —
 * the grade can never drift from the evidence.
 *
 * Only clearly DIRECTIONAL calls are graded (trim/sell say "it won't be
 * missed", buy/add say "it goes up"). hold/watch make no directional claim
 * and are counted as ungraded rather than pretending otherwise.
 */

import type { DailyReportRow } from "./store";

export type GradedPlay = {
  play_id: string;
  symbol: string;
  action: string;
  rec_date: string;
  rec_close: number;
  eval_date: string;
  eval_close: number;
  /** Symbol return from rec close to eval close, percent. */
  return_pct: number;
  verdict: "right" | "wrong" | "flat";
  horizon_days: number;
};

export type PlayTrackRecord = {
  graded: number;
  right: number;
  wrong: number;
  flat: number;
  /** right / (right + wrong); flat calls prove nothing either way. */
  hit_rate: number | null;
  avg_return_pct: number | null;
  /** Directional calls too young to grade yet. */
  pending: number;
};

export const GRADE_MIN_HORIZON_DAYS = 3;
/** Moves inside this band grade as "flat" — noise vindicates nobody. */
export const GRADE_FLAT_BAND_PCT = 0.75;

const BEARISH_ACTIONS = new Set(["trim", "sell", "reduce", "exit"]);
const BULLISH_ACTIONS = new Set(["buy", "add", "accumulate"]);

type ReportShape = {
  plays?: Array<{ id?: unknown; symbol?: unknown; action?: unknown }>;
  market_rows?: Array<{ symbol?: unknown; latest_close?: unknown }>;
};

function closesFrom(report: DailyReportRow): Map<string, number> {
  const data = (report.data ?? {}) as ReportShape;
  const closes = new Map<string, number>();
  for (const row of data.market_rows ?? []) {
    if (typeof row?.symbol === "string" && typeof row.latest_close === "number" && Number.isFinite(row.latest_close)) {
      closes.set(row.symbol, row.latest_close);
    }
  }
  return closes;
}

function daysBetween(fromDate: string, toDate: string): number {
  const from = Date.parse(fromDate);
  const to = Date.parse(toDate);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return (to - from) / (24 * 60 * 60_000);
}

/**
 * Grade every directional play old enough to judge. `reports` may arrive in
 * any order; one grade per play (the earliest qualifying evaluation report
 * wins, so grades are stable as history grows).
 */
export function gradePlayHistory(
  reports: DailyReportRow[],
  options: { min_horizon_days?: number; flat_band_pct?: number } = {},
): { graded: GradedPlay[]; pending: number } {
  const minHorizon = options.min_horizon_days ?? GRADE_MIN_HORIZON_DAYS;
  const flatBand = options.flat_band_pct ?? GRADE_FLAT_BAND_PCT;
  const ordered = [...reports].sort((a, b) => a.run_date.localeCompare(b.run_date));
  const graded: GradedPlay[] = [];
  let pending = 0;

  for (let index = 0; index < ordered.length; index += 1) {
    const report = ordered[index];
    const data = (report.data ?? {}) as ReportShape;
    const plays = data.plays ?? [];
    if (plays.length === 0) continue;
    const recCloses = closesFrom(report);

    for (const play of plays) {
      const symbol = typeof play?.symbol === "string" ? play.symbol : null;
      const action = typeof play?.action === "string" ? play.action.toLowerCase() : "";
      if (!symbol) continue;
      const bearish = BEARISH_ACTIONS.has(action);
      const bullish = BULLISH_ACTIONS.has(action);
      if (!bearish && !bullish) continue; // hold/watch: no directional claim
      const recClose = recCloses.get(symbol);
      if (recClose === undefined || recClose <= 0) continue;

      // Earliest later report that is past the horizon AND has this close.
      let evaluated = false;
      for (let later = index + 1; later < ordered.length; later += 1) {
        const evalReport = ordered[later];
        const horizon = daysBetween(report.run_date, evalReport.run_date);
        if (horizon < minHorizon) continue;
        const evalClose = closesFrom(evalReport).get(symbol);
        if (evalClose === undefined || evalClose <= 0) continue;

        const returnPct = ((evalClose - recClose) / recClose) * 100;
        const verdict: GradedPlay["verdict"] =
          Math.abs(returnPct) < flatBand ? "flat" : (returnPct < 0) === bearish ? "right" : "wrong";
        graded.push({
          play_id: typeof play.id === "string" ? play.id : `${report.run_date}:${symbol}:${action}`,
          symbol,
          action,
          rec_date: report.run_date,
          rec_close: recClose,
          eval_date: evalReport.run_date,
          eval_close: evalClose,
          return_pct: Math.round(returnPct * 100) / 100,
          verdict,
          horizon_days: Math.round(horizon * 10) / 10,
        });
        evaluated = true;
        break;
      }
      if (!evaluated) pending += 1;
    }
  }
  return { graded, pending };
}

export function playTrackRecord(input: { graded: GradedPlay[]; pending: number }): PlayTrackRecord {
  const right = input.graded.filter((play) => play.verdict === "right").length;
  const wrong = input.graded.filter((play) => play.verdict === "wrong").length;
  const flat = input.graded.filter((play) => play.verdict === "flat").length;
  const returns = input.graded.map((play) => play.return_pct);
  return {
    graded: input.graded.length,
    right,
    wrong,
    flat,
    hit_rate: right + wrong > 0 ? Math.round((right / (right + wrong)) * 100) / 100 : null,
    avg_return_pct:
      returns.length > 0
        ? Math.round((returns.reduce((sum, value) => sum + value, 0) / returns.length) * 100) / 100
        : null,
    pending: input.pending,
  };
}

/** One honest sentence for the Today page; null when there is nothing to say. */
export function describeTrackRecord(record: PlayTrackRecord): string | null {
  if (record.graded === 0 && record.pending === 0) return null;
  if (record.graded === 0) {
    return `${record.pending} directional call${record.pending === 1 ? "" : "s"} awaiting the ${GRADE_MIN_HORIZON_DAYS}-day grade.`;
  }
  const scored = `${record.right}/${record.right + record.wrong} directional calls right over ${GRADE_MIN_HORIZON_DAYS}+ days`;
  const flatNote = record.flat > 0 ? `, ${record.flat} flat` : "";
  const pendingNote = record.pending > 0 ? ` · ${record.pending} awaiting grade` : "";
  return `Track record: ${scored}${flatNote}${pendingNote}.`;
}
