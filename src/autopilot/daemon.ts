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
import { formatLatencySummary, modelDriftAlerts, summarizeDecisionToFill } from "./execution-telemetry";
import { fetchTokenBalanceUi, fetchUsdcBalanceUsd } from "./live";
import { jupiterLiveExecutor } from "./live-executor";
import { decimalsFor, fetchMintDecimals } from "./mint-meta";
import { fetchMarketFeed, fetchTokenSummary, type MarketFeedRow, type TokenSummary } from "./feed";
import { intentFromDecision } from "./intent";
import { notifyOperator } from "./notify";
import { DEFAULT_STRATEGY_PARAMS, type StrategyParams } from "./params";
import { MAX_TIER_B_POSITIONS, validateIntent } from "./policy";
import { describeRehearsal, rehearseFill, rehearsalRowFromSwap } from "./rehearsal";
import { medianRoundTripCostPct } from "./rehearsal-stats";
import type { SymbolEvaluation } from "./strategy-view";
import { priceSeriesFromHistory } from "./v3/candidate-store";
import {
  atrBps,
  barPortion,
  barStep,
  bpEntryOverlay,
  emaClose,
  initialBarBuilderState,
  type BarBuilderState,
} from "./v3/bars";
import {
  cusumMintRates,
  cusumStep,
  cusumThresholdPct,
  ewmaDailySigmaPct,
  initialCusumState,
  type CusumEvent,
  type CusumState,
} from "./v3/cusum";
import {
  conservativeCost,
  fetchExecutionQuote,
  memecoinConservativeCost,
  quoteNeedsRefresh,
  type ExecutionQuote,
} from "./v3/execution-cost";
import type { FundingInput } from "./v3/funding-basis";
import { fetchDriftFunding, PERP_MARKET_BY_MINT } from "./v3/perps";
import { calibrateBarPortionEdgeRatio, calibrateStrategy, calibrateCusumEdgeRatio } from "./v3/calibration";
import { markCarryBook } from "./v3/carry-book";
import { appendMlEventRequest, loadMlSignalState, mlSignalKey, mlSignalsDegraded, resolveMlEvent, type FreshMlSignal } from "./v3/ml-signals";
import { cexGapObservations, describeCexGapSummary, summarizeCexGaps, type CexVenue } from "./v3/cex-gap";
import { fetchCoinbaseTicker, fetchKrakenTickers, probeCexListing } from "./v3/cex-gap-fetch";
import { evaluateV3Demotion, evaluateV3Promotion, isPaperCopilotCandidate, paperPromotionSnapshots } from "./v3/promotion";
import { evaluateV3Shadow, labelDueCandidates, recordV3Shadow, SHADOW_MIN_LIQUIDITY_USD } from "./v3/shadow";
import type { CandidateSignal, ExecutionCost } from "./v3/signal";
import { toExpectedValue } from "./v3/signal";
import { passesEvGate } from "./v3/ev-gate";
import { copyWalletCandidate, scanWatchedWallets, type WalletBuyEvent } from "./v3/smart-wallets";
import { fetchWalletSuggestions, SUGGESTIONS_TTL_MS } from "./v3/wallet-discovery";
import { checkBudget, crossedAlertThreshold, recordUsage, solanaTrackerBudget } from "./v3/api-budget";
import { resolveGuardedRpcUrl } from "../helius/rpc-url";
import { runDailyBackup } from "../db/backup";
import { fetchTrendingTokens, type TrendingToken } from "./v3/trending";
import {
  buildTradableUniverse,
  DEFAULT_TIER_B_CONFIG,
  selectTierB,
  type TierBCandidate,
  type TierBSelection,
  type TradableAsset,
} from "./v3/universe-tiers";
import { UNIVERSE } from "./universe";
import {
  autopilotStore,
  type BotPositionRow,
  type BotStateRow,
  type BotTradeRow,
  type DecisionSignals,
  type AutopilotStore,
} from "./store";

export const TICK_MS = 20_000;
type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
// One equity mark per FIVE minutes (unattended-runway audit, 2026-07-10):
// per-minute marks meant equitySeries(2000) spanned only ~33 hours, so the
// go-live gate's 5-day window could never be measured. At 5-minute cadence
// the same read spans ~7 days, and the table cap keeps ~10 weeks of curve.
const EQUITY_MARK_EVERY_TICKS = 15;
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
  | { action: "buy"; mint: string; symbol: string; price: number; value_usd: number; stop_pct: number; tp_pct?: number; deadline_ts?: string; reason: string; signals: DecisionSignals; strategy_id?: string }
  | { action: "sell"; mint: string; symbol: string; price: number; reason: string; signals: DecisionSignals; strategy_id?: string };

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
  /** When the most recent NEW entry filled (any symbol), for entry spacing. */
  last_entry_ms?: number | null;
  /** Store-backed, clamp-sanitized strategy params (the learnable surface). */
  params: StrategyParams;
  /** Shell-derived route evidence. Missing/non-positive values fail closed to
   * the unchanged flat round-trip assumption inside the pure decision core. */
  measuredRoundTripCostPctByMint?: Map<string, number>;
  /** Fresh quote-derived cost wins over rehearsal and flat assumptions. */
  modeledRoundTripCostPctByMint?: Map<string, number>;
  /** Static Tier A plus the current persisted Tier B rotation. */
  universe?: TradableAsset[];
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

export type RequoteEdgeVerdict = { pass: true } | { pass: false; reason: "requote: edge gone" };

/** Pure final edge check shared by the V2 and promoted-V3 execution lanes. */
export function requoteEntryEdgeVerdict(input: {
  cost: ExecutionCost;
  stop_pct: number;
  params: StrategyParams;
  v3_signal?: CandidateSignal | null;
}): RequoteEdgeVerdict {
  const passes = input.v3_signal
    ? passesEvGate({
        ...input.v3_signal,
        cost: input.cost,
        expected_value_bps: toExpectedValue(input.v3_signal.expected_return_bps, input.cost),
      }, { min_liquidity_usd: SHADOW_MIN_LIQUIDITY_USD }).pass
    : input.stop_pct * input.params.take_profit_r
      >= (input.cost.total_bps / 100) * input.params.min_edge_over_cost;
  return passes ? { pass: true } : { pass: false, reason: "requote: edge gone" };
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
  const tradableUniverse = input.universe ?? buildTradableUniverse([]);

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
    const targetPct = position.tp_pct ?? stopPct * params.take_profit_r;
    const targetPrice = entry * (1 + targetPct / 100);
    const trailArmPrice = entry * (1 + stopPct / 100);
    const peak = Math.max(position.peak_usd ?? entry, price);

    if (price <= stopPrice) {
      decisions.push({ action: "sell", mint: position.mint, symbol: position.symbol, price, reason: `Hard stop: -${stopPct.toFixed(1)}% from entry.`, signals, strategy_id: position.strategy_id });
    } else if (price >= targetPrice) {
      decisions.push({ action: "sell", mint: position.mint, symbol: position.symbol, price, reason: `Take profit: +${((price / entry - 1) * 100).toFixed(1)}% (${params.take_profit_r}R target).`, signals, strategy_id: position.strategy_id });
    } else if (peak >= trailArmPrice && price <= peak * (1 - stopPct / 100)) {
      decisions.push({ action: "sell", mint: position.mint, symbol: position.symbol, price, reason: `Armed trail: ${((price / peak - 1) * 100).toFixed(1)}% off the high after +1R.`, signals, strategy_id: position.strategy_id });
    } else if (position.deadline_ts && now_ms >= Date.parse(position.deadline_ts)) {
      decisions.push({ action: "sell", mint: position.mint, symbol: position.symbol, price, reason: "Vertical barrier: deadline reached.", signals, strategy_id: position.strategy_id });
    } else if (
      now_ms - Date.parse(position.opened_at) >= params.time_stop_ms &&
      (signals.h1_pct ?? 0) < 0
    ) {
      decisions.push({ action: "sell", mint: position.mint, symbol: position.symbol, price, reason: `Time stop: ${Math.round((now_ms - Date.parse(position.opened_at)) / 3_600_000)}h held and the hourly trend turned down.`, signals, strategy_id: position.strategy_id });
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

  const lastEntryMs = input.last_entry_ms ?? null;
  const globalBlock =
    openAfterExits >= state.caps.max_positions
      ? "at max positions"
      : trades_today >= params.max_trades_per_day
        ? `at the ${params.max_trades_per_day}-trade daily limit`
        : loss_streak >= params.loss_streak_limit && last_loss_ms !== null && now_ms - last_loss_ms < params.loss_streak_pause_ms
          ? `paused after ${loss_streak} consecutive losses`
          : lastEntryMs !== null && now_ms - lastEntryMs < params.entry_spacing_ms
            ? `spacing entries: last fill ${Math.round((now_ms - lastEntryMs) / 60_000)}m ago, ${Math.round(params.entry_spacing_ms / 60_000)}m required — one regime flip is one bet, not three`
            : null;

  let skipped: SkippedCandidate | null = null;
  let best: { symbol: string; mint: string; tier: "A" | "B"; price: number; stopPct: number; signals: DecisionSignals } | null = null;

  const passedGates: Array<{ symbol: string; signals: DecisionSignals }> = [];
  for (const { symbol, mint, tier } of tradableUniverse) {
    if (held.has(mint) || exiting.has(mint)) continue;
    const prices = windows.get(mint) ?? [];
    const feedRow = feed.get(symbol);
    const modeledCost = input.modeledRoundTripCostPctByMint?.get(mint);
    const usesModeledCost = modeledCost !== undefined && Number.isFinite(modeledCost) && modeledCost > 0;
    const measuredCost = input.measuredRoundTripCostPctByMint?.get(mint);
    const usesMeasuredCost =
      measuredCost !== undefined && Number.isFinite(measuredCost) && measuredCost > 0;
    const roundTripCostPct = usesModeledCost ? modeledCost : usesMeasuredCost ? measuredCost : ROUND_TRIP_COST_PCT;
    const costSource = usesModeledCost ? "modeled" as const : usesMeasuredCost ? "measured" as const : "flat" as const;
    const signals: DecisionSignals = {
      ...signalsFor(symbol, prices, feedRow),
      round_trip_cost_pct: roundTripCostPct,
      cost_source: costSource,
    };
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
    if (stopPct * params.take_profit_r < roundTripCostPct * params.min_edge_over_cost) {
      reject(
        usesModeledCost || usesMeasuredCost
          ? `target ${(stopPct * params.take_profit_r).toFixed(1)}% under ${params.min_edge_over_cost}x ${costSource} cost ${roundTripCostPct.toFixed(2)}%`
          : `target ${(stopPct * params.take_profit_r).toFixed(1)}% under ${params.min_edge_over_cost}x cost`,
      );
      continue;
    }

    passedGates.push({ symbol, signals });
    if (!best || (signals.h24_pct ?? 0) > (best.signals.h24_pct ?? 0)) {
      best = { symbol, mint, tier, price: signals.price_usd, stopPct, signals };
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
    const tierCap = best.tier === "B" ? 15 : Infinity;
    const size = Math.min(state.caps.max_trade_usd, cash_usd * 0.25, canaryCap, tierCap);
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

  // Active Tier A/B universe order first (stable panel rows), then any held
  // dropped/off-universe token retained for exit handling.
  const evaluations: SymbolEvaluation[] = [];
  for (const { symbol } of tradableUniverse) {
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
 * sell of the same mint). Store reads are newest-first while fixtures and
 * migrations may not be, so this helper establishes chronological order
 * before pairing. Powers the production loss-streak pause. */
export function realizedRoundTrips(
  trades: BotTradeRow[],
): Array<{ mint: string; symbol: string; net_usd: number; closed_at: string }> {
  const openBuys = new Map<string, BotTradeRow>();
  const results: Array<{ mint: string; symbol: string; net_usd: number; closed_at: string }> = [];
  const chronological = [...trades].sort((a, b) => {
    const left = Date.parse(a.ts);
    const right = Date.parse(b.ts);
    if (!Number.isFinite(left) && !Number.isFinite(right)) return 0;
    if (!Number.isFinite(left)) return 1;
    if (!Number.isFinite(right)) return -1;
    return left - right;
  });
  for (const trade of chronological) {
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
  universe: Array<{ symbol: string; mint: string }> = UNIVERSE,
): { mint: string; symbol: string; pct: number; minutes: number } | null {
  let best: { mint: string; symbol: string; pct: number; minutes: number } | null = null;
  for (const { symbol, mint } of universe) {
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

/** Mark BP timing vetoes once their 30-minute counterfactual is observable. */
export function processVetoWatches(
  store: ReturnType<typeof autopilotStore>,
  prices: Map<string, number>,
  nowMs: number,
): number {
  let marked = 0;
  for (const watch of store.openVetoWatches()) {
    const vetoMs = Date.parse(watch.ts);
    const price = prices.get(watch.mint);
    if (!Number.isFinite(vetoMs) || nowMs - vetoMs < 30 * 60_000 || price === undefined) continue;
    store.updateVetoWatch({ ...watch, mark_30m_usd: price, done: true });
    marked += 1;
  }
  return marked;
}

// priceSeriesFromHistory moved to v3/candidate-store.ts — it now also feeds
// the wallet report cards, so it lives with PriceObservation.

// --- IO shell -----------------------------------------------------------------

const PRICE_URL = "https://lite-api.jup.ag/price/v3?ids=";
const PRICE_BACKOFF_MS = 90_000; // sit out after a 429 instead of hammering

export async function fetchPrices(
  extraMints: string[] = [],
  doFetch: FetchLike = fetch,
): Promise<Map<string, number>> {
  // Held off-universe tokens (promoted V3 entries) ride along in the same
  // call: a position that cannot price cannot exit, so its mint must always
  // be quoted for as long as it is held.
  const mints = [...new Set([...UNIVERSE.map((asset) => asset.mint), ...extraMints])];
  const ids = mints.join(",");
  const response = await doFetch(`${PRICE_URL}${ids}`, { headers: { Accept: "application/json" } });
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

/** Daily impure shell around the pure Tier B selector. It persists first
 * sightings, resolves/cache-mints through the guarded RPC path, records every
 * rotation, and leaves dropped open positions priced but exit-only. */
export async function rotateTierB(
  store: AutopilotStore,
  trending: TrendingToken[],
  positions: BotPositionRow[],
  nowMs: number,
  resolveDecimals: (mint: string) => Promise<number | null> = (mint) => fetchMintDecimals(mint),
): Promise<TierBSelection | null> {
  if (trending.length === 0) return null; // API failure is not a rug signal.

  const nowIso = new Date(nowMs).toISOString();
  const firstSeen = store.tierBFirstSeen();
  for (const token of trending) firstSeen[token.mint] ??= nowIso;
  const boundedFirstSeen = Object.fromEntries(
    Object.entries(firstSeen)
      .sort((a, b) => Date.parse(b[1]) - Date.parse(a[1]))
      .slice(0, 5_000),
  );
  store.setTierBFirstSeen(boundedFirstSeen);

  const current = store.tierB();
  const currentMints = new Set(current.map((token) => token.mint));
  const denylist = new Set(store.tierBDenylist());
  const mintMeta = store.mintMeta();
  const candidates: TierBCandidate[] = [];
  for (const token of trending) {
    const firstSeenTs = boundedFirstSeen[token.mint] ?? nowIso;
    let decimals = decimalsFor(token.mint, mintMeta);
    const oldEnough = nowMs - Date.parse(firstSeenTs) >= DEFAULT_TIER_B_CONFIG.min_age_days * 24 * 60 * 60_000;
    const clearsEntryMetrics =
      (token.liquidity_usd ?? 0) >= DEFAULT_TIER_B_CONFIG.min_liquidity_usd &&
      (token.volume_h24_usd ?? 0) >= DEFAULT_TIER_B_CONFIG.min_volume_h24_usd;
    if (decimals === null && (currentMints.has(token.mint) || (oldEnough && clearsEntryMetrics)) && !denylist.has(token.mint)) {
      decimals = await resolveDecimals(token.mint);
      if (decimals !== null) {
        const row = { mint: token.mint, symbol: token.symbol, decimals, resolved_at: nowIso };
        store.upsertMintMeta(row);
        mintMeta.push(row);
      }
    }
    candidates.push({ ...token, first_seen_ts: firstSeenTs, decimals });
  }

  const selection = selectTierB(current, candidates, denylist, DEFAULT_TIER_B_CONFIG, nowMs);
  store.setTierB(selection.next);
  store.setTierBLastRotationAt(nowIso);

  const held = new Set(positions.map((position) => position.mint));
  for (const token of selection.added) {
    const message = `Tier B added ${token.symbol}: liquidity $${Math.round(token.liquidity_usd).toLocaleString()}, volume $${Math.round(token.volume_h24_usd).toLocaleString()}.`;
    store.appendActivity("tier-b", message);
    notifyOperator("v3", message);
  }
  for (const { token, reason } of selection.dropped) {
    const exitOnly = held.has(token.mint) ? " Open position remains priced and exit-only." : "";
    const message = `Tier B dropped ${token.symbol}: ${reason}.${exitOnly}`;
    store.appendActivity("tier-b", message);
    notifyOperator("v3", message);
  }
  return selection;
}

export async function runCexGapScout(input: {
  store: AutopilotStore;
  universe: TradableAsset[];
  prices: Map<string, number>;
  now_ms: number;
  quote: (mint: string, side: "buy" | "sell", notionalUsd: number, options: { price?: number | null; tier?: "A" | "B" }) => Promise<ExecutionQuote | null>;
  probe?: typeof probeCexListing;
  coinbaseTicker?: typeof fetchCoinbaseTicker;
  krakenTickers?: typeof fetchKrakenTickers;
}): Promise<number> {
  const nowIso = new Date(input.now_ms).toISOString();
  const listings = input.store.cexListings();
  const venues: CexVenue[] = ["coinbase", "kraken"];
  const probes: Array<Promise<void>> = [];
  for (const asset of input.universe) for (const venue of venues) {
    const key = `${venue}:${asset.symbol}`; const prior = listings[key];
    if (prior && input.now_ms - Date.parse(prior.checked_at) < 24 * 60 * 60_000) continue;
    probes.push((input.probe ?? probeCexListing)(asset.symbol, venue).then((result) => {
      listings[key] = { symbol: asset.symbol, venue, pair: result.pair, listed: result.listed, checked_at: nowIso };
    }));
  }
  await Promise.all(probes);
  input.store.setCexListings(listings);
  const listedSymbols = new Set(input.universe.filter((asset) => Object.values(listings).some((row) => row.listed && row.symbol === asset.symbol)).slice(0, 10).map((asset) => asset.symbol));
  const scoutUniverse = input.universe.filter((asset) => listedSymbols.has(asset.symbol));
  const listed = Object.values(listings).filter((row) => row.listed && listedSymbols.has(row.symbol));
  const krakenBooks = await (input.krakenTickers ?? fetchKrakenTickers)(listed.filter((row) => row.venue === "kraken").map((row) => row.pair));
  let written = 0;
  for (const asset of scoutUniverse) {
    const reference = input.prices.get(asset.mint); if (!reference) continue;
    const assetListings = listed.filter((row) => row.symbol === asset.symbol); if (!assetListings.length) continue;
    const [buy, sell] = await Promise.all([
      input.quote(asset.mint, "buy", 200, { price: reference, tier: asset.tier }),
      input.quote(asset.mint, "sell", 200, { price: reference, tier: asset.tier }),
    ]);
    if (!buy || !sell) continue;
    for (const listing of assetListings) {
      const book = listing.venue === "coinbase" ? (await (input.coinbaseTicker ?? fetchCoinbaseTicker)(listing.pair)).book : krakenBooks.get(listing.pair) ?? null;
      if (!book) continue;
      const observations = cexGapObservations({
        ts: nowIso, symbol: asset.symbol, venue: listing.venue, pair: listing.pair, book,
        jup_buy_eff: buy.price_usd, jup_sell_eff: sell.price_usd,
        jup_buy_cost_bps: buy.cost.total_bps, jup_sell_cost_bps: sell.cost.total_bps,
      });
      for (const row of observations) { input.store.appendCexGapObservation(row); written += 1; }
    }
  }
  return written;
}

export type CusumEventQuoteRequest = {
  mint: string;
  side: "buy" | "sell";
  notional_usd: number;
  qty?: number;
  price: number;
  tier: "A" | "B";
};

/**
 * Turn an actionable spot CUSUM event into the quote request its bypass pass
 * needs. Unheld down events are Drift-shadow observations and deliberately
 * have no Jupiter spot quote. Pure for reachability/boundary tests.
 */
export function cusumEventQuoteRequest(input: {
  asset: TradableAsset;
  event: CusumEvent;
  position: BotPositionRow | null;
  price: number | null;
  max_trade_usd: number;
}): CusumEventQuoteRequest | null {
  if (input.price === null || !Number.isFinite(input.price) || input.price <= 0) return null;
  if (input.event.direction === "up") {
    return {
      mint: input.asset.mint,
      side: "buy",
      notional_usd: Math.min(input.max_trade_usd, input.asset.tier === "B" ? 15 : 25),
      price: input.price,
      tier: input.asset.tier,
    };
  }
  if (!input.position || !Number.isFinite(input.position.qty) || input.position.qty <= 0) return null;
  return {
    mint: input.asset.mint,
    side: "sell",
    notional_usd: input.position.qty * input.price,
    qty: input.position.qty,
    price: input.price,
    tier: input.asset.tier,
  };
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
  cusumStates: Map<string, CusumState>;
  cusumThresholds: Map<string, { h_pct: number; sigma_daily_pct: number | null; computed_at_ms: number }>;
  lastExecutionCostByMint: Map<string, ExecutionCost>;
  barStates: Map<string, BarBuilderState>;
  bpDeferredBarByMint: Map<string, number>;
  bpBypassBarByMint: Map<string, number>;
  lastCexScoutMs: number;
  cexScoutRunning: boolean;
  lastFundingByMint: Map<string, FundingInput>;
  lastMlWarningMs: number;
  cusumObservationStartedAtMs: number;
  lastCusumRateCheckMs: number;
  /** CUSUM events waiting for an exact response from the out-of-process ML
   * scorer. The queue survives ticks (but never a daemon restart), and every
   * item expires to the rule path after the signal freshness window. */
  pendingMlCusumEvents: Map<string, {
    mint: string;
    event: CusumEvent & { h_pct: number; sigma_daily_pct: number | null };
  }>;
};

async function tick(context: TickContext): Promise<void> {
  const tSignalMs = Date.now();
  const store = autopilotStore();
  // Heartbeat first, before any gate: it proves the daemon PROCESS is alive
  // even while the bot itself is halted or off. The patch stays minimal
  // ({ last_tick_at } only) because the Next server does read-modify-write on
  // the same JSON file — a small patch shrinks the race window.
  store.updateBotState({ last_tick_at: new Date().toISOString() });
  const state = store.botState();
  if (!state.kill_switch && state.mode === "off") {
    const nowMs = Date.now();
    const summary = summarizeCexGaps(store.cexGapObservations(), store.cexGapWeeklyAggregates());
    const cadenceMs = summary.cadence === "monthly" ? 30 * 24 * 60 * 60_000 : 5 * 60_000;
    if (!context.cexScoutRunning && nowMs - context.lastCexScoutMs >= cadenceMs) {
      context.lastCexScoutMs = nowMs; context.cexScoutRunning = true;
      // Read-only measurement remains alive while trading is off. This block
      // has no policy/executor/ledger path and still returns before decisions.
      void (async () => {
        const denylist = new Set(store.tierBDenylist());
        const tierB = store.tierB().filter((token) => !denylist.has(token.mint));
        const universe = buildTradableUniverse(tierB, store.mintMeta());
        const prices = await fetchPrices(tierB.map((token) => token.mint));
        const mintMeta = store.mintMeta(); const rehearsals = store.rehearsals(2_000);
        return runCexGapScout({
          store, universe, prices, now_ms: nowMs,
          quote: (mint, side, notionalUsd, options) => fetchExecutionQuote({
            mint, side, notional_usd: notionalUsd, reference_price_usd: options.price,
            mint_meta: mintMeta, rehearsals, tier: options.tier ?? "A", now_ms: nowMs,
          }),
        });
      })().then((written) => { if (written > 0) store.appendActivity("cex-gap", `CEX gap scout recorded ${written} fee-adjusted direction observations while trading was off.`); })
        .catch((error: unknown) => store.appendActivity("error", `CEX gap scout degraded: ${error instanceof Error ? error.message : String(error)}`))
        .finally(() => { context.cexScoutRunning = false; });
    }
    return;
  }
  if (state.kill_switch || (state.mode !== "paper" && state.mode !== "live")) return; // hard gate before ANY action
  const isLive = state.mode === "live";
  const tierBDenylistAtTick = new Set(store.tierBDenylist());
  const tierBAtTick = store.tierB().filter((token) => !tierBDenylistAtTick.has(token.mint));
  const tradableUniverse = buildTradableUniverse(tierBAtTick, store.mintMeta());

  const nowMs = Date.now();
  if (nowMs < context.priceBackoffUntilMs) return; // rate-limited: sit out

  let prices: Map<string, number>;
  try {
    prices = await fetchPrices([
      ...tierBAtTick.map((token) => token.mint),
      ...store.positions().map((position) => position.mint),
    ]);
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
  for (const asset of tradableUniverse) {
    const price = prices.get(asset.mint);
    if (price === undefined) continue;
    const barState = context.barStates.get(asset.mint) ?? initialBarBuilderState();
    context.barStates.set(asset.mint, barState);
    barStep(barState, price, nowMs);
  }

  // Information-driven sampling: every fetched close advances one owned
  // per-mint CUSUM state. Volatility anchors come only from persisted 5-minute
  // bars and refresh at most hourly; no network work is introduced here.
  const cusumEvents = new Map<string, CusumEvent & { h_pct: number; sigma_daily_pct: number | null }>();
  let cusumHistory: ReturnType<AutopilotStore["priceHistory"]> | null = null;
  for (const asset of tradableUniverse) {
    const price = prices.get(asset.mint);
    if (price === undefined) continue;
    let threshold = context.cusumThresholds.get(asset.mint);
    if (!threshold || nowMs - threshold.computed_at_ms >= 60 * 60_000) {
      cusumHistory ??= store.priceHistory();
      const historyPrices = cusumHistory
        .slice(-289)
        .map((row) => row.prices[asset.mint])
        .filter((value): value is number => Number.isFinite(value) && value > 0);
      const sigmaDailyPct = ewmaDailySigmaPct(historyPrices);
      threshold = { h_pct: cusumThresholdPct(sigmaDailyPct), sigma_daily_pct: sigmaDailyPct, computed_at_ms: nowMs };
      context.cusumThresholds.set(asset.mint, threshold);
    }
    const newestPersisted = cusumHistory?.at(-1)?.prices[asset.mint] ?? 0;
    const state = context.cusumStates.get(asset.mint) ?? initialCusumState(newestPersisted);
    context.cusumStates.set(asset.mint, state);
    const event = cusumStep(state, price, threshold.h_pct, nowMs);
    if (event) {
      cusumEvents.set(asset.mint, { ...event, h_pct: threshold.h_pct, sigma_daily_pct: threshold.sigma_daily_pct });
      store.appendCusumEventObservation({
        ...event,
        ts: new Date(event.ts_ms).toISOString(),
        mint: asset.mint,
        symbol: asset.symbol,
        h_pct: threshold.h_pct,
        sigma_daily_pct: threshold.sigma_daily_pct,
      });
    }
  }

  // The deterministic fixture is not evidence that live cadence is in-band.
  // Check durable paper observations every 30 minutes after a six-hour floor;
  // warn above the written 5/day ceiling, but never retune automatically.
  if (nowMs - context.lastCusumRateCheckMs >= 30 * 60_000) {
    context.lastCusumRateCheckMs = nowMs;
    const highRates = cusumMintRates(
      store.cusumEventObservations(),
      context.cusumObservationStartedAtMs,
      nowMs,
    ).filter((row) => row.events_per_day > 5);
    const priorWarning = store.activity(400).find((row) => row.kind === "cusum-rate");
    if (highRates.length > 0 && (!priorWarning || nowMs - Date.parse(priorWarning.ts) >= 6 * 60 * 60_000)) {
      store.appendActivity(
        "cusum-rate",
        `CUSUM live cadence above the 5/day observation band: ${highRates.map((row) => `${row.symbol} ${row.events_per_day.toFixed(1)}/day (${row.event_count} events/${(row.span_ms / 3_600_000).toFixed(1)}h)`).join(", ")}. Warning only; no automatic threshold change.`,
      );
    }
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

  const feedRows = await fetchMarketFeed(nowMs, tradableUniverse); // 60s cache is keyed by the active universe
  const feed = new Map(feedRows.map((row) => [row.symbol, row]));
  const barMetricsByMint = new Map<string, { bp: number | null; atr_bps: number | null; ema_close: number | null }>();
  for (const asset of tradableUniverse) {
    const barState = context.barStates.get(asset.mint);
    if (!barState) continue;
    barMetricsByMint.set(asset.mint, {
      bp: barState.closed.length > 0 ? barPortion(barState.closed.at(-1)!) : null,
      atr_bps: atrBps(barState.closed),
      ema_close: emaClose(barState.closed),
    });
  }
  const params = store.strategyParams();
  const rehearsalRows = store.rehearsals(2_000);
  const mintMetaRows = store.mintMeta();
  const executionQuotes = new Map<string, ExecutionQuote>();
  const quoteKey = (mint: string, side: "buy" | "sell") => `${side}:${mint}`;
  const quoteFor = async (
    mint: string,
    side: "buy" | "sell",
    notionalUsd: number,
    options: { qty?: number | null; price?: number | null; tier?: "A" | "B"; force?: boolean } = {},
  ): Promise<ExecutionQuote | null> => {
    const quote = await fetchExecutionQuote({
      mint,
      side,
      notional_usd: notionalUsd,
      qty: options.qty,
      reference_price_usd: options.price,
      mint_meta: mintMetaRows,
      rehearsals: rehearsalRows,
      tier: options.tier ?? "A",
      now_ms: Date.now(),
      force_refresh: options.force ?? false,
    });
    if (quote) executionQuotes.set(quoteKey(mint, side), quote);
    return quote;
  };
  const cexSummary = summarizeCexGaps(store.cexGapObservations(), store.cexGapWeeklyAggregates());
  const cexCadenceMs = cexSummary.cadence === "monthly" ? 30 * 24 * 60 * 60_000 : 5 * 60_000;
  if (!context.cexScoutRunning && nowMs - context.lastCexScoutMs >= cexCadenceMs) {
    context.lastCexScoutMs = nowMs;
    context.cexScoutRunning = true;
    // Measurement only and deliberately detached: venue hiccups cannot add a
    // millisecond to the strategy/policy/executor hot path.
    void runCexGapScout({ store, universe: tradableUniverse, prices, now_ms: nowMs, quote: quoteFor })
      .then((written) => { if (written > 0) store.appendActivity("cex-gap", `CEX gap scout recorded ${written} fee-adjusted direction observations.`); })
      .catch((error: unknown) => store.appendActivity("error", `CEX gap scout degraded: ${error instanceof Error ? error.message : String(error)}`))
      .finally(() => { context.cexScoutRunning = false; });
  }
  const roundTrips = realizedRoundTrips(modeTrades);
  const streak = lossStreak(roundTrips);
  const tradesToday = modeTrades.filter((trade) => trade.side === "buy" && trade.ts.slice(0, 10) === today).length;
  const lastEntryMs = modeTrades
    .filter((trade) => trade.side === "buy")
    .reduce<number | null>((latest, trade) => {
      const ms = Date.parse(trade.ts);
      return Number.isFinite(ms) && (latest === null || ms > latest) ? ms : latest;
    }, null);

  // Post-exit counterfactuals: stamp due marks on open watches from live
  // prices, and flag loss exits that recovered (a "premature stop" lesson).
  processExitWatches(store, prices, nowMs);
  processVetoWatches(store, prices, nowMs);

  // Persist the V3 learning substrate once per minute: a combined minute bar
  // of every mint's price (restart-proof forward labeling + r_4h features)
  // and the per-mint 24h-volume EMA baseline behind xsec's volume_z.
  // Five-minute bars (runway audit): at 1/min the capped history spanned 15
  // hours — too short for the gate's SOL benchmark. 5-minute bars × the raised
  // cap span ~7 days, and every consumer (forward labels at +30m/2h/6h, r_4h,
  // wallet report cards with 15m tolerance) is comfortably coarser than 5m.
  if (nowMs - context.lastPriceBarMs >= 5 * 60_000 && prices.size > 0) {
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
    for (const asset of tradableUniverse) {
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
  const promotionForStrategy = (strategyId: CandidateSignal["strategy_id"]) => {
    const snapshots = store.candidateSnapshots(2_000);
    const promotion = evaluateV3Promotion(calibrateStrategy(paperPromotionSnapshots(snapshots, strategyId), strategyId), store.replayConfirmation(strategyId));
    const previous = store.v3Promotion(strategyId);
    if (!previous) {
      store.setV3Promotion(strategyId, { ready: false, eligible: promotion.ready, ts: new Date(nowMs).toISOString(), operator_confirmed_at: null });
    } else if (previous.eligible !== promotion.ready) {
      store.setV3Promotion(strategyId, { ...previous, eligible: promotion.ready, ts: new Date(nowMs).toISOString() });
      const transition = promotion.ready
        ? `V3 ${strategyId} is ELIGIBLE for paper promotion; awaiting explicit operator confirmation.`
        : `V3 ${strategyId} promotion eligibility closed: ${promotion.checks.filter((check) => !check.pass).map((check) => check.detail).join("; ")}.`;
      store.appendActivity("v3-shadow", transition);
      notifyOperator("v3", transition);
    }
    return store.v3Promotion(strategyId)?.ready ?? false;
  };
  const stagePromotedTop = (shadow: ReturnType<typeof evaluateV3Shadow>, priceByMint: Map<string, number>) => {
    if (state.mode !== "paper") return;
    const top = shadow.route.ranked[0] ?? null;
    if (!top || (top.side !== "buy" && top.side !== "sell")) return;
    if (!isPaperCopilotCandidate(top)) return;
    if (!promotionForStrategy(top.strategy_id)) return;
    const topPrice = priceByMint.get(top.token_mint);
    if (topPrice === undefined) return;
    const held = store.positions().some((position) => position.mint === top.token_mint);
    if (top.side === "buy" && (!held && nowMs >= (context.cooldownUntilMs.get(top.token_mint) ?? 0))) {
      if (
        v3PaperCandidate === null ||
        (v3PaperCandidate.signal.side !== "sell" && top.expected_value_bps > v3PaperCandidate.signal.expected_value_bps)
      ) v3PaperCandidate = { signal: top, price: topPrice };
    } else if (top.side === "sell" && held) {
      v3PaperCandidate = { signal: top, price: topPrice };
    }
  };

  const regularShadowDue = nowMs - context.lastV3ShadowMs >= 5 * 60_000;
  if (cusumEvents.size > 0 || context.pendingMlCusumEvents.size > 0) {
    try {
      for (const [mint, event] of cusumEvents) {
        const key = mlSignalKey(mint, event.ts_ms);
        if (context.pendingMlCusumEvents.has(key)) continue;
        context.pendingMlCusumEvents.set(key, { mint, event });
        if (!appendMlEventRequest({ mint, event_ts: event.ts_ms }) && nowMs - context.lastMlWarningMs >= 6 * 60 * 60_000) {
          context.lastMlWarningMs = nowMs;
          store.appendActivity("error", "CUSUM ML event request could not be appended; safely using the rule-based path.");
        }
      }
      const mlState = loadMlSignalState({
        snapshots: store.candidateSnapshots(2_000),
        cusum_evidence_range: store.v3StrategyEvidenceRange("cusum_tb"),
        now_ms: nowMs,
      });
      const resolvedEvents = new Map<string, CusumEvent & { h_pct: number; sigma_daily_pct: number | null }>();
      const mlSignals = new Map<string, FreshMlSignal>();
      const pending = [...context.pendingMlCusumEvents.entries()]
        .sort(([, left], [, right]) => left.event.ts_ms - right.event.ts_ms);
      for (const [key, { mint, event }] of pending) {
        // The shadow evaluator owns one event per mint. Preserve later events
        // for the next tick instead of silently overwriting the first.
        if (resolvedEvents.has(mint)) continue;
        const resolution = resolveMlEvent(mlState, mint, event.ts_ms, nowMs);
        if (resolution.decision === "wait") continue;
        resolvedEvents.set(mint, event);
        context.pendingMlCusumEvents.delete(key);
        if (resolution.decision === "signal") mlSignals.set(key, resolution.signal);
      }
      if (mlSignalsDegraded(mlState, nowMs) && nowMs - context.lastMlWarningMs >= 6 * 60 * 60_000) {
        context.lastMlWarningMs = nowMs;
        store.appendActivity("error", "CUSUM ML signals are over one hour stale while events are flowing; safely using the rule-based path.");
      }
      if (resolvedEvents.size > 0) {
        const eventCosts = new Map<string, ExecutionCost>();
        await Promise.all([...resolvedEvents.entries()].map(async ([mint, event]) => {
        const asset = tradableUniverse.find((row) => row.mint === mint);
        if (!asset) return;
        const request = cusumEventQuoteRequest({
          asset,
          event,
          position: store.positions().find((row) => row.mint === mint) ?? null,
          price: prices.get(mint) ?? null,
          max_trade_usd: state.caps.max_trade_usd,
        });
        if (!request) return;
        const quote = await quoteFor(request.mint, request.side, request.notional_usd, {
          qty: request.qty,
          price: request.price,
          tier: request.tier,
        });
        if (!quote) return;
        eventCosts.set(mint, quote.cost);
        context.lastExecutionCostByMint.set(mint, quote.cost);
        }));
        const costByMint = new Map(tradableUniverse.map((asset) => [
        asset.mint,
        eventCosts.get(asset.mint)
          ?? context.lastExecutionCostByMint.get(asset.mint)
          ?? (asset.tier === "A" ? conservativeCost() : memecoinConservativeCost()),
        ]));
        const history = store.priceHistory();
        const shadow = evaluateV3Shadow({
        universe: tradableUniverse,
        windows: context.windows,
        feed,
        costByMint,
        priceHistory: history,
        volumeBaselineByMint: new Map(Object.entries(store.volumeBaselines())),
        cusumEvents: resolvedEvents,
        mlSignals,
        heldMints: new Set(store.positions().map((position) => position.mint)),
        cusumEdgeRatio: store.cusumEdgeRatio().value,
        fundingByMint: context.lastFundingByMint,
        });
        const note = recordV3Shadow(store, shadow, prices);
        if (note) store.appendActivity("v3-shadow", `${note} (CUSUM event bypass)`);
        labelDueCandidates(store, priceSeriesFromHistory(history), nowMs);
        stagePromotedTop(shadow, prices);
      }
    } catch (error) {
      store.appendActivity("error", `CUSUM event shadow failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (regularShadowDue) {
    try {
      const costByMint = new Map(
        tradableUniverse.map((asset) => [
          asset.mint,
          asset.tier === "A" ? conservativeCost() : memecoinConservativeCost(),
        ]),
      );
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
      context.lastFundingByMint = new Map(fundingByMint);

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
        // Metered: the SolanaTracker leaderboard call only fires when this
        // month's soft-stop (90% of the account's stated 2,500/month) hasn't
        // been reached — twice-daily refreshes cost ~60/month, so this is
        // headroom for the tier changing or future calls, not a live risk.
        const budgetConfig = solanaTrackerBudget();
        const budgetBefore = checkBudget(store.apiBudget(budgetConfig.service), budgetConfig, nowMs);
        const suggestions = await fetchWalletSuggestions({
          trendingPools: context.lastTrending
            .map((token) => token.pool_address)
            .filter((pool): pool is string => Boolean(pool)),
          nowMs,
          budgetAllows: budgetBefore.allowed,
          onLeaderboardCall: () => {
            const updated = recordUsage(store.apiBudget(budgetConfig.service), nowMs);
            store.setApiBudget(budgetConfig.service, updated);
            const after = checkBudget(updated, budgetConfig, nowMs);
            const crossed = crossedAlertThreshold(budgetBefore.fraction_used, after.fraction_used);
            if (crossed !== null) {
              const message = `SolanaTracker API budget at ${Math.round(crossed * 100)}%: ${after.used}/${after.limit} requests this month.`;
              store.appendActivity("copy", message);
              notifyOperator("v3", message);
            }
          },
        });
        if (!budgetBefore.allowed && budgetBefore.reason) {
          store.appendActivity("copy", budgetBefore.reason);
        }
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
        // Guarded resolution: background polling must never silently burn
        // Helius credits — a Helius SOLANA_RPC_URL only applies when the
        // credit firewall is explicitly enabled (src/helius/rpc-url.ts).
        const scan = await scanWatchedWallets(watched, store.smartWalletCursors(), resolveGuardedRpcUrl());
        store.setSmartWalletCursors(scan.cursors);
        const eventsByMint = new Map<string, WalletBuyEvent[]>();
        for (const event of scan.events) {
          store.appendWalletBuy(event); // the raw record the report cards grade
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
      const shadowInput = {
        universe: tradableUniverse,
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
        barMetricsByMint,
        barPortionEdgeRatio: store.barPortionEdgeRatio().value,
        heldMints: new Set(store.positions().map((position) => position.mint)),
      };
      let shadow = evaluateV3Shadow(shadowInput);

      // Quote budget: only the three strongest router candidates get venue
      // costs. A first conservative pass chooses them; the second pass reranks
      // with measured costs. Composite perp/atomic sides keep their dedicated
      // conservative model until their venue adapters expose executable legs.
      const quoteTargets = [...shadow.candidates]
        .filter((candidate) => candidate.side === "buy" || candidate.side === "sell")
        .sort((a, b) => b.expected_value_bps - a.expected_value_bps)
        .filter((candidate, index, all) => all.findIndex((row) => row.token_mint === candidate.token_mint) === index)
        .slice(0, 3);
      for (const candidate of quoteTargets) {
        if (decimalsFor(candidate.token_mint, mintMetaRows) === null) {
          const decimals = await fetchMintDecimals(candidate.token_mint);
          if (decimals !== null) {
            const row = { mint: candidate.token_mint, symbol: candidate.symbol, decimals, resolved_at: new Date(nowMs).toISOString() };
            store.upsertMintMeta(row);
            mintMetaRows.push(row);
          }
        }
        const asset = tradableUniverse.find((row) => row.mint === candidate.token_mint);
        const position = store.positions().find((row) => row.mint === candidate.token_mint);
        const side = candidate.side as "buy" | "sell";
        const plannedNotional = asset?.tier === "A"
          ? Math.max(5, Math.min(state.caps.max_trade_usd, cash * 0.25))
          : 15;
        const quote = await quoteFor(
          candidate.token_mint,
          side,
          side === "sell" && position ? position.qty * (prices.get(position.mint) ?? position.avg_cost_usd) : plannedNotional,
          { qty: position?.qty, price: prices.get(candidate.token_mint), tier: asset?.tier ?? "B" },
        );
        if (quote) costByMint.set(candidate.token_mint, quote.cost);
      }
      context.lastExecutionCostByMint = new Map(costByMint);
      if (executionQuotes.size > 0) {
        for (const [mint, input] of fundingByMint) {
          const quote = executionQuotes.get(quoteKey(mint, "buy"));
          if (quote) fundingByMint.set(mint, { ...input, cost: quote.cost });
        }
        const modeledCopyCandidates = copyCandidates.map((candidate) => {
          const quote = executionQuotes.get(quoteKey(candidate.token_mint, candidate.side === "sell" ? "sell" : "buy"));
          return quote ? { ...candidate, cost: quote.cost, expected_value_bps: toExpectedValue(candidate.expected_return_bps, quote.cost) } : candidate;
        });
        shadow = evaluateV3Shadow({ ...shadowInput, costByMint, fundingByMint, copyCandidates: modeledCopyCandidates });
      }
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

      // Every strategy owns its calibration and promotion state; pooled
      // history can never promote a new module.
      for (const strategyId of new Set(store.candidateSnapshots(2_000).map((row) => row.strategy_id))) {
        promotionForStrategy(strategyId as CandidateSignal["strategy_id"]);
      }
      stagePromotedTop(shadow, snapshotPrices);
    } catch (error) {
      store.appendActivity("error", `V3 shadow failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Cost precedence is strict: fresh modeled quote, then rehearsal median,
  // then the unchanged flat assumption.
  const measuredRoundTripCostPctByMint = new Map<string, number>();
  for (const asset of tradableUniverse) {
    const measured = medianRoundTripCostPct(rehearsalRows, asset.mint);
    // A signed route-vs-paper median can be zero/negative when Jupiter beats
    // the paper assumption. That is not proof of zero execution cost, so the
    // decision core conservatively retains the flat fallback in that case.
    if (measured !== null && Number.isFinite(measured) && measured > 0) {
      measuredRoundTripCostPctByMint.set(asset.mint, measured);
    }
  }

  const modeledRoundTripCostPctByMint = new Map<string, number>();
  for (const quote of executionQuotes.values()) {
    modeledRoundTripCostPctByMint.set(quote.mint, quote.cost.total_bps / 100);
  }
  const decisionInput: DecisionInput = {
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
    last_entry_ms: lastEntryMs,
    params,
    measuredRoundTripCostPctByMint,
    modeledRoundTripCostPctByMint,
    universe: tradableUniverse,
    // Canary week: the first CANARY_WINDOW_MS of live mode pins entry size.
    live_canary: isLive && state.started_at !== null && nowMs - Date.parse(state.started_at) < CANARY_WINDOW_MS,
  };
  let { decisions, skipped, evaluations } = decide(decisionInput);

  // V2 is also quote-first, but only after its cheap gates identify the one
  // entry candidate. Rerun the pure core with that mint's modeled cost so a
  // thin route can veto the trade before an intent exists.
  const v2Entry = decisions.find((decision) => decision.action === "buy");
  if (v2Entry) {
    const asset = tradableUniverse.find((row) => row.mint === v2Entry.mint);
    const existingQuote = executionQuotes.get(quoteKey(v2Entry.mint, "buy"));
    const quote = existingQuote && Math.abs(existingQuote.value_usd - v2Entry.value_usd) < 0.001 ? existingQuote : await quoteFor(
      v2Entry.mint,
      "buy",
      v2Entry.value_usd,
      { price: v2Entry.price, tier: asset?.tier ?? "A" },
    );
    if (quote) {
      modeledRoundTripCostPctByMint.set(v2Entry.mint, quote.cost.total_bps / 100);
      ({ decisions, skipped, evaluations } = decide({ ...decisionInput, modeledRoundTripCostPctByMint }));
    }
  }

  // Persist this tick's per-symbol verdicts so the panel can show the strategy
  // working in real time (strategy-legibility slice, 2026-07-09).
  store.setLastEvaluations({ ts: new Date(nowMs).toISOString(), mode: state.mode, evaluations });

  // Promoted V3 co-pilot entry (paper only, one entry per tick total): the
  // candidate rides the same policy → executor path as any v2 decision, and
  // v2's exit engine (stop / take-profit / trail / time) manages the position.
  const v3EntryMints = new Set<string>();
  const v3SignalByMint = new Map<string, CandidateSignal>();
  if (
    v3PaperCandidate &&
    !isLive &&
    (
      (v3PaperCandidate.signal.side === "buy" && !decisions.some((decision) => decision.action === "buy")) ||
      (v3PaperCandidate.signal.side === "sell" && !decisions.some((decision) => decision.action === "sell" && decision.mint === v3PaperCandidate?.signal.token_mint))
    )
  ) {
    const { signal, price } = v3PaperCandidate;
    const num = (value: unknown): number | null =>
      typeof value === "number" && Number.isFinite(value) ? value : null;
    const barrierPct = (num(signal.features.barrier_bps) ?? signal.max_loss_bps) / 100;
    const usesExplicitBarrier = signal.strategy_id === "cusum_tb" || signal.strategy_id === "bar_portion";
    const stopPct = usesExplicitBarrier
      ? barrierPct
      : Math.min(params.max_stop_pct, Math.max(params.min_stop_pct, signal.max_loss_bps / 100));
    const promotedQuote = executionQuotes.get(quoteKey(signal.token_mint, signal.side === "sell" ? "sell" : "buy"));
    const isTierA = signal.features.tier === "A";
    const promotedSignals: DecisionSignals = {
      price_usd: price,
      short_pct: null,
      range_pct: null,
      h1_pct: num(signal.features.h1_pct ?? signal.features.r_1h_pct),
      h24_pct: num(signal.features.h24_pct ?? signal.features.r_24h_pct),
      volume_h24_usd: num(signal.features.volume_h24_usd),
      liquidity_usd: signal.liquidity_usd,
      round_trip_cost_pct: signal.cost.total_bps / 100,
      cost_source: promotedQuote ? "modeled" : "flat",
    };
    if (signal.side === "sell") {
      decisions.push({
        action: "sell", mint: signal.token_mint, symbol: signal.symbol, price,
        reason: `V3 ${signal.strategy_id}: ${signal.reason}`, signals: promotedSignals, strategy_id: signal.strategy_id,
      });
    } else {
      decisions.push({
        action: "buy",
        mint: signal.token_mint,
        symbol: signal.symbol,
        price,
        value_usd: isTierA
          ? Math.max(5, Math.min(state.caps.max_trade_usd, cash * 0.25))
          : Math.min(15, Math.max(5, Math.min(state.caps.max_trade_usd, cash * 0.25))),
        stop_pct: stopPct,
        ...(usesExplicitBarrier ? {
          tp_pct: barrierPct,
          deadline_ts: new Date(nowMs + (signal.strategy_id === "bar_portion" ? 30 * 60_000 : 24 * 60 * 60_000)).toISOString(),
        } : {}),
        reason: `V3 ${signal.strategy_id}: ${signal.reason}`,
        signals: promotedSignals,
        strategy_id: signal.strategy_id,
      });
    }
    v3EntryMints.add(signal.token_mint);
    v3SignalByMint.set(signal.token_mint, signal);
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
    ? jupiterLiveExecutor({
        dry_run: false,
        reserve_floor_sol: state.caps.reserve_floor_sol,
        mint_meta: store.mintMeta(),
      })
    : paperExecutor({
        feeRateForMint: paperFeeRateFor,
        fillFor: (intent) => {
          const quote = executionQuotes.get(quoteKey(intent.mint, intent.action));
          return quote && Date.now() - quote.quote_ts_ms < 30_000
            ? { price_usd: quote.price_usd, fee_usd: quote.fee_usd }
            : null;
        },
      });
  const tierBMintsForPolicy = new Set(tierBAtTick.map((token) => token.mint));
  const tierAMints = new Set(UNIVERSE.map((asset) => asset.mint));
  // A dropped Tier B position is no longer entry-eligible but remains inside
  // the tighter bucket until it exits. This is conservative for any other
  // off-Tier-A shadow position as well.
  for (const position of store.positions()) {
    if (!tierAMints.has(position.mint)) tierBMintsForPolicy.add(position.mint);
  }
  let freeCash = cash;
  let buysToday = tradesToday;
  let spendToday = modeTrades
    .filter((trade) => trade.side === "buy" && trade.ts.slice(0, 10) === today)
    .reduce((sum, trade) => sum + trade.value_usd, 0);
  const tDecisionMs = Date.now();

  for (const decision of decisions) {
    if (decision.action === "buy") {
      const overlay = bpEntryOverlay(
        context.barStates.get(decision.mint),
        context.bpDeferredBarByMint.get(decision.mint) ?? null,
        context.bpBypassBarByMint.get(decision.mint) ?? null,
        nowMs,
      );
      if (overlay.deferred_bar_ts_open_ms === null) context.bpDeferredBarByMint.delete(decision.mint);
      else context.bpDeferredBarByMint.set(decision.mint, overlay.deferred_bar_ts_open_ms);
      if (overlay.bypass_bar_ts_open_ms === null) context.bpBypassBarByMint.delete(decision.mint);
      else context.bpBypassBarByMint.set(decision.mint, overlay.bypass_bar_ts_open_ms);
      if (!overlay.verdict.allow) {
        const isNewVeto = overlay.bar_ts_open_ms !== null &&
          !store.openVetoWatches().some((watch) => watch.mint === decision.mint && Date.parse(watch.ts) === overlay.bar_ts_open_ms! + 5 * 60_000);
        if (isNewVeto && overlay.bp !== null) {
          const vetoSignals = { ...decision.signals, bp_deferred: true, bp: overlay.bp };
          store.appendDecision({
            symbol: decision.symbol,
            verdict: "blocked",
            reason: overlay.verdict.reason,
            signals: vetoSignals,
            features: { bp_deferred: true, bp: overlay.bp, bar_ts_open_ms: overlay.bar_ts_open_ms! },
          });
          store.appendActivity("policy", `Blocked buy ${decision.symbol}: ${overlay.verdict.reason}`);
          store.appendVetoWatch({
            ts: new Date(overlay.bar_ts_open_ms! + 5 * 60_000).toISOString(),
            mint: decision.mint,
            symbol: decision.symbol,
            price_at_veto_usd: decision.price,
            bp: overlay.bp,
          });
        }
        continue;
      }
    }
    const positionAtDecision = store.positions().find((row) => row.mint === decision.mint);
    const assetAtDecision = tradableUniverse.find((row) => row.mint === decision.mint);
    const existingDecisionQuote = executionQuotes.get(quoteKey(decision.mint, decision.action)) ?? null;
    let decisionQuote = existingDecisionQuote && (
      decision.action === "sell" || Math.abs(existingDecisionQuote.value_usd - decision.value_usd) < 0.001
    ) ? existingDecisionQuote : null;
    if (!isLive && !decisionQuote) {
      decisionQuote = await quoteFor(
        decision.mint,
        decision.action,
        decision.action === "buy" ? decision.value_usd : (positionAtDecision?.qty ?? 0) * decision.price,
        { qty: positionAtDecision?.qty, price: decision.price, tier: assetAtDecision?.tier ?? "B" },
      );
    }
    let intent = intentFromDecision(
      decision,
      store.positions(),
      isLive ? "live" : "paper",
      v3EntryMints.has(decision.mint) ? "v3-alpha-router" : "v2-trend-pullback",
      decisionQuote,
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
      tier_b_mints: tierBMintsForPolicy,
      max_tier_b_positions: MAX_TIER_B_POSITIONS,
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

    // The venue, not the display feed, is the final reference. Refresh once
    // immediately before paper execution; if a >5bp/20s refresh destroys the
    // entry's cost-adjusted edge, record the exact auditable block reason.
    if (!isLive && decisionQuote) {
      const refreshed = await quoteFor(
        intent.mint,
        intent.action,
        intent.notional_usd,
        { qty: intent.qty, price: intent.price_usd, tier: assetAtDecision?.tier ?? "B", force: true },
      );
      if (refreshed) {
        const movedOrStale = quoteNeedsRefresh(
          decisionQuote.price_usd,
          decisionQuote.quote_ts_ms,
          refreshed.price_usd,
          refreshed.quote_ts_ms,
        );
        if (movedOrStale && intent.action === "buy") {
          const edgeVerdict = requoteEntryEdgeVerdict({
            cost: refreshed.cost,
            stop_pct: intent.stop_pct ?? params.min_stop_pct,
            params,
            v3_signal: v3SignalByMint.get(intent.mint),
          });
          if (!edgeVerdict.pass) {
            store.appendDecision({ symbol: intent.symbol, verdict: "blocked", reason: edgeVerdict.reason, signals: intent.signals });
            store.appendActivity("policy", `Blocked buy ${intent.symbol}: requote: edge gone`);
            continue;
          }
        }
        decisionQuote = refreshed;
        intent = {
          ...intent,
          price_usd: refreshed.price_usd,
          notional_usd: intent.action === "sell" && intent.qty !== null ? intent.qty * refreshed.price_usd : intent.notional_usd,
          quote_price: refreshed.price_usd,
          quote_ts_ms: refreshed.quote_ts_ms,
        };
      } else if (refreshed === null && Date.now() - decisionQuote.quote_ts_ms > 20_000) {
        store.appendDecision({ symbol: intent.symbol, verdict: "blocked", reason: "requote: edge gone", signals: intent.signals });
        store.appendActivity("policy", `Blocked ${intent.action} ${intent.symbol}: stale quote could not be refreshed`);
        continue;
      }
    }
    const result = await executor.execute(intent);
    if (!result.ok) {
      store.appendActivity("error", `Executor refused ${intent.action} ${intent.symbol}: ${result.error}`);
      continue;
    }
    const fill = result.fill;
    const tFillMs = Date.now();
    const latencyFields = {
      fill_basis: isLive ? undefined : fill.fill_basis ?? "flat_fallback" as const,
      t_signal_ms: tSignalMs,
      t_decision_ms: tDecisionMs,
      t_quote_ms: decisionQuote?.quote_ts_ms,
      t_fill_ms: tFillMs,
    };

    // Fire-and-forget live-route rehearsal: quote the same swap on Jupiter and
    // log the gap vs the paper fill, so the go-live decision has real cost
    // data. Never blocks or fails the tick (rehearseFill never throws).
    if (isLive) {
      store.appendWeb3Memory({ symbol: intent.symbol, kind: "risk", summary: `LIVE fill ${intent.action} ${intent.symbol}: $${fill.value_usd.toFixed(2)} at $${fill.price_usd.toFixed(4)}${fill.signature ? ` (sig ${fill.signature.slice(0, 12)}…)` : ""}.` });
    } else void rehearseFill(intent, fill, store.mintMeta()).then((rehearsal) => {
      if (rehearsal) {
        store.appendWeb3Memory({ symbol: intent.symbol, kind: "risk", summary: describeRehearsal(rehearsal) });
        store.appendRehearsal(rehearsalRowFromSwap(
          intent.mint,
          rehearsal,
          fill.fill_basis === "quoted" ? "quoted_fill" : "flat_fallback",
        ));
      }
    });

    if (intent.action === "buy") {
      store.appendTrade({ side: "buy", mint: intent.mint, symbol: intent.symbol, qty: fill.qty, price_usd: fill.price_usd, value_usd: fill.value_usd, fee_usd: fill.fee_usd, reason: intent.reason, mode: intent.mode, signature: fill.signature, strategy_id: intent.strategy_id, ...latencyFields });
      store.upsertPosition({
        mint: intent.mint,
        symbol: intent.symbol,
        qty: fill.qty,
        avg_cost_usd: fill.price_usd,
        stop_pct: intent.stop_pct ?? MIN_STOP_PCT,
        ...(intent.tp_pct !== null && intent.tp_pct !== undefined ? { tp_pct: intent.tp_pct } : {}),
        ...(intent.deadline_ts ? { deadline_ts: intent.deadline_ts } : {}),
        peak_usd: fill.price_usd,
        opened_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        strategy_id: intent.strategy_id,
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
      const sellRow = store.appendTrade({ side: "sell", mint: intent.mint, symbol: intent.symbol, qty: fill.qty, price_usd: fill.price_usd, value_usd: fill.value_usd, fee_usd: fill.fee_usd, reason: intent.reason, mode: intent.mode, signature: fill.signature, strategy_id: intent.strategy_id ?? position.strategy_id, ...latencyFields });
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
  // ledger shows what the bot chose NOT to do and why. One row per 5 minutes:
  // the strategy card now shows every symbol's live verdict each tick, so the
  // log is the analyst's evidence trail, not the legibility surface.
  const skipLogEveryMs = 5 * 60_000;
  if (decisions.length === 0 && skipped && nowMs - context.lastSkipLogMs >= skipLogEveryMs) {
    context.lastSkipLogMs = nowMs;
    store.appendDecision({ symbol: skipped.symbol, verdict: "skip", reason: skipped.reason, signals: skipped.signals });
  }

  if (context.count % EQUITY_MARK_EVERY_TICKS === 0) {
    store.appendEquityPoint(markEquity(store.positions(), context.windows, freeCash));
  }

  // One durable row per UTC day summarizes the completed prior day. Legacy
  // rows simply do not enter the sample. Drift warnings share the daily
  // throttle and fire only after the ten-row rehearsal evidence floor.
  const previousDay = new Date(Date.UTC(
    new Date(nowMs).getUTCFullYear(),
    new Date(nowMs).getUTCMonth(),
    new Date(nowMs).getUTCDate() - 1,
  )).toISOString().slice(0, 10);
  const recentActivity = store.activity(500);
  const latencyMarker = `Execution latency ${previousDay}:`;
  if (!recentActivity.some((row) => row.kind === "execution-latency" && row.message.startsWith(latencyMarker))) {
    store.appendActivity("execution-latency", formatLatencySummary(summarizeDecisionToFill(allTrades, previousDay)));
  }
  for (const drift of modelDriftAlerts(rehearsalRows, tradableUniverse)) {
    const driftMarker = `Model drift ${today} ${drift.mint}:`;
    if (recentActivity.some((row) => row.kind === "model-drift" && row.message.startsWith(driftMarker))) continue;
    const message = `${driftMarker} ${drift.symbol} rehearsal median gap ${drift.median_gap_bps >= 0 ? "+" : ""}${drift.median_gap_bps.toFixed(2)}bp exceeds 25bp.`;
    store.appendActivity("model-drift", message);
    notifyOperator("v3", message);
  }

  // Daily Tier B rotation shares the daemon's once-a-day operating layer but
  // has its own durable marker. Empty trending data is treated as a provider
  // failure, not as evidence that every token vanished.
  if ((store.tierBLastRotationAt() ?? "").slice(0, 10) !== today && context.lastTrending.length > 0) {
    try {
      await rotateTierB(store, context.lastTrending, store.positions(), nowMs);
    } catch (error) {
      store.appendActivity("error", `Tier B rotation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // The Analyst runs once per UTC day (learning-loop plan, layer 3), fired
  // from here because the daemon is the process that is always alive. The
  // attempt is stamped BEFORE the call so a hung/failed run costs one day,
  // never a per-tick LLM loop. Fire-and-forget: a slow review must not stall
  // trading ticks.
  if ((state.last_analyst_run_at ?? "").slice(0, 10) !== today) {
    store.updateBotState({ last_analyst_run_at: new Date().toISOString() });
    const lastGapSummary = store.activity(400).find((row) => row.kind === "cex-gap-summary");
    if (!lastGapSummary || nowMs - Date.parse(lastGapSummary.ts) >= 7 * 24 * 60 * 60_000) {
      store.appendActivity("cex-gap-summary", describeCexGapSummary(summarizeCexGaps(
        store.cexGapObservations(),
        store.cexGapWeeklyAggregates(),
      )));
    }
    const promotionSnapshots = store.candidateSnapshots(2_000);
    for (const [strategyId, promotionState] of Object.entries(store.v3Promotions())) {
      if (!promotionState.ready) continue;
      const strategyRows = paperPromotionSnapshots(promotionSnapshots, strategyId);
      const demotion = evaluateV3Demotion(strategyRows, calibrateStrategy(strategyRows, strategyId), store.trades(2_000));
      if (!demotion.demote) continue;
      const message = `V3 ${strategyId} automatically demoted from paper: ${demotion.reasons.join("; ")}.`;
      store.setV3Promotion(strategyId, { ...promotionState, ready: false, eligible: false, ts: new Date(nowMs).toISOString(), last_reason: message });
      store.appendActivity("v3-shadow", message);
      notifyOperator("v3", message);
    }
    const edgeState = store.cusumEdgeRatio();
    if (edgeState.updated_at === null || nowMs - Date.parse(edgeState.updated_at) >= 7 * 24 * 60 * 60_000) {
      const edgeCalibration = calibrateCusumEdgeRatio(
        store.candidateSnapshots(2_000).filter((row) => row.strategy_id === "cusum_tb"),
        edgeState.value,
      );
      store.setCusumEdgeRatio(edgeCalibration.value, nowMs);
      if (edgeCalibration.updated) {
        store.appendWeb3Memory({
          symbol: "CUSUM",
          kind: "lesson",
          summary: `Weekly cusum_tb edge ratio calibrated ${edgeState.value.toFixed(4)} → ${edgeCalibration.value.toFixed(4)} from ${edgeCalibration.sample_count} labeled would-enters.`,
        });
      }
    }
    const bpEdgeState = store.barPortionEdgeRatio();
    if (bpEdgeState.updated_at === null || nowMs - Date.parse(bpEdgeState.updated_at) >= 7 * 24 * 60 * 60_000) {
      const edgeCalibration = calibrateBarPortionEdgeRatio(
        store.candidateSnapshots(2_000).filter((row) => row.strategy_id === "bar_portion"),
        bpEdgeState.value,
      );
      store.setBarPortionEdgeRatio(edgeCalibration.value, nowMs);
      if (edgeCalibration.updated) {
        store.appendWeb3Memory({
          symbol: "BP",
          kind: "lesson",
          summary: `Weekly bar_portion edge ratio calibrated ${bpEdgeState.value.toFixed(4)} → ${edgeCalibration.value.toFixed(4)} from ${edgeCalibration.sample_count} labeled would-enters.`,
        });
      }
    }
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

  // Daily evidence backup: the snapshot directory is its own state (a folder
  // named for today means today is done), so this is one stat() on most ticks.
  const backup = runDailyBackup();
  if (!backup.skipped) {
    if (backup.path) {
      store.appendActivity(
        "daemon",
        `Daily backup saved: ${backup.files.length} store${backup.files.length === 1 ? "" : "s"} → ${backup.path}${backup.pruned.length > 0 ? ` (pruned ${backup.pruned.length} old)` : ""}.`,
      );
    } else {
      store.appendActivity("error", "Daily .data backup FAILED — check MASTERMOLD_BACKUP_DIR and permissions.");
      notifyOperator("error", "Daily .data backup failed — the evidence record is not being protected.");
    }
  }

  // Throttled observation: at most one web3-memory note per 10 minutes, so
  // the brain accumulates market context even on ticks where nothing trades.
  if (nowMs - context.lastObservationMs >= OBSERVATION_EVERY_MS) {
    const mover = biggestWindowMover(context.windows, tradableUniverse);
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
  const startupDenylist = new Set(store.tierBDenylist());
  const startupTierB = store.tierB().filter((token) => !startupDenylist.has(token.mint));
  const startupUniverse = buildTradableUniverse(startupTierB, store.mintMeta());
  store.appendActivity(
    "daemon",
    `Paper daemon started (v2 trend-pullback, tick ${TICK_MS / 1000}s, universe ${startupUniverse.map((asset) => asset.symbol).join("/")}, stake $${PAPER_STARTING_CASH_USD}).`,
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
    cusumStates: new Map(
      startupUniverse.map((asset) => [
        asset.mint,
        initialCusumState(store.priceHistory().at(-1)?.prices[asset.mint] ?? 0),
      ]),
    ),
    cusumThresholds: new Map(),
    lastExecutionCostByMint: new Map(),
    barStates: new Map(startupUniverse.map((asset) => [asset.mint, initialBarBuilderState()])),
    bpDeferredBarByMint: new Map(),
    bpBypassBarByMint: new Map(),
    lastCexScoutMs: 0,
    cexScoutRunning: false,
    lastFundingByMint: new Map<string, FundingInput>(),
    lastMlWarningMs: 0,
    cusumObservationStartedAtMs: Date.parse(store.ensureCusumObservationStartedAt()),
    lastCusumRateCheckMs: 0,
    pendingMlCusumEvents: new Map(),
  };

  // Warm-start: seed the signal windows from the persisted bars so a restart
  // doesn't blind the strategy for 13 minutes — under the supervisor,
  // restarts are routine. Each 5-minute bar stands in for ~15 ticks: the
  // 13-minute return comes out the same, the range is slightly coarser, and
  // live 20s samples refine it from the first tick. Only RECENT bars qualify;
  // seeding a long outage's stale prices would fake a 13-minute move.
  const BAR_TICKS = Math.round((5 * 60_000) / TICK_MS);
  const warmCutoffMs = Date.now() - 20 * 60_000;
  const warmBars = store.priceHistory().filter((bar) => Date.parse(bar.ts) >= warmCutoffMs);
  if (warmBars.length >= 2) {
    for (const bar of warmBars.slice(-Math.ceil(WINDOW_TICKS / BAR_TICKS) - 1)) {
      for (const [mint, price] of Object.entries(bar.prices)) {
        if (!Number.isFinite(price) || price <= 0) continue;
        const window = context.windows.get(mint) ?? [];
        for (let tick = 0; tick < BAR_TICKS && window.length < WINDOW_TICKS; tick += 1) window.push(price);
        context.windows.set(mint, window);
      }
    }
    store.appendActivity(
      "daemon",
      `Warm-started signal windows from ${warmBars.length} recent minute bars (${context.windows.size} mints) — no 13-minute blind spot this boot.`,
    );
  }

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
  // Repeated identical failures (a multi-hour API outage fails every 20s)
  // log once per 10 minutes instead of per tick — otherwise the outage
  // churns the capped activity table and evicts the history that matters.
  let lastTickError = "";
  let lastTickErrorLogMs = 0;
  for (;;) {
    if (stopping) return;
    context.count += 1;
    try {
      await tick(context);
      lastTickError = "";
    } catch (error) {
      const message = `Tick failed: ${error instanceof Error ? error.message : String(error)}`;
      const nowMs = Date.now();
      if (message !== lastTickError || nowMs - lastTickErrorLogMs >= 10 * 60_000) {
        store.appendActivity("error", message);
        lastTickError = message;
        lastTickErrorLogMs = nowMs;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, TICK_MS + Math.floor(Math.random() * 2_000)));
  }
}

if (import.meta.main) {
  void main();
}
