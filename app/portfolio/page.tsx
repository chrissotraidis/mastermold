import Link from "next/link";
import { Database, ShieldCheck, WalletCards } from "lucide-react";
import { AsOfReplayControl } from "@/components/as-of-replay-control";
import { AppShell, FirstRunBanner } from "@/components/app-shell";
import { PortfolioCharts } from "@/components/portfolio-charts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { parseAsOf } from "@/src/db/bitemporal";
import { getPortfolio, type PortfolioHoldingJson } from "@/src/db/portfolio";

type PortfolioPageProps = {
  searchParams?: Promise<{
    as_of?: string;
  }>;
};

export default async function PortfolioPage({ searchParams }: PortfolioPageProps) {
  const params = await searchParams;
  const parsedAsOf = parseAsOf(params?.as_of ?? null);
  const activeAsOf = parsedAsOf.ok ? parsedAsOf.asOf : null;
  const portfolio = getPortfolio(activeAsOf);

  return (
    <AppShell>
      <FirstRunBanner />
      <div className="mx-auto max-w-7xl space-y-5 px-4 py-5 sm:px-5 sm:py-6">
        <header className="grid gap-4 rounded-lg border border-outline-variant/40 bg-panel p-4 lg:grid-cols-[1fr_20rem] lg:items-end">
          <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-violet text-void hover:bg-violet">Portfolio</Badge>
            <Badge variant="outline" className="border-outline-variant/50 text-on-surface-variant">
              Demo data
            </Badge>
            <Badge variant="outline" className="border-outline-variant/50 text-on-surface-variant">
              Read-only holdings
            </Badge>
          </div>
              <h2 className="mt-4 text-2xl font-semibold leading-tight text-on-surface sm:text-3xl">
                Read-only allocation.
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-on-surface-variant">
                Holdings, DeFi exposure, concentration, and replayable sample bars in one view.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  asChild
                  variant="outline"
                  className="border-outline-variant/50 bg-transparent text-on-surface hover:bg-surface-high/60"
                >
                  <Link href="/review">Review</Link>
                </Button>
                <Badge variant="outline" className="border-outline-variant/50 px-3 py-2 text-on-surface-variant">
                  API: /api/portfolio
                </Badge>
              </div>
            </div>
            <Card className="border-outline-variant/40 bg-surface-high/30">
              <CardHeader className="p-5">
                <CardDescription className="text-on-surface-variant">Total market value</CardDescription>
                <CardTitle className="text-3xl text-on-surface">
                  {formatCurrency(portfolio.total_market_value)}
                </CardTitle>
                <p className="text-sm font-semibold text-caution">
                  Demo USD only. No real account balance.
                </p>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 p-5 pt-0 text-sm">
                <Metric label="Holdings" value={portfolio.holdings.length.toString()} />
                <Metric label="Accounts" value={uniqueAccountCount(portfolio.holdings).toString()} />
              </CardContent>
            </Card>
        </header>

        <AsOfReplayControl activeAsOf={portfolio.provenance.replay_as_of} apiPath="/api/portfolio" />

        <section className="grid gap-4 lg:grid-cols-3" aria-label="Portfolio summary panels">
          <Card className="border-outline-variant/40 bg-surface-high/30">
            <CardHeader className="p-5">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-md border border-violet/30 bg-violet/10 text-violet">
                  <ShieldCheck aria-hidden="true" className="size-5" />
                </div>
                <div>
                  <CardDescription className="text-outline">Concentration score</CardDescription>
                  <CardTitle className="text-2xl text-on-surface">
                    HHI {portfolio.concentration.hhi.toLocaleString("en-US")}
                  </CardTitle>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-5 pt-0 text-sm leading-6 text-on-surface-variant">
              Top position is {portfolio.concentration.top_symbol ?? "n/a"} at{" "}
              {portfolio.concentration.top_position_pct.toFixed(1)}% of seeded fake market value.
            </CardContent>
          </Card>

          <Card className="border-outline-variant/40 bg-surface-high/30">
            <CardHeader className="p-5">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-md border border-engine/30 bg-engine/10 text-engine">
                  <WalletCards aria-hidden="true" className="size-5" />
                </div>
                <div>
                  <CardDescription className="text-outline">DeFi / on-chain</CardDescription>
                  <CardTitle className="text-2xl text-on-surface">
                    {portfolio.defi_positions.length} position
                  </CardTitle>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-5 pt-0 text-sm leading-6 text-on-surface-variant">
              Asset class defi rows are isolated below with Base chain venue and account
              integration status.
            </CardContent>
          </Card>

          <Card className="border-outline-variant/40 bg-surface-high/30">
            <CardHeader className="p-5">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-md border border-caution/30 bg-caution/10 text-caution">
                  <Database aria-hidden="true" className="size-5" />
                </div>
                <div>
                  <CardDescription className="text-outline">Data provenance</CardDescription>
                  <CardTitle className="text-2xl text-on-surface">{portfolio.provenance.label}</CardTitle>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-5 pt-0 text-sm leading-6 text-on-surface-variant">
              As of {formatDateTime(portfolio.provenance.as_of)} from seeded rows only.
            </CardContent>
          </Card>
        </section>

        <PortfolioCharts allocation={portfolio.allocation} chartAssets={portfolio.chart_assets} />

        <section aria-labelledby="holdings-table-title" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="holdings-table-title" className="text-xl font-semibold text-on-surface">
                Consolidated holdings table
              </h2>
              <p className="mt-1 text-sm text-outline">
                Symbol, quantity, fake sample/demo cost basis, fake sample/demo market value,
                weight%, and integration status across all accounts.
              </p>
            </div>
            <Badge variant="outline" className="border-outline-variant/50 text-on-surface-variant">
              {portfolio.holdings.length} rows
            </Badge>
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Integration status badge legend">
            <IntegrationBadge status="connected" />
            <IntegrationBadge status="stubbed" />
            <IntegrationBadge status="credential_gated" />
          </div>
          <HoldingsTable holdings={portfolio.holdings} />
        </section>

        <section aria-labelledby="defi-title" className="space-y-4">
          <div>
            <h2 id="defi-title" className="text-xl font-semibold text-on-surface">
              DeFi and on-chain positions
            </h2>
            <p className="mt-1 text-sm text-outline">
              Filtered to holdings where asset_class is defi.
            </p>
          </div>
          {portfolio.defi_positions.length > 0 ? (
            <HoldingsTable holdings={portfolio.defi_positions} compact />
          ) : (
            <div className="rounded-lg border border-outline-variant/40 bg-surface-high/30 p-5 text-sm text-on-surface-variant">
              No DeFi positions are present in the seeded portfolio.
            </div>
          )}
        </section>
      </div>
    </AppShell>
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
      <div className="hidden rounded-lg border border-outline-variant/40 bg-surface-high/30 sm:block">
        <div className="border-b border-outline-variant/40 px-4 py-2 text-xs text-outline">
          Scroll sideways to review cost, market value, weight, and integration status.
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
        <thead className="border-b border-outline-variant/40 bg-surface-dim/70 text-xs uppercase text-outline">
          <tr>
            <th scope="col" className="px-4 py-3 font-semibold">
              Symbol
            </th>
            {!compact ? (
              <th scope="col" className="px-4 py-3 font-semibold">
                Account
              </th>
            ) : null}
            <th scope="col" className="px-4 py-3 font-semibold">
              Quantity
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Cost basis (fake demo USD)
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Market value (fake demo USD)
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Weight%
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/40">
          {holdings.map((holding) => (
            <tr key={holding.id} className="align-top">
              <th scope="row" className="px-4 py-4 font-semibold text-on-surface">
                <span>{holding.symbol}</span>
                <span className="mt-1 block text-xs font-normal text-outline">
                  {holding.asset_name} · {holding.asset_class} · {holding.venue}
                </span>
              </th>
              {!compact ? (
                <td className="px-4 py-4 text-on-surface-variant">
                  <span>{holding.account.label}</span>
                  <span className="mt-1 block text-xs text-outline">{holding.account.kind}</span>
                </td>
              ) : null}
              <td className="px-4 py-4 tabular-nums text-on-surface-variant">
                {formatQuantity(holding.quantity)}
              </td>
              <td className="px-4 py-4 tabular-nums text-on-surface-variant">
                {formatCurrency(holding.cost_basis)}
              </td>
              <td className="px-4 py-4 tabular-nums text-on-surface-variant">
                {formatCurrency(holding.market_value)}
              </td>
              <td className="px-4 py-4 tabular-nums text-on-surface-variant">
                {holding.weight_pct.toFixed(1)}%
              </td>
              <td className="px-4 py-4">
                <IntegrationBadge status={holding.account.integration_status} />
              </td>
            </tr>
          ))}
        </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function HoldingCard({
  holding,
  compact,
}: {
  holding: PortfolioHoldingJson;
  compact: boolean;
}) {
  return (
    <article className="rounded-lg border border-outline-variant/40 bg-surface-high/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-on-surface">{holding.symbol}</h3>
          <p className="mt-1 text-xs leading-5 text-outline">
            {holding.asset_name} · {holding.asset_class} · {holding.venue}
          </p>
          {!compact ? (
            <p className="mt-1 text-xs text-outline">
              {holding.account.label} · {holding.account.kind}
            </p>
          ) : null}
        </div>
        <IntegrationBadge status={holding.account.integration_status} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <MobileMetric label="Quantity" value={formatQuantity(holding.quantity)} />
        <MobileMetric label="Weight" value={`${holding.weight_pct.toFixed(1)}%`} />
        <MobileMetric label="Cost basis (fake demo USD)" value={formatCurrency(holding.cost_basis)} />
        <MobileMetric label="Market value (fake demo USD)" value={formatCurrency(holding.market_value)} />
      </dl>
    </article>
  );
}

function MobileMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-outline-variant/40 bg-surface-dim/45 p-3">
      <dt className="text-xs text-outline">{label}</dt>
      <dd className="mt-1 break-words font-semibold text-on-surface">{value}</dd>
    </div>
  );
}

function IntegrationBadge({ status }: { status: PortfolioHoldingJson["account"]["integration_status"] }) {
  const className =
    status === "connected"
      ? "border-engine/40 bg-engine/10 text-engine"
      : status === "stubbed"
        ? "border-amber-300/35 bg-caution/10 text-caution"
        : "border-violet/40 bg-violet/10 text-violet";

  return (
    <Badge variant="outline" className={className}>
      {status}
    </Badge>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-outline-variant/40 bg-surface-dim/40 p-3">
      <p className="text-xs text-outline">{label}</p>
      <p className="mt-1 text-lg font-semibold text-on-surface">{value}</p>
    </div>
  );
}

function uniqueAccountCount(holdings: PortfolioHoldingJson[]) {
  return new Set(holdings.map((holding) => holding.account.id)).size;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 6,
  }).format(value);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(value));
}
