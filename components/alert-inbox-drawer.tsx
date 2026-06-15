"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AlertTriangle, Bell, BookPlus, CheckCircle2, MessageSquareText, ThumbsDown, ThumbsUp, Wallet, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ProvenanceChip } from "@/components/provenance-chip";
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
import { cachedGetJson, peekCachedJson, setCachedJson } from "@/lib/client-fetch-cache";
import { cn } from "@/lib/utils";
import type { PublicAlert, PublicJournal } from "@/lib/public-api-copy";

type SavedJournalEntry = PublicJournal["entries"][number];

export const MASTER_MOLD_ALERTS_EVENT = "mastermold:open-alerts";

export function openMasterMoldAlerts() {
  window.dispatchEvent(new CustomEvent(MASTER_MOLD_ALERTS_EVENT));
}

const severityStyles: Record<PublicAlert["severity"], string> = {
  Urgent: "border-critical/50 bg-critical/15 text-critical",
  "Worth checking": "border-caution/50 bg-caution/15 text-caution",
  FYI: "border-violet/50 bg-violet/15 text-violet",
};

export function AlertInboxDrawer() {
  const [open, setOpen] = useState(false);
  // Paint instantly from the shared cache when a warm copy exists (avoids a
  // blank bell flicker on every navigation), then refresh in the effect.
  const [alerts, setAlerts] = useState<PublicAlert[]>(
    () => peekCachedJson<PublicAlert[]>("/api/alerts") ?? [],
  );
  const [loaded, setLoaded] = useState(() => peekCachedJson<PublicAlert[]>("/api/alerts") !== undefined);
  const [message, setMessage] = useState("");
  const [savedJournalId, setSavedJournalId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [lastDismissedId, setLastDismissedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const activeAlerts = useMemo(
    () => alerts.filter((alert) => !alert.acknowledged),
    [alerts],
  );
  const dismissedAlerts = useMemo(
    () => alerts.filter((alert) => alert.acknowledged),
    [alerts],
  );
  const lastDismissedAlert = useMemo(
    () => (lastDismissedId ? alerts.find((alert) => alert.id === lastDismissedId && alert.acknowledged) ?? null : null),
    [alerts, lastDismissedId],
  );

  useEffect(() => {
    function onOpenAlerts() {
      setOpen(true);
    }

    window.addEventListener(MASTER_MOLD_ALERTS_EVENT, onOpenAlerts);
    let cancelled = false;
    async function loadAlerts() {
      try {
        const nextAlerts = await cachedGetJson<PublicAlert[]>("/api/alerts");
        if (!cancelled) {
          setAlerts(nextAlerts);
          setLoaded(true);
        }
      } catch {
        if (!cancelled) {
          setMessage("Couldn't load alerts.");
          setLoaded(true);
        }
      }
    }

    void loadAlerts();
    return () => {
      cancelled = true;
      window.removeEventListener(MASTER_MOLD_ALERTS_EVENT, onOpenAlerts);
    };
  }, []);

  // Mirror confirmed/optimistic alert state into the shared cache so the next
  // navigation paints the correct unread badge instantly instead of a stale one.
  useEffect(() => {
    if (loaded) setCachedJson("/api/alerts", alerts);
  }, [alerts, loaded]);

  function replaceAlert(nextAlert: PublicAlert) {
    setAlerts((current) => current.map((alert) => (alert.id === nextAlert.id ? nextAlert : alert)));
  }

  function patchAlert(id: string, patch: Partial<PublicAlert>) {
    setAlerts((current) => current.map((alert) => (alert.id === id ? { ...alert, ...patch } : alert)));
  }

  function dismiss(alert: PublicAlert) {
    setSavedJournalId(null);
    patchAlert(alert.id, { acknowledged: true });
    setPendingId(alert.id);
    setLastDismissedId(alert.id);
    setMessage("Dismissed.");
    startTransition(async () => {
      try {
        const response = await fetch(`/api/alerts/${encodeURIComponent(alert.id)}/acknowledge`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acknowledged: true }),
        });
        if (!response.ok) throw new Error("Dismiss failed");
        replaceAlert((await response.json()) as PublicAlert);
      } catch {
        patchAlert(alert.id, { acknowledged: alert.acknowledged });
        setLastDismissedId(null);
        setMessage("Couldn't dismiss. Try again.");
      } finally {
        setPendingId(null);
      }
    });
  }

  function restore(alert: PublicAlert) {
    setSavedJournalId(null);
    patchAlert(alert.id, { acknowledged: false });
    setPendingId(alert.id);
    if (lastDismissedId === alert.id) {
      setLastDismissedId(null);
    }
    setMessage("Restored to active alerts.");
    startTransition(async () => {
      try {
        const response = await fetch(`/api/alerts/${encodeURIComponent(alert.id)}/acknowledge`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acknowledged: false }),
        });
        if (!response.ok) throw new Error("Restore failed");
        replaceAlert((await response.json()) as PublicAlert);
      } catch {
        patchAlert(alert.id, { acknowledged: alert.acknowledged });
        setLastDismissedId(alert.id);
        setMessage("Couldn't restore. Try again.");
      } finally {
        setPendingId(null);
      }
    });
  }

  function saveAsDecision(alert: PublicAlert) {
    setPendingId(alert.id);
    setLastDismissedId(null);
    setMessage("Saving decision...");
    startTransition(async () => {
      try {
        const response = await fetch("/api/journal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildAlertJournalInput(alert)),
        });
        if (!response.ok) throw new Error("Decision save failed");
        const entry = (await response.json()) as SavedJournalEntry;
        setSavedJournalId(entry.id);
        setMessage("Saved to Decision journal.");
      } catch {
        setSavedJournalId(null);
        setMessage("Couldn't save the decision. Try again from the alert page.");
      } finally {
        setPendingId(null);
      }
    });
  }

  function askAboutAlert(alert: PublicAlert) {
    setOpen(false);
    openMasterMoldChat(buildAlertChatPrompt(alert), buildAlertPageContext(alert));
  }

  function submitFeedback(alert: PublicAlert, useful: boolean) {
    setSavedJournalId(null);
    patchAlert(alert.id, { useful_feedback: useful });
    setPendingId(alert.id);
    setMessage(useful ? "Marked useful." : "Marked not useful.");
    startTransition(async () => {
      try {
        const response = await fetch(`/api/alerts/${encodeURIComponent(alert.id)}/feedback`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ useful_feedback: useful }),
        });
        if (!response.ok) throw new Error("Feedback failed");
        replaceAlert((await response.json()) as PublicAlert);
      } catch {
        patchAlert(alert.id, { useful_feedback: alert.useful_feedback });
        setMessage("Couldn't save feedback.");
      } finally {
        setPendingId(null);
      }
    });
  }

  const drawer = open ? (
    <div className="fixed inset-0 z-[96] flex items-end bg-void/65 backdrop-blur-sm md:items-start md:justify-end" role="dialog" aria-modal="true" aria-labelledby="alert-inbox-title" data-testid="alert-inbox-drawer">
      <div className="flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-outline-variant/50 bg-surface-low p-4 shadow-2xl md:mr-5 md:mt-20 md:max-h-[82vh] md:w-[31rem] md:rounded-lg md:p-5">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-caution/35 bg-caution/10 text-caution">
            <AlertTriangle aria-hidden="true" className="size-5" />
          </div>
          <div className="min-w-0">
            <h2 id="alert-inbox-title" className="text-lg font-semibold text-on-surface">Alerts</h2>
            <p className="text-sm leading-5 text-outline">
              {activeAlerts.length > 0
                ? `${activeAlerts.length} item${activeAlerts.length === 1 ? "" : "s"} moved enough to check.`
                : "Nothing needs attention right now."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="ml-auto flex size-11 items-center justify-center rounded-md border border-outline-variant/40 text-outline transition hover:text-on-surface"
            aria-label="Close alerts"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>

        <p className="sr-only" aria-live="polite">{isPending ? "Saving alert update." : message}</p>
        {message ? (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-outline-variant/35 bg-surface-dim/35 px-3 py-2 text-sm text-outline">
            <span>{message}</span>
            {savedJournalId ? (
              <Link
                href={`/journal?entry=${encodeURIComponent(savedJournalId)}#${encodeURIComponent(savedJournalId)}`}
                onClick={() => setOpen(false)}
                className="ml-auto inline-flex min-h-11 items-center justify-center rounded-md border border-violet/35 px-3 font-semibold text-violet transition hover:bg-violet/10"
              >
                Open saved call
              </Link>
            ) : null}
            {lastDismissedAlert ? (
              <button
                type="button"
                onClick={() => restore(lastDismissedAlert)}
                disabled={pendingId === lastDismissedAlert.id}
                className="ml-auto inline-flex min-h-11 items-center justify-center rounded-md border border-violet/35 px-3 font-semibold text-violet transition hover:bg-violet/10 disabled:opacity-50"
              >
                Undo
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {!loaded ? (
            <div className="rounded-md border border-outline-variant/40 bg-surface-dim/45 p-4 text-sm text-outline">
              Loading alerts...
            </div>
          ) : activeAlerts.length > 0 ? (
            activeAlerts.map((alert) => {
              const busy = pendingId === alert.id;
              return (
                <article key={alert.id} className="rounded-md border border-outline-variant/40 bg-surface-high/40 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={severityStyles[alert.severity]}>
                      {alert.severity}
                    </Badge>
                    <ProvenanceChip label={alert.provenance.label} title={alert.provenance.source} />
                  </div>
                  <h3 className="mt-3 text-base font-semibold leading-6 text-on-surface">
                    {cleanAlertMessage(alert.message)}
                  </h3>
                  <div className="mt-3 grid gap-2">
                    <DrawerExplanationPoint label="Why it matters" body={explainAlertRelevance(alert)} />
                    <DrawerExplanationPoint label="Reasonable response" body={buildAlertSuggestedResponse(alert)} />
                  </div>
                  <details className="mt-3 rounded-md border border-outline-variant/35 bg-surface-dim/35 p-3 text-sm leading-6 text-outline">
                    <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-on-surface">Show scan details</summary>
                    <div className="mt-2 space-y-2">
                      <p>
                        <span className="font-semibold text-on-surface">Safe to ignore when: </span>
                        {buildAlertIgnoreCondition(alert)}
                      </p>
                      <p>{cleanAlertRationale(alert.rationale)}</p>
                    </div>
                  </details>
                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    <button
                      type="button"
                      onClick={() => askAboutAlert(alert)}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-violet/35 bg-violet/10 px-3 py-2 text-sm font-semibold text-violet transition hover:bg-violet/15"
                      data-testid={`alert-ask-${alert.id}`}
                    >
                      <MessageSquareText aria-hidden="true" className="size-4" />
                      Ask Master Mold
                    </button>
                    <button
                      type="button"
                      onClick={() => saveAsDecision(alert)}
                      disabled={busy}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-engine/35 bg-engine/10 px-3 py-2 text-sm font-semibold text-engine transition hover:bg-engine/15 disabled:opacity-50"
                      data-testid={`alert-save-${alert.id}`}
                    >
                      <BookPlus aria-hidden="true" className="size-4" />
                      Save as decision
                    </button>
                    <Link
                      href={buildAlertPaperHref(alert)}
                      onClick={() => setOpen(false)}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-caution/35 bg-caution/10 px-3 py-2 text-sm font-semibold text-caution transition hover:bg-caution/15"
                    >
                      <Wallet aria-hidden="true" className="size-4" />
                      Paper trade
                    </Link>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => dismiss(alert)}
                      disabled={busy}
                      className="inline-flex min-h-11 items-center gap-2 rounded-md border border-outline-variant/40 px-3 text-sm text-on-surface-variant transition hover:text-on-surface disabled:opacity-50"
                    >
                      <CheckCircle2 aria-hidden="true" className="size-4" />
                      Dismiss
                    </button>
                    <FeedbackButton
                      active={alert.useful_feedback === true}
                      disabled={busy}
                      label="Useful"
                      testId={`alert-useful-${alert.id}`}
                      onClick={() => submitFeedback(alert, true)}
                    >
                      <ThumbsUp aria-hidden="true" className="size-4" />
                    </FeedbackButton>
                    <FeedbackButton
                      active={alert.useful_feedback === false}
                      disabled={busy}
                      label="Not useful"
                      testId={`alert-not-useful-${alert.id}`}
                      onClick={() => submitFeedback(alert, false)}
                    >
                      <ThumbsDown aria-hidden="true" className="size-4" />
                    </FeedbackButton>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="rounded-md border border-outline-variant/40 bg-surface-dim/45 p-4 text-sm leading-6 text-on-surface-variant">
              You are clear. I will keep the inbox quiet unless something matters.
            </div>
          )}
          {dismissedAlerts.length > 0 ? (
            <details open className="rounded-md border border-outline-variant/40 bg-surface-dim/35 p-3">
              <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-on-surface">
                Dismissed ({dismissedAlerts.length})
              </summary>
              <div className="mt-3 space-y-2">
                {dismissedAlerts.map((alert) => {
                  const busy = pendingId === alert.id;
                  return (
                    <div key={alert.id} className="flex flex-wrap items-center gap-2 rounded-md border border-outline-variant/35 bg-surface-high/30 p-3">
                      <span className="min-w-0 flex-1 text-sm text-on-surface-variant">
                        {cleanAlertMessage(alert.message)}
                      </span>
                      <button
                        type="button"
                        onClick={() => restore(alert)}
                        disabled={busy}
                        className="inline-flex min-h-11 items-center justify-center rounded-md border border-violet/35 px-3 text-sm font-semibold text-violet transition hover:bg-violet/10 disabled:opacity-50"
                      >
                        Restore
                      </button>
                    </div>
                  );
                })}
              </div>
            </details>
          ) : null}
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative flex size-11 items-center justify-center rounded-md border border-outline-variant/45 bg-void/50 text-on-surface-variant transition hover:border-violet/50 hover:text-violet"
        aria-label={
          activeAlerts.length > 0
            ? `Open alerts, ${activeAlerts.length} unread`
            : "Open alerts"
        }
        data-testid="alert-inbox-open"
      >
        <Bell aria-hidden="true" className="size-5" />
        {activeAlerts.length > 0 ? (
          <span
            aria-hidden="true"
            className="alert-count-badge absolute -right-1 -top-1"
            data-alert-count={String(activeAlerts.length)}
          />
        ) : null}
      </button>
      {drawer && createPortal(drawer, document.body)}
    </>
  );
}

function FeedbackButton({
  active,
  disabled,
  label,
  testId,
  onClick,
  children,
}: {
  active: boolean;
  disabled: boolean;
  label: string;
  testId: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition disabled:opacity-50",
        active
          ? "border-violet/40 bg-violet/15 text-violet"
          : "border-outline-variant/40 text-outline hover:text-on-surface",
      )}
    >
      {children}
      {label}
    </button>
  );
}

function DrawerExplanationPoint({ label, body }: { label: string; body: string }) {
  return (
    <div className="rounded-md border border-outline-variant/35 bg-surface-dim/35 p-3 text-sm leading-6">
      <p className="font-semibold text-on-surface">{label}</p>
      <p className="mt-1 text-on-surface-variant">{body}</p>
    </div>
  );
}
