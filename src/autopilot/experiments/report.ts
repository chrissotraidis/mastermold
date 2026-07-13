import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ExperimentStore } from "./store";
import type { ExperimentSummary } from "./types";

function money(value: number): string {
  return `${value < 0 ? "-" : ""}$${Math.abs(value).toFixed(2)}`;
}

function metric(value: number | null, suffix = ""): string {
  return value === null || !Number.isFinite(value) ? "n/a" : `${value.toFixed(2)}${suffix}`;
}

export function experimentWeekStart(now = new Date()): string {
  const value = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const daysSinceMonday = (value.getUTCDay() + 6) % 7;
  value.setUTCDate(value.getUTCDate() - daysSinceMonday);
  return value.toISOString().slice(0, 10);
}

export function renderExperimentReport(summaries: ExperimentSummary[], generatedAt = new Date()): string {
  const control = summaries.find((summary) => summary.experiment_id === "v2-control") ?? null;
  const lines = [
    `# Mastermold Paper Experiments — Week of ${experimentWeekStart(generatedAt)}`,
    "",
    `Generated: ${generatedAt.toISOString()}`,
    "",
    "> Synthetic paper evidence only. No result changes the primary paper strategy or enables live trading.",
    "",
    "## Comparison",
    "",
    "| Arm | Status | Equity | Net P&L | vs control | Exits | Win rate | Expectancy | Profit factor | Max DD | Fees | Turnover | Evidence |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
  ];
  for (const summary of summaries) {
    const delta = control ? summary.net_pnl_usd - control.net_pnl_usd : 0;
    lines.push(
      `| ${summary.name} | ${summary.paused ? "paused" : "running"} | ${money(summary.equity_usd)} | ${money(summary.net_pnl_usd)} | ${control ? money(delta) : "n/a"} | ${summary.round_trips} | ${metric(summary.win_rate_pct, "%")} | ${summary.expectancy_usd === null ? "n/a" : money(summary.expectancy_usd)} | ${metric(summary.profit_factor)} | ${metric(summary.max_drawdown_pct, "%")} | ${money(summary.fees_usd)} | ${money(summary.turnover_usd)} | ${summary.confidence} |`,
    );
  }
  lines.push("", "## Interpretation", "");
  if (summaries.every((summary) => summary.round_trips < 30)) {
    lines.push("- Every arm remains provisional. Diagnose opportunity and rejection counts; do not infer edge yet.");
  } else {
    lines.push("- Arms with 30–99 exits are directional evidence; 100 or more exits is stronger evidence, not automatic promotion.");
  }
  lines.push(
    "- Compare net P&L after fees and drawdown against the V2 control over matching timestamps.",
    "- Review inactivity before changing thresholds. Zero trades can be a valid policy result or a missing-data problem.",
    "- Record any parameter change as a new configuration-hashed run.",
    "",
  );
  return lines.join("\n");
}

export function writeCurrentExperimentReport(
  store: ExperimentStore,
  now = new Date(),
  root = process.cwd(),
): string {
  const outputDir = resolve(root, "reports/private/experiments");
  const outputPath = resolve(outputDir, `week-${experimentWeekStart(now)}.md`);
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputPath, renderExperimentReport(store.summaries(), now), "utf8");
  return outputPath;
}
