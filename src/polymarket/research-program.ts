/**
 * The Polymarket lab's research program, as adopted in
 * docs/research-2026-09/STRATEGY-DECISION.md. Each experiment reports its
 * real evidence against a pre-registered gate. Nothing here grants trading
 * authority; a "pass" only means the evidence earned a human conversation.
 */
import type { AnalystReport } from "./analyst";
import type { PolymarketBrainReport } from "./brain";
import type { PolymarketMarket } from "./markets";
import type { PolymarketStrategyId } from "./strategies";
import { lastNegRiskScan } from "./structural";
import type { WalletIntelligenceReport } from "./wallets";

export type ResearchStatus = "done" | "idle" | "measuring" | "insufficient" | "pass" | "fail";

export type ResearchExperiment = {
  id: string;
  name: string;
  question: string;
  status: ResearchStatus;
  evidence: string[];
  gate: string;
  next: string;
};

export type RetiredStrategy = { name: string; reason: string };

export type ResearchProgram = {
  summary: string;
  experiments: ResearchExperiment[];
  retired: RetiredStrategy[];
  decision_doc: string;
};

export function buildPolymarketResearchProgram(input: {
  brain: PolymarketBrainReport;
  analyst: AnalystReport;
  wallets: WalletIntelligenceReport;
  markets: PolymarketMarket[];
}): ResearchProgram {
  const metric = (id: PolymarketStrategyId) => input.brain.strategies.find((row) => row.strategy_id === id);
  const brainRan = Boolean(input.brain.latest_cycle_at);
  const idleDetail = "Not collecting here yet: run a research cycle (no orders are placed) or leave the scheduler on.";

  const known = input.markets.filter((market) => market.fee_schedule?.known !== false);
  const feeBearing = input.markets.filter((market) => market.fee_schedule && (market.fee_schedule.rate ?? 1) > 0);

  const reward = metric("reward_maker");
  const parity = metric("binary_parity");
  const negRisk = metric("neg_risk_basket");
  const scan = lastNegRiskScan();
  const follow = input.wallets.follow.verdict;
  const shrink = input.analyst.shrinkage.news;

  const experiments: ResearchExperiment[] = [
    {
      id: "P1",
      name: "Fee truth",
      question: "Are fees read from each market's own schedule?",
      status: "done",
      evidence: [
        input.markets.length
          ? `${known.length} of ${input.markets.length} markets in the latest read have a known fee schedule; ${feeBearing.length} charge takers.`
          : "Fees come from feeSchedule (shares × rate × p × (1 − p)); takerBaseFee is ignored.",
        "Fee-free NFL markets are no longer treated as fee markets; wallet-follow fees were overstated about 4× before.",
      ],
      gate: "Every fee number comes from the market's schedule; unknown stays unknown.",
      next: "Nothing. Other experiments now build on true fees.",
    },
    {
      id: "P2",
      name: "Liquidity-reward shadow maker",
      question: "Does a small two-sided quote earn more in rewards than it loses to bad fills?",
      status: !brainRan || !reward?.observations ? "idle" : "measuring",
      evidence: reward?.observations
        ? [`${reward.observations} reward opportunities recorded, ${reward.labels_1h} with 1-hour markouts${reward.mean_1h_bps === null ? " (markouts pending)" : ` (mean ${reward.mean_1h_bps}bp)`}.`, "Our reward share is an upper bound; hidden quoters are invisible."]
        : [idleDetail],
      gate: "≥14 UTC days and ≥20 markets; lower bound of rewards − markouts − unwind fees > 0, not carried by 1–2 markets.",
      next: "Add the pessimistic-queue fill ledger before the gate can be evaluated.",
    },
    {
      id: "P3",
      name: "Neg-risk basket monitor",
      question: "Do all named outcomes of an event ever cost less than $1 after fees, with depth?",
      status: !scan ? "idle" : negRisk?.observations ? "measuring" : "measuring",
      evidence: scan
        ? [
            `Last scan ${new Date(scan.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}: ${scan.results.length} events read.`,
            ...scan.results.slice(0, 3).map((result) =>
              result.status === "has_other"
                ? `${result.title}: skipped (has an "Other" placeholder leg).`
                : result.status === "incomplete"
                  ? `${result.title}: ${result.priced_legs}/${result.legs} legs priced; incomplete.`
                  : `${result.title}: ${result.legs} legs cost ${((result.sum_asks ?? 0) * 100).toFixed(1)}¢ + ${((result.fees_per_basket ?? 0) * 100).toFixed(2)}¢ fees → ${((result.net_edge ?? 0) * 100).toFixed(1)}¢ ${result.status === "edge" ? "edge" : "(no edge)"}.`,
            ),
            `${negRisk?.observations ?? 0} edge episodes recorded so far.`,
          ]
        : [idleDetail],
      gate: "≥10 episodes a week netting ≥ $2 at ≥20 shares that outlast measured latency, for 4 weeks.",
      next: "Keep scanning; measure episode lifetime on our own clock.",
    },
    {
      id: "P4",
      name: "Binary parity (fee-inclusive control)",
      question: "Does YES + NO ever cost less than $1 after both fees? Expected: no.",
      status: !brainRan ? "idle" : "measuring",
      evidence: brainRan ? [`${parity?.observations ?? 0} fee-clean parity episodes recorded.`] : [idleDetail],
      gate: "Same as P3. This is a falsification control and is expected to fail.",
      next: "Keep as evidence that naive parity does not pay.",
    },
    {
      id: "P5",
      name: "Wallet follow-arm v2",
      question: "Do copied wallets beat a comparable market bought with no wallet signal?",
      status: !input.wallets.enabled ? "idle" : follow.status,
      evidence: input.wallets.enabled
        ? [
            follow.detail,
            follow.diff_per_dollar === null
              ? "No paired follow/control results yet."
              : `Follow ${follow.follow_ev_per_dollar}/$ vs control ${follow.control_ev_per_dollar}/$ → difference ${follow.diff_per_dollar}/$ (lower bound ${follow.diff_lower_95 ?? "n/a"}).`,
          ]
        : ["Wallet lane is off (POLYMARKET_WALLETS=0). Paper follow-arm stays off by policy."],
      gate: "≥300 resolved markets across 6 weekends; follow − control lower bound > 0 and still positive without the top two wallets.",
      next: "Runs only if the operator turns the wallet lane on; paper follows need a separate explicit decision.",
    },
    {
      id: "P6",
      name: "Analyst shrinkage fit",
      question: "Does the LLM's disagreement with the market carry any information?",
      status: shrink.status === "insufficient" ? "insufficient" : shrink.status === "adds_information" ? "pass" : "fail",
      evidence: [
        shrink.detail,
        ...(shrink.w !== null ? [`Held-out Brier: market ${shrink.test_brier_market} vs shrunk ${shrink.test_brier_shrunk} (w = ${shrink.w}).`] : []),
      ],
      gate: "Held-out news weight w with a 95% interval above zero; otherwise stop the analyst lane.",
      next: shrink.status === "adds_information" ? "Try the no-search 5-sample ensemble, shrunk by w." : "Keep :online off; no new model spend until this passes.",
    },
  ];

  return {
    summary:
      "Momentum lost money and the AI forecaster lost to the market. Entries are paused while the lab tests edges that don't need to out-guess it.",
    experiments,
    retired: [
      { name: "24-hour momentum", reason: "Lost money over 173 paper trips, and prices moved against it at every horizon." },
      { name: "Order-book pressure", reason: "Same falsified exploration lane; resting depth did not predict price." },
      { name: "Displayed maker spread", reason: "Sampled the thin, wide books where adverse selection is worst; replaced by P2." },
      { name: "LLM analyst with :online search", reason: "Scored worse than the market prior over 779 forecasts (Brier 0.2289 vs 0.2066)." },
    ],
    decision_doc: "docs/research-2026-09/STRATEGY-DECISION.md",
  };
}
