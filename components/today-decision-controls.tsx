"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { DailyReportPlay } from "@/src/db/daily-report";
import type { TodayDecisionResponse, TodayDecisionResponseKind } from "@/src/db/today-decisions";

export function TodayDecisionControls({
  reportId,
  play,
  canSaveCall,
  initialResponse,
}: {
  reportId: string;
  play: DailyReportPlay;
  canSaveCall: boolean;
  initialResponse: TodayDecisionResponse | null;
}) {
  const [response, setResponse] = useState(initialResponse);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const savedCallLocked = response?.response === "save";

  function record(next: TodayDecisionResponseKind) {
    setError("");
    startTransition(async () => {
      try {
        const result = await fetch("/api/today/decisions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ report_id: reportId, play_id: play.id, response: next }),
        });
        const body = await result.json() as TodayDecisionResponse & { error?: string };
        if (!result.ok) throw new Error(body.error || "Could not record the response.");
        setResponse(body);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not record the response.");
      }
    });
  }

  return (
    <div className="mt-3 border-t border-outline-variant/20 pt-3">
      <p className="text-xs font-semibold text-on-surface">Your response</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <ResponseButton label="Save call" active={response?.response === "save"} disabled={!canSaveCall || isPending || savedCallLocked} onClick={() => record("save")} />
        <ResponseButton label="Watch" active={response?.response === "watch"} disabled={isPending || savedCallLocked} onClick={() => record("watch")} />
        <ResponseButton label="Pass" active={response?.response === "pass"} disabled={isPending || savedCallLocked} onClick={() => record("pass")} />
      </div>
      <p className="mt-2 text-xs leading-5 text-outline" aria-live="polite">
        {error
          ? error
          : response?.response === "save"
            ? <>Saved before the outcome. <Link href="/journal" className="font-semibold text-violet hover:text-tertiary">Open Journal</Link></>
            : response?.response === "watch"
              ? "Watch recorded. You can change it to Pass or Save call while this report is current."
              : response?.response === "pass"
                ? "Pass recorded. You can change it while this report is current; an unchanged passed idea stays out of the next inbox."
                : !canSaveCall
                  ? "Watch or pass is available now. Add a fresh personal portfolio before saving a scored call."
                  : "Save a call before acting elsewhere, or record watch/pass so the inbox has an outcome."}
      </p>
    </div>
  );
}

function ResponseButton({ label, active, disabled, onClick }: { label: string; active: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || active}
      className={`min-h-11 rounded-md border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${active ? "border-violet/60 bg-violet/15 text-violet" : "border-outline-variant/40 bg-surface-dim/45 text-on-surface-variant hover:border-violet/45 hover:text-on-surface"}`}
    >
      {active ? `${label} recorded` : label}
    </button>
  );
}
