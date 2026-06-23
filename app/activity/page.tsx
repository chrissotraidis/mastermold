import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { AlertFeed } from "@/components/alert-feed";
import { PageHeader } from "@/components/page-header";
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
  const activityRoute = asOf?.iso ? `/activity?as_of=${encodeURIComponent(asOf.iso)}` : "/activity";

  return (
    <AppShell dataMode={publicDataMode}>
      <div className="mx-auto max-w-4xl">
        <PageHeader
          title="Activity"
          subtitle={
            active > 0
              ? `${active} item${active === 1 ? "" : "s"} need a quick check. Review the latest activity, then dismiss what is not useful.`
              : "All clear. Nothing needs attention right now."
          }
          provenance={publicDataMode}
          back={false}
          command={{
            pageContext: {
              surface: "Activity",
              route: activityRoute,
              summary:
                "The user is looking at recent activity and changes: why each item matters, suggested responses, feedback, dismissals, and paper-trade or journal actions.",
            },
            suggestions: [
              { label: "Top activity", prompt: "Show activity list." },
              { label: "What needs attention", prompt: "Show urgent activity." },
              { label: "Test on paper", prompt: "Prepare a paper trade check from the most important activity item." },
              { label: "Save context", prompt: "Save context for chat." },
            ],
          }}
          right={
            <Link
              href="#activity-list"
              className="hidden min-h-11 items-center justify-center rounded-md bg-violet px-4 py-2 text-sm font-semibold text-void transition hover:bg-violet/90 sm:inline-flex"
            >
              {active > 0 ? "Review active items" : "View activity history"}
            </Link>
          }
        />
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
