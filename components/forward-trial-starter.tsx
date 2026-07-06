"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type ForwardTrialStarterProps = {
  status: "Not started" | "Running locally";
};

export function ForwardTrialStarter({ status }: ForwardTrialStarterProps) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "starting" | "started" | "error">("idle");

  if (status === "Running locally") {
    return (
      <p className="text-sm leading-6 text-on-surface-variant">
        Measuring from the saved start point. Keep logging calls and resolve them later before trusting the result.
      </p>
    );
  }

  async function startTrial() {
    setState("starting");
    try {
      const response = await fetch("/api/evaluation/forward-proof", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trigger: "performance-page",
          min_logged_calls: 30,
          min_resolved_calls: 10,
        }),
      });
      if (!response.ok) throw new Error("Measurement did not start");
      setState("started");
      router.refresh();
    } catch {
      setState("error");
    }
  }

  return (
    <div className="flex flex-col gap-2 sm:items-start">
      <Button
        type="button"
        onClick={startTrial}
        disabled={state === "starting" || state === "started"}
        className="min-h-11 w-full sm:w-auto"
      >
        <RefreshCw aria-hidden="true" className={state === "starting" ? "animate-spin" : ""} />
        {state === "starting" ? "Starting measurement" : "Start measuring from today"}
      </Button>
      <p className="text-sm leading-6 text-on-surface-variant">
        {state === "error"
          ? "Measurement did not start. Try again after the local app settles."
          : "This saves the baseline and measures future saved calls only. It does not score old sample calls, make a performance claim, or move money."}
      </p>
    </div>
  );
}
