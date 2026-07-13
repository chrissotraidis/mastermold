import { decide } from "../../daemon";
import type { MarketFeedRow } from "../../feed";
import { DEFAULT_STRATEGY_PARAMS } from "../../params";
import type { BotPositionRow, BotStateRow } from "../../store";
import { barPortion, type OhlcBar } from "../bars";
import { replayConfigHash, replayMetrics } from "./engine";
import type { ReplayBar, ReplayConfig, ReplayResult, ReplaySeries, ReplayTrade } from "./types";

type PositionContext = { row: BotPositionRow; raw_entry: number; signal_ts_ms: number };

function pctChange(series: ReplayBar[], index: number, ms: number): number | null {
  const cutoff = series[index].ts_ms - ms;
  let prior = index;
  while (prior > 0 && series[prior].ts_ms > cutoff) prior -= 1;
  return prior < index && series[prior].ts_ms <= cutoff ? (series[index].c / series[prior].c - 1) * 100 : null;
}

function samplePath(bar: ReplayBar): number[] {
  const middle = Math.abs(bar.o - bar.l) <= Math.abs(bar.o - bar.h) ? [bar.l, bar.h] : [bar.h, bar.l];
  const anchors = [bar.o, ...middle, bar.c];
  const result: number[] = [];
  for (let segment = 0; segment < 3; segment += 1) {
    for (let step = 0; step < 5; step += 1) result.push(anchors[segment] + (anchors[segment + 1] - anchors[segment]) * (step / 5));
  }
  result.push(bar.c);
  return result;
}

function bp(bar: ReplayBar): number | null {
  const converted: OhlcBar = { ts_open_ms: bar.ts_ms, o: bar.o, h: bar.h, l: bar.l, c: bar.c, samples: 15 };
  return barPortion(converted);
}

function closedTrade(
  series: ReplaySeries,
  context: PositionContext,
  bar: ReplayBar,
  rawExit: number,
  reason: ReplayTrade["exit_reason"],
  config: ReplayConfig,
): ReplayTrade {
  const fillExit = rawExit * (1 - config.cost.total_bps / 20_000);
  const net = (fillExit / context.row.avg_cost_usd - 1) * 10_000;
  return {
    strategy_id: "v2", symbol: series.symbol, signal_ts_ms: context.signal_ts_ms,
    entry_ts_ms: Date.parse(context.row.opened_at), exit_ts_ms: bar.ts_ms,
    entry_price: context.row.avg_cost_usd, exit_price: fillExit,
    gross_bps: (rawExit / context.raw_entry - 1) * 10_000, net_bps: net,
    outcome: net > 0 ? "win" : "loss", exit_reason: reason, cost_bps: config.cost.total_bps,
  };
}

function replaySeries(series: ReplaySeries, config: ReplayConfig): { trades: ReplayTrade[]; exposure_ms: number } {
  const mint = `replay:${series.symbol}`;
  const windows = new Map<string, number[]>([[mint, []]]);
  const state: BotStateRow = {
    mode: "paper", kill_switch: false, started_at: new Date(series.bars[0].ts_ms).toISOString(),
    updated_at: new Date(series.bars[0].ts_ms).toISOString(), last_tick_at: null, wallet_label: null,
    caps: { max_trade_usd: 100, daily_loss_limit_usd: 100, daily_spend_limit_usd: 1_000, max_positions: 1, drawdown_halt_pct: 50, reserve_floor_sol: 0 },
  };
  const trades: ReplayTrade[] = [];
  const cooldown = new Map<string, number>();
  let context: PositionContext | null = null;
  let pendingBuy: { stop_pct: number; tp_pct: number; signal_ts_ms: number } | null = null;
  let pendingSell: { signal_ts_ms: number } | null = null;
  let exposureMs = 0; let lastEntryMs: number | null = null; let lossStreak = 0; let lastLossMs: number | null = null;
  let deferredOverlayBar: number | null = null;
  let tradeDay = ""; let tradesToday = 0;

  const recordExit = (bar: ReplayBar, rawExit: number, reason: ReplayTrade["exit_reason"]) => {
    if (!context) return;
    const trade = closedTrade(series, context, bar, rawExit, reason, config);
    trades.push(trade); cooldown.set(mint, bar.ts_ms + DEFAULT_STRATEGY_PARAMS.cooldown_ms);
    if (trade.net_bps < 0) { lossStreak += 1; lastLossMs = bar.ts_ms; } else lossStreak = 0;
    context = null; pendingSell = null;
  };

  for (let index = 0; index < series.bars.length; index += 1) {
    const bar = series.bars[index];
    const day = new Date(bar.ts_ms).toISOString().slice(0, 10);
    if (day !== tradeDay) { tradeDay = day; tradesToday = 0; }
    if (context && index > 0) exposureMs += Math.max(0, bar.ts_ms - series.bars[index - 1].ts_ms);
    if (pendingSell && context) recordExit(bar, bar.o, "signal_exit");
    if (pendingBuy && !context) {
      const fillEntry = bar.o * (1 + config.cost.total_bps / 20_000);
      context = {
        row: {
          mint, symbol: series.symbol, qty: 1, avg_cost_usd: fillEntry,
          stop_pct: pendingBuy.stop_pct, tp_pct: pendingBuy.tp_pct,
          peak_usd: fillEntry, opened_at: new Date(bar.ts_ms).toISOString(), updated_at: new Date(bar.ts_ms).toISOString(),
        },
        raw_entry: bar.o, signal_ts_ms: pendingBuy.signal_ts_ms,
      };
      lastEntryMs = bar.ts_ms; tradesToday += 1; pendingBuy = null;
    }
    if (context) {
      context.row.peak_usd = Math.max(context.row.peak_usd ?? context.row.avg_cost_usd, bar.h);
      const stop = context.row.avg_cost_usd * (1 - (context.row.stop_pct ?? DEFAULT_STRATEGY_PARAMS.min_stop_pct) / 100);
      const target = context.row.avg_cost_usd * (1 + (context.row.tp_pct ?? DEFAULT_STRATEGY_PARAMS.min_stop_pct * DEFAULT_STRATEGY_PARAMS.take_profit_r) / 100);
      if (bar.l <= stop && bar.h >= target) recordExit(bar, stop, "stop_same_bar_tie");
      else if (bar.l <= stop) recordExit(bar, stop, "stop");
      else if (bar.h >= target) recordExit(bar, target, "take_profit");
    }

    const window = windows.get(mint) as number[];
    window.push(...samplePath(bar));
    if (window.length > 40) window.splice(0, window.length - 40);
    const feedRow: MarketFeedRow = {
      symbol: series.symbol, price_usd: bar.c,
      change_h1_pct: pctChange(series.bars, index, 3_600_000), change_h24_pct: pctChange(series.bars, index, 86_400_000),
      volume_h24_usd: 100_000_000, liquidity_usd: config.liquidity_usd,
    };
    const output = decide({
      windows, positions: context ? [context.row] : [], state, cash_usd: 1_000,
      feed: new Map([[series.symbol, feedRow]]), now_ms: bar.ts_ms, trades_today: tradesToday,
      cooldown_until_ms: cooldown, loss_streak: lossStreak, last_loss_ms: lastLossMs,
      last_entry_ms: lastEntryMs, params: DEFAULT_STRATEGY_PARAMS,
      modeledRoundTripCostPctByMint: new Map([[mint, config.cost.total_bps / 100]]),
      universe: [{ symbol: series.symbol, mint, tier: "A" }],
    });
    const sell = output.decisions.find((decision) => decision.action === "sell");
    if (sell && context) pendingSell = { signal_ts_ms: bar.ts_ms };
    const buy = output.decisions.find((decision) => decision.action === "buy");
    if (buy?.action === "buy" && !context && !pendingBuy && index + 1 < series.bars.length) {
      const barBp = bp(bar);
      if (config.bp_overlay && barBp !== null && barBp >= 0.6 && deferredOverlayBar === null) {
        deferredOverlayBar = bar.ts_ms;
      } else {
        pendingBuy = { stop_pct: buy.stop_pct, tp_pct: buy.tp_pct ?? buy.stop_pct * DEFAULT_STRATEGY_PARAMS.take_profit_r, signal_ts_ms: bar.ts_ms };
        deferredOverlayBar = null;
      }
    } else if (deferredOverlayBar !== null && bar.ts_ms > deferredOverlayBar) {
      deferredOverlayBar = null;
    }
  }
  if (context) recordExit(series.bars.at(-1) as ReplayBar, (series.bars.at(-1) as ReplayBar).c, "end_of_data");
  return { trades, exposure_ms: exposureMs };
}

export function runV2Replay(series: ReplaySeries[], config: ReplayConfig): ReplayResult {
  if (config.module !== "v2") throw new Error("runV2Replay requires module=v2");
  if (series.length === 0 || series.some((item) => item.bars.length < 2)) throw new Error("Replay requires at least two bars per series");
  const runs = series.map((item) => replaySeries(item, config));
  const trades = runs.flatMap((run) => run.trades).sort((a, b) => a.entry_ts_ms - b.entry_ts_ms || a.symbol.localeCompare(b.symbol));
  const summary = replayMetrics(trades, series, runs.reduce((sum, run) => sum + run.exposure_ms, 0), 0);
  return {
    version: 1, module: "v2", config_hash: replayConfigHash(config), config,
    data: series.map((item) => ({ symbol: item.symbol, source: item.source, granularity_sec: item.granularity_sec, from_ms: item.bars[0].ts_ms, to_ms: item.bars.at(-1)!.ts_ms, bars: item.bars.length })),
    symbol_metrics: series.map((item, index) => {
      const span = item.bars.at(-1)!.ts_ms - item.bars[0].ts_ms;
      return { symbol: item.symbol, exposure_pct: span > 0 ? Math.round(Math.min(1, runs[index].exposure_ms / span) * 10_000) / 100 : 0, events_per_day: 0 };
    }),
    trades, metrics: summary.metrics, quarters: summary.quarters, deterministic_tie_policy: "stop_wins",
  };
}
