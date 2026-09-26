"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownUp,
  Banknote,
  Building2,
  Car,
  CreditCard,
  FileUp,
  Home,
  Landmark,
  Loader2,
  PiggyBank,
  Plus,
  RefreshCw,
  Search,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AreaChart, DonutChart, type DonutSlice } from "@/components/ui/chart";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Segmented } from "@/components/ui/segmented";
import { StatTile } from "@/components/ui/stat";
import { toast } from "@/components/ui/toast";
import { accountTypeLabel } from "@/lib/money-accounts";
import {
  ASSET_CLASS_LABEL,
  formatMoney,
  formatPrice,
  formatQuantity,
  formatSignedMoney,
  formatSignedPct,
  relativeTime,
  toneFor,
} from "@/lib/money-format";
import { cn } from "@/lib/utils";
import type { MoneyAccount, MoneyHolding, MoneySummary } from "@/src/db/money";
import { AccountSheet } from "./account-sheet";
import { HoldingSheet } from "./holding-sheet";
import { ImportSheet } from "./import-sheet";
import { moneyRequest, toastError, toastWithUndo } from "./money-api";

type AllocationMode = "class" | "account" | "asset";
type SortKey = "value" | "symbol" | "today" | "gain";
type Filter = { mode: AllocationMode; key: string } | null;

const ACCOUNT_ICON: Record<string, LucideIcon> = {
  brokerage: Landmark,
  retirement: PiggyBank,
  crypto_exchange: Wallet,
  wallet: Wallet,
  bank: Building2,
  cash: Banknote,
  credit_card: CreditCard,
  loan: Banknote,
  mortgage: Home,
  property: Home,
  vehicle: Car,
  other: Landmark,
};

const INITIAL_ROWS = 25;

export function PortfolioHub({
  summary,
  policyIntents,
  sourceLine,
}: {
  summary: MoneySummary;
  policyIntents: Record<string, string>;
  sourceLine: string;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [allocationMode, setAllocationMode] = useState<AllocationMode>("class");
  const [filter, setFilter] = useState<Filter>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "value", dir: -1 });
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openHolding, setOpenHolding] = useState<MoneyHolding | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [accountSheet, setAccountSheet] = useState<{ open: boolean; account: MoneyAccount | null }>({ open: false, account: null });
  const [pricing, setPricing] = useState(false);
  const [editing, setEditing] = useState<{ id: string; field: "quantity" | "price" } | null>(null);

  const refresh = useCallback(() => startRefresh(() => router.refresh()), [router]);

  // Command routes: /portfolio?action=add-holding opens the add sheet.
  useEffect(() => {
    const url = new URL(window.location.href);
    const action = url.searchParams.get("action");
    const search = url.searchParams.get("q");
    if (search) setQuery(search);
    if (action === "add-holding") setAddOpen(true);
    if (action === "import-holdings") setImportOpen(true);
    if (action) {
      url.searchParams.delete("action");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }, []);

  const accountsById = useMemo(() => new Map(summary.accounts.map((account) => [account.id, account])), [summary.accounts]);
  const accountName = useCallback(
    (holding: MoneyHolding) => (holding.account_id ? accountsById.get(holding.account_id)?.name : null) ?? (holding.source === "manual" ? "Unassigned" : holding.account.label),
    [accountsById],
  );

  const slices: DonutSlice[] = useMemo(() => {
    const groups = new Map<string, { label: string; value: number }>();
    for (const holding of summary.holdings) {
      const key = allocationMode === "class" ? holding.asset_class : allocationMode === "account" ? holding.account_id ?? "unassigned" : holding.symbol;
      const label = allocationMode === "class" ? ASSET_CLASS_LABEL[holding.asset_class] : allocationMode === "account" ? accountName(holding) : holding.symbol;
      const entry = groups.get(key) ?? { label, value: 0 };
      entry.value += holding.market_value;
      groups.set(key, entry);
    }
    if (allocationMode === "account") {
      for (const account of summary.accounts) {
        if (account.kind === "asset" && account.balance > 0) {
          const entry = groups.get(account.id) ?? { label: account.name, value: 0 };
          entry.value += account.balance;
          groups.set(account.id, entry);
        }
      }
    }
    const sorted = [...groups.entries()].map(([key, entry]) => ({ key, ...entry })).sort((a, b) => b.value - a.value);
    if (allocationMode === "asset" && sorted.length > 8) {
      const top = sorted.slice(0, 7);
      const rest = sorted.slice(7);
      return [...top, { key: "__other", label: `${rest.length} others`, value: rest.reduce((sum, item) => sum + item.value, 0) }];
    }
    return sorted;
  }, [summary.holdings, summary.accounts, allocationMode, accountName]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const topAssets = new Set(slices.filter((slice) => slice.key !== "__other").map((slice) => slice.key));
    const rows = summary.holdings.filter((holding) => {
      if (needle && !`${holding.symbol} ${holding.asset_name}`.toLowerCase().includes(needle)) return false;
      if (!filter) return true;
      if (filter.mode === "class") return holding.asset_class === filter.key;
      if (filter.mode === "account") return (holding.account_id ?? "unassigned") === filter.key;
      if (filter.key === "__other") return !topAssets.has(holding.symbol);
      return holding.symbol === filter.key;
    });
    const value = (holding: MoneyHolding) =>
      sort.key === "value" ? holding.market_value : sort.key === "today" ? holding.daily_change_pct : sort.key === "gain" ? holding.gain_value ?? -Infinity : 0;
    return rows.sort((a, b) => (sort.key === "symbol" ? a.symbol.localeCompare(b.symbol) * -sort.dir : (value(a) - value(b)) * sort.dir));
  }, [summary.holdings, query, filter, sort, slices]);

  const shownRows = showAll || query || filter ? visible : visible.slice(0, INITIAL_ROWS);
  const selectedIds = [...selected].filter((id) => summary.holdings.some((holding) => holding.id === id && holding.editable));
  const editableCount = summary.holdings.filter((holding) => holding.editable).length;

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function refreshPrices() {
    setPricing(true);
    try {
      const result = await moneyRequest<{ refreshed: number; failed: string[]; total: number; unchanged_cash: number }>("/api/money/quotes", { method: "POST" });
      toast({
        title: `Priced ${result.refreshed + result.unchanged_cash} of ${result.total}`,
        description: result.failed.length ? `No quote for ${result.failed.slice(0, 6).join(", ")}${result.failed.length > 6 ? ` +${result.failed.length - 6}` : ""}` : "Every holding has a current price.",
        tone: result.failed.length ? "info" : "success",
      });
      refresh();
    } catch (error) {
      toastError(error);
    } finally {
      setPricing(false);
    }
  }

  async function bulk(action: { delete: true } | { patch: Record<string, unknown> }, label: string) {
    try {
      const result = await moneyRequest<{ previous: unknown[]; affected: number }>("/api/money/holdings/bulk", {
        method: "POST",
        body: { ids: selectedIds, ...action },
      });
      toastWithUndo(`${label} ${result.affected} holding${result.affected === 1 ? "" : "s"}`, result.previous, "rows", refresh);
      setSelected(new Set());
      refresh();
    } catch (error) {
      toastError(error);
    }
  }

  async function saveInline(holding: MoneyHolding, field: "quantity" | "price", raw: string) {
    setEditing(null);
    const value = Number(raw.replace(/[$,\s]/g, ""));
    if (!Number.isFinite(value) || value < 0 || value === holding[field]) return;
    try {
      const result = await moneyRequest<{ before: unknown }>(`/api/money/holdings/${holding.id}`, { method: "PATCH", body: { [field]: value } });
      toastWithUndo(`${holding.symbol} ${field === "quantity" ? "amount" : "price"} saved`, [result.before], "rows", refresh);
      refresh();
    } catch (error) {
      toastError(error);
    }
  }

  function sortBy(key: SortKey) {
    setSort((current) => (current.key === key ? { key, dir: current.dir === 1 ? -1 : 1 } : { key, dir: key === "symbol" ? 1 : -1 }));
  }

  const liabilities = summary.accounts.filter((account) => account.kind === "liability");
  const assetAccounts = summary.accounts.filter((account) => account.kind === "asset");
  const unassignedCount = summary.holdings.filter((holding) => holding.source === "manual" && !holding.account_id).length;
  const filterLabel = filter ? slices.find((slice) => slice.key === filter.key)?.label ?? filter.key : null;

  return (
    <div className="grid grid-cols-1 gap-6 [&>*]:min-w-0">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="mm-eyebrow">{sourceLine}</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-on-surface sm:text-4xl">Portfolio</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {refreshing ? <Loader2 aria-label="Updating" className="size-4 animate-spin text-outline" /> : null}
          <Button variant="outline" onClick={refreshPrices} disabled={pricing || editableCount === 0} title="Pull a current price for every holding">
            <RefreshCw className={cn(pricing && "animate-spin")} /> {pricing ? "Pricing…" : "Refresh prices"}
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <FileUp /> Import
          </Button>
          <a
            id="add-holdings"
            href="#add-holdings"
            onClick={(event) => {
              event.preventDefault();
              setAddOpen(true);
            }}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet px-4 text-sm font-semibold text-void shadow-glow transition hover:bg-violet/90 sm:min-h-9"
          >
            <Plus aria-hidden="true" className="size-4" /> Add holding
          </a>
        </div>
      </header>

      {!summary.is_personal ? (
        <Panel className="flex flex-col gap-3 border-violet/30 p-5 sm:flex-row sm:items-center">
          <p className="min-w-0 flex-1 text-sm leading-6 text-on-surface-variant">
            <span className="font-display text-base font-semibold text-on-surface">You’re looking at sample data.</span>
            <br />
            Import your book (the manual_holdings JSON works as-is) or add holdings and accounts to see your real net worth.
          </p>
          <Button onClick={() => setImportOpen(true)}>
            <FileUp /> Import my book
          </Button>
        </Panel>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="money-stats">
        <StatTile
          emphasis
          label="Net worth"
          value={formatMoney(summary.net_worth)}
          trend={summary.history.map((point) => point.value)}
          delta={`${formatSignedMoney(summary.daily_change_value)} (${formatSignedPct(summary.daily_change_pct)}) today`}
          deltaTone={summary.daily_change_value >= 0 ? "up" : "down"}
        />
        <StatTile label="Assets" value={formatMoney(summary.assets, { compact: true })} hint={`${summary.holdings.length} holdings · ${assetAccounts.length} accounts`} />
        <StatTile
          label="Debts"
          value={formatMoney(summary.liabilities, { compact: true })}
          hint={liabilities.length ? `${liabilities.length} account${liabilities.length === 1 ? "" : "s"}` : "None added"}
          deltaTone="down"
        />
        <StatTile
          label="Prices"
          value={`${summary.priced_count}/${summary.holdings.length}`}
          hint={summary.last_priced_at ? `current · ${relativeTime(summary.last_priced_at)}` : "typed in — refresh"}
          deltaTone={summary.stale_count ? "caution" : "up"}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 [&>*]:min-w-0">
        <Panel className="lg:col-span-7">
          <PanelHeader title="Net worth" description="Assets minus debts. A point is saved each day the book changes or is priced." />
          <div className="p-5 pt-3">
            {summary.history.length >= 2 ? (
              <AreaChart
                ariaLabel="Net worth history"
                points={summary.history.map((point) => ({ label: formatDay(point.date), value: point.value }))}
                format={(value) => formatMoney(value)}
              />
            ) : (
              <EmptyState title="History starts today" description="Come back tomorrow, or refresh prices, and this line starts drawing itself." />
            )}
          </div>
        </Panel>
        <Panel className="lg:col-span-5">
          <PanelHeader
            title="Allocation"
            action={
              <Segmented
                label="Group allocation by"
                value={allocationMode}
                onChange={(mode) => {
                  setAllocationMode(mode);
                  setFilter(null);
                }}
                options={[
                  { value: "class", label: "Kind" },
                  { value: "account", label: "Account" },
                  { value: "asset", label: "Asset" },
                ]}
              />
            }
          />
          <div className="p-5 pt-4">
            <DonutChart
              slices={slices}
              format={(value) => formatMoney(value, { compact: true })}
              centerLabel="Assets"
              picked={filter?.mode === allocationMode ? filter.key : null}
              onPick={(key) => setFilter(key ? { mode: allocationMode, key } : null)}
            />
            <p className="mt-3 text-xs text-outline">Tap a slice to filter your holdings.</p>
          </div>
        </Panel>
      </div>

      <section aria-labelledby="accounts-title" className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="accounts-title" className="mm-eyebrow">Accounts</h2>
          <button type="button" onClick={() => setAccountSheet({ open: true, account: null })} className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-violet hover:text-violet-soft">
            <Plus aria-hidden="true" className="size-3.5" /> Add account
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {summary.accounts.map((account) => {
            const Icon = ACCOUNT_ICON[account.type] ?? Landmark;
            const liability = account.kind === "liability";
            return (
              <button
                key={account.id}
                type="button"
                onClick={() => (account.holding_count ? setFilter({ mode: "account", key: account.id }) : setAccountSheet({ open: true, account }))}
                onDoubleClick={() => setAccountSheet({ open: true, account })}
                className={cn("mm-panel mm-panel-interactive flex min-h-24 flex-col gap-2 p-4 text-left", liability && "border-critical/25")}
              >
                <span className="flex items-center gap-2">
                  <span className={cn("flex size-8 items-center justify-center rounded-lg", liability ? "bg-critical/10 text-critical" : "bg-violet/10 text-violet")}>
                    <Icon aria-hidden="true" className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-on-surface">{account.name}</span>
                    <span className="block truncate text-[11px] text-outline">
                      {accountTypeLabel(account.type)}
                      {account.institution ? ` · ${account.institution}` : ""}
                    </span>
                  </span>
                  <span
                    role="link"
                    tabIndex={0}
                    onClick={(event) => {
                      event.stopPropagation();
                      setAccountSheet({ open: true, account });
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.stopPropagation();
                        setAccountSheet({ open: true, account });
                      }
                    }}
                    className="rounded-md px-1.5 py-1 text-[11px] font-semibold text-outline hover:text-violet"
                  >
                    Edit
                  </span>
                </span>
                <span className={cn("mm-num font-display text-xl font-semibold", liability ? "text-critical" : "text-on-surface")}>
                  {liability ? "−" : ""}
                  {formatMoney(account.value)}
                </span>
                <span className="text-[11px] text-outline">
                  {account.holding_count ? `${account.holding_count} holdings` : liability ? "Owed" : "Balance"}
                </span>
              </button>
            );
          })}
          {unassignedCount > 0 ? (
            <button
              type="button"
              onClick={() => setFilter({ mode: "account", key: "unassigned" })}
              className="mm-panel mm-panel-interactive flex min-h-24 flex-col gap-2 border-dashed p-4 text-left"
            >
              <span className="text-sm font-semibold text-on-surface">Unassigned</span>
              <span className="mm-num font-display text-xl font-semibold text-on-surface">{formatMoney(summary.unassigned_value)}</span>
              <span className="text-[11px] text-outline">{unassignedCount} holdings · select rows below to move them</span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setAccountSheet({ open: true, account: null })}
            className="flex min-h-24 flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-outline-variant/70 p-4 text-sm text-on-surface-variant transition hover:border-violet/50 hover:text-violet"
          >
            <Plus aria-hidden="true" className="size-5" />
            Add account, debt, or property
          </button>
        </div>
      </section>

      <Panel as="section" aria-labelledby="holdings-title" className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-5 pt-5">
          <h2 id="holdings-title" className="font-display text-base font-semibold text-on-surface">
            Holdings <span className="ml-1 text-sm font-normal text-outline">{visible.length}</span>
          </h2>
          {filterLabel ? (
            <button type="button" onClick={() => setFilter(null)} className="inline-flex min-h-8 items-center gap-1 rounded-full border border-violet/40 bg-violet/10 px-3 text-xs font-semibold text-violet">
              {filterLabel} <X aria-hidden="true" className="size-3" />
            </button>
          ) : null}
          <label className="ml-auto flex min-h-10 w-full items-center gap-2 rounded-xl border border-outline-variant/70 bg-surface-lowest/70 px-3 sm:w-56">
            <Search aria-hidden="true" className="size-4 text-outline" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search holdings" aria-label="Search holdings" className="min-w-0 flex-1 bg-transparent text-sm text-on-surface placeholder:text-outline focus:outline-none" />
          </label>
        </div>

        {selectedIds.length > 0 ? (
          <div className="mx-5 mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-violet/40 bg-violet/10 p-2 pl-4 text-sm">
            <span className="font-semibold text-on-surface">{selectedIds.length} selected</span>
            <select
              aria-label="Move selected to account"
              className="min-h-9 rounded-lg border border-outline-variant/70 bg-surface-dim px-2 text-xs text-on-surface"
              value=""
              onChange={(event) => event.target.value && bulk({ patch: { account_id: event.target.value === "none" ? null : event.target.value } }, "Moved")}
            >
              <option value="">Move to account…</option>
              {assetAccounts.map((account) => (
                <option key={account.id} value={account.id}>{account.name}</option>
              ))}
              <option value="none">Unassigned</option>
            </select>
            <select
              aria-label="Set kind for selected"
              className="min-h-9 rounded-lg border border-outline-variant/70 bg-surface-dim px-2 text-xs text-on-surface"
              value=""
              onChange={(event) => event.target.value && bulk({ patch: { asset_class: event.target.value } }, "Updated")}
            >
              <option value="">Set kind…</option>
              {Object.entries(ASSET_CLASS_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <Button size="sm" variant="ghost" className="text-critical hover:text-critical" onClick={() => bulk({ delete: true }, "Removed")}>
              Remove
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        ) : null}

        <div className="mt-4">
          {visible.length === 0 ? (
            <div className="p-5">
              <EmptyState icon={Search} title="No holdings match" description="Clear the search or filter to see everything." />
            </div>
          ) : (
            <>
              {/* Phones: tappable cards. */}
              <ul className="grid gap-1 px-2 pb-2 md:hidden">
                {shownRows.map((holding) => (
                  <li key={holding.id}>
                    <button type="button" onClick={() => setOpenHolding(holding)} className="mm-row flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left">
                      <FreshDot freshness={holding.freshness} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-on-surface">{holding.symbol}</span>
                        <span className="block truncate text-xs text-outline">{formatQuantity(holding.quantity)} · {accountName(holding)}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="mm-num block font-semibold text-on-surface">{formatMoney(holding.market_value, { cents: holding.market_value < 100 })}</span>
                        <span className={cn("mm-num block text-xs", toneFor(holding.daily_change_pct))}>
                          {holding.daily_change_pct ? formatSignedPct(holding.daily_change_pct) : `${holding.weight_pct.toFixed(1)}% of book`}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {/* Desktop: dense table with inline edits. */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr className="text-left">
                      <th className="w-10 border-b border-outline-variant/60 px-3 py-2.5">
                        <input
                          type="checkbox"
                          aria-label="Select all visible"
                          className="size-4 accent-[#f2559f]"
                          checked={shownRows.length > 0 && shownRows.filter((row) => row.editable).every((row) => selected.has(row.id))}
                          onChange={(event) => setSelected(event.target.checked ? new Set(shownRows.filter((row) => row.editable).map((row) => row.id)) : new Set())}
                        />
                      </th>
                      <SortHeader label="Asset" active={sort.key === "symbol"} onClick={() => sortBy("symbol")} />
                      <th className={thClass + " text-right"}>Amount</th>
                      <th className={thClass + " text-right"}>Price</th>
                      <SortHeader label="Value" right active={sort.key === "value"} onClick={() => sortBy("value")} />
                      <SortHeader label="Today" right active={sort.key === "today"} onClick={() => sortBy("today")} />
                      <SortHeader label="Gain" right active={sort.key === "gain"} onClick={() => sortBy("gain")} />
                      <th className={thClass + " text-right"}>Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownRows.map((holding) => (
                      <tr key={holding.id} className="group">
                        <td className={tdClass}>
                          <input
                            type="checkbox"
                            aria-label={`Select ${holding.symbol}`}
                            className="size-4 accent-[#f2559f]"
                            disabled={!holding.editable}
                            checked={selected.has(holding.id)}
                            onChange={() => toggle(holding.id)}
                          />
                        </td>
                        <td className={tdClass}>
                          <button type="button" onClick={() => setOpenHolding(holding)} className="flex min-h-9 items-center gap-2 text-left">
                            <span className="font-semibold text-on-surface group-hover:text-violet">{holding.symbol}</span>
                            <span className="max-w-[12rem] truncate text-xs text-outline">{holding.asset_name !== holding.symbol ? holding.asset_name : accountName(holding)}</span>
                          </button>
                        </td>
                        <td className={tdClass + " text-right"}>
                          <InlineNumber
                            editing={editing?.id === holding.id && editing.field === "quantity"}
                            display={formatQuantity(holding.quantity)}
                            value={holding.quantity}
                            disabled={!holding.editable}
                            onStart={() => setEditing({ id: holding.id, field: "quantity" })}
                            onCommit={(raw) => saveInline(holding, "quantity", raw)}
                            onCancel={() => setEditing(null)}
                            label={`${holding.symbol} amount`}
                          />
                        </td>
                        <td className={tdClass + " text-right"}>
                          <span className="inline-flex items-center justify-end gap-1.5">
                            <FreshDot freshness={holding.freshness} />
                            <InlineNumber
                              editing={editing?.id === holding.id && editing.field === "price"}
                              display={formatPrice(holding.price)}
                              value={holding.price}
                              disabled={!holding.editable || holding.asset_class === "cash"}
                              onStart={() => setEditing({ id: holding.id, field: "price" })}
                              onCommit={(raw) => saveInline(holding, "price", raw)}
                              onCancel={() => setEditing(null)}
                              label={`${holding.symbol} price`}
                            />
                          </span>
                        </td>
                        <td className={tdClass + " text-right font-semibold"}>{formatMoney(holding.market_value, { cents: holding.market_value < 100 })}</td>
                        <td className={cn(tdClass, "text-right", toneFor(holding.daily_change_pct))}>
                          {holding.daily_change_pct ? formatSignedPct(holding.daily_change_pct) : "—"}
                        </td>
                        <td className={cn(tdClass, "text-right", holding.gain_value === null ? "text-outline" : toneFor(holding.gain_value))}>
                          {holding.gain_value === null ? (
                            <button type="button" onClick={() => setOpenHolding(holding)} className="text-xs hover:text-violet" disabled={!holding.editable}>
                              {holding.editable ? "add basis" : "—"}
                            </button>
                          ) : (
                            <span title={holding.gain_pct === null ? undefined : formatSignedPct(holding.gain_pct)}>{formatSignedMoney(holding.gain_value)}</span>
                          )}
                        </td>
                        <td className={tdClass + " text-right text-on-surface-variant"}>{holding.weight_pct.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {visible.length > shownRows.length ? (
                <div className="border-t border-outline-variant/40 p-3 text-center">
                  <Button variant="ghost" size="sm" onClick={() => setShowAll(true)}>
                    Show all {visible.length} holdings
                  </Button>
                </div>
              ) : null}
              <p className="px-5 pb-4 pt-2 text-[11px] text-outline">
                <span className="mr-3 inline-flex items-center gap-1"><FreshDot freshness="live" /> current price</span>
                <span className="mr-3 inline-flex items-center gap-1"><FreshDot freshness="stale" /> older than a day</span>
                <span className="inline-flex items-center gap-1"><FreshDot freshness="typed" /> typed in</span>
                <span className="ml-3 hidden md:inline">Double-click an amount or price to edit it.</span>
              </p>
            </>
          )}
        </div>
      </Panel>

      <HoldingSheet
        open={Boolean(openHolding) || addOpen}
        holding={openHolding}
        accounts={summary.accounts}
        policyIntent={openHolding ? policyIntents[openHolding.symbol.toUpperCase()] : undefined}
        onClose={() => {
          setOpenHolding(null);
          setAddOpen(false);
        }}
        onSaved={refresh}
      />
      <ImportSheet open={importOpen} onClose={() => setImportOpen(false)} onSaved={refresh} />
      <AccountSheet
        open={accountSheet.open}
        account={accountSheet.account}
        onClose={() => setAccountSheet({ open: false, account: null })}
        onSaved={refresh}
      />
    </div>
  );
}

const thClass = "border-b border-outline-variant/60 px-3 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-outline";
const tdClass = "mm-num border-b border-outline-variant/25 px-3 py-2 align-middle text-on-surface transition-colors group-hover:bg-surface-high/35";

function SortHeader({ label, active, onClick, right = false }: { label: string; active: boolean; onClick: () => void; right?: boolean }) {
  return (
    <th className={cn(thClass, right && "text-right")} aria-sort={active ? "descending" : undefined}>
      <button type="button" onClick={onClick} className={cn("inline-flex items-center gap-1 uppercase hover:text-on-surface", active && "text-violet")}>
        {label}
        <ArrowDownUp aria-hidden="true" className="size-3" />
      </button>
    </th>
  );
}

function FreshDot({ freshness }: { freshness: MoneyHolding["freshness"] }) {
  const color = freshness === "live" ? "bg-engine" : freshness === "stale" ? "bg-caution" : freshness === "sample" ? "bg-demo" : "bg-outline";
  const label = freshness === "live" ? "Current price" : freshness === "stale" ? "Price older than a day" : freshness === "sample" ? "Sample" : "Price typed in";
  return <span title={label} aria-label={label} className={cn("inline-block size-1.5 shrink-0 rounded-full", color)} />;
}

function InlineNumber({
  editing,
  display,
  value,
  disabled,
  onStart,
  onCommit,
  onCancel,
  label,
}: {
  editing: boolean;
  display: string;
  value: number;
  disabled: boolean;
  onStart: () => void;
  onCommit: (raw: string) => void;
  onCancel: () => void;
  label: string;
}) {
  if (editing) {
    return (
      <input
        autoFocus
        defaultValue={String(value)}
        aria-label={label}
        inputMode="decimal"
        onBlur={(event) => onCommit(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onCommit(event.currentTarget.value);
          if (event.key === "Escape") onCancel();
        }}
        className="mm-num h-8 w-28 rounded-lg border border-violet/60 bg-surface-lowest px-2 text-right text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-violet/30"
      />
    );
  }
  return (
    <span
      role={disabled ? undefined : "button"}
      tabIndex={disabled ? undefined : 0}
      title={disabled ? undefined : "Double-click to edit"}
      onDoubleClick={disabled ? undefined : onStart}
      onKeyDown={(event) => {
        if (!disabled && event.key === "Enter") onStart();
      }}
      className={cn("rounded-md px-1 py-0.5", !disabled && "cursor-text hover:bg-surface-high/60")}
    >
      {display}
    </span>
  );
}

function formatDay(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
