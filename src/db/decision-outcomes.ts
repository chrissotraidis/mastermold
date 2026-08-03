import type { DailyReport, DailyReportPlayAction } from "./daily-report";
import type { DecisionJournalEntry } from "./schema";
import type { DailyReportRow } from "./store";

export type AutomaticDecisionOutcome = {
  journal_entry_id: string;
  symbol: string;
  action: "add" | "trim";
  entry_close: number;
  evaluation_close: number;
  entry_at: string;
  evaluated_at: string;
  horizon_days: number;
  asset_return_pct: number;
  equal_weight_hold_return_pct: number;
  edge_vs_hold_pct: number;
  verdict: "right" | "wrong" | "flat";
};

const FLAT_EDGE_PCT = 0.75;

/**
 * Price-grade directional Today calls from the first qualifying later report.
 * This is a pure derivation: it never overwrites the operator's process review
 * and remains stable as more reports arrive.
 */
export function deriveAutomaticDecisionOutcomes(
  entries: DecisionJournalEntry[],
  reportRows: DailyReportRow[],
): AutomaticDecisionOutcome[] {
  const reports = reportRows
    .map((row) => normalizeReport(row.data))
    .filter((report): report is DailyReport => report !== null)
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const byId = new Map(reports.map((report) => [report.id, report]));
  const outcomes: AutomaticDecisionOutcome[] = [];

  for (const entry of entries) {
    const source = entry.decision_source;
    if (!source || source.kind !== "today" || !isDirectional(source.action)) continue;
    const bounds = parseMinimumHorizonDays(entry.horizon);
    if (!bounds) continue;
    const recommendationReport = byId.get(source.report_id);
    if (!recommendationReport) continue;

    const evaluated = reports.find((report) => {
      if (Date.parse(report.created_at) <= Date.parse(entry.logged_at)) return false;
      const ageDays = (Date.parse(report.created_at) - Date.parse(entry.logged_at)) / 86_400_000;
      if (ageDays < bounds) return false;
      return currentClose(report, source.symbol) !== null;
    });
    if (!evaluated) continue;

    const evaluationClose = currentClose(evaluated, source.symbol);
    if (evaluationClose === null || source.entry_close <= 0) continue;
    const baselineReturn = equalWeightHoldReturn(recommendationReport, evaluated);
    if (baselineReturn === null) continue;

    const assetReturn = ((evaluationClose - source.entry_close) / source.entry_close) * 100;
    const edge = source.action === "add"
      ? assetReturn - baselineReturn
      : baselineReturn - assetReturn;
    outcomes.push({
      journal_entry_id: entry.id,
      symbol: source.symbol,
      action: source.action,
      entry_close: source.entry_close,
      evaluation_close: evaluationClose,
      entry_at: source.market_as_of,
      evaluated_at: evaluated.created_at,
      horizon_days: round((Date.parse(evaluated.created_at) - Date.parse(entry.logged_at)) / 86_400_000),
      asset_return_pct: round(assetReturn),
      equal_weight_hold_return_pct: round(baselineReturn),
      edge_vs_hold_pct: round(edge),
      verdict: Math.abs(edge) < FLAT_EDGE_PCT ? "flat" : edge > 0 ? "right" : "wrong",
    });
  }

  return outcomes;
}

function equalWeightHoldReturn(entryReport: DailyReport, evaluationReport: DailyReport) {
  const returns = entryReport.holdings_scanned.flatMap((symbol) => {
    const from = currentClose(entryReport, symbol);
    const to = currentClose(evaluationReport, symbol);
    return from !== null && from > 0 && to !== null ? [((to - from) / from) * 100] : [];
  });
  if (returns.length === 0) return null;
  return returns.reduce((sum, value) => sum + value, 0) / returns.length;
}

function currentClose(report: DailyReport, symbol: string) {
  const row = report.market_rows.find((candidate) => candidate.symbol.toUpperCase() === symbol.toUpperCase());
  return row?.status === "refreshed" && typeof row.latest_close === "number" && row.latest_close > 0
    ? row.latest_close
    : null;
}

function normalizeReport(value: unknown): DailyReport | null {
  if (!value || typeof value !== "object") return null;
  const report = value as Partial<DailyReport>;
  return typeof report.id === "string" &&
    typeof report.created_at === "string" &&
    Array.isArray(report.holdings_scanned) &&
    Array.isArray(report.market_rows)
    ? report as DailyReport
    : null;
}

function parseMinimumHorizonDays(value: string) {
  const match = value.toLowerCase().match(/(\d+)\s*(?:-|to)?\s*(\d+)?\s*(day|week|month)s?/);
  if (!match) return null;
  const unit = match[3] === "month" ? 30 : match[3] === "week" ? 7 : 1;
  return Number.parseInt(match[1], 10) * unit;
}

function isDirectional(action: DailyReportPlayAction): action is "add" | "trim" {
  return action === "add" || action === "trim";
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
