"use client";

import { useState, useTransition } from "react";
import { BrainCircuit, CalendarCheck2, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { plainBriefingHeadline, plainBriefingText } from "@/lib/plain-finance-copy";
import type { PublicBrainScheduleCheckResult, PublicBrainState } from "@/lib/public-api-copy";

type BrainInitializationPanelProps = {
  initialState: PublicBrainState;
};

export function BrainInitializationPanel({ initialState }: BrainInitializationPanelProps) {
  const [state, setState] = useState(initialState);
  const [message, setMessage] = useState(
    initialState.schedule.enabled
      ? "Chat context automation is on. It saves chat context only when this app or a daily check runs."
      : initialState.initialized
        ? "Chat context saved. Automation is off."
        : "",
  );
  const [isPending, startTransition] = useTransition();
  const [schedulePending, startScheduleTransition] = useTransition();

  function initialize() {
    setMessage("Saving chat context...");
    startTransition(async () => {
      try {
        const response = await fetch("/api/brain/initialize", { method: "POST" });
        const nextState = (await response.json()) as PublicBrainState | { error?: string };
        if (!response.ok || !isBrainState(nextState)) {
          throw new Error("error" in nextState ? nextState.error : "Could not save chat context.");
        }
        setState(nextState);
        setMessage(
          nextState.schedule.enabled
            ? "Chat context saved. Automation is on for this context only."
            : "Chat context saved. Automation is off.",
        );
      } catch (caught) {
        setMessage(caught instanceof Error ? caught.message : "Could not save chat context.");
      }
    });
  }

  function checkSchedule() {
    setMessage("Checking whether chat context needs a refresh...");
    startScheduleTransition(async () => {
      try {
        const response = await fetch("/api/brain/schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trigger: "settings" }),
        });
        const result = (await response.json()) as PublicBrainScheduleCheckResult | { error?: string };
        if (!response.ok || !isScheduleResult(result)) {
          throw new Error("error" in result ? result.error : "Could not check the schedule.");
        }
        setState(result.state);
        setMessage(result.message);
      } catch (caught) {
        setMessage(caught instanceof Error ? caught.message : "Could not check the schedule.");
      }
    });
  }

  function setScheduleEnabled(enabled: boolean) {
    setMessage(enabled ? "Turning on chat context automation..." : "Turning off chat context automation...");
    startScheduleTransition(async () => {
      try {
        const response = await fetch("/api/brain/schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled, trigger: "settings" }),
        });
        const result = (await response.json()) as PublicBrainScheduleCheckResult | { error?: string };
        if (!response.ok || !isScheduleResult(result)) {
          throw new Error("error" in result ? result.error : "Could not update chat context automation.");
        }
        setState(result.state);
        setMessage(result.message);
      } catch (caught) {
        setMessage(caught instanceof Error ? caught.message : "Could not update chat context automation.");
      }
    });
  }

  return (
    <section
      aria-labelledby="brain-title"
      className="rounded-lg border border-outline-variant/40 bg-surface-high/30 p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <BrainCircuit aria-hidden="true" className="size-5 text-violet" />
            <h2 id="brain-title" className="text-xl font-semibold text-on-surface">
              Chat context
            </h2>
          </div>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-outline">
            Saves what the app can remember in chat. It does not fetch fresh market news or refresh account balances.
          </p>
        </div>
        <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-3">
          <Button
            type="button"
            onClick={initialize}
            disabled={isPending || schedulePending}
            className="w-full bg-violet text-void hover:bg-violet/90"
          >
            {isPending ? <Loader2 aria-hidden="true" className="animate-spin" /> : <RefreshCw aria-hidden="true" />}
            {state.initialized ? "Refresh snapshot" : "Save snapshot"}
          </Button>
          <Button
            type="button"
            onClick={() => setScheduleEnabled(!state.schedule.enabled)}
            disabled={isPending || schedulePending}
            variant="outline"
            className="w-full border-outline-variant/50 bg-transparent text-on-surface hover:bg-surface-high/70"
          >
            {schedulePending ? <Loader2 aria-hidden="true" className="animate-spin" /> : <CalendarCheck2 aria-hidden="true" />}
            {state.schedule.enabled ? "Pause chat context" : "Arm chat context"}
          </Button>
          <Button
            type="button"
            onClick={checkSchedule}
            disabled={isPending || schedulePending}
            variant="outline"
            className="w-full border-outline-variant/50 bg-transparent text-on-surface hover:bg-surface-high/70"
          >
            {schedulePending ? <Loader2 aria-hidden="true" className="animate-spin" /> : <RefreshCw aria-hidden="true" />}
            Check context
          </Button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Status" value={state.summary.status} />
        <Stat label="Freshness" value={state.summary.snapshot_freshness} />
        <Stat label="Context check" value={state.summary.run_schedule} />
        <Stat label="Last check" value={scheduleCheckLabel(state.schedule.last_check_status)} />
        <Stat label="Automation set" value={scheduleConfiguredLabel(state.schedule.last_configured)} />
        <Stat label="Chat context" value={state.summary.chat_context} />
        <Stat label="Saved facts" value={String(state.summary.memory_count)} />
        <Stat label="Last result" value={state.schedule.last_check_message ?? "No check yet"} />
      </div>

      {state.latest_snapshot ? (
        <div className="mt-4 rounded-md border border-outline-variant/40 bg-surface-dim/45 p-3 text-sm leading-6 text-on-surface-variant">
          <p className="font-semibold text-on-surface">Latest snapshot</p>
          <p>{plainBriefingText(state.latest_snapshot.summary)}</p>
          <p className="mt-1 text-xs text-outline">
            Saved {formatSnapshotTime(state.latest_snapshot.saved_at)} · {state.latest_snapshot.symbols.join(", ") || "no symbols"}
          </p>
          <p className="mt-2 text-xs leading-5 text-outline">
            Used for chat only. Today still uses the visible portfolio, activity, and saved read.
          </p>
          <p className="mt-1 text-xs leading-5 text-outline">{state.schedule.note}</p>
        </div>
      ) : (
        <div className="mt-4 rounded-md border border-outline-variant/40 bg-surface-dim/45 p-3 text-sm leading-6 text-on-surface-variant">
          No snapshot saved yet. Today and chat still work from the visible portfolio, activity, and sample context. Save a snapshot when you want chat to remember the current view.
        </div>
      )}

      {state.snapshot_history.length > 0 ? (
        <details className="mt-4 rounded-md border border-outline-variant/40 bg-surface-dim/35 p-3">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-on-surface">
            Snapshot history
          </summary>
          <div className="mt-3 grid gap-2">
            {state.snapshot_history.slice(0, 3).map((run) => (
              <div
                key={run.id}
                className="rounded-md border border-outline-variant/35 bg-surface-high/25 p-3 text-sm leading-6 text-on-surface-variant"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-on-surface">{formatSnapshotTime(run.saved_at)}</span>
                  <span className="rounded-full border border-outline-variant/40 px-2 py-0.5 text-xs font-semibold text-outline">
                    {run.status}
                  </span>
                </div>
                <p className="mt-1">
                  {run.evidence_count} local sources · {run.symbols.join(", ") || "no visible symbols"}
                </p>
                <p className="mt-1 text-xs leading-5 text-outline">
                  App context only; this did not fetch fresh market news.
                </p>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      {state.snapshot_sources.length > 0 ? (
        <details className="mt-4 rounded-md border border-outline-variant/40 bg-surface-dim/35 p-3">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-on-surface">
            Snapshot sources
          </summary>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {state.snapshot_sources.map((source) => (
              <div
                key={source.key}
                className="rounded-md border border-outline-variant/35 bg-surface-high/25 p-3 text-sm leading-6 text-on-surface-variant"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-on-surface">{source.label}</span>
                  <span className="rounded-full border border-outline-variant/40 px-2 py-0.5 text-xs font-semibold text-outline">
                    {source.status}
                  </span>
                </div>
                <p className="mt-1">{source.count} {source.count === 1 ? "item" : "items"}</p>
                <p className="mt-1 text-xs leading-5 text-outline">{source.detail}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs leading-5 text-outline">
            This source list is for chat context. Import holdings again when you want current balances.
          </p>
        </details>
      ) : null}

      {state.facts.length > 0 ? (
        <div className="mt-4 space-y-2">
          {state.facts.slice(0, 4).map((fact) => (
            <div key={fact.id} className="rounded-md border border-outline-variant/40 bg-surface-dim/35 p-3">
              <p className="text-sm font-semibold text-on-surface">
                {fact.symbol ?? "Market"} · {fact.category}
              </p>
              <p className="mt-1 text-sm leading-6 text-on-surface-variant">{plainBriefingHeadline(fact.summary)}</p>
            </div>
          ))}
        </div>
      ) : null}

      <p className="mt-3 text-sm text-outline" aria-live="polite">
        {message}
      </p>
    </section>
  );
}

function isBrainState(value: PublicBrainState | { error?: string }): value is PublicBrainState {
  return "initialized" in value && "summary" in value && "facts" in value && "snapshot_history" in value;
}

function isScheduleResult(
  value: PublicBrainScheduleCheckResult | { error?: string },
): value is PublicBrainScheduleCheckResult {
  return "status" in value && "state" in value && "message" in value;
}

function scheduleCheckLabel(value: PublicBrainState["schedule"]["last_check_status"]) {
  if (value === "disabled") return "Off";
  if (value === "not_due") return "Not due";
  if (value === "ran") return "Saved";
  if (value === "failed") return "Failed";
  return "Not checked";
}

function scheduleConfiguredLabel(value: string | null) {
  return value ? formatSnapshotTime(value) : "Not set";
}

function formatSnapshotTime(value: string | null) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "recently";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-outline-variant/40 bg-surface-dim/45 p-3">
      <p className="text-xs font-semibold uppercase text-outline">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-on-surface">{value}</p>
    </div>
  );
}
