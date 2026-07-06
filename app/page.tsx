import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { DailyReportRefreshButton } from "@/components/daily-report-refresh-button";
import { TodayMemoryRefresh } from "@/components/today-memory-refresh";
import { TodayReadTimer } from "@/components/today-metrics";
import { productProvenanceLabel } from "@/lib/provenance-copy";
import { parseAsOf } from "@/src/db/bitemporal";
import { getAlerts, type AlertJson } from "@/src/db/alerts";
import { cleanAlertMessage } from "@/lib/alert-loop";
import {
  ensureDailyReportAutoRefresh,
  getLatestDailyReport,
  type DailyReport,
  type DailyReportPlay,
} from "@/src/db/daily-report";
import { getDataMode } from "@/src/db/engine-data";
import { getPortfolio } from "@/src/db/portfolio";
import {
  getPortfolioRecommendations,
  type PortfolioRecommendation,
} from "@/src/db/portfolio-recommendations";

export const dynamic = "force-dynamic";

type TodayPageProps = {
  searchParams?: Promise<{ as_of?: string }>;
};

export default async function TodayPage({ searchParams }: TodayPageProps) {
  const params = await searchParams;
  const parsedAsOf = parseAsOf(params?.as_of ?? null);
  const asOf = parsedAsOf.ok ? parsedAsOf.asOf : null;
  const dataMode = getDataMode(asOf);
  const portfolio = getPortfolio(asOf);
  const autoRefresh = asOf ? null : await ensureDailyReportAutoRefresh();
  const report = asOf ? null : autoRefresh?.report ?? getLatestDailyReport();
  const recommendations = getPortfolioRecommendations(asOf, 5);
  const alerts = getAlerts(asOf).filter((alert) => !alert.acknowledged).slice(0, 5);
  const topHolding = portfolio.holdings[0] ?? null;
  const pageDataMode =
    portfolio.provenance.label === "Manual portfolio" || portfolio.provenance.label === "Imported portfolio"
      ? portfolio.provenance.label
      : dataMode.label;
  const movers = topMovers(report);

  return (
    <AppShell dataMode={productProvenanceLabel(pageDataMode)}>
      <TodayReadTimer />
      <div className="mx-auto grid w-full max-w-3xl gap-4">
        <header>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-display text-lg font-semibold text-on-surface">Today</h1>
              <p className="mt-0.5 text-xs text-outline">{todayDateLine(report)}</p>
            </div>
            <DailyReportRefreshButton variant="ghost" />
          </div>
          <p className="mt-2 text-lg text-on-surface" data-testid="today-pulse">
            <span className="font-semibold tabular-nums">{formatCurrency(portfolio.total_market_value)}</span>
            <span className="text-sm text-on-surface-variant">
              {" · "}
              {formatChange(portfolio.daily_change_value, portfolio.daily_change_pct)} today
              {topHolding ? ` · ${topHolding.symbol} is your largest position at ${topHolding.weight_pct.toFixed(0)}%` : ""}
            </span>
          </p>
        </header>

        <section aria-labelledby="today-plays-title">
          <div className="flex items-center justify-between gap-3">
            <h2 id="today-plays-title" className="text-xs font-semibold uppercase tracking-telemetry text-outline">
              Today&apos;s plays
            </h2>
            {report && report.plays.length > 0 ? (
              <span className="text-[10px] uppercase tracking-wide text-outline">
                {report.plays[0].source === "llm" ? "model-written · validated" : "rules from your data"}
              </span>
            ) : null}
          </div>
          {report && report.plays.length > 0 ? (
            <>
              <div className="mt-2 divide-y divide-outline-variant/20 rounded-md border border-violet/25 bg-violet/[0.04]">
                {report.plays.map((play) => (
                  <PlayLine key={play.id} play={play} />
                ))}
              </div>
              <p className="mt-1.5 text-xs leading-5 text-outline">
                Suggestions from your holdings, today&apos;s moves, and saved memory — Master Mold never places trades.
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm leading-6 text-on-surface-variant">
              No plays saved yet for today. Refresh the daily read to build them from your holdings and today&apos;s moves.
            </p>
          )}
        </section>

        <section aria-labelledby="today-brief-title">
          <h2 id="today-brief-title" className="text-xs font-semibold uppercase tracking-telemetry text-outline">
            The brief
          </h2>
          {report ? (
            <div className="mt-2 space-y-3">
              <p className="text-sm leading-6 text-on-surface">
                {briefProse(report)}
              </p>
              {movers.length > 0 ? (
                <p className="text-sm leading-6 text-on-surface-variant" data-testid="today-movers">
                  Moving today:{" "}
                  {movers.map((mover, index) => (
                    <span key={mover.symbol}>
                      {index > 0 ? ", " : ""}
                      <span className="font-semibold text-on-surface">{mover.symbol}</span>{" "}
                      <span className={mover.move >= 0 ? "text-engine" : "text-critical"}>
                        {mover.move >= 0 ? "+" : ""}
                        {mover.move.toFixed(1)}%
                      </span>
                    </span>
                  ))}
                  .
                </p>
              ) : null}
            </div>
          ) : (
            <p className="mt-2 text-sm leading-6 text-on-surface-variant">
              No report saved yet for today. Refresh to read the portfolio and market now.
            </p>
          )}
        </section>

        <section aria-labelledby="today-recs-title">
          <div className="flex items-center justify-between gap-3">
            <h2 id="today-recs-title" className="text-xs font-semibold uppercase tracking-telemetry text-outline">
              Worth your attention
            </h2>
          </div>
          <div className="mt-2 divide-y divide-outline-variant/20 rounded-md border border-outline-variant/25">
            {recommendations.length > 0 ? (
              recommendations.map((recommendation) => (
                <RecommendationLine key={recommendation.id} recommendation={recommendation} />
              ))
            ) : (
              <p className="p-3 text-sm text-on-surface-variant">Nothing needs a decision right now.</p>
            )}
          </div>
        </section>

        <section aria-labelledby="today-changes-title">
          <div className="flex items-center justify-between gap-3">
            <h2 id="today-changes-title" className="text-xs font-semibold uppercase tracking-telemetry text-outline">
              What changed
            </h2>
            <Link
              href="/activity"
              className="inline-flex items-center gap-1 text-xs font-semibold text-violet hover:text-tertiary"
            >
              All activity <ArrowRight aria-hidden="true" className="size-3" />
            </Link>
          </div>
          <div className="mt-2 divide-y divide-outline-variant/20 rounded-md border border-outline-variant/25">
            {alerts.length > 0 ? (
              alerts.map((alert) => <AlertLine key={alert.id} alert={alert} />)
            ) : (
              <p className="p-3 text-sm text-on-surface-variant">No unreviewed activity.</p>
            )}
          </div>
        </section>

        {/* Master Mold persists app-wide through the floating launcher/drawer;
            Today deliberately has no embedded chat block. The anchor keeps old
            #today-chat links landing sensibly (the launcher sits bottom-right). */}
        <span id="today-chat" aria-hidden="true" className="block" />

        <TodayMemoryRefresh compact />
      </div>
    </AppShell>
  );
}

function PlayLine({ play }: { play: DailyReportPlay }) {
  return (
    <details className="group" data-testid="today-play">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-3 py-2 marker:hidden [&::-webkit-details-marker]:hidden">
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${playActionTone(play.action)}`}>
          {play.action}
        </span>
        <span className="shrink-0 text-sm font-semibold text-on-surface">{play.symbol}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-on-surface-variant">{play.headline}</span>
        <span className="shrink-0 text-xs text-outline transition group-open:rotate-90">›</span>
      </summary>
      <div className="px-3 pb-3 text-sm leading-6 text-on-surface-variant">
        <p className="text-on-surface">{play.headline}</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs leading-5">
          {play.why.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="mt-2 text-[10px] uppercase tracking-wide text-outline">
          horizon: {play.horizon} · confidence: {play.confidence}
        </p>
      </div>
    </details>
  );
}

function playActionTone(action: DailyReportPlay["action"]) {
  if (action === "trim") return "border-caution/40 bg-caution/10 text-caution";
  if (action === "add") return "border-engine/35 bg-engine/10 text-engine";
  if (action === "watch") return "border-violet/40 bg-violet/10 text-violet";
  return "border-outline-variant/40 bg-surface-dim/40 text-on-surface-variant";
}

function RecommendationLine({ recommendation }: { recommendation: PortfolioRecommendation }) {
  return (
    <details className="group">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-3 py-2 marker:hidden [&::-webkit-details-marker]:hidden">
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${classificationTone(recommendation.classification)}`}>
          {recommendation.classification}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-on-surface">{recommendation.title}</span>
        <span className="shrink-0 text-xs text-outline transition group-open:rotate-90">›</span>
      </summary>
      <div className="px-3 pb-3 text-sm leading-6 text-on-surface-variant">
        <p>{recommendation.detail}</p>
        <p className="mt-1 text-xs text-outline">{recommendation.reason}</p>
        <Link href={recommendation.href} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-violet hover:text-tertiary">
          Open <ArrowRight aria-hidden="true" className="size-3" />
        </Link>
      </div>
    </details>
  );
}

function AlertLine({ alert }: { alert: AlertJson }) {
  return (
    <details className="group">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-3 py-2 marker:hidden [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden="true"
          className={`size-2 shrink-0 rounded-full ${
            alert.tier === "T0" ? "bg-critical" : alert.tier === "T1" ? "bg-caution" : "bg-outline"
          }`}
        />
        <span className="min-w-0 flex-1 truncate text-sm text-on-surface">{cleanAlertMessage(alert.message)}</span>
        {alert.asset_symbol && alert.asset_symbol !== "Unknown" ? (
          <span className="shrink-0 text-xs text-outline">{alert.asset_symbol}</span>
        ) : null}
      </summary>
      <p className="px-3 pb-3 text-sm leading-6 text-on-surface-variant">{alert.rationale}</p>
    </details>
  );
}

function briefProse(report: DailyReport) {
  const focus = report.focus.summary?.trim() ?? "";
  // The why bullets often restate the summary; keep only the ones that add anything.
  const why = report.focus.why
    .filter(Boolean)
    .filter((line) => !focus.includes(line.slice(0, 24)))
    .join(" ");
  return [focus, why].filter(Boolean).join(" ") || "Nothing urgent in the latest read.";
}

function topMovers(report: DailyReport | null) {
  if (!report) return [];
  return report.market_rows
    .filter((row) => row.daily_move_pct !== null && row.status === "refreshed")
    .map((row) => ({ symbol: row.symbol, move: row.daily_move_pct as number }))
    .sort((a, b) => Math.abs(b.move) - Math.abs(a.move))
    .slice(0, 4);
}

function todayDateLine(report: DailyReport | null) {
  const formatted = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  if (!report) return `${formatted} · auto-reads daily at 7:15am`;
  const savedAt = new Date(report.created_at).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${formatted} · read saved ${savedAt} · auto-reads daily at 7:15am`;
}

function classificationTone(classification: PortfolioRecommendation["classification"]) {
  if (classification === "Trim candidate") return "border-caution/40 bg-caution/10 text-caution";
  if (classification === "Review") return "border-critical/35 bg-critical/10 text-critical";
  if (classification === "Add candidate" || classification === "Paper test first") return "border-engine/35 bg-engine/10 text-engine";
  return "border-outline-variant/40 bg-surface-dim/40 text-on-surface-variant";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function formatChange(value: number, pct: number) {
  const sign = value >= 0 ? "+" : "-";
  return `${sign}${formatCurrency(Math.abs(value)).replace("$", "$")} (${sign}${Math.abs(pct).toFixed(1)}%)`;
}
