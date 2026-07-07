import { AppShell } from "@/components/app-shell";
import { AutopilotPanel } from "@/components/autopilot-panel";

export const dynamic = "force-dynamic";

export default function TradingPage() {
  return (
    <AppShell dataMode="Live DEX read">
      <div className="mx-auto w-full max-w-6xl space-y-3 sm:space-y-4">
        <header>
          <h1 className="font-display text-lg font-semibold text-on-surface">Autopilot</h1>
          <p className="mt-0.5 text-xs text-outline">
            Separate paper-bot lane for live market watching. Live money stays locked.
            Portfolio imports are not used here; server wallet setup and the go-live gate are
            separate.
          </p>
        </header>

        <section aria-labelledby="autopilot-status-title">
          <h2 id="autopilot-status-title" className="sr-only">
            Autopilot status
          </h2>
          <AutopilotPanel />
        </section>
      </div>
    </AppShell>
  );
}
