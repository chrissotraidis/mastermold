/**
 * Everything the Transactions page needs in one read, shared by the page and
 * /api/transactions so the two never drift.
 */
import { store } from "./store";
import { CATEGORIES, cashFlow, detectRecurring, transactionMonths } from "./transactions";

export type CashFlowPoint = { month: string; income: number; expenses: number };

export function transactionsPayload(month?: string | null) {
  const rows = store().transactions();
  const months = transactionMonths(rows);
  const current = month && /^\d{4}-\d{2}$/.test(month) ? month : months[0] ?? new Date().toISOString().slice(0, 7);
  // Oldest first, up to a year, for the cash flow bars.
  const history: CashFlowPoint[] = months
    .slice(0, 12)
    .reverse()
    .map((m) => {
      const flow = cashFlow(m, rows);
      return { month: m, income: flow.income, expenses: flow.expenses };
    });
  return {
    month: current,
    months,
    history,
    transactions: rows,
    cash_flow: cashFlow(current, rows),
    categories: CATEGORIES,
    rules: store().transactionRules(),
    recurring: detectRecurring(rows),
    accounts: store().financialAccounts().map((account) => ({ id: account.id, name: account.name })),
  };
}
