import { Database, ExternalLink, LockKeyhole, PlugZap, RefreshCw, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { BrainInitializationPanel } from "@/components/brain-initialization-panel";
import { PageHeader } from "@/components/page-header";
import { IntegrationKeyInput } from "@/components/integration-key-input";
import { ManualHoldingsPanel } from "@/components/manual-holdings-panel";
import { ProfileSettings } from "@/components/profile-settings";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { productProvenanceLabel } from "@/lib/provenance-copy";
import { toPublicBrainState } from "@/lib/public-api-copy";
import { cn } from "@/lib/utils";
import { getBrainStateAfterDueScheduleCheck } from "@/src/db/brain";
import { getIntegrationStatuses, type IntegrationStatusJson } from "@/src/db/integrations";
import { getPortfolio } from "@/src/db/portfolio";

const statusLabels: Record<IntegrationStatusJson["status"], string> = {
  connected: "Test passed",
  stubbed: "Sample mode",
  credential_gated: "Needs key",
};

export const dynamic = "force-dynamic";

type SettingsIntegrationService = Exclude<IntegrationStatusJson["service"], "llm"> | "live_chat";
type SettingsIntegrationStatus = Omit<IntegrationStatusJson, "id" | "service"> & {
  id: string;
  service: SettingsIntegrationService;
};

export default async function IntegrationsSettingsPage() {
  const integrations = getIntegrationStatuses().map(toSettingsIntegrationStatus);
  const portfolio = getPortfolio();
  const brainState = toPublicBrainState(await getBrainStateAfterDueScheduleCheck({ trigger: "settings-open" }));
  const publicProvenanceLabel = productProvenanceLabel(portfolio.provenance.label);

  return (
    <AppShell dataMode={publicProvenanceLabel}>
      <div className="mx-auto max-w-4xl">
        <PageHeader
          title="Settings"
          subtitle="Add holdings, test account access, set up live chat, and see what is safe before trusting a daily read."
          provenance={publicProvenanceLabel}
        />

        <div className="mb-8">
          <ManualHoldingsPanel holdings={portfolio.manual_holdings} />
        </div>

        <div className="mb-8">
          <ConnectionChecks integrations={integrations} />
        </div>

        <div className="mb-8">
          <ProfileSettings />
        </div>

        <div className="mb-8">
          <PortfolioImportStatusCard portfolio={portfolio} />
        </div>

        <div className="mb-8">
          <DataPrivacyCard />
        </div>

        <div className="mb-8">
          <BrainInitializationPanel initialState={brainState} />
        </div>

        <Card className="border-violet/30 bg-violet/[0.055]">
          <CardContent className="flex gap-3 p-5 text-sm leading-6 text-on-surface">
            <Database aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            <p>
              Manual entries and imported holdings affect Today and chat. Account imports are read-only snapshots; keys here still cannot move money.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function ConnectionChecks({ integrations }: { integrations: SettingsIntegrationStatus[] }) {
  return (
    <section aria-labelledby="integration-status-title" className="space-y-4">
      <div>
        <h2 id="integration-status-title" className="text-xl font-semibold text-on-surface">
          Connection checks
        </h2>
        <p className="mt-1 text-sm leading-6 text-outline">
          Check account access first, then import a holdings snapshot only when you press import.
          Imported holdings are labeled in Portfolio, and this app still cannot place trades.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {integrations.map((integration) => (
          <Card key={integration.id} className="border-outline-variant/40 bg-surface-high/30">
            <CardHeader className="space-y-4 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-md border border-violet/30 bg-violet/10 text-violet">
                      {integration.status === "credential_gated" ? (
                        <LockKeyhole aria-hidden="true" className="size-5" />
                      ) : (
                        <PlugZap aria-hidden="true" className="size-5" />
                      )}
                    </div>
                    <CardTitle className="text-xl text-on-surface">
                      {integration.display_name}
                    </CardTitle>
                  </div>
                </div>
                <StatusBadge status={integration.status} />
              </div>
            </CardHeader>
            <CardContent className="space-y-5 p-5 pt-0">
              <p className="text-sm leading-6 text-on-surface-variant">{integration.detail}</p>
              <div className="rounded-md border border-outline-variant/40 bg-surface-dim/45 p-3 text-xs leading-5 text-outline">
                <div className="flex items-start gap-2 text-on-surface-variant">
                  <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-engine" />
                  <span>{integration.permission_scope}</span>
                </div>
                <a
                  href={integration.docs_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex min-h-11 items-center gap-1 rounded-md px-1 font-semibold text-violet hover:text-violet/80"
                >
                  Docs checked {integration.researched_at}
                  <ExternalLink aria-hidden="true" className="size-3" />
                </a>
              </div>
              <IntegrationKeyInput
                service={integration.service}
                label={integration.credential_hint}
                fields={integration.test_fields}
                permissionScope={integration.permission_scope}
              />
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

function DataPrivacyCard() {
  const items = [
    {
      label: "Stays in this browser",
      detail:
        "Profile preferences and saved connection-test fields stay in local browser storage unless you export a backup or press a test/import/live chat action.",
    },
    {
      label: "Sent to this local app",
      detail:
        "Connection tests, holdings imports, live chat, manual holdings, paper trades, and journal saves go through this local app server so the UI can update.",
    },
    {
      label: "Can leave this app",
      detail:
        "Only the action you choose can contact an outside service: account test/import sends that service's fields, and live chat sends the question plus visible app context to the selected chat service.",
    },
    {
      label: "Never sent by this app",
      detail:
        "Master Mold has no order endpoint, cannot sign transactions, and never asks for private wallet keys.",
    },
  ];

  return (
    <section aria-labelledby="data-privacy-title">
      <Card className="border-outline-variant/40 bg-surface-high/30">
        <CardHeader className="space-y-4 p-5">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-violet/30 bg-violet/10 text-violet">
              <ShieldCheck aria-hidden="true" className="size-5" />
            </div>
            <div className="min-w-0">
              <CardTitle as="h2" id="data-privacy-title" className="text-xl text-on-surface">
                Data and privacy
              </CardTitle>
              <p className="mt-1 text-sm leading-6 text-outline">
                What stays local, what reaches this app, and what can leave only when you press a button.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 p-5 pt-0 sm:grid-cols-2">
          {items.map((item) => (
            <div key={item.label} className="rounded-md border border-outline-variant/40 bg-surface-dim/45 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-outline">{item.label}</p>
              <p className="mt-1 text-sm leading-6 text-on-surface-variant">{item.detail}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

function PortfolioImportStatusCard({ portfolio }: { portfolio: ReturnType<typeof getPortfolio> }) {
  const snapshot = portfolio.import_snapshot;
  const hasImportedHoldings = snapshot.count > 0;
  const hasImportIssues = snapshot.issue_count > 0;
  const statusNote = hasImportedHoldings
    ? snapshot.note
    : hasImportIssues
      ? "The latest import checked an account but could not add every holding. Open the issue list before relying on the total."
      : "No account holdings imported yet. Check account access, then press Import holdings snapshot to add holdings.";

  return (
    <section aria-labelledby="portfolio-refresh-title">
      <Card className="border-outline-variant/40 bg-surface-high/30">
        <CardHeader className="space-y-4 p-5">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-engine/30 bg-engine/10 text-engine">
              <RefreshCw aria-hidden="true" className="size-5" />
            </div>
            <div className="min-w-0">
              <CardTitle as="h2" id="portfolio-refresh-title" className="text-xl text-on-surface">
                Import refresh status
              </CardTitle>
              <p className="mt-1 text-sm leading-6 text-outline">
                Manual refresh only. Import again whenever you want current balances.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-5 pt-0">
          <div className="grid gap-3 sm:grid-cols-2">
            <SettingsMetric label="Imported holdings" value={String(snapshot.count)} />
            <SettingsMetric label="Skipped entries" value={String(snapshot.skipped_count)} />
            <SettingsMetric label="Freshness" value={snapshot.status} />
            <SettingsMetric label="Last checked" value={formatSettingsTime(snapshot.last_imported_at ?? snapshot.last_checked_at)} />
            <SettingsMetric label="Account refresh" value="Manual refresh only" />
          </div>
          <p className="rounded-md border border-outline-variant/40 bg-surface-dim/45 p-3 text-sm leading-6 text-on-surface-variant">
            {statusNote}
          </p>
          {hasImportIssues ? (
            <details className="rounded-md border border-outline-variant/40 bg-surface-dim/35 p-3">
              <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-on-surface">
                Import issues
              </summary>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-on-surface-variant">
                {snapshot.issues.map((issue) => (
                  <li key={`${issue.symbol}-${issue.reason}`}>
                    <span className="font-semibold text-on-surface">{issue.symbol}</span>
                    {" - "}
                    {issue.reason}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs leading-5 text-outline">
                Entries without a usable price or amount stay out of Portfolio so totals do not pretend to know more than the account source returned.
              </p>
            </details>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}

function SettingsMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-outline-variant/40 bg-surface-dim/45 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-outline">{label}</p>
      <p className="mt-1 break-words text-base font-semibold text-on-surface">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: IntegrationStatusJson["status"] }) {
  return (
    <Badge
      className={cn(
        "border text-xs",
        status === "connected" && "border-engine/30 bg-engine/10 text-engine",
        status === "stubbed" && "border-caution/40 bg-caution/10 text-caution",
        status === "credential_gated" &&
          "border-violet/40 bg-violet/10 text-violet",
      )}
      variant="outline"
    >
      {statusLabels[status]}
    </Badge>
  );
}

function toSettingsIntegrationStatus(status: IntegrationStatusJson): SettingsIntegrationStatus {
  return {
    ...status,
    id: status.service === "llm" ? "int_live_chat" : status.id,
    service: status.service === "llm" ? "live_chat" : status.service,
  };
}

function formatSettingsTime(value: string | null) {
  if (!value) return "No import yet";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}
