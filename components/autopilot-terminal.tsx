"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Terminal view of the autopilot's activity: a tail-style pane fed entirely
 * from data the /api/autopilot payload already carries (activity log +
 * decision trace). Zero new API calls, zero daemon changes — presentation
 * over the trace the bot writes for exactly this reason.
 *
 * Two views over one merged tape (client-side filter, no refetch):
 * - Paper: everything the paper loop writes (entries/exits/skips/blocked/
 *   analyst/daemon), minus live-only rows.
 * - Live: live-money events only (provision/halt/mode, LIVE fills/reconcile,
 *   v3 shadow + go-live gate context). Honest empty state until live runs.
 */

type ActivityLike = { id: string; ts: string; kind: string; message: string };
type DecisionLike = { id: string; ts: string; symbol: string; verdict: string; reason: string };

export type GateSummaryLike = {
  ready: boolean;
  checks: Array<{ key: string; label: string; pass: boolean; detail: string }>;
};

export type TerminalLine = {
  id: string;
  ts: string;
  tag: string;
  text: string;
  tone: "dim" | "info" | "good" | "bad" | "warn" | "accent" | "shadow";
};

export type TapeView = "paper" | "live";

/** Loss fills print as "($-0.35 before fees)" — the sign sits AFTER the $. */
function isLossMessage(message: string): boolean {
  return message.includes("$-");
}

function toneForActivity(kind: string, message: string): TerminalLine["tone"] {
  if (kind === "halt" || kind === "error") return "bad";
  if (kind === "entry") return "good";
  if (kind === "exit") return isLossMessage(message) ? "bad" : "good";
  if (kind === "policy") return "warn";
  if (kind === "analyst") return "accent";
  if (kind === "v3-shadow") return "shadow";
  if (kind === "provision" || kind === "mode" || kind === "control") return "info";
  return "dim"; // daemon chatter
}

function toneForDecision(verdict: string): TerminalLine["tone"] {
  if (verdict === "enter") return "good";
  if (verdict === "exit") return "info";
  if (verdict === "blocked") return "warn";
  return "dim"; // skip
}

/** Timestamp | [tag] | message — each tone colors the tag and the message. */
const TAG_CLASS: Record<TerminalLine["tone"], string> = {
  dim: "text-outline",
  info: "text-sky-400",
  good: "text-engine",
  bad: "text-critical",
  warn: "text-caution",
  accent: "text-gold",
  shadow: "text-teal-400",
};

const TEXT_CLASS: Record<TerminalLine["tone"], string> = {
  dim: "text-outline",
  info: "text-sky-200/90",
  good: "text-emerald-200/90",
  bad: "text-red-200/90",
  warn: "text-amber-200/90",
  accent: "text-gold-soft/90",
  shadow: "text-teal-200/90",
};

const DAEMON_CHATTER = /^Paper daemon (started|stopped)/;

/**
 * Collapse consecutive "Paper daemon started/stopped" chatter into one dim
 * "daemon restarted ×N" line. A restart is a "started" that follows earlier
 * chatter in the same uninterrupted run; runs without a restart (a lone start,
 * or a plain stop) pass through untouched so the tape never hides a real stop.
 */
export function collapseDaemonRestarts(lines: TerminalLine[]): TerminalLine[] {
  const collapsed: TerminalLine[] = [];
  let run: TerminalLine[] = [];

  const flush = () => {
    if (run.length === 0) return;
    const restarts = run.filter(
      (line, index) => index > 0 && line.text.startsWith("Paper daemon started"),
    ).length;
    if (run.length >= 2 && restarts >= 1) {
      const last = run[run.length - 1];
      collapsed.push({
        id: `restart-${run[0].id}-${last.id}`,
        ts: last.ts,
        tag: "daemon",
        text: `daemon restarted ×${restarts}`,
        tone: "dim",
      });
    } else {
      collapsed.push(...run);
    }
    run = [];
  };

  for (const line of lines) {
    if (line.tag === "daemon" && DAEMON_CHATTER.test(line.text)) {
      run.push(line);
    } else {
      flush();
      collapsed.push(line);
    }
  }
  flush();
  return collapsed;
}

/** Merge activity + decisions into one chronological tape (oldest → newest). */
export function buildTerminalLines(
  activity: ActivityLike[],
  decisions: DecisionLike[],
  limit = 80,
): TerminalLine[] {
  const lines: TerminalLine[] = [
    ...activity.map((row) => ({
      id: `a-${row.id}`,
      ts: row.ts,
      tag: row.kind,
      text: row.message,
      tone: toneForActivity(row.kind, row.message),
    })),
    ...decisions
      // enter/exit decisions duplicate the entry/exit activity lines; the
      // tape shows the ones activity doesn't carry: skips and policy blocks.
      .filter((row) => row.verdict === "skip" || row.verdict === "blocked")
      .map((row) => ({
        id: `d-${row.id}`,
        ts: row.ts,
        tag: row.verdict,
        text: `${row.symbol}: ${row.reason}`,
        tone: toneForDecision(row.verdict),
      })),
  ];
  const merged = lines.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  return collapseDaemonRestarts(merged).slice(-limit);
}

/** Rows that only exist because of live money: wallet provisioning, live-mode
 *  arming, and anything the daemon stamps with the LIVE marker (fills,
 *  reconcile). Halts stay in BOTH views — a halt matters everywhere. */
const LIVE_ONLY_TAGS = new Set(["provision", "mode"]);

function mentionsLive(line: TerminalLine): boolean {
  return /\bLIVE\b/.test(line.text) || /go-live/i.test(line.text);
}

function isLiveOnly(line: TerminalLine): boolean {
  return LIVE_ONLY_TAGS.has(line.tag) || mentionsLive(line);
}

/** Split the merged tape per view. Paper = everything minus live-only rows;
 *  Live = live-money events plus halt / v3-shadow / gate context. */
export function filterTerminalLines(lines: TerminalLine[], view: TapeView): TerminalLine[] {
  if (view === "live") {
    return lines.filter((line) => isLiveOnly(line) || line.tag === "halt" || line.tag === "v3-shadow");
  }
  return lines.filter((line) => !isLiveOnly(line));
}

function clock(ts: string): string {
  const date = new Date(ts);
  return Number.isFinite(date.getTime())
    ? date.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "--:--:--";
}

const VIEWS: Array<{ id: TapeView; label: string }> = [
  { id: "paper", label: "Paper" },
  { id: "live", label: "Live" },
];

export function AutopilotTerminal({
  activity,
  decisions,
  gate = null,
}: {
  activity: ActivityLike[];
  decisions: DecisionLike[];
  gate?: GateSummaryLike | null;
}) {
  const [view, setView] = useState<TapeView>("paper");
  const allLines = useMemo(() => buildTerminalLines(activity, decisions), [activity, decisions]);
  const lines = useMemo(() => filterTerminalLines(allLines, view), [allLines, view]);
  const paneRef = useRef<HTMLDivElement>(null);

  // Tail behavior: keep the newest line in view as the tape grows.
  useEffect(() => {
    const pane = paneRef.current;
    if (pane) pane.scrollTop = pane.scrollHeight;
  }, [lines]);

  // The live view carries context rows (v3 shadow, paper halts) even before
  // any live money moves — the "nothing live has ever run" notice keys off
  // actual live-money rows, not off the pane merely being non-empty.
  const liveMoneySeen = view === "live" && lines.some((line) => isLiveOnly(line));

  return (
    <div className="overflow-hidden rounded-md border border-outline-variant/30 bg-[#07070b]">
      <div className="flex items-center gap-2 border-b border-outline-variant/20 p-2">
        <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-engine" />
        <span className="font-mono text-[10px] uppercase tracking-widest text-outline">autopilot — tape</span>
        <div
          role="tablist"
          aria-label="Tape view"
          className="ml-2 flex overflow-hidden rounded-md border border-outline-variant/30"
        >
          {VIEWS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={view === tab.id}
              onClick={() => setView(tab.id)}
              className={`min-h-8 px-3 font-mono text-[11px] transition-colors ${
                view === tab.id
                  ? "bg-surface-dim/80 font-semibold text-on-surface"
                  : "text-outline hover:bg-surface-dim/40 hover:text-on-surface-variant"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <span className="ml-auto font-mono text-[10px] text-outline/70">{lines.length} lines</span>
      </div>
      <div
        ref={paneRef}
        aria-label="Autopilot activity terminal"
        className="h-72 overflow-y-auto p-2 font-mono text-xs leading-6 [scrollbar-width:thin] [scrollbar-color:hsl(266_25%_22%/0.7)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[hsl(266_25%_22%/0.7)] hover:[&::-webkit-scrollbar-thumb]:bg-[hsl(258_40%_40%/0.8)]"
      >
        {view === "live" && !liveMoneySeen ? <LiveEmptyNotice gate={gate} standalone={lines.length === 0} /> : null}
        {lines.length === 0 ? (
          view === "paper" ? (
            <p className="text-outline">— no activity yet; the daemon writes here as it works —</p>
          ) : null
        ) : (
          lines.map((line) => (
            <p key={line.id} className="whitespace-pre-wrap break-words">
              <span className="text-outline/60">{clock(line.ts)}</span>{" "}
              <span
                className={`inline-block w-[11ch] font-semibold ${TAG_CLASS[line.tone]}`}
              >{`[${line.tag}]`}</span>{" "}
              <span className={TEXT_CLASS[line.tone]}>{line.text}</span>
            </p>
          ))
        )}
      </div>
    </div>
  );
}

/** Honest empty state for the live tape: nothing live has ever run. Rendered
 *  as a banner above any context rows (v3 shadow / halts), or centered when
 *  the live tape is completely empty. */
function LiveEmptyNotice({ gate, standalone }: { gate: GateSummaryLike | null; standalone: boolean }) {
  const passing = gate ? gate.checks.filter((check) => check.pass).length : 0;
  const waiting = gate ? gate.checks.filter((check) => !check.pass).map((check) => check.key) : [];
  const body = (
    <>
      <p className="text-outline">No live activity yet — live money stays locked behind the go-live gate.</p>
      {gate ? (
        <p className="text-[11px] text-outline/70">
          Go-live gate {gate.ready ? "OPEN" : "locked"} · {passing}/{gate.checks.length} checks passing
          {waiting.length > 0 ? ` · waiting on ${waiting.join(", ")}` : ""}
        </p>
      ) : null}
    </>
  );
  if (standalone) {
    return <div className="flex h-full flex-col items-center justify-center gap-1 px-4 text-center">{body}</div>;
  }
  return (
    <div className="mb-2 grid gap-0.5 rounded-md border border-outline-variant/20 bg-surface-dim/30 px-2 py-1.5 leading-5">
      {body}
    </div>
  );
}
