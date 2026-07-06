import { demoDatabase } from "./seed-data";
import { isKnownBy, latestKnowledgeTime, type AsOfFilter } from "./bitemporal";
import type { Asset, PriceBar } from "./schema";
import { store, type ImportedHoldingRow, type ManualHoldingRow } from "./store";
import { getLatestPortfolioBrainSnapshot, portfolioBrainHoldingsForPortfolio, type PortfolioBrainSnapshot } from "./portfolio-brain";

export type AssetClass = Asset["asset_class"] | "cash";

export type ManualHoldingInput = {
  symbol: string;
  asset_name: string;
  asset_class: AssetClass;
  venue: string;
  quantity: number;
  price: number;
  cost_basis?: number;
  daily_change_pct?: number;
};

export type PortfolioHoldingJson = {
  id: string;
  symbol: string;
  asset_name: string;
  asset_class: AssetClass;
  venue: string;
  quantity: number;
  cost_basis: number;
  market_value: number;
  daily_change_pct: number;
  daily_change_value: number;
  weight_pct: number;
  as_of: string;
  source: "demo" | "manual" | "connected";
  account: {
    id: string;
    kind: "coinbase" | "robinhood" | "onchain_wallet" | "manual";
    label: string;
    integration_status: "connected" | "stubbed" | "credential_gated" | "manual";
    scope: "read_only";
  };
};

export type AllocationJson = {
  asset_class: AssetClass;
  market_value: number;
  weight_pct: number;
};

export type PriceChartAssetJson = {
  asset: Pick<Asset, "id" | "symbol" | "name" | "asset_class" | "venue">;
  bars: Pick<PriceBar, "ts" | "open" | "high" | "low" | "close" | "volume" | "knowledge_time">[];
};

export type NetWorthPointJson = {
  date: string;
  value: number;
};

export type PortfolioJson = {
  total_market_value: number;
  daily_change_value: number;
  daily_change_pct: number;
  holdings: PortfolioHoldingJson[];
  defi_positions: PortfolioHoldingJson[];
  allocation: AllocationJson[];
  net_worth_series: NetWorthPointJson[];
  manual_holdings: PortfolioHoldingJson[];
  imported_holdings: PortfolioHoldingJson[];
  import_snapshot: {
    count: number;
    skipped_count: number;
    issue_count: number;
    issues: PortfolioImportIssue[];
    status: "No imported holdings" | "Fresh snapshot" | "Aging snapshot" | "Stale snapshot";
    last_imported_at: string | null;
    last_checked_at: string | null;
    oldest_imported_at: string | null;
    latest_as_of: string | null;
    stale_after_hours: number;
    is_stale: boolean;
    note: string;
  };
  concentration: {
    hhi: number;
    top_position_pct: number;
    top_symbol: string | null;
  };
  chart_assets: PriceChartAssetJson[];
  provenance: {
    label: "Demo data" | "Manual portfolio" | "Imported portfolio";
    source: string;
    as_of: string;
    replay_as_of: string | null;
  };
};

export type PortfolioImportIssue = {
  symbol: string;
  name: string;
  reason: string;
};

const assetClassOrder: AssetClass[] = ["equity", "crypto", "defi", "cash"];
const PORTFOLIO_CACHE_TTL_MS = 5_000;
const portfolioCache = new Map<string, { expiresAt: number; value: PortfolioJson }>();

export function getPortfolio(asOf: AsOfFilter | null = null): PortfolioJson {
  const cacheKey = portfolioCacheKey(asOf);
  if (!isTestRuntime()) {
    const cached = portfolioCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
  }

  const value = buildPortfolio(asOf);
  if (!isTestRuntime()) {
    portfolioCache.set(cacheKey, {
      expiresAt: Date.now() + PORTFOLIO_CACHE_TTL_MS,
      value,
    });
  }
  return value;
}

function buildPortfolio(asOf: AsOfFilter | null = null): PortfolioJson {
  const visibleHoldings = demoDatabase.holdings.filter((holding) =>
    isKnownBy(holding.knowledge_time, asOf),
  );
  const visiblePriceBars = demoDatabase.priceBars.filter((bar) => isKnownBy(bar.knowledge_time, asOf));
  const portfolioBrainSnapshot = asOf ? null : getLatestPortfolioBrainSnapshot();
  const manualRows = asOf ? [] : store().manualHoldings();
  const importedRows = asOf ? [] : store().importedHoldings();

  // Any personal source (Monarch snapshot, imported snapshot, or manual
  // holdings) replaces the demo seed entirely so weights, concentration, and
  // recommendations are computed from the operator's holdings, not fiction.
  const hasPersonalSource = portfolioBrainSnapshot !== null || manualRows.length > 0 || importedRows.length > 0;
  const seedHoldings = hasPersonalSource ? [] : visibleHoldings
    .map<PortfolioHoldingJson | null>((holding) => {
      const asset = demoDatabase.assets.find((item) => item.id === holding.asset_id);
      const account = demoDatabase.accounts.find((item) => item.id === holding.account_id);

      if (!asset || !account) {
        return null;
      }

      return {
        id: holding.id,
        symbol: asset.symbol,
        asset_name: asset.name,
        asset_class: asset.asset_class,
        venue: asset.venue,
        quantity: holding.quantity,
        cost_basis: holding.cost_basis,
        market_value: holding.market_value,
        daily_change_pct: dailyChangePctForAsset(asset.id, visiblePriceBars),
        daily_change_value: 0,
        weight_pct: 0,
        as_of: holding.as_of,
        source: account.integration_status === "connected" ? "connected" : "demo",
        account: {
          id: account.id,
          kind: account.kind,
          label: displayAccountLabel(account.kind, account.label),
          integration_status: account.integration_status,
          scope: account.scope,
        },
      } satisfies PortfolioHoldingJson;
    })
    .filter((holding): holding is PortfolioHoldingJson => holding !== null);

  const manualHoldings = manualRows.map(manualRowToHolding);
  const importedHoldings = importedRows.map(importedRowToHolding);
  const brainHoldings = portfolioBrainSnapshot ? portfolioBrainHoldingsForPortfolio(portfolioBrainSnapshot) : [];
  const totalMarketValue = roundMoney(
    [...brainHoldings, ...seedHoldings, ...importedHoldings, ...manualHoldings].reduce(
      (sum, holding) => sum + holding.market_value,
      0,
    ),
  );

  const holdings = [...brainHoldings, ...seedHoldings, ...importedHoldings, ...manualHoldings]
    .map((holding) => ({
      ...holding,
      daily_change_value: roundMoney(holding.market_value * (holding.daily_change_pct / 100)),
      weight_pct: totalMarketValue > 0 ? roundPct((holding.market_value / totalMarketValue) * 100) : 0,
    }))
    .sort((a, b) => b.market_value - a.market_value || a.symbol.localeCompare(b.symbol));

  const manualHoldingIds = new Set(manualRows.map((row) => row.id));
  const importedHoldingIds = new Set(importedRows.map((row) => row.id));
  const brainHoldingIds = new Set(brainHoldings.map((holding) => holding.id));
  const manualHoldingsJson = holdings.filter((holding) => manualHoldingIds.has(holding.id));
  const importedHoldingsJson = holdings.filter((holding) => importedHoldingIds.has(holding.id) || brainHoldingIds.has(holding.id));
  const dailyChangeValue = roundMoney(holdings.reduce((sum, holding) => sum + holding.daily_change_value, 0));
  const dailyChangePct = totalMarketValue > 0 ? roundPct((dailyChangeValue / Math.max(totalMarketValue - dailyChangeValue, 1)) * 100) : 0;
  const allocation = assetClassOrder.map((assetClass) => {
    const marketValue = holdings
      .filter((holding) => holding.asset_class === assetClass)
      .reduce((sum, holding) => sum + holding.market_value, 0);

    return {
      asset_class: assetClass,
      market_value: roundMoney(marketValue),
      weight_pct: totalMarketValue > 0 ? roundPct((marketValue / totalMarketValue) * 100) : 0,
    };
  });

  const topHolding = holdings[0] ?? null;
  const hhi = Math.round(
    holdings.reduce((sum, holding) => sum + holding.weight_pct * holding.weight_pct, 0),
  );
  const provenanceAsOf = asOf?.iso ?? latestKnowledgeTime([
    ...visibleHoldings.map((holding) => holding.knowledge_time),
    ...visiblePriceBars.map((bar) => bar.knowledge_time),
    ...manualRows.map((row) => row.updated_at),
    ...importedRows.map((row) => row.imported_at),
  ]);
  const hasManual = manualRows.length > 0;
  const hasImported = importedRows.length > 0;
  const importSnapshot = buildImportSnapshot(importedRows, portfolioBrainSnapshot);

  return {
    total_market_value: totalMarketValue,
    daily_change_value: dailyChangeValue,
    daily_change_pct: dailyChangePct,
    holdings,
    defi_positions: holdings.filter((holding) => holding.asset_class === "defi"),
    allocation,
    net_worth_series: buildNetWorthSeries(
      holdings,
      visiblePriceBars,
      totalMarketValue,
      // The trailing window ends at the viewer's "now" (or the replayed moment),
      // not at the last snapshot — days without bar coverage hold the last close.
      asOf?.iso ?? new Date().toISOString(),
    ),
    manual_holdings: manualHoldingsJson,
    imported_holdings: importedHoldingsJson,
    import_snapshot: importSnapshot,
    concentration: {
      hhi,
      top_position_pct: topHolding?.weight_pct ?? 0,
      top_symbol: topHolding?.symbol ?? null,
    },
    chart_assets: getPriceChartAssets(visiblePriceBars),
    provenance: {
      label: portfolioBrainSnapshot || hasImported ? "Imported portfolio" : hasManual ? "Manual portfolio" : "Demo data",
      source: portfolioBrainSnapshot
        ? "Monarch MCP portfolio brain snapshot plus local manual holdings"
        : hasImported
          ? "Imported holdings snapshots plus local manual entries"
          : hasManual
          ? "Local manual holdings"
          : "Seeded sample holdings, accounts, assets, and prices",
      as_of: provenanceAsOf,
      replay_as_of: asOf?.iso ?? null,
    },
  };
}

function buildImportSnapshot(rows: ImportedHoldingRow[], portfolioBrainSnapshot: PortfolioBrainSnapshot | null = null): PortfolioJson["import_snapshot"] {
  const staleAfterHours = 24;
  const latestImportEvent = latestPortfolioImportEvent();
  const importEventMetadata = latestImportEvent?.metadata && typeof latestImportEvent.metadata === "object"
    ? (latestImportEvent.metadata as {
        skipped_count?: unknown;
        issues?: unknown;
      })
    : {};
  const issues = normalizeImportIssues(importEventMetadata.issues);
  const skippedCount = typeof importEventMetadata.skipped_count === "number" && Number.isFinite(importEventMetadata.skipped_count)
    ? Math.max(0, Math.round(importEventMetadata.skipped_count))
    : issues.length;

  if (portfolioBrainSnapshot) {
    const ageHours = (Date.now() - Date.parse(portfolioBrainSnapshot.synced_at)) / 3_600_000;
    const isStale = ageHours >= staleAfterHours;
    const isAging = ageHours >= 6 && !isStale;
    const status = isStale ? "Stale snapshot" : isAging ? "Aging snapshot" : "Fresh snapshot";
    return {
      count: portfolioBrainSnapshot.holdings.length,
      skipped_count: portfolioBrainSnapshot.skipped_rows.length,
      issue_count: portfolioBrainSnapshot.skipped_rows.length,
      issues: portfolioBrainSnapshot.skipped_rows.map((row) => ({
        symbol: row.label,
        name: row.source,
        reason: row.reason,
      })),
      status,
      last_imported_at: portfolioBrainSnapshot.synced_at,
      last_checked_at: portfolioBrainSnapshot.synced_at,
      oldest_imported_at: portfolioBrainSnapshot.synced_at,
      latest_as_of: portfolioBrainSnapshot.as_of,
      stale_after_hours: staleAfterHours,
      is_stale: isStale,
      note: isStale
        ? "Monarch MCP holdings are older than a day. Sync Monarch again before relying on them."
        : portfolioBrainSnapshot.skipped_rows.length > 0
          ? "Monarch MCP holdings are saved in the portfolio brain, but some rows were skipped because required fields were missing."
          : "Monarch MCP holdings are saved in the portfolio brain. They reflect the last manual sync, not live account streaming.",
    };
  }

  if (rows.length === 0) {
    return {
      count: 0,
      skipped_count: skippedCount,
      issue_count: issues.length,
      issues,
      status: "No imported holdings",
      last_imported_at: null,
      last_checked_at: latestImportEvent?.created_at ?? null,
      oldest_imported_at: null,
      latest_as_of: null,
      stale_after_hours: staleAfterHours,
      is_stale: false,
      note: issues.length > 0
        ? "No account holdings were imported because the latest snapshot had missing prices or amounts."
        : "No account holdings have been imported. Manual entries and sample data may still be visible.",
    };
  }

  const importedTimes = rows
    .map((row) => row.imported_at)
    .filter((value) => !Number.isNaN(Date.parse(value)))
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  const asOfTimes = rows
    .map((row) => row.as_of)
    .filter((value) => !Number.isNaN(Date.parse(value)))
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  const oldestImportedAt = importedTimes[0] ?? null;
  const lastImportedAt = importedTimes[importedTimes.length - 1] ?? null;
  const latestAsOf = asOfTimes[asOfTimes.length - 1] ?? lastImportedAt;
  const ageHours = lastImportedAt ? (Date.now() - Date.parse(lastImportedAt)) / 3_600_000 : 0;
  const isStale = ageHours >= staleAfterHours;
  const isAging = ageHours >= 6 && !isStale;
  const status = isStale ? "Stale snapshot" : isAging ? "Aging snapshot" : "Fresh snapshot";

  return {
    count: rows.length,
    skipped_count: skippedCount,
    issue_count: issues.length,
    issues,
    status,
    last_imported_at: lastImportedAt,
    last_checked_at: latestImportEvent?.created_at ?? lastImportedAt,
    oldest_imported_at: oldestImportedAt,
    latest_as_of: latestAsOf,
    stale_after_hours: staleAfterHours,
    is_stale: isStale,
    note: isStale
      ? "Imported holdings are older than a day. Use Settings import again before relying on them."
      : issues.length > 0
        ? "Imported holdings are read-only snapshots. Some account entries were skipped because price or amount was missing."
        : "Imported holdings are read-only snapshots. They do not refresh automatically.",
  };
}

function latestPortfolioImportEvent() {
  return store()
    .productEvents(100)
    .find((event) => event.event === "portfolio_import");
}

function normalizeImportIssues(value: unknown): PortfolioImportIssue[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const raw = item as Record<string, unknown>;
      const symbol = typeof raw.symbol === "string" && raw.symbol.trim() ? raw.symbol.trim().slice(0, 12) : "Unknown";
      const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, 80) : symbol;
      const reason = typeof raw.reason === "string" && raw.reason.trim()
        ? raw.reason.trim().slice(0, 160)
        : "Missing price or amount.";
      return { symbol, name, reason };
    })
    .filter((item): item is PortfolioImportIssue => item !== null)
    .slice(0, 6);
}

export function addManualHolding(input: ManualHoldingInput): PortfolioHoldingJson {
  const now = new Date().toISOString();
  const row: ManualHoldingRow = {
    id: `manual_${slug(input.symbol)}_${Date.now().toString(36)}`,
    symbol: normalizeSymbol(input.symbol),
    asset_name: input.asset_name.trim() || normalizeSymbol(input.symbol),
    asset_class: input.asset_class,
    venue: input.venue.trim() || "Manual",
    quantity: roundQuantity(input.quantity),
    price: roundMoney(input.price),
    cost_basis: roundMoney(input.cost_basis ?? input.quantity * input.price),
    daily_change_pct: roundPct(input.daily_change_pct ?? 0),
    created_at: now,
    updated_at: now,
  };
  store().upsertManualHolding(row);
  invalidatePortfolioCache();
  return manualRowToHolding(row);
}

export function deleteManualHolding(id: string): boolean {
  const exists = store().manualHoldings().some((row) => row.id === id);
  if (!exists) return false;
  store().deleteManualHolding(id);
  invalidatePortfolioCache();
  return true;
}

export function replaceImportedHoldings(
  service: ImportedHoldingRow["service"],
  rows: ImportedHoldingRow[],
): PortfolioJson {
  store().replaceImportedHoldings(service, rows);
  invalidatePortfolioCache();
  return getPortfolio();
}

function invalidatePortfolioCache() {
  portfolioCache.clear();
}

function portfolioCacheKey(asOf: AsOfFilter | null) {
  return asOf?.iso ?? "live";
}

function isTestRuntime() {
  return process.env.NODE_ENV === "test" || process.env.npm_lifecycle_event === "test";
}

function getPriceChartAssets(priceBars: PriceBar[]): PriceChartAssetJson[] {
  return demoDatabase.assets
    .map((asset) => {
      const bars = priceBars
        .filter((bar) => bar.asset_id === asset.id)
        .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
        .map(({ ts, open, high, low, close, volume, knowledge_time }) => ({
          ts,
          open,
          high,
          low,
          close,
          volume,
          knowledge_time,
        }));

      if (bars.length === 0) {
        return null;
      }

      return {
        asset: {
          id: asset.id,
          symbol: asset.symbol,
          name: asset.name,
          asset_class: asset.asset_class,
          venue: asset.venue,
        },
        bars,
      } satisfies PriceChartAssetJson;
    })
    .filter((item): item is PriceChartAssetJson => item !== null)
    .sort((a, b) => a.asset.symbol.localeCompare(b.asset.symbol));
}

function manualRowToHolding(row: ManualHoldingRow): PortfolioHoldingJson {
  const marketValue = roundMoney(row.quantity * row.price);
  return {
    id: row.id,
    symbol: row.symbol,
    asset_name: row.asset_name,
    asset_class: row.asset_class,
    venue: row.venue,
    quantity: row.quantity,
    cost_basis: row.cost_basis,
    market_value: marketValue,
    daily_change_pct: row.daily_change_pct,
    daily_change_value: roundMoney(marketValue * (row.daily_change_pct / 100)),
    weight_pct: 0,
    as_of: row.updated_at,
    source: "manual",
    account: {
      id: "acct_manual",
      kind: "manual",
      label: "Manual entry",
      integration_status: "manual",
      scope: "read_only",
    },
  };
}

function importedRowToHolding(row: ImportedHoldingRow): PortfolioHoldingJson {
  const marketValue = roundMoney(row.quantity * row.price);
  return {
    id: row.id,
    symbol: row.symbol,
    asset_name: row.asset_name,
    asset_class: row.asset_class,
    venue: row.venue,
    quantity: row.quantity,
    cost_basis: row.cost_basis,
    market_value: marketValue,
    daily_change_pct: row.daily_change_pct,
    daily_change_value: roundMoney(marketValue * (row.daily_change_pct / 100)),
    weight_pct: 0,
    as_of: row.as_of,
    source: "connected",
    account: {
      id: row.account_id,
      kind:
        row.service === "coinbase"
          ? "coinbase"
          : row.service === "robinhood"
            ? "robinhood"
            : "onchain_wallet",
      label: row.account_label,
      integration_status: "connected",
      scope: "read_only",
    },
  };
}

function displayAccountLabel(kind: PortfolioHoldingJson["account"]["kind"], label: string) {
  if (kind === "coinbase") return "Coinbase";
  if (kind === "robinhood") return "Robinhood";
  if (kind === "onchain_wallet") return "Wallet";
  return label.replace(/\s+demo\b/gi, "").trim() || "Manual entry";
}

function dailyChangePctForAsset(assetId: string, priceBars: PriceBar[]) {
  const bars = priceBars
    .filter((bar) => bar.asset_id === assetId)
    .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));

  if (bars.length < 2) return 0;
  const [latest, previous] = bars;
  if (!previous.close) return 0;
  return roundPct(((latest.close - previous.close) / previous.close) * 100);
}

/**
 * Net worth over the trailing window (7 days for demo bars, up to 90 saved
 * daily closes for real portfolios), valued from actual price-bar history:
 * each day's point reprices every holding at its last known close on or before
 * that day (holdings without bar coverage hold their snapshot value). The
 * final point is anchored to the live total. With no bar history the line is
 * honestly flat — it grows as daily scans accumulate real closes.
 */
function buildNetWorthSeries(
  holdings: PortfolioHoldingJson[],
  priceBars: PriceBar[],
  total: number,
  asOf: string,
): NetWorthPointJson[] {
  const end = new Date(asOf);
  if (Number.isNaN(end.getTime())) return [];

  // Real portfolios must never be priced against demo bars — that fabricates
  // history (and fake weekly losses). Their series comes from the closes each
  // saved daily report recorded, so it grows one honest point per report day.
  if (holdings.some((holding) => holding.source !== "demo")) {
    return buildReportBackedSeries(holdings, total, asOf);
  }

  const assetIdBySymbol = new Map(demoDatabase.assets.map((asset) => [asset.symbol, asset.id]));
  const barsByAsset = new Map<string, PriceBar[]>();
  for (const bar of [...priceBars].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))) {
    const list = barsByAsset.get(bar.asset_id) ?? [];
    list.push(bar);
    barsByAsset.set(bar.asset_id, list);
  }

  return Array.from({ length: 7 }, (_, index) => {
    const daysBack = 6 - index;
    const day = new Date(end);
    day.setUTCDate(end.getUTCDate() - daysBack);
    day.setUTCHours(23, 59, 59, 999);

    if (daysBack === 0) {
      return { date: day.toISOString().slice(0, 10), value: roundMoney(total) };
    }

    const value = holdings.reduce((sum, holding) => {
      const assetId = assetIdBySymbol.get(holding.symbol);
      const bars = assetId ? barsByAsset.get(assetId) : undefined;
      const bar = bars ? lastBarAtOrBefore(bars, day.getTime()) : null;
      return sum + (bar ? holding.quantity * bar.close : holding.market_value);
    }, 0);

    return { date: day.toISOString().slice(0, 10), value: Math.max(roundMoney(value), 0) };
  });
}

function buildReportBackedSeries(
  holdings: PortfolioHoldingJson[],
  total: number,
  asOf: string,
): NetWorthPointJson[] {
  const todayDate = asOf.slice(0, 10);
  const closesByDate = new Map<string, Map<string, number>>();

  // Read enough report rows to cover the chart's 90-day window even when a
  // day saved more than one report (manual refresh on top of the auto read).
  for (const row of store().dailyReports(180)) {
    const data = row.data as {
      run_date?: string;
      market_rows?: Array<{ symbol?: string; latest_close?: number | null }>;
    } | null;
    const runDate = data?.run_date ?? row.run_date;
    if (!runDate || runDate >= todayDate || !Array.isArray(data?.market_rows)) continue;
    const closes = closesByDate.get(runDate) ?? new Map<string, number>();
    for (const marketRow of data.market_rows) {
      if (marketRow.symbol && typeof marketRow.latest_close === "number" && marketRow.latest_close > 0) {
        closes.set(marketRow.symbol.toUpperCase(), marketRow.latest_close);
      }
    }
    if (closes.size > 0) closesByDate.set(runDate, closes);
  }

  const points = [...closesByDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    // 89 saved closes + today's live anchor = a 90-point trailing window.
    .slice(-89)
    .map(([date, closes]) => ({
      date,
      // Symbols without a saved close (dust, cash) hold at today's value; the
      // series still reflects the real moves of everything the reports priced.
      value: roundMoney(
        holdings.reduce((sum, holding) => {
          const close = closes.get(holding.symbol.toUpperCase());
          return sum + (close !== undefined ? holding.quantity * close : holding.market_value);
        }, 0),
      ),
    }));

  points.push({ date: todayDate, value: roundMoney(total) });
  return points;
}

function lastBarAtOrBefore(bars: PriceBar[], ts: number): PriceBar | null {
  let found: PriceBar | null = null;
  for (const bar of bars) {
    if (Date.parse(bar.ts) <= ts) found = bar;
    else break;
  }
  return found;
}

function normalizeSymbol(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "").slice(0, 12);
}

function slug(value: string) {
  return normalizeSymbol(value).toLowerCase().replace(/[^a-z0-9]+/g, "_") || "holding";
}

function roundQuantity(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function roundPct(value: number) {
  return Math.round(value * 10) / 10;
}
