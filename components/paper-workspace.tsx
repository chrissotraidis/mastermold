"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { ChevronDown, SendHorizonal } from "lucide-react";
import { submitPaperPrediction, type PaperPredictionFormState } from "@/app/paper/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { plainPaperCopy } from "@/lib/paper-copy";
import { plainBriefingHeadline } from "@/lib/plain-finance-copy";
import { cn } from "@/lib/utils";
import type { PaperPredictionDirection } from "@/src/db/paper";

export type PaperWorkspaceData = {
  assets: Array<{
    key: string;
    symbol: string;
    name: string;
  }>;
  activeRound: PaperRoundData | null;
  completedRounds: PaperRoundData[];
  predictions: PaperTradeData[];
  wallet: {
    startingBalance: number;
    availableCash: number;
    reservedPaperValue: number;
    closedResultValue: number;
    openPositions: number;
  };
};

type PaperRoundData = {
  id: string;
  weekLabel: string;
  opensAt: string;
  closesAt: string;
  status: "open" | "closed" | "scoring";
  predictions: PaperTradeData[];
  score: PaperRoundScoreData | null;
};

type PaperTradeData = {
  id: string;
  assetSymbol: string;
  direction: PaperPredictionDirection;
  confidence: number;
  reason: string;
  submittedAt: string;
};

type PaperRoundScoreData = {
  wasItRight: number;
  patience: number;
  variety: number;
  total: number;
};

type PaperWorkspaceProps = {
  paper: PaperWorkspaceData;
  prefill?: {
    assetKey?: string;
    direction?: PaperPredictionDirection;
    confidence?: number;
    rationale?: string;
  };
};

const directions: Array<{
  value: PaperPredictionDirection;
  label: string;
}> = [
  { value: "long", label: "Long" },
  { value: "flat", label: "No position" },
  { value: "short", label: "Short" },
];

const initialFormState: PaperPredictionFormState = {
  status: "idle",
  message: "Paper trading only. Compare the result after the close date.",
  errors: [],
};

const INITIAL_CLOSED_ROUND_LIMIT = 3;

function clampConfidence(value: number) {
  return Math.max(1, Math.min(10, value));
}

export function PaperWorkspace({ paper, prefill }: PaperWorkspaceProps) {
  const [state, formAction, isPending] = useActionState(
    submitPaperPrediction,
    initialFormState,
  );
  const [direction, setDirection] = useState<PaperPredictionDirection>(prefill?.direction ?? "long");
  const [confidence, setConfidence] = useState(clampConfidence(prefill?.confidence ?? 6));
  const [lastToggle, setLastToggle] = useState("long");
  const [actionSequence, setActionSequence] = useState(0);
  const [formOpen, setFormOpen] = useState(Boolean(prefill?.assetKey || prefill?.rationale));
  const activePredictions = paper.activeRound?.predictions ?? [];
  const latestCompletedRound = useMemo(
    () => paper.completedRounds.find((round) => round.score) ?? paper.completedRounds[0] ?? null,
    [paper.completedRounds],
  );

  useEffect(() => {
    function syncFormFromHash() {
      if (window.location.hash === "#paper-trade-form") {
        setFormOpen(true);
      }
    }

    syncFormFromHash();
    window.addEventListener("hashchange", syncFormFromHash);
    return () => window.removeEventListener("hashchange", syncFormFromHash);
  }, []);

  useEffect(() => {
    if (prefill?.assetKey || prefill?.rationale || state.status === "success") {
      setFormOpen(true);
    }
  }, [prefill?.assetKey, prefill?.rationale, state.status]);

  return (
    <div
      className="space-y-5"
      data-action-evidence={`paper-${lastToggle}-${actionSequence}`}
      data-action-sequence={actionSequence}
    >
      <div className="grid gap-3 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="order-1 space-y-3 sm:space-y-5 lg:col-start-1 lg:row-start-1">
          <ActiveRoundPanel paper={paper} activePredictions={activePredictions} />
          <PaperTradeForm
            paper={paper}
            prefill={prefill}
            formAction={formAction}
            state={state}
            isPending={isPending}
            direction={direction}
            setDirection={setDirection}
            confidence={confidence}
            setConfidence={setConfidence}
            setLastToggle={setLastToggle}
            actionSequence={actionSequence}
            setActionSequence={setActionSequence}
            open={formOpen}
            setOpen={setFormOpen}
          />
        </div>

        <aside className="order-2 space-y-3 sm:space-y-5 lg:sticky lg:top-6 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <PaperAccountPanel wallet={paper.wallet} />
          {latestCompletedRound ? <RoundScorePanel round={latestCompletedRound} compact /> : null}
        </aside>

        <div className="order-3 space-y-3 sm:space-y-5 lg:col-start-1 lg:row-start-2">
          <RoundHistory rounds={paper.completedRounds} />
        </div>
      </div>
    </div>
  );
}

function PaperTradeForm({
  paper,
  prefill,
  formAction,
  state,
  isPending,
  direction,
  setDirection,
  confidence,
  setConfidence,
  setLastToggle,
  actionSequence,
  setActionSequence,
  open,
  setOpen,
}: {
  paper: PaperWorkspaceData;
  prefill?: PaperWorkspaceProps["prefill"];
  formAction: (payload: FormData) => void;
  state: PaperPredictionFormState;
  isPending: boolean;
  direction: PaperPredictionDirection;
  setDirection: (value: PaperPredictionDirection) => void;
  confidence: number;
  setConfidence: Dispatch<SetStateAction<number>>;
  setLastToggle: (value: string) => void;
  actionSequence: number;
  setActionSequence: (updater: (current: number) => number) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  return (
    <details
      id="paper-trade-form"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="scroll-mt-24 rounded-md border border-outline-variant/35 bg-surface-high/35"
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 p-3 text-on-surface marker:hidden sm:min-h-14 sm:p-5 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block text-sm font-semibold">Test a paper trade</span>
          <span className="mt-0.5 block line-clamp-1 text-xs leading-5 text-outline sm:mt-1 sm:text-sm sm:leading-6">
            Choose the asset, direction, amount, and reason only when you are ready to test. Nothing here places a real trade.
          </span>
        </span>
        <span className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md border border-violet/35 px-3 text-xs font-semibold text-violet sm:text-sm">
          {open ? "Close" : "Open"}
        </span>
      </summary>
      <CardContent className="border-t border-outline-variant/25 p-4 pt-4 sm:p-5">
        {paper.activeRound ? (
          <form action={formAction} className="space-y-3 sm:space-y-4">
            <input type="hidden" name="round_id" value={paper.activeRound.id} />
            {prefill?.assetKey || prefill?.rationale ? (
              <div className="rounded-md border border-violet/35 bg-violet/[0.07] p-3 text-sm leading-6 text-on-surface-variant">
                <span className="font-semibold text-on-surface">Prepared by Master Mold.</span>{" "}
                Review the simulator setup, then submit only if this is the paper test you want.
              </div>
            ) : null}

            <FieldBlock id="paper-asset" label="Asset">
              <select
                id="paper-asset"
                name="asset_key"
                defaultValue={prefill?.assetKey}
                className="h-11 w-full rounded-md border border-outline-variant/50 bg-surface-dim/70 px-3 py-2 text-sm text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
                required
              >
                {paper.assets.map((asset) => (
                  <option key={asset.key} value={asset.key}>
                    {asset.symbol} - {asset.name}
                  </option>
                ))}
              </select>
            </FieldBlock>

            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold text-on-surface">Direction</legend>
              <div className="grid grid-cols-3 gap-2">
                {directions.map((item) => (
                  <label
                    key={item.value}
                    className={cn(
                      "relative flex min-h-11 cursor-pointer items-center justify-center overflow-hidden rounded-md border px-3 py-2 text-sm font-medium transition-colors focus-within:ring-2 focus-within:ring-violet",
                      direction === item.value
                        ? "border-violet bg-violet text-void"
                        : "border-outline-variant/50 bg-surface-dim/70 text-on-surface-variant hover:bg-surface-high/60",
                    )}
                  >
                    <input
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      type="radio"
                      name="direction"
                      value={item.value}
                      checked={direction === item.value}
                      data-rds-action="toggle"
                      data-action-state={direction === item.value ? `changed-${actionSequence}` : "idle"}
                      onChange={() => {
                        setDirection(item.value);
                        setLastToggle(item.value);
                        setActionSequence((current) => current + 1);
                      }}
                    />
                    {item.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <FieldBlock id="paper-size" label="Test amount">
              <input
                id="paper-size"
                name="paper_size_usd"
                type="number"
                min={100}
                max={100000}
                step={100}
                defaultValue={5000}
                className="h-11 w-full rounded-md border border-outline-variant/50 bg-surface-dim/70 px-3 py-2 text-sm text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
                required
              />
              <p className="text-xs text-outline">Simulator dollars reserved until the close date.</p>
            </FieldBlock>

            <FieldBlock id="paper-confidence" label="Confidence">
              <input type="hidden" id="paper-confidence" name="confidence" value={confidence} />
              <div
                id="paper-confidence-help"
                className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-md border border-outline-variant/50 bg-surface-dim/70 p-2"
              >
                <button
                  type="button"
                  onClick={() => setConfidence((current) => clampConfidence(current - 1))}
                  className="min-h-11 rounded-md border border-outline-variant/40 px-3 text-sm font-semibold text-on-surface-variant transition hover:border-violet/50 hover:text-violet"
                >
                  Lower
                </button>
                <span className="min-w-20 text-center font-display text-2xl font-semibold tabular-nums text-on-surface">
                  {confidence}/10
                </span>
                <button
                  type="button"
                  onClick={() => setConfidence((current) => clampConfidence(current + 1))}
                  className="min-h-11 rounded-md border border-outline-variant/40 px-3 text-sm font-semibold text-on-surface-variant transition hover:border-violet/50 hover:text-violet"
                >
                  Higher
                </button>
              </div>
              <p className="text-xs text-outline">Use a whole number from 1 to 10.</p>
            </FieldBlock>

            <FieldBlock id="paper-rationale" label="Reason">
              <textarea
                id="paper-rationale"
                name="rationale"
                defaultValue={prefill?.rationale}
                className="min-h-24 w-full resize-y overflow-x-hidden rounded-md border border-outline-variant/50 bg-surface-dim/70 px-3 py-2 text-sm text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
                placeholder="What would make this worth testing?"
                required
              />
            </FieldBlock>

            {state.errors.length > 0 ? (
              <div className="rounded-md border border-critical/40 bg-critical/10 p-3 text-sm leading-6 text-critical">
                {state.errors.join(" ")}
              </div>
            ) : null}

            <p className="sr-only" aria-live="polite">
              {isPending ? "Submitting paper trade." : state.message}
            </p>
            <p
              className={cn(
                "text-sm leading-6",
                state.status === "error" ? "text-critical" : "text-outline",
              )}
            >
              {state.message}
            </p>

            <Button
              type="submit"
              disabled={isPending}
              data-rds-action="submit"
              data-action-state={state.status === "success" ? `changed-${actionSequence}` : "idle"}
              className="w-full bg-violet text-void hover:bg-violet"
            >
              <SendHorizonal aria-hidden="true" />
              {isPending ? "Submitting..." : "Submit paper trade"}
            </Button>
          </form>
        ) : (
          <div className="rounded-md border border-outline-variant/40 bg-surface-dim/50 p-4 text-sm leading-6 text-on-surface-variant">
            No paper-test window is open right now.
          </div>
        )}
      </CardContent>
    </details>
  );
}

function PaperAccountPanel({ wallet }: { wallet: PaperWorkspaceData["wallet"] }) {
  const resultTone = wallet.closedResultValue >= 0 ? "text-engine" : "text-critical";

  return (
    <section
      aria-labelledby="paper-account-title"
      className="rounded-md border border-engine/20 bg-engine/[0.04] p-2.5 sm:p-4"
      data-paper-account-compact
    >
      <h2 id="paper-account-title" className="sr-only">
        Paper account
      </h2>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 sm:hidden">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-outline">
            Paper account
          </p>
          <p className="mt-0.5 font-display text-lg font-semibold leading-none text-on-surface">
            {formatCurrency(wallet.availableCash)}
          </p>
        </div>
        <div className="hidden min-w-0 sm:block">
          <p className="text-sm font-semibold text-on-surface">
            Paper account
          </p>
          <p className="mt-1 hidden text-sm leading-5 text-outline sm:block">
            Paper trades use this simulator balance only. No connected account is touched.
          </p>
        </div>
        <Badge variant="outline" className="shrink-0 border-engine/40 text-engine">
          No real money
        </Badge>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-1.5 sm:hidden">
        <CompactAccountMetric label="Start" value={formatCurrency(wallet.startingBalance)} />
        <CompactAccountMetric label="Active" value={`${wallet.openPositions}`} />
        <CompactAccountMetric label="Reserved" value={formatCurrency(wallet.reservedPaperValue)} />
      </div>

      <div className="mt-3 hidden grid-cols-2 gap-3 sm:grid">
        <Metric label="Starting cash" value={formatCurrency(wallet.startingBalance)} />
        <Metric label="Available" value={formatCurrency(wallet.availableCash)} />
        <Metric label="Active tests" value={`${wallet.openPositions}`} />
        <Metric label="Reserved for tests" value={formatCurrency(wallet.reservedPaperValue)} />
      </div>
      <p className={cn("mt-3 hidden text-sm sm:block", resultTone)}>
        Closed paper result: {wallet.closedResultValue >= 0 ? "+" : ""}
        {formatCurrency(wallet.closedResultValue)}
      </p>
      <p className={cn("mt-1 text-right text-xs font-semibold sm:hidden", resultTone)}>
        Closed result {wallet.closedResultValue >= 0 ? "+" : ""}
        {formatCurrency(wallet.closedResultValue)}
      </p>
    </section>
  );
}

function ActiveRoundPanel({
  paper,
  activePredictions,
}: {
  paper: PaperWorkspaceData;
  activePredictions: PaperWorkspaceData["predictions"];
}) {
  const activeRound = paper.activeRound;

  return (
    <section aria-labelledby="active-paper-round-title" className="space-y-2 sm:space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="active-paper-round-title" className="text-sm font-semibold text-on-surface">
            Open tests
          </h2>
          <p className="mt-1 hidden text-sm leading-6 text-outline sm:block">
            Use simulator dollars to test a call, then review what happened at the close date.
          </p>
        </div>
        {activeRound ? (
          <Badge variant="outline" className="shrink-0 border-outline-variant/50 text-on-surface-variant sm:hidden">
            {activePredictions.length} active
          </Badge>
        ) : null}
      </div>

      {activeRound ? (
        <Card className="border-violet/25 bg-violet/[0.045]">
          <CardHeader className="space-y-2 p-3 sm:space-y-3 sm:p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="hidden bg-violet text-void hover:bg-violet sm:inline-flex">
                {titleCase(activeRound.status)}
              </Badge>
              <Badge variant="outline" className="hidden border-outline-variant/50 text-on-surface-variant sm:inline-flex">
                {activePredictions.length} active {activePredictions.length === 1 ? "test" : "tests"}
              </Badge>
            </div>
            <CardTitle className="text-base text-on-surface">{formatDateRange(activeRound.opensAt, activeRound.closesAt)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 p-3 pt-0 sm:space-y-5 sm:p-5 sm:pt-0">
            <div className="grid gap-2 text-sm min-[360px]:grid-cols-2 sm:gap-3">
              <Metric label="Starts" value={formatTimestamp(activeRound.opensAt)} />
              <Metric label="Close date" value={formatTimestamp(activeRound.closesAt)} />
            </div>
            {activePredictions.length > 0 ? (
              <PredictionList predictions={activePredictions} title="Active tests" />
            ) : (
              <p className="rounded-md border border-outline-variant/35 bg-surface-dim/35 px-3 py-2 text-sm text-outline">
                No simulator tests submitted for this window.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border border-outline-variant/40 bg-surface-high/30 p-6 text-sm text-on-surface-variant">
          No paper-test window is open right now.
        </div>
      )}
    </section>
  );
}

function RoundScorePanel({
  round,
  compact = false,
}: {
  round: PaperWorkspaceData["completedRounds"][number];
  compact?: boolean;
}) {
  return (
    <section aria-labelledby="round-score-title" className={cn("space-y-2", !compact && "sm:space-y-4")}>
      <div>
        <h2 id="round-score-title" className="text-sm font-semibold text-on-surface">
          Latest closed test
        </h2>
        <p className={compact ? "sr-only" : "mt-1 hidden text-sm leading-6 text-outline sm:block"}>
          What happened after the close date, translated into plain review scores.
        </p>
      </div>
      <Card className="border-outline-variant/40 bg-surface-high/30">
        <CardHeader className={cn("p-3", !compact && "sm:p-5")}>
          <CardTitle className={cn("text-base text-on-surface")}>
            {formatDateRange(round.opensAt, round.closesAt)}
          </CardTitle>
        </CardHeader>
        <CardContent className={cn("p-3 pt-0", !compact && "sm:p-5 sm:pt-0")}>
          {round.score ? (
            <div className={cn("grid gap-2 min-[360px]:grid-cols-2 sm:gap-3", compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-4")}>
              <Metric label="Call quality" value={formatScore(round.score.wasItRight)} />
              <Metric label="Timing" value={formatScore(round.score.patience)} />
              <Metric label="Risk spread" value={formatScore(round.score.variety)} />
              <Metric label="Overall result" value={formatTotalScore(round.score.total)} />
            </div>
          ) : (
            <div className="rounded-md border border-outline-variant/40 bg-surface-dim/40 p-4 text-sm text-outline">
              Waiting for the close-date review.
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function RoundHistory({ rounds }: { rounds: PaperWorkspaceData["completedRounds"] }) {
  const [showHistory, setShowHistory] = useState(false);
  const [showAllRounds, setShowAllRounds] = useState(false);
  const scoredRounds = rounds.filter((round) => round.score);
  const totalTests = rounds.reduce((sum, round) => sum + round.predictions.length, 0);
  const averageScore = scoredRounds.length > 0
    ? scoredRounds.reduce((sum, round) => sum + (round.score?.total ?? 0), 0) / scoredRounds.length
    : null;
  const visibleRounds = showAllRounds ? rounds : rounds.slice(0, INITIAL_CLOSED_ROUND_LIMIT);
  const hiddenRoundCount = Math.max(0, rounds.length - visibleRounds.length);

  return (
    <section aria-labelledby="round-history-title" className="space-y-2 sm:space-y-4">
      <div>
        <h2 id="round-history-title" className="text-sm font-semibold text-on-surface">
          Closed tests
        </h2>
        <p className="mt-1 hidden text-sm leading-6 text-outline sm:block">
          Older simulator trades and the review after the close date.
        </p>
      </div>

      {rounds.length > 0 ? (
        <>
          <div className="rounded-md border border-outline-variant/40 bg-surface-high/30 p-3 sm:p-4">
            <div className="grid grid-cols-3 gap-1.5 sm:gap-3">
              <Metric label="Closed rounds" value={String(rounds.length)} />
              <Metric label="Simulator tests" value={String(totalTests)} />
              <Metric label="Avg closed result" value={averageScore === null ? "Pending" : formatTotalScore(averageScore)} />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowHistory((current) => !current)}
              className="mt-3 border-outline-variant/50 bg-surface-dim/40 text-on-surface hover:border-violet/50 hover:text-violet sm:mt-4"
              aria-expanded={showHistory}
              aria-controls="paper-round-history-detail"
            >
              <ChevronDown
                aria-hidden="true"
                className={cn("transition-transform", showHistory && "rotate-180")}
              />
              {showHistory ? "Hide closed-test history" : "Show closed-test history"}
            </Button>
          </div>

          {showHistory ? (
            <div id="paper-round-history-detail" className="grid gap-4">
              {visibleRounds.map((round) => (
                <Card key={round.id} className="border-outline-variant/40 bg-surface-high/30">
                  <CardHeader className="space-y-3 p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="border-outline-variant/50 text-on-surface-variant">
                        {titleCase(round.status)}
                      </Badge>
                      <Badge variant="outline" className="border-outline-variant/50 text-on-surface-variant">
                        {round.predictions.length} {round.predictions.length === 1 ? "test" : "tests"}
                      </Badge>
                    </div>
                    <CardTitle className="text-base text-on-surface">{formatDateRange(round.opensAt, round.closesAt)}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 p-5 pt-0">
                    <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                      <Metric label="Starts" value={formatTimestamp(round.opensAt)} />
                      <Metric label="Close date" value={formatTimestamp(round.closesAt)} />
                      <Metric label="Overall result" value={round.score ? formatTotalScore(round.score.total) : "Pending"} />
                      <Metric label="Risk spread" value={round.score ? formatScore(round.score.variety) : "Pending"} />
                    </div>
                    <PredictionList predictions={round.predictions} title={`Tests from ${formatDateRange(round.opensAt, round.closesAt)}`} />
                  </CardContent>
                </Card>
              ))}
              {showAllRounds || hiddenRoundCount > 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-outline-variant/40 bg-surface-dim/30 p-3">
                  <p className="text-sm leading-6 text-outline">
                    Showing {visibleRounds.length} of {rounds.length} closed rounds.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowAllRounds((current) => !current)}
                    className="border-outline-variant/50 bg-surface-high/40 text-on-surface hover:border-violet/50 hover:text-violet"
                  >
                    <ChevronDown
                      aria-hidden="true"
                      className={cn("transition-transform", showAllRounds && "rotate-180")}
                    />
                    {showAllRounds ? "Show recent rounds" : `Show ${hiddenRoundCount} older rounds`}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : (
        <div className="rounded-lg border border-outline-variant/40 bg-surface-high/30 p-6 text-sm text-on-surface-variant">
          No closed paper tests yet.
        </div>
      )}
    </section>
  );
}

function PredictionList({
  predictions,
  title,
}: {
  predictions: PaperWorkspaceData["predictions"];
  title: string;
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-base font-semibold text-on-surface">{title}</h3>
      {predictions.length > 0 ? (
        <div className="grid gap-3">
          {predictions.map((prediction) => (
            <div
              key={prediction.id}
              className="rounded-md border border-outline-variant/40 bg-surface-dim/45 p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-violet/40 text-violet">
                  {prediction.assetSymbol}
                </Badge>
                <Badge variant="outline" className="border-outline-variant/50 text-on-surface-variant">
                  {directionLabel(prediction.direction)}
                </Badge>
                <Badge variant="outline" className="border-outline-variant/50 text-on-surface-variant">
                  Confidence {prediction.confidence}/10
                </Badge>
              </div>
              <p className="mt-3 text-sm leading-6 text-on-surface-variant">
                {plainPaperCopy(plainBriefingHeadline(prediction.reason))}
              </p>
              <p className="mt-2 text-xs text-outline">
                Submitted {formatTimestamp(prediction.submittedAt)}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-outline-variant/40 bg-surface-dim/40 p-4 text-sm text-outline">
          No paper trades submitted for this test window.
        </div>
      )}
    </div>
  );
}

function FieldBlock({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-sm font-semibold text-on-surface">
        {label}
      </Label>
      {children}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-outline-variant/40 bg-surface-dim/45 p-2 sm:p-3">
      <p className="text-[10px] font-medium uppercase leading-4 text-outline sm:text-xs">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-on-surface">{value}</p>
    </div>
  );
}

function CompactAccountMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-outline-variant/35 bg-surface-dim/35 p-2">
      <p className="truncate text-[10px] font-medium uppercase text-outline">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-on-surface">{value}</p>
    </div>
  );
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function directionLabel(direction: PaperPredictionDirection) {
  if (direction === "flat") return "No position";
  return titleCase(direction);
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(value));
}

function formatDateRange(start: string, end: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

  return `${formatter.format(new Date(start))} to ${formatter.format(new Date(end))}`;
}

function formatScore(value: number) {
  return `${value.toFixed(1)}/10`;
}

function formatTotalScore(value: number) {
  return `${value.toFixed(1)}/30`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}
