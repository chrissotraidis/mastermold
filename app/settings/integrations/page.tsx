import Link from "next/link";
import { Database, LockKeyhole, PlugZap } from "lucide-react";
import { AppShell, FirstRunBanner } from "@/components/app-shell";
import { IntegrationKeyInput } from "@/components/integration-key-input";
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
import { getIntegrationStatuses, type IntegrationStatusJson } from "@/src/db/integrations";

const statusLabels: Record<IntegrationStatusJson["status"], string> = {
  connected: "Connected",
  stubbed: "Stubbed",
  credential_gated: "Credential gated",
};

export default function IntegrationsSettingsPage() {
  const integrations = getIntegrationStatuses();
  const stubbedCount = integrations.filter((integration) => integration.status === "stubbed").length;
  const credentialGatedCount = integrations.filter(
    (integration) => integration.status === "credential_gated",
  ).length;

  return (
    <AppShell>
      <FirstRunBanner />
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-5 sm:py-8">
        <header className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-violet text-void hover:bg-violet">
              Setting integrations
            </Badge>
            <Badge variant="outline" className="border-outline-variant/50 text-on-surface-variant">
              Demo data
            </Badge>
            <Badge variant="outline" className="border-outline-variant/50 text-on-surface-variant">
              Reachable persistent nav
            </Badge>
            <Badge variant="outline" className="border-outline-variant/50 text-on-surface-variant">
              Read-only API status
            </Badge>
          </div>

          <div className="grid gap-5 lg:grid-cols-[1fr_22rem] lg:items-end">
            <div className="space-y-3">
              <h2 className="max-w-4xl text-3xl font-semibold leading-tight text-on-surface sm:text-4xl">
                Open setting integration to see external service readiness
              </h2>
              <p className="max-w-3xl text-base leading-7 text-on-surface-variant">
                View integration status badges for Coinbase CDP, Robinhood via SnapTrade,
                Zerion on-chain, and LLM. Enter optional API keys locally when reviewing
                credential-gated paths; this page has no submit action.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  asChild
                  variant="outline"
                  className="border-outline-variant/50 bg-transparent text-on-surface hover:bg-surface-high/60"
                >
                  <Link href="/review">Review disclosures</Link>
                </Button>
                <Badge variant="outline" className="border-outline-variant/50 px-3 py-2 text-on-surface-variant">
                  API: /api/status
                </Badge>
              </div>
            </div>

            <Card className="border-outline-variant/40 bg-surface-high/30">
              <CardHeader className="p-5">
                <CardDescription className="text-outline">IntegrationStatus rows</CardDescription>
                <CardTitle className="text-3xl text-on-surface">{integrations.length}</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 p-5 pt-0 text-sm">
                <Metric label="Stubbed" value={stubbedCount.toString()} />
                <Metric
                  label="Credential gated"
                  value={credentialGatedCount.toString()}
                />
              </CardContent>
            </Card>
          </div>
        </header>

        <section aria-labelledby="integration-status-title" className="space-y-4">
          <div>
            <h2 id="integration-status-title" className="text-xl font-semibold text-on-surface">
              View integration status
            </h2>
            <p className="mt-1 text-sm leading-6 text-outline">
              Status and detail text come from seeded IntegrationStatus rows.
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
                        <div>
                          <CardTitle className="text-xl text-on-surface">
                            {integration.display_name}
                          </CardTitle>
                          <CardDescription className="mt-1 text-outline">
                            {integration.service}
                          </CardDescription>
                        </div>
                      </div>
                    </div>
                    <StatusBadge status={integration.status} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {integration.status === "stubbed" ? (
                      <Badge variant="outline" className="border-caution/40 text-caution">
                        Demo data
                      </Badge>
                    ) : null}
                    <Badge variant="outline" className="border-outline-variant/50 text-on-surface-variant">
                      {statusLabels[integration.status]}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5 p-5 pt-0">
                  <p className="text-sm leading-6 text-on-surface-variant">{integration.detail}</p>
                  <IntegrationKeyInput
                    service={integration.service}
                    label={integration.credential_hint}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <Card className="border-violet/30 bg-violet/[0.055]">
          <CardContent className="flex gap-3 p-5 text-sm leading-6 text-on-surface">
            <Database aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            <p>
              Optional key entries are stored with localStorage in this browser only and
              are never sent to a server route by this settings page.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function StatusBadge({ status }: { status: IntegrationStatusJson["status"] }) {
  return (
    <Badge
      className={cn(
        "border text-xs",
        status === "connected" && "border-emerald-300/30 bg-engine/10 text-engine",
        status === "stubbed" && "border-caution/40 bg-caution/10 text-caution",
        status === "credential_gated" &&
          "border-violet/40 bg-violet/10 text-violet",
      )}
      variant="outline"
    >
      <span className="sr-only">{statusLabels[status]} status: </span>
      {status}
    </Badge>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-outline-variant/40 bg-surface-dim/50 p-3">
      <p className="text-xs font-semibold uppercase text-outline">{label}</p>
      <p className="mt-1 font-mono text-lg text-on-surface">{value}</p>
    </div>
  );
}
