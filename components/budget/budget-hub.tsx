"use client";

import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import { PiggyBank, Plus, Repeat, Trash2, Wand2 } from "lucide-react";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { StatTile } from "@/components/ui/stat";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { BudgetGroup, BudgetLineView, BudgetMonth } from "@/src/db/budgets";
import type { Category } from "@/src/db/transactions";

export type BudgetData = {
  month: string;
  months: string[];
  groups: Array<{ id: BudgetGroup; label: string; hint: string }>;
  budget: BudgetMonth;
  income: number;
  suggestions: Array<{ category_id: string; name: string; average: number; group: BudgetGroup }>;
  categories: Category[];
};

const field = "min-h-11 rounded-xl border border-outline-variant/60 bg-surface-lowest/70 px-3 text-sm text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet sm:min-h-10";
const primaryButton = "inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet px-4 text-sm font-semibold text-void shadow-glow transition hover:bg-violet/90 disabled:opacity-50 sm:min-h-10";
const ghostButton = "inline-flex min-h-11 items-center gap-2 rounded-xl border border-outline-variant/60 px-3 text-sm font-semibold text-on-surface transition hover:border-violet/50 disabled:opacity-50 sm:min-h-10";

export function BudgetHub({ initial }: { initial: BudgetData }) {
  const [data, setData] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [newCategory, setNewCategory] = useState("");
  const [newGroup, setNewGroup] = useState<BudgetGroup>("flex");
  const [newAmount, setNewAmount] = useState("");

  const post = useCallback((body: Record<string, unknown>, success?: string) => {
    startTransition(async () => {
      const response = await fetch("/api/budget", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ month: data.month, ...body }),
      });
      const json = await response.json();
      if (!response.ok) {
        toast({ title: "Couldn't save", description: json.error, tone: "error" });
        return;
      }
      setData(json);
      if (success) toast({ title: success });
    });
  }, [data.month]);

  const selectMonth = (month: string) =>
    startTransition(async () => {
      const response = await fetch(`/api/budget?month=${month}`, { cache: "no-store" });
      if (response.ok) setData(await response.json());
    });

  const { budget } = data;
  const hasLines = budget.groups.some((group) => group.lines.length > 0);
  const left = budget.planned_total - budget.spent_total;
  const budgeted = new Set(budget.groups.flatMap((group) => group.lines.map((line) => line.category_id)));
  const available = data.categories.filter((category) => !budgeted.has(category.id));

  return (
    <div className="grid w-full grid-cols-1 gap-6 [&>*]:min-w-0">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="mm-eyebrow">A plan for this month</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-on-surface sm:text-4xl">Budget</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-on-surface-variant">
            Plan spending in three groups. Spending comes from your <Link href="/transactions" className="font-semibold text-violet hover:text-violet-soft">Transactions</Link>; hidden rows and transfers never count.
          </p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Month">
          {data.months.slice(0, 6).map((month) => (
            <button
              key={month}
              type="button"
              onClick={() => selectMonth(month)}
              aria-pressed={month === data.month}
              className={cn("min-h-9 rounded-full border px-3 text-xs font-semibold transition", month === data.month ? "border-violet bg-violet text-void" : "border-outline-variant/60 text-on-surface-variant hover:text-on-surface")}
            >
              {monthLabel(month)}
            </button>
          ))}
        </div>
      </header>

      <section aria-label="Budget summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="budget-summary">
        <StatTile label="Income" value={money(data.income)} hint={monthLabel(data.month)} />
        <StatTile label="Planned" value={money(budget.planned_total)} hint={data.income > 0 ? `${Math.round((budget.planned_total / data.income) * 100)}% of income` : "no income yet"} />
        <StatTile label="Spent" value={money(budget.spent_total)} />
        {hasLines ? (
          <StatTile emphasis label="Left to spend" value={money(left)} deltaTone={left >= 0 ? "up" : "down"} hint={left >= 0 ? "under plan" : "over plan"} />
        ) : (
          <StatTile emphasis label="Left to spend" value="—" hint="set a budget first" />
        )}
      </section>

      {!hasLines ? (
        <Panel className="p-2">
          <EmptyState
            icon={PiggyBank}
            title="No budget yet"
            description={
              data.suggestions.length
                ? `Start from what you actually spent: ${data.suggestions.length} categories averaged over your last months. You can change every number after.`
                : "Import a few months of transactions first, or add categories one at a time below."
            }
          />
          {data.suggestions.length ? (
            <div className="flex justify-center pb-5">
              <button type="button" className={primaryButton} disabled={pending} onClick={() => post({ action: "apply_suggestions" }, "Budget created from your spending")}>
                <Wand2 aria-hidden="true" className="size-4" /> Start from my spending
              </button>
            </div>
          ) : null}
        </Panel>
      ) : null}

      {budget.groups.map((group) => {
        const meta = data.groups.find((item) => item.id === group.id)!;
        if (group.lines.length === 0) return null;
        return (
          <Panel key={group.id} aria-labelledby={`budget-${group.id}`} data-testid={`budget-group-${group.id}`}>
            <PanelHeader
              titleId={`budget-${group.id}`}
              title={group.label}
              description={meta.hint}
              action={
                <span className="mm-num text-right text-sm">
                  <span className={cn("font-semibold", group.remaining >= 0 ? "text-engine" : "text-critical")}>{money(group.remaining)}</span>
                  <span className="text-outline"> left of {money(group.planned)}</span>
                </span>
              }
            />
            <ul className="divide-y divide-outline-variant/30 p-2">
              {group.lines.map((line) => (
                <BudgetLineRow key={line.category_id} line={line} pending={pending} onSave={(body) => post({ action: "set_line", category_id: line.category_id, group: line.group, ...body })} onRemove={() => post({ action: "remove_line", category_id: line.category_id }, `${line.name} removed`)} />
              ))}
            </ul>
          </Panel>
        );
      })}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Panel aria-labelledby="budget-add-title">
          <PanelHeader titleId="budget-add-title" title="Add a category" description="Pick a group; you can move it later." />
          <form
            className="flex flex-wrap items-end gap-2 p-5 pt-3"
            onSubmit={(event) => {
              event.preventDefault();
              post({ action: "set_line", category_id: newCategory, group: newGroup, amount: Number(newAmount) }, "Added to budget");
              setNewCategory("");
              setNewAmount("");
            }}
          >
            <label className="grid flex-1 gap-1 text-xs font-semibold text-on-surface-variant">
              Category
              <select value={newCategory} onChange={(event) => setNewCategory(event.target.value)} className={cn(field, "w-full")}>
                <option value="">Choose…</option>
                {available.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-on-surface-variant">
              Group
              <select value={newGroup} onChange={(event) => setNewGroup(event.target.value as BudgetGroup)} className={field}>
                {data.groups.map((group) => <option key={group.id} value={group.id}>{group.label}</option>)}
              </select>
            </label>
            <label className="grid w-28 gap-1 text-xs font-semibold text-on-surface-variant">
              Per month
              <input inputMode="decimal" value={newAmount} onChange={(event) => setNewAmount(event.target.value)} placeholder="0" className={cn(field, "w-full")} />
            </label>
            <button type="submit" className={ghostButton} disabled={pending || !newCategory || !(Number(newAmount) >= 0) || newAmount === ""}>
              <Plus aria-hidden="true" className="size-4" /> Add
            </button>
          </form>
        </Panel>

        <Panel aria-labelledby="budget-unbudgeted-title">
          <PanelHeader titleId="budget-unbudgeted-title" title="Not in the budget" description="Spending this month in categories without a plan." />
          <ul className="grid gap-1 p-3 pt-3" data-testid="budget-unbudgeted">
            {budget.unbudgeted.length === 0 ? <li className="px-2 text-sm text-on-surface-variant">Everything you spent on is budgeted.</li> : null}
            {budget.unbudgeted.map((row) => (
              <li key={row.category_id} className="flex items-center justify-between gap-3 rounded-xl px-2 py-2 text-sm">
                <span className="text-on-surface">{row.name}</span>
                <span className="flex items-center gap-2">
                  <span className="mm-num font-semibold text-on-surface">{money(row.spent)}</span>
                  <button type="button" className="min-h-9 rounded-lg px-2 text-xs font-semibold text-violet hover:bg-violet/10" onClick={() => post({ action: "set_line", category_id: row.category_id, group: "flex", amount: Math.ceil(row.spent / 5) * 5 }, `${row.name} added to Flex`)}>
                    Budget it
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function BudgetLineRow({ line, pending, onSave, onRemove }: {
  line: BudgetLineView;
  pending: boolean;
  onSave: (body: Record<string, unknown>) => void;
  onRemove: () => void;
}) {
  const [amount, setAmount] = useState(String(line.planned));
  const available = line.planned + line.carried_in;
  const pct = available > 0 ? Math.min(100, (line.spent / available) * 100) : line.spent > 0 ? 100 : 0;
  const over = line.remaining < 0;
  return (
    <li className="grid gap-2 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-x-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold text-on-surface">{line.name}</span>
            {line.rollover ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-violet/15 px-1.5 text-[10px] font-semibold text-violet" title="Unused money carries into next month">
                <Repeat aria-hidden="true" className="size-3" /> {line.carried_in >= 0 ? "+" : "−"}{money(Math.abs(line.carried_in))} carried
              </span>
            ) : null}
          </span>
          <span className="mm-num shrink-0 text-xs text-on-surface-variant">
            {money(line.spent)} of {money(available)} ·{" "}
            <span className={cn("font-semibold", over ? "text-critical" : "text-engine")}>{over ? `${money(-line.remaining)} over` : `${money(line.remaining)} left`}</span>
          </span>
        </div>
        <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-surface-high" aria-hidden="true">
          <span className={cn("block h-full rounded-full", over ? "bg-critical" : pct > 85 ? "bg-caution" : "bg-violet")} style={{ width: `${pct}%` }} />
        </span>
      </div>
      <div className="flex items-center justify-end gap-1">
        <label className="sr-only" htmlFor={`plan-${line.category_id}`}>Monthly plan for {line.name}</label>
        <input
          id={`plan-${line.category_id}`}
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          onBlur={() => {
            if (Number(amount) !== line.planned && Number(amount) >= 0) onSave({ amount: Number(amount) });
          }}
          className={cn(field, "mm-num w-24 text-right")}
        />
        <button
          type="button"
          aria-pressed={line.rollover}
          aria-label={line.rollover ? `Turn off rollover for ${line.name}` : `Turn on rollover for ${line.name}`}
          title="Rollover: carry unused money into next month"
          disabled={pending}
          onClick={() => onSave({ amount: line.planned, rollover: !line.rollover })}
          className={cn("grid size-11 place-items-center rounded-xl transition sm:size-9", line.rollover ? "bg-violet/15 text-violet" : "text-outline hover:bg-surface-high hover:text-on-surface")}
        >
          <Repeat className="size-4" />
        </button>
        <button type="button" aria-label={`Remove ${line.name} from the budget`} title="Remove" disabled={pending} onClick={onRemove} className="grid size-11 place-items-center rounded-xl text-outline transition hover:bg-surface-high hover:text-on-surface sm:size-9">
          <Trash2 className="size-4" />
        </button>
      </div>
    </li>
  );
}

function money(value: number) {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: Math.abs(value) >= 1000 ? 0 : 2 });
}

function monthLabel(month: string) {
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year, m - 1, 1)).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

