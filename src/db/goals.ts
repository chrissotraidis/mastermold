/**
 * Monarch-style savings goals: a target, an optional date, the account that
 * holds the money, and a starting balance. Progress comes from transactions
 * linked to the goal (by hand or by a rule with an account condition). Goals
 * track only; they never move or reserve money.
 */
import { randomUUID } from "node:crypto";
import { store, type GoalRow, type TransactionRow } from "./store";

export type GoalInput = {
  name: string;
  target_amount: number;
  target_date?: string | null;
  account_id?: string | null;
  starting_balance?: number;
};

export type GoalView = GoalRow & {
  saved: number;
  remaining: number;
  percent: number;
  contributions: number;
  /** Money needed per month to hit the date; null without a date. */
  monthly_needed: number | null;
  /** Average of the last three months of linked contributions. */
  monthly_pace: number;
  status: "done" | "on_track" | "behind" | "no_date";
  /** Month the pace reaches the target (YYYY-MM), when there is a pace. */
  projected_month: string | null;
};

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function validate(input: GoalInput) {
  if (!input.name.trim()) throw new Error("Name the goal.");
  if (!Number.isFinite(input.target_amount) || input.target_amount <= 0) throw new Error("Enter a target above zero.");
  if (input.target_date && !/^\d{4}-\d{2}-\d{2}$/.test(input.target_date)) throw new Error("Use a date like 2027-06-01.");
  if (input.starting_balance !== undefined && (!Number.isFinite(input.starting_balance) || input.starting_balance < 0)) {
    throw new Error("Starting balance can't be negative.");
  }
}

export function createGoal(input: GoalInput, now = new Date()): GoalRow {
  validate(input);
  const stamp = now.toISOString();
  const goal: GoalRow = {
    id: `goal_${randomUUID()}`,
    name: input.name.trim().slice(0, 80),
    target_amount: round(input.target_amount),
    target_date: input.target_date || null,
    account_id: input.account_id || null,
    starting_balance: round(input.starting_balance ?? 0),
    created_at: stamp,
    updated_at: stamp,
  };
  store().replaceGoals([...store().goals(), goal]);
  return goal;
}

export function updateGoal(id: string, input: GoalInput, now = new Date()): GoalRow {
  validate(input);
  const current = store().goals().find((goal) => goal.id === id);
  if (!current) throw new Error("Goal not found.");
  const next: GoalRow = {
    ...current,
    name: input.name.trim().slice(0, 80),
    target_amount: round(input.target_amount),
    target_date: input.target_date || null,
    account_id: input.account_id || null,
    starting_balance: round(input.starting_balance ?? current.starting_balance),
    updated_at: now.toISOString(),
  };
  store().replaceGoals(store().goals().map((goal) => (goal.id === id ? next : goal)));
  return next;
}

/** Deleting a goal unlinks its transactions; the transactions themselves stay. */
export function deleteGoal(id: string) {
  store().replaceGoals(store().goals().filter((goal) => goal.id !== id));
  const linked = store().transactions().filter((tx) => tx.goal_id === id);
  store().upsertTransactions(linked.map((tx) => ({ ...tx, goal_id: null })));
}

/**
 * A linked row moves money toward the goal, whatever its sign, except a
 * withdrawal from the goal's own account, which moves money away.
 */
export function contributionValue(goal: GoalRow, tx: TransactionRow) {
  if (goal.account_id && tx.account_id === goal.account_id && tx.amount < 0) return tx.amount;
  return Math.abs(tx.amount);
}

function monthsBetween(from: string, to: string) {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

function addMonths(month: string, count: number) {
  const [year, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, m - 1 + count, 1));
  return date.toISOString().slice(0, 7);
}

export function goalView(goal: GoalRow, rows = store().transactions(), today = new Date().toISOString().slice(0, 10)): GoalView {
  const linked = rows.filter((tx) => tx.goal_id === goal.id);
  const contributions = round(linked.reduce((total, tx) => total + contributionValue(goal, tx), 0));
  const saved = round(goal.starting_balance + contributions);
  const remaining = round(Math.max(0, goal.target_amount - saved));
  const thisMonth = today.slice(0, 7);
  const recent = [1, 2, 3].map((back) => addMonths(thisMonth, -back));
  const monthly_pace = round(
    linked.filter((tx) => recent.includes(tx.date.slice(0, 7))).reduce((total, tx) => total + contributionValue(goal, tx), 0) / 3,
  );
  const monthsLeft = goal.target_date ? Math.max(1, monthsBetween(thisMonth, goal.target_date.slice(0, 7))) : null;
  const monthly_needed = monthsLeft === null ? null : round(remaining / monthsLeft);
  const status: GoalView["status"] =
    remaining === 0 ? "done" : monthly_needed === null ? "no_date" : monthly_pace >= monthly_needed ? "on_track" : "behind";
  const projected_month = remaining === 0 ? thisMonth : monthly_pace > 0 ? addMonths(thisMonth, Math.ceil(remaining / monthly_pace)) : null;
  return {
    ...goal,
    saved,
    remaining,
    percent: Math.min(100, Math.round((saved / goal.target_amount) * 100)),
    contributions,
    monthly_needed,
    monthly_pace,
    status,
    projected_month,
  };
}

export function goalViews(rows = store().transactions(), today?: string): GoalView[] {
  return store().goals().map((goal) => goalView(goal, rows, today));
}

export function linkTransactionsToGoal(goalId: string | null, ids: string[], now = new Date()) {
  if (goalId && !store().goals().some((goal) => goal.id === goalId)) throw new Error("Goal not found.");
  const wanted = new Set(ids);
  const rows = store().transactions().filter((tx) => wanted.has(tx.id));
  store().upsertTransactions(rows.map((tx) => ({ ...tx, goal_id: goalId, updated_at: now.toISOString() })));
  return rows.length;
}

