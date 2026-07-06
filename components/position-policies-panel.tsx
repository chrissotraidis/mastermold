"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { PositionPolicyRow } from "@/src/db/store";

type PolicyFindingView = {
  symbol: string;
  kind: string;
  classification: "Trim candidate" | "Review";
  title: string;
  detail: string;
};

type PositionPoliciesPanelProps = {
  policies: PositionPolicyRow[];
  findings: PolicyFindingView[];
  symbols: string[];
};

const intents: Array<{ value: PositionPolicyRow["intent"]; label: string }> = [
  { value: "hold", label: "Hold — keep it, don't prompt trims" },
  { value: "accumulate", label: "Accumulate — I want more over time" },
  { value: "trim", label: "Trim — reduce when rules trigger" },
  { value: "exit", label: "Exit — I plan to close this" },
  { value: "watch", label: "Watch — no standing plan yet" },
];

const intentLabel: Record<PositionPolicyRow["intent"], string> = {
  hold: "Hold",
  accumulate: "Accumulate",
  trim: "Trim",
  exit: "Exit",
  watch: "Watch",
};

export function PositionPoliciesPanel({ policies, findings, symbols }: PositionPoliciesPanelProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pendingSymbol, setPendingSymbol] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submitPolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    setMessage("Saving policy...");
    setError("");

    startTransition(async () => {
      try {
        const response = await fetch("/api/portfolio/policies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        if (!response.ok) throw new Error(body?.error || "Could not save the policy.");
        form.reset();
        setMessage("Policy saved. The review queue checks it on every refresh.");
        router.refresh();
      } catch (caught) {
        setMessage("");
        setError(caught instanceof Error ? caught.message : "Could not save the policy.");
      }
    });
  }

  function deletePolicy(symbol: string) {
    setPendingSymbol(symbol);
    setMessage("Removing policy...");
    setError("");

    startTransition(async () => {
      try {
        const response = await fetch(`/api/portfolio/policies/${encodeURIComponent(symbol)}`, {
          method: "DELETE",
        });
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        if (!response.ok) throw new Error(body?.error || "Could not remove the policy.");
        setMessage("Policy removed.");
        router.refresh();
      } catch (caught) {
        setMessage("");
        setError(caught instanceof Error ? caught.message : "Could not remove the policy.");
      } finally {
        setPendingSymbol(null);
      }
    });
  }

  return (
    <div>
      <p className="max-w-2xl text-sm leading-6 text-outline">
        Write down your plan per symbol. When a rule triggers, it appears at the top of the
        review queue as your own words — a review prompt, never an order.
      </p>

      {findings.length > 0 ? (
        <div className="mt-4 space-y-2" data-testid="policy-findings">
          {findings.map((finding) => (
            <div
              key={`${finding.symbol}-${finding.kind}`}
              className="rounded-md border border-amber/40 bg-amber/10 p-3"
            >
              <p className="text-sm font-semibold text-on-surface">{finding.title}</p>
              <p className="mt-0.5 text-xs leading-5 text-on-surface-variant">{finding.detail}</p>
            </div>
          ))}
        </div>
      ) : null}

      <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={submitPolicy}>
        <Field id="policy-symbol" label="Symbol">
          <input
            id="policy-symbol"
            name="symbol"
            required
            maxLength={12}
            list="policy-symbol-options"
            placeholder="NVDA"
            className="h-11 w-full rounded-md border border-outline-variant/50 bg-surface-dim/70 px-3 text-sm text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
          />
          <datalist id="policy-symbol-options">
            {symbols.map((symbol) => (
              <option key={symbol} value={symbol} />
            ))}
          </datalist>
        </Field>
        <Field id="policy-intent" label="Intent">
          <select
            id="policy-intent"
            name="intent"
            defaultValue="hold"
            className="h-11 w-full rounded-md border border-outline-variant/50 bg-surface-dim/70 px-3 text-sm text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
          >
            {intents.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </Field>
        <Field id="policy-max-weight" label="Max weight (% of portfolio)">
          <input
            id="policy-max-weight"
            name="max_weight_pct"
            inputMode="decimal"
            placeholder="e.g. 25"
            className="h-11 w-full rounded-md border border-outline-variant/50 bg-surface-dim/70 px-3 text-sm text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
          />
        </Field>
        <Field id="policy-take-profit" label="Take-profit trigger (+% vs cost)">
          <input
            id="policy-take-profit"
            name="take_profit_pct"
            inputMode="decimal"
            placeholder="e.g. 100"
            className="h-11 w-full rounded-md border border-outline-variant/50 bg-surface-dim/70 px-3 text-sm text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
          />
        </Field>
        <Field id="policy-stop-loss" label="Review trigger (-% vs cost)">
          <input
            id="policy-stop-loss"
            name="stop_loss_pct"
            inputMode="decimal"
            placeholder="e.g. 30"
            className="h-11 w-full rounded-md border border-outline-variant/50 bg-surface-dim/70 px-3 text-sm text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
          />
        </Field>
        <Field id="policy-rationale" label="Why (your note to future you)">
          <input
            id="policy-rationale"
            name="rationale"
            maxLength={500}
            placeholder="Long-term conviction; only trim on blowoff."
            className="h-11 w-full rounded-md border border-outline-variant/50 bg-surface-dim/70 px-3 text-sm text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
          />
        </Field>
        <div className="flex items-end sm:col-span-2">
          <Button
            type="submit"
            disabled={isPending}
            className="h-11 bg-violet px-4 text-void hover:bg-violet/90"
          >
            <Plus aria-hidden="true" className="size-4" />
            <span>Save policy</span>
          </Button>
        </div>
      </form>

      <p className="mt-3 text-sm text-outline" data-testid="position-policies-status" aria-live="polite">
        {error || message}
      </p>

      <div className="mt-4 space-y-2">
        {policies.length > 0 ? (
          policies.map((policy) => (
            <div
              key={policy.symbol}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-outline-variant/40 bg-surface-dim/45 p-3"
            >
              <div className="min-w-0">
                <p className="break-words font-semibold text-on-surface">
                  {policy.symbol} · {intentLabel[policy.intent]}
                </p>
                <p className="mt-0.5 break-words text-xs leading-5 text-outline">
                  {policyRuleSummary(policy)}
                </p>
                {policy.rationale ? (
                  <p className="mt-0.5 break-words text-xs leading-5 text-on-surface-variant">
                    “{policy.rationale}”
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => deletePolicy(policy.symbol)}
                disabled={pendingSymbol === policy.symbol}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-outline-variant/40 px-3 text-sm text-on-surface-variant transition hover:text-critical disabled:opacity-50 sm:w-auto"
              >
                <Trash2 aria-hidden="true" className="size-4" />
                Remove
              </button>
            </div>
          ))
        ) : (
          <div className="rounded-md border border-outline-variant/40 bg-surface-dim/45 p-4 text-sm leading-6 text-on-surface-variant">
            No policies yet. Start with your biggest position: what would make you trim it?
          </div>
        )}
      </div>
    </div>
  );
}

function policyRuleSummary(policy: PositionPolicyRow) {
  const rules: string[] = [];
  if (policy.max_weight_pct !== null) rules.push(`cap ${policy.max_weight_pct}% of portfolio`);
  if (policy.take_profit_pct !== null) rules.push(`take profit at +${policy.take_profit_pct}%`);
  if (policy.stop_loss_pct !== null) rules.push(`review at -${policy.stop_loss_pct}%`);
  return rules.length > 0 ? rules.join(" · ") : "No numeric triggers — intent only.";
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
