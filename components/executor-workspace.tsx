"use client";

import { useMemo, useState } from "react";
import { Ban, Power, Save, ShieldAlert, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { PublicExecutor } from "@/lib/public-api-copy";

type ExecutorWorkspaceProps = {
  executor: PublicExecutor;
};

type ExecutorStrategy = PublicExecutor["strategies"][number];
type ExecutorStatus = ExecutorStrategy["status"];

type GuardrailDraft = {
  perTransactionCap: number;
  dailyCap: number;
  approvedContracts: string[];
  temporaryKeyExpires: string;
};

export function ExecutorWorkspace({ executor }: ExecutorWorkspaceProps) {
  const [strategies, setStrategies] = useState(executor.strategies);
  const [selectedStrategyId, setSelectedStrategyId] = useState(
    executor.strategies[0]?.id ?? "",
  );
  const activeGuardrail = executor.safety_drafts[0] ?? null;
  const [guardrailDraft, setGuardrailDraft] = useState<GuardrailDraft>(() => ({
    perTransactionCap: activeGuardrail?.per_transaction_cap_usd ?? 0,
    dailyCap: activeGuardrail?.daily_cap_usd ?? 0,
    approvedContracts: activeGuardrail?.approved_contracts ?? [],
    temporaryKeyExpires: activeGuardrail?.temporary_key_expires ?? "",
  }));
  const [localNotice, setLocalNotice] = useState(
    "Edit the caps, then save the local safety draft. Nothing is sent.",
  );
  const selectedStrategy = strategies.find((strategy) => strategy.id === selectedStrategyId);
  const maxFundingRate = useMemo(
    () =>
      Math.max(
        ...executor.borrow_rate_preview.map((observation) =>
          Math.abs(observation.borrow_rate),
        ),
        0.00001,
      ),
    [executor.borrow_rate_preview],
  );

  function updateGuardrailDraft<Key extends keyof GuardrailDraft>(
    key: Key,
    value: GuardrailDraft[Key],
  ) {
    setGuardrailDraft((current) => ({ ...current, [key]: value }));
    setLocalNotice("Unsaved changes.");
  }

  function saveLocalDraft() {
    setLocalNotice("Safety draft saved in this browser. Nothing was signed.");
  }

  function pauseSelectedStrategy() {
    if (!selectedStrategy) {
      return;
    }

    setStrategies((current) =>
      current.map((strategy) =>
        strategy.id === selectedStrategy.id ? { ...strategy, status: "Paused" } : strategy,
      ),
    );
    setLocalNotice(
      `${selectedStrategy.name} marked paused in this safety review. Nothing live changed.`,
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start">
      <div className="space-y-6">
        <section aria-labelledby="executor-strategy-status-title" className="space-y-4">
          <div>
            <h2 id="executor-strategy-status-title" className="text-xl font-semibold text-on-surface">
              Strategies
            </h2>
            <p className="mt-1 text-sm leading-6 text-outline">
              Review-only strategy examples. They are not connected to accounts or chains.
            </p>
          </div>

          {strategies.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {strategies.map((strategy) => (
                <button
                  key={strategy.id}
                  type="button"
                  onClick={() => setSelectedStrategyId(strategy.id)}
                  className={cn(
                    "block w-full rounded-lg text-left outline-none transition focus-visible:ring-2 focus-visible:ring-violet focus-visible:ring-offset-2 focus-visible:ring-offset-void",
                    selectedStrategyId === strategy.id && "ring-2 ring-violet/80",
                  )}
                  aria-pressed={selectedStrategyId === strategy.id}
                >
                  <Card className="h-full border-outline-variant/40 bg-surface-high/30">
                    <CardHeader className="space-y-3 p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase text-outline">
                            {strategy.venue}
                          </p>
                          <CardTitle className="mt-1 text-xl text-on-surface">
                            {strategy.name}
                          </CardTitle>
                        </div>
                        <StatusBadge status={strategy.status} />
                      </div>
                    </CardHeader>
                    <CardContent className="grid gap-3 p-5 pt-0 text-sm sm:grid-cols-2">
                      <Metric label="Market exposure" value={formatSignedRatio(strategy.price_exposure)} />
                      <Metric label="Safety cushion" value={formatPercent(strategy.borrow_cushion)} />
                      <Metric label="Borrow cost" value={formatFunding(strategy.borrow_rate)} />
                      <Metric label="Futures price gap" value={formatPercent(strategy.price_gap)} />
                    </CardContent>
                  </Card>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState message="No strategies to show right now." />
          )}
        </section>

        <section aria-labelledby="funding-observation-title" className="space-y-4">
          <div>
            <h2 id="funding-observation-title" className="text-xl font-semibold text-on-surface">
              Borrow cost preview
            </h2>
            <p className="mt-1 text-sm leading-6 text-outline">
              Sample cost clues for review. No live feed is connected.
            </p>
          </div>

          <Card className="border-outline-variant/40 bg-surface-high/30">
            <CardContent className="space-y-4 p-5">
              {executor.borrow_rate_preview.length > 0 ? (
                executor.borrow_rate_preview.map((observation) => (
                  <div key={observation.id} className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <div>
                        <p className="font-semibold text-on-surface">
                          {observation.asset_symbol} borrow cost
                        </p>
                        <p className="text-xs text-outline">
                          {formatTimestamp(observation.period_time)} · Borrow-market activity{" "}
                          {formatCompactCurrency(observation.open_interest)}
                        </p>
                      </div>
                      <span className="font-mono text-violet">
                        {formatFunding(observation.borrow_rate)}
                      </span>
                    </div>
                    <div
                      className="h-3 overflow-hidden rounded-full bg-surface-low"
                      aria-hidden="true"
                    >
                      <div
                        className="h-full rounded-full bg-violet"
                        style={{
                          width: `${Math.max(
                            8,
                            (Math.abs(observation.borrow_rate) / maxFundingRate) * 100,
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState message="No sample borrow-rate data for this window." />
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      <aside className="space-y-4 xl:sticky xl:top-6">
        <Card className="border-violet/30 bg-violet/[0.055]">
          <CardHeader className="p-5">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-md border border-violet/40 bg-violet/10 text-violet">
                <ShieldCheck aria-hidden="true" className="size-5" />
              </div>
              <div>
                <CardTitle className="text-xl text-on-surface">Safety draft</CardTitle>
                <p className="mt-1 text-sm leading-6 text-on-surface/80">
                  Draft the limits a real executor would need. Nothing here signs anything.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-5 pt-0">
            <div className="grid gap-4">
              <FieldBlock id="per-tx-cap" label="Per-transaction cap (USD)">
                <Input
                  id="per-tx-cap"
                  inputMode="decimal"
                  type="number"
                  min={0}
                  step={100}
                  value={guardrailDraft.perTransactionCap}
                  onChange={(event) =>
                    updateGuardrailDraft("perTransactionCap", Number(event.target.value))
                  }
                  className="border-outline-variant/50 bg-surface-dim/70 text-on-surface"
                />
              </FieldBlock>

              <FieldBlock id="daily-cap" label="Daily cap (USD)">
                <Input
                  id="daily-cap"
                  inputMode="decimal"
                  type="number"
                  min={0}
                  step={100}
                  value={guardrailDraft.dailyCap}
                  onChange={(event) =>
                    updateGuardrailDraft("dailyCap", Number(event.target.value))
                  }
                  className="border-outline-variant/50 bg-surface-dim/70 text-on-surface"
                />
              </FieldBlock>

              <FieldBlock id="contract-allowlist" label="Approved contracts">
                <textarea
                  id="contract-allowlist"
                  value={guardrailDraft.approvedContracts.join("\n")}
                  onChange={(event) =>
                    updateGuardrailDraft(
                      "approvedContracts",
                      event.target.value
                        .split(/\n|,/)
                        .map((value) => value.trim())
                        .filter(Boolean),
                    )
                  }
                  rows={4}
                  className="w-full resize-y rounded-md border border-outline-variant/50 bg-surface-dim/70 px-3 py-2 text-sm text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
                />
              </FieldBlock>

              <FieldBlock id="session-key-expiry" label="Temporary access expiry">
                <Input
                  id="session-key-expiry"
                  value={guardrailDraft.temporaryKeyExpires}
                  onChange={(event) =>
                    updateGuardrailDraft("temporaryKeyExpires", event.target.value)
                  }
                  className="border-outline-variant/50 bg-surface-dim/70 text-on-surface"
                />
              </FieldBlock>
            </div>

            <p className="rounded-md border border-outline-variant/40 bg-surface-dim/50 p-3 text-sm leading-6 text-on-surface-variant">
              {localNotice}
            </p>

            <div className="grid gap-3">
              <Button
                type="button"
                onClick={saveLocalDraft}
                className="bg-violet text-void hover:bg-violet"
              >
                <Save aria-hidden="true" />
                Save draft
              </Button>
              <Button
                type="button"
                onClick={pauseSelectedStrategy}
                disabled={!selectedStrategy}
                variant="destructive"
                className="bg-critical text-void hover:brightness-110"
              >
                <Power aria-hidden="true" />
                Pause in safety review
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-critical/25 bg-critical/[0.06]">
          <CardContent className="flex gap-3 p-5 text-sm leading-6 text-on-surface">
            <ShieldAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-critical" />
            <p>
              This safety draft is not connected to any chain, signer, or execution API. It
              cannot move funds.
            </p>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

function StatusBadge({ status }: { status: ExecutorStatus }) {
  return (
    <Badge
      className={cn(
        "border text-xs",
        status === "Paused" && "border-caution/40 bg-caution/10 text-caution",
        status === "Safe mode" && "border-violet/40 bg-violet/10 text-violet",
        status === "Preview only" && "border-engine/30 bg-engine/10 text-engine",
      )}
      variant="outline"
    >
      {status}
    </Badge>
  );
}

function FieldBlock({
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
      <Label htmlFor={id} className="text-on-surface">
        {label}
      </Label>
      {children}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-outline-variant/40 bg-surface-dim/50 p-3">
      <p className="text-xs font-semibold uppercase text-outline">{label}</p>
      <p className="mt-1 font-mono text-lg text-on-surface">{value}</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-outline-variant/40 bg-surface-dim/50 p-4 text-sm leading-6 text-on-surface-variant">
      <Ban aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-outline" />
      {message}
    </div>
  );
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(value === 0 ? 0 : 1)}%`;
}

function formatSignedRatio(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}

function formatFunding(value: number) {
  return `${(value * 100).toFixed(3)}%`;
}

function formatCompactCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(value));
}
