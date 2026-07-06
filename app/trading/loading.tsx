import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";

export default function TradingLoading() {
  return (
    <AppShell dataMode="Live DEX read">
      <div className="mx-auto w-full max-w-6xl space-y-4 sm:space-y-5">
        <PageHeader
          title="Autopilot"
          subtitle="Loading the autonomous trading lane."
          provenance="Live DEX read"
          back={false}
        />
        <p className="rounded-md border border-outline-variant/25 px-3 py-2 text-xs leading-5 text-outline" role="status">
          Loading autopilot status…
        </p>
      </div>
    </AppShell>
  );
}
