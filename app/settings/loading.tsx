import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { SettingsLoadingState } from "@/components/settings-loading-state";

export default function SettingsLoading() {
  return (
    <AppShell dataMode="Sample data">
      <div className="mx-auto max-w-5xl space-y-6">
        <PageHeader
          title="Settings"
          subtitle="Set up your profile, portfolio connections, AI keys, Web3 wallet, and safety limits without digging through technical details."
          provenance="Sample data"
          back={false}
        />
        <SettingsLoadingState />
      </div>
    </AppShell>
  );
}
