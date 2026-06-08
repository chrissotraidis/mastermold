"use client";

import { useActionState, useMemo, useState } from "react";
import { SendHorizonal } from "lucide-react";
import { submitPaperPrediction, type PaperPredictionFormState } from "@/app/paper/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { PaperPageData, PaperPredictionDirection } from "@/src/db/paper";

type PaperWorkspaceProps = {
  paper: PaperPageData;
};

const directions: Array<{
  value: PaperPredictionDirection;
  label: string;
}> = [
  { value: "long", label: "Long" },
  { value: "flat", label: "Flat" },
  { value: "short", label: "Short" },
];

const initialFormState: PaperPredictionFormState = {
  status: "idle",
  message: "Scored on process, not P&L.",
  errors: [],
};

export function PaperWorkspace({ paper }: PaperWorkspaceProps) {
  const [state, formAction, isPending] = useActionState(
    submitPaperPrediction,
    initialFormState,
  );
  const [direction, setDirection] = useState<PaperPredictionDirection>("long");
  const [conviction, setConviction] = useState(6);
  const [lastToggle, setLastToggle] = useState("long");
  const [actionSequence, setActionSequence] = useState(0);
  const activePredictions = paper.activeRound?.predictions ?? [];
  const latestCompletedRound = useMemo(
    () => paper.completedRounds.find((round) => round.score) ?? paper.completedRounds[0] ?? null,
    [paper.completedRounds],
  );

  return (
    <div
      className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start"
      data-action-evidence={`paper-${lastToggle}-${actionSequence}`}
      data-action-sequence={actionSequence}
    >
      <div className="space-y-6">
        <ActiveRoundPanel paper={paper} activePredictions={activePredictions} />
        {latestCompletedRound ? <RoundScorePanel round={latestCompletedRound} /> : null}
        <RoundHistory rounds={paper.completedRounds} />
      </div>

      <aside className="xl:sticky xl:top-6">
        <Card className="border-outline-variant/40 bg-surface-high/40">
          <CardHeader className="p-5">
            <CardTitle className="text-xl text-on-surface">Your call</CardTitle>
            <p className="text-sm leading-6 text-outline">
              Pick a direction and how sure you are. Nothing here places a trade.
            </p>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            {paper.activeRound ? (
              <form action={formAction} className="space-y-4">
                <input type="hidden" name="round_id" value={paper.activeRound.id} />

                <FieldBlock id="paper-asset" label="Asset">
                  <select
                    id="paper-asset"
                    name="asset_id"
                    className="h-10 w-full rounded-md border border-outline-variant/50 bg-surface-dim/70 px-3 py-2 text-sm text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
                    required
                  >
                    {paper.assets.map((asset) => (
                      <option key={asset.id} value={asset.id}>
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
                          "flex cursor-pointer items-center justify-center rounded-md border px-3 py-2 text-sm font-medium transition-colors focus-within:ring-2 focus-within:ring-violet",
                          direction === item.value
                            ? "border-violet bg-violet text-void"
                            : "border-outline-variant/50 bg-surface-dim/70 text-on-surface-variant hover:bg-surface-high/60",
                        )}
                      >
                        <input
                          className="sr-only"
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

                <FieldBlock id="paper-conviction" label={`Conviction ${conviction}/10`}>
                  <input
                    id="paper-conviction"
                    name="conviction"
                    type="range"
                    min={1}
                    max={10}
                    step={1}
                    value={conviction}
                    onChange={(event) => setConviction(Number(event.target.value))}
                    className="w-full accent-violet"
                    aria-describedby="paper-conviction-help"
                  />
                  <div
                    id="paper-conviction-help"
                    className="flex justify-between text-xs text-outline"
                  >
                    <span>1 low</span>
                    <span>10 high</span>
                  </div>
                </FieldBlock>

                <FieldBlock id="paper-rationale" label="Rationale">
                  <textarea
                    id="paper-rationale"
                    name="rationale"
                    className="min-h-28 w-full resize-y rounded-md border border-outline-variant/50 bg-surface-dim/70 px-3 py-2 text-sm text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
                    placeholder="What's the evidence behind this call?"
                    required
                  />
                </FieldBlock>

                {state.errors.length > 0 ? (
                  <div className="rounded-md border border-critical/40 bg-critical/10 p-3 text-sm leading-6 text-critical">
                    {state.errors.join(" ")}
                  </div>
                ) : null}

                <p className="sr-only" aria-live="polite">
                  {isPending ? "Submitting prediction." : state.message}
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
                  {isPending ? "Submitting…" : "Submit call"}
                </Button>
              </form>
            ) : (
              <div className="rounded-md border border-outline-variant/40 bg-surface-dim/50 p-4 text-sm leading-6 text-on-surface-variant">
                No round is open for calls right now.
              </div>
            )}
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

function ActiveRoundPanel({
  paper,
  activePredictions,
}: {
  paper: PaperPageData;
  activePredictions: PaperPageData["predictions"];
}) {
  const activeRound = paper.activeRound;

  return (
    <section aria-labelledby="active-paper-round-title" className="space-y-4">
      <div>
        <h2 id="active-paper-round-title" className="text-xl font-semibold text-on-surface">
          This week's round
        </h2>
        <p className="mt-1 text-sm leading-6 text-outline">
          Make your calls — scored on judgment, not P&L.
        </p>
      </div>

      {activeRound ? (
        <Card className="border-violet/30 bg-violet/[0.055]">
          <CardHeader className="space-y-3 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-violet text-void hover:bg-violet">
                {titleCase(activeRound.status)}
              </Badge>
              <Badge variant="outline" className="border-outline-variant/50 text-on-surface-variant">
                {activePredictions.length} predictions
              </Badge>
            </div>
            <CardTitle className="text-2xl text-on-surface">{activeRound.week_label}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 p-5 pt-0">
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <Metric label="Opens" value={formatTimestamp(activeRound.opens_at)} />
              <Metric label="Closes" value={formatTimestamp(activeRound.closes_at)} />
            </div>
            <PredictionList predictions={activePredictions} title="Predictions for active round" />
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border border-outline-variant/40 bg-surface-high/30 p-6 text-sm text-on-surface-variant">
          No round open right now — check back next week.
        </div>
      )}
    </section>
  );
}

function RoundScorePanel({ round }: { round: PaperPageData["rounds"][number] }) {
  return (
    <section aria-labelledby="round-score-title" className="space-y-4">
      <div>
        <h2 id="round-score-title" className="text-xl font-semibold text-on-surface">
          Round score
        </h2>
        <p className="mt-1 text-sm leading-6 text-outline">
          Calibration, patience, and diversification — combined into a total.
        </p>
      </div>
      <Card className="border-outline-variant/40 bg-surface-high/30">
        <CardHeader className="p-5">
          <CardTitle className="text-xl text-on-surface">{round.week_label}</CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-0">
          {round.score ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Calibration" value={round.score.calibration.toFixed(1)} />
              <Metric label="Patience" value={round.score.patience.toFixed(1)} />
              <Metric label="Diversification" value={round.score.diversification.toFixed(1)} />
              <Metric label="Total" value={round.score.total.toFixed(1)} />
            </div>
          ) : (
            <div className="rounded-md border border-outline-variant/40 bg-surface-dim/40 p-4 text-sm text-outline">
              Not scored yet.
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function RoundHistory({ rounds }: { rounds: PaperPageData["completedRounds"] }) {
  return (
    <section aria-labelledby="round-history-title" className="space-y-4">
      <div>
        <h2 id="round-history-title" className="text-xl font-semibold text-on-surface">
          Past rounds
        </h2>
        <p className="mt-1 text-sm leading-6 text-outline">
          Earlier rounds, with their calls and scores.
        </p>
      </div>

      {rounds.length > 0 ? (
        <div className="grid gap-4">
          {rounds.map((round) => (
            <Card key={round.id} className="border-outline-variant/40 bg-surface-high/30">
              <CardHeader className="space-y-3 p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="border-outline-variant/50 text-on-surface-variant">
                    {titleCase(round.status)}
                  </Badge>
                  <Badge variant="outline" className="border-outline-variant/50 text-on-surface-variant">
                    {round.predictions.length} predictions
                  </Badge>
                </div>
                <CardTitle className="text-xl text-on-surface">{round.week_label}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 p-5 pt-0">
                <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <Metric label="Opens" value={formatTimestamp(round.opens_at)} />
                  <Metric label="Closes" value={formatTimestamp(round.closes_at)} />
                  <Metric label="Total score" value={round.score ? round.score.total.toFixed(1) : "Pending"} />
                  <Metric label="Diversification" value={round.score ? round.score.diversification.toFixed(1) : "Pending"} />
                </div>
                <PredictionList predictions={round.predictions} title={`Predictions for ${round.week_label}`} />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-outline-variant/40 bg-surface-high/30 p-6 text-sm text-on-surface-variant">
          No past rounds yet.
        </div>
      )}
    </section>
  );
}

function PredictionList({
  predictions,
  title,
}: {
  predictions: PaperPageData["predictions"];
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
                  {prediction.asset.symbol}
                </Badge>
                <Badge variant="outline" className="border-outline-variant/50 text-on-surface-variant">
                  {prediction.direction}
                </Badge>
                <Badge variant="outline" className="border-outline-variant/50 text-on-surface-variant">
                  Conviction {prediction.conviction}/10
                </Badge>
              </div>
              <p className="mt-3 text-sm leading-6 text-on-surface-variant">{prediction.rationale}</p>
              <p className="mt-2 text-xs text-outline">
                Submitted {formatTimestamp(prediction.submitted_at)}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-outline-variant/40 bg-surface-dim/40 p-4 text-sm text-outline">
          No calls submitted for this round.
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
    <div className="rounded-md border border-outline-variant/40 bg-surface-dim/45 p-3">
      <p className="text-xs font-medium uppercase text-outline">{label}</p>
      <p className="mt-1 break-words text-lg font-semibold text-on-surface">{value}</p>
    </div>
  );
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(value));
}
