import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BookOpenText,
  CalendarClock,
  ClipboardPenLine,
  MessageSquareWarning,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AskMasterMoldButton } from "@/components/master-mold-actions";
import { OpenAlertsAction } from "@/components/open-alerts-action";
import { ProvenanceChip } from "@/components/provenance-chip";
import { SaveBriefingCallButton } from "@/components/save-briefing-call-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cleanAlertMessage, explainAlertRelevance, shortAlertTierLabel } from "@/lib/alert-loop";
import { buildBriefingJournalDraftHref } from "@/lib/briefing-journal-copy";
import { plainBriefingHeadline, plainBriefingText } from "@/lib/plain-finance-copy";
import { productProvenanceLabel, productProvenanceSource } from "@/lib/provenance-copy";
import { cn } from "@/lib/utils";
import { getAlerts } from "@/src/db/alerts";
import { getBriefingCardById, getBriefingCardIds } from "@/src/db/briefing";
import type { Driver } from "@/src/db/schema";

type BriefingDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export function generateStaticParams() {
  return getBriefingCardIds().map((id) => ({ id }));
}

export default async function BriefingDetailPage({ params }: BriefingDetailPageProps) {
  const { id } = await params;
  const card = getBriefingCardById(id);

  if (!card) {
    notFound();
  }
  const headline = plainBriefingHeadline(card.headline);
  const matchingAlert = getAlerts().find((alert) => card.asset_ids.includes(alert.asset_id));
  const askQuery = `Explain this idea in plain language: ${headline}. Tell me the bear case, what would prove it wrong, and whether it matters to the visible holdings.`;
  const journalDraftHref = buildBriefingJournalDraftHref({ card, drivers: card.drivers });
  const paperDraftHref = buildBriefingPaperHref(headline, card.relevance_note);
  const publicProvenanceLabel = productProvenanceLabel(card.provenance.label);
  const sourceNotes = card.drivers.slice(0, 3).map((driver) => plainBriefingText(driver.label));

  return (
    <AppShell dataMode={publicProvenanceLabel}>
      <div className="mx-auto max-w-5xl space-y-6">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-md pr-3 text-sm text-outline transition-colors hover:text-violet"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Today
        </Link>

        <header className="space-y-5 border border-outline-variant/40 bg-surface-high/30 p-5 chamfer sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-outline-variant/50 bg-surface-dim/60 text-on-surface-variant">
              Rank {card.rank}
            </Badge>
            <ProvenanceChip
              label={publicProvenanceLabel}
              title={productProvenanceSource(card.provenance.label, card.provenance.source)}
            />
            <Badge variant="outline" className="gap-1 border-outline-variant/50 bg-surface-dim/60 text-on-surface">
              <CalendarClock aria-hidden="true" className="size-3.5" />
              {card.horizon}
            </Badge>
          </div>

          <div className="grid gap-5 lg:grid-cols-[1fr_18rem] lg:items-end">
            <div className="space-y-3">
              <h1 className="max-w-4xl text-3xl font-semibold leading-tight text-on-surface sm:text-4xl">
                {headline}
              </h1>
              <p className="max-w-3xl text-sm leading-6 text-on-surface-variant sm:text-base sm:leading-7">
                {plainBriefingText(card.why_now)}
              </p>
            </div>
            <div className="rounded-md border border-violet/30 bg-violet/10 p-4">
              <p className="text-sm font-medium text-violet">Review score</p>
              <p className="mt-2 text-4xl font-semibold text-on-surface">{card.conviction}/10</p>
              <p className="mt-1 text-sm font-semibold text-on-surface">{briefingStrengthLabel(card.conviction)}</p>
              <p className="mt-2 text-sm leading-6 text-on-surface-variant">{plainBriefingText(card.relevance_note)}</p>
            </div>
          </div>
        </header>

        <section
          aria-labelledby="decision-check-title"
          className="grid gap-4 border border-violet/25 bg-violet/[0.06] p-4 chamfer-sm sm:p-5 lg:grid-cols-[minmax(0,1fr)_18rem]"
        >
          <div className="min-w-0">
            <p className="font-mono text-[11px] uppercase tracking-telemetry text-violet">Start here</p>
            <h2 id="decision-check-title" className="mt-1 font-display text-xl font-semibold leading-7 text-on-surface">
              {briefingDecisionTitle(card.conviction)}
            </h2>
            <p className="mt-2 text-sm leading-6 text-on-surface-variant">
              {briefingNextCheck(card.conviction)}
            </p>
          </div>
          <div className="grid min-w-0 gap-2">
            <AskMasterMoldButton prompt={askQuery} variant="primary" className="w-full">
              Ask about this idea
            </AskMasterMoldButton>
            <Link
              href={paperDraftHref}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-caution/35 bg-caution/10 px-3 py-2 text-sm font-semibold text-caution transition hover:bg-caution/15"
            >
              <Wallet aria-hidden="true" className="size-4" />
              Test as paper trade
            </Link>
            <SaveBriefingCallButton
              headline={headline}
              reason={plainBriefingText(card.relevance_note)}
              confidence={card.conviction}
              horizon={card.horizon}
              source={publicProvenanceLabel}
              sourceNotes={sourceNotes}
            />
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
          <section aria-labelledby="ranked-drivers-title" className="space-y-4">
            <h2 id="ranked-drivers-title" className="font-display text-lg font-semibold text-on-surface">
              Why this is on the list
            </h2>

            <div className="grid gap-3">
              {card.drivers.length > 0 ? (
                card.drivers.map((driver, index) => (
                  <DriverRow key={driver.id} driver={driver} position={index + 1} />
                ))
              ) : (
                <Card className="border-outline-variant/40 bg-surface-high/30">
                  <CardContent className="p-5 text-sm text-on-surface-variant">
                    No reasons to watch are available for this idea.
                  </CardContent>
                </Card>
              )}
            </div>
          </section>

          <aside className="space-y-4">
            <Card className="border-violet/30 bg-violet/[0.06]">
              <CardHeader className="p-5">
                <CardDescription className="text-violet">Next in the loop</CardDescription>
                <CardTitle className="text-lg leading-6 text-on-surface">
                  Save the call before judging the result.
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 p-5 pt-0">
                <Button asChild variant="outline" className="w-full border-outline-variant/50 bg-transparent text-on-surface hover:bg-surface-high/60">
                  <Link href={journalDraftHref}>
                    <ClipboardPenLine aria-hidden="true" />
                    Open journal draft
                  </Link>
                </Button>
              </CardContent>
            </Card>

            {matchingAlert ? (
              <Card
                className={
                  matchingAlert.tier === "T0"
                    ? "border-critical/30 bg-critical/[0.07]"
                    : matchingAlert.tier === "T1"
                      ? "border-caution/25 bg-caution/[0.07]"
                      : "border-outline-variant/40 bg-surface-high/30"
                }
              >
                <CardHeader className="p-5">
                  <CardDescription
                    className={
                      matchingAlert.tier === "T0"
                        ? "flex items-center gap-2 text-critical"
                        : matchingAlert.tier === "T1"
                          ? "flex items-center gap-2 text-caution"
                          : "flex items-center gap-2 text-outline"
                    }
                  >
                    <MessageSquareWarning aria-hidden="true" className="size-4" />
                    {shortAlertTierLabel(matchingAlert.tier)} alert
                  </CardDescription>
                  <CardTitle className="text-lg leading-6 text-on-surface">
                    {cleanAlertMessage(matchingAlert.message)}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 p-5 pt-0">
                  <p className="text-sm leading-6 text-on-surface-variant">
                    {explainAlertRelevance(matchingAlert)}
                  </p>
                  <OpenAlertsAction className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-outline-variant/50 bg-transparent px-3 py-2 text-sm font-semibold text-on-surface transition hover:bg-surface-high/60">
                    Open alert inbox
                  </OpenAlertsAction>
                </CardContent>
              </Card>
            ) : null}

            <Card className="border-engine/20 bg-engine/10">
              <CardHeader className="p-5">
                <CardDescription className="text-engine">Bull case</CardDescription>
                <CardTitle className="text-lg leading-6 text-on-surface">{plainBriefingText(card.bull_case)}</CardTitle>
              </CardHeader>
            </Card>

            <Card className="border-critical/20 bg-critical/10">
              <CardHeader className="p-5">
                <CardDescription className="text-critical">Bear case</CardDescription>
                <CardTitle className="text-lg leading-6 text-on-surface">{plainBriefingText(card.bear_case)}</CardTitle>
              </CardHeader>
            </Card>

            <Card className="border-outline-variant/40 bg-surface-high/30">
              <CardHeader className="p-5">
                <CardDescription className="text-outline">My call</CardDescription>
                <CardTitle className="text-lg text-on-surface">
                  {card.decision_journal_entry ? "Saved before the outcome" : "No call saved yet"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 p-5 pt-0">
                {card.decision_journal_entry ? (
                  <>
                    <p className="text-sm leading-6 text-on-surface-variant">
                      {plainBriefingHeadline(card.decision_journal_entry.thesis)}
                    </p>
                    <Button asChild className="w-full bg-violet text-void hover:bg-violet">
                      <Link href={`/journal?entry=${card.decision_journal_entry.id}`}>
                        <BookOpenText aria-hidden="true" />
                        See it in the journal
                      </Link>
                    </Button>
                  </>
                ) : (
                  <p className="text-sm leading-6 text-on-surface-variant">
                    Open a draft if you want this idea counted in the Decision journal.
                  </p>
                )}
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

function DriverRow({ driver, position }: { driver: Driver; position: number }) {
  const isBullish = driver.direction === "bullish";
  const Icon = isBullish ? TrendingUp : TrendingDown;
  const label = plainBriefingText(driver.label);
  const evidence = driverEvidenceLabel(driver);

  return (
    <Card
      className={cn(
        "border-outline-variant/40 bg-surface-high/30",
        isBullish ? "border-l-4 border-l-engine" : "border-l-4 border-l-critical",
      )}
    >
      <CardHeader className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-outline-variant/50 bg-surface-dim/60 text-on-surface-variant">
                #{position}
              </Badge>
              <Badge
                variant="outline"
                className={cn(
                  "gap-1 border-outline-variant/50 bg-surface-dim/60",
                  isBullish ? "text-engine" : "text-critical",
                )}
              >
                <Icon aria-hidden="true" className="size-3.5" />
                {driverDirectionLabel(driver.direction)}
              </Badge>
            </div>
            <CardTitle className="text-xl leading-7 text-on-surface">{label}</CardTitle>
          </div>
          <div className="shrink-0 rounded-md border border-outline-variant/40 bg-surface-dim/50 px-3 py-2 text-left sm:text-right">
            <p className="text-xs font-medium uppercase text-outline">Role</p>
            <p className="text-lg font-semibold text-on-surface">{driverWeightLabel(driver.weight)}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-5 pt-0 text-sm leading-6 text-on-surface-variant">
        <p>
          <span className="font-semibold text-on-surface">Why it matters:</span>{" "}
          {driverWhyItMatters(driver, label)}
        </p>
        <details className="group rounded-md border border-outline-variant/40 bg-surface-dim/40 p-3">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-violet marker:text-violet">
            What supports this
          </summary>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div className="sm:col-span-2">
              <dt className="text-outline">Source note</dt>
              <dd className="text-on-surface-variant">{evidence}</dd>
            </div>
            <div>
              <dt className="text-outline">Market time</dt>
              <dd className="text-on-surface-variant">{formatTimestamp(driver.event_time)}</dd>
            </div>
            <div>
              <dt className="text-outline">Saved in app</dt>
              <dd className="text-on-surface-variant">{formatTimestamp(driver.knowledge_time)}</dd>
            </div>
          </dl>
        </details>
      </CardContent>
    </Card>
  );
}

function driverWhyItMatters(driver: Driver, label: string) {
  const source = plainBriefingText(driver.source_citation);
  const main = driver.weight >= 0.4;

  if (/quiet news flow/i.test(label)) {
    return "There may not be enough fresh news to explain the move, so avoid treating price action alone as confirmation.";
  }
  if (/portfolio snapshot/i.test(source)) {
    return "This ties the idea to the visible portfolio, so it matters for sizing and risk rather than just a watchlist.";
  }
  if (/price|momentum|strength|return/i.test(label)) {
    return driver.direction === "bearish"
      ? "Price is moving against the idea — if it keeps fading, the setup weakens before anything else does."
      : `Price has moved beyond its recent range. ${main ? "That move is the main reason this idea is on the board." : "It backs the idea, but on its own it is not proof."}`;
  }
  if (/volume|trading/i.test(label)) {
    return "Trading is well above normal. Moves on heavy volume are more likely to carry through than quiet drifts.";
  }
  if (/headline|news|coverage/i.test(label)) {
    return driver.direction === "bearish"
      ? "Recent coverage leans negative — headlines like this can cap a bounce even when price looks strong."
      : "Recent coverage supports the move, which makes follow-through more plausible.";
  }
  if (/uncertain|counter|risk/i.test(label)) {
    return "This is the strongest argument against the idea. If it grows, the call is wrong — that is the line to watch.";
  }
  return driver.direction === "bearish"
    ? "This argues against the idea. Weigh it before acting on the bullish case."
    : `This supports the idea${main ? " and carries most of its weight" : ""}.`;
}

function driverEvidenceLabel(driver: Driver) {
  const source = plainBriefingText(driver.source_citation);
  if (/^Market summary$/i.test(source)) {
    return "Saved market summary for this idea.";
  }
  return source;
}

function driverDirectionLabel(direction: Driver["direction"]) {
  return direction === "bullish" ? "Supports" : "Risk";
}

function driverWeightLabel(weight: number) {
  if (weight >= 0.4) return "Main reason";
  if (weight >= 0.25) return "Important";
  return "Supporting";
}

function briefingStrengthLabel(confidence: number) {
  if (confidence >= 7) return "Strong enough to review, not enough to act blindly.";
  if (confidence >= 4) return "Worth watching, but not a green light.";
  return "Weak read. Keep it on the watchlist.";
}

function briefingDecisionTitle(confidence: number) {
  if (confidence >= 7) return "Check the downside before changing exposure.";
  if (confidence >= 4) return "Watch first, then test with paper money.";
  return "No action unless the next read improves.";
}

function briefingNextCheck(confidence: number) {
  if (confidence >= 7) {
    return "Start with position size and the bear case. If the idea still makes sense, save the call or test it in Paper before taking action elsewhere.";
  }

  if (confidence >= 4) {
    return "There is enough here to monitor, but not enough to chase. Use Paper if you want a low-stakes test.";
  }

  return "Treat this as background context. The app should be able to say nothing urgent when the evidence is thin.";
}

function buildBriefingPaperHref(headline: string, relevance: string) {
  const params = new URLSearchParams({
    rationale: `Testing this idea as a paper trade: ${headline}. ${plainBriefingText(relevance)}`,
  });
  return `/paper?${params.toString()}`;
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}
