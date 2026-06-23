"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { cachedGetJson, invalidateCachedJson } from "@/lib/client-fetch-cache";
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
  const searchParams = useSearchParams();
  const [state, setState] = useState<ScanState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const mounted = useRef(true);
  const autoRunRef = useRef<string | null>(null);
  const actionQuery = searchParams.toString();

  useEffect(() => {
    mounted.current = true;
    // Shares the cached /api/scan read with the top-bar status line so the two
    // don't double-fetch the same endpoint on the Today page.
    cachedGetJson<{ runner_available?: boolean; running?: boolean }>("/api/scan")
      .then((body) => {
        if (!mounted.current || !body) return;
        setAvailable(body.runner_available ?? false);
        if (body.running) setState("running");
      })
      .catch(() => {});
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async (trigger = "today-button") => {
    setState("running");
    setMessage(null);
    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trigger }),
      });
      const body = (await response.json()) as { ok?: boolean; detail?: string };
      if (!mounted.current) return;
      if (body.ok) {
        setState("done");
        setMessage(body.detail ?? "Scan finished.");
        // A fresh scan changes the read age and alert feed — drop the cached
        // copies so the top-bar status and bell reflect it on the next render.
        invalidateCachedJson("/api/scan");
        invalidateCachedJson("/api/alerts");
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

  useEffect(() => {
    if (available === false || state === "running") return;
    const params = new URLSearchParams(actionQuery);
    if (params.get("action") !== "run-scan") return;
    if (autoRunRef.current === actionQuery) return;

    autoRunRef.current = actionQuery;
    params.delete("action");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash || "#run-scan"}`);
    void run("master-mold-command");
  }, [actionQuery, available, run, state]);

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
        onClick={() => run()}
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
