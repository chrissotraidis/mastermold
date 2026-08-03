export type PolymarketBookLevel = {
  price: number;
  size: number;
};

export type PolymarketOrderBook = {
  token_id: string;
  condition_id: string;
  timestamp_ms: number;
  bids: PolymarketBookLevel[];
  asks: PolymarketBookLevel[];
  tick_size: number;
  minimum_order_size: number;
  neg_risk: boolean;
  last_trade_price: number | null;
};

export type PolymarketBookMetrics = {
  token_id: string;
  best_bid: number | null;
  best_ask: number | null;
  midpoint: number | null;
  spread: number | null;
  spread_bps: number | null;
  bid_depth_shares: number;
  ask_depth_shares: number;
  depth_imbalance: number | null;
  executable_size_usd: number;
  tick_size: number;
};

export type PolymarketPaperQuote = {
  side: "buy" | "sell";
  average_price: number;
  shares: number;
  notional_usd: number;
  worst_price: number;
  levels_used: number;
};

const CLOB_BOOKS_URL = "https://clob.polymarket.com/books";
const CACHE_MS = 15_000;
const MAX_BOOKS_PER_REQUEST = 50;
const DEPTH_BAND = 0.03;

let cache: { key: string; fetched_at: number; books: Map<string, PolymarketOrderBook> } | null = null;

export async function fetchPolymarketOrderBooks(tokenIds: string[], force = false): Promise<Map<string, PolymarketOrderBook>> {
  const unique = [...new Set(tokenIds.filter(Boolean))].slice(0, MAX_BOOKS_PER_REQUEST);
  if (unique.length === 0) return new Map();
  const key = [...unique].sort().join(",");
  const now = Date.now();
  if (!force && cache?.key === key && now - cache.fetched_at < CACHE_MS) return new Map(cache.books);

  const response = await fetch(CLOB_BOOKS_URL, {
    method: "POST",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "MasterMold/0.1 (local Polymarket research)",
    },
    body: JSON.stringify(unique.map((token_id) => ({ token_id }))),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Polymarket CLOB books returned ${response.status}.`);
  const body = await response.json() as unknown;
  if (!Array.isArray(body)) throw new Error("Polymarket CLOB books returned an unexpected payload.");

  const books = new Map<string, PolymarketOrderBook>();
  for (const value of body) {
    const book = parsePolymarketOrderBook(value);
    if (book) books.set(book.token_id, book);
  }
  cache = { key, fetched_at: now, books };
  return new Map(books);
}

export function parsePolymarketOrderBook(value: unknown): PolymarketOrderBook | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const tokenId = text(raw.asset_id);
  if (!tokenId) return null;
  return {
    token_id: tokenId,
    condition_id: text(raw.market),
    timestamp_ms: numeric(raw.timestamp),
    bids: levels(raw.bids).sort((a, b) => b.price - a.price),
    asks: levels(raw.asks).sort((a, b) => a.price - b.price),
    tick_size: numeric(raw.tick_size),
    minimum_order_size: numeric(raw.min_order_size),
    neg_risk: raw.neg_risk === true,
    last_trade_price: nullableNumeric(raw.last_trade_price),
  };
}

export function summarizePolymarketBook(book: PolymarketOrderBook): PolymarketBookMetrics {
  const bestBidLevel = book.bids[0] ?? null;
  const bestAskLevel = book.asks[0] ?? null;
  const bestBid = bestBidLevel?.price ?? null;
  const bestAsk = bestAskLevel?.price ?? null;
  const midpoint = bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : null;
  const spread = bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null;
  const bidDepth = bestBid === null
    ? 0
    : book.bids.filter((level) => level.price >= bestBid - DEPTH_BAND).reduce((sum, level) => sum + level.size, 0);
  const askDepth = bestAsk === null
    ? 0
    : book.asks.filter((level) => level.price <= bestAsk + DEPTH_BAND).reduce((sum, level) => sum + level.size, 0);
  const totalDepth = bidDepth + askDepth;

  return {
    token_id: book.token_id,
    best_bid: bestBid,
    best_ask: bestAsk,
    midpoint,
    spread,
    spread_bps: spread !== null && midpoint && midpoint > 0 ? (spread / midpoint) * 10_000 : null,
    bid_depth_shares: bidDepth,
    ask_depth_shares: askDepth,
    depth_imbalance: totalDepth > 0 ? (bidDepth - askDepth) / totalDepth : null,
    executable_size_usd: Math.min(
      bestBidLevel ? bestBidLevel.price * bestBidLevel.size : 0,
      bestAskLevel ? bestAskLevel.price * bestAskLevel.size : 0,
    ),
    tick_size: book.tick_size,
  };
}

function levels(value: unknown): PolymarketBookLevel[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const raw = item as Record<string, unknown>;
    const price = numeric(raw.price);
    const size = numeric(raw.size);
    return price > 0 && price < 1 && size > 0 ? [{ price, size }] : [];
  });
}

function text(value: unknown): string {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
}

function numeric(value: unknown): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

export function quotePolymarketPaperBuy(book: PolymarketOrderBook | undefined, stakeUsd: number): PolymarketPaperQuote | null {
  if (!book) return null;
  if (!Number.isFinite(stakeUsd) || stakeUsd <= 0) return null;
  let remaining = stakeUsd;
  let shares = 0;
  let cost = 0;
  let worstPrice = 0;
  let levelsUsed = 0;
  for (const level of [...book.asks].sort((a, b) => a.price - b.price)) {
    const levelCost = level.price * level.size;
    const usedCost = Math.min(remaining, levelCost);
    const usedShares = usedCost / level.price;
    if (usedShares <= 0) continue;
    remaining -= usedCost;
    cost += usedCost;
    shares += usedShares;
    worstPrice = level.price;
    levelsUsed += 1;
    if (remaining <= 0.000_001) break;
  }
  if (remaining > 0.000_001 || shares < book.minimum_order_size || shares <= 0) return null;
  return { side: "buy", average_price: cost / shares, shares, notional_usd: cost, worst_price: worstPrice, levels_used: levelsUsed };
}

export function quotePolymarketPaperSell(book: PolymarketOrderBook | undefined, sharesToSell: number): PolymarketPaperQuote | null {
  if (!book) return null;
  if (!Number.isFinite(sharesToSell) || sharesToSell <= 0) return null;
  let remaining = sharesToSell;
  let shares = 0;
  let proceeds = 0;
  let worstPrice = 1;
  let levelsUsed = 0;
  for (const level of [...book.bids].sort((a, b) => b.price - a.price)) {
    const usedShares = Math.min(remaining, level.size);
    if (usedShares <= 0) continue;
    remaining -= usedShares;
    shares += usedShares;
    proceeds += usedShares * level.price;
    worstPrice = level.price;
    levelsUsed += 1;
    if (remaining <= 0.000_001) break;
  }
  if (remaining > 0.000_001 || shares <= 0) return null;
  return { side: "sell", average_price: proceeds / shares, shares, notional_usd: proceeds, worst_price: worstPrice, levels_used: levelsUsed };
}

function nullableNumeric(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = numeric(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function __resetPolymarketBookCacheForTests() {
  cache = null;
}
