"use client";

import { useState } from "react";
import { ChevronDown, FlaskConical, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/utils";
/** Shared by both labs: any program with experiments, gates and retired ideas. */
export type BoardStatus = "done" | "idle" | "measuring" | "insufficient" | "pass" | "fail" | "planned";
export type BoardProgram = {
  summary: string;
  decision_doc: string;
  experiments: Array<{ id: string; name: string; question: string; status: BoardStatus; evidence: string[]; gate: string; next: string }>;
  retired: Array<{ name: string; reason: string }>;
};

const STATUS: Record<BoardStatus, { label: string; variant: "up" | "muted" | "magenta" | "caution" | "down" }> = {
  done: { label: "Done", variant: "up" },
  idle: { label: "Not collecting", variant: "muted" },
  measuring: { label: "Measuring", variant: "magenta" },
  insufficient: { label: "Not enough data", variant: "caution" },
  pass: { label: "Passed gate", variant: "up" },
  fail: { label: "Failed gate", variant: "down" },
  planned: { label: "Planned", variant: "muted" },
};

/** The lab's research program: one card per pre-registered experiment. */
export function ResearchBoard({
  program,
  onRunResearch,
  pending,
  canControl,
  lastCycleAt,
  runLabel = "Run research cycle",
  runTitle = "Reads markets and books and records shadow observations. Places no orders.",
  statusLine,
}: {
  program: BoardProgram;
  onRunResearch: () => void;
  pending: boolean;
  canControl: boolean;
  lastCycleAt: string | null;
  runLabel?: string;
  runTitle?: string;
  statusLine?: string;
}) {
  const [showRetired, setShowRetired] = useState(false);
  return (
    <section aria-labelledby="research-program-title" className="grid gap-4">
      <Panel className="flex flex-col gap-4 border-violet/30 p-5 sm:flex-row sm:items-center">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-violet/15 text-violet ring-1 ring-violet/30">
          <FlaskConical aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="research-program-title" className="font-display text-base font-semibold text-on-surface">Research program</h2>
          <p className="mt-1 text-sm leading-6 text-on-surface-variant">{program.summary}</p>
          <p className="mt-1 text-xs text-outline">
            {statusLine ?? `Last research cycle ${lastCycleAt ? new Date(lastCycleAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "not run"} · paper mode off · live orders locked`} · decision record:{" "}
            <code className="text-[11px]">{program.decision_doc}</code>
          </p>
        </div>
        <Button variant="outline" disabled={pending || !canControl} onClick={onRunResearch} title={runTitle}>
          <RefreshCw className={cn(pending && "animate-spin")} /> {runLabel}
        </Button>
      </Panel>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {program.experiments.map((experiment) => {
          const status = STATUS[experiment.status];
          return (
            <article key={experiment.id} className="mm-panel flex min-w-0 flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="mm-eyebrow">{experiment.id}</p>
                  <h3 className="font-display text-sm font-semibold text-on-surface">{experiment.name}</h3>
                </div>
                <Badge variant={status.variant} className="shrink-0">{status.label}</Badge>
              </div>
              <p className="text-xs leading-5 text-on-surface-variant">{experiment.question}</p>
              <ul className="grid gap-1 text-xs leading-5 text-on-surface">
                {experiment.evidence.map((line) => (
                  <li key={line} className="flex gap-2">
                    <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-violet" />
                    <span className="min-w-0 break-words">{line}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto grid gap-1 border-t border-outline-variant/40 pt-2 text-[11px] leading-4">
                <p className="text-outline"><span className="font-semibold text-on-surface-variant">Gate:</span> {experiment.gate}</p>
                <p className="text-outline"><span className="font-semibold text-on-surface-variant">Next:</span> {experiment.next}</p>
              </div>
            </article>
          );
        })}
      </div>

      <div className="mm-panel overflow-hidden">
        <button
          type="button"
          onClick={() => setShowRetired((value) => !value)}
          aria-expanded={showRetired}
          className="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left text-sm font-semibold text-on-surface hover:bg-surface-high/30"
        >
          Retired strategies and why
          <span className="flex items-center gap-2 text-xs font-normal text-outline">
            {program.retired.length} retired
            <ChevronDown aria-hidden="true" className={cn("size-4 transition", showRetired && "rotate-180")} />
          </span>
        </button>
        {showRetired ? (
          <ul className="grid gap-2 border-t border-outline-variant/40 p-4 text-xs leading-5">
            {program.retired.map((item) => (
              <li key={item.name}>
                <span className="font-semibold text-on-surface">{item.name}.</span> <span className="text-on-surface-variant">{item.reason}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
