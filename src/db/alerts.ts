import { demoDatabase } from "./seed-data";
import type { Alert } from "./schema";
import { engineAlerts, engineProvenance, engineRunSummary, getEngineStatus } from "./engine-data";
import { store, type AlertStateRow } from "./store";

export type AlertTier = Alert["tier"];
export type UsefulFeedback = Alert["useful_feedback"];

export type AlertProvenance = {
  label: "Demo data" | "Engine output";
  source: string;
  as_of: string;
};

export type AlertJson = Pick<
  Alert,
  "id" | "tier" | "z_score" | "message" | "rationale" | "acknowledged" | "useful_feedback"
> & {
  asset_id: string;
  provenance: AlertProvenance;
};

const tierRank: Record<AlertTier, number> = {
  T0: 0,
  T1: 1,
  T2: 2,
};

// Ack/feedback state is persisted (Phase 1.5) so it survives restart, independent of
// the data source so it also survives a seed<->engine switch. Reads fall back to the
// alert's own defaults when nothing has been persisted yet (no write on read).
function currentState(alert: Alert): AlertStateRow {
  return (
    store().getAlertState(alert.id) ?? {
      acknowledged: alert.acknowledged,
      useful_feedback: alert.useful_feedback,
    }
  );
}

/** The raw alert rows from whichever source is live, plus the matching provenance. */
function activeAlerts(): { alerts: Alert[]; provenance: (alert: Alert) => AlertProvenance } {
  const status = getEngineStatus();
  if (status.state === "live") {
    const engineProv = engineProvenance(status.bundle, engineRunSummary(status.bundle));
    const prov: AlertProvenance = {
      label: "Engine output",
      source: engineProv.source,
      as_of: engineProv.as_of,
    };
    return { alerts: engineAlerts(status.bundle), provenance: () => prov };
  }
  return {
    alerts: demoDatabase.alerts,
    provenance: (alert) => ({
      label: "Demo data",
      source: "Seeded alert feed",
      as_of: alert.knowledge_time,
    }),
  };
}

export function getAlerts(): AlertJson[] {
  const { alerts, provenance } = activeAlerts();
  return alerts
    .map((alert) => {
      const state = currentState(alert);
      return toAlertJson(
        {
          ...alert,
          acknowledged: state.acknowledged,
          useful_feedback: state.useful_feedback,
        },
        provenance(alert),
      );
    })
    .sort(
      (a, b) =>
        tierRank[a.tier] - tierRank[b.tier] ||
        Number(a.acknowledged) - Number(b.acknowledged) ||
        b.z_score - a.z_score ||
        a.message.localeCompare(b.message),
    );
}

export function acknowledgeAlert(id: string): AlertJson | null {
  const alert = findAlert(id);
  if (!alert) {
    return null;
  }
  const state = currentState(alert);
  store().setAlertState(alert.id, { acknowledged: true, useful_feedback: state.useful_feedback });
  return getAlertById(alert.id);
}

export function saveAlertFeedback(id: string, useful_feedback: UsefulFeedback): AlertJson | null {
  const alert = findAlert(id);
  if (!alert) {
    return null;
  }
  const state = currentState(alert);
  store().setAlertState(alert.id, { acknowledged: state.acknowledged, useful_feedback });
  return getAlertById(alert.id);
}

function getAlertById(id: string): AlertJson | null {
  return getAlerts().find((alert) => alert.id === id) ?? null;
}

function findAlert(id: string): Alert | null {
  const decodedId = safelyDecodeId(id);
  return activeAlerts().alerts.find((alert) => alert.id === decodedId) ?? null;
}

function toAlertJson(alert: Alert, provenance: AlertProvenance): AlertJson {
  return {
    id: alert.id,
    asset_id: alert.asset_id,
    tier: alert.tier,
    z_score: alert.z_score,
    message: alert.message,
    rationale: alert.rationale,
    acknowledged: alert.acknowledged,
    useful_feedback: alert.useful_feedback,
    provenance,
  };
}

function safelyDecodeId(id: string) {
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
}
