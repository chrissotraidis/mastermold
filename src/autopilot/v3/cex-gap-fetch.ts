import type { CexBook, CexVenue } from "./cex-gap";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
const TIMEOUT_MS = 6_000;

function positive(value: unknown): number | null { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? parsed : null; }

export function parseCoinbaseTicker(body: unknown): CexBook | null {
  if (!body || typeof body !== "object") return null;
  const bid = positive((body as Record<string, unknown>).bid); const ask = positive((body as Record<string, unknown>).ask);
  return bid !== null && ask !== null && ask >= bid ? { bid, ask } : null;
}

export function parseKrakenTickers(body: unknown, requestedPairs: string[]): Map<string, CexBook> {
  const out = new Map<string, CexBook>();
  const result = body && typeof body === "object" ? (body as { result?: unknown }).result : null;
  if (!result || typeof result !== "object") return out;
  const entries = Object.entries(result as Record<string, unknown>);
  for (const pair of requestedPairs) {
    const normalized = pair.replace(/[^A-Z0-9]/gi, "").toUpperCase();
    const found = entries.find(([key]) => {
      const candidate = key.replace(/[^A-Z0-9]/gi, "").toUpperCase().replace(/^X/, "").replace(/ZUSD$/, "USD");
      return key.toUpperCase() === pair.toUpperCase() || candidate === normalized;
    })?.[1] as { b?: unknown; a?: unknown } | undefined;
    const bid = Array.isArray(found?.b) ? positive(found?.b[0]) : null; const ask = Array.isArray(found?.a) ? positive(found?.a[0]) : null;
    if (bid !== null && ask !== null && ask >= bid) out.set(pair, { bid, ask });
  }
  return out;
}

async function safeFetch(url: string, fetcher: FetchLike): Promise<Response | null> {
  try { return await fetcher(url, { headers: { Accept: "application/json", "User-Agent": "Mastermold-CexGap/1" }, signal: AbortSignal.timeout(TIMEOUT_MS) }); } catch { return null; }
}

export async function fetchCoinbaseTicker(pair: string, fetcher: FetchLike = fetch): Promise<{ listed: boolean; book: CexBook | null }> {
  const response = await safeFetch(`https://api.exchange.coinbase.com/products/${encodeURIComponent(pair)}/ticker`, fetcher);
  if (!response || response.status === 404) return { listed: false, book: null };
  if (!response.ok) return { listed: true, book: null };
  const book = parseCoinbaseTicker(await response.json()); return { listed: book !== null, book };
}

export async function fetchKrakenTickers(pairs: string[], fetcher: FetchLike = fetch): Promise<Map<string, CexBook>> {
  if (!pairs.length) return new Map();
  const response = await safeFetch(`https://api.kraken.com/0/public/Ticker?pair=${encodeURIComponent(pairs.join(","))}`, fetcher);
  return response?.ok ? parseKrakenTickers(await response.json(), pairs) : new Map();
}

export async function probeCexListing(symbol: string, venue: CexVenue, fetcher: FetchLike = fetch): Promise<{ pair: string; listed: boolean }> {
  const canonical = symbol === "WETH" ? "ETH" : symbol === "WBTC" ? (venue === "kraken" ? "XBT" : "BTC") : symbol;
  if (venue === "coinbase") { const pair = `${canonical}-USD`; return { pair, listed: (await fetchCoinbaseTicker(pair, fetcher)).listed }; }
  const pair = `${canonical}USD`; return { pair, listed: (await fetchKrakenTickers([pair], fetcher)).has(pair) };
}
