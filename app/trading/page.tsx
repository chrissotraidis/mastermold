import { LabSwitch } from "@/components/lab-switch";
import { AppShell } from "@/components/app-shell";
import { AutopilotPanel } from "@/components/autopilot-panel";
import { Web3ResearchBoard } from "@/components/web3-research-board";

export const dynamic = "force-dynamic";

export default function TradingPage() {
  return (
    <AppShell dataMode="Live DEX read">
      <div className="grid w-full grid-cols-1 gap-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
          <p className="mm-eyebrow">Research lab · separate lane</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-on-surface sm:text-4xl">Web3 lab</h1>
          <p className="mt-1 hidden max-w-3xl text-sm leading-6 text-on-surface-variant sm:block">
            A Solana trading bot that paper trades with pretend money, kept apart from your portfolio. Live money stays locked.
          </p>
          </div>
          <LabSwitch current="web3" />
        </header>

        <section aria-labelledby="autopilot-status-title">
          <h2 id="autopilot-status-title" className="sr-only">
            Bot room
          </h2>
          <AutopilotPanel research={<Web3ResearchBoard />} />
        </section>
      </div>
    </AppShell>
  );
}
