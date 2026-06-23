import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PaperLoadingState } from "@/components/paper-loading-state";

export default function PaperLoading() {
  return (
    <AppShell dataMode="Sample data">
      <div className="mx-auto max-w-5xl">
        <PageHeader
          title="Paper trading"
          subtitle="Try a market call with simulator dollars, then compare the result after the close date. No real money moves here."
          provenance="Sample data"
          back={false}
        />
        <PaperLoadingState />
      </div>
    </AppShell>
  );
}
