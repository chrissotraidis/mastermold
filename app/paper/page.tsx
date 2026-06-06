import Link from "next/link";
import { ArrowLeft, Gamepad2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PaperWorkspace } from "@/components/paper-workspace";
import { Badge } from "@/components/ui/badge";
import { getPaperPageData } from "@/src/db/paper";

export default function PaperPage() {
  const paper = getPaperPageData();

  return (
    <AppShell>
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
              <Gamepad2 aria-hidden="true" className="size-3.5" />
              Paper
            </Badge>
            <Badge variant="outline" className="border-white/15 text-slate-200">
              Demo data
            </Badge>
            <Badge variant="outline" className="border-white/15 text-slate-200">
              Open paper round
            </Badge>
            <Badge variant="outline" className="border-white/15 text-slate-200">
              {paper.predictions.length} predictions
            </Badge>
          </div>
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <h2 className="text-3xl font-semibold text-white sm:text-4xl">
                Paper-trading sandbox with process-based scoring
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
                Open paper predictions, view round score metrics, and view round history.
                Scores emphasize calibration, patience, and diversification with zero capital.
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Data source: {paper.provenance.source}; as_of {paper.provenance.as_of}.
              </p>
            </div>
            <div className="rounded-md border border-white/10 bg-white/[0.035] px-4 py-3 text-sm leading-6 text-slate-300">
              API route available at <span className="font-mono text-slate-100">/api/paper</span> for automated checks.
            </div>
          </div>
        </header>

        <PaperWorkspace paper={paper} />
      </div>
    </AppShell>
  );
}
