import { AppShell } from "@/components/app-shell";
import { BudgetHub } from "@/components/budget/budget-hub";
import { GoalsPanel } from "@/components/budget/goals-panel";
import { budgetPayload } from "@/src/db/budget-view";
import { store } from "@/src/db/store";

export const dynamic = "force-dynamic";

export default function BudgetPage() {
  return (
    <AppShell dataMode={store().transactions().length > 0 ? "Your entries" : "Sample data"}>
      <div className="grid w-full grid-cols-1 gap-6 [&>*]:min-w-0">
        <BudgetHub initial={budgetPayload()} />
        <GoalsPanel />
      </div>
    </AppShell>
  );
}

