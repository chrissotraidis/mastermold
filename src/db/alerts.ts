import { demoDatabase } from "./seed-data";
import type { Alert } from "./schema";

export type AlertTier = Alert["tier"];
export type UsefulFeedback = Alert["useful_feedback"];

export type AlertJson = Pick<
  Alert,
  "id" | "tier" | "z_score" | "message" | "rationale" | "acknowledged" | "useful_feedback"
> & {
  provenance: {
    label: "Demo data";
    source: "Seeded alert feed";
    as_of: string;
  };
};

const tierRank: Record<AlertTier, number> = {
  T0: 0,
  T1: 1,
  T2: 2,
};

const alertState = new Map(
  demoDatabase.alerts.map((alert) => [
    alert.id,
    {
      acknowledged: alert.acknowledged,
      useful_feedback: alert.useful_feedback,
    },
  ]),
);

export function getAlerts(): AlertJson[] {
  return demoDatabase.alerts
    .map((alert) => {
      const state = alertState.get(alert.id);

      return toAlertJson({
        ...alert,
        acknowledged: state?.acknowledged ?? alert.acknowledged,
        useful_feedback: state?.useful_feedback ?? alert.useful_feedback,
      });
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

  const current = alertState.get(alert.id);
  alertState.set(alert.id, {
    acknowledged: true,
    useful_feedback: current?.useful_feedback ?? alert.useful_feedback,
  });

  return getAlertById(alert.id);
}

export function saveAlertFeedback(id: string, useful_feedback: UsefulFeedback): AlertJson | null {
  const alert = findAlert(id);

  if (!alert) {
    return null;
  }

  const current = alertState.get(alert.id);
  alertState.set(alert.id, {
    acknowledged: current?.acknowledged ?? alert.acknowledged,
    useful_feedback,
  });

  return getAlertById(alert.id);
}

function getAlertById(id: string): AlertJson | null {
  return getAlerts().find((alert) => alert.id === id) ?? null;
}

function findAlert(id: string) {
  const decodedId = safelyDecodeId(id);
  return demoDatabase.alerts.find((alert) => alert.id === decodedId) ?? null;
}

function toAlertJson(alert: Alert): AlertJson {
  return {
    id: alert.id,
    tier: alert.tier,
    z_score: alert.z_score,
    message: alert.message,
    rationale: alert.rationale,
    acknowledged: alert.acknowledged,
    useful_feedback: alert.useful_feedback,
    provenance: {
      label: "Demo data",
      source: "Seeded alert feed",
      as_of: alert.knowledge_time,
    },
  };
}

function safelyDecodeId(id: string) {
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
}
