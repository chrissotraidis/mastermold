"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { ACCOUNT_TYPES, type AccountTypeValue } from "@/lib/money-accounts";
import type { MoneyAccount } from "@/src/db/money";
import { cn } from "@/lib/utils";
import { Field, fieldClass } from "./fields";
import { moneyRequest, toastError } from "./money-api";

type Exclusions = { net_worth?: boolean; cash_flow?: boolean; budget?: boolean };

const COUNTED_IN: Array<{ key: keyof Exclusions; label: string }> = [
  { key: "net_worth", label: "Net worth" },
  { key: "cash_flow", label: "Cash flow" },
  { key: "budget", label: "Budgets" },
];

export function AccountSheet({
  open,
  account,
  onClose,
  onSaved,
}: {
  open: boolean;
  account: MoneyAccount | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [institution, setInstitution] = useState("");
  const [type, setType] = useState<AccountTypeValue>("brokerage");
  const [balance, setBalance] = useState("");
  const [notes, setNotes] = useState("");
  const [exclude, setExclude] = useState<Exclusions>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(account?.name ?? "");
    setInstitution(account?.institution ?? "");
    setType((account?.type as AccountTypeValue) ?? "brokerage");
    setBalance(account ? String(account.balance || "") : "");
    setNotes(account?.notes ?? "");
    setExclude(account?.exclude ?? {});
  }, [open, account]);

  const kind = ACCOUNT_TYPES.find((item) => item.value === type)?.kind ?? "asset";
  const holdsInvestments = ["brokerage", "retirement", "crypto_exchange", "wallet"].includes(type);

  async function save() {
    setBusy(true);
    try {
      const body = { name, institution, type, balance: balance === "" ? 0 : Number(balance.replace(/[$,]/g, "")), notes, exclude };
      if (account) await moneyRequest(`/api/money/accounts/${account.id}`, { method: "PATCH", body });
      else await moneyRequest("/api/money/accounts", { method: "POST", body });
      toast({ title: account ? "Account updated" : "Account added", description: name });
      onSaved();
      onClose();
    } catch (error) {
      toastError(error);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!account) return;
    setBusy(true);
    try {
      await moneyRequest(`/api/money/accounts/${account.id}`, { method: "DELETE" });
      toast({ title: "Account removed", description: account.holding_count ? `${account.holding_count} holdings moved to Unassigned.` : undefined });
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
      title={account ? "Edit account" : "Add an account"}
      description="Brokerages and wallets hold your holdings. Banks, debts, and property carry a balance."
      footer={
        <div className="flex items-center justify-between gap-3">
          {account ? (
            <Button variant="ghost" onClick={remove} disabled={busy} className="text-critical hover:text-critical">
              <Trash2 /> Remove
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={save} disabled={busy || !name.trim()}>{account ? "Save" : "Add account"}</Button>
          </div>
        </div>
      }
    >
      <div className="grid gap-4">
        <Field label="Name">
          <input className={fieldClass} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Fidelity taxable" autoFocus />
        </Field>
        <Field label="Type">
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {ACCOUNT_TYPES.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setType(option.value)}
                aria-pressed={type === option.value}
                className={
                  "min-h-10 rounded-xl border px-2 text-xs font-semibold transition " +
                  (type === option.value
                    ? option.kind === "liability"
                      ? "border-critical/60 bg-critical/15 text-critical"
                      : "border-violet/60 bg-violet/15 text-violet"
                    : "border-outline-variant/60 text-on-surface-variant hover:border-outline")
                }
              >
                {option.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Institution" hint="Optional">
          <input className={fieldClass} value={institution} onChange={(event) => setInstitution(event.target.value)} placeholder="e.g. Chase" />
        </Field>
        <Field
          label={kind === "liability" ? "Amount owed" : holdsInvestments ? "Extra cash not listed as a holding" : "Balance"}
          hint={kind === "liability" ? "Subtracts from net worth." : holdsInvestments ? "Holdings you assign here add to this automatically." : undefined}
        >
          <input className={fieldClass} inputMode="decimal" value={balance} onChange={(event) => setBalance(event.target.value)} placeholder="0" />
        </Field>
        <Field label="Notes" hint="Optional">
          <textarea className={cn(fieldClass, "min-h-20 py-2 sm:min-h-20")} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </Field>
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-xs font-semibold text-on-surface-variant">Count this account in</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {COUNTED_IN.map((option) => (
              <label key={option.key} className="inline-flex min-h-9 items-center gap-2 text-sm text-on-surface">
                <input
                  type="checkbox"
                  checked={!exclude[option.key]}
                  onChange={(event) => setExclude((current) => ({ ...current, [option.key]: !event.target.checked }))}
                  className="size-4 accent-[#f2559f]"
                />
                {option.label}
              </label>
            ))}
          </div>
          <p className="text-[11px] text-outline">Untick for accounts you track but don't count, like a business card or a parent's account.</p>
        </fieldset>
      </div>
    </Sheet>
  );
}
