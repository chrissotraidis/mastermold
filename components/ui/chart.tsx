"use client";

import { useId, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

type Tone = "magenta" | "up" | "down" | "gold";

const toneStroke: Record<Tone, string> = {
  magenta: "#f2559f",
  up: "#10b981",
  down: "#fb7185",
  gold: "#e4cb8b",
};

function scalePoints(values: number[], width: number, height: number, pad = 2) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
    const y = pad + (1 - (value - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });
}

function smoothPath(points: ReadonlyArray<readonly [number, number]>) {
  if (points.length === 0) return "";
  if (points.length < 3) return points.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join(" ");
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 1; i < points.length; i += 1) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const cx = (x0 + x1) / 2;
    d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`;
  }
  return d;
}

/** Tiny trend line for stat tiles and table rows. Decorative. */
export function Sparkline({ values, tone = "magenta", className }: { values: number[]; tone?: Tone; className?: string }) {
  const id = useId();
  const width = 100;
  const height = 32;
  const points = useMemo(() => scalePoints(values, width, height), [values]);
  if (values.length < 2) return null;
  const line = smoothPath(points);
  const area = `${line} L${width},${height} L0,${height} Z`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={cn("overflow-visible", className)} aria-hidden="true">
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={toneStroke[tone]} stopOpacity="0.35" />
          <stop offset="100%" stopColor={toneStroke[tone]} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#spark-${id})`} />
      <path d={line} fill="none" stroke={toneStroke[tone]} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
    </svg>
  );
}

export type AreaPoint = { label: string; value: number };

/**
 * Interactive area chart: hover or touch to read a point. Used for net worth
 * and P&L history. Pure SVG so it stays fast and dependency-free.
 */
export function AreaChart({
  points,
  tone = "magenta",
  format = (value: number) => value.toLocaleString(),
  className,
  ariaLabel,
}: {
  points: AreaPoint[];
  tone?: Tone;
  format?: (value: number) => string;
  className?: string;
  ariaLabel: string;
}) {
  const id = useId();
  const [active, setActive] = useState<number | null>(null);
  const width = 600;
  const height = 200;
  const values = points.map((point) => point.value);
  const scaled = useMemo(() => scalePoints(values.length ? values : [0], width, height, 12), [values]);
  if (points.length === 0) return null;
  const line = smoothPath(scaled);
  const area = `${line} L${width},${height} L0,${height} Z`;
  const current = active ?? points.length - 1;
  const [cx, cy] = scaled[current] ?? [0, 0];

  function pick(clientX: number, target: SVGSVGElement) {
    const rect = target.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    setActive(Math.round(ratio * (points.length - 1)));
  }

  return (
    <figure className={cn("relative", className)}>
      <div className="mb-2 flex items-baseline justify-between gap-3 text-xs">
        <span className="mm-num font-display text-sm font-semibold text-on-surface">{format(points[current].value)}</span>
        <span className="text-outline">{points[current].label}</span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={ariaLabel}
        className="h-44 w-full touch-none select-none overflow-visible"
        onPointerMove={(event) => pick(event.clientX, event.currentTarget)}
        onPointerDown={(event) => pick(event.clientX, event.currentTarget)}
        onPointerLeave={() => setActive(null)}
      >
        <defs>
          <linearGradient id={`area-${id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={toneStroke[tone]} stopOpacity="0.32" />
            <stop offset="100%" stopColor={toneStroke[tone]} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={width} y1={height * f} y2={height * f} stroke="hsl(326 20% 30% / 0.35)" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={area} fill={`url(#area-${id})`} />
        <path d={line} fill="none" stroke={toneStroke[tone]} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
        <line x1={cx} x2={cx} y1="0" y2={height} stroke="hsl(330 60% 80% / 0.25)" vectorEffect="non-scaling-stroke" />
        <circle cx={cx} cy={cy} r="4.5" fill="#09060a" stroke={toneStroke[tone]} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-outline">
        <span>{points[0].label}</span>
        <span>{points[points.length - 1].label}</span>
      </div>
    </figure>
  );
}

export type DonutSlice = { key: string; label: string; value: number; color?: string };

export const SLICE_COLORS = ["#f2559f", "#e4cb8b", "#a78bfa", "#22d3ee", "#10b981", "#fb923c", "#9aa0ad", "#f472b6"];

/** Interactive donut: hover or tap a slice (or legend row) to focus it. */
export function DonutChart({
  slices,
  format = (value: number) => value.toLocaleString(),
  centerLabel,
  className,
  onSelect,
  onPick,
  picked = null,
}: {
  slices: DonutSlice[];
  format?: (value: number) => string;
  centerLabel?: string;
  className?: string;
  /** Hover/focus changes (preview only). */
  onSelect?: (key: string | null) => void;
  /** Click/tap: a deliberate choice, e.g. to filter a table. */
  onPick?: (key: string | null) => void;
  picked?: string | null;
}) {
  const [active, setActive] = useState<string | null>(null);
  const total = slices.reduce((sum, slice) => sum + Math.max(0, slice.value), 0) || 1;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const focusKey = active ?? picked;
  const focused = slices.find((slice) => slice.key === focusKey) ?? null;

  function focus(key: string | null) {
    setActive(key);
    onSelect?.(key);
  }

  return (
    <div className={cn("flex flex-col items-center gap-4 sm:flex-row sm:items-center", className)}>
      <div className="relative size-40 shrink-0">
        <svg viewBox="0 0 100 100" className="size-40 -rotate-90" role="img" aria-label="Allocation chart">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="hsl(322 17% 14%)" strokeWidth="11" />
          {slices.map((slice, index) => {
            const fraction = Math.max(0, slice.value) / total;
            const dash = fraction * circumference;
            const color = slice.color ?? SLICE_COLORS[index % SLICE_COLORS.length];
            const element = (
              <circle
                key={slice.key}
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke={color}
                strokeWidth={focusKey === slice.key ? 14 : 11}
                strokeDasharray={`${Math.max(0, dash - 0.6)} ${circumference}`}
                strokeDashoffset={-offset}
                opacity={focusKey && focusKey !== slice.key ? 0.35 : 1}
                className="cursor-pointer transition-all duration-200"
                onPointerEnter={() => focus(slice.key)}
                onPointerLeave={() => focus(null)}
                onClick={() => onPick?.(picked === slice.key ? null : slice.key)}
              />
            );
            offset += dash;
            return element;
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="mm-num font-display text-lg font-semibold text-on-surface">
            {focused ? `${((focused.value / total) * 100).toFixed(1)}%` : format(total)}
          </span>
          <span className="max-w-24 truncate text-[11px] text-outline">{focused ? focused.label : centerLabel ?? "Total"}</span>
        </div>
      </div>
      <ul className="grid w-full min-w-0 grid-cols-1 gap-1 [&>*]:min-w-0">
        {slices.map((slice, index) => {
          const color = slice.color ?? SLICE_COLORS[index % SLICE_COLORS.length];
          const pct = (Math.max(0, slice.value) / total) * 100;
          return (
            <li key={slice.key}>
              <button
                type="button"
                onPointerEnter={() => focus(slice.key)}
                onPointerLeave={() => focus(null)}
                onFocus={() => focus(slice.key)}
                onBlur={() => focus(null)}
                onClick={() => onPick?.(picked === slice.key ? null : slice.key)}
                aria-pressed={onPick ? picked === slice.key : undefined}
                className={cn(
                  "mm-row flex min-h-10 w-full items-center gap-3 px-2 text-left text-sm",
                  focusKey === slice.key && "bg-surface-high/60",
                  picked === slice.key && "ring-1 ring-violet/50",
                )}
              >
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-on-surface">{slice.label}</span>
                <span className="flex shrink-0 flex-col items-end leading-tight">
                  <span className="mm-num text-on-surface-variant">{format(slice.value)}</span>
                  <span className="mm-num text-[11px] text-outline">{pct.toFixed(1)}%</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
