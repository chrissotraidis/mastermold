/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { fetchCoinbaseTicker, fetchKrakenTickers, parseCoinbaseTicker, parseKrakenTickers, probeCexListing } from "../src/autopilot/v3/cex-gap-fetch";

describe("keyless CEX ticker shells", () => {
  test("fixture parsers preserve top-of-book and reject crossed books", () => {
    expect(parseCoinbaseTicker({ bid: "99", ask: "101" })).toEqual({ bid: 99, ask: 101 });
    expect(parseCoinbaseTicker({ bid: 102, ask: 101 })).toBeNull();
    expect(parseKrakenTickers({ result: { SOLUSD: { b: ["99", "1"], a: ["101", "1"] } } }, ["SOLUSD"]).get("SOLUSD")).toEqual({ bid: 99, ask: 101 });
  });
  test("Coinbase 404 is an unlisted result, not a thrown/error-spam path", async () => {
    expect(await fetchCoinbaseTicker("NOPE-USD", async () => new Response("", { status: 404 }))).toEqual({ listed: false, book: null });
    expect(await probeCexListing("SOL", "coinbase", async () => Response.json({ bid: "99", ask: "101" }))).toEqual({ pair: "SOL-USD", listed: true });
    expect(await probeCexListing("WETH", "coinbase", async () => Response.json({ bid: "99", ask: "101" }))).toEqual({ pair: "ETH-USD", listed: true });
  });
  test("Kraken listed pairs share one batched ticker request", async () => {
    const urls: string[] = [];
    const books = await fetchKrakenTickers(["SOLUSD", "JUPUSD"], async (input) => { urls.push(String(input)); return Response.json({ result: { SOLUSD: { b: ["99"], a: ["101"] }, JUPUSD: { b: ["0.5"], a: ["0.6"] } } }); });
    expect(urls).toHaveLength(1); expect(books.size).toBe(2); expect(urls[0]).toContain("SOLUSD%2CJUPUSD");
  });
});
