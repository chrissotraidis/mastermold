/**
 * Price every holding, not a sample. Stocks and ETFs come from Yahoo; crypto
 * tries Yahoo's SYMBOL-USD first and falls back to CoinGecko for tokens Yahoo
 * does not list. Cash is always 1. Each refreshed row records when and where
 * its price came from, so the UI can show per-row freshness.
 */
import { afterMoneyChange, roundPrice } from "./money";
import { store, type ManualHoldingRow } from "./store";

export type QuoteResult = { price: number; change_pct: number; source: string; as_of: string };
export type QuoteFetcher = (row: Pick<ManualHoldingRow, "symbol" | "asset_class">) => Promise<QuoteResult | null>;

export type QuoteRefreshResult = {
  refreshed: number;
  unchanged_cash: number;
  failed: string[];
  total: number;
  checked_at: string;
};

const CONCURRENCY = 6;
const TIMEOUT_MS = 8_000;

/** Batch fallback for symbols the primary source missed (crypto only). */
export type QuoteFallback = (symbols: string[]) => Promise<Map<string, QuoteResult>>;

export async function refreshHoldingQuotes(
  fetcher: QuoteFetcher = defaultQuoteFetcher,
  now = new Date(),
  fallback: QuoteFallback | null = fetcher === defaultQuoteFetcher ? coinGeckoBatch : null,
): Promise<QuoteRefreshResult> {
  const rows = store().manualHoldings();
  const nowIso = now.toISOString();
  const updates = new Map<string, ManualHoldingRow>();
  const failed: string[] = [];
  let cash = 0;
  const bySymbol = new Map<string, QuoteResult | null>();

  const work = rows.filter((row) => {
    if (row.asset_class === "cash") {
      cash += 1;
      return false;
    }
    return true;
  });

  let cursor = 0;
  async function worker() {
    while (cursor < work.length) {
      const row = work[cursor];
      cursor += 1;
      const key = `${row.asset_class}:${row.symbol}`;
      if (!bySymbol.has(key)) {
        try {
          bySymbol.set(key, await fetcher(row));
        } catch {
          bySymbol.set(key, null);
        }
      }
      const quote = bySymbol.get(key);
      if (!quote || !(quote.price > 0)) {
        failed.push(row.symbol);
        continue;
      }
      updates.set(row.id, {
        ...row,
        price: roundPrice(quote.price),
        daily_change_pct: Math.round(quote.change_pct * 100) / 100,
        price_as_of: quote.as_of || nowIso,
        price_source: quote.source,
      });
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, work.length) }, worker));

  // Second pass: crypto the primary source missed, in one polite batch.
  const missedCrypto = [...new Set(work.filter((row) => row.asset_class !== "equity" && !updates.has(row.id)).map((row) => row.symbol.toUpperCase()))];
  if (fallback && missedCrypto.length > 0) {
    const found = await fallback(missedCrypto).catch(() => new Map<string, QuoteResult>());
    for (const row of work) {
      const quote = found.get(row.symbol.toUpperCase());
      if (!quote || updates.has(row.id)) continue;
      updates.set(row.id, { ...row, price: roundPrice(quote.price), daily_change_pct: Math.round(quote.change_pct * 100) / 100, price_as_of: quote.as_of, price_source: quote.source });
    }
    for (let index = failed.length - 1; index >= 0; index -= 1) {
      if (found.has(failed[index].toUpperCase())) failed.splice(index, 1);
    }
  }

  if (updates.size > 0) {
    // Re-read so an edit made while quotes were in flight is not overwritten
    // except for the price fields this refresh owns.
    const latest = store().manualHoldings();
    store().replaceManualHoldings(
      latest.map((row) => {
        const update = updates.get(row.id);
        return update
          ? { ...row, price: update.price, daily_change_pct: update.daily_change_pct, price_as_of: update.price_as_of, price_source: update.price_source }
          : row;
      }),
    );
    afterMoneyChange(now);
  }

  return { refreshed: updates.size, unchanged_cash: cash, failed: [...new Set(failed)].sort(), total: rows.length, checked_at: nowIso };
}

export const defaultQuoteFetcher: QuoteFetcher = async (row) => {
  const symbol = row.symbol.toUpperCase();
  return fromYahoo(row.asset_class === "equity" ? symbol : `${symbol}-USD`);
};

async function fromYahoo(yfSymbol: string): Promise<QuoteResult | null> {
  // query1 and query2 are the same service on two hosts; a 429 on one is
  // often clear on the other after a short pause.
  for (const host of ["query1", "query2"]) {
    const body = await getJson<{
      chart?: { result?: Array<{ indicators?: { quote?: Array<{ close?: Array<number | null> }> } }> };
    }>(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yfSymbol)}?range=5d&interval=1d`);
    const closes = (body?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? []).filter(
      (value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0,
    );
    if (closes.length === 0) {
      if (body) return null; // answered, but no such symbol
      continue;
    }
    const latest = closes[closes.length - 1];
    const previous = closes.length > 1 ? closes[closes.length - 2] : latest;
    return { price: latest, change_pct: previous > 0 ? ((latest - previous) / previous) * 100 : 0, source: "Yahoo", as_of: new Date().toISOString() };
  }
  return null;
}

const coinGeckoIds = new Map<string, string | null>();

/**
 * CoinGecko's free tier allows only a few calls a minute, so ids are looked
 * up one at a time (cached for the life of the server) and priced in a single
 * request.
 */
export const coinGeckoBatch: QuoteFallback = async (symbols) => {
  const found = new Map<string, QuoteResult>();
  const ids = new Map<string, string>();
  for (const symbol of symbols.slice(0, 20)) {
    let id = coinGeckoIds.get(symbol);
    if (id === undefined) {
      if (coinGeckoIds.size > 0 || ids.size > 0) await new Promise((resolve) => setTimeout(resolve, 700));
      const search = await getJson<{ coins?: Array<{ id: string; symbol: string; market_cap_rank: number | null }> }>(
        `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(symbol)}`,
      );
      if (search === null) continue; // throttled or offline: try again next refresh
      const matches = (search.coins ?? [])
        .filter((coin) => coin.symbol.toUpperCase() === symbol)
        .sort((a, b) => (a.market_cap_rank ?? 1e9) - (b.market_cap_rank ?? 1e9));
      id = matches[0]?.id ?? null;
      coinGeckoIds.set(symbol, id);
    }
    if (id) ids.set(symbol, id);
  }
  if (ids.size === 0) return found;
  const prices = await getJson<Record<string, { usd?: number; usd_24h_change?: number }>>(
    `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent([...new Set(ids.values())].join(","))}&vs_currencies=usd&include_24hr_change=true`,
  );
  const asOf = new Date().toISOString();
  for (const [symbol, id] of ids) {
    const entry = prices?.[id];
    if (entry?.usd) found.set(symbol, { price: entry.usd, change_pct: entry.usd_24h_change ?? 0, source: "CoinGecko", as_of: asOf });
  }
  return found;
};

async function getJson<T>(url: string, attempt = 0): Promise<T | null> {
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (response.status === 429 && attempt === 0) {
      await new Promise((resolve) => setTimeout(resolve, 1_200));
      return getJson<T>(url, 1);
    }
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}
