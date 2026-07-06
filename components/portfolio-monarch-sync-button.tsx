"use client";

import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

type SyncState = "idle" | "running" | "done" | "failed";

export function PortfolioMonarchSyncButton({ className }: { className?: string }) {
  const router = useRouter();
  const [state, setState] = useState<SyncState>("idle");
  const [message, setMessage] = useState("");

  async function syncNow() {
    setState("running");
    setMessage("");
    try {
      const response = await fetch("/api/portfolio-brain/monarch/sync", { method: "POST" });
      const result = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (!response.ok || !result?.ok) {
        throw new Error(result?.message || "Monarch sync failed.");
      }
      setState("done");
      setMessage(result.message || "Monarch snapshot synced.");
      router.refresh();
    } catch (caught) {
      setState("failed");
      setMessage(caught instanceof Error ? caught.message : "Monarch sync failed.");
    }
  }

  const running = state === "running";
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <button
        type="button"
        onClick={syncNow}
        disabled={running}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-violet/45 bg-violet/15 px-3 py-2 text-sm font-semibold text-violet transition hover:bg-violet/20 disabled:opacity-70"
      >
        {running ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <RefreshCw aria-hidden="true" className="size-4" />}
        {running ? "Syncing" : "Sync Monarch"}
      </button>
      {message ? (
        <p className={state === "failed" ? "text-xs leading-5 text-critical" : "text-xs leading-5 text-outline"}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
