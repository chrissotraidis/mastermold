"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  BookPlus,
  CheckCircle2,
  ChevronDown,
  MessageSquareText,
  ThumbsDown,
  ThumbsUp,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import type { ReactNode } from "react";

type SavedJournalEntry = PublicJournal["entries"][number];

type SeverityFilter = "All" | PublicAlert["severity"];
type FeedbackValue = Exclude<PublicAlert["useful_feedback"], null>;

const filters: SeverityFilter[] = ["All", "Urgent", "Worth checking", "FYI"];

const severityStyles: Record<PublicAlert["severity"], string> = {
  Urgent: "border-critical/50 bg-critical/15 text-critical",
  "Worth checking": "border-caution/50 bg-caution/15 text-caution",
  FYI: "border-violet/50 bg-violet/15 text-violet",
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
      className="space-y-4"
      data-action-evidence={lastAction}
      data-action-sequence={actionSequence}
    >
      <h2 id="alert-feed-title" className="sr-only">
        Activity list
      </h2>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter activity">
        {filters.map((item) => (
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
              "min-h-11 px-4 py-2 text-sm chamfer-sm transition-colors",
              filter === item
                ? "bg-violet text-void"
                : "border border-outline-variant/40 bg-surface-dim/40 text-on-surface-variant hover:text-violet",
            )}
          >
            {item}
          </button>
        ))}
        <span className="ml-auto text-sm text-outline">
          {activeCount} unread
        </span>
      </div>

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
        <div className="grid gap-4">
          {visibleAlerts.map((alert) => {
            const isExpanded = expanded.has(alert.id);
            const isBusy = pendingAlertId === alert.id;
            return (
              <Card key={alert.id} className="border-outline-variant/40 bg-surface-high/40">
                <CardHeader className="space-y-4 p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={severityStyles[alert.severity]}>
                          {alert.severity}
                        </Badge>
                      </div>
                      <CardTitle className="text-lg leading-7 text-on-surface">
                        {cleanAlertMessage(alert.message)}
                      </CardTitle>
                      <p className="line-clamp-2 max-w-2xl text-sm leading-6 text-on-surface-variant">
                        {explainAlertRelevance(alert)}
                      </p>
                      <ActivityActionRow
                        alert={alert}
                        isBusy={isBusy}
                        isReplay={isReplay}
                        onAsk={() => openMasterMoldChat(buildAlertChatPrompt(alert), buildAlertPageContext(alert))}
                        onSave={() => saveAsDecision(alert)}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full shrink-0 border-outline-variant/50 bg-transparent text-on-surface hover:bg-surface-high/60 sm:w-auto"
                      onClick={() => toggleRationale(alert.id)}
                      data-rds-action="toggle"
                      data-action-state={isExpanded ? `changed-${actionSequence}` : "idle"}
                      aria-expanded={isExpanded}
                      aria-controls={`${alert.id}-rationale`}
                    >
                      Details and response
                      <ChevronDown
                        aria-hidden="true"
                        className={cn("transition-transform", isExpanded && "rotate-180")}
                      />
                    </Button>
                  </div>
                </CardHeader>
                {isExpanded ? (
                  <CardContent className="space-y-4 p-4 pt-0 sm:p-5 sm:pt-0">
                    <div
                      id={`${alert.id}-rationale`}
                      className="rounded-md border border-violet/30 bg-violet/[0.07] p-4 text-sm leading-6 text-on-surface"
                    >
                      <div className="mb-3 flex items-center gap-2 font-semibold">
                        <MessageSquareText aria-hidden="true" className="size-4" />
                        Why this matters
                      </div>
                      <div className="grid gap-3 md:grid-cols-3">
                        <AlertExplanationPoint label="Why it matters" body={explainAlertRelevance(alert)} />
                        <AlertExplanationPoint label="Reasonable response" body={buildAlertSuggestedResponse(alert)} />
                        <AlertExplanationPoint label="Safe to ignore when" body={buildAlertIgnoreCondition(alert)} />
                      </div>
                      <details className="mt-3 rounded-md border border-outline-variant/40 bg-surface-dim/45 p-3 text-outline">
                        <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-on-surface">
                          Show scan details
                        </summary>
                        <p className="mt-2">{cleanAlertRationale(alert.rationale)}</p>
                      </details>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 border-t border-outline-variant/40 pt-4">
                      {isReplay ? (
                        <p className="text-sm leading-6 text-outline">
                          Dismiss and feedback are disabled in replay so this snapshot stays unchanged.
                        </p>
                      ) : (
                        <>
                          <Button
                            type="button"
                            className="bg-engine text-void hover:brightness-110"
                            onClick={() => dismiss(alert)}
                            data-rds-action="submit"
                            data-action-state={alert.acknowledged ? `changed-${actionSequence}` : "idle"}
                            disabled={isBusy}
                          >
                            <CheckCircle2 aria-hidden="true" />
                            Dismiss
                          </Button>

                          <div className="ml-auto flex flex-wrap items-center gap-2">
                            <ThumbButton
                              active={alert.useful_feedback === true}
                              disabled={isBusy}
                              onClick={() => submitFeedback(alert, true)}
                              up
                            />
                            <ThumbButton
                              active={alert.useful_feedback === false}
                              disabled={isBusy}
                              onClick={() => submitFeedback(alert, false)}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </CardContent>
                ) : null}
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-outline-variant/40 bg-surface-high/30 p-6 text-sm leading-6 text-on-surface-variant">
          {dismissedAlerts.length > 0 ? "Nothing active in this group." : "Nothing in this group."}
        </div>
      )}
      {dismissedAlerts.length > 0 ? (
        <details open className="rounded-md border border-outline-variant/40 bg-surface-dim/35 p-4">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-on-surface">
            {isReplay ? "Already dismissed in this replay" : "Dismissed"} ({dismissedAlerts.length})
          </summary>
          <div className="mt-3 grid gap-2">
            {dismissedAlerts.map((alert) => {
              const isBusy = pendingAlertId === alert.id;
              return (
                <div key={alert.id} className="flex flex-wrap items-center gap-2 rounded-md border border-outline-variant/35 bg-surface-high/30 p-3">
                  <span className="min-w-0 flex-1 text-sm text-on-surface-variant">
                    {cleanAlertMessage(alert.message)}
                  </span>
                  {isReplay ? (
                    <span className="inline-flex min-h-11 items-center justify-center rounded-md border border-outline-variant/35 px-3 text-sm font-semibold text-outline">
                      Replay only
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => restore(alert)}
                      disabled={isBusy}
                      className="inline-flex min-h-11 items-center justify-center rounded-md border border-violet/35 px-3 text-sm font-semibold text-violet transition hover:bg-violet/10 disabled:opacity-50"
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

function AlertExplanationPoint({ label, body }: { label: string; body: string }) {
  return (
    <div className="rounded-md border border-outline-variant/35 bg-surface-dim/35 p-3">
      <p className="font-mono text-[11px] uppercase tracking-telemetry text-outline">{label}</p>
      <p className="mt-2 text-sm leading-6 text-on-surface-variant">{body}</p>
    </div>
  );
}

function ActivityActionRow({
  alert,
  isBusy,
  isReplay,
  onAsk,
  onSave,
}: {
  alert: PublicAlert;
  isBusy: boolean;
  isReplay: boolean;
  onAsk: () => void;
  onSave: () => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-1 rounded-md border border-outline-variant/35 bg-surface-dim/35 p-1 md:gap-2 md:p-2">
      <button
        type="button"
        onClick={onAsk}
        aria-label="Ask Master Mold"
        title="Ask Master Mold"
        className="inline-flex min-h-11 items-center justify-center gap-1 rounded-md border border-violet/35 bg-violet/10 px-2 py-2 text-xs font-medium text-violet transition-colors hover:bg-violet/15 sm:gap-2 sm:px-3 sm:text-sm"
      >
        <MessageSquareText aria-hidden="true" className="size-4" />
        <span>Ask</span>
      </button>
      {isReplay ? (
        <>
          <ReplayDisabledAction icon={<BookPlus aria-hidden="true" className="size-4" />}>
            Save disabled
          </ReplayDisabledAction>
          <ReplayDisabledAction icon={<Wallet aria-hidden="true" className="size-4" />}>
            Paper trade disabled
          </ReplayDisabledAction>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={onSave}
            disabled={isBusy}
            aria-label="Save as decision"
            title="Save as decision"
            className="inline-flex min-h-11 items-center justify-center gap-1 rounded-md border border-engine/35 bg-engine/10 px-2 py-2 text-xs font-medium text-engine transition-colors hover:bg-engine/15 disabled:opacity-50 sm:gap-2 sm:px-3 sm:text-sm"
          >
            <BookPlus aria-hidden="true" className="size-4" />
            <span>Save</span>
          </button>
          <Link
            href={buildAlertPaperHref(alert)}
            aria-label="Paper trade"
            title="Paper trade"
            className="inline-flex min-h-11 items-center justify-center gap-1 rounded-md border border-caution/35 bg-caution/10 px-2 py-2 text-xs font-medium text-caution transition-colors hover:bg-caution/15 sm:gap-2 sm:px-3 sm:text-sm"
          >
            <Wallet aria-hidden="true" className="size-4" />
            <span>Paper</span>
          </Link>
        </>
      )}
    </div>
  );
}

function ReplayDisabledAction({
  children,
  icon,
}: {
  children: ReactNode;
  icon: ReactNode;
}) {
  return (
    <span
      aria-disabled="true"
      title="Disabled in replay"
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-outline-variant/35 bg-surface-dim/45 px-3 py-2 text-sm font-medium text-outline"
    >
      {icon}
      {children}
    </span>
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
      data-rds-action="submit"
      data-action-state={active ? "changed" : "idle"}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 px-3 py-2 text-sm font-semibold chamfer-sm transition-colors disabled:opacity-50",
        active
          ? up
            ? "bg-engine/20 text-engine"
            : "bg-critical/20 text-critical"
          : "border border-outline-variant/40 text-outline hover:text-on-surface",
      )}
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}
