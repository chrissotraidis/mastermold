import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PortfolioLoadingState } from "@/components/portfolio-loading-state";

export default function PortfolioLoading() {
  return (
    <AppShell dataMode="Sample data">
      <div className="mx-auto max-w-5xl">
        <PageHeader
          title="Portfolio"
          subtitle="Net worth, holdings, allocation, and sources. Manual entries make Today and chat use what you enter."
          provenance="Sample data"
          back={false}
        />
        <PortfolioLoadingState />
      </div>
    </AppShell>
  );
}
