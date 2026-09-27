/**
 * Bank sync, shaped like Plaid's /transactions/sync: pages of added, modified
 * and removed transactions. Plaid amounts are positive for money OUT, so they
 * flip sign on the way in. Rows are keyed by the provider's transaction_id, so
 * running a sync again updates instead of duplicating, and edits you made
 * (category, notes, hidden) survive a provider change.
 *
 * Only the sandbox provider exists: fixed, made-up data, no network, no keys.
 * A real Plaid adapter implements BankProvider and must also persist
 * next_cursor between runs (the sandbox always syncs from the start).
 */
import { randomUUID } from "node:crypto";
import { store, type TransactionRow } from "./store";
import { buildTransaction } from "./transactions";

export type ProviderTransaction = {
  transaction_id: string;
  account_id: string;
  date: string;
  /** Plaid convention: positive = money out of the account. */
  amount: number;
  name: string;
  merchant_name?: string | null;
  pending: boolean;
};

export type SyncPage = {
  added: ProviderTransaction[];
  modified: ProviderTransaction[];
  removed: Array<{ transaction_id: string }>;
  next_cursor: string;
  has_more: boolean;
};

export type BankProvider = {
  id: string;
  label: string;
  sandbox: boolean;
  sync(cursor: string | null): Promise<SyncPage>;
};

export type SyncResult = { batch_id: string; added: number; updated: number; removed: number; pending_skipped: number };

export async function runSync(provider: BankProvider, now = new Date()): Promise<SyncResult> {
  const batch = `sync_${provider.id}_${randomUUID()}`;
  const stamp = now.toISOString();
  const source: TransactionRow["source"] = provider.sandbox ? "sandbox" : "plaid";
  const byExternal = new Map(store().transactions().filter((tx) => tx.external_id).map((tx) => [tx.external_id!, tx]));
  const result: SyncResult = { batch_id: batch, added: 0, updated: 0, removed: 0, pending_skipped: 0 };
  const writes = new Map<string, TransactionRow>();
  const deletes: string[] = [];

  let cursor: string | null = null;
  for (let guard = 0; guard < 50; guard += 1) {
    const page = await provider.sync(cursor);
    for (const item of [...page.added, ...page.modified]) {
      // Plaid re-sends a pending charge as a new posted transaction; count only posted ones.
      if (item.pending) {
        result.pending_skipped += 1;
        continue;
      }
      const amount = Math.round(-item.amount * 100) / 100;
      const existing = writes.get(item.transaction_id) ?? byExternal.get(item.transaction_id);
      if (existing) {
        writes.set(item.transaction_id, { ...existing, date: item.date, amount, original_description: item.name, updated_at: stamp });
        continue;
      }
      const row = buildTransaction({ date: item.date, amount, description: item.name, merchant: item.merchant_name ?? undefined }, source, batch, stamp);
      writes.set(item.transaction_id, { ...row, external_id: item.transaction_id });
    }
    for (const gone of page.removed) {
      writes.delete(gone.transaction_id);
      const known = byExternal.get(gone.transaction_id);
      if (known && !deletes.includes(known.id)) deletes.push(known.id);
    }
    cursor = page.next_cursor;
    if (!page.has_more) break;
  }

  // Count against what was stored before the run, so a row that moved and moved back is not "updated".
  const changed = [...writes.entries()].filter(([id, row]) => {
    const before = byExternal.get(id);
    if (!before) return true;
    if (deletes.includes(before.id)) return false;
    return before.date !== row.date || before.amount !== row.amount || before.original_description !== row.original_description;
  });
  for (const [id] of changed) {
    if (byExternal.has(id)) result.updated += 1;
    else result.added += 1;
  }
  result.removed = deletes.length;

  store().upsertTransactions(changed.map(([, row]) => row));
  if (deletes.length) store().deleteTransactions(deletes);
  return result;
}

// --- sandbox ------------------------------------------------------------------

function daysAgo(now: Date, days: number) {
  return new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
}

/** Made-up checking account: two pages, one pending charge, one edit, one removal. */
export function sandboxProvider(now = new Date()): BankProvider {
  const tx = (id: string, days: number, amount: number, name: string, extra: Partial<ProviderTransaction> = {}): ProviderTransaction => ({
    transaction_id: `sandbox-${id}`,
    account_id: "sandbox-checking",
    date: daysAgo(now, days),
    amount,
    name,
    pending: false,
    ...extra,
  });
  const pages: SyncPage[] = [
    {
      added: [
        tx("pay", 14, -3200, "SANDBOX EMPLOYER PAYROLL", { merchant_name: "Sandbox Employer" }),
        tx("rent", 12, 1800, "SANDBOX PROPERTY RENT"),
        tx("grocer", 6, 84.12, "SANDBOX GROCER #12", { merchant_name: "Sandbox Grocer" }),
        tx("cafe", 3, 5.75, "SANDBOX CAFE"),
        tx("refund", 2, 19.99, "SANDBOX DUPLICATE CHARGE"),
      ],
      modified: [],
      removed: [],
      next_cursor: "sandbox-page-2",
      has_more: true,
    },
    {
      added: [
        tx("stream", 1, 15.99, "SANDBOX STREAMING SERVICE"),
        tx("pending", 0, 42, "SANDBOX GAS STATION", { pending: true }),
      ],
      modified: [tx("cafe", 3, 7.25, "SANDBOX CAFE")],
      removed: [{ transaction_id: "sandbox-refund" }],
      next_cursor: "sandbox-done",
      has_more: false,
    },
  ];
  return {
    id: "sandbox",
    label: "Sandbox bank (made-up data)",
    sandbox: true,
    async sync(cursor) {
      return cursor === "sandbox-page-2" ? pages[1] : pages[0];
    },
  };
}
