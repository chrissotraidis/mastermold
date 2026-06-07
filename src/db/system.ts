import type { SystemState } from "@/components/sentinel-face";
import { getAlerts } from "./alerts";
import { getBriefingCards } from "./briefing";
import { getDataMode, getEngineStatus } from "./engine-data";
import { getExecutor } from "./executor";
import { getJournal } from "./journal";

/**
 * Derives MasterMold's live posture (the face/eye state) and the HUD telemetry from
 * real data, so the centerpiece reflects the actual system, not decoration.
 */
export type SystemTelemetry = {
  state: SystemState;
  provenance: "Engine output" | "Demo data";
  dataFresh: boolean;
  asOf: string;
  modelTier: string;
  costLabel: string;
  vocal: string[]; // console lines for the vocal HUD
  facets: {
    brain: string;
    copilot: string;
    executor: string;
  };
};

export function getSystemState(): SystemTelemetry {
  const status = getEngineStatus();
  const mode = getDataMode();
  const alerts = getAlerts();
  const cards = getBriefingCards();
  const journal = getJournal();
  const executor = getExecutor();

  const engineLive = status.state === "live";
  const actionable = cards.filter((c) => c.status === "actionable").length;
  const t0Open = alerts.some((a) => a.tier === "T0" && !a.acknowledged);
  const safeMode = executor.strategies.some((s) => s.status === "safe_mode");
  const beliefsShifted = journal.reflection_updates.filter((r) => r.significance_passed).length;

  let state: SystemState = "idle";
  if (t0Open) state = "alert";
  else if (status.state === "invalid") state = "degraded";
  else if (safeMode) state = "caution";
  else if (engineLive && actionable > 0) state = "suggestion";

  const run = engineLive ? status.bundle.run : null;
  const modelTier = run ? shortModel(run.models.deep_think ?? run.models.quick_think ?? "") : "—";
  const costLabel = run
    ? run.cost.usd > 0
      ? `$${run.cost.usd.toFixed(2)}/run`
      : "$0 · quiet"
    : "seeded";
  const asOf = run ? `${run.run_date} ${timeOf(run.knowledge_time)}` : "seeded";

  const vocal: string[] = engineLive
    ? [
        "SYSTEM ONLINE. AWAITING DIRECTIVE.",
        `Latest run ${run!.run_date}: ${run!.triggered_tickers.length} ticker(s) analyzed, ${actionable} actionable.`,
        t0Open
          ? "Critical alert active — review the feed."
          : "Background analysis complete. No critical anomalies.",
      ]
    : [
        "SYSTEM ONLINE. AWAITING DIRECTIVE.",
        "No engine run ingested — operating on seeded demo data.",
        "Run bin/engine-briefing to ingest a live run.",
      ];

  return {
    state,
    provenance: mode.label,
    dataFresh: status.state !== "invalid",
    asOf,
    modelTier,
    costLabel,
    vocal,
    facets: {
      brain: beliefsShifted > 0 ? `${beliefsShifted} beliefs shifted` : "Beliefs stable",
      copilot: `${actionable} actionable today`,
      executor: "PAUSED · SIGNS NOTHING",
    },
  };
}

function shortModel(id: string): string {
  const l = id.toLowerCase();
  if (l.includes("opus")) return "Opus";
  if (l.includes("sonnet")) return "Sonnet";
  if (l.includes("haiku")) return "Haiku";
  if (l.includes("deepseek")) return "DeepSeek";
  if (l.includes("gpt")) return "GPT";
  return id ? id.split(/[-/]/)[0] : "—";
}

function timeOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(11, 16) + "Z";
}
