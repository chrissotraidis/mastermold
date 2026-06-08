import { AsOfReplayControl } from "@/components/as-of-replay-control";
import { AppShell } from "@/components/app-shell";
import { JournalWorkspace } from "@/components/journal-workspace";
import { PageHeader } from "@/components/page-header";
import { parseAsOf } from "@/src/db/bitemporal";
import { getJournal, type CalibrationBucketJson } from "@/src/db/journal";

type JournalPageProps = {
  searchParams?: Promise<{ entry?: string; as_of?: string }>;
};

export default async function JournalPage({ searchParams }: JournalPageProps) {
  const params = await searchParams;
  const parsedAsOf = parseAsOf(params?.as_of ?? null);
  const journal = getJournal(parsedAsOf.ok ? parsedAsOf.asOf : null);
  const isEngine = journal.provenance.label === "Engine output";

  return (
    <AppShell dataMode={journal.provenance.label}>
      <div className="mx-auto max-w-4xl">
        <PageHeader
          title="Track record"
          subtitle="Every call is logged before the outcome, then scored against what actually happened."
          provenance={journal.provenance.label}
        />

        <div className="space-y-6">
          <CalibrationCurve buckets={journal.calibration} isEngine={isEngine} />
          <JournalWorkspace initialJournal={journal} />
          <AsOfReplayControl activeAsOf={journal.provenance.replay_as_of} apiPath="/api/journal" />
        </div>
      </div>
    </AppShell>
  );
}

function CalibrationCurve({ buckets, isEngine }: { buckets: CalibrationBucketJson[]; isEngine: boolean }) {
  const resolved = buckets.reduce((sum, b) => sum + b.resolved_count, 0);

  return (
    <section
      aria-labelledby="calibration-title"
      className="border border-outline-variant/40 bg-panel p-5 chamfer-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="calibration-title" className="font-display text-lg font-semibold text-on-surface">
            Calibration
          </h2>
          <p className="mt-1 max-w-xl text-sm leading-6 text-outline">
            How often calls at each conviction level actually played out.
          </p>
        </div>
        <span className="font-mono text-xs uppercase tracking-telemetry text-outline">{resolved} resolved</span>
      </div>

      {buckets.length === 0 ? (
        <p className="mt-4 border border-outline-variant/40 bg-surface-dim/45 p-3 text-sm text-on-surface-variant chamfer-sm">
          Nothing resolved yet — the curve fills in as calls play out.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {buckets.map((bucket) => {
            const pct = bucket.hit_rate === null ? 0 : Math.round(bucket.hit_rate * 100);
            return (
              <li key={bucket.conviction} className="flex items-center gap-3">
                <span className="w-14 shrink-0 font-mono text-xs text-outline">{bucket.conviction}/10</span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-surface-dim">
                  <div className="h-full rounded-full bg-engine" style={{ width: `${pct}%` }} aria-hidden="true" />
                </div>
                <span className="w-24 shrink-0 text-right text-xs text-on-surface-variant">
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
