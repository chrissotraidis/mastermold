"use client";

import { cn } from "@/lib/utils";

/**
 * The face of Master Mold — a rendered, armored sentinel head (public/master-mold.png).
 * Keep this static until the whole head can be animated as one coherent asset.
 */
export type SystemState =
  | "idle"
  | "thinking"
  | "suggestion"
  | "caution"
  | "alert"
  | "degraded"
  | "kill";

const STATE: Record<SystemState, { label: string; filter: string }> = {
  idle: { label: "Watching", filter: "none" },
  thinking: { label: "Processing", filter: "none" },
  suggestion: { label: "Signal found", filter: "none" },
  caution: { label: "Caution", filter: "none" },
  alert: { label: "Critical", filter: "none" },
  degraded: { label: "Degraded sight", filter: "grayscale(0.7)" },
  kill: { label: "Halted", filter: "grayscale(0.9) brightness(0.7)" },
};

export function stateLabel(state: SystemState): string {
  return STATE[state].label;
}

export function SentinelFace({
  state = "idle",
  className,
  speaking = false,
}: {
  state?: SystemState;
  className?: string;
  reduceMotion?: boolean;
  /** Flicker his mouth like he's talking (e.g. while streaming a reply). */
  speaking?: boolean;
  /** Eyes follow the cursor. */
  track?: boolean;
}) {
  const st = STATE[state];

  return (
    <div
      className={cn("relative isolate h-full w-full", className)}
      role="img"
      aria-label={`Master Mold — ${st.label}${speaking ? ", speaking" : ""}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/master-mold.png?v=eyeless"
        alt=""
        draggable={false}
        className="h-full w-full select-none object-contain"
        style={{
          filter: st.filter,
          maskImage: "radial-gradient(ellipse 64% 72% at 50% 47%, #000 58%, transparent 84%)",
          WebkitMaskImage: "radial-gradient(ellipse 64% 72% at 50% 47%, #000 58%, transparent 84%)",
        }}
      />
    </div>
  );
}
