/**
 * Monarch-style transactions: a category tree, ordered if/then rules, CSV
 * import with duplicate protection, and monthly cash flow. Everything here is
 * local and read-only toward the outside world: nothing moves money.
 * See docs/monarch-research.md and docs/monarch-plan.md.
 */
import { randomUUID } from "node:crypto";
import { detectDelimiter, parseDelimited, toNumber } from "./money-import";
import { store, type TransactionRow, type TransactionRuleRow } from "./store";

// --- categories ---------------------------------------------------------------

export type CategoryType = "income" | "expense" | "transfer";
export type Category = { id: string; name: string; group: string; type: CategoryType };

/** Type → Group → Category, after Monarch's default tree (trimmed). */
export const CATEGORIES: Category[] = [
  ...cat("income", "Income", ["Paychecks", "Interest", "Dividends", "Other income"]),
  ...cat("expense", "Housing", ["Rent", "Mortgage", "Home improvement"]),
  ...cat("expense", "Bills & utilities", ["Utilities", "Phone", "Internet", "Insurance"]),
  ...cat("expense", "Food & dining", ["Groceries", "Restaurants", "Coffee shops"]),
  ...cat("expense", "Transportation", ["Gas", "Rideshare", "Public transit", "Parking", "Auto"]),
  ...cat("expense", "Shopping", ["Shopping", "Clothing", "Electronics"]),
  ...cat("expense", "Subscriptions", ["Software", "Streaming"]),
  ...cat("expense", "Health & wellness", ["Medical", "Pharmacy", "Fitness"]),
  ...cat("expense", "Travel & lifestyle", ["Travel", "Entertainment", "Gifts", "Personal"]),
  ...cat("expense", "Financial", ["Fees", "Taxes"]),
  ...cat("expense", "Other", ["Uncategorized"]),
  ...cat("transfer", "Transfers", ["Transfer", "Credit card payment"]),
];

function cat(type: CategoryType, group: string, names: string[]): Category[] {
  return names.map((name) => ({ id: slug(name), name, group, type }));
}

function slug(value: string) {
  return value.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const CATEGORY_BY_ID = new Map(CATEGORIES.map((category) => [category.id, category]));

export function categoryById(id: string | null | undefined): Category | null {
  return id ? CATEGORY_BY_ID.get(id) ?? null : null;
}

/** Built-in keyword guesses, applied before user rules (Monarch order). */
const KEYWORD_CATEGORIES: Array<[RegExp, string]> = [
  [/payroll|direct dep|salary|paycheck/i, "paychecks"],
  [/interest paid|interest earned/i, "interest"],
  [/dividend/i, "dividends"],
  [/transfer|xfer|zelle to|venmo cashout/i, "transfer"],
  [/(credit card|card) payment|autopay payment|payment thank you/i, "credit-card-payment"],
  [/uber eats|doordash|grubhub|restaurant|cafe|pizza|sushi|burger/i, "restaurants"],
  [/starbucks|coffee|blue bottle|peet/i, "coffee-shops"],
  [/whole foods|trader joe|safeway|kroger|grocery|costco|aldi|market/i, "groceries"],
  [/uber|lyft/i, "rideshare"],
  [/shell|chevron|exxon|\bbp\b|gas station|fuel/i, "gas"],
  [/netflix|spotify|hulu|disney|youtube premium|apple\.com\/bill/i, "streaming"],
  [/github|openai|anthropic|notion|figma|adobe|dropbox|google \*cloud|aws/i, "software"],
  [/amazon|target|walmart|best buy/i, "shopping"],
  [/pharmacy|cvs|walgreens/i, "pharmacy"],
  [/gym|fitness|equinox|peloton/i, "fitness"],
  [/airline|airbnb|hotel|marriott|delta|united|expedia/i, "travel"],
  [/verizon|t-mobile|at&t/i, "phone"],
  [/comcast|xfinity|spectrum|internet/i, "internet"],
  [/electric|pg&e|water|utility/i, "utilities"],
  [/rent/i, "rent"],
  [/mortgage/i, "mortgage"],
  [/fee/i, "fees"],
];

export function guessCategory(text: string, amount: number): string {
  for (const [pattern, id] of KEYWORD_CATEGORIES) if (pattern.test(text)) return id;
  return amount > 0 ? "other-income" : "uncategorized";
}

/** "SQ *BLUE BOTTLE COFFEE 123 SAN FRAN" → "Blue Bottle Coffee". */
export function cleanMerchant(raw: string): string {
  const stripped = raw
    .replace(/^(sq|tst|pp|paypal|pos|ach|dbt|debit|purchase)\s*\*?\s*/i, "")
    .replace(/\s+#?\d{3,}.*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  const base = stripped || raw.trim();
  return base
    .toLowerCase()
    .split(" ")
    .map((word) => (word.length > 3 || /^[a-z]+$/.test(word) ? word.charAt(0).toUpperCase() + word.slice(1) : word.toUpperCase()))
    .join(" ")
    .slice(0, 80);
}

// --- rules --------------------------------------------------------------------

function textMatches(value: string, condition: { op: "equals" | "contains"; value: string }) {
  const left = value.trim().toLowerCase();
  const right = condition.value.trim().toLowerCase();
  if (!right) return false;
  return condition.op === "equals" ? left === right : left.includes(right);
}

export function ruleMatches(rule: TransactionRuleRow, tx: TransactionRow): boolean {
  if (!rule.enabled) return false;
  const c = rule.conditions;
  const checks = [
    c.merchant ? textMatches(tx.merchant, c.merchant) : null,
    c.original_description ? textMatches(tx.original_description, c.original_description) : null,
    c.direction ? (c.direction === "income" ? tx.amount > 0 : tx.amount < 0) : null,
    c.account_id ? tx.account_id === c.account_id : null,
    c.amount ? amountMatches(Math.abs(tx.amount), c.amount) : null,
  ].filter((check): check is boolean => check !== null);
  // A rule with no conditions would rewrite everything; never let it match.
  return checks.length > 0 && checks.every(Boolean);
}

function amountMatches(value: number, condition: NonNullable<TransactionRuleRow["conditions"]["amount"]>) {
  const cents = (n: number) => Math.round(n * 100);
  if (condition.op === "equals") return cents(value) === cents(condition.value);
  if (condition.op === "above") return value > condition.value;
  if (condition.op === "below") return value < condition.value;
  const high = condition.value2 ?? condition.value;
  return value >= Math.min(condition.value, high) && value <= Math.max(condition.value, high);
}

/** Every matching rule applies, top to bottom; later rules win on conflicts. */
export function applyRules(tx: TransactionRow, rules: TransactionRuleRow[]): TransactionRow {
  let next = { ...tx, tags: [...tx.tags] };
  for (const rule of [...rules].sort((a, b) => a.order - b.order)) {
    if (!ruleMatches(rule, next)) continue;
    const a = rule.actions;
    if (a.rename_merchant) next.merchant = a.rename_merchant;
    if (a.set_category_id && CATEGORY_BY_ID.has(a.set_category_id)) next.category_id = a.set_category_id;
    if (a.add_tags) next.tags = [...new Set([...next.tags, ...a.add_tags])];
    if (a.hide !== undefined) next.hidden = a.hide;
    if (a.needs_review !== undefined) next.needs_review = a.needs_review;
    if (a.link_goal_id && rule.conditions.account_id) next.goal_id = a.link_goal_id;
  }
  return next;
}

export type NewRule = {
  conditions: TransactionRuleRow["conditions"];
  actions: TransactionRuleRow["actions"];
};

/** Add a rule at the top (most specific first) and optionally apply it to past transactions. */
export function addRule(input: NewRule, options: { applyToPast?: boolean; now?: Date } = {}) {
  const now = (options.now ?? new Date()).toISOString();
  const existing = store().transactionRules();
  const rule: TransactionRuleRow = {
    id: `rule_${randomUUID()}`,
    order: 0,
    enabled: true,
    conditions: input.conditions,
    actions: input.actions,
    created_at: now,
  };
  if (!Object.values(rule.conditions).some((value) => value !== undefined && value !== "")) {
    throw new Error("A rule needs at least one condition.");
  }
  if (rule.actions.link_goal_id && !rule.conditions.account_id) {
    throw new Error("A rule that links to a goal needs an account condition.");
  }
  const rules = [rule, ...existing].map((row, index) => ({ ...row, order: index }));
  store().replaceTransactionRules(rules);
  let updated = 0;
  if (options.applyToPast) {
    const changed = store()
      .transactions()
      .filter((tx) => ruleMatches(rule, tx))
      .map((tx) => ({ ...applyRules(tx, [rule]), updated_at: now }));
    store().upsertTransactions(changed);
    updated = changed.length;
  }
  return { rule, updated };
}

export function deleteRule(id: string) {
  const rules = store()
    .transactionRules()
    .filter((rule) => rule.id !== id)
    .map((row, index) => ({ ...row, order: index }));
  store().replaceTransactionRules(rules);
}

/** How many past transactions a draft rule would touch (preview). */
export function previewRule(input: NewRule): number {
  const draft: TransactionRuleRow = { id: "preview", order: 0, enabled: true, created_at: "", ...input };
  return store().transactions().filter((tx) => ruleMatches(draft, tx)).length;
}

// --- create / edit ------------------------------------------------------------

export type TransactionInput = {
  date: string;
  amount: number;
  description: string;
  merchant?: string;
  category_id?: string | null;
  account_id?: string | null;
  notes?: string;
};

function buildTransaction(input: TransactionInput, source: TransactionRow["source"], batch: string | null, now: string): TransactionRow {
  const original = input.description.trim();
  const base: TransactionRow = {
    id: `tx_${randomUUID()}`,
    date: input.date,
    amount: Math.round(input.amount * 100) / 100,
    original_description: original,
    merchant: input.merchant?.trim() || cleanMerchant(original),
    category_id: input.category_id && CATEGORY_BY_ID.has(input.category_id) ? input.category_id : guessCategory(original, input.amount),
    account_id: input.account_id ?? null,
    notes: input.notes ?? "",
    tags: [],
    hidden: false,
    needs_review: source !== "manual",
    source,
    import_batch_id: batch,
    created_at: now,
    updated_at: now,
  };
  // An explicit category on hand entry beats rules; imports always run rules.
  return input.category_id && source === "manual" ? base : applyRules(base, store().transactionRules());
}

export function addManualTransaction(input: TransactionInput, now = new Date()): TransactionRow {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("Use a date like 2026-09-27.");
  if (!Number.isFinite(input.amount) || input.amount === 0) throw new Error("Enter a non-zero amount.");
  if (!input.description.trim()) throw new Error("Enter a description.");
  const row = buildTransaction(input, "manual", null, now.toISOString());
  store().upsertTransactions([row]);
  return row;
}

export type TransactionPatch = Partial<Pick<TransactionRow, "merchant" | "category_id" | "notes" | "hidden" | "needs_review" | "tags" | "account_id" | "goal_id">>;

export function updateTransaction(id: string, patch: TransactionPatch, now = new Date()): TransactionRow {
  const current = store().transactions().find((tx) => tx.id === id);
  if (!current) throw new Error("Transaction not found.");
  if (patch.category_id !== undefined && patch.category_id !== null && !CATEGORY_BY_ID.has(patch.category_id)) {
    throw new Error("Unknown category.");
  }
  const next: TransactionRow = { ...current, ...patch, needs_review: patch.needs_review ?? false, updated_at: now.toISOString() };
  store().upsertTransactions([next]);
  return next;
}

export function deleteTransactions(ids: string[]) {
  store().deleteTransactions(ids);
}

// --- CSV import ---------------------------------------------------------------

export type ParsedTransaction = { date: string; amount: number; description: string; line: number };
export type ParsedTransactions = { rows: ParsedTransaction[]; issues: Array<{ line: number; reason: string }>; columns: Record<string, string | null> };

const HEADERS = {
  date: ["date", "transaction date", "posted date", "post date", "posting date", "trans date"],
  description: ["description", "merchant", "name", "payee", "memo", "details", "original description"],
  amount: ["amount", "transaction amount", "value"],
  debit: ["debit", "withdrawal", "withdrawals", "money out", "outflow"],
  credit: ["credit", "deposit", "deposits", "money in", "inflow"],
};

/**
 * Parse a bank or card CSV. Handles one signed Amount column or separate
 * Debit/Credit columns, and MM/DD/YYYY or YYYY-MM-DD dates. Never writes.
 * `flipSign` is for card exports where purchases are positive.
 */
export function parseTransactionCsv(text: string, options: { flipSign?: boolean } = {}): ParsedTransactions {
  const table = parseDelimited(text, detectDelimiter(text)).filter((cells) => cells.some((cell) => cell.trim() !== ""));
  if (table.length === 0) return { rows: [], issues: [], columns: {} };
  const header = table[0].map((cell) => cell.trim().toLowerCase());
  const find = (names: string[]) => {
    const index = header.findIndex((cell) => names.includes(cell));
    return index >= 0 ? index : null;
  };
  const cols = {
    date: find(HEADERS.date),
    description: find(HEADERS.description),
    amount: find(HEADERS.amount),
    debit: find(HEADERS.debit),
    credit: find(HEADERS.credit),
  };
  const columns = Object.fromEntries(Object.entries(cols).map(([key, index]) => [key, index === null ? null : table[0][index]]));
  const issues: ParsedTransactions["issues"] = [];
  if (cols.date === null || cols.description === null || (cols.amount === null && cols.debit === null && cols.credit === null)) {
    return { rows: [], issues: [{ line: 1, reason: "Needs Date, Description and Amount (or Debit/Credit) columns." }], columns };
  }
  const rows: ParsedTransaction[] = [];
  table.slice(1).forEach((cells, index) => {
    const line = index + 2;
    const date = normalizeDate(cells[cols.date!] ?? "");
    const description = (cells[cols.description!] ?? "").trim();
    let amount: number | null = null;
    if (cols.amount !== null) amount = toNumber(cells[cols.amount] ?? "");
    else {
      const debit = cols.debit !== null ? toNumber(cells[cols.debit] ?? "") : null;
      const credit = cols.credit !== null ? toNumber(cells[cols.credit] ?? "") : null;
      if (debit !== null || credit !== null) amount = (credit ?? 0) - Math.abs(debit ?? 0);
    }
    if (!date) return issues.push({ line, reason: "Unreadable date." });
    if (!description) return issues.push({ line, reason: "Missing description." });
    if (amount === null || amount === 0) return issues.push({ line, reason: "Missing or zero amount." });
    rows.push({ date, description, amount: options.flipSign ? -amount : amount, line });
  });
  return { rows, issues, columns };
}

function normalizeDate(raw: string): string | null {
  const value = raw.trim();
  let match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) return iso(+match[1], +match[2], +match[3]);
  match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (match) {
    const year = match[3].length === 2 ? 2000 + +match[3] : +match[3];
    return iso(year, +match[1], +match[2]);
  }
  return null;
}

function iso(year: number, month: number, day: number) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Same bank row imported twice must not double-count. */
function fingerprint(tx: { date: string; amount: number; original_description: string; account_id: string | null }) {
  return [tx.date, Math.round(tx.amount * 100), tx.original_description.trim().toLowerCase(), tx.account_id ?? ""].join("|");
}

export function previewTransactionImport(parsed: ParsedTransactions, accountId: string | null) {
  const seen = new Set(store().transactions().map(fingerprint));
  const fresh = parsed.rows.filter((row) => !seen.has(fingerprint({ ...row, original_description: row.description, account_id: accountId })));
  return { new_count: fresh.length, duplicate_count: parsed.rows.length - fresh.length, issue_count: parsed.issues.length };
}

export function importTransactions(parsed: ParsedTransactions, accountId: string | null, now = new Date()) {
  const seen = new Set(store().transactions().map(fingerprint));
  const batch = `import_${randomUUID()}`;
  const stamp = now.toISOString();
  const rows: TransactionRow[] = [];
  let duplicates = 0;
  for (const row of parsed.rows) {
    const key = fingerprint({ ...row, original_description: row.description, account_id: accountId });
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    rows.push(buildTransaction({ date: row.date, amount: row.amount, description: row.description, account_id: accountId }, "csv", batch, stamp));
  }
  store().upsertTransactions(rows);
  return { batch_id: batch, imported: rows.length, duplicates };
}

export function undoImport(batchId: string) {
  const ids = store().transactions().filter((tx) => tx.import_batch_id === batchId).map((tx) => tx.id);
  store().deleteTransactions(ids);
  return ids.length;
}

// --- cash flow ----------------------------------------------------------------

export type CashFlowMonth = {
  month: string; // YYYY-MM
  income: number;
  expenses: number;
  savings: number;
  savings_rate: number | null;
  by_category: Array<{ category_id: string; name: string; group: string; total: number; count: number }>;
};

/** Income − expenses, excluding hidden rows and transfer categories (Monarch rule). */
export function cashFlow(month: string, rows = store().transactions()): CashFlowMonth {
  const counted = rows.filter((tx) => tx.date.startsWith(month) && !tx.hidden && categoryById(tx.category_id)?.type !== "transfer");
  const income = sum(counted.filter((tx) => categoryById(tx.category_id)?.type === "income" || (!categoryById(tx.category_id) && tx.amount > 0)).map((tx) => tx.amount));
  const expenseRows = counted.filter((tx) => categoryById(tx.category_id)?.type === "expense" || (!categoryById(tx.category_id) && tx.amount < 0));
  const expenses = -sum(expenseRows.map((tx) => tx.amount));
  const groups = new Map<string, { total: number; count: number }>();
  for (const tx of expenseRows) {
    const id = tx.category_id ?? "uncategorized";
    const entry = groups.get(id) ?? { total: 0, count: 0 };
    entry.total += -tx.amount;
    entry.count += 1;
    groups.set(id, entry);
  }
  const savings = round(income - expenses);
  return {
    month,
    income: round(income),
    expenses: round(expenses),
    savings,
    savings_rate: income > 0 ? Math.round((savings / income) * 1000) / 10 : null,
    by_category: [...groups.entries()]
      .map(([id, entry]) => {
        const category = categoryById(id);
        return { category_id: id, name: category?.name ?? "Uncategorized", group: category?.group ?? "Other", total: round(entry.total), count: entry.count };
      })
      .sort((a, b) => b.total - a.total),
  };
}

/** Months that have any transaction, newest first. */
export function transactionMonths(rows = store().transactions()): string[] {
  return [...new Set(rows.map((tx) => tx.date.slice(0, 7)))].sort().reverse();
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

// --- recurring ----------------------------------------------------------------

export type RecurringFrequency = "weekly" | "biweekly" | "monthly" | "yearly";
export type RecurringStatus = "paid" | "changed" | "upcoming" | "missed";

export type RecurringItem = {
  merchant: string;
  category_id: string | null;
  frequency: RecurringFrequency;
  typical_amount: number; // signed, like transactions
  last_date: string;
  next_date: string;
  occurrences: number;
  status: RecurringStatus;
  last_amount: number;
  /** The latest charge differs from the usual amount by more than 10%. */
  amount_changed: boolean;
};

const FREQUENCIES: Array<{ id: RecurringFrequency; days: number; tolerance: number }> = [
  { id: "weekly", days: 7, tolerance: 2 },
  { id: "biweekly", days: 14, tolerance: 3 },
  { id: "monthly", days: 30.4, tolerance: 5 },
  { id: "yearly", days: 365, tolerance: 15 },
];

const DAY = 86_400_000;

function toDay(date: string) {
  return Date.parse(`${date}T00:00:00Z`);
}

function addDays(date: string, days: number) {
  return new Date(toDay(date) + Math.round(days) * DAY).toISOString().slice(0, 10);
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Find repeating merchants the way Monarch suggests recurring bills: the same
 * merchant on a steady rhythm with similar amounts. Needs 3 occurrences (2 for
 * yearly). Transfers and hidden rows are ignored.
 */
export function detectRecurring(rows = store().transactions(), today = new Date().toISOString().slice(0, 10)): RecurringItem[] {
  const byMerchant = new Map<string, TransactionRow[]>();
  for (const tx of rows) {
    if (tx.hidden || categoryById(tx.category_id)?.type === "transfer") continue;
    const key = tx.merchant.trim().toLowerCase();
    byMerchant.set(key, [...(byMerchant.get(key) ?? []), tx]);
  }
  const items: RecurringItem[] = [];
  for (const group of byMerchant.values()) {
    const sorted = [...group].sort((a, b) => a.date.localeCompare(b.date));
    if (sorted.length < 2) continue;
    const gaps = sorted.slice(1).map((tx, index) => (toDay(tx.date) - toDay(sorted[index].date)) / DAY);
    const gap = median(gaps);
    const frequency = FREQUENCIES.find((f) => Math.abs(gap - f.days) <= f.tolerance && gaps.every((g) => Math.abs(g - f.days) <= f.tolerance * 2));
    if (!frequency) continue;
    if (sorted.length < (frequency.id === "yearly" ? 2 : 3)) continue;
    const amounts = sorted.map((tx) => tx.amount);
    const typical = median(amounts);
    // Amounts must mostly agree (within 20%) or it is shopping, not a bill.
    if (amounts.filter((amount) => Math.abs(amount - typical) <= Math.abs(typical) * 0.2).length < amounts.length - 1) continue;
    const last = sorted[sorted.length - 1];
    const next = addDays(last.date, frequency.days);
    const changed = Math.abs(last.amount - typical) > Math.abs(typical) * 0.1;
    const status: RecurringStatus =
      toDay(today) - toDay(last.date) < (frequency.days / 2) * DAY
        ? changed ? "changed" : "paid"
        : toDay(today) > toDay(next) + frequency.tolerance * DAY
          ? "missed"
          : "upcoming";
    items.push({
      merchant: last.merchant,
      category_id: last.category_id,
      frequency: frequency.id,
      typical_amount: round(typical),
      last_date: last.date,
      next_date: next,
      occurrences: sorted.length,
      status,
      last_amount: last.amount,
      amount_changed: changed,
    });
  }
  return items.sort((a, b) => a.next_date.localeCompare(b.next_date));
}

