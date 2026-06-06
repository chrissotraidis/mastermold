"use client";

import { useMemo, useState } from "react";
import { Ban, Power, Save, ShieldAlert, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { ExecutorJson } from "@/src/db/executor";
import type { ExecutorStrategy, GuardrailConfig } from "@/src/db/schema";

type ExecutorWorkspaceProps = {
  executor: ExecutorJson;
};

type GuardrailDraft = Pick<
  GuardrailConfig,
  "per_tx_cap" | "daily_cap" | "contract_allowlist" | "session_key_expiry"
>;

const statusLabels: Record<ExecutorStrategy["status"], string> = {
  paused: "Paused",
  safe_mode: "Safe mode",
  running_demo: "Running demo",
};

export function ExecutorWorkspace({ executor }: ExecutorWorkspaceProps) {
  const [strategies, setStrategies] = useState(executor.strategies);
  const [selectedStrategyId, setSelectedStrategyId] = useState(
    executor.strategies[0]?.id ?? "",
  );
  const activeGuardrail = executor.guardrail_configs[0] ?? null;
  const [guardrailDraft, setGuardrailDraft] = useState<GuardrailDraft>(() => ({
    per_tx_cap: activeGuardrail?.per_tx_cap ?? 0,
    daily_cap: activeGuardrail?.daily_cap ?? 0,
    contract_allowlist: activeGuardrail?.contract_allowlist ?? [],
    session_key_expiry: activeGuardrail?.session_key_expiry ?? "",
  }));
  const [localNotice, setLocalNotice] = useState(
    "Edit guardrail config locally, then press Save local draft. No request is sent.",
  );
  const selectedStrategy = strategies.find((strategy) => strategy.id === selectedStrategyId);
  const maxFundingRate = useMemo(
    () =>
      Math.max(
        ...executor.funding_observations.map((observation) =>
          Math.abs(observation.funding_rate),
        ),
        0.00001,
      ),
    [executor.funding_observations],
  );

  function updateGuardrailDraft<Key extends keyof GuardrailDraft>(
    key: Key,
    value: GuardrailDraft[Key],
  ) {
    setGuardrailDraft((current) => ({ ...current, [key]: value }));
    setLocalNotice("Unsaved local guardrail draft. No network call has been made.");
  }

  function saveLocalDraft() {
    setLocalNotice(
      "Local guardrail draft saved in browser state only. Display only - signs nothing.",
    );
  }

  function pauseSelectedStrategy() {
    if (!selectedStrategy) {
      return;
    }

    setStrategies((current) =>
      current.map((strategy) =>
        strategy.id === selectedStrategy.id ? { ...strategy, status: "paused" } : strategy,
      ),
    );
    setLocalNotice(
      `${formatStrategyName(selectedStrategy.name)} kill-switch pressed; status changed to paused in local state only.`,
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start">
      <div className="space-y-6">
        <section aria-labelledby="executor-strategy-status-title" className="space-y-4">
          <div>
            <h2 id="executor-strategy-status-title" className="text-xl font-semibold text-white">
              View strategy status
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-400">
              Open executor to see strategy rows, net_delta, margin_ratio, funding_rate,
              and basis values from seeded ExecutorStrategy data.
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
                    "block w-full rounded-lg text-left outline-none transition focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
                    selectedStrategyId === strategy.id && "ring-2 ring-cyan-300/80",
                  )}
                  aria-pressed={selectedStrategyId === strategy.id}
                >
                  <Card className="h-full border-white/10 bg-white/[0.04]">
                    <CardHeader className="space-y-3 p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase text-slate-500">
                            {strategy.venue}
                          </p>
                          <CardTitle className="mt-1 text-xl text-white">
                            {formatStrategyName(strategy.name)}
                          </CardTitle>
                        </div>
                        <StatusBadge status={strategy.status} />
                      </div>
                    </CardHeader>
                    <CardContent className="grid gap-3 p-5 pt-0 text-sm sm:grid-cols-2">
                      <Metric label="net_delta" value={formatSignedRatio(strategy.net_delta)} />
                      <Metric label="margin_ratio" value={formatPercent(strategy.margin_ratio)} />
                      <Metric label="funding_rate" value={formatFunding(strategy.funding_rate)} />
                      <Metric label="basis" value={formatPercent(strategy.basis)} />
                    </CardContent>
                  </Card>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState message="No ExecutorStrategy rows are visible for this replay window." />
          )}
        </section>

        <section aria-labelledby="funding-observation-title" className="space-y-4">
          <div>
            <h2 id="funding-observation-title" className="text-xl font-semibold text-white">
              FundingObservation trend
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-400">
              Funding rate trend and open interest from seeded rows. Safe mode running is
              still a display-only state in this monitor.
            </p>
          </div>

          <Card className="border-white/10 bg-white/[0.035]">
            <CardContent className="space-y-4 p-5">
              {executor.funding_observations.length > 0 ? (
                executor.funding_observations.map((observation) => (
                  <div key={observation.id} className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <div>
                        <p className="font-semibold text-slate-100">
                          {observation.asset.symbol} funding_rate
                        </p>
                        <p className="text-xs text-slate-500">
                          {formatTimestamp(observation.period_ts)} · OI{" "}
                          {formatCompactCurrency(observation.open_interest)}
                        </p>
                      </div>
                      <span className="font-mono text-cyan-100">
                        {formatFunding(observation.funding_rate)}
                      </span>
                    </div>
                    <div
                      className="h-3 overflow-hidden rounded-full bg-slate-900"
                      aria-hidden="true"
                    >
                      <div
                        className="h-full rounded-full bg-cyan-300"
                        style={{
                          width: `${Math.max(
                            8,
                            (Math.abs(observation.funding_rate) / maxFundingRate) * 100,
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState message="No FundingObservation rows are visible for this replay window." />
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      <aside className="space-y-4 xl:sticky xl:top-6">
        <Card className="border-cyan-300/25 bg-cyan-300/[0.055]">
          <CardHeader className="p-5">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-md border border-cyan-300/30 bg-cyan-300/10 text-cyan-100">
                <ShieldCheck aria-hidden="true" className="size-5" />
              </div>
              <div>
                <CardTitle className="text-xl text-white">Edit guardrail config</CardTitle>
                <p className="mt-1 text-sm leading-6 text-cyan-50/80">
                  Controlled inputs update React state only.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-5 pt-0">
            <div className="grid gap-4">
              <FieldBlock id="per-tx-cap" label="per_tx_cap">
                <Input
                  id="per-tx-cap"
                  inputMode="decimal"
                  type="number"
                  min={0}
                  step={100}
                  value={guardrailDraft.per_tx_cap}
                  onChange={(event) =>
                    updateGuardrailDraft("per_tx_cap", Number(event.target.value))
                  }
                  className="border-white/15 bg-slate-950/70 text-slate-100"
                />
              </FieldBlock>

              <FieldBlock id="daily-cap" label="daily_cap">
                <Input
                  id="daily-cap"
                  inputMode="decimal"
                  type="number"
                  min={0}
                  step={100}
                  value={guardrailDraft.daily_cap}
                  onChange={(event) =>
                    updateGuardrailDraft("daily_cap", Number(event.target.value))
                  }
                  className="border-white/15 bg-slate-950/70 text-slate-100"
                />
              </FieldBlock>

              <FieldBlock id="contract-allowlist" label="contract_allowlist">
                <textarea
                  id="contract-allowlist"
                  value={guardrailDraft.contract_allowlist.join("\n")}
                  onChange={(event) =>
                    updateGuardrailDraft(
                      "contract_allowlist",
                      event.target.value
                        .split(/\n|,/)
                        .map((value) => value.trim())
                        .filter(Boolean),
                    )
                  }
                  rows={4}
                  className="w-full resize-y rounded-md border border-white/15 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                />
              </FieldBlock>

              <FieldBlock id="session-key-expiry" label="session_key_expiry">
                <Input
                  id="session-key-expiry"
                  value={guardrailDraft.session_key_expiry}
                  onChange={(event) =>
                    updateGuardrailDraft("session_key_expiry", event.target.value)
                  }
                  className="border-white/15 bg-slate-950/70 text-slate-100"
                />
              </FieldBlock>
            </div>

            <p className="rounded-md border border-white/10 bg-slate-950/50 p-3 text-sm leading-6 text-slate-300">
              {localNotice}
            </p>

            <div className="grid gap-3">
              <Button
                type="button"
                onClick={saveLocalDraft}
                className="bg-cyan-300 text-slate-950 hover:bg-cyan-200"
              >
                <Save aria-hidden="true" />
                Save local draft
              </Button>
              <Button
                type="button"
                onClick={pauseSelectedStrategy}
                disabled={!selectedStrategy}
                variant="destructive"
                className="bg-red-500 text-white hover:bg-red-400"
              >
                <Power aria-hidden="true" />
                Press kill-switch
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-red-300/25 bg-red-400/[0.055]">
          <CardContent className="flex gap-3 p-5 text-sm leading-6 text-red-50">
            <ShieldAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            <p>
              No HTTP call to any chain RPC, signing endpoint, or execution API is wired to
              these controls.
            </p>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

function StatusBadge({ status }: { status: ExecutorStrategy["status"] }) {
  return (
    <Badge
      className={cn(
        "border text-xs",
        status === "paused" && "border-amber-300/30 bg-amber-300/10 text-amber-100",
        status === "safe_mode" && "border-cyan-300/30 bg-cyan-300/10 text-cyan-100",
        status === "running_demo" &&
          "border-emerald-300/30 bg-emerald-300/10 text-emerald-100",
      )}
      variant="outline"
    >
      <span className="sr-only">{statusLabels[status]} status: </span>
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
      <Label htmlFor={id} className="text-slate-100">
        {label}
      </Label>
      {children}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-slate-950/50 p-3">
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-1 font-mono text-lg text-slate-100">{value}</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-white/10 bg-slate-950/50 p-4 text-sm leading-6 text-slate-300">
      <Ban aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-slate-500" />
      {message}
    </div>
  );
}

function formatStrategyName(name: ExecutorStrategy["name"]) {
  return name
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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
