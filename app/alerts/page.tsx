import { AppShell } from "@/components/app-shell";
import { AlertFeed } from "@/components/alert-feed";
import { PageHeader } from "@/components/page-header";
import { getAlerts } from "@/src/db/alerts";
import { getDataMode } from "@/src/db/engine-data";

export default function AlertsPage() {
  const alerts = getAlerts();
  const active = alerts.filter((a) => !a.acknowledged).length;
  const dataMode = getDataMode();

  return (
    <AppShell dataMode={dataMode.label}>
      <div className="mx-auto max-w-4xl">
        <PageHeader
          title="What changed"
          subtitle={
            active > 0
              ? `${active} flagged. Clear what's noise; tell me what was useful so I tune the rest.`
              : "All clear — nothing flagged right now."
          }
          provenance={dataMode.label}
        />
        <AlertFeed initialAlerts={alerts} />
      </div>
    </AppShell>
  );
}
