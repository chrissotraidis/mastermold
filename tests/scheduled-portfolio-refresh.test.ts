/// <reference types="bun" />

import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { refreshPortfolioContext } from "@/src/db/scan";

const envKeys = [
  "MONARCH_MCP_COMMAND",
  "MONARCH_MCP_URL",
  "MONARCH_MCP_FIXTURE_PATH",
] as const;

const previous = new Map(envKeys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of envKeys) {
    const value = previous.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("scheduled read-only portfolio refresh", () => {
  test("missing Monarch configuration is an explicit non-mutating preflight", async () => {
    for (const key of envKeys) delete process.env[key];
    const result = await refreshPortfolioContext("2026-08-03T12:00:00.000Z");
    expect(result.status).toBe("not_configured");
    expect(result.synced_at).toBeNull();
    expect(result.data_boundary).toContain("Read-only portfolio preflight");
  });

  test("the scheduler refreshes portfolio context before the optional engine gate", () => {
    const source = readFileSync(join(process.cwd(), "instrumentation.ts"), "utf8");
    const refresh = source.indexOf("await refreshPortfolioContext");
    const engineGate = source.indexOf("if (scanRunnerAvailable())");
    const report = source.indexOf("await runDailyReportRefresh()");
    expect(refresh).toBeGreaterThan(0);
    expect(refresh).toBeLessThan(engineGate);
    expect(engineGate).toBeLessThan(report);
  });

  test("review truth names scheduled Monarch without implying continuous brokerage sync", () => {
    const copy = readFileSync(join(process.cwd(), "src/product/capabilities.ts"), "utf8");
    expect(copy).toContain("Configured Monarch can refresh each morning");
    expect(copy).toContain("other account imports must be rerun");
    expect(copy).not.toContain("Monarch and imported holdings are snapshots. They do not refresh automatically");
  });
});
