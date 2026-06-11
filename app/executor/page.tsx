import { ListChecks, type LucideIcon, ScanLine, ShieldCheck, SquareStack, TestTube } from "lucide-react";
import { AsOfReplayControl } from "@/components/as-of-replay-control";
import { AppShell } from "@/components/app-shell";
import { ExecutorWorkspace } from "@/components/executor-workspace";
import { PageHeader } from "@/components/page-header";
import { Chip, Panel, PanelHeader } from "@/components/sentinel";
import { productProvenanceLabel } from "@/lib/provenance-copy";
import { toPublicExecutor } from "@/lib/public-api-copy";
import { parseAsOf } from "@/src/db/bitemporal";
import { getExecutor } from "@/src/db/executor";

const GATE: Array<{ icon: LucideIcon; label: string; detail: string }> = [
  { icon: ListChecks, label: "Approved list", detail: "Only approved contracts and recipients" },
  { icon: TestTube, label: "Result preview", detail: "Show balance changes before any request" },
  { icon: ShieldCheck, label: "Spending limits", detail: "Small per-action and daily caps" },
  { icon: ScanLine, label: "Threat check", detail: "Block anything suspicious before it runs" },
];

type ExecutorPageProps = {
  searchParams?: Promise<{ as_of?: string }>;
};

export default async function ExecutorPage({ searchParams }: ExecutorPageProps) {
  const params = await searchParams;
  const parsedAsOf = parseAsOf(params?.as_of ?? null);
  const executor = getExecutor(parsedAsOf.ok ? parsedAsOf.asOf : null);
  const workspaceExecutor = toPublicExecutor(executor);
  const publicProvenanceLabel = productProvenanceLabel(executor.provenance.label);

  return (
    <AppShell dataMode={publicProvenanceLabel}>
      <div className="mx-auto max-w-5xl">
        <PageHeader
          title="Executor preview"
          subtitle="Review the safety plan a real executor would need. This page cannot sign, call a chain, or move funds."
          provenance={publicProvenanceLabel}
          right={<Chip tone="critical">Signs nothing yet</Chip>}
        />

        <div className="mb-6">
          <AsOfReplayControl activeAsOf={executor.provenance.replay_as_of} apiPath="/api/executor" />
        </div>

        <Panel className="mb-6 p-4" tint="act">
          <p className="relative z-10 font-mono text-[11px] uppercase tracking-telemetry text-caution">
            Safety plan
          </p>
          <p className="relative z-10 mt-1 max-w-3xl text-sm leading-6 text-on-surface-variant">
            Before this could ever run, separate safety rules would need to block anything
            beyond the amount you approve. In this build, you only edit a local safety draft.
          </p>
        </Panel>

        <Panel tint="act" className="mb-gutter p-5 sm:p-6">
          <PanelHeader as="h2" icon={SquareStack} iconClassName="text-caution" title="Four checks before any live action" />
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
            Any failed check should block the request. This page cannot submit transactions;
            it only lets you review the local safety draft.
          </p>
        </Panel>

        <ExecutorWorkspace executor={workspaceExecutor} />
      </div>
    </AppShell>
  );
}
