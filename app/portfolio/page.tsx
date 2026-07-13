import Link from "next/link";
import { Plus, Shield } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ManualHoldingsPanel } from "@/components/manual-holdings-panel";
import { PortfolioCharts } from "@/components/portfolio-charts";
import { PositionPoliciesPanel } from "@/components/position-policies-panel";
import { SettingsSection } from "@/components/settings-section";
import { productProvenanceLabel } from "@/lib/provenance-copy";
import { parseAsOf } from "@/src/db/bitemporal";
import { getPortfolio } from "@/src/db/portfolio";
import { evaluatePositionPolicies, getPositionPolicies } from "@/src/db/position-policies";

export const dynamic = "force-dynamic";

type PortfolioPageProps = {
  searchParams?: Promise<{ as_of?: string; all?: string }>;
};

export default async function PortfolioPage({ searchParams }: PortfolioPageProps) {
  const params = await searchParams;
  const showAll = params?.all === "1";
  const parsedAsOf = parseAsOf(params?.as_of ?? null);
  const asOf = parsedAsOf.ok ? parsedAsOf.asOf : null;
  const portfolio = getPortfolio(asOf);
  const policies = asOf ? [] : getPositionPolicies();
  const policyBySymbol = new Map(policies.map((policy) => [policy.symbol, policy]));
  const findings = asOf ? [] : evaluatePositionPolicies(portfolio.holdings);
  const rows = [...portfolio.holdings, ...portfolio.defi_positions.filter(
    (position) => !portfolio.holdings.some((holding) => holding.id === position.id),
  )];
  const primaryRows = showAll ? rows : rows.slice(0, 15);
  const remainingCount = rows.length - primaryRows.length;

  return (
    <AppShell dataMode={productProvenanceLabel(portfolio.provenance.label)}>
      <div className="mx-auto grid w-full max-w-4xl gap-4 [&>*]:min-w-0">
        <header>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-display text-lg font-semibold text-on-surface">Portfolio</h1>
              <p className="mt-0.5 text-xs text-outline">{sourceLine(portfolio)}</p>
            </div>
            {/* Plain anchors: hash-only links must fire hashchange so the
                collapsed rows below can open themselves. */}
            <a
              href="#add-holdings"
              className="inline-flex min-h-11 items-center gap-2 rounded-md bg-violet px-3 text-xs font-semibold text-void transition hover:bg-violet/90 sm:min-h-8"
            >
              <Plus aria-hidden="true" className="size-3.5" /> Add holding
            </a>
          </div>
          <p className="mt-2 text-lg text-on-surface">
            <span className="font-semibold tabular-nums">{formatCurrency(portfolio.total_market_value)}</span>
            <span className="text-sm text-on-surface-variant">
              {" · "}
              {formatChange(portfolio.daily_change_value, portfolio.daily_change_pct)} today
            </span>
          </p>
        </header>

        {findings.length > 0 ? (
          <section aria-label="Policy checks" className="grid gap-1.5">
            {findings.map((finding) => (
              <div key={`${finding.symbol}-${finding.kind}`} className="rounded-md border border-caution/40 bg-caution/10 px-3 py-2">
                <p className="text-sm font-semibold text-on-surface">{finding.title}</p>
                <p className="mt-0.5 text-xs leading-5 text-on-surface-variant">{finding.detail}</p>
              </div>
            ))}
          </section>
        ) : null}

        <section aria-labelledby="allocation-title">
          <h2 id="allocation-title" className="text-xs font-semibold uppercase tracking-telemetry text-outline">
            Net worth and allocation
          </h2>
          <div className="mt-2">
            <PortfolioCharts allocation={portfolio.allocation} netWorthSeries={portfolio.net_worth_series} />
          </div>
        </section>

        <section aria-labelledby="holdings-title">
          <div className="flex items-center justify-between gap-3">
            <h2 id="holdings-title" className="text-xs font-semibold uppercase tracking-telemetry text-outline">
              Holdings
            </h2>
            <span className="text-xs text-outline">{rows.length} positions</span>
          </div>
          <div className="mt-2 grid gap-2 sm:hidden">
            {primaryRows.map((holding) => {
              const policy = policyBySymbol.get(holding.symbol.toUpperCase());
              return (
                <article key={holding.id} className="rounded-md border border-outline-variant/25 bg-surface-low/35 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-on-surface">{holding.symbol}</p>
                      <p className="truncate text-xs text-outline">{holding.asset_name}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold tabular-nums text-on-surface">{formatCurrency(holding.market_value)}</p>
                      <p className="text-xs tabular-nums text-on-surface-variant">{holding.weight_pct.toFixed(1)}% share</p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 border-t border-outline-variant/15 pt-2 text-xs">
                    <div>
                      <p className="text-outline">Amount</p>
                      <p className="mt-0.5 tabular-nums text-on-surface-variant">{formatQuantity(holding.quantity)}</p>
                    </div>
                    <div>
                      <p className="text-outline">Today</p>
                      <p className={`mt-0.5 tabular-nums ${holding.daily_change_pct > 0 ? "text-engine" : holding.daily_change_pct < 0 ? "text-critical" : "text-on-surface-variant"}`}>
                        {holding.daily_change_pct === 0 ? "—" : `${holding.daily_change_pct > 0 ? "+" : ""}${holding.daily_change_pct.toFixed(1)}%`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-outline">Rule</p>
                      <a
                        href="#position-policies"
                        className="mt-0.5 inline-flex items-center gap-1 text-violet hover:text-tertiary"
                        title={policyTitle(policy?.intent)}
                      >
                        <Shield aria-hidden="true" className="size-3" />
                        {policy?.intent ?? "set"}
                      </a>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          <div className="mt-2 hidden overflow-x-auto rounded-md border border-outline-variant/25 sm:block">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="border-b border-outline-variant/25 text-left text-[10px] uppercase tracking-wide text-outline">
                  <th className="px-3 py-2 font-semibold">Asset</th>
                  <th className="px-3 py-2 text-right font-semibold">Amount</th>
                  <th className="px-3 py-2 text-right font-semibold">Value</th>
                  <th className="px-3 py-2 text-right font-semibold">Today</th>
                  <th className="px-3 py-2 text-right font-semibold">Share</th>
                  <th className="px-3 py-2 text-right font-semibold">Rule</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/15">
                {primaryRows.map((holding) => (
                  <tr key={holding.id}>
                    <td className="px-3 py-1.5">
                      <span className="font-semibold text-on-surface">{holding.symbol}</span>
                      <span className="ml-2 hidden text-xs text-outline sm:inline">{holding.asset_name}</span>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-on-surface-variant">
                      {formatQuantity(holding.quantity)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-on-surface">
                      {formatCurrency(holding.market_value)}
                    </td>
                    <td
                      className={`px-3 py-1.5 text-right tabular-nums ${
                        holding.daily_change_pct > 0
                          ? "text-engine"
                          : holding.daily_change_pct < 0
                            ? "text-critical"
                            : "text-on-surface-variant"
                      }`}
                    >
                      {holding.daily_change_pct === 0 ? "—" : `${holding.daily_change_pct > 0 ? "+" : ""}${holding.daily_change_pct.toFixed(1)}%`}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-on-surface-variant">
                      {holding.weight_pct.toFixed(1)}%
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <a
                        href="#position-policies"
                        className="inline-flex items-center gap-1 text-xs text-violet hover:text-tertiary"
                        title={policyTitle(policyBySymbol.get(holding.symbol.toUpperCase())?.intent)}
                      >
                        <Shield aria-hidden="true" className="size-3" />
                        {policyBySymbol.get(holding.symbol.toUpperCase())?.intent ?? "set"}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {remainingCount > 0 ? (
            <Link
              href="/portfolio?all=1#holdings-title"
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-violet hover:text-tertiary"
            >
              Show {remainingCount} more positions
            </Link>
          ) : showAll && rows.length > 15 ? (
            <Link
              href="/portfolio#holdings-title"
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-violet hover:text-tertiary"
            >
              Show top 15 only
            </Link>
          ) : null}
        </section>

        {/* The below-the-fold tools collapse to one-line rows; anchor links
            (#position-policies, #add-holdings) open them via SettingsSection. */}
        <div className="divide-y divide-outline-variant/15 rounded-md border border-outline-variant/25">
          <SettingsSection
            id="position-policies"
            title="Position policies"
            status={`${policies.length} rule${policies.length === 1 ? "" : "s"} · ${findings.length} flag${findings.length === 1 ? "" : "s"}`}
            statusTone={findings.length > 0 ? "watch" : "muted"}
          >
            <PositionPoliciesPanel
              policies={policies}
              findings={findings.map((finding) => ({
                symbol: finding.symbol,
                kind: finding.kind,
                classification: finding.classification,
                title: finding.title,
                detail: finding.detail,
              }))}
              symbols={rows.map((holding) => holding.symbol)}
            />
          </SettingsSection>

          <SettingsSection
            id="add-holdings"
            title="Add or edit holdings"
            status={`${portfolio.manual_holdings.length} manual holding${portfolio.manual_holdings.length === 1 ? "" : "s"}`}
          >
            <ManualHoldingsPanel holdings={portfolio.manual_holdings} />
            <p className="mt-2 text-xs text-outline">
              Connections (Monarch, brokerages, wallets) live in{" "}
              <Link href="/settings" className="text-violet hover:text-tertiary">
                Settings
              </Link>
              .
            </p>
          </SettingsSection>
        </div>
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

function policyTitle(intent: string | undefined) {
  return intent ? `Your standing rule: ${intent}` : "Set a standing rule for this position";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(value);
}

function formatChange(value: number, pct: number) {
  const sign = value >= 0 ? "+" : "-";
  return `${sign}${formatCurrency(Math.abs(value))} (${sign}${Math.abs(pct).toFixed(1)}%)`;
}
