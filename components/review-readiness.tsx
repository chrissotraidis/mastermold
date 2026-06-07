import {
  CheckCircle2,
  CircleAlert,
  Cpu,
  Database,
  LockKeyhole,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ProvenanceChip } from "@/components/provenance-chip";
import { ReviewerEvidencePanel } from "@/components/reviewer-evidence-panel";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getDataMode, getEngineRunHistory, getEngineStatus } from "@/src/db/engine-data";
import { getScreenerFeedback } from "@/src/db/screener-feedback";

type ReviewReadinessProps = {
  surface: "public" | "authenticated";
};

const disclosureSections = [
  {
    title: "What works (real in V0)",
    icon: CheckCircle2,
    tone: "text-emerald-200",
    summary: "These surfaces are wired and reviewable with seeded data.",
    items: [
      "Daily Briefing",
      "Card detail with drivers",
      "Alert Feed",
      "Portfolio + concentration",
      "Decision Journal + track record",
      "Paper Trading sandbox",
      "Agent Chat shell",
      "Executor monitor",
      "Integrations",
      "Review page",
      "Bitemporal as-of replay over seeded data",
    ],
  },
  {
    title: "Engine: live vs seeded vs stubbed",
    icon: Cpu,
    tone: "text-emerald-200",
    summary:
      "A Python sidecar (TradingAgents, screener-gated funnel) writes a dated JSON bundle the dashboard ingests. When a bundle is present and valid, the briefing and alert feed are computed, not fabricated; everything else still falls back to seeds.",
    items: [
      "LIVE when a run is ingested: Daily Briefing cards (PM rating → conviction + drivers) and the Alert Feed (deterministic z-score screener, no LLM).",
      "LIVE when a run carries resolved decisions: the Decision Journal's track-record-by-tier, the calibration curve, and the reflection significance gate — belief confidence moves only after N consistent same-direction outcomes; a single outcome cannot flip a belief.",
      "LIVE: chat interrogates today's engine briefing; the paper game auto-enters an engine prediction per card (human-vs-engine arena); the alert-feedback loop turns useful/not-useful marks into screener-threshold tuning suggestions (see Screener tuning above).",
      "Per-card and per-alert provenance reads 'Engine output' (emerald) vs 'Demo data' (cyan); a quiet day renders 'nothing actionable' at zero LLM cost.",
      "STILL SEEDED: portfolio, paper round scoring, executor metrics.",
      "STILL STUBBED (Phase 4, needs keys/ops): live cron scheduling, Anthropic prompt caching, batch-API reflections, and the live LLM run itself.",
      "Bitemporal honesty preserved: every engine artifact carries event_time + knowledge_time, stamped at write time, never backdated; future-stamped bundles are rejected as look-ahead.",
      "The engine never touches a brokerage — it reads data and writes JSON, so advisory-only / read-only is unchanged.",
    ],
  },
  {
    title: "What is seeded / sample / demo",
    icon: Database,
    tone: "text-cyan-200",
    summary:
      "Holdings, prices, funding, paper rounds, journal outcomes, and executor metrics are fabricated demo data. Briefing cards and alerts are seeded only when no engine run has been ingested.",
    items: [
      "No real money, positions, or P&L are represented in this V0.",
      "Fake monetary figures and portfolio values are for review only.",
      "Seed data includes event_time and knowledge_time so as-of replay can be inspected.",
      "Seeds are the permanent zero-config fallback: the app boots fully with no credentials and no engine output.",
    ],
  },
  {
    title: "Fake costs and monetary figures",
    icon: Database,
    tone: "text-cyan-200",
    summary:
      "Every dollar value, cost basis, portfolio value, and P&L-style outcome is sample/demo money.",
    items: [
      "No real money, positions, tax lots, realized P&L, or account balances are connected.",
      "Fake costs exist only to make portfolio concentration and journal review testable.",
      "The app never turns sample values into trade instructions.",
    ],
  },
  {
    title: "What is stubbed or credential-gated",
    icon: LockKeyhole,
    tone: "text-amber-200",
    summary:
      "External services are inert unless a reviewer chooses to provide local credentials.",
    items: [
      "Coinbase CDP is stubbed and only modeled as a view-only integration.",
      "Robinhood via SnapTrade is stubbed and modeled as read-only OAuth.",
      "Zerion on-chain data is stubbed.",
      "LLM chat and reasoning are credential-gated; add keys in .env.local for live output.",
    ],
  },
  {
    title: "Placeholder workflows",
    icon: CircleAlert,
    tone: "text-amber-200",
    summary:
      "Workflow controls prove local state changes for review, but they do not perform production work.",
    items: [
      "Create review packet builds a paper-only advisory packet in browser state.",
      "Guardrail edits, kill-switch actions, saves, toggles, and feedback are local review actions.",
      "No workflow signs a transaction, submits an order, moves funds, or contacts a chain RPC.",
    ],
  },
  {
    title: "What PRD promises remain missing in V0",
    icon: CircleAlert,
    tone: "text-rose-200",
    summary: "These PRD promises remain missing from the live V0 surface.",
    items: [
      "Always-on ingestion: the engine runs on demand (bin/engine-briefing), not yet as a scheduled always-on service (Phase 4).",
      "Live eval harness DSR/PBO/MinTRL, Alpaca paper live-shadow, and post-cutoff validation",
      "Bounded-autonomy Web3 executor as a live actor with custody, spend caps, fail-closed gates, and a real kill switch",
      "CPA tax sign-off for straddle and funding-income treatment before any real capital",
    ],
  },
] as const;

export function ReviewReadiness({ surface }: ReviewReadinessProps) {
  const dataMode = getDataMode();
  return (
    <section className="space-y-5" aria-labelledby="review-readiness-title">
      <div className="rounded-lg border border-white/10 bg-slate-950/70 p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-cyan-300 text-slate-950 hover:bg-cyan-300">
            Review readiness
          </Badge>
          <ProvenanceChip label={dataMode.label} title={dataMode.source} />
          <Badge variant="outline" className="border-white/15 text-slate-200">
            Truthfulness surface
          </Badge>
        </div>
        <h2
          id="review-readiness-title"
          className="mt-4 text-2xl font-semibold text-white sm:text-3xl"
        >
          What is real right now
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
          This page is the in-app disclosure for review mode. It separates working V0
          surfaces from seeded data, stubbed integrations, credential-gated services,
          and missing PRD promises.
        </p>
      </div>

      <EngineStatusCard />

      <ScreenerTuningCard />

      <div className="grid gap-4 lg:grid-cols-2">
        {disclosureSections.map((section) => {
          const Icon = section.icon;

          return (
            <Card key={section.title} className="border-white/10 bg-white/[0.035]">
              <CardHeader className="space-y-3 p-5">
                <div
                  className={`flex size-10 items-center justify-center rounded-md border border-white/10 bg-slate-950/50 ${section.tone}`}
                >
                  <Icon aria-hidden="true" className="size-5" />
                </div>
                <div>
                  <CardTitle className="text-xl text-white">{section.title}</CardTitle>
                  <CardDescription className="mt-2 text-sm leading-6 text-slate-300">
                    {section.summary}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="p-5 pt-0">
                <ul className="space-y-2 text-sm leading-6 text-slate-300">
                  {section.items.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-cyan-300" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border-cyan-300/20 bg-cyan-300/[0.06]">
        <CardHeader className="grid gap-4 p-5 sm:grid-cols-[auto_1fr] sm:items-center">
          <div className="flex size-11 items-center justify-center rounded-md border border-cyan-200/25 bg-slate-950/50 text-cyan-100">
            <UserRound aria-hidden="true" className="size-5" />
          </div>
          <div>
            <CardTitle className="text-xl text-white">Review-mode access</CardTitle>
            <CardDescription className="mt-2 text-sm leading-6 text-slate-300">
              Use reviewer@demo.local as the seeded review persona. No credentials are
              required to evaluate the app; entering real keys is optional, local, and
              isolated to the reviewer&apos;s environment.
            </CardDescription>
          </div>
        </CardHeader>
      </Card>

      <ReviewerEvidencePanel />

      <p className="text-sm leading-6 text-slate-400">
        {surface === "public"
          ? "Public preview disclosure: this build remains advisory-only and is not production-ready until RDS evidence passes."
          : "Operator disclosure: keep this review readiness panel current as seeded, stubbed, credential-gated, or missing workflows change."}
      </p>
    </section>
  );
}

/** Ingested-run history (per-run cost) from the durable store. */
function EngineRunHistory() {
  const history = getEngineRunHistory();
  if (history.length === 0) return null;

  return (
    <div className="rounded-md border border-white/10 bg-slate-950/45 p-3">
      <p className="text-xs font-semibold uppercase text-slate-400">
        Ingested run history ({history.length})
      </p>
      <ul className="mt-2 space-y-1 text-sm text-slate-200">
        {history.slice(0, 8).map((run) => (
          <li key={run.run_date} className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-slate-100">{run.run_date}</span>
            <span className="text-xs text-slate-400">
              {run.triggered} triggered · {run.usd > 0 ? `$${run.usd.toFixed(2)}` : "$0"}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs leading-5 text-slate-500">
        Ingestion is idempotent by run date; re-importing a day adds no duplicate.
      </p>
    </div>
  );
}

/** Alert-feedback → screener-threshold tuning loop, surfaced for the operator. */
function ScreenerTuningCard() {
  const feedback = getScreenerFeedback();
  if (feedback.signals.length === 0) return null;

  const tone: Record<string, string> = {
    demote: "border-rose-300/35 text-rose-100",
    loosen: "border-emerald-300/35 text-emerald-100",
    hold: "border-amber-300/35 text-amber-100",
    insufficient: "border-white/15 text-slate-300",
  };

  return (
    <Card className="border-white/10 bg-white/[0.035]">
      <CardHeader className="space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-xl text-white">Screener tuning</CardTitle>
          <ProvenanceChip label={feedback.provenance.label} />
        </div>
        <CardDescription className="text-sm leading-6 text-slate-300">
          The alert-feedback loop, no LLM: alerts you mark useful/not-useful tune the
          deterministic screener. Suggestions below are advisory — the threshold change in
          engine/config.yml stays manual. {feedback.total_rated} alert(s) rated so far.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-5 pt-0">
        <ul className="space-y-2 text-sm">
          {feedback.signals.map((s) => (
            <li
              key={s.signal}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-white/10 bg-slate-950/45 p-3"
            >
              <div className="min-w-0">
                <span className="font-mono text-slate-100">{s.signal}</span>
                <span className="ml-2 text-xs text-slate-400">
                  {s.useful}👍 · {s.not_useful}👎 · {s.pending} pending
                </span>
                <p className="mt-1 text-xs leading-5 text-slate-400">{s.rationale}</p>
              </div>
              <Badge variant="outline" className={tone[s.suggestion] ?? tone.insufficient}>
                {s.suggestion}
              </Badge>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** Live disclosure of the most recent engine run (or its absence). */
function EngineStatusCard() {
  const status = getEngineStatus();

  if (status.state === "live") {
    const run = status.bundle.run;
    const models = Object.entries(run.models)
      .map(([tier, id]) => `${tier}: ${id}`)
      .join(", ");
    const facts: Array<[string, string]> = [
      ["Run date", run.run_date],
      ["Provider", run.provider],
      ["Models", models || "—"],
      ["Triggered tickers", run.triggered_tickers.length ? run.triggered_tickers.join(", ") : "none (quiet day)"],
      ["LLM cost", run.cost.usd > 0 ? `$${run.cost.usd.toFixed(2)} · ${run.cost.llm_calls} calls` : "$0 (no agent runs)"],
      ["Knowledge time", run.knowledge_time],
    ];
    return (
      <Card className="border-emerald-300/25 bg-emerald-300/[0.06]">
        <CardHeader className="grid gap-4 p-5 sm:grid-cols-[auto_1fr] sm:items-center">
          <div className="flex size-11 items-center justify-center rounded-md border border-emerald-200/25 bg-slate-950/50 text-emerald-100">
            <Cpu aria-hidden="true" className="size-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-xl text-white">Engine output is live</CardTitle>
              <ProvenanceChip label="Engine output" />
            </div>
            <CardDescription className="mt-2 text-sm leading-6 text-slate-300">
              Briefing cards and alerts on this build are computed by the latest ingested
              TradingAgents run. Cost figures below are per-run actuals.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-5 pt-0">
          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {facts.map(([label, value]) => (
              <div key={label} className="rounded-md border border-white/10 bg-slate-950/45 p-3">
                <dt className="text-xs font-semibold uppercase text-slate-400">{label}</dt>
                <dd className="mt-1 break-words text-slate-100">{value}</dd>
              </div>
            ))}
          </dl>
          <EngineRunHistory />
        </CardContent>
      </Card>
    );
  }

  const invalid = status.state === "invalid";
  return (
    <Card className={invalid ? "border-amber-300/25 bg-amber-300/[0.06]" : "border-cyan-300/20 bg-cyan-300/[0.06]"}>
      <CardHeader className="grid gap-4 p-5 sm:grid-cols-[auto_1fr] sm:items-center">
        <div className={`flex size-11 items-center justify-center rounded-md border bg-slate-950/50 ${invalid ? "border-amber-200/25 text-amber-100" : "border-cyan-200/25 text-cyan-100"}`}>
          {invalid ? <CircleAlert aria-hidden="true" className="size-5" /> : <Database aria-hidden="true" className="size-5" />}
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-xl text-white">
              {invalid ? "Engine output present but unusable" : "No engine output ingested"}
            </CardTitle>
            <ProvenanceChip label="Demo data" />
          </div>
          <CardDescription className="mt-2 text-sm leading-6 text-slate-300">
            {invalid
              ? `The newest bundle was rejected (${status.reason}). The briefing and alerts fall back to seeded demo data until a valid run lands.`
              : "Briefing and alerts render from seeded demo data — the permanent zero-config fallback. Run bin/engine-briefing to ingest a live run."}
          </CardDescription>
        </div>
      </CardHeader>
    </Card>
  );
}
