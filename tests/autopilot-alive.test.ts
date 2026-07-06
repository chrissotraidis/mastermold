/// <reference types="bun" />

/**
 * "Autopilot feels alive" slice: heartbeat freshness derivation, the
 * DexScreener feed parser (canned fixture, no network), and the widened
 * cross-chain universe. All pure/local — no external calls in tests.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  DAEMON_LIVE_WITHIN_MS,
  DAEMON_STALE_WITHIN_MS,
  deriveDaemonStatus,
  getAutopilotState,
} from "../src/autopilot/control";
import { biggestWindowMover, UNIVERSE } from "../src/autopilot/daemon";
import { parseMarketFeed } from "../src/autopilot/feed";
import { __resetAutopilotStoreForTests, autopilotStore } from "../src/autopilot/store";

let prevDb: string | undefined;

beforeEach(() => {
  prevDb = process.env.AUTOPILOT_DB;
  const dir = mkdtempSync(join(tmpdir(), "mm-autopilot-alive-"));
  process.env.AUTOPILOT_DB = join(dir, "autopilot.db.json");
  __resetAutopilotStoreForTests();
});

afterEach(() => {
  if (prevDb === undefined) delete process.env.AUTOPILOT_DB;
  else process.env.AUTOPILOT_DB = prevDb;
  __resetAutopilotStoreForTests();
});

describe("daemon heartbeat derivation", () => {
  const now = Date.parse("2026-07-03T12:00:00.000Z");
  const ago = (ms: number) => new Date(now - ms).toISOString();

  test("GIVEN no heartbeat yet THEN the daemon reads offline", () => {
    expect(deriveDaemonStatus(null, now)).toBe("offline");
    expect(deriveDaemonStatus("not-a-timestamp", now)).toBe("offline");
  });

  test("GIVEN tick ages THEN live under 90s, stale under 10min, offline beyond", () => {
    expect(deriveDaemonStatus(ago(0), now)).toBe("live");
    expect(deriveDaemonStatus(ago(24_000), now)).toBe("live");
    expect(deriveDaemonStatus(ago(DAEMON_LIVE_WITHIN_MS - 1), now)).toBe("live");
    expect(deriveDaemonStatus(ago(DAEMON_LIVE_WITHIN_MS), now)).toBe("stale");
    expect(deriveDaemonStatus(ago(5 * 60_000), now)).toBe("stale");
    expect(deriveDaemonStatus(ago(DAEMON_STALE_WITHIN_MS), now)).toBe("offline");
    expect(deriveDaemonStatus(ago(60 * 60_000), now)).toBe("offline");
  });

  test("GIVEN a fresh bot DB THEN last_tick_at defaults null and the state view reads offline", () => {
    expect(autopilotStore().botState().last_tick_at).toBeNull();
    expect(getAutopilotState().daemon).toBe("offline");
  });

  test("GIVEN the daemon stamps a heartbeat THEN it persists and the state view derives live", () => {
    const tickAt = new Date().toISOString();
    autopilotStore().updateBotState({ last_tick_at: tickAt, daemon_pid: 4242 });

    __resetAutopilotStoreForTests(); // simulate a server restart / separate reader

    const view = getAutopilotState();
    expect(view.last_tick_at).toBe(tickAt);
    expect(view.daemon_pid).toBe(4242);
    expect(view.daemon).toBe("live");
  });
});

describe("universe (cross-chain majors)", () => {
  test("GIVEN the widened universe THEN the bridged/wrapped majors are present", () => {
    const byMint = new Map(UNIVERSE.map((asset) => [asset.mint, asset.symbol]));
    expect(byMint.get("7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs")).toBe("WETH");
    expect(byMint.get("3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh")).toBe("WBTC");
    expect(byMint.get("4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R")).toBe("RAY");
    expect(byMint.get("HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3")).toBe("PYTH");
    // The original majors survive the widening.
    expect(byMint.get("So11111111111111111111111111111111111111112")).toBe("SOL");
    expect(UNIVERSE.length).toBe(new Set(UNIVERSE.map((asset) => asset.mint)).size);
  });
});

describe("market feed parser (canned DexScreener shape, no network)", () => {
  const SOL_MINT = "So11111111111111111111111111111111111111112";
  const BONK_MINT = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
  const WIF_MINT = "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm";
  const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

  const fixture = {
    schemaVersion: "1.0.0",
    pairs: [
      // Shallow SOL pair — must lose to the deeper one below.
      {
        chainId: "solana",
        baseToken: { address: SOL_MINT, symbol: "SOL" },
        quoteToken: { address: USDC_MINT, symbol: "USDC" },
        priceUsd: "151.99",
        priceChange: { h1: -0.4, h24: 1.1 },
        volume: { h24: 1_000 },
        liquidity: { usd: 5_000 },
      },
      // Canonical deep SOL pair.
      {
        chainId: "solana",
        baseToken: { address: SOL_MINT, symbol: "SOL" },
        quoteToken: { address: USDC_MINT, symbol: "USDC" },
        priceUsd: "152.34",
        priceChange: { h1: 1.2, h24: -3.4 },
        volume: { h24: 123_456_789 },
        liquidity: { usd: 9_876_543 },
      },
      // Junk-quote pair with spoofed-deep liquidity and an absurd 24h change —
      // the exact shape that produced the live "WETH +499258%" garbage row.
      // Must be dropped by the sane-quote filter despite winning on liquidity.
      {
        chainId: "solana",
        baseToken: { address: SOL_MINT, symbol: "SOL" },
        quoteToken: { address: "JUNKjunkJUNKjunkJUNKjunkJUNKjunkJUNKjunk1", symbol: "SCAM" },
        priceUsd: "152.00",
        priceChange: { h1: 490_864, h24: 499_258 },
        volume: { h24: 3_000_000 },
        liquidity: { usd: 99_999_999 },
      },
      // Same mint on another chain must be ignored.
      {
        chainId: "ethereum",
        baseToken: { address: SOL_MINT, symbol: "SOL" },
        quoteToken: { address: USDC_MINT, symbol: "USDC" },
        priceUsd: "999",
        priceChange: { h1: 50 },
        volume: { h24: 1 },
        liquidity: { usd: 1e12 },
      },
      // BONK with missing optional fields — nullable, not dropped.
      {
        chainId: "solana",
        baseToken: { address: BONK_MINT, symbol: "Bonk" },
        quoteToken: { address: SOL_MINT, symbol: "SOL" },
        priceUsd: "0.0000214",
        priceChange: {},
        volume: {},
      },
      // Sane quote but insane change values: kept, changes nulled by the clamp.
      {
        chainId: "solana",
        baseToken: { address: WIF_MINT, symbol: "WIF" },
        quoteToken: { address: USDC_MINT, symbol: "USDC" },
        priceUsd: "1.72",
        priceChange: { h1: 5_000, h24: -9_999 },
        volume: { h24: 400_000 },
        liquidity: { usd: 800_000 },
      },
      // Garbage rows the parser must survive.
      null,
      { chainId: "solana" },
      { chainId: "solana", baseToken: { address: SOL_MINT }, priceUsd: "not-a-price" },
    ],
  };

  test("GIVEN a DexScreener-shaped body THEN per-asset rows come out defensively parsed", () => {
    const rows = parseMarketFeed(fixture);

    const sol = rows.find((row) => row.symbol === "SOL");
    expect(sol).toBeDefined();
    // Deepest SANE-quote pair wins: the junk-quote pair had 10x the liquidity
    // and the absurd +499258% change, and must not be the one selected.
    expect(sol?.price_usd).toBeCloseTo(152.34, 6);
    expect(sol?.change_h1_pct).toBe(1.2);
    expect(sol?.change_h24_pct).toBe(-3.4);
    expect(sol?.volume_h24_usd).toBe(123_456_789);
    expect(sol?.liquidity_usd).toBe(9_876_543);

    const bonk = rows.find((row) => row.symbol === "BONK");
    expect(bonk?.price_usd).toBeCloseTo(0.0000214, 10);
    expect(bonk?.change_h1_pct).toBeNull();
    expect(bonk?.change_h24_pct).toBeNull();
    expect(bonk?.volume_h24_usd).toBeNull();
    expect(bonk?.liquidity_usd).toBeNull();

    // Sane quote but insane change values: the row survives, changes null out.
    const wif = rows.find((row) => row.symbol === "WIF");
    expect(wif?.price_usd).toBeCloseTo(1.72, 6);
    expect(wif?.change_h1_pct).toBeNull();
    expect(wif?.change_h24_pct).toBeNull();

    // Only universe assets present in the payload appear; nothing invented.
    expect(rows.map((row) => row.symbol).sort()).toEqual(["BONK", "SOL", "WIF"]);
  });

  test("GIVEN garbage or empty bodies THEN the parser returns [] instead of throwing", () => {
    expect(parseMarketFeed(null)).toEqual([]);
    expect(parseMarketFeed("nope")).toEqual([]);
    expect(parseMarketFeed({})).toEqual([]);
    expect(parseMarketFeed({ pairs: "wrong" })).toEqual([]);
  });
});

describe("observation helper", () => {
  test("GIVEN partial price windows THEN the biggest absolute mover is picked", () => {
    const sol = UNIVERSE[0];
    const jup = UNIVERSE[1];
    const windows = new Map<string, number[]>([
      [sol.mint, [100, 101.2]], // +1.2%
      [jup.mint, [1.0, 0.985]], // -1.5% — bigger in absolute terms
    ]);
    const mover = biggestWindowMover(windows);
    expect(mover?.symbol).toBe(jup.symbol);
    expect(mover?.pct).toBeCloseTo(-1.5, 6);
    expect(biggestWindowMover(new Map())).toBeNull();
  });
});
