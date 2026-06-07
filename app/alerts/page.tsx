import { AppShell, FirstRunBanner } from "@/components/app-shell";
import { AlertFeed } from "@/components/alert-feed";
import { ProvenanceChip } from "@/components/provenance-chip";
import { Badge } from "@/components/ui/badge";
import { getAlerts } from "@/src/db/alerts";
import { getDataMode } from "@/src/db/engine-data";

export default function AlertsPage() {
  const alerts = getAlerts();
  const activeAlerts = alerts.filter((alert) => !alert.acknowledged);
  const dataMode = getDataMode();

  return (
    <AppShell dataMode={dataMode.label}>
      <FirstRunBanner />
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-5 sm:px-5 sm:py-6">
        <header className="rounded-lg border border-outline-variant/40 bg-panel p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="bg-critical/10 text-critical">
              Alert Feed
            </Badge>
            <ProvenanceChip label={dataMode.label} title={dataMode.source} />
            <Badge variant="outline" className="border-outline-variant/50 text-on-surface-variant">
              {activeAlerts.length} active
            </Badge>
          </div>
          <h2 className="mt-4 text-2xl font-semibold leading-tight text-on-surface sm:text-3xl">
            Triage what changed.
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-on-surface-variant">
            Expand rationale, acknowledge noise, and mark whether the alert helped.
          </p>
        </header>

        <AlertFeed initialAlerts={alerts} />
      </div>
    </AppShell>
  );
}
