"use client";

import { useState, useTransition } from "react";
import { BookOpenCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SaveBriefingCallButton({
  headline,
  reason,
  confidence,
  horizon,
  source,
  sourceNotes = [],
}: {
  headline: string;
  reason: string;
  confidence: number;
  horizon: string;
  source: string;
  sourceNotes?: string[];
}) {
  const [state, setState] = useState<"idle" | "saved" | "error">("idle");
  const [isPending, startTransition] = useTransition();

  function saveCall() {
    setState("idle");
    startTransition(async () => {
      try {
        const response = await fetch("/api/journal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            call: headline,
            signals: [reason, plainSourceLabel(source), ...sourceNotes.slice(0, 3)],
            confidence: Math.max(1, Math.min(10, Math.round(confidence))),
            horizon,
            falsification_condition:
              "The call is wrong if the next saved read removes this reason to watch or the bear case becomes stronger than the reason to watch.",
          }),
        });
        if (!response.ok) throw new Error("Could not save this call.");
        setState("saved");
      } catch {
        setState("error");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Button
        type="button"
        onClick={saveCall}
        disabled={isPending || state === "saved"}
        variant="outline"
        title="Adds this idea to the Decision journal before the result is known."
        className="min-h-11 w-full border-outline-variant/50 bg-surface-dim/45 px-4 text-on-surface transition-colors hover:border-violet/50 hover:bg-violet/10 hover:text-on-surface sm:w-auto"
      >
        {isPending ? <Loader2 aria-hidden="true" className="animate-spin" /> : <BookOpenCheck aria-hidden="true" />}
        {state === "saved" ? "Saved to journal" : isPending ? "Saving call" : "Save call"}
      </Button>
      <p className="text-xs leading-5 text-outline" aria-live="polite">
        {state === "saved"
          ? "Saved before the outcome, so Performance can score it later."
          : state === "error"
            ? "The call was not saved. Try again from the idea detail or Journal."
            : ""}
      </p>
    </div>
  );
}

function plainSourceLabel(source: string) {
  if (source === "Engine output") return "Saved market read";
  if (source === "Demo data") return "Sample data";
  return source;
}
