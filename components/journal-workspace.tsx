"use client";

import { FormEvent, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { BookPlus, CheckCircle2, ChevronDown, CornerDownLeft, Inbox, SendHorizonal, XCircle } from "lucide-react";
import { ProvenanceChip } from "@/components/provenance-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Segmented } from "@/components/ui/segmented";
import { StatTile } from "@/components/ui/stat";
import { toast } from "@/components/ui/toast";
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

type Filter = "all" | "due" | "open" | "scored" | "master";

const initialFormState: FormState = {
  call: "",
  signals: "",
  confidence: "6",
  horizon: "",
  falsification_condition: "",
};

const HORIZONS = ["1 week", "2-4 weeks", "3 months", "6 months"];

const inputClass =
  "min-h-11 w-full rounded-xl border border-outline-variant/70 bg-surface-lowest/70 px-3 text-sm text-on-surface placeholder:text-outline focus:border-violet/60 focus:outline-none focus:ring-2 focus:ring-violet/20 sm:min-h-10";

export function JournalWorkspace({
  initialJournal,
  initialDraft,
  initialDraftReason,
  focusedEntryId,
  systemEntries = [],
  holdingSymbols = [],
}: {
  initialJournal: JournalWorkspaceData;
  initialDraft?: Partial<FormState>;
  initialDraftReason?: string;
  focusedEntryId?: string;
  systemEntries?: SystemJournalEntry[];
  holdingSymbols?: string[];
}) {
  const [entries, setEntries] = useState(initialJournal.entries);
  // Sample calls fill an empty journal; the first real call replaces them.
  const [sampleMode, setSampleMode] = useState(initialJournal.provenance.label === "Sample data");
  const [form, setForm] = useState<FormState>(() => ({ ...initialFormState, ...initialDraft }));
  const [message, setMessage] = useState("Log a call before the outcome lands.");
  const [errors, setErrors] = useState<FormErrors>({});
  const [lastLoggedId, setLastLoggedId] = useState<string | null>(null);
  const [recordOpen, setRecordOpen] = useState(Boolean(initialDraft));
  const [filter, setFilter] = useState<Filter>(() => (initialJournal.entries.some(isDue) ? "due" : "all"));
  const [isPending, startTransition] = useTransition();
  const callRef = useRef<HTMLTextAreaElement | null>(null);

  const trackRecord = useMemo(() => buildTrackRecord(entries), [entries]);
  const initialDraftKey = draftKey(initialDraft);
  const statusText = isPending ? "Logging decision." : message;
  const symbolSet = useMemo(() => new Set(holdingSymbols.map((symbol) => symbol.toUpperCase())), [holdingSymbols]);
  const linkedInDraft = useMemo(() => symbolsIn(form.call, symbolSet), [form.call, symbolSet]);

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
        window.requestAnimationFrame(() => callRef.current?.focus({ preventScroll: true }));
      }
    }

    openRecordPanelFromHash();
    window.addEventListener("hashchange", openRecordPanelFromHash);
    return () => window.removeEventListener("hashchange", openRecordPanelFromHash);
  }, []);

  function resolveEntry(entry: JournalEntryData) {
    setEntries((current) => current.map((item) => (item.id === entry.id ? entry : item)));
    toast({ title: entry.result?.call_was_right ? "Scored: right" : "Scored: missed", description: "Review scores updated." });
  }

  function updateForm(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    if (field === "call" && value.trim()) setRecordOpen(true);
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function submitDecision(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const clientErrors = validateForm(form);

    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      setLastLoggedId(null);
      setRecordOpen(true);
      setMessage("Not logged — fill the highlighted fields.");
      return;
    }

    setErrors({});

    startTransition(async () => {
      try {
        const response = await fetch("/api/journal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
        setEntries((current) => (sampleMode ? [entry] : [entry, ...current]));
        setSampleMode(false);
        setForm(initialFormState);
        setRecordOpen(false);
        setLastLoggedId(entry.id);
        setFilter("all");
        setMessage(`Logged at ${formatTimestamp(entry.logged_at)}.`);
        toast({ title: "Call logged", description: "It’s saved before the market answers." });
      } catch {
        setErrors({ call: "Network request failed. Try again." });
        setMessage("Request failed. Try again.");
      }
    });
  }

  const openCount = entries.filter((entry) => !entry.result).length;
  const dueCount = entries.filter(isDue).length;
  const scored = entries.filter((entry) => entry.result);
  const rightCount = scored.filter((entry) => entry.result?.call_was_right).length;
  const avgThinking = scored.length ? scored.reduce((sum, entry) => sum + (entry.result?.review_quality ?? 0), 0) / scored.length : null;

  return (
    <div className="grid w-full min-w-0 grid-cols-1 gap-6 [&>*]:min-w-0" data-journal-task-first>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Open calls" value={String(openCount)} hint="waiting for their time frame" />
        <button type="button" onClick={() => setFilter("due")} className="text-left" aria-label="Show calls due to score">
          <StatTile
            label="Due to score"
            value={String(dueCount)}
            hint={dueCount ? "tap to review" : "nothing due"}
            deltaTone="caution"
            emphasis={dueCount > 0}
            className="h-full transition hover:border-violet/45"
          />
        </button>
        <StatTile
          label="Hit rate"
          value={scored.length ? `${Math.round((rightCount / scored.length) * 100)}%` : "—"}
          hint={`${rightCount} of ${scored.length} scored calls right`}
        />
        <StatTile label="Reasoning score" value={avgThinking === null ? "—" : `${avgThinking.toFixed(1)}/10`} hint="your 1–10 review of the thinking" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 [&>*]:min-w-0">
        <div className="grid min-w-0 grid-cols-1 content-start gap-6 lg:col-span-8 [&>*]:min-w-0">
          <Panel as="div" id="record-call" className="scroll-mt-24">
            <form onSubmit={submitDecision} noValidate className="grid gap-3 p-4 sm:p-5">
              <div className="flex items-center gap-2">
                <BookPlus aria-hidden="true" className="size-4 text-violet" />
                <p className="font-display text-sm font-semibold text-on-surface">Record a call</p>
                <span className="text-xs text-outline">Save a new decision before the result is obvious.</span>
              </div>
              {initialDraftReason ? (
                <div data-testid="journal-prepared-draft" className="rounded-xl border border-violet/35 bg-violet/[0.07] p-3 text-sm leading-6 text-on-surface-variant">
                  <span className="font-semibold text-on-surface">Prepared by Master Mold.</span> {initialDraftReason} Review the fields, then save only if
                  this is the decision you want recorded.
                </div>
              ) : null}
              <textarea
                ref={callRef}
                id="journal-call"
                value={form.call}
                onChange={(event) => updateForm("call", event.target.value)}
                onFocus={() => setRecordOpen(true)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    submitDecision();
                  }
                }}
                aria-invalid={Boolean(errors.call)}
                aria-label="Call"
                placeholder="What’s your call? e.g. NVDA holds its range through earnings"
                className={cn(inputClass, "min-h-16 resize-y py-3 text-base sm:min-h-16")}
              />
              {errors.call ? <p className="text-xs font-medium text-critical">{errors.call}</p> : null}
              {linkedInDraft.length > 0 ? (
                <p className="flex flex-wrap items-center gap-1.5 text-xs text-outline">
                  Linked to your holdings:
                  {linkedInDraft.map((symbol) => (
                    <Badge key={symbol} variant="magenta">{symbol}</Badge>
                  ))}
                </p>
              ) : null}

              <div className={cn("grid gap-3", !recordOpen && "hidden")} aria-hidden={!recordOpen} data-open={recordOpen}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-sm">
                    <span className="flex items-center justify-between font-medium text-on-surface">
                      Confidence <span className="mm-num text-violet">{form.confidence}/10</span>
                    </span>
                    <input
                      id="journal-confidence"
                      type="range"
                      min={1}
                      max={10}
                      value={form.confidence}
                      onChange={(event) => updateForm("confidence", event.target.value)}
                      className="h-11 w-full accent-[#f2559f] sm:h-10"
                      aria-invalid={Boolean(errors.confidence)}
                    />
                  </label>
                  <div className="grid gap-1.5 text-sm">
                    <span className="font-medium text-on-surface">Horizon</span>
                    <div className="flex flex-wrap gap-1.5">
                      {HORIZONS.map((horizon) => (
                        <button
                          key={horizon}
                          type="button"
                          aria-pressed={form.horizon === horizon}
                          onClick={() => updateForm("horizon", horizon)}
                          className={cn(
                            "min-h-11 rounded-xl border px-3 text-xs font-semibold transition sm:min-h-9",
                            form.horizon === horizon ? "border-violet/60 bg-violet/15 text-violet" : "border-outline-variant/60 text-on-surface-variant hover:border-outline",
                          )}
                        >
                          {horizon}
                        </button>
                      ))}
                      <input
                        id="journal-horizon"
                        value={HORIZONS.includes(form.horizon) ? "" : form.horizon}
                        onChange={(event) => updateForm("horizon", event.target.value)}
                        placeholder="Other"
                        aria-label="Custom horizon"
                        className={cn(inputClass, "w-24 sm:min-h-9")}
                      />
                    </div>
                    {errors.horizon ? <p className="text-xs font-medium text-critical">{errors.horizon}</p> : null}
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-sm">
                    <span className="font-medium text-on-surface">Why now</span>
                    <input
                      id="journal-signals"
                      value={form.signals}
                      onChange={(event) => updateForm("signals", event.target.value)}
                      placeholder="earnings, flows, trend (comma separated)"
                      aria-invalid={Boolean(errors.signals)}
                      className={inputClass}
                    />
                    {errors.signals ? <span className="text-xs font-medium text-critical">{errors.signals}</span> : null}
                  </label>
                  <label className="grid gap-1.5 text-sm">
                    <span className="font-medium text-on-surface">What would prove this wrong?</span>
                    <input
                      id="journal-falsification"
                      value={form.falsification_condition}
                      onChange={(event) => updateForm("falsification_condition", event.target.value)}
                      placeholder="e.g. closes below $110 twice"
                      aria-invalid={Boolean(errors.falsification_condition)}
                      className={inputClass}
                    />
                    {errors.falsification_condition ? <span className="text-xs font-medium text-critical">{errors.falsification_condition}</span> : null}
                  </label>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p aria-live="polite" className="text-sm leading-5 text-outline">
                  {statusText}
                </p>
                <div className="flex items-center gap-2">
                  <span className="hidden items-center gap-1 text-[11px] text-outline sm:inline-flex">
                    <kbd className="rounded border border-outline-variant/70 px-1 font-mono">⌘</kbd>
                    <CornerDownLeft aria-hidden="true" className="size-3" />
                  </span>
                  <Button type="submit" disabled={isPending}>
                    <SendHorizonal aria-hidden="true" />
                    {isPending ? "Saving…" : "Log it"}
                  </Button>
                </div>
              </div>
            </form>
          </Panel>

          <EntryList
            entries={entries}
            systemEntries={systemEntries}
            focusedEntryId={focusedEntryId}
            lastLoggedId={lastLoggedId}
            onResolved={resolveEntry}
            filter={filter}
            onFilter={setFilter}
            symbolSet={symbolSet}
            dueCount={dueCount}
            sample={sampleMode}
          />
        </div>

        <aside className="grid min-w-0 grid-cols-1 content-start gap-6 lg:sticky lg:top-20 lg:col-span-4">
          <TrackRecordSection tiers={trackRecord} provenance={initialJournal.provenance} />
          <StrategyBeliefSection journal={initialJournal} />
        </aside>
      </div>
    </div>
  );
}

function draftKey(draft: Partial<FormState> | undefined) {
  if (!draft) return "";
  return [draft.call ?? "", draft.signals ?? "", draft.confidence ?? "", draft.horizon ?? "", draft.falsification_condition ?? ""].join("\u001f");
}

function isDue(entry: JournalEntryData) {
  return !entry.result && entry.past_horizon;
}

/** Tickers in the text that match a holding, e.g. "NVDA" or "$btc". */
function symbolsIn(text: string, symbols: Set<string>) {
  if (symbols.size === 0 || !text) return [];
  const found = new Set<string>();
  for (const token of text.toUpperCase().match(/\$?[A-Z][A-Z0-9.]{1,9}/g) ?? []) {
    const symbol = token.replace(/^\$/, "");
    if (symbols.has(symbol)) found.add(symbol);
  }
  return [...found].slice(0, 6);
}

function TrackRecordSection({ tiers, provenance }: { tiers: JournalTrackRecordTier[]; provenance: JournalWorkspaceData["provenance"] }) {
  const isSample = provenance.label === "Sample data";
  const closedCount = tiers.reduce((total, tier) => total + tier.resolved_count, 0);

  return (
    <Panel aria-labelledby="track-record-title">
      <PanelHeader
        titleId="track-record-title"
        title="Review scores"
        description={`${closedCount} closed calls by confidence.`}
        action={<ProvenanceChip label={provenance.label} title={provenance.source} />}
      />
      <div className="grid gap-3 p-5 pt-4">
        <div className="grid gap-2" data-journal-score-strip>
          {tiers.map((tier) => {
            const rate = tier.win_rate === null ? 0 : Math.round(tier.win_rate * 100);
            return (
              <div key={tier.key} className="grid gap-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-on-surface">{tier.label}</span>
                  <span className="mm-num text-on-surface-variant">
                    {formatCompactTierResultCount(tier)} · avg {formatScore(tier.mean_result_score)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-high/70" aria-hidden="true">
                  <div className="h-full rounded-full bg-violet transition-all" style={{ width: `${rate}%` }} />
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs leading-5 text-outline">
          {isSample
            ? "Sample calls. Not evidence that future calls will work."
            : "For review only. Not proof that future calls will work."}
        </p>
      </div>
    </Panel>
  );
}

type JournalStreamItem =
  | { type: "call"; key: string; ts: number; entry: JournalEntryData }
  | { type: "system"; key: string; ts: number; entry: SystemJournalEntry };

const INITIAL_STREAM_LIMIT = 12;

function EntryList({
  entries,
  systemEntries,
  focusedEntryId,
  lastLoggedId,
  onResolved,
  filter,
  onFilter,
  symbolSet,
  dueCount,
  sample = false,
}: {
  sample?: boolean;
  entries: JournalEntryData[];
  systemEntries: SystemJournalEntry[];
  focusedEntryId?: string;
  lastLoggedId: string | null;
  onResolved: (entry: JournalEntryData) => void;
  filter: Filter;
  onFilter: (filter: Filter) => void;
  symbolSet: Set<string>;
  dueCount: number;
}) {
  const [showAll, setShowAll] = useState(false);
  // One stream, two authors: your recorded calls and Master Mold's own
  // lessons/daily reviews, interleaved newest-first with clear attribution.
  const streamItems = useMemo<JournalStreamItem[]>(() => {
    const calls = entries
      .filter((entry) =>
        filter === "all" ? true : filter === "due" ? isDue(entry) : filter === "open" ? !entry.result : filter === "scored" ? Boolean(entry.result) : false,
      )
      .map((entry) => ({ type: "call" as const, key: `call-${entry.id}`, ts: Date.parse(entry.logged_at) || 0, entry }));
    const system =
      filter === "all" || filter === "master"
        ? systemEntries.map((entry) => ({ type: "system" as const, key: `system-${entry.id}`, ts: Date.parse(entry.ts) || 0, entry }))
        : [];
    return [...calls, ...system].sort((a, b) => b.ts - a.ts);
  }, [entries, systemEntries, filter]);
  const visible = showAll ? streamItems : streamItems.slice(0, INITIAL_STREAM_LIMIT);

  let lastMonth = "";

  return (
    <section aria-labelledby="journal-entries-title" className="grid min-w-0 gap-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <h2 id="journal-entries-title" className="font-display text-base font-semibold text-on-surface">
          Journal stream <span className="ml-1 text-sm font-normal text-outline">{entries.length} saved</span>
        </h2>
        <Segmented
          label="Filter the journal"
          value={filter}
          onChange={onFilter}
          options={[
            { value: "all", label: "All" },
            { value: "due", label: dueCount ? `Due · ${dueCount}` : "Due" },
            { value: "open", label: "Open" },
            { value: "scored", label: "Scored" },
            { value: "master", label: "Master Mold" },
          ]}
        />
      </div>

      {sample ? (
        <p className="rounded-xl border border-violet/30 bg-violet/[0.06] px-4 py-3 text-xs leading-5 text-on-surface-variant" data-testid="journal-sample-note">
          <span className="font-semibold text-on-surface">Sample calls.</span> Your first logged call replaces them.
        </p>
      ) : null}

      {visible.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={filter === "due" ? "Nothing is due to score." : entries.length === 0 ? "No entries yet." : "Nothing here."}
          description={entries.length === 0 ? "Record a call above; Master Mold’s lessons and daily reviews land here too." : "Try another filter."}
        />
      ) : (
        <ol className="grid min-w-0 grid-cols-1 gap-2 [&>*]:min-w-0">
          {visible.map((item) => {
            const month = new Date(item.ts).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
            const header = month !== lastMonth ? month : null;
            lastMonth = month;
            return (
              <li key={item.key} className="min-w-0">
                {header ? <p className="mm-eyebrow px-1 pb-1 pt-3">{header}</p> : null}
                {item.type === "system" ? (
                  <SystemEntryRow entry={item.entry} />
                ) : (
                  <CallRow
                    entry={item.entry}
                    highlight={item.entry.id === lastLoggedId || item.entry.id === focusedEntryId}
                    justLogged={item.entry.id === lastLoggedId}
                    onResolved={onResolved}
                    symbols={symbolsIn(item.entry.call, symbolSet)}
                  />
                )}
              </li>
            );
          })}
        </ol>
      )}
      {streamItems.length > INITIAL_STREAM_LIMIT ? (
        <Button type="button" variant="ghost" size="sm" onClick={() => setShowAll((current) => !current)} className="justify-self-center">
          <ChevronDown aria-hidden="true" className={cn("transition-transform", showAll && "rotate-180")} />
          {showAll ? "Show recent only" : `Show ${streamItems.length - INITIAL_STREAM_LIMIT} older entries`}
        </Button>
      ) : null}
    </section>
  );
}

function CallRow({
  entry,
  highlight,
  justLogged,
  onResolved,
  symbols,
}: {
  entry: JournalEntryData;
  highlight: boolean;
  justLogged: boolean;
  onResolved: (entry: JournalEntryData) => void;
  symbols: string[];
}) {
  const reasons = journalSignalGroups(entry.reasons);
  const status = entry.result ? (entry.result.call_was_right ? "right" : "missed") : isDue(entry) ? "due" : "open";

  return (
    <details
      id={entry.id}
      open={highlight || undefined}
      className={cn("group mm-panel min-w-0 scroll-mt-24 overflow-hidden", highlight && "border-violet/50", status === "due" && "border-caution/40")}
    >
      <summary className="flex min-h-14 cursor-pointer list-none items-start gap-3 p-4 marker:hidden [&::-webkit-details-marker]:hidden">
        <span className="mt-0.5 flex shrink-0 flex-col items-center">
          {status === "right" ? (
            <CheckCircle2 aria-label="Right" className="size-5 text-engine" />
          ) : status === "missed" ? (
            <XCircle aria-label="Missed" className="size-5 text-critical" />
          ) : (
            <span
              aria-label={status === "due" ? "Due to score" : "Open"}
              className={cn("mt-1 size-3 rounded-full border-2", status === "due" ? "border-caution bg-caution/30" : "border-violet")}
            />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge variant="muted" data-testid="journal-author-you">You</Badge>
            {justLogged ? <Badge variant="magenta">Just logged</Badge> : null}
            <Badge variant={entry.confidence >= 7 ? "up" : entry.confidence >= 4 ? "caution" : "muted"} title={entry.confidence_band.label}>
              {entry.confidence}/10 sure
            </Badge>
            <span className="text-[11px] text-outline">{entry.horizon}</span>
            {status === "due" ? <Badge variant="caution">Score it</Badge> : null}
            {symbols.map((symbol) => (
              <Link
                key={symbol}
                href={`/portfolio?q=${encodeURIComponent(symbol)}#holdings-title`}
                onClick={(event) => event.stopPropagation()}
                className="rounded-full border border-violet/35 bg-violet/10 px-2 py-0.5 text-[11px] font-semibold text-violet hover:bg-violet/20"
              >
                {symbol}
              </Link>
            ))}
          </span>
          <span className="mt-1.5 line-clamp-2 block text-sm font-medium leading-5 text-on-surface">{plainJournalText(entry.call)}</span>
          <span className="mt-1 block text-xs text-outline">Logged {formatTimestamp(entry.logged_at)}</span>
        </span>
        <ChevronDown aria-hidden="true" className="mt-1 size-4 shrink-0 text-outline transition group-open:rotate-180" />
      </summary>
      <div className="grid gap-3 border-t border-outline-variant/40 p-4 text-sm leading-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <InfoPanel label="Why now" value={reasons.reasons.length ? reasons.reasons.join(", ") : "Reason saved"} />
          <InfoPanel label="What would prove this wrong?" value={plainJournalText(entry.what_would_prove_wrong)} />
        </div>
        {reasons.sources.length > 0 ? (
          <p className="text-xs text-outline">Used for this call: {reasons.sources.join(" · ")}</p>
        ) : null}
        {entry.result ? (
          <div className="rounded-xl border border-engine/25 bg-engine/[0.06] p-3">
            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-on-surface">
              Result saved <Badge variant={entry.result.call_was_right ? "up" : "down"}>{entry.result.call_was_right ? "Right" : "Missed"}</Badge>
              <span className="mm-num text-xs font-normal text-outline">
                thinking {entry.result.review_quality.toFixed(1)} · result {entry.result.result_score.toFixed(1)} · {formatTimestamp(entry.result.resolved_at)}
              </span>
            </p>
            <p className="mt-1 text-on-surface-variant">{plainJournalText(entry.result.result_note)}</p>
          </div>
        ) : (
          <QuickScore entry={entry} onResolved={onResolved} />
        )}
      </div>
    </details>
  );
}

function SystemEntryRow({ entry }: { entry: SystemJournalEntry }) {
  const kindLabel = entry.kind === "lesson" ? "lesson" : "daily review";

  return (
    <article
      className="min-w-0 rounded-2xl border border-violet/20 bg-violet/[0.05] px-4 py-3"
      data-testid="journal-system-entry"
      aria-label={`Master Mold ${kindLabel}`}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] leading-4 text-outline">
        <span data-testid="journal-author-master-mold" className="inline-flex items-center rounded-full border border-violet/35 bg-violet/10 px-2 py-0.5 text-[10px] font-semibold text-violet">
          Master Mold
        </span>
        <span className="font-semibold text-on-surface-variant">{kindLabel}</span>
        {entry.symbol ? <span className="truncate">· {entry.symbol}</span> : null}
        <span className="ml-auto shrink-0">{formatTimestamp(entry.ts)}</span>
      </div>
      <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-5 text-on-surface-variant">{entry.text}</p>
    </article>
  );
}

/** One-step review: Right or Missed, two sliders, one line on what happened. */
function QuickScore({ entry, onResolved }: { entry: JournalEntryData; onResolved: (entry: JournalEntryData) => void }) {
  const [form, setForm] = useState<{ call_was_right: boolean | null; review_quality: string; result_score: string; result_note: string }>({
    call_was_right: null,
    review_quality: "7",
    result_score: "5",
    result_note: "",
  });
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function choose(right: boolean) {
    setForm((current) => ({ ...current, call_was_right: right, result_score: right ? "7" : "3" }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (form.call_was_right === null) return setMessage("Choose whether the call was right.");
    if (!form.result_note.trim()) return setMessage("Add what happened and what should change next.");
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
          setMessage("errors" in body && Array.isArray(body.errors) ? body.errors.join(" ") : "Outcome could not be saved.");
          return;
        }
        onResolved(body as JournalEntryData);
        setMessage("Result saved.");
      } catch {
        setMessage("Request failed. Try again.");
      }
    });
  }

  return (
    <form onSubmit={submit} noValidate className={cn("grid gap-3 rounded-xl border p-3", isDue(entry) ? "border-caution/40 bg-caution/[0.05]" : "border-outline-variant/50")}>
      <p className="text-xs text-on-surface-variant">
        {entry.review_note ?? (isDue(entry) ? "The horizon has passed. How did it go?" : "Score it early if the answer is already clear.")}
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Did the call play out?">
        {[true, false].map((right) => (
          <button
            key={String(right)}
            type="button"
            aria-pressed={form.call_was_right === right}
            onClick={() => choose(right)}
            className={cn(
              "inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-4 text-sm font-semibold transition sm:min-h-9",
              form.call_was_right === right
                ? right
                  ? "border-engine/60 bg-engine/15 text-engine"
                  : "border-critical/60 bg-critical/15 text-critical"
                : "border-outline-variant/60 text-on-surface-variant hover:border-outline",
            )}
          >
            {right ? <CheckCircle2 aria-hidden="true" className="size-4" /> : <XCircle aria-hidden="true" className="size-4" />}
            {right ? "Right" : "Missed"}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Slider label="Thinking quality" value={form.review_quality} onChange={(value) => setForm((current) => ({ ...current, review_quality: value }))} />
        <Slider label="Result" value={form.result_score} onChange={(value) => setForm((current) => ({ ...current, result_score: value }))} />
      </div>
      <input
        value={form.result_note}
        onChange={(event) => setForm((current) => ({ ...current, result_note: event.target.value }))}
        placeholder="What happened, and what changes next time?"
        aria-label="Outcome and lesson"
        className={inputClass}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        {message ? <p className="text-sm text-outline">{message}</p> : <span />}
        <Button type="submit" size="sm" disabled={isPending}>
          <CheckCircle2 aria-hidden="true" />
          {isPending ? "Saving…" : "Save result"}
        </Button>
      </div>
    </form>
  );
}

function Slider({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-xs text-on-surface-variant">
      <span className="flex justify-between">
        {label} <span className="mm-num font-semibold text-on-surface">{Number(value).toFixed(1)}</span>
      </span>
      <input type="range" min={0} max={10} step={0.5} value={value} onChange={(event) => onChange(event.target.value)} className="h-9 accent-[#f2559f]" />
    </label>
  );
}

function StrategyBeliefSection({ journal }: { journal: JournalWorkspaceData }) {
  const [showDetails, setShowDetails] = useState(false);
  const beliefCount = journal.strategy_beliefs.length;
  const updateCount = journal.strategy_beliefs.reduce((total, belief) => total + belief.reflection_updates.length, 0);

  return (
    <Panel aria-labelledby="strategy-beliefs-title">
      <PanelHeader
        titleId="strategy-beliefs-title"
        title="Lessons learned"
        description="Changes only after several outcomes agree."
      />
      <div className="grid gap-3 p-5 pt-3">
        <p className="mm-num text-sm text-on-surface-variant">
          {beliefCount} beliefs watched · {updateCount} updates saved
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowDetails((current) => !current)}
          aria-expanded={showDetails}
          aria-controls="strategy-belief-detail"
          className="justify-self-start"
        >
          <ChevronDown aria-hidden="true" className={cn("transition-transform", showDetails && "rotate-180")} />
          {showDetails ? "Hide lesson details" : "Show lesson details"}
        </Button>
        {showDetails ? (
          <div id="strategy-belief-detail" className="grid gap-3">
            {journal.strategy_beliefs.map((belief) => (
              <div key={belief.id} className="rounded-xl border border-outline-variant/50 p-3">
                <p className="flex items-center justify-between gap-2 text-sm font-semibold text-on-surface">
                  {belief.name}
                  <Badge variant="magenta">{(belief.confidence * 100).toFixed(0)}%</Badge>
                </p>
                <p className="mt-1 text-xs leading-5 text-on-surface-variant">{belief.statement}</p>
                {belief.reflection_updates.map((update) => (
                  <p key={update.id} className="mt-2 border-t border-outline-variant/40 pt-2 text-xs leading-5 text-outline">
                    <Badge variant={update.significance_passed ? "up" : "caution"} className="mr-1.5">
                      {update.significance_passed ? "Lesson updated" : "Not enough yet"}
                    </Badge>
                    {update.evidence_summary}
                  </p>
                ))}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

function InfoPanel({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-outline-variant/50 bg-surface-lowest/50 p-3">
      <p className="mm-eyebrow">{label}</p>
      <p className="mt-1 text-on-surface-variant">{value}</p>
    </div>
  );
}

function journalSignalGroups(signals: string[]) {
  const reasons: string[] = [];
  const sources: string[] = [];
  for (const signal of signals) {
    const label = plainJournalSignal(signal);
    if (!label) continue;
    if (isJournalSourceSignal(signal)) sources.push(label);
    else reasons.push(label);
  }
  return { reasons: [...new Set(reasons)], sources: [...new Set(sources)] };
}

function isJournalSourceSignal(signal: string) {
  const normalized = signal.trim();
  return /^(saved market scan|engine output|sample data|demo data)$/i.test(normalized) || /^(market read|portfolio|memory|source):/i.test(normalized);
}

function validateForm(form: FormState): FormErrors {
  const nextErrors: FormErrors = {};
  const confidence = Number(form.confidence);
  if (!form.call.trim()) nextErrors.call = "Enter the call before logging a decision.";
  if (form.signals.split(",").map((signal) => signal.trim()).filter(Boolean).length === 0) nextErrors.signals = "Add at least one reason.";
  if (!Number.isInteger(confidence) || confidence < 1 || confidence > 10) nextErrors.confidence = "Use a whole number from 1 to 10.";
  if (!form.horizon.trim()) nextErrors.horizon = "Pick a horizon.";
  if (!form.falsification_condition.trim()) nextErrors.falsification_condition = "Add what would prove this wrong.";
  return nextErrors;
}

function buildTrackRecord(entries: JournalEntryData[]): JournalTrackRecordTier[] {
  const tiers: JournalTrackRecordTier[] = [emptyTier("1-3", "1-3 exploratory"), emptyTier("4-6", "4-6 cautious"), emptyTier("7-10", "7-10 stronger calls")];
  return tiers.map((tier) => {
    const tierEntries = entries.filter((entry) => entry.confidence_band.key === tier.key);
    const resolvedEntries = tierEntries.filter((entry) => entry.result);
    const wins = resolvedEntries.filter((entry) => entry.result?.call_was_right).length;
    const outcomeTotal = resolvedEntries.reduce((total, entry) => total + (entry.result?.result_score ?? 0), 0);
    return {
      ...tier,
      entry_count: tierEntries.length,
      resolved_count: resolvedEntries.length,
      wins,
      win_rate: resolvedEntries.length > 0 ? wins / resolvedEntries.length : null,
      mean_result_score: resolvedEntries.length > 0 ? outcomeTotal / resolvedEntries.length : null,
    };
  });
}

function emptyTier(key: JournalTrackRecordTier["key"], label: string): JournalTrackRecordTier {
  return { key, label, entry_count: 0, resolved_count: 0, wins: 0, win_rate: null, mean_result_score: null };
}

function formatCompactTierResultCount(tier: JournalTrackRecordTier) {
  return tier.resolved_count === 0 ? "No closed" : `${tier.wins}/${tier.resolved_count} right`;
}

function formatScore(value: number | null) {
  return value === null ? "n/a" : `${value.toFixed(1)}/10`;
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value));
}
