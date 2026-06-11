import Link from "next/link";
import type { ComponentType } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BookOpenText,
  CircleSlash2,
  LineChart,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { AsOfReplayControl } from "@/components/as-of-replay-control";
import { AppShell } from "@/components/app-shell";
import { AskMasterMoldButton } from "@/components/master-mold-actions";
import { DailyBriefingCard } from "@/components/briefing-card";
import { AlertQueueButton, AlertStatButton } from "@/components/open-alerts-action";
import { ProfileGreeting } from "@/components/profile-greeting";
import { ProvenanceChip } from "@/components/provenance-chip";
import { SentinelFace } from "@/components/sentinel-face";
import { TodayMemoryRefresh } from "@/components/today-memory-refresh";
import { BriefingUsefulnessFeedback, TodayReadTimer } from "@/components/today-metrics";
import { Badge } from "@/components/ui/badge";
import { buildAlertSuggestedResponse, cleanAlertMessage, shortAlertTierLabel } from "@/lib/alert-loop";
import { plainBriefingHeadline, plainBriefingText } from "@/lib/plain-finance-copy";
import {
  buildTodayPaperHref,
  buildTodayPrompt,
  buildTodayRiskNote,
  todayHoldingDetail,
  todayMorningSummary,
} from "@/lib/today-decision-copy";
import { buildTodayReadiness, type TodayReadiness } from "@/lib/today-readiness-copy";
import { productProvenanceLabel, productProvenanceSource } from "@/lib/provenance-copy";
import { parseAsOf } from "@/src/db/bitemporal";
import { getAlerts } from "@/src/db/alerts";
import { getBrainState } from "@/src/db/brain";
import { getBriefingCards } from "@/src/db/briefing";
import { getDataMode } from "@/src/db/engine-data";
import { getPortfolio } from "@/src/db/portfolio";
import { getSystemState } from "@/src/db/system";

export const dynamic = "force-dynamic";

type DeckPageProps = {
  searchParams?: Promise<{ as_of?: string }>;
};

export default async function DeckPage({ searchParams }: DeckPageProps) {
  const params = await searchParams;
  const parsedAsOf = parseAsOf(params?.as_of ?? null);
  const asOf = parsedAsOf.ok ? parsedAsOf.asOf : null;
  const system = getSystemState(asOf);
  const dataMode = getDataMode(asOf);
  const cards = getBriefingCards(asOf);
  const alerts = getAlerts(asOf);
  const portfolio = getPortfolio(asOf);
  const brain = getBrainState(asOf);
  const pageDataMode =
    portfolio.provenance.label === "Manual portfolio" || portfolio.provenance.label === "Imported portfolio"
      ? portfolio.provenance.label
      : dataMode.label;
  const publicPageDataMode = productProvenanceLabel(pageDataMode);
  const actionableCards = cards.filter((c) => c.status === "actionable");
  const portfolioAwareCards = orderTodayCardsForPortfolio(actionableCards, portfolio);
  const topCard = portfolioAwareCards[0] ?? cards[0] ?? null;
  const topCardHeadline = topCard ? plainBriefingHeadline(topCard.headline) : "";
  const topAlert = alerts.find((a) => !a.acknowledged) ?? alerts[0] ?? null;
  const topHolding = portfolio.holdings[0] ?? null;
  const openAlerts = alerts.filter((a) => !a.acknowledged);
  const topAlertResponse = topAlert ? buildAlertSuggestedResponse(topAlert) : "";
  const dailyPrompt = buildTodayPrompt(topCard, topAlert, topHolding);
  const readiness = buildTodayReadiness({ portfolio, dataMode, brain });
  const riskNote = buildTodayRiskNote({
    topHoldingPct: topHolding?.weight_pct ?? 0,
    topHoldingSymbol: topHolding?.symbol ?? "None",
    activeAlerts: openAlerts.length,
    highScored: actionableCards.filter((card) => card.conviction >= 7).length,
  });

  return (
    <AppShell dataMode={publicPageDataMode} faceState={system.state}>
      <TodayReadTimer />
      <div className="mx-auto max-w-6xl space-y-7">
        <section
          className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_21rem]"
          aria-labelledby="today-title"
        >
          <div className="space-y-5">
            <div className="border border-outline-variant/40 bg-panel/70 p-4 chamfer-sm sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="mb-2 flex flex-wrap items-center gap-2 text-xs text-outline">
                    <ProvenanceChip
                      label={publicPageDataMode}
                      title={productProvenanceSource(pageDataMode, portfolio.provenance.source)}
                    />
                    <span aria-hidden="true" className="text-outline/70"> · </span>
                    <span>{system.updatedLabel}</span>
                  </p>
                  <ProfileGreeting />
                  <h1
                    id="today-title"
                    className="mt-1 max-w-3xl text-balance font-display text-2xl font-semibold leading-tight text-on-surface sm:text-3xl"
                  >
                    Today's focus
                  </h1>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-on-surface-variant">
                    {todayMorningSummary(actionableCards.length, openAlerts.length, topCard, topAlert)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="hidden text-right sm:block">
                    <p className="font-mono text-[11px] uppercase tracking-telemetry text-outline">
                      Master Mold
                    </p>
                    <p className="text-sm text-on-surface-variant">Advisory only</p>
                  </div>
                  <div className="hidden size-16 shrink-0 sm:block">
                    <SentinelFace state={system.state} />
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
                <AskMasterMoldButton prompt={dailyPrompt} variant="primary" className="w-full sm:w-auto">
                  Ask for today's read
                </AskMasterMoldButton>
                <Link
                  href={buildTodayPaperHref(topHolding, topCard)}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-caution/35 bg-caution/10 px-3 py-2 text-sm font-semibold text-caution transition hover:bg-caution/15 sm:w-auto"
                >
                  <Wallet aria-hidden="true" className="size-4" />
                  Test as paper trade
                </Link>
                <BriefingUsefulnessFeedback />
              </div>

            </div>

            <section id="briefing" className="scroll-mt-24" aria-labelledby="briefing-title">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 id="briefing-title" className="font-display text-lg font-semibold tracking-tight text-on-surface">
                    Daily rundown
                  </h2>
                  <p className="mt-1 text-sm text-outline">
                    Review the few items that could change a decision.
                  </p>
                </div>
              </div>

              {actionableCards.length > 0 ? (
                <div className="grid gap-4">
                  {portfolioAwareCards.slice(0, 3).map((card, index) => (
                    <DailyBriefingCard
                      key={card.id}
                      id={card.id}
                      rank={index + 1}
                      headline={plainBriefingHeadline(card.headline)}
                      relevance={plainBriefingText(card.relevance_note || card.why_now)}
                      confidence={card.conviction}
                      horizon={card.horizon}
                      nothing={card.status === "nothing_actionable"}
                      provenance={{
                        label: productProvenanceLabel(card.provenance.label),
                        source: productProvenanceSource(card.provenance.label, card.provenance.source),
                      }}
                      sourceNotes={todayRecommendationSourceNotes(card, portfolio, brain, dataMode)}
                    />
                  ))}
                </div>
              ) : (
                <NothingActionable isEngine={dataMode.label === "Engine output"} />
              )}
            </section>

            <section className="grid gap-3 md:grid-cols-3" aria-label="Portfolio context for today">
              <MorningStat
                icon={LineChart}
                label="Top exposure"
                value={topHolding ? `${topHolding.symbol} · ${topHolding.weight_pct.toFixed(1)}%` : "No holding"}
                detail={todayHoldingDetail(topHolding)}
                href="/portfolio"
              />
              <MorningStat
                icon={AlertTriangle}
                label="Top alert"
                value={topAlert ? `${shortAlertTierLabel(topAlert.tier)} · ${cleanAlertMessage(topAlert.message)}` : "All clear"}
                detail={topAlert ? topAlertResponse : "Nothing needs attention right now"}
                tone={topAlert?.tier === "T0" ? "critical" : "caution"}
                alertAction
              />
              <MorningStat
                icon={BookOpenText}
                label="Top idea"
                value={topCard ? topCardHeadline : "No idea ready"}
                detail={
                  topCard
                    ? `Confidence ${topCard.conviction}/10 · ${topCard.horizon}. ${plainBriefingText(topCard.relevance_note)}`
                    : "No market idea is ready yet"
                }
                href={topCard ? `/briefing/${topCard.id}` : "/review"}
                tone={topCard && topCard.conviction >= 7 ? "engine" : "violet"}
              />
            </section>

            <AsOfReplayControl activeAsOf={asOf?.iso ?? null} apiPath="/api/briefing" />
          </div>

          <aside className="grid gap-3">
            <DecisionQueueCard
              title="Needs attention"
              items={[
                queueItem(
                  topAlert ? "Check the top alert" : "Alerts are quiet",
                  topAlert ? topAlertResponse : "No action required",
                  Boolean(topAlert && !topAlert.acknowledged),
                  "alerts",
                ),
                queueItem(
                  topCard ? "Review the top idea" : "No idea ready",
                  topCard ? `${topCard.conviction}/10 · ${topCard.horizon}` : "Use the sample rundown or check what is real",
                  topCard ? `/briefing/${topCard.id}` : "/review",
                  Boolean(topCard && topCard.status === "actionable"),
                  "link",
                ),
              ]}
            />
            <div className="border border-outline-variant/40 bg-surface-high/35 p-4 chamfer-sm">
              <p className="font-mono text-[11px] uppercase tracking-telemetry text-outline">Risk note</p>
              <p className="mt-2 text-sm leading-6 text-on-surface-variant">{riskNote}</p>
            </div>
            <TodaySourceTrail
              market={{
                value: dataMode.label === "Engine output" ? "Saved read" : "Sample market data",
                detail:
                  dataMode.label === "Engine output"
                    ? `Known ${formatTodaySourceTime(dataMode.as_of)}.`
                    : "No saved market read is loaded.",
              }}
              portfolio={{
                value: todayPortfolioSourceLabel(portfolio.provenance.label),
                detail: todayPortfolioSourceDetail(portfolio),
              }}
              memory={{
                value: brain.summary.snapshot_freshness,
                detail: todayMemoryDetail(brain, asOf?.iso ?? null),
              }}
              readiness={readiness}
              replayAsOf={asOf?.iso ?? null}
            />
          </aside>
        </section>

        <section className="grid gap-3 sm:grid-cols-3" aria-label="More places to review">
          <FooterLink href="/portfolio" icon={LineChart} label="Portfolio" note="Holdings snapshots and concentration" />
          <FooterLink href="/paper" icon={Wallet} label="Paper trading" note="Test ideas in the simulator" />
          <FooterLink href="/review" icon={ShieldCheck} label="Performance" note="Past calls, limits, and trust" />
        </section>
      </div>
    </AppShell>
  );
}

function TodaySourceTrail({
  market,
  portfolio,
  memory,
  readiness,
  replayAsOf,
}: {
  market: { value: string; detail: string };
  portfolio: { value: string; detail: string };
  memory: { value: string; detail: string };
  readiness: TodayReadiness;
  replayAsOf?: string | null;
}) {
  const rows = [
    ["Market read", market.value, market.detail],
    ["Portfolio", portfolio.value, portfolio.detail],
    ["Memory", memory.value, memory.detail],
  ];

  return (
    <div className="border border-outline-variant/40 bg-surface-high/35 p-4 chamfer-sm">
      <p className="font-mono text-[11px] uppercase tracking-telemetry text-outline">Today's inputs</p>
      <dl className="mt-3 space-y-3">
        {rows.map(([label, value, detail]) => (
          <div key={label}>
            <dt className="text-xs font-semibold uppercase text-outline">{label}</dt>
            <dd className="mt-1 text-sm font-semibold text-on-surface">{value}</dd>
            <dd className="text-xs leading-5 text-on-surface-variant">{detail}</dd>
          </div>
        ))}
      </dl>
      {replayAsOf ? (
        <p className="mt-3 rounded-md border border-outline-variant/35 bg-surface-dim/35 p-3 text-xs leading-5 text-on-surface-variant">
          Rewind is showing what was known then. Return to Now before saving this view for chat.
        </p>
      ) : (
        <TodayMemoryRefresh />
      )}
      <div className="mt-3 rounded-md border border-outline-variant/35 bg-surface-dim/35 p-3">
        <p className="text-xs font-semibold uppercase text-outline">{readiness.title}</p>
        <p className="mt-1 text-sm font-semibold text-on-surface">{readiness.label}</p>
        <p className="mt-1 text-xs leading-5 text-on-surface-variant">{readiness.detail}</p>
        <Link
          href={readiness.href}
          className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-violet hover:text-on-surface"
        >
          {readiness.action}
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </div>
      <Link
        href="/review"
        className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-violet hover:text-on-surface"
      >
        See what is real
        <ArrowRight aria-hidden="true" className="size-4" />
      </Link>
    </div>
  );
}

function todayPortfolioSourceDetail(portfolio: ReturnType<typeof getPortfolio>) {
  if (portfolio.provenance.label === "Imported portfolio") {
    return `${portfolio.import_snapshot.status}; imported holdings snapshots do not refresh by themselves.`;
  }
  if (portfolio.provenance.label === "Manual portfolio") {
    return "Local manual entries plus sample data.";
  }
  return "Sample data only until you add manual holdings or import a holdings snapshot.";
}

function todayPortfolioSourceLabel(label: ReturnType<typeof getPortfolio>["provenance"]["label"]) {
  if (label === "Demo data") return "Sample data";
  return label;
}

function todayMemoryDetail(brain: ReturnType<typeof getBrainState>, replayAsOf: string | null = null) {
  if (!brain.initialized) {
    if (replayAsOf) {
      return "No chat context snapshot had been saved by this rewind point.";
    }
    return "No app context has been saved for chat yet.";
  }

  if (replayAsOf) {
    return `${brain.summary.memory_count} saved context notes were known by this rewind point. Current chat context is hidden while rewound.`;
  }

  const boundary = brain.schedule.enabled
    ? `${todayMemoryStatusLabel(brain.schedule.status)}; saves app context only. Import holdings again when balances change.`
    : `${todayMemoryStatusLabel(brain.schedule.status)}. Use Save context for chat when you want Master Mold to remember this view.`;

  return `${brain.summary.memory_count} saved context notes. ${boundary}`;
}

function todayMemoryStatusLabel(status: string) {
  if (/local memory check armed/i.test(status)) return "Chat context check armed";
  if (/ready for local memory check/i.test(status)) return "Ready to save chat context";
  if (/manual only/i.test(status)) return "Manual save only";
  return status.replace(/\blocal memory\b/gi, "chat context");
}

function todayRecommendationSourceNotes(
  card: ReturnType<typeof getBriefingCards>[number],
  portfolio: ReturnType<typeof getPortfolio>,
  brain: ReturnType<typeof getBrainState>,
  dataMode: ReturnType<typeof getDataMode>,
) {
  const relatedHolding = findRelatedHolding(card, portfolio);
  const memoryFact = findRelatedMemoryFact(card, brain, relatedHolding?.symbol ?? null);
  const notes = [
    dataMode.label === "Engine output"
      ? `Market read: saved read known ${formatTodaySourceTime(dataMode.as_of)}.`
      : "Market read: sample market examples; no broad scan is running.",
    relatedHolding
      ? `Portfolio: ${relatedHolding.symbol} is ${relatedHolding.weight_pct.toFixed(1)}% of visible holdings.`
      : `Portfolio: ${portfolio.provenance.label}; no matching visible holding was found for this idea.`,
    brain.initialized
      ? `Memory: ${brain.summary.snapshot_freshness}; ${memoryFact ? todayMemorySourceSummary(memoryFact.summary) : `no matching saved context note for this idea; ${brain.summary.memory_count} saved context notes are available.`}`
      : "Memory: no saved chat context yet.",
  ];

  return notes.map((note) => plainBriefingText(note)).filter(Boolean);
}

function orderTodayCardsForPortfolio(
  cards: ReturnType<typeof getBriefingCards>,
  portfolio: ReturnType<typeof getPortfolio>,
) {
  return [...cards].sort((a, b) => {
    const aWeight = findRelatedHolding(a, portfolio)?.weight_pct ?? 0;
    const bWeight = findRelatedHolding(b, portfolio)?.weight_pct ?? 0;

    return bWeight - aWeight || b.conviction - a.conviction || a.rank - b.rank;
  });
}

function todayMemorySourceSummary(summary: string) {
  const cleaned = plainBriefingText(summary);
  if (!/demo portfolio|sample portfolio/i.test(cleaned)) return cleaned;
  return cleaned
    .replace(/\bdemo portfolio\b/gi, "sample portfolio")
    .replace(/\bin the sample portfolio, not imported money at\b/gi, "in the sample portfolio at")
    .replace(/\bat ([\d.]+)%\.$/, "at $1%. It is sample data, not imported money.");
}

function findRelatedHolding(
  card: ReturnType<typeof getBriefingCards>[number],
  portfolio: ReturnType<typeof getPortfolio>,
) {
  const searchable = `${card.headline} ${card.asset_ids.join(" ")}`.toLowerCase();
  return portfolio.holdings.find((holding) => searchable.includes(holding.symbol.toLowerCase())) ?? null;
}

function findRelatedMemoryFact(
  card: ReturnType<typeof getBriefingCards>[number],
  brain: ReturnType<typeof getBrainState>,
  relatedSymbol: string | null,
) {
  const searchable = `${card.headline} ${card.asset_ids.join(" ")}`.toLowerCase();
  return (
    brain.facts.find((fact) => fact.symbol && relatedSymbol && fact.symbol === relatedSymbol) ??
    brain.facts.find((fact) => fact.symbol && searchable.includes(fact.symbol.toLowerCase())) ??
    brain.facts[0] ??
    null
  );
}

function formatTodaySourceTime(value: string | null) {
  if (!value) return "from the saved read";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "from the saved read";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

function queueItem(
  label: string,
  detail: string,
  href: string,
  active: boolean,
  kind?: "link",
): { label: string; detail: string; href: string; active: boolean; kind: "link" };
function queueItem(
  label: string,
  detail: string,
  active: boolean,
  kind: "alerts",
): { label: string; detail: string; active: boolean; kind: "alerts" };
function queueItem(
  label: string,
  detail: string,
  hrefOrActive: string | boolean,
  activeOrKind: boolean | "alerts",
  kind: "link" | undefined = "link",
) {
  if (activeOrKind === "alerts") {
    return { label, detail, active: Boolean(hrefOrActive), kind: "alerts" as const };
  }
  return { label, detail, href: String(hrefOrActive), active: activeOrKind, kind };
}

function DecisionQueueCard({
  title,
  items,
}: {
  title: string;
  items: Array<
    | { label: string; detail: string; href: string; active: boolean; kind: "link" }
    | { label: string; detail: string; active: boolean; kind: "alerts" }
  >;
}) {
  return (
    <div className="border border-outline-variant/40 bg-surface-high/35 p-4 chamfer-sm">
      <h2 className="font-display text-lg font-semibold text-on-surface">{title}</h2>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item.label}>
            {item.kind === "alerts" ? (
              <AlertQueueButton label={item.label} detail={item.detail} active={item.active} />
            ) : (
              <Link
                href={item.href}
                className="group flex items-start gap-3 rounded-md border border-outline-variant/35 bg-surface-dim/35 p-3 transition-colors hover:border-violet/50 hover:bg-violet/10"
              >
                <span
                  className={`mt-1 size-2 shrink-0 rounded-full ${item.active ? "bg-violet" : "bg-outline-variant"}`}
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-on-surface">{item.label}</span>
                  <span className="mt-0.5 line-clamp-2 text-xs leading-5 text-outline">{item.detail}</span>
                </span>
                <ArrowRight className="ml-auto mt-0.5 size-4 shrink-0 text-outline transition-transform group-hover:translate-x-0.5 group-hover:text-violet" />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function MorningStat({
  icon: Icon,
  label,
  value,
  detail,
  href,
  tone = "violet",
  alertAction = false,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  detail: string;
  href?: string;
  tone?: "violet" | "caution" | "critical" | "engine";
  alertAction?: boolean;
}) {
  const toneClass =
    tone === "critical"
      ? "text-critical"
      : tone === "caution"
        ? "text-caution"
        : tone === "engine"
          ? "text-engine"
          : "text-violet";
  if (alertAction) {
    return <AlertStatButton label={label} value={value} detail={detail} tone={tone} />;
  }

  return (
    <Link
      href={href ?? "/"}
      className="group block border border-outline-variant/40 bg-surface-high/30 p-3 chamfer-sm transition-colors hover:border-violet/50 hover:bg-surface-high/55"
    >
      <div className="flex items-center gap-2">
        <Icon className={`size-4 ${toneClass}`} aria-hidden="true" />
        <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">{label}</p>
      </div>
      <p className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-on-surface">{value}</p>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-outline">{detail}</p>
    </Link>
  );
}

function FooterLink({
  href,
  icon: Icon,
  label,
  note,
}: {
  href: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  note: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 border border-outline-variant/30 bg-surface-dim/35 p-4 chamfer-sm transition-colors hover:border-violet/40 hover:bg-surface-dim/60"
    >
      <Icon className="size-5 shrink-0 text-outline transition-colors group-hover:text-violet" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-on-surface">{label}</p>
        <p className="truncate text-xs text-outline">{note}</p>
      </div>
      <ArrowRight className="ml-auto size-4 shrink-0 text-outline transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function NothingActionable({ isEngine }: { isEngine: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 border border-outline-variant/30 bg-surface-dim/35 p-8 text-center chamfer-sm">
      <div className="flex size-12 items-center justify-center rounded-full border border-caution/25 bg-caution/10 text-caution">
        <CircleSlash2 className="size-6" />
      </div>
      <h3 className="font-display text-xl font-semibold text-on-surface">Nothing urgent today</h3>
      <p className="max-w-md text-sm leading-6 text-on-surface-variant">
        {isEngine
          ? "Master Mold checked the visible watchlist. Nothing looks important enough to act on right now."
          : "Sample market context. Add holdings or import a snapshot before treating Today as personal."}
      </p>
      <Badge variant="outline" className="border-outline-variant/50 text-outline">
        Advisory only
      </Badge>
    </div>
  );
}
