export type PolymarketMarket = {
  id: string;
  condition_id: string;
  question: string;
  slug: string;
  end_date: string | null;
  outcomes: string[];
  outcome_prices: number[];
  token_ids: string[];
  liquidity_usd: number;
  volume_24h_usd: number;
  price_change_24h: number | null;
  accepting_orders: boolean;
  order_book_enabled: boolean;
  neg_risk: boolean;
  fees_enabled: boolean;
  minimum_order_size: number;
};

export type PolymarketWatchSignal = {
  id: string;
  market_id: string;
  token_id: string;
  outcome_index: number;
  outcome: string;
  question: string;
  slug: string;
  price: number;
  move_24h: number;
  score: number;
  kind: "momentum-watch";
  thesis: string;
};

export type PolymarketMarketSnapshot = {
  markets: PolymarketMarket[];
  fetched_at: string;
  source: "live" | "memory-cache";
};

export type PolymarketResolution = {
  market_id: string;
  status: "resolved" | "invalid";
  closed_at: string | null;
  winning_outcome_index: number | null;
  outcome_prices: number[];
};

const GAMMA_MARKETS_URL =
  "https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=100&order=volume24hr&ascending=false";
const CACHE_MS = 20_000;
export const MIN_POLYMARKET_ENTRY_HORIZON_MS = 6 * 60 * 60 * 1_000;

let marketCache: { snapshot: PolymarketMarketSnapshot; cached_at: number } | null = null;

export async function fetchPolymarketMarkets(force = false): Promise<PolymarketMarketSnapshot> {
  const now = Date.now();
  if (!force && marketCache && now - marketCache.cached_at < CACHE_MS) {
    return { ...marketCache.snapshot, source: "memory-cache" };
  }

  try {
    const response = await fetch(GAMMA_MARKETS_URL, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "User-Agent": "MasterMold/0.1 (local Polymarket monitor)",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Polymarket Gamma API returned ${response.status}.`);

    const body = await response.json() as unknown;
    if (!Array.isArray(body)) throw new Error("Polymarket Gamma API returned an unexpected payload.");

    const markets = body.map(parseMarket).filter((market): market is PolymarketMarket => market !== null);
    if (markets.length === 0) throw new Error("Polymarket Gamma API returned no usable active markets.");

    const snapshot: PolymarketMarketSnapshot = {
      markets,
      fetched_at: new Date().toISOString(),
      source: "live",
    };
    marketCache = { snapshot, cached_at: now };
    return snapshot;
  } catch (error) {
    if (marketCache) return { ...marketCache.snapshot, source: "memory-cache" };
    throw error;
  }
}

/** Markets ending within `maxHorizonMs`, ranked by 24h volume. The top-100
 * snapshot is dominated by long-dated mega-markets, so the analyst pulls this
 * supplemental set to keep its resolution velocity up: same-day sports,
 * esports, and daily crypto markets that grade the calibration clock in hours
 * instead of weeks. Failures return an empty list — the main snapshot alone
 * is always enough to run a cycle. */
export async function fetchPolymarketFastResolvers(maxHorizonMs: number): Promise<PolymarketMarket[]> {
  const url = new URL("https://gamma-api.polymarket.com/markets");
  url.searchParams.set("active", "true");
  url.searchParams.set("closed", "false");
  url.searchParams.set("limit", "300");
  url.searchParams.set("order", "volume24hr");
  url.searchParams.set("ascending", "false");
  url.searchParams.set("end_date_max", new Date(Date.now() + maxHorizonMs).toISOString());
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "User-Agent": "MasterMold/0.1 (local Polymarket monitor)",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return [];
    const body = await response.json() as unknown;
    if (!Array.isArray(body)) return [];
    return body.map(parseMarket).filter((market): market is PolymarketMarket => market !== null);
  } catch {
    return [];
  }
}

export async function fetchPolymarketResolutions(marketIds: string[]): Promise<PolymarketResolution[]> {
  const ids = [...new Set(marketIds)].filter((id) => /^\d+$/.test(id)).slice(0, 50);
  if (ids.length === 0) return [];

  const url = new URL("https://gamma-api.polymarket.com/markets");
  url.searchParams.set("closed", "true");
  url.searchParams.set("limit", String(ids.length));
  for (const id of ids) url.searchParams.append("id", id);

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "User-Agent": "MasterMold/0.1 (local Polymarket calibration)",
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Polymarket Gamma resolution read returned ${response.status}.`);
  const body = await response.json() as unknown;
  if (!Array.isArray(body)) throw new Error("Polymarket Gamma resolution read returned an unexpected payload.");
  return body.map(parsePolymarketResolution).filter((row): row is PolymarketResolution => row !== null);
}

export function parsePolymarketResolution(value: unknown): PolymarketResolution | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const marketId = text(raw.id);
  if (!marketId || raw.closed !== true) return null;
  const prices = numberArray(raw.outcomePrices);
  if (prices.length < 2 || prices.some((price) => !Number.isFinite(price) || price < 0 || price > 1)) return null;

  const winners = prices
    .map((price, index) => ({ price, index }))
    .filter(({ price }) => price >= 0.999)
    .map(({ index }) => index);
  const decisive = winners.length === 1
    && prices.every((price, index) => index === winners[0] ? price >= 0.999 : price <= 0.001);
  const resolutionStatus = text(raw.umaResolutionStatus).toLowerCase();
  if (!decisive && resolutionStatus !== "resolved") return null;

  return {
    market_id: marketId,
    status: decisive ? "resolved" : "invalid",
    closed_at: nullableText(raw.closedTime),
    winning_outcome_index: decisive ? winners[0] : null,
    outcome_prices: prices,
  };
}

export function hasPolymarketEntryHorizon(market: PolymarketMarket, nowMs = Date.now()): boolean {
  if (!market.end_date) return false;
  const endMs = Date.parse(market.end_date);
  return Number.isFinite(endMs) && endMs - nowMs >= MIN_POLYMARKET_ENTRY_HORIZON_MS;
}

export function buildPolymarketWatchSignals(markets: PolymarketMarket[], nowMs = Date.now()): PolymarketWatchSignal[] {
  return markets
    .filter((market) =>
      market.accepting_orders
      && market.order_book_enabled
      && hasPolymarketEntryHorizon(market, nowMs)
      && !market.neg_risk
      && !market.fees_enabled
      && market.outcomes.length === 2
      && market.outcome_prices.length === 2
      && market.token_ids.length === 2
      && market.liquidity_usd >= 25_000
      && market.volume_24h_usd >= 10_000
      && market.price_change_24h !== null
      && Math.abs(market.price_change_24h) >= 0.03,
    )
    .map((market) => {
      const move = market.price_change_24h as number;
      const outcomeIndex = move >= 0 ? 0 : 1;
      const price = market.outcome_prices[outcomeIndex];
      if (!Number.isFinite(price) || price < 0.08 || price > 0.92) return null;

      const score = Math.min(
        99,
        Math.round(
          45
          + Math.min(30, Math.abs(move) * 300)
          + Math.min(12, Math.log10(Math.max(1, market.liquidity_usd)) * 2)
          + Math.min(12, Math.log10(Math.max(1, market.volume_24h_usd)) * 2),
        ),
      );
      const direction = move >= 0 ? "strengthened" : "weakened";

      return {
        id: `${market.id}:${outcomeIndex}`,
        market_id: market.id,
        token_id: market.token_ids[outcomeIndex],
        outcome_index: outcomeIndex,
        outcome: market.outcomes[outcomeIndex],
        question: market.question,
        slug: market.slug,
        price,
        move_24h: outcomeIndex === 0 ? move : -move,
        score,
        kind: "momentum-watch" as const,
        thesis:
          `${market.outcomes[0]} ${direction} ${Math.abs(move * 100).toFixed(1)}% in 24h; `
          + `the paper lane follows the move only when liquidity and volume clear its fixed filters. `
          + "This is an experimental setup score, not a fair-value estimate.",
      };
    })
    .filter((signal): signal is PolymarketWatchSignal => signal !== null)
    .sort((a, b) => b.score - a.score || Math.abs(b.move_24h) - Math.abs(a.move_24h));
}

function parseMarket(value: unknown): PolymarketMarket | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const id = text(raw.id);
  const question = text(raw.question);
  const slug = text(raw.slug);
  const outcomes = stringArray(raw.outcomes);
  const outcomePrices = numberArray(raw.outcomePrices);
  const tokenIds = stringArray(raw.clobTokenIds);

  if (!id || !question || !slug || outcomes.length < 2 || outcomePrices.length !== outcomes.length || tokenIds.length !== outcomes.length) {
    return null;
  }
  if (outcomePrices.some((price) => !Number.isFinite(price) || price < 0 || price > 1)) return null;

  return {
    id,
    condition_id: text(raw.conditionId),
    question,
    slug,
    end_date: nullableText(raw.endDate),
    outcomes,
    outcome_prices: outcomePrices,
    token_ids: tokenIds,
    liquidity_usd: numeric(raw.liquidityNum ?? raw.liquidity),
    volume_24h_usd: numeric(raw.volume24hr),
    price_change_24h: nullableNumeric(raw.oneDayPriceChange),
    accepting_orders: raw.acceptingOrders === true,
    order_book_enabled: raw.enableOrderBook === true,
    neg_risk: raw.negRisk === true,
    fees_enabled: raw.feesEnabled === true || numeric(raw.takerBaseFee) > 0 || numeric(raw.makerBaseFee) > 0,
    minimum_order_size: numeric(raw.orderMinSize),
  };
}

function stringArray(value: unknown): string[] {
  const parsed = parseArray(value);
  return parsed.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function numberArray(value: unknown): number[] {
  return parseArray(value).map(numeric);
}

function parseArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function text(value: unknown): string {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
}

function nullableText(value: unknown): string | null {
  const parsed = text(value);
  return parsed || null;
}

function numeric(value: unknown): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumeric(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = numeric(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function __resetPolymarketMarketCacheForTests() {
  marketCache = null;
}
