import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PortfolioLoadingState } from "@/components/portfolio-loading-state";

export default function PortfolioLoading() {
  return (
    <AppShell dataMode="Sample data">
      <div className="mx-auto max-w-5xl">
        <PageHeader
          title="Portfolio"
          subtitle="Holdings, allocation, and source status for Today and chat."
          provenance="Sample data"
          back={false}
        />
        <PortfolioLoadingState />
      </div>
    </AppShell>
  );
}
