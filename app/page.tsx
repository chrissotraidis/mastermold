// RDS prescaffold: shadcn-add starter homepage.
// Builders: replace this content with the app's real homepage, but keep imports
// from "@/components/ui/*". Removing all shadcn imports fails the consumption gate.
import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  Bell,
  BookOpenText,
  CircleSlash2,
  Gauge,
  LineChart,
  Radio,
  ShieldCheck,
  Target,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { AppShell, FirstRunBanner } from "@/components/app-shell";
import { DailyBriefingCard } from "@/components/briefing-card";
import { OperatorWorkflowPanel } from "@/components/operator-workflow-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getBriefingCardById, getBriefingCards } from "@/src/db/briefing";
import { getAlerts } from "@/src/db/alerts";
import { getExecutor } from "@/src/db/executor";
import { getPortfolio } from "@/src/db/portfolio";

export default function HomePage() {
  const briefingCards = getBriefingCards();
  const alerts = getAlerts();
  const portfolio = getPortfolio();
  const executor = getExecutor();
  const nothingActionableCards = briefingCards.filter(
    (card) => card.status === "nothing_actionable",
  );
  const showOnlyEmptyState =
    briefingCards.length === 0 || nothingActionableCards.length === briefingCards.length;
  const actionableCount = briefingCards.length - nothingActionableCards.length;
  const topCard = briefingCards[0];
  const topAlert = alerts[0];
  const pausedStrategies = executor.strategies.filter((strategy) => strategy.status !== "running_demo");
  const topHolding = portfolio.holdings[0];
  const topCardDetail = topCard ? getBriefingCardById(topCard.id) : null;
  const leadDrivers = topCardDetail?.drivers.slice(0, 3) ?? [];
  const linkedJournalEntry = topCardDetail?.decision_journal_entry ?? null;

  return (
    <AppShell>
      <FirstRunBanner />
      <div className="mx-auto max-w-7xl space-y-5 px-4 py-5 sm:px-5 sm:py-6">
        <header className="grid gap-4 rounded-lg border border-white/10 bg-[#101722] p-4 shadow-xl shadow-black/20 lg:grid-cols-[1fr_22rem] lg:p-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-cyan-300 text-slate-950 hover:bg-cyan-300">Daily Briefing</Badge>
              <Badge variant="outline" className="border-white/15 text-slate-200">
                personal financial copilot dashboard
              </Badge>
              <Badge variant="outline" className="border-white/15 text-slate-200">
                Intelligent Financial Agent
              </Badge>
            </div>
            <h2 className="mt-4 max-w-3xl text-2xl font-semibold leading-tight text-white sm:text-3xl">
              Start with the highest-signal decision.
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              Read the lead card, triage the alert, then record a paper-only note. No real execution exists.
              This personal financial copilot dashboard gives a single operator a personalized
              pre-market briefing, alert queue, portfolio context, journal, paper sandbox, and agent chat.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <OverviewMetric
                icon={Target}
                label="Brief"
                value={topCard ? `#${topCard.rank}` : "Empty"}
                detail={topCard ? topCard.headline : "No seeded card"}
              />
              <OverviewMetric
                icon={Bell}
                label="Triage"
                value={topAlert ? topAlert.tier : "Clear"}
                detail={topAlert ? topAlert.message : "No alert queued"}
              />
              <OverviewMetric
                icon={ShieldCheck}
                label="Authority"
                value="Read-only"
                detail={`${pausedStrategies.length} executor panels paused or safe`}
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild className="bg-cyan-300 text-slate-950 hover:bg-cyan-200">
                <Link href="#operator-workflow">
                  Create review packet
                  <ArrowUpRight aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="border-white/15 bg-transparent text-slate-100 hover:bg-white/10">
                <Link href={topCard ? `/briefing/${topCard.id}` : "/"}>
                  Open lead card
                  <ArrowUpRight aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="border-white/15 bg-transparent text-slate-100 hover:bg-white/10">
                <Link href="/alerts">Triage alerts</Link>
              </Button>
            </div>
          </div>
          <LeadDecisionPanel
            actionableCount={actionableCount}
            nothingActionableCount={nothingActionableCards.length}
            headline={topCard?.headline ?? "No ranked briefing card is available"}
            conviction={topCard?.conviction ?? 0}
            horizon={topCard?.horizon ?? "No horizon"}
            topAlert={topAlert ? `${topAlert.tier} alert, z-score ${topAlert.z_score}` : "No alert queued"}
            topHolding={topHolding ? `${topHolding.symbol} at ${topHolding.weight_pct}%` : "No holdings"}
            concentration={`${portfolio.concentration.top_symbol ?? "None"} ${portfolio.concentration.top_position_pct}%`}
            portfolioValue={`${formatCurrency(portfolio.total_market_value)} demo USD`}
            drivers={leadDrivers}
            journalThesis={linkedJournalEntry?.thesis ?? "No journal entry committed yet."}
          />
        </header>

        <section
          aria-label="Morning run status and history"
          className="grid gap-3 rounded-lg border border-white/10 bg-white/[0.035] p-4 md:grid-cols-[minmax(0,1fr)_14rem]"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-emerald-300/40 text-emerald-100">
                Status: ready
              </Badge>
              <Badge variant="outline" className="border-cyan-300/35 text-cyan-100">
                Progress 3 of 4 checks
              </Badge>
              <Badge variant="outline" className="border-white/15 text-slate-200">
                History visible
              </Badge>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Latest review run loaded {briefingCards.length} briefing cards, {alerts.length} alerts,
              {portfolio.holdings.length} holdings, and {executor.strategies.length} executor status panels
              from seeded demo data. The remaining step is operator feedback in the workflow below.
            </p>
            <ol className="mt-3 grid gap-2 text-sm text-slate-300 sm:grid-cols-3">
              <li className="rounded-md border border-white/10 bg-slate-950/45 p-3">
                <span className="block text-xs font-semibold uppercase text-slate-400">History</span>
                Briefing and provenance loaded.
              </li>
              <li className="rounded-md border border-white/10 bg-slate-950/45 p-3">
                <span className="block text-xs font-semibold uppercase text-slate-400">Status</span>
                Advisory read-only controls active.
              </li>
              <li className="rounded-md border border-white/10 bg-slate-950/45 p-3">
                <span className="block text-xs font-semibold uppercase text-slate-400">Next</span>
                Create packet, search/filter, then submit feedback.
              </li>
            </ol>
          </div>
          <div className="rounded-md border border-cyan-300/20 bg-cyan-300/[0.06] p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase text-cyan-100">
              <Activity aria-hidden="true" className="size-4" />
              Run progress
            </div>
            <p className="mt-2 text-3xl font-semibold text-white">75%</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-950">
              <div className="h-full w-3/4 rounded-full bg-cyan-300" />
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-300">
              Seeded content is resolved before the primary workflow renders on mobile.
            </p>
          </div>
        </section>

        <section aria-labelledby="decision-queue-title" className="grid gap-3 md:grid-cols-3">
          <QueueCard
            icon={Target}
            tone="cyan"
            label="1. Read"
            title={topCard?.headline ?? "No ranked briefing"}
            detail={topCard ? `${topCard.conviction}/10, ${topCard.horizon}` : "Seeded briefing is empty"}
            href={topCard ? `/briefing/${topCard.id}` : "/"}
          />
          <QueueCard
            icon={Bell}
            tone="amber"
            label="2. Triage"
            title={topAlert?.message ?? "No alert queued"}
            detail={topAlert ? `${topAlert.tier}, z ${topAlert.z_score}` : "No alert requires review"}
            href="/alerts"
          />
          <QueueCard
            icon={BookOpenText}
            tone="emerald"
            label="3. Record"
            title="Log or reject the thesis"
            detail="Journal before the outcome window."
            href="/journal"
          />
        </section>

        <section id="operator-workflow" aria-label="Primary paper-only review workflow">
          <OperatorWorkflowPanel />
        </section>

        {showOnlyEmptyState ? (
          <NothingActionable />
        ) : (
          <section aria-labelledby="briefing-cards-title" className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="briefing-cards-title" className="text-xl font-semibold text-white">
                  Briefing cards
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  Click a briefing card to open the designed detail view with drivers,
                  citations, status, and linked journal context.
                </p>
              </div>
              <Badge variant="outline" className="border-white/15 text-slate-200">
                Demo data
              </Badge>
            </div>
            <div className="grid gap-4">
              {briefingCards.map((card) => (
                <DailyBriefingCard key={card.id} card={card} />
              ))}
            </div>
          </section>
        )}

        {nothingActionableCards.length > 0 && !showOnlyEmptyState ? <NothingActionable /> : null}

        <details className="rounded-lg border border-white/10 bg-slate-950/58 p-5">
          <summary className="cursor-pointer text-lg font-semibold text-white">
            Review truthfulness ledger
          </summary>
          <div className="mt-4">
            <DisclosureLedger />
          </div>
        </details>
      </div>
    </AppShell>
  );
}

function OverviewMetric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Target;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-md border border-white/10 bg-slate-950/45 p-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-400">
        <Icon aria-hidden="true" className="size-4 text-cyan-200" />
        {label}
      </div>
      <p className="mt-2 text-lg font-semibold text-white">{value}</p>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">{detail}</p>
    </div>
  );
}

function BriefStatusRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.035] px-3 py-2">
      <span className="flex min-w-0 items-center gap-2 text-slate-400">
        <Icon aria-hidden="true" className="size-4 shrink-0 text-cyan-200" />
        <span className="truncate text-xs font-semibold uppercase">{label}</span>
      </span>
      <span className="min-w-0 text-right text-xs font-medium text-slate-100">{value}</span>
    </div>
  );
}

function LeadDecisionPanel({
  actionableCount,
  nothingActionableCount,
  headline,
  conviction,
  horizon,
  topAlert,
  topHolding,
  concentration,
  portfolioValue,
  drivers,
  journalThesis,
}: {
  actionableCount: number;
  nothingActionableCount: number;
  headline: string;
  conviction: number;
  horizon: string;
  topAlert: string;
  topHolding: string;
  concentration: string;
  portfolioValue: string;
  drivers: {
    label: string;
    direction: "bullish" | "bearish";
    weight: number;
    source_citation: string;
  }[];
  journalThesis: string;
}) {
  return (
    <aside className="rounded-lg border border-cyan-300/20 bg-slate-950/68 p-4 shadow-inner shadow-black/30">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-cyan-100">Lead decision</p>
          <h3 className="mt-2 text-lg font-semibold leading-6 text-white">{headline}</h3>
        </div>
        <Badge className="bg-cyan-300 text-slate-950 hover:bg-cyan-300">
          {actionableCount} actionable
        </Badge>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <DecisionMetric label="Conviction" value={`${conviction}/10`} />
        <DecisionMetric label="Horizon" value={horizon} />
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-900" aria-label={`Conviction ${conviction} out of 10`}>
        <div className="h-full rounded-full bg-cyan-300" style={{ width: `${Math.min(conviction * 10, 100)}%` }} />
      </div>

      <div className="mt-4 space-y-2">
        {drivers.length > 0 ? (
          drivers.map((driver) => (
            <div
              key={`${driver.label}-${driver.source_citation}`}
              className="rounded-md border border-white/10 bg-white/[0.035] p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-100">{driver.label}</p>
                <Badge
                  variant="outline"
                  className={
                    driver.direction === "bullish"
                      ? "border-emerald-300/35 text-emerald-100"
                      : "border-rose-300/35 text-rose-100"
                  }
                >
                  {driver.direction} {driver.weight}
                </Badge>
              </div>
              <p className="mt-1 line-clamp-1 text-xs text-slate-400">{driver.source_citation}</p>
            </div>
          ))
        ) : (
          <div className="rounded-md border border-white/10 bg-white/[0.035] p-3 text-sm text-slate-300">
            No ranked drivers are available in seeded data.
          </div>
        )}
      </div>

      <div className="mt-4 rounded-md border border-emerald-300/20 bg-emerald-300/[0.055] p-3">
        <p className="text-xs font-semibold uppercase text-emerald-100">Operator note</p>
        <p className="mt-1 line-clamp-3 text-sm leading-6 text-slate-200">{journalThesis}</p>
      </div>

      <div className="mt-4 grid gap-2 text-sm leading-6 text-slate-300">
        <BriefStatusRow icon={Bell} label="Alert" value={topAlert} />
        <BriefStatusRow icon={LineChart} label="Top holding" value={topHolding} />
        <BriefStatusRow icon={Gauge} label="Concentration" value={concentration} />
        <BriefStatusRow icon={WalletCards} label="Portfolio" value={portfolioValue} />
        <BriefStatusRow icon={Radio} label="Executor" value="Display only, signs nothing" />
      </div>

      <p className="mt-4 text-xs leading-5 text-slate-400">
        {nothingActionableCount} card notes nothing actionable today. The primary next step is
        paper-only review packet and feedback, not execution.
      </p>
    </aside>
  );
}

function DisclosureLedger() {
  const rows = [
    {
      label: "What works",
      value: "Briefing, alerts, portfolio, journal, paper sandbox, chat shell, executor monitor, integrations, and bitemporal replay are wired.",
    },
    {
      label: "Seeded / demo data",
      value: "Holdings, prices, news, funding, briefing cards, alerts, journal outcomes, paper rounds, and executor metrics are fabricated.",
    },
    {
      label: "Fake costs",
      value: "Portfolio values, sample costs, and P&L-style numbers are fake sample/demo USD for review only.",
    },
    {
      label: "Stubbed or credential-gated",
      value: "Coinbase CDP, Robinhood via SnapTrade, Zerion, and LLM reasoning are inert until optional local credentials are supplied.",
    },
    {
      label: "Placeholder workflows",
      value: "Review packets, guardrail edits, kill switch, and reviewer checkpoints change local review state only; no trade, signing, or chain call exists.",
    },
    {
      label: "Missing in V0",
      value: "Always-on ingestion, live eval harness, live Web3 executor custody, and tax/legal sign-off remain promised but not live.",
    },
  ];

  return (
    <section aria-labelledby="truthfulness-ledger-title" className="rounded-md border border-white/10 bg-slate-950/58 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="truthfulness-ledger-title" className="text-xl font-semibold text-white">
            Review truthfulness ledger
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            App-visible disclosure for seeded data, fake costs, stubbed integrations, and placeholder workflows.
          </p>
        </div>
        <Button asChild variant="outline" className="border-white/15 bg-transparent text-slate-100 hover:bg-white/10">
          <Link href="/review">Open full review</Link>
        </Button>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label} className="rounded-md border border-white/10 bg-white/[0.035] p-3">
            <p className="text-xs font-semibold uppercase text-cyan-100">{row.label}</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">{row.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function DecisionMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.035] p-3">
      <p className="text-xs font-semibold uppercase text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function QueueCard({
  icon: Icon,
  tone,
  label,
  title,
  detail,
  href,
}: {
  icon: LucideIcon;
  tone: "amber" | "cyan" | "emerald";
  label: string;
  title: string;
  detail: string;
  href: string;
}) {
  const toneClasses = {
    amber: "border-amber-300/25 bg-amber-300/[0.06] text-amber-100",
    cyan: "border-cyan-300/25 bg-cyan-300/[0.06] text-cyan-100",
    emerald: "border-emerald-300/25 bg-emerald-300/[0.06] text-emerald-100",
  };

  return (
    <Link
      href={href}
      className="group rounded-md border border-white/10 bg-slate-950/45 p-4 transition hover:border-cyan-300/35 hover:bg-white/[0.055] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
    >
      <div className="flex items-start gap-3">
        <div className={`flex size-10 shrink-0 items-center justify-center rounded-md border ${toneClasses[tone]}`}>
          <Icon aria-hidden="true" className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-slate-400">{label}</p>
          <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-white">{title}</h3>
          <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">{detail}</p>
        </div>
      </div>
      <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-cyan-200">
        Open surface
        <ArrowUpRight aria-hidden="true" className="size-3.5 transition group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function NothingActionable() {
  return (
    <section
      aria-labelledby="nothing-actionable-title"
      className="overflow-hidden rounded-lg border border-amber-300/20 bg-amber-300/[0.06]"
    >
      <div className="grid gap-0 lg:grid-cols-[18rem_1fr]">
        <div className="flex items-center justify-center border-b border-amber-300/15 bg-slate-950/40 p-8 lg:border-b-0 lg:border-r">
          <div className="flex size-24 items-center justify-center rounded-full border border-amber-200/25 bg-amber-200/10 text-amber-100">
            <CircleSlash2 aria-hidden="true" className="size-12" />
          </div>
        </div>
        <div className="space-y-4 p-5 sm:p-7">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-amber-300 text-slate-950 hover:bg-amber-300">
              Nothing actionable today
            </Badge>
            <Badge variant="outline" className="border-white/15 text-slate-200">
              Demo data
            </Badge>
          </div>
          <div>
            <h2 id="nothing-actionable-title" className="text-2xl font-semibold text-white">
              No forced trade when the signal is weak
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              The briefing can render a designed nothing-actionable empty state instead of an
              error page. Today&apos;s seeded data includes a no-action card, so the operator can
              see that waiting is an explicit outcome.
            </p>
          </div>
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-md border border-white/10 bg-slate-950/40 p-3">
              <p className="font-semibold text-slate-100">View</p>
              <p className="mt-1 text-slate-400">Briefing remains available.</p>
            </div>
            <div className="rounded-md border border-white/10 bg-slate-950/40 p-3">
              <p className="font-semibold text-slate-100">Not error</p>
              <p className="mt-1 text-slate-400">This is a normal state.</p>
            </div>
            <div className="rounded-md border border-white/10 bg-slate-950/40 p-3">
              <p className="font-semibold text-slate-100">Review</p>
              <p className="mt-1 text-slate-400">Demo provenance stays visible.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium uppercase text-amber-100">
            <Activity aria-hidden="true" className="size-4" />
            Scheduler ready with seed data loaded
          </div>
        </div>
      </div>
    </section>
  );
}
