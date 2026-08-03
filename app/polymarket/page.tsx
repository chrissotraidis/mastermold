import { AppShell } from "@/components/app-shell";
import { PolymarketPanel } from "@/components/polymarket-panel";

export const dynamic = "force-dynamic";

export default function PolymarketPage() {
  return (
    <AppShell dataMode="Live market read">
      <div className="mx-auto w-full max-w-6xl space-y-3 sm:space-y-4">
        <header>
          <p className="text-[10px] font-semibold uppercase tracking-telemetry text-outline">Research lab · separate lane</p>
          <h1 className="font-display text-lg font-semibold text-on-surface">Polymarket lab</h1>
          <p className="mt-0.5 max-w-3xl text-xs leading-5 text-outline">
            Separate prediction-market lane: momentum-only paper automation, shadow strategy research, and station-matched weather observation.
            It does not use the Solana wallet, portfolio imports, or advisory account data. Weather betting and all live orders are locked.
          </p>
        </header>
        <PolymarketPanel />
      </div>
    </AppShell>
  );
}
