import { Cpu, TrendingDown, TrendingUp } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PaperWorkspace } from "@/components/paper-workspace";
import { Badge } from "@/components/ui/badge";
import { getPaperPageData, type PaperPredictionJson } from "@/src/db/paper";

export default function PaperPage() {
  const paper = getPaperPageData();

  return (
    <AppShell dataMode={paper.provenance.label}>
      <div className="mx-auto max-w-5xl">
        <PageHeader
          title="Practice"
          subtitle="Make the call before the week plays out, then see how it scored. On judgment — calibration, patience, diversification — not P&L. No real money."
          provenance={paper.provenance.label}
        />

        {paper.enginePredictions.length > 0 && paper.activeRound ? (
          <div className="mb-6">
            <EngineArena predictions={paper.enginePredictions} weekLabel={paper.activeRound.week_label} />
          </div>
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
          <h2 id="engine-arena-title" className="font-display text-lg font-semibold text-on-surface">
            My calls this round
          </h2>
          <p className="text-sm leading-6 text-on-surface-variant">
            Where I landed on each idea. Make yours below — same scoring.
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
