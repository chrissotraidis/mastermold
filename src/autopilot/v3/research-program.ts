/**
 * The Web3 lab's research program (docs/research-2026-09/STRATEGY-DECISION.md).
 * Evidence against pre-registered gates; no trading authority is implied.
 */
import type { CandidateSnapshotRow } from "./candidate-store";
import { recentCostSamples } from "./cost-sampler";
import { evaluateCusumGate } from "./cusum-barrier";

export type Web3ResearchStatus = "done" | "idle" | "measuring" | "insufficient" | "pass" | "fail" | "planned";

export type Web3Experiment = {
  id: string;
  name: string;
  question: string;
  status: Web3ResearchStatus;
  evidence: string[];
  gate: string;
  next: string;
};

export type Web3ResearchProgram = {
  summary: string;
  experiments: Web3Experiment[];
  retired: Array<{ name: string; reason: string }>;
  decision_doc: string;
  daemon: string;
};

export const COPY_GATE = { min_graded: 100 } as const;

export function buildWeb3ResearchProgram(input: { snapshots: CandidateSnapshotRow[]; daemon: string; storeAvailable: boolean }): Web3ResearchProgram {
  const cusumRows = input.snapshots.filter((row) => row.strategy_id === "cusum_tb");
  const gate = evaluateCusumGate(input.snapshots);
  const oldTwoHour = cusumRows.filter((row) => row.decision === "enter" && row.return_2h_bps !== null);
  const copyRows = input.snapshots.filter((row) => row.strategy_id === "copy_wallets" && row.labeled && row.return_6h_bps !== null);
  const copyNet = copyRows.length ? copyRows.reduce((sum, row) => sum + (row.return_6h_bps as number) - row.cost_total_bps, 0) / copyRows.length : null;
  const cost = recentCostSamples()[0] ?? null;
  const idle = input.daemon === "offline" ? "The bot daemon is offline here, so nothing new is being recorded (start it with npm run autopilot; mode stays off)." : null;

  return {
    summary:
      "No Web3 strategy has shown a profit. The lab keeps the one signal with a directionally correct read (cusum_tb), scores it on what it actually trades, and measures costs instead of assuming them.",
    daemon: input.daemon,
    decision_doc: "docs/research-2026-09/STRATEGY-DECISION.md",
    experiments: [
      {
        id: "W1",
        name: "cusum_tb on its real 24h barrier",
        question: "Does the CUSUM event signal make money on the 24h triple barrier it trades, after cost?",
        status: !input.storeAvailable ? "idle" : gate.status,
        evidence: [
          gate.detail,
          gate.net_mean_bps === null ? "No barrier outcomes scored yet." : `Net mean ${gate.net_mean_bps}bp, 90% lower bound ${gate.net_lower_90_bps ?? "n/a"}bp across ${gate.clusters} day×mint clusters.`,
          `For comparison, the old read used ${oldTwoHour.length} 2-hour, pre-cost labels.`,
          ...(idle ? [idle] : []),
        ],
        gate: "≥150 new would-enter events; net mean > +20bp with a 90% interval above zero, clustered by day and mint.",
        next: "Keep ML gating off until this passes; a classifier on 63 labels fits noise.",
      },
      {
        id: "W2",
        name: "Two-leg carry ledger",
        question: "Does positive Drift funding survive both legs, basis moves, margin and liquidation stress?",
        status: "planned",
        evidence: ["Today the carry book is a funding monitor only: it has no spot leg, margin model or liquidation stress, so it cannot show carry profit."],
        gate: "8 weeks; positive net in the stressed case with no simulated liquidation.",
        next: "Build synchronized Jupiter spot + Drift perp quotes each cycle, then the stress engine.",
      },
      {
        id: "W3",
        name: "Execution-cost truth sampler",
        question: "Are the modeled priority-fee and failed-transaction costs realistic?",
        status: cost ? "measuring" : "idle",
        evidence: cost
          ? [
              `On a $${cost.notional_usd} trade: tips p50 ${cost.tip_p50_bps}bp, p75 ${cost.tip_p75_bps}bp, p95 ${cost.tip_p95_bps}bp per leg (SOL $${cost.sol_usd}).`,
              `Round trip at p75 with ${Math.round(cost.failure_rate_assumed * 100)}% failed attempts: ${cost.measured_round_trip_bps}bp vs ${cost.modeled_round_trip_bps}bp modeled → ${cost.verdict === "model_ok" ? "model is not understating" : "model understates cost"}.`,
            ]
          : ["No sample yet. Use Sample costs (reads public tip-floor and price data; sends nothing)."],
        gate: "If measured cost exceeds 25% of a strategy's modeled gross edge, recompute its EV before it continues.",
        next: "Sample at each would-enter once the daemon runs; add public priority-fee reads.",
      },
      {
        id: "W4",
        name: "Forward-only wallet copying",
        question: "Do wallets chosen before a date earn after that date when copied with our real delay?",
        status: copyRows.length < COPY_GATE.min_graded ? "insufficient" : copyNet !== null && copyNet > 0 ? "measuring" : "fail",
        evidence: [
          `${copyRows.length}/${COPY_GATE.min_graded} copy observations graded at 6h after cost${copyNet === null ? "." : `, net mean ${Math.round(copyNet)}bp.`}`,
          "The old 90bp-per-wallet prior was removed: copies are graded, not assumed profitable.",
        ],
        gate: "≥100 graded copies from ≥10 wallets; net mean > 0 with an interval above zero.",
        next: "Freeze the wallet list on a date and grade only copies after it.",
      },
    ],
    retired: [
      { name: "v2 trend-pullback", reason: "Lost $4.97 over 43 paper round trips at a 37% win rate; hard stops ate the payoff." },
      { name: "xsec cross-sectional score", reason: "Inverted: high-conviction picks lost 25bp more than low ones." },
      { name: "trending radar", reason: "Inverted by 227bp; retired from the shadow set 2026-09-26." },
      { name: "bar_portion", reason: "No separation either way; retired from the shadow set 2026-09-26." },
      { name: "MEV, sniping, LP bots", reason: "Retail pays the latency race (bot transactions fail about 58–73% of the time)." },
    ],
  };
}
