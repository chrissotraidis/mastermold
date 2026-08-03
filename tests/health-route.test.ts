/// <reference types="bun" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { GET as CORE_HEALTH_GET } from "@/app/api/health/route";
import { __resetAutopilotStoreForTests, autopilotStore } from "@/src/autopilot/store";
import { __resetStoreForTests, store } from "@/src/db/store";
import { buildDailyReport } from "@/src/db/daily-report";
import { getPortfolio } from "@/src/db/portfolio";

let prevDb: string | undefined;
let prevAutopilotDb: string | undefined;
let prevEngine: string | undefined;

beforeEach(() => {
  prevDb = process.env.MASTERMOLD_DB;
  prevAutopilotDb = process.env.AUTOPILOT_DB;
  prevEngine = process.env.ENGINE_OUT_DIR;
  process.env.MASTERMOLD_DB = join(mkdtempSync(join(tmpdir(), "mm-health-")), "db.sqlite");
  process.env.AUTOPILOT_DB = join(mkdtempSync(join(tmpdir(), "mm-health-autopilot-")), "autopilot.sqlite");
  process.env.ENGINE_OUT_DIR = mkdtempSync(join(tmpdir(), "mm-engine-empty-"));
  __resetStoreForTests();
  __resetAutopilotStoreForTests();
});

afterEach(() => {
  if (prevDb === undefined) delete process.env.MASTERMOLD_DB;
  else process.env.MASTERMOLD_DB = prevDb;
  if (prevAutopilotDb === undefined) delete process.env.AUTOPILOT_DB;
  else process.env.AUTOPILOT_DB = prevAutopilotDb;
  if (prevEngine === undefined) delete process.env.ENGINE_OUT_DIR;
  else process.env.ENGINE_OUT_DIR = prevEngine;
  __resetStoreForTests();
  __resetAutopilotStoreForTests();
});

describe("health routes", () => {
  test("GIVEN RDS checks health WHEN /api/health is requested THEN Web3 daemon state is reported honestly", async () => {
    const response = CORE_HEALTH_GET();
    const body = await response.json() as {
      status: string;
      details_url: string;
      checks: {
        database: { status: string; backend: string };
        daily_report: { status: string };
        engine: { status: string };
        autopilot: { status: string; mode: string; daemon: string; entry_authority: string };
      };
      web3_operator_runbook?: unknown;
    };

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.details_url).toBe("/api/autopilot");
    expect(body.checks.database.status).toBe("ok");
    expect(body.checks.daily_report.status).toBe("missing");
    expect(body.checks.engine.status).toBe("absent");
    expect(body.checks.autopilot).toMatchObject({
      status: "ok",
      mode: "off",
      daemon: "offline",
      entry_authority: "retired",
    });
    expect(body.web3_operator_runbook).toBeUndefined();
  });

  test("GIVEN a report was generated today from stale inputs WHEN health is requested THEN readiness stays limited", async () => {
    const createdAt = new Date().toISOString();
    const report = buildDailyReport({ createdAt, portfolio: getPortfolio(), rows: [] });
    report.freshness.portfolio_stale = true;
    report.freshness.stale = true;
    report.freshness.portfolio_as_of = "2026-05-01T00:00:00.000Z";
    store().upsertDailyReport({ id: report.id, run_date: report.run_date, created_at: report.created_at, data: report });

    const response = CORE_HEALTH_GET();
    const body = await response.json() as {
      readiness: { status: string; reasons: string[] };
      checks: { daily_report: { status: string; input_stale: boolean; portfolio_as_of: string } };
    };

    expect(response.status).toBe(200);
    expect(body.checks.daily_report).toMatchObject({
      status: "partial",
      input_stale: true,
      portfolio_as_of: "2026-05-01T00:00:00.000Z",
    });
    expect(body.readiness.status).toBe("limited");
    expect(body.readiness.reasons).toContain("The daily report is missing or stale.");
  });
  test("GIVEN paper mode lacks a fresh heartbeat WHEN health is requested THEN health degrades", async () => {
    autopilotStore().updateBotState({
      mode: "paper",
      last_tick_at: new Date(Date.now() - 11 * 60_000).toISOString(),
    });

    const response = CORE_HEALTH_GET();
    const body = await response.json() as {
      status: string;
      checks: { autopilot: { status: string; mode: string; daemon: string } };
    };

    expect(response.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.checks.autopilot).toMatchObject({
      status: "degraded",
      mode: "paper",
      daemon: "offline",
    });
  });
});
