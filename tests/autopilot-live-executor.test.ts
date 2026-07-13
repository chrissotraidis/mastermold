/// <reference types="bun" />

/**
 * Jupiter live-executor slice (autonomy ADR D3): the pure quote→plan parser
 * with its price-impact ceiling, the executor's refusal guards, and the
 * evidence-gated "live" mode flip. No network, no signing in tests.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { setMode } from "../src/autopilot/control";
import { Keypair } from "@solana/web3.js";
import { buildSignedSwap, jupiterLiveExecutor, MAX_PRICE_IMPACT_PCT, planFromQuote, USDC_MINT } from "../src/autopilot/live-executor";
import type { TradeIntent } from "../src/autopilot/intent";
import { __resetAutopilotStoreForTests, autopilotStore } from "../src/autopilot/store";

const SOL_MINT = "So11111111111111111111111111111111111111112";

let prevDb: string | undefined;
let prevSecret: string | undefined;

beforeEach(() => {
  prevDb = process.env.AUTOPILOT_DB;
  prevSecret = process.env.AUTOPILOT_WALLET_SECRET;
  process.env.AUTOPILOT_DB = join(mkdtempSync(join(tmpdir(), "mm-live-exec-")), "autopilot.db.json");
  __resetAutopilotStoreForTests();
});

afterEach(() => {
  if (prevDb === undefined) delete process.env.AUTOPILOT_DB;
  else process.env.AUTOPILOT_DB = prevDb;
  if (prevSecret === undefined) delete process.env.AUTOPILOT_WALLET_SECRET;
  else process.env.AUTOPILOT_WALLET_SECRET = prevSecret;
  __resetAutopilotStoreForTests();
});

function liveIntent(overrides: Partial<TradeIntent> = {}): TradeIntent {
  return {
    id: "int_live_test",
    ts: new Date().toISOString(),
    mode: "live",
    action: "buy",
    mint: SOL_MINT,
    symbol: "SOL",
    price_usd: 82,
    notional_usd: 25,
    qty: null,
    stop_pct: 1.5,
    reason: "test",
    strategy: "v2-trend-pullback",
    signals: { price_usd: 82, short_pct: -0.4, range_pct: 0.8, h1_pct: 1, h24_pct: 5, volume_h24_usd: 5e6, liquidity_usd: 2e6 },
    ...overrides,
  };
}

describe("planFromQuote", () => {
  const args = { side: "buy" as const, token_mint: SOL_MINT, token_decimals: 9 };

  test("GIVEN a buy quote THEN the plan derives mints, amounts, and effective price", () => {
    // 25 USDC in → 0.3 SOL out: effective $83.3333/SOL.
    const planned = planFromQuote(
      { inAmount: "25000000", outAmount: "300000000", priceImpactPct: "0.0005", routePlan: [{ swapInfo: { label: "Orca" } }] },
      args,
    );
    if (!planned.ok) throw new Error(planned.error);
    expect(planned.plan.input_mint).toBe(USDC_MINT);
    expect(planned.plan.output_mint).toBe(SOL_MINT);
    expect(planned.plan.effective_price_usd).toBeCloseTo(83.3333, 3);
    expect(planned.plan.price_impact_pct).toBeCloseTo(0.05, 6);
    expect(planned.plan.route_labels).toEqual(["Orca"]);
  });

  test("GIVEN a sell quote THEN the mints flip", () => {
    const planned = planFromQuote(
      { inAmount: "300000000", outAmount: "24000000" },
      { ...args, side: "sell" },
    );
    if (!planned.ok) throw new Error(planned.error);
    expect(planned.plan.input_mint).toBe(SOL_MINT);
    expect(planned.plan.output_mint).toBe(USDC_MINT);
    expect(planned.plan.effective_price_usd).toBeCloseTo(80, 6);
  });

  test("GIVEN price impact above the ceiling THEN the plan is refused", () => {
    const planned = planFromQuote(
      { inAmount: "25000000", outAmount: "300000000", priceImpactPct: String((MAX_PRICE_IMPACT_PCT + 0.5) / 100) },
      args,
    );
    expect(planned.ok).toBe(false);
    if (!planned.ok) expect(planned.error).toContain("price impact");
  });

  test("GIVEN garbage THEN typed errors, no throws", () => {
    expect(planFromQuote(null, args).ok).toBe(false);
    expect(planFromQuote({}, args).ok).toBe(false);
    expect(planFromQuote({ inAmount: "0", outAmount: "1" }, args).ok).toBe(false);
  });
});

describe("jupiter-live executor guards", () => {
  test("GIVEN cached Tier B decimals THEN the live swap builder reaches the quote path; unknown decimals fail before fetch", async () => {
    const mint = "DynamicMint111111111111111111111111111111111";
    const intent = { action: "buy" as const, mint, symbol: "DYN", notional_usd: 15, qty: null };
    let calls = 0;
    const fetch500 = async () => {
      calls += 1;
      return new Response("no", { status: 500 });
    };
    const unknown = await buildSignedSwap(intent, Keypair.generate(), [], fetch500);
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error).toContain("no known decimals");
    expect(calls).toBe(0);

    const cached = await buildSignedSwap(
      intent,
      Keypair.generate(),
      [{ mint, symbol: "DYN", decimals: 6, resolved_at: "2026-07-12T00:00:00Z" }],
      fetch500,
    );
    expect(cached.ok).toBe(false);
    if (!cached.ok) expect(cached.error).toContain("/swap/v1/quote 500");
    expect(calls).toBe(1);
  });

  test("GIVEN a paper intent THEN the live executor refuses it", async () => {
    const result = await jupiterLiveExecutor({ reserve_floor_sol: 0.05 }).execute(liveIntent({ mode: "paper" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("refuses paper intents");
  });

  test("GIVEN no wallet in env THEN the live executor refuses before any network call", async () => {
    delete process.env.AUTOPILOT_WALLET_SECRET;
    const result = await jupiterLiveExecutor({ reserve_floor_sol: 0.05, env: { NODE_ENV: "test" } as NodeJS.ProcessEnv }).execute(liveIntent());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("no live wallet");
  });
});

describe("evidence-gated live mode", () => {
  test("GIVEN a fresh book THEN setMode('live') is refused with the failing gate details", () => {
    delete process.env.AUTOPILOT_WALLET_SECRET; // ensure the wallet check also fails
    const result = setMode("live");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Go-live gate is not open yet");
      expect(result.error).toContain("not provisioned");
    }
    expect(autopilotStore().botState().mode).toBe("off");
  });

  test("GIVEN the kill switch THEN live arming is refused before the gate is even consulted", () => {
    autopilotStore().updateBotState({ kill_switch: true, mode: "halted" });
    const result = setMode("live");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Kill switch");
  });
});
