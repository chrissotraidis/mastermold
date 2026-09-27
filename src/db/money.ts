/**
 * Money hub: accounts, holdings edits, net worth (assets − liabilities), and
 * a daily net-worth history. Builds on the manual-holdings store so the
 * existing 76-row book keeps working unchanged; account links, real cost
 * basis, and price freshness are optional fields on the same rows.
 */
import { getPortfolio, invalidatePortfolioCache, type AssetClass, type PortfolioHoldingJson, type PortfolioJson } from "./portfolio";
import { store, type AccountExclusions, type FinancialAccountRow, type ManualHoldingRow, type NetWorthHistoryRow } from "./store";
import { ACCOUNT_TYPES } from "@/lib/money-accounts";

export { ACCOUNT_TYPES };

export type AccountType = FinancialAccountRow["type"];

const ASSET_CLASSES: AssetClass[] = ["equity", "crypto", "defi", "cash"];

export type MoneyAccount = FinancialAccountRow & {
  holdings_value: number;
  holding_count: number;
  /** Positive number; liabilities subtract from net worth. */
  value: number;
};

export type MoneyHolding = PortfolioHoldingJson & {
  account_id: string | null;
  price: number;
  price_as_of: string | null;
  price_source: string | null;
  cost_basis_known: boolean;
  gain_value: number | null;
  gain_pct: number | null;
  freshness: "live" | "stale" | "typed" | "sample";
  editable: boolean;
};

export type MoneySummary = {
  is_personal: boolean;
  assets: number;
  liabilities: number;
  net_worth: number;
  investments: number;
  cash: number;
  daily_change_value: number;
  daily_change_pct: number;
  accounts: MoneyAccount[];
  holdings: MoneyHolding[];
  unassigned_value: number;
  priced_count: number;
  stale_count: number;
  last_priced_at: string | null;
  history: Array<{ date: string; value: number }>;
};

const STALE_AFTER_MS = 24 * 3_600_000;

export function getMoneySummary(portfolio: PortfolioJson = getPortfolio(), now = new Date()): MoneySummary {
  const accounts = store().financialAccounts();
  const manualRows = new Map(store().manualHoldings().map((row) => [row.id, row]));
  const isPersonal = portfolio.provenance.label !== "Demo data" || accounts.length > 0;

  const holdings: MoneyHolding[] = portfolio.holdings.map((holding) => {
    const row = manualRows.get(holding.id);
    const price = holding.quantity > 0 ? holding.market_value / holding.quantity : 0;
    const costKnown = row ? costBasisKnown(row) : holding.source !== "demo" && holding.cost_basis > 0;
    const priceAsOf = row?.price_as_of ?? (holding.source === "connected" ? holding.as_of : null);
    const freshness: MoneyHolding["freshness"] =
      holding.source === "demo"
        ? "sample"
        : holding.asset_class === "cash"
          ? "live"
          : priceAsOf
            ? now.getTime() - Date.parse(priceAsOf) > STALE_AFTER_MS
              ? "stale"
              : "live"
            : "typed";
    const gain = costKnown ? roundMoney(holding.market_value - holding.cost_basis) : null;
    return {
      ...holding,
      account_id: row?.account_id ?? null,
      price: roundPrice(price),
      price_as_of: priceAsOf,
      price_source: row?.price_source ?? null,
      cost_basis_known: costKnown,
      gain_value: gain,
      gain_pct: costKnown && holding.cost_basis > 0 && gain !== null ? roundPct((gain / holding.cost_basis) * 100) : null,
      freshness,
      editable: Boolean(row),
    };
  });

  const byAccount = new Map<string, MoneyHolding[]>();
  for (const holding of holdings) {
    if (!holding.account_id) continue;
    const list = byAccount.get(holding.account_id) ?? [];
    list.push(holding);
    byAccount.set(holding.account_id, list);
  }

  const moneyAccounts: MoneyAccount[] = accounts.map((account) => {
    const linked = byAccount.get(account.id) ?? [];
    const holdingsValue = roundMoney(linked.reduce((sum, holding) => sum + holding.market_value, 0));
    return {
      ...account,
      holdings_value: holdingsValue,
      holding_count: linked.length,
      value: account.kind === "liability" ? roundMoney(Math.abs(account.balance)) : roundMoney(holdingsValue + account.balance),
    };
  });

  // Accounts switched out of net worth stay listed but leave every total.
  const outOfNetWorth = new Set(accounts.filter((account) => account.exclude?.net_worth).map((account) => account.id));
  const counted = holdings.filter((holding) => !holding.account_id || !outOfNetWorth.has(holding.account_id));
  const countedAccounts = moneyAccounts.filter((account) => !outOfNetWorth.has(account.id));
  const holdingsValue = roundMoney(counted.reduce((sum, holding) => sum + holding.market_value, 0));
  const accountBalances = roundMoney(
    countedAccounts.filter((account) => account.kind === "asset").reduce((sum, account) => sum + account.balance, 0),
  );
  const liabilities = roundMoney(
    countedAccounts.filter((account) => account.kind === "liability").reduce((sum, account) => sum + account.value, 0),
  );
  const assets = roundMoney(holdingsValue + accountBalances);
  const cashHoldings = counted.filter((holding) => holding.asset_class === "cash").reduce((sum, holding) => sum + holding.market_value, 0);
  const cashAccounts = countedAccounts
    .filter((account) => account.kind === "asset" && (account.type === "bank" || account.type === "cash"))
    .reduce((sum, account) => sum + account.balance, 0);
  const assignedIds = new Set(moneyAccounts.map((account) => account.id));
  const unassigned = holdings.filter((holding) => !holding.account_id || !assignedIds.has(holding.account_id));
  const pricedTimes = holdings
    .map((holding) => holding.price_as_of)
    .filter((value): value is string => Boolean(value))
    .sort();

  return {
    is_personal: isPersonal,
    assets,
    liabilities,
    net_worth: roundMoney(assets - liabilities),
    investments: roundMoney(holdingsValue - cashHoldings),
    cash: roundMoney(cashHoldings + cashAccounts),
    daily_change_value: portfolio.daily_change_value,
    daily_change_pct: portfolio.daily_change_pct,
    accounts: moneyAccounts,
    holdings,
    unassigned_value: roundMoney(unassigned.reduce((sum, holding) => sum + holding.market_value, 0)),
    priced_count: holdings.filter((holding) => holding.freshness === "live").length,
    stale_count: holdings.filter((holding) => holding.freshness === "stale" || holding.freshness === "typed").length,
    last_priced_at: pricedTimes[pricedTimes.length - 1] ?? null,
    history: netWorthHistorySeries(portfolio, isPersonal, roundMoney(assets - liabilities), accountBalances - liabilities, now),
  };
}

/**
 * Saved daily net-worth points win; days before the first saved point fall
 * back to the report-backed holdings series shifted by today's non-holding
 * balances. Always ends on today's live value.
 */
function netWorthHistorySeries(
  portfolio: PortfolioJson,
  isPersonal: boolean,
  netWorth: number,
  nonHoldingNet: number,
  now: Date,
) {
  const today = now.toISOString().slice(0, 10);
  const saved = isPersonal ? store().netWorthHistory().filter((point) => point.date < today) : [];
  const savedDates = new Set(saved.map((point) => point.date));
  const fromReports = portfolio.net_worth_series
    .filter((point) => point.date < today && !savedDates.has(point.date))
    .map((point) => ({ date: point.date, value: roundMoney(point.value + (isPersonal ? nonHoldingNet : 0)) }));
  return [...fromReports, ...saved.map((point) => ({ date: point.date, value: point.net_worth }))]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-365)
    .concat([{ date: today, value: netWorth }]);
}

/** Save today's point. Called after edits, imports, and price refreshes. */
export function recordNetWorthPoint(now = new Date()): NetWorthHistoryRow | null {
  const summary = getMoneySummary(getPortfolio(), now);
  if (!summary.is_personal) return null;
  const point: NetWorthHistoryRow = {
    date: now.toISOString().slice(0, 10),
    assets: summary.assets,
    liabilities: summary.liabilities,
    net_worth: summary.net_worth,
    recorded_at: now.toISOString(),
  };
  store().upsertNetWorthPoint(point);
  return point;
}

// --- accounts ----------------------------------------------------------------

export type AccountInput = {
  name: string;
  institution?: string;
  type: AccountType;
  currency?: string;
  balance?: number;
  notes?: string;
  exclude?: AccountExclusions;
};

function parseExclusions(value: unknown): AccountExclusions {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return { net_worth: raw.net_worth === true, cash_flow: raw.cash_flow === true, budget: raw.budget === true };
}

export function parseAccountInput(body: unknown): { ok: true; input: AccountInput } | { ok: false; error: string } {
  const raw = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const name = text(raw.name, 80);
  if (!name) return { ok: false, error: "Give the account a name." };
  const type = ACCOUNT_TYPES.find((item) => item.value === raw.type)?.value;
  if (!type) return { ok: false, error: "Choose an account type." };
  const balance = raw.balance === undefined || raw.balance === "" ? 0 : Number(raw.balance);
  if (!Number.isFinite(balance)) return { ok: false, error: "Balance must be a number." };
  return {
    ok: true,
    input: {
      name,
      type,
      institution: text(raw.institution, 80),
      currency: (text(raw.currency, 3) || "USD").toUpperCase(),
      balance,
      notes: text(raw.notes, 400),
      exclude: parseExclusions(raw.exclude),
    },
  };
}

export function createAccount(input: AccountInput, now = new Date()): FinancialAccountRow {
  const kind = ACCOUNT_TYPES.find((item) => item.value === input.type)?.kind ?? "asset";
  const row: FinancialAccountRow = {
    id: `acct_${slug(input.name)}_${now.getTime().toString(36)}`,
    name: input.name,
    institution: input.institution ?? "",
    type: input.type,
    kind,
    currency: input.currency ?? "USD",
    balance: roundMoney(Math.abs(input.balance ?? 0)),
    notes: input.notes ?? "",
    exclude: input.exclude ?? {},
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
  store().upsertFinancialAccount(row);
  afterMoneyChange(now);
  return row;
}

export function updateAccount(id: string, input: Partial<AccountInput>, now = new Date()): FinancialAccountRow | null {
  const existing = store().financialAccounts().find((row) => row.id === id);
  if (!existing) return null;
  const type = input.type ?? existing.type;
  const row: FinancialAccountRow = {
    ...existing,
    name: input.name ?? existing.name,
    institution: input.institution ?? existing.institution,
    type,
    kind: ACCOUNT_TYPES.find((item) => item.value === type)?.kind ?? existing.kind,
    currency: input.currency ?? existing.currency,
    balance: input.balance === undefined ? existing.balance : roundMoney(Math.abs(input.balance)),
    notes: input.notes ?? existing.notes,
    exclude: input.exclude ?? existing.exclude ?? {},
    updated_at: now.toISOString(),
  };
  store().upsertFinancialAccount(row);
  afterMoneyChange(now);
  return row;
}

/** Deleting an account keeps its holdings; they become unassigned. */
export function deleteAccount(id: string, now = new Date()): boolean {
  const existing = store().financialAccounts().find((row) => row.id === id);
  if (!existing) return false;
  const rows = store().manualHoldings();
  if (rows.some((row) => row.account_id === id)) {
    store().replaceManualHoldings(rows.map((row) => (row.account_id === id ? { ...row, account_id: null } : row)));
  }
  store().deleteFinancialAccount(id);
  afterMoneyChange(now);
  return true;
}

// --- holdings edits -------------------------------------------------------------

export type HoldingPatch = {
  symbol?: string;
  asset_name?: string;
  asset_class?: AssetClass;
  quantity?: number;
  price?: number;
  cost_basis?: number | null;
  account_id?: string | null;
  venue?: string;
};

export function parseHoldingPatch(body: unknown): { ok: true; patch: HoldingPatch } | { ok: false; error: string } {
  const raw = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const patch: HoldingPatch = {};
  if (raw.symbol !== undefined) {
    const symbol = normalizeSymbol(String(raw.symbol));
    if (!symbol) return { ok: false, error: "Symbol cannot be empty." };
    patch.symbol = symbol;
  }
  if (raw.asset_name !== undefined) patch.asset_name = text(raw.asset_name, 80);
  if (raw.venue !== undefined) patch.venue = text(raw.venue, 60);
  if (raw.asset_class !== undefined) {
    if (!ASSET_CLASSES.includes(raw.asset_class as AssetClass)) return { ok: false, error: "Unknown asset class." };
    patch.asset_class = raw.asset_class as AssetClass;
  }
  for (const key of ["quantity", "price"] as const) {
    if (raw[key] === undefined) continue;
    const value = Number(raw[key]);
    if (!Number.isFinite(value) || value < 0) return { ok: false, error: `${key === "quantity" ? "Amount" : "Price"} must be zero or more.` };
    patch[key] = value;
  }
  if (raw.cost_basis !== undefined) {
    if (raw.cost_basis === null || raw.cost_basis === "") patch.cost_basis = null;
    else {
      const value = Number(raw.cost_basis);
      if (!Number.isFinite(value) || value < 0) return { ok: false, error: "Cost basis must be zero or more." };
      patch.cost_basis = value;
    }
  }
  if (raw.account_id !== undefined) {
    if (raw.account_id === null || raw.account_id === "") patch.account_id = null;
    else {
      const id = String(raw.account_id);
      if (!store().financialAccounts().some((account) => account.id === id)) return { ok: false, error: "That account does not exist." };
      patch.account_id = id;
    }
  }
  return { ok: true, patch };
}

function applyPatch(row: ManualHoldingRow, patch: HoldingPatch, now: Date): ManualHoldingRow {
  const next: ManualHoldingRow = { ...row, updated_at: now.toISOString() };
  if (patch.symbol !== undefined) {
    next.symbol = patch.symbol;
    if (row.asset_name === row.symbol) next.asset_name = patch.symbol;
  }
  if (patch.asset_name !== undefined) next.asset_name = patch.asset_name || next.symbol;
  if (patch.asset_class !== undefined) next.asset_class = patch.asset_class;
  if (patch.venue !== undefined) next.venue = patch.venue || "Manual";
  if (patch.quantity !== undefined) next.quantity = roundQuantity(patch.quantity);
  if (patch.price !== undefined && roundPrice(patch.price) !== row.price) {
    // A hand-typed price replaces the quote, so it is no longer "current".
    next.price = roundPrice(patch.price);
    next.price_as_of = null;
    next.price_source = null;
  }
  if (patch.cost_basis !== undefined) {
    next.cost_basis = patch.cost_basis === null ? roundMoney(next.quantity * next.price) : roundMoney(patch.cost_basis);
    next.cost_basis_known = patch.cost_basis !== null;
  } else if (row.cost_basis_known === undefined) {
    next.cost_basis_known = costBasisKnown(row);
  }
  if (patch.account_id !== undefined) next.account_id = patch.account_id;
  return next;
}

export function updateHolding(id: string, patch: HoldingPatch, now = new Date()): { before: ManualHoldingRow; after: ManualHoldingRow } | null {
  const before = store().manualHoldings().find((row) => row.id === id);
  if (!before) return null;
  const after = applyPatch(before, patch, now);
  store().upsertManualHolding(after);
  afterMoneyChange(now);
  return { before, after };
}

/** Bulk move/reclassify/delete. Returns the rows as they were, for undo. */
export function bulkUpdateHoldings(
  ids: string[],
  action: { patch: HoldingPatch } | { delete: true },
  now = new Date(),
): { previous: ManualHoldingRow[]; affected: number } {
  const rows = store().manualHoldings();
  const target = new Set(ids);
  const previous = rows.filter((row) => target.has(row.id));
  const next =
    "delete" in action
      ? rows.filter((row) => !target.has(row.id))
      : rows.map((row) => (target.has(row.id) ? applyPatch(row, action.patch, now) : row));
  store().replaceManualHoldings(next);
  afterMoneyChange(now);
  return { previous, affected: previous.length };
}

/** Undo: put rows back exactly as they were (by id). */
export function restoreHoldings(rows: ManualHoldingRow[], now = new Date()): number {
  const valid = rows.filter(isManualHoldingRow);
  const current = store().manualHoldings();
  const restoredIds = new Set(valid.map((row) => row.id));
  store().replaceManualHoldings([...current.filter((row) => !restoredIds.has(row.id)), ...valid]);
  afterMoneyChange(now);
  return valid.length;
}

/** Undo for a whole-book change (import): replace the book with a snapshot. */
export function restoreBook(rows: ManualHoldingRow[], now = new Date()): number {
  const valid = rows.filter(isManualHoldingRow);
  store().replaceManualHoldings(valid);
  afterMoneyChange(now);
  return valid.length;
}

export function isManualHoldingRow(value: unknown): value is ManualHoldingRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.symbol === "string" &&
    ASSET_CLASSES.includes(row.asset_class as AssetClass) &&
    typeof row.quantity === "number" &&
    typeof row.price === "number" &&
    typeof row.created_at === "string"
  );
}

export function afterMoneyChange(now = new Date()) {
  invalidatePortfolioCache();
  try {
    recordNetWorthPoint(now);
  } catch {
    // History is best-effort; never block an edit on it.
  }
}

/**
 * The Zo-era book stored cost_basis = quantity × price for every row because
 * the form defaulted it. A basis equal to today's value is treated as unknown
 * unless the row says otherwise, so gains are never invented.
 */
export function costBasisKnown(row: ManualHoldingRow) {
  if (typeof row.cost_basis_known === "boolean") return row.cost_basis_known;
  return Math.abs(row.cost_basis - roundMoney(row.quantity * row.price)) > 0.01;
}

// --- helpers --------------------------------------------------------------------

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function normalizeSymbol(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "").slice(0, 12);
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 24) || "account";
}

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function roundPrice(value: number) {
  if (value >= 1) return Math.round(value * 100) / 100;
  return Math.round(value * 1e8) / 1e8;
}

export function roundQuantity(value: number) {
  return Math.round(value * 1e8) / 1e8;
}

function roundPct(value: number) {
  return Math.round(value * 10) / 10;
}
