"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
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
  const [open, setOpen] = useState(false);
  const searchParams = useSearchParams();
  const autoFeedbackRef = useRef<string | null>(null);
  const actionQuery = searchParams.toString();

  function submit(nextChoice: "useful" | "not_useful") {
    setOpen(true);
    setChoice(nextChoice);
    recordProductEvent({
      event: "briefing_feedback",
      surface: "today",
      metadata: { useful: nextChoice === "useful" },
    });
  }

  useEffect(() => {
    const params = new URLSearchParams(actionQuery);
    const action = params.get("action");
    const nextChoice =
      action === "mark-today-useful"
        ? "useful"
        : action === "mark-today-not-useful"
          ? "not_useful"
          : null;

    if (!nextChoice) return;
    if (autoFeedbackRef.current === actionQuery) return;

    autoFeedbackRef.current = actionQuery;
    params.delete("action");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash || "#today-feedback"}`);
    submit(nextChoice);
  }, [actionQuery]);

  return (
    <details
      id="today-feedback"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="group rounded-md border border-outline-variant/40 bg-surface-dim/45"
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center px-3 py-2 text-xs font-semibold text-on-surface-variant marker:hidden hover:text-on-surface">
        Rate this read
      </summary>
      {open ? (
        <div className="flex items-center gap-1.5 border-t border-outline-variant/35 px-2 pb-2 pt-2">
          <span className="sr-only">Rate today</span>
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
              Saved for later review.
            </span>
          ) : null}
        </div>
      ) : null}
    </details>
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
      title={`Mark today ${label.toLowerCase()}`}
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
