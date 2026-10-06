/// <reference types="bun" />
import { beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { __resetStoreForTests } from "../src/db/store";
import { createAccount, getMoneySummary, parseAccountInput, updateAccount } from "../src/db/money";
import { addManualTransaction, cashFlow, updateTransaction } from "../src/db/transactions";
import { budgetMonth, setBudgetLine } from "../src/db/budgets";

beforeEach(() => {
  process.env.MASTERMOLD_DB = join(mkdtempSync(join(tmpdir(), "mm-exclude-")), "mastermold.db");
  __resetStoreForTests();
});

const spendOn = (account_id: string, amount: number) => {
  const tx = addManualTransaction({ date: "2026-09-10", amount: -amount, description: "Groceries", category_id: "groceries" });
  updateTransaction(tx.id, { account_id });
};

describe("account exclusions", () => {
  test("GIVEN an account switched out of net worth THEN it stays listed but leaves every total", async () => {
    const checking = createAccount({ name: "Checking", type: "bank", balance: 1000 });
    const before = await getMoneySummary();
    const joint = createAccount({ name: "Parents' joint", type: "bank", balance: 5000, exclude: { net_worth: true } });
    const summary = await getMoneySummary();
    expect(summary.accounts.map((account) => account.id)).toEqual(expect.arrayContaining([checking.id, joint.id]));
    expect(summary.net_worth).toBe(before.net_worth);
    expect(summary.cash).toBe(before.cash);
    updateAccount(joint.id, { exclude: {} });
    expect((await getMoneySummary()).net_worth).toBe(before.net_worth + 5000);
  });

  test("GIVEN an account out of cash flow and another out of budgets THEN each total skips only its own", () => {
    const main = createAccount({ name: "Main card", type: "credit_card", balance: 0 });
    const business = createAccount({ name: "Business card", type: "credit_card", balance: 0, exclude: { cash_flow: true } });
    const shared = createAccount({ name: "Shared card", type: "credit_card", balance: 0, exclude: { budget: true } });
    setBudgetLine({ category_id: "groceries", group: "flex", amount: 500 }, "2026-09");
    spendOn(main.id, 100);
    spendOn(business.id, 40);
    spendOn(shared.id, 7);
    expect(cashFlow("2026-09").expenses).toBe(107);
    expect(budgetMonth("2026-09").spent_total).toBe(140);
  });

  test("GIVEN exclusion flags in a request THEN only true booleans switch them on, and edits keep them", () => {
    const parsed = parseAccountInput({ name: "Brokerage", type: "brokerage", exclude: { net_worth: "yes", budget: true } });
    expect(parsed.ok && parsed.input.exclude).toEqual({ net_worth: false, cash_flow: false, budget: true });
    const row = createAccount({ name: "Brokerage", type: "brokerage", exclude: { budget: true } });
    expect(updateAccount(row.id, { balance: 12 })!.exclude).toEqual({ budget: true });
  });
});
