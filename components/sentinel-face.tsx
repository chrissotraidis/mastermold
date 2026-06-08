"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * The face of Master Mold — a rendered, armored sentinel head (public/master-mold.png)
 * with state-driven light painted over it: his eyes glow and pulse in the system's color,
 * track your cursor, blink, and his mouth flickers when he speaks. Offline-safe (local
 * asset), reduced-motion aware via prop.
 */
export type SystemState =
  | "idle"
  | "thinking"
  | "suggestion"
  | "caution"
  | "alert"
  | "degraded"
  | "kill";

const STATE: Record<SystemState, { glow: string; intensity: number; label: string; live: string; filter: string }> = {
  idle: { glow: "#d0bcff", intensity: 1, label: "Watching", live: "mm-eye-live 5s ease-in-out infinite", filter: "none" },
  thinking: { glow: "#e9d5ff", intensity: 1.15, label: "Processing", live: "mm-eye-live 2.4s ease-in-out infinite", filter: "none" },
  suggestion: { glow: "#34d399", intensity: 1.15, label: "Signal found", live: "mm-eye-live 3.4s ease-in-out infinite", filter: "none" },
  caution: { glow: "#fbbf24", intensity: 1.1, label: "Caution", live: "mm-eye-live 3.6s ease-in-out infinite", filter: "none" },
  alert: { glow: "#fb7185", intensity: 1.4, label: "Critical", live: "mm-eye-live 1.5s ease-in-out infinite", filter: "none" },
  degraded: { glow: "#9aa0b3", intensity: 0.55, label: "Degraded sight", live: "mm-eye-live 4s ease-in-out infinite", filter: "grayscale(0.7)" },
  kill: { glow: "#fb7185", intensity: 0.3, label: "Halted", live: "none", filter: "grayscale(0.9) brightness(0.7)" },
};

// Eye + mouth anchor points, as a fraction of the head image (512×512 render).
const LEFT_EYE = { x: 36.5, y: 38.5 };
const RIGHT_EYE = { x: 63.5, y: 38.5 };
const MOUTH = { x: 50, y: 63 };

export function stateLabel(state: SystemState): string {
  return STATE[state].label;
}

export function SentinelFace({
  state = "idle",
  className,
  reduceMotion = false,
  speaking = false,
  track = true,
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
  const rootRef = useRef<HTMLDivElement>(null);
  const eyesRef = useRef<HTMLDivElement>(null);
  const alive = state !== "kill";
  const animate = !reduceMotion && alive;

  // Cursor tracking — nudge the eye layer toward the pointer (CSS-transition smoothed).
  useEffect(() => {
    if (!track || reduceMotion || !alive) return;
    const onMove = (e: PointerEvent) => {
      const root = rootRef.current;
      const eyes = eyesRef.current;
      if (!root || !eyes) return;
      const r = root.getBoundingClientRect();
      if (r.width === 0) return;
      const dx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width / 2)));
      const dy = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height * 0.42)) / (r.height / 2)));
      eyes.style.transform = `translate(${(dx * 4).toFixed(2)}%, ${(dy * 4).toFixed(2)}%)`;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [track, reduceMotion, alive]);

  const eyeLive = animate ? st.live : "none";

  return (
    <div
      ref={rootRef}
      className={cn("relative isolate h-full w-full", className)}
      role="img"
      aria-label={`Master Mold — ${st.label}${speaking ? ", speaking" : ""}`}
      style={{ filter: `drop-shadow(0 0 ${14 * st.intensity}px ${st.glow}55)` }}
    >
      {/* rendered armored head */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/master-mold.png"
        alt=""
        draggable={false}
        className="h-full w-full select-none object-contain"
        style={{
          filter: st.filter,
          maskImage: "radial-gradient(ellipse 64% 72% at 50% 47%, #000 58%, transparent 84%)",
          WebkitMaskImage: "radial-gradient(ellipse 64% 72% at 50% 47%, #000 58%, transparent 84%)",
          animation: animate ? "mm-breathe 6s ease-in-out infinite" : "none",
        }}
      />

      {/* eye + laser layer (nudged by the cursor) */}
      <div
        ref={eyesRef}
        className="pointer-events-none absolute inset-0"
        style={{ transition: "transform 160ms ease-out" }}
      >
        <EyeGlow point={LEFT_EYE} color={st.glow} intensity={st.intensity} live={eyeLive} />
        <EyeGlow point={RIGHT_EYE} color={st.glow} intensity={st.intensity} live={eyeLive} />
      </div>

      {/* mouth flicker while speaking */}
      {speaking ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute"
          style={{
            left: `${MOUTH.x}%`,
            top: `${MOUTH.y}%`,
            width: "30%",
            height: "8%",
            transform: "translate(-50%, -50%)",
            borderRadius: "9999px",
            background: `radial-gradient(ellipse at center, ${st.glow} 0%, transparent 70%)`,
            mixBlendMode: "screen",
            animation: reduceMotion ? "none" : "mm-mouth 0.3s ease-in-out infinite",
          }}
        />
      ) : null}
    </div>
  );
}

function EyeGlow({
  point,
  color,
  intensity,
  live,
}: {
  point: { x: number; y: number };
  color: string;
  intensity: number;
  live: string;
}) {
  return (
    <span
      aria-hidden="true"
      className="absolute"
      style={{
        left: `${point.x}%`,
        top: `${point.y}%`,
        width: "20%",
        height: "12%",
        transform: "translate(-50%, -50%)",
      }}
    >
      <span
        className="block h-full w-full"
        style={{
          borderRadius: "9999px",
          background: `radial-gradient(ellipse at center, #fff 0%, ${color} 32%, transparent 72%)`,
          mixBlendMode: "screen",
          opacity: 0.9 * intensity,
          filter: `drop-shadow(0 0 ${6 * intensity}px ${color})`,
          animation: live,
        }}
      />
    </span>
  );
}
