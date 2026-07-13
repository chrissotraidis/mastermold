import type { ReplayResult } from "./types";
import { ANTI_OVERFIT_CONSTITUTION } from "./constitution";

function value(number: number | null, suffix = ""): string {
  return number === null ? "n/a" : `${number.toFixed(2)}${suffix}`;
}

export function replayReportMarkdown(base: ReplayResult, doubled: ReplayResult, reportDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) throw new Error("reportDate must be YYYY-MM-DD");
  const dataRows = base.data.map((row) => {
    const symbolMetrics = base.symbol_metrics.find((metric) => metric.symbol === row.symbol);
    return `| ${row.symbol} | ${row.source} | ${row.granularity_sec}s | ${new Date(row.from_ms).toISOString()} | ${new Date(row.to_ms).toISOString()} | ${row.bars} | ${value(symbolMetrics?.exposure_pct ?? 0, "%")} | ${value(symbolMetrics?.events_per_day ?? 0)} |`;
  }).join("\n");
  const quarters = base.quarters.length
    ? base.quarters.map((row) => `| ${row.quarter} | ${row.trades} | ${value(row.mean_net_bps, "bp")} | ${row.positive ? "yes" : "no"} |`).join("\n")
    : "| none | 0 | n/a | no |";
  const exactParams = JSON.stringify({ config: base.config, parameter_schedule: base.parameter_schedule ?? "fixed before full evaluation range" }, null, 2);
  return `# Replay report — ${base.module} — ${reportDate}

This report is immutable run evidence, including losing and zero-trade results. Candidate decisions use the production pure strategy functions. Signals are formed at bar close and filled at the next bar open. Each side is moved adversely by half the fixed round-trip cost. If take-profit and stop are both touched inside one OHLC bar, the stop wins.

## Identity

- Config hash: \`${base.config_hash}\`
- Module: \`${base.module}\`
- Deterministic tie policy: \`${base.deterministic_tie_policy}\`
- Bar path for v2: deterministic O→nearer extreme→farther extreme→C samples; decisions remain close-only and fills remain next-open.

## Data

| Symbol | Source | Granularity | From | To | Bars | Exposure | Events/day |
| --- | --- | ---: | --- | --- | ---: | ---: | ---: |
${dataRows}

## Results and cost sensitivity

| Cost case | Trades | Hit rate | Mean net expectancy | Daily Sharpe | Max drawdown | Exposure | Events/day | Positive WF quarters |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Fixed snapshot (${base.config.cost.total_bps}bp) | ${base.metrics.trades} | ${value(base.metrics.hit_rate === null ? null : base.metrics.hit_rate * 100, "%")} | ${value(base.metrics.mean_net_bps, "bp/trade")} | ${value(base.metrics.sharpe_daily)} | ${value(base.metrics.max_drawdown_bps, "bp")} | ${value(base.metrics.exposure_pct, "%")} | ${value(base.metrics.events_per_day)} | ${base.metrics.positive_walk_forward_quarters} |
| 2× cost (${doubled.config.cost.total_bps}bp) | ${doubled.metrics.trades} | ${value(doubled.metrics.hit_rate === null ? null : doubled.metrics.hit_rate * 100, "%")} | ${value(doubled.metrics.mean_net_bps, "bp/trade")} | ${value(doubled.metrics.sharpe_daily)} | ${value(doubled.metrics.max_drawdown_bps, "bp")} | ${value(doubled.metrics.exposure_pct, "%")} | ${value(doubled.metrics.events_per_day)} | ${doubled.metrics.positive_walk_forward_quarters} |

## Walk-forward quarters

| Quarter | Trades | Mean net | Positive |
| --- | ---: | ---: | --- |
${quarters}

## Exact parameters

\`\`\`json
${exactParams}
\`\`\`

## Anti-overfit constitution

${ANTI_OVERFIT_CONSTITUTION.map((rule) => `- ${rule}`).join("\n")}
`;
}
