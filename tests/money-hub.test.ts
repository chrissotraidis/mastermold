/// <reference types="bun" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { __resetStoreForTests, store, type ManualHoldingRow } from "../src/db/store";
import { createAccount, deleteAccount, getMoneySummary, restoreBook, updateHolding } from "../src/db/money";
import { applyImport, parseHoldingsImport, previewImport } from "../src/db/money-import";
import { refreshHoldingQuotes } from "../src/db/money-quotes";

let prevDb: string | undefined;

beforeEach(() => {
  prevDb = process.env.MASTERMOLD_DB;
  process.env.MASTERMOLD_DB = join(mkdtempSync(join(tmpdir(), "mm-money-")), "mastermold.db");
  __resetStoreForTests();
});

afterEach(() => {
  if (prevDb === undefined) delete process.env.MASTERMOLD_DB;
  else process.env.MASTERMOLD_DB = prevDb;
  __resetStoreForTests();
});

/** Same shape the Zo server stored: 22 equity, 52 crypto, 2 cash; basis defaulted to qty × price. Fake values. */
function syntheticBook(): ManualHoldingRow[] {
  const rows: ManualHoldingRow[] = [];
  const add = (symbol: string, assetClass: ManualHoldingRow["asset_class"], quantity: number, price: number, n: number) => {
    const at = new Date(Date.UTC(2026, 6, 10, 17, 14, n % 60)).toISOString();
    rows.push({
      id: `manual_${symbol.toLowerCase()}_m1abc${n.toString(36)}`,
      symbol,
      asset_name: symbol,
      asset_class: assetClass,
      venue: "Manual",
      quantity,
      price,
      cost_basis: Math.round(quantity * price * 100) / 100,
      daily_change_pct: 0,
      created_at: at,
      updated_at: at,
    });
  };
  for (let i = 0; i < 22; i += 1) add(`EQ${i}`, "equity", 1 + i, 10 + i, i);
  for (let i = 0; i < 52; i += 1) add(`CR${i}`, "crypto", 0.001 * (i + 1), i < 35 ? 0.5 : 100 + i, 22 + i);
  add("USD", "cash", 2500.5, 1, 74);
  add("USDC", "cash", 100, 1, 75);
  return rows;
}

describe("money hub import", () => {
  test("GIVEN the stored manual_holdings book WHEN it is imported THEN all 76 rows land with ids kept and no dust dropped", () => {
    const book = syntheticBook();
    const parsed = parseHoldingsImport(JSON.stringify({ manual_holdings: book }));
    expect(parsed.format).toBe("manual_holdings_json");
    expect(parsed.rows).toHaveLength(76);
    expect(parsed.issues).toHaveLength(0);

    const preview = previewImport(parsed, "replace");
    expect(preview.counts).toEqual({ add: 76, update: 0, unchanged: 0, remove: 0, issues: 0 });

    applyImport(parsed, "replace");
    const saved = store().manualHoldings();
    expect(saved).toHaveLength(76);
    expect(new Set(saved.map((row) => row.id))).toEqual(new Set(book.map((row) => row.id)));

    const summary = getMoneySummary();
    expect(summary.holdings).toHaveLength(76);
    const expectedTotal = Math.round(book.reduce((sum, row) => sum + row.quantity * row.price, 0) * 100) / 100;
    expect(summary.net_worth).toBeCloseTo(expectedTotal, 1);
    // A basis equal to quantity × price was a form default, not a real basis.
    expect(summary.holdings.every((holding) => holding.cost_basis_known === false && holding.gain_value === null)).toBe(true);
  });

  test("GIVEN a bare array of POST-body rows WHEN parsed THEN it is accepted and cash defaults to a price of 1", () => {
    const parsed = parseHoldingsImport(
      JSON.stringify([
        { symbol: "nvda", asset_name: "", asset_class: "equity", venue: "", quantity: 10.5, price: 125.25 },
        { symbol: "USD", asset_class: "cash", quantity: 900 },
      ]),
    );
    expect(parsed.format).toBe("holdings_json");
    expect(parsed.rows.map((row) => [row.symbol, row.asset_name, row.venue, row.price])).toEqual([
      ["NVDA", "NVDA", "Manual", 125.25],
      ["USD", "USD", "Manual", 1],
    ]);
  });

  test("GIVEN a messy brokerage CSV WHEN parsed THEN aliases, currency text, totals, and bad rows are handled", () => {
    const csv = [
      "Ticker,Description,Shares,Market Value,Cost Basis,Account",
      'AAPL,Apple Inc,"1,000","$230,000.00","$150,000.00",Taxable',
      "BTC,Bitcoin,0.5,$32000,,Coinbase",
      ",Mystery,3,$10,,",
      "VOO,Vanguard S&P,0,$0,,Taxable",
    ].join("\n");
    const parsed = parseHoldingsImport(csv);
    expect(parsed.format).toBe("csv");
    expect(parsed.mapping).toMatchObject({ symbol: "Ticker", quantity: "Shares", value: "Market Value", cost_basis: "Cost Basis", account: "Account" });
    expect(parsed.rows.map((row) => [row.symbol, row.asset_class, row.quantity, row.price, row.cost_basis])).toEqual([
      ["AAPL", "equity", 1000, 230, 150000],
      ["BTC", "crypto", 0.5, 64000, null],
    ]);
    expect(parsed.issues.map((issue) => issue.line)).toEqual([4, 5]);

    const applied = applyImport(parsed, "merge");
    expect(applied.created_accounts).toHaveLength(2);
    const summary = getMoneySummary();
    const apple = summary.holdings.find((holding) => holding.symbol === "AAPL")!;
    expect(apple.cost_basis_known).toBe(true);
    expect(apple.gain_value).toBe(80000);
    expect(summary.accounts.map((account) => account.name).sort()).toEqual(["Coinbase", "Taxable"]);
  });

  test("GIVEN an existing book WHEN a partial file is merged vs replaced THEN the preview says exactly what changes and undo restores it", () => {
    applyImport(parseHoldingsImport(JSON.stringify({ manual_holdings: syntheticBook() })), "replace");
    const before = store().manualHoldings();
    const update = parseHoldingsImport("symbol,quantity,price\nEQ0,5,10\nNEW1,2,3");

    const merge = previewImport(update, "merge");
    expect(merge.counts).toMatchObject({ add: 1, update: 1, remove: 0 });
    expect(merge.changes.find((change) => change.symbol === "EQ0")?.fields).toEqual(["amount"]);

    const replace = previewImport(update, "replace");
    expect(replace.counts).toMatchObject({ add: 1, update: 1, remove: 75 });

    const applied = applyImport(update, "replace");
    expect(store().manualHoldings()).toHaveLength(2);
    restoreBook(applied.previous);
    expect(store().manualHoldings()).toHaveLength(before.length);
  });
});

describe("money hub net worth", () => {
  test("GIVEN holdings, a bank account, and a mortgage WHEN summarized THEN net worth is assets minus liabilities", () => {
    applyImport(parseHoldingsImport("symbol,quantity,price\nAAPL,10,100"), "replace");
    createAccount({ name: "Checking", type: "bank", balance: 5000 });
    const mortgage = createAccount({ name: "Home loan", type: "mortgage", balance: 200000 });
    createAccount({ name: "House", type: "property", balance: 350000 });

    const summary = getMoneySummary();
    expect(summary.assets).toBe(1000 + 5000 + 350000);
    expect(summary.liabilities).toBe(200000);
    expect(summary.net_worth).toBe(156000);
    expect(summary.cash).toBe(5000);
    expect(store().netWorthHistory().at(-1)?.net_worth).toBe(156000);

    deleteAccount(mortgage.id);
    expect(getMoneySummary().net_worth).toBe(356000);
  });
});

describe("money hub prices", () => {
  test("GIVEN every holding WHEN quotes refresh THEN each non-cash row is priced, freshness is recorded, and misses are listed", async () => {
    applyImport(parseHoldingsImport(JSON.stringify({ manual_holdings: syntheticBook() })), "replace");
    const now = new Date("2026-09-26T12:00:00Z");
    const result = await refreshHoldingQuotes(async (row) =>
      row.symbol === "CR3" ? null : { price: 2, change_pct: 1.5, source: "Test", as_of: now.toISOString() },
    now);
    expect(result.total).toBe(76);
    expect(result.unchanged_cash).toBe(2);
    expect(result.refreshed).toBe(73);
    expect(result.failed).toEqual(["CR3"]);

    const summary = getMoneySummary(undefined, now);
    const priced = summary.holdings.filter((holding) => holding.freshness === "live");
    expect(priced).toHaveLength(75);
    expect(summary.holdings.find((holding) => holding.symbol === "CR3")?.freshness).toBe("typed");
    expect(summary.holdings.find((holding) => holding.symbol === "EQ1")?.price).toBe(2);

    // Saving other fields with the same price keeps the quote's freshness;
    // typing a new price marks it typed-in.
    const eq1 = store().manualHoldings().find((row) => row.symbol === "EQ1")!;
    updateHolding(eq1.id, { price: 2, cost_basis: 1 }, now);
    expect(getMoneySummary(undefined, now).holdings.find((holding) => holding.symbol === "EQ1")?.freshness).toBe("live");
    updateHolding(eq1.id, { price: 3 }, now);
    expect(getMoneySummary(undefined, now).holdings.find((holding) => holding.symbol === "EQ1")?.freshness).toBe("typed");
  });
});
