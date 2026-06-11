import type { SystemState } from "@/components/sentinel-face";
import { getAlerts } from "./alerts";
import { getBriefingCards } from "./briefing";
import { getDataMode, getEngineStatus } from "./engine-data";
import { getExecutor } from "./executor";
import { getJournal } from "./journal";
import type { AsOfFilter } from "./bitemporal";

/**
 * Master Mold's live posture (the face/eye state) plus a plain-language summary of what
 * needs the operator today — so the deck reads like Master Mold talking, not a console.
 */
export type SystemTelemetry = {
  state: SystemState;
  provenance: "Engine output" | "Demo data";
  greeting: string; // one natural sentence Master Mold "says"
  updatedLabel: string; // terse freshness/cost line, e.g. "updated 13:42 · $0.49"
  alertCount: number; // unacknowledged
  actionableCount: number;
  memoryNote: string;
  executorNote: string;
};

export function getSystemState(asOf: AsOfFilter | null = null): SystemTelemetry {
  const status = getEngineStatus(asOf);
  const mode = getDataMode(asOf);
  const alerts = getAlerts(asOf);
  const cards = getBriefingCards(asOf);
  const journal = getJournal(asOf);
  const executor = getExecutor(asOf);

  const engineLive = status.state === "live";
  const actionable = cards.filter((c) => c.status === "actionable").length;
  const openAlerts = alerts.filter((a) => !a.acknowledged).length;
  const t0Open = alerts.some((a) => a.tier === "T0" && !a.acknowledged);
  const safeMode = executor.strategies.some((s) => s.status === "safe_mode");
  const beliefsShifted = journal.reflection_updates.filter((r) => r.significance_passed).length;

  let state: SystemState = "idle";
  if (t0Open) state = "alert";
  else if (status.state === "invalid") state = "degraded";
  else if (safeMode) state = "caution";
  else if (engineLive && actionable > 0) state = "suggestion";

  const run = engineLive ? status.bundle.run : null;
  const updatedLabel = run
    ? `updated ${timeOf(run.knowledge_time)}${run.cost.usd > 0 ? ` · $${run.cost.usd.toFixed(2)}` : " · $0"}`
    : "sample data";

  return {
    state,
    provenance: mode.label,
    greeting: buildGreeting({ engineLive, actionable, t0Open, openAlerts }),
    updatedLabel,
    alertCount: openAlerts,
    actionableCount: actionable,
    memoryNote: beliefsShifted > 0 ? `${beliefsShifted} belief${beliefsShifted > 1 ? "s" : ""} shifted` : "Beliefs steady",
    executorNote: "Paused · signs nothing",
  };
}

function buildGreeting(o: {
  engineLive: boolean;
  actionable: number;
  t0Open: boolean;
  openAlerts: number;
}): string {
  if (!o.engineLive) {
    return "Using sample data. Add holdings or import a snapshot before treating Today as personal.";
  }
  const alerts = o.openAlerts > 0 ? `${o.openAlerts} alert${o.openAlerts > 1 ? "s" : ""} to review` : "";
  if (o.actionable === 0) {
    return alerts ? `No new idea needs action today. ${cap(alerts)}.` : "Nothing urgent today. I will say so if that changes.";
  }
  const ideas = `${o.actionable} idea${o.actionable > 1 ? "s" : ""}`;
  return alerts ? `${cap(ideas)} on the board today, ${alerts}.` : `${cap(ideas)} on the board today. No alerts to review.`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function timeOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(11, 16);
}
