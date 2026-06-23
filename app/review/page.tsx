import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { productProvenanceLabel } from "@/lib/provenance-copy";
import { getDataMode } from "@/src/db/engine-data";

export const dynamic = "force-dynamic";

export default function ReviewPage() {
  const dataMode = getDataMode();
  const publicDataMode = productProvenanceLabel(dataMode.label);

  return (
    <AppShell dataMode={publicDataMode}>
      <div className="mx-auto max-w-5xl space-y-5">
        <PageHeader
          title="System status"
          subtitle="Reviewer-only truthfulness, data mode, and launch-readiness checks."
          provenance={publicDataMode}
          back={false}
          right={
            <a
              href="/api/health"
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-violet px-4 py-2 text-sm font-semibold text-void transition hover:bg-violet/90"
            >
              Open health JSON
            </a>
          }
        />

        <section className="grid gap-3 md:grid-cols-3" aria-label="Compact system status">
          <SystemStatusCard
            label="Data mode"
            value={publicDataMode}
            detail="Shows whether the app is using sample, saved, imported, or live-read data."
          />
          <SystemStatusCard
            label="Review credentials"
            value="Local reviewer"
            detail="Zo may use a live chat key, read-only portfolio import keys, and Web3 read-provider or Jupiter rehearsal keys. Never provide private keys or seed phrases."
          />
          <SystemStatusCard
            label="Live trading"
            value="Locked"
            detail="Real-money Web3 execution stays unavailable until setup and manual review are complete."
          />
        </section>

        <section className="rounded-md border border-outline-variant/40 bg-surface-high/25 p-4 sm:p-5" aria-labelledby="truthfulness-title">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 id="truthfulness-title" className="text-xl font-semibold text-on-surface">
                Reviewer evidence
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-on-surface-variant">
                What works, what is sample, what is credential-gated, what is missing, and how review credentials work.
              </p>
            </div>
            <a
              href="/api/health"
              className="inline-flex min-h-10 items-center rounded-md border border-outline-variant/50 px-3 py-2 text-xs font-semibold text-on-surface-variant transition hover:border-violet/50 hover:text-violet"
            >
              Open health JSON
            </a>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <TruthItem
              label="Works now"
              detail="Today, Portfolio, Activity, Settings, and Trade render locally. Trade is paper/read-only and shows wallet status, next action, chart, and active orders."
            />
            <TruthItem
              label="Seeded or sample"
              detail="Sample holdings, sample Web3 markets, and seeded paper-trading data may appear when live/imported data is not connected."
            />
            <TruthItem
              label="Credential-gated"
              detail="Portfolio imports, live chat, live DEX reads, Jupiter setup, wallet ownership, and external review need their own safe credentials or manual proof."
            />
            <TruthItem
              label="Missing"
              detail="The app still does not sign, submit swaps, move funds, run autonomous live trading, or maintain real-money execution persistence."
            />
            <TruthItem
              label="Review credentials"
              detail="Local reviewers can use seeded/sample data without secrets. Zo credentials, if supplied, are limited to live chat, read-only imports, read-provider rails, and Jupiter rehearsal. Never paste private keys, seed phrases, raw keypairs, or wallet authority."
            />
            <TruthItem
              label="Live trading boundary"
              detail="Real-money Web3 trading is locked until dedicated wallet setup, provider keys, accounting, emergency stop, and manual review are complete."
            />
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function SystemStatusCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-md border border-outline-variant/40 bg-surface-high/30 p-4">
      <p className="text-xs font-medium uppercase tracking-telemetry text-outline">{label}</p>
      <p className="mt-1 text-lg font-semibold text-on-surface">{value}</p>
      <p className="mt-2 text-sm leading-6 text-on-surface-variant">{detail}</p>
    </div>
  );
}

function TruthItem({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="rounded-md border border-outline-variant/35 bg-surface-dim/35 p-3">
      <p className="text-sm font-semibold text-on-surface">{label}</p>
      <p className="mt-1 text-sm leading-6 text-on-surface-variant">{detail}</p>
    </div>
  );
}
