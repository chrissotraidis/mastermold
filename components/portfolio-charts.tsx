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
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = Math.max(max - min, 1);
  const coords = points.map((point, index) => {
    const x = points.length <= 1 ? 0 : (index / (points.length - 1)) * 100;
    const y = 88 - ((point.value - min) / range) * 76;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const latest = points.at(-1);
  const first = points[0];
  const change = latest && first ? latest.value - first.value : 0;

  return (
    <section
      aria-labelledby="net-worth-chart-title"
      className="rounded-lg border border-outline-variant/40 bg-surface-high/30 p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="net-worth-chart-title" className="text-xl font-semibold text-on-surface">
            Net worth over time
          </h2>
          <p className="mt-1 text-sm leading-6 text-outline">
            One view of the visible portfolio over time, not separate asset charts.
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-on-surface">{formatCurrency(latest?.value ?? 0)}</p>
          <p className={change >= 0 ? "text-xs text-engine" : "text-xs text-critical"}>
            {change >= 0 ? "+" : ""}
            {formatCurrency(change)} this week
          </p>
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-md border border-outline-variant/40 bg-surface-dim/50 p-3">
        <svg viewBox="0 0 100 100" role="img" aria-label="Seven day net worth line" className="h-56 w-full">
          <defs>
            <linearGradient id="net-worth-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgb(124 58 237)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="rgb(124 58 237)" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {[20, 40, 60, 80].map((y) => (
            <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="rgba(148, 163, 184, 0.16)" strokeWidth="0.5" />
          ))}
          <polygon points={`0,96 ${coords.join(" ")} 100,96`} fill="url(#net-worth-fill)" />
          <polyline points={coords.join(" ")} fill="none" stroke="rgb(167 139 250)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          {points.map((point, index) => {
            const [x, y] = coords[index].split(",").map(Number);
            return <circle key={point.date} cx={x} cy={y} r="1.8" fill="rgb(167 139 250)" />;
          })}
        </svg>
        <div className="mt-2 flex justify-between text-xs text-outline">
          <span>{points[0]?.date ?? "Start"}</span>
          <span>{latest?.date ?? "Now"}</span>
        </div>
      </div>
    </section>
  );
}

function AllocationChart({ allocation }: { allocation: AllocationJson[] }) {
  const activeAllocation = allocation.filter((item) => item.market_value > 0);
  const maxWeight = Math.max(...activeAllocation.map((item) => item.weight_pct), 1);

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

      <div className="mt-6 space-y-4">
        {activeAllocation.length > 0 ? (
          activeAllocation.map((item) => (
            <div key={item.asset_class} className="space-y-2">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium capitalize text-on-surface">{labelAssetClass(item.asset_class)}</span>
                <span className="tabular-nums text-on-surface-variant">
                  {formatCurrency(item.market_value)} · {item.weight_pct.toFixed(1)}%
                </span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-surface-high" aria-hidden="true">
                <div
                  className={allocationColor(item.asset_class)}
                  style={{ width: `${Math.max((item.weight_pct / maxWeight) * 100, 2)}%` }}
                />
              </div>
            </div>
          ))
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

function allocationColor(assetClass: AllocationJson["asset_class"]) {
  switch (assetClass) {
    case "equity":
      return "h-full rounded-full bg-violet";
    case "crypto":
      return "h-full rounded-full bg-engine";
    case "defi":
      return "h-full rounded-full bg-caution";
    case "cash":
      return "h-full rounded-full bg-outline";
  }
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}
