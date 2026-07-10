/**
 * Autopilot paper daemon (v2 strategy): the 24/7 loop that watches Solana
 * majors and paper-trades them against live prices. Run with `npm run
 * autopilot`. PAPER ONLY: it holds no keys, signs nothing, and its only writes
 * are to the bot's own .data/autopilot.db.json.
 *
 * v1 lost money for structural reasons the ledger made obvious (2026-07-03):
 * it bought COMPLETED 13-minute moves (spike tops that mean-revert), used a
 * trailing stop anchored at the entry tick (noise-stopped in 20 seconds), and
 * an exit that re-measured the entry window (fired on window rollover, not
 * reversal) — all while paying 0.6% round trip.
 *
 * v2 ("trend-pullback", docs/research/2026-07-03-autopilot-strategy-v2-research.md):
 * - ENTER only WITH an established trend (24h and 1h up, from the DexScreener
 *   feed) during a short-window pullback/consolidation — never into a spike.
 * - Volatility-scaled HARD stop from the entry price; take profit at 2R;
 *   trailing engages only after +1R; time-stop closes stale positions when
 *   the hourly trend flips.
 * - Anti-churn: per-symbol cooldown, max trades/day, loss-streak pause; a
 *   cost gate keeps target profit ≥ 3× round-trip cost.
 * - Every decision (entries, exits, and the best rejected candidate) lands in
 *   a persistent decision log with the full signal snapshot, so the next
 *   failure is diagnosable from data instead of guesswork.
 */

import { runAnalyst } from "./analyst";
import { MEMECOIN_PAPER_FEE_RATE, paperExecutor, PAPER_FEE_RATE } from "./executor";
import { fetchTokenBalanceUi, fetchUsdcBalanceUsd } from "./live";
import { jupiterLiveExecutor } from "./live-executor";
import { fetchMarketFeed, fetchTokenSummary, type MarketFeedRow, type TokenSummary } from "./feed";
import { intentFromDecision } from "./intent";
import { notifyOperator } from "./notify";
import { DEFAULT_STRATEGY_PARAMS, type StrategyParams } from "./params";
import { validateIntent } from "./policy";
import { describeRehearsal, rehearseFill } from "./rehearsal";
import type { SymbolEvaluation } from "./strategy-view";
import type { PriceObservation } from "./v3/candidate-store";
import { conservativeCost, memecoinConservativeCost } from "./v3/execution-cost";
import type { FundingInput } from "./v3/funding-basis";
import { fetchDriftFunding, PERP_MARKET_BY_MINT } from "./v3/perps";
import { calibrate } from "./v3/calibration";
import { markCarryBook } from "./v3/carry-book";
import { evaluateV3Promotion } from "./v3/promotion";
import { evaluateV3Shadow, labelDueCandidates, recordV3Shadow } from "./v3/shadow";
import type { CandidateSignal } from "./v3/signal";
import { copyWalletCandidate, scanWatchedWallets, type WalletBuyEvent } from "./v3/smart-wallets";
import { fetchWalletSuggestions, SUGGESTIONS_TTL_MS } from "./v3/wallet-discovery";
import { PUBLIC_RPC_URL } from "../helius/rpc-url";
import { fetchTrendingTokens, type TrendingToken } from "./v3/trending";
import { UNIVERSE } from "./universe";
import {
  autopilotStore,
  type BotPositionRow,
  type BotStateRow,
  type BotTradeRow,
  type DecisionSignals,
} from "./store";

export const TICK_MS = 20_000;
const EQUITY_MARK_EVERY_TICKS = 3; // one equity point per minute
export const PAPER_STARTING_CASH_USD = 1_000;
export const ROUND_TRIP_COST_PCT = PAPER_FEE_RATE * 2 * 100; // 0.6%
const WINDOW_TICKS = 40; // ~13 minutes of 20s samples

// --- v2 strategy parameters ---------------------------------------------------
// The tunable surface now lives in the bot DB behind hard clamps
// (src/autopilot/params.ts, learning-loop plan): the daemon reads
// store.strategyParams() each tick and decide() consumes them via
// DecisionInput. The names below re-export the LAUNCH values (the changelog
// origin) for tests and docs; live behavior follows the store.
export const ENTRY_MIN_H24_PCT = DEFAULT_STRATEGY_PARAMS.entry_min_h24_pct;
export const ENTRY_MAX_H24_PCT = DEFAULT_STRATEGY_PARAMS.entry_max_h24_pct;
export const ENTRY_MIN_H1_PCT = DEFAULT_STRATEGY_PARAMS.entry_min_h1_pct;
export const ENTRY_PULLBACK_MIN_PCT = DEFAULT_STRATEGY_PARAMS.entry_pullback_min_pct;
export const ENTRY_PULLBACK_MAX_PCT = DEFAULT_STRATEGY_PARAMS.entry_pullback_max_pct;
export const MIN_VOLUME_H24_USD = DEFAULT_STRATEGY_PARAMS.min_volume_h24_usd;
export const MIN_LIQUIDITY_USD = DEFAULT_STRATEGY_PARAMS.min_liquidity_usd;
export const MIN_STOP_PCT = DEFAULT_STRATEGY_PARAMS.min_stop_pct;
export const MAX_STOP_PCT = DEFAULT_STRATEGY_PARAMS.max_stop_pct;
export const TAKE_PROFIT_R = DEFAULT_STRATEGY_PARAMS.take_profit_r;
export const MIN_EDGE_OVER_COST = DEFAULT_STRATEGY_PARAMS.min_edge_over_cost;
export const TIME_STOP_MS = DEFAULT_STRATEGY_PARAMS.time_stop_ms;
export const COOLDOWN_MS = DEFAULT_STRATEGY_PARAMS.cooldown_ms;
export const MAX_TRADES_PER_DAY = DEFAULT_STRATEGY_PARAMS.max_trades_per_day;
export const LOSS_STREAK_LIMIT = DEFAULT_STRATEGY_PARAMS.loss_streak_limit;
export const LOSS_STREAK_PAUSE_MS = DEFAULT_STRATEGY_PARAMS.loss_streak_pause_ms;
export const OBSERVATION_EVERY_MS = 10 * 60_000;
/** Live canary week (learning-loop plan, Day 3): entry size cap and duration. */
export const CANARY_TRADE_USD = 10;
export const CANARY_WINDOW_MS = 7 * 24 * 60 * 60_000;
/** Post-exit counterfactual mark schedule (learning-loop plan, layer 2). */
export const EXIT_WATCH_MARKS_MS = { mark_30m_usd: 30 * 60_000, mark_2h_usd: 2 * 60 * 60_000, mark_4h_usd: 4 * 60 * 60_000 } as const;
export { UNIVERSE } from "./universe";

export type PriceWindow = Map<string, number[]>; // mint -> chronological prices

export type Decision =
  | { action: "buy"; mint: string; symbol: string; price: number; value_usd: number; stop_pct: number; reason: string; signals: DecisionSignals }
  | { action: "sell"; mint: string; symbol: string; price: number; reason: string; signals: DecisionSignals };

export type SkippedCandidate = { symbol: string; reason: string; signals: DecisionSignals };

export type DecisionInput = {
  windows: PriceWindow;
  positions: BotPositionRow[];
  state: BotStateRow;
  cash_usd: number;
  feed: Map<string, MarketFeedRow>; // by symbol
  now_ms: number;
  trades_today: number;
  cooldown_until_ms: Map<string, number>; // by mint
  loss_streak: number;
  last_loss_ms: number | null;
  /** Store-backed, clamp-sanitized strategy params (the learnable surface). */
  params: StrategyParams;
  /** True during the first live week: entries are pinned to canary size. */
  live_canary?: boolean;
};

export type DecisionOutput = {
  decisions: Decision[];
  skipped: SkippedCandidate | null; // best rejected candidate, for the log
  /** Every universe symbol's verdict this tick, for the strategy panel. */
  evaluations: SymbolEvaluation[];
};

export function windowReturnPct(prices: number[]): number | null {
  if (prices.length < WINDOW_TICKS) return null;
  const first = prices[0];
  const last = prices[prices.length - 1];
  if (!Number.isFinite(first) || first <= 0) return null;
  return ((last - first) / first) * 100;
}

/** Realized range of the window as a % of the latest price — the volatility
 * proxy that sizes stops. Needs a full window; null otherwise. */
export function windowRangePct(prices: number[]): number | null {
  if (prices.length < WINDOW_TICKS) return null;
  const last = prices[prices.length - 1];
  if (!Number.isFinite(last) || last <= 0) return null;
  const high = Math.max(...prices);
  const low = Math.min(...prices);
  return ((high - low) / last) * 100;
}

export function stopPctFromRange(rangePct: number | null, params: StrategyParams = DEFAULT_STRATEGY_PARAMS): number {
  if (rangePct === null || !Number.isFinite(rangePct)) return params.min_stop_pct;
  return Math.min(params.max_stop_pct, Math.max(params.min_stop_pct, rangePct * params.stop_vol_mult));
}

function signalsFor(symbol: string, prices: number[], feedRow: MarketFeedRow | undefined): DecisionSignals {
  return {
    price_usd: prices[prices.length - 1] ?? null,
    short_pct: windowReturnPct(prices),
    range_pct: windowRangePct(prices),
    h1_pct: feedRow?.change_h1_pct ?? null,
    h24_pct: feedRow?.change_h24_pct ?? null,
    volume_h24_usd: feedRow?.volume_h24_usd ?? null,
    liquidity_usd: feedRow?.liquidity_usd ?? null,
  };
}

/**
 * Pure v2 strategy core. Exits first (protect capital), then at most one
 * entry per tick. Also returns the strongest rejected candidate with the
 * reason, so the decision log shows what the bot chose NOT to do.
 */
export function decide(input: DecisionInput): DecisionOutput {
  const { windows, positions, state, cash_usd, feed, now_ms, trades_today, cooldown_until_ms, loss_streak, last_loss_ms, params } = input;
  if (state.kill_switch || (state.mode !== "paper" && state.mode !== "live")) return { decisions: [], skipped: null, evaluations: [] };

  const decisions: Decision[] = [];
  // Per-symbol verdicts for the strategy panel: why each token is or isn't
  // being traded RIGHT NOW. Filled as the gates run, so the reasons shown are
  // the exact ones the strategy acted on this tick.
  const evalBySymbol = new Map<string, SymbolEvaluation>();
  const held = new Set(positions.map((position) => position.mint));

  // --- exits: hard stop / take profit / armed trail / time stop -------------
  for (const position of positions) {
    const prices = windows.get(position.mint) ?? [];
    const price = prices[prices.length - 1];
    if (!Number.isFinite(price) || price <= 0) continue;
    const feedRow = feed.get(position.symbol);
    const signals = signalsFor(position.symbol, prices, feedRow);
    const stopPct = position.stop_pct ?? params.min_stop_pct;
    const entry = position.avg_cost_usd;
    const stopPrice = entry * (1 - stopPct / 100);
    const targetPrice = entry * (1 + (stopPct * params.take_profit_r) / 100);
    const trailArmPrice = entry * (1 + stopPct / 100);
    const peak = Math.max(position.peak_usd ?? entry, price);

    if (price <= stopPrice) {
      decisions.push({ action: "sell", mint: position.mint, symbol: position.symbol, price, reason: `Hard stop: -${stopPct.toFixed(1)}% from entry.`, signals });
    } else if (price >= targetPrice) {
      decisions.push({ action: "sell", mint: position.mint, symbol: position.symbol, price, reason: `Take profit: +${((price / entry - 1) * 100).toFixed(1)}% (${params.take_profit_r}R target).`, signals });
    } else if (peak >= trailArmPrice && price <= peak * (1 - stopPct / 100)) {
      decisions.push({ action: "sell", mint: position.mint, symbol: position.symbol, price, reason: `Armed trail: ${((price / peak - 1) * 100).toFixed(1)}% off the high after +1R.`, signals });
    } else if (
      now_ms - Date.parse(position.opened_at) >= params.time_stop_ms &&
      (signals.h1_pct ?? 0) < 0
    ) {
      decisions.push({ action: "sell", mint: position.mint, symbol: position.symbol, price, reason: `Time stop: ${Math.round((now_ms - Date.parse(position.opened_at)) / 3_600_000)}h held and the hourly trend turned down.`, signals });
    }
  }

  // --- entry gates (cheap global blocks first) -------------------------------
  const exiting = new Set(decisions.map((decision) => decision.mint));
  const openAfterExits = positions.filter((position) => !exiting.has(position.mint)).length;

  for (const position of positions) {
    const exit = decisions.find((decision) => decision.action === "sell" && decision.mint === position.mint);
    const prices = windows.get(position.mint) ?? [];
    const price = prices[prices.length - 1];
    const stopPct = position.stop_pct ?? params.min_stop_pct;
    const pnlPct = Number.isFinite(price) && price > 0 ? ((price / position.avg_cost_usd - 1) * 100).toFixed(1) : null;
    evalBySymbol.set(position.symbol, {
      symbol: position.symbol,
      status: exit ? "exiting" : "held",
      reason: exit
        ? exit.reason
        : `holding${pnlPct !== null ? ` at ${Number(pnlPct) >= 0 ? "+" : ""}${pnlPct}%` : ""}; stop -${stopPct.toFixed(1)}%, target +${(stopPct * params.take_profit_r).toFixed(1)}%`,
      signals: exit?.signals ?? signalsFor(position.symbol, prices, feed.get(position.symbol)),
    });
  }

  const globalBlock =
    openAfterExits >= state.caps.max_positions
      ? "at max positions"
      : trades_today >= params.max_trades_per_day
        ? `at the ${params.max_trades_per_day}-trade daily limit`
        : loss_streak >= params.loss_streak_limit && last_loss_ms !== null && now_ms - last_loss_ms < params.loss_streak_pause_ms
          ? `paused after ${loss_streak} consecutive losses`
          : null;

  let skipped: SkippedCandidate | null = null;
  let best: { symbol: string; mint: string; price: number; stopPct: number; signals: DecisionSignals } | null = null;

  const passedGates: Array<{ symbol: string; signals: DecisionSignals }> = [];
  for (const { symbol, mint } of UNIVERSE) {
    if (held.has(mint) || exiting.has(mint)) continue;
    const prices = windows.get(mint) ?? [];
    const feedRow = feed.get(symbol);
    const signals = signalsFor(symbol, prices, feedRow);
    if (signals.price_usd === null || signals.short_pct === null) {
      // Window still filling: say so instead of silently doing nothing — the
      // first 13 minutes after a daemon start looked like "no strategy".
      const minutesLeft = Math.max(1, Math.ceil(((WINDOW_TICKS - prices.length) * TICK_MS) / 60_000));
      evalBySymbol.set(symbol, { symbol, status: "warming", reason: `signal window filling — ~${minutesLeft}m until this token is evaluated`, signals });
      continue;
    }

    const reject = (reason: string) => {
      evalBySymbol.set(symbol, { symbol, status: "rejected", reason, signals });
      // Keep the strongest rejected candidate (by 24h trend) for the log.
      if (!skipped || (signals.h24_pct ?? -Infinity) > (skipped.signals.h24_pct ?? -Infinity)) {
        skipped = { symbol, reason, signals };
      }
    };

    if (globalBlock) {
      reject(globalBlock);
      const rejected = evalBySymbol.get(symbol);
      if (rejected) evalBySymbol.set(symbol, { ...rejected, status: "blocked" });
      continue;
    }
    const cooldown = cooldown_until_ms.get(mint) ?? 0;
    if (now_ms < cooldown) {
      reject(`cooling down for ${Math.ceil((cooldown - now_ms) / 60_000)}m after the last exit`);
      continue;
    }
    if (signals.h24_pct === null || signals.h24_pct < params.entry_min_h24_pct) {
      reject(`24h trend ${signals.h24_pct === null ? "unknown" : `${signals.h24_pct.toFixed(1)}%`} below the +${params.entry_min_h24_pct}% gate`);
      continue;
    }
    if (signals.h24_pct > params.entry_max_h24_pct) {
      reject(`24h move +${signals.h24_pct.toFixed(1)}% looks like a blow-off — standing aside`);
      continue;
    }
    if (signals.h1_pct === null || signals.h1_pct < params.entry_min_h1_pct) {
      reject(`1h trend ${signals.h1_pct === null ? "unknown" : `${signals.h1_pct.toFixed(1)}%`} not aligned`);
      continue;
    }
    if (signals.short_pct > params.entry_pullback_max_pct) {
      reject(`13m move +${signals.short_pct.toFixed(1)}% is a spike — no chasing`);
      continue;
    }
    if (signals.short_pct < params.entry_pullback_min_pct) {
      reject(`13m move ${signals.short_pct.toFixed(1)}% is a breakdown, not a pullback`);
      continue;
    }
    if ((signals.volume_h24_usd ?? 0) < params.min_volume_h24_usd) {
      reject("24h volume below the floor");
      continue;
    }
    if ((signals.liquidity_usd ?? 0) < params.min_liquidity_usd) {
      reject("pool liquidity below the floor");
      continue;
    }
    const stopPct = stopPctFromRange(signals.range_pct, params);
    if (stopPct * params.take_profit_r < ROUND_TRIP_COST_PCT * params.min_edge_over_cost) {
      reject(`target ${(stopPct * params.take_profit_r).toFixed(1)}% under ${params.min_edge_over_cost}x cost`);
      continue;
    }

    passedGates.push({ symbol, signals });
    if (!best || (signals.h24_pct ?? 0) > (best.signals.h24_pct ?? 0)) {
      best = { symbol, mint, price: signals.price_usd, stopPct, signals };
    }
  }
  // Gate-passers that lost the ranking still get an honest line — "passed but
  // outranked" reads very differently from "rejected".
  for (const passed of passedGates) {
    if (best && passed.symbol === best.symbol) {
      evalBySymbol.set(passed.symbol, { symbol: passed.symbol, status: "entering", reason: `strongest qualified candidate — entering this tick (24h +${(passed.signals.h24_pct ?? 0).toFixed(1)}%)`, signals: passed.signals });
    } else {
      evalBySymbol.set(passed.symbol, { symbol: passed.symbol, status: "rejected", reason: `passed every gate but ${best?.symbol ?? "another token"} ranked higher on 24h trend`, signals: passed.signals });
    }
  }

  if (best) {
    // Live canary week: regardless of params, the first live days trade the
    // minimum viable size — capital earns trust before it earns size.
    const canaryCap = input.live_canary ? CANARY_TRADE_USD : Infinity;
    const size = Math.min(state.caps.max_trade_usd, cash_usd * 0.25, canaryCap);
    if (size >= 5) {
      decisions.push({
        action: "buy",
        mint: best.mint,
        symbol: best.symbol,
        price: best.price,
        value_usd: size,
        stop_pct: best.stopPct,
        reason: `Trend pullback: 24h +${(best.signals.h24_pct ?? 0).toFixed(1)}%, 1h +${(best.signals.h1_pct ?? 0).toFixed(1)}%, 13m ${(best.signals.short_pct ?? 0).toFixed(1)}% dip. Stop ${best.stopPct.toFixed(1)}%, target ${(best.stopPct * params.take_profit_r).toFixed(1)}%.`,
        signals: best.signals,
      });
      skipped = null; // an entry happened; the log gets the entry instead
    }
  }

  // UNIVERSE order first (stable panel rows), then any held off-universe token.
  const evaluations: SymbolEvaluation[] = [];
  for (const { symbol } of UNIVERSE) {
    const row = evalBySymbol.get(symbol);
    if (row) {
      evaluations.push(row);
      evalBySymbol.delete(symbol);
    }
  }
  evaluations.push(...evalBySymbol.values());

  return { decisions, skipped, evaluations };
}

/** Cash is derived from the ledger, never stored: starting stake + sells − buys − fees. */
export function derivePaperCash(trades: Array<{ side: "buy" | "sell"; value_usd: number; fee_usd: number }>): number {
  return trades.reduce(
    (cash, trade) => cash + (trade.side === "sell" ? trade.value_usd : -trade.value_usd) - trade.fee_usd,
    PAPER_STARTING_CASH_USD,
  );
}

export function markEquity(positions: BotPositionRow[], windows: PriceWindow, cash: number): number {
  const positionsValue = positions.reduce((sum, position) => {
    const prices = windows.get(position.mint) ?? [];
    const price = prices[prices.length - 1] ?? position.avg_cost_usd;
    return sum + position.qty * price;
  }, 0);
  return Math.round((cash + positionsValue) * 100) / 100;
}

/** Realized round trips from the append-only ledger (buys paired with the next
 * sell of the same mint), newest last. Powers loss-streak and trades/day. */
export function realizedRoundTrips(
  trades: BotTradeRow[],
): Array<{ mint: string; symbol: string; net_usd: number; closed_at: string }> {
  const openBuys = new Map<string, BotTradeRow>();
  const results: Array<{ mint: string; symbol: string; net_usd: number; closed_at: string }> = [];
  for (const trade of trades) {
    if (trade.side === "buy") {
      openBuys.set(trade.mint, trade);
    } else {
      const buy = openBuys.get(trade.mint);
      if (!buy) continue;
      openBuys.delete(trade.mint);
      results.push({
        mint: trade.mint,
        symbol: trade.symbol,
        net_usd: trade.value_usd - buy.value_usd - trade.fee_usd - buy.fee_usd,
        closed_at: trade.ts,
      });
    }
  }
  return results;
}

export function lossStreak(roundTrips: Array<{ net_usd: number; closed_at: string }>): { streak: number; last_loss_ms: number | null } {
  let streak = 0;
  let lastLossMs: number | null = null;
  for (let index = roundTrips.length - 1; index >= 0; index -= 1) {
    if (roundTrips[index].net_usd < 0) {
      if (streak === 0) lastLossMs = Date.parse(roundTrips[index].closed_at);
      streak += 1;
    } else {
      break;
    }
  }
  return { streak, last_loss_ms: lastLossMs };
}

/**
 * Biggest absolute mover across whatever window samples exist so far (needs
 * ≥2 samples — unlike the entry gate, observations don't wait for a full
 * window). Pure, for the throttled web3-memory observation notes.
 */
export function biggestWindowMover(
  windows: PriceWindow,
): { mint: string; symbol: string; pct: number; minutes: number } | null {
  let best: { mint: string; symbol: string; pct: number; minutes: number } | null = null;
  for (const { symbol, mint } of UNIVERSE) {
    const prices = windows.get(mint) ?? [];
    if (prices.length < 2) continue;
    const first = prices[0];
    const last = prices[prices.length - 1];
    if (!Number.isFinite(first) || first <= 0 || !Number.isFinite(last)) continue;
    const pct = ((last - first) / first) * 100;
    if (!best || Math.abs(pct) > Math.abs(best.pct)) {
      best = { mint, symbol, pct, minutes: Math.max(1, Math.round(((prices.length - 1) * TICK_MS) / 60_000)) };
    }
  }
  return best;
}

/** Pure: which marks are due for a watch at `nowMs`, given the schedule. */
export function dueExitWatchMarks(
  watch: { exit_ts: string; mark_30m_usd: number | null; mark_2h_usd: number | null; mark_4h_usd: number | null },
  nowMs: number,
): Array<keyof typeof EXIT_WATCH_MARKS_MS> {
  const exitMs = Date.parse(watch.exit_ts);
  if (!Number.isFinite(exitMs)) return [];
  return (Object.keys(EXIT_WATCH_MARKS_MS) as Array<keyof typeof EXIT_WATCH_MARKS_MS>).filter(
    (key) => watch[key] === null && nowMs - exitMs >= EXIT_WATCH_MARKS_MS[key],
  );
}

/**
 * Stamp due counterfactual marks on open exit watches from the current
 * prices. When a LOSS exit shows a ≥1% recovery at the 2h mark, a "lesson"
 * lands in web3 memory immediately — the raw material for the Analyst's
 * premature-stop diagnosis. A watch completes when its 4h mark is set.
 */
function processExitWatches(store: ReturnType<typeof autopilotStore>, prices: Map<string, number>, nowMs: number): void {
  for (const watch of store.openExitWatches()) {
    const price = prices.get(watch.mint);
    if (price === undefined) continue;
    const due = dueExitWatchMarks(watch, nowMs);
    if (due.length === 0) continue;
    const next = { ...watch };
    for (const key of due) next[key] = price;
    if (next.mark_4h_usd !== null) next.done = true;
    store.updateExitWatch(next);

    const justSet2h = watch.mark_2h_usd === null && next.mark_2h_usd !== null;
    if (justSet2h && next.was_loss && next.mark_2h_usd! >= watch.exit_price_usd * 1.01) {
      const reboundPct = ((next.mark_2h_usd! / watch.exit_price_usd - 1) * 100).toFixed(1);
      store.appendWeb3Memory({
        symbol: watch.symbol,
        kind: "lesson",
        summary: `Sold ${watch.symbol} at a loss at $${watch.exit_price_usd.toFixed(4)}; price was +${reboundPct}% two hours later — possible premature stop. Review stop sizing before widening anything else.`,
      });
    }
  }
}

/** Persisted minute bars → per-mint observation series for forward labeling. */
function priceSeriesFromHistory(history: Array<{ ts: string; prices: Record<string, number> }>): Map<string, PriceObservation[]> {
  const byMint = new Map<string, PriceObservation[]>();
  for (const row of history) {
    const ms = Date.parse(row.ts);
    if (!Number.isFinite(ms)) continue;
    for (const [mint, price] of Object.entries(row.prices)) {
      if (!Number.isFinite(price) || price <= 0) continue;
      const series = byMint.get(mint) ?? [];
      series.push({ ts: ms, price });
      byMint.set(mint, series);
    }
  }
  return byMint;
}

// --- IO shell -----------------------------------------------------------------

const PRICE_URL = "https://lite-api.jup.ag/price/v3?ids=";
const PRICE_BACKOFF_MS = 90_000; // sit out after a 429 instead of hammering

async function fetchPrices(extraMints: string[] = []): Promise<Map<string, number>> {
  // Held off-universe tokens (promoted V3 entries) ride along in the same
  // call: a position that cannot price cannot exit, so its mint must always
  // be quoted for as long as it is held.
  const mints = [...new Set([...UNIVERSE.map((asset) => asset.mint), ...extraMints])];
  const ids = mints.join(",");
  const response = await fetch(`${PRICE_URL}${ids}`, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`price fetch ${response.status}`);
  const body = (await response.json()) as Record<string, unknown>;
  const data = (body.data && typeof body.data === "object" ? body.data : body) as Record<string, { usdPrice?: number; price?: number | string }>;
  const prices = new Map<string, number>();
  for (const mint of mints) {
    const entry = data[mint];
    const price = Number(entry?.usdPrice ?? entry?.price);
    if (Number.isFinite(price) && price > 0) prices.set(mint, price);
  }
  return prices;
}

type TickContext = {
  windows: PriceWindow;
  count: number;
  lastObservationMs: number;
  lastSkipLogMs: number;
  /** Per symbol+reason: when an identical policy block was last logged. */
  lastBlockLogMs: Map<string, number>;
  /** V3 shadow throttle + the once-per-minute price-bar persistence marker. */
  lastV3ShadowMs: number;
  lastPriceBarMs: number;
  priceBackoffUntilMs: number;
  cooldownUntilMs: Map<string, number>;
  /** Latest Solana trending radar (refreshed in the V3 block; prices feed the
   * minute bars so off-universe snapshots can be forward-labeled). */
  lastTrending: TrendingToken[];
  /** Latest smart-wallet buy targets' market summaries (same labeling ride). */
  lastCopySummaries: TokenSummary[];
};

async function tick(context: TickContext): Promise<void> {
  const store = autopilotStore();
  // Heartbeat first, before any gate: it proves the daemon PROCESS is alive
  // even while the bot itself is halted or off. The patch stays minimal
  // ({ last_tick_at } only) because the Next server does read-modify-write on
  // the same JSON file — a small patch shrinks the race window.
  store.updateBotState({ last_tick_at: new Date().toISOString() });
  const state = store.botState();
  if (state.kill_switch || (state.mode !== "paper" && state.mode !== "live")) return; // hard gate before ANY action
  const isLive = state.mode === "live";

  const nowMs = Date.now();
  if (nowMs < context.priceBackoffUntilMs) return; // rate-limited: sit out

  let prices: Map<string, number>;
  try {
    prices = await fetchPrices(store.positions().map((position) => position.mint));
  } catch (error) {
    if (error instanceof Error && error.message.includes("429")) {
      context.priceBackoffUntilMs = nowMs + PRICE_BACKOFF_MS;
      store.appendActivity("error", `Price API rate-limited; backing off ${PRICE_BACKOFF_MS / 1000}s.`);
      return;
    }
    throw error;
  }
  for (const [mint, price] of prices) {
    const window = context.windows.get(mint) ?? [];
    window.push(price);
    if (window.length > WINDOW_TICKS) window.shift();
    context.windows.set(mint, window);
  }

  // Persist the high-water mark on each open position (survives restarts).
  for (const position of store.positions()) {
    const price = prices.get(position.mint);
    if (price === undefined) continue;
    const peak = Math.max(position.peak_usd ?? position.avg_cost_usd, price);
    if (peak !== (position.peak_usd ?? position.avg_cost_usd)) {
      store.upsertPosition({ ...position, peak_usd: peak, updated_at: new Date().toISOString() });
    }
  }

  const allTrades = store.trades(100000);
  // Every derivation below is scoped to the CURRENT mode's rows: the paper
  // book and the live book are separate accounts, and cash, round trips,
  // streaks, and daily counters must never mix them.
  const modeTrades = allTrades.filter((trade) => (trade.mode ?? "paper") === state.mode);
  // Paper cash derives from the ledger; LIVE cash is the wallet's actual USDC
  // balance — unknown balance means no trading this tick, never a guess.
  let cash: number;
  if (isLive) {
    const usdc = await fetchUsdcBalanceUsd();
    if (usdc === null) {
      store.appendActivity("error", "Live tick skipped: USDC balance unavailable from RPC.");
      return;
    }
    cash = usdc;
  } else {
    cash = derivePaperCash(modeTrades);
  }
  const equity = markEquity(store.positions(), context.windows, cash);

  // Risk halts run before decisions so a breached limit stops the bot cold.
  // Scoped to equity marked since the CURRENT mode was armed: paper-era marks
  // (~$1,000 stake) must never define the peak or day-start for a live book
  // that starts from a ~$40 wallet — that would read as an instant drawdown.
  const today = new Date().toISOString().slice(0, 10);
  const armMs = state.started_at ? Date.parse(state.started_at) : 0;
  const eraPoints = store
    .equitySeries(2000)
    .filter((point) => point.equity_usd > 0 && Date.parse(point.ts) >= armMs);
  const dayStart = eraPoints.find((point) => point.ts.slice(0, 10) === today)?.equity_usd ?? equity;
  const peakEquity = Math.max(...eraPoints.map((point) => point.equity_usd), equity, isLive ? equity : PAPER_STARTING_CASH_USD);
  if (dayStart - equity > state.caps.daily_loss_limit_usd) {
    store.updateBotState({ mode: "halted", kill_switch: true });
    const message = `Daily loss limit hit: down $${(dayStart - equity).toFixed(2)} today. Bot halted; release the kill switch to reset.`;
    store.appendActivity("halt", message);
    notifyOperator("halt", message);
    return;
  }
  if (equity < peakEquity * (1 - state.caps.drawdown_halt_pct / 100)) {
    store.updateBotState({ mode: "halted", kill_switch: true });
    const message = `Drawdown halt: equity $${equity.toFixed(2)} is ${state.caps.drawdown_halt_pct}% below peak $${peakEquity.toFixed(2)}.`;
    store.appendActivity("halt", message);
    notifyOperator("halt", message);
    return;
  }

  const feedRows = await fetchMarketFeed(); // 60s-cached inside; [] on failure
  const feed = new Map(feedRows.map((row) => [row.symbol, row]));
  const roundTrips = realizedRoundTrips(modeTrades);
  const streak = lossStreak(roundTrips);
  const tradesToday = modeTrades.filter((trade) => trade.side === "buy" && trade.ts.slice(0, 10) === today).length;

  // Post-exit counterfactuals: stamp due marks on open watches from live
  // prices, and flag loss exits that recovered (a "premature stop" lesson).
  processExitWatches(store, prices, nowMs);

  // Persist the V3 learning substrate once per minute: a combined minute bar
  // of every mint's price (restart-proof forward labeling + r_4h features)
  // and the per-mint 24h-volume EMA baseline behind xsec's volume_z.
  if (nowMs - context.lastPriceBarMs >= 60_000 && prices.size > 0) {
    context.lastPriceBarMs = nowMs;
    // Radar tokens ride along in the same minute bar so their shadow
    // snapshots can be forward-labeled exactly like universe tokens.
    const barPrices = Object.fromEntries(prices);
    for (const token of context.lastTrending) {
      if (token.price_usd !== null && token.price_usd > 0 && barPrices[token.mint] === undefined) {
        barPrices[token.mint] = token.price_usd;
      }
    }
    for (const summary of context.lastCopySummaries) {
      if (summary.price_usd > 0 && barPrices[summary.mint] === undefined) {
        barPrices[summary.mint] = summary.price_usd;
      }
    }
    store.appendPriceHistory(barPrices);
    const volumes: Record<string, number> = {};
    for (const asset of UNIVERSE) {
      const row = feed.get(asset.symbol);
      if (row?.volume_h24_usd) volumes[asset.mint] = row.volume_h24_usd;
    }
    if (Object.keys(volumes).length > 0) store.updateVolumeBaselines(volumes);
  }

  // V3 SHADOW (docs/roadmap/2026-07-05-v3-alpha-router-plan.md): alongside v2's
  // live trading, evaluate the cost-aware alpha router and record what it WOULD
  // do — entries and skips — into the candidate store, WITHOUT trading on it.
  // v2 stays the benchmark; V3 accumulates the labeled dataset and proves its
  // net-EV discipline before it ever routes a real intent. Throttled to one
  // recorded snapshot per 5 minutes to keep the JSON store light.
  // When the promotion gate is open, the shadow's top candidate this tick may
  // co-pilot the PAPER book through the same intent → policy → executor path
  // as v2. Never live: live routing keeps its own gate.
  let v3PaperCandidate: { signal: CandidateSignal; price: number } | null = null;
  if (nowMs - context.lastV3ShadowMs >= 5 * 60_000) {
    try {
      const costByMint = new Map(UNIVERSE.map((asset) => [asset.mint, conservativeCost()]));
      // Drift funding for the perp-able majors (30-min cache inside; stale or
      // unreachable data yields fresh:false and simply produces no inputs).
      const fundingByMint = new Map<string, FundingInput>();
      const fundingByMarket = new Map<string, FundingInput>();
      for (const [mint, market] of Object.entries(PERP_MARKET_BY_MINT)) {
        const asset = UNIVERSE.find((a) => a.mint === mint);
        if (!asset) continue;
        const snapshot = await fetchDriftFunding(market, nowMs);
        if (!snapshot.fresh || snapshot.funding_rate_8h_pct === null) continue;
        const input: FundingInput = {
          symbol: asset.symbol,
          mint,
          funding_rate_8h_pct: snapshot.funding_rate_8h_pct,
          hold_hours: 72,
          basis_pct: snapshot.basis_pct,
          cost: conservativeCost(),
          liquidity_usd: feed.get(asset.symbol)?.liquidity_usd ?? null,
          funding_persistence_windows: snapshot.persistence_windows,
        };
        fundingByMint.set(mint, input);
        fundingByMarket.set(market, input);
      }

      // Synthetic carry book: mark the funding_basis strategy's would-be
      // delta-neutral P&L from the same snapshots, so its evidence is a
      // cumulative series instead of unlabeled shadow rows.
      const carry = markCarryBook(store.carryBook(), fundingByMarket, nowMs);
      store.setCarryBook(carry.state);
      for (const note of carry.notes) store.appendActivity("carry", note);
      // The Solana radar: keyless trending/attention flow. Cached 5 minutes
      // inside; failures degrade to [] and the shadow simply runs without it.
      context.lastTrending = await fetchTrendingTokens(nowMs);

      // Wallet discovery: refresh the suggested-wallets list twice a day
      // (SolanaTracker leaderboard when a key exists, else trending-pool
      // activity leads). Suggestions only — following stays a human click.
      const existingSuggestions = store.walletSuggestions();
      if (!existingSuggestions || nowMs - Date.parse(existingSuggestions.ts) >= SUGGESTIONS_TTL_MS) {
        const suggestions = await fetchWalletSuggestions({
          trendingPools: context.lastTrending
            .map((token) => token.pool_address)
            .filter((pool): pool is string => Boolean(pool)),
          nowMs,
        });
        store.setWalletSuggestions(suggestions);
        if (suggestions.suggestions.length > 0) {
          store.appendActivity(
            "copy",
            `Wallet discovery refreshed: ${suggestions.suggestions.length} candidate${suggestions.suggestions.length === 1 ? "" : "s"} from ${suggestions.source === "solanatracker" ? "the SolanaTracker PnL leaderboard" : "trending-pool activity (no PnL history — vet before following)"}.`,
          );
        }
      }

      // Smart-money follows: scan the operator's watched wallets for fresh
      // buys (public RPC, budgeted), then price the bought tokens so the
      // copy_wallets module can emit EV-gated candidates. Shadow-only.
      const copyCandidates: CandidateSignal[] = [];
      const watched = store.watchedWallets();
      if (watched.length > 0) {
        const scan = await scanWatchedWallets(
          watched,
          store.smartWalletCursors(),
          process.env.SOLANA_RPC_URL?.trim() || PUBLIC_RPC_URL,
        );
        store.setSmartWalletCursors(scan.cursors);
        const eventsByMint = new Map<string, WalletBuyEvent[]>();
        for (const event of scan.events) {
          eventsByMint.set(event.mint, [...(eventsByMint.get(event.mint) ?? []), event]);
        }
        const summaries: TokenSummary[] = [];
        for (const [mint, events] of [...eventsByMint.entries()].slice(0, 3)) {
          const summary = await fetchTokenSummary(mint);
          if (!summary) continue;
          summaries.push(summary);
          store.appendActivity(
            "copy",
            `Watched wallet buy: ${[...new Set(events.map((e) => e.wallet.slice(0, 4)))].join(",")} bought ${summary.symbol}.`,
          );
          const candidate = copyWalletCandidate({
            mint,
            symbol: summary.symbol,
            events,
            price_usd: summary.price_usd,
            liquidity_usd: summary.liquidity_usd,
            cost: memecoinConservativeCost(),
          });
          if (candidate) copyCandidates.push(candidate);
        }
        if (summaries.length > 0) context.lastCopySummaries = summaries;
      }

      const history = store.priceHistory();
      const shadow = evaluateV3Shadow({
        universe: UNIVERSE,
        windows: context.windows,
        feed,
        costByMint,
        priceHistory: history,
        volumeBaselineByMint: new Map(Object.entries(store.volumeBaselines())),
        fundingByMint,
        trendingTokens: context.lastTrending,
        copyCandidates,
        // Off-universe tokens pay the memecoin tier: the EV gate must demand
        // ~2× more expected return from them than from majors.
        defaultCost: memecoinConservativeCost(),
      });
      // Radar prices join the map so off-universe snapshots record a real
      // entry price instead of 0.
      const snapshotPrices = new Map(prices);
      for (const token of context.lastTrending) {
        if (token.price_usd !== null && token.price_usd > 0 && !snapshotPrices.has(token.mint)) {
          snapshotPrices.set(token.mint, token.price_usd);
        }
      }
      for (const summary of context.lastCopySummaries) {
        if (summary.price_usd > 0 && !snapshotPrices.has(summary.mint)) {
          snapshotPrices.set(summary.mint, summary.price_usd);
        }
      }
      const note = recordV3Shadow(store, shadow, snapshotPrices);
      if (note) {
        // Advance the throttle only when something was actually recorded, so a
        // cold start (empty price windows) keeps trying each tick until the
        // windows warm up instead of burning the 5-minute window on no data.
        context.lastV3ShadowMs = nowMs;
        store.appendActivity("v3-shadow", note);
      }
      // Backfill forward labels on snapshots old enough to observe, from the
      // PERSISTED minute bars — labels survive daemon restarts now.
      labelDueCandidates(store, priceSeriesFromHistory(history), nowMs);

      // Promotion gate: pure over the labeled calibration record. State
      // transitions land in the tape; an open gate stages this tick's top
      // candidate for the paper book (validated by policy like any intent).
      const promotion = evaluateV3Promotion(calibrate(store.candidateSnapshots(2000)));
      const previous = store.v3Promotion();
      if ((previous?.ready ?? false) !== promotion.ready) {
        store.setV3Promotion({ ready: promotion.ready, ts: new Date(nowMs).toISOString() });
        const transition = promotion.ready
          ? "V3 PROMOTION GATE OPEN: calibrated shadow candidates now co-pilot the paper book."
          : `V3 promotion gate closed: ${promotion.checks.filter((check) => !check.pass).map((check) => check.detail).join("; ")}.`;
        store.appendActivity("v3-shadow", transition);
        notifyOperator("v3", transition);
      }
      if (promotion.ready && state.mode === "paper") {
        const top = shadow.route.ranked[0] ?? null;
        const heldMints = new Set(store.positions().map((position) => position.mint));
        const topPrice = top ? snapshotPrices.get(top.token_mint) : undefined;
        if (
          top &&
          topPrice !== undefined &&
          !heldMints.has(top.token_mint) &&
          nowMs >= (context.cooldownUntilMs.get(top.token_mint) ?? 0)
        ) {
          v3PaperCandidate = { signal: top, price: topPrice };
        }
      }
    } catch (error) {
      store.appendActivity("error", `V3 shadow failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // The learnable surface, read fresh each tick so an applied changeset takes
  // effect on the very next decision (learning-loop plan, layer 2).
  const params = store.strategyParams();

  const { decisions, skipped, evaluations } = decide({
    windows: context.windows,
    positions: store.positions(),
    state,
    cash_usd: cash,
    feed,
    now_ms: nowMs,
    trades_today: tradesToday,
    cooldown_until_ms: context.cooldownUntilMs,
    loss_streak: streak.streak,
    last_loss_ms: streak.last_loss_ms,
    params,
    // Canary week: the first CANARY_WINDOW_MS of live mode pins entry size.
    live_canary: isLive && state.started_at !== null && nowMs - Date.parse(state.started_at) < CANARY_WINDOW_MS,
  });

  // Persist this tick's per-symbol verdicts so the panel can show the strategy
  // working in real time (strategy-legibility slice, 2026-07-09).
  store.setLastEvaluations({ ts: new Date(nowMs).toISOString(), mode: state.mode, evaluations });

  // Promoted V3 co-pilot entry (paper only, one entry per tick total): the
  // candidate rides the same policy → executor path as any v2 decision, and
  // v2's exit engine (stop / take-profit / trail / time) manages the position.
  const v3EntryMints = new Set<string>();
  if (v3PaperCandidate && !isLive && !decisions.some((decision) => decision.action === "buy")) {
    const { signal, price } = v3PaperCandidate;
    const num = (value: unknown): number | null =>
      typeof value === "number" && Number.isFinite(value) ? value : null;
    const stopPct = Math.min(params.max_stop_pct, Math.max(params.min_stop_pct, signal.max_loss_bps / 100));
    decisions.push({
      action: "buy",
      mint: signal.token_mint,
      symbol: signal.symbol,
      price,
      value_usd: Math.max(5, Math.min(state.caps.max_trade_usd, cash * 0.25)),
      stop_pct: stopPct,
      reason: `V3 ${signal.strategy_id}: ${signal.reason}`,
      signals: {
        price_usd: price,
        short_pct: null,
        range_pct: null,
        h1_pct: num(signal.features.h1_pct ?? signal.features.r_1h_pct),
        h24_pct: num(signal.features.h24_pct ?? signal.features.r_24h_pct),
        volume_h24_usd: num(signal.features.volume_h24_usd),
        liquidity_usd: signal.liquidity_usd,
      },
    });
    v3EntryMints.add(signal.token_mint);
  }

  // Decisions become typed intents; the policy engine re-checks every hard
  // rule independently of the strategy core; only the executor produces fills
  // (docs/roadmap/2026-07-03-autonomy-architecture.md, D2/D3). Cash, spend,
  // and trade counters advance locally so a tick's second intent is judged
  // against the state its first one produced.
  // Fee tier by token class: majors pay the tight-pool rate, anything off
  // the universe (promoted V3 entries) pays the honest memecoin rate.
  const paperFeeRateFor = (mint: string): number =>
    UNIVERSE.some((asset) => asset.mint === mint) ? PAPER_FEE_RATE : MEMECOIN_PAPER_FEE_RATE;
  const executor = isLive
    ? jupiterLiveExecutor({ dry_run: false, reserve_floor_sol: state.caps.reserve_floor_sol })
    : paperExecutor({ feeRateForMint: paperFeeRateFor });
  let freeCash = cash;
  let buysToday = tradesToday;
  let spendToday = modeTrades
    .filter((trade) => trade.side === "buy" && trade.ts.slice(0, 10) === today)
    .reduce((sum, trade) => sum + trade.value_usd, 0);

  for (const decision of decisions) {
    const intent = intentFromDecision(
      decision,
      store.positions(),
      isLive ? "live" : "paper",
      v3EntryMints.has(decision.mint) ? "v3-alpha-router" : "v2-trend-pullback",
    );
    if (!intent) continue; // sell of an already-closed position: nothing to do
    const verdict = validateIntent(intent, {
      state,
      positions: store.positions(),
      cash_usd: freeCash,
      trades_today: buysToday,
      spend_today_usd: spendToday,
      max_trades_per_day: params.max_trades_per_day,
      fee_rate: PAPER_FEE_RATE,
    });
    if (!verdict.allowed) {
      // Throttled: the strategy re-proposes the same blocked trade every tick
      // (cooldowns only start on fills), so identical blocks within 10 minutes
      // would flood the trace with duplicates.
      const blockKey = `${intent.symbol}:${verdict.reason}`;
      if (nowMs - (context.lastBlockLogMs.get(blockKey) ?? 0) >= 10 * 60_000) {
        context.lastBlockLogMs.set(blockKey, nowMs);
        store.appendDecision({ symbol: intent.symbol, verdict: "blocked", reason: `Policy: ${verdict.reason}.`, signals: intent.signals });
        store.appendActivity("policy", `Blocked ${intent.action} ${intent.symbol}: ${verdict.reason}.`);
      }
      continue;
    }
    const result = await executor.execute(intent);
    if (!result.ok) {
      store.appendActivity("error", `Executor refused ${intent.action} ${intent.symbol}: ${result.error}`);
      continue;
    }
    const fill = result.fill;

    // Fire-and-forget live-route rehearsal: quote the same swap on Jupiter and
    // log the gap vs the paper fill, so the go-live decision has real cost
    // data. Never blocks or fails the tick (rehearseFill never throws).
    if (isLive) {
      store.appendWeb3Memory({ symbol: intent.symbol, kind: "risk", summary: `LIVE fill ${intent.action} ${intent.symbol}: $${fill.value_usd.toFixed(2)} at $${fill.price_usd.toFixed(4)}${fill.signature ? ` (sig ${fill.signature.slice(0, 12)}…)` : ""}.` });
    } else void rehearseFill(intent, fill).then((rehearsal) => {
      if (rehearsal) {
        store.appendWeb3Memory({ symbol: intent.symbol, kind: "risk", summary: describeRehearsal(rehearsal) });
      }
    });

    if (intent.action === "buy") {
      store.appendTrade({ side: "buy", mint: intent.mint, symbol: intent.symbol, qty: fill.qty, price_usd: fill.price_usd, value_usd: fill.value_usd, fee_usd: fill.fee_usd, reason: intent.reason, mode: intent.mode, signature: fill.signature });
      store.upsertPosition({
        mint: intent.mint,
        symbol: intent.symbol,
        qty: fill.qty,
        avg_cost_usd: fill.price_usd,
        stop_pct: intent.stop_pct ?? MIN_STOP_PCT,
        peak_usd: fill.price_usd,
        opened_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      freeCash -= fill.value_usd + fill.fee_usd;
      buysToday += 1;
      spendToday += fill.value_usd;
      store.appendDecision({ symbol: intent.symbol, verdict: "enter", reason: intent.reason, signals: intent.signals });
      store.appendActivity("entry", `Paper buy ${intent.symbol}: $${fill.value_usd.toFixed(2)} at $${fill.price_usd.toFixed(4)}. ${intent.reason}`);
      notifyOperator("entry", `${isLive ? "LIVE" : "Paper"} buy ${intent.symbol}: $${fill.value_usd.toFixed(2)} at $${fill.price_usd.toFixed(4)}`);
      store.appendWeb3Memory({ symbol: intent.symbol, kind: "entry", summary: `Entered ${intent.symbol} at $${fill.price_usd.toFixed(4)}. ${intent.reason}` });
    } else {
      const position = store.positions().find((row) => row.mint === intent.mint);
      if (!position) continue;
      const pnl = fill.value_usd - position.qty * position.avg_cost_usd;
      const sellRow = store.appendTrade({ side: "sell", mint: intent.mint, symbol: intent.symbol, qty: fill.qty, price_usd: fill.price_usd, value_usd: fill.value_usd, fee_usd: fill.fee_usd, reason: intent.reason, mode: intent.mode, signature: fill.signature });
      store.closePosition(intent.mint);
      context.cooldownUntilMs.set(intent.mint, nowMs + params.cooldown_ms);
      // Keep watching this exit: the +30m/+2h/+4h marks are the counterfactual
      // record the Analyst learns from (was the stop right, or panic?).
      store.appendExitWatch({
        trade_id: sellRow.id,
        mint: intent.mint,
        symbol: intent.symbol,
        exit_price_usd: fill.price_usd,
        exit_ts: sellRow.ts,
        // Net of BOTH sides' fees (the buy fee is estimated from cost basis).
        was_loss: pnl - fill.fee_usd - position.qty * position.avg_cost_usd * paperFeeRateFor(intent.mint) < 0,
      });
      freeCash += fill.value_usd - fill.fee_usd;
      store.appendDecision({ symbol: intent.symbol, verdict: "exit", reason: intent.reason, signals: intent.signals });
      store.appendActivity("exit", `Paper sell ${intent.symbol}: $${fill.value_usd.toFixed(2)} at $${fill.price_usd.toFixed(4)} (${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)} before fees). ${intent.reason}`);
      notifyOperator("exit", `${isLive ? "LIVE" : "Paper"} sell ${intent.symbol}: ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)} before fees. ${intent.reason}`);
      store.appendWeb3Memory({ symbol: intent.symbol, kind: "exit", summary: `Exited ${intent.symbol} at $${fill.price_usd.toFixed(4)}, ${pnl >= 0 ? "gain" : "loss"} $${Math.abs(pnl).toFixed(2)} before fees. ${intent.reason}` });
    }
  }

  // Live reconcile (memo §9 Phase 2): after any live fill this tick, the
  // wallet's ACTUAL USDC must match the tracked book within tolerance —
  // an unexplained gap means fills the ledger doesn't know about, and the
  // only safe response is to halt cold.
  if (isLive && decisions.length > 0) {
    const actual = await fetchUsdcBalanceUsd();
    if (actual === null) {
      store.appendActivity("error", "Live reconcile skipped: USDC balance unavailable after fills.");
    } else if (Math.abs(actual - freeCash) > Math.max(1, freeCash * 0.02)) {
      store.updateBotState({ mode: "halted", kill_switch: true });
      const message = `LIVE RECONCILE MISMATCH: wallet USDC $${actual.toFixed(2)} vs booked $${freeCash.toFixed(2)} — halted pending operator review.`;
      store.appendActivity("halt", message);
      notifyOperator("halt", message);
      return;
    }
    // ON-CHAIN POSITION RECONCILE: every open position's booked quantity must
    // match the wallet's actual token balance (2% tolerance for quote-vs-fill
    // drift at canary size). An unexplained gap means fills the ledger doesn't
    // know about — halt cold, same as the cash check.
    for (const position of store.positions()) {
      const onChain = await fetchTokenBalanceUi(position.mint);
      if (onChain === null) {
        store.appendActivity("error", `Live reconcile: ${position.symbol} on-chain balance unavailable — will retry next fill.`);
        continue;
      }
      const drift = Math.abs(onChain - position.qty);
      if (drift > Math.max(position.qty * 0.02, 1e-9)) {
        store.updateBotState({ mode: "halted", kill_switch: true });
        const message = `LIVE POSITION MISMATCH: ${position.symbol} on-chain ${onChain} vs booked ${position.qty} — halted pending operator review.`;
        store.appendActivity("halt", message);
        notifyOperator("halt", message);
        return;
      }
    }
  }

  // The best rejected candidate goes to the decision log (throttled) so the
  // ledger shows what the bot chose NOT to do and why. Paper mode logs a skip
  // per minute — silence read as "no strategy"; live keeps the quieter cadence.
  const skipLogEveryMs = isLive ? 5 * 60_000 : 60_000;
  if (decisions.length === 0 && skipped && nowMs - context.lastSkipLogMs >= skipLogEveryMs) {
    context.lastSkipLogMs = nowMs;
    store.appendDecision({ symbol: skipped.symbol, verdict: "skip", reason: skipped.reason, signals: skipped.signals });
  }

  if (context.count % EQUITY_MARK_EVERY_TICKS === 0) {
    store.appendEquityPoint(markEquity(store.positions(), context.windows, freeCash));
  }

  // The Analyst runs once per UTC day (learning-loop plan, layer 3), fired
  // from here because the daemon is the process that is always alive. The
  // attempt is stamped BEFORE the call so a hung/failed run costs one day,
  // never a per-tick LLM loop. Fire-and-forget: a slow review must not stall
  // trading ticks.
  if ((state.last_analyst_run_at ?? "").slice(0, 10) !== today) {
    store.updateBotState({ last_analyst_run_at: new Date().toISOString() });
    // Without an LLM key the run degrades to the deterministic rule-based
    // reviewer inside runAnalyst — the learning loop never silently stops.
    store.appendActivity(
      "analyst",
      process.env.OPENROUTER_API_KEY
        ? "Daily Analyst review started."
        : "Daily Analyst review started (rule-based — no LLM key set).",
    );
    void runAnalyst()
      .then((result) => {
        if (result.error) store.appendActivity("analyst", `Analyst run failed: ${result.error}`);
      })
      .catch((error: unknown) => {
        store.appendActivity("analyst", `Analyst run crashed: ${error instanceof Error ? error.message : String(error)}`);
      });
  }

  // Throttled observation: at most one web3-memory note per 10 minutes, so
  // the brain accumulates market context even on ticks where nothing trades.
  if (nowMs - context.lastObservationMs >= OBSERVATION_EVERY_MS) {
    const mover = biggestWindowMover(context.windows);
    if (mover) {
      context.lastObservationMs = nowMs;
      const signed = `${mover.pct >= 0 ? "+" : ""}${mover.pct.toFixed(1)}%`;
      store.appendWeb3Memory({
        symbol: mover.symbol,
        kind: "observation",
        summary: `${mover.symbol} ${signed} over the ~${mover.minutes}m window — biggest mover in the universe. v2 enters on trend pullbacks, not spikes.`,
      });
    }
  }
}

async function main(): Promise<void> {
  const store = autopilotStore();
  store.appendActivity(
    "daemon",
    `Paper daemon started (v2 trend-pullback, tick ${TICK_MS / 1000}s, universe ${UNIVERSE.map((asset) => asset.symbol).join("/")}, stake $${PAPER_STARTING_CASH_USD}).`,
  );
  store.updateBotState({ daemon_pid: process.pid });
  if (store.equitySeries(2).every((point) => point.equity_usd === 0)) {
    store.appendEquityPoint(PAPER_STARTING_CASH_USD);
  }

  const context: TickContext = {
    windows: new Map<string, number[]>(),
    count: 0,
    lastObservationMs: 0,
    lastSkipLogMs: 0,
    lastBlockLogMs: new Map<string, number>(),
    lastV3ShadowMs: 0,
    lastPriceBarMs: 0,
    priceBackoffUntilMs: 0,
    cooldownUntilMs: new Map<string, number>(),
    lastTrending: [],
    lastCopySummaries: [],
  };
  let stopping = false;
  const stop = () => {
    stopping = true;
    store.appendActivity("daemon", "Paper daemon stopped.");
    notifyOperator("daemon", "Autopilot daemon stopped.");
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  // Simple aligned loop; a failed tick logs and keeps going. Small jitter
  // de-synchronizes us from other clients of the shared keyless APIs.
  for (;;) {
    if (stopping) return;
    context.count += 1;
    try {
      await tick(context);
    } catch (error) {
      store.appendActivity("error", `Tick failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, TICK_MS + Math.floor(Math.random() * 2_000)));
  }
}

if (import.meta.main) {
  void main();
}
