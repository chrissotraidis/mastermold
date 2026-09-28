import { LabSwitch } from "@/components/lab-switch";
import { AppShell } from "@/components/app-shell";
import { PolymarketPanel } from "@/components/polymarket-panel";

export const dynamic = "force-dynamic";

export default function PolymarketPage() {
  return (
    <AppShell dataMode="Live market read">
      <div className="grid w-full grid-cols-1 gap-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
          <p className="mm-eyebrow">Research lab · separate lane</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-on-surface sm:text-4xl">Polymarket lab</h1>
          <p className="mt-1 hidden max-w-3xl text-sm leading-6 text-on-surface-variant sm:block">
            A prediction-market bot that paper trades with pretend money. Real orders are not built.
          </p>
          </div>
          <LabSwitch current="polymarket" />
        </header>
        <PolymarketPanel />
      </div>
    </AppShell>
  );
}
