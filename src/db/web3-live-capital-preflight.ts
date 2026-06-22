import { createHash } from "node:crypto";
import type { Web3AutonomyLaunchChecklist, Web3AutonomyLaunchChecklistItem } from "./web3-launch-checklist";
import type { Web3TradingState } from "./web3-trading";

export type Web3LiveCapitalPreflightGateStatus = "pass" | "watch" | "fail";

export type Web3LiveCapitalPreflightGate = {
  id:
    | "operator-wallet"
    | "provider-read-rail"
    | "live-dex"
    | "jupiter-order"
    | "risk-policy"
    | "kill-switch"
    | "signer-custody"
    | "settlement"
    | "profit-proof"
    | "manual-live-review";
  label: string;
  status: Web3LiveCapitalPreflightGateStatus;
  evidence: string;
  next_action: string;
  blocks_live_capital: boolean;
};

export type Web3LiveCapitalPreflightReceipt = {
  mode: "web3-live-capital-preflight-receipt";
  status: "blocked" | "blocked-as-expected" | "manual-live-review";
  generated_at: string;
  receipt_hash: string;
  source: Web3TradingState["market_source"]["mode"];
  scenario: Web3TradingState["scenario"];
  account: Web3TradingState["paper_account"]["mode"];
  live_execution_permission: "blocked" | "manual-live-executor-review";
  wallet_mutation_permission: "blocked";
  transaction_submission_permission: "blocked";
  private_key_storage: "blocked";
  secret_echo_permission: "blocked";
  real_capital_blocked: boolean;
  launch_status: Web3AutonomyLaunchChecklist["status"];
  launch_readiness_score: number;
  live_review_permitted: boolean;
  passed_gate_count: number;
  watch_gate_count: number;
  failed_gate_count: number;
  blocker_count: number;
  blockers: string[];
  gates: Web3LiveCapitalPreflightGate[];
  next_action: string;
  summary: string;
  controls: string[];
};

export function buildWeb3LiveCapitalPreflightReceipt({
  state,
  checklist,
}: {
  state: Web3TradingState;
  checklist: Web3AutonomyLaunchChecklist;
}): Web3LiveCapitalPreflightReceipt {
  const generatedAt = new Date().toISOString();
  const gates = buildLiveCapitalPreflightGates(state, checklist);
  const failedGates = gates.filter((gate) => gate.status === "fail");
  const watchGates = gates.filter((gate) => gate.status === "watch");
  const blockers = [
    ...failedGates.map((gate) => gate.next_action),
    ...watchGates.filter((gate) => gate.blocks_live_capital).map((gate) => gate.next_action),
  ].filter((value, index, all) => value.trim().length > 0 && all.indexOf(value) === index);
  const liveReviewPermitted = checklist.live_review_permitted && failedGates.length === 0 && watchGates.length === 0;
  const status: Web3LiveCapitalPreflightReceipt["status"] = liveReviewPermitted
    ? "manual-live-review"
    : failedGates.length > 0
      ? "blocked"
      : "blocked-as-expected";
  const base = {
    mode: "web3-live-capital-preflight-receipt" as const,
    status,
    generated_at: generatedAt,
    source: state.market_source.mode,
    scenario: state.scenario,
    account: state.paper_account.mode,
    live_execution_permission: liveReviewPermitted ? "manual-live-executor-review" as const : "blocked" as const,
    wallet_mutation_permission: "blocked" as const,
    transaction_submission_permission: "blocked" as const,
    private_key_storage: "blocked" as const,
    secret_echo_permission: "blocked" as const,
    real_capital_blocked: !liveReviewPermitted,
    launch_status: checklist.status,
    launch_readiness_score: checklist.readiness_score,
    live_review_permitted: liveReviewPermitted,
    passed_gate_count: gates.filter((gate) => gate.status === "pass").length,
    watch_gate_count: watchGates.length,
    failed_gate_count: failedGates.length,
    blocker_count: blockers.length,
    blockers: blockers.slice(0, 10),
    gates,
    next_action: blockers[0] ?? "Manual live executor review can begin; this app still does not sign, submit, or custody funds.",
    summary: liveCapitalPreflightReceiptSummary(status, checklist, gates),
    controls: [
      "This receipt is a live-capital readiness proof, not an execution permission.",
      "It never asks for private keys, seed phrases, signed payloads, raw transaction bodies, or wallet authority.",
      "Every gate must pass before manual live executor review; even then, signing and submission remain outside this receipt.",
      "Read-only Helius/Solana, live DEX discovery, and Jupiter rehearsal evidence can improve readiness without granting wallet mutation.",
    ],
  };

  return {
    ...base,
    receipt_hash: hashJson(base),
  };
}

function buildLiveCapitalPreflightGates(
  state: Web3TradingState,
  checklist: Web3AutonomyLaunchChecklist,
): Web3LiveCapitalPreflightGate[] {
  const provider = checklist.provider_credentials_readiness;
  const executionConfig = state.execution_readiness.config;
  const walletScoped = isLikelySolanaPublicKey(executionConfig.wallet_public_key);
  const sampleWallet = executionConfig.wallet_public_key === SAMPLE_SYSTEM_WALLET;
  const failedDexSources = state.discovery_tape.sources.filter((source) => source.status === "failed").length;
  const liveDexReady = state.market_source.status === "live" &&
    state.discovery_tape.status === "live" &&
    state.discovery_tape.pairs_mapped > 0 &&
    failedDexSources === 0;
  const adapter = state.autonomous_execution_adapter_readiness;
  const jupiterOrderReady = adapter.quote_request_ready && adapter.swap_v2_order_ready;
  const capsReady = executionConfig.max_trade_usd > 0 &&
    executionConfig.daily_spend_cap_usd >= executionConfig.max_trade_usd &&
    executionConfig.daily_spend_cap_usd <= 10_000 &&
    executionConfig.max_slippage_bps <= 250;
  const killSwitchClear = !executionConfig.kill_switch;
  const signerItem = checklist.items.find((item) => item.id === "signer");
  const custodyItem = checklist.items.find((item) => item.id === "custody-policy");
  const settlementItem = checklist.items.find((item) => item.id === "settlement");
  const profitProofItem = checklist.items.find((item) => item.id === "profit-proof");

  return [
    {
      id: "operator-wallet",
      label: "Operator wallet",
      status: walletScoped && !sampleWallet ? "pass" : walletScoped ? "watch" : "fail",
      evidence: walletScoped
        ? sampleWallet
          ? "Sample all-ones system wallet is still scoped."
          : "Dedicated public Solana wallet is scoped."
        : "No valid public Solana wallet is scoped.",
      next_action: walletScoped && !sampleWallet
        ? "Keep using a dedicated public trading wallet; never enter private keys."
        : "Save a dedicated public Solana trading wallet in the Trading live canary console before live review.",
      blocks_live_capital: true,
    },
    {
      id: "provider-read-rail",
      label: "Provider read rail",
      status: provider.read_provider_status === "ready" ? "pass" : provider.read_provider_status === "partial" ? "watch" : "fail",
      evidence: `Read rail ${provider.read_provider_status}; provider status ${provider.status.replaceAll("-", " ")}.`,
      next_action: provider.read_provider_status === "ready"
        ? "Keep Helius/Solana and Jupiter read credentials in server env or one-shot tests."
        : provider.next_action,
      blocks_live_capital: true,
    },
    {
      id: "live-dex",
      label: "Live DEX scanner",
      status: liveDexReady ? "pass" : state.market_source.status === "live" || state.discovery_tape.pairs_mapped > 0 ? "watch" : "fail",
      evidence: `${state.discovery_tape.pairs_mapped} pair${state.discovery_tape.pairs_mapped === 1 ? "" : "s"} mapped, ${state.discovery_tape.tokens_considered} candidates, ${failedDexSources} failed source${failedDexSources === 1 ? "" : "s"}.`,
      next_action: liveDexReady
        ? "Keep live DEX evidence read-only until signer, order, settlement, and manual review gates pass."
        : "Run the live DEX scanner and require mapped live pairs with no failed discovery sources.",
      blocks_live_capital: true,
    },
    {
      id: "jupiter-order",
      label: "Jupiter order rehearsal",
      status: jupiterOrderReady ? "pass" : adapter.quote_request_ready ? "watch" : "fail",
      evidence: `Quote ${adapter.quote_request_ready ? "ready" : "missing"}; unsigned order ${adapter.swap_v2_order_ready ? "ready" : "missing"}; provider ${adapter.quote_provider.replaceAll("-", " ")}.`,
      next_action: jupiterOrderReady
        ? "Keep unsigned transaction bytes withheld until an external signer review exists."
        : adapter.next_action,
      blocks_live_capital: true,
    },
    {
      id: "risk-policy",
      label: "Risk policy",
      status: capsReady ? "pass" : executionConfig.daily_spend_cap_usd >= executionConfig.max_trade_usd ? "watch" : "fail",
      evidence: `$${executionConfig.max_trade_usd} max trade, $${executionConfig.daily_spend_cap_usd} daily cap, ${executionConfig.max_slippage_bps} bps slippage.`,
      next_action: capsReady
        ? "Keep per-trade, daily, and slippage caps bounded before any manual live review."
        : "Set positive max trade, daily cap at least as large as max trade but no more than $10,000, and slippage at 250 bps or less.",
      blocks_live_capital: true,
    },
    {
      id: "kill-switch",
      label: "Kill switch",
      status: killSwitchClear ? "pass" : "fail",
      evidence: killSwitchClear ? "Execution kill switch is clear for dry-run review." : "Execution kill switch is engaged.",
      next_action: killSwitchClear
        ? "Keep the kill switch tested and reachable before live review."
        : "Clear the kill switch only after reviewing the live-capital preflight blockers.",
      blocks_live_capital: true,
    },
    checklistGate("signer-custody", "Signer and custody", [signerItem, custodyItem], "Connect an external signer/custody policy that never exposes private keys to the app."),
    checklistGate("settlement", "Settlement and fills", [settlementItem], "Prove submitted transaction confirmation and fill reconciliation before live review."),
    checklistGate("profit-proof", "Profit proof", [profitProofItem], "Finish promoted paper proof and repeatability targets before live review."),
    {
      id: "manual-live-review",
      label: "Manual live review",
      status: checklist.live_review_permitted ? "pass" : checklist.hard_blocker_count > 0 ? "fail" : "watch",
      evidence: `${checklist.completed_proof_count}/${checklist.items.length} launch proofs pass; ${checklist.remaining_work_count} remaining.`,
      next_action: checklist.live_review_permitted
        ? "Manual live executor review can begin outside this receipt."
        : checklist.next_action,
      blocks_live_capital: true,
    },
  ];
}

function checklistGate(
  id: Web3LiveCapitalPreflightGate["id"],
  label: string,
  items: Array<Web3AutonomyLaunchChecklistItem | undefined>,
  fallbackNextAction: string,
): Web3LiveCapitalPreflightGate {
  const present = items.filter((item): item is Web3AutonomyLaunchChecklistItem => Boolean(item));
  const failed = present.find((item) => item.status === "fail");
  const watching = present.find((item) => item.status === "watch");
  const status = failed ? "fail" : watching ? "watch" : present.length > 0 ? "pass" : "fail";
  return {
    id,
    label,
    status,
    evidence: present.map((item) => `${item.label}: ${item.detail}`).join(" ") || "Launch checklist evidence is missing.",
    next_action: failed?.blocker ?? watching?.blocker ?? watching?.detail ?? (status === "pass" ? "Launch checklist evidence is passing." : fallbackNextAction),
    blocks_live_capital: true,
  };
}

function liveCapitalPreflightReceiptSummary(
  status: Web3LiveCapitalPreflightReceipt["status"],
  checklist: Web3AutonomyLaunchChecklist,
  gates: Web3LiveCapitalPreflightGate[],
) {
  const failed = gates.filter((gate) => gate.status === "fail").length;
  const watch = gates.filter((gate) => gate.status === "watch").length;
  if (status === "manual-live-review") {
    return "All live-capital preflight gates passed; only a separate manual live executor review can proceed from here.";
  }
  if (failed > 0) return `Live-capital preflight is blocked by ${failed} failed gate${failed === 1 ? "" : "s"} and ${watch} review gate${watch === 1 ? "" : "s"}.`;
  return `Live-capital preflight is blocked as expected while ${watch} review gate${watch === 1 ? "" : "s"} remain and launch status is ${checklist.status.replaceAll("-", " ")}.`;
}

function isLikelySolanaPublicKey(value: string | null | undefined) {
  return Boolean(value && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value));
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

const SAMPLE_SYSTEM_WALLET = "11111111111111111111111111111111";
