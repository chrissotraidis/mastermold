/**
 * Module `trending` — Solana-native flow/attention alpha (2026-07-09).
 *
 * The bot watched nine majors and was blind to where Solana alpha actually
 * happens: tokens trending on-chain right now. This module ingests two
 * KEYLESS public sources and turns them into `CandidateSignal`s for the V3
 * shadow router, so attention-driven candidates are scored, EV-gated, and
 * forward-labeled exactly like every other module — proven before traded.
 *
 *   1. GeckoTerminal trending pools (market data: price, momentum, volume,
 *      reserve): GET api.geckoterminal.com/api/v2/networks/solana/trending_pools
 *   2. DexScreener token boosts (paid-promotion attention, a Moonshot-adjacent
 *      hype proxy): GET api.dexscreener.com/token-boosts/top/v1
 *
 * Same defensive pattern as feed.ts: pure parsers testable on fixtures, a
 * fetch timeout, an in-memory cache, and failures degrading to [] — the
 * daemon and the API route must never fail because a public API hiccuped.
 * Read-only data; nothing here can move funds.
 */

import { toExpectedValue, type CandidateSignal, type ExecutionCost, type MarketRegime } from "./signal";

export type TrendingToken = {
  mint: string;
  symbol: string;
  /** Which sources surfaced it: "gecko_trending", "dex_boosts". */
  sources: string[];
  /** 1-based rank on the trending list (lower = hotter); boosts-only = null. */
  rank: number | null;
  price_usd: number | null;
  price_change_h1_pct: number | null;
  price_change_h24_pct: number | null;
  volume_h24_usd: number | null;
  liquidity_usd: number | null;
  /** Active DexScreener boost points, if any — paid attention. */
  boost_amount: number | null;
  /** The trending pool's address (wallet discovery's keyless trade source). */
  pool_address: string | null;
};

const GECKO_TRENDING_URL = "https://api.geckoterminal.com/api/v2/networks/solana/trending_pools";
const DEX_BOOSTS_URL = "https://api.dexscreener.com/token-boosts/top/v1";
const FETCH_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 5 * 60_000;
const FAILURE_COOLDOWN_MS = 60_000;
/** Keep the radar bounded: majors-adjacent depth, not the whole firehose. */
export const TRENDING_MAX_TOKENS = 12;

/** Stablecoins and wrapped majors are never "trending" in a useful sense. */
export const EXCLUDED_MINTS = new Set([
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
  "So11111111111111111111111111111111111111112", // SOL (the quote side)
]);

function asFiniteNumber(value: unknown): number | null {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
}

/** Pure parser over GeckoTerminal's `{ data: [pool] }` shape. */
export function parseGeckoTrendingPools(body: unknown): TrendingToken[] {
  const data =
    body && typeof body === "object" && Array.isArray((body as { data?: unknown }).data)
      ? ((body as { data: unknown[] }).data as Array<Record<string, unknown>>)
      : [];

  const tokens: TrendingToken[] = [];
  for (const pool of data) {
    if (!pool || typeof pool !== "object") continue;
    const attributes = (pool.attributes ?? {}) as Record<string, unknown>;
    const relationships = (pool.relationships ?? {}) as Record<string, unknown>;
    const baseToken = ((relationships.base_token ?? {}) as Record<string, unknown>).data as
      | Record<string, unknown>
      | undefined;
    const rawId = typeof baseToken?.id === "string" ? baseToken.id : "";
    const mint = rawId.startsWith("solana_") ? rawId.slice("solana_".length) : null;
    if (!mint || EXCLUDED_MINTS.has(mint)) continue;
    if (tokens.some((token) => token.mint === mint)) continue; // one pool per token

    const name = typeof attributes.name === "string" ? attributes.name : "";
    const symbol = name.split("/")[0]?.trim() || mint.slice(0, 6);
    const change = (attributes.price_change_percentage ?? {}) as Record<string, unknown>;
    const volume = (attributes.volume_usd ?? {}) as Record<string, unknown>;

    tokens.push({
      mint,
      symbol: symbol.slice(0, 12),
      sources: ["gecko_trending"],
      rank: tokens.length + 1,
      price_usd: asFiniteNumber(attributes.base_token_price_usd),
      price_change_h1_pct: asFiniteNumber(change.h1),
      price_change_h24_pct: asFiniteNumber(change.h24),
      volume_h24_usd: asFiniteNumber(volume.h24),
      liquidity_usd: asFiniteNumber(attributes.reserve_in_usd),
      boost_amount: null,
      pool_address: typeof attributes.address === "string" ? attributes.address : null,
    });
    if (tokens.length >= TRENDING_MAX_TOKENS) break;
  }
  return tokens;
}

/** Pure parser over DexScreener's token-boosts array (attention only, no
 * market data — merged into trending rows or listed for the radar). */
export function parseDexBoosts(body: unknown): Array<{ mint: string; boost_amount: number }> {
  const rows = Array.isArray(body) ? (body as Array<Record<string, unknown>>) : [];
  const boosts: Array<{ mint: string; boost_amount: number }> = [];
  for (const row of rows) {
    if (!row || typeof row !== "object" || row.chainId !== "solana") continue;
    const mint = typeof row.tokenAddress === "string" ? row.tokenAddress : null;
    const amount = asFiniteNumber(row.totalAmount ?? row.amount);
    if (!mint || amount === null || EXCLUDED_MINTS.has(mint)) continue;
    if (boosts.some((boost) => boost.mint === mint)) continue;
    boosts.push({ mint, boost_amount: amount });
  }
  return boosts;
}

/** Merge boost attention into the market-data rows; boosts for tokens the
 * trending list didn't surface are dropped (no market data → no candidate). */
export function mergeTrendingSources(
  trending: TrendingToken[],
  boosts: Array<{ mint: string; boost_amount: number }>,
): TrendingToken[] {
  return trending.map((token) => {
    const boost = boosts.find((row) => row.mint === token.mint);
    return boost
      ? { ...token, sources: [...token.sources, "dex_boosts"], boost_amount: boost.boost_amount }
      : token;
  });
}

let cache: { tokens: TrendingToken[]; fetchedAtMs: number; ok: boolean } | null = null;

/** Test seam: forget the cache so the next fetch hits the network. */
export function __resetTrendingCacheForTests(): void {
  cache = null;
}

/**
 * Fetch the current Solana trending radar. Cached 5 minutes; every failure
 * path degrades to [] (with a 60s retry cooldown). Never throws.
 */
export async function fetchTrendingTokens(nowMs: number = Date.now()): Promise<TrendingToken[]> {
  if (cache && nowMs - cache.fetchedAtMs < (cache.ok ? CACHE_TTL_MS : FAILURE_COOLDOWN_MS)) {
    return cache.tokens;
  }
  try {
    const [geckoResult, boostsResult] = await Promise.allSettled([
      fetch(GECKO_TRENDING_URL, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }),
      fetch(DEX_BOOSTS_URL, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }),
    ]);
    const geckoBody =
      geckoResult.status === "fulfilled" && geckoResult.value.ok ? await geckoResult.value.json() : null;
    const boostsBody =
      boostsResult.status === "fulfilled" && boostsResult.value.ok ? await boostsResult.value.json() : null;
    const tokens = mergeTrendingSources(parseGeckoTrendingPools(geckoBody), parseDexBoosts(boostsBody));
    cache = { tokens, fetchedAtMs: nowMs, ok: tokens.length > 0 };
    return tokens;
  } catch {
    cache = { tokens: [], fetchedAtMs: nowMs, ok: false };
    return [];
  }
}

/** Liquidity floor below which a trending token is untradeable noise. */
export const TRENDING_MIN_LIQUIDITY_USD = 150_000;
/** 24h volume floor: attention without volume is bots talking to bots. */
export const TRENDING_MIN_VOLUME_USD = 250_000;
/** Composite score floor for emitting a candidate. */
export const TRENDING_SCORE_FLOOR = 1.0;
/** Conservative bps of expected forward return per score point. */
export const TRENDING_BPS_PER_POINT = 35;

export function trendingEnabledIn(regime: MarketRegime): boolean {
  // Attention flow works in risk-on and survives chop; risk-off kills it.
  return regime === "risk_on" || regime === "chop";
}

/** Pure composite score: rank position + momentum alignment + paid attention. */
export function trendingScore(token: TrendingToken): number {
  const rankScore = token.rank !== null ? Math.max(0, (TRENDING_MAX_TOKENS + 1 - token.rank) / TRENDING_MAX_TOKENS) : 0;
  const h1 = token.price_change_h1_pct ?? 0;
  const h24 = token.price_change_h24_pct ?? 0;
  // Same shape as v2's instinct: reward an up-day, punish a straight-up spike.
  const momentum = Math.min(1.5, Math.max(-1, h24 / 20)) + Math.min(0.5, Math.max(-0.5, h1 / 10));
  const spikePenalty = h1 > 15 ? -0.75 : 0;
  const boost = token.boost_amount !== null ? Math.min(0.5, token.boost_amount / 1000) : 0;
  return Math.round((rankScore + momentum + spikePenalty + boost) * 1000) / 1000;
}

/**
 * Build a `CandidateSignal` from a trending token + an execution-cost
 * estimate. Null when it fails the floors — those tokens still show on the
 * radar, they just never reach the router.
 */
export function trendingCandidate(token: TrendingToken, cost: ExecutionCost): CandidateSignal | null {
  if ((token.liquidity_usd ?? 0) < TRENDING_MIN_LIQUIDITY_USD) return null;
  if ((token.volume_h24_usd ?? 0) < TRENDING_MIN_VOLUME_USD) return null;
  if (token.price_usd === null || token.price_usd <= 0) return null;
  const score = trendingScore(token);
  if (score < TRENDING_SCORE_FLOOR) return null;
  const expectedReturnBps = Math.round(score * TRENDING_BPS_PER_POINT * 100) / 100;
  const evBps = toExpectedValue(expectedReturnBps, cost);
  return {
    strategy_id: "trending",
    token_mint: token.mint,
    symbol: token.symbol,
    side: "buy",
    horizon_sec: 2 * 60 * 60,
    expected_return_bps: expectedReturnBps,
    cost,
    expected_value_bps: evBps,
    // Attention signals are noisier than price signals; cap confidence low
    // until calibration earns it more.
    confidence: Math.min(0.75, 0.45 + score * 0.1),
    max_loss_bps: 250,
    liquidity_usd: token.liquidity_usd ?? 0,
    features: {
      score,
      rank: token.rank ?? -1,
      h1_pct: token.price_change_h1_pct ?? 0,
      h24_pct: token.price_change_h24_pct ?? 0,
      volume_h24_usd: token.volume_h24_usd ?? 0,
      boost_amount: token.boost_amount ?? 0,
      sources: token.sources.join("+"),
    },
    reason: `trending #${token.rank ?? "?"} (${token.sources.join("+")}), score ${score.toFixed(2)}: 1h ${(token.price_change_h1_pct ?? 0).toFixed(1)}%, 24h ${(token.price_change_h24_pct ?? 0).toFixed(1)}%, exp +${expectedReturnBps.toFixed(0)}bp vs cost ${cost.total_bps.toFixed(0)}bp → EV ${evBps.toFixed(0)}bp.`,
  };
}
