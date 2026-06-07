import { Database, LockKeyhole, PlugZap } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { IntegrationKeyInput } from "@/components/integration-key-input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getIntegrationStatuses, type IntegrationStatusJson } from "@/src/db/integrations";

const statusLabels: Record<IntegrationStatusJson["status"], string> = {
  connected: "Linked",
  stubbed: "Demo",
  credential_gated: "Needs key",
};

export default function IntegrationsSettingsPage() {
  const integrations = getIntegrationStatuses();

  return (
    <AppShell dataMode="Demo data">
      <div className="mx-auto max-w-4xl">
        <PageHeader
          title="Connections"
          subtitle="Link your read-only accounts and choose your model. Keys live in this browser only — nothing here can place a trade."
          provenance="Demo data"
        />

        <section aria-labelledby="integration-status-title" className="space-y-4">
          <h2 id="integration-status-title" className="sr-only">
            Connection status
          </h2>

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
            <p>Keys are saved in this browser only — never sent anywhere.</p>
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
      {statusLabels[status]}
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
