import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fetchCoinbaseSeries, loadReplayDataset } from "../src/autopilot/v3/replay/data";
import { runReplay, scaleExecutionCost } from "../src/autopilot/v3/replay/engine";
import { replayReportMarkdown } from "../src/autopilot/v3/replay/report";
import { DEFAULT_REPLAY_CONFIG, type ReplayConfig, type ReplayModule } from "../src/autopilot/v3/replay/types";
import { runV2Replay } from "../src/autopilot/v3/replay/v2-adapter";
import { autopilotStore } from "../src/autopilot/store";
import { runQuarterlyWalkForward, type ParameterScheduleEntry } from "../src/autopilot/v3/replay/walk-forward";

function optional(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith("--") ? process.argv[index + 1] : null;
}

function required(name: string): string {
  const value = optional(name); if (!value) throw new Error(`Missing --${name}`); return value;
}

function flag(name: string): boolean { return process.argv.includes(`--${name}`); }

async function available(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

async function unusedReportPath(preferred: string, configHash: string): Promise<string> {
  if (!(await available(preferred))) return preferred;
  const hashed = preferred.replace(/\.md$/, `-${configHash}.md`);
  if (!(await available(hashed))) return hashed;
  for (let sequence = 2; ; sequence += 1) {
    const candidate = preferred.replace(/\.md$/, `-${configHash}-${sequence}.md`);
    if (!(await available(candidate))) return candidate;
  }
}

async function main(): Promise<void> {
  const module = (optional("module") ?? "v2") as ReplayModule;
  if (!["v2", "cusum_tb", "bar_portion"].includes(module)) throw new Error("--module must be v2, cusum_tb, or bar_portion");
  const dataPath = optional("data");
  const reportDate = optional("report-date") ?? new Date().toISOString().slice(0, 10);
  const totalBps = Number(optional("cost-bps") ?? DEFAULT_REPLAY_CONFIG.cost.total_bps);
  if (!(totalBps >= 0) || !Number.isFinite(totalBps)) throw new Error("--cost-bps must be a non-negative number");
  const cost = scaleExecutionCost(DEFAULT_REPLAY_CONFIG.cost, totalBps / DEFAULT_REPLAY_CONFIG.cost.total_bps);
  const config: ReplayConfig = {
    ...DEFAULT_REPLAY_CONFIG, module, cost,
    bp_overlay: optional("bp-overlay") !== "off",
    cusum_edge_ratio: Number(optional("cusum-edge-ratio") ?? DEFAULT_REPLAY_CONFIG.cusum_edge_ratio),
    bar_portion_edge_ratio: Number(optional("bp-edge-ratio") ?? DEFAULT_REPLAY_CONFIG.bar_portion_edge_ratio),
  };
  const dataset = dataPath
    ? await loadReplayDataset(resolve(dataPath), { symbol: optional("symbol") ?? undefined, granularity_sec: Number(optional("granularity") ?? 0) || undefined })
    : await (async () => {
        const from = Date.parse(required("from")); const to = Date.parse(optional("to") ?? new Date().toISOString());
        const granularity = Number(optional("granularity") ?? 300); const symbol = optional("symbol") ?? "SOL-USD";
        if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) throw new Error("--from/--to must be a chronological date range");
        return { version: 1 as const, fetched_at: new Date().toISOString(), series: [await fetchCoinbaseSeries(symbol, from, to, granularity)] };
      })();
  const schedulePath = optional("schedule");
  const schedule = schedulePath ? JSON.parse(await readFile(resolve(schedulePath), "utf8")) as ParameterScheduleEntry[] : null;
  const execute = (runConfig: ReplayConfig) => schedule
    ? runQuarterlyWalkForward(dataset.series, runConfig, schedule)
    : runConfig.module === "v2" ? runV2Replay(dataset.series, runConfig) : runReplay(dataset.series, runConfig);
  const base = execute(config); const doubled = execute({ ...config, cost: scaleExecutionCost(config.cost, 2) });
  const report = replayReportMarkdown(base, doubled, reportDate);
  const preferred = resolve(optional("report") ?? `docs/private/replay-reports/${reportDate}-${module}.md`);
  const output = await unusedReportPath(preferred, base.config_hash);
  await mkdir(dirname(output), { recursive: true }); await writeFile(output, report, "utf8");
  if (flag("record-evidence")) {
    if (module === "v2") throw new Error("v2 is the benchmark and cannot receive V3 promotion evidence");
    const from = Math.min(...base.data.map((row) => row.from_ms)); const to = Math.max(...base.data.map((row) => row.to_ms));
    autopilotStore().setReplayConfirmation(module, {
      config_hash: base.config_hash,
      report_path: output,
      data_months: Math.round(((to - from) / (30.4375 * 86_400_000)) * 100) / 100,
      positive_walk_forward_quarters: base.metrics.positive_walk_forward_quarters,
      doubled_cost_positive: doubled.metrics.mean_net_bps !== null && doubled.metrics.mean_net_bps > 0,
      base_mean_net_bps: base.metrics.mean_net_bps,
      ts: new Date().toISOString(),
    });
  }
  console.log(JSON.stringify({ report: output, config_hash: base.config_hash, metrics: base.metrics, doubled_cost: doubled.metrics }, null, 2));
}

await main();
