/**
 * Local data backups (2026-07-10): `.data/` is the system's accumulated
 * evidence — every decision, forward label, param change, and play grade.
 * It lives on one machine and this project has already lost it once
 * (2026-07-02). One dated snapshot per day, kept outside the repo.
 *
 * Snapshots are assembled in a private staging directory and renamed into
 * place only after every store copies successfully. SQLite is captured with
 * `VACUUM INTO`; JSON writers already use temp+rename. A same-day directory
 * therefore means a complete snapshot, never a partial retry poison.
 *
 *   MASTERMOLD_BACKUP_DIR   default ~/.mastermold/backups
 *   MASTERMOLD_BACKUP_KEEP  snapshots retained, default 60
 */

import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, join } from "node:path";

import { openSqliteDatabase, resolveSqlitePath } from "../autopilot/sqlite";

export const DEFAULT_BACKUP_KEEP = 60;

// Existing snapshots are integrity-checked once per process/day, not on every
// 20-second daemon tick. A restart clears this and verifies the snapshot again.
const verifiedSnapshots = new Set<string>();

export type BackupResult = {
  /** Absolute path of the snapshot directory, or null when skipped. */
  path: string | null;
  skipped: boolean;
  files: string[];
  pruned: string[];
};

export type BackupStatus = {
  status: "fresh" | "stale" | "missing" | "unavailable";
  directory: string;
  latest_snapshot: string | null;
  created_at: string | null;
  age_hours: number | null;
  files: string[];
  detail: string;
};

export type RestoreDrillResult = {
  ok: boolean;
  snapshot: string | null;
  files: string[];
  detail: string;
};

export function backupDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.MASTERMOLD_BACKUP_DIR?.trim() || join(/* turbopackIgnore: true */ homedir(), ".mastermold", "backups");
}

function keepCount(env: NodeJS.ProcessEnv): number {
  const raw = Number(env.MASTERMOLD_BACKUP_KEEP);
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : DEFAULT_BACKUP_KEEP;
}

function snapshotName(nowMs: number): string {
  return `snapshot-${new Date(nowMs).toISOString().slice(0, 10)}`;
}

/** Complete dated snapshot directories, oldest first. */
function listSnapshots(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^snapshot-\d{4}-\d{2}-\d{2}$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

function snapshotFiles(snapshot: string): string[] {
  return readdirSync(snapshot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && (entry.name.endsWith(".json") || /\.(db|sqlite)$/i.test(entry.name)))
    .map((entry) => entry.name)
    .sort();
}

/** Read-only operator status. A backup older than 36 hours is stale. */
export function getBackupStatus(
  options: { nowMs?: number; env?: NodeJS.ProcessEnv } = {},
): BackupStatus {
  const env = options.env ?? process.env;
  const nowMs = options.nowMs ?? Date.now();
  const directory = backupDir(env);
  try {
    const latest = listSnapshots(directory).at(-1);
    if (!latest) {
      return {
        status: "missing",
        directory,
        latest_snapshot: null,
        created_at: null,
        age_hours: null,
        files: [],
        detail: "No complete backup snapshot exists.",
      };
    }
    const path = join(directory, latest);
    const createdAtMs = statSync(path).mtimeMs;
    const ageHours = Math.max(0, (nowMs - createdAtMs) / 3_600_000);
    const files = snapshotFiles(path);
    const status = files.length === 0 ? "unavailable" : ageHours <= 36 ? "fresh" : "stale";
    return {
      status,
      directory,
      latest_snapshot: path,
      created_at: new Date(createdAtMs).toISOString(),
      age_hours: Math.round(ageHours * 10) / 10,
      files,
      detail: files.length === 0
        ? "The latest snapshot contains no restorable stores."
        : status === "fresh"
          ? "A snapshot was created within the last 36 hours."
          : "The latest snapshot is older than 36 hours.",
    };
  } catch {
    return {
      status: "unavailable",
      directory,
      latest_snapshot: null,
      created_at: null,
      age_hours: null,
      files: [],
      detail: "The backup directory cannot be inspected.",
    };
  }
}

/**
 * Copy the newest snapshot into an isolated temp directory and validate every
 * JSON and SQLite store. The live `.data` directory is never read or written.
 */
export function runRestoreDrill(
  options: { snapshot?: string; env?: NodeJS.ProcessEnv } = {},
): RestoreDrillResult {
  const snapshot = options.snapshot ?? getBackupStatus({ env: options.env }).latest_snapshot;
  if (!snapshot) return { ok: false, snapshot: null, files: [], detail: "No snapshot is available to verify." };

  let isolated: string | null = null;
  let files: string[] = [];
  try {
    files = snapshotFiles(snapshot);
    if (files.length === 0) {
      return { ok: false, snapshot, files, detail: "The snapshot contains no restorable stores." };
    }
    isolated = mkdtempSync(join(tmpdir(), "mastermold-restore-drill-"));
    for (const name of files) {
      const restored = join(isolated, name);
      copyFileSync(join(snapshot, name), restored);
      if (name.endsWith(".json")) {
        JSON.parse(readFileSync(restored, "utf8"));
      } else {
        const db = openSqliteDatabase(restored);
        try {
          const row = db.prepare("PRAGMA integrity_check").get() as { integrity_check?: string } | undefined;
          if (row?.integrity_check !== "ok") throw new Error("SQLite integrity check failed");
        } finally {
          db.close();
        }
      }
    }
    return { ok: true, snapshot, files, detail: "Isolated restore copy passed JSON and SQLite integrity checks." };
  } catch {
    return { ok: false, snapshot, files, detail: "The isolated restore copy failed an integrity check." };
  } finally {
    if (isolated) rmSync(isolated, { recursive: true, force: true });
  }
}

/**
 * Take today's snapshot unless a valid same-day snapshot already exists.
 * Never throws: failures return `{ path: null }` for the daemon to alert.
 */
export function runDailyBackup(
  options: { dataDir?: string; nowMs?: number; env?: NodeJS.ProcessEnv } = {},
): BackupResult {
  const env = options.env ?? process.env;
  const nowMs = options.nowMs ?? Date.now();
  const dataDir = options.dataDir ?? ".data";
  const targetRoot = backupDir(env);
  const target = join(targetRoot, snapshotName(nowMs));
  let staging: string | null = null;

  try {
    if (existsSync(target)) {
      if (verifiedSnapshots.has(target)) return { path: target, skipped: true, files: [], pruned: [] };
      const verified = runRestoreDrill({ snapshot: target, env });
      if (!verified.ok) return { path: null, skipped: false, files: [], pruned: [] };
      verifiedSnapshots.add(target);
      return { path: target, skipped: true, files: [], pruned: [] };
    }
    if (!existsSync(dataDir)) return { path: null, skipped: true, files: [], pruned: [] };
    mkdirSync(targetRoot, { recursive: true, mode: 0o700 });
    staging = mkdtempSync(join(targetRoot, ".snapshot-partial-"));

    const files: string[] = [];
    for (const name of readdirSync(dataDir)) {
      const source = join(dataDir, name);
      if (name.endsWith(".json")) {
        const destination = join(staging, name);
        copyFileSync(source, destination);
        chmodSync(destination, 0o600);
        files.push(name);
      } else if (/\.(db|sqlite)$/i.test(name) && resolveSqlitePath(source) === source) {
        const destination = join(staging, name);
        if (existsSync(destination)) unlinkSync(destination);
        const db = openSqliteDatabase(source);
        try {
          db.exec(`VACUUM INTO '${destination.replace(/'/g, "''")}'`);
        } finally {
          db.close();
        }
        chmodSync(destination, 0o600);
        files.push(name);
      }
    }

    if (files.length === 0) throw new Error("No restorable stores found");
    renameSync(staging, target);
    staging = null;
    verifiedSnapshots.add(target);

    const snapshots = listSnapshots(targetRoot);
    const excess = snapshots.slice(0, Math.max(0, snapshots.length - keepCount(env)));
    for (const name of excess) rmSync(join(targetRoot, name), { recursive: true, force: true });

    return { path: target, skipped: false, files, pruned: excess.map((name) => basename(name)) };
  } catch {
    if (staging) rmSync(staging, { recursive: true, force: true });
    return { path: null, skipped: false, files: [], pruned: [] };
  }
}
