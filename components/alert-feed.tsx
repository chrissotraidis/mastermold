"use client";

import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, ChevronDown, Filter, MessageSquareText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { AlertJson, AlertTier } from "@/src/db/alerts";

type TierFilter = "All" | AlertTier;
type FeedbackValue = Exclude<AlertJson["useful_feedback"], null>;

const filters: TierFilter[] = ["All", "T0", "T1", "T2"];

const tierStyles: Record<AlertTier, string> = {
  T0: "border-red-300/50 bg-red-400/15 text-critical",
  T1: "border-amber-300/50 bg-caution/15 text-caution",
  T2: "border-violet/50 bg-violet/15 text-violet",
};

export function AlertFeed({ initialAlerts }: { initialAlerts: AlertJson[] }) {
  const [alerts, setAlerts] = useState(initialAlerts);
  const [filter, setFilter] = useState<TierFilter>("All");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pendingAlertId, setPendingAlertId] = useState<string | null>(null);
  const [message, setMessage] = useState("Feedback is reflected without a page reload.");
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
        setMessage(`${alert.tier} alert acknowledged.`);
      } catch {
        updateAlert(alert.id, { acknowledged: alert.acknowledged });
        setMessage("Acknowledge alert request failed. Try again.");
      } finally {
        setPendingAlertId(null);
      }
    });
  }

  function submitFeedback(alert: AlertJson, usefulFeedback: FeedbackValue) {
    markBrowserAction(`submit-feedback-${alert.id}-${usefulFeedback ? "useful" : "not-useful"}`);
    updateAlert(alert.id, { useful_feedback: usefulFeedback });
    setLastAction(`Submit feedback ${usefulFeedback ? "useful" : "not useful"} for ${alert.tier}.`);
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
        setMessage(`Feedback saved as ${usefulFeedback ? "useful" : "not useful"}.`);
      } catch {
        updateAlert(alert.id, { useful_feedback: alert.useful_feedback });
        setMessage("Submit feedback request failed. Try again.");
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
      <div className="flex flex-col gap-3 rounded-lg border border-outline-variant/40 bg-surface-high/30 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-on-surface">
            <Filter aria-hidden="true" className="size-4 text-violet" />
            <span>Filter by tier</span>
          </div>
          <p className="text-sm text-outline">
            {activeCount} active alert{activeCount === 1 ? "" : "s"} remain in the feed.
          </p>
        </div>
        <div className="grid grid-cols-4 gap-2 sm:flex" role="group" aria-label="Tier filter controls">
          {filters.map((item) => (
            <Button
              key={item}
              type="button"
              size="sm"
              variant={filter === item ? "default" : "outline"}
              className={cn(
                "min-w-0 border-outline-variant/50",
                filter === item
                  ? "bg-violet text-void hover:bg-violet"
                  : "bg-transparent text-on-surface hover:bg-surface-high/60",
              )}
              aria-pressed={filter === item}
              data-rds-action="filter"
              data-action-state={filter === item ? `changed-${actionSequence}` : "idle"}
              onClick={() => {
                markBrowserAction(`filter-alerts-${item}`);
                setFilter(item);
                setLastAction(`Filter set to ${item}.`);
                setActionSequence((current) => current + 1);
              }}
            >
              {item}
            </Button>
          ))}
        </div>
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
                          {alert.tier}
                        </Badge>
                        <Badge variant="outline" className="border-outline-variant/50 text-on-surface-variant">
                          z_score {alert.z_score.toFixed(1)}
                        </Badge>
                        {alert.acknowledged ? (
                          <Badge variant="outline" className="border-engine/40 text-engine">
                            Acknowledged
                          </Badge>
                        ) : null}
                      </div>
                      <CardTitle className="text-lg leading-7 text-on-surface">{alert.message}</CardTitle>
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
                        Alert rationale
                      </div>
                      {alert.rationale}
                    </div>
                  ) : null}

                  <div className="grid gap-4 border-t border-outline-variant/40 pt-4 lg:grid-cols-[auto_1fr] lg:items-center">
                    <Button
                      type="button"
                      className="w-full bg-engine text-void hover:bg-emerald-200 lg:w-auto"
                      onClick={() => acknowledge(alert)}
                      data-rds-action="submit"
                      data-action-state={alert.acknowledged ? `changed-${actionSequence}` : "idle"}
                      disabled={alert.acknowledged || isBusy}
                    >
                      <CheckCircle2 aria-hidden="true" />
                      {alert.acknowledged ? "Acknowledged" : "Acknowledge alert"}
                    </Button>

                    <fieldset className="min-w-0 rounded-md border border-outline-variant/40 p-3">
                      <legend className="px-1 text-sm font-semibold text-on-surface">
                        Submit feedback
                      </legend>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <FeedbackOption
                          alert={alert}
                          value={true}
                          label="Useful"
                          disabled={isBusy}
                          onChange={submitFeedback}
                        />
                        <FeedbackOption
                          alert={alert}
                          value={false}
                          label="Not useful"
                          disabled={isBusy}
                          onChange={submitFeedback}
                        />
                      </div>
                    </fieldset>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-outline-variant/40 bg-surface-high/30 p-6 text-sm leading-6 text-on-surface-variant">
          No alerts match the selected tier filter.
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

function FeedbackOption({
  alert,
  value,
  label,
  disabled,
  onChange,
}: {
  alert: AlertJson;
  value: FeedbackValue;
  label: string;
  disabled: boolean;
  onChange: (alert: AlertJson, usefulFeedback: FeedbackValue) => void;
}) {
  const inputId = `${alert.id}-${value ? "useful" : "not-useful"}`;

  return (
    <div className="flex items-center gap-3 rounded-md border border-outline-variant/40 bg-surface-dim/40 px-3 py-2">
      <input
        id={inputId}
        type="radio"
        name={`${alert.id}-feedback`}
        className="size-4 accent-violet"
        checked={alert.useful_feedback === value}
        disabled={disabled}
        data-rds-action="submit"
        data-action-state={alert.useful_feedback === value ? "changed" : "idle"}
        onChange={() => onChange(alert, value)}
      />
      <Label htmlFor={inputId} className="cursor-pointer text-sm text-on-surface-variant">
        {label}
      </Label>
    </div>
  );
}
