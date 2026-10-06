import { AppShell } from "@/components/app-shell";
import { TransactionsHub } from "@/components/transactions/transactions-hub";
import { transactionsPayload } from "@/src/db/transactions-view";

export const dynamic = "force-dynamic";

export default function TransactionsPage() {
  const initial = transactionsPayload();
  return (
    <AppShell dataMode={initial.transactions.length > 0 ? "Your entries" : "Sample data"}>
      <TransactionsHub initial={initial} />
    </AppShell>
  );
}
