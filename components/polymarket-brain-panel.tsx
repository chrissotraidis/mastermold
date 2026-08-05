"use client";

import { BrainCircuit, Database, ExternalLink, Microscope, Radio } from "lucide-react";

import type { PolymarketBrainReport } from "@/src/polymarket/brain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function PolymarketBrainPanel({
  brain,
  pending,
  controlAvailable,
  onResearch,
}: {
  brain: PolymarketBrainReport;
  pending: boolean;
  controlAvailable: boolean;
  onResearch: () => void;
}) {
  return (
    <Card className="border-violet/25 bg-violet/[0.035]">
      <CardHeader className="flex-row items-start justify-between gap-3 p-4 pb-2">
        <div>
          <CardTitle as="h2" className="flex items-center gap-2 text-base">
            <BrainCircuit className="size-4 text-violet" /> Polymarket brain
          </CardTitle>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-on-surface-variant">
            A separate SQLite research ledger records executable CLOB quotes, depth, strategy attribution, and
            15m/1h/4h markouts. Closed markets add actual outcomes and Brier calibration. It can promote a
            hypothesis to paper-candidate review, never to live trading.
          </p>
        </div>
        <Badge variant="outline" className="shrink-0 border-violet/30 text-violet">
          <Database /> {brain.database}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-2">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <BrainMetric label="Observations" value={String(brain.observations)} />
          <BrainMetric label="1h labels" value={String(brain.labeled_1h)} />
          <BrainMetric
            label="Resolved · mean Brier"
            value={`${brain.calibration.resolved_observations} · ${formatBrier(brain.calibration.mean_brier_score)}`}
          />
          <BrainMetric label="Last learning cycle" value={brain.latest_cycle_at ? formatRelative(brain.latest_cycle_at) : "Not run"} />
        </div>
        <details className="rounded-md border border-outline-variant/25 bg-void/20 px-3">
          <summary className="flex min-h-10 cursor-pointer flex-wrap items-center gap-2 text-xs font-semibold text-on-surface">
            <Radio className="size-3.5 text-violet" /> Public CLOB stream
            <Badge variant="outline" className={brain.stream.status === "live" ? "border-engine/35 text-engine" : "text-outline"}>
              {brain.stream.status}
            </Badge>
            <span className="font-normal text-outline">
              {brain.stream.subscribed_tokens} tokens · {brain.stream.labeled_trades_1m} 1m labels
              {brain.stream.last_message_at ? ` · last message ${formatRelative(brain.stream.last_message_at)}` : " · no message yet"}
            </span>
          </summary>
          <div className="mb-3 mt-1 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <BrainMetric label="Subscribed tokens" value={String(brain.stream.subscribed_tokens)} />
            <BrainMetric label="Retained events" value={String(brain.stream.event_count_24h)} detail={`${brain.stream.retained_coverage_hours.toFixed(2)}h coverage`} />
            <BrainMetric label="Trade labels · 1m" value={String(brain.stream.labeled_trades_1m)} />
            <BrainMetric
              label="Reported-side markout"
              value={signedBps(brain.stream.mean_reported_side_markout_1m_bps)}
            />
          </div>
          <p className="mb-3 text-[11px] leading-4 text-outline">
            The public feed&apos;s BUY/SELL field does not prove maker or taker role; this markout is research evidence only.
            Brier scores the selected market probability against the final outcome (0 is best); it measures calibration, not trading profit.
          </p>
          {brain.stream.error ? <p className="mb-3 text-[11px] leading-4 text-caution">{brain.stream.error}</p> : null}
        </details>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] leading-4 text-outline">
            Promotion requires 100 one-hour labels, positive execution-adjusted mean markout, and at least a 52% hit rate.
          </p>
          <Button size="sm" variant="outline" disabled={pending || !controlAvailable} onClick={onResearch}>
            <Microscope className={pending ? "animate-pulse" : ""} /> Research now
          </Button>
        </div>

        {brain.error ? (
          <p className="rounded-md border border-caution/30 bg-caution/5 px-3 py-2 text-xs text-caution">{brain.error}</p>
        ) : null}

        {brain.strategies.length === 0 ? (
          <div className="rounded-md border border-dashed border-outline-variant/35 px-4 py-5 text-center text-xs text-outline">
            Run a research cycle to start collecting strategy evidence.
          </div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {brain.strategies.map((strategy) => (
              <div key={strategy.strategy_id} className="rounded-md border border-outline-variant/25 bg-void/20 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-on-surface">{strategyLabel(strategy.strategy_id)}</p>
                  <Badge variant="outline" className={strategy.paper_candidate ? "border-engine/35 text-engine" : "text-outline"}>
                    {strategy.paper_candidate ? "Paper review candidate" : "Shadow only"}
                  </Badge>
                </div>
                <p className="mt-1 font-mono text-[11px] text-outline">
                  {strategy.observations} observations · {strategy.labels_1h} markouts · {signedBps(strategy.mean_1h_bps)} mean · {formatPercent(strategy.hit_rate_1h)} hit · {strategy.resolved_labels} resolved · {formatBrier(strategy.mean_brier_score)} Brier
                </p>
                <p className="mt-1 text-[11px] leading-4 text-on-surface-variant">{strategy.promotion_detail}</p>
              </div>
            ))}
          </div>
        )}

        {brain.recent_candidates.length > 0 ? (
          <details className="rounded-md border border-outline-variant/25 bg-void/20 px-3">
            <summary className="flex min-h-10 cursor-pointer items-center gap-2 text-xs font-semibold text-on-surface">
              Latest research candidates
              <span className="font-normal text-outline">{Math.min(brain.recent_candidates.length, 5)} most recent</span>
            </summary>
            <div className="mb-3 mt-1 space-y-2">
            {brain.recent_candidates.slice(0, 5).map((candidate) => (
              <div key={candidate.id} className="flex flex-col gap-2 rounded-md border border-outline-variant/20 px-3 py-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{strategyLabel(candidate.strategy_id)}</Badge>
                    <span className="font-mono text-[11px] text-violet">{candidate.outcome}</span>
                    <span className="font-mono text-[11px] text-outline">score {candidate.score}</span>
                  </div>
                  <p className="mt-1 truncate text-xs font-semibold text-on-surface">{candidate.question}</p>
                  <p className="mt-1 text-[11px] leading-4 text-outline">{candidate.thesis}</p>
                </div>
                <Button size="sm" variant="ghost" asChild>
                  <a href={`https://polymarket.com/event/${candidate.slug}`} target="_blank" rel="noreferrer">
                    Inspect <ExternalLink />
                  </a>
                </Button>
              </div>
            ))}
            </div>
          </details>
        ) : null}
      </CardContent>
    </Card>
  );
}

function BrainMetric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-md border border-outline-variant/20 bg-void/20 px-3 py-2">
      <p className="font-mono text-[9px] uppercase tracking-telemetry text-outline">{label}</p>
      <p className="mt-1 text-sm font-semibold text-on-surface">{value}</p>
      {detail ? <p className="mt-0.5 text-[10px] text-outline">{detail}</p> : null}
    </div>
  );
}

function strategyLabel(value: string) {
  return value.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function signedBps(value: number | null) {
  return value === null ? "n/a" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}bp`;
}

function formatPercent(value: number | null) {
  return value === null ? "n/a" : `${Math.round(value * 100)}%`;
}

function formatBrier(value: number | null) {
  return value === null ? "n/a" : value.toFixed(4);
}

function formatRelative(value: string) {
  const delta = Date.now() - Date.parse(value);
  if (!Number.isFinite(delta)) return "unknown";
  if (delta < 60_000) return "just now";
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  return `${Math.floor(delta / 86_400_000)}d ago`;
}
