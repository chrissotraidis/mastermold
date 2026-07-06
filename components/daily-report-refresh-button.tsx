"use client";

import { useCallback, useState } from "react";
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

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <button
        type="button"
        onClick={refresh}
        disabled={running}
        className={cn(
          "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-semibold transition sm:min-h-8",
          variant === "primary"
            ? "bg-violet text-void hover:bg-violet/90 disabled:opacity-80"
            : "border border-outline-variant/50 bg-surface-high/40 text-on-surface hover:bg-surface-high/70 disabled:opacity-70",
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
