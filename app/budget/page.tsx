import { AppShell } from "@/components/app-shell";
import { BudgetHub } from "@/components/budget/budget-hub";
import { budgetPayload } from "@/src/db/budget-view";
import { store } from "@/src/db/store";

export const dynamic = "force-dynamic";

export default function BudgetPage() {
  return (
    <AppShell dataMode={store().transactions().length > 0 ? "Your entries" : "Sample data"}>
      <BudgetHub initial={budgetPayload()} />
    </AppShell>
  );
}

