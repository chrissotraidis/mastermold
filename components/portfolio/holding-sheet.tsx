"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Shield, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { ASSET_CLASS_LABEL, formatMoney, formatPrice, formatSignedMoney, formatSignedPct, relativeTime, toneFor } from "@/lib/money-format";
import type { MoneyAccount, MoneyHolding } from "@/src/db/money";
import { Field, fieldClass } from "./fields";
import { moneyRequest, toastError, toastWithUndo } from "./money-api";

const CLASSES = ["equity", "crypto", "defi", "cash"] as const;

export function HoldingSheet({
  open,
  holding,
  accounts,
  onClose,
  onSaved,
  policyIntent,
}: {
  open: boolean;
  /** null = add a new holding */
  holding: MoneyHolding | null;
  accounts: MoneyAccount[];
  onClose: () => void;
  onSaved: () => void;
  policyIntent?: string;
}) {
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [assetClass, setAssetClass] = useState<(typeof CLASSES)[number]>("equity");
  const [accountId, setAccountId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [costBasis, setCostBasis] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSymbol(holding?.symbol ?? "");
    setName(holding && holding.asset_name !== holding.symbol ? holding.asset_name : "");
    setAssetClass((holding?.asset_class as (typeof CLASSES)[number]) ?? "equity");
    setAccountId(holding?.account_id ?? "");
    setQuantity(holding ? String(holding.quantity) : "");
    setPrice(holding ? String(holding.price) : "");
    setCostBasis(holding?.cost_basis_known ? String(holding.cost_basis) : "");
  }, [open, holding]);

  const investmentAccounts = accounts.filter((account) => account.kind === "asset");
  const readOnly = Boolean(holding && !holding.editable);
  const number = (value: string) => Number(value.replace(/[$,\s]/g, ""));

  async function save() {
    setBusy(true);
    try {
      const body = {
        symbol,
        asset_name: name,
        asset_class: assetClass,
        account_id: accountId || null,
        quantity: number(quantity),
        price: assetClass === "cash" && !price ? 1 : number(price),
        cost_basis: costBasis.trim() === "" ? null : number(costBasis),
      };
      if (holding) {
        const result = await moneyRequest<{ before: unknown }>(`/api/money/holdings/${holding.id}`, { method: "PATCH", body });
        toastWithUndo(`${symbol.toUpperCase()} updated`, [result.before], "rows", onSaved);
      } else {
        await moneyRequest("/api/money/holdings", { method: "POST", body });
        toast({ title: `${symbol.toUpperCase()} added` });
      }
      onSaved();
      onClose();
    } catch (error) {
      toastError(error);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!holding) return;
    setBusy(true);
    try {
      const result = await moneyRequest<{ previous: unknown[] }>(`/api/money/holdings/${holding.id}`, { method: "DELETE" });
      toastWithUndo(`${holding.symbol} removed`, result.previous, "rows", onSaved);
      onSaved();
      onClose();
    } catch (error) {
      toastError(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={holding ? holding.symbol : "Add a holding"}
      description={holding ? holding.asset_name !== holding.symbol ? holding.asset_name : ASSET_CLASS_LABEL[holding.asset_class] : "Stocks, funds, crypto, or cash. You can import many at once from Import."}
      footer={
        readOnly ? (
          <p className="text-xs text-outline">This row comes from a connected or sample source and is read-only here.</p>
        ) : (
          <div className="flex items-center justify-between gap-3">
            {holding ? (
              <Button variant="ghost" onClick={remove} disabled={busy} className="text-critical hover:text-critical">
                <Trash2 /> Remove
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={save} disabled={busy || !symbol.trim() || !quantity}>{holding ? "Save changes" : "Add holding"}</Button>
            </div>
          </div>
        )
      }
    >
      {holding ? (
        <div className="mb-5 grid grid-cols-2 gap-2">
          <Metric label="Value" value={formatMoney(holding.market_value, { cents: holding.market_value < 1000 })} />
          <Metric label="Share of book" value={`${holding.weight_pct.toFixed(1)}%`} />
          <Metric
            label="Gain / loss"
            value={holding.gain_value === null ? "Add cost basis" : formatSignedMoney(holding.gain_value)}
            detail={holding.gain_pct === null ? undefined : formatSignedPct(holding.gain_pct)}
            tone={holding.gain_value === null ? "text-outline" : toneFor(holding.gain_value)}
          />
          <Metric
            label="Today"
            value={holding.daily_change_pct ? formatSignedPct(holding.daily_change_pct) : "—"}
            tone={toneFor(holding.daily_change_pct)}
            detail={holding.daily_change_value ? formatSignedMoney(holding.daily_change_value) : undefined}
          />
          <p className="col-span-2 text-xs text-outline">
            {holding.freshness === "typed"
              ? "Price was typed in. Refresh prices to pull a current quote."
              : holding.freshness === "sample"
                ? "Sample data."
                : `${formatPrice(holding.price)} · ${holding.price_source ?? "quote"} · ${relativeTime(holding.price_as_of)}${holding.freshness === "stale" ? " (stale)" : ""}`}
          </p>
          <Link href="#position-policies" onClick={onClose} className="col-span-2 inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-violet hover:text-violet-soft">
            <Shield aria-hidden="true" className="size-3.5" />
            {policyIntent ? `Your standing rule: ${policyIntent}` : "Set a standing rule for this position"}
          </Link>
        </div>
      ) : null}

      <fieldset disabled={readOnly} className="grid gap-4 disabled:opacity-60">
        <div className="grid grid-cols-2 items-start gap-3">
          <Field label="Symbol">
            <input className={fieldClass + " uppercase"} value={symbol} onChange={(event) => setSymbol(event.target.value)} placeholder="NVDA" autoFocus={!holding} />
          </Field>
          <Field label="Name" hint="Optional">
            <input className={fieldClass} value={name} onChange={(event) => setName(event.target.value)} placeholder="NVIDIA" />
          </Field>
        </div>
        <Field label="Kind">
          <div className="grid grid-cols-4 gap-1.5">
            {CLASSES.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={assetClass === value}
                onClick={() => setAssetClass(value)}
                className={
                  "min-h-10 rounded-xl border px-1 text-xs font-semibold transition " +
                  (assetClass === value ? "border-violet/60 bg-violet/15 text-violet" : "border-outline-variant/60 text-on-surface-variant hover:border-outline")
                }
              >
                {ASSET_CLASS_LABEL[value]}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Account">
          <select className={fieldClass} value={accountId} onChange={(event) => setAccountId(event.target.value)}>
            <option value="">Unassigned</option>
            {investmentAccounts.map((account) => (
              <option key={account.id} value={account.id}>{account.name}</option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 items-start gap-3">
          <Field label="Amount">
            <input className={fieldClass} inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="10" />
          </Field>
          <Field label={assetClass === "cash" ? "Price (1 for dollars)" : "Price"}>
            <input className={fieldClass} inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} placeholder={assetClass === "cash" ? "1" : "125.25"} />
          </Field>
        </div>
        <Field label="Cost basis (total paid)" hint="Leave blank if you don’t know it. Gains only show when this is set.">
          <input className={fieldClass} inputMode="decimal" value={costBasis} onChange={(event) => setCostBasis(event.target.value)} placeholder="e.g. 1,200" />
        </Field>
      </fieldset>
    </Sheet>
  );
}

function Metric({ label, value, detail, tone = "text-on-surface" }: { label: string; value: string; detail?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-outline-variant/50 bg-surface-lowest/60 p-3">
      <p className="mm-eyebrow">{label}</p>
      <p className={`mm-num mt-1 font-display text-lg font-semibold ${tone}`}>{value}</p>
      {detail ? <p className={`mm-num text-xs ${tone}`}>{detail}</p> : null}
    </div>
  );
}
