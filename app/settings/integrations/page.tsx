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
            <Badge className="bg-cyan-300 text-slate-950 hover:bg-cyan-300">
              Setting integrations
            </Badge>
            <Badge variant="outline" className="border-white/15 text-slate-200">
              Demo data
            </Badge>
            <Badge variant="outline" className="border-white/15 text-slate-200">
              Reachable persistent nav
            </Badge>
            <Badge variant="outline" className="border-white/15 text-slate-200">
              Read-only API status
            </Badge>
          </div>

          <div className="grid gap-5 lg:grid-cols-[1fr_22rem] lg:items-end">
            <div className="space-y-3">
              <h2 className="max-w-4xl text-3xl font-semibold leading-tight text-white sm:text-4xl">
                Open setting integration to see external service readiness
              </h2>
              <p className="max-w-3xl text-base leading-7 text-slate-300">
                View integration status badges for Coinbase CDP, Robinhood via SnapTrade,
                Zerion on-chain, and LLM. Enter optional API keys locally when reviewing
                credential-gated paths; this page has no submit action.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  asChild
                  variant="outline"
                  className="border-white/15 bg-transparent text-slate-100 hover:bg-white/10"
                >
                  <Link href="/review">Review disclosures</Link>
                </Button>
                <Badge variant="outline" className="border-white/15 px-3 py-2 text-slate-200">
                  API: /api/status
                </Badge>
              </div>
            </div>

            <Card className="border-white/10 bg-white/[0.035]">
              <CardHeader className="p-5">
                <CardDescription className="text-slate-400">IntegrationStatus rows</CardDescription>
                <CardTitle className="text-3xl text-white">{integrations.length}</CardTitle>
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
            <h2 id="integration-status-title" className="text-xl font-semibold text-white">
              View integration status
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-400">
              Status and detail text come from seeded IntegrationStatus rows.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {integrations.map((integration) => (
              <Card key={integration.id} className="border-white/10 bg-white/[0.035]">
                <CardHeader className="space-y-4 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-3">
                        <div className="flex size-10 items-center justify-center rounded-md border border-cyan-300/25 bg-cyan-300/10 text-cyan-100">
                          {integration.status === "credential_gated" ? (
                            <LockKeyhole aria-hidden="true" className="size-5" />
                          ) : (
                            <PlugZap aria-hidden="true" className="size-5" />
                          )}
                        </div>
                        <div>
                          <CardTitle className="text-xl text-white">
                            {integration.display_name}
                          </CardTitle>
                          <CardDescription className="mt-1 text-slate-400">
                            {integration.service}
                          </CardDescription>
                        </div>
                      </div>
                    </div>
                    <StatusBadge status={integration.status} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {integration.status === "stubbed" ? (
                      <Badge variant="outline" className="border-amber-300/30 text-amber-100">
                        Demo data
                      </Badge>
                    ) : null}
                    <Badge variant="outline" className="border-white/15 text-slate-200">
                      {statusLabels[integration.status]}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5 p-5 pt-0">
                  <p className="text-sm leading-6 text-slate-300">{integration.detail}</p>
                  <IntegrationKeyInput
                    service={integration.service}
                    label={integration.credential_hint}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <Card className="border-cyan-300/25 bg-cyan-300/[0.055]">
          <CardContent className="flex gap-3 p-5 text-sm leading-6 text-cyan-50">
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
        status === "connected" && "border-emerald-300/30 bg-emerald-300/10 text-emerald-100",
        status === "stubbed" && "border-amber-300/30 bg-amber-300/10 text-amber-100",
        status === "credential_gated" &&
          "border-cyan-300/30 bg-cyan-300/10 text-cyan-100",
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
    <div className="rounded-md border border-white/10 bg-slate-950/50 p-3">
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-1 font-mono text-lg text-slate-100">{value}</p>
    </div>
  );
}
