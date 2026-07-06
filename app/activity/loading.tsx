import { AppShell } from "@/components/app-shell";
import { ActivityLoadingState } from "@/components/activity-loading-state";
import { PageHeader } from "@/components/page-header";

export default function ActivityLoading() {
  return (
    <AppShell dataMode="Sample data">
      <div className="mx-auto max-w-4xl">
        <PageHeader
          title="Activity"
          subtitle="Review the latest activity, decide what matters, then dismiss what is not useful."
          provenance="Sample data"
          back={false}
        />
        <ActivityLoadingState />
      </div>
    </AppShell>
  );
}
