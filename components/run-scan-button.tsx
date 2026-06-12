"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

type ScanState = "idle" | "running" | "done" | "failed";

/**
 * Runs today's market scan via POST /api/scan and refreshes the page when the
 * fresh read lands. The scan reads market data and writes a JSON bundle — it
 * cannot trade. Failures surface inline instead of leaving stale advice silent.
 */
export function RunScanButton({
  variant = "primary",
  className,
  unavailableNote = false,
}: {
  variant?: "primary" | "ghost";
  className?: string;
  unavailableNote?: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<ScanState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    fetch("/api/scan")
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { runner_available?: boolean; running?: boolean } | null) => {
        if (!mounted.current || !body) return;
        setAvailable(body.runner_available ?? false);
        if (body.running) setState("running");
      })
      .catch(() => {});
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async () => {
    setState("running");
    setMessage(null);
    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trigger: "today-button" }),
      });
      const body = (await response.json()) as { ok?: boolean; detail?: string };
      if (!mounted.current) return;
      if (body.ok) {
        setState("done");
        setMessage(body.detail ?? "Scan finished.");
        router.refresh();
      } else {
        setState("failed");
        setMessage(body.detail ?? "Scan failed.");
      }
    } catch {
      if (!mounted.current) return;
      setState("failed");
      setMessage("Scan request failed. Check the server log.");
    }
  }, [router]);

  if (available === false) {
    if (!unavailableNote) return null;
    return (
      <p className={cn("text-xs text-outline", className)}>
        Scan engine not set up on this machine — see engine/README.md.
      </p>
    );
  }

  const running = state === "running";
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <button
        type="button"
        onClick={run}
        disabled={running}
        className={cn(
          "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition",
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
        {running ? "Scanning markets…" : "Run today's scan"}
      </button>
      {running ? (
        <p className="text-xs leading-5 text-outline">
          Checking prices, volume, and news for the watchlist. Usually 1–3 minutes.
        </p>
      ) : null}
      {message && state === "done" ? (
        <p className="text-xs leading-5 text-engine">{message}</p>
      ) : null}
      {message && state === "failed" ? (
        <p className="text-xs leading-5 text-caution">{message}</p>
      ) : null}
    </div>
  );
}
