/// <reference types="bun" />

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("operations truthfulness contracts", () => {
  test("launchers describe the implemented remote access boundary", () => {
    const launchers = `${source("bin/up")}\n${source("bin/zo-start")}`;

    expect(launchers).not.toMatch(/NO authentication/i);
    expect(launchers).toContain("remote requests require configured operator/viewer credentials");
    expect(launchers).toContain("Never send Basic Auth over plain HTTP");
  });

  test("deployment checks separate service health from decision readiness", () => {
    const check = source("scripts/deployment-check.mjs");
    const operations = source("docs/OPERATIONS.md");

    expect(check).toContain('health?.status === "ok"');
    expect(check).toContain('readiness?.decision_support === "ready" ? "OK" : "WARN"');
    expect(check).toContain('readiness?.live_trading === "locked" ? "OK" : "FAIL"');
    expect(operations).toContain("process health is not evidence quality or profitability");
    expect(operations).toContain("Same-VPS snapshots alone are not");
    expect(operations).toContain("A configured badge without a received test is not");
  });

  test("backup retention documentation matches the 60-snapshot implementation", () => {
    expect(source("src/db/backup.ts")).toContain("DEFAULT_BACKUP_KEEP = 60");
    expect(source("docs/DEPLOYMENT.md")).toContain("snapshots keep 60 dated copies by default");
  });
});
