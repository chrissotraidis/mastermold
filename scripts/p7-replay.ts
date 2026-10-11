/**
 * P7 historical replay: bun run scripts/p7-replay.ts [--days 7] [--max-events 200]
 *   [--models ecmwf_ifs,ncep_gfs013] [--slippage 1] [--timing raw]
 * --timing raw enters when the producers publish (P8) instead of Open-Meteo (P7).
 * Reads public data only and writes one summary row to the local P7 ledger.
 * Places no orders.
 */
import { runForecastRevisionReplay } from "@/src/polymarket/forecast-revision-replay";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};

const started = Date.now();
const result = await runForecastRevisionReplay({
  days: Number(flag("days") ?? 7),
  maxEvents: flag("max-events") ? Number(flag("max-events")) : undefined,
  models: flag("models")?.split(","),
  timing: flag("timing") === "raw" ? "raw" : "open-meteo",
  slippageCents: flag("slippage") ? Number(flag("slippage")) : 1,
  log: (line) => console.log(`[p7] ${line}`),
});
console.log(JSON.stringify(result, null, 2));
console.log(`[p7] replay finished in ${Math.round((Date.now() - started) / 1000)}s`);

