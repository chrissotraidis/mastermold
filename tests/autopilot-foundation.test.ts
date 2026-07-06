/// <reference types="bun" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as storeModule from "../src/autopilot/store";
import {
  __resetAutopilotStoreForTests,
  autopilotStore,
  DEFAULT_AUTOPILOT_CAPS,
} from "../src/autopilot/store";
import {
  getAutopilotState,
  MAX_TRADE_USD_HARD_BOUND,
  setKillSwitch,
  setMode,
  updateCaps,
} from "../src/autopilot/control";

let prevDb: string | undefined;

beforeEach(() => {
  prevDb = process.env.AUTOPILOT_DB;
  // Unique temp db file per test so cases don't bleed into each other.
  const dir = mkdtempSync(join(tmpdir(), "mm-autopilot-"));
  process.env.AUTOPILOT_DB = join(dir, "autopilot.db.json");
  __resetAutopilotStoreForTests();
});

afterEach(() => {
  if (prevDb === undefined) delete process.env.AUTOPILOT_DB;
  else process.env.AUTOPILOT_DB = prevDb;
  __resetAutopilotStoreForTests();
});

/** Simulate a server restart: drop the singleton so autopilotStore() reopens the db file. */
function restart() {
  __resetAutopilotStoreForTests();
}

describe("autopilot foundation (slice C3)", () => {
  test("GIVEN a fresh bot DB WHEN the store opens THEN safe defaults are seeded", () => {
    const state = autopilotStore().botState();

    expect(state.mode).toBe("off");
    expect(state.kill_switch).toBe(false);
    expect(state.started_at).toBeNull();
    expect(state.wallet_label).toBeNull();
    expect(state.caps).toEqual({
      max_trade_usd: 25,
      daily_loss_limit_usd: 50,
      daily_spend_limit_usd: 100,
      max_positions: 5,
      drawdown_halt_pct: 20,
      reserve_floor_sol: 0.05,
    });
    expect(state.caps).toEqual(DEFAULT_AUTOPILOT_CAPS);

    // Equity is seeded with a single origin point so the chart always draws.
    const equity = autopilotStore().equitySeries();
    expect(equity).toHaveLength(1);
    expect(equity[0].equity_usd).toBe(0);

    expect(autopilotStore().trades()).toHaveLength(0);
    expect(autopilotStore().positions()).toHaveLength(0);
    expect(autopilotStore().activity()).toHaveLength(0);

    const view = getAutopilotState();
    expect(view.open_positions).toBe(0);
    expect(view.equity_usd).toBe(0);
    expect(view.last_activity).toBeNull();
  });

  test("GIVEN the kill switch is engaged WHEN the store reopens THEN the halt persists and release never auto-resumes", () => {
    const killed = setKillSwitch(true);
    expect(killed.ok).toBe(true);
    expect(killed.state.mode).toBe("halted");
    expect(killed.state.kill_switch).toBe(true);

    restart();

    const reopened = getAutopilotState();
    expect(reopened.mode).toBe("halted");
    expect(reopened.kill_switch).toBe(true);

    // Releasing the kill switch returns to "off", never straight back to "paper".
    const released = setKillSwitch(false);
    expect(released.state.kill_switch).toBe(false);
    expect(released.state.mode).toBe("off");
    expect(released.state.started_at).toBeNull();
  });

  test("GIVEN the trades ledger WHEN rows are appended THEN they persist and no update/delete path exists", () => {
    const first = autopilotStore().appendTrade({
      side: "buy",
      mint: "So11111111111111111111111111111111111111112",
      symbol: "SOL",
      qty: 0.1,
      price_usd: 150,
      value_usd: 15,
      fee_usd: 0.02,
      reason: "test fixture entry",
    });
    autopilotStore().appendTrade({
      side: "sell",
      mint: "So11111111111111111111111111111111111111112",
      symbol: "SOL",
      qty: 0.1,
      price_usd: 155,
      value_usd: 15.5,
      fee_usd: 0.02,
      reason: "test fixture exit",
    });

    expect(first.mode).toBe("paper");

    restart();

    const rows = autopilotStore().trades();
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.id)).toContain(first.id);

    // Append-only contract: the store exposes no way to mutate or drop a ledger row.
    const store = autopilotStore() as unknown as Record<string, unknown>;
    for (const forbidden of ["updateTrade", "deleteTrade", "removeTrade", "replaceTrade", "clearTrades"]) {
      expect(store[forbidden]).toBeUndefined();
    }
    const mutatingExports = Object.keys(storeModule).filter((name) =>
      /^(update|delete|remove|replace|clear).*trade/i.test(name),
    );
    expect(mutatingExports).toHaveLength(0);
  });

  test("GIVEN cap edits WHEN values are invalid THEN they are refused and the stored caps hold", () => {
    expect(updateCaps({ max_trade_usd: 0 }).ok).toBe(false);
    expect(updateCaps({ max_trade_usd: -10 }).ok).toBe(false);
    expect(updateCaps({ max_trade_usd: MAX_TRADE_USD_HARD_BOUND + 1 }).ok).toBe(false);
    expect(updateCaps({ daily_loss_limit_usd: -5 }).ok).toBe(false);
    expect(updateCaps({ max_positions: 2.5 }).ok).toBe(false);
    expect(updateCaps({ drawdown_halt_pct: Number.NaN }).ok).toBe(false);
    expect(updateCaps({}).ok).toBe(false);

    // Nothing invalid landed.
    expect(autopilotStore().botState().caps).toEqual(DEFAULT_AUTOPILOT_CAPS);

    // A valid partial edit lands, holds the hard bound, and leaves other caps alone.
    const updated = updateCaps({ max_trade_usd: MAX_TRADE_USD_HARD_BOUND, max_positions: 3 });
    expect(updated.ok).toBe(true);
    expect(updated.state.caps.max_trade_usd).toBe(1000);
    expect(updated.state.caps.max_positions).toBe(3);
    expect(updated.state.caps.daily_loss_limit_usd).toBe(50);
    expect(updated.state.caps.drawdown_halt_pct).toBe(20);

    restart();
    expect(autopilotStore().botState().caps.max_trade_usd).toBe(1000);
  });

  test("GIVEN the kill switch is on WHEN paper mode is requested THEN it is refused until release", () => {
    setKillSwitch(true);

    const refused = setMode("paper");
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.error).toContain("Kill switch");
    }
    expect(refused.state.mode).toBe("halted");
    expect(refused.state.kill_switch).toBe(true);

    setKillSwitch(false);
    expect(getAutopilotState().mode).toBe("off");

    const armed = setMode("paper");
    expect(armed.ok).toBe(true);
    expect(armed.state.mode).toBe("paper");
    expect(armed.state.started_at).not.toBeNull();

    const off = setMode("off");
    expect(off.ok).toBe(true);
    expect(off.state.mode).toBe("off");
    expect(off.state.started_at).toBeNull();
  });
});

describe("store crash safety (atomic transactional writes, clobber-proof opens)", () => {
  test("GIVEN a write that dies mid-transaction THEN prior state survives and the db stays readable and complete", () => {
    const store = autopilotStore();
    store.appendActivity("test", "real data before crash");
    expect(store.activity(5).some((row: { message: string }) => row.message.includes("real data"))).toBe(true);

    // Simulate a process killed mid-write: a multi-step write that fails after
    // its first statement must roll back completely (SQLite atomicity),
    // leaving the prior state — never a torn ledger on disk.
    const internals = store as unknown as {
      transaction<T>(fn: () => T): T;
      db: { prepare(sql: string): { run(...params: unknown[]): unknown } };
    };
    expect(() =>
      internals.transaction(() => {
        internals.db.prepare("INSERT INTO activity (id, ts, data) VALUES (?, ?, ?)").run(
          "half-written",
          new Date().toISOString(),
          JSON.stringify({ id: "half-written", ts: new Date().toISOString(), kind: "test", message: "half-written row" }),
        );
        throw new Error("simulated crash mid-transaction");
      }),
    ).toThrow("simulated crash mid-transaction");

    // The partial write rolled back; reads still serve the real data.
    const messages = store.activity(10).map((row) => row.message);
    expect(messages.some((m) => m.includes("real data"))).toBe(true);
    expect(messages.some((m) => m.includes("half-written"))).toBe(false);

    // A fresh open proves the on-disk file stayed readable and complete, and
    // writes after the failed transaction land on top of the REAL data.
    restart();
    autopilotStore().appendActivity("test", "written after failed transaction");
    const reopened = autopilotStore().activity(10).map((row) => row.message);
    expect(reopened.some((m) => m.includes("real data"))).toBe(true);
    expect(reopened.some((m) => m.includes("after failed transaction"))).toBe(true);
    expect(reopened.some((m) => m.includes("half-written"))).toBe(false);
  });

  test("GIVEN a corrupt/unreadable EXISTING db and NO prior open (fresh process) THEN the store throws instead of defaulting over real data", () => {
    const { writeFileSync } = require("node:fs");

    // A torn legacy JSON store at the configured path: migration refuses it.
    const path = process.env.AUTOPILOT_DB as string;
    writeFileSync(path, "{ torn");
    __resetAutopilotStoreForTests(); // fresh process: no in-memory state
    expect(() => autopilotStore().botState()).toThrow(/refusing to default/);

    // A corrupt SQLite database file: opening throws, never silently recreates.
    const { rmSync } = require("node:fs");
    const dir = mkdtempSync(join(tmpdir(), "mm-autopilot-corrupt-"));
    process.env.AUTOPILOT_DB = join(dir, "autopilot.db.json");
    __resetAutopilotStoreForTests();
    autopilotStore().appendActivity("test", "real data in sqlite");
    __resetAutopilotStoreForTests(); // close the handle before corrupting
    const dbFile = `${process.env.AUTOPILOT_DB}.sqlite`;
    writeFileSync(dbFile, "garbage that is not a database");
    // Drop the WAL sidecars too: with them present SQLite can still RECOVER
    // the committed pages (which is crash safety working, not failing).
    rmSync(`${dbFile}-wal`, { force: true });
    rmSync(`${dbFile}-shm`, { force: true });
    expect(() => autopilotStore().botState()).toThrow(/refusing to default/);
  });
});
