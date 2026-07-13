import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fetchCoinbaseSeries, fetchGeckoTerminalSeries, fetchKrakenSeries } from "../src/autopilot/v3/replay/data";
import type { ReplayDataset } from "../src/autopilot/v3/replay/types";

function arg(name: string, fallback?: string): string {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : fallback;
  if (!value || value.startsWith("--")) throw new Error(`Missing --${name}`);
  return value;
}

async function main(): Promise<void> {
  const source = arg("source", "coinbase");
  const symbol = arg("symbol", source === "coinbase" ? "SOL-USD" : "SOLUSD");
  const fromMs = Date.parse(arg("from")); const toMs = Date.parse(arg("to"));
  const granularity = Number(arg("granularity", "300"));
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs) throw new Error("--from/--to must be chronological ISO timestamps");
  const series = source === "coinbase"
    ? await fetchCoinbaseSeries(symbol, fromMs, toMs, granularity)
    : source === "kraken"
      ? await fetchKrakenSeries(symbol, fromMs, toMs, granularity)
      : source === "geckoterminal"
        ? await fetchGeckoTerminalSeries(arg("network"), arg("pool"), symbol, fromMs, toMs, granularity as 60 | 300)
        : (() => { throw new Error("--source must be coinbase, kraken, or geckoterminal"); })();
  const dataset: ReplayDataset = { version: 1, fetched_at: new Date().toISOString(), series: [series] };
  const output = resolve(arg("output", `.data/replay/${source}-${symbol}-${granularity}.json`));
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(dataset)}\n`, "utf8");
  console.log(`wrote ${series.bars.length} ${granularity}s bars for ${symbol} to ${output}`);
}

await main();
