import type { SqliteDatabase } from "@/src/autopilot/sqlite";

type BunSqliteModule = { Database?: new (path: string) => SqliteDatabase };
type NodeSqliteModule = { DatabaseSync?: new (path: string) => SqliteDatabase };

/**
 * Opens the brain database in both supported server runtimes. Next can run
 * under Bun in local development, where bundling removes import.meta.require;
 * process.getBuiltinModule remains available and is invisible to Turbopack.
 */
export function openPolymarketSqlite(path: string): SqliteDatabase {
  const getBuiltinModule = (process as unknown as { getBuiltinModule?: (id: string) => unknown }).getBuiltinModule;
  if (typeof getBuiltinModule === "function") {
    try {
      const bun = getBuiltinModule.call(process, "bun:sqlite") as BunSqliteModule;
      if (bun?.Database) return new bun.Database(path);
    } catch {
      // Node does not expose bun:sqlite.
    }
    try {
      const node = getBuiltinModule.call(process, "node:sqlite") as NodeSqliteModule;
      if (node?.DatabaseSync) return new node.DatabaseSync(path);
    } catch {
      // Fall through to the fail-closed error.
    }
  }
  throw new Error("Polymarket brain requires bun:sqlite or node:sqlite (Node >= 22.5).");
}
