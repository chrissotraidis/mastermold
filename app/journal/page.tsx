import Link from "next/link";
import { ArrowLeft, BookOpenText, Database } from "lucide-react";
import { AsOfReplayControl } from "@/components/as-of-replay-control";
import { AppShell } from "@/components/app-shell";
import { JournalWorkspace } from "@/components/journal-workspace";
import { ProvenanceChip } from "@/components/provenance-chip";
import { Badge } from "@/components/ui/badge";
import { parseAsOf } from "@/src/db/bitemporal";
import { getJournal, type CalibrationBucketJson } from "@/src/db/journal";

type JournalPageProps = {
  searchParams?: Promise<{
    entry?: string;
    as_of?: string;
  }>;
};

export default async function JournalPage({ searchParams }: JournalPageProps) {
  const params = await searchParams;
  const selectedEntryId = params?.entry;
  const parsedAsOf = parseAsOf(params?.as_of ?? null);
  const activeAsOf = parsedAsOf.ok ? parsedAsOf.asOf : null;
  const journal = getJournal(activeAsOf);
  const selectedEntry = selectedEntryId
    ? journal.entries.find((entry) => entry.id === selectedEntryId)
    : null;

  const isEngine = journal.provenance.label === "Engine output";

  return (
    <AppShell dataMode={journal.provenance.label}>
      <div className="mx-auto max-w-7xl space-y-5 px-4 py-5 sm:px-5 sm:py-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-md text-sm text-slate-300 underline-offset-4 hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to briefing
        </Link>

        <header className="grid gap-4 rounded-lg border border-white/10 bg-[#101722] p-4 lg:grid-cols-[1fr_18rem] lg:items-end">
          <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="gap-1 bg-cyan-300 text-slate-950 hover:bg-cyan-300">
              <BookOpenText aria-hidden="true" className="size-3.5" />
              Journal
            </Badge>
            <ProvenanceChip label={journal.provenance.label} title={journal.provenance.source} />
            <Badge variant="outline" className="border-white/15 text-slate-200">
              {journal.entries.length} entries
            </Badge>
          </div>
              <h2 className="mt-4 text-2xl font-semibold text-white sm:text-3xl">
                Record the thesis before the outcome.
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                Review decisions, outcome scores, and confidence-tier track record.
              </p>
              {selectedEntry ? (
                <p className="mt-3 text-sm text-cyan-100">
                  Open journal linked entry: {selectedEntry.thesis}
                </p>
              ) : null}
            </div>
            <details className="rounded-md border border-white/10 bg-white/[0.035] p-4 text-sm leading-6 text-slate-300">
              <summary className="flex cursor-pointer items-center gap-2 font-semibold text-cyan-100 marker:text-cyan-200">
                <Database aria-hidden="true" className="size-4" />
                Data provenance
              </summary>
              <p className="mt-3">
                {isEngine
                  ? `Track record and beliefs are computed from resolved engine decisions (${journal.provenance.source}). Belief confidence moves only after the significance gate clears — a single outcome cannot flip a belief.`
                  : "Journal facts are seeded demo data. The JSON endpoint remains available for automated checks, but the operator view shows provenance here instead of linking to raw API output."}
              </p>
              <p className="mt-2 text-slate-400">
                As of: {journal.provenance.replay_as_of ?? journal.provenance.as_of}
              </p>
            </details>
        </header>

        <AsOfReplayControl activeAsOf={journal.provenance.replay_as_of} apiPath="/api/journal" />

        <CalibrationCurve buckets={journal.calibration} isEngine={isEngine} />

        <JournalWorkspace initialJournal={journal} />
      </div>
    </AppShell>
  );
}

function CalibrationCurve({
  buckets,
  isEngine,
}: {
  buckets: CalibrationBucketJson[];
  isEngine: boolean;
}) {
  const resolved = buckets.reduce((sum, b) => sum + b.resolved_count, 0);

  return (
    <section
      aria-labelledby="calibration-title"
      className="rounded-lg border border-white/10 bg-[#101722] p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="calibration-title" className="text-lg font-semibold text-white">
            Calibration curve
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">
            Realized hit rate at each conviction level. The honest test of whether a higher
            conviction actually wins more often — {isEngine
              ? "computed from resolved engine decisions"
              : "seeded sample, replaced by engine outcomes once a resolved run lands"}.
          </p>
        </div>
        <Badge variant="outline" className="border-white/15 text-slate-200">
          {resolved} resolved
        </Badge>
      </div>

      {buckets.length === 0 ? (
        <p className="mt-4 rounded-md border border-white/10 bg-slate-950/45 p-3 text-sm text-slate-300">
          No resolved decisions yet — the curve appears once outcomes are scored.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {buckets.map((bucket) => {
            const pct = bucket.hit_rate === null ? 0 : Math.round(bucket.hit_rate * 100);
            return (
              <li key={bucket.conviction} className="flex items-center gap-3">
                <span className="w-20 shrink-0 text-xs font-semibold uppercase text-slate-400">
                  Conv {bucket.conviction}
                </span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-950">
                  <div
                    className="h-full rounded-full bg-emerald-300"
                    style={{ width: `${pct}%` }}
                    aria-hidden="true"
                  />
                </div>
                <span className="w-28 shrink-0 text-right text-xs text-slate-300">
                  {pct}% · {bucket.wins}/{bucket.resolved_count}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
