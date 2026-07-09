/**
 * Live market feed for the Autopilot panel (PAPER ONLY, read-only data).
 *
 * Keyless DexScreener GETs, one per universe mint:
 *   GET https://api.dexscreener.com/latest/dex/tokens/{mint}
 * Per-mint (not batched) because the endpoint caps the pair list per response,
 * and a multi-mint query crowds deep majors like SOL out entirely. With the
 * 60s cache that's ≤9 requests a minute against a 300 req/min bucket — noise
 * (docs/research/2026-07-02-autopilot-alpha-stack.md §1.3). No keys, no
 * signing, no writes: this module only turns public pair snapshots into
 * per-asset rows for the "Live market feed" list.
 *
 * Defensive by construction: a canned-fixture-testable pure parser, a 10s
 * fetch timeout, and a 60s in-memory cache so page loads never hammer the
 * API. Failures degrade to [] — the /api/autopilot endpoint must never fail
 * because DexScreener hiccuped.
 */

import { UNIVERSE } from "./universe";

export type MarketFeedRow = {
  symbol: string;
  price_usd: number;
  change_h1_pct: number | null;
  change_h24_pct: number | null;
  volume_h24_usd: number | null;
  liquidity_usd: number | null;
};

const FEED_URL = "https://api.dexscreener.com/latest/dex/tokens/";
const FETCH_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 60_000;
/** After a failed fetch, wait this long before retrying (still returns []). */
const FAILURE_COOLDOWN_MS = 15_000;

type UniverseAsset = { symbol: string; mint: string };

function asFiniteNumber(value: unknown): number | null {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
}

/**
 * Pure parser over a DexScreener-shaped `{ pairs: [...] }` body. For each
 * universe mint it picks the deepest Solana pair whose base token is that
 * mint (many pairs quote the same token; liquidity picks the canonical one).
 * Rows without a usable price are dropped; every other field is nullable.
 */
/** Only pairs quoted in these are trusted: junk-quote pairs can carry deep
 * (sometimes spoofed) liquidity and absurd priceChange values — the first
 * live decision log caught a "WETH +499258% (24h)" row from exactly that. */
const SANE_QUOTE_MINTS = new Set([
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
  "So11111111111111111111111111111111111111112", // SOL
]);

/** Percent-change sanity clamps: beyond these, treat the value as unknown. */
const MAX_SANE_H1_PCT = 50;
const MAX_SANE_H24_PCT = 500;

function saneChange(value: number | null, limit: number): number | null {
  return value === null || Math.abs(value) > limit ? null : value;
}

export function parseMarketFeed(body: unknown, universe: UniverseAsset[] = UNIVERSE): MarketFeedRow[] {
  const pairs =
    body && typeof body === "object" && Array.isArray((body as { pairs?: unknown }).pairs)
      ? ((body as { pairs: unknown[] }).pairs as Array<Record<string, unknown>>)
      : [];

  const rows: MarketFeedRow[] = [];
  for (const { symbol, mint } of universe) {
    let best: { row: MarketFeedRow; liquidity: number } | null = null;
    for (const pair of pairs) {
      if (!pair || typeof pair !== "object") continue;
      if (pair.chainId !== "solana") continue;
      const base = pair.baseToken as Record<string, unknown> | undefined;
      if (!base || typeof base !== "object" || base.address !== mint) continue;
      // Every universe mint has a USDC/USDT/SOL pair, so pairs with any other
      // quote are safely droppable.
      const quote = pair.quoteToken as Record<string, unknown> | undefined;
      const quoteAddress = quote && typeof quote === "object" ? quote.address : null;
      if (typeof quoteAddress !== "string" || !SANE_QUOTE_MINTS.has(quoteAddress)) continue;

      const price = asFiniteNumber(pair.priceUsd);
      if (price === null || price <= 0) continue;

      const change = (pair.priceChange ?? {}) as Record<string, unknown>;
      const volume = (pair.volume ?? {}) as Record<string, unknown>;
      const liquidity = (pair.liquidity ?? {}) as Record<string, unknown>;
      const liquidityUsd = asFiniteNumber(liquidity.usd);

      const row: MarketFeedRow = {
        symbol,
        price_usd: price,
        change_h1_pct: saneChange(asFiniteNumber(change.h1), MAX_SANE_H1_PCT),
        change_h24_pct: saneChange(asFiniteNumber(change.h24), MAX_SANE_H24_PCT),
        volume_h24_usd: asFiniteNumber(volume.h24),
        liquidity_usd: liquidityUsd,
      };
      if (!best || (liquidityUsd ?? 0) > best.liquidity) {
        best = { row, liquidity: liquidityUsd ?? 0 };
      }
    }
    if (best) rows.push(best.row);
  }
  return rows;
}

export type TokenSummary = {
  mint: string;
  symbol: string;
  price_usd: number;
  liquidity_usd: number | null;
  volume_h24_usd: number | null;
};

/** Pure: summarize one arbitrary mint from a DexScreener token-pairs body —
 * deepest sane-quote pair wins, symbol comes from the pair's own base token.
 * Used by the copy_wallets shell to price tokens outside the majors universe. */
export function parseTokenSummary(body: unknown, mint: string): TokenSummary | null {
  const pairs =
    body && typeof body === "object" && Array.isArray((body as { pairs?: unknown }).pairs)
      ? ((body as { pairs: unknown[] }).pairs as Array<Record<string, unknown>>)
      : [];
  let best: { summary: TokenSummary; liquidity: number } | null = null;
  for (const pair of pairs) {
    if (!pair || typeof pair !== "object" || pair.chainId !== "solana") continue;
    const base = pair.baseToken as Record<string, unknown> | undefined;
    if (!base || base.address !== mint) continue;
    const quote = pair.quoteToken as Record<string, unknown> | undefined;
    const quoteAddress = quote && typeof quote === "object" ? quote.address : null;
    if (typeof quoteAddress !== "string" || !SANE_QUOTE_MINTS.has(quoteAddress)) continue;
    const price = asFiniteNumber(pair.priceUsd);
    if (price === null || price <= 0) continue;
    const liquidity = asFiniteNumber(((pair.liquidity ?? {}) as Record<string, unknown>).usd);
    const summary: TokenSummary = {
      mint,
      symbol: (typeof base.symbol === "string" && base.symbol ? base.symbol : mint.slice(0, 6)).slice(0, 12),
      price_usd: price,
      liquidity_usd: liquidity,
      volume_h24_usd: asFiniteNumber(((pair.volume ?? {}) as Record<string, unknown>).h24),
    };
    if (!best || (liquidity ?? 0) > best.liquidity) best = { summary, liquidity: liquidity ?? 0 };
  }
  return best?.summary ?? null;
}

/** Fetch one off-universe token's market summary. Never throws; null on any
 * failure. Uncached — callers budget their own request counts. */
export async function fetchTokenSummary(mint: string, doFetch: typeof fetch = fetch): Promise<TokenSummary | null> {
  try {
    const response = await doFetch(`${FEED_URL}${mint}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return parseTokenSummary(await response.json(), mint);
  } catch {
    return null;
  }
}

let cache: { rows: MarketFeedRow[]; fetchedAtMs: number; ok: boolean } | null = null;

/** Test seam: forget the cached feed so the next fetchMarketFeed() hits the network. */
export function __resetMarketFeedCacheForTests(): void {
  cache = null;
}

/**
 * Fetch the per-asset live feed for the paper universe. Cached 60s; any
 * failure (timeout, non-200, bad JSON) returns [] and backs off 15s. Never
 * throws — callers can `market_feed: await fetchMarketFeed()` safely.
 */
export async function fetchMarketFeed(nowMs: number = Date.now()): Promise<MarketFeedRow[]> {
  if (cache && nowMs - cache.fetchedAtMs < (cache.ok ? CACHE_TTL_MS : FAILURE_COOLDOWN_MS)) {
    return cache.rows;
  }

  try {
    // Per-mint fan-out; one slow or failed mint never blanks the others.
    const settled = await Promise.allSettled(
      UNIVERSE.map(async (asset) => {
        const response = await fetch(`${FEED_URL}${asset.mint}`, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!response.ok) throw new Error(`feed fetch ${response.status}`);
        const body = (await response.json()) as { pairs?: unknown };
        return Array.isArray(body?.pairs) ? body.pairs : [];
      }),
    );
    const pairs = settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
    const rows = parseMarketFeed({ pairs });
    cache = { rows, fetchedAtMs: nowMs, ok: rows.length > 0 };
    return rows;
  } catch {
    cache = { rows: [], fetchedAtMs: nowMs, ok: false };
    return [];
  }
}
