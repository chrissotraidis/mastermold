import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BookOpenText,
  CalendarClock,
  Database,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ProvenanceChip } from "@/components/provenance-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
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

  return (
    <AppShell dataMode={card.provenance.label}>
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-5 sm:py-8">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-md text-on-surface-variant underline-offset-4 hover:text-on-surface hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet focus-visible:ring-offset-2 focus-visible:ring-offset-void"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Back to briefing
          </Link>
          <span className="text-outline-variant" aria-hidden="true">
            /
          </span>
          <span className="text-outline">Card detail</span>
        </nav>

        <header className="space-y-5 rounded-lg border border-outline-variant/40 bg-surface-high/30 p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-outline-variant/50 bg-surface-dim/60 text-on-surface-variant">
              Rank {card.rank}
            </Badge>
            <ProvenanceChip label={card.provenance.label} title={card.provenance.source} />
            <DataProvenanceChip source={card.provenance.source} asOf={card.provenance.as_of} />
            <Badge variant="outline" className="gap-1 border-outline-variant/50 bg-surface-dim/60 text-on-surface">
              <CalendarClock aria-hidden="true" className="size-3.5" />
              {card.horizon}
            </Badge>
          </div>

          <div className="grid gap-5 lg:grid-cols-[1fr_18rem] lg:items-end">
            <div className="space-y-3">
              <h2 className="max-w-4xl text-3xl font-semibold leading-tight text-on-surface sm:text-4xl">
                {card.headline}
              </h2>
              <p className="max-w-3xl text-sm leading-6 text-on-surface-variant sm:text-base sm:leading-7">
                {card.why_now}
              </p>
            </div>
            <div className="rounded-md border border-violet/30 bg-violet/10 p-4">
              <p className="text-sm font-medium text-violet">Conviction</p>
              <p className="mt-2 text-4xl font-semibold text-on-surface">{card.conviction}/10</p>
              <p className="mt-2 text-sm leading-6 text-on-surface-variant">{card.relevance_note}</p>
            </div>
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
          <section aria-labelledby="ranked-drivers-title" className="space-y-4">
            <div>
              <h2 id="ranked-drivers-title" className="text-xl font-semibold text-on-surface">
                Ranked drivers
              </h2>
              <p className="mt-1 text-sm text-outline">
                View ranked drivers, expand source citation details, and compare bull and bear
                pressure before navigating to the linked journal entry.
              </p>
            </div>

            <div className="grid gap-3">
              {card.drivers.length > 0 ? (
                card.drivers.map((driver, index) => (
                  <DriverRow key={driver.id} driver={driver} position={index + 1} />
                ))
              ) : (
                <Card className="border-outline-variant/40 bg-surface-high/30">
                  <CardContent className="p-5 text-sm text-on-surface-variant">
                    No ranked drivers are seeded for this briefing card.
                  </CardContent>
                </Card>
              )}
            </div>
          </section>

          <aside className="space-y-4">
            <Card className="border-engine/20 bg-engine/10">
              <CardHeader className="p-5">
                <CardDescription className="text-engine">Bull case</CardDescription>
                <CardTitle className="text-lg leading-6 text-on-surface">{card.bull_case}</CardTitle>
              </CardHeader>
            </Card>

            <Card className="border-critical/20 bg-critical/10">
              <CardHeader className="p-5">
                <CardDescription className="text-critical">Bear case</CardDescription>
                <CardTitle className="text-lg leading-6 text-on-surface">{card.bear_case}</CardTitle>
              </CardHeader>
            </Card>

            <Card className="border-outline-variant/40 bg-surface-high/30">
              <CardHeader className="p-5">
                <CardDescription className="text-outline">Linked journal</CardDescription>
                <CardTitle className="text-lg text-on-surface">
                  {card.decision_journal_entry ? "Linked journal entry" : "No journal entry"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 p-5 pt-0">
                {card.decision_journal_entry ? (
                  <>
                    <p className="text-sm leading-6 text-on-surface-variant">
                      {card.decision_journal_entry.thesis}
                    </p>
                    <Button asChild className="w-full bg-violet text-void hover:bg-violet">
                      <Link href={`/journal?entry=${card.decision_journal_entry.id}`}>
                        <BookOpenText aria-hidden="true" />
                        View journal entry
                      </Link>
                    </Button>
                  </>
                ) : (
                  <p className="text-sm leading-6 text-on-surface-variant">
                    This seeded card does not have an associated journal entry yet.
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

function DataProvenanceChip({ source, asOf }: { source: string; asOf: string }) {
  return (
    <Badge variant="outline" className="gap-1 border-outline-variant/50 bg-surface-dim/60 text-on-surface-variant">
      <Database aria-hidden="true" className="size-3.5" />
      {source} as of {formatTimestamp(asOf)}
    </Badge>
  );
}

function DriverRow({ driver, position }: { driver: Driver; position: number }) {
  const isBullish = driver.direction === "bullish";
  const Icon = isBullish ? TrendingUp : TrendingDown;

  return (
    <Card
      className={cn(
        "border-outline-variant/40 bg-surface-high/30",
        isBullish ? "border-l-4 border-l-emerald-300" : "border-l-4 border-l-rose-300",
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
                {driver.direction}
              </Badge>
            </div>
            <CardTitle className="text-xl leading-7 text-on-surface">{driver.label}</CardTitle>
          </div>
          <div className="shrink-0 rounded-md border border-outline-variant/40 bg-surface-dim/50 px-3 py-2 text-left sm:text-right">
            <p className="text-xs font-medium uppercase text-outline">Weight</p>
            <p className="text-lg font-semibold text-on-surface">{formatWeight(driver.weight)}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-5 pt-0 text-sm leading-6 text-on-surface-variant">
        <p>
          <span className="font-semibold text-on-surface">Source citation:</span>{" "}
          {driver.source_citation}
        </p>
        <details className="group rounded-md border border-outline-variant/40 bg-surface-dim/40 p-3">
          <summary className="cursor-pointer text-sm font-medium text-violet marker:text-violet">
            Expand source citation
          </summary>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-outline">Event time</dt>
              <dd className="text-on-surface-variant">{formatTimestamp(driver.event_time)}</dd>
            </div>
            <div>
              <dt className="text-outline">Knowledge time</dt>
              <dd className="text-on-surface-variant">{formatTimestamp(driver.knowledge_time)}</dd>
            </div>
          </dl>
        </details>
      </CardContent>
    </Card>
  );
}

function formatWeight(weight: number) {
  return `${Math.round(weight * 100)}%`;
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}
