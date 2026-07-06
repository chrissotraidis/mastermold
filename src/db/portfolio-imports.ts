import { createHmac } from "node:crypto";
import { demoDatabase } from "./seed-data";
import { replaceImportedHoldings, type PortfolioJson } from "./portfolio";
import { recordProductMetric } from "./metrics";
import type { ImportedHoldingRow } from "./store";

export type PortfolioImportService = ImportedHoldingRow["service"];

export type PortfolioImportResult = {
  ok: boolean;
  service: PortfolioImportService;
  message: string;
  imported_count: number;
  skipped_count: number;
  issues: PortfolioImportIssue[];
  checked_at: string;
  portfolio: PortfolioJson;
};

export type PortfolioImportIssue = {
  symbol: string;
  name: string;
  reason: string;
};

export async function importPortfolioFromProvider(
  body: Record<string, unknown> | null,
): Promise<PortfolioImportResult> {
  const service = text(body?.service) as PortfolioImportService;
  if (!["coinbase", "robinhood", "onchain_wallet"].includes(service)) {
    throw new Error("Choose Coinbase, brokerage via SnapTrade, or an on-chain wallet to import.");
  }

  const importedAt = new Date().toISOString();
  const rows =
    service === "coinbase"
      ? await importCoinbase(body, importedAt)
      : service === "robinhood"
        ? await importSnapTrade(body, importedAt)
        : await importZerion(body, importedAt);
  const pricedRows = rows.filter((row) => row.price > 0 && row.quantity > 0);
  const issues = importIssues(rows, pricedRows);
  const skippedCount = rows.length - pricedRows.length;
  recordProductMetric({
    event: "portfolio_import",
    surface: "settings",
    entity_id: service,
    value: pricedRows.length,
    metadata: {
      service,
      imported_count: pricedRows.length,
      skipped_count: skippedCount,
      issues,
    },
  });
  const portfolio = replaceImportedHoldings(service, pricedRows);

  return {
    ok: true,
    service,
    message:
      importMessage(service, pricedRows.length, skippedCount),
    imported_count: pricedRows.length,
    skipped_count: skippedCount,
    issues,
    checked_at: importedAt,
    portfolio,
  };
}

async function importCoinbase(
  body: Record<string, unknown> | null,
  importedAt: string,
): Promise<ImportedHoldingRow[]> {
  const apiKey = required(body, "api_key", "Paste a Coinbase accounts JWT first.");
  const accounts = await coinbaseRequest<{ accounts?: unknown[] }>(
    "https://api.cdp.coinbase.com/platform/v2/accounts?pageSize=250",
    apiKey,
    "Coinbase rejected the account import.",
  );
  const rows: ImportedHoldingRow[] = [];

  for (const account of accounts.accounts ?? []) {
    const accountId = stringAt(account, "accountId");
    if (!accountId) continue;
    const balances = await coinbaseRequest<{ balances?: unknown[] }>(
      `https://api.cdp.coinbase.com/platform/v2/accounts/${encodeURIComponent(accountId)}/balances?pageSize=250`,
      apiKey,
      "Coinbase rejected the balance import.",
    );
    rows.push(...(balances.balances ?? []).flatMap((balance) => coinbaseBalanceToRow(balance, account, importedAt)));
  }

  return rows;
}

async function importSnapTrade(
  body: Record<string, unknown> | null,
  importedAt: string,
): Promise<ImportedHoldingRow[]> {
  const clientId = required(body, "client_id", "Enter the SnapTrade clientId.");
  const consumerKey = required(body, "consumer_key", "Enter the SnapTrade consumerKey.");
  const userId = required(body, "user_id", "Enter the SnapTrade userId.");
  const userSecret = required(body, "user_secret", "Enter the SnapTrade userSecret.");
  const accounts = await snapTradeRequest<unknown[]>({
    clientId,
    consumerKey,
    userId,
    userSecret,
    path: "/api/v1/accounts",
    fallback: "SnapTrade rejected the account import.",
  });
  const rows: ImportedHoldingRow[] = [];

  for (const account of accounts) {
    const accountId = stringAt(account, "id");
    if (!accountId) continue;
    const positionsResponse = await snapTradeRequest<{ results?: unknown[]; data_freshness?: { as_of?: string } } | unknown[]>({
      clientId,
      consumerKey,
      userId,
      userSecret,
      path: `/api/v1/accounts/${encodeURIComponent(accountId)}/positions/all`,
      fallback: "SnapTrade rejected the positions import.",
    });
    const positions = Array.isArray(positionsResponse) ? positionsResponse : positionsResponse.results ?? [];
    const positionsAsOf = Array.isArray(positionsResponse)
      ? null
      : typeof positionsResponse.data_freshness?.as_of === "string"
        ? positionsResponse.data_freshness.as_of
        : null;
    for (const position of positions) {
      const row = snapTradePositionToRow(position, account, importedAt, positionsAsOf);
      if (row) rows.push(row);
    }
  }

  return rows;
}

async function importZerion(
  body: Record<string, unknown> | null,
  importedAt: string,
): Promise<ImportedHoldingRow[]> {
  const apiKey = required(body, "api_key", "Enter a Zerion API key.");
  const walletAddress = required(body, "wallet_address", "Enter a wallet address.");
  const auth = Buffer.from(`${apiKey}:`).toString("base64");
  const response = await fetch(
    `https://api.zerion.io/v1/wallets/${encodeURIComponent(walletAddress)}/positions/`,
    {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
      },
      cache: "no-store",
    },
  );
  if (!response.ok) throw new Error(await providerErrorText(response, "Zerion rejected the wallet import."));
  const json = (await response.json().catch(() => ({}))) as { data?: unknown[] };
  return (json.data ?? []).flatMap((position) => zerionPositionToRow(position, walletAddress, importedAt));
}

async function snapTradeRequest<T>({
  clientId,
  consumerKey,
  userId,
  userSecret,
  path,
  fallback,
}: {
  clientId: string;
  consumerKey: string;
  userId: string;
  userSecret: string;
  path: string;
  fallback: string;
}) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const query = new URLSearchParams({ clientId, timestamp, userId, userSecret }).toString();
  const signature = createHmac("sha256", consumerKey)
    .update(canonicalJson({ content: null, path, query }))
    .digest("base64");
  const response = await fetch(`https://api.snaptrade.com${path}?${query}`, {
    headers: {
      Signature: signature,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await providerErrorText(response, fallback));
  return (await response.json().catch(() => [])) as T;
}

async function coinbaseRequest<T>(url: string, apiKey: string, fallback: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await providerErrorText(response, fallback));
  return (await response.json().catch(() => ({}))) as T;
}

function coinbaseBalanceToRow(
  balance: unknown,
  account: unknown,
  importedAt: string,
): ImportedHoldingRow[] {
  const symbol = normalizeSymbol(stringAt(balance, "asset.symbol"));
  const quantity = coinbaseBalanceAmount(balance, symbol);
  const usdValue = coinbaseUsdAmount(balance);
  const price = firstNumber(quantity > 0 ? usdValue / quantity : 0, priceForSymbol(symbol));
  if (!symbol || quantity <= 0) return [];
  const accountId = stringAt(account, "accountId") || `coinbase_${symbol}`;

  return [
    {
      id: `import_coinbase_${slug(accountId)}_${slug(symbol)}`,
      service: "coinbase",
      account_id: accountId,
      account_label: stringAt(account, "name") || "Coinbase import",
      symbol,
      asset_name: stringAt(balance, "asset.name") || `${symbol} balance`,
      asset_class: assetClassForSymbol(symbol, stringAt(balance, "asset.type") === "fiat" ? "cash" : "crypto"),
      venue: "Coinbase",
      quantity,
      price: roundMoney(price),
      cost_basis: roundMoney(firstNumber(usdValue, quantity * price)),
      daily_change_pct: dailyChangePctForSymbol(symbol),
      imported_at: importedAt,
      as_of: stringAt(account, "updatedAt") || importedAt,
    },
  ];
}

function coinbaseBalanceAmount(balance: unknown, symbol: string) {
  const amount = valueAt(balance, "amount");
  const key = symbol.toLowerCase();
  return firstNumber(
    numberAt(amount, `${key}.total`),
    numberAt(amount, `${key}.available`),
    numberAt(amount, `${symbol}.total`),
    numberAt(amount, `${symbol}.available`),
  );
}

function coinbaseUsdAmount(balance: unknown) {
  const amount = valueAt(balance, "amount");
  return firstNumber(
    numberAt(amount, "usd.total"),
    numberAt(amount, "usd.available"),
    numberAt(amount, "USD.total"),
    numberAt(amount, "USD.available"),
  );
}

function snapTradePositionToRow(
  position: unknown,
  account: unknown,
  importedAt: string,
  positionsAsOf: string | null = null,
): ImportedHoldingRow | null {
  const rawSymbol = firstText(
    stringAt(position, "instrument.raw_symbol"),
    stringAt(position, "instrument.symbol"),
    stringAt(position, "symbol.symbol.symbol"),
    stringAt(position, "symbol.symbol"),
    stringAt(position, "symbol.raw_symbol"),
    stringAt(position, "symbol.ticker"),
    stringAt(position, "symbol"),
  );
  const symbol = normalizeSymbol(rawSymbol);
  const quantity = firstNumber(
    numberAt(position, "units"),
    numberAt(position, "quantity"),
    numberAt(position, "shares"),
  );
  const marketValue = firstNumber(
    numberAt(position, "market_value.amount"),
    numberAt(position, "market_value"),
    numberAt(position, "current_value.amount"),
    numberAt(position, "current_value"),
    quantity * numberAt(position, "price"),
  );
  const unitPrice = firstNumber(numberAt(position, "price"), quantity > 0 ? marketValue / quantity : 0);
  if (!symbol || quantity <= 0) return null;

  const accountId = stringAt(account, "id") || "snaptrade-account";
  const paidAmount = snapTradePaidAmount(position, quantity, unitPrice);
  return {
    id: `import_robinhood_${slug(accountId)}_${slug(symbol)}`,
    service: "robinhood",
    account_id: accountId,
      account_label: stringAt(account, "institution_name") || "Brokerage import",
    symbol,
    asset_name:
      firstText(
        stringAt(position, "symbol.description"),
        stringAt(position, "symbol.symbol.description"),
        stringAt(position, "instrument.description"),
        stringAt(position, "description"),
      ) || symbol,
    asset_class: assetClassForSymbol(symbol, "equity"),
    venue: stringAt(account, "institution_name") || "SnapTrade",
    quantity,
    price: roundMoney(unitPrice),
    cost_basis: paidAmount,
    daily_change_pct: dailyChangePctForSymbol(symbol),
    imported_at: importedAt,
    as_of: positionsAsOf || stringAt(account, "sync_status.holdings.last_successful_sync") || importedAt,
  };
}

function snapTradePaidAmount(position: unknown, quantity: number, unitPrice: number) {
  const taxLotCost = sumNumbers(position, "tax_lots", "cost_basis");
  if (taxLotCost > 0) return roundMoney(taxLotCost);

  const costBasis = numberAt(position, "cost_basis");
  const usesUnifiedInstrument = Boolean(stringAt(position, "instrument.kind"));
  if (costBasis > 0 && usesUnifiedInstrument) return roundMoney(quantity * costBasis);
  if (costBasis > 0) return roundMoney(costBasis);
  return roundMoney(quantity * unitPrice);
}

function zerionPositionToRow(
  position: unknown,
  walletAddress: string,
  importedAt: string,
): ImportedHoldingRow[] {
  const symbol = normalizeSymbol(stringAt(position, "attributes.fungible_info.symbol"));
  const quantity = firstNumber(
    numberAt(position, "attributes.quantity.float"),
    numberAt(position, "attributes.quantity.numeric"),
  );
  const marketValue = numberAt(position, "attributes.value");
  const price = firstNumber(numberAt(position, "attributes.price"), quantity > 0 ? marketValue / quantity : 0);
  if (!symbol || quantity <= 0) return [];

  return [
    {
      id: `import_onchain_${slug(stringAt(position, "id") || symbol)}`,
      service: "onchain_wallet",
      account_id: `wallet_${slug(walletAddress.slice(0, 12))}`,
      account_label: "Wallet import",
      symbol,
      asset_name: stringAt(position, "attributes.fungible_info.name") || stringAt(position, "attributes.name") || symbol,
      asset_class: stringAt(position, "attributes.protocol_module") ? "defi" : assetClassForSymbol(symbol, "crypto"),
      venue:
        firstText(
          stringAt(position, "relationships.chain.data.id"),
          stringAt(position, "attributes.protocol"),
          "On-chain",
        ) || "On-chain",
      quantity,
      price: roundMoney(price),
      cost_basis: roundMoney(marketValue || quantity * price),
      daily_change_pct: roundPct(numberAt(position, "attributes.changes.percent_1d")),
      imported_at: importedAt,
      as_of: importedAt,
    },
  ];
}

function importMessage(service: PortfolioImportService, importedCount: number, skippedCount: number) {
  const provider = providerLabel(service);
  const importedText =
    importedCount > 0
      ? `${provider} imported ${importedCount} holding${importedCount === 1 ? "" : "s"} from the account response`
      : `${provider} returned no priced holdings to import`;
  if (skippedCount <= 0) return `${importedText}.`;
  return `${importedText}. ${skippedCount} ${skippedCount === 1 ? "entry was" : "entries were"} skipped because price or amount was missing.`;
}

function importIssues(rows: ImportedHoldingRow[], pricedRows: ImportedHoldingRow[]): PortfolioImportIssue[] {
  const pricedIds = new Set(pricedRows.map((row) => row.id));
  return rows
    .filter((row) => !pricedIds.has(row.id))
    .map((row) => ({
      symbol: row.symbol || "Unknown",
      name: row.asset_name || row.symbol || "Unknown holding",
      reason:
        row.quantity <= 0
          ? "Account source did not return a usable amount."
          : "Account source did not return a usable price.",
    }))
    .slice(0, 6);
}

function priceForSymbol(symbol: string) {
  if (["USD", "USDC", "USDT", "DAI"].includes(symbol)) return 1;
  const asset = demoDatabase.assets.find((item) => item.symbol.toUpperCase() === symbol);
  if (!asset) return 0;
  const latest = demoDatabase.priceBars
    .filter((bar) => bar.asset_id === asset.id)
    .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))[0];
  return latest?.close ?? 0;
}

function dailyChangePctForSymbol(symbol: string) {
  const asset = demoDatabase.assets.find((item) => item.symbol.toUpperCase() === symbol);
  if (!asset) return 0;
  const bars = demoDatabase.priceBars
    .filter((bar) => bar.asset_id === asset.id)
    .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
  const [latest, previous] = bars;
  if (!latest || !previous?.close) return 0;
  return roundPct(((latest.close - previous.close) / previous.close) * 100);
}

function assetClassForSymbol(
  symbol: string,
  fallback: ImportedHoldingRow["asset_class"],
): ImportedHoldingRow["asset_class"] {
  if (["USD", "USDC", "USDT", "DAI"].includes(symbol)) return "cash";
  return demoDatabase.assets.find((item) => item.symbol.toUpperCase() === symbol)?.asset_class ?? fallback;
}

async function providerErrorText(response: Response, fallback: string) {
  const detail = await response.text().catch(() => "");
  return `${fallback} HTTP ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ""}`;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalJson(entryValue)}`).join(",")}}`;
}

function required(body: Record<string, unknown> | null, key: string, message: string) {
  const value = text(body?.[key]);
  if (!value) throw new Error(message);
  return value;
}

function stringAt(value: unknown, path: string) {
  const found = valueAt(value, path);
  if (typeof found === "string") return found.trim();
  if (typeof found === "number") return String(found);
  return "";
}

function numberAt(value: unknown, path: string) {
  const found = valueAt(value, path);
  if (typeof found === "number") return Number.isFinite(found) ? found : 0;
  if (typeof found === "string") {
    const parsed = Number(found);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function sumNumbers(value: unknown, listPath: string, numberPath: string) {
  const list = valueAt(value, listPath);
  if (!Array.isArray(list)) return 0;
  return list.reduce((sum, item) => sum + numberAt(item, numberPath), 0);
}

function valueAt(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[key];
  }, value);
}

function firstText(...values: string[]) {
  return values.find((value) => value.trim()) ?? "";
}

function firstNumber(...values: number[]) {
  return values.find((value) => Number.isFinite(value) && value > 0) ?? 0;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSymbol(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "").slice(0, 12);
}

function slug(value: string) {
  return normalizeSymbol(value).toLowerCase().replace(/[^a-z0-9]+/g, "_") || "row";
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function roundPct(value: number) {
  return Math.round(value * 10) / 10;
}

function providerLabel(service: PortfolioImportService) {
  if (service === "coinbase") return "Coinbase";
    if (service === "robinhood") return "SnapTrade brokerage";
  return "Zerion";
}
