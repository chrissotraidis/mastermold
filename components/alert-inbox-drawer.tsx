"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell } from "lucide-react";
import { AlertInboxDrawerContent } from "@/components/alert-inbox-drawer-content";
import { cachedGetJson, peekCachedJson, setCachedJson } from "@/lib/client-fetch-cache";
import type { PublicAlert } from "@/lib/public-api-copy";

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
  const activeAlerts = useMemo(() => alerts.filter((alert) => !alert.acknowledged), [alerts]);
  const handleAlertsChange = useCallback((nextAlerts: PublicAlert[]) => {
    setAlerts(nextAlerts);
    setLoaded(true);
  }, []);

  useEffect(() => {
    function onOpenAlerts() {
      setOpen(true);
    }

    window.addEventListener(MASTER_MOLD_ACTIVITY_EVENT, onOpenAlerts);
    return () => window.removeEventListener(MASTER_MOLD_ACTIVITY_EVENT, onOpenAlerts);
  }, []);

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
        onClick={() => setOpen(true)}
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
          onClose={() => setOpen(false)}
          onAlertsChange={handleAlertsChange}
        />
      ) : null}
    </>
  );
}
