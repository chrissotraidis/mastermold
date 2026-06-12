import {
  Activity,
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Cpu,
  Database,
  LockKeyhole,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { AskMasterMoldButton } from "@/components/master-mold-actions";
import { Badge } from "@/components/ui/badge";
import { ForwardTrialStarter } from "@/components/forward-trial-starter";
import { ProvenanceChip } from "@/components/provenance-chip";
import { ReviewerEvidencePanel } from "@/components/reviewer-evidence-panel";
import { productProvenanceLabel, productProvenanceSource } from "@/lib/provenance-copy";
import { toPublicProductMetricSummary } from "@/lib/public-api-copy";
import { reviewResearchPathLabel, reviewRunNoteCopy, reviewScanActivityLabel } from "@/lib/review-status-copy";
import { buildTodayReadiness } from "@/lib/today-readiness-copy";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getDataMode, getEngineRunHistory, getEngineStatus } from "@/src/db/engine-data";
import { getScanAttempts } from "@/src/db/scan";
import { getForwardProofStatus, type ForwardProofGate } from "@/src/db/forward-proof";
import { getBrainState } from "@/src/db/brain";
import { getJournal } from "@/src/db/journal";
import { getPortfolio } from "@/src/db/portfolio";
import { getProductMetricSummary } from "@/src/db/metrics";
import { getScreenerFeedback } from "@/src/db/screener-feedback";

type ReviewReadinessProps = {
  surface: "public" | "authenticated";
};

const disclosureSections = [
  {
    title: "Working now",
    icon: CheckCircle2,
    tone: "text-engine",
    summary:
      "Reviewable product flow with sample data, local manual entries, and explicit holdings snapshot imports.",
    items: [
      "Today and idea detail with the clues behind each idea",
      "Alert feed",
      "Portfolio and concentration",
      "Decision journal and local performance tracking",
      "Paper-trading rounds",
      "Chat",
      "Live chat has a local size limit. Short questions can use a saved chat key; oversized questions stop before any live chat request.",
      "Executor preview",
      "Connection tests and explicit holdings snapshot imports",
      "Chat context saves what the app can remember; import holdings again when balances matter",
      "Rewind controls: Portfolio, Decision journal, Paper, and Executor can replay local data as of an earlier moment",
    ],
  },
  {
    title: "What a saved read can include",
    icon: Cpu,
    tone: "text-engine",
    summary:
      "When a saved read is loaded, these come straight from it. Everything else falls back to sample data.",
    items: [
      "Daily ideas, supporting notes, and alerts come from the saved read when one is loaded.",
      "When a saved read includes closed calls, Performance and the Decision journal show whether those calls were right and whether scores matched results.",
      "Chat reasons over today's read. Paper trading enters Master Mold's simulated call for comparison. Alert ratings show which alert types people keep or ignore.",
      "Every card and alert is labeled as a saved read or sample data. A quiet seeded day does not contact live chat by itself.",
      "Still sample or local: paper-trading scoring and strategy metrics. Portfolio can mix sample data, manual entries, and explicit holdings snapshots.",
      "Each saved fact carries when it happened and when it became known. Saved reads are normalized so the app never shows a fact as known before it happened.",
      "Saved market reads can inform Today, Alerts, Paper, and chat. They cannot touch accounts or move money.",
    ],
  },
  {
    title: "Sample data",
    icon: Database,
    tone: "text-violet",
    summary:
      "Seeded holdings, prices, borrow-rate samples, paper-trading rounds, and outcomes are sample data unless you add manual holdings or import a holdings snapshot. Today and Alerts use seeded data only when no saved read is loaded.",
    items: [
      "Account positions or balances appear only after an explicit holdings snapshot import. Profit/loss history is not connected.",
      "Seeded figures exist so concentration, past-call review, and paper results are reviewable.",
      "Sample data carries timestamps too, so time-travel works against it.",
      "It's the always-available backup data — the app runs fully with no keys or saved read.",
    ],
  },
  {
    title: "Money figures",
    icon: Database,
    tone: "text-violet",
    summary:
      "Dollar amounts are seeded sample data, local manual entries, or explicit holdings snapshots.",
    items: [
      "Manual holdings are local entries you type in; imported holdings appear only after you press an account import button.",
      "Imported holdings are snapshots. They do not refresh automatically; import again before relying on them.",
      "Seeded sample amounts exist so concentration, past-call review, and paper results are reviewable with no setup.",
      "No detailed tax records, realized gains or losses, or full account history are connected.",
      "Nothing here can turn a number into a trade.",
    ],
  },
  {
    title: "Connection checks and imports",
    icon: LockKeyhole,
    tone: "text-caution",
    summary: "External services are testable. Account imports create Portfolio holdings snapshots only after an explicit import action.",
    items: [
      "Coinbase — account-list test and holdings snapshot import exist for priced balances.",
      "Robinhood, via SnapTrade — connection test reports whether access is read-only or trade-capable; import reads positions only, and Master Mold never calls order endpoints.",
      "On-chain wallet, via Zerion — wallet test and fungible-position snapshot import exist.",
      "Account imports are one-time snapshots in this build; import again before relying on balances.",
      "Live chat can be tested and used when a key is saved.",
    ],
  },
  {
    title: "Local-only actions",
    icon: CircleAlert,
    tone: "text-caution",
    summary: "Controls here write only to this local app or this browser. None reach a broker, wallet, or chain.",
    items: [
      "Saving a guardrail draft and running the kill-switch drill stay in browser state; alerts, paper trades, past calls, chat context snapshots, and manual holdings stay in the local app store.",
      "Nothing signs a transaction, places an order, moves funds, or calls a chain.",
    ],
  },
  {
    title: "Not built yet",
    icon: CircleAlert,
    tone: "text-critical",
    summary: "On the roadmap, not in this build.",
    items: [
      "Chat context does not read the whole market yet; it saves app context for chat.",
      "Account snapshots do not refresh on a schedule. Import holdings again before relying on balances.",
      "The full forward-evaluation harness with baselines, costs, enough resolved calls, and pre-written pass/fail gates.",
      "A real executor connected to chains, with custody limits and a working kill switch.",
      "Tax sign-off before any real capital goes in.",
    ],
  },
] as const;

export function ReviewReadiness({ surface }: ReviewReadinessProps) {
  const dataMode = getDataMode();
  const publicDataMode = {
    label: productProvenanceLabel(dataMode.label),
    source: productProvenanceSource(dataMode.label, dataMode.source),
  };
  return (
    <section className="space-y-5" aria-labelledby="review-readiness-title">
      <div className="rounded-lg border border-outline-variant/40 bg-surface-dim/70 p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-violet text-void hover:bg-violet">
              Trust summary
            </Badge>
            <ProvenanceChip label={publicDataMode.label} title={publicDataMode.source} />
          </div>
        <h1
          id="review-readiness-title"
          className="mt-4 text-2xl font-semibold text-on-surface sm:text-3xl"
        >
          Performance
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-on-surface-variant sm:text-base">
          See what Master Mold has tried, which data is real, and what still needs
          evidence before you rely on it.
        </p>
      </div>

      <ReviewVerdictCard />

      <TrustBoundaryCard />

      <ForwardProofCard />

      <PerformanceSummaryCard />

      <EngineStatusCard />

      <ScreenerTuningCard />

      <ProductMetricsCard />

      <details className="rounded-lg border border-outline-variant/40 bg-surface-high/25 p-4 sm:p-5">
        <summary className="flex min-h-11 cursor-pointer items-center text-lg font-semibold text-on-surface">
          What is real here
        </summary>
        <p className="mt-2 text-sm leading-6 text-outline">
          What works now, what uses sample data, and what has not been built yet.
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {disclosureSections.map((section) => {
            const Icon = section.icon;

            return (
              <Card key={section.title} className="border-outline-variant/40 bg-surface-high/30">
                <CardHeader className="space-y-3 p-5">
                  <div
                    className={`flex size-10 items-center justify-center rounded-md border border-outline-variant/40 bg-surface-dim/50 ${section.tone}`}
                  >
                    <Icon aria-hidden="true" className="size-5" />
                  </div>
                  <div>
                    <CardTitle as="h2" className="text-xl text-on-surface">{section.title}</CardTitle>
                    <CardDescription className="mt-2 text-sm leading-6 text-on-surface-variant">
                      {section.summary}
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="p-5 pt-0">
                  <ul className="space-y-2 text-sm leading-6 text-on-surface-variant">
                    {section.items.map((item) => (
                      <li key={item} className="flex gap-2">
                        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-violet" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </details>

      <Card className="border-violet/30 bg-violet/10">
        <CardHeader className="grid gap-4 p-5 sm:grid-cols-[auto_1fr] sm:items-center">
          <div className="flex size-11 items-center justify-center rounded-md border border-violet/30 bg-surface-dim/50 text-violet">
            <UserRound aria-hidden="true" className="size-5" />
          </div>
          <div>
            <CardTitle as="h2" className="text-xl text-on-surface">Try the app safely</CardTitle>
            <CardDescription className="mt-2 text-sm leading-6 text-on-surface-variant">
              You can look around without adding credentials. Optional keys stay in this
              local app while it checks the selected service. Local walkthrough account:
              reviewer@demo.local, no password or external login.
            </CardDescription>
          </div>
        </CardHeader>
      </Card>

      <details className="rounded-lg border border-outline-variant/40 bg-surface-high/25 p-4 sm:p-5">
        <summary className="flex min-h-11 cursor-pointer items-center text-lg font-semibold text-on-surface">
          Local walkthrough checklist
        </summary>
        <p className="mt-2 text-sm leading-6 text-outline">
          Optional checks for this local build. They do not require credentials and do not change portfolio data.
        </p>
        <div className="mt-4">
          <ReviewerEvidencePanel />
        </div>
      </details>

      <p className="text-sm leading-6 text-outline">
        {surface === "public"
          ? "Preview build — advisory-only, and not production-ready yet."
          : "Keep this page current as sample, local, gated, or unbuilt features change."}
      </p>
    </section>
  );
}

function ReviewVerdictCard() {
  const status = getEngineStatus();
  const dataMode = getDataMode();
  const portfolio = getPortfolio();
  const brain = getBrainState();
  const liveEngine = status.state === "live";
  const publicDataMode = productProvenanceLabel(dataMode.label);
  const readiness = buildTodayReadiness({ portfolio, dataMode, brain });
  const nextStep =
    readiness.href === "/review"
      ? { action: "Open Today", href: "/" }
      : { action: readiness.action, href: readiness.href };
  const reviewPrompt =
    "Review the current Master Mold setup. What is real, what is sample, and what should I set up first?";
  const facts: Array<{ label: string; value: string; tone: string }> = [
    {
      label: "Daily read source",
      value: liveEngine ? "Saved read" : publicDataMode === "Sample data" ? "Sample" : publicDataMode,
      tone: liveEngine ? "text-engine" : "text-caution",
    },
    {
      label: "Money movement",
      value: "Cannot move money",
      tone: "text-engine",
    },
    {
      label: "Money shown",
      value: "Manual, imported, or sample",
      tone: "text-violet",
    },
    {
      label: "Best next step",
      value: nextStep.action,
      tone: "text-on-surface",
    },
  ];

  return (
    <Card className="border-engine/25 bg-surface-high/45">
      <CardHeader className="grid gap-4 p-5 lg:grid-cols-[1fr_auto] lg:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-md border border-engine/30 bg-engine/10 text-engine">
              <ShieldCheck aria-hidden="true" className="size-4" />
            </div>
            <Badge variant="outline" className="border-engine/40 text-engine">
              Trust check
            </Badge>
          </div>
          <CardTitle as="h2" className="mt-3 text-xl text-on-surface">
            Current boundary
          </CardTitle>
          <CardDescription className="mt-2 max-w-3xl text-sm leading-6 text-on-surface-variant">
            Use Master Mold to decide what to check. It can explain saved or sample reads
            and local history, but it cannot place orders, sign transactions, or use money
            from any account in this build.
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Link
            href={nextStep.href}
            className="inline-flex min-h-11 items-center gap-2 rounded-md bg-violet px-3 text-sm font-semibold text-void transition hover:bg-violet/90"
          >
            {nextStep.action}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
          <AskMasterMoldButton
            prompt={reviewPrompt}
            className="min-h-11 border-outline-variant/50 bg-transparent text-on-surface hover:bg-surface-high/70"
          >
            Ask what is real
          </AskMasterMoldButton>
        </div>
      </CardHeader>
      <CardContent className="grid gap-2 p-5 pt-0 sm:grid-cols-2 xl:grid-cols-4">
        {facts.map((fact) => (
          <div key={fact.label} className="rounded-md border border-outline-variant/40 bg-surface-dim/45 p-3">
            <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">
              {fact.label}
            </p>
            <p className={`mt-1 text-sm font-semibold ${fact.tone}`}>{fact.value}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function TrustBoundaryCard() {
  const boundaries: Array<{
    title: string;
    body: string;
    tone: string;
  }> = [
    {
      title: "Use it for today's decision",
      body:
        "Today, alerts, chat, Paper, and past-call review are useful for testing the daily decision loop. Chat stops oversized questions before any live chat request.",
      tone: "border-engine/30 bg-engine/[0.06]",
    },
    {
      title: "Do not treat it as live account advice yet",
      body:
      "Imported holdings are one-time snapshots. Money shown here can be sample, manual, or imported, and nothing can trade.",
      tone: "border-caution/30 bg-caution/[0.08]",
    },
    {
      title: "Next missing foundation: daily market reader",
      body:
        "Still missing: scheduled market/news reading, broader connected-portfolio coverage, source notes for every daily call, and forward scoring.",
      tone: "border-critical/30 bg-critical/[0.06]",
    },
  ];

  return (
    <section aria-labelledby="trust-boundary-title" className="grid gap-3 lg:grid-cols-3">
      <h2 id="trust-boundary-title" className="sr-only">
        Trust boundary
      </h2>
      {boundaries.map((boundary) => (
        <div
          key={boundary.title}
          className={`rounded-lg border p-4 sm:p-5 ${boundary.tone}`}
        >
          <p className="text-sm font-semibold text-on-surface">{boundary.title}</p>
          <p className="mt-2 text-sm leading-6 text-on-surface-variant">{boundary.body}</p>
        </div>
      ))}
    </section>
  );
}

function PerformanceSummaryCard() {
  const journal = getJournal();
  const resolved = journal.entries.filter((entry) => entry.outcome_score);
  const wins = resolved.filter((entry) => entry.outcome_score?.thesis_played_out).length;
  const hitRate = resolved.length > 0 ? wins / resolved.length : null;
  const avgProcess =
    resolved.length > 0
      ? resolved.reduce((sum, entry) => sum + (entry.outcome_score?.process_score ?? 0), 0) / resolved.length
      : null;
  const topBelief = journal.strategy_beliefs[0] ?? null;
  const pastCallSourceLabel = productProvenanceLabel(journal.provenance.label);
  const isSamplePastCalls = journal.provenance.label !== "Engine output";
  const lessonSource =
    journal.provenance.label === "Engine output" ? "Saved outcomes" : "Seeded history";
  const lessonGatePassed =
    topBelief?.reflection_updates.some((update) => update.significance_passed && update.applied) ??
    false;
  const facts: Array<[string, string]> = [
    ["Calls logged", String(journal.entries.length)],
    ["Closed calls", String(resolved.length)],
    ["Calls right", hitRate === null ? "Not enough data" : formatPercent(hitRate)],
    ["Review quality", avgProcess === null ? "Not enough data" : `${avgProcess.toFixed(1)}/10`],
  ];

  return (
    <Card className="border-outline-variant/40 bg-surface-high/35">
      <CardHeader className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle as="h2" className="text-xl text-on-surface">
            Past calls
          </CardTitle>
          <ProvenanceChip label={pastCallSourceLabel} title={journal.provenance.source} />
        </div>
        <CardDescription className="mt-2 text-sm leading-6 text-on-surface-variant">
          {isSamplePastCalls
            ? "Seeded and locally saved calls. Use this to check the review workflow; it is not evidence that future calls will work."
            : "Saved calls and outcomes. This shows whether past ideas were useful; it does not predict whether future calls will work."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-5 pt-0">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {facts.map(([label, value]) => (
            <div key={label} className="rounded-md border border-outline-variant/40 bg-surface-dim/45 p-3">
              <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">{label}</p>
              <p className="mt-1 text-sm font-semibold text-on-surface">{value}</p>
            </div>
          ))}
        </div>
        <div className="rounded-md border border-violet/25 bg-violet/[0.06] p-4">
          <p className="text-sm font-semibold text-on-surface">Learning check</p>
          <p className="mt-1 text-sm leading-6 text-on-surface-variant">
            {topBelief
              ? `${topBelief.name}: ${topBelief.statement} ${lessonSource} only; ${
                  lessonGatePassed
                    ? "an evidence gate updated this lesson."
                    : "no evidence gate has updated a live rule yet."
                }`
              : "No reusable lesson yet."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function formatReviewTimestamp(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(parsed) + " UTC";
}

/** PRD success signals from the local product-event log. */
function ProductMetricsCard() {
  const summary = toPublicProductMetricSummary(getProductMetricSummary());
  const briefingRatingCount = summary.briefing_ratings.useful + summary.briefing_ratings.not_useful;
  const facts: Array<[string, string]> = [
    [
      "Today read time",
      summary.today_read.under_target === null
        ? "No reads yet"
        : `${summary.today_read.median_seconds}s median · ${summary.today_read.under_target ? "under 5m" : "over 5m"}`,
    ],
    [
      "Today ratings",
      summary.briefing_ratings.useful_share === null
        ? "No ratings yet"
        : `${formatPercent(summary.briefing_ratings.useful_share)} useful · ${briefingRatingCount} ${briefingRatingCount === 1 ? "rating" : "ratings"}`,
    ],
    ["Chat follow-ups", String(summary.chat_followups)],
    ["Decisions logged", String(summary.decisions_logged)],
    [
      "Not-useful alerts",
      summary.alert_ratings.not_useful_share === null
        ? "No alert ratings"
        : `${formatPercent(summary.alert_ratings.not_useful_share)} not useful`,
    ],
    [
      "Score check",
      summary.score_accuracy.closed_calls > 0
        ? `${formatPercent(summary.score_accuracy.average_miss ?? 0)} average miss · ${summary.score_accuracy.close_enough ? "close enough" : "needs work"}`
        : "No resolved calls",
    ],
  ];

  return (
    <Card className="border-violet/30 bg-violet/[0.06]">
      <CardHeader className="grid gap-4 p-5 sm:grid-cols-[auto_1fr] sm:items-center">
        <div className="flex size-11 items-center justify-center rounded-md border border-violet/30 bg-surface-dim/50 text-violet">
          <Activity aria-hidden="true" className="size-5" />
        </div>
        <div>
          <CardTitle as="h2" className="text-xl text-on-surface">Recent local activity</CardTitle>
          <CardDescription className="mt-2 text-sm leading-6 text-on-surface-variant">
            Local signs of whether the daily flow is useful: Today ratings, alert feedback,
            chat follow-ups, and decisions logged before outcomes. These show usage, not proof
            that future calls will work.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="grid gap-2 p-5 pt-0 sm:grid-cols-2 lg:grid-cols-3">
        {facts.map(([label, value]) => (
          <div key={label} className="rounded-md border border-outline-variant/40 bg-surface-dim/45 p-3">
            <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">{label}</p>
            <p className="mt-1 text-sm font-semibold text-on-surface">{value}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** Honest forward-evaluation status before the full PRD harness exists. */
function ForwardProofCard() {
  const proof = getForwardProofStatus();

  return (
    <Card className="border-outline-variant/40 bg-surface-high/30">
      <CardHeader className="grid gap-4 p-5 sm:grid-cols-[auto_1fr] sm:items-center">
        <div className="flex size-11 items-center justify-center rounded-md border border-outline-variant/40 bg-surface-dim/50 text-engine">
          <CheckCircle2 aria-hidden="true" className="size-5" />
        </div>
        <div>
          <CardTitle as="h2" className="text-xl text-on-surface">Forward measurement</CardTitle>
          <CardDescription className="mt-2 text-sm leading-6 text-on-surface-variant">
            {proof.summary}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-5 pt-0">
        <div className="rounded-md border border-outline-variant/40 bg-surface-dim/45 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">
                What counts
              </p>
              <p className="mt-1 text-sm font-semibold text-on-surface">{proof.measurement.status}</p>
            </div>
            <p className="max-w-xl text-sm leading-6 text-on-surface-variant">{proof.measurement.note}</p>
          </div>
          <dl className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <ProgressStat label="Calls since start" value={proof.progress.saved_calls} />
            <ProgressStat label="Later results" value={proof.progress.later_results} />
            <ProgressStat label="Market reads" value={proof.progress.saved_scans} />
            <ProgressStat label="Next step" value={proof.progress.next_step} />
          </dl>
          <dl className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <dt className="text-xs font-semibold uppercase text-outline">Minimum calls</dt>
              <dd className="mt-1 text-sm text-on-surface">{proof.measurement.min_logged_calls} saved</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase text-outline">Minimum results</dt>
              <dd className="mt-1 text-sm text-on-surface">{proof.measurement.min_resolved_calls} resolved</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase text-outline">Baseline</dt>
              <dd className="mt-1 text-sm text-on-surface">{proof.measurement.baseline}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase text-outline">Cost rule</dt>
              <dd className="mt-1 text-sm text-on-surface">{proof.measurement.cost_policy}</dd>
            </div>
          </dl>
          <p className="mt-3 text-sm leading-6 text-on-surface-variant">{proof.measurement.pass_fail_gate}</p>
          <div className="mt-4 border-t border-outline-variant/40 pt-4">
            <ForwardTrialStarter status={proof.measurement.status} />
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {proof.gates.map((gate) => (
            <div key={gate.id} className="rounded-md border border-outline-variant/40 bg-surface-dim/45 p-3">
              <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">{gate.label}</p>
              <p className={`mt-1 text-sm font-semibold ${forwardGateTone(gate)}`}>{gate.status}</p>
              <p className="mt-2 text-xs leading-5 text-outline">{gate.detail}</p>
            </div>
          ))}
        </div>
        <div className="rounded-md border border-caution/30 bg-caution/10 p-4 text-sm leading-6 text-on-surface-variant">
          <p className="font-semibold text-on-surface">Current status: {proof.verdict}</p>
          <p className="mt-1">
            This check needs saved calls, later outcomes, costs included, a baseline, and pass/fail gates written
            before seeing results. Until those results exist, this page is a trust log, not enough evidence that
            future calls will work.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function ProgressStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-outline-variant/40 bg-surface-high/35 p-3">
      <dt className="text-xs font-semibold uppercase text-outline">{label}</dt>
      <dd className="mt-1 text-sm leading-5 text-on-surface">{value}</dd>
    </div>
  );
}

function forwardGateTone(gate: ForwardProofGate) {
  if (gate.status === "Working locally") return "text-engine";
  if (gate.status === "Partial") return "text-caution";
  return "text-critical";
}

/** Saved-read history plus recent scan attempts (failures stay visible). */
function EngineRunHistory() {
  const history = getEngineRunHistory();
  const attempts = getScanAttempts(6);
  if (history.length === 0 && attempts.length === 0) return null;

  return (
    <div className="space-y-3">
      {history.length > 0 ? (
        <div className="rounded-md border border-outline-variant/40 bg-surface-dim/45 p-3">
          <p className="text-xs font-semibold uppercase text-outline">
            Runs saved locally ({history.length})
          </p>
          <ul className="mt-2 space-y-1 text-sm text-on-surface-variant">
            {history.slice(0, 8).map((run) => (
              <li key={run.run_date} className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-on-surface">{run.run_date}</span>
                <span className="text-xs text-outline">
                  {run.triggered} worth checking · {run.usd > 0 ? `$${run.usd.toFixed(2)}` : "$0"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {attempts.length > 0 ? (
        <div className="rounded-md border border-outline-variant/40 bg-surface-dim/45 p-3">
          <p className="text-xs font-semibold uppercase text-outline">Scan attempts</p>
          <ul className="mt-2 space-y-1.5 text-sm text-on-surface-variant">
            {attempts.map((attempt) => (
              <li key={attempt.id} className="flex flex-wrap items-start justify-between gap-2">
                <span className="font-mono text-xs text-on-surface">
                  {formatReviewTimestamp(attempt.started_at)}
                </span>
                <span
                  className={
                    attempt.status === "ok"
                      ? "text-xs text-engine"
                      : attempt.status === "failed"
                        ? "text-xs text-critical"
                        : "text-xs text-outline"
                  }
                >
                  {attempt.status === "ok" ? "Completed" : attempt.status === "failed" ? "Failed" : "Running"}
                  {attempt.usd !== null && attempt.usd > 0 ? ` · $${attempt.usd.toFixed(4)}` : ""}
                </span>
                {attempt.status === "failed" ? (
                  <span className="w-full text-xs leading-5 text-outline">{attempt.detail}</span>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs leading-5 text-outline">
            Failed scans never change recommendations; the last good read stays in place.
            Re-running the same day will not create a duplicate read.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** Alert-feedback loop, surfaced for the operator. */
function ScreenerTuningCard() {
  const feedback = getScreenerFeedback();
  if (feedback.signals.length === 0) return null;

  const tone: Record<string, string> = {
    demote: "border-critical/40 text-critical",
    loosen: "border-engine/40 text-engine",
    hold: "border-amber-300/35 text-caution",
    insufficient: "border-outline-variant/50 text-on-surface-variant",
  };

  return (
    <Card className="border-outline-variant/40 bg-surface-high/30">
      <CardHeader className="space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle as="h2" className="text-xl text-on-surface">Alert feedback</CardTitle>
          <ProvenanceChip label={feedback.provenance.label} />
        </div>
        <CardDescription className="text-sm leading-6 text-on-surface-variant">
          Marking alerts useful or not shows which alert types deserve more or less attention.
          The rules do not change automatically yet. {feedback.total_rated} rated so far.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-5 pt-0">
        <ul className="space-y-2 text-sm">
          {feedback.signals.map((s) => (
            <li
              key={`${alertSignalLabel(s.signal)}-${s.suggestion}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-outline-variant/40 bg-surface-dim/45 p-3"
            >
              <div className="min-w-0">
                <span className="font-semibold text-on-surface">{alertSignalLabel(s.signal)}</span>
                <span className="ml-2 text-xs text-outline">
                  {s.useful} useful · {s.not_useful} not useful · {s.pending} pending
                </span>
                <p className="mt-1 text-xs leading-5 text-outline">{s.rationale}</p>
              </div>
              <Badge variant="outline" className={tone[s.suggestion] ?? tone.insufficient}>
                {alertSuggestionLabel(s.suggestion)}
              </Badge>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function alertSignalLabel(signal: string) {
  if (signal === "return_z") return "Unusual price move";
  if (signal === "volume_z") return "Unusual trading volume";
  if (signal === "news_count_z") return "News pickup";
  return signal.replace(/_/g, " ");
}

function alertSuggestionLabel(suggestion: string) {
  if (suggestion === "demote") return "Show fewer";
  if (suggestion === "loosen") return "Show more";
  if (suggestion === "hold") return "Keep";
  return "Need more ratings";
}

/** Disclosure of the most recent saved read (or its absence). */
function EngineStatusCard() {
  const status = getEngineStatus();

  if (status.state === "live") {
    const run = status.bundle.run;
    const tierNames: Record<string, string> = { quick_think: "Quick review", deep_think: "Second review" };
    const adapter = stageObject(run.stages.agent_adapter_detail);
    const modelTiers = Object.keys(run.models).map((tier) => tierNames[tier] ?? tier);
    const summaryFacts: Array<[string, string]> = [
      ["Last read", run.run_date],
      ["Market read", reviewScanActivityLabel(run.triggered_tickers)],
      ["Used for", "Today, alerts, chat, and paper ideas"],
      ["Still missing", "Daily account refresh"],
    ];
    const facts: Array<[string, string]> = [
      ["Read date", run.run_date],
      ["Read type", run.cost.llm_calls > 0 ? "Saved market summary" : "Local rules check"],
      ["Review passes", modelTiers.length ? modelTiers.join(" + ") : "Saved read"],
      ["Market checks", reviewScanActivityLabel(run.triggered_tickers)],
      ["Cost", formatScanCost(run.cost.usd, run.cost.llm_calls)],
      ["Known as of", formatReviewTimestamp(run.knowledge_time)],
      ["Review path", reviewResearchPathLabel(run.stages.agent_adapter, adapter)],
      ["Extra review", adapter.attempted_graph === true ? "Used the saved local summary" : "Not needed for this read"],
    ];
    return (
      <Card className="border-engine/30 bg-engine/[0.06]">
        <CardHeader className="grid gap-4 p-5 sm:grid-cols-[auto_1fr] sm:items-center">
          <div className="flex size-11 items-center justify-center rounded-md border border-engine/30 bg-surface-dim/50 text-engine">
            <Cpu aria-hidden="true" className="size-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle as="h2" className="text-xl text-on-surface">Saved read loaded</CardTitle>
              <ProvenanceChip label="Engine output" />
            </div>
            <CardDescription className="mt-2 text-sm leading-6 text-on-surface-variant">
              Today, Alerts, Chat, and Paper can use this saved market read. It is a saved
              read, not a background market reader, and it will not refresh
              account balances for you.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-5 pt-0">
          <dl className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
            {summaryFacts.map(([label, value]) => (
              <div key={label} className="rounded-md border border-outline-variant/40 bg-surface-dim/45 p-3">
                <dt className="text-xs font-semibold uppercase text-outline">{label}</dt>
                <dd className="mt-1 break-words text-on-surface">{value}</dd>
              </div>
            ))}
          </dl>
          <details className="rounded-md border border-outline-variant/40 bg-surface-dim/35 p-3">
            <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-on-surface">
              Read details
            </summary>
            <div className="mt-3 space-y-4">
              <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                {facts.map(([label, value]) => (
                  <div key={label} className="rounded-md border border-outline-variant/40 bg-surface-dim/45 p-3">
                    <dt className="text-xs font-semibold uppercase text-outline">{label}</dt>
                    <dd className="mt-1 break-words text-on-surface">{value}</dd>
                  </div>
                ))}
              </dl>
              <EngineRunHistory />
              {adapter.reason ? (
                <div className="rounded-md border border-outline-variant/40 bg-surface-dim/45 p-3 text-sm leading-6 text-on-surface-variant">
                  <span className="font-semibold text-on-surface">Run note:</span>{" "}
                  {reviewRunNoteCopy(String(adapter.reason))}
                </div>
              ) : null}
            </div>
          </details>
        </CardContent>
      </Card>
    );
  }

  const invalid = status.state === "invalid";
  return (
    <Card className={invalid ? "border-caution/30 bg-caution/10" : "border-violet/30 bg-violet/10"}>
      <CardHeader className="grid gap-4 p-5 sm:grid-cols-[auto_1fr] sm:items-center">
        <div className={`flex size-11 items-center justify-center rounded-md border bg-surface-dim/50 ${invalid ? "border-caution/30 text-caution" : "border-violet/30 text-violet"}`}>
          {invalid ? <CircleAlert aria-hidden="true" className="size-5" /> : <Database aria-hidden="true" className="size-5" />}
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle as="h2" className="text-xl text-on-surface">
              {invalid ? "Latest read couldn't be used" : "No saved read loaded"}
            </CardTitle>
            <ProvenanceChip label="Sample data" />
          </div>
          <CardDescription className="mt-2 text-sm leading-6 text-on-surface-variant">
            {invalid
              ? `The newest read was rejected (${status.reason}), so Today and Alerts fall back to sample data until a clean read lands.`
              : "Today and Alerts are showing sample data — the always-available backup data. A saved read can replace it when one exists; this build does not fetch fresh market news by itself."}
          </CardDescription>
        </div>
      </CardHeader>
    </Card>
  );
}

function stageObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function formatRunCost(usd: number) {
  if (usd > 0 && usd < 0.01) return "<$0.01";
  return `$${usd.toFixed(2)}`;
}

function formatScanCost(usd: number, outsideReviewCalls: number) {
  if (usd <= 0 || outsideReviewCalls <= 0) return "$0 · local rules only";
  return `${formatRunCost(usd)} · ${outsideReviewCalls} outside review ${outsideReviewCalls === 1 ? "call" : "calls"}`;
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}
