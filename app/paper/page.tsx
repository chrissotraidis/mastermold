import { CircleMinus, ScanSearch, TrendingDown, TrendingUp } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PaperWorkspace, type PaperWorkspaceData } from "@/components/paper-workspace";
import { Badge } from "@/components/ui/badge";
import { plainPaperCopy } from "@/lib/paper-copy";
import { cleanAlertMessage, explainAlertRelevance } from "@/lib/alert-loop";
import { plainBriefingHeadline, plainBriefingText } from "@/lib/plain-finance-copy";
import { productProvenanceLabel } from "@/lib/provenance-copy";
import { getAlerts } from "@/src/db/alerts";
import { parseAsOf } from "@/src/db/bitemporal";
import { getPaperPageData, type PaperPredictionJson } from "@/src/db/paper";

type PaperPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PaperPage({ searchParams }: PaperPageProps) {
  const params = await searchParams;
  const parsedAsOf = parseAsOf(singleParam(params?.as_of) ?? null);
  const paper = getPaperPageData(parsedAsOf.ok ? parsedAsOf.asOf : null);
  const symbol = singleParam(params?.symbol)?.toUpperCase();
  const action = singleParam(params?.action);
  const topIdea = action === "prepare-top-paper-trade" ? paper.enginePredictions[0] : null;
  const topActivity =
    action === "prepare-top-activity-paper-trade"
      ? getAlerts(parsedAsOf.ok ? parsedAsOf.asOf : null).find((alert) => !alert.acknowledged) ?? null
      : null;
  const topActivityRationale = topActivity
    ? `Testing the top activity item with simulator dollars: ${cleanAlertMessage(topActivity.message)}. ${explainAlertRelevance(topActivity)}`
    : "";
  const topIdeaRationale = topIdea
    ? `Testing the top saved market idea with simulator dollars: ${plainBriefingHeadline(topIdea.rationale)}`
    : "";
  const requestedRationale = singleParam(params?.rationale);
  const prefill = {
    assetKey:
      paper.assets.find((asset) => asset.symbol.toUpperCase() === symbol)?.symbol ??
      topActivity?.asset_symbol ??
      topIdea?.asset.symbol,
    direction: topIdea?.direction,
    confidence: topIdea?.conviction,
    rationale: plainPaperCopy(
      plainBriefingText(
        requestedRationale ?? (topActivityRationale || topIdeaRationale),
      ),
    ),
  };
  const workspacePaper = toPaperWorkspaceData(paper);
  const publicProvenanceLabel = productProvenanceLabel(paper.provenance.label);
  return (
    <AppShell dataMode={publicProvenanceLabel}>
      <div className="mx-auto max-w-5xl">
        <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-lg font-semibold text-on-surface">Simulator</h1>
            <p className="mt-0.5 text-xs text-outline">
              Test calls with simulator dollars before risking anything.{" "}
              <a href="/journal" className="text-violet hover:text-tertiary">
                Back to Journal →
              </a>
            </p>
          </div>
          <a
            href="#paper-trade-form"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-violet px-3 text-xs font-semibold text-void transition hover:bg-violet/90 sm:min-h-8"
          >
            New test
          </a>
        </header>

        <PaperWorkspace paper={workspacePaper} prefill={prefill} />

        {paper.enginePredictions.length > 0 && paper.activeRound ? (
          <div className="mt-6">
            <MasterMoldPaperIdeas predictions={paper.enginePredictions} weekLabel={paper.activeRound.week_label} />
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

function toPaperWorkspaceData(paper: ReturnType<typeof getPaperPageData>): PaperWorkspaceData {
  return {
    assets: paper.assets.map((asset) => ({
      key: asset.symbol,
      symbol: asset.symbol,
      name: asset.name,
    })),
    activeRound: paper.activeRound ? toPaperRoundData(paper.activeRound) : null,
    completedRounds: paper.completedRounds.map(toPaperRoundData),
    predictions: paper.predictions.map(toPaperTradeData),
    wallet: {
      startingBalance: paper.fake_wallet.starting_balance,
      availableCash: paper.fake_wallet.available_cash,
      reservedPaperValue: paper.fake_wallet.open_fake_value,
      closedResultValue: paper.fake_wallet.closed_result_value,
      openPositions: paper.fake_wallet.open_positions,
    },
  };
}

function toPaperRoundData(round: ReturnType<typeof getPaperPageData>["rounds"][number]): PaperWorkspaceData["completedRounds"][number] {
  return {
    id: round.id,
    weekLabel: round.week_label,
    opensAt: round.opens_at,
    closesAt: round.closes_at,
    status: round.status,
    predictions: round.predictions.map(toPaperTradeData),
    score: round.score
      ? {
          wasItRight: round.score.calibration,
          patience: round.score.patience,
          variety: round.score.diversification,
          total: round.score.total,
        }
      : null,
  };
}

function toPaperTradeData(prediction: PaperPredictionJson): PaperWorkspaceData["predictions"][number] {
  return {
    id: prediction.id,
    assetSymbol: prediction.asset.symbol,
    direction: prediction.direction,
    confidence: prediction.conviction,
    reason: plainPaperCopy(plainBriefingText(prediction.rationale)),
    submittedAt: prediction.submitted_at,
  };
}

function singleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function MasterMoldPaperIdeas({
  predictions,
  weekLabel,
}: {
  predictions: PaperPredictionJson[];
  weekLabel: string;
}) {
  const hiddenMobileCount = Math.max(0, predictions.length - 2);

  return (
    <section
      aria-labelledby="engine-paper-title"
      className="rounded-md border border-engine/30 bg-engine/[0.06] p-3 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex size-9 items-center justify-center rounded-md border border-engine/30 bg-surface-dim/50 text-engine">
          <ScanSearch aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="engine-paper-title" className="font-display text-lg font-semibold text-on-surface">
            Ideas to test
          </h2>
          <p className="line-clamp-2 text-sm leading-5 text-on-surface-variant sm:leading-6">
            Saved market ideas you can try with simulator dollars, then compare after the close date.
          </p>
        </div>
        <Badge variant="outline" className="shrink-0 border-engine/40 text-engine">
          {predictions.length} ideas
        </Badge>
      </div>
      <ul className="mt-3 grid gap-2 sm:mt-4 sm:grid-cols-2 lg:grid-cols-3">
        {predictions.map((prediction, index) => {
          const isLong = prediction.direction === "long";
          const isFlat = prediction.direction === "flat";
          const Icon = isFlat ? CircleMinus : isLong ? TrendingUp : TrendingDown;
          return (
            <li
              key={prediction.id}
              className={[
                "rounded-md border border-outline-variant/40 bg-surface-dim/45 p-3",
                index >= 2 ? "hidden sm:block" : "",
              ].join(" ")}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-on-surface">{prediction.asset.symbol}</span>
                <Badge
                  variant="outline"
                  className={
                    isFlat
                      ? "gap-1 border-outline-variant/70 text-outline"
                      : isLong
                        ? "gap-1 border-engine/40 text-engine"
                        : "gap-1 border-critical/40 text-critical"
                  }
                >
                  <Icon aria-hidden="true" className="size-3.5" />
                  {paperDirectionLabel(prediction.direction)} · confidence {prediction.conviction}/10
                </Badge>
              </div>
              <p className="mt-2 line-clamp-2 text-xs leading-5 text-outline">
                {plainPaperCopy(plainBriefingHeadline(prediction.rationale))}
              </p>
            </li>
          );
        })}
      </ul>
      {hiddenMobileCount > 0 ? (
        <p className="mt-2 text-xs leading-5 text-outline sm:hidden">
          {hiddenMobileCount} more ideas appear on wider screens.
        </p>
      ) : null}
    </section>
  );
}

function paperDirectionLabel(direction: PaperPredictionJson["direction"]) {
  if (direction === "flat") return "No position";
  return direction.charAt(0).toUpperCase() + direction.slice(1);
}
