"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function TodayMemoryRefresh({ compact = false }: { compact?: boolean }) {
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

  // A quiet utility line, not a page-wide bar: memory upkeep is a background
  // concern, so it renders as small right-aligned text.
  return (
    <div className={cn("flex flex-wrap items-center justify-end gap-2", compact ? "mt-1" : "mt-3")}>
      {message ? (
        <p className="text-xs leading-5 text-outline" aria-live="polite">
          {message}
        </p>
      ) : null}
      <Button
        type="button"
        onClick={refreshMemory}
        disabled={isPending}
        variant="ghost"
        size="sm"
        className="min-h-11 gap-1.5 px-2 text-xs text-outline hover:text-on-surface sm:min-h-8"
      >
        {isPending ? <Loader2 aria-hidden="true" className="size-3.5 animate-spin" /> : <RefreshCw aria-hidden="true" className="size-3.5" />}
        Update chat memory
      </Button>
    </div>
  );
}
