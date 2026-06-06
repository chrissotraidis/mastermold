import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ExecutorWorkspace } from "@/components/executor-workspace";
import { Badge } from "@/components/ui/badge";
import { getExecutor } from "@/src/db/executor";

export default function ExecutorPage() {
  const executor = getExecutor();

  return (
    <AppShell>
      <div className="sticky top-0 z-20 border-b border-cyan-300/25 bg-cyan-950/90 px-4 py-3 text-cyan-50 backdrop-blur sm:px-5">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <ShieldCheck aria-hidden="true" className="size-5 shrink-0" />
            <p className="text-sm font-semibold">Display only — signs nothing</p>
          </div>
          <p className="text-xs leading-5 text-cyan-100/80">
            Guardrail edits and kill-switch actions stay in local React state.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-5 sm:py-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-md text-sm text-slate-300 underline-offset-4 hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to briefing
        </Link>

        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="gap-1 bg-cyan-300 text-slate-950 hover:bg-cyan-300">
              <ShieldCheck aria-hidden="true" className="size-3.5" />
              Executor
            </Badge>
            <Badge variant="outline" className="border-white/15 text-slate-200">
              Demo data
            </Badge>
            <Badge variant="outline" className="border-white/15 text-slate-200">
              Display only
            </Badge>
            <Badge variant="outline" className="border-white/15 text-slate-200">
              {executor.strategies.length} strategies
            </Badge>
          </div>
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <h2 className="text-3xl font-semibold text-white sm:text-4xl">
                Web3 executor monitor with local guardrail controls
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
                Monitor seeded strategy status, funding, net-delta, margin, and basis panels.
                Edit guardrail config and press kill-switch without signing a transaction,
                moving funds, or calling any chain.
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Data source: {executor.provenance.source}; as_of {executor.provenance.as_of}.
              </p>
            </div>
            <div className="rounded-md border border-white/10 bg-white/[0.035] px-4 py-3 text-sm leading-6 text-slate-300">
              API route available at <span className="font-mono text-slate-100">/api/executor</span> for automated checks.
            </div>
          </div>
        </header>

        <ExecutorWorkspace executor={executor} />
      </div>
    </AppShell>
  );
}
