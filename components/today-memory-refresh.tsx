"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function TodayMemoryRefresh() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const autoRefreshRef = useRef<string | null>(null);
  const actionQuery = searchParams.toString();

  const refreshMemory = useCallback(() => {
    setMessage("Updating…");
    startTransition(async () => {
      try {
        const response = await fetch("/api/brain/initialize", { method: "POST" });
        const body = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(body.error ?? "Could not update chat memory.");
        }
        setMessage("Done. Chat now remembers this view.");
        router.refresh();
      } catch (caught) {
        setMessage(caught instanceof Error ? caught.message : "Could not update chat memory.");
      }
    });
  }, [router]);

  useEffect(() => {
    const params = new URLSearchParams(actionQuery);
    if (params.get("action") !== "save-context") return;
    if (autoRefreshRef.current === actionQuery) return;

    autoRefreshRef.current = actionQuery;
    params.delete("action");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash || "#today-inputs"}`);
    refreshMemory();
  }, [actionQuery, refreshMemory]);

  return (
    <div className="mt-4 border-t border-outline-variant/35 pt-3">
      <Button
        type="button"
        onClick={refreshMemory}
        disabled={isPending}
        variant="outline"
        className="min-h-11 w-full border-outline-variant/45 bg-surface-dim/45 text-on-surface hover:bg-violet/10 hover:text-on-surface"
      >
        {isPending ? <Loader2 aria-hidden="true" className="animate-spin" /> : <RefreshCw aria-hidden="true" />}
        Update chat memory
      </Button>
      {message ? (
        <p className="mt-2 text-xs leading-5 text-outline" aria-live="polite">
          {message}
        </p>
      ) : null}
    </div>
  );
}
