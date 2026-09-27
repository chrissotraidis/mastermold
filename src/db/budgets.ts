/**
 * Monarch-style budgets: every expense category can have a monthly plan in
 * one of three groups. Rollover carries unused (or overspent) money forward:
 * next month starts with previous rollover + plan − spent. In the Flex group a
 * rollover changes only that category's remaining amount, never the Flex total.
 * See docs/monarch-research.md.
 */
import { store, type BudgetLineRow, type TransactionRow } from "./store";
import { CATEGORIES, categoryById } from "./transactions";

export type BudgetGroup = BudgetLineRow["group"];

export const BUDGET_GROUPS: Array<{ id: BudgetGroup; label: string; hint: string }> = [
  { id: "fixed", label: "Fixed", hint: "Same every month: rent, insurance, subscriptions." },
  { id: "non_monthly", label: "Non-monthly", hint: "Irregular or yearly: travel, gifts, annual bills. Rollover builds toward them." },
  { id: "flex", label: "Flex", hint: "Day-to-day spending, watched as one number." },
];

export type BudgetLineView = {
  category_id: string;
  name: string;
  group: BudgetGroup;
  planned: number;
  spent: number;
  rollover: boolean;
  carried_in: number;
  remaining: number;
};

export type BudgetMonth = {
  month: string;
  groups: Array<{ id: BudgetGroup; label: string; planned: number; spent: number; remaining: number; lines: BudgetLineView[] }>;
  unbudgeted: Array<{ category_id: string; name: string; spent: number }>;
  planned_total: number;
  spent_total: number;
};

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function previousMonths(from: string, until: string): string[] {
  const out: string[] = [];
  let [year, month] = from.split("-").map(Number);
  const [endYear, endMonth] = until.split("-").map(Number);
  while (year < endYear || (year === endYear && month < endMonth)) {
    out.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return out;
}

/** Money spent in one category in one month; hidden rows never count. */
export function spentIn(categoryId: string, month: string, rows: TransactionRow[]): number {
  return round(
    rows
      .filter((tx) => !tx.hidden && tx.category_id === categoryId && tx.date.startsWith(month))
      .reduce((total, tx) => total - tx.amount, 0),
  );
}

export function budgetMonth(month: string, rows = store().transactions(), lines = store().budgetLines()): BudgetMonth {
  const views: BudgetLineView[] = lines.map((line) => {
    const spent = spentIn(line.category_id, month, rows);
    let carried = 0;
    if (line.rollover) {
      const start = line.rollover_start_month ?? month;
      carried = line.rollover_start_balance;
      for (const earlier of previousMonths(start, month)) carried += line.amount - spentIn(line.category_id, earlier, rows);
    }
    return {
      category_id: line.category_id,
      name: categoryById(line.category_id)?.name ?? line.category_id,
      group: line.group,
      planned: line.amount,
      spent,
      rollover: line.rollover,
      carried_in: round(carried),
      remaining: round(carried + line.amount - spent),
    };
  });
  const groups = BUDGET_GROUPS.map((group) => {
    const groupLines = views.filter((line) => line.group === group.id).sort((a, b) => a.name.localeCompare(b.name));
    const planned = round(groupLines.reduce((total, line) => total + line.planned, 0));
    const spent = round(groupLines.reduce((total, line) => total + line.spent, 0));
    // Flex is one number: plan minus spend, rollovers excluded (Monarch rule).
    const remaining = group.id === "flex" ? round(planned - spent) : round(groupLines.reduce((total, line) => total + line.remaining, 0));
    return { id: group.id, label: group.label, planned, spent, remaining, lines: groupLines };
  });
  const budgeted = new Set(lines.map((line) => line.category_id));
  const unbudgeted = CATEGORIES.filter((category) => category.type === "expense" && !budgeted.has(category.id))
    .map((category) => ({ category_id: category.id, name: category.name, spent: spentIn(category.id, month, rows) }))
    .filter((row) => row.spent > 0)
    .sort((a, b) => b.spent - a.spent);
  return {
    month,
    groups,
    unbudgeted,
    planned_total: round(groups.reduce((total, group) => total + group.planned, 0)),
    spent_total: round(views.reduce((total, line) => total + line.spent, 0) + unbudgeted.reduce((total, row) => total + row.spent, 0)),
  };
}

export type BudgetLineInput = {
  category_id: string;
  group: BudgetGroup;
  amount: number;
  rollover?: boolean;
  rollover_start_balance?: number;
};

export function setBudgetLine(input: BudgetLineInput, month: string, now = new Date()): BudgetLineRow {
  const category = categoryById(input.category_id);
  if (!category || category.type !== "expense") throw new Error("Pick a spending category.");
  if (!Number.isFinite(input.amount) || input.amount < 0) throw new Error("Enter a monthly amount of 0 or more.");
  if (!BUDGET_GROUPS.some((group) => group.id === input.group)) throw new Error("Unknown budget group.");
  const existing = store().budgetLines().find((line) => line.category_id === input.category_id);
  const rollover = input.rollover ?? existing?.rollover ?? false;
  const row: BudgetLineRow = {
    category_id: input.category_id,
    group: input.group,
    amount: round(input.amount),
    rollover,
    // Turning rollover on starts counting from this month.
    rollover_start_month: rollover ? existing?.rollover_start_month ?? month : null,
    rollover_start_balance: rollover ? round(input.rollover_start_balance ?? existing?.rollover_start_balance ?? 0) : 0,
    updated_at: now.toISOString(),
  };
  store().replaceBudgetLines([...store().budgetLines().filter((line) => line.category_id !== input.category_id), row]);
  return row;
}

export function removeBudgetLine(categoryId: string) {
  store().replaceBudgetLines(store().budgetLines().filter((line) => line.category_id !== categoryId));
}

/** Suggest a plan from the average of the last three months before `month` that have data. */
export function suggestBudget(month: string, rows = store().transactions()) {
  const months = [...new Set(rows.map((tx) => tx.date.slice(0, 7)))].filter((m) => m < month).sort().slice(-3);
  if (months.length === 0) return [];
  return CATEGORIES.filter((category) => category.type === "expense")
    .map((category) => ({
      category_id: category.id,
      name: category.name,
      average: round(months.reduce((total, m) => total + spentIn(category.id, m, rows), 0) / months.length),
    }))
    .filter((row) => row.average > 0)
    .sort((a, b) => b.average - a.average);
}

