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

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  BrainRun,
  DecisionJournalEntry,
  MarketMemoryFact,
  OutcomeScore,
  PaperPrediction,
  PaperTradingRound,
  RoundScore,
} from "./schema";

export type AlertStateRow = { acknowledged: boolean; useful_feedback: boolean | null };

export type ManualHoldingRow = {
  id: string;
  symbol: string;
  asset_name: string;
  asset_class: "equity" | "crypto" | "defi" | "cash";
  venue: string;
  quantity: number;
  price: number;
  cost_basis: number;
  daily_change_pct: number;
  created_at: string;
  updated_at: string;
};

export type ImportedHoldingRow = {
  id: string;
  service: "coinbase" | "robinhood" | "onchain_wallet";
  account_id: string;
  account_label: string;
  symbol: string;
  asset_name: string;
  asset_class: "equity" | "crypto" | "defi" | "cash";
  venue: string;
  quantity: number;
  price: number;
  cost_basis: number;
  daily_change_pct: number;
  imported_at: string;
  as_of: string;
};

export type IngestedRunRow = {
  run_date: string;
  knowledge_time: string;
  ingested_at: string;
  data: unknown; // the run-meta payload (provider, models, cost, ...)
};

export type ProductMetricEventRow = {
  id: string;
  event: string;
  surface: string;
  entity_id: string | null;
  value: number | null;
  metadata: unknown;
  created_at: string;
};

export type Web3PaperLedgerRow = {
  id: "default";
  cash_usd: number;
  realized_pnl_usd: number;
  cycle: number;
  updated_at: string;
  data: unknown;
};

export type Web3ExecutionConfigRow = {
  id: "default";
  updated_at: string;
  data: unknown;
};

export type Web3ExecutionAuditRow = {
  id: string;
  created_at: string;
  data: unknown;
};

export interface PersistAdapter {
  readonly backend: "sqlite" | "memory";
  loggedJournalEntries(): DecisionJournalEntry[];
  addJournalEntry(entry: DecisionJournalEntry): void;
  outcomeScores(): OutcomeScore[];
  addOutcomeScore(score: OutcomeScore): void;
  submittedPredictions(): PaperPrediction[];
  addPrediction(prediction: PaperPrediction): void;
  /** Rolling rounds the app opened locally (beyond the seeded ones). */
  paperRounds(): PaperTradingRound[];
  upsertPaperRound(round: PaperTradingRound): void;
  /** Locally computed round scores (price-based resolution). */
  roundScores(): RoundScore[];
  upsertRoundScore(score: RoundScore): void;
  manualHoldings(): ManualHoldingRow[];
  upsertManualHolding(holding: ManualHoldingRow): void;
  deleteManualHolding(id: string): void;
  importedHoldings(): ImportedHoldingRow[];
  replaceImportedHoldings(service: ImportedHoldingRow["service"], holdings: ImportedHoldingRow[]): void;
  getAlertState(id: string): AlertStateRow | undefined;
  setAlertState(id: string, state: AlertStateRow): void;
  /** Idempotent by run_date: returns false if this run was already ingested. */
  markRunIngested(runDate: string, knowledgeTime: string, payload: unknown): boolean;
  isRunIngested(runDate: string): boolean;
  ingestedRunDates(): string[];
  /** Full ingested-run rows (newest first) for run history / cost retention. */
  ingestedRuns(): IngestedRunRow[];
  recordProductEvent(event: ProductMetricEventRow): void;
  productEvents(limit?: number): ProductMetricEventRow[];
  brainRuns(limit?: number): BrainRun[];
  upsertBrainRun(run: BrainRun): void;
  marketMemoryFacts(limit?: number): MarketMemoryFact[];
  upsertMarketMemoryFact(fact: MarketMemoryFact): void;
  web3PaperLedger(): Web3PaperLedgerRow | null;
  upsertWeb3PaperLedger(row: Web3PaperLedgerRow): void;
  resetWeb3PaperLedger(): void;
  web3ExecutionConfig(): Web3ExecutionConfigRow | null;
  upsertWeb3ExecutionConfig(row: Web3ExecutionConfigRow): void;
  web3ExecutionAudits(limit?: number): Web3ExecutionAuditRow[];
  appendWeb3ExecutionAudit(row: Web3ExecutionAuditRow): void;
}

type StoreSnapshot = {
  journal: DecisionJournalEntry[];
  outcomes: OutcomeScore[];
  predictions: PaperPrediction[];
  paper_rounds: PaperTradingRound[];
  round_scores: RoundScore[];
  manual_holdings: ManualHoldingRow[];
  imported_holdings: ImportedHoldingRow[];
  alerts: Record<string, AlertStateRow>;
  runs: Record<string, { knowledge_time: string; ingested_at: string; data: unknown }>;
  product_events: ProductMetricEventRow[];
  brain_runs: BrainRun[];
  market_memory: MarketMemoryFact[];
  web3_paper_ledger: Web3PaperLedgerRow | null;
  web3_execution_config: Web3ExecutionConfigRow | null;
  web3_execution_audits: Web3ExecutionAuditRow[];
};

const emptySnapshot = (): StoreSnapshot => ({
  journal: [],
  outcomes: [],
  predictions: [],
  paper_rounds: [],
  round_scores: [],
  manual_holdings: [],
  imported_holdings: [],
  alerts: {},
  runs: {},
  product_events: [],
  brain_runs: [],
  market_memory: [],
  web3_paper_ledger: null,
  web3_execution_config: null,
  web3_execution_audits: [],
});

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
      CREATE TABLE IF NOT EXISTS outcome_scores (
        id TEXT PRIMARY KEY,
        journal_entry_id TEXT NOT NULL,
        knowledge_time TEXT NOT NULL,
        resolved_at TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_outcome_scores_entry ON outcome_scores(journal_entry_id);
      CREATE INDEX IF NOT EXISTS idx_outcome_scores_knowledge_time ON outcome_scores(knowledge_time);
      CREATE TABLE IF NOT EXISTS paper_predictions (
        id TEXT PRIMARY KEY,
        knowledge_time TEXT NOT NULL,
        round_id TEXT NOT NULL,
        submitted_at TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_paper_round ON paper_predictions(round_id);
      CREATE TABLE IF NOT EXISTS paper_rounds (
        id TEXT PRIMARY KEY,
        opens_at TEXT NOT NULL,
        closes_at TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS round_scores (
        id TEXT PRIMARY KEY,
        round_id TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_round_scores_round ON round_scores(round_id);
      CREATE TABLE IF NOT EXISTS alert_state (
        id TEXT PRIMARY KEY,
        acknowledged INTEGER NOT NULL,
        useful_feedback INTEGER
      );
      CREATE TABLE IF NOT EXISTS manual_holdings (
        id TEXT PRIMARY KEY,
        symbol TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS imported_holdings (
        id TEXT PRIMARY KEY,
        service TEXT NOT NULL,
        account_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        imported_at TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_imported_holdings_service ON imported_holdings(service);
      CREATE TABLE IF NOT EXISTS engine_runs (
        run_date TEXT PRIMARY KEY,
        knowledge_time TEXT NOT NULL,
        ingested_at TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS product_events (
        id TEXT PRIMARY KEY,
        event TEXT NOT NULL,
        surface TEXT NOT NULL,
        entity_id TEXT,
        value REAL,
        metadata TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_product_events_event ON product_events(event);
      CREATE INDEX IF NOT EXISTS idx_product_events_created_at ON product_events(created_at);
      CREATE TABLE IF NOT EXISTS brain_runs (
        id TEXT PRIMARY KEY,
        run_date TEXT NOT NULL,
        knowledge_time TEXT NOT NULL,
        completed_at TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_brain_runs_completed_at ON brain_runs(completed_at);
      CREATE TABLE IF NOT EXISTS market_memory (
        id TEXT PRIMARY KEY,
        symbol TEXT,
        topic TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        knowledge_time TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_market_memory_symbol ON market_memory(symbol);
      CREATE INDEX IF NOT EXISTS idx_market_memory_updated_at ON market_memory(updated_at);
      CREATE TABLE IF NOT EXISTS web3_paper_ledger (
        id TEXT PRIMARY KEY,
        updated_at TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS web3_execution_config (
        id TEXT PRIMARY KEY,
        updated_at TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS web3_execution_audits (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_web3_execution_audits_created ON web3_execution_audits(created_at);
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

  outcomeScores(): OutcomeScore[] {
    return this.db
      .query("SELECT data FROM outcome_scores")
      .all()
      .map((row) => JSON.parse((row as { data: string }).data) as OutcomeScore);
  }

  addOutcomeScore(score: OutcomeScore): void {
    this.db
      .query(
        "INSERT OR REPLACE INTO outcome_scores (id, journal_entry_id, knowledge_time, resolved_at, data) VALUES (?, ?, ?, ?, ?)",
      )
      .run(
        score.id,
        score.journal_entry_id,
        score.knowledge_time,
        score.resolved_at,
        JSON.stringify(score),
      );
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

  paperRounds(): PaperTradingRound[] {
    return this.db
      .query("SELECT data FROM paper_rounds ORDER BY opens_at DESC")
      .all()
      .map((row) => JSON.parse((row as { data: string }).data) as PaperTradingRound);
  }

  upsertPaperRound(round: PaperTradingRound): void {
    this.db
      .query("INSERT OR REPLACE INTO paper_rounds (id, opens_at, closes_at, data) VALUES (?, ?, ?, ?)")
      .run(round.id, round.opens_at, round.closes_at, JSON.stringify(round));
  }

  roundScores(): RoundScore[] {
    return this.db
      .query("SELECT data FROM round_scores")
      .all()
      .map((row) => JSON.parse((row as { data: string }).data) as RoundScore);
  }

  upsertRoundScore(score: RoundScore): void {
    this.db
      .query("INSERT OR REPLACE INTO round_scores (id, round_id, data) VALUES (?, ?, ?)")
      .run(score.id, score.round_id, JSON.stringify(score));
  }

  manualHoldings(): ManualHoldingRow[] {
    return this.db
      .query("SELECT data FROM manual_holdings ORDER BY updated_at DESC")
      .all()
      .map((row) => JSON.parse((row as { data: string }).data) as ManualHoldingRow);
  }

  upsertManualHolding(holding: ManualHoldingRow): void {
    this.db
      .query("INSERT OR REPLACE INTO manual_holdings (id, symbol, updated_at, data) VALUES (?, ?, ?, ?)")
      .run(holding.id, holding.symbol, holding.updated_at, JSON.stringify(holding));
  }

  deleteManualHolding(id: string): void {
    this.db.query("DELETE FROM manual_holdings WHERE id = ?").run(id);
  }

  importedHoldings(): ImportedHoldingRow[] {
    return this.db
      .query("SELECT data FROM imported_holdings ORDER BY imported_at DESC")
      .all()
      .map((row) => JSON.parse((row as { data: string }).data) as ImportedHoldingRow);
  }

  replaceImportedHoldings(service: ImportedHoldingRow["service"], holdings: ImportedHoldingRow[]): void {
    this.db.query("DELETE FROM imported_holdings WHERE service = ?").run(service);
    const statement = this.db.query(
      "INSERT OR REPLACE INTO imported_holdings (id, service, account_id, symbol, imported_at, data) VALUES (?, ?, ?, ?, ?, ?)",
    );
    for (const holding of holdings) {
      statement.run(
        holding.id,
        holding.service,
        holding.account_id,
        holding.symbol,
        holding.imported_at,
        JSON.stringify(holding),
      );
    }
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

  recordProductEvent(event: ProductMetricEventRow): void {
    this.db
      .query(
        "INSERT OR REPLACE INTO product_events (id, event, surface, entity_id, value, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        event.id,
        event.event,
        event.surface,
        event.entity_id,
        event.value,
        JSON.stringify(event.metadata ?? {}),
        event.created_at,
      );
  }

  productEvents(limit = 500): ProductMetricEventRow[] {
    return this.db
      .query(
        "SELECT id, event, surface, entity_id, value, metadata, created_at FROM product_events ORDER BY created_at DESC LIMIT ?",
      )
      .all(limit)
      .map((row) => {
        const r = row as {
          id: string;
          event: string;
          surface: string;
          entity_id: string | null;
          value: number | null;
          metadata: string;
          created_at: string;
        };
        return {
          id: r.id,
          event: r.event,
          surface: r.surface,
          entity_id: r.entity_id,
          value: r.value,
          metadata: safeParse(r.metadata),
          created_at: r.created_at,
        };
      });
  }

  brainRuns(limit = 25): BrainRun[] {
    return this.db
      .query("SELECT data FROM brain_runs ORDER BY completed_at DESC LIMIT ?")
      .all(limit)
      .map((row) => JSON.parse((row as { data: string }).data) as BrainRun);
  }

  upsertBrainRun(run: BrainRun): void {
    this.db
      .query(
        "INSERT OR REPLACE INTO brain_runs (id, run_date, knowledge_time, completed_at, data) VALUES (?, ?, ?, ?, ?)",
      )
      .run(run.id, run.run_date, run.knowledge_time, run.completed_at, JSON.stringify(run));
  }

  marketMemoryFacts(limit = 100): MarketMemoryFact[] {
    return this.db
      .query("SELECT data FROM market_memory ORDER BY updated_at DESC LIMIT ?")
      .all(limit)
      .map((row) => JSON.parse((row as { data: string }).data) as MarketMemoryFact);
  }

  upsertMarketMemoryFact(fact: MarketMemoryFact): void {
    this.db
      .query(
        "INSERT OR REPLACE INTO market_memory (id, symbol, topic, updated_at, knowledge_time, data) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(fact.id, fact.symbol, fact.topic, fact.updated_at, fact.knowledge_time, JSON.stringify(fact));
  }

  web3PaperLedger(): Web3PaperLedgerRow | null {
    const row = this.db
      .query("SELECT data FROM web3_paper_ledger WHERE id = ?")
      .get("default") as { data: string } | null;
    return row ? (JSON.parse(row.data) as Web3PaperLedgerRow) : null;
  }

  upsertWeb3PaperLedger(row: Web3PaperLedgerRow): void {
    this.db
      .query("INSERT OR REPLACE INTO web3_paper_ledger (id, updated_at, data) VALUES (?, ?, ?)")
      .run(row.id, row.updated_at, JSON.stringify(row));
  }

  resetWeb3PaperLedger(): void {
    this.db.query("DELETE FROM web3_paper_ledger WHERE id = ?").run("default");
  }

  web3ExecutionConfig(): Web3ExecutionConfigRow | null {
    const row = this.db
      .query("SELECT data FROM web3_execution_config WHERE id = ?")
      .get("default") as { data: string } | null;
    return row ? (JSON.parse(row.data) as Web3ExecutionConfigRow) : null;
  }

  upsertWeb3ExecutionConfig(row: Web3ExecutionConfigRow): void {
    this.db
      .query("INSERT OR REPLACE INTO web3_execution_config (id, updated_at, data) VALUES (?, ?, ?)")
      .run(row.id, row.updated_at, JSON.stringify(row));
  }

  web3ExecutionAudits(limit = 25): Web3ExecutionAuditRow[] {
    return this.db
      .query("SELECT id, created_at, data FROM web3_execution_audits ORDER BY created_at DESC LIMIT ?")
      .all(limit)
      .map((row) => {
        const r = row as { id: string; created_at: string; data: string };
        return { id: r.id, created_at: r.created_at, data: safeParse(r.data) };
      });
  }

  appendWeb3ExecutionAudit(row: Web3ExecutionAuditRow): void {
    this.db
      .query("INSERT OR REPLACE INTO web3_execution_audits (id, created_at, data) VALUES (?, ?, ?)")
      .run(row.id, row.created_at, JSON.stringify(row.data ?? {}));
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
  private outcomes: OutcomeScore[] = [];
  private predictions: PaperPrediction[] = [];
  private paperRoundRows: PaperTradingRound[] = [];
  private roundScoreRows: RoundScore[] = [];
  private manualHoldingRows: ManualHoldingRow[] = [];
  private importedHoldingRows: ImportedHoldingRow[] = [];
  private alerts = new Map<string, AlertStateRow>();
  private runs = new Map<string, { knowledge_time: string; ingested_at: string; data: unknown }>();
  private productEventRows: ProductMetricEventRow[] = [];
  private brainRunRows: BrainRun[] = [];
  private marketMemoryRows: MarketMemoryFact[] = [];
  private web3LedgerRow: Web3PaperLedgerRow | null = null;
  private web3ExecutionConfigRow: Web3ExecutionConfigRow | null = null;
  private web3ExecutionAuditRows: Web3ExecutionAuditRow[] = [];

  loggedJournalEntries() {
    return [...this.journal];
  }
  addJournalEntry(entry: DecisionJournalEntry) {
    this.journal = this.journal.filter((e) => e.id !== entry.id);
    this.journal.push(entry);
  }
  outcomeScores() {
    return [...this.outcomes];
  }
  addOutcomeScore(score: OutcomeScore) {
    this.outcomes = this.outcomes.filter((s) => s.id !== score.id);
    this.outcomes.push(score);
  }
  submittedPredictions() {
    return [...this.predictions];
  }
  addPrediction(prediction: PaperPrediction) {
    this.predictions = this.predictions.filter((p) => p.id !== prediction.id);
    this.predictions.push(prediction);
  }
  paperRounds() {
    return [...this.paperRoundRows];
  }
  upsertPaperRound(round: PaperTradingRound) {
    this.paperRoundRows = this.paperRoundRows.filter((r) => r.id !== round.id);
    this.paperRoundRows.push(round);
  }
  roundScores() {
    return [...this.roundScoreRows];
  }
  upsertRoundScore(score: RoundScore) {
    this.roundScoreRows = this.roundScoreRows.filter((s) => s.id !== score.id);
    this.roundScoreRows.push(score);
  }
  manualHoldings() {
    return [...this.manualHoldingRows];
  }
  upsertManualHolding(holding: ManualHoldingRow) {
    this.manualHoldingRows = this.manualHoldingRows.filter((item) => item.id !== holding.id);
    this.manualHoldingRows.push(holding);
  }
  deleteManualHolding(id: string) {
    this.manualHoldingRows = this.manualHoldingRows.filter((item) => item.id !== id);
  }
  importedHoldings() {
    return [...this.importedHoldingRows];
  }
  replaceImportedHoldings(service: ImportedHoldingRow["service"], holdings: ImportedHoldingRow[]) {
    this.importedHoldingRows = this.importedHoldingRows.filter((item) => item.service !== service);
    this.importedHoldingRows.push(...holdings);
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
  recordProductEvent(event: ProductMetricEventRow) {
    this.productEventRows = this.productEventRows.filter((row) => row.id !== event.id);
    this.productEventRows.push(event);
  }
  productEvents(limit = 500) {
    return [...this.productEventRows]
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .slice(0, limit);
  }
  brainRuns(limit = 25) {
    return [...this.brainRunRows]
      .sort((a, b) => Date.parse(b.completed_at) - Date.parse(a.completed_at))
      .slice(0, limit);
  }
  upsertBrainRun(run: BrainRun) {
    this.brainRunRows = this.brainRunRows.filter((row) => row.id !== run.id);
    this.brainRunRows.push(run);
  }
  marketMemoryFacts(limit = 100) {
    return [...this.marketMemoryRows]
      .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
      .slice(0, limit);
  }
  upsertMarketMemoryFact(fact: MarketMemoryFact) {
    this.marketMemoryRows = this.marketMemoryRows.filter((row) => row.id !== fact.id);
    this.marketMemoryRows.push(fact);
  }
  web3PaperLedger() {
    return this.web3LedgerRow;
  }
  upsertWeb3PaperLedger(row: Web3PaperLedgerRow) {
    this.web3LedgerRow = row;
  }
  resetWeb3PaperLedger() {
    this.web3LedgerRow = null;
  }
  web3ExecutionConfig() {
    return this.web3ExecutionConfigRow;
  }
  upsertWeb3ExecutionConfig(row: Web3ExecutionConfigRow) {
    this.web3ExecutionConfigRow = row;
  }
  web3ExecutionAudits(limit = 25) {
    return [...this.web3ExecutionAuditRows]
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .slice(0, limit);
  }
  appendWeb3ExecutionAudit(row: Web3ExecutionAuditRow) {
    this.web3ExecutionAuditRows = this.web3ExecutionAuditRows.filter((item) => item.id !== row.id);
    this.web3ExecutionAuditRows.push(row);
  }
}

// --- JSON-file fallback for Node runtimes without bun:sqlite ----------------

class JsonFileAdapter implements PersistAdapter {
  readonly backend = "memory" as const;

  constructor(private path: string) {
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    if (!existsSync(path)) this.write(emptySnapshot());
  }

  loggedJournalEntries() {
    return this.read().journal;
  }
  addJournalEntry(entry: DecisionJournalEntry) {
    const snapshot = this.read();
    snapshot.journal = snapshot.journal.filter((item) => item.id !== entry.id);
    snapshot.journal.push(entry);
    this.write(snapshot);
  }
  outcomeScores() {
    return this.read().outcomes;
  }
  addOutcomeScore(score: OutcomeScore) {
    const snapshot = this.read();
    snapshot.outcomes = snapshot.outcomes.filter((item) => item.id !== score.id);
    snapshot.outcomes.push(score);
    this.write(snapshot);
  }
  submittedPredictions() {
    return this.read().predictions;
  }
  addPrediction(prediction: PaperPrediction) {
    const snapshot = this.read();
    snapshot.predictions = snapshot.predictions.filter((item) => item.id !== prediction.id);
    snapshot.predictions.push(prediction);
    this.write(snapshot);
  }
  paperRounds() {
    return this.read().paper_rounds;
  }
  upsertPaperRound(round: PaperTradingRound) {
    const snapshot = this.read();
    snapshot.paper_rounds = snapshot.paper_rounds.filter((item) => item.id !== round.id);
    snapshot.paper_rounds.push(round);
    this.write(snapshot);
  }
  roundScores() {
    return this.read().round_scores;
  }
  upsertRoundScore(score: RoundScore) {
    const snapshot = this.read();
    snapshot.round_scores = snapshot.round_scores.filter((item) => item.id !== score.id);
    snapshot.round_scores.push(score);
    this.write(snapshot);
  }
  manualHoldings() {
    return this.read().manual_holdings;
  }
  upsertManualHolding(holding: ManualHoldingRow) {
    const snapshot = this.read();
    snapshot.manual_holdings = snapshot.manual_holdings.filter((item) => item.id !== holding.id);
    snapshot.manual_holdings.push(holding);
    this.write(snapshot);
  }
  deleteManualHolding(id: string) {
    const snapshot = this.read();
    snapshot.manual_holdings = snapshot.manual_holdings.filter((item) => item.id !== id);
    this.write(snapshot);
  }
  importedHoldings() {
    return this.read().imported_holdings;
  }
  replaceImportedHoldings(service: ImportedHoldingRow["service"], holdings: ImportedHoldingRow[]) {
    const snapshot = this.read();
    snapshot.imported_holdings = snapshot.imported_holdings.filter((item) => item.service !== service);
    snapshot.imported_holdings.push(...holdings);
    this.write(snapshot);
  }
  getAlertState(id: string) {
    return this.read().alerts[id];
  }
  setAlertState(id: string, state: AlertStateRow) {
    const snapshot = this.read();
    snapshot.alerts[id] = state;
    this.write(snapshot);
  }
  isRunIngested(runDate: string) {
    return Boolean(this.read().runs[runDate]);
  }
  markRunIngested(runDate: string, knowledgeTime: string, payload: unknown) {
    const snapshot = this.read();
    if (snapshot.runs[runDate]) return false;
    snapshot.runs[runDate] = {
      knowledge_time: knowledgeTime,
      ingested_at: new Date().toISOString(),
      data: payload,
    };
    this.write(snapshot);
    return true;
  }
  ingestedRunDates() {
    return Object.keys(this.read().runs).sort((a, b) => b.localeCompare(a));
  }
  ingestedRuns(): IngestedRunRow[] {
    return Object.entries(this.read().runs)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([run_date, row]) => ({ run_date, ...row }));
  }
  recordProductEvent(event: ProductMetricEventRow) {
    const snapshot = this.read();
    snapshot.product_events = snapshot.product_events.filter((row) => row.id !== event.id);
    snapshot.product_events.push(event);
    this.write(snapshot);
  }
  productEvents(limit = 500) {
    return this.read()
      .product_events.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .slice(0, limit);
  }
  brainRuns(limit = 25) {
    return this.read()
      .brain_runs.sort((a, b) => Date.parse(b.completed_at) - Date.parse(a.completed_at))
      .slice(0, limit);
  }
  upsertBrainRun(run: BrainRun) {
    const snapshot = this.read();
    snapshot.brain_runs = snapshot.brain_runs.filter((row) => row.id !== run.id);
    snapshot.brain_runs.push(run);
    this.write(snapshot);
  }
  marketMemoryFacts(limit = 100) {
    return this.read()
      .market_memory.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
      .slice(0, limit);
  }
  upsertMarketMemoryFact(fact: MarketMemoryFact) {
    const snapshot = this.read();
    snapshot.market_memory = snapshot.market_memory.filter((row) => row.id !== fact.id);
    snapshot.market_memory.push(fact);
    this.write(snapshot);
  }
  web3PaperLedger() {
    return this.read().web3_paper_ledger;
  }
  upsertWeb3PaperLedger(row: Web3PaperLedgerRow) {
    const snapshot = this.read();
    snapshot.web3_paper_ledger = row;
    this.write(snapshot);
  }
  resetWeb3PaperLedger() {
    const snapshot = this.read();
    snapshot.web3_paper_ledger = null;
    this.write(snapshot);
  }
  web3ExecutionConfig() {
    return this.read().web3_execution_config;
  }
  upsertWeb3ExecutionConfig(row: Web3ExecutionConfigRow) {
    const snapshot = this.read();
    snapshot.web3_execution_config = row;
    this.write(snapshot);
  }
  web3ExecutionAudits(limit = 25) {
    return this.read()
      .web3_execution_audits.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .slice(0, limit);
  }
  appendWeb3ExecutionAudit(row: Web3ExecutionAuditRow) {
    const snapshot = this.read();
    snapshot.web3_execution_audits = snapshot.web3_execution_audits.filter((item) => item.id !== row.id);
    snapshot.web3_execution_audits.push(row);
    this.write(snapshot);
  }

  private read(): StoreSnapshot {
    try {
      const parsed = JSON.parse(readFileSync(this.path, "utf8")) as Partial<StoreSnapshot>;
      return {
        ...emptySnapshot(),
        ...parsed,
        paper_rounds: Array.isArray(parsed.paper_rounds) ? parsed.paper_rounds : [],
        round_scores: Array.isArray(parsed.round_scores) ? parsed.round_scores : [],
        manual_holdings: Array.isArray(parsed.manual_holdings) ? parsed.manual_holdings : [],
        imported_holdings: Array.isArray(parsed.imported_holdings) ? parsed.imported_holdings : [],
        alerts: parsed.alerts && typeof parsed.alerts === "object" ? parsed.alerts : {},
        runs: parsed.runs && typeof parsed.runs === "object" ? parsed.runs : {},
        brain_runs: Array.isArray(parsed.brain_runs) ? parsed.brain_runs : [],
        market_memory: Array.isArray(parsed.market_memory) ? parsed.market_memory : [],
        web3_paper_ledger: parsed.web3_paper_ledger ?? null,
        web3_execution_config: parsed.web3_execution_config ?? null,
        web3_execution_audits: Array.isArray(parsed.web3_execution_audits) ? parsed.web3_execution_audits : [],
      };
    } catch {
      return emptySnapshot();
    }
  }

  private write(snapshot: StoreSnapshot) {
    writeFileSync(this.path, JSON.stringify(snapshot, null, 2));
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
  if (dbPath() !== ":memory:") {
    return new JsonFileAdapter(`${dbPath()}.json`);
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
