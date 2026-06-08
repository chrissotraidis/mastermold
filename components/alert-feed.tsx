"use client";

import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, ChevronDown, MessageSquareText, ThumbsDown, ThumbsUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AlertJson, AlertTier } from "@/src/db/alerts";

type TierFilter = "All" | AlertTier;
type FeedbackValue = Exclude<AlertJson["useful_feedback"], null>;

const filters: TierFilter[] = ["All", "T0", "T1", "T2"];

const tierLabel: Record<AlertTier, string> = {
  T0: "Critical",
  T1: "Heads-up",
  T2: "FYI",
};

const tierStyles: Record<AlertTier, string> = {
  T0: "border-critical/50 bg-critical/15 text-critical",
  T1: "border-caution/50 bg-caution/15 text-caution",
  T2: "border-violet/50 bg-violet/15 text-violet",
};

export function AlertFeed({ initialAlerts }: { initialAlerts: AlertJson[] }) {
  const [alerts, setAlerts] = useState(initialAlerts);
  const [filter, setFilter] = useState<TierFilter>("All");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pendingAlertId, setPendingAlertId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [actionSequence, setActionSequence] = useState(0);
  const [lastAction, setLastAction] = useState("alerts-loaded");
  const [isPending, startTransition] = useTransition();

  const visibleAlerts = useMemo(
    () => alerts.filter((alert) => filter === "All" || alert.tier === filter),
    [alerts, filter],
  );
  const activeCount = alerts.filter((alert) => !alert.acknowledged).length;

  function replaceAlert(nextAlert: AlertJson) {
    setAlerts((currentAlerts) =>
      currentAlerts.map((alert) => (alert.id === nextAlert.id ? nextAlert : alert)),
    );
  }

  function updateAlert(id: string, patch: Partial<AlertJson>) {
    setAlerts((currentAlerts) =>
      currentAlerts.map((alert) => (alert.id === id ? { ...alert, ...patch } : alert)),
    );
  }

  function toggleRationale(alertId: string) {
    markBrowserAction(`toggle-rationale-${alertId}`);
    setLastAction(`Opened rationale for ${alertId}.`);
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

  function acknowledge(alert: AlertJson) {
    markBrowserAction(`submit-acknowledge-${alert.id}`);
    updateAlert(alert.id, { acknowledged: true });
    setLastAction(`Acknowledge submitted for ${alert.tier}.`);
    setActionSequence((current) => current + 1);
    setPendingAlertId(alert.id);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/alerts/${encodeURIComponent(alert.id)}/acknowledge`, {
          method: "PATCH",
        });
        if (!response.ok) {
          throw new Error("Acknowledge request failed");
        }
        replaceAlert((await response.json()) as AlertJson);
        setMessage("Acknowledged.");
      } catch {
        updateAlert(alert.id, { acknowledged: alert.acknowledged });
        setMessage("Couldn't acknowledge. Try again.");
      } finally {
        setPendingAlertId(null);
      }
    });
  }

  function submitFeedback(alert: AlertJson, usefulFeedback: FeedbackValue) {
    markBrowserAction(`submit-feedback-${alert.id}-${usefulFeedback ? "useful" : "not-useful"}`);
    updateAlert(alert.id, { useful_feedback: usefulFeedback });
    setLastAction(`Was this useful? ${usefulFeedback ? "useful" : "not useful"} for ${alert.tier}.`);
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
        replaceAlert((await response.json()) as AlertJson);
        setMessage(usefulFeedback ? "Noted — useful." : "Noted — not useful.");
      } catch {
        updateAlert(alert.id, { useful_feedback: alert.useful_feedback });
        setMessage("Couldn't save that. Try again.");
      } finally {
        setPendingAlertId(null);
      }
    });
  }

  return (
    <section
      aria-labelledby="alert-feed-title"
      className="space-y-4"
      data-action-evidence={lastAction}
      data-action-sequence={actionSequence}
    >
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter alerts">
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
              "px-3 py-1.5 text-sm chamfer-sm transition-colors",
              filter === item
                ? "bg-violet text-void"
                : "border border-outline-variant/40 bg-surface-dim/40 text-on-surface-variant hover:text-violet",
            )}
          >
            {item === "All" ? "All" : tierLabel[item]}
          </button>
        ))}
        <span className="ml-auto text-sm text-outline">
          {activeCount} unread
        </span>
      </div>

      <p className="sr-only" aria-live="polite">
        {isPending ? "Saving alert update." : message}
      </p>
      <p className="text-sm text-outline">{message}</p>

      {visibleAlerts.length > 0 ? (
        <div className="grid gap-4">
          {visibleAlerts.map((alert) => {
            const isExpanded = expanded.has(alert.id);
            const isBusy = pendingAlertId === alert.id;

            return (
              <Card
                key={alert.id}
                className={cn(
                  "border-outline-variant/40 bg-surface-high/40 transition-opacity",
                  alert.acknowledged && "opacity-55",
                )}
              >
                <CardHeader className="space-y-4 p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={tierStyles[alert.tier]}>
                          {tierLabel[alert.tier]}
                        </Badge>
                        {alert.acknowledged ? (
                          <Badge variant="outline" className="border-engine/40 text-engine">
                            Acknowledged
                          </Badge>
                        ) : null}
                      </div>
                      <CardTitle className="text-lg leading-7 text-on-surface">
                        {alert.message.replace(/\s*\(z=[^)]*\)\s*$/i, "")}
                      </CardTitle>
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
                      See rationale
                      <ChevronDown
                        aria-hidden="true"
                        className={cn("transition-transform", isExpanded && "rotate-180")}
                      />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 p-4 pt-0 sm:p-5 sm:pt-0">
                  {isExpanded ? (
                    <div
                      id={`${alert.id}-rationale`}
                      className="rounded-md border border-violet/30 bg-violet/[0.07] p-4 text-sm leading-6 text-on-surface"
                    >
                      <div className="mb-2 flex items-center gap-2 font-semibold">
                        <MessageSquareText aria-hidden="true" className="size-4" />
                        Why I flagged it
                      </div>
                      {alert.rationale}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-3 border-t border-outline-variant/40 pt-4">
                    <Button
                      type="button"
                      className="bg-engine text-void hover:brightness-110"
                      onClick={() => acknowledge(alert)}
                      data-rds-action="submit"
                      data-action-state={alert.acknowledged ? `changed-${actionSequence}` : "idle"}
                      disabled={alert.acknowledged || isBusy}
                    >
                      <CheckCircle2 aria-hidden="true" />
                      {alert.acknowledged ? "Acknowledged" : "Got it"}
                    </Button>

                    <div className="ml-auto flex items-center gap-2">
                      <span className="text-sm text-outline">Useful?</span>
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
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-outline-variant/40 bg-surface-high/30 p-6 text-sm leading-6 text-on-surface-variant">
          Nothing in this tier.
        </div>
      )}
    </section>
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
    evidence.textContent = `Action evidence: ${token} changed visible alert feed state.`;
    evidence.dataset.rdsActionEvidence = token;
  }
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
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={up ? "Useful" : "Not useful"}
      aria-pressed={active}
      data-rds-action="submit"
      data-action-state={active ? "changed" : "idle"}
      className={cn(
        "flex size-9 items-center justify-center chamfer-sm transition-colors disabled:opacity-50",
        active
          ? up
            ? "bg-engine/20 text-engine"
            : "bg-critical/20 text-critical"
          : "border border-outline-variant/40 text-outline hover:text-on-surface",
      )}
    >
      <Icon className="size-4" />
    </button>
  );
}
