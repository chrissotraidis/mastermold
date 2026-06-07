import Link from "next/link";
import { ArrowLeft, Cpu, Gamepad2, TrendingDown, TrendingUp } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PaperWorkspace } from "@/components/paper-workspace";
import { ProvenanceChip } from "@/components/provenance-chip";
import { Badge } from "@/components/ui/badge";
import { getPaperPageData, type PaperPredictionJson } from "@/src/db/paper";

export default function PaperPage() {
  const paper = getPaperPageData();

  return (
    <AppShell dataMode={paper.provenance.label}>
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-5 sm:py-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-md text-sm text-on-surface-variant underline-offset-4 hover:text-on-surface hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet focus-visible:ring-offset-2 focus-visible:ring-offset-void"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to briefing
        </Link>

        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="gap-1 bg-violet text-void hover:bg-violet">
              <Gamepad2 aria-hidden="true" className="size-3.5" />
              Paper
            </Badge>
            <ProvenanceChip label={paper.provenance.label} title={paper.provenance.source} />
            <Badge variant="outline" className="border-outline-variant/50 text-on-surface-variant">
              Open paper round
            </Badge>
            <Badge variant="outline" className="border-outline-variant/50 text-on-surface-variant">
              {paper.predictions.length} predictions
            </Badge>
            {paper.enginePredictions.length > 0 ? (
              <Badge variant="outline" className="gap-1 border-engine/40 text-engine">
                <Cpu aria-hidden="true" className="size-3.5" />
                {paper.enginePredictions.length} engine entries
              </Badge>
            ) : null}
          </div>
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <h2 className="text-3xl font-semibold text-on-surface sm:text-4xl">
                Paper-trading sandbox with process-based scoring
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-on-surface-variant">
                Open paper predictions, view round score metrics, and view round history.
                Scores emphasize calibration, patience, and diversification with zero capital.
              </p>
              <p className="mt-2 text-xs text-outline">
                Data source: {paper.provenance.source}; as_of {paper.provenance.as_of}.
              </p>
            </div>
            <div className="rounded-md border border-outline-variant/40 bg-surface-high/30 px-4 py-3 text-sm leading-6 text-on-surface-variant">
              API route available at <span className="font-mono text-on-surface">/api/paper</span> for automated checks.
            </div>
          </div>
        </header>

        {paper.enginePredictions.length > 0 && paper.activeRound ? (
          <EngineArena predictions={paper.enginePredictions} weekLabel={paper.activeRound.week_label} />
        ) : null}

        <PaperWorkspace paper={paper} />
      </div>
    </AppShell>
  );
}

function EngineArena({
  predictions,
  weekLabel,
}: {
  predictions: PaperPredictionJson[];
  weekLabel: string;
}) {
  return (
    <section
      aria-labelledby="engine-arena-title"
      className="rounded-lg border border-engine/30 bg-engine/[0.06] p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-md border border-engine/30 bg-surface-dim/50 text-engine">
          <Cpu aria-hidden="true" className="size-4" />
        </span>
        <div>
          <h2 id="engine-arena-title" className="text-lg font-semibold text-on-surface">
            Engine vs you — {weekLabel}
          </h2>
          <p className="text-sm leading-6 text-on-surface-variant">
            The engine auto-entered a view per actionable card. Submit yours below; the same
            outcome data scores both. Where you disagree and win is prime evidence for the beliefs gate.
          </p>
        </div>
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {predictions.map((prediction) => {
          const isLong = prediction.direction === "long";
          const Icon = isLong ? TrendingUp : TrendingDown;
          return (
            <li
              key={prediction.id}
              className="rounded-md border border-outline-variant/40 bg-surface-dim/45 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-on-surface">{prediction.asset.symbol}</span>
                <Badge
                  variant="outline"
                  className={
                    isLong
                      ? "gap-1 border-engine/40 text-engine"
                      : "gap-1 border-critical/40 text-critical"
                  }
                >
                  <Icon aria-hidden="true" className="size-3.5" />
                  {prediction.direction} · {prediction.conviction}/10
                </Badge>
              </div>
              <p className="mt-2 line-clamp-2 text-xs leading-5 text-outline">
                {prediction.rationale}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
