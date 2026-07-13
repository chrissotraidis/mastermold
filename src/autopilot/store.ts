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
import { EMPTY_CARRY_BOOK, type CarryBookState } from "./v3/carry-book";
import type { WalletBuyEvent } from "./v3/smart-wallets";
import type { WalletSuggestions } from "./v3/wallet-discovery";
import { EMPTY_BUDGET_STATE, type ApiBudgetState } from "./v3/api-budget";
import type { MintMetaRow } from "./mint-meta";
import type { TierBToken } from "./v3/universe-tiers";
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
import type { ReplayPromotionEvidence } from "./v3/replay/types";
import { aggregateCexGapWeeks, cexGapWeeklyKey, type CexGapObservation, type CexGapWeeklyAggregate, type CexVenue } from "./v3/cex-gap";
import type { CusumEventObservation } from "./v3/cusum";

export type AutopilotMode = "off" | "paper" | "live" | "halted";

export type V3PromotionState = {
  /** Active paper authority. Only an operator confirmation may turn this on. */
  ready: boolean;
  /** Latest pure evidence-gate result. The daemon may update this, never ready. */
  eligible?: boolean;
  ts: string;
  operator_confirmed_at?: string | null;
  last_reason?: string;
};

export type CexListing = { symbol: string; venue: CexVenue; pair: string; listed: boolean; checked_at: string };

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
  /** Set for V3 fills so paper evidence and risk events remain attributable. */
  strategy_id?: string;
  /** Live fills only: the confirmed Solana transaction signature. */
  signature?: string;
  /** Whether paper execution used a venue quote or the legacy flat model. */
  fill_basis?: "quoted" | "flat_fallback";
  /** Millisecond timestamps for decision-to-fill latency attribution. */
  t_signal_ms?: number;
  t_decision_ms?: number;
  t_quote_ms?: number;
  t_fill_ms?: number;
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
  /** Strategy-specific symmetric take-profit distance (CUSUM triple barrier). */
  tp_pct?: number;
  /** Unconditional vertical barrier; legacy positions omit it. */
  deadline_ts?: string;
  /** v2: persisted high-water mark so the armed trail survives restarts. */
  peak_usd?: number;
  opened_at: string;
  updated_at: string;
  /** Originating V3 module; absent for v2/legacy positions. */
  strategy_id?: string;
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
  /** Cost used by the v2 edge gate. Optional on legacy rows and exits. */
  round_trip_cost_pct?: number;
  cost_source?: "modeled" | "measured" | "flat";
  /** Bar Portion overlay evidence on deferred buy decisions. */
  bp_deferred?: boolean;
  bp?: number;
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
  /** Optional strategy/overlay features not part of the common market signal. */
  features?: Record<string, number | string | boolean>;
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

/** Structured executable-route evidence captured after paper fills. The
 * human-readable rehearsal note remains in web3_memory; this row is the
 * bounded numeric substrate used by cost statistics and later cost models. */
export type RehearsalRow = {
  id: string;
  ts: string;
  mint: string;
  symbol: string;
  side: "buy" | "sell";
  notional_usd: number;
  /** Signed: positive means the live route was worse than the paper fill. */
  live_cost_vs_paper_pct: number | null;
  /**
   * Provenance for the comparison price. A rehearsal immediately following a
   * quoted paper fill compares Jupiter with itself and is useful route/impact
   * telemetry, but it is not an independent slippage sample.
   *
   * Missing on legacy rows: fail closed and do not use those rows to lower a
   * cost assumption because their comparison basis cannot be proven.
   */
  reference_basis?: "quoted_fill" | "flat_fallback";
  price_impact_pct: number | null;
  status: "quoted" | "no-route" | "error";
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

/** Counterfactual for a BP timing veto. It is not an exit and has no trade id. */
export type VetoWatchRow = {
  id: string;
  ts: string;
  mint: string;
  symbol: string;
  price_at_veto_usd: number;
  bp: number;
  mark_30m_usd: number | null;
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
  rehearsals: RehearsalRow[];
  tier_b: TierBToken[];
  mint_meta: MintMetaRow[];
  tier_b_denylist: string[];
  tier_b_first_seen: Record<string, string>;
  decisions: BotDecisionRow[];
  /** Raw stored values; ALWAYS read through sanitizeParams (clamped merge). */
  strategy_params: Record<string, number>;
  param_changelog: ParamChangelogEntry[];
  exit_watches: ExitWatchRow[];
  veto_watches: VetoWatchRow[];
  cex_gap_observations: CexGapObservation[];
  cex_listings: Record<string, CexListing>;
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
const REHEARSAL_CAP = 2_000;
// Must outlive the go-live gate's 5-day trace window (runway audit): at the
// paper skip cadence of one row per 5 minutes, 5 days ≈ 1,440 skip rows —
// with 400, fills aged out of the trace in hours and the gate's "every fill
// traced" check would silently start failing as history grew.
const DECISION_CAP = 3_000;
const WALLET_BUY_CAP = 500;
const EXIT_WATCH_CAP = 200;
const VETO_WATCH_CAP = 1_000;
const CEX_GAP_CAP = 20_000;
const CUSUM_EVENT_CAP = 20_000;
const PARAM_CHANGELOG_CAP = 200;
// ≈15h of minute bars; widened so the 6h label pass has margin
// Sized to the go-live gate's 5-day evidence window (unattended-runway audit,
// 2026-07-10): bars land every 5 minutes, so 2,016 rows ≈ 7 days — enough for
// the SOL benchmark's ≥2.5-day span requirement with headroom. The old
// 900 one-minute bars covered 15 hours and the benchmark could never engage.
const PRICE_HISTORY_CAP = 2_016;
// ~10 weeks of 5-minute equity marks; the one previously unbounded table.
const EQUITY_POINT_CAP = 20_000;

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
    rehearsals: [],
    tier_b: [],
    mint_meta: [],
    tier_b_denylist: [],
    tier_b_first_seen: {},
    decisions: [],
    strategy_params: {},
    param_changelog: [],
    exit_watches: [],
    veto_watches: [],
    cex_gap_observations: [],
    cex_listings: {},
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
    rehearsals: Array.isArray(parsed.rehearsals) ? parsed.rehearsals : [],
    tier_b: Array.isArray(parsed.tier_b) ? parsed.tier_b : [],
    mint_meta: Array.isArray(parsed.mint_meta) ? parsed.mint_meta : [],
    tier_b_denylist: Array.isArray(parsed.tier_b_denylist)
      ? parsed.tier_b_denylist.filter((mint): mint is string => typeof mint === "string")
      : [],
    tier_b_first_seen:
      parsed.tier_b_first_seen && typeof parsed.tier_b_first_seen === "object"
        ? parsed.tier_b_first_seen
        : {},
    decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
    strategy_params:
      parsed.strategy_params && typeof parsed.strategy_params === "object"
        ? (parsed.strategy_params as Record<string, number>)
        : {},
    param_changelog: Array.isArray(parsed.param_changelog) ? parsed.param_changelog : [],
    exit_watches: Array.isArray(parsed.exit_watches) ? parsed.exit_watches : [],
    veto_watches: Array.isArray(parsed.veto_watches) ? parsed.veto_watches : [],
    cex_gap_observations: Array.isArray(parsed.cex_gap_observations) ? parsed.cex_gap_observations : [],
    cex_listings: parsed.cex_listings && typeof parsed.cex_listings === "object" ? parsed.cex_listings : {},
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
  CREATE TABLE IF NOT EXISTS rehearsals (
    id TEXT PRIMARY KEY,
    ts TEXT NOT NULL,
    data TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tier_b (
    mint TEXT PRIMARY KEY,
    data TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS mint_meta (
    mint TEXT PRIMARY KEY,
    data TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS decisions (
    id TEXT PRIMARY KEY,
    ts TEXT NOT NULL,
    data TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS wallet_buys (
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
  CREATE TABLE IF NOT EXISTS veto_watches (
    id TEXT PRIMARY KEY,
    ts TEXT NOT NULL,
    data TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS candidate_snapshots (
    id TEXT PRIMARY KEY,
    ts TEXT NOT NULL,
    data TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_candidate_snapshots_ts ON candidate_snapshots(ts);
  CREATE TABLE IF NOT EXISTS cex_gap_observations (
    id TEXT PRIMARY KEY,
    ts TEXT NOT NULL,
    data TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_cex_gap_ts ON cex_gap_observations(ts);
  CREATE TABLE IF NOT EXISTS cex_gap_weekly (
    key TEXT PRIMARY KEY,
    data TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS cusum_event_observations (
    id TEXT PRIMARY KEY,
    ts TEXT NOT NULL,
    data TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_cusum_event_ts ON cusum_event_observations(ts);
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
    this.backfillCexGapWeeklyIfEmpty();
    this.reconcileCexGapWeeklyV2Once();
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
    this.transaction(() => {
      this.db
        .prepare("INSERT INTO equity_points (ts, data) VALUES (?, ?)")
        .run(point.ts, JSON.stringify(point));
      this.capEquityPoints();
    });
    return point;
  }

  /** equity_points has no id column, so the generic capTable can't serve it. */
  private capEquityPoints(): void {
    this.db
      .prepare(
        "DELETE FROM equity_points WHERE ts IN (SELECT ts FROM equity_points ORDER BY ts DESC LIMIT -1 OFFSET ?)",
      )
      .run(EQUITY_POINT_CAP);
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

  // --- structured live-route rehearsals (append-only, rolling cap) -----------

  appendRehearsal(entry: Omit<RehearsalRow, "id" | "ts"> & { ts?: string }): RehearsalRow {
    const row: RehearsalRow = {
      ...entry,
      id: `rhs_${randomUUID()}`,
      ts: entry.ts ?? new Date().toISOString(),
    };
    this.insertRow("rehearsals", row.id, row.ts, row, REHEARSAL_CAP);
    return row;
  }

  /** Newest first. */
  rehearsals(limit = REHEARSAL_CAP): RehearsalRow[] {
    return this.allRows<RehearsalRow>("rehearsals")
      .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
      .slice(0, limit);
  }

  // --- Tier B rotation + mint metadata ---------------------------------------

  tierB(): TierBToken[] {
    return this.allRows<TierBToken>("tier_b");
  }

  setTierB(tokens: TierBToken[]): void {
    this.transaction(() => {
      this.db.prepare("DELETE FROM tier_b").run();
      const insert = this.db.prepare("INSERT INTO tier_b (mint, data) VALUES (?, ?)");
      const seen = new Set<string>();
      for (const token of tokens) {
        if (!token.mint || seen.has(token.mint)) continue;
        insert.run(token.mint, JSON.stringify(token));
        seen.add(token.mint);
      }
    });
  }

  mintMeta(): MintMetaRow[] {
    return this.allRows<MintMetaRow>("mint_meta");
  }

  upsertMintMeta(row: MintMetaRow): void {
    this.db
      .prepare("INSERT INTO mint_meta (mint, data) VALUES (?, ?) ON CONFLICT(mint) DO UPDATE SET data = excluded.data")
      .run(row.mint, JSON.stringify(row));
  }

  tierBDenylist(): string[] {
    const rows = this.getSingleton<string[]>("tier_b_denylist");
    return Array.isArray(rows) ? [...new Set(rows.filter((mint) => typeof mint === "string" && mint.length > 0))] : [];
  }

  setTierBDenylist(mints: string[]): void {
    this.setSingleton("tier_b_denylist", [...new Set(mints.filter((mint) => mint.length > 0))]);
  }

  addTierBDenylistMint(mint: string): void {
    if (!mint) return;
    this.setTierBDenylist([...this.tierBDenylist(), mint]);
  }

  tierBFirstSeen(): Record<string, string> {
    return { ...(this.getSingleton<Record<string, string>>("tier_b_first_seen") ?? {}) };
  }

  setTierBFirstSeen(firstSeen: Record<string, string>): void {
    this.setSingleton("tier_b_first_seen", { ...firstSeen });
  }

  tierBLastRotationAt(): string | null {
    return this.getSingleton<string | null>("tier_b_last_rotation_at") ?? null;
  }

  setTierBLastRotationAt(ts: string): void {
    this.setSingleton("tier_b_last_rotation_at", ts);
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

  // --- BP timing-veto counterfactuals -----------------------------------------

  appendVetoWatch(input: Omit<VetoWatchRow, "id" | "ts" | "mark_30m_usd" | "done"> & { ts?: string }): VetoWatchRow {
    const row: VetoWatchRow = {
      ...input,
      id: `vtw_${randomUUID()}`,
      ts: input.ts ?? new Date().toISOString(),
      mark_30m_usd: null,
      done: false,
    };
    this.insertRow("veto_watches", row.id, row.ts, row, VETO_WATCH_CAP);
    return row;
  }

  openVetoWatches(): VetoWatchRow[] {
    return this.allRows<VetoWatchRow>("veto_watches").filter((row) => !row.done);
  }

  vetoWatches(limit = VETO_WATCH_CAP): VetoWatchRow[] {
    return this.allRows<VetoWatchRow>("veto_watches")
      .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
      .slice(0, limit);
  }

  updateVetoWatch(row: VetoWatchRow): void {
    this.db.prepare("UPDATE veto_watches SET ts = ?, data = ? WHERE id = ?").run(row.ts, JSON.stringify(row), row.id);
  }

  // --- measurement-only DEX/CEX gap scout ------------------------------------

  appendCexGapObservation(row: CexGapObservation): void {
    this.transaction(() => {
      const aggregate = aggregateCexGapWeeks([row])[0];
      if (aggregate) {
        const stored = this.db.prepare("SELECT data FROM cex_gap_weekly WHERE key = ?").get(aggregate.key) as { data: string } | null | undefined;
        const prior = stored ? JSON.parse(stored.data) as CexGapWeeklyAggregate : null;
        const next: CexGapWeeklyAggregate = prior ? {
          ...prior,
          observations: prior.observations + aggregate.observations,
          positive_count: prior.positive_count + aggregate.positive_count,
          over_25_count: prior.over_25_count + aggregate.over_25_count,
        } : aggregate;
        this.db.prepare("INSERT INTO cex_gap_weekly (key, data) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data")
          .run(next.key, JSON.stringify(next));
      }
      this.insertRow("cex_gap_observations", `cxg_${randomUUID()}`, row.ts, row, CEX_GAP_CAP);
    });
  }

  cexGapObservations(limit = CEX_GAP_CAP): CexGapObservation[] {
    return this.allRows<CexGapObservation>("cex_gap_observations")
      .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts)).slice(0, limit);
  }

  cexGapWeeklyAggregates(): CexGapWeeklyAggregate[] {
    return this.allRows<CexGapWeeklyAggregate>("cex_gap_weekly")
      .sort((a, b) => a.week.localeCompare(b.week) || a.key.localeCompare(b.key));
  }

  // --- durable CUSUM event-rate evidence ------------------------------------

  appendCusumEventObservation(row: CusumEventObservation): void {
    this.insertRow("cusum_event_observations", `csm_${randomUUID()}`, row.ts, row, CUSUM_EVENT_CAP);
  }

  cusumEventObservations(limit = CUSUM_EVENT_CAP): CusumEventObservation[] {
    return this.allRows<CusumEventObservation>("cusum_event_observations")
      .sort((left, right) => right.ts_ms - left.ts_ms)
      .slice(0, limit);
  }

  /** Starts a truthful observation clock exactly when durable event logging is
   * first enabled, rather than pretending earlier paper time was observed. */
  ensureCusumObservationStartedAt(nowMs: number = Date.now()): string {
    const stored = this.getSingleton<string>("cusum_observation_started_at");
    if (stored && Number.isFinite(Date.parse(stored))) return stored;
    const startedAt = new Date(nowMs).toISOString();
    this.setSingleton("cusum_observation_started_at", startedAt);
    return startedAt;
  }

  private backfillCexGapWeeklyIfEmpty(): void {
    const found = this.db.prepare("SELECT key FROM cex_gap_weekly LIMIT 1").get() as { key: string } | null | undefined;
    if (found) return;
    const aggregates = aggregateCexGapWeeks(this.allRows<CexGapObservation>("cex_gap_observations"));
    if (!aggregates.length) return;
    this.transaction(() => {
      const insert = this.db.prepare("INSERT INTO cex_gap_weekly (key, data) VALUES (?, ?)");
      for (const aggregate of aggregates) insert.run(cexGapWeeklyKey(aggregate.week, aggregate.symbol, aggregate.venue), JSON.stringify(aggregate));
    });
  }

  /** One-time deployment reconciliation. A scout batch can race the initial
   * empty-table backfill in another process, leaving raw detail ahead by one
   * batch. Retained raw aggregates may only RAISE a durable week here; they
   * never lower it, so a future schema open cannot erase history after the raw
   * cap rotates. The version marker makes this migration run exactly once. */
  private reconcileCexGapWeeklyV2Once(): void {
    if (this.getSingleton<string>("cex_gap_weekly_reconcile_version") === "2") return;
    const retained = aggregateCexGapWeeks(this.allRows<CexGapObservation>("cex_gap_observations"));
    this.transaction(() => {
      const read = this.db.prepare("SELECT data FROM cex_gap_weekly WHERE key = ?");
      const upsert = this.db.prepare("INSERT INTO cex_gap_weekly (key, data) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data");
      for (const aggregate of retained) {
        const found = read.get(aggregate.key) as { data: string } | null | undefined;
        const durable = found ? JSON.parse(found.data) as CexGapWeeklyAggregate : null;
        if (!durable || aggregate.observations > durable.observations) {
          upsert.run(aggregate.key, JSON.stringify(aggregate));
        }
      }
      this.setSingleton("cex_gap_weekly_reconcile_version", "2");
    });
  }

  cexListings(): Record<string, CexListing> {
    const rows = this.getSingleton<Record<string, CexListing>>("cex_listings");
    return rows ? Object.fromEntries(Object.entries(rows).map(([key, value]) => [key, { ...value }])) : {};
  }

  setCexListings(rows: Record<string, CexListing>): void {
    this.setSingleton("cex_listings", rows);
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

  // --- watched wallets (copy_wallets module: operator-curated smart money) ------

  watchedWallets(): string[] {
    const list = this.getSingleton<string[]>("watched_wallets");
    return Array.isArray(list) ? [...list] : [];
  }

  setWatchedWallets(wallets: string[]): void {
    this.setSingleton("watched_wallets", wallets);
  }

  walletSuggestions(): WalletSuggestions | null {
    const state = this.getSingleton<WalletSuggestions>("wallet_suggestions");
    return state ? { ...state } : null;
  }

  // --- monthly API request budgets (paid-tier guardrails) ------------------------

  /** Keyed by service name (e.g. "solanatracker"); absent services start empty. */
  apiBudget(service: string): ApiBudgetState {
    const budgets = this.getSingleton<Record<string, ApiBudgetState>>("api_budgets") ?? {};
    return budgets[service] ? { ...budgets[service] } : { ...EMPTY_BUDGET_STATE };
  }

  setApiBudget(service: string, state: ApiBudgetState): void {
    this.transaction(() => {
      const budgets = { ...(this.getSingleton<Record<string, ApiBudgetState>>("api_budgets") ?? {}) };
      budgets[service] = state;
      this.setSingleton("api_budgets", budgets);
    });
  }

  setWalletSuggestions(state: WalletSuggestions): void {
    this.setSingleton("wallet_suggestions", state);
  }

  /** Followed wallets' detected buys — the raw record the report cards grade. */
  appendWalletBuy(event: WalletBuyEvent): void {
    this.insertRow("wallet_buys", `wb_${randomUUID()}`, event.ts, event, WALLET_BUY_CAP);
  }

  walletBuys(limit = 500): WalletBuyEvent[] {
    return this.allRows<WalletBuyEvent>("wallet_buys")
      .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
      .slice(0, limit);
  }

  smartWalletCursors(): Record<string, string> {
    return { ...(this.getSingleton<Record<string, string>>("smart_wallet_cursors") ?? {}) };
  }

  setSmartWalletCursors(cursors: Record<string, string>): void {
    this.setSingleton("smart_wallet_cursors", cursors);
  }

  // --- synthetic carry book (funding_basis shadow P&L) ---------------------------

  carryBook(): CarryBookState {
    const state = this.getSingleton<CarryBookState>("carry_book");
    return state ? { ...EMPTY_CARRY_BOOK, ...state } : { ...EMPTY_CARRY_BOOK };
  }

  setCarryBook(state: CarryBookState): void {
    this.setSingleton("carry_book", state);
  }

  // --- V3 paper-promotion state (evidence-gated, daemon-evaluated) --------------

  v3Promotions(): Record<string, V3PromotionState> {
    const states = this.getSingleton<Record<string, V3PromotionState>>("v3_promotion_by_strategy");
    return states ? Object.fromEntries(Object.entries(states).map(([key, value]) => [key, { ...value }])) : {};
  }

  v3Promotion(strategyId: string): V3PromotionState | null {
    const state = this.v3Promotions()[strategyId];
    if (state) return { ...state };
    // Read-only compatibility for evidence created before per-strategy state.
    if (strategyId === "xsec") {
      const legacy = this.getSingleton<{ ready: boolean; ts: string } | null>("v3_promotion");
      if (legacy) return { ...legacy };
    }
    return null;
  }

  setV3Promotion(strategyId: string, state: V3PromotionState): void {
    this.setSingleton("v3_promotion_by_strategy", { ...this.v3Promotions(), [strategyId]: state });
  }

  replayConfirmations(): Record<string, ReplayPromotionEvidence> {
    const evidence = this.getSingleton<Record<string, ReplayPromotionEvidence>>("v3_replay_confirmation");
    return evidence ? Object.fromEntries(Object.entries(evidence).map(([key, value]) => [key, { ...value }])) : {};
  }

  replayConfirmation(strategyId: string): ReplayPromotionEvidence | null {
    const evidence = this.replayConfirmations()[strategyId];
    return evidence ? { ...evidence } : null;
  }

  setReplayConfirmation(strategyId: string, evidence: ReplayPromotionEvidence): void {
    this.setSingleton("v3_replay_confirmation", { ...this.replayConfirmations(), [strategyId]: evidence });
  }

  cusumEdgeRatio(): { value: number; updated_at: string | null } {
    const state = this.getSingleton<{ value?: unknown; updated_at?: unknown }>("cusum_edge_ratio");
    const value = Number(state?.value);
    return {
      value: Number.isFinite(value) ? Math.min(0.3, Math.max(0.05, value)) : 0.15,
      updated_at: typeof state?.updated_at === "string" ? state.updated_at : null,
    };
  }

  setCusumEdgeRatio(value: number, nowMs = Date.now()): void {
    if (!Number.isFinite(value)) return;
    this.setSingleton("cusum_edge_ratio", {
      value: Math.min(0.3, Math.max(0.05, value)),
      updated_at: new Date(nowMs).toISOString(),
    });
  }

  barPortionEdgeRatio(): { value: number; updated_at: string | null } {
    const state = this.getSingleton<{ value?: unknown; updated_at?: unknown }>("bar_portion_edge_ratio");
    const value = Number(state?.value);
    return {
      value: Number.isFinite(value) ? Math.min(0.5, Math.max(0.05, value)) : 0.25,
      updated_at: typeof state?.updated_at === "string" ? state.updated_at : null,
    };
  }

  setBarPortionEdgeRatio(value: number, nowMs = Date.now()): void {
    if (!Number.isFinite(value)) return;
    this.setSingleton("bar_portion_edge_ratio", {
      value: Math.min(0.5, Math.max(0.05, value)),
      updated_at: new Date(nowMs).toISOString(),
    });
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
    return this.transaction(() => {
      this.insertRow("candidate_snapshots", row.id, row.ts, row, CANDIDATE_SNAPSHOT_CAP);
      // The bounded detail table may rotate before a slow strategy reaches its
      // 28-day ML eligibility window. Preserve only the auditable first/latest
      // timestamps per strategy in a tiny singleton; never infer elapsed shadow
      // time from model artifacts.
      const ranges = this.getSingleton<Record<string, { first_ts: string; latest_ts: string }>>("v3_strategy_evidence_ranges") ?? {};
      const prior = ranges[row.strategy_id];
      const firstTs = !prior || Date.parse(row.ts) < Date.parse(prior.first_ts) ? row.ts : prior.first_ts;
      const latestTs = !prior || Date.parse(row.ts) > Date.parse(prior.latest_ts) ? row.ts : prior.latest_ts;
      this.setSingleton("v3_strategy_evidence_ranges", { ...ranges, [row.strategy_id]: { first_ts: firstTs, latest_ts: latestTs } });
      return row;
    });
  }

  v3StrategyEvidenceRange(strategyId: string): { first_ts: string; latest_ts: string } | null {
    const ranges = this.getSingleton<Record<string, { first_ts: string; latest_ts: string }>>("v3_strategy_evidence_ranges") ?? {};
    const stored = ranges[strategyId];
    if (stored) return { ...stored };
    // Backfill deployments created before this singleton existed from the
    // retained rows. This is conservative when older rows have already aged
    // out: the gate waits longer instead of claiming history it cannot prove.
    const rows = this.candidateSnapshots(CANDIDATE_SNAPSHOT_CAP).filter((row) => row.strategy_id === strategyId);
    if (!rows.length) return null;
    const times = rows.map((row) => row.ts).sort((a, b) => Date.parse(a) - Date.parse(b));
    return { first_ts: times[0], latest_ts: times[times.length - 1] };
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
    // Rowid is already indexed. Finding the cap-th newest boundary and deleting
    // older rows avoids rescanning a growing NOT IN set on every daemon tick.
    this.db
      .prepare(`DELETE FROM ${table} WHERE rowid < COALESCE((SELECT rowid FROM ${table} ORDER BY rowid DESC LIMIT 1 OFFSET ?), -1)`)
      .run(Math.max(0, cap - 1));
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
      this.setSingleton("tier_b_denylist", seed.tier_b_denylist);
      this.setSingleton("tier_b_first_seen", seed.tier_b_first_seen);
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
        singleton.run("tier_b_denylist", JSON.stringify(snapshot.tier_b_denylist));
        singleton.run("tier_b_first_seen", JSON.stringify(snapshot.tier_b_first_seen));
        singleton.run("cex_listings", JSON.stringify(snapshot.cex_listings));

        const insertIdRow = (table: string) => db.prepare(`INSERT INTO ${table} (id, ts, data) VALUES (?, ?, ?)`);
        const trades = insertIdRow("trades");
        for (const row of snapshot.trades) trades.run(row.id, row.ts, JSON.stringify(row));
        const activity = insertIdRow("activity");
        for (const row of snapshot.activity) activity.run(row.id, row.ts, JSON.stringify(row));
        const memory = insertIdRow("web3_memory");
        for (const row of snapshot.web3_memory) memory.run(row.id, row.ts, JSON.stringify(row));
        const rehearsals = insertIdRow("rehearsals");
        for (const row of snapshot.rehearsals) rehearsals.run(row.id, row.ts, JSON.stringify(row));
        const decisions = insertIdRow("decisions");
        for (const row of snapshot.decisions) decisions.run(row.id, row.ts, JSON.stringify(row));
        const changelog = insertIdRow("param_changelog");
        for (const row of snapshot.param_changelog) changelog.run(row.id, row.ts, JSON.stringify(row));
        const candidates = insertIdRow("candidate_snapshots");
        for (const row of snapshot.candidate_snapshots) candidates.run(row.id, row.ts, JSON.stringify(row));
        const cexGaps = insertIdRow("cex_gap_observations");
        for (const row of snapshot.cex_gap_observations) cexGaps.run(`cxg_${randomUUID()}`, row.ts, JSON.stringify(row));

        const positions = db.prepare("INSERT INTO positions (mint, data) VALUES (?, ?)");
        for (const row of snapshot.positions) positions.run(row.mint, JSON.stringify(row));
        const tierB = db.prepare("INSERT INTO tier_b (mint, data) VALUES (?, ?)");
        for (const row of snapshot.tier_b) tierB.run(row.mint, JSON.stringify(row));
        const mintMeta = db.prepare("INSERT INTO mint_meta (mint, data) VALUES (?, ?)");
        for (const row of snapshot.mint_meta) mintMeta.run(row.mint, JSON.stringify(row));
        const equity = db.prepare("INSERT INTO equity_points (ts, data) VALUES (?, ?)");
        for (const row of snapshot.equity_points) equity.run(row.ts, JSON.stringify(row));
        const watches = db.prepare("INSERT INTO exit_watches (id, exit_ts, data) VALUES (?, ?, ?)");
        for (const row of snapshot.exit_watches) watches.run(row.id, row.exit_ts, JSON.stringify(row));
        const vetoWatches = insertIdRow("veto_watches");
        for (const row of snapshot.veto_watches) vetoWatches.run(row.id, row.ts, JSON.stringify(row));
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
