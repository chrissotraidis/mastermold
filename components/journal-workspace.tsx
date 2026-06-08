"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";
import { BookPlus, CheckCircle2, SendHorizonal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { JournalEntryJson, JournalJson, TrackRecordTierJson } from "@/src/db/journal";

type FormState = {
  thesis: string;
  signals: string;
  conviction: string;
  horizon: string;
  falsification_condition: string;
};

type FormErrors = Partial<Record<keyof FormState, string>>;

const initialFormState: FormState = {
  thesis: "",
  signals: "",
  conviction: "6",
  horizon: "",
  falsification_condition: "",
};

export function JournalWorkspace({ initialJournal }: { initialJournal: JournalJson }) {
  const [entries, setEntries] = useState(initialJournal.entries);
  const [form, setForm] = useState<FormState>(initialFormState);
  const [message, setMessage] = useState("Log a call before the outcome lands.");
  const [errors, setErrors] = useState<FormErrors>({});
  const [lastLoggedId, setLastLoggedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const trackRecord = useMemo(() => buildTrackRecord(entries), [entries]);

  function updateForm(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) {
        return current;
      }

      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function submitDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clientErrors = validateForm(form);

    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      setLastLoggedId(null);
      setMessage("Not logged — fill the highlighted fields.");
      return;
    }

    setErrors({});

    startTransition(async () => {
      try {
        const response = await fetch("/api/journal", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            thesis: form.thesis,
            signals: form.signals,
            conviction: Number(form.conviction),
            horizon: form.horizon,
            falsification_condition: form.falsification_condition,
          }),
        });
        const body = (await response.json()) as JournalEntryJson | { errors?: string[]; error?: string };

        if (!response.ok) {
          const nextErrors =
            "errors" in body && Array.isArray(body.errors)
              ? body.errors
              : ["error" in body && body.error ? body.error : "Decision could not be logged."];
          setErrors({ thesis: nextErrors.join(" ") });
          setMessage("Couldn't log — check the highlighted fields.");
          return;
        }

        const entry = body as JournalEntryJson;
        setEntries((current) => [entry, ...current]);
        setForm(initialFormState);
        setLastLoggedId(entry.id);
        setMessage(`Logged at ${formatTimestamp(entry.logged_at)}.`);
      } catch {
        setErrors({ thesis: "Network request failed. Try again." });
        setMessage("Request failed. Try again.");
      }
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_23rem] xl:items-start">
      <div className="order-2 space-y-6 xl:order-1">
        <TrackRecordSection tiers={trackRecord} />
        <EntryList entries={entries} lastLoggedId={lastLoggedId} />
        <StrategyBeliefSection journal={initialJournal} />
      </div>

      <aside className="order-1 space-y-4 xl:sticky xl:top-6 xl:order-2">
        <Card className="border-outline-variant/40 bg-surface-high/40">
          <CardHeader className="p-5">
            <div className="flex items-center gap-2">
              <BookPlus aria-hidden="true" className="size-5 text-violet" />
              <CardTitle className="text-xl text-on-surface">Record a call</CardTitle>
            </div>
            <p className="text-sm leading-6 text-outline">
              Write it down before the outcome — including what would prove you wrong.
            </p>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <form className="space-y-4" onSubmit={submitDecision} noValidate>
              <FieldBlock id="journal-thesis" label="Thesis" error={errors.thesis}>
                <textarea
                  id="journal-thesis"
                  value={form.thesis}
                  onChange={(event) => updateForm("thesis", event.target.value)}
                  className="min-h-24 w-full resize-y rounded-md border border-outline-variant/50 bg-surface-dim/70 px-3 py-2 text-sm text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
                  placeholder="What needs to be true?"
                  aria-invalid={Boolean(errors.thesis)}
                />
              </FieldBlock>

              <FieldBlock id="journal-signals" label="Signals" error={errors.signals}>
                <Input
                  id="journal-signals"
                  value={form.signals}
                  onChange={(event) => updateForm("signals", event.target.value)}
                  className="border-outline-variant/50 bg-surface-dim/70 text-on-surface placeholder:text-outline"
                  placeholder="funding, flows, trend"
                  aria-invalid={Boolean(errors.signals)}
                />
                <p className="text-xs text-outline">Separate signals with commas.</p>
              </FieldBlock>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                <FieldBlock id="journal-conviction" label="Conviction" error={errors.conviction}>
                  <Input
                    id="journal-conviction"
                    type="number"
                    min={1}
                    max={10}
                    value={form.conviction}
                    onChange={(event) => updateForm("conviction", event.target.value)}
                    className="border-outline-variant/50 bg-surface-dim/70 text-on-surface"
                    aria-invalid={Boolean(errors.conviction)}
                  />
                </FieldBlock>
                <FieldBlock id="journal-horizon" label="Horizon" error={errors.horizon}>
                  <Input
                    id="journal-horizon"
                    value={form.horizon}
                    onChange={(event) => updateForm("horizon", event.target.value)}
                    className="border-outline-variant/50 bg-surface-dim/70 text-on-surface placeholder:text-outline"
                    placeholder="2-4 weeks"
                    aria-invalid={Boolean(errors.horizon)}
                  />
                </FieldBlock>
              </div>

              <FieldBlock
                id="journal-falsification"
                label="What would prove this wrong?"
                error={errors.falsification_condition}
              >
                <textarea
                  id="journal-falsification"
                  value={form.falsification_condition}
                  onChange={(event) => updateForm("falsification_condition", event.target.value)}
                  className="min-h-24 w-full resize-y rounded-md border border-outline-variant/50 bg-surface-dim/70 px-3 py-2 text-sm text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
                  placeholder="What would prove this wrong?"
                  aria-invalid={Boolean(errors.falsification_condition)}
                />
              </FieldBlock>

              {Object.keys(errors).length > 0 ? (
                <div className="rounded-md border border-critical/40 bg-critical/10 p-3 text-sm leading-6 text-critical">
                  Fill in the missing fields to save.
                </div>
              ) : null}

              <p className="sr-only" aria-live="polite">
                {isPending ? "Logging decision." : message}
              </p>
              <p className="text-sm leading-6 text-outline">{message}</p>

              <Button
                type="submit"
                disabled={isPending}
                className="w-full bg-violet text-void hover:bg-violet"
              >
                <SendHorizonal aria-hidden="true" />
                {isPending ? "Saving…" : "Log it"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

function FieldBlock({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-sm font-semibold text-on-surface">
        {label}
      </Label>
      {children}
      {error ? <p className="text-xs font-medium text-critical">{error}</p> : null}
    </div>
  );
}

function TrackRecordSection({ tiers }: { tiers: TrackRecordTierJson[] }) {
  return (
    <section aria-labelledby="track-record-title" className="space-y-4">
      <div>
        <h2 id="track-record-title" className="text-xl font-semibold text-on-surface">
          Win-rate by conviction
        </h2>
        <p className="mt-1 text-sm text-outline">
          How often calls play out, grouped by how sure you were.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {tiers.map((tier) => (
          <Card key={tier.key} className="border-outline-variant/40 bg-surface-high/30">
            <CardHeader className="p-4">
              <Badge variant="outline" className="w-fit border-violet/40 text-violet">
                {tier.label}
              </Badge>
              <CardTitle className="text-2xl text-on-surface">
                {formatPercent(tier.win_rate)}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 p-4 pt-0 text-sm">
              <Metric label="Resolved" value={`${tier.resolved_count}/${tier.entry_count}`} />
              <Metric label="Mean outcome" value={formatScore(tier.mean_outcome_score)} />
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

function EntryList({
  entries,
  lastLoggedId,
}: {
  entries: JournalEntryJson[];
  lastLoggedId: string | null;
}) {
  return (
    <section aria-labelledby="journal-entries-title" className="space-y-4">
      <div>
        <h2 id="journal-entries-title" className="text-xl font-semibold text-on-surface">
          Journal entries
        </h2>
        <p className="mt-1 text-sm text-outline">
          Your calls, newest first.
        </p>
      </div>

      {entries.length > 0 ? (
        <div className="grid gap-4">
          {entries.map((entry) => (
            <Card
              key={entry.id}
              id={entry.id}
              className={cn(
                "scroll-mb-36 border-outline-variant/40 bg-surface-high/40",
                entry.id === lastLoggedId && "border-violet/50 bg-violet/10",
              )}
            >
              <CardHeader className="space-y-3 p-4 sm:p-5">
                <div className="flex flex-wrap items-center gap-2">
                  {entry.id === lastLoggedId ? (
                    <Badge className="bg-violet text-void hover:bg-violet">
                      Just logged
                    </Badge>
                  ) : null}
                  <Badge variant="outline" className={tierBadgeClass(entry.conviction_tier.key)}>
                    {entry.conviction_tier.label}
                  </Badge>
                  <Badge variant="outline" className="border-outline-variant/50 text-on-surface-variant">
                    Conviction {entry.conviction}/10
                  </Badge>
                  <Badge variant="outline" className="border-outline-variant/50 text-on-surface-variant">
                    {entry.horizon}
                  </Badge>
                </div>
                <CardTitle className="text-xl leading-7 text-on-surface">{entry.thesis}</CardTitle>
                <p className="text-sm text-outline">Logged {formatTimestamp(entry.logged_at)}</p>
              </CardHeader>
              <CardContent className="space-y-4 p-4 pt-0 sm:p-5 sm:pt-0">
                <div className="grid gap-3 text-sm leading-6 lg:grid-cols-2">
                  <InfoPanel label="What would prove this wrong?" value={entry.falsification_condition} />
                  <InfoPanel label="Signals" value={entry.signals.join(", ")} />
                </div>
                {entry.outcome_score ? (
                  <div className="rounded-md border border-engine/20 bg-engine/[0.07] p-4">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <CheckCircle2 aria-hidden="true" className="size-4 text-engine" />
                      <p className="text-sm font-semibold text-engine">Outcome scored</p>
                      <Badge variant="outline" className="border-engine/40 text-engine">
                        Thesis played out: {entry.outcome_score.thesis_played_out ? "yes" : "no"}
                      </Badge>
                    </div>
                    <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                      <Metric label="Process score" value={entry.outcome_score.process_score.toFixed(1)} />
                      <Metric label="Outcome score" value={entry.outcome_score.outcome_score.toFixed(1)} />
                      <Metric label="Resolved" value={formatTimestamp(entry.outcome_score.resolved_at)} />
                      <Metric label="P&L note" value={entry.outcome_score.pnl_note} />
                    </div>
                  </div>
                ) : (
                  <div className="rounded-md border border-outline-variant/40 bg-surface-dim/40 p-4 text-sm text-outline">
                    No outcome yet — this call is logged ahead of the result.
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-outline-variant/40 bg-surface-high/30 p-6 text-sm text-on-surface-variant">
          No calls logged yet.
        </div>
      )}
    </section>
  );
}

function StrategyBeliefSection({ journal }: { journal: JournalJson }) {
  return (
    <section aria-labelledby="strategy-beliefs-title" className="space-y-4">
      <div>
        <h2 id="strategy-beliefs-title" className="text-xl font-semibold text-on-surface">
          What I've learned
        </h2>
        <p className="mt-1 text-sm text-outline">
          Beliefs only move after several consistent outcomes — never on one.
        </p>
      </div>
      <div className="grid gap-4">
        {journal.strategy_beliefs.map((belief) => (
          <Card key={belief.id} className="border-outline-variant/40 bg-surface-high/30">
            <CardHeader className="p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-violet/40 text-violet">
                  Confidence {(belief.confidence * 100).toFixed(0)}%
                </Badge>
                <Badge variant="outline" className="border-outline-variant/50 text-on-surface-variant">
                  Updated {formatTimestamp(belief.updated_at)}
                </Badge>
              </div>
              <CardTitle className="text-xl text-on-surface">{belief.name}</CardTitle>
              <p className="text-sm leading-6 text-on-surface-variant">{belief.statement}</p>
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-0 sm:p-5 sm:pt-0">
              {belief.reflection_updates.length > 0 ? (
                belief.reflection_updates.map((update) => (
                  <div
                    key={update.id}
                    className="rounded-md border border-outline-variant/40 bg-surface-dim/40 p-4 text-sm leading-6 text-on-surface-variant"
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className={
                          update.significance_passed
                            ? "border-engine/40 text-engine"
                            : "border-amber-300/40 text-caution"
                        }
                      >
                        {update.significance_passed ? "Moved a belief" : "Not enough yet"}
                      </Badge>
                      <Badge variant="outline" className="border-outline-variant/50 text-on-surface-variant">
                        Applied: {update.applied ? "yes" : "no"}
                      </Badge>
                      <span className="text-outline">{formatTimestamp(update.created_at)}</span>
                    </div>
                    {update.evidence_summary}
                  </div>
                ))
              ) : (
                <div className="rounded-md border border-outline-variant/40 bg-surface-dim/40 p-4 text-sm text-outline">
                  No updates to this belief yet.
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

function InfoPanel({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-outline-variant/40 bg-surface-dim/40 p-3">
      <p className="text-xs font-semibold uppercase text-outline">{label}</p>
      <p className="mt-1 text-on-surface-variant">{value}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase text-outline">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-on-surface">{value}</p>
    </div>
  );
}

function validateForm(form: FormState): FormErrors {
  const nextErrors: FormErrors = {};
  const conviction = Number(form.conviction);

  if (!form.thesis.trim()) {
    nextErrors.thesis = "Enter the thesis before logging a decision.";
  }

  if (form.signals.split(",").map((signal) => signal.trim()).filter(Boolean).length === 0) {
    nextErrors.signals = "Add at least one signal.";
  }

  if (!Number.isInteger(conviction) || conviction < 1 || conviction > 10) {
    nextErrors.conviction = "Use a whole number from 1 to 10.";
  }

  if (!form.horizon.trim()) {
    nextErrors.horizon = "Add a time horizon.";
  }

  if (!form.falsification_condition.trim()) {
    nextErrors.falsification_condition = "State what would prove the thesis wrong.";
  }

  return nextErrors;
}

function buildTrackRecord(entries: JournalEntryJson[]): TrackRecordTierJson[] {
  const tiers: TrackRecordTierJson[] = [
    emptyTier("1-3", "1-3 exploratory"),
    emptyTier("4-6", "4-6 watchlist"),
    emptyTier("7-10", "7-10 high conviction"),
  ];

  return tiers.map((tier) => {
    const tierEntries = entries.filter((entry) => entry.conviction_tier.key === tier.key);
    const resolvedEntries = tierEntries.filter((entry) => entry.outcome_score);
    const wins = resolvedEntries.filter((entry) => entry.outcome_score?.thesis_played_out).length;
    const outcomeTotal = resolvedEntries.reduce(
      (total, entry) => total + (entry.outcome_score?.outcome_score ?? 0),
      0,
    );

    return {
      ...tier,
      entry_count: tierEntries.length,
      resolved_count: resolvedEntries.length,
      wins,
      win_rate: resolvedEntries.length > 0 ? wins / resolvedEntries.length : null,
      mean_outcome_score:
        resolvedEntries.length > 0 ? outcomeTotal / resolvedEntries.length : null,
    };
  });
}

function emptyTier(key: TrackRecordTierJson["key"], label: string): TrackRecordTierJson {
  return {
    key,
    label,
    entry_count: 0,
    resolved_count: 0,
    wins: 0,
    win_rate: null,
    mean_outcome_score: null,
  };
}

function tierBadgeClass(key: JournalEntryJson["conviction_tier"]["key"]) {
  return cn(
    key === "1-3" && "border-outline-variant/40 text-on-surface-variant",
    key === "4-6" && "border-amber-300/40 text-caution",
    key === "7-10" && "border-engine/40 text-engine",
  );
}

function formatPercent(value: number | null) {
  return value === null ? "No resolved entries" : `${Math.round(value * 100)}% win-rate`;
}

function formatScore(value: number | null) {
  return value === null ? "n/a" : value.toFixed(1);
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}
