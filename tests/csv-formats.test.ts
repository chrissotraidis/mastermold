/// <reference types="bun" />
import { beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { __resetStoreForTests, store } from "../src/db/store";
import { createAccount } from "../src/db/money";
import { importTransactions, parseTransactionCsv, previewTransactionImport } from "../src/db/transactions";

beforeEach(() => {
  process.env.MASTERMOLD_DB = join(mkdtempSync(join(tmpdir(), "mm-csv-")), "mastermold.db");
  __resetStoreForTests();
});

const sample = (name: string) => readFileSync(join(import.meta.dir, "..", "public", "samples", name), "utf8");
const amounts = (name: string) => parseTransactionCsv(sample(name)).rows.map((row) => row.amount);

describe("bank CSV formats (made-up sample files)", () => {
  test("GIVEN each sample THEN its format is recognized and every row parses", () => {
    const expected: Record<string, [string, number]> = {
      "chase-checking.csv": ["chase-checking", 5], "chase-card.csv": ["chase-card", 4], "amex.csv": ["amex", 3],
      "capital-one.csv": ["capital-one", 3], "discover.csv": ["discover", 3], "mint.csv": ["mint", 3], "monarch.csv": ["monarch", 4],
    };
    for (const [file, [format, count]] of Object.entries(expected)) {
      const parsed = parseTransactionCsv(sample(file));
      expect({ file, format: parsed.format.id, rows: parsed.rows.length, issues: parsed.issues.length }).toEqual({ file, format, rows: count, issues: 0 });
    }
  });

  test("GIVEN card exports with positive purchases THEN spending comes out negative and payments positive", () => {
    expect(amounts("amex.csv")).toEqual([-312.6, -189, 501.6]);
    expect(amounts("discover.csv")).toEqual([-41.8, -23.1, 64.9]);
    expect(amounts("capital-one.csv")).toEqual([-18.25, -12.99, 31.24]);
    expect(amounts("mint.csv")).toEqual([4200, -76.43, -45]);
    expect(parseTransactionCsv(sample("amex.csv"), { flipSign: false }).rows[0].amount).toBe(312.6);
  });

  test("GIVEN Chase checking THEN the description is the statement text, not the DEBIT/CREDIT column", () => {
    expect(parseTransactionCsv(sample("chase-checking.csv")).rows[1].description).toBe("SAMPLE PROPERTY MGMT RENT WEB ID: 000000");
  });

  test("GIVEN a Monarch export THEN merchant, category, notes and matching accounts carry over", () => {
    const card = createAccount({ name: "Sample Card", type: "credit_card" });
    const parsed = parseTransactionCsv(sample("monarch.csv"));
    expect(previewTransactionImport(parsed, null)).toMatchObject({ new_count: 4, categorized_count: 4, unmatched_accounts: ["Sample Checking"] });
    importTransactions(parsed, null);
    const pharmacy = store().transactions().find((tx) => tx.original_description === "SAMPLE PHARMACY #00")!;
    expect(pharmacy).toMatchObject({ merchant: "Sample Pharmacy", category_id: "pharmacy", notes: "refill", account_id: card.id });
    expect(store().transactions().find((tx) => tx.merchant === "Sample Employer")!.account_id).toBeNull();
    expect(previewTransactionImport(parseTransactionCsv(sample("monarch.csv")), null).new_count).toBe(0);
  });

  test("GIVEN a Mint export THEN aliases like Gym and Paycheck map to our categories", () => {
    expect(parseTransactionCsv(sample("mint.csv")).rows.map((row) => row.category_id)).toEqual(["paychecks", "groceries", "fitness"]);
  });
});
