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

import { feeRateBps, parseFeeSchedule } from "./fees";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { notifyOperator } from "../autopilot/notify";
import type { SqliteDatabase } from "../autopilot/sqlite";
import { ANALYST_CLASSIFIER_VERSION, classifyAnalystMarket, type AnalystCategory } from "./analyst";
import { fetchPolymarketFastResolvers, fetchPolymarketResolutions, type PolymarketMarket } from "./markets";
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

/* Paper follow-arm policy (POLYMARKET_WALLET_FOLLOW=1). Derived from the
 * 2026-08-10 resolved-signal audit: the only robustly positive cell was
 * match-winner markets entered between 35¢ and 75¢ (+$1.10/$ at 35-55¢,
 * +$0.30/$ at 55-75¢ over 35 distinct markets); longshots (<35¢) and heavy
 * favorites (>=75¢) were both negative. That derivation is IN-SAMPLE — this
 * arm exists to test it forward on money-shaped paper P&L, fees modeled. */
export const WALLET_FOLLOW_STAKE_USD = 5;
export const WALLET_FOLLOW_MAX_OPEN = 10;
export const WALLET_FOLLOW_BAND: readonly [number, number] = [0.35, 0.75];
export const WALLET_FOLLOW_KINDS: readonly WalletSignalKind[] = ["match_winner"];

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

export function polymarketWalletFollowEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.POLYMARKET_WALLET_FOLLOW === "1";
}

/* ------------------------------------------------------------------ */
/* Signal kinds and price bands — the evidence taxonomy.               */
/* ------------------------------------------------------------------ */

/** Finer-grained than AnalystCategory because the 2026-08-10 audit showed the
 * followed wallets' edge concentrated in exactly one segment (soccer/team
 * match-winner markets) that the binary news/heartbeat split had been hiding
 * inside "news". Derived from the question text, so it is stable across
 * classifier versions and needs no schema change. */
export type WalletSignalKind = "match_winner" | "spread" | "esports_crypto" | "news";

const MATCH_WINNER_QUESTION = /^will .{1,60} (win|draw|advance) on \d{4}-\d{2}-\d{2}\?/i;

export function walletSignalKind(question: string, category: AnalystCategory): WalletSignalKind {
  if (MATCH_WINNER_QUESTION.test(question)) return "match_winner";
  if (/^spread: /i.test(question)) return "spread";
  return category === "heartbeat" ? "esports_crypto" : "news";
}

export type WalletPriceBand = "<35c" | "35-55c" | "55-75c" | ">=75c";

export function walletPriceBand(price: number): WalletPriceBand {
  if (price < 0.35) return "<35c";
  if (price < 0.55) return "35-55c";
  if (price < 0.75) return "55-75c";
  return ">=75c";
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

/** Signal-level averages overstate independence: one wallet-bot accumulating
 * a soccer position in $45 clips for 14 hours produced 20 "signals" that were
 * a single decision (observed live: CF América, 2026-08-09). The market-level
 * view collapses each market to one observation first; treat it as the honest
 * headline and the signal-level number as execution detail. */
export type WalletEvidenceCell = {
  kind: WalletSignalKind;
  band: WalletPriceBand | "all";
  signals: number;
  markets: number;
  wins: number;
  signal_ev_our: number | null;
  market_ev_our: number | null;
};

export type WalletFollowRow = {
  id: string;
  opened_at: string;
  signal_id: string;
  wallet: string;
  market_id: string;
  condition_id: string;
  question: string;
  slug: string;
  kind: WalletSignalKind;
  outcome_index: number;
  outcome: string;
  entry_ask: number;
  stake_usd: number;
  taker_fee_bps: number;
  status: "pending" | "resolved" | "invalid";
  winning_outcome_index: number | null;
  resolved_at: string | null;
  won: 0 | 1 | null;
  fee_usd: number;
  pnl_usd: number | null;
  /** "follow" copies a wallet; "control" buys a comparable market no followed wallet touched. */
  arm?: "follow" | "control";
};

export type WalletFollowSummary = {
  enabled: boolean;
  open_n: number;
  resolved_n: number;
  wins: number;
  staked_usd: number;
  realized_pnl_usd: number;
  fee_usd: number;
  policy: string;
  verdict: WalletFollowVerdict;
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
  evidence: WalletEvidenceCell[];
  follow: WalletFollowSummary;
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

/** Kind × band evidence matrix over resolved signals, with per-kind "all"
 * rollups. market_ev_our weights each distinct market once (see
 * WalletEvidenceCell on why signal-level averages lie). */
export function computeWalletEvidence(rows: WalletSignalRow[]): WalletEvidenceCell[] {
  const resolved = rows.filter((row) => row.status === "resolved" && row.won !== null);
  type Acc = { signals: number; wins: number; evSum: number; evN: number; markets: Map<string, { sum: number; n: number }> };
  const cells = new Map<string, Acc>();
  const add = (key: string, row: WalletSignalRow) => {
    const cell = cells.get(key) ?? { signals: 0, wins: 0, evSum: 0, evN: 0, markets: new Map() };
    cell.signals += 1;
    if (row.won === 1) cell.wins += 1;
    if (row.pnl_our_per_dollar !== null) {
      cell.evSum += row.pnl_our_per_dollar;
      cell.evN += 1;
      const market = cell.markets.get(row.market_id) ?? { sum: 0, n: 0 };
      market.sum += row.pnl_our_per_dollar;
      market.n += 1;
      cell.markets.set(row.market_id, market);
    }
    cells.set(key, cell);
  };
  for (const row of resolved) {
    const kind = walletSignalKind(row.question, row.category);
    const price = row.our_ask ?? row.their_price;
    add(`${kind}|all`, row);
    add(`${kind}|${walletPriceBand(price)}`, row);
  }
  const out: WalletEvidenceCell[] = [];
  for (const [key, cell] of cells) {
    const [kind, band] = key.split("|") as [WalletSignalKind, WalletPriceBand | "all"];
    const marketMeans = [...cell.markets.values()].map((market) => market.sum / market.n);
    out.push({
      kind,
      band,
      signals: cell.signals,
      markets: cell.markets.size,
      wins: cell.wins,
      signal_ev_our: cell.evN > 0 ? round4(cell.evSum / cell.evN) : null,
      market_ev_our: marketMeans.length > 0 ? round4(marketMeans.reduce((sum, value) => sum + value, 0) / marketMeans.length) : null,
    });
  }
  const kindOrder: WalletSignalKind[] = ["match_winner", "news", "esports_crypto", "spread"];
  const bandOrder = ["all", "<35c", "35-55c", "55-75c", ">=75c"];
  return out.sort((a, b) => kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind) || bandOrder.indexOf(a.band) - bandOrder.indexOf(b.band));
}

/** Modeled taker fee for a paper follow, charged at entry win or lose —
 * Polymarket's documented CLOB formula: rate × min(p, 1−p) × shares. The bps
 * is stored on the row so P&L can be recomputed if the fee model is wrong. */
export function walletFollowFeeUsd(stakeUsd: number, ask: number, feeRateBps: number | null): number {
  // Documented Polymarket taker fee: shares × rate × p × (1 − p). The rate
  // comes from the market's feeSchedule (stored as bps of the rate: 0.05 →
  // 500). Unknown schedules (null or the stored -1) are charged at the highest
  // current category rate (crypto, 0.07) so paper P&L is never flattered.
  if (!(ask > 0) || !(ask < 1)) return 0;
  const shares = stakeUsd / ask;
  const rate = feeRateBps === null || feeRateBps < 0 ? 0.07 : feeRateBps / 10_000;
  return round2(shares * rate * ask * (1 - ask));
}

/** Net paper P&L for a resolved follow: win pays shares×(1−ask) − fee, a
 * loss costs the stake plus the fee already paid. */
export function walletFollowPnlUsd(row: Pick<WalletFollowRow, "stake_usd" | "entry_ask" | "fee_usd">, won: boolean): number {
  const gross = won ? (row.stake_usd / row.entry_ask) * (1 - row.entry_ask) : -row.stake_usd;
  return round2(gross - row.fee_usd);
}

export function walletFollowDecision(input: {
  kind: WalletSignalKind;
  ourAsk: number | null;
  openFollowMarketIds: Set<string>;
  marketId: string;
  openCount: number;
  enabled: boolean;
}): { follow: true } | { follow: false; reason: string } {
  if (!input.enabled) return { follow: false, reason: "disabled" };
  if (!WALLET_FOLLOW_KINDS.includes(input.kind)) return { follow: false, reason: `kind ${input.kind} outside policy` };
  if (input.ourAsk === null) return { follow: false, reason: "no executable ask at detection" };
  if (input.ourAsk < WALLET_FOLLOW_BAND[0] || input.ourAsk > WALLET_FOLLOW_BAND[1]) {
    return { follow: false, reason: `ask ${input.ourAsk} outside ${WALLET_FOLLOW_BAND[0]}-${WALLET_FOLLOW_BAND[1]} band` };
  }
  if (input.openFollowMarketIds.has(input.marketId)) return { follow: false, reason: "already following this market" };
  if (input.openCount >= WALLET_FOLLOW_MAX_OPEN) return { follow: false, reason: `open-follow cap ${WALLET_FOLLOW_MAX_OPEN} reached` };
  return { follow: true };
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
  /** Fee rate in bps of the rate (0.05 → 500); null = schedule unknown. */
  taker_fee_bps: number | null;
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
      taker_fee_bps: feeRateBps(parseFeeSchedule(raw)),
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
      CREATE TABLE IF NOT EXISTS polymarket_wallet_follows (
        id TEXT PRIMARY KEY,
        opened_at TEXT NOT NULL,
        signal_id TEXT NOT NULL,
        wallet TEXT NOT NULL,
        market_id TEXT NOT NULL,
        condition_id TEXT NOT NULL,
        question TEXT NOT NULL,
        slug TEXT NOT NULL,
        kind TEXT NOT NULL,
        outcome_index INTEGER NOT NULL,
        outcome TEXT NOT NULL,
        entry_ask REAL NOT NULL,
        stake_usd REAL NOT NULL,
        taker_fee_bps INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        winning_outcome_index INTEGER,
        resolved_at TEXT,
        won INTEGER,
        fee_usd REAL NOT NULL,
        pnl_usd REAL
      );
      CREATE INDEX IF NOT EXISTS idx_polymarket_wallet_follows_status
        ON polymarket_wallet_follows(status, opened_at DESC);
    `);
    // v2 (2026-09): follows and their no-signal controls share one table.
    try {
      this.db.exec("ALTER TABLE polymarket_wallet_follows ADD COLUMN arm TEXT NOT NULL DEFAULT 'follow'");
    } catch {
      // Column already exists.
    }
    // Reclassify stored signals whenever the shared classifier changes, so
    // category-scoped stats (news_expectancy, discovery, fusion) reflect one
    // taxonomy. kind/band evidence derives from question text at read time
    // and needs no migration.
    if (this.meta("classifier_version") !== ANALYST_CLASSIFIER_VERSION) {
      const rows = this.db.prepare("SELECT id, question, slug, category FROM polymarket_wallet_signals")
        .all() as Array<{ id: string; question: string; slug: string; category: string }>;
      for (const row of rows) {
        const category = classifyAnalystMarket(row.question, row.slug);
        if (category !== row.category) {
          this.db.prepare("UPDATE polymarket_wallet_signals SET category = ? WHERE id = ?").run(category, row.id);
        }
      }
      this.setMeta("classifier_version", ANALYST_CLASSIFIER_VERSION);
    }
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

  insertFollow(row: WalletFollowRow) {
    this.db.prepare(`
      INSERT INTO polymarket_wallet_follows (
        id, opened_at, signal_id, wallet, market_id, condition_id, question, slug, kind,
        outcome_index, outcome, entry_ask, stake_usd, taker_fee_bps, status,
        winning_outcome_index, resolved_at, won, fee_usd, pnl_usd, arm
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      row.id, row.opened_at, row.signal_id, row.wallet, row.market_id, row.condition_id, row.question,
      row.slug, row.kind, row.outcome_index, row.outcome, row.entry_ask, row.stake_usd, row.taker_fee_bps,
      row.status, row.winning_outcome_index, row.resolved_at, row.won, row.fee_usd, row.pnl_usd, row.arm ?? "follow",
    );
  }

  allFollows(): WalletFollowRow[] {
    return this.db.prepare("SELECT * FROM polymarket_wallet_follows ORDER BY opened_at ASC").all() as WalletFollowRow[];
  }

  signaledMarketIds(): Set<string> {
    const rows = this.db.prepare("SELECT DISTINCT market_id FROM polymarket_wallet_signals").all() as Array<{ market_id: string }>;
    return new Set(rows.map((row) => row.market_id));
  }

  openFollows(): WalletFollowRow[] {
    return this.db.prepare("SELECT * FROM polymarket_wallet_follows WHERE status = 'pending' ORDER BY opened_at ASC").all() as WalletFollowRow[];
  }

  gradeFollowResolution(marketId: string, winningOutcomeIndex: number | null, status: "resolved" | "invalid", resolvedAt: string): number {
    const rows = this.db.prepare(
      "SELECT * FROM polymarket_wallet_follows WHERE market_id = ? AND status = 'pending'",
    ).all(marketId) as WalletFollowRow[];
    for (const row of rows) {
      if (status === "resolved" && winningOutcomeIndex !== null) {
        const won = row.outcome_index === winningOutcomeIndex;
        this.db.prepare(
          "UPDATE polymarket_wallet_follows SET status = 'resolved', winning_outcome_index = ?, resolved_at = ?, won = ?, pnl_usd = ? WHERE id = ?",
        ).run(winningOutcomeIndex, resolvedAt, won ? 1 : 0, walletFollowPnlUsd(row, won), row.id);
      } else {
        // An invalid market returns the stake; only the modeled fee is lost.
        this.db.prepare(
          "UPDATE polymarket_wallet_follows SET status = 'invalid', resolved_at = ?, pnl_usd = ? WHERE id = ?",
        ).run(resolvedAt, -row.fee_usd, row.id);
      }
    }
    return rows.length;
  }

  followSummary(enabled: boolean): WalletFollowSummary {
    const row = this.db.prepare(`
      SELECT
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS open_n,
        SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved_n,
        SUM(CASE WHEN status = 'resolved' AND won = 1 THEN 1 ELSE 0 END) AS wins,
        COALESCE(SUM(stake_usd), 0) AS staked_usd,
        COALESCE(SUM(CASE WHEN status != 'pending' THEN pnl_usd END), 0) AS realized_pnl_usd,
        COALESCE(SUM(fee_usd), 0) AS fee_usd
      FROM polymarket_wallet_follows WHERE COALESCE(arm, 'follow') = 'follow'
    `).get() as { open_n: number | null; resolved_n: number | null; wins: number | null; staked_usd: number; realized_pnl_usd: number; fee_usd: number };
    return {
      enabled,
      open_n: row.open_n ?? 0,
      resolved_n: row.resolved_n ?? 0,
      wins: row.wins ?? 0,
      staked_usd: round2(row.staked_usd),
      realized_pnl_usd: round2(row.realized_pnl_usd),
      fee_usd: round2(row.fee_usd),
      policy: `Paper-follows ${WALLET_FOLLOW_KINDS.join("/")} signals at our detected ask within ${WALLET_FOLLOW_BAND[0]}-${WALLET_FOLLOW_BAND[1]}, $${WALLET_FOLLOW_STAKE_USD} stake, max ${WALLET_FOLLOW_MAX_OPEN} open, one per market, documented taker fees modeled at entry. Every follow records a no-signal control in the same kind and band, so the verdict compares follow minus control.`,
      verdict: walletFollowVerdict(this.allFollows()),
    };
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

  // 1) Grade pending shadow signals (and any paper follows riding them)
  // against resolutions — the out-of-sample verdict data this lane exists to
  // produce.
  let graded = 0;
  let followsSettled = 0;
  const pendingIds = [...new Set([...store.pendingSignalMarketIds(), ...store.openFollows().map((follow) => follow.market_id)])];
  if (pendingIds.length > 0) {
    try {
      for (const resolution of await fetchPolymarketResolutions(pendingIds)) {
        graded += store.gradeResolution(resolution.market_id, resolution.winning_outcome_index, resolution.status, resolution.closed_at ?? nowIso);
        followsSettled += store.gradeFollowResolution(resolution.market_id, resolution.winning_outcome_index, resolution.status, resolution.closed_at ?? nowIso);
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
    detail: `Graded ${graded} signal resolution${graded === 1 ? "" : "s"} (${followsSettled} paper follow${followsSettled === 1 ? "" : "s"} settled), captured ${newSignals} new signal${newSignals === 1 ? "" : "s"}, followed ${discovered} new wallet${discovered === 1 ? "" : "s"}, dropped ${dropped}.`,
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
    const signalId = randomUUID();
    store.insertSignal({
      id: signalId,
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

    // Paper follow-arm: stake $5 at OUR detected ask when the signal falls in
    // the audited positive cell. Fees are modeled at entry so the realized
    // P&L stream stays money-shaped.
    const kind = walletSignalKind(market.question || trade.title, category);
    const openFollows = store.openFollows();
    const decision = walletFollowDecision({
      kind,
      ourAsk,
      openFollowMarketIds: new Set(openFollows.map((follow) => follow.market_id)),
      marketId: market.id,
      openCount: openFollows.length,
      enabled: polymarketWalletFollowEnabled(),
    });
    if (decision.follow && ourAsk !== null) {
      const fee = walletFollowFeeUsd(WALLET_FOLLOW_STAKE_USD, ourAsk, market.taker_fee_bps);
      const followRow: WalletFollowRow = {
        id: randomUUID(),
        opened_at: new Date(nowMs).toISOString(),
        signal_id: signalId,
        wallet: wallet.address,
        market_id: market.id,
        condition_id: trade.conditionId,
        question: market.question || trade.title,
        slug: market.slug || trade.slug,
        kind,
        outcome_index: outcomeIndex,
        outcome: market.outcomes[outcomeIndex] ?? trade.outcome,
        entry_ask: ourAsk,
        stake_usd: WALLET_FOLLOW_STAKE_USD,
        // -1 records "schedule unknown" in the integer column.
        taker_fee_bps: market.taker_fee_bps ?? -1,
        status: "pending",
        winning_outcome_index: null,
        resolved_at: null,
        won: null,
        fee_usd: fee,
        pnl_usd: null,
        arm: "follow",
      };
      store.insertFollow(followRow);
      // The no-signal control is what lets the verdict separate wallet skill
      // from a price-band effect. Best-effort: a missing control just leaves
      // this follow unpaired.
      await recordWalletControl(store, followRow, nowMs).catch(() => undefined);
      notifyOperator(
        "entry",
        `Wallet follow (paper): ${market.outcomes[outcomeIndex]} $${WALLET_FOLLOW_STAKE_USD} at ${(ourAsk * 100).toFixed(0)}¢ behind ${shortAddress(wallet.address)} · ${truncate(market.question, 80)}`,
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
  // Candidate flow: meaningful-size buys in news or match-winner markets.
  // News is where informed positioning was assumed to live; match-winner is
  // where the 2026-08-10 audit actually FOUND it (+$0.24/$ market-level on 46
  // markets) — the v2 classifier moved those to heartbeat, so discovery
  // filters by kind, not category, to keep sampling that flow.
  const candidates: string[] = [];
  const seen = new Set<string>();
  for (const trade of trades) {
    if (trade.side !== "BUY") continue;
    const usd = trade.size * trade.price;
    if (usd < WALLET_SIGNAL_MIN_USD || usd > WALLET_STAKE_BAND_USD[1]) continue;
    const category = classifyAnalystMarket(trade.title, trade.slug);
    const kind = walletSignalKind(trade.title, category);
    if (kind !== "news" && kind !== "match_winner") continue;
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
    evidence: [],
    follow: { enabled: polymarketWalletFollowEnabled(), open_n: 0, resolved_n: 0, wins: 0, staked_usd: 0, realized_pnl_usd: 0, fee_usd: 0, policy: "", verdict: walletFollowVerdict([]) },
    followed: [],
    recent_signals: [],
    last_cycle_at: null,
    last_discovery_at: null,
    verdict_gate: "Pre-registered 2026-09-26: at least 300 resolved follow markets across 6 weekends; follow minus no-signal control must have a market-clustered 95% lower bound above zero and stay positive without the two most-followed wallets.",
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
      evidence: computeWalletEvidence(store.signals(2_000)),
      follow: store.followSummary(polymarketWalletFollowEnabled()),
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

/* ------------------------------------------------------------------ */
/* Follow-arm v2: no-signal control + pre-registered verdict gate.     */
/* ------------------------------------------------------------------ */

/** Pre-registered 2026-09-26 (docs/research-2026-09/STRATEGY-DECISION.md). */
export const WALLET_FOLLOW_GATE = { min_markets: 300, min_weekends: 6, bootstrap_draws: 1000 } as const;

export type WalletFollowVerdict = {
  status: "insufficient" | "pass" | "fail";
  follow_markets: number;
  paired: number;
  weekends: number;
  follow_ev_per_dollar: number | null;
  control_ev_per_dollar: number | null;
  diff_per_dollar: number | null;
  diff_lower_95: number | null;
  diff_without_top_wallets: number | null;
  detail: string;
};

/**
 * Follow minus control, per dollar, over pairs where both legs resolved.
 * The interval is a bootstrap clustered by the followed market (one match
 * counts once), and the edge must survive removing the two most-followed
 * wallets. A pass needs the pre-registered sample first.
 */
export function walletFollowVerdict(rows: WalletFollowRow[], draws: number = WALLET_FOLLOW_GATE.bootstrap_draws): WalletFollowVerdict {
  const settled = rows.filter((row) => row.status !== "pending" && row.pnl_usd !== null && row.stake_usd > 0);
  const follows = settled.filter((row) => (row.arm ?? "follow") === "follow");
  const controls = new Map(settled.filter((row) => row.arm === "control").map((row) => [row.signal_id, row]));
  const returnOf = (row: WalletFollowRow) => (row.pnl_usd as number) / row.stake_usd;
  const pairs = follows
    .map((follow) => ({ follow, control: controls.get(follow.signal_id) }))
    .filter((pair): pair is { follow: WalletFollowRow; control: WalletFollowRow } => Boolean(pair.control));
  const markets = new Set(follows.map((row) => row.market_id)).size;
  const weekends = new Set(follows.map((row) => isoWeek(row.resolved_at ?? row.opened_at))).size;
  const mean = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);

  // Collapse to one difference per followed market (clustering).
  const byMarket = new Map<string, { diffs: number[]; wallet: string }>();
  for (const pair of pairs) {
    const entry = byMarket.get(pair.follow.market_id) ?? { diffs: [], wallet: pair.follow.wallet };
    entry.diffs.push(returnOf(pair.follow) - returnOf(pair.control));
    byMarket.set(pair.follow.market_id, entry);
  }
  const clusters = [...byMarket.values()].map((entry) => ({ diff: mean(entry.diffs) as number, wallet: entry.wallet }));
  const diff = mean(clusters.map((cluster) => cluster.diff));

  let lower: number | null = null;
  if (clusters.length >= 2) {
    let seed = 1_234_567;
    const random = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed / 2_147_483_648;
    };
    const samples: number[] = [];
    for (let draw = 0; draw < draws; draw += 1) {
      let total = 0;
      for (let index = 0; index < clusters.length; index += 1) total += clusters[Math.floor(random() * clusters.length)].diff;
      samples.push(total / clusters.length);
    }
    samples.sort((a, b) => a - b);
    lower = samples[Math.floor(draws * 0.025)];
  }

  const walletCounts = new Map<string, number>();
  for (const cluster of clusters) walletCounts.set(cluster.wallet, (walletCounts.get(cluster.wallet) ?? 0) + 1);
  const topWallets = new Set([...walletCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([wallet]) => wallet));
  const robust = mean(clusters.filter((cluster) => !topWallets.has(cluster.wallet)).map((cluster) => cluster.diff));

  const enough = markets >= WALLET_FOLLOW_GATE.min_markets && weekends >= WALLET_FOLLOW_GATE.min_weekends;
  const status: WalletFollowVerdict["status"] = !enough
    ? "insufficient"
    : lower !== null && lower > 0 && robust !== null && robust > 0
      ? "pass"
      : "fail";
  const round = (value: number | null) => (value === null ? null : Math.round(value * 1000) / 1000);
  return {
    status,
    follow_markets: markets,
    paired: pairs.length,
    weekends,
    follow_ev_per_dollar: round(mean(follows.map(returnOf))),
    control_ev_per_dollar: round(mean([...controls.values()].map(returnOf))),
    diff_per_dollar: round(diff),
    diff_lower_95: round(lower),
    diff_without_top_wallets: round(robust),
    detail:
      status === "insufficient"
        ? `${markets}/${WALLET_FOLLOW_GATE.min_markets} resolved markets across ${weekends}/${WALLET_FOLLOW_GATE.min_weekends} weekends. No verdict until both minimums are met.`
        : status === "pass"
          ? "Follows beat the no-signal control with a clustered lower bound above zero, and still do without the top two wallets."
          : "Follows did not beat the no-signal control once clustered by market and checked without the top two wallets.",
  };
}

function isoWeek(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((date.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${date.getUTCFullYear()}-W${week}`;
}

export type WalletControlChoice = { market: PolymarketMarket; outcome_index: number; indicative_price: number };

/**
 * Pick the comparable no-signal market for a follow: same kind, binary, open,
 * no followed-wallet signal, not already held, with an outcome priced in the
 * follow band closest to the follow's entry. Deterministic given inputs.
 */
export function pickWalletControl(
  candidates: PolymarketMarket[],
  input: { kind: WalletSignalKind; targetAsk: number; excludeMarketIds: Set<string> },
): WalletControlChoice | null {
  let best: WalletControlChoice | null = null;
  for (const market of candidates) {
    if (input.excludeMarketIds.has(market.id) || market.token_ids.length !== 2 || !market.accepting_orders) continue;
    if (walletSignalKind(market.question, classifyAnalystMarket(market.question, market.slug)) !== input.kind) continue;
    market.outcome_prices.forEach((price, index) => {
      if (price < WALLET_FOLLOW_BAND[0] || price > WALLET_FOLLOW_BAND[1]) return;
      if (!best || Math.abs(price - input.targetAsk) < Math.abs(best.indicative_price - input.targetAsk)) {
        best = { market, outcome_index: index, indicative_price: price };
      }
    });
  }
  return best;
}

async function recordWalletControl(store: PolymarketWalletStore, follow: WalletFollowRow, nowMs: number) {
  const candidates = await fetchPolymarketFastResolvers(48 * 3_600_000).catch(() => [] as PolymarketMarket[]);
  const exclude = new Set([...store.signaledMarketIds(), ...store.openFollows().map((row) => row.market_id)]);
  const choice = pickWalletControl(candidates, { kind: follow.kind, targetAsk: follow.entry_ask, excludeMarketIds: exclude });
  if (!choice) return;
  const token = choice.market.token_ids[choice.outcome_index];
  const books = await fetchPolymarketOrderBooks([token], false).catch(() => new Map());
  const book = books.get(token);
  const ask = book ? summarizePolymarketBook(book).best_ask : null;
  if (ask === null || ask < WALLET_FOLLOW_BAND[0] || ask > WALLET_FOLLOW_BAND[1]) return;
  const feeBps = feeRateBps(choice.market.fee_schedule ?? { rate: choice.market.fees_enabled ? null : 0 });
  store.insertFollow({
    id: randomUUID(),
    opened_at: new Date(nowMs).toISOString(),
    signal_id: follow.signal_id,
    wallet: "control",
    market_id: choice.market.id,
    condition_id: choice.market.condition_id,
    question: choice.market.question,
    slug: choice.market.slug,
    kind: follow.kind,
    outcome_index: choice.outcome_index,
    outcome: choice.market.outcomes[choice.outcome_index] ?? "",
    entry_ask: ask,
    stake_usd: follow.stake_usd,
    taker_fee_bps: feeBps ?? -1,
    status: "pending",
    winning_outcome_index: null,
    resolved_at: null,
    won: null,
    fee_usd: walletFollowFeeUsd(follow.stake_usd, ask, feeBps),
    pnl_usd: null,
    arm: "control",
  });
}
