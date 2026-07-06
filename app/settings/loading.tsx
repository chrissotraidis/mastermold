import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { SettingsLoadingState } from "@/components/settings-loading-state";

export default function SettingsLoading() {
  return (
    <AppShell dataMode="Sample data">
      <div className="mx-auto max-w-5xl space-y-6">
        <PageHeader
          title="Settings"
          subtitle="Connect real inputs, manage profile preferences, and keep live-money boundaries visible."
          provenance="Sample data"
          back={false}
        />
        <SettingsLoadingState />
      </div>
    </AppShell>
  );
}
