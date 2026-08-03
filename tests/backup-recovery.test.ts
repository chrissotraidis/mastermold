/// <reference types="bun" />

import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openSqliteDatabase } from "../src/autopilot/sqlite";
import { getBackupStatus, runDailyBackup, runRestoreDrill } from "../src/db/backup";

const NOW = Date.parse("2026-08-03T12:00:00Z");

function env(root: string): NodeJS.ProcessEnv {
  return { MASTERMOLD_BACKUP_DIR: root } as unknown as NodeJS.ProcessEnv;
}

function dataDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "mm-recovery-data-"));
  writeFileSync(join(dir, "mastermold.db.json"), JSON.stringify({ ok: true }));
  const db = openSqliteDatabase(join(dir, "autopilot.sqlite"));
  db.exec("CREATE TABLE proof (id INTEGER PRIMARY KEY)");
  db.close();
  return dir;
}

describe("backup recovery readiness", () => {
  test("creates an atomic snapshot and proves an isolated restore", () => {
    const root = mkdtempSync(join(tmpdir(), "mm-recovery-out-"));
    const result = runDailyBackup({ dataDir: dataDir(), nowMs: NOW, env: env(root) });

    expect(result.path).not.toBeNull();
    expect(readdirSync(root).some((name) => name.startsWith(".snapshot-partial-"))).toBe(false);
    expect(runRestoreDrill({ snapshot: result.path! })).toMatchObject({
      ok: true,
      files: ["autopilot.sqlite", "mastermold.db.json"],
    });
    expect(getBackupStatus({ nowMs: NOW + 60_000, env: env(root) })).toMatchObject({
      status: "fresh",
      latest_snapshot: result.path,
    });
    expect(getBackupStatus({ nowMs: Date.now() + 37 * 3_600_000, env: env(root) }).status).toBe("stale");
  });

  test("does not bless an empty or corrupt same-day directory", () => {
    const root = mkdtempSync(join(tmpdir(), "mm-recovery-out-"));
    const target = join(root, "snapshot-2026-08-03");
    mkdirSync(target);
    writeFileSync(join(target, "mastermold.db.json"), "not-json");

    const result = runDailyBackup({ dataDir: dataDir(), nowMs: NOW, env: env(root) });
    expect(result).toMatchObject({ path: null, skipped: false });
    expect(runRestoreDrill({ snapshot: target }).ok).toBe(false);
  });

  test("cleans staging when a source store cannot be copied", () => {
    const root = mkdtempSync(join(tmpdir(), "mm-recovery-out-"));
    const source = dataDir();
    writeFileSync(join(source, "broken.sqlite"), "not a sqlite database");

    const result = runDailyBackup({ dataDir: source, nowMs: NOW, env: env(root) });
    expect(result.path).toBeNull();
    expect(existsSync(join(root, "snapshot-2026-08-03"))).toBe(false);
    expect(readdirSync(root)).toEqual([]);
  });
});
