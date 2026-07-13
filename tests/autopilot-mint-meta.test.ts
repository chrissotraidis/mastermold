/// <reference types="bun" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  decimalsFor,
  fetchMintDecimals,
  parseMintDecimals,
  STATIC_MINT_DECIMALS,
} from "../src/autopilot/mint-meta";
import {
  __resetAutopilotStoreForTests,
  autopilotStore,
} from "../src/autopilot/store";
import { UNIVERSE } from "../src/autopilot/universe";
import { rehearseFill } from "../src/autopilot/rehearsal";

const DYNAMIC_MINT = "DynamicMint111111111111111111111111111111111";

describe("mint decimals", () => {
  test("SPL base64 layout reads the decimals u8 at byte offset 44", () => {
    const bytes = Buffer.alloc(82);
    bytes[44] = 7;
    expect(parseMintDecimals({ result: { value: { data: [bytes.toString("base64"), "base64"] } } })).toBe(7);
    expect(parseMintDecimals({ result: { value: { data: [Buffer.alloc(44).toString("base64"), "base64"] } } })).toBeNull();
  });

  test("parsed account shape is accepted and malformed/out-of-range values fail closed", () => {
    expect(parseMintDecimals({ result: { value: { data: { parsed: { info: { decimals: 6 } } } } } })).toBe(6);
    expect(parseMintDecimals({ result: { value: { data: { parsed: { info: { decimals: 99 } } } } } })).toBeNull();
    expect(parseMintDecimals(null)).toBeNull();
  });

  test("all nine Tier A mints resolve exactly from the former hardcoded map", () => {
    expect(UNIVERSE).toHaveLength(9);
    for (const asset of UNIVERSE) {
      expect(decimalsFor(asset.mint, [])).toBe(STATIC_MINT_DECIMALS[asset.mint]);
    }
  });

  test("dynamic metadata is used after static values and unknown mints fail closed", () => {
    expect(decimalsFor(DYNAMIC_MINT, [])).toBeNull();
    expect(decimalsFor(DYNAMIC_MINT, [{ mint: DYNAMIC_MINT, symbol: "DYN", decimals: 5, resolved_at: "2026-07-12T00:00:00Z" }])).toBe(5);
    expect(decimalsFor(DYNAMIC_MINT, [{ mint: DYNAMIC_MINT, symbol: "DYN", decimals: 22, resolved_at: "2026-07-12T00:00:00Z" }])).toBeNull();
  });

  test("guarded getAccountInfo fetch parses a fixture and never throws", async () => {
    const bytes = Buffer.alloc(82);
    bytes[44] = 8;
    let requestBody = "";
    const result = await fetchMintDecimals(
      DYNAMIC_MINT,
      "https://api.mainnet-beta.solana.com",
      async (_url, init) => {
        requestBody = String(init?.body ?? "");
        return new Response(JSON.stringify({ result: { value: { data: [bytes.toString("base64"), "base64"] } } }), { status: 200 });
      },
    );
    expect(result).toBe(8);
    expect(JSON.parse(requestBody).method).toBe("getAccountInfo");
    expect(await fetchMintDecimals(DYNAMIC_MINT, "https://api.mainnet-beta.solana.com", async () => { throw new Error("offline"); })).toBeNull();
  });

  test("the rehearsal consumer uses cached Tier B decimals and unknown mints still fail closed", async () => {
    const intent = {
      id: "intent",
      ts: "2026-07-12T00:00:00Z",
      mode: "paper" as const,
      action: "buy" as const,
      mint: DYNAMIC_MINT,
      symbol: "DYN",
      price_usd: 1,
      notional_usd: 15,
      qty: null,
      stop_pct: 1.5,
      reason: "test",
      strategy: "v2-trend-pullback" as const,
      signals: { price_usd: 1, short_pct: 0, range_pct: 1, h1_pct: 1, h24_pct: 5, volume_h24_usd: 2e6, liquidity_usd: 1e6 },
    };
    expect(await rehearseFill(intent, { qty: 15, price_usd: 1, value_usd: 15 }, [], async () => { throw new Error("must not fetch"); })).toBeNull();
    const result = await rehearseFill(
      intent,
      { qty: 15, price_usd: 1, value_usd: 15 },
      [{ mint: DYNAMIC_MINT, symbol: "DYN", decimals: 6, resolved_at: "2026-07-12T00:00:00Z" }],
      async () => new Response(JSON.stringify({ inAmount: "15000000", outAmount: "15000000", priceImpactPct: "0" }), { status: 200 }),
    );
    expect(result?.status).toBe("quoted");
    expect(result?.quoted_price_usd).toBe(1);
  });
});

let previousDb: string | undefined;

beforeEach(() => {
  previousDb = process.env.AUTOPILOT_DB;
  process.env.AUTOPILOT_DB = join(mkdtempSync(join(tmpdir(), "mm-mint-meta-")), "autopilot.db.json");
  __resetAutopilotStoreForTests();
});

afterEach(() => {
  if (previousDb === undefined) delete process.env.AUTOPILOT_DB;
  else process.env.AUTOPILOT_DB = previousDb;
  __resetAutopilotStoreForTests();
});

test("mint metadata, denylist, first-seen state, and Tier B rows persist across restart", () => {
  const store = autopilotStore();
  store.upsertMintMeta({ mint: DYNAMIC_MINT, symbol: "DYN", decimals: 5, resolved_at: "2026-07-12T00:00:00Z" });
  store.addTierBDenylistMint("deny-1");
  store.addTierBDenylistMint("deny-1");
  store.setTierBFirstSeen({ [DYNAMIC_MINT]: "2026-06-01T00:00:00Z" });
  store.setTierBLastRotationAt("2026-07-12T00:00:00Z");
  __resetAutopilotStoreForTests();

  const reopened = autopilotStore();
  expect(reopened.mintMeta()).toHaveLength(1);
  expect(reopened.tierBDenylist()).toEqual(["deny-1"]);
  expect(reopened.tierBFirstSeen()[DYNAMIC_MINT]).toBe("2026-06-01T00:00:00Z");
  expect(reopened.tierBLastRotationAt()).toBe("2026-07-12T00:00:00Z");
});
