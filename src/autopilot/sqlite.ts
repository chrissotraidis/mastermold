/**
 * Built-in SQLite loader for the autopilot store — no npm dependency.
 *
 * The autopilot db has TWO writers in TWO runtimes: the 20s daemon loop runs
 * under Bun (`bun run src/autopilot/daemon.ts`) and the Next control plane
 * runs under Node (`npm run dev` / standalone server). Bun ships `bun:sqlite`;
 * Node >= 22.5 ships `node:sqlite`. Both open the same on-disk format, and WAL
 * + busy_timeout make the cross-process reader/writer interleaving safe. This
 * module normalizes the two APIs to the tiny structural surface the store
 * needs (exec / prepare / close) and keeps the require() calls indirect so
 * bundlers never try to resolve the builtin specifiers statically.
 */

import { closeSync, openSync, readSync } from "node:fs";

/** SQL parameter values the store binds (row payloads are JSON text). */
export type SqliteParam = string | number | null;

export interface SqliteStatement {
  run(...params: SqliteParam[]): unknown;
  /** One row or null/undefined (bun returns null, node returns undefined). */
  get(...params: SqliteParam[]): unknown;
  all(...params: SqliteParam[]): unknown[];
}

export interface SqliteDatabase {
  /** Runs one or more statements; used for pragmas, DDL, and BEGIN/COMMIT. */
  exec(sql: string): unknown;
  prepare(sql: string): SqliteStatement;
  close(): void;
}

/**
 * Where the actual SQLite file lives for a configured `AUTOPILOT_DB` path.
 * Paths that already name a database (.db/.sqlite) are used as-is; anything
 * else (notably the legacy `.json` path) gets a sibling `<path>.sqlite` so the
 * env var keeps working unchanged across the migration.
 */
export function resolveSqlitePath(path: string): string {
  return /\.(db|sqlite)$/i.test(path) ? path : `${path}.sqlite`;
}

/** True when the file at `path` starts with the SQLite magic header. */
export function isSqliteFile(path: string): boolean {
  try {
    const fd = openSync(path, "r");
    try {
      const header = Buffer.alloc(16);
      const bytesRead = readSync(fd, header, 0, 16, 0);
      // The 16-byte magic is "SQLite format 3" followed by a NUL byte.
      return bytesRead >= 16 && header.toString("latin1", 0, 15) === "SQLite format 3" && header[15] === 0;
    } finally {
      closeSync(fd);
    }
  } catch {
    return false;
  }
}

type BunSqliteModule = { Database?: new (path: string) => SqliteDatabase };
type NodeSqliteModule = { DatabaseSync?: new (path: string) => SqliteDatabase };

/**
 * Open (creating if absent) a SQLite database with whichever builtin driver
 * this runtime provides. Throws when neither is available — the store has no
 * silent fallback by design (a store that cannot persist must never pretend).
 */
export function openSqliteDatabase(path: string): SqliteDatabase {
  // Bun: bun:sqlite (the daemon and the test runner).
  try {
    const req =
      (import.meta as unknown as { require?: (id: string) => unknown }).require ??
      (globalThis as unknown as { require?: (id: string) => unknown }).require;
    if (req) {
      const mod = req("bun:sqlite") as BunSqliteModule;
      if (mod?.Database) return new mod.Database(path);
    }
  } catch {
    // Not Bun (or bun:sqlite unavailable) — fall through to node:sqlite.
  }

  // Node >= 22.5: node:sqlite (the Next server). getBuiltinModule works from
  // any module system and is invisible to bundlers.
  const getBuiltinModule = (process as unknown as { getBuiltinModule?: (id: string) => unknown })
    .getBuiltinModule;
  if (typeof getBuiltinModule === "function") {
    try {
      const mod = getBuiltinModule.call(process, "node:sqlite") as NodeSqliteModule;
      if (mod?.DatabaseSync) return new mod.DatabaseSync(path);
    } catch {
      // fall through to the explicit error below
    }
  }

  throw new Error(
    "autopilot store requires a builtin SQLite driver: bun:sqlite (Bun) or node:sqlite (Node >= 22.5)",
  );
}
