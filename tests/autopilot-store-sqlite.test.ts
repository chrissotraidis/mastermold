/// <reference types="bun" />

/**
 * SQLite persistence for the autopilot store: lossless JSON migration,
 * two-writer concurrency (the daemon + the Next server share this file),
 * and the widened price-history rolling cap.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  __resetAutopilotStoreForTests,
  autopilotStore,
  AutopilotStore,
} from "../src/autopilot/store";

let prevDb: string | undefined;
let dir: string;

beforeEach(() => {
  prevDb = process.env.AUTOPILOT_DB;
  dir = mkdtempSync(join(tmpdir(), "mm-autopilot-sqlite-"));
  process.env.AUTOPILOT_DB = join(dir, "autopilot.db.json");
  __resetAutopilotStoreForTests();
});

afterEach(() => {
  if (prevDb === undefined) delete process.env.AUTOPILOT_DB;
  else process.env.AUTOPILOT_DB = prevDb;
  __resetAutopilotStoreForTests();
});

/** A fully populated legacy JSON store — one row (at least) in EVERY table. */
function legacyFixture() {
  return {
    bot_state: {
      mode: "paper",
      kill_switch: false,
      started_at: "2026-07-01T09:00:00.000Z",
      updated_at: "2026-07-02T10:00:00.000Z",
      caps: {
        max_trade_usd: 30,
        daily_loss_limit_usd: 60,
        daily_spend_limit_usd: 120,
        max_positions: 4,
        drawdown_halt_pct: 15,
        reserve_floor_sol: 0.07,
      },
      wallet_label: "canary",
      last_tick_at: "2026-07-02T10:00:00.000Z",
      daemon_pid: 4242,
      last_analyst_run_at: "2026-07-02T00:00:05.000Z",
    },
    trades: [
      {
        id: "trade-entry-1",
        ts: "2026-07-01T10:00:00.000Z",
        side: "buy",
        mint: "So11111111111111111111111111111111111111112",
        symbol: "SOL",
        qty: 0.1,
        price_usd: 150,
        value_usd: 15,
        fee_usd: 0.02,
        mode: "paper",
        reason: "fixture entry",
      },
      {
        id: "trade-exit-1",
        ts: "2026-07-01T12:00:00.000Z",
        side: "sell",
        mint: "So11111111111111111111111111111111111111112",
        symbol: "SOL",
        qty: 0.1,
        price_usd: 156,
        value_usd: 15.6,
        fee_usd: 0.02,
        mode: "live",
        reason: "fixture exit",
        signature: "5fixtureSignature",
      },
    ],
    positions: [
      {
        mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
        symbol: "JUP",
        qty: 12,
        avg_cost_usd: 0.8,
        stop_pct: 2.1,
        peak_usd: 0.95,
        opened_at: "2026-07-02T08:00:00.000Z",
        updated_at: "2026-07-02T09:59:40.000Z",
      },
    ],
    equity_points: [
      { ts: "2026-07-01T09:00:00.000Z", equity_usd: 1000 },
      { ts: "2026-07-02T09:00:00.000Z", equity_usd: 1004.5 },
    ],
    activity: [
      { id: "act-1", ts: "2026-07-01T09:00:01.000Z", kind: "mode", message: "Paper mode armed" },
      { id: "act-2", ts: "2026-07-01T10:00:00.000Z", kind: "trade", message: "Entered SOL" },
    ],
    web3_memory: [
      { id: "w3m-1", ts: "2026-07-01T11:00:00.000Z", symbol: "SOL", kind: "lesson", summary: "Fixture lesson survives migration" },
    ],
    decisions: [
      {
        id: "dec-1",
        ts: "2026-07-01T10:00:00.000Z",
        symbol: "SOL",
        verdict: "enter",
        reason: "fixture decision",
        signals: {
          price_usd: 150,
          short_pct: -0.4,
          range_pct: 1.1,
          h1_pct: 0.6,
          h24_pct: 4.2,
          volume_h24_usd: 900_000,
          liquidity_usd: 500_000,
        },
      },
    ],
    strategy_params: { max_trades_per_day: 4 },
    param_changelog: [
      {
        id: "pch-1",
        ts: "2026-07-01T13:00:00.000Z",
        source: "operator",
        reason: "fixture change",
        changes: { max_trades_per_day: { from: 5, to: 4 } },
      },
    ],
    exit_watches: [
      {
        id: "exw-1",
        trade_id: "trade-exit-1",
        mint: "So11111111111111111111111111111111111111112",
        symbol: "SOL",
        exit_price_usd: 156,
        exit_ts: "2026-07-01T12:00:00.000Z",
        was_loss: false,
        mark_30m_usd: 155.2,
        mark_2h_usd: null,
        mark_4h_usd: null,
        done: false,
      },
    ],
    analyst_memo: { ts: "2026-07-02T00:00:05.000Z", memo: "Fixture analyst memo" },
    candidate_snapshots: [
      {
        id: "cnd-1",
        ts: "2026-07-02T09:30:00.000Z",
        strategy_id: "v3-xsec",
        token_mint: "So11111111111111111111111111111111111111112",
        symbol: "SOL",
        decision: "skip",
        skip_reason: "fixture gate",
        features: { volume_z: 1.4, trending: true, bucket: "mid" },
        cost_total_bps: 60,
        expected_value_bps: 12.5,
        confidence: 0.61,
        price_usd_at_snapshot: 150,
        return_30m_bps: 42,
        return_2h_bps: null,
        return_6h_bps: null,
        max_adverse_2h_bps: -12,
        max_favorable_2h_bps: 55,
        labeled: false,
      },
    ],
    price_history: [
      { ts: "2026-07-02T09:58:00.000Z", prices: { So11111111111111111111111111111111111111112: 150.2 } },
      { ts: "2026-07-02T09:59:00.000Z", prices: { So11111111111111111111111111111111111111112: 150.4 } },
    ],
    volume_baselines: { So11111111111111111111111111111111111111112: 875_000 },
  };
}

describe("JSON → SQLite migration (lossless)", () => {
  test("GIVEN a legacy JSON store WHEN the store opens THEN every table round-trips, the JSON becomes a backup, and the migration is logged", () => {
    const jsonPath = process.env.AUTOPILOT_DB as string;
    const fixture = legacyFixture();
    writeFileSync(jsonPath, JSON.stringify(fixture, null, 2));

    const store = autopilotStore();

    // Files: sqlite sibling created, original renamed to a backup, byte-identical.
    expect(existsSync(`${jsonPath}.sqlite`)).toBe(true);
    expect(existsSync(jsonPath)).toBe(false);
    expect(existsSync(`${jsonPath}.migrated-backup`)).toBe(true);
    expect(JSON.parse(readFileSync(`${jsonPath}.migrated-backup`, "utf8"))).toEqual(fixture);

    // bot_state (singleton) — the full row including caps survives.
    expect(store.botState()).toEqual(fixture.bot_state as ReturnType<typeof store.botState>);

    // trades — every row, newest first, live signature intact.
    const trades = store.trades();
    expect(trades).toHaveLength(2);
    expect(trades[0]).toEqual(fixture.trades[1] as (typeof trades)[number]);
    expect(trades[1]).toEqual(fixture.trades[0] as (typeof trades)[number]);

    // positions — including the v2 stop/peak fields.
    expect(store.positions()).toEqual(fixture.positions as ReturnType<typeof store.positions>);

    // equity — chronological, both points.
    expect(store.equitySeries()).toEqual(fixture.equity_points);

    // activity — the fixture rows PLUS the one migration marker row.
    const activity = store.activity(10);
    expect(activity.some((row) => row.message === "Store migrated to SQLite")).toBe(true);
    expect(activity.filter((row) => row.id === "act-1" || row.id === "act-2")).toHaveLength(2);

    // web3 memory, decisions (with full signal snapshots), changelog.
    expect(store.web3Memory()).toEqual(fixture.web3_memory as ReturnType<typeof store.web3Memory>);
    expect(store.decisions()).toEqual(fixture.decisions as ReturnType<typeof store.decisions>);
    expect(store.paramChangelog()).toEqual(fixture.param_changelog as ReturnType<typeof store.paramChangelog>);

    // strategy params — raw stored value read back through the clamps.
    expect(store.strategyParams().max_trades_per_day).toBe(4);

    // exit watches, analyst memo, candidate snapshots (features + labels).
    expect(store.exitWatches()).toEqual(fixture.exit_watches as ReturnType<typeof store.exitWatches>);
    expect(store.openExitWatches()).toHaveLength(1);
    expect(store.analystMemo()).toEqual(fixture.analyst_memo);
    expect(store.candidateSnapshots()).toEqual(fixture.candidate_snapshots as ReturnType<typeof store.candidateSnapshots>);

    // price history + volume baselines.
    expect(store.priceHistory()).toEqual(fixture.price_history);
    expect(store.volumeBaselines()).toEqual(fixture.volume_baselines);
  });

  test("GIVEN a migrated store WHEN it reopens THEN it reads the sqlite db directly and never re-migrates over new writes", () => {
    const jsonPath = process.env.AUTOPILOT_DB as string;
    writeFileSync(jsonPath, JSON.stringify(legacyFixture(), null, 2));

    autopilotStore().appendActivity("test", "written after migration");
    __resetAutopilotStoreForTests();

    const reopened = autopilotStore();
    expect(reopened.trades()).toHaveLength(2);
    expect(reopened.activity(10).some((row) => row.message === "written after migration")).toBe(true);
    // Exactly one migration marker: the second open did not migrate again.
    expect(reopened.activity(50).filter((row) => row.message === "Store migrated to SQLite")).toHaveLength(1);
  });

  test("GIVEN a path that already names a database file THEN the store uses it directly with no sibling", () => {
    process.env.AUTOPILOT_DB = join(dir, "autopilot.sqlite");
    __resetAutopilotStoreForTests();

    autopilotStore().appendActivity("test", "direct sqlite path");
    expect(existsSync(join(dir, "autopilot.sqlite"))).toBe(true);
    expect(existsSync(join(dir, "autopilot.sqlite.sqlite"))).toBe(false);
    expect(autopilotStore().botState().mode).toBe("off");
  });
});

describe("two-writer concurrency (daemon + server on one db)", () => {
  test("GIVEN two open handles on the same path WHEN writes interleave THEN no appended row is lost", () => {
    const path = process.env.AUTOPILOT_DB as string;
    const daemonHandle = new AutopilotStore(path);
    const serverHandle = new AutopilotStore(path);
    try {
      for (let i = 0; i < 25; i++) {
        daemonHandle.appendTrade({
          id: `daemon-trade-${i}`,
          side: "buy",
          mint: "So11111111111111111111111111111111111111112",
          symbol: "SOL",
          qty: 0.01,
          price_usd: 150 + i,
          value_usd: 1.5,
          fee_usd: 0.01,
          reason: "daemon tick",
        });
        serverHandle.appendTrade({
          id: `server-trade-${i}`,
          side: "sell",
          mint: "So11111111111111111111111111111111111111112",
          symbol: "SOL",
          qty: 0.01,
          price_usd: 150 + i,
          value_usd: 1.5,
          fee_usd: 0.01,
          reason: "control plane",
        });
        daemonHandle.appendActivity("tick", `daemon activity ${i}`);
        serverHandle.appendActivity("control", `server activity ${i}`);
      }

      // The JSON store's read-modify-write would have lost updates here; with
      // one row per INSERT under WAL, both handles see every append.
      for (const handle of [daemonHandle, serverHandle]) {
        const ids = handle.trades(200).map((row) => row.id);
        expect(ids).toHaveLength(50);
        for (let i = 0; i < 25; i++) {
          expect(ids).toContain(`daemon-trade-${i}`);
          expect(ids).toContain(`server-trade-${i}`);
        }
        expect(handle.activity(200)).toHaveLength(50);
      }

      // Control-plane state writes from either handle are visible to both.
      serverHandle.updateBotState({ wallet_label: "from-server" });
      expect(daemonHandle.botState().wallet_label).toBe("from-server");
    } finally {
      daemonHandle.close();
      serverHandle.close();
    }
  });
});

describe("price history rolling cap", () => {
  test("GIVEN more rows than the cap THEN only the newest 2,016 bars survive (~7 days at 5-minute cadence)", () => {
    const store = autopilotStore();
    const base = Date.parse("2026-07-02T00:00:00.000Z");
    for (let i = 0; i < 2_066; i++) {
      store.appendPriceHistory({ mint: i }, new Date(base + i * 5 * 60_000).toISOString());
    }
    const rows = store.priceHistory();
    // Sized for the go-live gate's SOL benchmark, which needs ≥2.5 days of
    // span — the old 900-minute-bar cap (15h) could never satisfy it.
    expect(rows).toHaveLength(2_016);
    expect(rows[0].prices.mint).toBe(50); // the oldest 50 aged out
    expect(rows[rows.length - 1].prices.mint).toBe(2_065);
  });
});
