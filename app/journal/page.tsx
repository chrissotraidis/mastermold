import { AsOfReplayControl } from "@/components/as-of-replay-control";
import { AppShell } from "@/components/app-shell";
import { JournalWorkspace } from "@/components/journal-workspace";
import { PageHeader } from "@/components/page-header";
import { ProvenanceChip } from "@/components/provenance-chip";
import { productProvenanceLabel } from "@/lib/provenance-copy";
import { toPublicJournal, type PublicJournal } from "@/lib/public-api-copy";
import { parseAsOf } from "@/src/db/bitemporal";
import { getJournal } from "@/src/db/journal";

export const dynamic = "force-dynamic";

type JournalPageProps = {
  searchParams?: Promise<{
    entry?: string;
    as_of?: string;
    call?: string;
    thesis?: string;
    reasons?: string;
    signals?: string;
    confidence?: string;
    conviction?: string;
    horizon?: string;
    falsification?: string;
  }>;
};

export default async function JournalPage({ searchParams }: JournalPageProps) {
  const params = await searchParams;
  const parsedAsOf = parseAsOf(params?.as_of ?? null);
  const journal = getJournal(parsedAsOf.ok ? parsedAsOf.asOf : null);
  const publicJournal = toPublicJournal(journal);
  const publicProvenanceLabel = productProvenanceLabel(journal.provenance.label);

  return (
    <AppShell dataMode={publicProvenanceLabel}>
      <div className="mx-auto max-w-4xl">
        <PageHeader
          title="Decision journal"
          subtitle="Save the reason for a call, then review what happened."
          provenance={publicProvenanceLabel}
        />

        <div className="space-y-6">
          <JournalWorkspace
            initialJournal={publicJournal}
            initialDraft={draftFromParams(params)}
            focusedEntryId={params?.entry}
          />
          <ScoreAccuracyBars
            buckets={publicJournal.confidence_check}
            provenance={publicJournal.provenance}
          />
          <AsOfReplayControl activeAsOf={journal.provenance.replay_as_of} apiPath="/api/journal" />
        </div>
      </div>
    </AppShell>
  );
}

function draftFromParams(params: Awaited<JournalPageProps["searchParams"]>) {
  const call = cleanParam(params?.call) || cleanParam(params?.thesis);
  if (!call) return undefined;
  return {
    call,
    signals: cleanParam(params?.reasons) || cleanParam(params?.signals),
    confidence: cleanParam(params?.confidence) || cleanParam(params?.conviction) || "6",
    horizon: cleanParam(params?.horizon),
    falsification_condition: cleanParam(params?.falsification),
  };
}

function cleanParam(value: string | undefined) {
  return typeof value === "string" ? value.slice(0, 2000) : "";
}

function ScoreAccuracyBars({
  buckets,
  provenance,
}: {
  buckets: PublicJournal["confidence_check"];
  provenance: PublicJournal["provenance"];
}) {
  const resolved = buckets.reduce((sum, b) => sum + b.resolved_count, 0);
  const isSample = provenance.label === "Sample data";

  return (
    <section
      aria-labelledby="score-accuracy-title"
      className="border border-outline-variant/40 bg-panel p-5 chamfer-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="score-accuracy-title" className="font-display text-lg font-semibold text-on-surface">
              Score check
            </h2>
            <ProvenanceChip label={provenance.label} title={provenance.source} />
          </div>
          <p className="mt-1 max-w-xl text-sm leading-6 text-outline">
            {isSample
              ? "Seeded and locally saved calls. Use this to compare score bands with closed results; it is not evidence that future calls will work."
              : "Compares higher-scored saved calls with later results. Useful for review, not proof that future calls will work."}
          </p>
        </div>
        <span className="font-mono text-xs uppercase tracking-telemetry text-outline">{resolved} closed</span>
      </div>

      {buckets.length === 0 ? (
        <p className="mt-4 border border-outline-variant/40 bg-surface-dim/45 p-3 text-sm text-on-surface-variant chamfer-sm">
          No closed calls yet. This fills in after enough past calls have results.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {buckets.map((bucket) => {
            const pct = bucket.hit_rate === null ? 0 : Math.round(bucket.hit_rate * 100);
            return (
              <li key={bucket.confidence} className="flex items-center gap-3">
                <span className="w-14 shrink-0 font-mono text-xs text-outline">{bucket.confidence}/10</span>
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
