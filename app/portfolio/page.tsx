import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PortfolioCharts } from "@/components/portfolio-charts";
import { Badge } from "@/components/ui/badge";
import { parseAsOf } from "@/src/db/bitemporal";
import { getPortfolio, type PortfolioHoldingJson } from "@/src/db/portfolio";

type PortfolioPageProps = {
  searchParams?: Promise<{ as_of?: string }>;
};

export default async function PortfolioPage({ searchParams }: PortfolioPageProps) {
  const params = await searchParams;
  const parsedAsOf = parseAsOf(params?.as_of ?? null);
  const portfolio = getPortfolio(parsedAsOf.ok ? parsedAsOf.asOf : null);

  return (
    <AppShell dataMode="Demo data">
      <div className="mx-auto max-w-5xl">
        <PageHeader
          title="Your portfolio"
          subtitle="Everything you hold, read-only. I see it; I don't touch it."
          provenance="Demo data"
        />

        {/* Headline stats */}
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat
            label="Total value"
            value={formatCurrency(portfolio.total_market_value)}
            note="demo only · no real balance"
            big
          />
          <Stat
            label="Concentration"
            value={`${portfolio.concentration.top_position_pct.toFixed(0)}%`}
            note={`${portfolio.concentration.top_symbol ?? "—"} is your biggest position`}
          />
          <Stat
            label="Holdings"
            value={`${portfolio.holdings.length}`}
            note={`Across ${uniqueAccountCount(portfolio.holdings)} accounts · ${portfolio.defi_positions.length} on-chain`}
          />
        </div>

        <div className="mt-6">
          <PortfolioCharts allocation={portfolio.allocation} chartAssets={portfolio.chart_assets} />
        </div>

        <section aria-labelledby="holdings-title" className="mt-8 space-y-3">
          <h2 id="holdings-title" className="font-display text-lg font-semibold text-on-surface">
            Holdings
          </h2>
          <HoldingsTable holdings={portfolio.holdings} />
        </section>

        {portfolio.defi_positions.length > 0 ? (
          <section aria-labelledby="defi-title" className="mt-8 space-y-3">
            <h2 id="defi-title" className="font-display text-lg font-semibold text-on-surface">
              DeFi &amp; on-chain
            </h2>
            <HoldingsTable holdings={portfolio.defi_positions} compact />
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}

function Stat({
  label,
  value,
  note,
  big = false,
}: {
  label: string;
  value: string;
  note: string;
  big?: boolean;
}) {
  return (
    <div className="border border-outline-variant/40 bg-surface-high/30 p-4 chamfer-sm">
      <p className="text-xs uppercase tracking-telemetry text-outline">{label}</p>
      <p className={`mt-1 font-display font-semibold text-on-surface ${big ? "text-3xl" : "text-2xl"}`}>
        {value}
      </p>
      <p className="mt-1 text-xs text-outline">{note}</p>
    </div>
  );
}

function HoldingsTable({
  holdings,
  compact = false,
}: {
  holdings: PortfolioHoldingJson[];
  compact?: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:hidden">
        {holdings.map((holding) => (
          <HoldingCard key={holding.id} holding={holding} compact={compact} />
        ))}
      </div>
      <div className="hidden overflow-x-auto border border-outline-variant/40 bg-surface-high/30 chamfer-sm sm:block">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-outline-variant/40 bg-surface-dim/70 text-xs uppercase tracking-telemetry text-outline">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">Asset</th>
              {!compact ? <th scope="col" className="px-4 py-3 font-semibold">Account</th> : null}
              <th scope="col" className="px-4 py-3 font-semibold">Qty</th>
              <th scope="col" className="px-4 py-3 font-semibold">Cost</th>
              <th scope="col" className="px-4 py-3 font-semibold">Value</th>
              <th scope="col" className="px-4 py-3 font-semibold">Weight</th>
              <th scope="col" className="px-4 py-3 font-semibold">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/40">
            {holdings.map((holding) => (
              <tr key={holding.id} className="align-top">
                <th scope="row" className="px-4 py-4 font-semibold text-on-surface">
                  <span>{holding.symbol}</span>
                  <span className="mt-1 block text-xs font-normal text-outline">
                    {holding.asset_name} · {holding.venue}
                  </span>
                </th>
                {!compact ? (
                  <td className="px-4 py-4 text-on-surface-variant">{holding.account.label}</td>
                ) : null}
                <td className="px-4 py-4 tabular-nums text-on-surface-variant">{formatQuantity(holding.quantity)}</td>
                <td className="px-4 py-4 tabular-nums text-on-surface-variant">{formatCurrency(holding.cost_basis)}</td>
                <td className="px-4 py-4 tabular-nums text-on-surface-variant">{formatCurrency(holding.market_value)}</td>
                <td className="px-4 py-4 tabular-nums text-on-surface-variant">{holding.weight_pct.toFixed(1)}%</td>
                <td className="px-4 py-4">
                  <IntegrationBadge status={holding.account.integration_status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HoldingCard({ holding, compact }: { holding: PortfolioHoldingJson; compact: boolean }) {
  return (
    <article className="border border-outline-variant/40 bg-surface-high/30 p-4 chamfer-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-on-surface">{holding.symbol}</h3>
          <p className="mt-1 text-xs leading-5 text-outline">
            {holding.asset_name} · {holding.venue}
            {!compact ? ` · ${holding.account.label}` : ""}
          </p>
        </div>
        <IntegrationBadge status={holding.account.integration_status} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <MobileMetric label="Qty" value={formatQuantity(holding.quantity)} />
        <MobileMetric label="Weight" value={`${holding.weight_pct.toFixed(1)}%`} />
        <MobileMetric label="Cost" value={formatCurrency(holding.cost_basis)} />
        <MobileMetric label="Value" value={formatCurrency(holding.market_value)} />
      </dl>
    </article>
  );
}

function MobileMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-outline-variant/40 bg-surface-dim/45 p-3 chamfer-sm">
      <dt className="text-xs text-outline">{label}</dt>
      <dd className="mt-1 break-words font-semibold text-on-surface">{value}</dd>
    </div>
  );
}

function IntegrationBadge({ status }: { status: PortfolioHoldingJson["account"]["integration_status"] }) {
  const label = status === "connected" ? "linked" : status === "stubbed" ? "demo" : "gated";
  const className =
    status === "connected"
      ? "border-engine/40 bg-engine/10 text-engine"
      : status === "stubbed"
        ? "border-caution/40 bg-caution/10 text-caution"
        : "border-violet/40 bg-violet/10 text-violet";
  return (
    <Badge variant="outline" className={className}>
      {label}
    </Badge>
  );
}

function uniqueAccountCount(holdings: PortfolioHoldingJson[]) {
  return new Set(holdings.map((holding) => holding.account.id)).size;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }).format(value);
}
