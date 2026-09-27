import { store } from "./store";
import { CATEGORIES, cashFlow, transactionMonths } from "./transactions";
import { BUDGET_GROUPS, budgetMonth, suggestBudget, type BudgetGroup } from "./budgets";

const FIXED = new Set(["rent", "mortgage", "utilities", "phone", "internet", "insurance", "software", "streaming"]);
const NON_MONTHLY = new Set(["travel", "gifts", "taxes", "home-improvement", "medical"]);

/** Default group for a suggested line, matching Monarch's examples. */
export function defaultGroup(categoryId: string): BudgetGroup {
  if (FIXED.has(categoryId)) return "fixed";
  if (NON_MONTHLY.has(categoryId)) return "non_monthly";
  return "flex";
}

export function budgetPayload(month?: string | null) {
  const rows = store().transactions();
  const current = new Date().toISOString().slice(0, 7);
  const months = [...new Set([current, ...transactionMonths(rows)])].sort().reverse();
  const selected = month && /^\d{4}-\d{2}$/.test(month) ? month : current;
  return {
    month: selected,
    months,
    groups: BUDGET_GROUPS,
    budget: budgetMonth(selected, rows),
    income: cashFlow(selected, rows).income,
    suggestions: suggestBudget(selected, rows).map((row) => ({ ...row, group: defaultGroup(row.category_id) })),
    categories: CATEGORIES.filter((category) => category.type === "expense"),
  };
}

