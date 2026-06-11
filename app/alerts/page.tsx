import { AppShell } from "@/components/app-shell";
import { AlertFeed } from "@/components/alert-feed";
import { PageHeader } from "@/components/page-header";
import { productProvenanceLabel } from "@/lib/provenance-copy";
import { toPublicAlert } from "@/lib/public-api-copy";
import { parseAsOf } from "@/src/db/bitemporal";
import { getAlerts } from "@/src/db/alerts";
import { getDataMode } from "@/src/db/engine-data";

export const dynamic = "force-dynamic";

type AlertsPageProps = {
  searchParams?: Promise<{
    as_of?: string;
  }>;
};

export default async function AlertsPage({ searchParams }: AlertsPageProps) {
  const params = await searchParams;
  const parsedAsOf = parseAsOf(params?.as_of ?? null);
  const asOf = parsedAsOf.ok ? parsedAsOf.asOf : null;
  const alerts = getAlerts(asOf);
  const active = alerts.filter((a) => !a.acknowledged).length;
  const publicAlerts = alerts.map(toPublicAlert);
  const dataMode = getDataMode(asOf);
  const publicDataMode = productProvenanceLabel(dataMode.label);

  return (
    <AppShell dataMode={publicDataMode}>
      <div className="mx-auto max-w-4xl">
        <PageHeader
          title="Alerts"
          subtitle={
            active > 0
              ? `${active} item${active === 1 ? "" : "s"} moved enough to check. Review them, then dismiss what is not useful.`
              : "All clear — nothing needs attention right now."
          }
          provenance={publicDataMode}
        />
        <AlertFeed initialAlerts={publicAlerts} replayAsOf={asOf ? asOf.iso : null} />
      </div>
    </AppShell>
  );
}
