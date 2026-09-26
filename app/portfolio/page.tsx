import { AppShell } from "@/components/app-shell";
import { PortfolioHub } from "@/components/portfolio/portfolio-hub";
import { PositionPoliciesPanel } from "@/components/position-policies-panel";
import { SettingsSection } from "@/components/settings-section";
import { Panel } from "@/components/ui/panel";
import { productProvenanceLabel } from "@/lib/provenance-copy";
import { parseAsOf } from "@/src/db/bitemporal";
import { getMoneySummary } from "@/src/db/money";
import { getPortfolio } from "@/src/db/portfolio";
import { evaluatePositionPolicies, getPositionPolicies } from "@/src/db/position-policies";

export const dynamic = "force-dynamic";

type PortfolioPageProps = {
  searchParams?: Promise<{ as_of?: string }>;
};

export default async function PortfolioPage({ searchParams }: PortfolioPageProps) {
  const params = await searchParams;
  const parsedAsOf = parseAsOf(params?.as_of ?? null);
  const asOf = parsedAsOf.ok ? parsedAsOf.asOf : null;
  const portfolio = getPortfolio(asOf);
  const summary = getMoneySummary(portfolio);
  const policies = asOf ? [] : getPositionPolicies();
  const findings = asOf ? [] : evaluatePositionPolicies(portfolio.holdings);
  const policyIntents = Object.fromEntries(policies.map((policy) => [policy.symbol.toUpperCase(), policy.intent]));

  return (
    <AppShell dataMode={productProvenanceLabel(portfolio.provenance.label)}>
      <div className="grid w-full grid-cols-1 gap-6 [&>*]:min-w-0">
        {findings.length > 0 ? (
          <section aria-label="Policy checks" className="order-2 grid gap-2">
            {findings.map((finding) => (
              <div key={`${finding.symbol}-${finding.kind}`} className="rounded-2xl border border-caution/40 bg-caution/10 px-4 py-3">
                <p className="text-sm font-semibold text-on-surface">{finding.title}</p>
                <p className="mt-0.5 text-xs leading-5 text-on-surface-variant">{finding.detail}</p>
              </div>
            ))}
          </section>
        ) : null}

        <div className="order-1">
          <PortfolioHub summary={summary} policyIntents={policyIntents} sourceLine={sourceLine(portfolio)} />
        </div>

        <Panel as="div" className="order-3 overflow-hidden">
          <SettingsSection
            id="position-policies"
            title="Position rules"
            status={`${policies.length} rule${policies.length === 1 ? "" : "s"} · ${findings.length} flag${findings.length === 1 ? "" : "s"}`}
            statusTone={findings.length > 0 ? "watch" : "muted"}
            defaultOpen={findings.length > 0}
          >
            <p className="mb-3 text-xs leading-5 text-on-surface-variant">
              Standing intents and limits per holding. Master Mold checks them on every read; it never trades.
            </p>
            <PositionPoliciesPanel
              policies={policies}
              findings={findings.map((finding) => ({
                symbol: finding.symbol,
                kind: finding.kind,
                classification: finding.classification,
                title: finding.title,
                detail: finding.detail,
              }))}
              symbols={portfolio.holdings.map((holding) => holding.symbol)}
            />
          </SettingsSection>
        </Panel>
      </div>
    </AppShell>
  );
}

function sourceLine(portfolio: ReturnType<typeof getPortfolio>) {
  const label = portfolio.provenance.label;
  if (label === "Manual portfolio") {
    return `${portfolio.manual_holdings.length} manual holdings · local only`;
  }
  if (label === "Imported portfolio") {
    return `${portfolio.imported_holdings.length} imported holdings · read-only snapshot`;
  }
  return "Sample data until you add holdings";
}
