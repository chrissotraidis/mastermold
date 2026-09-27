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
          <h2 id="research-program-title" className="font-display text-base font-semibold text-on-surface">What happened, and what we test now</h2>
          <p className="mt-1 text-sm leading-6 text-on-surface-variant">{program.summary}</p>
          <p className="mt-2 flex flex-wrap gap-1.5">
            {statusCounts(program).map(([key, count]) => (
              <Badge key={key} variant={STATUS[key].variant}>
                {count} {STATUS[key].label.toLowerCase()}
              </Badge>
            ))}
          </p>
          <p className="mt-1 text-xs text-outline">
            {statusLine ?? `Last research cycle ${lastCycleAt ? new Date(lastCycleAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "not run"} · paper mode off · live orders locked`} · decision record:{" "}
            <code className="text-[11px]">{program.decision_doc}</code>
          </p>
        </div>
        <Button variant="outline" disabled={pending || !canControl} onClick={onRunResearch} title={runTitle}>
          <RefreshCw className={cn(pending && "animate-spin")} /> {runLabel}
        </Button>
      </Panel>

      <ol className="mm-panel divide-y divide-outline-variant/30 overflow-hidden" aria-label="Experiments">
        {program.experiments.map((experiment) => (
          <ExperimentRow key={experiment.id} experiment={experiment} />
        ))}
      </ol>

      <div className="mm-panel overflow-hidden">
        <button
          type="button"
          onClick={() => setShowRetired((value) => !value)}
          aria-expanded={showRetired}
          className="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left text-sm font-semibold text-on-surface hover:bg-surface-high/30"
        >
          What we tried and why it stopped
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

type Experiment = BoardProgram["experiments"][number];

function statusCounts(program: BoardProgram) {
  const counts = new Map<BoardStatus, number>();
  for (const experiment of program.experiments) counts.set(experiment.status, (counts.get(experiment.status) ?? 0) + 1);
  return [...counts.entries()];
}

/** A leading "have/need" count in the evidence, e.g. "14/100 one-hour labels". */
function evidenceProgress(experiment: Experiment) {
  for (const line of experiment.evidence) {
    const match = line.match(/^(\d[\d,]*)\s*\/\s*(\d[\d,]*)\s/);
    if (!match) continue;
    const have = Number(match[1].replace(/,/g, ""));
    const need = Number(match[2].replace(/,/g, ""));
    if (need > 0 && have <= need * 10) return { have, need, pct: Math.min(100, (have / need) * 100) };
  }
  return null;
}

/** One line per experiment; evidence, gate and next step open on demand. */
function ExperimentRow({ experiment }: { experiment: Experiment }) {
  const [open, setOpen] = useState(false);
  const status = STATUS[experiment.status];
  const progress = evidenceProgress(experiment);
  const panelId = `experiment-${experiment.id}`;
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        className="grid w-full min-w-0 grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-high/30"
      >
        <span className="mm-eyebrow">{experiment.id}</span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-on-surface">{experiment.name}</span>
          <span className="block truncate text-xs text-on-surface-variant">{experiment.question}</span>
          {progress ? (
            <span className="mt-1.5 flex items-center gap-2" aria-label={`${progress.have} of ${progress.need} toward the gate`}>
              <span className="h-1 w-full max-w-48 overflow-hidden rounded-full bg-surface-high">
                <span className="block h-full rounded-full bg-violet" style={{ width: `${progress.pct}%` }} />
              </span>
              <span className="mm-num shrink-0 text-[11px] text-outline">
                {progress.have}/{progress.need}
              </span>
            </span>
          ) : null}
        </span>
        <span className="flex items-center gap-2">
          <Badge variant={status.variant} className="shrink-0">{status.label}</Badge>
          <ChevronDown aria-hidden="true" className={cn("size-4 shrink-0 text-outline transition", open && "rotate-180")} />
        </span>
      </button>
      {open ? (
        <div id={panelId} className="grid gap-2 px-4 pb-4 pl-[3.75rem] text-xs leading-5">
          <ul className="grid gap-1 text-on-surface">
            {experiment.evidence.map((line) => (
              <li key={line} className="flex gap-2">
                <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-violet" />
                <span className="min-w-0 break-words">{line}</span>
              </li>
            ))}
          </ul>
          <p className="text-outline"><span className="font-semibold text-on-surface-variant">Gate:</span> {experiment.gate}</p>
          <p className="text-outline"><span className="font-semibold text-on-surface-variant">Next:</span> {experiment.next}</p>
        </div>
      ) : null}
    </li>
  );
}
