/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import cusumFixture from "../engine/ml/fixtures/cusum-parity.json";
import barrierFixture from "../engine/ml/fixtures/barrier-parity.json";
import { cusumStep, initialCusumState } from "../src/autopilot/v3/cusum";
import { labelTripleBarrier, type BarrierLabel } from "../src/autopilot/v3/triple-barrier";

describe("shared TS/Python ML parity fixtures", () => {
  test("CUSUM event indexes, directions, timestamps, magnitudes, and consecutive breaches are exact", () => {
    for (const fixture of cusumFixture.cases) {
      const state = initialCusumState(fixture.prices[0] ?? 0); const events: unknown[] = [];
      for (let index = 1; index < fixture.prices.length; index += 1) {
        const event = cusumStep(state, fixture.prices[index] ?? Number.NaN, fixture.h_pct, index * 300_000);
        if (event) events.push({ index, direction: event.direction, magnitude: Number(event.magnitude.toFixed(12)), ts_ms: event.ts_ms });
      }
      expect(events).toEqual(fixture.events);
    }
  });
  test("triple barriers match including pessimistic ties and vertical labels", () => {
    for (const fixture of barrierFixture.cases) expect(labelTripleBarrier(fixture)).toEqual(fixture.expected as BarrierLabel | null);
  });
});
