"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  BookPlus,
  CheckCircle2,
  MessageSquareText,
  ThumbsDown,
  ThumbsUp,
  Wallet,
} from "lucide-react";
import {
  buildAlertChatPrompt,
  buildAlertIgnoreCondition,
  buildAlertJournalInput,
  buildAlertPageContext,
  buildAlertPaperHref,
  buildAlertSuggestedResponse,
  cleanAlertMessage,
  cleanAlertRationale,
  explainAlertRelevance,
} from "@/lib/alert-loop";
import { openMasterMoldChat } from "@/components/master-mold-actions";
import { cn } from "@/lib/utils";
import type { PublicAlert, PublicJournal } from "@/lib/public-api-copy";

type SavedJournalEntry = PublicJournal["entries"][number];

type SeverityFilter = "All" | PublicAlert["severity"];
type FeedbackValue = Exclude<PublicAlert["useful_feedback"], null>;

const filters: SeverityFilter[] = ["All", "Urgent", "Worth checking", "FYI"];

const severityDot: Record<PublicAlert["severity"], string> = {
  Urgent: "bg-critical",
  "Worth checking": "bg-caution",
  FYI: "bg-outline",
};

type AlertFeedProps = {
  initialAlerts: PublicAlert[];
  replayAsOf?: string | null;
  initialFilter?: SeverityFilter;
};

export function AlertFeed({ initialAlerts, replayAsOf = null, initialFilter = "All" }: AlertFeedProps) {
  const searchParams = useSearchParams();
  const [alerts, setAlerts] = useState(initialAlerts);
  const [filter, setFilter] = useState<SeverityFilter>(initialFilter);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pendingAlertId, setPendingAlertId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [savedJournalId, setSavedJournalId] = useState<string | null>(null);
  const [actionSequence, setActionSequence] = useState(0);
  const [lastAction, setLastAction] = useState("alerts-loaded");
  const handledCommandActionRef = useRef<string | null>(null);
  const actionQuery = searchParams.toString();
  const [lastDismissedId, setLastDismissedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isReplay = Boolean(replayAsOf);

  useEffect(() => {
    setFilter(initialFilter);
  }, [initialFilter]);

  const filteredAlerts = useMemo(
    () => alerts.filter((alert) => filter === "All" || alert.severity === filter),
    [alerts, filter],
  );
  const visibleAlerts = useMemo(
    () => filteredAlerts.filter((alert) => !alert.acknowledged),
    [filteredAlerts],
  );
  const dismissedAlerts = useMemo(
    () => filteredAlerts.filter((alert) => alert.acknowledged),
    [filteredAlerts],
  );
  const lastDismissedAlert = useMemo(
    () => (lastDismissedId ? alerts.find((alert) => alert.id === lastDismissedId && alert.acknowledged) ?? null : null),
    [alerts, lastDismissedId],
  );
  const activeCount = alerts.filter((alert) => !alert.acknowledged).length;

  function replaceAlert(nextAlert: PublicAlert) {
    setAlerts((currentAlerts) =>
      currentAlerts.map((alert) => (alert.id === nextAlert.id ? nextAlert : alert)),
    );
  }

  function updateAlert(id: string, patch: Partial<PublicAlert>) {
    setAlerts((currentAlerts) =>
      currentAlerts.map((alert) => (alert.id === id ? { ...alert, ...patch } : alert)),
    );
  }

  function toggleRationale(alertId: string) {
    markBrowserAction(`toggle-rationale-${alertId}`);
    setLastAction(`Opened explanation for ${alertId}.`);
    setActionSequence((current) => current + 1);
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(alertId)) {
        next.delete(alertId);
      } else {
        next.add(alertId);
      }
      return next;
    });
  }

  function dismiss(alert: PublicAlert) {
    markBrowserAction(`dismiss-alert-${alert.id}`);
    setSavedJournalId(null);
    updateAlert(alert.id, { acknowledged: true });
    setLastDismissedId(alert.id);
    setMessage("Dismissed.");
    setLastAction(`Dismissed ${alert.severity} activity item.`);
    setActionSequence((current) => current + 1);
    setPendingAlertId(alert.id);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/alerts/${encodeURIComponent(alert.id)}/acknowledge`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acknowledged: true }),
        });
        if (!response.ok) {
          throw new Error("Dismiss request failed");
        }
        replaceAlert((await response.json()) as PublicAlert);
      } catch {
        updateAlert(alert.id, { acknowledged: alert.acknowledged });
        setLastDismissedId(null);
        setMessage("Couldn't dismiss. Try again.");
      } finally {
        setPendingAlertId(null);
      }
    });
  }

  function restore(alert: PublicAlert) {
    markBrowserAction(`restore-alert-${alert.id}`);
    setSavedJournalId(null);
    updateAlert(alert.id, { acknowledged: false });
    if (lastDismissedId === alert.id) {
      setLastDismissedId(null);
    }
    setMessage("Restored to active activity.");
    setLastAction(`Restored ${alert.severity} activity item.`);
    setActionSequence((current) => current + 1);
    setPendingAlertId(alert.id);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/alerts/${encodeURIComponent(alert.id)}/acknowledge`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acknowledged: false }),
        });
        if (!response.ok) {
          throw new Error("Restore request failed");
        }
        replaceAlert((await response.json()) as PublicAlert);
      } catch {
        updateAlert(alert.id, { acknowledged: alert.acknowledged });
        setLastDismissedId(alert.id);
        setMessage("Couldn't restore. Try again.");
      } finally {
        setPendingAlertId(null);
      }
    });
  }

  function submitFeedback(alert: PublicAlert, usefulFeedback: FeedbackValue) {
    markBrowserAction(`submit-feedback-${alert.id}-${usefulFeedback ? "useful" : "not-useful"}`);
    setSavedJournalId(null);
    updateAlert(alert.id, { useful_feedback: usefulFeedback });
    setLastAction(`Was this useful? ${usefulFeedback ? "useful" : "not useful"} for ${alert.severity}.`);
    setActionSequence((current) => current + 1);
    setPendingAlertId(alert.id);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/alerts/${encodeURIComponent(alert.id)}/feedback`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ useful_feedback: usefulFeedback }),
        });
        if (!response.ok) {
          throw new Error("Feedback request failed");
        }
        replaceAlert((await response.json()) as PublicAlert);
        setMessage(usefulFeedback ? "Noted — useful." : "Noted — not useful.");
      } catch {
        updateAlert(alert.id, { useful_feedback: alert.useful_feedback });
        setMessage("Couldn't save that. Try again.");
      } finally {
        setPendingAlertId(null);
      }
    });
  }

  function saveAsDecision(alert: PublicAlert) {
    markBrowserAction(`save-alert-decision-${alert.id}`);
    setLastDismissedId(null);
    setLastAction(`Saved ${alert.severity} activity item as a decision draft.`);
    setActionSequence((current) => current + 1);
    setPendingAlertId(alert.id);
    startTransition(async () => {
      try {
        const response = await fetch("/api/journal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildAlertJournalInput(alert)),
        });
        if (!response.ok) {
          throw new Error("Decision request failed");
        }
        const entry = (await response.json()) as SavedJournalEntry;
        setSavedJournalId(entry.id);
        setMessage("Saved to Decision journal.");
      } catch {
        setSavedJournalId(null);
        setMessage("Couldn't save that decision. Try again.");
      } finally {
        setPendingAlertId(null);
      }
    });
  }

  useEffect(() => {
    if (isReplay) return;

    const params = new URLSearchParams(actionQuery);
    const action = params.get("action");
    if (!isActivityCommandAction(action)) return;
    if (handledCommandActionRef.current === actionQuery) return;
    handledCommandActionRef.current = actionQuery;

    params.delete("action");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash || "#activity-list"}`);

    const topAlert = visibleAlerts[0];
    if (!topAlert) {
      setMessage("No active activity item to update.");
      setLastAction("No active activity item was available for the Master Mold command.");
      setActionSequence((current) => current + 1);
      return;
    }

    if (action === "save-top-activity") {
      saveAsDecision(topAlert);
      return;
    }

    if (action === "dismiss-top-activity") {
      dismiss(topAlert);
      return;
    }

    if (action === "mark-top-activity-useful") {
      submitFeedback(topAlert, true);
      return;
    }

    submitFeedback(topAlert, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionQuery, isReplay, visibleAlerts]);

  return (
    <section
      aria-labelledby="alert-feed-title"
      className="space-y-3"
      data-testid="alert-feed"
      data-action-evidence={lastAction}
      data-action-sequence={actionSequence}
    >
      <h2 id="alert-feed-title" className="sr-only">
        Activity list
      </h2>
      <ActivityFilterControls
        activeCount={activeCount}
        actionSequence={actionSequence}
        filter={filter}
        setActionSequence={setActionSequence}
        setFilter={setFilter}
        setLastAction={setLastAction}
      />

      <p className="sr-only" aria-live="polite">
        {isPending ? "Saving activity update." : message}
      </p>
      {message ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-outline-variant/35 bg-surface-dim/35 px-3 py-2 text-sm text-outline">
          <span>{message}</span>
          {savedJournalId ? (
            <Link
              href={`/journal?entry=${encodeURIComponent(savedJournalId)}#${encodeURIComponent(savedJournalId)}`}
              className="ml-auto inline-flex min-h-11 items-center justify-center rounded-md border border-violet/35 px-3 font-semibold text-violet transition hover:bg-violet/10"
            >
              Open saved call
            </Link>
          ) : null}
          {lastDismissedAlert && !isReplay ? (
            <button
              type="button"
              onClick={() => restore(lastDismissedAlert)}
              disabled={pendingAlertId === lastDismissedAlert.id}
              className="ml-auto inline-flex min-h-11 items-center justify-center rounded-md border border-violet/35 px-3 font-semibold text-violet transition hover:bg-violet/10 disabled:opacity-50"
            >
              Undo
            </button>
          ) : null}
        </div>
      ) : null}
      {isReplay ? (
        <div className="rounded-md border border-violet/35 bg-violet/[0.07] px-4 py-3 text-sm leading-6 text-on-surface-variant">
          <span className="font-semibold text-on-surface">Replay view:</span>{" "}
          showing activity Master Mold knew at this time. Current-state actions are disabled here.
        </div>
      ) : null}

      {visibleAlerts.length > 0 ? (
        <div className="divide-y divide-outline-variant/20 rounded-md border border-outline-variant/25">
          {visibleAlerts.map((alert) => (
            <AlertRow
              key={alert.id}
              alert={alert}
              actionSequence={actionSequence}
              isBusy={pendingAlertId === alert.id}
              isExpanded={expanded.has(alert.id)}
              isReplay={isReplay}
              onAsk={() => openMasterMoldChat(buildAlertChatPrompt(alert), buildAlertPageContext(alert))}
              onDismiss={() => dismiss(alert)}
              onSave={() => saveAsDecision(alert)}
              onUseful={() => submitFeedback(alert, true)}
              onNotUseful={() => submitFeedback(alert, false)}
              onToggleDetails={() => toggleRationale(alert.id)}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-outline-variant/25 p-3 text-sm leading-6 text-on-surface-variant">
          {dismissedAlerts.length > 0 ? "Nothing active in this group." : "Nothing in this group."}
        </div>
      )}
      {dismissedAlerts.length > 0 ? (
        <details open className="rounded-md border border-outline-variant/25">
          <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-semibold text-on-surface [&::-webkit-details-marker]:hidden">
            {isReplay ? "Already dismissed in this replay" : "Dismissed"} ({dismissedAlerts.length})
          </summary>
          <div className="divide-y divide-outline-variant/20 border-t border-outline-variant/20">
            {dismissedAlerts.map((alert) => {
              const isBusy = pendingAlertId === alert.id;
              return (
                <div key={alert.id} className="flex min-h-11 items-center gap-3 px-3 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-sm text-on-surface-variant">
                    {cleanAlertMessage(alert.message)}
                  </span>
                  {isReplay ? (
                    <span className="shrink-0 text-xs text-outline">Replay only</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => restore(alert)}
                      disabled={isBusy}
                      className="inline-flex min-h-11 items-center justify-center rounded-md border border-violet/35 px-2.5 text-xs font-semibold text-violet transition hover:bg-violet/10 disabled:opacity-50 sm:min-h-8"
                    >
                      Restore
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      ) : null}
    </section>
  );
}

function AlertRow({
  alert,
  actionSequence,
  isBusy,
  isExpanded,
  isReplay,
  onAsk,
  onDismiss,
  onSave,
  onUseful,
  onNotUseful,
  onToggleDetails,
}: {
  alert: PublicAlert;
  actionSequence: number;
  isBusy: boolean;
  isExpanded: boolean;
  isReplay: boolean;
  onAsk: () => void;
  onDismiss: () => void;
  onSave: () => void;
  onUseful: () => void;
  onNotUseful: () => void;
  onToggleDetails: () => void;
}) {
  return (
    <div className="min-w-0" data-testid="alert-card">
      <button
        type="button"
        onClick={onToggleDetails}
        data-rds-action="toggle"
        data-action-state={isExpanded ? `changed-${actionSequence}` : "idle"}
        aria-expanded={isExpanded}
        aria-controls={`${alert.id}-rationale`}
        className="flex min-h-11 w-full cursor-pointer items-center gap-3 px-3 py-2 text-left transition hover:bg-surface-high/25"
      >
        <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", severityDot[alert.severity])} />
        <span className="sr-only">{alert.severity}:</span>
        <span className="min-w-0 flex-1 truncate text-sm text-on-surface">{cleanAlertMessage(alert.message)}</span>
        {alert.asset_symbol && alert.asset_symbol !== "Unknown" ? (
          <span className="shrink-0 text-xs text-outline">{alert.asset_symbol}</span>
        ) : null}
        <span
          aria-hidden="true"
          className={cn("shrink-0 text-xs text-outline transition-transform", isExpanded && "rotate-90")}
        >
          ›
        </span>
      </button>
      {isExpanded ? (
        <div id={`${alert.id}-rationale`} className="px-3 pb-3" data-testid="activity-details-panel">
          <p className="text-sm leading-6 text-on-surface">{buildAlertSuggestedResponse(alert)}</p>
          <p className="mt-1 text-sm leading-6 text-on-surface-variant">{explainAlertRelevance(alert)}</p>
          <p className="mt-1 text-xs leading-5 text-outline">{cleanAlertRationale(alert.rationale)}</p>
          <p className="mt-1 text-xs leading-5 text-outline">Ignore when: {buildAlertIgnoreCondition(alert)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={onAsk}
              aria-label="Ask Master Mold"
              title="Ask Master Mold"
              className={cn(alertActionClass, "border-violet/35 text-violet hover:bg-violet/10")}
            >
              <MessageSquareText aria-hidden="true" className="size-3.5" />
              Ask
            </button>
            {isReplay ? (
              <span className="inline-flex min-h-11 items-center rounded-md border border-outline-variant/35 px-2.5 text-xs text-outline sm:min-h-8">
                Replay view — actions disabled
              </span>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onSave}
                  disabled={isBusy}
                  aria-label="Save as decision"
                  title="Save this as a call in your journal"
                  className={cn(alertActionClass, "border-engine/35 text-engine hover:bg-engine/10")}
                >
                  <BookPlus aria-hidden="true" className="size-3.5" />
                  To journal
                </button>
                <Link
                  href={buildAlertPaperHref(alert)}
                  aria-label="Paper trade"
                  title="Try this idea with simulator dollars"
                  className={cn(alertActionClass, "border-caution/35 text-caution hover:bg-caution/10")}
                >
                  <Wallet aria-hidden="true" className="size-3.5" />
                  Test trade
                </Link>
                <button
                  type="button"
                  onClick={onDismiss}
                  disabled={isBusy}
                  data-rds-action="submit"
                  data-action-state={alert.acknowledged ? `changed-${actionSequence}` : "idle"}
                  aria-label="Dismiss activity"
                  title="Dismiss activity"
                  className={cn(alertActionClass, "border-outline-variant/40 text-on-surface-variant hover:text-on-surface")}
                >
                  <CheckCircle2 aria-hidden="true" className="size-3.5" />
                  Dismiss
                </button>
                <ThumbButton
                  active={alert.useful_feedback === true}
                  disabled={isBusy}
                  onClick={onUseful}
                  up
                />
                <ThumbButton
                  active={alert.useful_feedback === false}
                  disabled={isBusy}
                  onClick={onNotUseful}
                />
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const alertActionClass =
  "inline-flex min-h-11 items-center justify-center gap-1 rounded-md border px-2.5 text-xs font-medium transition-colors disabled:opacity-50 sm:min-h-8";

function ActivityFilterControls({
  activeCount,
  actionSequence,
  filter,
  setActionSequence,
  setFilter,
  setLastAction,
}: {
  activeCount: number;
  actionSequence: number;
  filter: SeverityFilter;
  setActionSequence: React.Dispatch<React.SetStateAction<number>>;
  setFilter: React.Dispatch<React.SetStateAction<SeverityFilter>>;
  setLastAction: React.Dispatch<React.SetStateAction<string>>;
}) {
  const controls = filters.map((item) => (
    <button
      key={item}
      type="button"
      aria-pressed={filter === item}
      data-rds-action="filter"
      data-action-state={filter === item ? `changed-${actionSequence}` : "idle"}
      onClick={() => {
        markBrowserAction(`filter-alerts-${item}`);
        setFilter(item);
        setLastAction(`Filter set to ${item}.`);
        setActionSequence((current) => current + 1);
      }}
      className={cn(
        "min-h-11 rounded-md px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet sm:h-8 sm:min-h-8",
        filter === item
          ? "bg-violet text-void"
          : "text-on-surface-variant hover:bg-surface-high/45 hover:text-on-surface",
      )}
    >
      {item}
    </button>
  ));

  return (
    <>
      <details className="group rounded-md border border-outline-variant/30 bg-surface-dim/25 px-3 sm:hidden">
        <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-sm font-semibold text-on-surface [&::-webkit-details-marker]:hidden">
          <span>{filter} activity</span>
          <span className="text-xs font-semibold text-outline">{activeCount} active</span>
        </summary>
        <div className="grid grid-cols-2 gap-2 border-t border-outline-variant/25 py-3" role="group" aria-label="Filter activity">
          {controls}
        </div>
      </details>
      <div className="hidden items-center justify-between gap-3 border-b border-outline-variant/20 pb-3 sm:flex">
        <div
          className="inline-flex flex-wrap items-center gap-1 rounded-md border border-outline-variant/30 bg-surface-dim/25 p-1"
          role="group"
          aria-label="Filter activity"
        >
          {controls}
        </div>
        <span className="shrink-0 text-xs text-outline">
          {activeCount} active
        </span>
      </div>
    </>
  );
}

function markBrowserAction(token: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("rds_action", token);
  url.searchParams.set("rds_seq", String(Date.now()));
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  document.documentElement.dataset.rdsAction = token;
  const evidence = document.getElementById("rds-live-action-evidence");
  if (evidence) {
    evidence.textContent = `Action evidence: ${token} changed visible activity feed state.`;
    evidence.dataset.rdsActionEvidence = token;
  }
}

function isActivityCommandAction(action: string | null): action is
  | "save-top-activity"
  | "dismiss-top-activity"
  | "mark-top-activity-useful"
  | "mark-top-activity-not-useful" {
  return (
    action === "save-top-activity" ||
    action === "dismiss-top-activity" ||
    action === "mark-top-activity-useful" ||
    action === "mark-top-activity-not-useful"
  );
}

function ThumbButton({
  active,
  disabled,
  onClick,
  up = false,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  up?: boolean;
}) {
  const Icon = up ? ThumbsUp : ThumbsDown;
  const label = up ? "Useful" : "Not useful";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      data-rds-action="submit"
      data-action-state={active ? "changed" : "idle"}
      className={cn(
        "inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border transition-colors disabled:opacity-50 sm:min-h-8 sm:min-w-8",
        active
          ? up
            ? "border-engine/40 bg-engine/15 text-engine"
            : "border-critical/40 bg-critical/15 text-critical"
          : "border-outline-variant/40 text-outline hover:text-on-surface",
      )}
    >
      <Icon aria-hidden="true" className="size-3.5" />
    </button>
  );
}
