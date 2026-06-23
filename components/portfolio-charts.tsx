"use client";

import type { AllocationJson, NetWorthPointJson } from "@/src/db/portfolio";

type PortfolioChartsProps = {
  allocation: AllocationJson[];
  netWorthSeries: NetWorthPointJson[];
};

export function PortfolioCharts({ allocation, netWorthSeries }: PortfolioChartsProps) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
      <NetWorthChart points={netWorthSeries} />
      <AllocationChart allocation={allocation} />
    </div>
  );
}

function NetWorthChart({ points }: { points: NetWorthPointJson[] }) {
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values, 1);
  // Pad the value range so a quiet week still shows gentle shape instead of a
  // line glued to an edge; a fully flat series renders mid-chart, honestly flat.
  const span = Math.max(max - min, max * 0.02, 1);
  const lo = min - span * 0.18;
  const hi = max + span * 0.18;
  const W = 300;
  const H = 96;
  const coords = points.map((point, index) => {
    const x = points.length <= 1 ? 0 : (index / (points.length - 1)) * W;
    const y = H - ((point.value - lo) / (hi - lo)) * H;
    return [x, y] as const;
  });
  const path = coords.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const latest = points.at(-1);
  const first = points[0];
  const change = latest && first ? latest.value - first.value : 0;
  const last = coords.at(-1);

  return (
    <section
      aria-labelledby="net-worth-chart-title"
      className="rounded-lg border border-outline-variant/40 bg-surface-high/30 p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="net-worth-chart-title" className="text-xl font-semibold text-on-surface">
            Net worth
          </h2>
          <p className="mt-1 text-sm leading-6 text-outline">Trailing 7 days, priced from saved closes.</p>
        </div>
        <div className="text-right">
          <p className="font-display text-lg font-semibold tabular-nums text-on-surface">
            {formatCurrency(latest?.value ?? 0)}
          </p>
          <p className={change >= 0 ? "text-xs tabular-nums text-engine" : "text-xs tabular-nums text-critical"}>
            {change >= 0 ? "+" : ""}
            {formatCurrency(change)} this week
          </p>
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-md border border-outline-variant/40 bg-surface-dim/50 p-3">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label="Seven day net worth line"
          className="h-44 w-full sm:h-56"
        >
          <defs>
            <linearGradient id="net-worth-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgb(124 58 237)" stopOpacity="0.30" />
              <stop offset="100%" stopColor="rgb(124 58 237)" stopOpacity="0.02" />
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
          <polygon points={`0,${H} ${path} ${W},${H}`} fill="url(#net-worth-fill)" />
          <polyline
            points={path}
            fill="none"
            stroke="rgb(167 139 250)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {last ? (
            <circle cx={last[0]} cy={last[1]} r="3.5" fill="rgb(167 139 250)" stroke="rgb(24 16 44)" strokeWidth="1.5" />
          ) : null}
        </svg>
        <div className="mt-2 flex justify-between text-xs tabular-nums text-outline">
          {points.map((point, index) => (
            <span
              key={point.date}
              className={index === 0 || index === points.length - 1 ? "" : "hidden sm:inline"}
            >
              {shortDay(point.date)}
            </span>
          ))}
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
      className="rounded-lg border border-outline-variant/40 bg-surface-high/30 p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="allocation-title" className="text-xl font-semibold text-on-surface">
          Allocation
        </h2>
        <p className="text-sm text-outline">Stocks · crypto · on-chain · cash</p>
      </div>

      <div className="mt-5 overflow-hidden rounded-md border border-outline-variant/35">
        {activeAllocation.length > 0 ? (
          <dl className="divide-y divide-outline-variant/35">
            {activeAllocation.map((item) => (
              <div key={item.asset_class} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 bg-surface-dim/25 px-3 py-3 text-sm">
                <dt className="min-w-0 truncate font-medium capitalize text-on-surface">{labelAssetClass(item.asset_class)}</dt>
                <dd className="min-w-0 break-words text-right tabular-nums text-on-surface-variant">
                  {formatCurrency(item.market_value)} · {item.weight_pct.toFixed(1)}%
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <div className="rounded-md border border-outline-variant/40 bg-surface-dim/45 p-4 text-sm text-outline">
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
