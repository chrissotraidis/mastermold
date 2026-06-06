import {
  CheckCircle2,
  CircleAlert,
  Database,
  LockKeyhole,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ReviewerEvidencePanel } from "@/components/reviewer-evidence-panel";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
    title: "What is seeded / sample / demo",
    icon: Database,
    tone: "text-cyan-200",
    summary:
      "All holdings, prices, news, funding, briefing cards, alerts, journal outcomes, paper rounds, and executor metrics are fabricated demo data.",
    items: [
      "No real money, positions, or P&L are represented in this V0.",
      "Fake monetary figures and portfolio values are for review only.",
      "Seed data includes event_time and knowledge_time so as-of replay can be inspected.",
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
      "Always-on ingestion pipeline",
      "Live eval harness DSR/PBO/MinTRL, Alpaca paper live-shadow, and post-cutoff validation",
      "Bounded-autonomy Web3 executor as a live actor with custody, spend caps, fail-closed gates, and a real kill switch",
      "CPA tax sign-off for straddle and funding-income treatment before any real capital",
    ],
  },
] as const;

export function ReviewReadiness({ surface }: ReviewReadinessProps) {
  return (
    <section className="space-y-5" aria-labelledby="review-readiness-title">
      <div className="rounded-lg border border-white/10 bg-slate-950/70 p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-cyan-300 text-slate-950 hover:bg-cyan-300">
            Review readiness
          </Badge>
          <Badge variant="outline" className="border-white/15 text-slate-200">
            Demo data
          </Badge>
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
