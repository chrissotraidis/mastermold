/// <reference types="node" />

/**
 * Autopilot bot database (slice C3 — storage + control plane).
 *
 * A SEPARATE database from the advisory store (`src/db/store.ts`), per the C1
 * architecture note (docs/research/2026-07-02-autopilot-alpha-stack.md §6):
 * the bot's memory must be fully disjoint from `MASTERMOLD_DB` so the daemon
 * never opens the advisory DB and the dashboard reads the bot DB through one
 * narrow surface. The only dashboard write path is bot control state (kill
 * switch, caps, mode).
 *
 * Storage is SQLite (WAL, synchronous=NORMAL, busy_timeout=5000) via the
 * runtime's builtin driver — bun:sqlite under Bun, node:sqlite under Node —
 * see `src/autopilot/sqlite.ts`. The daemon (20s tick writer) and the Next
 * server (control-plane writer) are two processes on one file; the JSON-file
 * predecessor did whole-file read-modify-write and could lose updates between
 * them, which is unacceptable before live trading. Append-heavy tables are
 * real tables (one JSON payload per row, ordered by rowid = insertion order,
 * exactly the old array semantics); singletons live in a key/value table.
 * Every multi-step method runs in a transaction.
 *
 * A legacy JSON store at the configured path is migrated losslessly on first
 * open: the snapshot is normalized once (same shape guards as before), written
 * into a sibling `<path>.sqlite`, and the JSON original is renamed to
 * `<path>.migrated-backup`.
 *
 * The trades ledger is append-ONLY by construction: this module exposes
 * `appendTrade()` and `trades()` and deliberately ships no update or delete
 * path for ledger rows, so the equity curve can always be reconciled against
 * the full trade history.
 */

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  sanitizeParams,
  validateChangeset,
  type Changeset,
  type ChangesetVerdict,
  type ParamChangelogEntry,
  type ParamChangeSource,
  type ParamKey,
  type StrategyParams,
} from "./params";
import type { EvaluationSnapshot } from "./strategy-view";
import {
  isSqliteFile,
  openSqliteDatabase,
  resolveSqlitePath,
  type SqliteDatabase,
} from "./sqlite";
import type {
  CandidateSnapshotInput,
  CandidateSnapshotRow,
  ForwardLabels,
} from "./v3/candidate-store";

export type AutopilotMode = "off" | "paper" | "live" | "halted";

export type AutopilotCaps = {
  max_trade_usd: number;
  daily_loss_limit_usd: number;
  /** Gross buy notional allowed per UTC day — enforced by the policy engine. */
  daily_spend_limit_usd: number;
  max_positions: number;
  drawdown_halt_pct: number;
  /** SOL kept back for network fees in live mode; discretionary intents can
   * never spend the wallet below it (autonomy ADR, D5). */
  reserve_floor_sol: number;
};

export type BotStateRow = {
  mode: AutopilotMode;
  kill_switch: boolean;
  started_at: string | null;
  updated_at: string;
  caps: AutopilotCaps;
  wallet_label: string | null;
  /** Heartbeat: stamped by the daemon on every loop tick; null until it runs. */
  last_tick_at: string | null;
  /** PID of the daemon process that last stamped the heartbeat, if known. */
  daemon_pid?: number | null;
  /** When the Analyst last ATTEMPTED a daily run (success or fail) — the daemon runs it once per UTC day. */
  last_analyst_run_at?: string | null;
};

export type BotTradeRow = {
  id: string;
  ts: string;
  side: "buy" | "sell";
  mint: string;
  symbol: string;
  qty: number;
  price_usd: number;
  value_usd: number;
  fee_usd: number;
  mode: "paper" | "live";
  reason: string;
  /** Live fills only: the confirmed Solana transaction signature. */
  signature?: string;
};

/** Ledger input: id/ts are generated when omitted; mode defaults to "paper". */
export type BotTradeInput = Omit<BotTradeRow, "id" | "ts" | "mode"> & {
  id?: string;
  ts?: string;
  mode?: "paper" | "live";
};

export type BotPositionRow = {
  mint: string;
  symbol: string;
  qty: number;
  avg_cost_usd: number;
  /** v2: volatility-scaled stop distance chosen at entry (percent). */
  stop_pct?: number;
  /** v2: persisted high-water mark so the armed trail survives restarts. */
  peak_usd?: number;
  opened_at: string;
  updated_at: string;
};

/** Full signal snapshot captured with every strategy decision. */
export type DecisionSignals = {
  price_usd: number | null;
  short_pct: number | null;
  range_pct: number | null;
  h1_pct: number | null;
  h24_pct: number | null;
  volume_h24_usd: number | null;
  liquidity_usd: number | null;
};

/** The bot's decision log: entries, exits, and rejected candidates with the
 * signals behind each — the forensic trail the v1 postmortem was missing. */
export type BotDecisionRow = {
  id: string;
  ts: string;
  symbol: string;
  /** "blocked" = the strategy wanted the trade but the policy engine refused it. */
  verdict: "enter" | "exit" | "skip" | "blocked";
  reason: string;
  signals: DecisionSignals;
};

export type EquityPointRow = {
  ts: string;
  equity_usd: number;
};

export type BotActivityRow = {
  id: string;
  ts: string;
  kind: string;
  message: string;
};

/** The web3/defi research memory — the Autopilot lane's own dated notes, kept
 * apart from the tradfi market_memory so chat can cite which brain it used. */
export type Web3MemoryRow = {
  id: string;
  ts: string;
  symbol: string;
  kind: "observation" | "entry" | "exit" | "risk" | "lesson";
  summary: string;
};

/** One combined minute bar: every universe mint's price at one timestamp. */
export type PriceHistoryRow = {
  ts: string;
  prices: Record<string, number>; // mint -> USD price
};

/** Post-exit counterfactual: what the price did AFTER we sold, so a good stop
 * and a panic exit stop being indistinguishable (learning-loop plan, layer 2). */
export type ExitWatchRow = {
  id: string;
  trade_id: string;
  mint: string;
  symbol: string;
  exit_price_usd: number;
  exit_ts: string;
  /** True when the round trip closed at a net loss — recovery flags a lesson. */
  was_loss: boolean;
  mark_30m_usd: number | null;
  mark_2h_usd: number | null;
  mark_4h_usd: number | null;
  done: boolean;
};

export const DEFAULT_AUTOPILOT_CAPS: AutopilotCaps = {
  max_trade_usd: 25,
  daily_loss_limit_usd: 50,
  daily_spend_limit_usd: 100,
  max_positions: 5,
  drawdown_halt_pct: 20,
  reserve_floor_sol: 0.05,
};

/** The legacy JSON snapshot shape — still the migration input format. */
type AutopilotSnapshot = {
  bot_state: BotStateRow;
  trades: BotTradeRow[];
  positions: BotPositionRow[];
  equity_points: EquityPointRow[];
  activity: BotActivityRow[];
  web3_memory: Web3MemoryRow[];
  decisions: BotDecisionRow[];
  /** Raw stored values; ALWAYS read through sanitizeParams (clamped merge). */
  strategy_params: Record<string, number>;
  param_changelog: ParamChangelogEntry[];
  exit_watches: ExitWatchRow[];
  /** The Analyst's latest daily review memo. */
  analyst_memo: { ts: string; memo: string } | null;
  /** V3 training substrate: every evaluated candidate (entered AND skipped). */
  candidate_snapshots: CandidateSnapshotRow[];
  /** Minute-bar price history (combined row per ~minute) — the restart-proof
   * source for V3 forward labels and longer-horizon features. */
  price_history: PriceHistoryRow[];
  /** Rolling per-mint 24h-volume EMA — the baseline behind xsec's volume_z. */
  volume_baselines: Record<string, number>;
};

// --- rolling caps (enforced with DELETE-beyond-newest after each append) ------

/** Rolling cap on the V3 candidate/feature table — keeps the db bounded. */
const CANDIDATE_SNAPSHOT_CAP = 2000;
const ACTIVITY_CAP = 400;
const WEB3_MEMORY_CAP = 400;
const DECISION_CAP = 400;
const EXIT_WATCH_CAP = 200;
const PARAM_CHANGELOG_CAP = 200;
// ≈15h of minute bars; widened so the 6h label pass has margin
const PRICE_HISTORY_CAP = 900;

function defaultBotState(now: string): BotStateRow {
  return {
    mode: "off",
    kill_switch: false,
    started_at: null,
    updated_at: now,
    caps: { ...DEFAULT_AUTOPILOT_CAPS },
    wallet_label: null,
    last_tick_at: null,
    daemon_pid: null,
    last_analyst_run_at: null,
  };
}

function defaultSnapshot(): AutopilotSnapshot {
  const now = new Date().toISOString();
  return {
    bot_state: defaultBotState(now),
    trades: [],
    positions: [],
    // Seed a single origin point so the equity chart always has a line start.
    equity_points: [{ ts: now, equity_usd: 0 }],
    activity: [],
    web3_memory: [],
    decisions: [],
    strategy_params: {},
    param_changelog: [],
    exit_watches: [],
    analyst_memo: null,
    candidate_snapshots: [],
    price_history: [],
    volume_baselines: {},
  };
}

/** Merge a raw parsed JSON snapshot over safe defaults (shape guards per table).
 * This is the SAME normalize the JSON-file store used — reused for migration. */
function normalizeSnapshot(parsed: Partial<AutopilotSnapshot>): AutopilotSnapshot {
  const fallback = defaultSnapshot();
  return {
    bot_state:
      parsed.bot_state && typeof parsed.bot_state === "object"
        ? {
            ...fallback.bot_state,
            ...parsed.bot_state,
            caps: { ...fallback.bot_state.caps, ...(parsed.bot_state.caps ?? {}) },
          }
        : fallback.bot_state,
    trades: Array.isArray(parsed.trades) ? parsed.trades : [],
    positions: Array.isArray(parsed.positions) ? parsed.positions : [],
    equity_points: Array.isArray(parsed.equity_points) && parsed.equity_points.length > 0
      ? parsed.equity_points
      : fallback.equity_points,
    activity: Array.isArray(parsed.activity) ? parsed.activity : [],
    web3_memory: Array.isArray(parsed.web3_memory) ? parsed.web3_memory : [],
    decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
    strategy_params:
      parsed.strategy_params && typeof parsed.strategy_params === "object"
        ? (parsed.strategy_params as Record<string, number>)
        : {},
    param_changelog: Array.isArray(parsed.param_changelog) ? parsed.param_changelog : [],
    exit_watches: Array.isArray(parsed.exit_watches) ? parsed.exit_watches : [],
    analyst_memo:
      parsed.analyst_memo && typeof parsed.analyst_memo === "object" && typeof (parsed.analyst_memo as { memo?: unknown }).memo === "string"
        ? (parsed.analyst_memo as { ts: string; memo: string })
        : null,
    candidate_snapshots: Array.isArray(parsed.candidate_snapshots) ? parsed.candidate_snapshots : [],
    price_history: Array.isArray(parsed.price_history) ? parsed.price_history : [],
    volume_baselines:
      parsed.volume_baselines && typeof parsed.volume_baselines === "object"
        ? (parsed.volume_baselines as Record<string, number>)
        : {},
  };
}

/** Lazily created per-process scratch dir for unisolated test opens. */
let testGuardDir: string | null = null;

function autopilotDbPath(): string {
  if (process.env.AUTOPILOT_DB) return process.env.AUTOPILOT_DB;
  // Test-run guard: bun test sets NODE_ENV=test, and a test that has not set
  // AUTOPILOT_DB (e.g. an advisory-lane test whose alert feed takes the
  // cross-lane heartbeat READ) must NEVER open the operator's real db at
  // .data — opening it would MIGRATE it, renaming the live JSON out from
  // under a running daemon and freezing a stale sqlite snapshot beside it.
  // Such tests get an empty per-process store instead (mode "off", no
  // heartbeat), which is also deterministic where the real file was not.
  if (process.env.NODE_ENV === "test") {
    testGuardDir ??= mkdtempSync(join(tmpdir(), "mm-autopilot-testguard-"));
    return join(testGuardDir, "autopilot.db.json");
  }
  return join(/* turbopackIgnore: true */ process.cwd(), ".data", "autopilot.db.json");
}

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS singletons (
    key TEXT PRIMARY KEY,
    data TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS trades (
    id TEXT PRIMARY KEY,
    ts TEXT NOT NULL,
    data TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_trades_ts ON trades(ts);
  CREATE TABLE IF NOT EXISTS positions (
    mint TEXT PRIMARY KEY,
    data TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS equity_points (
    ts TEXT NOT NULL,
    data TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_equity_points_ts ON equity_points(ts);
  CREATE TABLE IF NOT EXISTS activity (
    id TEXT PRIMARY KEY,
    ts TEXT NOT NULL,
    data TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS web3_memory (
    id TEXT PRIMARY KEY,
    ts TEXT NOT NULL,
    data TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS decisions (
    id TEXT PRIMARY KEY,
    ts TEXT NOT NULL,
    data TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS param_changelog (
    id TEXT PRIMARY KEY,
    ts TEXT NOT NULL,
    data TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS exit_watches (
    id TEXT PRIMARY KEY,
    exit_ts TEXT NOT NULL,
    data TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS candidate_snapshots (
    id TEXT PRIMARY KEY,
    ts TEXT NOT NULL,
    data TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_candidate_snapshots_ts ON candidate_snapshots(ts);
  CREATE TABLE IF NOT EXISTS price_history (
    ts TEXT NOT NULL,
    data TEXT NOT NULL
  );
`;

function applyPragmas(db: SqliteDatabase): void {
  // WAL: readers never block the writer and vice versa — the daemon and the
  // Next server share this file. busy_timeout rides out the rare write-write
  // overlap instead of surfacing SQLITE_BUSY to a control-plane request.
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA synchronous = NORMAL;");
  db.exec("PRAGMA busy_timeout = 5000;");
}

export class AutopilotStore {
  readonly backend = "sqlite" as const;

  /** The configured store path (may be the legacy `.json` location). */
  private readonly path: string;
  /** The actual SQLite file (== configured path, or its `.sqlite` sibling). */
  private readonly dbFile: string;
  private db: SqliteDatabase;

  constructor(path: string) {
    this.path = path;
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    this.dbFile = resolveSqlitePath(path);

    const legacy = this.readLegacyJsonForMigration();
    if (legacy) this.migrateFromJson(legacy);

    const existed = existsSync(this.dbFile);
    try {
      this.db = openSqliteDatabase(this.dbFile);
      applyPragmas(this.db); // first statement — throws NOTADB on a corrupt file
      this.db.exec(SCHEMA_SQL);
    } catch (error) {
      if (existed && !legacy) {
        // CRASH SAFETY: an existing-but-unreadable db must throw, never be
        // silently replaced with an empty default over real trading data
        // (the 2026-07-02 store-loss failure mode).
        throw new Error(
          `autopilot store at ${this.dbFile} exists but is unreadable — refusing to default over real data`,
        );
      }
      throw error;
    }
    this.seedIfEmpty();
  }

  /** Close the underlying SQLite handle (test seam + clean shutdown). */
  close(): void {
    try {
      this.db.close();
    } catch {
      // already closed
    }
  }

  // --- bot_state (single row) ------------------------------------------------

  botState(): BotStateRow {
    const stored = this.getSingleton<Partial<BotStateRow>>("bot_state");
    const fallback = defaultBotState(new Date().toISOString());
    const state: BotStateRow = stored
      ? { ...fallback, ...stored, caps: { ...fallback.caps, ...(stored.caps ?? {}) } }
      : fallback;
    return { ...state, caps: { ...state.caps } };
  }

  /** Merge a partial bot-state patch (caps merged shallowly) and stamp updated_at. */
  updateBotState(patch: Partial<Omit<BotStateRow, "updated_at" | "caps">> & { caps?: Partial<AutopilotCaps> }): BotStateRow {
    return this.transaction(() => {
      const current = this.botState();
      const next: BotStateRow = {
        ...current,
        ...patch,
        caps: { ...current.caps, ...(patch.caps ?? {}) },
        updated_at: new Date().toISOString(),
      };
      this.setSingleton("bot_state", next);
      return { ...next, caps: { ...next.caps } };
    });
  }

  // --- trades (append-ONLY ledger; no update or delete path exists) ----------

  appendTrade(input: BotTradeInput): BotTradeRow {
    const row: BotTradeRow = {
      ...input,
      id: input.id ?? randomUUID(),
      ts: input.ts ?? new Date().toISOString(),
      mode: input.mode ?? "paper",
    };
    this.insertRow("trades", row.id, row.ts, row);
    return row;
  }

  /** Newest first. */
  trades(limit = 50): BotTradeRow[] {
    return this.allRows<BotTradeRow>("trades")
      .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
      .slice(0, limit);
  }

  // --- positions ---------------------------------------------------------------

  positions(): BotPositionRow[] {
    return this.allRows<BotPositionRow>("positions");
  }

  upsertPosition(position: BotPositionRow): void {
    this.transaction(() => {
      // Delete + insert (not UPDATE) so an updated position moves to the end
      // of insertion order, exactly like the old filter-then-push array.
      this.db.prepare("DELETE FROM positions WHERE mint = ?").run(position.mint);
      this.db
        .prepare("INSERT INTO positions (mint, data) VALUES (?, ?)")
        .run(position.mint, JSON.stringify(position));
    });
  }

  /** Closing a position removes the open row; its history stays in the trades ledger. */
  closePosition(mint: string): void {
    this.db.prepare("DELETE FROM positions WHERE mint = ?").run(mint);
  }

  // --- equity_points -----------------------------------------------------------

  appendEquityPoint(equityUsd: number, ts?: string): EquityPointRow {
    const point: EquityPointRow = { ts: ts ?? new Date().toISOString(), equity_usd: equityUsd };
    this.db
      .prepare("INSERT INTO equity_points (ts, data) VALUES (?, ?)")
      .run(point.ts, JSON.stringify(point));
    return point;
  }

  /** Last `limit` points in chronological order (oldest → newest), for charting. */
  equitySeries(limit = 200): EquityPointRow[] {
    const points = this.allRows<EquityPointRow>("equity_points").sort(
      (a, b) => Date.parse(a.ts) - Date.parse(b.ts),
    );
    return points.slice(Math.max(0, points.length - limit));
  }

  // --- activity (append-only log, rolling cap) -----------------------------------

  appendActivity(kind: string, message: string): BotActivityRow {
    const row: BotActivityRow = {
      id: randomUUID(),
      ts: new Date().toISOString(),
      kind,
      message,
    };
    this.insertRow("activity", row.id, row.ts, row, ACTIVITY_CAP);
    return row;
  }

  /** Newest first. */
  activity(limit = 50): BotActivityRow[] {
    return this.allRows<BotActivityRow>("activity")
      .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
      .slice(0, limit);
  }

  appendWeb3Memory(entry: Omit<Web3MemoryRow, "id" | "ts"> & { ts?: string }): Web3MemoryRow {
    const row: Web3MemoryRow = {
      id: `w3m_${randomUUID()}`,
      ts: entry.ts ?? new Date().toISOString(),
      symbol: entry.symbol,
      kind: entry.kind,
      summary: entry.summary.slice(0, 400),
    };
    // Rolling cap keeps the table bounded; oldest notes age out.
    this.insertRow("web3_memory", row.id, row.ts, row, WEB3_MEMORY_CAP);
    return row;
  }

  appendDecision(entry: Omit<BotDecisionRow, "id" | "ts"> & { ts?: string }): BotDecisionRow {
    const row: BotDecisionRow = {
      id: `dec_${randomUUID()}`,
      ts: entry.ts ?? new Date().toISOString(),
      symbol: entry.symbol,
      verdict: entry.verdict,
      reason: entry.reason.slice(0, 300),
      signals: entry.signals,
    };
    // Rolling cap keeps the table bounded; oldest decisions age out.
    this.insertRow("decisions", row.id, row.ts, row, DECISION_CAP);
    return row;
  }

  decisions(limit = 50): BotDecisionRow[] {
    return this.allRows<BotDecisionRow>("decisions")
      .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
      .slice(0, limit);
  }

  web3Memory(limit = 50): Web3MemoryRow[] {
    return this.allRows<Web3MemoryRow>("web3_memory")
      .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
      .slice(0, limit);
  }

  // --- strategy params (learnable surface, always read through the clamps) ----

  strategyParams(): StrategyParams {
    return sanitizeParams(this.rawStrategyParams());
  }

  /** Newest first. */
  paramChangelog(limit = 100): ParamChangelogEntry[] {
    return this.allRows<ParamChangelogEntry>("param_changelog")
      .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
      .slice(0, limit);
  }

  /**
   * Validate and apply a parameter changeset. No-op keys (already at the
   * target value) are dropped; a changeset that ends up empty is refused so
   * the changelog never records phantom changes.
   */
  applyParamChangeset(
    changeset: Changeset,
    source: ParamChangeSource,
    reason: string,
    nowMs: number = Date.now(),
  ): ChangesetVerdict & { entry?: ParamChangelogEntry } {
    // Read + validate + write as ONE transaction: two concurrent changesets
    // can never interleave between reading current params and writing them.
    return this.transaction(() => {
      const lastAnalyst = this.paramChangelog(400).find((entry) => entry.source === "analyst");
      const verdict = validateChangeset(changeset, source, {
        now_ms: nowMs,
        last_analyst_change_ts: lastAnalyst?.ts ?? null,
      });
      if (!verdict.ok) return verdict;

      const current = this.strategyParams();
      const changes: ParamChangelogEntry["changes"] = {};
      for (const key of Object.keys(changeset) as ParamKey[]) {
        const to = changeset[key];
        if (to === undefined || to === current[key]) continue;
        changes[key] = { from: current[key], to };
      }
      if (Object.keys(changes).length === 0) {
        return { ok: false as const, error: "every value in the changeset already matches the current params" };
      }

      const entry: ParamChangelogEntry = {
        id: `pch_${randomUUID()}`,
        ts: new Date(nowMs).toISOString(),
        source,
        reason: reason.slice(0, 300),
        changes,
      };
      const values: Record<string, number> = { ...this.rawStrategyParams() };
      for (const key of Object.keys(changes) as ParamKey[]) {
        values[key] = changes[key]!.to;
      }
      this.setSingleton("strategy_params", values);
      this.insertRow("param_changelog", entry.id, entry.ts, entry, PARAM_CHANGELOG_CAP);
      return { ok: true as const, entry };
    });
  }

  // --- exit watches (post-exit counterfactual marks) ---------------------------

  appendExitWatch(input: Omit<ExitWatchRow, "id" | "mark_30m_usd" | "mark_2h_usd" | "mark_4h_usd" | "done">): ExitWatchRow {
    const row: ExitWatchRow = {
      ...input,
      id: `exw_${randomUUID()}`,
      mark_30m_usd: null,
      mark_2h_usd: null,
      mark_4h_usd: null,
      done: false,
    };
    this.transaction(() => {
      this.db
        .prepare("INSERT INTO exit_watches (id, exit_ts, data) VALUES (?, ?, ?)")
        .run(row.id, row.exit_ts, JSON.stringify(row));
      this.capTable("exit_watches", EXIT_WATCH_CAP);
    });
    return row;
  }

  openExitWatches(): ExitWatchRow[] {
    return this.allRows<ExitWatchRow>("exit_watches").filter((row) => !row.done);
  }

  /** Newest first, finished and open alike (attribution reads them all). */
  exitWatches(limit = 200): ExitWatchRow[] {
    return this.allRows<ExitWatchRow>("exit_watches")
      .sort((a, b) => Date.parse(b.exit_ts) - Date.parse(a.exit_ts))
      .slice(0, limit);
  }

  updateExitWatch(row: ExitWatchRow): void {
    // UPDATE in place (not delete+insert) so the row keeps its position in
    // insertion order, like the old array map-by-id. No-op if the id is gone.
    this.db
      .prepare("UPDATE exit_watches SET exit_ts = ?, data = ? WHERE id = ?")
      .run(row.exit_ts, JSON.stringify(row), row.id);
  }

  // --- V3 price history + volume baselines (restart-proof learning substrate) ---

  /** Append one combined minute bar; rolling cap keeps the table bounded. */
  appendPriceHistory(prices: Record<string, number>, ts?: string): void {
    const row: PriceHistoryRow = { ts: ts ?? new Date().toISOString(), prices };
    this.transaction(() => {
      this.db
        .prepare("INSERT INTO price_history (ts, data) VALUES (?, ?)")
        .run(row.ts, JSON.stringify(row));
      this.capTable("price_history", PRICE_HISTORY_CAP);
    });
  }

  /** Chronological rows (oldest → newest). */
  priceHistory(): PriceHistoryRow[] {
    return this.allRows<PriceHistoryRow>("price_history").sort(
      (a, b) => Date.parse(a.ts) - Date.parse(b.ts),
    );
  }

  /** Update per-mint 24h-volume EMA baselines (alpha-smoothed, shallow merge). */
  updateVolumeBaselines(volumesByMint: Record<string, number>, alpha = 0.1): void {
    this.transaction(() => {
      const next = { ...(this.getSingleton<Record<string, number>>("volume_baselines") ?? {}) };
      for (const [mint, volume] of Object.entries(volumesByMint)) {
        if (!Number.isFinite(volume) || volume <= 0) continue;
        const prev = next[mint];
        next[mint] = prev !== undefined && Number.isFinite(prev) ? prev + alpha * (volume - prev) : volume;
      }
      this.setSingleton("volume_baselines", next);
    });
  }

  volumeBaselines(): Record<string, number> {
    return { ...(this.getSingleton<Record<string, number>>("volume_baselines") ?? {}) };
  }

  // --- per-tick strategy evaluations (panel snapshot, overwritten each tick) ----

  lastEvaluations(): EvaluationSnapshot | null {
    const snapshot = this.getSingleton<EvaluationSnapshot | null>("last_evaluations");
    return snapshot ? { ...snapshot } : null;
  }

  setLastEvaluations(snapshot: EvaluationSnapshot): void {
    this.setSingleton("last_evaluations", snapshot);
  }

  // --- V3 paper-promotion state (evidence-gated, daemon-evaluated) --------------

  v3Promotion(): { ready: boolean; ts: string } | null {
    const state = this.getSingleton<{ ready: boolean; ts: string } | null>("v3_promotion");
    return state ? { ...state } : null;
  }

  setV3Promotion(state: { ready: boolean; ts: string }): void {
    this.setSingleton("v3_promotion", state);
  }

  // --- analyst memo -------------------------------------------------------------

  analystMemo(): { ts: string; memo: string } | null {
    const memo = this.getSingleton<{ ts: string; memo: string } | null>("analyst_memo");
    return memo ? { ...memo } : null;
  }

  setAnalystMemo(memo: string, nowMs: number = Date.now()): void {
    this.setSingleton("analyst_memo", { ts: new Date(nowMs).toISOString(), memo: memo.slice(0, 1200) });
  }

  // --- candidate_snapshots (V3 training substrate: entered AND skipped) --------

  /** Record one evaluated candidate. Forward labels start null (labeled later). */
  appendCandidateSnapshot(input: CandidateSnapshotInput): CandidateSnapshotRow {
    const row: CandidateSnapshotRow = {
      ...input,
      id: input.id ?? `cnd_${randomUUID()}`,
      ts: input.ts ?? new Date().toISOString(),
      return_30m_bps: null,
      return_2h_bps: null,
      return_6h_bps: null,
      max_adverse_2h_bps: null,
      max_favorable_2h_bps: null,
      labeled: false,
    };
    this.insertRow("candidate_snapshots", row.id, row.ts, row, CANDIDATE_SNAPSHOT_CAP);
    return row;
  }

  /** Newest first. */
  candidateSnapshots(limit = 200): CandidateSnapshotRow[] {
    return this.allRows<CandidateSnapshotRow>("candidate_snapshots")
      .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
      .slice(0, limit);
  }

  /** Snapshots whose ts is older than `ageMs` before `nowMs` and not yet labeled —
   * the labeling pass's work queue (oldest first). */
  unlabeledSnapshotsOlderThan(ageMs: number, nowMs: number = Date.now()): CandidateSnapshotRow[] {
    const cutoff = nowMs - ageMs;
    return this.allRows<CandidateSnapshotRow>("candidate_snapshots")
      .filter((row) => !row.labeled && Date.parse(row.ts) <= cutoff)
      .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  }

  /** Write forward labels onto a snapshot and mark it labeled. No-op if id absent. */
  labelCandidateSnapshot(id: string, labels: ForwardLabels): void {
    this.transaction(() => {
      const found = this.db
        .prepare("SELECT data FROM candidate_snapshots WHERE id = ?")
        .get(id) as { data: string } | null | undefined;
      if (!found) return;
      const next = { ...(JSON.parse(found.data) as CandidateSnapshotRow), ...labels, labeled: true };
      this.db
        .prepare("UPDATE candidate_snapshots SET data = ? WHERE id = ?")
        .run(JSON.stringify(next), id);
    });
  }

  // --- SQLite plumbing ----------------------------------------------------------

  private inTransaction = false;

  /** Run `fn` atomically: COMMIT on success, ROLLBACK (prior state intact) on
   * throw. Re-entrant calls join the outer transaction. */
  private transaction<T>(fn: () => T): T {
    if (this.inTransaction) return fn();
    this.db.exec("BEGIN IMMEDIATE");
    this.inTransaction = true;
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        // connection-level failure; the original error matters more
      }
      throw error;
    } finally {
      this.inTransaction = false;
    }
  }

  /** All rows of a table in insertion order — the old JSON array, verbatim. */
  private allRows<T>(table: string): T[] {
    const rows = this.db.prepare(`SELECT data FROM ${table} ORDER BY rowid ASC`).all() as Array<{ data: string }>;
    return rows.map((row) => JSON.parse(row.data) as T);
  }

  /** Insert one JSON row; when `cap` is given, age out the oldest-inserted
   * rows beyond it (rowid order == the old array's slice(-cap) semantics). */
  private insertRow(table: string, id: string, ts: string, payload: unknown, cap?: number): void {
    this.transaction(() => {
      this.db
        .prepare(`INSERT INTO ${table} (id, ts, data) VALUES (?, ?, ?)`)
        .run(id, ts, JSON.stringify(payload));
      if (cap !== undefined) this.capTable(table, cap);
    });
  }

  private capTable(table: string, cap: number): void {
    this.db
      .prepare(`DELETE FROM ${table} WHERE rowid NOT IN (SELECT rowid FROM ${table} ORDER BY rowid DESC LIMIT ?)`)
      .run(cap);
  }

  private getSingleton<T>(key: string): T | undefined {
    const row = this.db.prepare("SELECT data FROM singletons WHERE key = ?").get(key) as
      | { data: string }
      | null
      | undefined;
    return row ? (JSON.parse(row.data) as T) : undefined;
  }

  private setSingleton(key: string, value: unknown): void {
    this.db
      .prepare("INSERT INTO singletons (key, data) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data")
      .run(key, JSON.stringify(value));
  }

  private rawStrategyParams(): Record<string, number> {
    return this.getSingleton<Record<string, number>>("strategy_params") ?? {};
  }

  /** Seed a brand-new database exactly like the old defaultSnapshot() file. */
  private seedIfEmpty(): void {
    const existing = this.getSingleton<Partial<BotStateRow>>("bot_state");
    if (existing !== undefined) return;
    const seed = defaultSnapshot();
    this.transaction(() => {
      this.setSingleton("bot_state", seed.bot_state);
      this.setSingleton("strategy_params", seed.strategy_params);
      this.setSingleton("volume_baselines", seed.volume_baselines);
      this.setSingleton("analyst_memo", seed.analyst_memo);
      for (const point of seed.equity_points) {
        this.db
          .prepare("INSERT INTO equity_points (ts, data) VALUES (?, ?)")
          .run(point.ts, JSON.stringify(point));
      }
    });
  }

  // --- one-time JSON → SQLite migration -----------------------------------------

  /**
   * Returns the normalized legacy snapshot when the configured path holds a
   * JSON store that must be migrated, null otherwise. An existing-but-corrupt
   * JSON file throws (never silently start a fresh db next to real data).
   */
  private readLegacyJsonForMigration(): AutopilotSnapshot | null {
    if (!existsSync(this.path)) return null;
    // The configured path IS the sqlite target and already holds a database.
    if (this.path === this.dbFile && isSqliteFile(this.path)) return null;
    // A sqlite db already exists next to the JSON file: the migration already
    // ran (or the operator created one) — never clobber it with stale JSON.
    if (this.path !== this.dbFile && existsSync(this.dbFile)) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(this.path, "utf8"));
    } catch {
      parsed = null;
    }
    if (!parsed || typeof parsed !== "object") {
      throw new Error(
        `autopilot store at ${this.path} exists but is unreadable — refusing to default over real data`,
      );
    }
    return normalizeSnapshot(parsed as Partial<AutopilotSnapshot>);
  }

  /**
   * Lossless one-time migration: write the whole normalized snapshot into a
   * temp sqlite db, then rename the JSON original to `<path>.migrated-backup`
   * and the temp db into place. A crash at any point leaves either the JSON
   * store or the backup intact — never a half-migrated live db.
   */
  private migrateFromJson(snapshot: AutopilotSnapshot): void {
    const tmp = `${this.dbFile}.tmp-migrate-${process.pid}`;
    const dropTmp = () => {
      for (const file of [tmp, `${tmp}-wal`, `${tmp}-shm`, `${tmp}-journal`]) {
        rmSync(file, { force: true });
      }
    };
    dropTmp();
    const db = openSqliteDatabase(tmp);
    try {
      // Deliberately NOT WAL here: the rollback journal folds every write into
      // the single main file, so the rename below moves the COMPLETE database.
      // (A WAL-mode temp db can leave committed rows in a sidecar `-wal` file
      // that would not follow the rename.) WAL is enabled on first real open.
      db.exec(SCHEMA_SQL);
      db.exec("BEGIN IMMEDIATE");
      try {
        const singleton = db.prepare("INSERT INTO singletons (key, data) VALUES (?, ?)");
        singleton.run("bot_state", JSON.stringify(snapshot.bot_state));
        singleton.run("strategy_params", JSON.stringify(snapshot.strategy_params));
        singleton.run("volume_baselines", JSON.stringify(snapshot.volume_baselines));
        singleton.run("analyst_memo", JSON.stringify(snapshot.analyst_memo));

        const insertIdRow = (table: string) => db.prepare(`INSERT INTO ${table} (id, ts, data) VALUES (?, ?, ?)`);
        const trades = insertIdRow("trades");
        for (const row of snapshot.trades) trades.run(row.id, row.ts, JSON.stringify(row));
        const activity = insertIdRow("activity");
        for (const row of snapshot.activity) activity.run(row.id, row.ts, JSON.stringify(row));
        const memory = insertIdRow("web3_memory");
        for (const row of snapshot.web3_memory) memory.run(row.id, row.ts, JSON.stringify(row));
        const decisions = insertIdRow("decisions");
        for (const row of snapshot.decisions) decisions.run(row.id, row.ts, JSON.stringify(row));
        const changelog = insertIdRow("param_changelog");
        for (const row of snapshot.param_changelog) changelog.run(row.id, row.ts, JSON.stringify(row));
        const candidates = insertIdRow("candidate_snapshots");
        for (const row of snapshot.candidate_snapshots) candidates.run(row.id, row.ts, JSON.stringify(row));

        const positions = db.prepare("INSERT INTO positions (mint, data) VALUES (?, ?)");
        for (const row of snapshot.positions) positions.run(row.mint, JSON.stringify(row));
        const equity = db.prepare("INSERT INTO equity_points (ts, data) VALUES (?, ?)");
        for (const row of snapshot.equity_points) equity.run(row.ts, JSON.stringify(row));
        const watches = db.prepare("INSERT INTO exit_watches (id, exit_ts, data) VALUES (?, ?, ?)");
        for (const row of snapshot.exit_watches) watches.run(row.id, row.exit_ts, JSON.stringify(row));
        const prices = db.prepare("INSERT INTO price_history (ts, data) VALUES (?, ?)");
        for (const row of snapshot.price_history) prices.run(row.ts, JSON.stringify(row));

        const migrated: BotActivityRow = {
          id: randomUUID(),
          ts: new Date().toISOString(),
          kind: "store",
          message: "Store migrated to SQLite",
        };
        activity.run(migrated.id, migrated.ts, JSON.stringify(migrated));

        db.exec("COMMIT");
      } catch (error) {
        try {
          db.exec("ROLLBACK");
        } catch {
          // the temp file is discarded below either way
        }
        throw error;
      }
      db.close();
    } catch (error) {
      try {
        db.close();
      } catch {
        // already closed
      }
      dropTmp();
      throw error;
    }
    // Rename order: the JSON original steps aside first, then the fully
    // written temp db takes the target name. Both renames are same-directory.
    renameSync(this.path, `${this.path}.migrated-backup`);
    renameSync(tmp, this.dbFile);
    dropTmp(); // stray sidecar files, if any
  }
}

// --- singleton resolution -----------------------------------------------------

let cached: AutopilotStore | null = null;
let cachedPath: string | null = null;

export function autopilotStore(): AutopilotStore {
  const path = autopilotDbPath();
  if (!cached || cachedPath !== path) {
    cached?.close();
    cached = new AutopilotStore(path);
    cachedPath = path;
  }
  return cached;
}

/** Test seam: close the sqlite handle and drop the cached store so the next
 * autopilotStore() reopens the db file (and temp dirs can be cleaned up). */
export function __resetAutopilotStoreForTests(): void {
  cached?.close();
  cached = null;
  cachedPath = null;
}
