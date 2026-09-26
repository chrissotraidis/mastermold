"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

type RefreshState = "idle" | "running" | "done" | "failed";

export function DailyReportRefreshButton({
  className,
  variant = "primary",
}: {
  className?: string;
  variant?: "primary" | "ghost";
}) {
  const router = useRouter();
  const [state, setState] = useState<RefreshState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const running = state === "running";

  const refresh = useCallback(async () => {
    setState("running");
    setMessage("Reading portfolio and market data…");
    try {
      const response = await fetch("/api/daily-report", { method: "POST" });
      const body = (await response.json()) as { ok?: boolean; detail?: string };
      if (body.ok) {
        setState("done");
        setMessage(body.detail ?? "Daily report saved.");
        router.refresh();
      } else {
        setState("failed");
        setMessage(body.detail ?? "Report not updated; last good report remains.");
      }
    } catch {
      setState("failed");
      setMessage("Report not updated; last good report remains.");
    }
  }, [router]);

  // Command routes ("Run scan", palette "Refresh today's read") land here as
  // /?action=run-scan. Run once, then drop the param so reloads stay quiet.
  const handledAction = useRef(false);
  useEffect(() => {
    if (handledAction.current) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("action") !== "run-scan") return;
    handledAction.current = true;
    url.searchParams.delete("action");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    void refresh();
  }, [refresh]);

  return (
    <div id="run-scan" className={cn("flex scroll-mt-24 flex-col gap-1.5", className)}>
      <button
        type="button"
        onClick={refresh}
        disabled={running}
        className={cn(
          "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-semibold transition sm:min-h-9",
          variant === "primary"
            ? "bg-violet text-void hover:bg-violet/90 disabled:opacity-80"
            : "border border-outline-variant/70 bg-surface-low/60 text-on-surface hover:border-violet/45 hover:bg-surface-high/60 disabled:opacity-70",
        )}
      >
        {running ? (
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        ) : (
          <RefreshCw aria-hidden="true" className="size-4" />
        )}
        {running ? "Refreshing today…" : "Refresh today"}
      </button>
      {message ? (
        <p
          className={cn(
            "text-xs leading-5",
            state === "done" ? "text-engine" : state === "failed" ? "text-caution" : "text-outline",
          )}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
