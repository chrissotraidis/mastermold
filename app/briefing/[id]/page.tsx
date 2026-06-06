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
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-5 sm:py-8">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-md text-slate-300 underline-offset-4 hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Back to briefing
          </Link>
          <span className="text-slate-600" aria-hidden="true">
            /
          </span>
          <span className="text-slate-400">Card detail</span>
        </nav>

        <header className="space-y-5 rounded-lg border border-white/10 bg-white/[0.035] p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-white/15 bg-slate-950/60 text-slate-200">
              Rank {card.rank}
            </Badge>
            <Badge variant="outline" className="border-white/15 bg-slate-950/60 text-slate-200">
              Demo data
            </Badge>
            <DataProvenanceChip source={card.provenance.source} asOf={card.provenance.as_of} />
            <Badge variant="outline" className="gap-1 border-white/15 bg-slate-950/60 text-slate-100">
              <CalendarClock aria-hidden="true" className="size-3.5" />
              {card.horizon}
            </Badge>
          </div>

          <div className="grid gap-5 lg:grid-cols-[1fr_18rem] lg:items-end">
            <div className="space-y-3">
              <h2 className="max-w-4xl text-3xl font-semibold leading-tight text-white sm:text-4xl">
                {card.headline}
              </h2>
              <p className="max-w-3xl text-sm leading-6 text-slate-300 sm:text-base sm:leading-7">
                {card.why_now}
              </p>
            </div>
            <div className="rounded-md border border-cyan-300/20 bg-cyan-300/[0.06] p-4">
              <p className="text-sm font-medium text-cyan-100">Conviction</p>
              <p className="mt-2 text-4xl font-semibold text-white">{card.conviction}/10</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">{card.relevance_note}</p>
            </div>
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
          <section aria-labelledby="ranked-drivers-title" className="space-y-4">
            <div>
              <h2 id="ranked-drivers-title" className="text-xl font-semibold text-white">
                Ranked drivers
              </h2>
              <p className="mt-1 text-sm text-slate-400">
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
                <Card className="border-white/10 bg-white/[0.035]">
                  <CardContent className="p-5 text-sm text-slate-300">
                    No ranked drivers are seeded for this briefing card.
                  </CardContent>
                </Card>
              )}
            </div>
          </section>

          <aside className="space-y-4">
            <Card className="border-emerald-300/20 bg-emerald-300/[0.05]">
              <CardHeader className="p-5">
                <CardDescription className="text-emerald-100">Bull case</CardDescription>
                <CardTitle className="text-lg leading-6 text-white">{card.bull_case}</CardTitle>
              </CardHeader>
            </Card>

            <Card className="border-rose-300/20 bg-rose-300/[0.05]">
              <CardHeader className="p-5">
                <CardDescription className="text-rose-100">Bear case</CardDescription>
                <CardTitle className="text-lg leading-6 text-white">{card.bear_case}</CardTitle>
              </CardHeader>
            </Card>

            <Card className="border-white/10 bg-white/[0.035]">
              <CardHeader className="p-5">
                <CardDescription className="text-slate-400">Linked journal</CardDescription>
                <CardTitle className="text-lg text-white">
                  {card.decision_journal_entry ? "Linked journal entry" : "No journal entry"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 p-5 pt-0">
                {card.decision_journal_entry ? (
                  <>
                    <p className="text-sm leading-6 text-slate-300">
                      {card.decision_journal_entry.thesis}
                    </p>
                    <Button asChild className="w-full bg-cyan-300 text-slate-950 hover:bg-cyan-200">
                      <Link href={`/journal?entry=${card.decision_journal_entry.id}`}>
                        <BookOpenText aria-hidden="true" />
                        View journal entry
                      </Link>
                    </Button>
                  </>
                ) : (
                  <p className="text-sm leading-6 text-slate-300">
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
    <Badge className="gap-1 bg-cyan-300 text-slate-950 hover:bg-cyan-300">
      <Database aria-hidden="true" className="size-3.5" />
      Data provenance: {source} as of {formatTimestamp(asOf)}
    </Badge>
  );
}

function DriverRow({ driver, position }: { driver: Driver; position: number }) {
  const isBullish = driver.direction === "bullish";
  const Icon = isBullish ? TrendingUp : TrendingDown;

  return (
    <Card
      className={cn(
        "border-white/10 bg-white/[0.035]",
        isBullish ? "border-l-4 border-l-emerald-300" : "border-l-4 border-l-rose-300",
      )}
    >
      <CardHeader className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-white/15 bg-slate-950/60 text-slate-200">
                #{position}
              </Badge>
              <Badge
                variant="outline"
                className={cn(
                  "gap-1 border-white/15 bg-slate-950/60",
                  isBullish ? "text-emerald-200" : "text-rose-200",
                )}
              >
                <Icon aria-hidden="true" className="size-3.5" />
                {driver.direction}
              </Badge>
            </div>
            <CardTitle className="text-xl leading-7 text-white">{driver.label}</CardTitle>
          </div>
          <div className="shrink-0 rounded-md border border-white/10 bg-slate-950/50 px-3 py-2 text-left sm:text-right">
            <p className="text-xs font-medium uppercase text-slate-400">Weight</p>
            <p className="text-lg font-semibold text-white">{formatWeight(driver.weight)}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-5 pt-0 text-sm leading-6 text-slate-300">
        <p>
          <span className="font-semibold text-slate-100">Source citation:</span>{" "}
          {driver.source_citation}
        </p>
        <details className="group rounded-md border border-white/10 bg-slate-950/40 p-3">
          <summary className="cursor-pointer text-sm font-medium text-cyan-200 marker:text-cyan-200">
            Expand source citation
          </summary>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Event time</dt>
              <dd className="text-slate-200">{formatTimestamp(driver.event_time)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Knowledge time</dt>
              <dd className="text-slate-200">{formatTimestamp(driver.knowledge_time)}</dd>
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
