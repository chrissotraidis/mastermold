/// <reference types="bun" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { GET as CORE_HEALTH_GET } from "@/app/api/health/route";
import { __resetStoreForTests } from "@/src/db/store";

let prevDb: string | undefined;
let prevEngine: string | undefined;

beforeEach(() => {
  prevDb = process.env.MASTERMOLD_DB;
  prevEngine = process.env.ENGINE_OUT_DIR;
  process.env.MASTERMOLD_DB = join(mkdtempSync(join(tmpdir(), "mm-health-")), "db.sqlite");
  process.env.ENGINE_OUT_DIR = mkdtempSync(join(tmpdir(), "mm-engine-empty-"));
  __resetStoreForTests();
});

afterEach(() => {
  if (prevDb === undefined) delete process.env.MASTERMOLD_DB;
  else process.env.MASTERMOLD_DB = prevDb;
  if (prevEngine === undefined) delete process.env.ENGINE_OUT_DIR;
  else process.env.ENGINE_OUT_DIR = prevEngine;
  __resetStoreForTests();
});

describe("health routes", () => {
  test("GIVEN RDS checks core health WHEN /api/health is requested THEN the response stays core-product scoped", async () => {
    const response = CORE_HEALTH_GET();
    const body = await response.json() as {
      status: string;
      details_url: string;
      checks: {
        database: { status: string; backend: string };
        daily_report: { status: string };
        engine: { status: string };
      };
      web3_operator_runbook?: unknown;
    };

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.details_url).toBe("/api/autopilot");
    expect(body.checks.database.status).toBe("ok");
    expect(body.checks.daily_report.status).toBe("missing");
    expect(body.checks.engine.status).toBe("absent");
    expect(body.web3_operator_runbook).toBeUndefined();
  });
});
