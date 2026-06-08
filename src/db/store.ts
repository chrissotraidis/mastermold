/// <reference types="node" />

/**
 * Durable system of record (Phase 1.5).
 *
 * Master Mold V0 held operator-created journal entries, paper predictions, and alert
 * ack/feedback in module-level arrays that vanished on restart — fatal for the memory
 * loop, where a decision logged today must still exist when Phase B resolves it next
 * week. This module persists those facts behind the existing `src/db/` interfaces so
 * the page components and API routes are unchanged.
 *
 * Storage is `bun:sqlite` (zero new dependencies on Bun). It is loaded at runtime via
 * `import.meta.require` so a non-Bun runtime or a static bundler never chokes on the
 * builtin; if it is unavailable, the store transparently falls back to in-memory
 * arrays — exactly the old behaviour — so the zero-config boot invariant always holds.
 * Persistence is best-effort and never required to render.
 *
 * Rows are stored as JSON blobs plus the indexed columns each surface queries on
 * (`knowledge_time` for as-of replay, `round_id`, `run_date`), mirroring `schema.ts`.
 */

import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { DecisionJournalEntry, PaperPrediction } from "./schema";

export type AlertStateRow = { acknowledged: boolean; useful_feedback: boolean | null };

export type IngestedRunRow = {
  run_date: string;
  knowledge_time: string;
  ingested_at: string;
  data: unknown; // the run-meta payload (provider, models, cost, ...)
};

export interface PersistAdapter {
  readonly backend: "sqlite" | "memory";
  loggedJournalEntries(): DecisionJournalEntry[];
  addJournalEntry(entry: DecisionJournalEntry): void;
  submittedPredictions(): PaperPrediction[];
  addPrediction(prediction: PaperPrediction): void;
  getAlertState(id: string): AlertStateRow | undefined;
  setAlertState(id: string, state: AlertStateRow): void;
  /** Idempotent by run_date: returns false if this run was already ingested. */
  markRunIngested(runDate: string, knowledgeTime: string, payload: unknown): boolean;
  isRunIngested(runDate: string): boolean;
  ingestedRunDates(): string[];
  /** Full ingested-run rows (newest first) for run history / cost retention. */
  ingestedRuns(): IngestedRunRow[];
}

// --- bun:sqlite adapter -----------------------------------------------------

function dbPath(): string {
  return process.env.MASTERMOLD_DB ?? join(process.cwd(), ".data", "mastermold.db");
}

function loadSqlite(): { Database: new (path: string) => SqliteDb } | null {
  try {
    const req =
      (import.meta as unknown as { require?: (id: string) => unknown }).require ??
      (globalThis as unknown as { require?: (id: string) => unknown }).require;
    if (!req) return null;
    return req("bun:sqlite") as { Database: new (path: string) => SqliteDb };
  } catch {
    return null;
  }
}

// Minimal structural type for the bits of bun:sqlite we use.
interface SqliteStatement {
  run(...params: unknown[]): unknown;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}
interface SqliteDb {
  run(sql: string): unknown;
  query(sql: string): SqliteStatement;
  exec?(sql: string): unknown;
}

class SqliteAdapter implements PersistAdapter {
  readonly backend = "sqlite" as const;
  private db: SqliteDb;

  constructor(db: SqliteDb) {
    this.db = db;
    this.db.run(`
      CREATE TABLE IF NOT EXISTS journal_entries (
        id TEXT PRIMARY KEY,
        knowledge_time TEXT NOT NULL,
        logged_at TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_journal_knowledge_time ON journal_entries(knowledge_time);
      CREATE TABLE IF NOT EXISTS paper_predictions (
        id TEXT PRIMARY KEY,
        knowledge_time TEXT NOT NULL,
        round_id TEXT NOT NULL,
        submitted_at TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_paper_round ON paper_predictions(round_id);
      CREATE TABLE IF NOT EXISTS alert_state (
        id TEXT PRIMARY KEY,
        acknowledged INTEGER NOT NULL,
        useful_feedback INTEGER
      );
      CREATE TABLE IF NOT EXISTS engine_runs (
        run_date TEXT PRIMARY KEY,
        knowledge_time TEXT NOT NULL,
        ingested_at TEXT NOT NULL,
        data TEXT NOT NULL
      );
    `);
  }

  loggedJournalEntries(): DecisionJournalEntry[] {
    return this.db
      .query("SELECT data FROM journal_entries")
      .all()
      .map((row) => JSON.parse((row as { data: string }).data) as DecisionJournalEntry);
  }

  addJournalEntry(entry: DecisionJournalEntry): void {
    this.db
      .query(
        "INSERT OR REPLACE INTO journal_entries (id, knowledge_time, logged_at, data) VALUES (?, ?, ?, ?)",
      )
      .run(entry.id, entry.knowledge_time, entry.logged_at, JSON.stringify(entry));
  }

  submittedPredictions(): PaperPrediction[] {
    return this.db
      .query("SELECT data FROM paper_predictions")
      .all()
      .map((row) => JSON.parse((row as { data: string }).data) as PaperPrediction);
  }

  addPrediction(prediction: PaperPrediction): void {
    this.db
      .query(
        "INSERT OR REPLACE INTO paper_predictions (id, knowledge_time, round_id, submitted_at, data) VALUES (?, ?, ?, ?, ?)",
      )
      .run(
        prediction.id,
        prediction.knowledge_time,
        prediction.round_id,
        prediction.submitted_at,
        JSON.stringify(prediction),
      );
  }

  getAlertState(id: string): AlertStateRow | undefined {
    const row = this.db
      .query("SELECT acknowledged, useful_feedback FROM alert_state WHERE id = ?")
      .get(id) as { acknowledged: number; useful_feedback: number | null } | null;
    if (!row) return undefined;
    return {
      acknowledged: row.acknowledged === 1,
      useful_feedback: row.useful_feedback === null ? null : row.useful_feedback === 1,
    };
  }

  setAlertState(id: string, state: AlertStateRow): void {
    this.db
      .query("INSERT OR REPLACE INTO alert_state (id, acknowledged, useful_feedback) VALUES (?, ?, ?)")
      .run(
        id,
        state.acknowledged ? 1 : 0,
        state.useful_feedback === null ? null : state.useful_feedback ? 1 : 0,
      );
  }

  isRunIngested(runDate: string): boolean {
    const row = this.db.query("SELECT 1 AS present FROM engine_runs WHERE run_date = ?").get(runDate);
    return row !== null && row !== undefined;
  }

  markRunIngested(runDate: string, knowledgeTime: string, payload: unknown): boolean {
    if (this.isRunIngested(runDate)) return false;
    this.db
      .query(
        "INSERT OR IGNORE INTO engine_runs (run_date, knowledge_time, ingested_at, data) VALUES (?, ?, ?, ?)",
      )
      .run(runDate, knowledgeTime, new Date().toISOString(), JSON.stringify(payload ?? {}));
    return true;
  }

  ingestedRunDates(): string[] {
    return this.db
      .query("SELECT run_date FROM engine_runs ORDER BY run_date DESC")
      .all()
      .map((row) => (row as { run_date: string }).run_date);
  }

  ingestedRuns(): IngestedRunRow[] {
    return this.db
      .query("SELECT run_date, knowledge_time, ingested_at, data FROM engine_runs ORDER BY run_date DESC")
      .all()
      .map((row) => {
        const r = row as { run_date: string; knowledge_time: string; ingested_at: string; data: string };
        return {
          run_date: r.run_date,
          knowledge_time: r.knowledge_time,
          ingested_at: r.ingested_at,
          data: safeParse(r.data),
        };
      });
  }
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

// --- in-memory fallback (old behaviour) ------------------------------------

class MemoryAdapter implements PersistAdapter {
  readonly backend = "memory" as const;
  private journal: DecisionJournalEntry[] = [];
  private predictions: PaperPrediction[] = [];
  private alerts = new Map<string, AlertStateRow>();
  private runs = new Map<string, { knowledge_time: string; ingested_at: string; data: unknown }>();

  loggedJournalEntries() {
    return [...this.journal];
  }
  addJournalEntry(entry: DecisionJournalEntry) {
    this.journal = this.journal.filter((e) => e.id !== entry.id);
    this.journal.push(entry);
  }
  submittedPredictions() {
    return [...this.predictions];
  }
  addPrediction(prediction: PaperPrediction) {
    this.predictions = this.predictions.filter((p) => p.id !== prediction.id);
    this.predictions.push(prediction);
  }
  getAlertState(id: string) {
    return this.alerts.get(id);
  }
  setAlertState(id: string, state: AlertStateRow) {
    this.alerts.set(id, state);
  }
  isRunIngested(runDate: string) {
    return this.runs.has(runDate);
  }
  markRunIngested(runDate: string, knowledgeTime: string, payload: unknown) {
    if (this.runs.has(runDate)) return false;
    this.runs.set(runDate, {
      knowledge_time: knowledgeTime,
      ingested_at: new Date().toISOString(),
      data: payload,
    });
    return true;
  }
  ingestedRunDates() {
    return [...this.runs.keys()].sort((a, b) => b.localeCompare(a));
  }
  ingestedRuns(): IngestedRunRow[] {
    return [...this.runs.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([run_date, v]) => ({
        run_date,
        knowledge_time: v.knowledge_time,
        ingested_at: v.ingested_at,
        data: v.data,
      }));
  }
}

// --- singleton resolution --------------------------------------------------

let cached: PersistAdapter | null = null;

function build(): PersistAdapter {
  const sqlite = loadSqlite();
  if (sqlite) {
    try {
      const path = dbPath();
      if (path !== ":memory:") {
        const dir = dirname(path);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      }
      return new SqliteAdapter(new sqlite.Database(path));
    } catch {
      // fall through to memory if the db file can't be opened
    }
  }
  return new MemoryAdapter();
}

export function store(): PersistAdapter {
  if (!cached) cached = build();
  return cached;
}

/** Test seam: drop the cached adapter so the next store() rebuilds (e.g. reopen a db file). */
export function __resetStoreForTests(): void {
  cached = null;
}
