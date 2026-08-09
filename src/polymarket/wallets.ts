/**
 * The wallet-intelligence lane: identify Polymarket wallets with persistent
 * realized skill from public on-chain data, shadow-track their new trades at
 * OUR executable price (copy-lag honesty), and feed their stance into the
 * analyst's forecasts as one more piece of evidence — signal fusion, never
 * blind copying.
 *
 * Discipline this lane enforces:
 * - Wallets are selected on settled, realized results (>= a real sample), and
 *   must stay profitable on data they were NOT selected on: every shadow
 *   signal is graded out-of-sample at the ask WE could have hit at detection
 *   time, not at the wallet's own fill. Copy lag is measured, not assumed away.
 * - Leaderboard-style selection is avoided on purpose: top-P&L lists are
 *   dominated by market makers and one-hit whales. Discovery samples the live
 *   taker flow and filters by stake profile and settled-sample depth instead.
 * - No real money, no order routing. This is research state under .data only.
 */

import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { notifyOperator } from "../autopilot/notify";
import type { SqliteDatabase } from "../autopilot/sqlite";
import { classifyAnalystMarket, type AnalystCategory } from "./analyst";
import { fetchPolymarketResolutions } from "./markets";
import { fetchPolymarketOrderBooks, summarizePolymarketBook } from "./orderbook";
import { openPolymarketSqlite } from "./sqlite";

export const POLYMARKET_WALLETS_MAX_FOLLOWED = 12;
/** A wallet must have this many settled positions before skill is measurable. */
export const WALLET_MIN_SETTLED = 25;
/** ...and this much total settled cost basis, so dust farms don't qualify. */
export const WALLET_MIN_VOLUME_USD = 250;
/** Follow requires this realized return per dollar of settled cost basis. */
export const WALLET_MIN_RETURN_PER_DOLLAR = 0.05;
/** Median stake band that excludes market-maker dust and uncopyable whales. */
export const WALLET_STAKE_BAND_USD: readonly [number, number] = [2, 5_000];
/** Shadow signals ignore trades below this size — sub-$20 flow is noise. */
export const WALLET_SIGNAL_MIN_USD = 20;

const DEFAULT_CYCLE_MINUTES = 30;
const DISCOVERY_EVERY_MS = 6 * 60 * 60 * 1_000;
const RESCORE_EVERY_MS = 7 * 24 * 60 * 60 * 1_000;
const SCORES_PER_CYCLE_MAX = 8;
const DISCOVERY_TRADE_PAGE = 500;
const SIGNAL_TRADES_PER_WALLET = 40;
const SMART_MONEY_WINDOW_MS = 7 * 24 * 60 * 60 * 1_000;
const DATA_API = "https://data-api.polymarket.com";
const USER_AGENT = "MasterMold/0.1 (local Polymarket wallet research)";

export function polymarketWalletsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.POLYMARKET_WALLETS === "1";
}

/* ------------------------------------------------------------------ */
/* Public data-api shapes (only the fields this lane reads).           */
/* ------------------------------------------------------------------ */

export type DataApiTrade = {
  proxyWallet: string;
  side: "BUY" | "SELL";
  asset: string;
  conditionId: string;
  size: number;
  price: number;
  timestamp: number;
  title: string;
  slug: string;
  outcome: string;
};

/** A row from /closed-positions: a fully settled bet with realized P&L.
 * This endpoint — not /positions — is the honest scoring source: redeemed
 * winners disappear from /positions entirely, which made every prompt-
 * redeeming wallet look like a 100% loser (observed live, 2026-08-09). */
export type DataApiClosedPosition = {
  conditionId: string;
  title: string;
  slug: string;
  avgPrice: number;
  totalBought: number;
  realizedPnl: number;
  curPrice: number;
  endDate: string | null;
  timestamp: number;
};

/* ------------------------------------------------------------------ */
/* Rows and reports.                                                   */
/* ------------------------------------------------------------------ */

export type WalletStatus = "followed" | "candidate" | "dropped";

export type WalletRow = {
  address: string;
  status: WalletStatus;
  first_seen: string;
  last_scored_at: string;
  settled_n: number;
  volume_usd: number;
  pnl_usd: number;
  return_per_dollar: number;
  early_return: number | null;
  late_return: number | null;
  median_stake_usd: number;
  news_share: number;
  last_signal_checkpoint: number;
  drop_reason: string | null;
};

export type WalletSignalRow = {
  id: string;
  detected_at: string;
  trade_ts: number;
  wallet: string;
  market_id: string;
  condition_id: string;
  question: string;
  slug: string;
  category: AnalystCategory;
  outcome_index: number;
  outcome: string;
  their_price: number;
  their_usd: number;
  our_ask: number | null;
  lag_seconds: number;
  status: "pending" | "resolved" | "invalid";
  winning_outcome_index: number | null;
  resolved_at: string | null;
  won: 0 | 1 | null;
  pnl_our_per_dollar: number | null;
  pnl_their_per_dollar: number | null;
};

export type WalletExpectancy = {
  resolved_n: number;
  wins: number;
  avg_pnl_our_per_dollar: number | null;
  avg_pnl_their_per_dollar: number | null;
  avg_lag_seconds: number | null;
};

export type WalletIntelligenceReport = {
  enabled: boolean;
  followed_count: number;
  candidate_count: number;
  dropped_count: number;
  signal_count: number;
  pending_signal_count: number;
  expectancy: WalletExpectancy;
  news_expectancy: WalletExpectancy;
  followed: Array<Pick<WalletRow, "address" | "settled_n" | "volume_usd" | "pnl_usd" | "return_per_dollar" | "early_return" | "late_return" | "median_stake_usd" | "news_share" | "last_scored_at">>;
  recent_signals: WalletSignalRow[];
  last_cycle_at: string | null;
  last_discovery_at: string | null;
  verdict_gate: string;
};

/* ------------------------------------------------------------------ */
/* Pure scoring: settled-position skill measurement.                   */
/* ------------------------------------------------------------------ */

export type WalletScore = {
  settled_n: number;
  volume_usd: number;
  pnl_usd: number;
  return_per_dollar: number;
  early_return: number | null;
  late_return: number | null;
  median_stake_usd: number;
  news_share: number;
  follow: boolean;
  reason: string;
};

export function scoreWalletPositions(positions: DataApiClosedPosition[]): WalletScore {
  const settled = positions
    .map((position) => ({
      position,
      pnl: position.realizedPnl,
      cost: position.totalBought > 0 && position.avgPrice > 0 ? position.totalBought * position.avgPrice : 0,
    }))
    .filter((entry) => entry.cost > 0)
    .sort((a, b) => a.position.timestamp - b.position.timestamp);

  const volume = settled.reduce((sum, entry) => sum + entry.cost, 0);
  const pnl = settled.reduce((sum, entry) => sum + entry.pnl, 0);
  const stakes = settled.map((entry) => entry.cost).sort((a, b) => a - b);
  const median = stakes.length === 0 ? 0 : stakes[Math.floor(stakes.length / 2)];
  const newsCount = settled.filter((entry) => classifyAnalystMarket(entry.position.title, entry.position.slug) === "news").length;

  const half = Math.floor(settled.length / 2);
  const slice = (entries: typeof settled) => {
    const cost = entries.reduce((sum, entry) => sum + entry.cost, 0);
    return cost > 0 ? entries.reduce((sum, entry) => sum + entry.pnl, 0) / cost : null;
  };
  const early = half >= 5 ? slice(settled.slice(0, half)) : null;
  const late = half >= 5 ? slice(settled.slice(half)) : null;

  const score: Omit<WalletScore, "follow" | "reason"> = {
    settled_n: settled.length,
    volume_usd: round2(volume),
    pnl_usd: round2(pnl),
    return_per_dollar: volume > 0 ? round4(pnl / volume) ?? 0 : 0,
    early_return: round4(early),
    late_return: round4(late),
    median_stake_usd: round2(median),
    news_share: settled.length > 0 ? round4(newsCount / settled.length) ?? 0 : 0,
  };

  const fail = (reason: string): WalletScore => ({ ...score, follow: false, reason });
  if (score.settled_n < WALLET_MIN_SETTLED) return fail(`only ${score.settled_n} settled positions (need ${WALLET_MIN_SETTLED})`);
  if (score.volume_usd < WALLET_MIN_VOLUME_USD) return fail(`settled volume $${score.volume_usd} below $${WALLET_MIN_VOLUME_USD}`);
  if (score.median_stake_usd < WALLET_STAKE_BAND_USD[0] || score.median_stake_usd > WALLET_STAKE_BAND_USD[1]) {
    return fail(`median stake $${score.median_stake_usd} outside copyable band (MM dust or whale)`);
  }
  if (score.return_per_dollar < WALLET_MIN_RETURN_PER_DOLLAR) {
    return fail(`return ${score.return_per_dollar}/$ below ${WALLET_MIN_RETURN_PER_DOLLAR}`);
  }
  // Persistence: profitable in BOTH the earlier and later half of their own
  // settled history. Selecting on one period and confirming on another is the
  // cheapest defense against streak luck (the real defense is shadow grading).
  if (score.early_return === null || score.late_return === null) return fail("not enough settled history to split for persistence");
  if (score.early_return <= 0 || score.late_return <= 0) {
    return fail(`no persistence: early ${score.early_return}/$, late ${score.late_return}/$`);
  }
  return { ...score, follow: true, reason: `+$${score.pnl_usd} on ${score.settled_n} settled ($${score.volume_usd} risked), early ${score.early_return}/$ late ${score.late_return}/$` };
}

/* ------------------------------------------------------------------ */
/* Pure signal detection and grading math.                             */
/* ------------------------------------------------------------------ */

/** New directional entries since the checkpoint: BUY side only (a sell is
 * exit/inventory noise), at meaningful size, deduped per market+outcome to
 * the earliest trade so one conviction entry does not become five signals. */
export function selectNewSignalTrades(trades: DataApiTrade[], checkpointTs: number): DataApiTrade[] {
  const fresh = trades
    .filter((trade) => trade.side === "BUY" && trade.timestamp > checkpointTs && trade.size * trade.price >= WALLET_SIGNAL_MIN_USD)
    .sort((a, b) => a.timestamp - b.timestamp);
  const seen = new Set<string>();
  const out: DataApiTrade[] = [];
  for (const trade of fresh) {
    const key = `${trade.conditionId}|${trade.asset}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trade);
  }
  return out;
}

/** A win pays (1 − price)/price per dollar staked; a loss loses the dollar.
 * Graded twice: at OUR detectable ask (the only honest copy price) and at
 * their fill (to measure what copy lag costs). */
export function gradeSignalPnl(entryPrice: number | null, won: boolean): number | null {
  if (entryPrice === null || entryPrice <= 0 || entryPrice >= 1) return null;
  return won ? round4((1 - entryPrice) / entryPrice) : -1;
}

export function computeWalletExpectancy(rows: WalletSignalRow[]): WalletExpectancy {
  const resolved = rows.filter((row) => row.status === "resolved" && row.won !== null);
  const ours = resolved.filter((row) => row.pnl_our_per_dollar !== null);
  const theirs = resolved.filter((row) => row.pnl_their_per_dollar !== null);
  const lags = rows.filter((row) => Number.isFinite(row.lag_seconds));
  return {
    resolved_n: resolved.length,
    wins: resolved.filter((row) => row.won === 1).length,
    avg_pnl_our_per_dollar: ours.length > 0 ? round4(ours.reduce((sum, row) => sum + (row.pnl_our_per_dollar ?? 0), 0) / ours.length) : null,
    avg_pnl_their_per_dollar: theirs.length > 0 ? round4(theirs.reduce((sum, row) => sum + (row.pnl_their_per_dollar ?? 0), 0) / theirs.length) : null,
    avg_lag_seconds: lags.length > 0 ? Math.round(lags.reduce((sum, row) => sum + row.lag_seconds, 0) / lags.length) : null,
  };
}

/** Evidence line for the analyst prompt. Aggregated, attributed to the
 * selection method rather than addresses, and phrased as evidence — the
 * analyst's system prompt governs how much weight it gets. */
export function formatSmartMoneyContext(signals: WalletSignalRow[]): string | undefined {
  const active = signals.filter((signal) => signal.status === "pending");
  if (active.length === 0) return undefined;
  const byOutcome = new Map<string, { outcome: string; wallets: Set<string>; usd: number; prices: number[] }>();
  for (const signal of active) {
    const cell = byOutcome.get(signal.outcome) ?? { outcome: signal.outcome, wallets: new Set<string>(), usd: 0, prices: [] };
    cell.wallets.add(signal.wallet);
    cell.usd += signal.their_usd;
    cell.prices.push(signal.their_price);
    byOutcome.set(signal.outcome, cell);
  }
  const parts = [...byOutcome.values()]
    .sort((a, b) => b.usd - a.usd)
    .map((cell) => {
      const avg = cell.prices.reduce((sum, price) => sum + price, 0) / cell.prices.length;
      return `${cell.wallets.size} wallet${cell.wallets.size === 1 ? "" : "s"} bought ${cell.outcome} (~$${Math.round(cell.usd)} total, avg ${(avg * 100).toFixed(0)}¢)`;
    });
  return `Recent positioning by wallets with a persistent settled profit record: ${parts.join("; ")}.`;
}

/* ------------------------------------------------------------------ */
/* Data-api fetchers.                                                  */
/* ------------------------------------------------------------------ */

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Polymarket data-api ${response.status} for ${new URL(url).pathname}`);
  return await response.json() as T;
}

export async function fetchRecentTakerTrades(limit = DISCOVERY_TRADE_PAGE): Promise<DataApiTrade[]> {
  const body = await fetchJson<unknown>(`${DATA_API}/trades?limit=${limit}`);
  return Array.isArray(body) ? body.filter(isTradeShape) : [];
}

export async function fetchWalletTrades(address: string, limit = SIGNAL_TRADES_PER_WALLET): Promise<DataApiTrade[]> {
  const body = await fetchJson<unknown>(`${DATA_API}/trades?user=${address}&limit=${limit}`);
  return Array.isArray(body) ? body.filter(isTradeShape) : [];
}

/** Most-recent-first settled history, paginated. The 300-row cap keeps the
 * sample to a wallet's recent record — the period a follow decision should
 * rest on — while staying inside polite call volume. */
export async function fetchWalletClosedPositions(address: string, maxRows = 300): Promise<DataApiClosedPosition[]> {
  const out: DataApiClosedPosition[] = [];
  const pageSize = 50;
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const body = await fetchJson<unknown>(
      `${DATA_API}/closed-positions?user=${address}&limit=${pageSize}&offset=${offset}&sortBy=TIMESTAMP`,
    );
    if (!Array.isArray(body)) break;
    const rows = body.filter((row): row is DataApiClosedPosition =>
      !!row && typeof row === "object"
      && typeof (row as DataApiClosedPosition).conditionId === "string"
      && typeof (row as DataApiClosedPosition).realizedPnl === "number"
      && typeof (row as DataApiClosedPosition).timestamp === "number");
    out.push(...rows);
    if (body.length < pageSize) break;
  }
  return out;
}

function isTradeShape(row: unknown): row is DataApiTrade {
  if (!row || typeof row !== "object") return false;
  const trade = row as DataApiTrade;
  return typeof trade.proxyWallet === "string" && typeof trade.conditionId === "string"
    && typeof trade.price === "number" && typeof trade.size === "number" && typeof trade.timestamp === "number";
}

type GammaMarketLite = {
  id: string;
  question: string;
  slug: string;
  end_date: string | null;
  closed: boolean;
  outcomes: string[];
  token_ids: string[];
};

/** Signals arrive keyed by conditionId; grading and fusion need the Gamma
 * market id and token index, resolved in one batch read per cycle. */
async function fetchGammaByConditionIds(conditionIds: string[]): Promise<Map<string, GammaMarketLite>> {
  const out = new Map<string, GammaMarketLite>();
  const ids = [...new Set(conditionIds)].slice(0, 20);
  if (ids.length === 0) return out;
  const url = new URL("https://gamma-api.polymarket.com/markets");
  url.searchParams.set("limit", String(ids.length));
  for (const id of ids) url.searchParams.append("condition_ids", id);
  const body = await fetchJson<unknown>(url.toString());
  if (!Array.isArray(body)) return out;
  for (const item of body) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const conditionId = typeof raw.conditionId === "string" ? raw.conditionId : "";
    if (!conditionId) continue;
    out.set(conditionId, {
      id: typeof raw.id === "string" ? raw.id : String(raw.id ?? ""),
      question: typeof raw.question === "string" ? raw.question : "",
      slug: typeof raw.slug === "string" ? raw.slug : "",
      end_date: typeof raw.endDate === "string" ? raw.endDate : null,
      closed: raw.closed === true,
      outcomes: parseJsonStringArray(raw.outcomes),
      token_ids: parseJsonStringArray(raw.clobTokenIds),
    });
  }
  return out;
}

function parseJsonStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Store.                                                              */
/* ------------------------------------------------------------------ */

class PolymarketWalletStore {
  private readonly db: SqliteDatabase;

  constructor(path: string) {
    this.db = openPolymarketSqlite(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS polymarket_wallets (
        address TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        first_seen TEXT NOT NULL,
        last_scored_at TEXT NOT NULL,
        settled_n INTEGER NOT NULL,
        volume_usd REAL NOT NULL,
        pnl_usd REAL NOT NULL,
        return_per_dollar REAL NOT NULL,
        early_return REAL,
        late_return REAL,
        median_stake_usd REAL NOT NULL,
        news_share REAL NOT NULL,
        last_signal_checkpoint INTEGER NOT NULL DEFAULT 0,
        drop_reason TEXT
      );
      CREATE TABLE IF NOT EXISTS polymarket_wallet_signals (
        id TEXT PRIMARY KEY,
        detected_at TEXT NOT NULL,
        trade_ts INTEGER NOT NULL,
        wallet TEXT NOT NULL,
        market_id TEXT NOT NULL,
        condition_id TEXT NOT NULL,
        question TEXT NOT NULL,
        slug TEXT NOT NULL,
        category TEXT NOT NULL,
        outcome_index INTEGER NOT NULL,
        outcome TEXT NOT NULL,
        their_price REAL NOT NULL,
        their_usd REAL NOT NULL,
        our_ask REAL,
        lag_seconds INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        winning_outcome_index INTEGER,
        resolved_at TEXT,
        won INTEGER,
        pnl_our_per_dollar REAL,
        pnl_their_per_dollar REAL
      );
      CREATE INDEX IF NOT EXISTS idx_polymarket_wallet_signals_status
        ON polymarket_wallet_signals(status, detected_at DESC);
      CREATE INDEX IF NOT EXISTS idx_polymarket_wallet_signals_market
        ON polymarket_wallet_signals(market_id, detected_at DESC);
      CREATE TABLE IF NOT EXISTS polymarket_wallets_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  meta(key: string): string | null {
    const row = this.db.prepare("SELECT value FROM polymarket_wallets_meta WHERE key = ?").get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  setMeta(key: string, value: string) {
    this.db.prepare(
      "INSERT INTO polymarket_wallets_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run(key, value);
  }

  wallet(address: string): WalletRow | undefined {
    return this.db.prepare("SELECT * FROM polymarket_wallets WHERE address = ?").get(address) as WalletRow | undefined;
  }

  wallets(status?: WalletStatus): WalletRow[] {
    if (status) {
      return this.db.prepare("SELECT * FROM polymarket_wallets WHERE status = ? ORDER BY return_per_dollar DESC").all(status) as WalletRow[];
    }
    return this.db.prepare("SELECT * FROM polymarket_wallets ORDER BY return_per_dollar DESC").all() as WalletRow[];
  }

  upsertWallet(row: WalletRow) {
    this.db.prepare(`
      INSERT INTO polymarket_wallets (
        address, status, first_seen, last_scored_at, settled_n, volume_usd, pnl_usd,
        return_per_dollar, early_return, late_return, median_stake_usd, news_share,
        last_signal_checkpoint, drop_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(address) DO UPDATE SET
        status = excluded.status, last_scored_at = excluded.last_scored_at,
        settled_n = excluded.settled_n, volume_usd = excluded.volume_usd,
        pnl_usd = excluded.pnl_usd, return_per_dollar = excluded.return_per_dollar,
        early_return = excluded.early_return, late_return = excluded.late_return,
        median_stake_usd = excluded.median_stake_usd, news_share = excluded.news_share,
        last_signal_checkpoint = excluded.last_signal_checkpoint, drop_reason = excluded.drop_reason
    `).run(
      row.address, row.status, row.first_seen, row.last_scored_at, row.settled_n, row.volume_usd,
      row.pnl_usd, row.return_per_dollar, row.early_return, row.late_return, row.median_stake_usd,
      row.news_share, row.last_signal_checkpoint, row.drop_reason,
    );
  }

  setCheckpoint(address: string, checkpoint: number) {
    this.db.prepare("UPDATE polymarket_wallets SET last_signal_checkpoint = ? WHERE address = ?").run(checkpoint, address);
  }

  insertSignal(row: WalletSignalRow) {
    this.db.prepare(`
      INSERT INTO polymarket_wallet_signals (
        id, detected_at, trade_ts, wallet, market_id, condition_id, question, slug, category,
        outcome_index, outcome, their_price, their_usd, our_ask, lag_seconds, status,
        winning_outcome_index, resolved_at, won, pnl_our_per_dollar, pnl_their_per_dollar
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      row.id, row.detected_at, row.trade_ts, row.wallet, row.market_id, row.condition_id, row.question,
      row.slug, row.category, row.outcome_index, row.outcome, row.their_price, row.their_usd, row.our_ask,
      row.lag_seconds, row.status, row.winning_outcome_index, row.resolved_at, row.won,
      row.pnl_our_per_dollar, row.pnl_their_per_dollar,
    );
  }

  pendingSignalMarketIds(limit = 50): string[] {
    const rows = this.db.prepare(
      "SELECT DISTINCT market_id FROM polymarket_wallet_signals WHERE status = 'pending' AND market_id != '' ORDER BY detected_at ASC LIMIT ?",
    ).all(limit) as Array<{ market_id: string }>;
    return rows.map((row) => row.market_id);
  }

  gradeResolution(marketId: string, winningOutcomeIndex: number | null, status: "resolved" | "invalid", resolvedAt: string): number {
    const rows = this.db.prepare(
      "SELECT id, outcome_index, their_price, our_ask FROM polymarket_wallet_signals WHERE market_id = ? AND status = 'pending'",
    ).all(marketId) as Array<{ id: string; outcome_index: number; their_price: number; our_ask: number | null }>;
    for (const row of rows) {
      if (status === "resolved" && winningOutcomeIndex !== null) {
        const won = row.outcome_index === winningOutcomeIndex;
        this.db.prepare(
          "UPDATE polymarket_wallet_signals SET status = 'resolved', winning_outcome_index = ?, resolved_at = ?, won = ?, pnl_our_per_dollar = ?, pnl_their_per_dollar = ? WHERE id = ?",
        ).run(winningOutcomeIndex, resolvedAt, won ? 1 : 0, gradeSignalPnl(row.our_ask, won), gradeSignalPnl(row.their_price, won), row.id);
      } else {
        this.db.prepare(
          "UPDATE polymarket_wallet_signals SET status = 'invalid', resolved_at = ? WHERE id = ?",
        ).run(resolvedAt, row.id);
      }
    }
    return rows.length;
  }

  signals(limit = 200): WalletSignalRow[] {
    return this.db.prepare("SELECT * FROM polymarket_wallet_signals ORDER BY detected_at DESC LIMIT ?").all(limit) as WalletSignalRow[];
  }

  signalsForMarket(marketId: string, sinceIso: string): WalletSignalRow[] {
    return this.db.prepare(
      "SELECT * FROM polymarket_wallet_signals WHERE market_id = ? AND detected_at >= ? ORDER BY detected_at DESC",
    ).all(marketId, sinceIso) as WalletSignalRow[];
  }

  signalCounts(): { total: number; pending: number } {
    const row = this.db.prepare(
      "SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending FROM polymarket_wallet_signals",
    ).get() as { total: number; pending: number | null };
    return { total: row.total, pending: row.pending ?? 0 };
  }
}

let singleton: PolymarketWalletStore | null = null;
let singletonPath = "";
const TEST_DB_PATH = join(tmpdir(), `mastermold-polymarket-wallets-${process.pid}-${randomUUID()}.db`);

export function polymarketWalletStore(): PolymarketWalletStore {
  const path = process.env.POLYMARKET_BRAIN_DB ?? (process.env.NODE_ENV === "test"
    ? TEST_DB_PATH
    : join(/* turbopackIgnore: true */ process.cwd(), ".data", "polymarket-brain.db"));
  if (!singleton || singletonPath !== path) {
    singleton = new PolymarketWalletStore(path);
    singletonPath = path;
  }
  return singleton;
}

/* ------------------------------------------------------------------ */
/* Fusion entry point for the analyst.                                 */
/* ------------------------------------------------------------------ */

/** Smart-money context per Gamma market id, for the analyst's prompts. Reads
 * only the local signal table — zero network — and fails to "no context". */
export function smartMoneyContextForMarkets(marketIds: string[]): Map<string, string> {
  const out = new Map<string, string>();
  if (!polymarketWalletsEnabled()) return out;
  try {
    const store = polymarketWalletStore();
    const sinceIso = new Date(Date.now() - SMART_MONEY_WINDOW_MS).toISOString();
    for (const marketId of marketIds) {
      const context = formatSmartMoneyContext(store.signalsForMarket(marketId, sinceIso));
      if (context) out.set(marketId, context);
    }
  } catch {
    // Fusion is optional evidence; the analyst forecasts without it.
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* The cycle.                                                          */
/* ------------------------------------------------------------------ */

let cycleInFlight = false;

export async function runPolymarketWalletCycle(
  trigger: "scheduled" | "manual" = "scheduled",
): Promise<{ action: "idle" | "refreshed" | "error"; detail: string }> {
  if (!polymarketWalletsEnabled()) return { action: "idle", detail: "Wallet lane is not enabled (POLYMARKET_WALLETS=1)." };
  if (cycleInFlight) return { action: "idle", detail: "A wallet cycle is already running." };
  cycleInFlight = true;
  try {
    return await runWalletCycleLocked(trigger);
  } catch (error) {
    return { action: "error", detail: error instanceof Error ? error.message : "Wallet cycle failed." };
  } finally {
    cycleInFlight = false;
  }
}

async function runWalletCycleLocked(trigger: "scheduled" | "manual"): Promise<{ action: "idle" | "refreshed" | "error"; detail: string }> {
  const store = polymarketWalletStore();
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const cycleMinutes = Number(process.env.POLYMARKET_WALLETS_CYCLE_MINUTES) || DEFAULT_CYCLE_MINUTES;
  const lastCycleAt = store.meta("last_cycle_at");
  if (trigger !== "manual" && lastCycleAt && nowMs - Date.parse(lastCycleAt) < cycleMinutes * 60_000) {
    return { action: "idle", detail: "Wallet cycle is not due yet." };
  }

  // 1) Grade pending shadow signals against resolutions — the out-of-sample
  // verdict data this lane exists to produce.
  let graded = 0;
  const pendingIds = store.pendingSignalMarketIds();
  if (pendingIds.length > 0) {
    try {
      for (const resolution of await fetchPolymarketResolutions(pendingIds)) {
        graded += store.gradeResolution(resolution.market_id, resolution.winning_outcome_index, resolution.status, resolution.closed_at ?? nowIso);
      }
    } catch {
      // Grading retries next cycle.
    }
  }

  // 2) Refresh followed wallets' recent trades into new shadow signals.
  let newSignals = 0;
  const followed = store.wallets("followed");
  for (const wallet of followed) {
    try {
      newSignals += await captureWalletSignals(store, wallet, nowMs);
    } catch {
      // One wallet's fetch failure must not stall the rest.
    }
  }

  // 3) Discovery + rescoring on a slower clock: sample live taker flow for
  // new candidates, and re-verify stale followed wallets (drop on decay).
  // Manual triggers always run discovery: the operator's lever for seeding
  // the followed pool faster than the autonomous 6-hour clock.
  let discovered = 0;
  let dropped = 0;
  const lastDiscoveryAt = store.meta("last_discovery_at");
  if (trigger === "manual" || !lastDiscoveryAt || nowMs - Date.parse(lastDiscoveryAt) >= DISCOVERY_EVERY_MS) {
    const budget = { remaining: SCORES_PER_CYCLE_MAX };
    try {
      discovered = await discoverWallets(store, nowIso, budget);
    } catch {
      // Discovery retries on the next slow tick.
    }
    dropped = await rescoreStaleFollowed(store, nowMs, nowIso, budget);
    store.setMeta("last_discovery_at", nowIso);
  }

  store.setMeta("last_cycle_at", nowIso);
  return {
    action: "refreshed",
    detail: `Graded ${graded} signal resolution${graded === 1 ? "" : "s"}, captured ${newSignals} new signal${newSignals === 1 ? "" : "s"}, followed ${discovered} new wallet${discovered === 1 ? "" : "s"}, dropped ${dropped}.`,
  };
}

async function captureWalletSignals(store: ReturnType<typeof polymarketWalletStore>, wallet: WalletRow, nowMs: number): Promise<number> {
  const trades = await fetchWalletTrades(wallet.address);
  const fresh = selectNewSignalTrades(trades, wallet.last_signal_checkpoint);
  const maxTs = trades.reduce((max, trade) => Math.max(max, trade.timestamp), wallet.last_signal_checkpoint);
  if (fresh.length === 0) {
    if (maxTs > wallet.last_signal_checkpoint) store.setCheckpoint(wallet.address, maxTs);
    return 0;
  }

  const gamma = await fetchGammaByConditionIds(fresh.map((trade) => trade.conditionId));
  let inserted = 0;
  for (const trade of fresh) {
    const market = gamma.get(trade.conditionId);
    // Only binary, still-open markets become signals — resolved or exotic
    // structures cannot be graded (or fused) coherently.
    if (!market || market.closed || market.outcomes.length !== 2 || market.token_ids.length !== 2) continue;
    const outcomeIndex = market.token_ids.indexOf(trade.asset);
    if (outcomeIndex !== 0 && outcomeIndex !== 1) continue;

    let ourAsk: number | null = null;
    try {
      const books = await fetchPolymarketOrderBooks([trade.asset], false);
      const book = books.get(trade.asset);
      ourAsk = book ? summarizePolymarketBook(book).best_ask : null;
    } catch {
      // The signal still grades win/loss and their-price expectancy.
    }

    const category = classifyAnalystMarket(market.question || trade.title, market.slug || trade.slug);
    const usd = round2(trade.size * trade.price);
    store.insertSignal({
      id: randomUUID(),
      detected_at: new Date(nowMs).toISOString(),
      trade_ts: trade.timestamp,
      wallet: wallet.address,
      market_id: market.id,
      condition_id: trade.conditionId,
      question: market.question || trade.title,
      slug: market.slug || trade.slug,
      category,
      outcome_index: outcomeIndex,
      outcome: market.outcomes[outcomeIndex] ?? trade.outcome,
      their_price: trade.price,
      their_usd: usd,
      our_ask: ourAsk,
      lag_seconds: Math.max(0, Math.round(nowMs / 1_000 - trade.timestamp)),
      status: "pending",
      winning_outcome_index: null,
      resolved_at: null,
      won: null,
      pnl_our_per_dollar: null,
      pnl_their_per_dollar: null,
    });
    inserted += 1;
    if (category === "news" && usd >= 100) {
      notifyOperator(
        "analyst",
        `Smart-money signal: ${shortAddress(wallet.address)} bought ${market.outcomes[outcomeIndex]} $${usd.toFixed(0)} at ${(trade.price * 100).toFixed(0)}¢ · ${truncate(market.question, 80)}`,
      );
    }
  }
  store.setCheckpoint(wallet.address, maxTs);
  return inserted;
}

async function discoverWallets(store: ReturnType<typeof polymarketWalletStore>, nowIso: string, budget: { remaining: number }): Promise<number> {
  const followedCount = store.wallets("followed").length;
  if (followedCount >= POLYMARKET_WALLETS_MAX_FOLLOWED || budget.remaining <= 0) return 0;

  const trades = await fetchRecentTakerTrades();
  // Candidate flow: meaningful-size buys in news-classified markets — the
  // segment where informed positioning is even possible.
  const candidates: string[] = [];
  const seen = new Set<string>();
  for (const trade of trades) {
    if (trade.side !== "BUY") continue;
    const usd = trade.size * trade.price;
    if (usd < WALLET_SIGNAL_MIN_USD || usd > WALLET_STAKE_BAND_USD[1]) continue;
    if (classifyAnalystMarket(trade.title, trade.slug) !== "news") continue;
    if (seen.has(trade.proxyWallet) || store.wallet(trade.proxyWallet)) continue;
    seen.add(trade.proxyWallet);
    candidates.push(trade.proxyWallet);
  }

  let followedNew = 0;
  for (const address of candidates) {
    if (budget.remaining <= 0) break;
    if (store.wallets("followed").length >= POLYMARKET_WALLETS_MAX_FOLLOWED) break;
    budget.remaining -= 1;
    let score: WalletScore;
    try {
      score = scoreWalletPositions(await fetchWalletClosedPositions(address));
    } catch {
      continue;
    }
    const row: WalletRow = {
      address,
      status: score.follow ? "followed" : "candidate",
      first_seen: nowIso,
      last_scored_at: nowIso,
      settled_n: score.settled_n,
      volume_usd: score.volume_usd,
      pnl_usd: score.pnl_usd,
      return_per_dollar: score.return_per_dollar,
      early_return: score.early_return,
      late_return: score.late_return,
      median_stake_usd: score.median_stake_usd,
      news_share: score.news_share,
      // Signals start at follow time — history before selection is the data
      // the wallet was selected ON, and must not leak into its verdict.
      last_signal_checkpoint: Math.floor(Date.parse(nowIso) / 1_000),
      drop_reason: score.follow ? null : score.reason,
    };
    store.upsertWallet(row);
    if (score.follow) {
      followedNew += 1;
      notifyOperator("analyst", `Wallet lane follows ${shortAddress(address)}: ${score.reason}`);
    }
  }
  return followedNew;
}

async function rescoreStaleFollowed(store: ReturnType<typeof polymarketWalletStore>, nowMs: number, nowIso: string, budget: { remaining: number }): Promise<number> {
  let dropped = 0;
  for (const wallet of store.wallets("followed")) {
    if (budget.remaining <= 0) break;
    if (nowMs - Date.parse(wallet.last_scored_at) < RESCORE_EVERY_MS) continue;
    budget.remaining -= 1;
    let score: WalletScore;
    try {
      score = scoreWalletPositions(await fetchWalletClosedPositions(wallet.address));
    } catch {
      continue;
    }
    const keep = score.follow;
    store.upsertWallet({
      ...wallet,
      status: keep ? "followed" : "dropped",
      last_scored_at: nowIso,
      settled_n: score.settled_n,
      volume_usd: score.volume_usd,
      pnl_usd: score.pnl_usd,
      return_per_dollar: score.return_per_dollar,
      early_return: score.early_return,
      late_return: score.late_return,
      median_stake_usd: score.median_stake_usd,
      news_share: score.news_share,
      drop_reason: keep ? null : `rescore: ${score.reason}`,
    });
    if (!keep) {
      dropped += 1;
      notifyOperator("analyst", `Wallet lane dropped ${shortAddress(wallet.address)}: ${score.reason}`);
    }
  }
  return dropped;
}

/* ------------------------------------------------------------------ */
/* Report.                                                             */
/* ------------------------------------------------------------------ */

export function safePolymarketWalletReport(): WalletIntelligenceReport {
  const empty: WalletIntelligenceReport = {
    enabled: polymarketWalletsEnabled(),
    followed_count: 0,
    candidate_count: 0,
    dropped_count: 0,
    signal_count: 0,
    pending_signal_count: 0,
    expectancy: { resolved_n: 0, wins: 0, avg_pnl_our_per_dollar: null, avg_pnl_their_per_dollar: null, avg_lag_seconds: null },
    news_expectancy: { resolved_n: 0, wins: 0, avg_pnl_our_per_dollar: null, avg_pnl_their_per_dollar: null, avg_lag_seconds: null },
    followed: [],
    recent_signals: [],
    last_cycle_at: null,
    last_discovery_at: null,
    verdict_gate: "Followed wallets must show positive lag-adjusted expectancy (our ask, not their fill) on signals recorded after selection before wallet evidence earns any capital weight.",
  };
  if (!empty.enabled) return empty;
  try {
    const store = polymarketWalletStore();
    const wallets = store.wallets();
    const signals = store.signals(500);
    const counts = store.signalCounts();
    return {
      ...empty,
      followed_count: wallets.filter((wallet) => wallet.status === "followed").length,
      candidate_count: wallets.filter((wallet) => wallet.status === "candidate").length,
      dropped_count: wallets.filter((wallet) => wallet.status === "dropped").length,
      signal_count: counts.total,
      pending_signal_count: counts.pending,
      expectancy: computeWalletExpectancy(signals),
      news_expectancy: computeWalletExpectancy(signals.filter((signal) => signal.category === "news")),
      followed: wallets
        .filter((wallet) => wallet.status === "followed")
        .map((wallet) => ({
          address: wallet.address,
          settled_n: wallet.settled_n,
          volume_usd: wallet.volume_usd,
          pnl_usd: wallet.pnl_usd,
          return_per_dollar: wallet.return_per_dollar,
          early_return: wallet.early_return,
          late_return: wallet.late_return,
          median_stake_usd: wallet.median_stake_usd,
          news_share: wallet.news_share,
          last_scored_at: wallet.last_scored_at,
        })),
      recent_signals: signals.slice(0, 15),
      last_cycle_at: store.meta("last_cycle_at"),
      last_discovery_at: store.meta("last_discovery_at"),
    };
  } catch {
    return empty;
  }
}

/* ------------------------------------------------------------------ */
/* Utilities.                                                          */
/* ------------------------------------------------------------------ */

export function shortAddress(address: string): string {
  return address.length > 10 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

function truncate(value: string, max: number) {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number | null): number | null {
  return value === null || !Number.isFinite(value) ? null : Math.round(value * 10_000) / 10_000;
}

export function __resetPolymarketWalletStoreForTests() {
  singleton = null;
  singletonPath = "";
}
