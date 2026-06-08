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
    title: "Working now",
    icon: CheckCircle2,
    tone: "text-engine",
    summary: "Fully wired and reviewable on sample data.",
    items: [
      "Daily briefing, and card detail with ranked drivers",
      "Alert feed",
      "Portfolio and concentration",
      "Decision journal and track record",
      "Practice rounds",
      "Chat",
      "Web3 strategy monitor",
      "Connections",
      "Time-travel: replay any page as of an earlier moment",
    ],
  },
  {
    title: "What the engine computes",
    icon: Cpu,
    tone: "text-engine",
    summary:
      "When a run is loaded, these come straight from it. Everything else falls back to sample data.",
    items: [
      "Briefing cards — conviction and drivers — and the alert feed, which is a z-score screener with no model in the loop.",
      "When a run carries resolved calls: the track record, the calibration curve, and the belief-update gate. A belief only moves after several consistent outcomes — never on a single one.",
      "Chat reasons over today's briefing. Practice auto-enters my call on each idea to score against. Marking alerts useful or not tunes the screener.",
      "Every card and alert is labeled Engine output or Demo data. A quiet day costs nothing — no model runs.",
      "Still on sample data: portfolio, practice scoring, strategy metrics.",
      "Each engine fact carries when it happened and when it became known — stamped on write, never backdated.",
      "The engine reads data and writes results. It never touches a brokerage, so the advisory-only line holds.",
    ],
  },
  {
    title: "Sample data",
    icon: Database,
    tone: "text-violet",
    summary:
      "Holdings, prices, funding, practice rounds, and outcomes are sample data. Briefing and alerts use it only when no engine run is loaded.",
    items: [
      "No real positions, balances, or P&L are connected.",
      "Sample figures exist so concentration, calibration, and scoring are reviewable.",
      "Sample data carries timestamps too, so time-travel works against it.",
      "It's the always-available fallback — the app runs fully with no keys and no engine.",
    ],
  },
  {
    title: "The money isn't real",
    icon: Database,
    tone: "text-violet",
    summary: "Every dollar amount, cost basis, and P&L line is sample money.",
    items: [
      "No real balances, tax lots, or realized P&L are connected.",
      "Sample amounts only exist to make the portfolio and journal reviewable.",
      "Nothing here turns a sample figure into a trade.",
    ],
  },
  {
    title: "Dormant connections",
    icon: LockKeyhole,
    tone: "text-caution",
    summary: "External services stay inert until you add your own keys, locally.",
    items: [
      "Coinbase — read-only, modeled with sample balances.",
      "Robinhood, via SnapTrade — read-only, modeled with sample balances.",
      "On-chain wallet, via Zerion — sample data.",
      "Reasoning model — chat runs from a fixed script until you add a model key in .env.local.",
    ],
  },
  {
    title: "Local-only actions",
    icon: CircleAlert,
    tone: "text-caution",
    summary: "Controls here change state in your browser to prove the flow. None reach production.",
    items: [
      "Saving a guardrail draft, pressing a kill switch, toggling a connection, and rating an alert all stay local.",
      "Nothing signs a transaction, places an order, moves funds, or calls a chain.",
    ],
  },
  {
    title: "Not built yet",
    icon: CircleAlert,
    tone: "text-critical",
    summary: "On the roadmap, not in this build.",
    items: [
      "An always-on engine on a schedule — today it runs on demand.",
      "A live evaluation harness and post-cutoff validation.",
      "A real Web3 executor that signs, with custody limits and a working kill switch.",
      "Tax sign-off before any real capital goes in.",
    ],
  },
] as const;

export function ReviewReadiness({ surface }: ReviewReadinessProps) {
  const dataMode = getDataMode();
  return (
    <section className="space-y-5" aria-labelledby="review-readiness-title">
      <div className="rounded-lg border border-outline-variant/40 bg-surface-dim/70 p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-violet text-void hover:bg-violet">
            What's real
          </Badge>
          <ProvenanceChip label={dataMode.label} title={dataMode.source} />
        </div>
        <h2
          id="review-readiness-title"
          className="mt-4 text-2xl font-semibold text-on-surface sm:text-3xl"
        >
          What is real right now
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-on-surface-variant sm:text-base">
          Nothing here pretends to be more than it is. Below: what's computed from a live
          engine run, what's sample data, which connections are dormant, and what's still
          being built. Labeled, so you're never guessing.
        </p>
      </div>

      <EngineStatusCard />

      <ScreenerTuningCard />

      <div className="grid gap-4 lg:grid-cols-2">
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
                  <CardTitle className="text-xl text-on-surface">{section.title}</CardTitle>
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

      <Card className="border-violet/30 bg-violet/10">
        <CardHeader className="grid gap-4 p-5 sm:grid-cols-[auto_1fr] sm:items-center">
          <div className="flex size-11 items-center justify-center rounded-md border border-violet/30 bg-surface-dim/50 text-violet">
            <UserRound aria-hidden="true" className="size-5" />
          </div>
          <div>
            <CardTitle className="text-xl text-on-surface">No setup required</CardTitle>
            <CardDescription className="mt-2 text-sm leading-6 text-on-surface-variant">
              No login or credentials needed to look around. Any keys you add are optional
              and stay in this browser.
            </CardDescription>
          </div>
        </CardHeader>
      </Card>

      <ReviewerEvidencePanel />

      <p className="text-sm leading-6 text-outline">
        {surface === "public"
          ? "Preview build — advisory-only, and not production-ready yet."
          : "Keep this page current as sample, gated, or unbuilt features change."}
      </p>
    </section>
  );
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
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

/** Ingested-run history (per-run cost) from the durable store. */
function EngineRunHistory() {
  const history = getEngineRunHistory();
  if (history.length === 0) return null;

  return (
    <div className="rounded-md border border-outline-variant/40 bg-surface-dim/45 p-3">
      <p className="text-xs font-semibold uppercase text-outline">
        Ingested run history ({history.length})
      </p>
      <ul className="mt-2 space-y-1 text-sm text-on-surface-variant">
        {history.slice(0, 8).map((run) => (
          <li key={run.run_date} className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-on-surface">{run.run_date}</span>
            <span className="text-xs text-outline">
              {run.triggered} triggered · {run.usd > 0 ? `$${run.usd.toFixed(2)}` : "$0"}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs leading-5 text-outline">
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
    demote: "border-critical/40 text-critical",
    loosen: "border-engine/40 text-engine",
    hold: "border-amber-300/35 text-caution",
    insufficient: "border-outline-variant/50 text-on-surface-variant",
  };

  return (
    <Card className="border-outline-variant/40 bg-surface-high/30">
      <CardHeader className="space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-xl text-on-surface">Screener tuning</CardTitle>
          <ProvenanceChip label={feedback.provenance.label} />
        </div>
        <CardDescription className="text-sm leading-6 text-on-surface-variant">
          Marking alerts useful or not tunes the screener thresholds — no model involved.
          These are suggestions; I don't change the config myself. {feedback.total_rated} rated
          so far.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-5 pt-0">
        <ul className="space-y-2 text-sm">
          {feedback.signals.map((s) => (
            <li
              key={s.signal}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-outline-variant/40 bg-surface-dim/45 p-3"
            >
              <div className="min-w-0">
                <span className="font-mono text-on-surface">{s.signal}</span>
                <span className="ml-2 text-xs text-outline">
                  {s.useful}👍 · {s.not_useful}👎 · {s.pending} pending
                </span>
                <p className="mt-1 text-xs leading-5 text-outline">{s.rationale}</p>
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
    const tierNames: Record<string, string> = { quick_think: "Fast", deep_think: "Deep" };
    const models = Object.entries(run.models)
      .map(([tier, id]) => `${tierNames[tier] ?? tier}: ${id}`)
      .join(", ");
    const facts: Array<[string, string]> = [
      ["Run date", run.run_date],
      ["Provider", titleCase(run.provider)],
      ["Models", models || "—"],
      ["Tickers flagged", run.triggered_tickers.length ? run.triggered_tickers.join(", ") : "none (quiet day)"],
      ["Cost", run.cost.usd > 0 ? `$${run.cost.usd.toFixed(2)} · ${run.cost.llm_calls} calls` : "$0 (no agent runs)"],
      ["Known as of", formatReviewTimestamp(run.knowledge_time)],
    ];
    return (
      <Card className="border-engine/30 bg-engine/[0.06]">
        <CardHeader className="grid gap-4 p-5 sm:grid-cols-[auto_1fr] sm:items-center">
          <div className="flex size-11 items-center justify-center rounded-md border border-engine/30 bg-surface-dim/50 text-engine">
            <Cpu aria-hidden="true" className="size-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-xl text-on-surface">Engine output is live</CardTitle>
              <ProvenanceChip label="Engine output" />
            </div>
            <CardDescription className="mt-2 text-sm leading-6 text-on-surface-variant">
              Today's briefing and alerts are computed from a live run. The exact run
              behind them:
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-5 pt-0">
          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {facts.map(([label, value]) => (
              <div key={label} className="rounded-md border border-outline-variant/40 bg-surface-dim/45 p-3">
                <dt className="text-xs font-semibold uppercase text-outline">{label}</dt>
                <dd className="mt-1 break-words text-on-surface">{value}</dd>
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
    <Card className={invalid ? "border-caution/30 bg-caution/10" : "border-violet/30 bg-violet/10"}>
      <CardHeader className="grid gap-4 p-5 sm:grid-cols-[auto_1fr] sm:items-center">
        <div className={`flex size-11 items-center justify-center rounded-md border bg-surface-dim/50 ${invalid ? "border-caution/30 text-caution" : "border-violet/30 text-violet"}`}>
          {invalid ? <CircleAlert aria-hidden="true" className="size-5" /> : <Database aria-hidden="true" className="size-5" />}
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-xl text-on-surface">
              {invalid ? "Latest run couldn't be used" : "No engine run loaded"}
            </CardTitle>
            <ProvenanceChip label="Demo data" />
          </div>
          <CardDescription className="mt-2 text-sm leading-6 text-on-surface-variant">
            {invalid
              ? `The newest run was rejected (${status.reason}), so briefing and alerts fall back to sample data until a clean run lands.`
              : "Briefing and alerts are showing sample data — the always-available fallback. Run the engine briefing to load live output."}
          </CardDescription>
        </div>
      </CardHeader>
    </Card>
  );
}
