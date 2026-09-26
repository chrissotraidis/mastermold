import Link from "next/link";
import { ArrowRight, Inbox, Sparkles } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AutomationHealthBanner } from "@/components/automation-health-banner";
import { MasterMoldHero } from "@/components/master-mold-hero";
import { DailyReportRefreshButton } from "@/components/daily-report-refresh-button";
import { TodayMemoryRefresh } from "@/components/today-memory-refresh";
import { TodayReadTimer } from "@/components/today-metrics";
import { TodayDecisionControls } from "@/components/today-decision-controls";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { StatTile } from "@/components/ui/stat";
import { productProvenanceLabel } from "@/lib/provenance-copy";
import { toPublicAlert } from "@/lib/public-api-copy";
import { TodayAlertList } from "@/components/today-alert-list";
import { parseAsOf } from "@/src/db/bitemporal";
import { describeTrackRecord, gradePlayHistory, playTrackRecord } from "@/src/db/play-outcomes";
import { store } from "@/src/db/store";
import { getAlerts, type AlertJson } from "@/src/db/alerts";
import { cleanAlertMessage } from "@/lib/alert-loop";
import {
  ensureDailyReportAutoRefresh,
  getLatestDailyReport,
  type DailyReport,
  type DailyReportPlay,
} from "@/src/db/daily-report";
import {
  getTodayDecisionResponses,
  playCanCreateJournalCall,
  todayDecisionInbox,
  type TodayDecisionResponse,
} from "@/src/db/today-decisions";
import { getDataMode } from "@/src/db/engine-data";
import { getPortfolio } from "@/src/db/portfolio";
import { getMoneySummary } from "@/src/db/money";
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
  const decisionPlays = todayDecisionInbox(report);
  const decisionResponses = report ? getTodayDecisionResponses(report.id) : new Map();
  const recommendations = getPortfolioRecommendations(asOf, 5);
  const alerts = getAlerts(asOf).filter((alert) => !alert.acknowledged).slice(0, 5);
  const topHolding = portfolio.holdings[0] ?? null;
  const hasPersonalPortfolio =
    portfolio.provenance.label === "Manual portfolio" || portfolio.provenance.label === "Imported portfolio";
  const pageDataMode = hasPersonalPortfolio ? portfolio.provenance.label : dataMode.label;
  const movers = topMovers(report);
  // Accountability: every directional play is graded against what the price
  // actually did (pure derivation over stored reports; see play-outcomes.ts).
  const trackRecordLine = asOf
    ? null
    : describeTrackRecord(playTrackRecord(gradePlayHistory(store().dailyReports(90))));

  // One feed, each symbol once: decisions first, then recommendations for
  // symbols no decision already covers. Activity about a covered symbol stays
  // in the Activity inbox instead of repeating here.
  const coveredSymbols = new Set(decisionPlays.map((play) => play.symbol.toUpperCase()));
  const extraRecommendations = recommendations.filter((recommendation) => {
    const symbol = recommendation.symbol.toUpperCase();
    if (coveredSymbols.has(symbol)) return false;
    coveredSymbols.add(symbol);
    return true;
  });
  const freshAlerts = alerts.filter(
    (alert) => !alert.asset_symbol || !coveredSymbols.has(alert.asset_symbol.toUpperCase()),
  );
  const hiddenAlertCount = alerts.length - freshAlerts.length;
  const focusSymbol = report?.focus.symbol?.toUpperCase() ?? null;
  const briefFoldsIntoDecision = Boolean(focusSymbol && decisionPlays.some((play) => play.symbol.toUpperCase() === focusSymbol));
  // Net worth is assets minus debts from the money hub, not just holdings.
  const money = hasPersonalPortfolio ? getMoneySummary(portfolio) : null;
  const trend = (money?.history ?? portfolio.net_worth_series).map((point) => point.value);
  const openItems = decisionPlays.length + extraRecommendations.length;
  const marketRows = marketTable(report);
  const lede = todayLede({
    decisions: openItems,
    changes: freshAlerts.length,
    personal: hasPersonalPortfolio,
    reportAt: report?.created_at ?? null,
  });

  return (
    <AppShell dataMode={productProvenanceLabel(pageDataMode)}>
      <TodayReadTimer />
      {/* [&>*]:min-w-0 — keeps one long headline from widening grid tracks
          past the phone viewport. */}
      <div className="grid w-full grid-cols-1 gap-6 [&>*]:min-w-0">
        <header className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <MasterMoldHero state={openItemsState(decisionPlays.length)} className="w-20 shrink-0 sm:w-28" />
            <div className="min-w-0">
              <p className="mm-eyebrow">{todayDateLine(report)}</p>
              <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-on-surface sm:text-4xl">Today</h1>
              <p className="mt-1 text-sm leading-5 text-on-surface-variant" data-testid="today-lede">{lede}</p>
            </div>
          </div>
          <DailyReportRefreshButton variant="ghost" />
        </header>
        <div className="empty:hidden">
          <AutomationHealthBanner />
        </div>

        <div data-testid="today-pulse">
          {hasPersonalPortfolio ? (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile
                emphasis
                label="Net worth"
                value={formatCurrency(money?.net_worth ?? portfolio.total_market_value)}
                trend={trend}
                deltaTone={portfolio.daily_change_value >= 0 ? "up" : "down"}
                delta={`${formatChange(portfolio.daily_change_value, portfolio.daily_change_pct)} today`}
              />
              <StatTile
                label="Largest position"
                value={topHolding ? topHolding.symbol : "—"}
                hint={topHolding ? `${topHolding.weight_pct.toFixed(0)}% of the book` : "No holdings yet"}
              />
              <StatTile label="Decisions" value={String(openItems)} hint={openItems ? "waiting on you" : "all clear"} deltaTone="magenta" />
              <StatTile label="New activity" value={String(freshAlerts.length)} hint="unreviewed" />
            </div>
          ) : (
            <Panel className="flex flex-col gap-4 border-violet/30 p-5 sm:flex-row sm:items-center">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-violet/15 text-violet ring-1 ring-violet/30">
                <Sparkles aria-hidden="true" className="size-5" />
              </span>
              <p className="min-w-0 flex-1 text-sm leading-6 text-on-surface-variant">
                <span className="font-display text-base font-semibold text-on-surface">Sample portfolio</span>
                <br />
                Add or import your holdings before treating this brief as personal.
              </p>
              <Link
                href="/portfolio#add-holdings"
                className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-violet px-4 text-sm font-semibold text-void shadow-glow transition hover:bg-violet/90"
              >
                Add your money <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </Panel>
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 [&>*]:min-w-0">
          <Panel className="min-w-0 overflow-hidden lg:col-span-7" aria-labelledby="today-plays-title">
            <PanelHeader
              titleId="today-plays-title"
              eyebrow={
                hasPersonalPortfolio
                  ? `01 · ${decisionPlays[0]?.source === "llm" ? "Model-written, validated" : "Rules from your data"}`
                  : "01 · Demo on sample holdings"
              }
              title="Decision inbox"
              description="One to three decisions, ranked from the latest saved inputs."
            />
            <div className="p-3 pt-4">
              {decisionPlays.length === 0 && extraRecommendations.length === 0 ? (
                <EmptyState
                  icon={Inbox}
                  title="Nothing needs a decision right now."
                  description={report ? "The latest read found nothing to act on." : "No decision inbox is saved yet. Refresh the daily read to build it from your holdings and today\u2019s moves."}
                />
              ) : (
                <div className="grid grid-cols-1 gap-1 [&>*]:min-w-0">
                  {decisionPlays.map((play, index) => (
                    <PlayLine
                      key={play.id}
                      play={play}
                      reportId={report!.id}
                      canSaveCall={playCanCreateJournalCall(report!, play)}
                      initialResponse={decisionResponses.get(play.id) ?? null}
                      brief={index === 0 && briefFoldsIntoDecision && report ? report.focus.summary?.trim() || null : null}
                      extraWhy={index === 0 && briefFoldsIntoDecision && report ? report.focus.why : []}
                    />
                  ))}
                  {extraRecommendations.length > 0 ? (
                    <>
                      <p className="mm-eyebrow px-3 pb-1 pt-4">Worth your attention</p>
                      {extraRecommendations.map((recommendation) => (
                        <RecommendationLine key={recommendation.id} recommendation={recommendation} />
                      ))}
                    </>
                  ) : null}
                </div>
              )}
            </div>
          </Panel>

          <div className="grid grid-cols-1 content-start gap-6 lg:col-span-5 [&>*]:min-w-0">
            <Panel aria-labelledby="today-brief-title">
              <PanelHeader titleId="today-brief-title" eyebrow="02 · Market read" title="Markets" />
              <div className="space-y-4 p-5 pt-3">
                {report ? (
                  <>
                    {briefFoldsIntoDecision ? null : <p className="text-sm leading-6 text-on-surface">{briefProse(report)}</p>}
                    {movers.length > 0 ? (
                      <table className="w-full text-sm" data-testid="today-movers">
                        <thead>
                          <tr className="text-left text-[11px] uppercase tracking-wide text-outline">
                            <th className="pb-2 font-medium">Symbol</th>
                            <th className="pb-2 text-right font-medium">Last</th>
                            <th className="pb-2 text-right font-medium">Day</th>
                            <th className="pb-2 text-right font-medium">Volume</th>
                          </tr>
                        </thead>
                        <tbody>
                          {marketRows.map((row) => (
                            <tr key={row.symbol} className="border-t border-outline-variant/40">
                              <td className="py-2 font-semibold text-on-surface">{row.symbol}</td>
                              <td className="mm-num py-2 text-right text-on-surface-variant">{formatPrice(row.last)}</td>
                              <td className={`mm-num py-2 text-right font-semibold ${row.move >= 0 ? "text-engine" : "text-critical"}`}>
                                {row.move >= 0 ? "+" : ""}
                                {row.move.toFixed(1)}%
                              </td>
                              <td className="mm-num py-2 text-right text-on-surface-variant">
                                {row.volumeRatio === null ? "—" : `${row.volumeRatio.toFixed(1)}×`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : briefFoldsIntoDecision ? (
                      <p className="text-sm text-on-surface-variant">No refreshed price moves in the latest read.</p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm leading-6 text-on-surface-variant">
                    No report saved yet for today. Refresh to read the portfolio and market now.
                  </p>
                )}
              </div>
            </Panel>

            <Panel aria-labelledby="today-changes-title">
              <PanelHeader
                titleId="today-changes-title"
                eyebrow="03 · Activity"
                title="What changed"
                action={
                  <Link href="/activity" className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-violet hover:text-violet-soft">
                    All activity <ArrowRight aria-hidden="true" className="size-3" />
                  </Link>
                }
              />
              <div className="p-2 pt-2">
                {asOf ? (
                  freshAlerts.length > 0 ? (
                    freshAlerts.map((alert) => <AlertLine key={alert.id} alert={alert} />)
                  ) : (
                    <p className="p-3 text-sm text-on-surface-variant">No unreviewed activity.</p>
                  )
                ) : (
                  <TodayAlertList initialAlerts={freshAlerts.map(toPublicAlert)} />
                )}
                {hiddenAlertCount > 0 ? (
                  <p className="px-3 pb-2 pt-1 text-xs text-outline">
                    {hiddenAlertCount} more about symbols already in your decisions.
                  </p>
                ) : null}
              </div>
            </Panel>
          </div>
        </div>

        {/* Master Mold persists app-wide through the floating launcher/drawer;
            Today deliberately has no embedded chat block. The anchor keeps old
            #today-chat links landing sensibly. */}
        <span id="today-chat" aria-hidden="true" className="block" />

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant/40 pt-4">
          <p className="text-xs leading-5 text-outline">{trackRecordLine ?? "Calls you save are graded against the price three days later."}</p>
          <TodayMemoryRefresh compact />
        </div>
      </div>
    </AppShell>
  );
}

function openItemsState(decisionCount: number) {
  return decisionCount > 0 ? ("suggestion" as const) : ("idle" as const);
}

function PlayLine({ play, reportId, canSaveCall, initialResponse, brief, extraWhy }: {
  play: DailyReportPlay;
  reportId: string;
  canSaveCall: boolean;
  initialResponse: TodayDecisionResponse | null;
  brief: string | null;
  extraWhy: string[];
}) {
  const lead = brief ?? play.headline;
  // Each reason once: drop lines the lead sentence already says, and lines
  // that repeat another reason's opening.
  const seen = new Set<string>();
  const reasons = [...play.why, ...extraWhy].filter((line) => {
    const key = line.trim().slice(0, 16).toLowerCase();
    if (!key || seen.has(key) || lead.toLowerCase().includes(key)) return false;
    seen.add(key);
    return true;
  });
  return (
    <details className="group min-w-0 mm-row open:bg-surface-high/40" data-testid="today-play" open={Boolean(brief) || undefined}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-3 py-2.5 marker:hidden [&::-webkit-details-marker]:hidden">
        <Badge variant={playActionVariant(play.action)} className="shrink-0 uppercase tracking-wide">
          {play.action}
        </Badge>
        <span className="shrink-0 font-display text-sm font-semibold text-on-surface">{play.symbol}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-on-surface-variant">{play.headline}</span>
        <span className="shrink-0 text-xs text-outline transition group-open:rotate-90">›</span>
      </summary>
      <div className="px-3 pb-4 text-sm leading-6 text-on-surface-variant">
        <p className="text-on-surface">{lead}</p>
        <ul className="mt-2 space-y-1 text-xs leading-5">
          {reasons.map((line) => (
            <li key={line} className="flex gap-2">
              <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-violet" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 font-mono text-[10px] uppercase tracking-wide text-outline">
          horizon: {play.horizon} · confidence: {play.confidence}
        </p>
        <TodayDecisionControls
          reportId={reportId}
          play={play}
          canSaveCall={canSaveCall}
          initialResponse={initialResponse}
        />
      </div>
    </details>
  );
}

function playActionVariant(action: DailyReportPlay["action"]) {
  if (action === "trim") return "caution" as const;
  if (action === "add") return "up" as const;
  if (action === "watch") return "magenta" as const;
  return "muted" as const;
}

function RecommendationLine({ recommendation }: { recommendation: PortfolioRecommendation }) {
  return (
    <details className="group min-w-0 mm-row open:bg-surface-high/40">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-3 py-2.5 marker:hidden [&::-webkit-details-marker]:hidden">
        <Badge variant={classificationVariant(recommendation.classification)} className="shrink-0">
          {recommendation.classification}
        </Badge>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-on-surface">{recommendation.title}</span>
        <span className="shrink-0 text-xs text-outline transition group-open:rotate-90">›</span>
      </summary>
      <div className="px-3 pb-4 text-sm leading-6 text-on-surface-variant">
        <p>{recommendation.detail}</p>
        <p className="mt-1 text-xs text-outline">{recommendation.reason}</p>
        <Link href={recommendation.href} className="mt-2 inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-violet hover:text-violet-soft">
          Open <ArrowRight aria-hidden="true" className="size-3" />
        </Link>
      </div>
    </details>
  );
}

function AlertLine({ alert }: { alert: AlertJson }) {
  return (
    <details className="group mm-row">
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

/** Every refreshed row, biggest move first, for the compact market table. */
function marketTable(report: DailyReport | null) {
  if (!report) return [];
  return report.market_rows
    .filter((row) => row.daily_move_pct !== null && row.status === "refreshed")
    .map((row) => ({
      symbol: row.symbol,
      last: row.latest_close,
      move: row.daily_move_pct as number,
      volumeRatio: row.volume_ratio,
    }))
    .sort((a, b) => Math.abs(b.move) - Math.abs(a.move))
    .slice(0, 8);
}

function formatPrice(value: number | null) {
  if (value === null) return "—";
  return value >= 1000
    ? value.toLocaleString("en-US", { maximumFractionDigits: 0 })
    : value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** One sentence that says what the page holds before any panel does. */
function todayLede(input: { decisions: number; changes: number; personal: boolean; reportAt: string | null }) {
  const parts = [
    input.decisions === 0 ? "Nothing to decide" : `${input.decisions} decision${input.decisions === 1 ? "" : "s"} waiting`,
    input.changes === 0 ? "no new activity" : `${input.changes} new change${input.changes === 1 ? "" : "s"}`,
  ];
  if (!input.reportAt) parts.push("no market read yet");
  const sentence = `${parts.join(", ")}.`;
  return input.personal ? sentence : `${sentence} Showing sample holdings until you add yours.`;
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
  return `${formatted} · report saved ${savedAt}`;
}

function classificationVariant(classification: PortfolioRecommendation["classification"]) {
  if (classification === "Trim candidate") return "caution" as const;
  if (classification === "Review") return "down" as const;
  if (classification === "Add candidate" || classification === "Paper test first") return "up" as const;
  return "muted" as const;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function formatChange(value: number, pct: number) {
  const sign = value >= 0 ? "+" : "-";
  return `${sign}${formatCurrency(Math.abs(value))} (${sign}${Math.abs(pct).toFixed(1)}%)`;
}
