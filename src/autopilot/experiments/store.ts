import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { openSqliteDatabase, resolveSqlitePath, type SqliteDatabase } from "../sqlite";
import { EXPERIMENT_DEFINITIONS } from "./definitions";
import type {
  ExperimentDefinition,
  ExperimentId,
  ExperimentPosition,
  ExperimentRun,
  ExperimentSummary,
  ExperimentTrade,
} from "./types";

type DbRow = Record<string, unknown>;

function row(value: unknown): DbRow {
  return (value ?? {}) as DbRow;
}

function rows(value: unknown[]): DbRow[] {
  return value as DbRow[];
}

function number(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function defaultPath(): string {
  if (process.env.AUTOPILOT_EXPERIMENT_DB?.trim()) return resolveSqlitePath(process.env.AUTOPILOT_EXPERIMENT_DB.trim());
  const primary = resolveSqlitePath(process.env.AUTOPILOT_DB?.trim() || ".data/autopilot.db.json");
  return resolve(dirname(primary), "autopilot-experiments.sqlite");
}

export function experimentConfigHash(definition: ExperimentDefinition): string {
  return createHash("sha256").update(JSON.stringify(definition)).digest("hex").slice(0, 12);
}

export class ExperimentStore {
  readonly path: string;
  private readonly db: SqliteDatabase;

  constructor(path = defaultPath()) {
    this.path = resolve(path);
    mkdirSync(dirname(this.path), { recursive: true });
    this.db = openSqliteDatabase(this.path);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS experiment_runs (
        id TEXT PRIMARY KEY, experiment_id TEXT NOT NULL, name TEXT NOT NULL,
        source TEXT NOT NULL, treatment TEXT NOT NULL, config_hash TEXT NOT NULL,
        config_json TEXT NOT NULL, started_at TEXT NOT NULL, ended_at TEXT
      );
      CREATE INDEX IF NOT EXISTS experiment_runs_current ON experiment_runs(experiment_id, ended_at);
      CREATE TABLE IF NOT EXISTS experiment_controls (
        experiment_id TEXT PRIMARY KEY, paused INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS experiment_positions (
        run_id TEXT NOT NULL, mint TEXT NOT NULL, data TEXT NOT NULL,
        PRIMARY KEY(run_id, mint), FOREIGN KEY(run_id) REFERENCES experiment_runs(id)
      );
      CREATE TABLE IF NOT EXISTS experiment_trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, ts TEXT NOT NULL,
        side TEXT NOT NULL, mint TEXT NOT NULL, symbol TEXT NOT NULL,
        value_usd REAL NOT NULL, fee_usd REAL NOT NULL, realized_pnl_usd REAL,
        data TEXT NOT NULL, FOREIGN KEY(run_id) REFERENCES experiment_runs(id)
      );
      CREATE INDEX IF NOT EXISTS experiment_trades_run_ts ON experiment_trades(run_id, ts);
      CREATE TABLE IF NOT EXISTS experiment_decisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, ts TEXT NOT NULL,
        symbol TEXT NOT NULL, verdict TEXT NOT NULL, reason TEXT NOT NULL,
        data TEXT NOT NULL, FOREIGN KEY(run_id) REFERENCES experiment_runs(id)
      );
      CREATE INDEX IF NOT EXISTS experiment_decisions_run_ts ON experiment_decisions(run_id, ts);
      CREATE TABLE IF NOT EXISTS experiment_equity (
        id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, ts TEXT NOT NULL,
        equity_usd REAL NOT NULL, cash_usd REAL NOT NULL,
        FOREIGN KEY(run_id) REFERENCES experiment_runs(id)
      );
      CREATE INDEX IF NOT EXISTS experiment_equity_run_ts ON experiment_equity(run_id, ts);
    `);
    this.ensureRuns(EXPERIMENT_DEFINITIONS);
  }

  close(): void {
    this.db.close();
  }

  ensureRuns(definitions: ExperimentDefinition[]): ExperimentRun[] {
    const now = new Date().toISOString();
    for (const definition of definitions) {
      const hash = experimentConfigHash(definition);
      const current = row(this.db.prepare(
        "SELECT id, config_hash FROM experiment_runs WHERE experiment_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1",
      ).get(definition.id));
      if (current.id && current.config_hash !== hash) {
        this.db.prepare("UPDATE experiment_runs SET ended_at = ? WHERE id = ?").run(now, String(current.id));
      }
      if (!current.id || current.config_hash !== hash) {
        const runId = `${definition.id}:${hash}:${now.replace(/[-:.TZ]/g, "").slice(0, 14)}`;
        this.db.prepare(
          "INSERT INTO experiment_runs(id, experiment_id, name, source, treatment, config_hash, config_json, started_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)",
        ).run(runId, definition.id, definition.name, definition.source, definition.treatment, hash, JSON.stringify(definition), now);
      }
      this.db.prepare("INSERT OR IGNORE INTO experiment_controls(experiment_id, paused, updated_at) VALUES(?, 0, ?)").run(definition.id, now);
    }
    return this.runs();
  }

  runs(): ExperimentRun[] {
    const order = new Map(EXPERIMENT_DEFINITIONS.map((definition, index) => [definition.id, index]));
    return rows(this.db.prepare(`
      SELECT r.*, COALESCE(c.paused, 0) AS paused
      FROM experiment_runs r LEFT JOIN experiment_controls c ON c.experiment_id = r.experiment_id
      WHERE r.ended_at IS NULL ORDER BY r.started_at, r.experiment_id
    `).all()).map((item) => ({
      id: String(item.id),
      experiment_id: String(item.experiment_id) as ExperimentId,
      name: String(item.name),
      source: String(item.source) as ExperimentRun["source"],
      treatment: String(item.treatment) as ExperimentRun["treatment"],
      config_hash: String(item.config_hash),
      config: JSON.parse(String(item.config_json)) as ExperimentDefinition,
      started_at: String(item.started_at),
      paused: number(item.paused) === 1,
    })).sort((left, right) => (order.get(left.experiment_id) ?? 99) - (order.get(right.experiment_id) ?? 99));
  }

  setPaused(experimentId: ExperimentId, paused: boolean): void {
    const result = this.db.prepare("SELECT experiment_id FROM experiment_controls WHERE experiment_id = ?").get(experimentId);
    if (!result) throw new Error(`unknown experiment: ${experimentId}`);
    this.db.prepare("UPDATE experiment_controls SET paused = ?, updated_at = ? WHERE experiment_id = ?")
      .run(paused ? 1 : 0, new Date().toISOString(), experimentId);
  }

  positions(runId: string): ExperimentPosition[] {
    return rows(this.db.prepare("SELECT data FROM experiment_positions WHERE run_id = ? ORDER BY mint").all(runId))
      .map((item) => JSON.parse(String(item.data)) as ExperimentPosition);
  }

  upsertPosition(position: ExperimentPosition): void {
    this.db.prepare("INSERT OR REPLACE INTO experiment_positions(run_id, mint, data) VALUES(?, ?, ?)")
      .run(position.run_id, position.mint, JSON.stringify(position));
  }

  closePosition(runId: string, mint: string): void {
    this.db.prepare("DELETE FROM experiment_positions WHERE run_id = ? AND mint = ?").run(runId, mint);
  }

  trades(runId: string, limit = 10_000): ExperimentTrade[] {
    return rows(this.db.prepare("SELECT data FROM experiment_trades WHERE run_id = ? ORDER BY id ASC LIMIT ?").all(runId, limit))
      .map((item) => JSON.parse(String(item.data)) as ExperimentTrade);
  }

  appendTrade(trade: Omit<ExperimentTrade, "id">): ExperimentTrade {
    const result = this.db.prepare(`
      INSERT INTO experiment_trades(run_id, ts, side, mint, symbol, value_usd, fee_usd, realized_pnl_usd, data)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(trade.run_id, trade.ts, trade.side, trade.mint, trade.symbol, trade.value_usd, trade.fee_usd, trade.realized_pnl_usd, "{}") as { lastInsertRowid?: number | bigint };
    const completed = { ...trade, id: Number(result.lastInsertRowid ?? 0) };
    this.db.prepare("UPDATE experiment_trades SET data = ? WHERE id = ?").run(JSON.stringify(completed), completed.id);
    return completed;
  }

  appendDecision(input: { run_id: string; ts: string; symbol: string; verdict: string; reason: string; data?: unknown }): void {
    const prior = row(this.db.prepare(
      "SELECT ts, verdict, reason FROM experiment_decisions WHERE run_id = ? AND symbol = ? ORDER BY id DESC LIMIT 1",
    ).get(input.run_id, input.symbol));
    if (
      prior.ts && prior.verdict === input.verdict && prior.reason === input.reason &&
      Date.parse(input.ts) - Date.parse(String(prior.ts)) < 5 * 60_000
    ) return;
    this.db.prepare("INSERT INTO experiment_decisions(run_id, ts, symbol, verdict, reason, data) VALUES(?, ?, ?, ?, ?, ?)")
      .run(input.run_id, input.ts, input.symbol, input.verdict, input.reason, JSON.stringify(input.data ?? {}));
  }

  cash(run: ExperimentRun): number {
    const totals = row(this.db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN side = 'buy' THEN value_usd + fee_usd ELSE 0 END), 0) AS spent,
        COALESCE(SUM(CASE WHEN side = 'sell' THEN value_usd - fee_usd ELSE 0 END), 0) AS received
      FROM experiment_trades WHERE run_id = ?
    `).get(run.id));
    return run.config.starting_cash_usd - number(totals.spent) + number(totals.received);
  }

  markEquity(runId: string, ts: string, equityUsd: number, cashUsd: number): void {
    const latest = row(this.db.prepare("SELECT ts FROM experiment_equity WHERE run_id = ? ORDER BY id DESC LIMIT 1").get(runId));
    if (latest.ts && Date.parse(ts) - Date.parse(String(latest.ts)) < 5 * 60_000) return;
    this.db.prepare("INSERT INTO experiment_equity(run_id, ts, equity_usd, cash_usd) VALUES(?, ?, ?, ?)")
      .run(runId, ts, equityUsd, cashUsd);
  }

  equityPoints(runId: string): Array<{ ts: string; equity_usd: number; cash_usd: number }> {
    return rows(this.db.prepare("SELECT ts, equity_usd, cash_usd FROM experiment_equity WHERE run_id = ? ORDER BY id ASC").all(runId))
      .map((item) => ({ ts: String(item.ts), equity_usd: number(item.equity_usd), cash_usd: number(item.cash_usd) }));
  }

  summaries(prices = new Map<string, number>()): ExperimentSummary[] {
    return this.runs().map((run) => {
      const trades = this.trades(run.id);
      const positions = this.positions(run.id);
      const cash = this.cash(run);
      const marked = positions.reduce((sum, position) => sum + position.qty * (prices.get(position.mint) ?? position.entry_price_usd), 0);
      const latestPoint = this.equityPoints(run.id).at(-1);
      const missingOpenPrice = positions.some((position) => !prices.has(position.mint));
      const equity = missingOpenPrice && latestPoint ? latestPoint.equity_usd : cash + marked;
      const exits = trades.filter((trade) => trade.side === "sell" && trade.realized_pnl_usd !== null);
      const wins = exits.filter((trade) => (trade.realized_pnl_usd ?? 0) > 0);
      const grossProfit = wins.reduce((sum, trade) => sum + (trade.realized_pnl_usd ?? 0), 0);
      const grossLoss = Math.abs(exits.filter((trade) => (trade.realized_pnl_usd ?? 0) < 0).reduce((sum, trade) => sum + (trade.realized_pnl_usd ?? 0), 0));
      const curve = [run.config.starting_cash_usd, ...this.equityPoints(run.id).map((point) => point.equity_usd), equity];
      let peak = curve[0];
      let maxDrawdown = 0;
      for (const point of curve) {
        peak = Math.max(peak, point);
        if (peak > 0) maxDrawdown = Math.max(maxDrawdown, ((peak - point) / peak) * 100);
      }
      const netPnl = equity - run.config.starting_cash_usd;
      return {
        experiment_id: run.experiment_id,
        run_id: run.id,
        name: run.name,
        source: run.source,
        treatment: run.treatment,
        started_at: run.started_at,
        paused: run.paused,
        paper_only: true,
        starting_cash_usd: run.config.starting_cash_usd,
        cash_usd: cash,
        equity_usd: equity,
        net_pnl_usd: netPnl,
        net_bps: (netPnl / run.config.starting_cash_usd) * 10_000,
        open_positions: positions.length,
        round_trips: exits.length,
        wins: wins.length,
        win_rate_pct: exits.length > 0 ? (wins.length / exits.length) * 100 : null,
        expectancy_usd: exits.length > 0 ? exits.reduce((sum, trade) => sum + (trade.realized_pnl_usd ?? 0), 0) / exits.length : null,
        profit_factor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? null : 0,
        max_drawdown_pct: maxDrawdown,
        fees_usd: trades.reduce((sum, trade) => sum + trade.fee_usd, 0),
        turnover_usd: trades.reduce((sum, trade) => sum + trade.value_usd, 0),
        confidence: exits.length >= 100 ? "stronger" : exits.length >= 30 ? "directional" : "provisional",
        last_trade_at: trades.at(-1)?.ts ?? null,
        config_hash: run.config_hash,
      };
    });
  }
}

let singleton: ExperimentStore | null = null;

export function experimentStore(): ExperimentStore {
  singleton ??= new ExperimentStore();
  return singleton;
}

export function __resetExperimentStoreForTests(): void {
  singleton?.close();
  singleton = null;
}
