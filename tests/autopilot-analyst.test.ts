/// <reference types="bun" />

/**
 * The Analyst (Day 2 of the learning-loop plan): output parsing, the
 * auto-revert rule, and a full run against a temp store with an injected
 * completion — proposals apply only through the clamped store path, and a
 * garbage model response degrades instead of corrupting state. No network.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { evaluateRevert, parseAnalystOutput, runAnalyst } from "../src/autopilot/analyst";
import { DEFAULT_STRATEGY_PARAMS, type ParamChangelogEntry } from "../src/autopilot/params";
import { __resetAutopilotStoreForTests, autopilotStore } from "../src/autopilot/store";

const NOW = Date.parse("2026-07-10T00:05:00Z");

let prevDb: string | undefined;

beforeEach(() => {
  prevDb = process.env.AUTOPILOT_DB;
  process.env.AUTOPILOT_DB = join(mkdtempSync(join(tmpdir(), "mm-analyst-")), "autopilot.db.json");
  __resetAutopilotStoreForTests();
});

afterEach(() => {
  if (prevDb === undefined) delete process.env.AUTOPILOT_DB;
  else process.env.AUTOPILOT_DB = prevDb;
  __resetAutopilotStoreForTests();
});

describe("parseAnalystOutput", () => {
  test("GIVEN strict JSON THEN it parses; fenced/wrapped JSON also recovers", () => {
    const body = '{"review":"Quiet day.","lessons":[{"symbol":"SOL","summary":"s"}],"proposal":null}';
    expect(parseAnalystOutput(body)?.review).toBe("Quiet day.");
    expect(parseAnalystOutput("Sure! Here you go:\n```json\n" + body + "\n```")?.lessons).toHaveLength(1);
  });

  test("GIVEN garbage or off-shape output THEN null", () => {
    expect(parseAnalystOutput("not json at all")).toBeNull();
    expect(parseAnalystOutput('{"lessons":[]}')).toBeNull(); // no review
    // Malformed lessons are dropped, not fatal.
    expect(parseAnalystOutput('{"review":"ok","lessons":[{"symbol":1}],"proposal":null}')?.lessons).toEqual([]);
  });
});

describe("evaluateRevert", () => {
  const change: ParamChangelogEntry = {
    id: "c1",
    ts: new Date(NOW - 3 * 86_400_000).toISOString(),
    source: "analyst",
    reason: "loosen pullback",
    changes: { entry_pullback_max_pct: { from: 0.6, to: 1.0 } },
  };
  const trip = (daysAgo: number, net: number) => ({ exit_ts: new Date(NOW - daysAgo * 86_400_000).toISOString(), net_usd: net });

  test("GIVEN expectancy degraded after an old-enough change THEN the reverse changeset comes back", () => {
    const revert = evaluateRevert([change], [trip(5, 0.5), trip(4, 0.4), trip(2, -0.5), trip(1.5, -0.6), trip(1, -0.4)], NOW);
    expect(revert?.changes).toEqual({ entry_pullback_max_pct: 0.6 });
    expect(revert?.reason).toContain("Auto-revert");
  });

  test("GIVEN improvement, too-few trips, a too-fresh change, or an existing revert THEN no revert", () => {
    expect(evaluateRevert([change], [trip(5, -0.5), trip(2, 0.5), trip(1.5, 0.6), trip(1, 0.4)], NOW)).toBeNull(); // improved
    expect(evaluateRevert([change], [trip(5, 0.5), trip(1, -0.4)], NOW)).toBeNull(); // 1 trip after < min 3
    const fresh = { ...change, ts: new Date(NOW - 3_600_000).toISOString() };
    expect(evaluateRevert([fresh], [trip(5, 0.5), trip(0.01, -1), trip(0.02, -1), trip(0.03, -1)], NOW)).toBeNull();
    const reverted: ParamChangelogEntry = { ...change, id: "r1", source: "revert", ts: new Date(NOW - 86_400_000).toISOString() };
    expect(evaluateRevert([change, reverted], [trip(5, 0.5), trip(2, -0.5), trip(1.5, -0.6), trip(1, -0.4)], NOW)).toBeNull();
  });
});

describe("runAnalyst against a temp store", () => {
  test("GIVEN a valid response with an in-rail proposal THEN memo, lessons, and the change all land", async () => {
    const fake = async () =>
      JSON.stringify({
        review: "Two losers on JTO; the pullback band looks too loose for this regime.",
        lessons: [{ symbol: "JTO", summary: "Both JTO losses entered on the widest allowed dip." }],
        proposal: { changes: { entry_pullback_min_pct: -0.8 }, reason: "Tighten the dip floor: both losses entered below -0.8%." },
      });
    const result = await runAnalyst(fake, NOW);
    expect(result.ran).toBe(true);
    expect(result.proposal_applied).toBe(true);

    const store = autopilotStore();
    expect(store.analystMemo()?.memo).toContain("pullback band");
    expect(store.strategyParams().entry_pullback_min_pct).toBe(-0.8);
    expect(store.paramChangelog()[0].source).toBe("analyst");
    expect(store.web3Memory(10).some((row) => row.kind === "lesson" && row.symbol === "JTO")).toBe(true);
  });

  test("GIVEN an out-of-rail proposal THEN the rails refuse it but the memo still lands", async () => {
    const fake = async () =>
      JSON.stringify({ review: "Trying to blow past the rails.", lessons: [], proposal: { changes: { max_trades_per_day: 50 }, reason: "moar" } });
    const result = await runAnalyst(fake, NOW);
    expect(result.ran).toBe(true);
    expect(result.proposal_applied).toBe(false);
    expect(result.proposal_error).toContain("rail");
    expect(autopilotStore().strategyParams().max_trades_per_day).toBe(DEFAULT_STRATEGY_PARAMS.max_trades_per_day);
    expect(autopilotStore().analystMemo()?.memo).toContain("rails");
  });

  test("GIVEN a garbage completion THEN nothing is written and the failure is typed", async () => {
    const result = await runAnalyst(async () => "I am not JSON", NOW);
    expect(result.ran).toBe(false);
    expect(result.error).toContain("not valid JSON");
    expect(autopilotStore().analystMemo()).toBeNull();
    expect(autopilotStore().paramChangelog()).toHaveLength(0);
  });

  test("GIVEN a completion that throws THEN the run degrades without touching state", async () => {
    const result = await runAnalyst(async () => {
      throw new Error("provider down");
    }, NOW);
    expect(result.ran).toBe(false);
    expect(result.error).toContain("provider down");
    expect(autopilotStore().analystMemo()).toBeNull();
  });
});
