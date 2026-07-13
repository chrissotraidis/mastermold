/// <reference types="bun" />

import { describe, expect, test } from "bun:test";

import {
  atrBps,
  barPortion,
  barStep,
  bpEntryGate,
  bpEntryOverlay,
  emaClose,
  initialBarBuilderState,
  type OhlcBar,
} from "../src/autopilot/v3/bars";

function bar(over: Partial<OhlcBar> = {}): OhlcBar {
  return { ts_open_ms: 0, o: 100, h: 102, l: 99, c: 101, samples: 15, ...over };
}

describe("five-minute OHLC builder", () => {
  test("discards boot partial, closes on boundaries, and retains at most 60 bars", () => {
    const state = initialBarBuilderState();
    barStep(state, 100, 10_000);
    barStep(state, 101, 20_000);
    expect(barStep(state, 102, 300_000)).toBeNull();
    for (let sample = 1; sample < 15; sample += 1) barStep(state, 102 + sample / 100, 300_000 + sample * 20_000);
    const closed = barStep(state, 103, 600_000);
    expect(closed).toMatchObject({ ts_open_ms: 300_000, o: 102, h: 102.14, l: 102, c: 102.14, samples: 15 });
    expect(state.closed).toHaveLength(1);
    for (let index = 0; index < 65; index += 1) barStep(state, 103 + index, 900_000 + index * 300_000);
    expect(state.closed).toHaveLength(60);
  });

  test("BP rejects undersampled/degenerate bars and is bounded", () => {
    expect(barPortion(bar({ samples: 8 }))).toBeNull();
    expect(barPortion(bar({ h: 100, l: 100 }))).toBeNull();
    expect(barPortion(bar({ o: 100, h: 102, l: 99, c: 102 }))).toBeCloseTo(2 / 3, 8);
    expect(barPortion(bar({ o: 100, h: 101, l: 99, c: 200 }))).toBe(1);
  });

  test("ATR and EMA match hand-computed fixtures", () => {
    const bars = [
      bar({ o: 100, h: 102, l: 99, c: 100 }),
      bar({ o: 100, h: 103, l: 100, c: 102 }),
      bar({ o: 102, h: 103, l: 100, c: 101 }),
    ];
    // Latest two true ranges: 3/100 and 3/102 of their prior closes.
    expect(atrBps(bars, 2)).toBeCloseTo((300 + (3 / 102) * 10_000) / 2, 2);
    expect(emaClose(bars, 3)).toBe(101);
  });

  test("entry gate vetoes exactly at +0.6 through 10m, but stale/missing/down bars pass", () => {
    expect(bpEntryGate(0.6, 600_000)).toEqual({ allow: false, reason: "BP 0.60 full-body up bar; deferring entry one bar" });
    expect(bpEntryGate(0.6, 600_001)).toEqual({ allow: true });
    expect(bpEntryGate(0.599, 0)).toEqual({ allow: true });
    expect(bpEntryGate(-1, 0)).toEqual({ allow: true });
    expect(bpEntryGate(null, null)).toEqual({ allow: true });
  });

  test("full-body up bar blocks once, then the next completed bar allows the same setup", () => {
    const state = initialBarBuilderState();
    state.closed.push(bar({ ts_open_ms: 300_000, o: 100, h: 101, l: 100, c: 101 }));
    const first = bpEntryOverlay(state, null, null, 600_000);
    expect(first.verdict.allow).toBe(false);
    const same = bpEntryOverlay(state, first.deferred_bar_ts_open_ms, null, 620_000);
    expect(same.verdict.allow).toBe(false);
    state.closed.push(bar({ ts_open_ms: 600_000, o: 101, h: 102, l: 101, c: 102 }));
    const next = bpEntryOverlay(state, first.deferred_bar_ts_open_ms, null, 900_000);
    expect(next.verdict).toEqual({ allow: true });
    expect(next.deferred_bar_ts_open_ms).toBeNull();
    expect(bpEntryOverlay(state, null, next.bypass_bar_ts_open_ms, 920_000).verdict).toEqual({ allow: true });
  });

  test("a lapsed setup cannot spend stale deferral credit on a later extreme bar", () => {
    const state = initialBarBuilderState();
    state.closed.push(bar({ ts_open_ms: 300_000, o: 100, h: 101, l: 100, c: 101 }));
    const first = bpEntryOverlay(state, null, null, 600_000);
    expect(first.verdict.allow).toBe(false);
    state.closed.push(bar({ ts_open_ms: 900_000, o: 100, h: 102, l: 100, c: 102 }));
    const later = bpEntryOverlay(state, first.deferred_bar_ts_open_ms, null, 1_200_000);
    expect(later.verdict.allow).toBe(false);
    expect(later.deferred_bar_ts_open_ms).toBe(900_000);
    expect(later.bypass_bar_ts_open_ms).toBeNull();
  });
});
