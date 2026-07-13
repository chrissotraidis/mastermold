export type CusumState = {
  s_pos: number;
  s_neg: number;
  last_price: number;
  events: number;
};

export type CusumEvent = {
  direction: "up" | "down";
  magnitude: number;
  ts_ms: number;
};

export type CusumEventObservation = CusumEvent & {
  ts: string;
  mint: string;
  symbol: string;
  h_pct: number;
  sigma_daily_pct: number | null;
};

export type CusumMintRate = {
  mint: string;
  symbol: string;
  event_count: number;
  span_ms: number;
  events_per_day: number;
};

export function initialCusumState(lastPrice = 0): CusumState {
  return { s_pos: 0, s_neg: 0, last_price: lastPrice, events: 0 };
}

/** Symmetric cumulative-sum filter over log returns (Gradzki eqs. 10–12). */
export function cusumStep(
  state: CusumState,
  price: number,
  hPct: number,
  tsMs: number,
): CusumEvent | null {
  if (!(price > 0) || !Number.isFinite(price) || !(state.last_price > 0) || !Number.isFinite(state.last_price)) {
    state.last_price = price;
    return null;
  }
  const threshold = hPct / 100;
  if (!(threshold > 0) || !Number.isFinite(threshold)) {
    state.last_price = price;
    return null;
  }
  const logReturn = Math.log(price / state.last_price);
  state.last_price = price;
  state.s_pos = Math.max(0, state.s_pos + logReturn);
  state.s_neg = Math.min(0, state.s_neg + logReturn);
  if (state.s_pos >= threshold) {
    const magnitude = state.s_pos;
    state.s_pos = 0;
    state.s_neg = 0;
    state.events += 1;
    return { direction: "up", magnitude, ts_ms: tsMs };
  }
  if (state.s_neg <= -threshold) {
    const magnitude = -state.s_neg;
    state.s_pos = 0;
    state.s_neg = 0;
    state.events += 1;
    return { direction: "down", magnitude, ts_ms: tsMs };
  }
  return null;
}

export function cusumThresholdPct(sigmaDailyPct: number | null): number {
  if (sigmaDailyPct === null || !Number.isFinite(sigmaDailyPct)) return 2.5;
  return Math.min(5, Math.max(1.5, 0.5 * sigmaDailyPct));
}

/** EWMA volatility of persisted 5-minute closes, annualized only to one day. */
export function ewmaDailySigmaPct(prices: number[], alpha = 0.06): number | null {
  const valid = prices.filter((price) => Number.isFinite(price) && price > 0);
  if (valid.length < 3) return null;
  let mean = 0;
  let variance = 0;
  let seen = 0;
  for (let index = 1; index < valid.length; index += 1) {
    const value = Math.log(valid[index] / valid[index - 1]);
    if (!Number.isFinite(value)) continue;
    seen += 1;
    const delta = value - mean;
    mean += alpha * delta;
    variance = (1 - alpha) * (variance + alpha * delta * delta);
  }
  if (seen < 2) return null;
  return Math.sqrt(Math.max(0, variance)) * Math.sqrt(288) * 100;
}

export function cusumEventRatePerDay(eventCount: number, spanMs: number): number | null {
  if (!Number.isFinite(eventCount) || eventCount < 0 || !Number.isFinite(spanMs) || spanMs <= 0) return null;
  return eventCount / (spanMs / 86_400_000);
}

/** Durable-runtime rate view. It deliberately observes rather than retunes:
 * the daemon reports out-of-band rates, while threshold changes remain a
 * separately reviewed strategy decision. */
export function cusumMintRates(
  rows: CusumEventObservation[],
  observationStartedAtMs: number,
  nowMs: number = Date.now(),
  lookbackMs = 24 * 60 * 60_000,
  minimumSpanMs = 6 * 60 * 60_000,
): CusumMintRate[] {
  const windowStart = Math.max(observationStartedAtMs, nowMs - lookbackMs);
  const spanMs = nowMs - windowStart;
  if (!Number.isFinite(windowStart) || !Number.isFinite(nowMs) || spanMs < minimumSpanMs) return [];
  const counts = new Map<string, { mint: string; symbol: string; count: number }>();
  for (const row of rows) {
    if (!Number.isFinite(row.ts_ms) || row.ts_ms < windowStart || row.ts_ms > nowMs || !row.mint) continue;
    const current = counts.get(row.mint) ?? { mint: row.mint, symbol: row.symbol, count: 0 };
    current.count += 1;
    counts.set(row.mint, current);
  }
  return [...counts.values()].map((row) => ({
    mint: row.mint,
    symbol: row.symbol,
    event_count: row.count,
    span_ms: spanMs,
    events_per_day: cusumEventRatePerDay(row.count, spanMs) ?? 0,
  })).sort((left, right) => right.events_per_day - left.events_per_day || left.symbol.localeCompare(right.symbol));
}
