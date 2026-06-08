import { ListChecks, type LucideIcon, ScanLine, ShieldCheck, SquareStack, TestTube } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ExecutorWorkspace } from "@/components/executor-workspace";
import { PageHeader } from "@/components/page-header";
import { Chip, Panel, PanelHeader } from "@/components/sentinel";
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
      <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Web3 strategies"
        subtitle="The one surface where I'd act — structural yield (lending, funding carry) inside caps you set. Right now it's a preview: nothing here signs or moves funds."
        provenance={executor.provenance.label}
        right={<Chip tone="critical">Signs nothing yet</Chip>}
      />

      <Panel className="mb-6 p-4" tint="act">
        <p className="relative z-10 font-mono text-[11px] uppercase tracking-telemetry text-caution">
          Worst case is the float I'm given — nothing more
        </p>
        <p className="relative z-10 mt-1 max-w-3xl text-sm leading-6 text-on-surface-variant">
          The spend cap lives on-chain. Even fully hijacked, I could only reach that small working
          tranche — never your custody.
        </p>
      </Panel>

      {/* Pre-Sign Safety Gate Stack */}
      <Panel tint="act" className="mb-gutter p-5 sm:p-6">
        <PanelHeader icon={SquareStack} iconClassName="text-caution" title="Every transaction clears four checks first" />
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
          If any check errors, the transaction is rejected — the gate never waves something through.
          I can only propose; the rules I can't override decide.
        </p>
      </Panel>

      <ExecutorWorkspace executor={executor} />
      </div>
    </AppShell>
  );
}
