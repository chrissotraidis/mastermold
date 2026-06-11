"use client";

import { useEffect, useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { recordProductEvent } from "@/lib/product-metrics";
import { cn } from "@/lib/utils";

export function TodayReadTimer() {
  useEffect(() => {
    const startedAt = Date.now();
    let recorded = false;

    function record() {
      if (recorded) return;
      recorded = true;
      const seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
      recordProductEvent({
        event: "today_read_time",
        surface: "today",
        value: Math.min(seconds, 600),
      });
    }

    const timeout = window.setTimeout(record, 45_000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") record();
    };
    window.addEventListener("pagehide", record);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearTimeout(timeout);
      record();
      window.removeEventListener("pagehide", record);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return null;
}

export function BriefingUsefulnessFeedback() {
  const [choice, setChoice] = useState<"useful" | "not_useful" | null>(null);

  function submit(nextChoice: "useful" | "not_useful") {
    setChoice(nextChoice);
    recordProductEvent({
      event: "briefing_feedback",
      surface: "today",
      metadata: { useful: nextChoice === "useful" },
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-outline-variant/35 bg-surface-dim/35 px-3 py-2">
      <span className="mr-1 text-xs font-medium text-outline">Rate today</span>
      <FeedbackButton
        label="Useful"
        active={choice === "useful"}
        onClick={() => submit("useful")}
        icon="up"
      />
      <FeedbackButton
        label="Not useful"
        active={choice === "not_useful"}
        onClick={() => submit("not_useful")}
        icon="down"
      />
      {choice ? (
        <span aria-live="polite" className="text-xs text-engine">
          Saved for Performance.
        </span>
      ) : null}
    </div>
  );
}

function FeedbackButton({
  label,
  active,
  onClick,
  icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: "up" | "down";
}) {
  const Icon = icon === "up" ? ThumbsUp : ThumbsDown;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={`Mark today ${label.toLowerCase()}`}
      title={label}
      className={cn(
        "inline-flex size-11 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet",
        active
          ? "border-violet/50 bg-violet text-void"
          : "border-outline-variant/45 bg-surface-high/30 text-on-surface-variant hover:border-violet/45 hover:text-violet",
      )}
    >
      <Icon aria-hidden="true" className="size-4" />
    </button>
  );
}
