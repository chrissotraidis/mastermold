import { NextResponse } from "next/server";
import { getLatestDailyReport, type DailyReport } from "@/src/db/daily-report";
import { getEngineStatus, type EngineStatus } from "@/src/db/engine-data";
import { store } from "@/src/db/store";

export function GET() {
  const now = new Date();
  const database = databaseHealth();
  const engine = engineHealth(getEngineStatus(null, { now: now.getTime() }));
  const dailyReport = dailyReportHealth(getLatestDailyReport(), now);
  const status = database.status === "ok" ? "ok" : "degraded";

  return NextResponse.json(
    {
      status,
      service: "mastermold",
      checks: {
        database,
        daily_report: dailyReport,
        engine,
      },
      details_url: "/api/autopilot",
    },
    {
      status: status === "ok" ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
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

  return {
    status: report.run_date === isoRunDate(now) ? "fresh" as const : "stale" as const,
    latest_report_date: report.run_date,
    created_at: report.created_at,
    market_source: report.market_source,
    portfolio_source: report.portfolio_source,
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
