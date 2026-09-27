/// <reference types="bun" />
import { beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { __resetStoreForTests, store } from "../src/db/store";
import { runSync, sandboxProvider } from "../src/db/bank-sync";
import { undoImport, updateTransaction } from "../src/db/transactions";

beforeEach(() => {
  process.env.MASTERMOLD_DB = join(mkdtempSync(join(tmpdir(), "mm-sync-")), "mastermold.db");
  __resetStoreForTests();
});

const now = new Date("2026-09-27T12:00:00Z");
const byExternal = (id: string) => store().transactions().find((tx) => tx.external_id === id);

describe("sandbox bank sync", () => {
  test("GIVEN a first sync THEN posted rows land with money-out as negative; pending and removed rows never show", async () => {
    const result = await runSync(sandboxProvider(now), now);
    expect(result).toMatchObject({ added: 5, updated: 0, removed: 0, pending_skipped: 1 });
    expect(byExternal("sandbox-pay")!.amount).toBe(3200);
    expect(byExternal("sandbox-rent")!.amount).toBe(-1800);
    expect(byExternal("sandbox-cafe")!.amount).toBe(-7.25);
    expect(byExternal("sandbox-refund")).toBeUndefined();
    expect(byExternal("sandbox-pay")!.source).toBe("sandbox");
  });

  test("GIVEN a second sync THEN nothing duplicates and user edits survive", async () => {
    await runSync(sandboxProvider(now), now);
    updateTransaction(byExternal("sandbox-grocer")!.id, { category_id: "restaurants", notes: "kept" });
    const again = await runSync(sandboxProvider(now), now);
    expect(again).toMatchObject({ added: 0, updated: 0 });
    expect(store().transactions()).toHaveLength(5);
    expect(byExternal("sandbox-grocer")).toMatchObject({ category_id: "restaurants", notes: "kept" });
  });

  test("GIVEN a provider edit or removal of a synced row THEN it updates or deletes that row", async () => {
    await runSync(sandboxProvider(now), now);
    const provider = sandboxProvider(now);
    provider.sync = async () => ({
      added: [],
      modified: [{ transaction_id: "sandbox-rent", account_id: "sandbox-checking", date: "2026-09-15", amount: 1850, name: "SANDBOX PROPERTY RENT", pending: false }],
      removed: [{ transaction_id: "sandbox-cafe" }],
      next_cursor: "x",
      has_more: false,
    });
    expect(await runSync(provider, now)).toMatchObject({ added: 0, updated: 1, removed: 1 });
    expect(byExternal("sandbox-rent")!.amount).toBe(-1850);
    expect(byExternal("sandbox-cafe")).toBeUndefined();
  });

  test("GIVEN a sync batch THEN Undo removes it like a CSV import", async () => {
    const result = await runSync(sandboxProvider(now), now);
    expect(undoImport(result.batch_id)).toBe(5);
    expect(store().transactions()).toHaveLength(0);
  });
});
