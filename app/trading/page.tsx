import { AppShell } from "@/components/app-shell";
import { AutopilotPanel } from "@/components/autopilot-panel";
import { Web3ResearchBoard } from "@/components/web3-research-board";

export const dynamic = "force-dynamic";

export default function TradingPage() {
  return (
    <AppShell dataMode="Live DEX read">
      <div className="grid w-full grid-cols-1 gap-6">
        <header>
          <p className="mm-eyebrow">Research lab · separate lane</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-on-surface sm:text-4xl">Web3 lab</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-on-surface-variant">
            Autopilot is a separate paper-bot experiment for live market watching. Live money stays locked.
            Portfolio imports are not used here; server wallet setup and the go-live gate are
            separate.
          </p>
        </header>

        <Web3ResearchBoard />

        <section aria-labelledby="autopilot-status-title">
          <h2 id="autopilot-status-title" className="mm-eyebrow mb-3">
            Bot room
          </h2>
          <AutopilotPanel />
        </section>
      </div>
    </AppShell>
  );
}
