"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * The face of Master Mold — a monumental armored sentinel head whose glowing eyes are
 * the primary state channel. Inline SVG (offline-safe, themeable), CSS-animated, and
 * alive: the pupils track your cursor, he blinks, his eyes pulse like charging lasers,
 * and his vocal grille flickers when he's speaking. Reduced-motion aware.
 */
export type SystemState =
  | "idle"
  | "thinking"
  | "suggestion"
  | "caution"
  | "alert"
  | "degraded"
  | "kill";

const EYE: Record<
  SystemState,
  { color: string; anim: string; intensity: number; label: string; laser: string }
> = {
  idle: { color: "#d0bcff", anim: "mm-eye-idle 4.5s ease-in-out infinite", intensity: 1, label: "Watching", laser: "5.5s" },
  thinking: { color: "#e9d5ff", anim: "mm-eye-think 1.2s ease-in-out infinite", intensity: 1.15, label: "Processing", laser: "1.8s" },
  suggestion: { color: "#34d399", anim: "mm-eye-idle 2.6s ease-in-out infinite", intensity: 1.1, label: "Signal found", laser: "3.2s" },
  caution: { color: "#fbbf24", anim: "mm-eye-idle 3s ease-in-out infinite", intensity: 1, label: "Caution", laser: "3.6s" },
  alert: { color: "#fb7185", anim: "mm-eye-alert 0.85s ease-in-out infinite", intensity: 1.25, label: "Critical", laser: "1.1s" },
  degraded: { color: "#958ea0", anim: "mm-eye-think 2.2s ease-in-out infinite", intensity: 0.55, label: "Degraded sight", laser: "6s" },
  kill: { color: "#fb7185", anim: "none", intensity: 0.4, label: "Halted", laser: "0s" },
};

export function stateLabel(state: SystemState): string {
  return EYE[state].label;
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
  /** Flicker the vocal grille like he's talking (e.g. while streaming a reply). */
  speaking?: boolean;
  /** Pupils follow the cursor. */
  track?: boolean;
}) {
  const eye = EYE[state];
  const svgRef = useRef<SVGSVGElement>(null);
  const pupilsRef = useRef<SVGGElement>(null);
  const alive = state !== "kill";

  // Cursor tracking — translate the pupils toward the pointer. A CSS transition on the
  // group smooths the motion, so this needs no animation frame loop.
  useEffect(() => {
    if (!track || reduceMotion || !alive) return;
    if (typeof window === "undefined") return;

    const onMove = (e: PointerEvent) => {
      const svg = svgRef.current;
      const g = pupilsRef.current;
      if (!svg || !g) return;
      const r = svg.getBoundingClientRect();
      if (r.width === 0) return;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height * 0.49; // eyes sit just above center
      const dx = Math.max(-1, Math.min(1, (e.clientX - cx) / (r.width / 2)));
      const dy = Math.max(-1, Math.min(1, (e.clientY - cy) / (r.height / 2)));
      g.style.transform = `translate(${(dx * 10).toFixed(2)}px, ${(dy * 6).toFixed(2)}px)`;
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [track, reduceMotion, alive]);

  const eyeAnim = reduceMotion
    ? "none"
    : alive
      ? `${eye.anim}, mm-blink 6.4s ease-in-out infinite`
      : eye.anim;

  const eyeStyle = {
    color: eye.color,
    fill: eye.color,
    filter: `drop-shadow(0 0 ${10 * eye.intensity}px ${eye.color}) drop-shadow(0 0 ${24 * eye.intensity}px ${eye.color})`,
    animation: eyeAnim,
    transformBox: "fill-box",
    transformOrigin: "center",
  } as const;

  const scanning = state === "thinking";
  const breathe = !reduceMotion && alive ? { animation: "mm-breathe 6s ease-in-out infinite", transformBox: "fill-box", transformOrigin: "center" } as const : undefined;

  // Laser beams cast from each eye — flash periodically, intensity by state.
  const laserStyle = (delay: string) =>
    reduceMotion || !alive
      ? { opacity: 0 }
      : ({ animation: `mm-laser-fire ${eye.laser} ease-out ${delay} infinite`, transformBox: "fill-box", transformOrigin: "center" } as const);

  // Pupil cores pulse like a charging laser.
  const coreStyle =
    reduceMotion || !alive
      ? undefined
      : ({ animation: `mm-laser-core ${eye.laser} ease-in-out infinite`, transformBox: "fill-box", transformOrigin: "center" } as const);

  // Vocal grille talk animation (only while speaking).
  const grilleAnim = (variant: "a" | "b" | "c", dur: string) =>
    speaking && !reduceMotion
      ? ({ animation: `mm-talk-${variant} ${dur} ease-in-out infinite`, transformBox: "fill-box", transformOrigin: "center" } as const)
      : undefined;

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 400 440"
      className={cn("h-full w-full", className)}
      role="img"
      aria-label={`Master Mold — ${eye.label}${speaking ? ", speaking" : ""}`}
    >
      <defs>
        <linearGradient id="mm-plate" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor="#2a1c40" />
          <stop offset="0.5" stopColor="#1a1029" />
          <stop offset="1" stopColor="#0d0717" />
        </linearGradient>
        <linearGradient id="mm-plate-edge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4b2f7a" />
          <stop offset="1" stopColor="#1a1029" />
        </linearGradient>
        <radialGradient id="mm-halo" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={eye.color} stopOpacity={0.5 * eye.intensity} />
          <stop offset="1" stopColor={eye.color} stopOpacity="0" />
        </radialGradient>
      </defs>

      <g style={breathe}>
        {/* ambient core glow behind the head */}
        <ellipse cx="200" cy="210" rx="150" ry="170" fill="url(#mm-halo)" opacity={0.6} />

        {/* outer helmet silhouette — angular sentinel crown */}
        <path
          d="M200 24 L322 70 L356 168 L348 300 L300 392 L200 420 L100 392 L52 300 L44 168 L78 70 Z"
          fill="url(#mm-plate)"
          stroke="#6d3bd7"
          strokeOpacity="0.5"
          strokeWidth="2"
        />
        {/* crown ridge */}
        <path d="M200 24 L200 96 M150 44 L168 104 M250 44 L232 104" stroke="#5a3aa0" strokeOpacity="0.6" strokeWidth="3" fill="none" />
        {/* inner face plate */}
        <path
          d="M200 70 L300 104 L318 196 L300 300 L256 356 L200 372 L144 356 L100 300 L82 196 L100 104 Z"
          fill="url(#mm-plate-edge)"
          fillOpacity="0.65"
          stroke="#7c4dd6"
          strokeOpacity="0.35"
          strokeWidth="1.5"
        />

        {/* brow ridge — a stern angular V over the eyes */}
        <path d="M104 176 L180 158 L200 172 L220 158 L296 176 L296 192 L214 178 L200 190 L186 178 L104 192 Z" fill="#3a2660" stroke="#6d3bd7" strokeOpacity="0.4" strokeWidth="1.5" />

        {/* cheek vents / panel seams */}
        <path d="M96 230 L150 246 M96 252 L150 264 M96 274 L148 282" stroke="#4b3a6b" strokeOpacity="0.5" strokeWidth="2" />
        <path d="M304 230 L250 246 M304 252 L250 264 M304 274 L252 282" stroke="#4b3a6b" strokeOpacity="0.5" strokeWidth="2" />

        {/* central nasal ridge */}
        <path d="M200 198 L188 300 L200 316 L212 300 Z" fill="#241640" stroke="#6d3bd7" strokeOpacity="0.3" strokeWidth="1.5" />

        {/* EYES — the primary state channel */}
        <g style={eyeStyle}>
          {/* eye halos */}
          <ellipse cx="150" cy="214" rx="46" ry="30" fill="url(#mm-halo)" />
          <ellipse cx="250" cy="214" rx="46" ry="30" fill="url(#mm-halo)" />

          {/* laser beams cast outward-down from each eye — rest hidden, flash when firing */}
          <line x1="150" y1="214" x2="92" y2="286" stroke={eye.color} strokeWidth="3" strokeLinecap="round" opacity={0} style={laserStyle("0s")} />
          <line x1="250" y1="214" x2="308" y2="286" stroke={eye.color} strokeWidth="3" strokeLinecap="round" opacity={0} style={laserStyle("0.18s")} />

          {/* angular eye slits */}
          <path d="M118 210 L176 198 L182 216 L172 230 L120 226 Z" />
          <path d="M282 210 L224 198 L218 216 L228 230 L280 226 Z" />

          {/* bright cores — track the cursor, pulse like charging lasers */}
          <g ref={pupilsRef} style={{ transition: "transform 150ms ease-out" }}>
            <circle cx="150" cy="214" r="9" fill="#ffffff" fillOpacity="0.92" style={coreStyle} />
            <circle cx="250" cy="214" r="9" fill="#ffffff" fillOpacity="0.92" style={coreStyle} />
          </g>
        </g>

        {/* vocal grille / jaw — backlit slats that flicker when he speaks */}
        <g stroke={eye.color} strokeWidth="3" strokeLinecap="round">
          <line x1="168" y1="332" x2="232" y2="332" strokeOpacity={speaking ? 0.7 : 0.22 * eye.intensity} style={grilleAnim("a", "0.34s")} />
          <line x1="160" y1="344" x2="240" y2="344" strokeOpacity={speaking ? 0.85 : 0.22 * eye.intensity} style={grilleAnim("b", "0.27s")} />
          <line x1="172" y1="356" x2="228" y2="356" strokeOpacity={speaking ? 0.65 : 0.22 * eye.intensity} style={grilleAnim("c", "0.4s")} />
        </g>

        {/* rivets */}
        {[
          [200, 40],
          [110, 96],
          [290, 96],
          [70, 200],
          [330, 200],
          [120, 360],
          [280, 360],
        ].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r="3" fill="#5a3aa0" fillOpacity="0.7" />
        ))}

        {/* thinking scan sweep */}
        {scanning && !reduceMotion ? (
          <rect
            x="82"
            y="70"
            width="236"
            height="14"
            fill="#e9d5ff"
            fillOpacity="0.16"
            style={{ animation: "mm-scan 2.4s linear infinite" }}
          />
        ) : null}
      </g>
    </svg>
  );
}
