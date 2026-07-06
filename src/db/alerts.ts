import { demoDatabase } from "./seed-data";
import type { Alert } from "./schema";
import { plainBriefingText } from "@/lib/plain-finance-copy";
import { rawAlertIdFromPublic } from "@/lib/public-ids";
import { engineAlerts, engineProvenance, engineRunSummary, getEngineStatus } from "./engine-data";
import { isKnownBy, type AsOfFilter } from "./bitemporal";
import { getPortfolio } from "./portfolio";
import { store, type AlertStateRow } from "./store";
import { deriveDaemonStatus } from "@/src/autopilot/control";
import { autopilotStore } from "@/src/autopilot/store";

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

/**
 * Daemon supervision (cross-lane READ of the autopilot store, allowed by the
 * lane boundary): when the bot is ARMED but its heartbeat has gone stale, the
 * operator gets a T0 alert in the normal feed — otherwise a crashed daemon is
 * silent until someone opens the Autopilot page. Fail-soft: any store trouble
 * yields null, never a broken alert feed.
 */
function daemonHealthAlert(): AlertJson | null {
  try {
    const state = autopilotStore().botState();
    if (state.mode !== "paper" && state.mode !== "live") return null;
    const status = deriveDaemonStatus(state.last_tick_at);
    if (status === "live") return null;
    const lastTick = state.last_tick_at ? new Date(state.last_tick_at).toLocaleTimeString() : "never";
    return {
      id: "autopilot-daemon-heartbeat",
      tier: "T0",
      z_score: 0,
      message: `Autopilot daemon is ${status} while ${state.mode} mode is armed`,
      rationale: `The trading loop's last heartbeat was ${lastTick}. The bot is not watching the market or collecting data until the daemon is restarted (bun run src/autopilot/daemon.ts).`,
      acknowledged: false,
      useful_feedback: null,
      asset_id: "autopilot-daemon",
      asset_symbol: "BOT",
      asset_name: "Autopilot daemon",
      portfolio_weight_pct: 0,
      signal: "daemon-heartbeat",
      provenance: { label: "Engine output", source: "Autopilot heartbeat monitor", as_of: new Date().toISOString() },
    };
  } catch {
    return null;
  }
}

export function getAlerts(asOf: AsOfFilter | null = null): AlertJson[] {
  const { alerts, provenance } = activeAlerts(asOf);
  const portfolio = getPortfolio(asOf);
  const health = daemonHealthAlert();
  const mapped = alerts
    .map((alert) => {
      const state = asOf ? { acknowledged: alert.acknowledged, useful_feedback: alert.useful_feedback } : currentState(alert);
      // Engine alerts cover the operator's real watchlist, so most asset_ids
      // (asset_aapl, asset_tcai, ...) have no demo-asset row. Resolve the
      // symbol from the alert itself before falling back to "Unknown" — the
      // detail copy builders downstream thread this symbol into every line.
      const asset = demoDatabase.assets.find((item) => item.id === alert.asset_id);
      const symbol = asset?.symbol ?? symbolFromAssetId(alert.asset_id) ?? symbolFromAlertMessage(alert.message);
      const holdingMatches = symbol
        ? portfolio.holdings.filter((holding) => holding.symbol.toUpperCase() === symbol.toUpperCase())
        : [];
      const portfolioWeight = holdingMatches.reduce((sum, holding) => sum + holding.weight_pct, 0);
      return toAlertJson(
        {
          ...alert,
          acknowledged: state.acknowledged,
          useful_feedback: state.useful_feedback,
        },
        provenance(alert),
        {
          symbol: symbol ?? "Unknown",
          name: asset?.name ?? holdingMatches[0]?.asset_name ?? symbol ?? "Unknown asset",
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
  return health ? [health, ...mapped] : mapped;
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
  return activeAlerts().alerts.find((alert) => alert.id === decodedId || alert.id === id) ?? null;
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

/** Engine asset ids are `asset_<symbol lowercased>`; recover the symbol from simple ones. */
function symbolFromAssetId(assetId: string): string | null {
  const match = /^asset_([a-z0-9.\-]{1,10})$/i.exec(assetId);
  return match ? match[1].toUpperCase() : null;
}

/** Screener messages lead with the ticker ("AAPL 1-day return +4.8% ..."). */
function symbolFromAlertMessage(message: string): string | null {
  const token = message.trim().split(/\s+/)[0] ?? "";
  return /^[A-Z][A-Z0-9.\-]{0,9}$/.test(token) ? token : null;
}
