"use client";

import { FormEvent, useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { AssetClass, PortfolioHoldingJson } from "@/src/db/portfolio";

type ManualHoldingsPanelProps = {
  holdings: PortfolioHoldingJson[];
};

const assetClasses: Array<{ value: AssetClass; label: string }> = [
  { value: "equity", label: "Stock" },
  { value: "crypto", label: "Crypto" },
  { value: "defi", label: "On-chain" },
  { value: "cash", label: "Cash" },
];

export function ManualHoldingsPanel({ holdings }: ManualHoldingsPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const symbolInputRef = useRef<HTMLInputElement | null>(null);
  const handledCommandActionRef = useRef<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const actionQuery = searchParams.toString();

  useEffect(() => {
    const params = new URLSearchParams(actionQuery);
    if (params.get("action") !== "add-holding") return;
    if (handledCommandActionRef.current === actionQuery) return;

    handledCommandActionRef.current = actionQuery;
    params.delete("action");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash || "#add-holdings"}`);
    setError("");
    setMessage("Master Mold opened the holding form. Start with the symbol.");
    window.requestAnimationFrame(() => {
      symbolInputRef.current?.scrollIntoView({ block: "center", inline: "nearest" });
      symbolInputRef.current?.focus({ preventScroll: true });
      symbolInputRef.current?.select();
    });
  }, [actionQuery]);

  function submitHolding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setMessage("Saving holding...");
    setError("");

    startTransition(async () => {
      try {
        const response = await fetch("/api/portfolio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(Object.fromEntries(data.entries())),
        });
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        if (!response.ok) throw new Error(body?.error || "Could not save holding.");
        form.reset();
        setMessage("Manual holding saved. Today and chat now use it.");
        router.refresh();
      } catch (caught) {
        setMessage("");
        setError(caught instanceof Error ? caught.message : "Could not save holding.");
      }
    });
  }

  function deleteHolding(id: string) {
    setPendingId(id);
    setMessage("Removing holding...");
    setError("");

    startTransition(async () => {
      try {
        const response = await fetch(`/api/portfolio/manual/${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        if (!response.ok) throw new Error(body?.error || "Could not remove holding.");
        setMessage("Manual holding removed.");
        router.refresh();
      } catch (caught) {
        setMessage("");
        setError(caught instanceof Error ? caught.message : "Could not remove holding.");
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <section
      aria-labelledby="manual-holdings-title"
      className="rounded-lg border border-outline-variant/40 bg-surface-high/30 p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="manual-holdings-title" className="text-xl font-semibold text-on-surface">
            Manual holdings
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-outline">
            Add holdings you want Master Mold to consider. Today and chat use them immediately.
          </p>
        </div>
        <span className="rounded-full border border-violet/35 bg-violet/10 px-3 py-1 text-xs font-semibold text-violet">
          Local only
        </span>
      </div>

      <form className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-[0.75fr_0.75fr_0.75fr_0.75fr_auto]" onSubmit={submitHolding}>
        <Field id="manual-symbol" label="Symbol">
          <input
            id="manual-symbol"
            ref={symbolInputRef}
            name="symbol"
            required
            maxLength={12}
            placeholder="NVDA"
            className="h-11 w-full rounded-md border border-outline-variant/50 bg-surface-dim/70 px-3 text-sm text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
          />
        </Field>
        <Field id="manual-class" label="Type">
          <select
            id="manual-class"
            name="asset_class"
            defaultValue="equity"
            className="h-11 w-full rounded-md border border-outline-variant/50 bg-surface-dim/70 px-3 text-sm text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
          >
            {assetClasses.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </Field>
        <Field id="manual-quantity" label="Amount">
          <input
            id="manual-quantity"
            name="quantity"
            required
            inputMode="decimal"
            placeholder="10"
            className="h-11 w-full rounded-md border border-outline-variant/50 bg-surface-dim/70 px-3 text-sm text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
          />
        </Field>
        <Field id="manual-price" label="Price">
          <input
            id="manual-price"
            name="price"
            required
            inputMode="decimal"
            placeholder="125"
            className="h-11 w-full rounded-md border border-outline-variant/50 bg-surface-dim/70 px-3 text-sm text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
          />
        </Field>
        <div className="flex items-end sm:col-span-2 lg:col-span-1">
          <Button
            type="submit"
            disabled={isPending}
            className="h-11 w-full bg-violet px-3 text-void hover:bg-violet/90"
          >
            <Plus aria-hidden="true" className="size-4" />
            <span>Add holding</span>
          </Button>
        </div>
        <details className="rounded-md border border-outline-variant/40 bg-surface-dim/35 p-3 sm:col-span-2 lg:col-span-5">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-on-surface">
            More details
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field id="manual-name" label="Name">
              <input
                id="manual-name"
                name="asset_name"
                placeholder="NVIDIA"
                className="h-11 w-full rounded-md border border-outline-variant/50 bg-surface-dim/70 px-3 text-sm text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
              />
            </Field>
            <Field id="manual-venue" label="Where held">
              <input
                id="manual-venue"
                name="venue"
                placeholder="Robinhood, Coinbase, wallet"
                className="h-11 w-full rounded-md border border-outline-variant/50 bg-surface-dim/70 px-3 text-sm text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
              />
            </Field>
            <Field id="manual-change" label="Today's move (%)">
              <input
                id="manual-change"
                name="daily_change_pct"
                inputMode="decimal"
                placeholder="0"
                className="h-11 w-full rounded-md border border-outline-variant/50 bg-surface-dim/70 px-3 text-sm text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
              />
            </Field>
          </div>
        </details>
      </form>

      <p className="mt-3 text-sm text-outline" data-testid="manual-holdings-command-status" aria-live="polite">
        {error || message}
      </p>

      <div className="mt-5 space-y-2">
        {holdings.length > 0 ? (
          holdings.map((holding) => (
            <div
              key={holding.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-outline-variant/40 bg-surface-dim/45 p-3"
            >
              <div className="min-w-0">
                <p className="break-words font-semibold text-on-surface">
                  {holding.symbol} · {formatCurrency(holding.market_value)}
                </p>
                <p className="mt-0.5 break-words text-xs leading-5 text-outline">
                  {holding.asset_name} · {formatQuantity(holding.quantity)} held · {holding.weight_pct.toFixed(1)}% of visible portfolio
                </p>
              </div>
              <button
                type="button"
                onClick={() => deleteHolding(holding.id)}
                disabled={pendingId === holding.id}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-outline-variant/40 px-3 text-sm text-on-surface-variant transition hover:text-critical disabled:opacity-50 sm:w-auto"
              >
                <Trash2 aria-hidden="true" className="size-4" />
                Remove
              </button>
            </div>
          ))
        ) : (
          <div className="rounded-md border border-outline-variant/40 bg-surface-dim/45 p-4 text-sm leading-6 text-on-surface-variant">
            No manual holdings yet. This view is still using sample data.
          </div>
        )}
      </div>
    </section>
  );
}

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-sm font-semibold text-on-surface">
        {label}
      </Label>
      {children}
    </div>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }).format(value);
}
