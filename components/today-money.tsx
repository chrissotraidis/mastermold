import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { isBill } from "@/lib/bills";
import { budgetMonth } from "@/src/db/budgets";
import { store } from "@/src/db/store";
import { cashFlow, detectRecurring } from "@/src/db/transactions";

const money = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "USD" });
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * Monarch's dashboard in one panel: this month's spending against the budget,
 * the next bills, and the latest transactions. Hidden until transactions exist.
 */
export function TodayMoney({ today = new Date().toISOString().slice(0, 10) }: { today?: string }) {
  const rows = store().transactions();
  if (!rows.length) return null;
  const month = today.slice(0, 7);
  const flow = cashFlow(month, rows);
  const budget = budgetMonth(month, rows);
  const planned = budget.planned_total;
  const spent = planned > 0 ? budget.spent_total : flow.expenses;
  const pct = planned > 0 ? Math.min(100, Math.round((spent / planned) * 100)) : 0;
  const bills = detectRecurring(rows, today)
    .filter((item) => isBill(item) && item.next_date >= today)
    .sort((a, b) => a.next_date.localeCompare(b.next_date))
    .slice(0, 3);
  const recent = [...rows].filter((tx) => !tx.hidden).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);

  return (
    <Panel aria-labelledby="today-money-title" data-testid="today-money">
      <PanelHeader
        titleId="today-money-title"
        eyebrow="This month"
        title="Money"
        action={
          <Link href="/transactions" className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-violet hover:text-violet-soft">
            Transactions <ArrowRight aria-hidden="true" className="size-3.5" />
          </Link>
        }
      />
      <div className="grid gap-5 p-5 pt-3 md:grid-cols-3">
        <Link href="/budget" className="mm-row grid content-start gap-2 rounded-xl p-2 -m-2">
          <span className="text-xs text-outline">{planned > 0 ? "Spent of budget" : "Spent"}</span>
          <span className="mm-num font-display text-2xl font-semibold text-on-surface">
            {money(spent)}
            {planned > 0 ? <span className="text-sm font-normal text-outline"> of {money(planned)}</span> : null}
          </span>
          {planned > 0 ? (
            <span className="h-1.5 overflow-hidden rounded-full bg-surface-high" role="progressbar" aria-label="Budget used" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <span className={`block h-full rounded-full ${spent > planned ? "bg-critical" : "bg-violet"}`} style={{ width: `${pct}%` }} />
            </span>
          ) : (
            <span className="text-xs text-violet">Set a budget →</span>
          )}
          <span className="text-xs text-outline">Income {money(flow.income)}</span>
        </Link>
        <div className="grid content-start gap-2">
          <span className="text-xs text-outline">Next bills</span>
          {bills.length ? (
            <ul className="grid gap-1.5 text-sm" data-testid="today-bills">
              {bills.map((bill) => (
                <li key={bill.merchant} className="flex justify-between gap-3">
                  <span className="truncate text-on-surface">{bill.merchant}</span>
                  <span className="mm-num shrink-0 text-on-surface-variant">{day(bill.next_date)} · {money(-bill.typical_amount)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-outline">None found yet. Bills show up after two months of the same charge.</p>
          )}
        </div>
        <div className="grid content-start gap-2">
          <span className="text-xs text-outline">Latest</span>
          <ul className="grid gap-1.5 text-sm">
            {recent.map((tx) => (
              <li key={tx.id} className="flex justify-between gap-3">
                <span className="truncate text-on-surface">{tx.merchant}</span>
                <span className={`mm-num shrink-0 ${tx.amount > 0 ? "text-engine" : "text-on-surface-variant"}`}>
                  {tx.amount > 0 ? "+" : "−"}{money(Math.abs(tx.amount))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Panel>
  );
}
