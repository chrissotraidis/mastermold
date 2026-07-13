export const DEFAULT_BAR_MS = 5 * 60_000;
export const MAX_CLOSED_BARS = 60;
export const BP_EXTREME = 0.6;
export const BP_DEAD_ZONE = 0.2;

export type OhlcBar = {
  ts_open_ms: number;
  o: number;
  h: number;
  l: number;
  c: number;
  samples: number;
};

export type BarBuilderState = {
  current: OhlcBar | null;
  closed: OhlcBar[];
  /** The boot-time partial is discarded at the first observed boundary. */
  first_boundary_seen: boolean;
};

export function initialBarBuilderState(): BarBuilderState {
  return { current: null, closed: [], first_boundary_seen: false };
}

function opened(price: number, tsOpenMs: number): OhlcBar {
  return { ts_open_ms: tsOpenMs, o: price, h: price, l: price, c: price, samples: 1 };
}

/** Feed one close sample; returns a completed bar only after boot's partial. */
export function barStep(
  state: BarBuilderState,
  price: number,
  tsMs: number,
  barMs = DEFAULT_BAR_MS,
): OhlcBar | null {
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(tsMs) || !Number.isFinite(barMs) || barMs <= 0) return null;
  const tsOpenMs = Math.floor(tsMs / barMs) * barMs;
  if (state.current === null) {
    state.current = opened(price, tsOpenMs);
    return null;
  }
  if (tsOpenMs < state.current.ts_open_ms) return null;
  if (tsOpenMs === state.current.ts_open_ms) {
    state.current.h = Math.max(state.current.h, price);
    state.current.l = Math.min(state.current.l, price);
    state.current.c = price;
    state.current.samples += 1;
    return null;
  }

  const closed = { ...state.current };
  state.current = opened(price, tsOpenMs);
  if (!state.first_boundary_seen) {
    state.first_boundary_seen = true;
    return null;
  }
  state.closed.push(closed);
  if (state.closed.length > MAX_CLOSED_BARS) state.closed.splice(0, state.closed.length - MAX_CLOSED_BARS);
  return closed;
}

export function barPortion(bar: OhlcBar): number | null {
  if (bar.samples < 9 || !Number.isFinite(bar.h) || !Number.isFinite(bar.l) || bar.h <= bar.l) return null;
  const value = (bar.c - bar.o) / (bar.h - bar.l);
  return Number.isFinite(value) ? Math.min(1, Math.max(-1, value)) : null;
}

/** Mean true range of the newest n bars, normalized to the prior close in bp. */
export function atrBps(closed: OhlcBar[], n = 14): number | null {
  if (closed.length === 0 || !Number.isInteger(n) || n <= 0) return null;
  const start = Math.max(0, closed.length - n);
  const values: number[] = [];
  for (let index = start; index < closed.length; index += 1) {
    const bar = closed[index];
    const previousClose = index > 0 ? closed[index - 1].c : bar.o;
    if (![bar.h, bar.l, previousClose].every((value) => Number.isFinite(value) && value > 0) || bar.h < bar.l) continue;
    const trueRange = Math.max(bar.h - bar.l, Math.abs(bar.h - previousClose), Math.abs(bar.l - previousClose));
    values.push((trueRange / previousClose) * 10_000);
  }
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

export function emaClose(closed: OhlcBar[], n = 20): number | null {
  const values = closed.map((bar) => bar.c).filter((value) => Number.isFinite(value) && value > 0);
  if (values.length === 0 || !Number.isInteger(n) || n <= 0) return null;
  const alpha = 2 / (n + 1);
  let ema = values[0];
  for (let index = 1; index < values.length; index += 1) ema += alpha * (values[index] - ema);
  return ema;
}

export type BpVerdict = { allow: true } | { allow: false; reason: string };

/** Timing overlay: only buys can call this; stale/missing bars fail open. */
export function bpEntryGate(lastClosedBp: number | null, lastBarAgeMs: number | null): BpVerdict {
  if (lastBarAgeMs !== null && lastBarAgeMs > 600_000) return { allow: true };
  if (lastClosedBp !== null && lastClosedBp >= BP_EXTREME) {
    return { allow: false, reason: `BP ${lastClosedBp.toFixed(2)} full-body up bar; deferring entry one bar` };
  }
  return { allow: true };
}

export type BpOverlayResult = {
  verdict: BpVerdict;
  bp: number | null;
  bar_ts_open_ms: number | null;
  deferred_bar_ts_open_ms: number | null;
  bypass_bar_ts_open_ms: number | null;
};

/** Stateful one-bar wrapper: a setup deferred once may fire after the next close. */
export function bpEntryOverlay(
  state: BarBuilderState | undefined,
  deferredBarTsOpenMs: number | null,
  bypassBarTsOpenMs: number | null,
  nowMs: number,
  barMs = DEFAULT_BAR_MS,
): BpOverlayResult {
  const last = state?.closed.at(-1) ?? null;
  if (!last) return { verdict: { allow: true }, bp: null, bar_ts_open_ms: null, deferred_bar_ts_open_ms: deferredBarTsOpenMs, bypass_bar_ts_open_ms: bypassBarTsOpenMs };
  const bp = barPortion(last);
  if (bypassBarTsOpenMs === last.ts_open_ms) {
    return { verdict: { allow: true }, bp, bar_ts_open_ms: last.ts_open_ms, deferred_bar_ts_open_ms: null, bypass_bar_ts_open_ms: bypassBarTsOpenMs };
  }
  const activeBypass = bypassBarTsOpenMs !== null && last.ts_open_ms > bypassBarTsOpenMs ? null : bypassBarTsOpenMs;
  if (deferredBarTsOpenMs !== null && last.ts_open_ms === deferredBarTsOpenMs + barMs) {
    return { verdict: { allow: true }, bp, bar_ts_open_ms: last.ts_open_ms, deferred_bar_ts_open_ms: null, bypass_bar_ts_open_ms: last.ts_open_ms };
  }
  // A setup that disappeared for one or more full bars has no bypass credit.
  // Clear the stale deferral and evaluate the current bar from scratch.
  const activeDeferred = deferredBarTsOpenMs !== null && last.ts_open_ms > deferredBarTsOpenMs + barMs
    ? null
    : deferredBarTsOpenMs;
  const verdict = bpEntryGate(bp, Math.max(0, nowMs - (last.ts_open_ms + barMs)));
  return {
    verdict,
    bp,
    bar_ts_open_ms: last.ts_open_ms,
    deferred_bar_ts_open_ms: verdict.allow ? activeDeferred : last.ts_open_ms,
    bypass_bar_ts_open_ms: activeBypass,
  };
}
