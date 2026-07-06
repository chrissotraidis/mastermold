"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  BookPlus,
  CheckCircle2,
  MessageSquareText,
  ThumbsDown,
  ThumbsUp,
  Wallet,
  X,
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
import { cachedGetJson, peekCachedJson, setCachedJson } from "@/lib/client-fetch-cache";
import { cn } from "@/lib/utils";
import type { PublicAlert, PublicJournal } from "@/lib/public-api-copy";

type SavedJournalEntry = PublicJournal["entries"][number];

const severityDot: Record<PublicAlert["severity"], string> = {
  Urgent: "bg-critical",
  "Worth checking": "bg-caution",
  FYI: "bg-outline",
};

export const MASTER_MOLD_ACTIVITY_EVENT = "mastermold:open-activity";

export function openMasterMoldActivity() {
  window.dispatchEvent(new CustomEvent(MASTER_MOLD_ACTIVITY_EVENT));
}

export const openMasterMoldAlerts = openMasterMoldActivity;

export function AlertInboxDrawer() {
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<PublicAlert[]>(
    () => peekCachedJson<PublicAlert[]>("/api/alerts") ?? [],
  );
  const [loaded, setLoaded] = useState(() => peekCachedJson<PublicAlert[]>("/api/alerts") !== undefined);
  // Standard dialog dismissal: remember what had focus when the drawer opened
  // so closing (backdrop tap, Escape, or the close button) returns the user to
  // the page instead of dropping focus on <body>.
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const activeAlerts = useMemo(() => alerts.filter((alert) => !alert.acknowledged), [alerts]);
  const handleAlertsChange = useCallback((nextAlerts: PublicAlert[]) => {
    setAlerts(nextAlerts);
    setLoaded(true);
  }, []);

  const openDrawer = useCallback(() => {
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setOpen(false);
    const target = restoreFocusRef.current;
    restoreFocusRef.current = null;
    if (target && target.isConnected) target.focus();
  }, []);

  useEffect(() => {
    function onOpenAlerts() {
      openDrawer();
    }

    window.addEventListener(MASTER_MOLD_ACTIVITY_EVENT, onOpenAlerts);
    return () => window.removeEventListener(MASTER_MOLD_ACTIVITY_EVENT, onOpenAlerts);
  }, [openDrawer]);

  useEffect(() => {
    let cancelled = false;
    async function loadBadgeCount() {
      try {
        const nextAlerts = await cachedGetJson<PublicAlert[]>("/api/alerts");
        if (!cancelled) {
          setAlerts(nextAlerts);
          setLoaded(true);
        }
      } catch {
        if (!cancelled) setLoaded(true);
      }
    }

    if (!loaded) void loadBadgeCount();
    return () => {
      cancelled = true;
    };
  }, [loaded]);

  useEffect(() => {
    if (loaded) setCachedJson("/api/alerts", alerts);
  }, [alerts, loaded]);

  return (
    <>
      <button
        type="button"
        onClick={openDrawer}
        className="relative flex size-11 items-center justify-center rounded-md border border-outline-variant/45 bg-void/50 text-on-surface-variant transition hover:border-violet/50 hover:text-violet"
        aria-label={
          activeAlerts.length > 0
            ? `Open activity, ${activeAlerts.length} unread`
            : "Open activity"
        }
        data-testid="alert-inbox-open"
      >
        <Bell aria-hidden="true" className="size-5" />
        {activeAlerts.length > 0 ? (
          <span
            aria-hidden="true"
            className="alert-count-badge absolute right-0 top-0"
            data-alert-count={String(activeAlerts.length)}
          />
        ) : null}
      </button>
      {open ? (
        <AlertInboxDrawerContent
          onClose={closeDrawer}
          onAlertsChange={handleAlertsChange}
        />
      ) : null}
    </>
  );
}

function AlertInboxDrawerContent({
  onClose,
  onAlertsChange,
}: {
  onClose: () => void;
  onAlertsChange?: (alerts: PublicAlert[]) => void;
}) {
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
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Standard dialog dismissal semantics: Escape closes from anywhere, and
  // focus starts on the close button so keyboard users land inside the dialog.
  useEffect(() => {
    closeButtonRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

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
          setMessage("Couldn't load activity.");
          setLoaded(true);
        }
      }
    }

    void loadAlerts();
    return () => {
      cancelled = true;
    };
  }, []);

  // Mirror confirmed/optimistic alert state into the shared cache so the next
  // navigation paints the correct unread badge instantly instead of a stale one.
  useEffect(() => {
    if (loaded) {
      setCachedJson("/api/alerts", alerts);
      onAlertsChange?.(alerts);
    }
  }, [alerts, loaded, onAlertsChange]);

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
    setMessage("Restored to active activity.");
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
        setMessage("Couldn't save the decision. Try again from the activity page.");
      } finally {
        setPendingId(null);
      }
    });
  }

  function askAboutAlert(alert: PublicAlert) {
    onClose();
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

  const drawer = (
    <div
      className="fixed inset-0 z-[96] flex items-end bg-void/65 backdrop-blur-sm md:items-start md:justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="alert-inbox-title"
      data-testid="alert-inbox-drawer"
      onClick={(event) => {
        // Tapping the backdrop (outside the panel) dismisses, like any dialog.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[92vh] w-full flex-col rounded-t-xl border border-outline-variant/50 bg-surface-low p-3 shadow-2xl md:mr-5 md:mt-20 md:max-h-[82vh] md:w-[31rem] md:rounded-lg md:p-5">
        <div className="mb-3 flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-caution/35 bg-caution/10 text-caution">
            <AlertTriangle aria-hidden="true" className="size-5" />
          </div>
          <div className="min-w-0">
            <h2 id="alert-inbox-title" className="text-lg font-semibold text-on-surface">Activity</h2>
            <p className="text-sm leading-5 text-outline">
              {!loaded
                ? "Checking the latest activity..."
                : activeAlerts.length > 0
                ? `${activeAlerts.length} item${activeAlerts.length === 1 ? "" : "s"} moved enough to check.`
                : "Nothing needs attention right now."}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="ml-auto flex size-11 items-center justify-center rounded-md border border-outline-variant/40 text-outline transition hover:text-on-surface"
            aria-label="Close activity"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>

        <p className="sr-only" aria-live="polite">{isPending ? "Saving activity update." : message}</p>
        {message ? (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-outline-variant/35 bg-surface-dim/35 px-3 py-2 text-sm text-outline">
            <span>{message}</span>
            {savedJournalId ? (
              <Link
                href={`/journal?entry=${encodeURIComponent(savedJournalId)}#${encodeURIComponent(savedJournalId)}`}
                onClick={onClose}
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

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-4 pr-1">
          {!loaded ? (
            <div className="rounded-md border border-outline-variant/25 p-3 text-sm text-outline">
              Loading activity...
            </div>
          ) : activeAlerts.length > 0 ? (
            <div className="divide-y divide-outline-variant/20 rounded-md border border-outline-variant/25">
              {activeAlerts.map((alert) => {
                const busy = pendingId === alert.id;
                return (
                  <details key={alert.id} className="group min-w-0" data-testid="alert-drawer-card">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-3 py-2 transition hover:bg-surface-high/25 [&::-webkit-details-marker]:hidden">
                      <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", severityDot[alert.severity])} />
                      <span className="sr-only">{alert.severity}:</span>
                      <span className="min-w-0 flex-1 truncate text-sm text-on-surface">{cleanAlertMessage(alert.message)}</span>
                      {alert.asset_symbol && alert.asset_symbol !== "Unknown" ? (
                        <span className="shrink-0 text-xs text-outline">{alert.asset_symbol}</span>
                      ) : null}
                      <span aria-hidden="true" className="shrink-0 text-xs text-outline transition-transform group-open:rotate-90">›</span>
                    </summary>
                    <div className="px-3 pb-3">
                      <p className="text-sm leading-6 text-on-surface">{buildAlertSuggestedResponse(alert)}</p>
                      <p className="mt-1 text-sm leading-6 text-on-surface-variant">{explainAlertRelevance(alert)}</p>
                      <p className="mt-1 text-xs leading-5 text-outline">{cleanAlertRationale(alert.rationale)}</p>
                      <p className="mt-1 text-xs leading-5 text-outline">Ignore when: {buildAlertIgnoreCondition(alert)}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5" data-testid="alert-drawer-actions">
                        <button
                          type="button"
                          onClick={() => askAboutAlert(alert)}
                          aria-label="Ask Master Mold"
                          title="Ask Master Mold"
                          className={cn(drawerActionClass, "border-violet/35 text-violet hover:bg-violet/10")}
                          data-testid={`alert-ask-${alert.id}`}
                        >
                          <MessageSquareText aria-hidden="true" className="size-3.5" />
                          Ask
                        </button>
                        <button
                          type="button"
                          onClick={() => saveAsDecision(alert)}
                          disabled={busy}
                          aria-label="Save as decision"
                          title="Save this as a call in your journal"
                          className={cn(drawerActionClass, "border-engine/35 text-engine hover:bg-engine/10")}
                          data-testid={`alert-save-${alert.id}`}
                        >
                          <BookPlus aria-hidden="true" className="size-3.5" />
                          To journal
                        </button>
                        <Link
                          href={buildAlertPaperHref(alert)}
                          onClick={onClose}
                          aria-label="Paper trade"
                          title="Try this idea with simulator dollars"
                          className={cn(drawerActionClass, "border-caution/35 text-caution hover:bg-caution/10")}
                        >
                          <Wallet aria-hidden="true" className="size-3.5" />
                          Test trade
                        </Link>
                        <button
                          type="button"
                          onClick={() => dismiss(alert)}
                          disabled={busy}
                          aria-label="Dismiss activity"
                          title="Dismiss activity"
                          className={cn(drawerActionClass, "border-outline-variant/40 text-on-surface-variant hover:text-on-surface")}
                        >
                          <CheckCircle2 aria-hidden="true" className="size-3.5" />
                          Dismiss
                        </button>
                        <button
                          type="button"
                          onClick={() => submitFeedback(alert, true)}
                          disabled={busy}
                          aria-label="Useful"
                          title="Useful"
                          aria-pressed={alert.useful_feedback === true}
                          data-testid={`alert-useful-${alert.id}`}
                          className={cn(
                            drawerThumbClass,
                            alert.useful_feedback === true
                              ? "border-engine/40 bg-engine/15 text-engine"
                              : "border-outline-variant/40 text-outline hover:text-on-surface",
                          )}
                        >
                          <ThumbsUp aria-hidden="true" className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => submitFeedback(alert, false)}
                          disabled={busy}
                          aria-label="Not useful"
                          title="Not useful"
                          aria-pressed={alert.useful_feedback === false}
                          data-testid={`alert-not-useful-${alert.id}`}
                          className={cn(
                            drawerThumbClass,
                            alert.useful_feedback === false
                              ? "border-critical/40 bg-critical/15 text-critical"
                              : "border-outline-variant/40 text-outline hover:text-on-surface",
                          )}
                        >
                          <ThumbsDown aria-hidden="true" className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>
          ) : (
            <div className="rounded-md border border-outline-variant/25 p-3 text-sm leading-6 text-on-surface-variant">
              You are clear. I will keep the inbox quiet unless something matters.
            </div>
          )}
          {dismissedAlerts.length > 0 ? (
            <details className="rounded-md border border-outline-variant/25">
              <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-semibold text-on-surface [&::-webkit-details-marker]:hidden">
                Dismissed ({dismissedAlerts.length})
              </summary>
              <div className="divide-y divide-outline-variant/20 border-t border-outline-variant/20">
                {dismissedAlerts.map((alert) => {
                  const busy = pendingId === alert.id;
                  return (
                    <div key={alert.id} className="flex min-h-11 items-center gap-3 px-3 py-1.5">
                      <span className="min-w-0 flex-1 truncate text-sm text-on-surface-variant">
                        {cleanAlertMessage(alert.message)}
                      </span>
                      <button
                        type="button"
                        onClick={() => restore(alert)}
                        disabled={busy}
                        className="inline-flex min-h-11 items-center justify-center rounded-md border border-violet/35 px-2.5 text-xs font-semibold text-violet transition hover:bg-violet/10 disabled:opacity-50 sm:min-h-8"
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
  );

  return createPortal(drawer, document.body);
}

const drawerActionClass =
  "inline-flex min-h-11 items-center justify-center gap-1 rounded-md border px-2.5 text-xs font-medium transition-colors disabled:opacity-50 sm:min-h-8";

const drawerThumbClass =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border transition-colors disabled:opacity-50 sm:min-h-8 sm:min-w-8";
