import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { TradeLoadingState } from "@/components/trade-loading-state";

export default function TradingLoading() {
  return (
    <AppShell dataMode="Live DEX read">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <PageHeader
          title="Trade"
          subtitle="Monitor the Web3 desk, review the next test trade, and keep live money locked until setup is reviewed."
          provenance="Live DEX read"
          back={false}
        />
        <TradeLoadingState />
      </div>
    </AppShell>
  );
}
