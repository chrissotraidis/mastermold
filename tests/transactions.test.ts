/// <reference types="bun" />
import { beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { __resetStoreForTests, store } from "../src/db/store";
import {
  addManualTransaction,
  addRule,
  applyRules,
  cashFlow,
  cleanMerchant,
  deleteRule,
  importTransactions,
  parseTransactionCsv,
  previewRule,
  previewTransactionImport,
  undoImport,
  updateTransaction,
} from "../src/db/transactions";

beforeEach(() => {
  process.env.MASTERMOLD_DB = join(mkdtempSync(join(tmpdir(), "mm-tx-")), "mastermold.db");
  __resetStoreForTests();
});

const BANK_CSV = `Date,Description,Amount
09/01/2026,ACME CORP PAYROLL,5000.00
09/02/2026,SQ *BLUE BOTTLE COFFEE 12345,-6.50
09/03/2026,WHOLE FOODS MARKET #1234,-120.40
09/05/2026,ONLINE TRANSFER TO SAVINGS,-1000.00
09/10/2026,NETFLIX.COM,-15.99
`;

describe("parseTransactionCsv", () => {
  test("GIVEN a signed Amount column and US dates THEN rows parse with ISO dates", () => {
    const parsed = parseTransactionCsv(BANK_CSV);
    expect(parsed.issues).toEqual([]);
    expect(parsed.rows).toHaveLength(5);
    expect(parsed.rows[1]).toMatchObject({ date: "2026-09-02", amount: -6.5, description: "SQ *BLUE BOTTLE COFFEE 12345" });
  });

  test("GIVEN separate Debit and Credit columns THEN money out is negative", () => {
    const parsed = parseTransactionCsv("Posted Date,Payee,Debit,Credit\n2026-09-04,Chevron 55,40.00,\n2026-09-05,Refund,,12.50\n");
    expect(parsed.rows.map((row) => row.amount)).toEqual([-40, 12.5]);
  });

  test("GIVEN a card export with positive purchases WHEN flipSign THEN purchases become expenses", () => {
    const parsed = parseTransactionCsv("Date,Description,Amount\n2026-09-04,Target,25.00\n", { flipSign: true });
    expect(parsed.rows[0].amount).toBe(-25);
  });

  test("GIVEN missing columns THEN it reports what is needed and returns no rows", () => {
    const parsed = parseTransactionCsv("Foo,Bar\n1,2\n");
    expect(parsed.rows).toEqual([]);
    expect(parsed.issues[0].reason).toContain("Date, Description and Amount");
  });
});

describe("import", () => {
  test("GIVEN the same CSV imported twice THEN nothing double-counts and undo removes the batch", () => {
    const parsed = parseTransactionCsv(BANK_CSV);
    const first = importTransactions(parsed, "acct_checking");
    expect(first).toMatchObject({ imported: 5, duplicates: 0 });
    expect(previewTransactionImport(parsed, "acct_checking")).toMatchObject({ new_count: 0, duplicate_count: 5 });
    expect(importTransactions(parsed, "acct_checking")).toMatchObject({ imported: 0, duplicates: 5 });
    expect(store().transactions()).toHaveLength(5);
    expect(undoImport(first.batch_id)).toBe(5);
    expect(store().transactions()).toHaveLength(0);
  });

  test("GIVEN common bank text THEN merchants are cleaned and categories guessed", () => {
    importTransactions(parseTransactionCsv(BANK_CSV), null);
    const byMerchant = Object.fromEntries(store().transactions().map((tx) => [tx.merchant, tx.category_id]));
    expect(byMerchant["Blue Bottle Coffee"]).toBe("coffee-shops");
    expect(byMerchant["Whole Foods Market"]).toBe("groceries");
    expect(Object.values(byMerchant)).toContain("paychecks");
    expect(Object.values(byMerchant)).toContain("transfer");
    expect(cleanMerchant("TST* JOE'S PIZZA 00123")).toBe("Joe's Pizza");
  });
});

describe("rules", () => {
  test("GIVEN a rule with no conditions THEN it is refused", () => {
    expect(() => addRule({ conditions: {}, actions: { hide: true } })).toThrow("at least one condition");
  });

  test("GIVEN a new rule applied to past THEN matching transactions change and later imports follow it", () => {
    importTransactions(parseTransactionCsv(BANK_CSV), null);
    const draft = { conditions: { merchant: { op: "contains" as const, value: "netflix" } }, actions: { set_category_id: "streaming", rename_merchant: "Netflix", add_tags: ["subscription"] } };
    expect(previewRule(draft)).toBe(1);
    const { updated } = addRule(draft, { applyToPast: true });
    expect(updated).toBe(1);
    const netflix = store().transactions().find((tx) => tx.merchant === "Netflix");
    expect(netflix).toMatchObject({ category_id: "streaming", tags: ["subscription"] });
    importTransactions(parseTransactionCsv("Date,Description,Amount\n2026-10-10,NETFLIX.COM,-15.99\n"), null);
    expect(store().transactions().filter((tx) => tx.merchant === "Netflix")).toHaveLength(2);
  });

  test("GIVEN two matching rules THEN they run in list order and the later one wins", () => {
    const tx = store().transactions()[0] ?? addManualTransaction({ date: "2026-09-01", amount: -30, description: "AMAZON MKTPLACE" });
    const rules = [
      { id: "a", order: 0, enabled: true, created_at: "", conditions: { original_description: { op: "contains" as const, value: "amazon" } }, actions: { set_category_id: "shopping" } },
      { id: "b", order: 1, enabled: true, created_at: "", conditions: { amount: { op: "equals" as const, value: 30 } }, actions: { set_category_id: "electronics" } },
    ];
    expect(applyRules(tx, rules).category_id).toBe("electronics");
    expect(applyRules(tx, rules.map((rule) => ({ ...rule, order: rule.id === "a" ? 1 : 0 }))).category_id).toBe("shopping");
  });

  test("GIVEN a deleted rule THEN new imports stop using it", () => {
    const { rule } = addRule({ conditions: { merchant: { op: "contains", value: "target" } }, actions: { hide: true } });
    deleteRule(rule.id);
    importTransactions(parseTransactionCsv("Date,Description,Amount\n2026-09-04,Target,-25\n"), null);
    expect(store().transactions()[0].hidden).toBe(false);
  });
});

describe("cash flow", () => {
  test("GIVEN income, spending, a transfer and a hidden row THEN only real income and spending count", () => {
    importTransactions(parseTransactionCsv(BANK_CSV), null);
    const hide = store().transactions().find((tx) => tx.merchant === "Netflix.com" || tx.original_description === "NETFLIX.COM")!;
    updateTransaction(hide.id, { hidden: true });
    const flow = cashFlow("2026-09");
    expect(flow.income).toBe(5000);
    expect(flow.expenses).toBe(126.9); // coffee + groceries; transfer and hidden excluded
    expect(flow.savings).toBe(4873.1);
    expect(flow.savings_rate).toBe(97.5);
    expect(flow.by_category.map((row) => row.category_id)).toEqual(["groceries", "coffee-shops"]);
  });

  test("GIVEN no income THEN the savings rate is not invented", () => {
    addManualTransaction({ date: "2026-08-03", amount: -10, description: "Coffee", category_id: "coffee-shops" });
    expect(cashFlow("2026-08").savings_rate).toBeNull();
  });
});


describe("json-file backend (what the dev server uses)", () => {
  test("GIVEN the JSON store THEN transactions and rules persist across a restart", () => {
    const previous = process.env.MASTERMOLD_STORE;
    process.env.MASTERMOLD_STORE = "json";
    try {
      process.env.MASTERMOLD_DB = join(mkdtempSync(join(tmpdir(), "mm-tx-json-")), "mastermold.db");
      __resetStoreForTests();
      expect(store().backend).toBe("json-file");
      importTransactions(parseTransactionCsv(BANK_CSV), null);
      addRule({ conditions: { merchant: { op: "contains", value: "coffee" } }, actions: { add_tags: ["treat"] } });
      __resetStoreForTests();
      expect(store().transactions()).toHaveLength(5);
      expect(store().transactionRules()).toHaveLength(1);
    } finally {
      if (previous === undefined) delete process.env.MASTERMOLD_STORE;
      else process.env.MASTERMOLD_STORE = previous;
    }
  });
});
