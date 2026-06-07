import Link from "next/link";
import { ArrowLeft, ListChecks, type LucideIcon, ScanLine, ShieldCheck, SquareStack, TestTube } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ExecutorWorkspace } from "@/components/executor-workspace";
import { ProvenanceChip } from "@/components/provenance-chip";
import { AuthorityBadge, Chip, Panel, PanelHeader } from "@/components/sentinel";
import { getExecutor } from "@/src/db/executor";

const GATE: Array<{ icon: LucideIcon; label: string; detail: string }> = [
  { icon: ListChecks, label: "Allowlist", detail: "Verified contracts + recipients only" },
  { icon: TestTube, label: "Simulate", detail: "Tenderly fork, balance-diff assertion" },
  { icon: ShieldCheck, label: "Policy", detail: "Per-tx + daily cap, bounded envelope" },
  { icon: ScanLine, label: "Scan", detail: "Hostile-contract scan; red = block" },
];

export default function ExecutorPage() {
  const executor = getExecutor();

  return (
    <AppShell dataMode={executor.provenance.label}>
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-2 text-sm text-on-surface-variant underline-offset-4 hover:text-on-surface hover:underline"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to deck
      </Link>

      <header className="mb-gutter space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone="caution">Executor</Chip>
          <AuthorityBadge zone="act" />
          <ProvenanceChip label={executor.provenance.label} title={executor.provenance.source} />
          <Chip tone="critical">Signs nothing in this version</Chip>
        </div>
        <div className="grid gap-4 lg:grid-cols-[1fr_22rem] lg:items-end">
          <div>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-on-surface sm:text-4xl">
              Web3 bounded autonomy
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-on-surface-variant">
              The one place MasterMold can act — and only within an on-chain envelope you set.
              Monitor strategy status, the bounded envelope, and the fail-closed pre-sign gate. In
              this version the Executor is display-only: every control stays in local React state
              and signs nothing.
            </p>
          </div>
          <Panel className="p-4" tint="act">
            <p className="relative z-10 font-mono text-[11px] uppercase tracking-telemetry text-caution">
              Maximum loss = the bounded float
            </p>
            <p className="relative z-10 mt-1 text-sm leading-6 text-on-surface-variant">
              On-chain spend caps survive a fully-compromised agent: it can only ever lose the small
              working tranche, never your custody.
            </p>
          </Panel>
        </div>
      </header>

      {/* Pre-Sign Safety Gate Stack */}
      <Panel tint="act" className="mb-gutter p-5 sm:p-6">
        <PanelHeader icon={SquareStack} iconClassName="text-caution" title="Pre-sign safety gate · fail-closed" />
        <div className="relative z-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {GATE.map((step, i) => {
            const Icon = step.icon;
            return (
              <div key={step.label} className="relative border border-outline-variant/40 bg-surface-dim/50 p-4 chamfer-sm">
                <span className="absolute right-2 top-2 font-mono text-[10px] text-outline">{i + 1}/4</span>
                <Icon aria-hidden="true" className="size-5 text-caution" />
                <p className="mt-2 font-display text-sm font-semibold uppercase tracking-tight text-on-surface">
                  {step.label}
                </p>
                <p className="mt-1 text-xs leading-5 text-on-surface-variant">{step.detail}</p>
              </div>
            );
          })}
        </div>
        <p className="relative z-10 mt-4 text-xs leading-5 text-outline">
          Any simulation or scan error rejects the transaction — the gate never auto-approves. The
          agent proposes; cryptographically-enforced, agent-external policy disposes.
        </p>
      </Panel>

      <ExecutorWorkspace executor={executor} />
    </AppShell>
  );
}
