import { createHash } from "node:crypto";
import type { Web3AutonomyLaunchChecklist } from "./web3-launch-checklist";
import type { Web3SupervisedLiveRunway } from "./web3-supervised-live-runway";
import type { Web3TradingState } from "./web3-trading";

export type Web3UsabilityStatus =
  | "paper-usable"
  | "dry-run-gated"
  | "supervised-live-gated"
  | "autonomous-live-locked";

export type Web3UsabilityCapability = {
  id:
    | "copilot"
    | "paper-autonomy"
    | "live-dex-read"
    | "wallet-net-worth"
    | "jupiter-dry-run"
    | "supervised-live"
    | "autonomous-live";
  label: string;
  status: "usable" | "watch" | "gated" | "locked";
  detail: string;
  next_action: string;
  evidence: string[];
};

export type Web3UsabilityStatusReceipt = {
  mode: "web3-usability-status";
  status: Web3UsabilityStatus;
  generated_at: string;
  source_state_as_of: string;
  current_mode: "copilot" | "paper-autonomy" | "dry-run-rehearsal" | "supervised-live-review" | "autonomous-live";
  usable_count: number;
  gated_count: number;
  locked_count: number;
  next_gate_label: string;
  next_gate_action: string;
  summary: string;
  capabilities: Web3UsabilityCapability[];
  safe_commands: string[];
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  transaction_submission_permission: "blocked";
  private_key_storage: "blocked";
  seed_phrase_storage: "blocked";
  secret_echo_permission: "blocked";
  controls: string[];
  receipt_hash: string;
};

export function buildWeb3UsabilityStatus(input: {
  state: Web3TradingState;
  launchChecklist: Web3AutonomyLaunchChecklist;
  supervisedRunway: Web3SupervisedLiveRunway;
  now?: Date;
}): Web3UsabilityStatusReceipt {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const capabilities = buildCapabilities(input);
  const usableCount = capabilities.filter((capability) => capability.status === "usable").length;
  const gatedCount = capabilities.filter((capability) => capability.status === "gated").length;
  const lockedCount = capabilities.filter((capability) => capability.status === "locked").length;
  const nextGate = nextUsabilityGate(input.launchChecklist, input.supervisedRunway, capabilities);
  const currentMode = currentUsabilityMode(input, capabilities);
  const status = usabilityStatus(currentMode, capabilities);
  const receiptBase = {
    mode: "web3-usability-status" as const,
    status,
    generated_at: generatedAt,
    source_state_as_of: input.state.market_source.fetched_at,
    current_mode: currentMode,
    usable_count: usableCount,
    gated_count: gatedCount,
    locked_count: lockedCount,
    next_gate_label: nextGate.label,
    next_gate_action: nextGate.next_action,
    summary: usabilitySummary(status, currentMode, nextGate.label),
    capabilities,
    safe_commands: [
      "npm run verify:web3 -- --base-url=http://localhost:4010",
      "npm run verify:web3 -- --base-url=http://localhost:4010 --require-dex-live",
      "npm run doctor:web3 -- --json",
      "npm run monitor:web3 -- --base-url=http://localhost:4010 --source=live-dex --json",
    ],
    live_execution_permission: "blocked" as const,
    wallet_mutation_permission: "blocked" as const,
    transaction_submission_permission: "blocked" as const,
    private_key_storage: "blocked" as const,
    seed_phrase_storage: "blocked" as const,
    secret_echo_permission: "blocked" as const,
    controls: [
      "This status receipt summarizes app usability only; it cannot sign, submit, custody funds, mutate wallets, or grant live execution.",
      "Provider keys, wallet secrets, webhook values, raw transactions, unsigned transactions, and signed payloads are never returned.",
      "Copilot and paper autonomy can be usable while dry-run orders, supervised live review, and autonomous live trading remain credential-gated.",
      "Strict verifier commands are evidence gates, not permission to trade real capital.",
    ],
  };

  return {
    ...receiptBase,
    receipt_hash: hashJson(receiptBase),
  };
}

function buildCapabilities(input: {
  state: Web3TradingState;
  launchChecklist: Web3AutonomyLaunchChecklist;
  supervisedRunway: Web3SupervisedLiveRunway;
}): Web3UsabilityCapability[] {
  const { state, launchChecklist, supervisedRunway } = input;
  const operatorInputs = launchChecklist.operator_inputs_needed;
  const findInput = (id: Web3AutonomyLaunchChecklist["operator_inputs_needed"][number]["id"]) =>
    operatorInputs.find((item) => item.id === id);
  const walletInput = findInput("dedicated-trading-wallet");
  const ownershipInput = findInput("wallet-ownership-proof");
  const jupiterInput = findInput("jupiter-route-order-key");
  const paperReady = state.autonomous_now_decision.can_auto_watch_run ||
    state.autonomous_now_decision.can_auto_paper ||
    state.autonomous_execution_runway.can_auto_paper ||
    state.paper_account.trade_count > 0;
  const dryRunReady = state.autonomous_route_refresh_execution.local_rehearsal_ready &&
    state.autonomous_execution_adapter_readiness.quote_request_ready &&
    jupiterInput?.status === "ready" &&
    walletInput?.status === "ready";
  const walletUsable = state.autonomous_wallet_telemetry.curve.length > 0 ||
    state.autonomous_wallet_telemetry.equity_usd > 0 ||
    state.paper_account.trade_count > 0;

  return [
    {
      id: "copilot",
      label: "Copilot",
      status: "usable",
      detail: `${state.autonomous_market_evidence_fusion.leader_symbol ?? "Desk"} ${state.autonomous_market_evidence_fusion.status.replaceAll("-", " ")} with ${state.autonomous_market_evidence_fusion.fusion_score}/100 fusion.`,
      next_action: state.autonomous_now_decision.next_action,
      evidence: [
        "Trading cockpit loads current Web3 state.",
        `Market source ${state.market_source.label}.`,
        `Next decision ${state.autonomous_now_decision.action.replaceAll("-", " ")}.`,
      ],
    },
    {
      id: "paper-autonomy",
      label: "Paper autonomy",
      status: paperReady ? "usable" : launchChecklist.paper_scale_permitted ? "watch" : "gated",
      detail: `${state.paper_account.trade_count} paper fills; profit accountability ${state.autonomous_profit_accountability.accountability_score}/100.`,
      next_action: paperReady ? state.autonomous_execution_runway.next_action : launchChecklist.next_action,
      evidence: [
        `Paper account mode ${state.paper_account.mode}.`,
        `Execution runway ${state.autonomous_execution_runway.status}.`,
        `Live execution ${state.execution_gate.live_execution_enabled ? "armed" : "blocked"}.`,
      ],
    },
    {
      id: "live-dex-read",
      label: "Live DEX read",
      status: state.market_source.mode === "live-dex" && state.market_source.status === "live" ? "usable" : "watch",
      detail: state.market_source.detail,
      next_action: state.market_source.mode === "live-dex" ? "Keep monitor:web3 fresh before relying on live DEX evidence." : "Switch to Live DEX read or run monitor:web3 for current market tape.",
      evidence: [
        `Source ${state.market_source.mode}.`,
        `Status ${state.market_source.status}.`,
        `Fetched ${state.market_source.fetched_at}.`,
      ],
    },
    {
      id: "wallet-net-worth",
      label: "Wallet net worth",
      status: walletUsable ? "usable" : "watch",
      detail: `${formatCompactValue(state.autonomous_wallet_telemetry.equity_usd)} equity, ${formatCompactSignedValue(state.autonomous_wallet_telemetry.window_pnl_usd)} window PnL, ${state.autonomous_wallet_telemetry.max_drawdown_pct.toFixed(1)}% drawdown.`,
      next_action: walletInput?.status === "ready" ? "Keep wallet accounting and paper equity curves fresh." : walletInput?.next_action ?? "Scope a dedicated public wallet address for live wallet accounting.",
      evidence: [
        `${state.autonomous_wallet_telemetry.curve.length} wallet curve points.`,
        `${state.autonomous_wallet_telemetry.open_position_count} open paper positions.`,
        `Wallet mutation permission blocked.`,
      ],
    },
    {
      id: "jupiter-dry-run",
      label: "Jupiter dry-run order",
      status: dryRunReady ? "usable" : "gated",
      detail: dryRunReady ? "Quote and local route rehearsal evidence are present." : jupiterDryRunDetail(jupiterInput, walletInput, ownershipInput),
      next_action: dryRunReady ? "Run strict Jupiter verifier before any supervised signer review." : jupiterInput?.status !== "ready" ? jupiterInput?.next_action ?? "Add JUPITER_API_KEY." : walletInput?.status !== "ready" ? walletInput?.next_action ?? "Scope a dedicated public wallet." : ownershipInput?.next_action ?? state.autonomous_route_refresh_execution.next_action,
      evidence: [
        `Route status ${state.autonomous_route_refresh_execution.status}.`,
        `Quote request ${state.autonomous_execution_adapter_readiness.quote_request_ready ? "ready" : "gated"}.`,
        `Local rehearsal ${state.autonomous_route_refresh_execution.local_rehearsal_ready ? "ready" : "missing"}.`,
      ],
    },
    {
      id: "supervised-live",
      label: "Supervised live review",
      status: supervisedRunway.can_request_live_review ? "watch" : "gated",
      detail: `${supervisedRunway.ready_lane_count}/${supervisedRunway.total_lane_count} supervised-live lanes ready.`,
      next_action: supervisedRunway.next_action,
      evidence: supervisedRunway.lanes.map((lane) => `${lane.label}: ${lane.status}`).slice(0, 8),
    },
    {
      id: "autonomous-live",
      label: "Autonomous live trading",
      status: "locked",
      detail: "Real-capital autonomous execution is intentionally locked inside the app.",
      next_action: state.autonomous_live_autonomy_readiness.blockers[0] ?? "Complete signer, risk, settlement, production-worker, and manual live review outside this app boundary.",
      evidence: [
        `Can run unattended: ${state.autonomous_live_autonomy_readiness.can_run_unattended ? "yes" : "no"}.`,
        `Can trade real capital: ${state.autonomous_live_autonomy_readiness.can_trade_real_capital ? "yes" : "no"}.`,
        "Transaction submission blocked.",
      ],
    },
  ];
}

function nextUsabilityGate(
  launchChecklist: Web3AutonomyLaunchChecklist,
  supervisedRunway: Web3SupervisedLiveRunway,
  capabilities: Web3UsabilityCapability[],
) {
  if (launchChecklist.next_operator_action) {
    return {
      label: launchChecklist.next_operator_action.label,
      next_action: launchChecklist.next_operator_action.next_action,
    };
  }
  const gated = capabilities.find((capability) => capability.status === "gated");
  if (gated) return { label: gated.label, next_action: gated.next_action };
  return {
    label: "Manual live review",
    next_action: supervisedRunway.next_action,
  };
}

function currentUsabilityMode(
  input: {
    launchChecklist: Web3AutonomyLaunchChecklist;
    supervisedRunway: Web3SupervisedLiveRunway;
  },
  capabilities: Web3UsabilityCapability[],
): Web3UsabilityStatusReceipt["current_mode"] {
  const dryRun = capabilities.find((capability) => capability.id === "jupiter-dry-run");
  const paper = capabilities.find((capability) => capability.id === "paper-autonomy");
  if (input.supervisedRunway.can_request_live_review || input.launchChecklist.live_review_permitted) return "supervised-live-review";
  if (dryRun?.status === "usable") return "dry-run-rehearsal";
  if (paper?.status === "usable" || paper?.status === "watch") return "paper-autonomy";
  return "copilot";
}

function usabilityStatus(
  currentMode: Web3UsabilityStatusReceipt["current_mode"],
  capabilities: Web3UsabilityCapability[],
): Web3UsabilityStatus {
  if (currentMode === "autonomous-live") return "autonomous-live-locked";
  if (currentMode === "supervised-live-review") return "supervised-live-gated";
  if (capabilities.find((capability) => capability.id === "jupiter-dry-run")?.status !== "usable") return "dry-run-gated";
  return "paper-usable";
}

function usabilitySummary(
  status: Web3UsabilityStatus,
  currentMode: Web3UsabilityStatusReceipt["current_mode"],
  nextGateLabel: string,
) {
  if (status === "paper-usable") return `Mastermind is usable for ${currentMode.replaceAll("-", " ")} while live execution remains blocked; next gate is ${nextGateLabel}.`;
  if (status === "dry-run-gated") return `Mastermind is usable for copilot and paper autonomy, but dry-run order evidence is still gated by ${nextGateLabel}.`;
  if (status === "supervised-live-gated") return `Mastermind can assemble supervised-live review evidence, but real-capital execution remains blocked; next gate is ${nextGateLabel}.`;
  return `Autonomous live trading remains locked; next gate is ${nextGateLabel}.`;
}

function jupiterDryRunDetail(
  jupiterInput: Web3AutonomyLaunchChecklist["operator_inputs_needed"][number] | undefined,
  walletInput: Web3AutonomyLaunchChecklist["operator_inputs_needed"][number] | undefined,
  ownershipInput: Web3AutonomyLaunchChecklist["operator_inputs_needed"][number] | undefined,
) {
  if (jupiterInput?.status !== "ready") return "Jupiter order rehearsal still needs a Jupiter route/order key.";
  if (walletInput?.status !== "ready") return "Jupiter order rehearsal still needs a dedicated public trading wallet.";
  if (ownershipInput?.status !== "ready") return "Jupiter order rehearsal still needs hash-only wallet ownership proof.";
  return "Jupiter order rehearsal still needs fresh route/order proof.";
}

function formatCompactValue(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

function formatCompactSignedValue(value: number) {
  const prefix = value >= 0 ? "+" : "-";
  return `${prefix}${formatCompactValue(Math.abs(value))}`;
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
