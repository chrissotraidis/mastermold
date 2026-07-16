/**
 * Local data backups (2026-07-10): `.data/` is the system's accumulated
 * evidence — every decision, forward label, param change, and play grade.
 * It lives on one machine and this project has already lost it once
 * (2026-07-02). One dated snapshot per day, kept outside the repo.
 *
 * Deliberately minimal: the backup directory IS the state (a snapshot named
 * for today means today is done — no flags, no schedule config), SQLite is
 * captured consistently via `VACUUM INTO` (safe against a live writer), and
 * JSON stores are plain copies (their writers use temp+rename, so a copy is
 * always a complete document). Restore is `cp` back into `.data/`.
 *
 *   MASTERMOLD_BACKUP_DIR   default ~/.mastermold/backups
 *   MASTERMOLD_BACKUP_KEEP  snapshots retained, default 60
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

import { openSqliteDatabase, resolveSqlitePath } from "../autopilot/sqlite";

export const DEFAULT_BACKUP_KEEP = 60;

export type BackupResult = {
  /** Absolute path of the snapshot directory, or null when skipped. */
  path: string | null;
  skipped: boolean;
  files: string[];
  pruned: string[];
};

export function backupDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.MASTERMOLD_BACKUP_DIR?.trim() || join(homedir(), ".mastermold", "backups");
}

function keepCount(env: NodeJS.ProcessEnv): number {
  const raw = Number(env.MASTERMOLD_BACKUP_KEEP);
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : DEFAULT_BACKUP_KEEP;
}

function snapshotName(nowMs: number): string {
  return `snapshot-${new Date(nowMs).toISOString().slice(0, 10)}`;
}

/** Dated snapshot directories, oldest first. */
function listSnapshots(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.startsWith("snapshot-"))
    .sort();
}

/**
 * Take today's snapshot unless one already exists. Copies every `.json` store
 * in `.data/` and a VACUUM'd copy of every SQLite store; prunes beyond the
 * retention count. Never throws — a failed backup must not take down the
 * caller (the daemon), so failures return `{ path: null }` for the caller to
 * log.
 */
export function runDailyBackup(
  options: { dataDir?: string; nowMs?: number; env?: NodeJS.ProcessEnv } = {},
): BackupResult {
  const env = options.env ?? process.env;
  const nowMs = options.nowMs ?? Date.now();
  const dataDir = options.dataDir ?? ".data";
  const targetRoot = backupDir(env);
  const target = join(targetRoot, snapshotName(nowMs));

  try {
    if (existsSync(target)) return { path: target, skipped: true, files: [], pruned: [] };
    if (!existsSync(dataDir)) return { path: null, skipped: true, files: [], pruned: [] };
    mkdirSync(target, { recursive: true });

    const files: string[] = [];
    for (const name of readdirSync(dataDir)) {
      const source = join(dataDir, name);
      if (name.endsWith(".json")) {
        copyFileSync(source, join(target, name));
        files.push(name);
      } else if (/\.(db|sqlite)$/i.test(name) && resolveSqlitePath(source) === source) {
        // Online-consistent copy; also naturally checkpoints the WAL.
        const destination = join(target, name);
        if (existsSync(destination)) unlinkSync(destination); // VACUUM INTO refuses to overwrite
        const db = openSqliteDatabase(source);
        try {
          db.exec(`VACUUM INTO '${destination.replace(/'/g, "''")}'`);
        } finally {
          db.close();
        }
        files.push(name);
      }
      // -wal/-shm/logs are transient by definition: never backed up.
    }

    const snapshots = listSnapshots(targetRoot);
    const excess = snapshots.slice(0, Math.max(0, snapshots.length - keepCount(env)));
    for (const name of excess) rmSync(join(targetRoot, name), { recursive: true, force: true });

    return { path: target, skipped: false, files, pruned: excess.map((name) => basename(name)) };
  } catch {
    return { path: null, skipped: false, files: [], pruned: [] };
  }
}
