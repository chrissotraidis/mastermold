/// <reference types="bun" />
import { beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { __resetStoreForTests, store } from "../src/db/store";
import { addManualTransaction, addRule, importTransactions, parseTransactionCsv } from "../src/db/transactions";
import { createGoal, deleteGoal, goalView, linkTransactionsToGoal, updateGoal } from "../src/db/goals";

beforeEach(() => {
  process.env.MASTERMOLD_DB = join(mkdtempSync(join(tmpdir(), "mm-goals-")), "mastermold.db");
  __resetStoreForTests();
});

describe("goals", () => {
  test("GIVEN a starting balance and linked transfers THEN saved, percent and pace add up", () => {
    const goal = createGoal({ name: "Emergency fund", target_amount: 10_000, target_date: "2027-03-01", starting_balance: 2_000 });
    const rows = ["2026-06-05", "2026-07-05", "2026-08-05"].map((date) =>
      addManualTransaction({ date, amount: -500, description: "Transfer to savings", category_id: "transfer" }),
    );
    linkTransactionsToGoal(goal.id, rows.map((row) => row.id));
    const view = goalView(store().goals()[0], undefined, "2026-09-15");
    expect(view).toMatchObject({ saved: 3_500, remaining: 6_500, percent: 35, monthly_pace: 500, contributions: 1_500 });
    // Sep 2026 → Mar 2027 is 6 months; 6,500 / 6 ≈ 1,083.33 needed > 500 pace.
    expect(view.monthly_needed).toBe(1083.33);
    expect(view.status).toBe("behind");
    expect(view.projected_month).toBe("2027-10");
  });

  test("GIVEN a withdrawal from the goal's own account THEN it counts against the goal", () => {
    const goal = createGoal({ name: "Trip", target_amount: 1_000, account_id: "acct_savings" });
    const deposit = addManualTransaction({ date: "2026-09-01", amount: 400, description: "Deposit", account_id: "acct_savings", category_id: "transfer" });
    const withdrawal = addManualTransaction({ date: "2026-09-10", amount: -150, description: "Withdrawal", account_id: "acct_savings", category_id: "transfer" });
    linkTransactionsToGoal(goal.id, [deposit.id, withdrawal.id]);
    expect(goalView(store().goals()[0], undefined, "2026-09-20")).toMatchObject({ saved: 250, status: "no_date" });
  });

  test("GIVEN a goal-linking rule THEN it needs an account condition and links future imports", () => {
    const goal = createGoal({ name: "House", target_amount: 50_000 });
    expect(() => addRule({ conditions: { merchant: { op: "contains", value: "savings" } }, actions: { link_goal_id: goal.id } })).toThrow("account condition");
    addRule({ conditions: { account_id: "acct_hysa" }, actions: { link_goal_id: goal.id } });
    importTransactions(parseTransactionCsv("Date,Description,Amount\n2026-09-02,TRANSFER IN,1200\n"), "acct_hysa");
    expect(store().transactions()[0].goal_id).toBe(goal.id);
    expect(goalView(store().goals()[0]).saved).toBe(1_200);
  });

  test("GIVEN the target is reached THEN the goal is done; deleting it unlinks but keeps transactions", () => {
    const goal = createGoal({ name: "Laptop", target_amount: 500, starting_balance: 500 });
    expect(goalView(store().goals()[0]).status).toBe("done");
    const row = addManualTransaction({ date: "2026-09-01", amount: -50, description: "Saving", category_id: "transfer" });
    linkTransactionsToGoal(goal.id, [row.id]);
    deleteGoal(goal.id);
    expect(store().goals()).toHaveLength(0);
    expect(store().transactions()[0].goal_id).toBeNull();
  });

  test("GIVEN bad input THEN it is refused; edits keep the id", () => {
    expect(() => createGoal({ name: " ", target_amount: 10 })).toThrow("Name");
    expect(() => createGoal({ name: "X", target_amount: 0 })).toThrow("above zero");
    const goal = createGoal({ name: "Car", target_amount: 8_000 });
    const next = updateGoal(goal.id, { name: "Car fund", target_amount: 9_000 });
    expect(next).toMatchObject({ id: goal.id, name: "Car fund", target_amount: 9_000 });
  });
});

