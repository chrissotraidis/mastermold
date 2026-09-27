"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { EyeOff, Eye, FileUp, PiggyBank, Plus, Search, Sparkles, Trash2, Wand2 } from "lucide-react";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Sheet } from "@/components/ui/sheet";
import { StatTile } from "@/components/ui/stat";
import { EmptyState } from "@/components/ui/empty-state";
import { Segmented } from "@/components/ui/segmented";
import { toast } from "@/components/ui/toast";
import { isBill } from "@/lib/bills";
import { cn } from "@/lib/utils";
import type { TransactionRow, TransactionRuleRow } from "@/src/db/store";
import type { CashFlowMonth, Category, RecurringItem } from "@/src/db/transactions";
import type { CashFlowPoint } from "@/src/db/transactions-view";

export type TransactionsData = {
  month: string;
  months: string[];
  history: CashFlowPoint[];
  transactions: TransactionRow[];
  cash_flow: CashFlowMonth;
  categories: Category[];
  rules: TransactionRuleRow[];
  recurring: RecurringItem[];
  accounts: Array<{ id: string; name: string }>;
};

type ImportPreview = {
  preview: { new_count: number; duplicate_count: number; issue_count: number; categorized_count: number; unmatched_accounts: string[] };
  columns: Record<string, string | null>;
  format: { id: string; label: string; note?: string };
  flipped: boolean;
  issues: Array<{ line: number; reason: string }>;
  sample: Array<{ date: string; amount: number; description: string }>;
};

const CSV_SAMPLES = [
  { id: "chase-checking", label: "Chase checking" },
  { id: "chase-card", label: "Chase card" },
  { id: "amex", label: "American Express" },
  { id: "capital-one", label: "Capital One" },
  { id: "discover", label: "Discover" },
  { id: "mint", label: "Mint export" },
  { id: "monarch", label: "Monarch export" },
];

const field = "min-h-11 w-full rounded-xl border border-outline-variant/60 bg-surface-lowest/70 px-3 text-sm text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet sm:min-h-10";
const ghostButton = "inline-flex min-h-11 items-center gap-2 rounded-xl border border-outline-variant/60 px-3 text-sm font-semibold text-on-surface transition hover:border-violet/50 disabled:opacity-50 sm:min-h-10";
const primaryButton = "inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet px-4 text-sm font-semibold text-void shadow-glow transition hover:bg-violet/90 disabled:opacity-50 sm:min-h-10";

export function TransactionsHub({ initial }: { initial: TransactionsData }) {
  const [data, setData] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [reviewOnly, setReviewOnly] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [spendBy, setSpendBy] = useState<"category" | "merchant">("category");
  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [ruleFor, setRuleFor] = useState<TransactionRow | null>(null);

  // /transactions?action=import (command palette, Today) opens the importer.
  useEffect(() => {
    const url = new URL(window.location.href);
    const action = url.searchParams.get("action");
    if (action === "import") setImportOpen(true);
    if (action === "add") setAddOpen(true);
    if (action) {
      url.searchParams.delete("action");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }, []);

  const post = useCallback(async (body: Record<string, unknown>) => {
    const response = await fetch("/api/transactions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ month: data.month, ...body }),
    });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error ?? "Request failed.");
    return json;
  }, [data.month]);

  const run = useCallback((body: Record<string, unknown>, success?: string) => {
    startTransition(async () => {
      try {
        const next = await post(body);
        if (next.transactions) setData(next);
        if (success) toast({ title: success });
      } catch (error) {
        toast({ title: "Couldn't save", description: error instanceof Error ? error.message : undefined, tone: "error" });
      }
    });
  }, [post]);

  const selectMonth = (month: string) => {
    startTransition(async () => {
      const response = await fetch(`/api/transactions?month=${month}`, { cache: "no-store" });
      if (response.ok) setData(await response.json());
    });
  };

  const categoryName = useMemo(() => new Map(data.categories.map((category) => [category.id, category.name])), [data.categories]);
  const accountName = useMemo(() => new Map(data.accounts.map((account) => [account.id, account.name])), [data.accounts]);
  const reviewCount = data.transactions.filter((tx) => tx.needs_review).length;

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.transactions.filter((tx) => {
      if (!tx.date.startsWith(data.month)) return false;
      if (reviewOnly && !tx.needs_review) return false;
      if (categoryFilter && tx.category_id !== categoryFilter) return false;
      if (!needle) return true;
      return `${tx.merchant} ${tx.original_description} ${tx.notes}`.toLowerCase().includes(needle);
    });
  }, [data.transactions, data.month, query, reviewOnly, categoryFilter]);

  const flow = data.cash_flow;
  const categoryType = useMemo(() => new Map(data.categories.map((category) => [category.id, category.type])), [data.categories]);
  // Same rules as cash flow: this month's spending, hidden rows and transfers left out.
  const merchantSpend = useMemo(() => {
    const totals = new Map<string, number>();
    for (const tx of data.transactions) {
      if (!tx.date.startsWith(data.month) || tx.hidden || tx.amount >= 0) continue;
      const type = tx.category_id ? categoryType.get(tx.category_id) : undefined;
      if (type === "transfer" || type === "income") continue;
      totals.set(tx.merchant, (totals.get(tx.merchant) ?? 0) - tx.amount);
    }
    return [...totals.entries()].map(([name, total]) => ({ key: name, name, total: Math.round(total * 100) / 100 })).sort((a, b) => b.total - a.total);
  }, [data.transactions, data.month, categoryType]);
  const topSpend =
    spendBy === "category" ? flow.by_category.slice(0, 8).map((row) => ({ key: row.category_id, name: row.name, total: row.total })) : merchantSpend.slice(0, 8);
  const maxSpend = topSpend[0]?.total ?? 0;
  const hasAny = data.transactions.length > 0;

  return (
    <div className="grid w-full grid-cols-1 gap-6 [&>*]:min-w-0">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="mm-eyebrow">Where your money went</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-on-surface sm:text-4xl">Transactions</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-on-surface-variant">
            Import a bank or card CSV, fix categories once, and let rules handle the rest. Stored only on this computer.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/budget" className={ghostButton}>
            <PiggyBank aria-hidden="true" className="size-4" /> Budget
          </Link>
          <button type="button" className={ghostButton} onClick={() => setAddOpen(true)}>
            <Plus aria-hidden="true" className="size-4" /> Add
          </button>
          <button type="button" className={primaryButton} onClick={() => setImportOpen(true)}>
            <FileUp aria-hidden="true" className="size-4" /> Import CSV
          </button>
        </div>
      </header>

      {!hasAny ? (
        <Panel className="p-2">
          <EmptyState
            icon={FileUp}
            title="No transactions yet"
            description="Download a CSV from your bank or card website (usually under Activity → Download) and import it here. Duplicates are skipped, and every import can be undone."
          />
          <div className="flex justify-center pb-5">
            <button type="button" className={primaryButton} onClick={() => setImportOpen(true)}>
              <FileUp aria-hidden="true" className="size-4" /> Import your first CSV
            </button>
          </div>
        </Panel>
      ) : (
        <>
          <CashFlowBars history={data.history} selected={data.month} onSelect={selectMonth} />

          <section aria-label="Cash flow" className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="cash-flow">
            <StatTile label="Income" value={money(flow.income)} deltaTone="up" />
            <StatTile label="Spending" value={money(flow.expenses)} />
            <StatTile emphasis label="Saved" value={money(flow.savings)} deltaTone={flow.savings >= 0 ? "up" : "down"} hint={monthLabel(data.month)} />
            <StatTile label="Savings rate" value={flow.savings_rate === null ? "—" : `${flow.savings_rate}%`} hint="saved ÷ income" />
          </section>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 [&>*]:min-w-0">
            <Panel className="lg:col-span-8" aria-labelledby="tx-list-title">
              <PanelHeader
                titleId="tx-list-title"
                title={`${visible.length} transaction${visible.length === 1 ? "" : "s"}`}
                description="Change a category inline. Transfers and hidden rows never count toward cash flow."
              />
              <div className="flex flex-wrap items-center gap-2 px-5 pt-3">
                <label className="relative min-w-[12rem] flex-1">
                  <span className="sr-only">Search transactions</span>
                  <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-outline" />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search merchant or note" className={cn(field, "pl-9")} />
                </label>
                <select aria-label="Filter by category" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className={cn(field, "w-auto")}>
                  <option value="">All categories</option>
                  {data.categories.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
                <button type="button" onClick={() => setReviewOnly((value) => !value)} aria-pressed={reviewOnly} className={cn(ghostButton, reviewOnly && "border-violet text-violet")}>
                  Needs review{reviewCount ? ` · ${reviewCount}` : ""}
                </button>
              </div>
              <ul className="divide-y divide-outline-variant/30 p-2" data-testid="transaction-list">
                {visible.length === 0 ? (
                  <li className="p-6 text-center text-sm text-on-surface-variant">Nothing matches these filters.</li>
                ) : (
                  visible.map((tx) => (
                    <li key={tx.id} className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-3 py-3 xl:grid-cols-[minmax(0,1fr)_9.5rem_6rem_auto]", tx.hidden && "opacity-50")}>
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-on-surface">{tx.merchant}</span>
                          {tx.needs_review ? <span className="rounded-full bg-violet/15 px-1.5 text-[10px] font-semibold text-violet">new</span> : null}
                          {tx.source === "sandbox" ? <span className="rounded-full bg-caution/15 px-1.5 text-[10px] font-semibold text-caution">sandbox</span> : null}
                        </span>
                        <span className="block truncate text-xs text-outline" title={tx.original_description}>
                          <span className="mm-num">{dayLabel(tx.date)}</span> ·{" "}
                          {tx.original_description}
                          {tx.account_id ? ` · ${accountName.get(tx.account_id) ?? "account"}` : ""}
                        </span>
                      </span>
                      <select
                        aria-label={`Category for ${tx.merchant}`}
                        value={tx.category_id ?? ""}
                        disabled={pending}
                        onChange={(event) => run({ action: "update", id: tx.id, patch: { category_id: event.target.value } })}
                        className={cn(field, "row-start-2 xl:row-start-auto")}
                      >
                        <CategoryOptions categories={data.categories} />
                      </select>
                      <span className={cn("mm-num col-start-2 row-start-1 text-right text-sm font-semibold xl:col-start-auto xl:row-start-auto", tx.amount > 0 ? "text-engine" : "text-on-surface")}>
                        {tx.amount > 0 ? "+" : "−"}{money(Math.abs(tx.amount))}
                      </span>
                      <span className="row-start-2 flex justify-end gap-1 xl:row-start-auto">
                        <IconButton label={`Make a rule from ${tx.merchant}`} onClick={() => setRuleFor(tx)}>
                          <Wand2 className="size-4" />
                        </IconButton>
                        <IconButton label={tx.hidden ? `Show ${tx.merchant}` : `Hide ${tx.merchant}`} onClick={() => run({ action: "update", id: tx.id, patch: { hidden: !tx.hidden } })}>
                          {tx.hidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                        </IconButton>
                        <IconButton label={`Delete ${tx.merchant}`} onClick={() => run({ action: "delete", ids: [tx.id] }, "Transaction deleted")}>
                          <Trash2 className="size-4" />
                        </IconButton>
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </Panel>

            <div className="grid content-start gap-6 lg:col-span-4 [&>*]:min-w-0">
              <Panel aria-labelledby="spend-title">
                <PanelHeader
                  titleId="spend-title"
                  title="Spending"
                  description={monthLabel(data.month)}
                  action={
                    <Segmented
                      label="Group spending by"
                      value={spendBy}
                      onChange={setSpendBy}
                      options={[
                        { value: "category", label: "Category" },
                        { value: "merchant", label: "Merchant" },
                      ]}
                    />
                  }
                />
                <ul className="grid gap-3 p-5 pt-4">
                  {topSpend.length === 0 ? <li className="text-sm text-on-surface-variant">No spending this month.</li> : null}
                  {topSpend.map((row) => {
                    const picked = spendBy === "category" ? categoryFilter === row.key : query === row.key;
                    return (
                    <li key={row.key}>
                      <button
                        type="button"
                        aria-pressed={picked}
                        onClick={() => {
                          // Tap again to clear; the list below follows the pick.
                          if (spendBy === "category") setCategoryFilter(picked ? "" : row.key);
                          else setQuery(picked ? "" : row.key);
                        }}
                        className={cn("w-full rounded-lg p-1 -m-1 text-left", picked && "bg-violet/10 ring-1 ring-violet/40")}
                      >
                        <span className="flex items-baseline justify-between gap-2 text-sm">
                          <span className="truncate text-on-surface">{row.name}</span>
                          <span className="mm-num shrink-0 font-semibold text-on-surface">{money(row.total)}</span>
                        </span>
                        <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-high">
                          <span className="block h-full rounded-full bg-violet" style={{ width: `${maxSpend ? (row.total / maxSpend) * 100 : 0}%` }} />
                        </span>
                      </button>
                    </li>
                    );
                  })}
                </ul>
              </Panel>

              <Panel aria-labelledby="recurring-title">
                <PanelHeader
                  titleId="recurring-title"
                  title="Recurring"
                  description={data.recurring.length ? `${money(Math.abs(data.recurring.filter((item) => isBill(item) && item.frequency === "monthly").reduce((total, item) => total + item.typical_amount, 0)))} a month in regular bills` : "Bills and subscriptions show up here after they repeat."}
                />
                <ul className="grid gap-1 p-3 pt-3" data-testid="recurring-list">
                  {data.recurring.length === 0 ? <li className="px-2 text-sm text-on-surface-variant">Nothing repeats yet. Import two or three months to find them.</li> : null}
                  {data.recurring.map((item) => (
                    <li key={item.merchant} className="flex items-center justify-between gap-3 rounded-xl px-2 py-2">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-on-surface">{item.merchant}</span>
                        <span className="block text-xs text-outline">
                          {item.frequency} · next {dayLabel(item.next_date)}
                          {item.amount_changed ? ` · last was ${money(Math.abs(item.last_amount))}` : ""}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span className={cn("mm-num text-sm font-semibold", item.typical_amount > 0 ? "text-engine" : "text-on-surface")}>{item.typical_amount > 0 ? "+" : ""}{money(Math.abs(item.typical_amount))}</span>
                        <span className={cn("rounded-full px-1.5 text-[10px] font-semibold", RECURRING_TONE[item.status])}>
                          {RECURRING_LABEL[item.status]}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Panel>

              <Panel aria-labelledby="rules-title">
                <PanelHeader titleId="rules-title" title="Rules" description="Run top to bottom on every import. Make one from any transaction with the wand." />
                <ul className="grid gap-2 p-5 pt-3">
                  {data.rules.length === 0 ? <li className="text-sm text-on-surface-variant">No rules yet.</li> : null}
                  {data.rules.map((rule) => (
                    <li key={rule.id} className="flex items-start justify-between gap-2 rounded-xl border border-outline-variant/40 px-3 py-2 text-xs leading-5">
                      <span className="min-w-0 text-on-surface-variant">{describeRule(rule, categoryName)}</span>
                      <IconButton label="Delete rule" onClick={() => run({ action: "delete_rule", id: rule.id }, "Rule deleted")}>
                        <Trash2 className="size-4" />
                      </IconButton>
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>
          </div>
        </>
      )}

      <ImportSheet open={importOpen} onClose={() => setImportOpen(false)} accounts={data.accounts} post={post} onImported={(next) => setData(next)} />
      <AddSheet open={addOpen} onClose={() => setAddOpen(false)} categories={data.categories} accounts={data.accounts} onSubmit={(body) => { run({ action: "add", ...body }, "Transaction added"); setAddOpen(false); }} />
      <RuleSheet tx={ruleFor} onClose={() => setRuleFor(null)} categories={data.categories} post={post} onSaved={(next, updated) => { setData(next); toast({ title: "Rule saved", description: `Applied to ${updated} past transaction${updated === 1 ? "" : "s"}.` }); }} />
    </div>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="grid size-11 place-items-center rounded-xl text-outline transition hover:bg-surface-high hover:text-on-surface sm:size-9">
      {children}
    </button>
  );
}

function ImportSheet({ open, onClose, accounts, post, onImported }: {
  open: boolean;
  onClose: () => void;
  accounts: Array<{ id: string; name: string }>;
  post: (body: Record<string, unknown>) => Promise<any>;
  onImported: (next: TransactionsData) => void;
}) {
  const [csv, setCsv] = useState("");
  const [accountId, setAccountId] = useState("");
  // null = let the importer decide from the recognized format.
  const [flip, setFlip] = useState<boolean | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const reset = () => { setCsv(""); setPreview(null); setError(""); setFlip(null); };
  const doPreview = async (text = csv, flipSign = flip) => {
    setError("");
    try {
      setPreview(await post({ action: "import_preview", csv: text, account_id: accountId, flip_sign: flipSign ?? undefined }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Preview failed.");
    }
  };
  const doImport = async () => {
    setBusy(true);
    try {
      const next = await post({ action: "import", csv, account_id: accountId, flip_sign: flip ?? undefined });
      onImported(next);
      const { imported, duplicates, batch_id } = next.result;
      toast({
        title: `Imported ${imported} transaction${imported === 1 ? "" : "s"}`,
        description: duplicates ? `${duplicates} duplicate${duplicates === 1 ? "" : "s"} skipped.` : undefined,
        action: imported ? { label: "Undo", onAction: () => void post({ action: "undo_import", batch_id }).then(onImported) } : undefined,
      });
      reset();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  };
  const doSandboxSync = async () => {
    setBusy(true);
    try {
      const next = await post({ action: "sandbox_sync" });
      onImported(next);
      const { added, updated, removed, batch_id } = next.sync_result;
      toast({
        title: `Sandbox sync: ${added} new`,
        description: updated || removed ? `${updated} updated · ${removed} removed` : "Made-up rows, marked Sandbox.",
        action: added ? { label: "Undo", onAction: () => void post({ action: "undo_import", batch_id }).then(onImported) } : undefined,
      });
      reset();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sandbox sync failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={() => { reset(); onClose(); }}
      title="Import transactions"
      description="Paste or choose a CSV from your bank or card. Nothing saves until you press Import."
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className={ghostButton} disabled={!csv.trim()} onClick={() => void doPreview()}>Preview</button>
          <button type="button" className={primaryButton} disabled={busy || !preview || preview.preview.new_count === 0} onClick={() => void doImport()}>
            Import {preview ? preview.preview.new_count : ""}
          </button>
        </div>
      }
    >
      <div className="grid gap-4">
        <label className="grid gap-1 text-sm font-semibold text-on-surface">
          CSV file
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            className="text-sm font-normal text-on-surface-variant file:mr-3 file:rounded-lg file:border-0 file:bg-surface-high file:px-3 file:py-2 file:text-on-surface"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const text = await file.text();
              setCsv(text);
              setFlip(null);
              void doPreview(text, null);
            }}
          />
        </label>
        <p className="-mt-2 flex flex-wrap items-center gap-2 text-xs text-outline">
          <label htmlFor="csv-sample">No file handy? Load a made-up sample:</label>
          <select
            id="csv-sample"
            value=""
            className="min-h-8 rounded-lg border border-outline-variant/60 bg-surface-lowest/70 px-2 text-xs text-on-surface"
            onChange={async (event) => {
              const name = event.target.value;
              if (!name) return;
              const text = await (await fetch(`/samples/${name}.csv`)).text();
              setCsv(text);
              setFlip(null);
              void doPreview(text, null);
            }}
          >
            <option value="">Choose a bank…</option>
            {CSV_SAMPLES.map((sample) => <option key={sample.id} value={sample.id}>{sample.label}</option>)}
          </select>
        </p>
        <label className="grid gap-1 text-sm font-semibold text-on-surface">
          Or paste it
          <textarea value={csv} onChange={(event) => { setCsv(event.target.value); setPreview(null); setFlip(null); }} rows={6} placeholder={"Date,Description,Amount\n09/02/2026,BLUE BOTTLE COFFEE,-6.50"} className="w-full rounded-xl border border-outline-variant/60 bg-surface-lowest/70 p-3 font-mono text-xs text-on-surface placeholder:text-outline" />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-semibold text-on-surface">
            Account (optional)
            <select value={accountId} onChange={(event) => { setAccountId(event.target.value); setPreview(null); }} className={field}>
              <option value="">No account</option>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 self-end text-sm text-on-surface-variant">
            <input type="checkbox" checked={flip ?? preview?.flipped ?? false} onChange={(event) => { setFlip(event.target.checked); if (csv.trim()) void doPreview(csv, event.target.checked); }} className="size-4 accent-[#f2559f]" />
            Purchases show as positive (most card exports)
          </label>
        </div>
        {error ? <p role="alert" className="text-sm text-critical">{error}</p> : null}
        {preview ? (
          <div className="grid gap-2 rounded-xl border border-outline-variant/50 p-3 text-sm" data-testid="import-preview">
            <p className="text-xs text-outline" data-testid="import-format">
              {preview.format.id === "generic" ? "Read as a plain bank CSV." : `Recognized: ${preview.format.label}.`}
              {preview.format.note && flip === null ? ` ${preview.format.note}` : ""}
              {preview.preview.categorized_count ? ` ${preview.preview.categorized_count} rows keep their category.` : ""}
            </p>
            {preview.preview.unmatched_accounts.length ? (
              <p className="text-xs text-caution">No account named {preview.preview.unmatched_accounts.join(", ")} yet; those rows import without an account.</p>
            ) : null}
            <p className="text-on-surface">
              <span className="font-semibold">{preview.preview.new_count} new</span>
              {preview.preview.duplicate_count ? ` · ${preview.preview.duplicate_count} already imported` : ""}
              {preview.preview.issue_count ? ` · ${preview.preview.issue_count} skipped` : ""}
            </p>
            {preview.issues.slice(0, 3).map((issue) => (
              <p key={issue.line} className="text-xs text-caution">Line {issue.line}: {issue.reason}</p>
            ))}
            {preview.sample.map((row, index) => (
              <p key={index} className="mm-num flex justify-between gap-3 text-xs text-on-surface-variant">
                <span className="truncate">{row.date} · {row.description}</span>
                <span className={row.amount > 0 ? "text-engine" : ""}>{row.amount > 0 ? "+" : "−"}{money(Math.abs(row.amount))}</span>
              </p>
            ))}
          </div>
        ) : null}
        <div className="flex flex-col gap-2 border-t border-outline-variant/40 pt-4 text-sm sm:flex-row sm:items-center sm:justify-between" data-testid="sandbox-sync">
          <p className="text-xs leading-5 text-outline">No bank is connected yet. Try the sync flow with a made-up checking account; rows are marked Sandbox and Undo removes them.</p>
          <button type="button" className={ghostButton} disabled={busy} onClick={() => void doSandboxSync()}>Run sandbox sync</button>
        </div>
      </div>
    </Sheet>
  );
}

function AddSheet({ open, onClose, categories, accounts, onSubmit }: {
  open: boolean;
  onClose: () => void;
  categories: Category[];
  accounts: Array<{ id: string; name: string }>;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [categoryId, setCategoryId] = useState("uncategorized");
  const [accountId, setAccountId] = useState("");
  const value = Number(amount);
  const valid = description.trim() && Number.isFinite(value) && value > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add a transaction"
      description="For cash or anything a CSV missed."
      footer={
        <div className="flex justify-end">
          <button
            type="button"
            className={primaryButton}
            disabled={!valid}
            onClick={() => {
              onSubmit({ date, description, amount: kind === "expense" ? -value : value, category_id: categoryId, account_id: accountId });
              setDescription("");
              setAmount("");
            }}
          >
            Add transaction
          </button>
        </div>
      }
    >
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Money in or out">
          {(["expense", "income"] as const).map((option) => (
            <button key={option} type="button" aria-pressed={kind === option} onClick={() => { setKind(option); setCategoryId(option === "income" ? "other-income" : "uncategorized"); }} className={cn(ghostButton, "justify-center", kind === option && "border-violet bg-violet/15 text-violet")}>
              {option === "expense" ? "Money out" : "Money in"}
            </button>
          ))}
        </div>
        <label className="grid gap-1 text-sm font-semibold text-on-surface">Description<input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="e.g. Farmers market" className={field} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-sm font-semibold text-on-surface">Amount<input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" className={field} /></label>
          <label className="grid gap-1 text-sm font-semibold text-on-surface">Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={field} /></label>
        </div>
        <label className="grid gap-1 text-sm font-semibold text-on-surface">
          Category
          <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className={field}>
            <CategoryOptions categories={categories} />
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold text-on-surface">
          Account (optional)
          <select value={accountId} onChange={(event) => setAccountId(event.target.value)} className={field}>
            <option value="">No account</option>
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
          </select>
        </label>
      </div>
    </Sheet>
  );
}

function RuleSheet({ tx, onClose, categories, post, onSaved }: {
  tx: TransactionRow | null;
  onClose: () => void;
  categories: Category[];
  post: (body: Record<string, unknown>) => Promise<any>;
  onSaved: (next: TransactionsData, updated: number) => void;
}) {
  const [match, setMatch] = useState("");
  const [rename, setRename] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [hide, setHide] = useState(false);
  const [applyToPast, setApplyToPast] = useState(true);
  const [matches, setMatches] = useState<number | null>(null);
  const [seededFor, setSeededFor] = useState<string | null>(null);

  if (tx && seededFor !== tx.id) {
    setSeededFor(tx.id);
    setMatch(tx.merchant);
    setRename(tx.merchant);
    setCategoryId(tx.category_id ?? "uncategorized");
    setHide(false);
    setMatches(null);
  }

  const rule = {
    conditions: { merchant: { op: "contains", value: match } },
    actions: { rename_merchant: rename.trim() || undefined, set_category_id: categoryId || undefined, hide: hide || undefined },
  };

  return (
    <Sheet
      open={Boolean(tx)}
      onClose={() => { setSeededFor(null); onClose(); }}
      title="Make a rule"
      description="Future imports that match get these changes automatically."
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" className={ghostButton} disabled={!match.trim()} onClick={() => void post({ action: "preview_rule", rule }).then((json) => setMatches(json.matches))}>
            <Sparkles aria-hidden="true" className="size-4" /> {matches === null ? "Preview matches" : `${matches} match${matches === 1 ? "" : "es"} now`}
          </button>
          <button
            type="button"
            className={primaryButton}
            disabled={!match.trim()}
            onClick={() => void post({ action: "add_rule", rule, apply_to_past: applyToPast }).then((json) => { onSaved(json, json.rule_result.updated); setSeededFor(null); onClose(); })}
          >
            Save rule
          </button>
        </div>
      }
    >
      <div className="grid gap-4">
        <label className="grid gap-1 text-sm font-semibold text-on-surface">
          When the merchant contains
          <input value={match} onChange={(event) => { setMatch(event.target.value); setMatches(null); }} className={field} />
        </label>
        <label className="grid gap-1 text-sm font-semibold text-on-surface">
          Rename it to
          <input value={rename} onChange={(event) => setRename(event.target.value)} className={field} />
        </label>
        <label className="grid gap-1 text-sm font-semibold text-on-surface">
          Set the category to
          <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className={field}>
            <CategoryOptions categories={categories} />
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-on-surface-variant">
          <input type="checkbox" checked={hide} onChange={(event) => setHide(event.target.checked)} className="size-4 accent-[#f2559f]" />
          Hide it from cash flow
        </label>
        <label className="flex items-center gap-2 text-sm text-on-surface-variant">
          <input type="checkbox" checked={applyToPast} onChange={(event) => setApplyToPast(event.target.checked)} className="size-4 accent-[#f2559f]" />
          Also apply to transactions already imported
        </label>
      </div>
    </Sheet>
  );
}

function describeRule(rule: TransactionRuleRow, categoryName: Map<string, string>) {
  const c = rule.conditions;
  const when = [
    c.merchant ? `merchant ${c.merchant.op} “${c.merchant.value}”` : null,
    c.original_description ? `statement ${c.original_description.op} “${c.original_description.value}”` : null,
    c.amount ? `amount ${c.amount.op} ${c.amount.value}` : null,
    c.direction ? c.direction : null,
  ].filter(Boolean).join(" and ");
  const a = rule.actions;
  const then = [
    a.rename_merchant ? `rename to “${a.rename_merchant}”` : null,
    a.set_category_id ? `category ${categoryName.get(a.set_category_id) ?? a.set_category_id}` : null,
    a.hide ? "hide" : null,
    a.add_tags?.length ? `tag ${a.add_tags.join(", ")}` : null,
  ].filter(Boolean).join(", ");
  return `When ${when || "…"}: ${then || "no change"}.`;
}

function money(value: number) {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: Math.abs(value) >= 1000 ? 0 : 2 });
}

function monthLabel(month: string) {
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year, m - 1, 1)).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

function dayLabel(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}


/** Options grouped under their Monarch-style group, so each shows just its name. */
function CategoryOptions({ categories }: { categories: Category[] }) {
  const groups = new Map<string, Category[]>();
  for (const category of categories) groups.set(category.group, [...(groups.get(category.group) ?? []), category]);
  return (
    <>
      {[...groups.entries()].map(([group, items]) => (
        <optgroup key={group} label={group}>
          {items.map((category) => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

const RECURRING_LABEL: Record<RecurringItem["status"], string> = {
  paid: "Paid",
  changed: "Paid, new amount",
  upcoming: "Upcoming",
  missed: "Missed",
};

const RECURRING_TONE: Record<RecurringItem["status"], string> = {
  paid: "bg-engine/15 text-engine",
  changed: "bg-caution/15 text-caution",
  upcoming: "bg-violet/15 text-violet",
  missed: "bg-critical/15 text-critical",
};

/** Monarch's cash flow view: income and spending per month; tap a month to open it. */
function CashFlowBars({ history, selected, onSelect }: { history: CashFlowPoint[]; selected: string; onSelect: (month: string) => void }) {
  const max = Math.max(1, ...history.flatMap((point) => [point.income, point.expenses]));
  return (
    <Panel aria-labelledby="cash-flow-bars-title" data-testid="cash-flow-bars">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-4">
        <h2 id="cash-flow-bars-title" className="font-display text-base font-semibold text-on-surface">Cash flow</h2>
        <p className="flex items-center gap-3 text-xs text-outline">
          <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2 rounded-full bg-engine" /> Income</span>
          <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2 rounded-full bg-violet" /> Spending</span>
        </p>
      </div>
      <div className="flex items-end gap-1 overflow-x-auto px-3 pb-3 pt-3" role="group" aria-label="Month">
        {history.map((point) => {
          const active = point.month === selected;
          return (
            <button
              key={point.month}
              type="button"
              onClick={() => onSelect(point.month)}
              aria-pressed={active}
              aria-label={`${monthLabel(point.month)}: income ${money(point.income)}, spending ${money(point.expenses)}`}
              className={cn("flex min-w-12 flex-1 flex-col items-center gap-1.5 rounded-xl px-1 pb-1.5 pt-2 transition", active ? "bg-violet/10 ring-1 ring-violet/40" : "hover:bg-surface-high/60")}
            >
              <span className="flex h-28 items-end gap-1" aria-hidden="true">
                <span className="w-2.5 rounded-t bg-engine/80 sm:w-3.5" style={{ height: `${Math.max(2, (point.income / max) * 100)}%` }} />
                <span className="w-2.5 rounded-t bg-violet sm:w-3.5" style={{ height: `${Math.max(2, (point.expenses / max) * 100)}%` }} />
              </span>
              <span className={cn("text-[11px] font-semibold", active ? "text-violet" : "text-outline")}>{monthLabel(point.month).replace(/ \d{4}$/, "")}</span>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}
