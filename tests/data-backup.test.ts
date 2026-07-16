/// <reference types="bun" />

/**
 * Daily .data backups: snapshot-per-day semantics (the directory is the
 * state), consistent SQLite copies via VACUUM INTO, retention pruning, and
 * the never-throws contract. Real temp dirs and a real SQLite file.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openSqliteDatabase } from "../src/autopilot/sqlite";
import { runDailyBackup, DEFAULT_BACKUP_KEEP } from "../src/db/backup";

const NOW = Date.parse("2026-07-10T12:00:00Z");

function makeDataDir(): string {
  const dataDir = mkdtempSync(join(tmpdir(), "mm-backup-data-"));
  writeFileSync(join(dataDir, "mastermold.db.json"), JSON.stringify({ journal: [1, 2, 3] }));
  const db = openSqliteDatabase(join(dataDir, "autopilot.db.json.sqlite"));
  db.exec("CREATE TABLE trades (id TEXT PRIMARY KEY, data TEXT)");
  db.prepare("INSERT INTO trades (id, data) VALUES (?, ?)").run("t1", "{}");
  db.close();
  return dataDir;
}

function env(backupRoot: string, keep?: number): NodeJS.ProcessEnv {
  return {
    MASTERMOLD_BACKUP_DIR: backupRoot,
    ...(keep !== undefined ? { MASTERMOLD_BACKUP_KEEP: String(keep) } : {}),
  } as unknown as NodeJS.ProcessEnv;
}

describe("runDailyBackup", () => {
  test("GIVEN live stores THEN one dated snapshot lands with a readable sqlite copy, and same-day reruns skip", () => {
    const dataDir = makeDataDir();
    const backupRoot = mkdtempSync(join(tmpdir(), "mm-backup-out-"));

    const first = runDailyBackup({ dataDir, nowMs: NOW, env: env(backupRoot) });
    expect(first.skipped).toBe(false);
    expect(first.path).toContain("snapshot-2026-07-10");
    expect(first.files.sort()).toEqual(["autopilot.db.json.sqlite", "mastermold.db.json"]);

    // The VACUUM'd copy is a complete, openable database.
    const copy = openSqliteDatabase(join(first.path!, "autopilot.db.json.sqlite"));
    const row = copy.prepare("SELECT COUNT(*) AS n FROM trades").get() as { n: number };
    copy.close();
    expect(row.n).toBe(1);

    const rerun = runDailyBackup({ dataDir, nowMs: NOW + 60_000, env: env(backupRoot) });
    expect(rerun.skipped).toBe(true);
    expect(rerun.path).toBe(first.path);
    expect(readdirSync(backupRoot)).toHaveLength(1);
  });

  test("GIVEN more snapshots than the retention count THEN the oldest are pruned", () => {
    const dataDir = makeDataDir();
    const backupRoot = mkdtempSync(join(tmpdir(), "mm-backup-out-"));
    for (let day = 1; day <= 3; day += 1) {
      mkdirSync(join(backupRoot, `snapshot-2026-07-0${day}`));
    }

    const result = runDailyBackup({ dataDir, nowMs: NOW, env: env(backupRoot, 2) });
    expect(result.skipped).toBe(false);
    expect(result.pruned).toEqual(["snapshot-2026-07-01", "snapshot-2026-07-02"]);
    const remaining = readdirSync(backupRoot).sort();
    expect(remaining).toEqual(["snapshot-2026-07-03", "snapshot-2026-07-10"].map((n) => n.replace("2026-07-10", "2026-07-10")));
    expect(remaining).toHaveLength(2);
    expect(DEFAULT_BACKUP_KEEP).toBe(60);
  });

  test("GIVEN a missing data dir or unwritable target THEN it degrades without throwing", () => {
    const backupRoot = mkdtempSync(join(tmpdir(), "mm-backup-out-"));
    const missing = runDailyBackup({ dataDir: join(tmpdir(), "does-not-exist-xyz"), nowMs: NOW, env: env(backupRoot) });
    expect(missing.path).toBeNull();
    expect(missing.skipped).toBe(true);

    const dataDir = makeDataDir();
    const unwritable = runDailyBackup({ dataDir, nowMs: NOW, env: env("/dev/null/impossible") });
    expect(unwritable.path).toBeNull();
    expect(existsSync("/dev/null/impossible")).toBe(false);
  });
});
