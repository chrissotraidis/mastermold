/**
 * Holdings import. Accepts the formats Chris's book already uses:
 *  - the stored manual_holdings row shape (array, or { manual_holdings: [...] })
 *  - the POST /api/portfolio body shape (symbol, asset_class, quantity, price…)
 *  - CSV / pasted tables with a header row (column names are matched loosely,
 *    or mapped explicitly)
 * Parsing never writes. previewImport shows exactly what would change;
 * applyImport writes the whole book in one step and returns the previous
 * book so the UI can undo.
 */
import type { AssetClass } from "./portfolio";
import { store, type FinancialAccountRow, type ManualHoldingRow } from "./store";
import { afterMoneyChange, costBasisKnown, normalizeSymbol, roundMoney, roundPrice, roundQuantity } from "./money";

export type ImportField = "symbol" | "asset_name" | "asset_class" | "venue" | "quantity" | "price" | "value" | "cost_basis" | "account" | "id";

export type ParsedHolding = {
  id: string | null;
  symbol: string;
  asset_name: string;
  asset_class: AssetClass;
  venue: string;
  quantity: number;
  price: number;
  cost_basis: number | null;
  daily_change_pct: number;
  account: string | null;
  created_at: string | null;
  updated_at: string | null;
  line: number;
};

export type ImportIssue = { line: number; reason: string; raw: string };

export type ParsedImport = {
  format: "manual_holdings_json" | "holdings_json" | "csv" | "empty";
  rows: ParsedHolding[];
  issues: ImportIssue[];
  /** CSV only: which column fed each field, so the UI can show and fix it. */
  columns: string[];
  mapping: Partial<Record<ImportField, string>>;
};

const FIELD_ALIASES: Record<ImportField, string[]> = {
  id: ["id"],
  symbol: ["symbol", "ticker", "asset", "coin", "code", "security"],
  asset_name: ["asset_name", "name", "description", "security_name", "holding"],
  asset_class: ["asset_class", "class", "type", "asset_type", "category", "kind"],
  venue: ["venue", "broker", "exchange", "platform", "location"],
  quantity: ["quantity", "qty", "shares", "units", "amount", "balance", "holding_amount"],
  price: ["price", "last_price", "current_price", "unit_price", "last", "close", "price_usd"],
  value: ["value", "market_value", "current_value", "total_value", "value_usd", "usd_value"],
  cost_basis: ["cost_basis", "cost", "basis", "total_cost", "cost_basis_total", "purchase_value"],
  account: ["account", "account_name", "account_id", "portfolio"],
};

const KNOWN_CRYPTO = new Set([
  "BTC", "ETH", "SOL", "USDC", "USDT", "DOGE", "ADA", "XRP", "DOT", "AVAX", "LINK", "MATIC", "POL", "LTC", "BCH", "ATOM",
  "UNI", "AAVE", "ARB", "OP", "SUI", "APT", "TON", "TRX", "SHIB", "PEPE", "BONK", "WIF", "JUP", "PYTH", "RNDR", "RENDER",
  "INJ", "TIA", "SEI", "NEAR", "FIL", "HBAR", "XLM", "ALGO", "ICP", "ETC", "MKR", "LDO", "CRV", "HYPE", "ENA", "ONDO", "JTO",
]);

export function parseHoldingsImport(input: string, mapping: Partial<Record<ImportField, string>> = {}): ParsedImport {
  const text = input.replace(/^\uFEFF/, "").trim();
  if (!text) return { format: "empty", rows: [], issues: [], columns: [], mapping: {} };
  if (text.startsWith("[") || text.startsWith("{")) {
    try {
      return parseJsonImport(JSON.parse(text));
    } catch (error) {
      return {
        format: "holdings_json",
        rows: [],
        issues: [{ line: 1, reason: `That looks like JSON but could not be read: ${(error as Error).message}`, raw: text.slice(0, 80) }],
        columns: [],
        mapping: {},
      };
    }
  }
  return parseCsvImport(text, mapping);
}

function parseJsonImport(value: unknown): ParsedImport {
  const container = value as Record<string, unknown> | unknown[];
  const list: unknown[] = Array.isArray(container)
    ? container
    : Array.isArray(container?.manual_holdings)
      ? (container.manual_holdings as unknown[])
      : Array.isArray(container?.holdings)
        ? (container.holdings as unknown[])
        : [container];
  const rows: ParsedHolding[] = [];
  const issues: ImportIssue[] = [];
  let storedShape = list.length > 0;
  list.forEach((item, index) => {
    const line = index + 1;
    if (!item || typeof item !== "object") {
      issues.push({ line, reason: "Not an object.", raw: String(item).slice(0, 80) });
      storedShape = false;
      return;
    }
    const record = lowerKeys(item as Record<string, unknown>);
    if (!("id" in record && "created_at" in record)) storedShape = false;
    const parsed = normalizeRecord(record, line);
    if ("reason" in parsed) issues.push({ ...parsed, raw: JSON.stringify(item).slice(0, 120) });
    else rows.push(parsed);
  });
  return { format: storedShape ? "manual_holdings_json" : "holdings_json", rows, issues, columns: [], mapping: {} };
}

function parseCsvImport(text: string, explicit: Partial<Record<ImportField, string>>): ParsedImport {
  const delimiter = detectDelimiter(text);
  const table = parseDelimited(text, delimiter).filter((cells) => cells.some((cell) => cell.trim() !== ""));
  if (table.length === 0) return { format: "csv", rows: [], issues: [], columns: [], mapping: {} };
  const header = table[0].map((cell) => cell.trim());
  const mapping: Partial<Record<ImportField, string>> = {};
  for (const field of Object.keys(FIELD_ALIASES) as ImportField[]) {
    const chosen = explicit[field];
    if (chosen && header.includes(chosen)) {
      mapping[field] = chosen;
      continue;
    }
    const match = header.find((column) => FIELD_ALIASES[field].includes(keyOf(column)));
    if (match && !Object.values(mapping).includes(match)) mapping[field] = match;
  }
  const rows: ParsedHolding[] = [];
  const issues: ImportIssue[] = [];
  if (!mapping.symbol) {
    issues.push({ line: 1, reason: "No symbol column found. Pick which column holds the ticker.", raw: header.join(", ").slice(0, 120) });
    return { format: "csv", rows, issues, columns: header, mapping };
  }
  for (let index = 1; index < table.length; index += 1) {
    const cells = table[index];
    const record: Record<string, unknown> = {};
    for (const [field, column] of Object.entries(mapping)) {
      const position = header.indexOf(column as string);
      if (position >= 0) record[field] = cells[position];
    }
    const parsed = normalizeRecord(record, index + 1);
    if ("reason" in parsed) issues.push({ ...parsed, raw: cells.join(delimiter).slice(0, 120) });
    else rows.push(parsed);
  }
  return { format: "csv", rows, issues, columns: header, mapping };
}

function normalizeRecord(record: Record<string, unknown>, line: number): ParsedHolding | { line: number; reason: string } {
  const pick = (field: ImportField) => {
    for (const alias of FIELD_ALIASES[field]) {
      if (record[alias] !== undefined && record[alias] !== null && record[alias] !== "") return record[alias];
    }
    return record[field];
  };
  const symbol = normalizeSymbol(String(pick("symbol") ?? ""));
  if (!symbol) return { line, reason: "Missing symbol." };
  const quantity = toNumber(pick("quantity"));
  const price = toNumber(pick("price"));
  const value = toNumber(pick("value"));
  const assetClass = toAssetClass(pick("asset_class"), symbol);
  const resolvedQuantity = quantity ?? (assetClass === "cash" && value !== null ? value : null);
  if (resolvedQuantity === null || resolvedQuantity <= 0) return { line, reason: `${symbol}: amount is missing or zero.` };
  const resolvedPrice =
    price !== null && price > 0
      ? price
      : value !== null && value > 0
        ? value / resolvedQuantity
        : assetClass === "cash"
          ? 1
          : null;
  if (resolvedPrice === null) return { line, reason: `${symbol}: needs a price or a total value.` };
  const costBasis = toNumber(pick("cost_basis"));
  const name = String(pick("asset_name") ?? "").trim();
  const venue = String(pick("venue") ?? "").trim();
  const account = String(pick("account") ?? "").trim();
  const id = typeof record.id === "string" && record.id.trim() ? record.id.trim() : null;
  return {
    id,
    symbol,
    asset_name: name || symbol,
    asset_class: assetClass,
    venue: venue || "Manual",
    quantity: roundQuantity(resolvedQuantity),
    price: roundPrice(resolvedPrice),
    cost_basis: costBasis !== null && costBasis >= 0 ? roundMoney(costBasis) : null,
    daily_change_pct: toNumber(record.daily_change_pct) ?? 0,
    account: account || null,
    created_at: typeof record.created_at === "string" ? record.created_at : null,
    updated_at: typeof record.updated_at === "string" ? record.updated_at : null,
    line,
  };
}

// --- preview / apply ---------------------------------------------------------

export type ImportMode = "merge" | "replace";

export type ImportChange = {
  symbol: string;
  account: string | null;
  kind: "add" | "update" | "unchanged" | "remove";
  before: { quantity: number; price: number; value: number } | null;
  after: { quantity: number; price: number; value: number } | null;
  fields: string[];
};

export type ImportPreview = {
  format: ParsedImport["format"];
  mode: ImportMode;
  counts: { add: number; update: number; unchanged: number; remove: number; issues: number };
  total_before: number;
  total_after: number;
  changes: ImportChange[];
  issues: ImportIssue[];
  new_accounts: string[];
  columns: string[];
  mapping: ParsedImport["mapping"];
};

type Plan = { next: ManualHoldingRow[]; changes: ImportChange[]; newAccounts: FinancialAccountRow[] };

function planImport(parsed: ParsedImport, mode: ImportMode, now: Date): Plan {
  const existing = store().manualHoldings();
  const accounts = store().financialAccounts();
  const accountByName = new Map(accounts.map((account) => [account.name.toLowerCase(), account]));
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const newAccounts: FinancialAccountRow[] = [];

  const resolveAccount = (name: string | null): string | null => {
    if (!name) return null;
    const byId = accountById.get(name);
    if (byId) return byId.id;
    const key = name.toLowerCase();
    const found = accountByName.get(key);
    if (found) return found.id;
    const created: FinancialAccountRow = {
      id: `acct_${key.replace(/[^a-z0-9]+/g, "_").slice(0, 24)}_${(now.getTime() + newAccounts.length).toString(36)}`,
      name,
      institution: "",
      type: "brokerage",
      kind: "asset",
      currency: "USD",
      balance: 0,
      notes: "Created by import",
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };
    newAccounts.push(created);
    accountByName.set(key, created);
    return created.id;
  };

  const byId = new Map(existing.map((row) => [row.id, row]));
  const byKey = new Map(existing.map((row) => [holdingKey(row.symbol, row.account_id ?? null), row]));
  const matched = new Set<string>();
  const next: ManualHoldingRow[] = [];
  const changes: ImportChange[] = [];

  parsed.rows.forEach((row, index) => {
    const accountId = resolveAccount(row.account);
    const match = (row.id ? byId.get(row.id) : undefined) ?? byKey.get(holdingKey(row.symbol, accountId)) ?? (accountId ? undefined : byKey.get(holdingKey(row.symbol, null)));
    if (match && matched.has(match.id)) {
      // Two import rows for the same holding: fold the amount in.
      const target = next.find((item) => item.id === match.id);
      if (target) {
        target.quantity = roundQuantity(target.quantity + row.quantity);
        if (row.cost_basis !== null) target.cost_basis = roundMoney(target.cost_basis + row.cost_basis);
      }
      return;
    }
    const nowIso = now.toISOString();
    const costKnown = row.cost_basis !== null && Math.abs(row.cost_basis - roundMoney(row.quantity * row.price)) > 0.01;
    const built: ManualHoldingRow = {
      id: match?.id ?? row.id ?? `manual_${row.symbol.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${(now.getTime() + index).toString(36)}`,
      symbol: row.symbol,
      asset_name: row.asset_name,
      asset_class: row.asset_class,
      venue: row.venue,
      quantity: row.quantity,
      price: row.price,
      cost_basis: row.cost_basis ?? (match && costBasisKnown(match) ? match.cost_basis : roundMoney(row.quantity * row.price)),
      cost_basis_known: row.cost_basis !== null ? costKnown : match ? costBasisKnown(match) : false,
      daily_change_pct: row.daily_change_pct,
      created_at: match?.created_at ?? row.created_at ?? nowIso,
      updated_at: nowIso,
      account_id: accountId ?? match?.account_id ?? null,
      price_as_of: match && match.price === row.price ? match.price_as_of ?? null : null,
      price_source: match && match.price === row.price ? match.price_source ?? null : null,
    };
    if (match) matched.add(match.id);
    next.push(built);
    const fields = match ? diffFields(match, built) : [];
    changes.push({
      symbol: built.symbol,
      account: row.account,
      kind: !match ? "add" : fields.length > 0 ? "update" : "unchanged",
      before: match ? snapshotOf(match) : null,
      after: snapshotOf(built),
      fields,
    });
  });

  for (const row of existing) {
    if (matched.has(row.id)) continue;
    if (mode === "merge") next.push(row);
    else changes.push({ symbol: row.symbol, account: null, kind: "remove", before: snapshotOf(row), after: null, fields: [] });
  }

  return { next, changes, newAccounts };
}

export function previewImport(parsed: ParsedImport, mode: ImportMode, now = new Date()): ImportPreview {
  const plan = planImport(parsed, mode, now);
  const existing = store().manualHoldings();
  const count = (kind: ImportChange["kind"]) => plan.changes.filter((change) => change.kind === kind).length;
  return {
    format: parsed.format,
    mode,
    counts: { add: count("add"), update: count("update"), unchanged: count("unchanged"), remove: count("remove"), issues: parsed.issues.length },
    total_before: roundMoney(existing.reduce((sum, row) => sum + row.quantity * row.price, 0)),
    total_after: roundMoney(plan.next.reduce((sum, row) => sum + row.quantity * row.price, 0)),
    changes: plan.changes.sort((a, b) => kindOrder(a.kind) - kindOrder(b.kind) || a.symbol.localeCompare(b.symbol)),
    issues: parsed.issues,
    new_accounts: plan.newAccounts.map((account) => account.name),
    columns: parsed.columns,
    mapping: parsed.mapping,
  };
}

export function applyImport(parsed: ParsedImport, mode: ImportMode, now = new Date()) {
  const previous = store().manualHoldings();
  const plan = planImport(parsed, mode, now);
  for (const account of plan.newAccounts) store().upsertFinancialAccount(account);
  store().replaceManualHoldings(plan.next);
  afterMoneyChange(now);
  return {
    previous,
    written: plan.next.length,
    created_accounts: plan.newAccounts.map((account) => account.id),
    counts: previewCounts(plan),
  };
}

function previewCounts(plan: Plan) {
  const count = (kind: ImportChange["kind"]) => plan.changes.filter((change) => change.kind === kind).length;
  return { add: count("add"), update: count("update"), unchanged: count("unchanged"), remove: count("remove") };
}

/** The same shape the old server stored, so an export can be re-imported anywhere. */
export function exportManualHoldings() {
  return { manual_holdings: store().manualHoldings(), financial_accounts: store().financialAccounts() };
}

// --- helpers -----------------------------------------------------------------

function holdingKey(symbol: string, accountId: string | null) {
  return `${symbol.toUpperCase()}::${accountId ?? ""}`;
}

function snapshotOf(row: ManualHoldingRow) {
  return { quantity: row.quantity, price: row.price, value: roundMoney(row.quantity * row.price) };
}

function diffFields(before: ManualHoldingRow, after: ManualHoldingRow) {
  const fields: string[] = [];
  if (before.quantity !== after.quantity) fields.push("amount");
  if (before.price !== after.price) fields.push("price");
  if (before.asset_class !== after.asset_class) fields.push("class");
  if (before.asset_name !== after.asset_name) fields.push("name");
  if ((before.account_id ?? null) !== (after.account_id ?? null)) fields.push("account");
  if (costBasisKnown(before) !== Boolean(after.cost_basis_known) || (after.cost_basis_known && before.cost_basis !== after.cost_basis)) fields.push("cost basis");
  return fields;
}

function kindOrder(kind: ImportChange["kind"]) {
  return { add: 0, update: 1, remove: 2, unchanged: 3 }[kind];
}

function lowerKeys(record: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) out[keyOf(key)] = value;
  return out;
}

function keyOf(column: string) {
  return column.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const negative = /^\(.*\)$/.test(trimmed) || trimmed.startsWith("-");
  const cleaned = trimmed.replace(/[\s$€£¥,()%]/g, "").replace(/^-/, "");
  if (!cleaned || !/^\d*\.?\d+(e[-+]?\d+)?$/i.test(cleaned)) return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? (negative ? -number : number) : null;
}

function toAssetClass(value: unknown, symbol: string): AssetClass {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (["equity", "stock", "stocks", "etf", "equities", "share", "shares", "fund", "mutual fund"].includes(raw)) return "equity";
  if (["crypto", "cryptocurrency", "coin", "token", "digital asset"].includes(raw)) return "crypto";
  if (["defi", "on-chain", "onchain", "lp", "staking"].includes(raw)) return "defi";
  if (["cash", "money market", "usd", "currency", "savings"].includes(raw)) return "cash";
  if (symbol === "USD" || symbol === "CASH") return "cash";
  if (KNOWN_CRYPTO.has(symbol)) return "crypto";
  return "equity";
}

export function detectDelimiter(text: string) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const counts: Array<[string, number]> = [",", "\t", ";", "|"].map((delimiter) => [delimiter, firstLine.split(delimiter).length - 1]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else quoted = false;
      } else cell += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  row.push(cell);
  rows.push(row);
  return rows;
}
