import { demoDatabase } from "./seed-data";
import type { Alert } from "./schema";
import { plainBriefingText } from "@/lib/plain-finance-copy";
import { rawAlertIdFromPublic } from "@/lib/public-ids";
import { engineAlerts, engineProvenance, engineRunSummary, getEngineStatus } from "./engine-data";
import { isKnownBy, type AsOfFilter } from "./bitemporal";
import { getPortfolio } from "./portfolio";
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
  asset_symbol: string;
  asset_name: string;
  portfolio_weight_pct: number;
  signal?: string;
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
function activeAlerts(asOf: AsOfFilter | null = null): { alerts: Alert[]; provenance: (alert: Alert) => AlertProvenance } {
  const status = getEngineStatus(asOf);
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
    alerts: demoDatabase.alerts.filter((alert) => isKnownBy(alert.knowledge_time, asOf)),
    provenance: (alert) => ({
      label: "Demo data",
      source: "Seeded alert feed",
      as_of: alert.knowledge_time,
    }),
  };
}

export function getAlerts(asOf: AsOfFilter | null = null): AlertJson[] {
  const { alerts, provenance } = activeAlerts(asOf);
  const portfolio = getPortfolio(asOf);
  return alerts
    .map((alert) => {
      const state = asOf ? { acknowledged: alert.acknowledged, useful_feedback: alert.useful_feedback } : currentState(alert);
      const asset = demoDatabase.assets.find((item) => item.id === alert.asset_id);
      const portfolioWeight = portfolio.holdings
        .filter((holding) => holding.symbol === asset?.symbol)
        .reduce((sum, holding) => sum + holding.weight_pct, 0);
      return toAlertJson(
        {
          ...alert,
          acknowledged: state.acknowledged,
          useful_feedback: state.useful_feedback,
        },
        provenance(alert),
        {
          symbol: asset?.symbol ?? "Unknown",
          name: asset?.name ?? "Unknown asset",
          portfolio_weight_pct: Math.round(portfolioWeight * 10) / 10,
        },
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

export function setAlertAcknowledged(id: string, acknowledged: boolean): AlertJson | null {
  const alert = findAlert(id);
  if (!alert) {
    return null;
  }
  const state = currentState(alert);
  store().setAlertState(alert.id, { acknowledged, useful_feedback: state.useful_feedback });
  return getAlertById(alert.id);
}

export function acknowledgeAlert(id: string): AlertJson | null {
  return setAlertAcknowledged(id, true);
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
  const decodedId = rawAlertIdFromPublic(id);
  return activeAlerts().alerts.find((alert) => alert.id === decodedId) ?? null;
}

function toAlertJson(
  alert: Alert,
  provenance: AlertProvenance,
  asset: { symbol: string; name: string; portfolio_weight_pct: number },
): AlertJson {
  return {
    id: alert.id,
    asset_id: alert.asset_id,
    asset_symbol: asset.symbol,
    asset_name: asset.name,
    portfolio_weight_pct: asset.portfolio_weight_pct,
    tier: alert.tier,
    z_score: alert.z_score,
    message: plainAlertText(alert.message),
    rationale: plainAlertText(alert.rationale),
    acknowledged: alert.acknowledged,
    useful_feedback: alert.useful_feedback,
    signal: alert.signal,
    provenance,
  };
}

function plainAlertText(value: string) {
  return plainBriefingText(value.replace(/\s*\(z=[^)]*\)\s*$/i, ""));
}
