"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { Label } from "@/components/ui/label";
import type { AllocationJson, PriceChartAssetJson } from "@/src/db/portfolio";

type PortfolioChartsProps = {
  allocation: AllocationJson[];
  chartAssets: PriceChartAssetJson[];
};

export function PortfolioCharts({ allocation, chartAssets }: PortfolioChartsProps) {
  return (
    <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
      <AllocationChart allocation={allocation} />
      <TradingViewCandlestick chartAssets={chartAssets} />
    </div>
  );
}

function AllocationChart({ allocation }: { allocation: AllocationJson[] }) {
  const maxWeight = Math.max(...allocation.map((item) => item.weight_pct), 1);

  return (
    <section
      aria-labelledby="allocation-title"
      className="rounded-lg border border-white/10 bg-white/[0.035] p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">
            Allocation chart
          </p>
          <h2 id="allocation-title" className="mt-2 text-xl font-semibold text-white">
            Per-class allocation
          </h2>
        </div>
        <p className="text-sm text-slate-400">Equity / crypto / defi</p>
      </div>

      <div className="mt-6 space-y-4">
        {allocation.map((item) => (
          <div key={item.asset_class} className="space-y-2">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium capitalize text-slate-100">{item.asset_class}</span>
              <span className="tabular-nums text-slate-300">
                {formatCurrency(item.market_value)} · {item.weight_pct.toFixed(1)}%
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-800" aria-hidden="true">
              <div
                className={allocationColor(item.asset_class)}
                style={{ width: `${Math.max((item.weight_pct / maxWeight) * 100, 2)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function TradingViewCandlestick({ chartAssets }: { chartAssets: PriceChartAssetJson[] }) {
  const [selectedAssetId, setSelectedAssetId] = useState(chartAssets[0]?.asset.id ?? "");
  const chartRef = useRef<HTMLDivElement>(null);
  const chartApiRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  const selectedAsset = useMemo(
    () => chartAssets.find((item) => item.asset.id === selectedAssetId) ?? chartAssets[0],
    [chartAssets, selectedAssetId],
  );

  useEffect(() => {
    const container = chartRef.current;

    if (!container || !selectedAsset) {
      return;
    }

    const chart = createChart(container, {
      autoSize: false,
      width: Math.max(Math.floor(container.clientWidth), 1),
      height: chartHeight(container),
      layout: {
        background: { type: ColorType.Solid, color: "#020617" },
        textColor: "#cbd5e1",
      },
      grid: {
        vertLines: { color: "rgba(148, 163, 184, 0.12)" },
        horzLines: { color: "rgba(148, 163, 184, 0.12)" },
      },
      rightPriceScale: {
        borderColor: "rgba(148, 163, 184, 0.2)",
      },
      timeScale: {
        borderColor: "rgba(148, 163, 184, 0.2)",
        timeVisible: true,
      },
      crosshair: {
        vertLine: { color: "rgba(103, 232, 249, 0.45)" },
        horzLine: { color: "rgba(103, 232, 249, 0.45)" },
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#f43f5e",
      borderUpColor: "#22c55e",
      borderDownColor: "#f43f5e",
      wickUpColor: "#86efac",
      wickDownColor: "#fb7185",
    });

    chartApiRef.current = chart;
    seriesRef.current = series;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      const width = Math.max(Math.floor(entry.contentRect.width), 1);

      chart.resize(width, chartHeight(container));
      chart.timeScale().fitContent();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartApiRef.current = null;
      seriesRef.current = null;
    };
  }, [selectedAsset]);

  useEffect(() => {
    if (!selectedAsset || !seriesRef.current || !chartApiRef.current) {
      return;
    }

    seriesRef.current.setData(
      selectedAsset.bars.map((bar) => ({
        time: Math.floor(Date.parse(bar.ts) / 1000) as UTCTimestamp,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      })),
    );
    chartApiRef.current.timeScale().fitContent();
  }, [selectedAsset]);

  return (
    <section
      aria-labelledby="price-chart-title"
      className="rounded-lg border border-white/10 bg-white/[0.035] p-4 sm:p-5"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">
            TradingView Lightweight Charts
          </p>
          <h2 id="price-chart-title" className="mt-2 text-xl font-semibold text-white">
            Price chart
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Select asset for seeded candlestick bars.
          </p>
        </div>
        <div className="grid gap-2 sm:min-w-56">
          <Label htmlFor="asset-chart-select" className="text-slate-200">
            Asset
          </Label>
          <select
            id="asset-chart-select"
            value={selectedAsset?.asset.id ?? ""}
            onChange={(event) => setSelectedAssetId(event.target.value)}
            className="h-10 rounded-md border border-white/15 bg-slate-950 px-3 text-sm text-white outline-none ring-cyan-300/40 focus:ring-2"
          >
            {chartAssets.map((item) => (
              <option key={item.asset.id} value={item.asset.id}>
                {item.asset.symbol} · {item.asset.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedAsset ? (
        <div className="mt-5 overflow-hidden rounded-md border border-white/10 bg-slate-950">
          <div ref={chartRef} className="h-64 w-full sm:h-80" aria-label={`${selectedAsset.asset.symbol} candlestick chart`} />
        </div>
      ) : (
        <div className="mt-5 rounded-md border border-white/10 bg-slate-950 p-6 text-sm text-slate-300">
          No seeded PriceBar rows are available for the price chart.
        </div>
      )}
    </section>
  );
}

function chartHeight(container: HTMLDivElement) {
  return container.clientWidth < 520 ? 256 : 320;
}

function allocationColor(assetClass: AllocationJson["asset_class"]) {
  switch (assetClass) {
    case "equity":
      return "h-full rounded-full bg-cyan-300";
    case "crypto":
      return "h-full rounded-full bg-emerald-300";
    case "defi":
      return "h-full rounded-full bg-amber-300";
  }
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}
