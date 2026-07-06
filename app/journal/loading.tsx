import { AppShell } from "@/components/app-shell";
import { JournalLoadingState } from "@/components/journal-loading-state";
import { PageHeader } from "@/components/page-header";

export default function JournalLoading() {
  return (
    <AppShell dataMode="Sample data">
      <div className="mx-auto max-w-4xl">
        <PageHeader
          title="Decision journal"
          subtitle="Save the reason for a call, then review what happened."
          provenance="Sample data"
          back={false}
        />
        <JournalLoadingState />
      </div>
    </AppShell>
  );
}
