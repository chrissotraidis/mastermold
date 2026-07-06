/// <reference types="bun" />

/**
 * Autopilot terminal tape: merging the activity log + decision trace into one
 * chronological, tone-tagged feed (plan of record item 2). Pure.
 */

import { describe, expect, test } from "bun:test";

import {
  buildTerminalLines,
  collapseDaemonRestarts,
  filterTerminalLines,
  type TerminalLine,
} from "../components/autopilot-terminal";

const T0 = "2026-07-04T12:00:00.000Z";
const T1 = "2026-07-04T12:00:20.000Z";
const T2 = "2026-07-04T12:00:40.000Z";
const T3 = "2026-07-04T12:01:00.000Z";

function at(offsetSeconds: number): string {
  return new Date(Date.parse(T0) + offsetSeconds * 1000).toISOString();
}

describe("buildTerminalLines", () => {
  test("GIVEN activity and decisions THEN one chronological tape with skips/blocks from the trace", () => {
    const lines = buildTerminalLines(
      [
        { id: "a2", ts: T2, kind: "entry", message: "Paper buy SOL: $25.00 at $82.4" },
        { id: "a1", ts: T0, kind: "daemon", message: "Paper daemon started" },
      ],
      [
        { id: "d1", ts: T1, symbol: "WIF", verdict: "skip", reason: "24h trend unknown below the +2.5% gate" },
        { id: "d2", ts: T3, symbol: "JTO", verdict: "blocked", reason: "Policy: already at the 5-position cap." },
        // enter/exit decisions are already carried by activity lines — deduped.
        { id: "d3", ts: T2, symbol: "SOL", verdict: "enter", reason: "Trend pullback" },
      ],
    );
    expect(lines.map((line) => line.tag)).toEqual(["daemon", "skip", "entry", "blocked"]);
    expect(lines.map((line) => line.tone)).toEqual(["dim", "dim", "good", "warn"]);
    expect(lines[1].text).toContain("WIF:");
  });

  test("GIVEN loss exits, halts, and analyst notes THEN tones read at a glance", () => {
    const lines = buildTerminalLines(
      [
        // The daemon prints losses as "$-0.35" (sign AFTER the $) — the tone
        // detection must match that exact shape, not the intuitive "-$0.35".
        { id: "a1", ts: T0, kind: "exit", message: "Paper sell JTO: $24.61 at $1.9 ($-0.35 before fees)." },
        { id: "a2", ts: T1, kind: "exit", message: "Paper sell SOL: $25.90 at $83.0 (+$0.88 before fees)." },
        { id: "a3", ts: T2, kind: "halt", message: "Daily loss limit hit." },
        { id: "a4", ts: T3, kind: "analyst", message: "Daily review: quiet day." },
      ],
      [],
    );
    expect(lines.map((line) => line.tone)).toEqual(["bad", "good", "bad", "accent"]);
  });

  test("GIVEN a long history THEN only the newest lines survive the cap", () => {
    const activity = Array.from({ length: 80 }, (_, index) => ({
      id: `a${index}`,
      ts: new Date(Date.parse(T0) + index * 1000).toISOString(),
      kind: "daemon",
      message: `tick ${index}`,
    }));
    const lines = buildTerminalLines(activity, [], 60);
    expect(lines).toHaveLength(60);
    expect(lines[59].text).toBe("tick 79"); // newest kept, oldest dropped
  });

  test("GIVEN a v3-shadow activity row THEN it gets the shadow (teal) tone", () => {
    const lines = buildTerminalLines(
      [{ id: "a1", ts: T0, kind: "v3-shadow", message: "V3 shadow: 9 candidates scored, 2 would-enter." }],
      [],
    );
    expect(lines).toHaveLength(1);
    expect(lines[0].tone).toBe("shadow");
    expect(lines[0].tag).toBe("v3-shadow");
  });

  test("GIVEN repeated daemon restart chatter THEN it collapses to one dim restart line", () => {
    const chatter = [
      { id: "a0", ts: at(0), kind: "daemon", message: "Paper daemon started (v2 trend-pullback, tick 20s)." },
      { id: "a1", ts: at(10), kind: "daemon", message: "Paper daemon stopped." },
      { id: "a2", ts: at(20), kind: "daemon", message: "Paper daemon started (v2 trend-pullback, tick 20s)." },
      { id: "a3", ts: at(30), kind: "daemon", message: "Paper daemon stopped." },
      { id: "a4", ts: at(40), kind: "daemon", message: "Paper daemon started (v2 trend-pullback, tick 20s)." },
      // A real event breaks the run: chatter after it starts a new group.
      { id: "a5", ts: at(50), kind: "entry", message: "Paper buy SOL: $25.00 at $82.4" },
      { id: "a6", ts: at(60), kind: "daemon", message: "Paper daemon started (v2 trend-pullback, tick 20s)." },
    ];
    const lines = buildTerminalLines(chatter, []);
    expect(lines.map((line) => line.text)).toEqual([
      "daemon restarted ×2",
      "Paper buy SOL: $25.00 at $82.4",
      "Paper daemon started (v2 trend-pullback, tick 20s).",
    ]);
    expect(lines[0].tone).toBe("dim");
    expect(lines[0].ts).toBe(at(40)); // collapsed line keeps the newest timestamp
  });

  test("GIVEN a lone start or a plain stop THEN collapse leaves them untouched", () => {
    const lone: TerminalLine[] = [
      { id: "1", ts: at(0), tag: "daemon", text: "Paper daemon started (v2).", tone: "dim" },
      { id: "2", ts: at(10), tag: "entry", text: "Paper buy SOL", tone: "good" },
      { id: "3", ts: at(20), tag: "daemon", text: "Paper daemon stopped.", tone: "dim" },
    ];
    expect(collapseDaemonRestarts(lone)).toEqual(lone);
    // started→stopped with no restart is honest history, never hidden.
    const startStop: TerminalLine[] = [
      { id: "1", ts: at(0), tag: "daemon", text: "Paper daemon started (v2).", tone: "dim" },
      { id: "2", ts: at(10), tag: "daemon", text: "Paper daemon stopped.", tone: "dim" },
    ];
    expect(collapseDaemonRestarts(startStop)).toEqual(startStop);
  });
});

describe("filterTerminalLines", () => {
  const tape = buildTerminalLines(
    [
      { id: "a1", ts: at(0), kind: "entry", message: "Paper buy SOL: $25.00 at $82.4" },
      { id: "a2", ts: at(10), kind: "analyst", message: "Daily review: quiet day." },
      { id: "a3", ts: at(20), kind: "provision", message: "Wallet provisioned: cash leg swapped." },
      { id: "a4", ts: at(30), kind: "mode", message: "LIVE mode armed: the go-live gate passed every check." },
      { id: "a5", ts: at(40), kind: "halt", message: "Daily loss limit hit." },
      { id: "a6", ts: at(50), kind: "halt", message: "LIVE RECONCILE MISMATCH: wallet USDC $9.12 vs booked $10.00." },
      { id: "a7", ts: at(60), kind: "v3-shadow", message: "V3 shadow: 9 candidates scored." },
    ],
    [{ id: "d1", ts: at(5), symbol: "WIF", verdict: "skip", reason: "trend below the gate" }],
  );

  test("GIVEN the paper view THEN live-only rows disappear but paper halts stay", () => {
    const paper = filterTerminalLines(tape, "paper");
    expect(paper.map((line) => line.id)).toEqual(["a-a1", "d-d1", "a-a2", "a-a5", "a-a7"]);
  });

  test("GIVEN the live view THEN only live-money events, halts, and v3/gate context remain", () => {
    const live = filterTerminalLines(tape, "live");
    expect(live.map((line) => line.id)).toEqual(["a-a3", "a-a4", "a-a5", "a-a6", "a-a7"]);
  });

  test("GIVEN both views THEN every non-halt, non-shadow line lands in exactly one view", () => {
    const paper = new Set(filterTerminalLines(tape, "paper").map((line) => line.id));
    const live = new Set(filterTerminalLines(tape, "live").map((line) => line.id));
    for (const line of tape) {
      if (line.tag === "halt" || line.tag === "v3-shadow") continue; // deliberately in both
      expect(paper.has(line.id) !== live.has(line.id)).toBe(true);
    }
  });
});
