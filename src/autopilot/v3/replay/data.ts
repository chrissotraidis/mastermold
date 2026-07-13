import { readFile } from "node:fs/promises";
import { asyncBufferFromFile, parquetReadObjects } from "hyparquet";
import { compressors } from "hyparquet-compressors";
import type { ReplayBar, ReplayDataset, ReplaySeries } from "./types";

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function finite(value: unknown): number | null {
  if (typeof value === "bigint") return Number(value);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function timestampMs(value: unknown): number | null {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" && !/^[-+]?\d+(\.\d+)?$/.test(value)) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const parsed = finite(value);
  if (parsed === null) return null;
  if (parsed > 1e15) return Math.floor(parsed / 1e6);
  if (parsed > 1e12) return Math.floor(parsed);
  return Math.floor(parsed * 1_000);
}

export function normalizeBars(rows: ReplayBar[], fromMs = -Infinity, toMs = Infinity): ReplayBar[] {
  const byTimestamp = new Map<number, ReplayBar>();
  for (const row of rows) {
    if (![row.ts_ms, row.o, row.h, row.l, row.c, row.volume].every(Number.isFinite)) continue;
    if (row.ts_ms < fromMs || row.ts_ms >= toMs || row.o <= 0 || row.h <= 0 || row.l <= 0 || row.c <= 0 || row.h < row.l) continue;
    byTimestamp.set(row.ts_ms, { ...row, volume: Math.max(0, row.volume) });
  }
  return [...byTimestamp.values()].sort((a, b) => a.ts_ms - b.ts_ms);
}

export function parseCoinbaseCandles(body: unknown, fromMs = -Infinity, toMs = Infinity): ReplayBar[] {
  if (!Array.isArray(body)) throw new Error("Coinbase candle response is not an array");
  return normalizeBars(body.flatMap((row) => {
    if (!Array.isArray(row) || row.length < 6) return [];
    const values = row.slice(0, 6).map(finite);
    if (values.some((value) => value === null)) return [];
    const [time, low, high, open, close, volume] = values as number[];
    return [{ ts_ms: time * 1_000, o: open, h: high, l: low, c: close, volume }];
  }), fromMs, toMs);
}

export function parseKrakenCandles(body: unknown, fromMs = -Infinity, toMs = Infinity): ReplayBar[] {
  if (!body || typeof body !== "object") throw new Error("Kraken candle response is not an object");
  const result = (body as { result?: unknown }).result;
  if (!result || typeof result !== "object") throw new Error("Kraken candle response has no result");
  const rows = Object.entries(result).find(([key, value]) => key !== "last" && Array.isArray(value))?.[1];
  if (!Array.isArray(rows)) throw new Error("Kraken candle response has no pair rows");
  return normalizeBars(rows.flatMap((row) => {
    if (!Array.isArray(row) || row.length < 7) return [];
    const time = finite(row[0]); const open = finite(row[1]); const high = finite(row[2]);
    const low = finite(row[3]); const close = finite(row[4]); const volume = finite(row[6]);
    if ([time, open, high, low, close, volume].some((value) => value === null)) return [];
    return [{ ts_ms: (time as number) * 1_000, o: open as number, h: high as number, l: low as number, c: close as number, volume: volume as number }];
  }), fromMs, toMs);
}

export function parseGeckoTerminalCandles(body: unknown, fromMs = -Infinity, toMs = Infinity): ReplayBar[] {
  const rows = (body as { data?: { attributes?: { ohlcv_list?: unknown } } })?.data?.attributes?.ohlcv_list;
  if (!Array.isArray(rows)) throw new Error("GeckoTerminal candle response has no ohlcv_list");
  return normalizeBars(rows.flatMap((row) => {
    if (!Array.isArray(row) || row.length < 6) return [];
    const [time, open, high, low, close, volume] = row.slice(0, 6).map(finite);
    if ([time, open, high, low, close, volume].some((value) => value === null)) return [];
    return [{ ts_ms: (time as number) * 1_000, o: open as number, h: high as number, l: low as number, c: close as number, volume: volume as number }];
  }), fromMs, toMs);
}

export function coinbaseChunks(fromMs: number, toMs: number, granularitySec: number): Array<{ from_ms: number; to_ms: number }> {
  if (!(fromMs < toMs) || ![60, 300, 900, 3600, 21600, 86400].includes(granularitySec)) throw new Error("Invalid Coinbase candle range or granularity");
  // Coinbase treats both endpoints as candle boundaries; 299 intervals keeps
  // every request at or below its documented 300-bucket ceiling.
  const span = granularitySec * 1_000 * 299;
  const chunks: Array<{ from_ms: number; to_ms: number }> = [];
  for (let cursor = fromMs; cursor < toMs; cursor += span) chunks.push({ from_ms: cursor, to_ms: Math.min(toMs, cursor + span) });
  return chunks;
}

export async function fetchCoinbaseSeries(
  symbol: string,
  fromMs: number,
  toMs: number,
  granularitySec: number,
  fetcher: FetchLike = fetch,
): Promise<ReplaySeries> {
  const bars: ReplayBar[] = [];
  for (const chunk of coinbaseChunks(fromMs, toMs, granularitySec)) {
    const url = new URL(`https://api.exchange.coinbase.com/products/${encodeURIComponent(symbol)}/candles`);
    url.searchParams.set("granularity", String(granularitySec));
    url.searchParams.set("start", new Date(chunk.from_ms).toISOString());
    url.searchParams.set("end", new Date(chunk.to_ms).toISOString());
    const response = await replayFetch(url, fetcher);
    if (!response.ok) throw new Error(`Coinbase candles failed (${response.status}) for ${chunk.from_ms}-${chunk.to_ms}`);
    bars.push(...parseCoinbaseCandles(await response.json(), fromMs, toMs));
  }
  return { symbol, source: "coinbase", granularity_sec: granularitySec, bars: normalizeBars(bars, fromMs, toMs) };
}

async function replayFetch(url: URL, fetcher: FetchLike): Promise<Response> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetcher(url, { headers: { Accept: "application/json", "User-Agent": "Mastermold-Replay/1" } });
    if (response.status !== 429 && response.status < 500) return response;
    if (attempt === 4) return response;
    await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
  }
  throw new Error("unreachable replay fetch retry state");
}

export async function fetchKrakenSeries(
  symbol: string,
  fromMs: number,
  toMs: number,
  granularitySec: number,
  fetcher: FetchLike = fetch,
): Promise<ReplaySeries> {
  const interval = granularitySec / 60;
  if (!Number.isInteger(interval) || ![1, 5, 15, 30, 60, 240, 1440, 10080, 21600].includes(interval)) throw new Error("Unsupported Kraken interval");
  const url = new URL("https://api.kraken.com/0/public/OHLC");
  url.searchParams.set("pair", symbol); url.searchParams.set("interval", String(interval)); url.searchParams.set("since", String(Math.floor(fromMs / 1_000)));
  const response = await replayFetch(url, fetcher);
  if (!response.ok) throw new Error(`Kraken candles failed (${response.status})`);
  return { symbol, source: "kraken", granularity_sec: granularitySec, bars: parseKrakenCandles(await response.json(), fromMs, toMs) };
}

export async function fetchGeckoTerminalSeries(
  network: string,
  pool: string,
  symbol: string,
  fromMs: number,
  toMs: number,
  granularitySec: 60 | 300,
  fetcher: FetchLike = fetch,
): Promise<ReplaySeries> {
  const aggregate = granularitySec / 60;
  const url = new URL(`https://api.geckoterminal.com/api/v2/networks/${encodeURIComponent(network)}/pools/${encodeURIComponent(pool)}/ohlcv/minute`);
  url.searchParams.set("aggregate", String(aggregate)); url.searchParams.set("limit", "1000");
  url.searchParams.set("before_timestamp", String(Math.ceil(toMs / 1_000)));
  const response = await replayFetch(url, fetcher);
  if (!response.ok) throw new Error(`GeckoTerminal candles failed (${response.status})`);
  return { symbol, source: "geckoterminal", granularity_sec: granularitySec, bars: parseGeckoTerminalCandles(await response.json(), fromMs, toMs) };
}

export async function loadReplayJson(path: string): Promise<ReplayDataset> {
  const parsed = JSON.parse(await readFile(path, "utf8")) as ReplayDataset;
  if (parsed?.version !== 1 || !Array.isArray(parsed.series)) throw new Error("Unsupported replay JSON dataset");
  return { ...parsed, series: parsed.series.map((series) => ({ ...series, bars: normalizeBars(series.bars) })) };
}

function column(row: Record<string, unknown>, names: string[]): unknown {
  for (const name of names) if (name in row) return row[name];
  return undefined;
}

export async function loadReplayParquet(path: string, defaults: { symbol?: string; granularity_sec?: number } = {}): Promise<ReplayDataset> {
  const file = await asyncBufferFromFile(path);
  const rows = await parquetReadObjects({ file, compressors });
  const grouped = new Map<string, ReplayBar[]>();
  for (const row of rows) {
    const symbol = String(column(row, ["symbol", "product", "pair"]) ?? defaults.symbol ?? "UNKNOWN");
    const ts_ms = timestampMs(column(row, ["ts_ms", "timestamp", "time", "datetime", "date"]));
    const o = finite(column(row, ["open", "o"])); const h = finite(column(row, ["high", "h"]));
    const l = finite(column(row, ["low", "l"])); const c = finite(column(row, ["close", "c"]));
    const volume = finite(column(row, ["volume", "v"])) ?? 0;
    if ([ts_ms, o, h, l, c].some((value) => value === null)) continue;
    const bars = grouped.get(symbol) ?? [];
    bars.push({ ts_ms: ts_ms as number, o: o as number, h: h as number, l: l as number, c: c as number, volume });
    grouped.set(symbol, bars);
  }
  if (grouped.size === 0) throw new Error("Parquet contains no recognizable OHLCV rows");
  return {
    version: 1,
    fetched_at: "parquet-file-metadata-not-required",
    series: [...grouped].map(([symbol, bars]) => ({ symbol, source: "parquet", granularity_sec: defaults.granularity_sec ?? inferGranularity(bars), bars: normalizeBars(bars) })),
  };
}

function inferGranularity(bars: ReplayBar[]): number {
  const sorted = normalizeBars(bars);
  if (sorted.length < 2) throw new Error("granularity_sec is required for a one-row Parquet series");
  return Math.round((sorted[1].ts_ms - sorted[0].ts_ms) / 1_000);
}

export async function loadReplayDataset(path: string, defaults: { symbol?: string; granularity_sec?: number } = {}): Promise<ReplayDataset> {
  return path.toLowerCase().endsWith(".parquet") ? loadReplayParquet(path, defaults) : loadReplayJson(path);
}
