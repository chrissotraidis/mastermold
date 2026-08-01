"use client";

import { useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { cleanAlertMessage } from "@/lib/alert-loop";
import { cn } from "@/lib/utils";
import type { PublicAlert } from "@/lib/public-api-copy";

const severityDot: Record<PublicAlert["severity"], string> = {
  Urgent: "bg-critical",
  "Worth checking": "bg-caution",
  FYI: "bg-outline",
};

export function TodayAlertList({ initialAlerts }: { initialAlerts: PublicAlert[] }) {
  const [alerts, setAlerts] = useState(initialAlerts);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function dismiss(alert: PublicAlert) {
    setAlerts((current) => current.filter((item) => item.id !== alert.id));
    setPendingId(alert.id);
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
      } catch {
        setAlerts((current) => (current.some((item) => item.id === alert.id) ? current : [alert, ...current]));
      } finally {
        setPendingId(null);
      }
    });
  }

  if (alerts.length === 0) {
    return <p className="p-3 text-sm text-on-surface-variant">No unreviewed activity.</p>;
  }

  return (
    <>
      {alerts.map((alert) => (
        <div key={alert.id} className="min-w-0">
          <div className="flex items-center">
            <details className="group min-w-0 flex-1">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-3 py-2 marker:hidden [&::-webkit-details-marker]:hidden">
                <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", severityDot[alert.severity])} />
                <span className="min-w-0 flex-1 truncate text-sm text-on-surface">{cleanAlertMessage(alert.message)}</span>
                {alert.asset_symbol && alert.asset_symbol !== "Unknown" ? (
                  <span className="shrink-0 text-xs text-outline">{alert.asset_symbol}</span>
                ) : null}
              </summary>
              <p className="px-3 pb-3 text-sm leading-6 text-on-surface-variant">{alert.rationale}</p>
            </details>
            <button
              type="button"
              onClick={() => dismiss(alert)}
              disabled={pendingId === alert.id}
              aria-label={`Dismiss: ${cleanAlertMessage(alert.message)}`}
              title="Dismiss"
              className="mr-1.5 inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-outline transition-colors hover:bg-surface-high/40 hover:text-on-surface disabled:opacity-50 sm:min-h-9 sm:min-w-9"
            >
              <CheckCircle2 aria-hidden="true" className="size-4" />
            </button>
          </div>
        </div>
      ))}
    </>
  );
}
