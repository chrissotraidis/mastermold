import type { DailyReport, DailyReportPlay } from "./daily-report";
import { createDecisionJournalEntry } from "./journal";
import { recordProductMetric } from "./metrics";
import { store } from "./store";

export type TodayDecisionResponseKind = "save" | "watch" | "pass";

export type TodayDecisionResponse = {
  id: string;
  report_id: string;
  play_id: string;
  symbol: string;
  suggested_action: DailyReportPlay["action"];
  response: TodayDecisionResponseKind;
  journal_entry_id: string | null;
  created_at: string;
};

const PRIOR_PASS_WINDOW_MS = 14 * 24 * 60 * 60_000;

export function todayDecisionInbox(report: DailyReport | null): DailyReportPlay[] {
  if (!report) return [];
  return report.plays
    .filter((play) => !wasRecentlyPassedUnchanged(report, play))
    .slice(0, 3);
}

export function reportCanCreateJournalCall(report: DailyReport): boolean {
  const partialOnly = report.freshness.skipped_symbols.length > 0;
  const portfolioStale = report.freshness.portfolio_stale ?? (report.freshness.stale && !partialOnly);
  return !portfolioStale && !/sample|fallback/i.test(report.portfolio_source);
}

export function playCanCreateJournalCall(report: DailyReport, play: DailyReportPlay): boolean {
  if (!reportCanCreateJournalCall(report)) return false;
  const row = report.market_rows.find((candidate) => candidate.symbol.toUpperCase() === play.symbol.toUpperCase());
  return row?.status === "refreshed" && typeof row.latest_close === "number" && row.latest_close > 0;
}

export function getTodayDecisionResponses(reportId: string): Map<string, TodayDecisionResponse> {
  const responses = new Map<string, TodayDecisionResponse>();
  for (const event of store().productEvents(500)) {
    if (event.event !== "today_decision_response") continue;
    const parsed = responseFromEvent(event);
    if (!parsed || parsed.report_id !== reportId || responses.has(parsed.play_id)) continue;
    responses.set(parsed.play_id, parsed);
  }
  return responses;
}

export function recordTodayDecisionResponse(input: {
  report: DailyReport;
  play: DailyReportPlay;
  response: TodayDecisionResponseKind;
}): TodayDecisionResponse {
  const { report, play, response } = input;
  if (!todayDecisionInbox(report).some((candidate) => candidate.id === play.id)) {
    throw new Error("That play is not in the current decision inbox.");
  }

  const existing = getTodayDecisionResponses(report.id).get(play.id);
  if (existing?.response === response) return existing;
  if (existing?.response === "save") {
    throw new Error("A saved scored call is immutable. Record its outcome in Journal instead.");
  }

  let journalEntryId: string | null = null;
  if (response === "save") {
    if (!playCanCreateJournalCall(report, play)) {
      throw new Error("Refresh this symbol and a personal portfolio before saving it as a scored call.");
    }
    const marketRow = report.market_rows.find((candidate) => candidate.symbol.toUpperCase() === play.symbol.toUpperCase());
    const entry = createDecisionJournalEntry({
      thesis: play.headline,
      signals: [
        `Operator response: save ${play.action} call`,
        `Portfolio source: ${report.portfolio_source}`,
        `Market source: ${report.market_source}`,
        `Entry market close: ${marketRow?.latest_close}`,
        `Market as of: ${report.freshness.market_as_of}`,
        ...play.why.slice(0, 3),
      ],
      conviction: confidenceScore(play.confidence),
      horizon: journalHorizon(play.horizon),
      falsification_condition:
        "The call is wrong if a later saved read removes its stated reason or the bear case becomes stronger before the review horizon.",
      decision_source: {
        kind: "today",
        report_id: report.id,
        play_id: play.id,
        symbol: play.symbol,
        action: play.action,
        market_as_of: report.freshness.market_as_of,
        entry_close: marketRow!.latest_close!,
      },
    });
    journalEntryId = entry.id;
    recordProductMetric({
      event: "decision_logged",
      surface: "today",
      entity_id: entry.id,
      value: entry.conviction,
      metadata: { horizon: entry.horizon, source_play_id: play.id },
    });
  }

  const event = recordProductMetric({
    event: "today_decision_response",
    surface: "today",
    entity_id: play.id,
    metadata: {
      report_id: report.id,
      play_id: play.id,
      symbol: play.symbol,
      suggested_action: play.action,
      response,
      previous_response: existing?.response ?? null,
      play_fingerprint: decisionPlayFingerprint(play),
      journal_entry_id: journalEntryId,
    },
  });

  return {
    id: event.id,
    report_id: report.id,
    play_id: play.id,
    symbol: play.symbol,
    suggested_action: play.action,
    response,
    journal_entry_id: journalEntryId,
    created_at: event.created_at,
  };
}

export function decisionPlayFingerprint(play: DailyReportPlay): string {
  const canonical = [play.symbol, play.action, play.headline, play.horizon, ...play.why]
    .join("|")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  let hash = 2_166_136_261;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `${play.symbol.toUpperCase()}:${play.action}:${(hash >>> 0).toString(36)}`;
}

function wasRecentlyPassedUnchanged(report: DailyReport, play: DailyReportPlay): boolean {
  const fingerprint = decisionPlayFingerprint(play);
  const cutoff = Date.parse(report.created_at) - PRIOR_PASS_WINDOW_MS;
  const latest = store().productEvents(500).find((event) => {
    if (event.event !== "today_decision_response") return false;
    const metadata = event.metadata as Record<string, unknown> | null;
    if (stringValue(metadata?.report_id) === report.id) return false;
    if (stringValue(metadata?.play_fingerprint) !== fingerprint) return false;
    return Date.parse(event.created_at) >= cutoff;
  });
  const metadata = latest?.metadata as Record<string, unknown> | null;
  return metadata?.response === "pass";
}

function responseFromEvent(event: ReturnType<ReturnType<typeof store>["productEvents"]>[number]): TodayDecisionResponse | null {
  const metadata = event.metadata as Record<string, unknown> | null;
  const response = metadata?.response;
  if (response !== "save" && response !== "watch" && response !== "pass") return null;
  const reportId = stringValue(metadata?.report_id);
  const playId = stringValue(metadata?.play_id) || event.entity_id;
  const symbol = stringValue(metadata?.symbol);
  const suggestedAction = stringValue(metadata?.suggested_action);
  if (!reportId || !playId || !symbol || !isPlayAction(suggestedAction)) return null;
  return {
    id: event.id,
    report_id: reportId,
    play_id: playId,
    symbol,
    suggested_action: suggestedAction,
    response,
    journal_entry_id: stringValue(metadata?.journal_entry_id) || null,
    created_at: event.created_at,
  };
}

function confidenceScore(confidence: DailyReportPlay["confidence"]) {
  return confidence === "high" ? 8 : confidence === "medium" ? 6 : 3;
}

function journalHorizon(horizon: DailyReportPlay["horizon"]) {
  if (horizon === "days") return "1-5 days";
  if (horizon === "weeks") return "1-4 weeks";
  return "1-3 months";
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isPlayAction(value: string): value is DailyReportPlay["action"] {
  return value === "trim" || value === "add" || value === "hold" || value === "watch";
}
