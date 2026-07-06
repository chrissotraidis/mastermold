import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { AssetClass, PortfolioHoldingJson } from "./portfolio";
import { demoDatabase } from "./seed-data";
import { store, type ImportedHoldingRow, type ManualHoldingRow, type PortfolioBrainSnapshotRow } from "./store";

export type PortfolioBrainSource = "monarch_mcp";
export type PortfolioBrainScanSourceLabel = "Monarch MCP" | "Manual holdings" | "Imported holdings" | "Sample fallback";

export type PortfolioBrainAccount = {
  id: string;
  source_account_id: string;
  name: string;
  institution: string;
  account_type: string;
  balance: number;
  currency: string;
  updated_at: string;
};

export type PortfolioBrainHolding = {
  id: string;
  account_id: string;
  source_holding_id: string;
  symbol: string;
  asset_name: string;
  asset_class: AssetClass;
  venue: string;
  quantity: number;
  price: number;
  cost_basis: number;
  market_value: number;
  daily_change_pct: number;
  as_of: string;
};

export type PortfolioBrainSkippedRow = {
  source: "account" | "holding";
  label: string;
  reason: string;
};

export type PortfolioBrainFact = {
  id: string;
  label: string;
  value: string;
  detail: string;
};

export type PortfolioBrainSnapshot = {
  id: string;
  source: PortfolioBrainSource;
  source_label: "Monarch MCP";
  status: "ready" | "partial";
  synced_at: string;
  as_of: string;
  accounts: PortfolioBrainAccount[];
  holdings: PortfolioBrainHolding[];
  total_value: number;
  skipped_rows: PortfolioBrainSkippedRow[];
  source_hash: string;
  facts: PortfolioBrainFact[];
  receipt: {
    message: string;
    accounts_count: number;
    holdings_count: number;
    skipped_count: number;
  };
};

export type PortfolioBrainState = {
  source: PortfolioBrainSource;
  source_label: "Monarch MCP";
  status: "not_synced" | "ready" | "partial";
  latest_snapshot: PortfolioBrainSnapshot | null;
  freshness: {
    label: string;
    is_stale: boolean;
    stale_after_hours: number;
  };
  summary: {
    headline: string;
    detail: string;
    accounts_count: number;
    holdings_count: number;
    total_value: number;
  };
  change_summary: PortfolioBrainChangeSummary;
};

export type PortfolioBrainScanContext = {
  source_label: PortfolioBrainScanSourceLabel;
  status: "not_synced" | "fresh" | "stale" | "partial" | "manual" | "imported" | "sample";
  data_boundary: string;
  synced_at: string | null;
  as_of: string | null;
  accounts_count: number;
  holdings_count: number;
  total_value: number;
  top_symbols: string[];
  change_summary: Pick<PortfolioBrainChangeSummary, "status" | "detail" | "top_changes">;
  suggestion_classes: Array<"Review" | "Watch" | "Trim candidate" | "Add candidate" | "Paper test first">;
};

export type PortfolioBrainChangeSummary = {
  status: "no_snapshot" | "no_previous" | "unchanged" | "changed";
  label: string;
  detail: string;
  latest_synced_at: string | null;
  previous_synced_at: string | null;
  total_value_delta: number;
  total_value_delta_pct: number | null;
  added_symbols: string[];
  removed_symbols: string[];
  increased_symbols: string[];
  decreased_symbols: string[];
  top_changes: Array<{
    symbol: string;
    direction: "added" | "removed" | "increased" | "decreased";
    value_delta: number;
    detail: string;
  }>;
};

export type MonarchRawPayload = {
  accounts?: unknown;
  holdings?: unknown;
  balances?: unknown;
  as_of?: unknown;
  updated_at?: unknown;
  synced_at?: unknown;
};

const STALE_AFTER_HOURS = 24;

export function getPortfolioBrainState(now = new Date()): PortfolioBrainState {
  const latest = getLatestPortfolioBrainSnapshot();
  if (!latest) {
    return {
      source: "monarch_mcp",
      source_label: "Monarch MCP",
      status: "not_synced",
      latest_snapshot: null,
      freshness: {
        label: "No Monarch sync yet",
        is_stale: false,
        stale_after_hours: STALE_AFTER_HOURS,
      },
      summary: {
        headline: "No Monarch portfolio brain yet",
        detail: "Connect the Monarch MCP server, then run Sync now to create the first real portfolio snapshot.",
        accounts_count: 0,
        holdings_count: 0,
        total_value: 0,
      },
      change_summary: emptyChangeSummary("no_snapshot"),
    };
  }

  const freshness = describeSnapshotFreshness(latest.synced_at, now);
  const changeSummary = getPortfolioBrainChangeSummary();
  return {
    source: "monarch_mcp",
    source_label: "Monarch MCP",
    status: latest.status,
    latest_snapshot: latest,
    freshness,
    summary: {
      headline: `${latest.holdings.length} Monarch holding${latest.holdings.length === 1 ? "" : "s"} saved`,
      detail: `Using a Monarch MCP snapshot from ${formatSnapshotTime(latest.synced_at)} across ${latest.accounts.length} account${latest.accounts.length === 1 ? "" : "s"}.`,
      accounts_count: latest.accounts.length,
      holdings_count: latest.holdings.length,
      total_value: latest.total_value,
    },
    change_summary: changeSummary,
  };
}

export function getLatestPortfolioBrainSnapshot(): PortfolioBrainSnapshot | null {
  const row = store().portfolioBrainSnapshots(1)[0] ?? null;
  return row ? normalizeSnapshotRow(row) : null;
}

export function getPortfolioBrainSnapshotHistory(limit = 20): PortfolioBrainSnapshot[] {
  return store()
    .portfolioBrainSnapshots(limit)
    .map(normalizeSnapshotRow)
    .filter((snapshot): snapshot is PortfolioBrainSnapshot => snapshot !== null);
}

export function getPortfolioBrainChangeSummary(): PortfolioBrainChangeSummary {
  const [latest, previous] = getPortfolioBrainSnapshotHistory(2);
  if (!latest) return emptyChangeSummary("no_snapshot");
  if (!previous) {
    return {
      ...emptyChangeSummary("no_previous"),
      latest_synced_at: latest.synced_at,
      label: "First Monarch snapshot",
      detail: "No previous Monarch snapshot is saved yet. Changes will appear after the next sync.",
    };
  }

  const latestBySymbol = holdingsBySymbol(latest);
  const previousBySymbol = holdingsBySymbol(previous);
  const symbols = [...new Set([...latestBySymbol.keys(), ...previousBySymbol.keys()])].sort();
  const changes: PortfolioBrainChangeSummary["top_changes"] = [];
  const added: string[] = [];
  const removed: string[] = [];
  const increased: string[] = [];
  const decreased: string[] = [];

  for (const symbol of symbols) {
    const latestValue = latestBySymbol.get(symbol) ?? 0;
    const previousValue = previousBySymbol.get(symbol) ?? 0;
    const delta = roundMoney(latestValue - previousValue);
    if (Math.abs(delta) < 0.01) continue;

    if (previousValue === 0 && latestValue > 0) {
      added.push(symbol);
      changes.push({
        symbol,
        direction: "added",
        value_delta: delta,
        detail: `${symbol} was added at ${formatCurrency(latestValue)}.`,
      });
    } else if (latestValue === 0 && previousValue > 0) {
      removed.push(symbol);
      changes.push({
        symbol,
        direction: "removed",
        value_delta: delta,
        detail: `${symbol} was removed from the saved snapshot.`,
      });
    } else if (delta > 0) {
      increased.push(symbol);
      changes.push({
        symbol,
        direction: "increased",
        value_delta: delta,
        detail: `${symbol} increased by ${formatCurrency(delta)}.`,
      });
    } else {
      decreased.push(symbol);
      changes.push({
        symbol,
        direction: "decreased",
        value_delta: delta,
        detail: `${symbol} decreased by ${formatCurrency(Math.abs(delta))}.`,
      });
    }
  }

  const totalValueDelta = roundMoney(latest.total_value - previous.total_value);
  const totalValueDeltaPct = previous.total_value > 0 ? roundPct((totalValueDelta / previous.total_value) * 100) : null;
  const topChanges = changes
    .sort((a, b) => Math.abs(b.value_delta) - Math.abs(a.value_delta) || a.symbol.localeCompare(b.symbol))
    .slice(0, 6);
  const status = topChanges.length > 0 || Math.abs(totalValueDelta) >= 0.01 ? "changed" : "unchanged";

  return {
    status,
    label: status === "changed" ? "Changed since last sync" : "No value changes since last sync",
    detail: changeSummaryDetail(status, totalValueDelta, totalValueDeltaPct, topChanges),
    latest_synced_at: latest.synced_at,
    previous_synced_at: previous.synced_at,
    total_value_delta: totalValueDelta,
    total_value_delta_pct: totalValueDeltaPct,
    added_symbols: added,
    removed_symbols: removed,
    increased_symbols: increased,
    decreased_symbols: decreased,
    top_changes: topChanges,
  };
}

export function getPortfolioBrainScanContext(now = new Date()): PortfolioBrainScanContext {
  const snapshot = getLatestPortfolioBrainSnapshot();
  if (!snapshot) {
    const changeSummary = emptyChangeSummary("no_snapshot");
    const fallback = buildFallbackScanContext(now);
    return {
      ...fallback,
      change_summary: {
        status: changeSummary.status,
        detail: changeSummary.detail,
        top_changes: changeSummary.top_changes,
      },
      suggestion_classes: ["Review", "Watch", "Paper test first"],
    };
  }

  const freshness = describeSnapshotFreshness(snapshot.synced_at, now);
  const changeSummary = getPortfolioBrainChangeSummary();
  return {
    source_label: "Monarch MCP",
    status: freshness.is_stale ? "stale" : snapshot.status === "partial" ? "partial" : "fresh",
    data_boundary: freshness.is_stale
      ? "Daily scan can read the saved Monarch snapshot, but it is stale; recommendations must ask the user to sync again before relying on balances."
      : "Daily scan can read the saved Monarch snapshot as read-only portfolio context. It cannot place brokerage trades or move funds.",
    synced_at: snapshot.synced_at,
    as_of: snapshot.as_of,
    accounts_count: snapshot.accounts.length,
    holdings_count: snapshot.holdings.length,
    total_value: snapshot.total_value,
    top_symbols: [...snapshot.holdings]
      .sort((a, b) => b.market_value - a.market_value)
      .slice(0, 8)
      .map((holding) => holding.symbol),
    change_summary: {
      status: changeSummary.status,
      detail: changeSummary.detail,
      top_changes: changeSummary.top_changes,
    },
    suggestion_classes: ["Review", "Watch", "Trim candidate", "Add candidate", "Paper test first"],
  };
}

function buildFallbackScanContext(now: Date): Omit<PortfolioBrainScanContext, "change_summary" | "suggestion_classes"> {
  const importedRows = store().importedHoldings();
  if (importedRows.length > 0) {
    const latestAsOf = latestString(importedRows.flatMap((row) => [row.as_of, row.imported_at]));
    const stale = latestAsOf ? isOlderThanHours(latestAsOf, now, STALE_AFTER_HOURS) : true;
    return {
      source_label: "Imported holdings",
      status: stale ? "stale" : "imported",
      data_boundary: stale
        ? "Daily scan can read imported holdings snapshots, but the latest imported snapshot is stale; import or sync again before relying on balances. It cannot place brokerage trades, sign transactions, or move funds."
        : "Daily scan can read imported holdings snapshots as read-only portfolio context. It cannot place brokerage trades, sign transactions, or move funds.",
      synced_at: latestString(importedRows.map((row) => row.imported_at)),
      as_of: latestAsOf,
      accounts_count: new Set(importedRows.map((row) => row.account_id)).size,
      holdings_count: importedRows.length,
      total_value: roundMoney(importedRows.reduce((sum, row) => sum + holdingRowValue(row), 0)),
      top_symbols: topSymbolsFromValueRows(importedRows.map((row) => ({ symbol: row.symbol, value: holdingRowValue(row) }))),
    };
  }

  const manualRows = store().manualHoldings();
  if (manualRows.length > 0) {
    const latestUpdatedAt = latestString(manualRows.map((row) => row.updated_at));
    return {
      source_label: "Manual holdings",
      status: "manual",
      data_boundary: "Daily scan can read local manual holdings as user-entered portfolio context. Manual rows are not broker-connected, cannot refresh themselves, and cannot place brokerage trades, sign transactions, or move funds.",
      synced_at: null,
      as_of: latestUpdatedAt,
      accounts_count: 1,
      holdings_count: manualRows.length,
      total_value: roundMoney(manualRows.reduce((sum, row) => sum + holdingRowValue(row), 0)),
      top_symbols: topSymbolsFromValueRows(manualRows.map((row) => ({ symbol: row.symbol, value: holdingRowValue(row) }))),
    };
  }

  const sampleRows = demoDatabase.holdings.map((holding) => {
    const asset = demoDatabase.assets.find((item) => item.id === holding.asset_id);
    return {
      symbol: asset?.symbol ?? holding.asset_id,
      value: holding.market_value,
      account_id: holding.account_id,
      as_of: holding.as_of,
    };
  });
  return {
    source_label: "Sample fallback",
    status: "sample",
    data_boundary: "No Monarch snapshot, imported snapshot, or manual holding is saved. Daily scans can only compare against sample fallback holdings until Settings adds a read-only or manual source. It cannot place brokerage trades, sign transactions, or move funds.",
    synced_at: null,
    as_of: latestString(sampleRows.map((row) => row.as_of)),
    accounts_count: new Set(sampleRows.map((row) => row.account_id)).size,
    holdings_count: sampleRows.length,
    total_value: roundMoney(sampleRows.reduce((sum, row) => sum + row.value, 0)),
    top_symbols: topSymbolsFromValueRows(sampleRows),
  };
}

export function saveMonarchPortfolioSnapshot(payload: MonarchRawPayload): PortfolioBrainSnapshot {
  const syncedAt = asIsoString(payload.synced_at) ?? new Date().toISOString();
  const asOf = asIsoString(payload.as_of) ?? asIsoString(payload.updated_at) ?? syncedAt;
  const normalized = normalizeMonarchPayload(payload, syncedAt, asOf);
  const snapshot: PortfolioBrainSnapshot = {
    id: `monarch_${Date.parse(syncedAt) || Date.now()}_${normalized.source_hash.slice(0, 8)}`,
    source: "monarch_mcp",
    source_label: "Monarch MCP",
    status: normalized.skipped_rows.length > 0 ? "partial" : "ready",
    synced_at: syncedAt,
    as_of: asOf,
    accounts: normalized.accounts,
    holdings: normalized.holdings,
    total_value: roundMoney(normalized.holdings.reduce((sum, holding) => sum + holding.market_value, 0)),
    skipped_rows: normalized.skipped_rows,
    source_hash: normalized.source_hash,
    facts: [],
    receipt: {
      message: "",
      accounts_count: normalized.accounts.length,
      holdings_count: normalized.holdings.length,
      skipped_count: normalized.skipped_rows.length,
    },
  };
  snapshot.facts = buildPortfolioBrainFacts(snapshot);
  snapshot.receipt.message = `Saved ${snapshot.holdings.length} Monarch holding${snapshot.holdings.length === 1 ? "" : "s"} from ${snapshot.accounts.length} account${snapshot.accounts.length === 1 ? "" : "s"}.`;
  store().upsertPortfolioBrainSnapshot({
    id: snapshot.id,
    source: "monarch_mcp",
    synced_at: snapshot.synced_at,
    as_of: snapshot.as_of,
    data: snapshot,
  });
  return snapshot;
}

export function loadMonarchFixtureSnapshot(path: string): MonarchRawPayload {
  return JSON.parse(readFileSync(path, "utf8")) as MonarchRawPayload;
}

export function portfolioBrainHoldingsForPortfolio(snapshot: PortfolioBrainSnapshot): PortfolioHoldingJson[] {
  const total = Math.max(0, snapshot.total_value);
  return snapshot.holdings
    .map((holding) => {
      const account = snapshot.accounts.find((item) => item.id === holding.account_id);
      const marketValue = roundMoney(holding.market_value);
      const dailyChangeValue = roundMoney(marketValue * (holding.daily_change_pct / 100));
      return {
        id: holding.id,
        symbol: holding.symbol,
        asset_name: holding.asset_name,
        asset_class: holding.asset_class,
        venue: holding.venue,
        quantity: holding.quantity,
        cost_basis: holding.cost_basis,
        market_value: marketValue,
        daily_change_pct: holding.daily_change_pct,
        daily_change_value: dailyChangeValue,
        weight_pct: total > 0 ? roundPct((marketValue / total) * 100) : 0,
        as_of: holding.as_of,
        source: "connected",
        account: {
          id: account?.id ?? holding.account_id,
          kind: accountKind(account),
          label: account ? `${account.institution} ${account.name}`.trim() : "Monarch account",
          integration_status: "connected",
          scope: "read_only",
        },
      } satisfies PortfolioHoldingJson;
    })
    .sort((a, b) => b.market_value - a.market_value || a.symbol.localeCompare(b.symbol));
}

export function describePortfolioBrainForChat(snapshot: PortfolioBrainSnapshot | null) {
  if (!snapshot) {
    return {
      status: "No Monarch snapshot is saved.",
      change_summary: emptyChangeSummary("no_snapshot"),
      holdings: [] as Array<{ symbol: string; value: number; weight: number; account: string }>,
    };
  }
  const holdings = portfolioBrainHoldingsForPortfolio(snapshot).slice(0, 12).map((holding) => ({
    symbol: holding.symbol,
    value: holding.market_value,
    weight: holding.weight_pct,
    account: holding.account.label,
  }));
  return {
    status: `Using Monarch MCP snapshot from ${formatSnapshotTime(snapshot.synced_at)}. Account data as of ${formatSnapshotTime(snapshot.as_of)}.`,
    change_summary: getPortfolioBrainChangeSummary(),
    holdings,
  };
}

function normalizeSnapshotRow(row: PortfolioBrainSnapshotRow): PortfolioBrainSnapshot | null {
  if (!row.data || typeof row.data !== "object") return null;
  const snapshot = row.data as PortfolioBrainSnapshot;
  if (snapshot.source !== "monarch_mcp" || !Array.isArray(snapshot.accounts) || !Array.isArray(snapshot.holdings)) {
    return null;
  }
  return {
    ...snapshot,
    facts: Array.isArray(snapshot.facts) ? snapshot.facts : buildPortfolioBrainFacts(snapshot),
  };
}

function normalizeMonarchPayload(payload: MonarchRawPayload, syncedAt: string, asOf: string) {
  const rawAccounts = firstArray(payload.accounts, payload.balances);
  const accounts: PortfolioBrainAccount[] = [];
  const skippedRows: PortfolioBrainSkippedRow[] = [];

  for (const [index, raw] of rawAccounts.entries()) {
    const object = objectRecord(raw);
    if (!object) {
      skippedRows.push({ source: "account", label: `Account ${index + 1}`, reason: "Account row was not an object." });
      continue;
    }
    const sourceId = stringField(object, ["id", "account_id", "source_account_id", "guid"]) ?? `account-${index + 1}`;
    const name = stringField(object, ["name", "display_name", "account_name", "label"]) ?? `Account ${index + 1}`;
    const institution = stringField(object, ["institution", "institution_name", "provider", "source"]) ?? "Monarch";
    accounts.push({
      id: `monarch_account_${stableId(sourceId)}`,
      source_account_id: sourceId,
      name,
      institution,
      account_type: stringField(object, ["type", "account_type", "subtype"]) ?? "investment",
      balance: numberField(object, ["balance", "current_balance", "value", "market_value"]) ?? 0,
      currency: stringField(object, ["currency", "currency_code"]) ?? "USD",
      updated_at: asIsoString(object.updated_at) ?? asIsoString(object.as_of) ?? asOf,
    });
  }

  const rawHoldings = firstArray(payload.holdings);
  const holdings: PortfolioBrainHolding[] = [];
  for (const [index, raw] of rawHoldings.entries()) {
    const object = objectRecord(raw);
    if (!object) {
      skippedRows.push({ source: "holding", label: `Holding ${index + 1}`, reason: "Holding row was not an object." });
      continue;
    }
    const symbol = stringField(object, ["symbol", "ticker", "security_ticker", "currency", "asset_symbol"])?.toUpperCase();
    const quantity = numberField(object, ["quantity", "amount", "units", "shares", "balance"]);
    const marketValue = numberField(object, ["market_value", "value", "current_value", "balance_usd", "usd_value"]);
    if (!symbol) {
      skippedRows.push({ source: "holding", label: stringField(object, ["name", "security_name"]) ?? `Holding ${index + 1}`, reason: "Missing symbol." });
      continue;
    }
    if (quantity === null || marketValue === null) {
      skippedRows.push({ source: "holding", label: symbol, reason: "Missing quantity or market value." });
      continue;
    }
    const sourceAccountId = stringField(object, ["account_id", "accountId", "source_account_id"]);
    const account =
      accounts.find((item) => item.source_account_id === sourceAccountId || item.id === sourceAccountId) ??
      accounts.find((item) => item.name === stringField(object, ["account_name", "account"])) ??
      accounts[0] ??
      null;
    const sourceHoldingId = stringField(object, ["id", "holding_id", "security_id"]) ?? `${sourceAccountId ?? "account"}-${symbol}`;
    const price = numberField(object, ["price", "current_price", "market_price"]) ?? (quantity !== 0 ? marketValue / quantity : marketValue);
    holdings.push({
      id: `monarch_holding_${stableId(`${account?.id ?? "unknown"}-${sourceHoldingId}-${symbol}`)}`,
      account_id: account?.id ?? "monarch_account_unknown",
      source_holding_id: sourceHoldingId,
      symbol,
      asset_name: stringField(object, ["name", "security_name", "asset_name", "description"]) ?? symbol,
      asset_class: normalizeAssetClass(stringField(object, ["asset_class", "type", "security_type", "kind"]), symbol),
      venue: stringField(object, ["venue", "exchange", "institution"]) ?? account?.institution ?? "Monarch",
      quantity,
      price: roundMoney(price),
      cost_basis: numberField(object, ["cost_basis", "basis", "total_cost"]) ?? roundMoney(quantity * price),
      market_value: roundMoney(marketValue),
      daily_change_pct: numberField(object, ["daily_change_pct", "day_change_pct", "change_percent"]) ?? 0,
      as_of: asIsoString(object.as_of) ?? asIsoString(object.updated_at) ?? asOf,
    });
  }

  return {
    accounts,
    holdings,
    skipped_rows: skippedRows,
    source_hash: stableHash({ accounts: rawAccounts, holdings: rawHoldings, syncedAt }),
  };
}

function buildPortfolioBrainFacts(snapshot: PortfolioBrainSnapshot): PortfolioBrainFact[] {
  const facts: PortfolioBrainFact[] = [];
  const holdings = [...snapshot.holdings].sort((a, b) => b.market_value - a.market_value);
  const total = Math.max(snapshot.total_value, 1);
  const top = holdings[0] ?? null;
  if (top) {
    const weight = roundPct((top.market_value / total) * 100);
    facts.push({
      id: "largest-holding",
      label: "Largest holding",
      value: `${top.symbol} ${weight.toFixed(1)}%`,
      detail: `${top.symbol} is the largest Monarch-synced position at ${formatCurrency(top.market_value)}.`,
    });
  }

  const cashValue = holdings.filter((holding) => holding.asset_class === "cash").reduce((sum, holding) => sum + holding.market_value, 0);
  facts.push({
    id: "cash-weight",
    label: "Cash weight",
    value: `${roundPct((cashValue / total) * 100).toFixed(1)}%`,
    detail: `${formatCurrency(cashValue)} is visible as cash or cash-like balance in the Monarch snapshot.`,
  });

  const cryptoValue = holdings.filter((holding) => holding.asset_class === "crypto" || holding.asset_class === "defi").reduce((sum, holding) => sum + holding.market_value, 0);
  facts.push({
    id: "crypto-exposure",
    label: "Crypto exposure",
    value: `${roundPct((cryptoValue / total) * 100).toFixed(1)}%`,
    detail: `${formatCurrency(cryptoValue)} is crypto or on-chain exposure from the Monarch snapshot.`,
  });

  const topThreeValue = holdings.slice(0, 3).reduce((sum, holding) => sum + holding.market_value, 0);
  facts.push({
    id: "top-three-concentration",
    label: "Top 3 concentration",
    value: `${roundPct((topThreeValue / total) * 100).toFixed(1)}%`,
    detail: "Use this before deciding whether a daily idea is really a concentration decision.",
  });

  return facts;
}

function holdingsBySymbol(snapshot: PortfolioBrainSnapshot) {
  const bySymbol = new Map<string, number>();
  for (const holding of snapshot.holdings) {
    bySymbol.set(holding.symbol, roundMoney((bySymbol.get(holding.symbol) ?? 0) + holding.market_value));
  }
  return bySymbol;
}

function holdingRowValue(row: ManualHoldingRow | ImportedHoldingRow) {
  return roundMoney(row.quantity * row.price);
}

function topSymbolsFromValueRows(rows: Array<{ symbol: string; value: number }>) {
  return [...rows]
    .filter((row) => row.symbol)
    .sort((a, b) => b.value - a.value || a.symbol.localeCompare(b.symbol))
    .slice(0, 8)
    .map((row) => row.symbol.toUpperCase());
}

function latestString(values: Array<string | null | undefined>) {
  const valid = values
    .filter((value): value is string => typeof value === "string" && Number.isFinite(Date.parse(value)))
    .sort((a, b) => Date.parse(b) - Date.parse(a));
  return valid[0] ?? null;
}

function isOlderThanHours(value: string, now: Date, hours: number) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return true;
  return (now.getTime() - parsed) / 3_600_000 >= hours;
}

function emptyChangeSummary(status: "no_snapshot" | "no_previous"): PortfolioBrainChangeSummary {
  return {
    status,
    label: status === "no_snapshot" ? "No Monarch snapshot" : "First Monarch snapshot",
    detail: status === "no_snapshot"
      ? "No Monarch snapshot is saved yet."
      : "No previous Monarch snapshot is saved yet. Changes will appear after the next sync.",
    latest_synced_at: null,
    previous_synced_at: null,
    total_value_delta: 0,
    total_value_delta_pct: null,
    added_symbols: [],
    removed_symbols: [],
    increased_symbols: [],
    decreased_symbols: [],
    top_changes: [],
  };
}

function changeSummaryDetail(
  status: "changed" | "unchanged",
  totalValueDelta: number,
  totalValueDeltaPct: number | null,
  topChanges: PortfolioBrainChangeSummary["top_changes"],
) {
  if (status === "unchanged") return "No holding value changes were detected between the last two Monarch snapshots.";
  const direction = totalValueDelta >= 0 ? "up" : "down";
  const pct = totalValueDeltaPct === null ? "" : ` (${totalValueDeltaPct >= 0 ? "+" : ""}${totalValueDeltaPct.toFixed(1)}%)`;
  const lead = `Since last Monarch sync, visible value is ${direction} ${formatCurrency(Math.abs(totalValueDelta))}${pct}.`;
  const changeText = topChanges.slice(0, 3).map((change) => change.detail).join(" ");
  return changeText ? `${lead} ${changeText}` : lead;
}

function describeSnapshotFreshness(syncedAt: string, now: Date) {
  const parsed = Date.parse(syncedAt);
  if (!Number.isFinite(parsed)) {
    return { label: "Unknown age", is_stale: true, stale_after_hours: STALE_AFTER_HOURS };
  }
  const ageHours = Math.max(0, (now.getTime() - parsed) / 3_600_000);
  if (ageHours >= STALE_AFTER_HOURS) {
    return { label: ageHours < 48 ? "Older than 1 day" : `Older than ${Math.floor(ageHours / 24)} days`, is_stale: true, stale_after_hours: STALE_AFTER_HOURS };
  }
  if (ageHours < 1) return { label: "Synced this hour", is_stale: false, stale_after_hours: STALE_AFTER_HOURS };
  return { label: `Synced ${Math.floor(ageHours)}h ago`, is_stale: false, stale_after_hours: STALE_AFTER_HOURS };
}

function accountKind(account: PortfolioBrainAccount | undefined): PortfolioHoldingJson["account"]["kind"] {
  const text = `${account?.institution ?? ""} ${account?.name ?? ""} ${account?.account_type ?? ""}`.toLowerCase();
  if (text.includes("coinbase")) return "coinbase";
  if (text.includes("wallet") || text.includes("web3") || text.includes("onchain")) return "onchain_wallet";
  return "robinhood";
}

function normalizeAssetClass(value: string | null, symbol: string): AssetClass {
  const text = `${value ?? ""} ${symbol}`.toLowerCase();
  if (["usd", "cash", "money market"].some((token) => text.includes(token))) return "cash";
  if (["btc", "eth", "sol", "crypto", "coin"].some((token) => text.includes(token))) return "crypto";
  if (["defi", "wallet", "onchain"].some((token) => text.includes(token))) return "defi";
  return "equity";
}

function firstArray(...values: unknown[]): unknown[] {
  for (const value of values) {
    if (Array.isArray(value)) return value;
  }
  return [];
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringField(object: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = object[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function numberField(object: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = object[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value.replace(/[$,%]/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function asIsoString(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function stableId(value: string): string {
  return stableHash(value).slice(0, 18);
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function roundPct(value: number) {
  return Math.round(value * 10) / 10;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function formatSnapshotTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown time";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
