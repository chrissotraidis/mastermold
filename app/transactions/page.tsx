import { AppShell } from "@/components/app-shell";
import { TransactionsHub } from "@/components/transactions/transactions-hub";
import { store } from "@/src/db/store";
import { CATEGORIES, cashFlow, transactionMonths } from "@/src/db/transactions";

export const dynamic = "force-dynamic";

export default function TransactionsPage() {
  const rows = store().transactions();
  const months = transactionMonths(rows);
  const month = months[0] ?? new Date().toISOString().slice(0, 7);
  return (
    <AppShell dataMode={rows.length > 0 ? "Your entries" : "Sample data"}>
      <TransactionsHub
        initial={{
          month,
          months,
          transactions: rows,
          cash_flow: cashFlow(month, rows),
          categories: CATEGORIES,
          rules: store().transactionRules(),
          accounts: store().financialAccounts().map((account) => ({ id: account.id, name: account.name })),
        }}
      />
    </AppShell>
  );
}

