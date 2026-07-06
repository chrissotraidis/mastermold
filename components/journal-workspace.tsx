"use client";

import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import { BookPlus, CheckCircle2, ChevronDown, SendHorizonal } from "lucide-react";
import { ProvenanceChip } from "@/components/provenance-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { plainJournalSignal, plainJournalText } from "@/lib/journal-copy";
import type { PublicJournal } from "@/lib/public-api-copy";
import { cn } from "@/lib/utils";

type JournalWorkspaceData = PublicJournal;
type JournalEntryData = PublicJournal["entries"][number];
type JournalTrackRecordTier = PublicJournal["track_record"][number];

/** A read-only entry Master Mold wrote about itself: the autopilot Analyst's
 * daily review memo or a loss lesson. Rendered interleaved with human calls
 * so the journal is one stream with clear author attribution. */
export type SystemJournalEntry = {
  id: string;
  kind: "lesson" | "daily-review";
  ts: string;
  text: string;
  symbol: string | null;
};

type FormState = {
  call: string;
  signals: string;
  confidence: string;
  horizon: string;
  falsification_condition: string;
};

type FormErrors = Partial<Record<keyof FormState, string>>;

type OutcomeFormState = {
  call_was_right: boolean | null;
  review_quality: string;
  result_score: string;
  result_note: string;
};

type OutcomeFormErrors = Partial<Record<keyof OutcomeFormState, string>>;

const initialFormState: FormState = {
  call: "",
  signals: "",
  confidence: "6",
  horizon: "",
  falsification_condition: "",
};

const INITIAL_JOURNAL_ENTRY_LIMIT = 1;

export function JournalWorkspace({
  initialJournal,
  initialDraft,
  initialDraftReason,
  focusedEntryId,
  systemEntries = [],
}: {
  initialJournal: JournalWorkspaceData;
  initialDraft?: Partial<FormState>;
  initialDraftReason?: string;
  focusedEntryId?: string;
  systemEntries?: SystemJournalEntry[];
}) {
  const [entries, setEntries] = useState(initialJournal.entries);
  const [form, setForm] = useState<FormState>(() => ({ ...initialFormState, ...initialDraft }));
  const [message, setMessage] = useState("Log a call before the outcome lands.");
  const [errors, setErrors] = useState<FormErrors>({});
  const [lastLoggedId, setLastLoggedId] = useState<string | null>(null);
  const [recordOpen, setRecordOpen] = useState(Boolean(initialDraft));
  const [isPending, startTransition] = useTransition();

  const trackRecord = useMemo(() => buildTrackRecord(entries), [entries]);
  const initialDraftKey = draftKey(initialDraft);
  const statusText = isPending ? "Logging decision." : message;

  useEffect(() => {
    if (!initialDraft) return;

    setForm({ ...initialFormState, ...initialDraft });
    setErrors({});
    setLastLoggedId(null);
    setMessage("Draft prepared. Review it before saving.");
    setRecordOpen(true);
  }, [initialDraft, initialDraftKey]);

  useEffect(() => {
    function openRecordPanelFromHash() {
      if (window.location.hash === "#record-call") {
        setRecordOpen(true);
      }
    }

    openRecordPanelFromHash();
    window.addEventListener("hashchange", openRecordPanelFromHash);
    return () => window.removeEventListener("hashchange", openRecordPanelFromHash);
  }, []);

  function resolveEntry(entry: JournalEntryData) {
    setEntries((current) => current.map((item) => (item.id === entry.id ? entry : item)));
    setMessage(`Closed ${entry.confidence}/10 call.`);
  }

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
            call: form.call,
            reasons: form.signals,
            confidence: Number(form.confidence),
            horizon: form.horizon,
            falsification_condition: form.falsification_condition,
          }),
        });
        const body = (await response.json()) as JournalEntryData | { errors?: string[]; error?: string };

        if (!response.ok) {
          const nextErrors =
            "errors" in body && Array.isArray(body.errors)
              ? body.errors
              : ["error" in body && body.error ? body.error : "Decision could not be logged."];
          setErrors({ call: nextErrors.join(" ") });
          setMessage("Couldn't log — check the highlighted fields.");
          return;
        }

        const entry = body as JournalEntryData;
        setEntries((current) => [entry, ...current]);
        setForm(initialFormState);
        setLastLoggedId(entry.id);
        setMessage(`Logged at ${formatTimestamp(entry.logged_at)}.`);
      } catch {
        setErrors({ call: "Network request failed. Try again." });
        setMessage("Request failed. Try again.");
      }
    });
  }

  return (
    <div className="grid w-full min-w-0 gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
      <div className="min-w-0 space-y-4 sm:space-y-5" data-journal-task-first>
        <EntryList
          entries={entries}
          systemEntries={systemEntries}
          focusedEntryId={focusedEntryId}
          lastLoggedId={lastLoggedId}
          onResolved={resolveEntry}
        />
        <TrackRecordSection tiers={trackRecord} provenance={initialJournal.provenance} />
        <StrategyBeliefSection journal={initialJournal} />
      </div>

      <aside className="min-w-0 scroll-mt-24 xl:sticky xl:top-6">
        <details
          id="record-call"
          open={recordOpen}
          onToggle={(event) => setRecordOpen(event.currentTarget.open)}
          className="group rounded-md border border-outline-variant/40 bg-surface-high/40"
        >
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 p-3 marker:hidden sm:min-h-16 sm:p-5 [&::-webkit-details-marker]:hidden">
            <span className="min-w-0">
              <span className="flex items-center gap-2">
                <BookPlus aria-hidden="true" className="size-4 shrink-0 text-violet sm:size-5" />
                <span className="font-display text-sm font-semibold text-on-surface">Record a call</span>
              </span>
              <span className="mt-0.5 block text-xs leading-4 text-outline sm:mt-1 sm:text-sm sm:leading-5">
                Save a new decision before the result is obvious.
              </span>
            </span>
            <ChevronDown
              aria-hidden="true"
              className="size-5 shrink-0 text-outline transition-transform group-open:rotate-180"
            />
          </summary>
          <div className="border-t border-outline-variant/25 p-4 pt-3 sm:p-5 sm:pt-4">
            <form className="space-y-3" onSubmit={submitDecision} noValidate>
              {initialDraftReason ? (
                <div
                  data-testid="journal-prepared-draft"
                  className="rounded-md border border-violet/35 bg-violet/[0.07] p-3 text-sm leading-6 text-on-surface-variant"
                >
                  <span className="font-semibold text-on-surface">Prepared by Master Mold.</span>{" "}
                  {initialDraftReason} Review the fields, then save only if this is the decision you want recorded.
                </div>
              ) : null}

              <FieldBlock id="journal-call" label="Call" error={errors.call}>
                <textarea
                  id="journal-call"
                  value={form.call}
                  onChange={(event) => updateForm("call", event.target.value)}
                  className="min-h-20 w-full resize-y overflow-x-hidden rounded-md border border-outline-variant/50 bg-surface-dim/70 px-3 py-2 text-sm text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
                  placeholder="What needs to be true?"
                  aria-invalid={Boolean(errors.call)}
                />
              </FieldBlock>

              <FieldBlock id="journal-signals" label="Reason to watch" error={errors.signals}>
                <Input
                  id="journal-signals"
                  value={form.signals}
                  onChange={(event) => updateForm("signals", event.target.value)}
                  className="border-outline-variant/50 bg-surface-dim/70 text-on-surface placeholder:text-outline"
                  placeholder="funding, flows, trend"
                  aria-invalid={Boolean(errors.signals)}
                />
                <p className="text-xs text-outline">Separate items with commas.</p>
              </FieldBlock>

              <div className="grid grid-cols-2 gap-3 xl:grid-cols-1">
                <FieldBlock id="journal-confidence" label="Confidence" error={errors.confidence}>
                  <Input
                    id="journal-confidence"
                    type="number"
                    min={1}
                    max={10}
                    value={form.confidence}
                    onChange={(event) => updateForm("confidence", event.target.value)}
                    className="border-outline-variant/50 bg-surface-dim/70 text-on-surface"
                    aria-invalid={Boolean(errors.confidence)}
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
                  className="min-h-20 w-full resize-y overflow-x-hidden rounded-md border border-outline-variant/50 bg-surface-dim/70 px-3 py-2 text-sm text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
                  placeholder="What would prove this wrong?"
                  aria-invalid={Boolean(errors.falsification_condition)}
                />
              </FieldBlock>

              {Object.keys(errors).length > 0 ? (
                <div className="rounded-md border border-critical/40 bg-critical/10 p-3 text-sm leading-6 text-critical">
                  Fill in the missing fields to save.
                </div>
              ) : null}

              <p aria-live="polite" className="text-sm leading-5 text-outline">
                {statusText}
              </p>

              <Button
                type="submit"
                disabled={isPending}
                className="w-full bg-violet text-void hover:bg-violet"
              >
                <SendHorizonal aria-hidden="true" />
                {isPending ? "Saving…" : "Log it"}
              </Button>
            </form>
          </div>
        </details>
      </aside>
    </div>
  );
}

function draftKey(draft: Partial<FormState> | undefined) {
  if (!draft) return "";
  return [
    draft.call ?? "",
    draft.signals ?? "",
    draft.confidence ?? "",
    draft.horizon ?? "",
    draft.falsification_condition ?? "",
  ].join("\u001f");
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

function TrackRecordSection({
  tiers,
  provenance,
}: {
  tiers: JournalTrackRecordTier[];
  provenance: JournalWorkspaceData["provenance"];
}) {
  const isSample = provenance.label === "Sample data";
  const closedCount = tiers.reduce((total, tier) => total + tier.resolved_count, 0);

  return (
    <section aria-labelledby="track-record-title" className="min-w-0 rounded-md border border-outline-variant/40 bg-surface-high/25">
      <details>
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 p-3 marker:hidden sm:p-4 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">
            <span className="flex min-w-0 flex-wrap items-center gap-2">
              <h2 id="track-record-title" className="text-sm font-semibold text-on-surface">
                Review scores
              </h2>
              <ProvenanceChip label={provenance.label} title={provenance.source} />
            </span>
            <span className="mt-0.5 block truncate text-xs leading-4 text-outline sm:text-sm">
              {closedCount} closed calls. Open when you are checking your process.
            </span>
          </span>
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-outline-variant/25 bg-surface-dim/30 text-outline transition hover:border-violet/35 hover:text-violet">
            <ChevronDown aria-hidden="true" className="size-4" />
            <span className="sr-only">Score details</span>
          </span>
        </summary>

        <div className="border-t border-outline-variant/25 p-3 sm:p-4">
          <p className="text-sm leading-6 text-outline">
            {isSample
              ? "Seeded and locally saved calls. Use this to check the scoring workflow; it is not evidence that future calls will work."
              : "Compares higher-scored saved calls with later results. Useful for review, not proof that future calls will work."}
          </p>

          <div className="mt-3 grid grid-cols-3 gap-1.5 sm:gap-2" data-journal-score-strip>
            {tiers.map((tier) => (
              <div
                key={tier.key}
                className="grid min-h-16 content-center gap-1 rounded-md border border-outline-variant/30 bg-surface-dim/30 px-2 py-2 sm:min-h-20 sm:px-3"
              >
                <Badge variant="outline" className="w-fit border-violet/40 px-1.5 py-0 text-[10px] text-violet sm:px-2.5 sm:py-0.5 sm:text-xs">
                  <span className="sm:hidden">{tier.key}</span>
                  <span className="hidden sm:inline">{tier.label}</span>
                </Badge>
                <span className="truncate text-xs font-semibold leading-4 text-on-surface sm:text-sm">
                  {formatCompactTierResultCount(tier)}
                </span>
                <span className="text-[10px] leading-4 text-outline sm:text-xs">
                  Avg {formatScore(tier.mean_result_score)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </details>
    </section>
  );
}

type JournalStreamItem =
  | { type: "call"; key: string; ts: number; entry: JournalEntryData }
  | { type: "system"; key: string; ts: number; entry: SystemJournalEntry };

function EntryList({
  entries,
  systemEntries,
  focusedEntryId,
  lastLoggedId,
  onResolved,
}: {
  entries: JournalEntryData[];
  systemEntries: SystemJournalEntry[];
  focusedEntryId?: string;
  lastLoggedId: string | null;
  onResolved: (entry: JournalEntryData) => void;
}) {
  const [showAllEntries, setShowAllEntries] = useState(false);
  const visibleEntries = useMemo(() => {
    if (showAllEntries) return entries;

    const nextEntries = entries.slice(0, INITIAL_JOURNAL_ENTRY_LIMIT);
    const pinnedIds = [lastLoggedId, focusedEntryId].filter(Boolean);

    for (const id of pinnedIds) {
      if (nextEntries.some((entry) => entry.id === id)) continue;
      const pinnedEntry = entries.find((entry) => entry.id === id);
      if (pinnedEntry) nextEntries.push(pinnedEntry);
    }

    return nextEntries;
  }, [entries, focusedEntryId, lastLoggedId, showAllEntries]);
  const hiddenEntryCount = Math.max(0, entries.length - visibleEntries.length);
  // One stream, two authors: your recorded calls and Master Mold's own
  // lessons/daily reviews, interleaved newest-first with clear attribution.
  const streamItems = useMemo<JournalStreamItem[]>(() => {
    const items: JournalStreamItem[] = [
      ...visibleEntries.map((entry) => ({
        type: "call" as const,
        key: `call-${entry.id}`,
        ts: Date.parse(entry.logged_at) || 0,
        entry,
      })),
      ...systemEntries.map((entry) => ({
        type: "system" as const,
        key: `system-${entry.id}`,
        ts: Date.parse(entry.ts) || 0,
        entry,
      })),
    ];
    return items.sort((a, b) => b.ts - a.ts);
  }, [systemEntries, visibleEntries]);

  return (
    <section aria-labelledby="journal-entries-title" className="min-w-0 space-y-2.5 sm:space-y-4">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id="journal-entries-title" className="text-sm font-semibold text-on-surface">
          Journal stream
          </h2>
          <p className="mt-1 hidden text-xs text-outline sm:block">
            Your calls and Master Mold&apos;s own lessons, newest first. Older calls stay in the archive until review time.
          </p>
        </div>
        <span className="shrink-0 rounded-md border border-outline-variant/35 bg-surface-dim/35 px-2 py-1 text-[11px] font-semibold text-outline">
          {entries.length} saved
        </span>
      </div>

      {entries.length > 0 || systemEntries.length > 0 ? (
        <div className="grid gap-2 sm:gap-4">
          {streamItems.map((item) => {
            if (item.type === "system") {
              return <SystemEntryRow key={item.key} entry={item.entry} />;
            }

            const entry = item.entry;
            const signalGroups = journalSignalGroups(entry.reasons);

            return (
              <Card
                key={entry.id}
                id={entry.id}
                className={cn(
                  "min-w-0 scroll-mb-36 border-outline-variant/40 bg-surface-high/40",
                  (entry.id === lastLoggedId || entry.id === focusedEntryId) && "border-violet/50 bg-violet/10",
                )}
              >
                <details open={entry.id === lastLoggedId || entry.id === focusedEntryId}>
                  <summary className="group cursor-pointer list-none space-y-1.5 p-2.5 marker:hidden sm:space-y-3 sm:p-5 [&::-webkit-details-marker]:hidden">
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <div className="min-w-0 space-y-1.5 sm:space-y-2">
                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                          <Badge
                            variant="outline"
                            className="border-outline-variant/50 px-2 py-0 text-[10px] font-semibold text-on-surface-variant sm:px-2.5 sm:py-0.5 sm:text-xs"
                            data-testid="journal-author-you"
                          >
                            You
                          </Badge>
                          {entry.id === lastLoggedId ? (
                            <Badge className="bg-violet text-void hover:bg-violet">
                              Just logged
                            </Badge>
                          ) : null}
                          {entry.id === focusedEntryId && entry.id !== lastLoggedId ? (
                            <Badge className="bg-violet text-void hover:bg-violet">
                              Saved call
                            </Badge>
                          ) : null}
                          <Badge variant="outline" className={cn("px-2 py-0 text-[10px] sm:px-2.5 sm:py-0.5 sm:text-xs", tierBadgeClass(entry.confidence_band.key))}>
                            <span className="sm:hidden">{entry.confidence_band.key}</span>
                            <span className="hidden sm:inline">{entry.confidence_band.label}</span>
                          </Badge>
                          <Badge variant="outline" className="border-outline-variant/50 px-2 py-0 text-[10px] text-on-surface-variant sm:px-2.5 sm:py-0.5 sm:text-xs">
                            {entry.confidence}/10
                          </Badge>
                          <Badge variant="outline" className="hidden border-outline-variant/50 text-on-surface-variant min-[360px]:inline-flex">
                            {entry.horizon}
                          </Badge>
                          {entry.past_horizon ? (
                            <Badge variant="outline" className="border-caution/50 px-2 py-0 text-[10px] text-caution sm:px-2.5 sm:py-0.5 sm:text-xs">
                              Score it
                            </Badge>
                          ) : null}
                          {entry.result ? (
                            <Badge variant="outline" className="border-engine/40 px-2 py-0 text-[10px] text-engine sm:px-2.5 sm:py-0.5 sm:text-xs">
                              Result saved
                            </Badge>
                          ) : null}
                        </div>
                        <CardTitle className="line-clamp-2 text-sm leading-5 text-on-surface sm:text-base sm:leading-6">
                          {plainJournalText(entry.call)}
                        </CardTitle>
                        <p className="text-xs leading-4 text-outline sm:text-sm">
                          <span className="sm:hidden">{formatTimestamp(entry.logged_at)}</span>
                          <span className="hidden sm:inline">Logged {formatTimestamp(entry.logged_at)}</span>
                        </p>
                      </div>
                      <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-outline-variant/25 bg-surface-dim/30 text-outline transition group-open:rotate-180 group-hover:border-violet/35 group-hover:text-violet sm:size-10">
                        <ChevronDown aria-hidden="true" className="size-4" />
                        <span className="sr-only">Details</span>
                      </span>
                    </div>
                  </summary>
                  <CardContent className="space-y-4 p-4 pt-0 sm:p-5 sm:pt-0">
                    <div className="grid gap-3 text-sm leading-6 lg:grid-cols-2">
                      <InfoPanel label="What would prove this wrong?" value={plainJournalText(entry.what_would_prove_wrong)} />
                      <InfoPanel label="Reason to watch" value={journalSignalText(entry.reasons)} />
                    </div>
                    {signalGroups.sources.length > 0 ? <JournalSourceNotes sources={signalGroups.sources} /> : null}
                    {entry.result ? (
                      <div className="rounded-md border border-engine/20 bg-engine/[0.07] p-4">
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                          <CheckCircle2 aria-hidden="true" className="size-4 text-engine" />
                          <p className="text-sm font-semibold text-engine">Result saved</p>
                          <Badge variant="outline" className="border-engine/40 text-engine">
                            {entry.result.call_was_right ? "Right" : "Missed"}
                          </Badge>
                        </div>
                        <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                          <Metric label="Review quality" value={entry.result.review_quality.toFixed(1)} />
                          <Metric label="Result score" value={entry.result.result_score.toFixed(1)} />
                          <Metric label="Closed" value={formatTimestamp(entry.result.resolved_at)} />
                          <Metric label="Result note" value={plainJournalText(entry.result.result_note)} />
                        </div>
                      </div>
                    ) : (
                      <div
                        className={
                          entry.past_horizon
                            ? "space-y-4 rounded-md border border-caution/40 bg-caution/[0.06] p-4"
                            : "space-y-4 rounded-md border border-outline-variant/40 bg-surface-dim/40 p-4"
                        }
                      >
                        <p className={entry.past_horizon ? "text-sm font-medium text-caution" : "text-sm text-outline"}>
                          {entry.review_note ??
                            "No result yet. This call is saved before the market has answered."}
                        </p>
                        {entry.past_horizon ? (
                          <ResolveOutcomeForm entry={entry} onResolved={onResolved} />
                        ) : (
                          <details>
                            <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-violet transition-colors hover:text-on-surface">
                              Score this call now
                            </summary>
                            <div className="pt-3">
                              <ResolveOutcomeForm entry={entry} onResolved={onResolved} />
                            </div>
                          </details>
                        )}
                      </div>
                    )}
                  </CardContent>
                </details>
              </Card>
            );
          })}
          {showAllEntries || hiddenEntryCount > 0 ? (
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-md border border-outline-variant/40 bg-surface-dim/30 p-3">
              <p className="text-sm leading-6 text-outline">
                Showing {visibleEntries.length} of {entries.length} saved calls.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAllEntries((current) => !current)}
                className="max-w-full border-outline-variant/50 bg-surface-high/40 text-on-surface hover:border-violet/50 hover:text-violet"
              >
                <ChevronDown
                  aria-hidden="true"
                  className={cn("transition-transform", showAllEntries && "rotate-180")}
                />
                {showAllEntries ? "Show recent only" : `Show ${hiddenEntryCount} older calls`}
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="rounded-md border border-outline-variant/40 bg-surface-high/30 p-4 text-sm text-on-surface-variant">
          No entries yet. Record a call, and Master Mold&apos;s lessons and daily reviews land here too.
        </div>
      )}
    </section>
  );
}

function SystemEntryRow({ entry }: { entry: SystemJournalEntry }) {
  const kindLabel = entry.kind === "lesson" ? "lesson" : "daily review";

  return (
    <article
      className="min-w-0 rounded-md border-l-2 border-violet/50 bg-violet/[0.05] px-3 py-2"
      data-testid="journal-system-entry"
      aria-label={`Master Mold ${kindLabel}`}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] leading-4 text-outline">
        <span
          className="inline-flex items-center rounded-full border border-violet/35 bg-violet/10 px-1.5 py-0 text-[10px] font-semibold text-violet"
          data-testid="journal-author-master-mold"
        >
          Master Mold
        </span>
        <span className="font-semibold text-on-surface-variant">{kindLabel}</span>
        {entry.symbol ? <span className="truncate">· {entry.symbol}</span> : null}
        <span className="ml-auto shrink-0">{formatTimestamp(entry.ts)}</span>
      </div>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-on-surface-variant">
        {entry.text}
      </p>
    </article>
  );
}

function ResolveOutcomeForm({
  entry,
  onResolved,
}: {
  entry: JournalEntryData;
  onResolved: (entry: JournalEntryData) => void;
}) {
  const [form, setForm] = useState<OutcomeFormState>({
    call_was_right: null,
    review_quality: "7",
    result_score: "5",
    result_note: "",
  });
  const [errors, setErrors] = useState<OutcomeFormErrors>({});
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function updateForm(field: keyof OutcomeFormState, value: OutcomeFormState[typeof field]) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function submitOutcome(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateOutcomeForm(form);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setMessage("Not resolved — fill the highlighted fields.");
      return;
    }

    setErrors({});
    startTransition(async () => {
      try {
        const response = await fetch(`/api/journal/${encodeURIComponent(entry.id)}/outcome`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            call_was_right: form.call_was_right,
            review_quality: Number(form.review_quality),
            result_score: Number(form.result_score),
            result_note: form.result_note,
          }),
        });
        const body = (await response.json()) as JournalEntryData | { error?: string; errors?: string[] };
        if (!response.ok) {
          const errorText =
            "errors" in body && Array.isArray(body.errors)
              ? body.errors.join(" ")
              : "error" in body && body.error
                ? body.error
                : "Outcome could not be saved.";
          setErrors({ result_note: errorText });
          setMessage("Couldn't resolve — check the highlighted fields.");
          return;
        }
        onResolved(body as JournalEntryData);
        setMessage("Result saved. Trust view updated.");
      } catch {
        setErrors({ result_note: "Network request failed. Try again." });
        setMessage("Request failed. Try again.");
      }
    });
  }

  return (
    <form className="space-y-4" onSubmit={submitOutcome} noValidate>
      <div>
        <p className="text-sm font-semibold text-on-surface">Review this call</p>
        <p className="mt-1 text-xs leading-5 text-outline">
          Mark whether it was right, then rate the thinking separately from the result.
        </p>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Did the call play out?">
        <OutcomeChoice
          label="Right"
          active={form.call_was_right === true}
          onClick={() => updateForm("call_was_right", true)}
        />
        <OutcomeChoice
          label="Missed"
          active={form.call_was_right === false}
          onClick={() => updateForm("call_was_right", false)}
        />
      </div>
      {errors.call_was_right ? <p className="text-xs font-medium text-critical">{errors.call_was_right}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <FieldBlock id={`${entry.id}-review-quality`} label="Review quality" error={errors.review_quality}>
          <Input
            id={`${entry.id}-review-quality`}
            type="number"
            min={0}
            max={10}
            step={0.5}
            value={form.review_quality}
            onChange={(event) => updateForm("review_quality", event.target.value)}
            className="border-outline-variant/50 bg-surface-dim/70 text-on-surface"
          />
        </FieldBlock>
        <FieldBlock id={`${entry.id}-result-score`} label="Result score" error={errors.result_score}>
          <Input
            id={`${entry.id}-result-score`}
            type="number"
            min={0}
            max={10}
            step={0.5}
            value={form.result_score}
            onChange={(event) => updateForm("result_score", event.target.value)}
            className="border-outline-variant/50 bg-surface-dim/70 text-on-surface"
          />
        </FieldBlock>
      </div>

      <FieldBlock id={`${entry.id}-result-note`} label="What happened" error={errors.result_note}>
        <textarea
          id={`${entry.id}-result-note`}
          value={form.result_note}
          onChange={(event) => updateForm("result_note", event.target.value)}
          className="min-h-20 w-full resize-y overflow-x-hidden rounded-md border border-outline-variant/50 bg-surface-dim/70 px-3 py-2 text-sm text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
          placeholder="What happened, and how should this shape the next call?"
        />
      </FieldBlock>

      <p className="sr-only" aria-live="polite">
        {isPending ? "Saving result." : message}
      </p>
      {message ? <p className="text-sm text-outline">{message}</p> : null}

      <Button type="submit" disabled={isPending} className="bg-engine text-void hover:brightness-110">
        <CheckCircle2 aria-hidden="true" />
        {isPending ? "Saving..." : "Save result"}
      </Button>
    </form>
  );
}

function OutcomeChoice({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "min-h-11 rounded-md border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet",
        active
          ? "border-violet/50 bg-violet text-void"
          : "border-outline-variant/45 bg-surface-high/30 text-on-surface-variant hover:border-violet/45 hover:text-violet",
      )}
    >
      {label}
    </button>
  );
}

function StrategyBeliefSection({ journal }: { journal: JournalWorkspaceData }) {
  const [showDetails, setShowDetails] = useState(false);
  const beliefCount = journal.strategy_beliefs.length;
  const updateCount = journal.strategy_beliefs.reduce(
    (total, belief) => total + belief.reflection_updates.length,
    0,
  );
  const appliedCount = journal.strategy_beliefs.reduce(
    (total, belief) => total + belief.reflection_updates.filter((update) => update.applied).length,
    0,
  );

  return (
    <section aria-labelledby="strategy-beliefs-title" className="space-y-4">
      <div>
        <h2 id="strategy-beliefs-title" className="text-sm font-semibold text-on-surface">
          Lessons learned
        </h2>
        <p className="mt-1 text-sm text-outline">
          Updates only after several consistent outcomes, never from one result.
        </p>
      </div>
      <div className="rounded-md border border-outline-variant/40 bg-surface-high/30 p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Beliefs watched" value={String(beliefCount)} />
          <Metric label="Updates saved" value={String(updateCount)} />
          <Metric label="Used in app" value={String(appliedCount)} />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowDetails((current) => !current)}
          className="mt-4 border-outline-variant/50 bg-surface-dim/40 text-on-surface hover:border-violet/50 hover:text-violet"
          aria-expanded={showDetails}
          aria-controls="strategy-belief-detail"
        >
          <ChevronDown
            aria-hidden="true"
            className={cn("transition-transform", showDetails && "rotate-180")}
          />
          {showDetails ? "Hide lesson details" : "Show lesson details"}
        </Button>
      </div>
      {showDetails ? (
        <div id="strategy-belief-detail" className="grid gap-4">
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
                <CardTitle className="text-base text-on-surface">{belief.name}</CardTitle>
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
                          {update.significance_passed ? "Lesson updated" : "Not enough yet"}
                        </Badge>
                        <Badge variant="outline" className="border-outline-variant/50 text-on-surface-variant">
                          Used: {update.applied ? "yes" : "no"}
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
      ) : null}
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

function journalSignalText(signals: string[]) {
  const labels = journalSignalGroups(signals).reasons;
  return labels.length > 0 ? labels.join(", ") : "Reason saved";
}

function JournalSourceNotes({ sources }: { sources: string[] }) {
  return (
    <details className="rounded-md border border-outline-variant/40 bg-surface-dim/30 px-3 py-1">
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-sm font-semibold text-on-surface">
        <span>Used for this call</span>
        <span className="shrink-0 text-xs font-medium text-outline">
          {sources.length} {sources.length === 1 ? "source" : "sources"}
        </span>
      </summary>
      <ul className="space-y-2 pb-3 text-sm leading-6 text-on-surface-variant">
        {sources.map((source) => (
          <li key={source} className="break-words">
            {source}
          </li>
        ))}
      </ul>
    </details>
  );
}

function journalSignalGroups(signals: string[]) {
  const reasons: string[] = [];
  const sources: string[] = [];

  for (const signal of signals) {
    const label = plainJournalSignal(signal);
    if (!label) continue;
    if (isJournalSourceSignal(signal)) {
      sources.push(label);
    } else {
      reasons.push(label);
    }
  }

  return {
    reasons: uniqueLabels(reasons),
    sources: uniqueLabels(sources),
  };
}

function uniqueLabels(labels: string[]) {
  return labels.filter((label, index) => labels.indexOf(label) === index);
}

function isJournalSourceSignal(signal: string) {
  const normalized = signal.trim();
  return (
    /^(saved market scan|engine output|sample data|demo data)$/i.test(normalized) ||
    /^(market read|portfolio|memory|source):/i.test(normalized)
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
  const confidence = Number(form.confidence);

  if (!form.call.trim()) {
    nextErrors.call = "Enter the call before logging a decision.";
  }

  if (form.signals.split(",").map((signal) => signal.trim()).filter(Boolean).length === 0) {
    nextErrors.signals = "Add at least one reason to watch.";
  }

  if (!Number.isInteger(confidence) || confidence < 1 || confidence > 10) {
    nextErrors.confidence = "Use a whole number from 1 to 10.";
  }

  if (!form.horizon.trim()) {
    nextErrors.horizon = "Add a time horizon.";
  }

  if (!form.falsification_condition.trim()) {
    nextErrors.falsification_condition = "State what would prove the call wrong.";
  }

  return nextErrors;
}

function validateOutcomeForm(form: OutcomeFormState): OutcomeFormErrors {
  const nextErrors: OutcomeFormErrors = {};
  const reviewQuality = Number(form.review_quality);
  const resultScore = Number(form.result_score);

  if (form.call_was_right === null) {
    nextErrors.call_was_right = "Choose whether the call was right.";
  }

  if (!Number.isFinite(reviewQuality) || reviewQuality < 0 || reviewQuality > 10) {
    nextErrors.review_quality = "Use a number from 0 to 10.";
  }

  if (!Number.isFinite(resultScore) || resultScore < 0 || resultScore > 10) {
    nextErrors.result_score = "Use a number from 0 to 10.";
  }

  if (!form.result_note.trim()) {
    nextErrors.result_note = "Add a result note.";
  }

  return nextErrors;
}

function buildTrackRecord(entries: JournalEntryData[]): JournalTrackRecordTier[] {
  const tiers: JournalTrackRecordTier[] = [
    emptyTier("1-3", "1-3 exploratory"),
    emptyTier("4-6", "4-6 cautious"),
    emptyTier("7-10", "7-10 stronger calls"),
  ];

  return tiers.map((tier) => {
    const tierEntries = entries.filter((entry) => entry.confidence_band.key === tier.key);
    const resolvedEntries = tierEntries.filter((entry) => entry.result);
    const wins = resolvedEntries.filter((entry) => entry.result?.call_was_right).length;
    const outcomeTotal = resolvedEntries.reduce(
      (total, entry) => total + (entry.result?.result_score ?? 0),
      0,
    );

    return {
      ...tier,
      entry_count: tierEntries.length,
      resolved_count: resolvedEntries.length,
      wins,
      win_rate: resolvedEntries.length > 0 ? wins / resolvedEntries.length : null,
      mean_result_score:
        resolvedEntries.length > 0 ? outcomeTotal / resolvedEntries.length : null,
    };
  });
}

function emptyTier(key: JournalTrackRecordTier["key"], label: string): JournalTrackRecordTier {
  return {
    key,
    label,
    entry_count: 0,
    resolved_count: 0,
    wins: 0,
    win_rate: null,
    mean_result_score: null,
  };
}

function tierBadgeClass(key: JournalEntryData["confidence_band"]["key"]) {
  return cn(
    key === "1-3" && "border-outline-variant/40 text-on-surface-variant",
    key === "4-6" && "border-amber-300/40 text-caution",
    key === "7-10" && "border-engine/40 text-engine",
  );
}

function formatCompactTierResultCount(tier: JournalTrackRecordTier) {
  return tier.resolved_count === 0 ? "No closed" : `${tier.wins}/${tier.resolved_count} right`;
}

function formatScore(value: number | null) {
  return value === null ? "n/a" : `${value.toFixed(1)}/10`;
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}
