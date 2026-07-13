import { createHash } from "node:crypto";
import { bpCandidate } from "../bar-portion";
import { atrBps, barPortion, emaClose, initialBarBuilderState, type OhlcBar } from "../bars";
import { cusumTbCandidate } from "../cusum-tb";
import { cusumStep, cusumThresholdPct, ewmaDailySigmaPct, initialCusumState } from "../cusum";
import { passesEvGate } from "../ev-gate";
import type { CandidateSignal, ExecutionCost } from "../signal";
import type { QuarterMetric, ReplayBar, ReplayConfig, ReplayMetrics, ReplayResult, ReplaySeries, ReplayTrade } from "./types";

type OpenPosition = {
  signal: CandidateSignal;
  signal_ts_ms: number;
  entry_ts_ms: number;
  raw_entry_price: number;
  fill_entry_price: number;
  stop_price: number;
  target_price: number;
  deadline_ms: number;
};

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

export function replayConfigHash(config: unknown): string {
  return createHash("sha256").update(stable(config)).digest("hex").slice(0, 16);
}

export function scaleExecutionCost(cost: ExecutionCost, multiple: number): ExecutionCost {
  if (!(multiple >= 0) || !Number.isFinite(multiple)) throw new Error("Cost multiple must be non-negative");
  return Object.fromEntries(Object.entries(cost).map(([key, value]) => [key, Math.round(value * multiple * 100) / 100])) as ExecutionCost;
}

function changePct(bars: ReplayBar[], index: number, lookbackMs: number): number | null {
  const cutoff = bars[index].ts_ms - lookbackMs;
  let prior = index;
  while (prior > 0 && bars[prior].ts_ms > cutoff) prior -= 1;
  if (prior === index || bars[prior].ts_ms > cutoff || bars[prior].c <= 0) return null;
  return (bars[index].c / bars[prior].c - 1) * 100;
}

function ohlc(bar: ReplayBar): OhlcBar {
  return { ts_open_ms: bar.ts_ms, o: bar.o, h: bar.h, l: bar.l, c: bar.c, samples: 15 };
}

function round(value: number, places = 4): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function closeTrade(position: OpenPosition, bar: ReplayBar, rawExit: number, reason: ReplayTrade["exit_reason"], cost: ExecutionCost): ReplayTrade {
  const halfCost = cost.total_bps / 20_000;
  const fillExit = rawExit * (1 - halfCost);
  const grossBps = (rawExit / position.raw_entry_price - 1) * 10_000;
  const netBps = (fillExit / position.fill_entry_price - 1) * 10_000;
  return {
    strategy_id: position.signal.strategy_id === "bar_portion" ? "bar_portion" : "cusum_tb",
    symbol: position.signal.symbol,
    signal_ts_ms: position.signal_ts_ms,
    entry_ts_ms: position.entry_ts_ms,
    exit_ts_ms: bar.ts_ms,
    entry_price: round(position.fill_entry_price, 8),
    exit_price: round(fillExit, 8),
    gross_bps: round(grossBps),
    net_bps: round(netBps),
    outcome: netBps > 0 ? "win" : "loss",
    exit_reason: reason,
    cost_bps: cost.total_bps,
  };
}

function metrics(trades: ReplayTrade[], series: ReplaySeries[], exposureMs: number, events: number): { metrics: ReplayMetrics; quarters: QuarterMetric[] } {
  const from = Math.min(...series.map((item) => item.bars[0]?.ts_ms ?? Infinity));
  const to = Math.max(...series.map((item) => item.bars.at(-1)?.ts_ms ?? -Infinity));
  const spanMs = Number.isFinite(from) && Number.isFinite(to) && to > from ? to - from : 0;
  const mean = trades.length ? trades.reduce((sum, trade) => sum + trade.net_bps, 0) / trades.length : null;
  const daily = new Map<string, number>();
  for (const trade of trades) {
    const day = new Date(trade.exit_ts_ms).toISOString().slice(0, 10);
    daily.set(day, (daily.get(day) ?? 0) + trade.net_bps);
  }
  const dailyReturns = [...daily.values()];
  const dailyMean = dailyReturns.length ? dailyReturns.reduce((sum, value) => sum + value, 0) / dailyReturns.length : 0;
  const dailyVariance = dailyReturns.length > 1 ? dailyReturns.reduce((sum, value) => sum + (value - dailyMean) ** 2, 0) / (dailyReturns.length - 1) : 0;
  const sharpe = dailyVariance > 0 ? (dailyMean / Math.sqrt(dailyVariance)) * Math.sqrt(365) : null;
  let equity = 0; let peak = 0; let maxDrawdown = 0;
  for (const trade of [...trades].sort((a, b) => a.exit_ts_ms - b.exit_ts_ms)) {
    equity += trade.net_bps; peak = Math.max(peak, equity); maxDrawdown = Math.max(maxDrawdown, peak - equity);
  }
  const grouped = new Map<string, ReplayTrade[]>();
  for (const trade of trades) {
    const date = new Date(trade.exit_ts_ms); const quarter = `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
    grouped.set(quarter, [...(grouped.get(quarter) ?? []), trade]);
  }
  const quarters: QuarterMetric[] = [...grouped].sort(([a], [b]) => a.localeCompare(b)).map(([quarter, rows]) => {
    const quarterMean = rows.reduce((sum, trade) => sum + trade.net_bps, 0) / rows.length;
    return { quarter, trades: rows.length, mean_net_bps: round(quarterMean), positive: quarterMean > 0 };
  });
  return {
    metrics: {
      trades: trades.length,
      hit_rate: trades.length ? round(trades.filter((trade) => trade.net_bps > 0).length / trades.length) : null,
      mean_net_bps: mean === null ? null : round(mean),
      sharpe_daily: sharpe === null ? null : round(sharpe),
      max_drawdown_bps: round(maxDrawdown),
      exposure_pct: spanMs > 0 ? round(Math.min(1, exposureMs / spanMs) * 100) : 0,
      events_per_day: spanMs > 0 ? round(events / (spanMs / 86_400_000)) : 0,
      positive_walk_forward_quarters: quarters.filter((quarter) => quarter.positive).length,
    },
    quarters,
  };
}

function candidateAt(config: ReplayConfig, series: ReplaySeries, index: number, closed: OhlcBar[], event: ReturnType<typeof cusumStep>): CandidateSignal | null {
  const bars = series.bars;
  const h1 = changePct(bars, index, 3_600_000);
  const h24 = changePct(bars, index, 86_400_000);
  if (config.module === "cusum_tb") {
    if (!event) return null;
    const recent = bars.slice(Math.max(0, index - Math.ceil(86_400 / series.granularity_sec)), index + 1).map((bar) => bar.c);
    const sigma = ewmaDailySigmaPct(recent);
    return cusumTbCandidate({
      symbol: series.symbol, mint: series.symbol, price_usd: bars[index].c, event,
      h_pct: cusumThresholdPct(sigma), held: false, h1_pct: h1, h24_pct: h24,
      liquidity_usd: config.liquidity_usd, volume_h24_usd: null, sigma_daily_pct: sigma,
      edge_ratio: config.cusum_edge_ratio,
    }, config.cost);
  }
  if (config.module === "bar_portion") {
    return bpCandidate({
      symbol: series.symbol, mint: series.symbol, price_usd: bars[index].c,
      bp: barPortion(closed.at(-1) as OhlcBar), atr_bps: atrBps(closed), ema_close: emaClose(closed),
      held: false, h1_pct: h1, h24_pct: h24, liquidity_usd: config.liquidity_usd,
      edge_ratio: config.bar_portion_edge_ratio,
    }, config.cost);
  }
  throw new Error("v2 is replayed by the production-v2 adapter");
}

function replayV3Series(series: ReplaySeries, config: ReplayConfig): { trades: ReplayTrade[]; exposure_ms: number; events: number } {
  const bars = series.bars;
  const trades: ReplayTrade[] = [];
  // Input rows are already authoritative completed OHLC bars; retaining them
  // in the same BarBuilderState shape keeps rolling feature semantics aligned
  // without inventing an intra-bar tick ordering.
  const barState = initialBarBuilderState();
  const closed = barState.closed;
  const state = initialCusumState();
  let position: OpenPosition | null = null;
  let pending: { signal: CandidateSignal; signal_ts_ms: number } | null = null;
  let exposureMs = 0;
  let deferredBpBuy = false;
  for (let index = 0; index < bars.length; index += 1) {
    const bar = bars[index];
    if (position && index > 0) exposureMs += Math.max(0, bar.ts_ms - bars[index - 1].ts_ms);
    if (pending && !position) {
      const halfCost = config.cost.total_bps / 20_000;
      const entry = bar.o * (1 + halfCost);
      const distance = pending.signal.max_loss_bps / 10_000;
      position = {
        signal: pending.signal, signal_ts_ms: pending.signal_ts_ms, entry_ts_ms: bar.ts_ms,
        raw_entry_price: bar.o, fill_entry_price: entry,
        stop_price: bar.o * (1 - distance), target_price: bar.o * (1 + distance),
        deadline_ms: bar.ts_ms + pending.signal.horizon_sec * 1_000,
      };
      pending = null;
    }
    if (position) {
      const stop = bar.l <= position.stop_price;
      const target = bar.h >= position.target_price;
      if (stop && target) {
        trades.push(closeTrade(position, bar, position.stop_price, "stop_same_bar_tie", config.cost)); position = null;
      } else if (stop) {
        trades.push(closeTrade(position, bar, position.stop_price, "stop", config.cost)); position = null;
      } else if (target) {
        trades.push(closeTrade(position, bar, position.target_price, "take_profit", config.cost)); position = null;
      } else if (bar.ts_ms >= position.deadline_ms) {
        trades.push(closeTrade(position, bar, bar.c, "horizon", config.cost)); position = null;
      }
    }
    closed.push(ohlc(bar));
    if (closed.length > 288) closed.shift();
    const sigma = ewmaDailySigmaPct(bars.slice(Math.max(0, index - Math.ceil(86_400 / series.granularity_sec)), index + 1).map((item) => item.c));
    const event = cusumStep(state, bar.c, cusumThresholdPct(sigma), bar.ts_ms);
    if (position || pending || index + 1 >= bars.length || closed.length < 20) continue;
    let candidate = candidateAt(config, series, index, closed, event);
    if (candidate?.side !== "buy" || !passesEvGate(candidate, { min_liquidity_usd: 250_000 }).pass) candidate = null;
    if (candidate && config.module === "bar_portion" && config.bp_overlay) {
      const priorBp = closed.length > 1 ? barPortion(closed.at(-2) as OhlcBar) : null;
      if (priorBp !== null && priorBp >= 0.6 && !deferredBpBuy) {
        deferredBpBuy = true; candidate = null;
      } else if (deferredBpBuy) deferredBpBuy = false;
    }
    if (candidate) pending = { signal: candidate, signal_ts_ms: bar.ts_ms };
  }
  if (position && bars.length) trades.push(closeTrade(position, bars.at(-1) as ReplayBar, (bars.at(-1) as ReplayBar).c, "end_of_data", config.cost));
  return { trades, exposure_ms: exposureMs, events: state.events };
}

export function runReplay(series: ReplaySeries[], config: ReplayConfig): ReplayResult {
  if (config.module === "v2") throw new Error("Use runV2Replay for the v2 module");
  if (series.length === 0 || series.some((item) => item.bars.length < 2)) throw new Error("Replay requires at least two bars per series");
  const runs = series.map((item) => replayV3Series(item, config));
  const trades = runs.flatMap((run) => run.trades).sort((a, b) => a.entry_ts_ms - b.entry_ts_ms || a.symbol.localeCompare(b.symbol));
  const summary = metrics(trades, series, runs.reduce((sum, run) => sum + run.exposure_ms, 0), runs.reduce((sum, run) => sum + run.events, 0));
  return {
    version: 1, module: config.module, config_hash: replayConfigHash(config), config,
    data: series.map((item) => ({ symbol: item.symbol, source: item.source, granularity_sec: item.granularity_sec, from_ms: item.bars[0].ts_ms, to_ms: item.bars.at(-1)!.ts_ms, bars: item.bars.length })),
    symbol_metrics: series.map((item, index) => {
      const span = item.bars.at(-1)!.ts_ms - item.bars[0].ts_ms;
      return { symbol: item.symbol, exposure_pct: span > 0 ? round(Math.min(1, runs[index].exposure_ms / span) * 100) : 0, events_per_day: span > 0 ? round(runs[index].events / (span / 86_400_000)) : 0 };
    }),
    trades, metrics: summary.metrics, quarters: summary.quarters, deterministic_tie_policy: "stop_wins",
  };
}

export function replayMetrics(trades: ReplayTrade[], series: ReplaySeries[], exposureMs = 0, events = 0): { metrics: ReplayMetrics; quarters: QuarterMetric[] } {
  return metrics(trades, series, exposureMs, events);
}
