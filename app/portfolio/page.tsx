import { AppShell } from "@/components/app-shell";
import { AsOfReplayControl } from "@/components/as-of-replay-control";
import { ManualHoldingsPanel } from "@/components/manual-holdings-panel";
import { PageHeader } from "@/components/page-header";
import { PortfolioCharts } from "@/components/portfolio-charts";
import { Badge } from "@/components/ui/badge";
import {
  buildAlertSuggestedResponse,
  cleanAlertMessage,
  explainAlertRelevance,
  shortAlertTierLabel,
} from "@/lib/alert-loop";
import { portfolioConcentrationNote, portfolioPageSubtitle } from "@/lib/portfolio-copy";
import { productProvenanceLabel } from "@/lib/provenance-copy";
import { parseAsOf } from "@/src/db/bitemporal";
import { getAlerts, type AlertJson } from "@/src/db/alerts";
import { getPortfolio, type PortfolioHoldingJson } from "@/src/db/portfolio";

type PortfolioPageProps = {
  searchParams?: Promise<{ as_of?: string }>;
};

export default async function PortfolioPage({ searchParams }: PortfolioPageProps) {
  const params = await searchParams;
  const parsedAsOf = parseAsOf(params?.as_of ?? null);
  const asOf = parsedAsOf.ok ? parsedAsOf.asOf : null;
  const portfolio = getPortfolio(asOf);
  const alerts = getAlerts(asOf);
  const publicProvenanceLabel = productProvenanceLabel(portfolio.provenance.label);

  return (
    <AppShell dataMode={publicProvenanceLabel}>
      <div className="mx-auto max-w-5xl">
        <PageHeader
          title="Portfolio"
          subtitle={portfolioPageSubtitle()}
          provenance={publicProvenanceLabel}
        />
        <div className="mb-6">
          <AsOfReplayControl activeAsOf={portfolio.provenance.replay_as_of} apiPath="/api/portfolio" />
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="Total value"
            value={formatCurrency(portfolio.total_market_value)}
            note={portfolioValueNote(portfolio)}
            big
          />
          <Stat
            label="Today's move"
            value={`${portfolio.daily_change_value >= 0 ? "+" : ""}${formatCurrency(portfolio.daily_change_value)}`}
            note={`${portfolio.daily_change_pct >= 0 ? "+" : ""}${portfolio.daily_change_pct.toFixed(1)}% across visible holdings`}
            tone={portfolio.daily_change_value >= 0 ? "good" : "bad"}
          />
          <Stat
            label="Concentration"
            value={`${portfolio.concentration.top_position_pct.toFixed(0)}%`}
            note={portfolioConcentrationNote(portfolio.concentration.top_symbol)}
          />
          <Stat
            label="Data source"
            value={portfolioDataSourceLabel(portfolio.provenance.label)}
            note={portfolioDataSourceNote(portfolio)}
          />
        </div>

        {portfolio.import_snapshot.count > 0 || portfolio.import_snapshot.issue_count > 0 ? (
          <div className="mt-4 rounded-lg border border-outline-variant/40 bg-surface-high/25 p-4 text-sm leading-6 text-on-surface-variant">
            <p className="font-semibold text-on-surface">Imported snapshot</p>
            <p className="mt-1">
              {portfolio.import_snapshot.status}. {portfolio.import_snapshot.note}
            </p>
            <p className="mt-1 text-xs text-outline">
              Last import {formatReadableTime(portfolio.import_snapshot.last_imported_at ?? portfolio.import_snapshot.last_checked_at)} · Account data as of {formatReadableTime(portfolio.import_snapshot.latest_as_of)}
            </p>
            {portfolio.import_snapshot.issue_count > 0 ? (
              <details className="mt-3 rounded-md border border-outline-variant/40 bg-surface-dim/35 p-3">
                <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-on-surface">
                  Import issues
                </summary>
                <ul className="mt-2 space-y-2 text-xs leading-5 text-outline">
                  {portfolio.import_snapshot.issues.map((issue) => (
                    <li key={`${issue.symbol}-${issue.reason}`}>
                      <span className="font-semibold text-on-surface">{issue.symbol}</span>
                      {" — "}
                      {issue.reason}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        ) : null}

        <div className="mt-6">
          <PortfolioCharts allocation={portfolio.allocation} netWorthSeries={portfolio.net_worth_series} />
        </div>

        <section aria-labelledby="holdings-title" className="mt-8 space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="holdings-title" className="font-display text-lg font-semibold text-on-surface">
                Holdings
              </h2>
              <p className="mt-1 text-sm text-outline">
                Largest positions first.
              </p>
            </div>
            <Badge variant="outline" className="border-outline-variant/50 text-outline">
              {portfolio.holdings.length} visible
            </Badge>
          </div>
          <HoldingsTable holdings={portfolio.holdings} alerts={alerts} />
        </section>

        {portfolio.defi_positions.length > 0 ? (
          <section aria-labelledby="defi-title" className="mt-8 space-y-3">
            <h2 id="defi-title" className="font-display text-lg font-semibold text-on-surface">
              On-chain positions
            </h2>
            <HoldingsTable holdings={portfolio.defi_positions} alerts={alerts} compact />
          </section>
        ) : null}

        <details className="mt-8 rounded-lg border border-outline-variant/40 bg-surface-high/25 px-4 pb-1" id="add-holdings">
          <summary className="flex min-h-12 cursor-pointer items-center gap-2 text-base font-semibold text-on-surface">
            Add or edit manual holdings
          </summary>
          <div className="pb-4">
            <ManualHoldingsPanel holdings={portfolio.manual_holdings} />
          </div>
        </details>
      </div>
    </AppShell>
  );
}

function Stat({
  label,
  value,
  note,
  big = false,
  tone = "neutral",
}: {
  label: string;
  value: string;
  note: string;
  big?: boolean;
  tone?: "neutral" | "good" | "bad";
}) {
  return (
    <div className="border border-outline-variant/40 bg-surface-high/30 p-3 sm:p-4 chamfer-sm">
      <p className="text-xs uppercase tracking-telemetry text-outline">{label}</p>
      <p
        className={`mt-1 break-words font-display font-semibold ${big ? "text-2xl sm:text-3xl" : "text-xl sm:text-2xl"} ${
          tone === "good" ? "text-engine" : tone === "bad" ? "text-critical" : "text-on-surface"
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-outline">{note}</p>
    </div>
  );
}

function HoldingsTable({
  holdings,
  alerts,
  compact = false,
}: {
  holdings: PortfolioHoldingJson[];
  alerts: AlertJson[];
  compact?: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:hidden">
        {holdings.map((holding) => (
          <HoldingCard
            key={holding.id}
            holding={holding}
            compact={compact}
            relatedAlert={relatedAlertForHolding(holding, alerts)}
          />
        ))}
      </div>
      <div className="hidden overflow-x-auto border border-outline-variant/40 bg-surface-high/30 chamfer-sm sm:block">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-outline-variant/40 bg-surface-dim/70 text-xs uppercase tracking-telemetry text-outline">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">Asset</th>
              {!compact ? <th scope="col" className="px-4 py-3 font-semibold">Account</th> : null}
              <th scope="col" className="px-4 py-3 font-semibold">Amount</th>
              <th scope="col" className="px-4 py-3 font-semibold">Paid</th>
              <th scope="col" className="px-4 py-3 font-semibold">Value</th>
              <th scope="col" className="px-4 py-3 font-semibold">Today</th>
              <th scope="col" className="px-4 py-3 font-semibold">Portfolio share</th>
              <th scope="col" className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/40">
            {holdings.map((holding) => (
              <tr
                key={holding.id}
                className="align-middle transition-colors hover:bg-surface-high/40"
                title={holdingDetailSummary(holding, relatedAlertForHolding(holding, alerts))}
              >
                <th scope="row" className="px-4 py-3 font-semibold text-on-surface">
                  <span>{holding.symbol}</span>
                  <span className="mt-0.5 block max-w-44 truncate text-xs font-normal text-outline">
                    {holdingTableAssetMeta(holding, compact)}
                  </span>
                </th>
                {!compact ? (
                  <td className="px-4 py-3 text-on-surface-variant">{holding.account.label}</td>
                ) : null}
                <td className="px-4 py-3 tabular-nums text-on-surface-variant">{formatQuantity(holding.quantity)}</td>
                <td className="px-4 py-3 tabular-nums text-on-surface-variant">{formatCurrency(holding.cost_basis)}</td>
                <td className="px-4 py-3 tabular-nums font-medium text-on-surface">{formatCurrency(holding.market_value)}</td>
                <td className={holding.daily_change_value >= 0 ? "px-4 py-3 tabular-nums text-engine" : "px-4 py-3 tabular-nums text-critical"}>
                  {holding.daily_change_value >= 0 ? "+" : ""}
                  {formatCurrency(holding.daily_change_value)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="w-12 shrink-0 tabular-nums text-on-surface-variant">
                      {holding.weight_pct.toFixed(1)}%
                    </span>
                    <span className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-high" aria-hidden="true">
                      <span
                        className="block h-full rounded-full bg-violet/70"
                        style={{ width: `${Math.min(holding.weight_pct, 100)}%` }}
                      />
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <IntegrationBadge holding={holding} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {holdings.length === 0 ? (
        <div className="border border-outline-variant/40 bg-surface-high/30 p-4 text-sm text-outline chamfer-sm">
          No visible holdings in this view.
        </div>
      ) : null}
    </div>
  );
}

function HoldingCard({
  holding,
  compact,
  relatedAlert,
}: {
  holding: PortfolioHoldingJson;
  compact: boolean;
  relatedAlert: AlertJson | null;
}) {
  return (
    <article className="border border-outline-variant/40 bg-surface-high/30 p-4 chamfer-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-on-surface">{holding.symbol}</h3>
          <p className="mt-1 text-xs leading-5 text-outline">
            {holdingMeta(holding, compact)}
          </p>
        </div>
        <IntegrationBadge holding={holding} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <MobileMetric label="Amount" value={formatQuantity(holding.quantity)} />
        <MobileMetric label="Portfolio share" value={`${holding.weight_pct.toFixed(1)}%`} />
        <MobileMetric
          label="Today"
          value={`${holding.daily_change_value >= 0 ? "+" : ""}${formatCurrency(holding.daily_change_value)}`}
        />
        <MobileMetric label="Value" value={formatCurrency(holding.market_value)} />
      </dl>
      <details className="mt-4 rounded-md border border-outline-variant/40 bg-surface-dim/35">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-on-surface">
          <span>Open holding details</span>
          <span className="text-xs font-medium text-outline">Tap</span>
        </summary>
        <div className="space-y-3 border-t border-outline-variant/40 p-3 text-sm leading-6 text-on-surface-variant">
          <InfoLine label="Position size" value={holdingConcentrationLine(holding)} />
          <InfoLine label="Recent move" value={holdingMoveLine(holding)} />
          <InfoLine label="Data source" value={holdingSourceLine(holding)} />
          <RelatedAlertDetail alert={relatedAlert} />
        </div>
      </details>
    </article>
  );
}

function RelatedAlertDetail({ alert }: { alert: AlertJson | null }) {
  if (!alert) {
    return <InfoLine label="Related alert" value="No current alert for this holding." />;
  }

  return (
    <div className="rounded-md border border-outline-variant/40 bg-surface-high/30 p-3">
      <p className="text-xs font-semibold uppercase text-outline">Related alert</p>
      <p className="mt-1 font-semibold text-on-surface">
        {shortAlertTierLabel(alert.tier)} · {cleanAlertMessage(alert.message)}
      </p>
      <p className="mt-2 text-outline">{explainAlertRelevance(alert)}</p>
      <p className="mt-2 text-on-surface-variant">{buildAlertSuggestedResponse(alert)}</p>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-outline">{label}</p>
      <p className="mt-1 text-on-surface-variant">{value}</p>
    </div>
  );
}

function holdingMeta(holding: PortfolioHoldingJson, compact: boolean) {
  const parts = [holding.asset_name, holding.venue];
  if (!compact && holding.account.label.toLowerCase() !== holding.venue.toLowerCase()) {
    parts.push(holding.account.label);
  }
  return parts.join(" · ");
}

function holdingTableAssetMeta(holding: PortfolioHoldingJson, compact: boolean) {
  const accountMatchesVenue = holding.account.label.toLowerCase() === holding.venue.toLowerCase();
  const parts = accountMatchesVenue && !compact ? [holding.asset_name] : [holding.asset_name, holding.venue];
  return parts.join(" · ");
}

function MobileMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-outline-variant/40 bg-surface-dim/45 p-3 chamfer-sm">
      <dt className="text-xs text-outline">{label}</dt>
      <dd className="mt-1 break-words font-semibold text-on-surface">{value}</dd>
    </div>
  );
}

function relatedAlertForHolding(holding: PortfolioHoldingJson, alerts: AlertJson[]) {
  const related = alerts.filter((alert) => alert.asset_symbol === holding.symbol);
  return related.find((alert) => !alert.acknowledged) ?? related[0] ?? null;
}

function holdingDetailSummary(holding: PortfolioHoldingJson, alert: AlertJson | null) {
  if (alert) {
    return `${shortAlertTierLabel(alert.tier)}: ${cleanAlertMessage(alert.message)}`;
  }
  return holding.weight_pct >= 20 ? "Large visible position; no current alert." : "No current alert.";
}

function holdingConcentrationLine(holding: PortfolioHoldingJson) {
  if (holding.weight_pct >= 30) {
    return `${holding.symbol} is a large visible position at ${holding.weight_pct.toFixed(1)}%. Treat ideas here as risk decisions first.`;
  }
  if (holding.weight_pct >= 10) {
    return `${holding.symbol} is ${holding.weight_pct.toFixed(1)}% of the visible portfolio. Check before adding or removing exposure.`;
  }
  if (holding.weight_pct > 0) {
    return `${holding.symbol} is a small visible position at ${holding.weight_pct.toFixed(1)}%. Watch it only if you planned to adjust it.`;
  }
  return `${holding.symbol} has no visible portfolio share in this view.`;
}

function holdingMoveLine(holding: PortfolioHoldingJson) {
  const direction = holding.daily_change_value > 0 ? "up" : holding.daily_change_value < 0 ? "down" : "flat";
  if (direction === "flat") {
    return "No visible price move in this saved view.";
  }
  return `${holding.symbol} is ${direction} ${Math.abs(holding.daily_change_pct).toFixed(1)}% today, or ${holding.daily_change_value >= 0 ? "+" : "-"}${formatCurrency(Math.abs(holding.daily_change_value))}.`;
}

function holdingSourceLine(holding: PortfolioHoldingJson) {
  if (holding.source === "manual") {
    return "Local manual entry. It stays in this app.";
  }
  if (holding.source === "connected") {
    return `Imported holdings snapshot from ${formatReadableTime(holding.as_of)}. It cannot place a trade and does not refresh by itself.`;
  }
  return "Sample holding, not imported money.";
}

function portfolioValueNote(portfolio: ReturnType<typeof getPortfolio>) {
  if (portfolio.provenance.label === "Imported portfolio") {
    return `${portfolio.import_snapshot.status.toLowerCase()} + local/sample holdings`;
  }
  if (portfolio.provenance.label === "Manual portfolio") {
    return "manual entries + sample data";
  }
  return "sample data only · no real balance";
}

function portfolioDataSourceNote(portfolio: ReturnType<typeof getPortfolio>) {
  const base = `${portfolio.imported_holdings.length} imported · ${portfolio.manual_holdings.length} manual · ${uniqueAccountCount(portfolio.holdings)} visible accounts`;
  if (portfolio.import_snapshot.count === 0) return base;
  return `${base} · ${portfolio.import_snapshot.status.toLowerCase()}`;
}

function portfolioDataSourceLabel(label: ReturnType<typeof getPortfolio>["provenance"]["label"]) {
  if (label === "Imported portfolio") return "Imported";
  if (label === "Manual portfolio") return "Manual";
  return "Sample";
}

function IntegrationBadge({ holding }: { holding: PortfolioHoldingJson }) {
  const status = holding.source === "demo" ? "stubbed" : holding.account.integration_status;
  const label = status === "connected" ? "imported" : status === "manual" ? "manual" : status === "stubbed" ? "sample" : "gated";
  const className =
    status === "connected"
      ? "border-engine/40 bg-engine/10 text-engine"
      : status === "manual"
        ? "border-violet/40 bg-violet/10 text-violet"
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

function formatReadableTime(value: string | null) {
  if (!value) return "not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "not available";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
