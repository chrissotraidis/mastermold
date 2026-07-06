import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { AlertFeed } from "@/components/alert-feed";
import { productProvenanceLabel } from "@/lib/provenance-copy";
import { toPublicAlert } from "@/lib/public-api-copy";
import { parseAsOf } from "@/src/db/bitemporal";
import { getAlerts } from "@/src/db/alerts";
import { getDataMode } from "@/src/db/engine-data";

export const dynamic = "force-dynamic";

type ActivityPageProps = {
  searchParams?: Promise<{
    as_of?: string;
    filter?: string;
  }>;
};

export default async function ActivityPage({ searchParams }: ActivityPageProps) {
  const params = await searchParams;
  const parsedAsOf = parseAsOf(params?.as_of ?? null);
  const asOf = parsedAsOf.ok ? parsedAsOf.asOf : null;
  const initialFilter = parseActivityFilter(params?.filter);
  const alerts = getAlerts(asOf);
  const active = alerts.filter((alert) => !alert.acknowledged).length;
  const dataMode = getDataMode(asOf);
  const publicDataMode = productProvenanceLabel(dataMode.label);

  return (
    <AppShell dataMode={publicDataMode}>
      <div className="mx-auto w-full max-w-6xl space-y-4">
        <header>
          <h1 className="font-display text-lg font-semibold text-on-surface">Activity</h1>
          <p className="mt-0.5 text-xs text-outline">
            {active > 0
              ? `${active} item${active === 1 ? "" : "s"} to review. `
              : "All clear. "}
            <Link href="/" className="text-violet hover:text-tertiary">
              Back to Today →
            </Link>
          </p>
        </header>
        <div id="activity-list">
          <AlertFeed
            initialAlerts={alerts.map(toPublicAlert)}
            replayAsOf={asOf ? asOf.iso : null}
            initialFilter={initialFilter}
          />
        </div>
      </div>
    </AppShell>
  );
}

function parseActivityFilter(filter?: string) {
  if (filter === "urgent") return "Urgent";
  if (filter === "worth-checking") return "Worth checking";
  if (filter === "fyi") return "FYI";
  return "All";
}
