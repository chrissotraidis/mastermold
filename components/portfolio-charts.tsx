"use client";

import { useState } from "react";
import type { AllocationJson, NetWorthPointJson } from "@/src/db/portfolio";

type PortfolioChartsProps = {
  allocation: AllocationJson[];
  netWorthSeries: NetWorthPointJson[];
};

export function PortfolioCharts({ allocation, netWorthSeries }: PortfolioChartsProps) {
  return (
    <div className="grid gap-3 md:grid-cols-[1.15fr_0.85fr]">
      <NetWorthChart points={netWorthSeries} />
      <AllocationChart allocation={allocation} />
    </div>
  );
}

const UP_COLOR = "rgb(16 185 129)"; // theme `engine` emerald
const DOWN_COLOR = "rgb(251 113 133)"; // theme `critical` rose

function NetWorthChart({ points }: { points: NetWorthPointJson[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values, 1);
  // Pad the value range so a quiet stretch still shows gentle shape instead of
  // a line glued to an edge; a fully flat series renders mid-chart, honestly flat.
  const span = Math.max(max - min, max * 0.02, 1);
  const lo = min - span * 0.18;
  const hi = max + span * 0.18;
  const W = 300;
  const H = 96;
  // With only a couple of saved closes, keep the dots inset from the frame so
  // three points read as a small honest series, not a wall-to-wall zigzag.
  const inset = points.length <= 4 ? W * 0.1 : 0;
  const coords = points.map((point, index) => {
    const x = points.length <= 1 ? W / 2 : inset + (index / (points.length - 1)) * (W - inset * 2);
    const y = H - ((point.value - lo) / (hi - lo)) * H;
    return [x, y] as const;
  });
  const path = coords.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const latest = points.at(-1);
  const first = points[0];
  const change = latest && first ? latest.value - first.value : 0;
  // One dot per saved close; shrink as the history grows toward 90 days.
  const dotPx = points.length > 45 ? 5 : points.length > 20 ? 6 : 8;
  const hoveredPoint = hovered !== null ? points[hovered] : null;
  const hoveredDelta = hovered !== null && hovered > 0 ? points[hovered].value - points[hovered - 1].value : null;

  return (
    <section
      aria-labelledby="net-worth-chart-title"
      className="rounded-md border border-outline-variant/40 bg-surface-high/30 p-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="net-worth-chart-title" className="text-sm font-semibold text-on-surface">
            Net worth
          </h2>
          <p className="mt-0.5 text-xs leading-5 text-outline">
            One dot per saved daily close · {points.length} of a 90-day window so far.
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-sm font-semibold tabular-nums text-on-surface">
            {formatCurrency(latest?.value ?? 0)}
          </p>
          <p className={change >= 0 ? "text-xs tabular-nums text-engine" : "text-xs tabular-nums text-critical"}>
            {change >= 0 ? "+" : ""}
            {formatCurrency(change)}
            {first ? ` since ${shortDay(first.date)}` : ""}
          </p>
        </div>
      </div>

      <div className="mt-2 overflow-hidden rounded-md border border-outline-variant/40 bg-surface-dim/50 p-2">
        <div
          className="relative"
          onMouseMove={(event) => {
            if (points.length === 0) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const fraction = (event.clientX - rect.left) / Math.max(rect.width, 1);
            const usable = 1 - (inset / W) * 2;
            const adjusted = usable > 0 ? (fraction - inset / W) / usable : 0;
            const index = Math.round(adjusted * (points.length - 1));
            setHovered(Math.min(Math.max(index, 0), points.length - 1));
          }}
          onMouseLeave={() => setHovered(null)}
        >
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={`Net worth line, one point per saved daily close, ${points.length} days`}
            className="h-28 w-full sm:h-32"
          >
            <defs>
              <linearGradient id="net-worth-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="rgb(142 46 82)" stopOpacity="0.30" />
                <stop offset="100%" stopColor="rgb(142 46 82)" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            {[0.25, 0.5, 0.75].map((fraction) => (
              <line
                key={fraction}
                x1="0"
                x2={W}
                y1={H * fraction}
                y2={H * fraction}
                stroke="rgba(148, 163, 184, 0.14)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {coords.length > 1 ? (
              <polygon
                points={`${coords[0][0]},${H} ${path} ${coords[coords.length - 1][0]},${H}`}
                fill="url(#net-worth-fill)"
              />
            ) : null}
            {/* Day-over-day segments: green when the close rose, rose-red when it fell. */}
            {coords.slice(1).map(([x2, y2], index) => {
              const [x1, y1] = coords[index];
              const up = points[index + 1].value >= points[index].value;
              return (
                <line
                  key={points[index + 1].date}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={up ? UP_COLOR : DOWN_COLOR}
                  strokeWidth="2"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
          </svg>

          {/* Dots as an HTML overlay so they stay round while the SVG stretches. */}
          {coords.map(([x, y], index) => {
            const delta = index > 0 ? points[index].value - points[index - 1].value : null;
            const color = delta === null ? "rgb(214 92 135)" : delta >= 0 ? UP_COLOR : DOWN_COLOR;
            const isHovered = hovered === index;
            const size = isHovered ? dotPx + 4 : dotPx;
            return (
              <span
                key={points[index].date}
                data-testid="net-worth-dot"
                aria-hidden="true"
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  left: `${(x / W) * 100}%`,
                  top: `${(y / H) * 100}%`,
                  width: size,
                  height: size,
                  backgroundColor: color,
                  boxShadow: "0 0 0 1.5px rgb(28 14 19)",
                }}
              />
            );
          })}

          {/* Hover tooltip: date, value, and the day-over-day delta. */}
          {hoveredPoint && hovered !== null ? (
            <div
              data-testid="net-worth-tooltip"
              className="pointer-events-none absolute z-10 -translate-y-full whitespace-nowrap rounded-md border border-outline-variant/50 bg-surface-high px-2 py-1 text-xs shadow-lg"
              style={{
                left: `${(coords[hovered][0] / W) * 100}%`,
                top: `${Math.max((coords[hovered][1] / H) * 100 - 6, 8)}%`,
                transform: `translate(${hovered <= points.length * 0.2 ? "0" : hovered >= points.length * 0.8 ? "-100%" : "-50%"}, -100%)`,
              }}
            >
              <p className="font-semibold text-on-surface">{shortDay(hoveredPoint.date)}</p>
              <p className="tabular-nums text-on-surface-variant">{formatCurrency(hoveredPoint.value)}</p>
              <p
                className={
                  hoveredDelta === null
                    ? "tabular-nums text-outline"
                    : hoveredDelta >= 0
                      ? "tabular-nums text-engine"
                      : "tabular-nums text-critical"
                }
              >
                {hoveredDelta === null
                  ? "first saved close"
                  : `${hoveredDelta >= 0 ? "+" : ""}${formatCurrency(hoveredDelta)} vs prior day`}
              </p>
            </div>
          ) : null}
        </div>

        <div className="mt-2 flex justify-between text-xs tabular-nums text-outline">
          <span>{first ? shortDay(first.date) : ""}</span>
          {points.length >= 5 ? (
            <span className="hidden sm:inline">{shortDay(points[Math.floor(points.length / 2)].date)}</span>
          ) : null}
          <span>{latest ? shortDay(latest.date) : ""}</span>
        </div>
      </div>
    </section>
  );
}

function shortDay(date: string) {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(parsed);
}

function AllocationChart({ allocation }: { allocation: AllocationJson[] }) {
  const activeAllocation = allocation.filter((item) => item.market_value > 0);

  return (
    <section
      aria-labelledby="allocation-title"
      className="rounded-md border border-outline-variant/40 bg-surface-high/30 p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="allocation-title" className="text-sm font-semibold text-on-surface">
          Allocation
        </h2>
        <p className="text-xs text-outline">Stocks · crypto · on-chain · cash</p>
      </div>

      <div className="mt-2 overflow-hidden rounded-md border border-outline-variant/35">
        {activeAllocation.length > 0 ? (
          <dl className="divide-y divide-outline-variant/35">
            {activeAllocation.map((item) => (
              <div key={item.asset_class} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 bg-surface-dim/25 px-3 py-1.5 text-sm">
                <dt className="min-w-0 truncate font-medium capitalize text-on-surface">{labelAssetClass(item.asset_class)}</dt>
                <dd className="min-w-0 break-words text-right tabular-nums text-on-surface-variant">
                  {formatCurrency(item.market_value)} · {item.weight_pct.toFixed(1)}%
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <div className="rounded-md border border-outline-variant/40 bg-surface-dim/45 p-3 text-sm text-outline">
            No holdings loaded yet.
          </div>
        )}
      </div>
    </section>
  );
}

function labelAssetClass(assetClass: AllocationJson["asset_class"]) {
  if (assetClass === "defi") return "On-chain";
  if (assetClass === "cash") return "Cash";
  return assetClass;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}
