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
          className="inline-flex items-center gap-2 rounded-md text-sm text-on-surface-variant underline-offset-4 hover:text-on-surface hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet focus-visible:ring-offset-2 focus-visible:ring-offset-void"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to briefing
        </Link>

        <header className="grid gap-4 rounded-lg border border-outline-variant/40 bg-panel p-4 lg:grid-cols-[1fr_18rem] lg:items-end">
          <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="gap-1 bg-violet text-void hover:bg-violet">
              <BookOpenText aria-hidden="true" className="size-3.5" />
              Journal
            </Badge>
            <ProvenanceChip label={journal.provenance.label} title={journal.provenance.source} />
            <Badge variant="outline" className="border-outline-variant/50 text-on-surface-variant">
              {journal.entries.length} entries
            </Badge>
          </div>
              <h2 className="mt-4 text-2xl font-semibold text-on-surface sm:text-3xl">
                Record the thesis before the outcome.
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-on-surface-variant">
                Review decisions, outcome scores, and confidence-tier track record.
              </p>
              {selectedEntry ? (
                <p className="mt-3 text-sm text-violet">
                  Open journal linked entry: {selectedEntry.thesis}
                </p>
              ) : null}
            </div>
            <details className="rounded-md border border-outline-variant/40 bg-surface-high/30 p-4 text-sm leading-6 text-on-surface-variant">
              <summary className="flex cursor-pointer items-center gap-2 font-semibold text-violet marker:text-violet">
                <Database aria-hidden="true" className="size-4" />
                Data provenance
              </summary>
              <p className="mt-3">
                {isEngine
                  ? `Track record and beliefs are computed from resolved engine decisions (${journal.provenance.source}). Belief confidence moves only after the significance gate clears — a single outcome cannot flip a belief.`
                  : "Journal facts are seeded demo data. The JSON endpoint remains available for automated checks, but the operator view shows provenance here instead of linking to raw API output."}
              </p>
              <p className="mt-2 text-outline">
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
      className="rounded-lg border border-outline-variant/40 bg-panel p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="calibration-title" className="text-lg font-semibold text-on-surface">
            Calibration curve
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-outline">
            Realized hit rate at each conviction level. The honest test of whether a higher
            conviction actually wins more often — {isEngine
              ? "computed from resolved engine decisions"
              : "seeded sample, replaced by engine outcomes once a resolved run lands"}.
          </p>
        </div>
        <Badge variant="outline" className="border-outline-variant/50 text-on-surface-variant">
          {resolved} resolved
        </Badge>
      </div>

      {buckets.length === 0 ? (
        <p className="mt-4 rounded-md border border-outline-variant/40 bg-surface-dim/45 p-3 text-sm text-on-surface-variant">
          No resolved decisions yet — the curve appears once outcomes are scored.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {buckets.map((bucket) => {
            const pct = bucket.hit_rate === null ? 0 : Math.round(bucket.hit_rate * 100);
            return (
              <li key={bucket.conviction} className="flex items-center gap-3">
                <span className="w-20 shrink-0 text-xs font-semibold uppercase text-outline">
                  Conv {bucket.conviction}
                </span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-surface-dim">
                  <div
                    className="h-full rounded-full bg-engine"
                    style={{ width: `${pct}%` }}
                    aria-hidden="true"
                  />
                </div>
                <span className="w-28 shrink-0 text-right text-xs text-on-surface-variant">
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
