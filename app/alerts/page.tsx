import { AppShell, FirstRunBanner } from "@/components/app-shell";
import { AlertFeed } from "@/components/alert-feed";
import { Badge } from "@/components/ui/badge";
import { getAlerts } from "@/src/db/alerts";

export default function AlertsPage() {
  const alerts = getAlerts();
  const activeAlerts = alerts.filter((alert) => !alert.acknowledged);

  return (
    <AppShell>
      <FirstRunBanner />
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-5 sm:px-5 sm:py-6">
        <header className="rounded-lg border border-white/10 bg-[#101722] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="bg-red-400/10 text-red-100">
              Alert Feed
            </Badge>
            <Badge variant="outline" className="border-white/15 text-slate-200">
              Demo data
            </Badge>
            <Badge variant="outline" className="border-white/15 text-slate-200">
              {activeAlerts.length} active
            </Badge>
          </div>
          <h2 className="mt-4 text-2xl font-semibold leading-tight text-white sm:text-3xl">
            Triage what changed.
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
            Expand rationale, acknowledge noise, and mark whether the alert helped.
          </p>
        </header>

        <AlertFeed initialAlerts={alerts} />
      </div>
    </AppShell>
  );
}
