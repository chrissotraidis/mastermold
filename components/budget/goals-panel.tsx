"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Flag, Link2, Plus, Trash2 } from "lucide-react";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { GoalView } from "@/src/db/goals";
import type { TransactionRow } from "@/src/db/store";

type GoalsData = {
  goals: GoalView[];
  candidates: TransactionRow[];
  accounts: Array<{ id: string; name: string }>;
};

const field = "min-h-11 w-full rounded-xl border border-outline-variant/60 bg-surface-lowest/70 px-3 text-sm text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet sm:min-h-10";
const primaryButton = "inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet px-4 text-sm font-semibold text-void shadow-glow transition hover:bg-violet/90 disabled:opacity-50 sm:min-h-10";
const ghostButton = "inline-flex min-h-11 items-center gap-2 rounded-xl border border-outline-variant/60 px-3 text-sm font-semibold text-on-surface transition hover:border-violet/50 disabled:opacity-50 sm:min-h-10";

const STATUS: Record<GoalView["status"], { label: string; tone: string }> = {
  done: { label: "Reached", tone: "bg-engine/15 text-engine" },
  on_track: { label: "On track", tone: "bg-engine/15 text-engine" },
  behind: { label: "Behind", tone: "bg-caution/15 text-caution" },
  no_date: { label: "No date", tone: "bg-surface-high text-outline" },
};

/** Savings goals, Monarch-style: they track progress and never move money. */
export function GoalsPanel() {
  const [data, setData] = useState<GoalsData | null>(null);
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<GoalView | "new" | null>(null);

  useEffect(() => {
    void fetch("/api/goals", { cache: "no-store" }).then(async (response) => response.ok && setData(await response.json()));
  }, []);

  const post = useCallback((body: Record<string, unknown>, success?: string, after?: () => void) => {
    startTransition(async () => {
      const response = await fetch("/api/goals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const json = await response.json();
      if (!response.ok) {
        toast({ title: "Couldn't save", description: json.error, tone: "error" });
        return;
      }
      setData(json);
      after?.();
      if (success) toast({ title: success });
    });
  }, []);

  if (!data) return null;
  const openGoals = data.goals.filter((goal) => goal.status !== "done");

  return (
    <Panel id="goals" aria-labelledby="goals-title" className="scroll-mt-24" data-testid="goals-panel">
      <PanelHeader
        titleId="goals-title"
        title="Savings goals"
        description="Track progress toward a target. Link the transfers that fund it; goals never move money."
        action={
          <button type="button" className={ghostButton} onClick={() => setEditing("new")}>
            <Plus aria-hidden="true" className="size-4" /> New goal
          </button>
        }
      />
      <div className="grid gap-3 p-5 pt-4 md:grid-cols-2">
        {data.goals.length === 0 ? (
          <p className="text-sm text-on-surface-variant md:col-span-2">No goals yet. An emergency fund or a trip is a good first one.</p>
        ) : null}
        {data.goals.map((goal) => (
          <article key={goal.id} className="grid gap-2 rounded-2xl border border-outline-variant/50 p-4" data-testid="goal-card">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-on-surface">{goal.name}</h3>
                <p className="mm-num text-xs text-on-surface-variant">
                  {money(goal.saved)} of {money(goal.target_amount)} · {goal.percent}%
                </p>
              </div>
              <span className={cn("shrink-0 rounded-full px-2 text-[11px] font-semibold", STATUS[goal.status].tone)}>{STATUS[goal.status].label}</span>
            </div>
            <span className="block h-2 overflow-hidden rounded-full bg-surface-high" aria-hidden="true">
              <span className="block h-full rounded-full bg-violet" style={{ width: `${goal.percent}%` }} />
            </span>
            <p className="text-xs leading-5 text-outline">{paceLine(goal)}</p>
            <div className="flex gap-1">
              <button type="button" className="min-h-9 rounded-lg px-2 text-xs font-semibold text-violet hover:bg-violet/10" onClick={() => setEditing(goal)}>
                Edit
              </button>
              <button
                type="button"
                aria-label={`Delete goal ${goal.name}`}
                className="grid size-9 place-items-center rounded-lg text-outline hover:bg-surface-high hover:text-on-surface"
                onClick={() => post({ action: "delete", id: goal.id }, "Goal deleted")}
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          </article>
        ))}
      </div>

      {openGoals.length > 0 && data.candidates.length > 0 ? (
        <div className="border-t border-outline-variant/40 p-5 pt-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-on-surface">
            <Link2 aria-hidden="true" className="size-4 text-violet" /> Recent transfers to link
          </h3>
          <ul className="mt-2 grid gap-1" data-testid="goal-candidates">
            {data.candidates.map((tx) => (
              <li key={tx.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-2 py-2 text-sm">
                <span className="min-w-0 truncate text-on-surface">
                  {tx.merchant} <span className="text-xs text-outline">· {new Date(`${tx.date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="mm-num font-semibold text-on-surface">{money(Math.abs(tx.amount))}</span>
                  <label className="sr-only" htmlFor={`link-${tx.id}`}>Link {tx.merchant} on {tx.date} to a goal</label>
                  <select
                    id={`link-${tx.id}`}
                    defaultValue=""
                    disabled={pending}
                    onChange={(event) => event.target.value && post({ action: "link", goal_id: event.target.value, ids: [tx.id] }, "Linked to goal")}
                    className={cn(field, "w-auto")}
                  >
                    <option value="">Link to…</option>
                    {openGoals.map((goal) => <option key={goal.id} value={goal.id}>{goal.name}</option>)}
                  </select>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <GoalSheet
        goal={editing}
        accounts={data.accounts}
        pending={pending}
        onClose={() => setEditing(null)}
        onSave={(body) => post(editing && editing !== "new" ? { action: "update", id: editing.id, ...body } : { action: "create", ...body }, editing === "new" ? "Goal created" : "Goal saved", () => setEditing(null))}
      />
    </Panel>
  );
}

function GoalSheet({ goal, accounts, pending, onClose, onSave }: {
  goal: GoalView | "new" | null;
  accounts: Array<{ id: string; name: string }>;
  pending: boolean;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const existing = goal && goal !== "new" ? goal : null;
  const [form, setForm] = useState({ name: "", target_amount: "", target_date: "", account_id: "", starting_balance: "" });
  const [seeded, setSeeded] = useState<string | null>(null);
  const key = goal === null ? null : existing ? existing.id : "new";
  if (key !== seeded) {
    setSeeded(key);
    setForm({
      name: existing?.name ?? "",
      target_amount: existing ? String(existing.target_amount) : "",
      target_date: existing?.target_date ?? "",
      account_id: existing?.account_id ?? "",
      starting_balance: existing ? String(existing.starting_balance) : "",
    });
  }
  const set = (name: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((current) => ({ ...current, [name]: event.target.value }));
  const valid = form.name.trim() && Number(form.target_amount) > 0;
  return (
    <Sheet
      open={goal !== null}
      onClose={onClose}
      title={existing ? "Edit goal" : "New goal"}
      description="Master Mold works out the monthly amount needed to hit your date."
      footer={
        <div className="flex justify-end">
          <button type="button" className={primaryButton} disabled={!valid || pending} onClick={() => onSave({ ...form, target_amount: Number(form.target_amount) })}>
            <Flag aria-hidden="true" className="size-4" /> {existing ? "Save goal" : "Create goal"}
          </button>
        </div>
      }
    >
      <div className="grid gap-4">
        <div className="grid gap-1 text-sm font-semibold text-on-surface">
          <label htmlFor="goal-name">Name</label>
          <input id="goal-name" value={form.name} onChange={set("name")} placeholder="e.g. Emergency fund" className={field} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1 text-sm font-semibold text-on-surface">
            <label htmlFor="goal-target">Target amount</label>
            <input id="goal-target" inputMode="decimal" value={form.target_amount} onChange={set("target_amount")} placeholder="10000" className={field} />
          </div>
          <div className="grid gap-1 text-sm font-semibold text-on-surface">
            <label htmlFor="goal-date">Target date (optional)</label>
            <input id="goal-date" type="date" value={form.target_date} onChange={set("target_date")} className={field} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1 text-sm font-semibold text-on-surface">
            <label htmlFor="goal-start">Already saved</label>
            <input id="goal-start" inputMode="decimal" value={form.starting_balance} onChange={set("starting_balance")} placeholder="0" className={field} />
          </div>
          <div className="grid gap-1 text-sm font-semibold text-on-surface">
            <label htmlFor="goal-account">Account (optional)</label>
            <select id="goal-account" value={form.account_id} onChange={set("account_id")} className={field}>
              <option value="">Any account</option>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
          </div>
        </div>
      </div>
    </Sheet>
  );
}

function paceLine(goal: GoalView) {
  if (goal.status === "done") return "Target reached.";
  const pace = goal.monthly_pace > 0 ? `You're adding about ${money(goal.monthly_pace)}/month` : "Nothing linked in the last three months";
  if (goal.monthly_needed !== null && goal.target_date) {
    return `${pace}; ${money(goal.monthly_needed)}/month reaches it by ${monthLabel(goal.target_date.slice(0, 7))}.`;
  }
  return goal.projected_month ? `${pace}; at that rate you get there in ${monthLabel(goal.projected_month)}.` : `${pace}.`;
}

function money(value: number) {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: Math.abs(value) >= 1000 ? 0 : 2 });
}

function monthLabel(month: string) {
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year, m - 1, 1)).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}
