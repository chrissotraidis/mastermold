import { replayConfigHash, replayMetrics, runReplay } from "./engine";
import { runV2Replay } from "./v2-adapter";
import type { ReplayConfig, ReplayResult, ReplaySeries } from "./types";
export { ANTI_OVERFIT_CONSTITUTION } from "./constitution";

export type ParameterScheduleEntry = {
  effective_from_ms: number;
  trained_through_ms: number;
  params: Partial<Pick<ReplayConfig, "cusum_edge_ratio" | "bar_portion_edge_ratio">>;
};

export function validateParameterSchedule(schedule: ParameterScheduleEntry[]): void {
  let priorEffective = -Infinity;
  for (const entry of schedule) {
    if (![entry.effective_from_ms, entry.trained_through_ms].every(Number.isFinite)) throw new Error("Schedule timestamps must be finite");
    if (entry.effective_from_ms <= priorEffective) throw new Error("Parameter schedule must be strictly chronological");
    if (entry.trained_through_ms >= entry.effective_from_ms) throw new Error("Future-referencing parameter schedule: training must end before activation");
    priorEffective = entry.effective_from_ms;
  }
}

function quarterStart(tsMs: number): number {
  const date = new Date(tsMs);
  return Date.UTC(date.getUTCFullYear(), Math.floor(date.getUTCMonth() / 3) * 3, 1);
}

function nextQuarter(tsMs: number): number {
  const date = new Date(tsMs);
  return Date.UTC(date.getUTCFullYear(), Math.floor(date.getUTCMonth() / 3) * 3 + 3, 1);
}

export function runQuarterlyWalkForward(series: ReplaySeries[], base: ReplayConfig, schedule: ParameterScheduleEntry[]): ReplayResult {
  validateParameterSchedule(schedule);
  const from = Math.min(...series.map((item) => item.bars[0]?.ts_ms ?? Infinity));
  const to = Math.max(...series.map((item) => item.bars.at(-1)?.ts_ms ?? -Infinity));
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) throw new Error("Walk-forward requires chronological bars");
  const results: ReplayResult[] = [];
  for (let start = quarterStart(from); start <= to; start = nextQuarter(start)) {
    const end = nextQuarter(start);
    const entry = [...schedule].reverse().find((candidate) => candidate.effective_from_ms <= start);
    if (!entry) continue;
    if (entry.trained_through_ms >= start) throw new Error(`Future-referencing configuration for ${new Date(start).toISOString().slice(0, 7)}`);
    const sliced = series.map((item) => ({ ...item, bars: item.bars.filter((bar) => bar.ts_ms >= start && bar.ts_ms < end) })).filter((item) => item.bars.length >= 2);
    if (sliced.length === 0) continue;
    const config = { ...base, ...entry.params };
    results.push(config.module === "v2" ? runV2Replay(sliced, config) : runReplay(sliced, config));
  }
  if (results.length === 0) throw new Error("Parameter schedule covers no replay quarter");
  const trades = results.flatMap((result) => result.trades).sort((a, b) => a.entry_ts_ms - b.entry_ts_ms);
  const summary = replayMetrics(trades, series, 0, 0);
  const quarters = results.flatMap((result) => result.quarters);
  return {
    ...results[0],
    config_hash: replayConfigHash({ base, schedule }),
    data: series.map((item) => ({ symbol: item.symbol, source: item.source, granularity_sec: item.granularity_sec, from_ms: item.bars[0].ts_ms, to_ms: item.bars.at(-1)!.ts_ms, bars: item.bars.length })),
    symbol_metrics: series.map((item) => {
      const rows = results.flatMap((result) => result.symbol_metrics.filter((metric) => metric.symbol === item.symbol));
      return {
        symbol: item.symbol,
        exposure_pct: rows.length ? Math.round((rows.reduce((sum, row) => sum + row.exposure_pct, 0) / rows.length) * 100) / 100 : 0,
        events_per_day: rows.length ? Math.round((rows.reduce((sum, row) => sum + row.events_per_day, 0) / rows.length) * 10_000) / 10_000 : 0,
      };
    }),
    trades,
    metrics: { ...summary.metrics, positive_walk_forward_quarters: quarters.filter((quarter) => quarter.positive).length },
    quarters,
    parameter_schedule: schedule.map((entry) => ({ ...entry, params: { ...entry.params } })),
  };
}
