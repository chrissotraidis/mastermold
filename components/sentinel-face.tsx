"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The face of Master Mold — a procedural, animated 3D sentinel head
 * (components/master-mold-head-3d.tsx, three.js via @react-three/fiber).
 *
 * The 3D module is lazy-loaded with next/dynamic (ssr: false) so three.js
 * stays out of the initial bundle. While it loads (or without WebGL) a
 * minimal CSS placeholder renders — a dark crimson silhouette with two
 * glowing red eyes — so the swap to 3D is a subtle fade, never a clashing
 * image flash while keeping the public app asset lightweight.
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

/** Loading / no-WebGL placeholder: a quiet CSS-only sentinel silhouette
 * (crimson dome, gold crest hint, two glowing red eyes) that the 3D head
 * fades in over — visually continuous with the real thing, no PNG. */
function StaticFace() {
  return (
    <div aria-hidden="true" className="relative h-full w-full">
      {/* Helmet silhouette */}
      <div
        className="absolute left-1/2 top-1/2 h-[72%] w-[62%] -translate-x-1/2 -translate-y-1/2"
        style={{
          background: "linear-gradient(180deg, #7c2544 0%, #591b31 55%, #3a1220 100%)",
          borderRadius: "46% 46% 40% 40% / 58% 58% 34% 34%",
        }}
      />
      {/* Gold crest hint */}
      <div
        className="absolute left-1/2 top-[12%] h-[14%] w-[10%] -translate-x-1/2"
        style={{ background: "#c9a13b", borderRadius: "40% 40% 20% 20%" }}
      />
      {/* Eyes */}
      <div
        className="absolute left-[36%] top-[44%] h-[7%] w-[11%]"
        style={{ background: "#ff2d2d", borderRadius: "9999px", boxShadow: "0 0 6px 1px rgba(255,45,45,0.8)" }}
      />
      <div
        className="absolute right-[36%] top-[44%] h-[7%] w-[11%]"
        style={{ background: "#ff2d2d", borderRadius: "9999px", boxShadow: "0 0 6px 1px rgba(255,45,45,0.8)" }}
      />
    </div>
  );
}

// No `loading` component: the static face renders as a PERSISTENT UNDERLAY
// below the canvas (see SentinelFace), so the 3D head fades in over it instead
// of hard-swapping — kills the fallback "flash" on every refresh.
const MasterMoldHead3D = dynamic(() => import("@/components/master-mold-head-3d"), {
  ssr: false,
});

export function SentinelFace({
  state = "idle",
  className,
  speaking = false,
  hovered = false,
}: {
  state?: SystemState;
  className?: string;
  reduceMotion?: boolean;
  /** Flicker his vocal grille like he's talking (e.g. while streaming a reply). */
  speaking?: boolean;
  /** Eyes follow the cursor. */
  track?: boolean;
  /** Hover reaction (eyes flare + head perks up). Merged with the wrapper's own pointer hover. */
  hovered?: boolean;
}) {
  const st = STATE[state];
  // The face reacts to being hovered directly; parents with a larger hit area
  // (e.g. the chat launcher button) can also force it via the `hovered` prop.
  const [selfHover, setSelfHover] = useState(false);

  return (
    <div
      className={cn("relative isolate h-full w-full", className)}
      style={{ width: "100%", height: "100%", filter: st.filter }}
      role="img"
      aria-label={`Master Mold — ${st.label}${speaking ? ", speaking" : ""}`}
      onPointerEnter={() => setSelfHover(true)}
      onPointerLeave={() => setSelfHover(false)}
    >
      {/* Placeholder underlay: fades OUT once a canvas exists in this face
          (parent :has selector), so nothing ever peeks around the 3D head. */}
      <div
        aria-hidden="true"
        className="mm-ph absolute inset-0 transition-opacity duration-500"
      >
        <StaticFace />
      </div>
      <div className="absolute inset-0 opacity-0 transition-opacity duration-500 [&:has(canvas)]:opacity-100">
        <MasterMoldHead3D state={state} speaking={speaking} hovered={hovered || selfHover} fallback={null} />
      </div>
    </div>
  );
}
