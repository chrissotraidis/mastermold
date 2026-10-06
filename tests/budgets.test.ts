/// <reference types="bun" />
import { beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { __resetStoreForTests } from "../src/db/store";
import { addManualTransaction, updateTransaction } from "../src/db/transactions";
import { budgetMonth, removeBudgetLine, setBudgetLine, suggestBudget } from "../src/db/budgets";

beforeEach(() => {
  process.env.MASTERMOLD_DB = join(mkdtempSync(join(tmpdir(), "mm-budget-")), "mastermold.db");
  __resetStoreForTests();
});

const spend = (date: string, amount: number, category_id: string) =>
  addManualTransaction({ date, amount: -amount, description: category_id, category_id });

describe("budgets", () => {
  test("GIVEN Monarch's example THEN $50 carried + $100 plan − $75 spent leaves $75", () => {
    setBudgetLine({ category_id: "travel", group: "non_monthly", amount: 100, rollover: true, rollover_start_balance: 50 }, "2026-09");
    spend("2026-09-12", 75, "travel");
    const line = budgetMonth("2026-09").groups.find((group) => group.id === "non_monthly")!.lines[0];
    expect(line).toMatchObject({ planned: 100, spent: 75, carried_in: 50, remaining: 75 });
  });

  test("GIVEN rollover across months THEN unused and overspent amounts carry forward", () => {
    setBudgetLine({ category_id: "gifts", group: "non_monthly", amount: 100, rollover: true }, "2026-07");
    spend("2026-07-05", 20, "gifts"); // +80 carried
    spend("2026-08-05", 150, "gifts"); // −50 → carried 30
    const september = budgetMonth("2026-09").groups.find((group) => group.id === "non_monthly")!.lines[0];
    expect(september).toMatchObject({ carried_in: 30, remaining: 130 });
  });

  test("GIVEN a Flex category with rollover THEN the Flex total ignores the rollover", () => {
    setBudgetLine({ category_id: "restaurants", group: "flex", amount: 300, rollover: true, rollover_start_balance: 200 }, "2026-09");
    setBudgetLine({ category_id: "groceries", group: "flex", amount: 500 }, "2026-09");
    spend("2026-09-03", 100, "restaurants");
    spend("2026-09-04", 450, "groceries");
    const flex = budgetMonth("2026-09").groups.find((group) => group.id === "flex")!;
    expect(flex).toMatchObject({ planned: 800, spent: 550, remaining: 250 });
    expect(flex.lines.find((line) => line.category_id === "restaurants")!.remaining).toBe(400);
  });

  test("GIVEN hidden rows and unbudgeted spending THEN hidden never counts and unbudgeted is listed", () => {
    setBudgetLine({ category_id: "groceries", group: "flex", amount: 500 }, "2026-09");
    const hidden = spend("2026-09-02", 90, "groceries");
    updateTransaction(hidden.id, { hidden: true });
    spend("2026-09-06", 40, "coffee-shops");
    const month = budgetMonth("2026-09");
    expect(month.groups.find((group) => group.id === "flex")!.spent).toBe(0);
    expect(month.unbudgeted).toEqual([{ category_id: "coffee-shops", name: "Coffee shops", spent: 40 }]);
    expect(month.spent_total).toBe(40);
  });

  test("GIVEN invalid input THEN it is refused; removing a line drops it", () => {
    expect(() => setBudgetLine({ category_id: "paychecks", group: "fixed", amount: 10 }, "2026-09")).toThrow("spending category");
    expect(() => setBudgetLine({ category_id: "rent", group: "fixed", amount: -1 }, "2026-09")).toThrow("0 or more");
    setBudgetLine({ category_id: "rent", group: "fixed", amount: 2000 }, "2026-09");
    removeBudgetLine("rent");
    expect(budgetMonth("2026-09").planned_total).toBe(0);
  });

  test("GIVEN earlier months THEN suggestions average past spending per category", () => {
    spend("2026-07-03", 300, "groceries");
    spend("2026-08-03", 500, "groceries");
    spend("2026-09-03", 999, "groceries"); // current month is excluded
    expect(suggestBudget("2026-09")).toEqual([{ category_id: "groceries", name: "Groceries", average: 400 }]);
  });
});

