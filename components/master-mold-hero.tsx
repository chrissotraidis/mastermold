"use client";

import { SentinelFace, stateLabel, type SystemState } from "@/components/sentinel-face";
import { useFaceActivity } from "@/components/face-activity";
import { openMasterMoldChat } from "@/components/master-mold-actions";
import { cn } from "@/lib/utils";

/**
 * The big, interactive Master Mold: follows the cursor, reacts on hover,
 * talks while chat streams. Clicking opens the assistant.
 */
export function MasterMoldHero({ state = "idle", className, caption }: { state?: SystemState; className?: string; caption?: string }) {
  const { speaking } = useFaceActivity();
  return (
    <button
      type="button"
      onClick={() => openMasterMoldChat()}
      aria-label={`Ask Master Mold (${stateLabel(state)})`}
      className={cn("group relative flex flex-col items-center gap-2 rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet", className)}
    >
      <span className="relative block aspect-square w-full">
        <span aria-hidden="true" className="absolute inset-[12%] rounded-full bg-violet/25 blur-3xl transition group-hover:bg-violet/40" />
        <SentinelFace state={state} speaking={speaking} detail="hero" />
      </span>
      {caption ? (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant/60 bg-surface-low/70 px-3 py-1 text-[11px] font-semibold text-on-surface-variant">
          <span className="size-1.5 rounded-full bg-violet shadow-glow" aria-hidden="true" />
          {caption}
        </span>
      ) : null}
    </button>
  );
}
