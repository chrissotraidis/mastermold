import { basename } from "node:path";
import { NextResponse } from "next/server";
import { getAutopilotState } from "@/src/autopilot/control";
import { STRATEGY_ENTRY_AUTHORITY, STRATEGY_RETIREMENT_REASON } from "@/src/autopilot/strategy-view";
import { getBackupStatus } from "@/src/db/backup";
import { getLatestDailyReport, type DailyReport } from "@/src/db/daily-report";
import { getEngineStatus, type EngineStatus } from "@/src/db/engine-data";
import { store } from "@/src/db/store";
import { evaluatePolymarketPaperAuthority } from "@/src/polymarket/authority";
import { safePolymarketBrainReport } from "@/src/polymarket/brain";
import { polymarketStore } from "@/src/polymarket/store";
import { masterMoldReadiness } from "@/src/product/readiness";

export function GET() {
  const now = new Date();
  const database = databaseHealth();
  const engine = engineHealth(getEngineStatus(null, { now: now.getTime() }));
  const dailyReport = dailyReportHealth(getLatestDailyReport(), now);
  const backup = backupHealth();
  const autopilot = autopilotHealth();
  const polymarket = polymarketHealth();
  const status = database.status === "ok" && autopilot.status === "ok" && polymarket.status === "ok"
    ? "ok"
    : "degraded";
  const readiness = masterMoldReadiness({
    databaseStatus: database.status,
    dailyReportStatus: dailyReport.status,
    portfolioSource: dailyReport.portfolio_source,
    engineStatus: engine.status,
    autopilotEntryAuthority: STRATEGY_ENTRY_AUTHORITY,
    polymarketPaperStrategy: polymarket.status === "ok" ? polymarket.paper_strategy : "none",
    polymarketStreamStatus: polymarket.status === "ok" ? polymarket.stream_status : "unavailable",
  });

  return NextResponse.json(
    {
      status,
      service: "mastermold",
      readiness,
      checks: {
        database,
        daily_report: dailyReport,
        backup,
        engine,
        autopilot,
        polymarket,
      },
      details_url: "/api/autopilot",
      polymarket_details_url: "/api/polymarket",
    },
    {
      status: status === "ok" ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

function backupHealth() {
  const backup = getBackupStatus();
  return {
    status: backup.status,
    latest_snapshot: backup.latest_snapshot ? basename(backup.latest_snapshot) : null,
    created_at: backup.created_at,
    age_hours: backup.age_hours,
    files: backup.files.length,
    detail: backup.detail,
    restore_drill_command: "npm run backup:verify",
  };
}

function autopilotHealth() {
  try {
    const state = getAutopilotState();
    if (state.runtime_unavailable) {
      return {
        status: "error" as const,
        mode: state.mode,
        daemon: state.daemon,
        detail: state.runtime_unavailable,
      };
    }

    const armed = state.mode === "paper" || state.mode === "live";
    return {
      status: armed && state.daemon !== "live" ? "degraded" as const : "ok" as const,
      mode: state.mode,
      kill_switch: state.kill_switch,
      daemon: state.daemon,
      daemon_pid: state.daemon_pid,
      last_tick_at: state.last_tick_at,
      entry_authority: STRATEGY_ENTRY_AUTHORITY,
      entry_authority_detail: STRATEGY_RETIREMENT_REASON,
    };
  } catch {
    return {
      status: "error" as const,
      detail: "Autopilot local store is unavailable.",
    };
  }
}

function polymarketHealth() {
  try {
    const state = polymarketStore().state();
    const brain = safePolymarketBrainReport();
    const paperAuthority = evaluatePolymarketPaperAuthority(brain);
    return {
      status: "ok" as const,
      mode: state.mode,
      kill_switch: state.kill_switch,
      live_execution: "locked" as const,
      paper_strategy: paperAuthority.available ? "momentum" as const : "none" as const,
      paper_authority_detail: paperAuthority.detail,
      weather_authority: "shadow-only" as const,
      brain_status: brain.status,
      brain_observations: brain.observations,
      brain_labeled_1h: brain.labeled_1h,
      brain_resolved_observations: brain.calibration.resolved_observations,
      brain_mean_brier_score: brain.calibration.mean_brier_score,
      stream_status: brain.stream.status,
      stream_subscribed_tokens: brain.stream.subscribed_tokens,
      stream_retained_events: brain.stream.event_count_24h,
      stream_retained_coverage_hours: brain.stream.retained_coverage_hours,
      stream_trade_labels_1m: brain.stream.labeled_trades_1m,
      stream_last_message_at: brain.stream.last_message_at,
    };
  } catch {
    return {
      status: "error" as const,
      detail: "Polymarket local store is unavailable.",
    };
  }
}

function databaseHealth() {
  try {
    const adapter = store();
    adapter.productEvents(1);
    return {
      status: "ok" as const,
      backend: adapter.backend,
    };
  } catch (error) {
    return {
      status: "error" as const,
      detail: error instanceof Error ? error.message : "Database check failed.",
    };
  }
}

function dailyReportHealth(report: DailyReport | null, now: Date) {
  if (!report) {
    return {
      status: "missing" as const,
      latest_report_date: null,
      created_at: null,
      market_source: null,
      portfolio_source: null,
    };
  }

  const currentDate = report.run_date === isoRunDate(now);
  const inputsStale = report.freshness.portfolio_stale;
  return {
    status: !currentDate ? "stale" as const : inputsStale ? "partial" as const : "fresh" as const,
    latest_report_date: report.run_date,
    created_at: report.created_at,
    market_source: report.market_source,
    portfolio_source: report.portfolio_source,
    portfolio_as_of: report.freshness.portfolio_as_of,
    market_as_of: report.freshness.market_as_of,
    input_stale: inputsStale,
    portfolio_stale: report.freshness.portfolio_stale,
    market_partial: report.freshness.market_partial,
    skipped_symbols: report.freshness.skipped_symbols,
  };
}

function engineHealth(status: EngineStatus) {
  if (status.state === "live") {
    return {
      status: "live" as const,
      run_date: status.bundle.run.run_date,
      knowledge_time: status.bundle.run.knowledge_time,
      freshness: status.freshness,
      data_refresh: stringStage(status.bundle.run.stages.data_refresh),
      data_refresh_detail: status.bundle.run.stages.data_refresh_detail ?? null,
    };
  }

  if (status.state === "invalid") {
    return {
      status: "invalid" as const,
      reason: status.reason,
      file: status.file ?? null,
      data_refresh: null,
    };
  }

  return {
    status: "absent" as const,
    data_refresh: null,
  };
}

function stringStage(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function isoRunDate(now: Date) {
  return now.toISOString().slice(0, 10);
}
