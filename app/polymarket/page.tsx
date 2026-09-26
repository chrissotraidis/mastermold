import { AppShell } from "@/components/app-shell";
import { PolymarketPanel } from "@/components/polymarket-panel";

export const dynamic = "force-dynamic";

export default function PolymarketPage() {
  return (
    <AppShell dataMode="Live market read">
      <div className="grid w-full grid-cols-1 gap-6">
        <header>
          <p className="mm-eyebrow">Research lab · separate lane</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-on-surface sm:text-4xl">Polymarket lab</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-on-surface-variant">
            Research on edges that don&apos;t need to out-predict the market. Nothing here places orders.
          </p>
        </header>
        <PolymarketPanel />
      </div>
    </AppShell>
  );
}
