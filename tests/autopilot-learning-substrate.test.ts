/// <reference types="bun" />

/**
 * Learning substrate (Day 1 of docs/roadmap/2026-07-03-learning-loop-plan.md):
 * params-as-data behind hard clamps with a changelog, post-exit counterfactual
 * marks, and the attribution join. All pure or against a temp store file.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildAttribution } from "../src/autopilot/attribution";
import { decide, dueExitWatchMarks, UNIVERSE, type DecisionInput } from "../src/autopilot/daemon";
import type { MarketFeedRow } from "../src/autopilot/feed";
import {
  DEFAULT_STRATEGY_PARAMS,
  PARAM_CLAMPS,
  paramsAtTime,
  sanitizeParams,
  validateChangeset,
  type ParamChangelogEntry,
} from "../src/autopilot/params";
import {
  __resetAutopilotStoreForTests,
  autopilotStore,
  DEFAULT_AUTOPILOT_CAPS,
  type BotDecisionRow,
  type BotStateRow,
  type BotTradeRow,
  type ExitWatchRow,
} from "../src/autopilot/store";

const SOL = UNIVERSE[0];
const NOW = Date.parse("2026-07-03T12:00:00Z");

let prevDb: string | undefined;

beforeEach(() => {
  prevDb = process.env.AUTOPILOT_DB;
  process.env.AUTOPILOT_DB = join(mkdtempSync(join(tmpdir(), "mm-learning-")), "autopilot.db.json");
  __resetAutopilotStoreForTests();
});

afterEach(() => {
  if (prevDb === undefined) delete process.env.AUTOPILOT_DB;
  else process.env.AUTOPILOT_DB = prevDb;
  __resetAutopilotStoreForTests();
});

describe("param rails", () => {
  const noBudget = { now_ms: NOW, last_analyst_change_ts: null };

  test("GIVEN an in-rail changeset THEN it validates", () => {
    expect(validateChangeset({ entry_min_h24_pct: 3.5, max_trades_per_day: 7 }, "analyst", noBudget)).toEqual({ ok: true });
  });

  test("GIVEN values outside the rails or unknown keys THEN rejection names the rail", () => {
    const over = validateChangeset({ max_trades_per_day: 50 }, "analyst", noBudget);
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.error).toContain("[3, 10]");
    expect(validateChangeset({ max_trade_usd: 500 } as never, "analyst", noBudget).ok).toBe(false); // constitution is not a param
    expect(validateChangeset({}, "analyst", noBudget).ok).toBe(false);
    expect(validateChangeset({ max_trades_per_day: 5.5 }, "analyst", noBudget).ok).toBe(false); // integer key
    expect(validateChangeset({ entry_pullback_min_pct: -0.4, entry_pullback_max_pct: -0.5 }, "analyst", noBudget).ok).toBe(false); // inverted band
  });

  test("GIVEN the Analyst already changed params today THEN a second changeset is refused; operator is not day-limited", () => {
    const budget = { now_ms: NOW, last_analyst_change_ts: new Date(NOW - 60_000).toISOString() };
    const analyst = validateChangeset({ take_profit_r: 2.5 }, "analyst", budget);
    expect(analyst.ok).toBe(false);
    if (!analyst.ok) expect(analyst.error).toContain("one changeset today");
    expect(validateChangeset({ take_profit_r: 2.5 }, "operator", budget)).toEqual({ ok: true });
  });

  test("GIVEN a corrupt or hand-edited store THEN sanitizeParams clamps every value back inside the rails", () => {
    const params = sanitizeParams({ entry_min_h24_pct: 99, max_trades_per_day: -3, min_stop_pct: "junk", extra: 1 });
    expect(params.entry_min_h24_pct).toBe(PARAM_CLAMPS.entry_min_h24_pct.max);
    expect(params.max_trades_per_day).toBe(PARAM_CLAMPS.max_trades_per_day.min);
    expect(params.min_stop_pct).toBe(DEFAULT_STRATEGY_PARAMS.min_stop_pct);
  });

  test("GIVEN a changelog THEN paramsAtTime reconstructs the values active at any past entry", () => {
    const changelog: ParamChangelogEntry[] = [
      { id: "1", ts: new Date(NOW - 2 * 86_400_000).toISOString(), source: "analyst", reason: "widen", changes: { take_profit_r: { from: 2.0, to: 2.5 } } },
      { id: "2", ts: new Date(NOW - 1 * 86_400_000).toISOString(), source: "revert", reason: "degraded", changes: { take_profit_r: { from: 2.5, to: 2.0 } } },
    ];
    expect(paramsAtTime(changelog, NOW - 3 * 86_400_000).take_profit_r).toBe(2.0); // before any change
    expect(paramsAtTime(changelog, NOW - 1.5 * 86_400_000).take_profit_r).toBe(2.5); // between
    expect(paramsAtTime(changelog, NOW).take_profit_r).toBe(2.0); // after revert
  });

  test("GIVEN the store WHEN a changeset applies THEN values persist, the changelog records from→to, and no-ops are refused", () => {
    const store = autopilotStore();
    expect(store.strategyParams()).toEqual(DEFAULT_STRATEGY_PARAMS);

    const applied = store.applyParamChangeset({ entry_min_h24_pct: 3.0 }, "analyst", "24h gate too loose per attribution", NOW);
    expect(applied.ok).toBe(true);
    expect(store.strategyParams().entry_min_h24_pct).toBe(3.0);
    const log = store.paramChangelog();
    expect(log).toHaveLength(1);
    expect(log[0].changes.entry_min_h24_pct).toEqual({ from: 2.5, to: 3.0 });

    // Same value again → refused as a phantom change.
    const noop = store.applyParamChangeset({ entry_min_h24_pct: 3.0 }, "operator", "noop", NOW + 1000);
    expect(noop.ok).toBe(false);

    // Analyst's second change the same day → refused by the budget.
    const second = store.applyParamChangeset({ take_profit_r: 2.5 }, "analyst", "again", NOW + 2000);
    expect(second.ok).toBe(false);

    __resetAutopilotStoreForTests(); // survive a restart
    expect(autopilotStore().strategyParams().entry_min_h24_pct).toBe(3.0);
  });
});

describe("decide() honors store-backed params", () => {
  function paperState(): BotStateRow {
    return {
      mode: "paper",
      kill_switch: false,
      started_at: new Date(NOW).toISOString(),
      updated_at: new Date(NOW).toISOString(),
      caps: { ...DEFAULT_AUTOPILOT_CAPS },
      wallet_label: null,
      last_tick_at: null,
      daemon_pid: null,
    };
  }

  test("GIVEN a tightened 24h gate THEN the same market that entered before now skips", () => {
    const windows = new Map([[SOL.mint, Array.from({ length: 40 }, (_, index) => 100.4 - (0.4 * index) / 39)]]);
    const feed = new Map<string, MarketFeedRow>([
      ["SOL", { symbol: "SOL", price_usd: 100, change_h1_pct: 1, change_h24_pct: 5, volume_h24_usd: 5e6, liquidity_usd: 2e6 }],
    ]);
    const base: DecisionInput = {
      windows,
      positions: [],
      state: paperState(),
      cash_usd: 1000,
      feed,
      now_ms: NOW,
      trades_today: 0,
      cooldown_until_ms: new Map(),
      loss_streak: 0,
      last_loss_ms: null,
      params: DEFAULT_STRATEGY_PARAMS,
    };
    expect(decide(base).decisions).toHaveLength(1); // launch params: enters

    const tightened = { ...DEFAULT_STRATEGY_PARAMS, entry_min_h24_pct: 6 };
    const result = decide({ ...base, params: tightened });
    expect(result.decisions).toEqual([]);
    expect(result.skipped?.reason).toContain("+6% gate");
  });
});

describe("post-exit counterfactuals", () => {
  test("GIVEN a watch and elapsed time THEN exactly the due marks are reported", () => {
    const watch = { exit_ts: new Date(NOW).toISOString(), mark_30m_usd: null, mark_2h_usd: null, mark_4h_usd: null };
    expect(dueExitWatchMarks(watch, NOW + 10 * 60_000)).toEqual([]);
    expect(dueExitWatchMarks(watch, NOW + 31 * 60_000)).toEqual(["mark_30m_usd"]);
    expect(dueExitWatchMarks({ ...watch, mark_30m_usd: 99 }, NOW + 3 * 60 * 60_000)).toEqual(["mark_2h_usd"]);
    expect(dueExitWatchMarks(watch, NOW + 5 * 60 * 60_000)).toEqual(["mark_30m_usd", "mark_2h_usd", "mark_4h_usd"]);
  });

  test("GIVEN store round trips THEN exit watches persist and update", () => {
    const store = autopilotStore();
    const row = store.appendExitWatch({
      trade_id: "t1",
      mint: SOL.mint,
      symbol: "SOL",
      exit_price_usd: 100,
      exit_ts: new Date(NOW).toISOString(),
      was_loss: true,
    });
    expect(store.openExitWatches()).toHaveLength(1);
    store.updateExitWatch({ ...row, mark_30m_usd: 101, mark_2h_usd: 102, mark_4h_usd: 103, done: true });
    expect(store.openExitWatches()).toHaveLength(0);
    expect(store.exitWatches()[0].mark_2h_usd).toBe(102);
  });
});

describe("attribution", () => {
  const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
  const SIGNALS = { price_usd: 100, short_pct: -0.4, range_pct: 0.8, h1_pct: 1, h24_pct: 5, volume_h24_usd: 5e6, liquidity_usd: 2e6 };

  test("GIVEN trades, decisions, watches, and a changelog THEN trips join everything and the summary aggregates", () => {
    const trades: BotTradeRow[] = [
      { id: "b1", ts: iso(4 * 3_600_000), side: "buy", mint: SOL.mint, symbol: "SOL", qty: 0.25, price_usd: 100, value_usd: 25, fee_usd: 0.075, mode: "paper", reason: "Trend pullback" },
      { id: "s1", ts: iso(3 * 3_600_000), side: "sell", mint: SOL.mint, symbol: "SOL", qty: 0.25, price_usd: 98.5, value_usd: 24.63, fee_usd: 0.074, mode: "paper", reason: "Hard stop: -1.5% from entry." },
      { id: "b2", ts: iso(2 * 3_600_000), side: "buy", mint: "m2", symbol: "JUP", qty: 25, price_usd: 1, value_usd: 25, fee_usd: 0.075, mode: "paper", reason: "Trend pullback" },
      { id: "s2", ts: iso(1 * 3_600_000), side: "sell", mint: "m2", symbol: "JUP", qty: 25, price_usd: 1.03, value_usd: 25.75, fee_usd: 0.077, mode: "paper", reason: "Take profit: +3.0% (2R target)." },
    ];
    const decisions: BotDecisionRow[] = [
      { id: "d1", ts: iso(4 * 3_600_000 - 5_000), symbol: "SOL", verdict: "enter", reason: "r", signals: SIGNALS },
    ];
    const watches: ExitWatchRow[] = [
      { id: "w1", trade_id: "s1", mint: SOL.mint, symbol: "SOL", exit_price_usd: 98.5, exit_ts: iso(3 * 3_600_000), was_loss: true, mark_30m_usd: 99, mark_2h_usd: 100.2, mark_4h_usd: null, done: false },
    ];
    const changelog: ParamChangelogEntry[] = [
      { id: "c1", ts: iso(3.5 * 3_600_000), source: "analyst", reason: "x", changes: { take_profit_r: { from: 2.0, to: 2.5 } } },
    ];

    const { trips, summary } = buildAttribution({ trades, decisions, exit_watches: watches, param_changelog: changelog });
    expect(trips).toHaveLength(2);

    const solTrip = trips.find((trip) => trip.symbol === "SOL")!;
    expect(solTrip.win).toBe(false);
    expect(solTrip.entry_signals).toEqual(SIGNALS); // joined via the trace
    expect(solTrip.params_at_entry.take_profit_r).toBe(2.0); // entry predates the change
    expect(solTrip.premature_stop).toBe(true); // 100.2 > 98.5 * 1.01

    const jupTrip = trips.find((trip) => trip.symbol === "JUP")!;
    expect(jupTrip.win).toBe(true);
    expect(jupTrip.params_at_entry.take_profit_r).toBe(2.5); // entry after the change
    expect(jupTrip.entry_signals).toBeNull(); // no trace row: stays honest

    expect(summary.round_trips).toBe(2);
    expect(summary.win_rate).toBe(0.5);
    expect(summary.premature_stops).toBe(1);
    expect(summary.expectancy_usd).not.toBeNull();
    expect(summary.by_symbol.map((row) => row.symbol)).toEqual(["JUP", "SOL"]);
  });
});
