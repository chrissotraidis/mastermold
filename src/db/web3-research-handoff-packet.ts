import { createHash } from "node:crypto";
import type { Web3CutoverBlockerBoard } from "./web3-cutover-blocker-board";
import type { Web3LiveCapitalPreflightReceipt } from "./web3-live-capital-preflight";
import type { Web3ManualLiveReviewPacket } from "./web3-manual-live-review-packet";
import type { Web3OperatorCredentialHandoffReceipt } from "./web3-operator-credential-handoff";
import type { Web3OperatorRequestPacket } from "./web3-operator-request-packet";
import type { Web3OperatorRunbookReceipt } from "./web3-operator-runbook";
import type { Web3SupervisedLiveRunway } from "./web3-supervised-live-runway";
import type { Web3TradingState } from "./web3-trading";
import type { Web3UsabilityStatusReceipt } from "./web3-usability-status";

const CANONICAL_LIVE_CANARY_SURFACE = "/trading?source=live-dex&account=persistent&scenario=breakout#web3-live-canary-console";

export type Web3ResearchQuestion = {
  id:
    | "custody-architecture"
    | "provider-stack"
    | "moonshot-data-sources"
    | "latency-budget"
    | "first-live-mode"
    | "compliance-boundaries"
    | "risk-gates"
    | "settlement-accounting"
    | "credential-storage"
    | "go-live-checklist"
    | "cockpit-dashboard"
    | "profit-proof";
  priority: "now" | "before-live" | "strategy-review";
  category: "custody" | "market-data" | "execution" | "legal" | "risk" | "ops" | "product" | "proof";
  question: string;
  why_it_matters: string;
  expected_answer_format: string;
};

export type Web3CredentialRequirement = {
  id:
    | "dedicated-public-wallet"
    | "wallet-ownership-proof"
    | "read-provider-rail"
    | "jupiter-order-rail"
    | "first-canary-live-flags"
    | "signer-policy"
    | "ops-emergency-stop"
    | "accounting-ledger"
    | "risk-policy"
    | "manual-live-review";
  label: string;
  owner: "operator" | "security" | "ops" | "accounting" | "strategy" | "manual-review";
  priority: "needed-now" | "before-live" | "external-review";
  safe_value_type: string;
  safe_collection_surface: string;
  storage_rule: string;
  target_names: string[];
  research_question_ids: Web3ResearchQuestion["id"][];
  completion_signal: string;
  next_action: string;
  blocks_live_capital: boolean;
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  secret_echo_permission: "blocked";
};

export type Web3ResearchHandoffPacket = {
  mode: "web3-research-handoff-packet";
  status: "research-needed" | "ready-for-operator-input" | "ready-for-external-review";
  generated_at: string;
  receipt_hash: string;
  source: Web3TradingState["market_source"]["mode"];
  account: Web3TradingState["paper_account"]["mode"];
  scenario: Web3TradingState["scenario"];
  summary: string;
  app_state: {
    usability_status: Web3UsabilityStatusReceipt["status"];
    runbook_status: Web3OperatorRunbookReceipt["status"];
    cutover_status: Web3CutoverBlockerBoard["status"];
    manual_review_status: Web3ManualLiveReviewPacket["status"];
    live_preflight_status: Web3LiveCapitalPreflightReceipt["status"];
    supervised_runway_status: Web3SupervisedLiveRunway["status"];
    paper_equity_usd: number;
    paper_window_pnl_usd: number;
    launch_readiness_score: number;
    ready_credential_lanes: number;
    total_credential_lanes: number;
  };
  current_capabilities: string[];
  next_unlock_step: Web3UsabilityStatusReceipt["operator_unlock_sequence"][number] | null;
  operator_unlock_sequence: Web3UsabilityStatusReceipt["operator_unlock_sequence"];
  live_usability: Web3OperatorRequestPacket["live_usability"];
  current_input: Web3OperatorRequestPacket["current_input"];
  open_operator_inputs: Array<{
    id: Web3OperatorRequestPacket["required_inputs"][number]["id"];
    label: string;
    priority: Web3OperatorRequestPacket["required_inputs"][number]["priority"];
    storage: Web3OperatorRequestPacket["required_inputs"][number]["storage"];
    safe_collection_surface: Web3OperatorRequestPacket["required_inputs"][number]["safe_collection_surface"];
    env_targets: string[];
    next_action: string;
  }>;
  live_capital_blockers: Array<{
    id: Web3LiveCapitalPreflightReceipt["gates"][number]["id"];
    label: string;
    status: Web3LiveCapitalPreflightReceipt["gates"][number]["status"];
    next_action: string;
  }>;
  credential_requirements: Web3CredentialRequirement[];
  research_questions: Web3ResearchQuestion[];
  safe_to_share: string[];
  never_provide: string[];
  source_endpoints: string[];
  safe_export_commands: string[];
  verifier_commands: string[];
  text_packet: string;
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  transaction_submission_permission: "blocked";
  private_key_storage: "blocked";
  seed_phrase_storage: "blocked";
  secret_echo_permission: "blocked";
  controls: string[];
};

export type Web3ResearchHandoffHealth = {
  mode: "web3-research-handoff-health";
  status: Web3ResearchHandoffPacket["status"];
  generated_at: string;
  receipt_hash: string;
  source: Web3ResearchHandoffPacket["source"];
  account: Web3ResearchHandoffPacket["account"];
  scenario: Web3ResearchHandoffPacket["scenario"];
  question_count: number;
  now_question_count: number;
  before_live_question_count: number;
  strategy_review_question_count: number;
  open_operator_input_count: number;
  live_capital_blocker_count: number;
  credential_requirement_count: number;
  needed_now_requirement_count: number;
  current_input: Web3OperatorRequestPacket["current_input"];
  next_question: string;
  next_operator_input: string;
  next_unlock_step_label: string | null;
  next_unlock_step_action: string | null;
  source_endpoint: string;
  live_review_source_endpoint: string;
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  transaction_submission_permission: "blocked";
  private_key_storage: "blocked";
  seed_phrase_storage: "blocked";
  secret_echo_permission: "blocked";
};

export function buildWeb3ResearchHandoffPacket(input: {
  state: Web3TradingState;
  usability: Web3UsabilityStatusReceipt;
  handoff: Web3OperatorCredentialHandoffReceipt;
  requestPacket: Web3OperatorRequestPacket;
  cutover: Web3CutoverBlockerBoard;
  runbook: Web3OperatorRunbookReceipt;
  preflight: Web3LiveCapitalPreflightReceipt;
  runway: Web3SupervisedLiveRunway;
  manualLiveReview: Web3ManualLiveReviewPacket;
  now?: Date;
}): Web3ResearchHandoffPacket {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const openOperatorInputs = input.requestPacket.required_inputs.slice(0, 12).map((item) => ({
    id: item.id,
    label: item.label,
    priority: item.priority,
    storage: item.storage,
    safe_collection_surface: item.safe_collection_surface,
    env_targets: item.env_targets,
    next_action: item.next_action,
  }));
  const liveCapitalBlockers = input.preflight.gates
    .filter((gate) => gate.blocks_live_capital && gate.status !== "pass")
    .map((gate) => ({
      id: gate.id,
      label: gate.label,
      status: gate.status,
      next_action: gate.next_action,
    }));
  const researchQuestions = buildResearchQuestions();
  const credentialRequirements = buildCredentialRequirements(input.requestPacket, researchQuestions);
  const nextUnlockStep = input.usability.operator_unlock_sequence.find((step) => step.status !== "ready") ??
    input.usability.operator_unlock_sequence[input.usability.operator_unlock_sequence.length - 1] ??
    null;
  const status: Web3ResearchHandoffPacket["status"] = input.manualLiveReview.can_request_external_review
    ? "ready-for-external-review"
    : openOperatorInputs.length > 0
      ? "ready-for-operator-input"
      : "research-needed";
  const currentCapabilities = [
    `${input.usability.usable_count} usable Web3 capability lane${input.usability.usable_count === 1 ? "" : "s"}; ${input.usability.gated_count} gated and ${input.usability.locked_count} locked.`,
    `Paper wallet telemetry is available with equity $${input.state.autonomous_wallet_telemetry.equity_usd.toFixed(2)} and window PnL $${input.state.autonomous_wallet_telemetry.window_pnl_usd.toFixed(2)}.`,
    `Operator runbook has ${input.runbook.allowed_now_count} safe action${input.runbook.allowed_now_count === 1 ? "" : "s"} available now.`,
    `Cutover board has ${input.cutover.open_blocker_count} open blocker${input.cutover.open_blocker_count === 1 ? "" : "s"} across operator, security, ops, accounting, and review owners.`,
    `Manual live review is ${input.manualLiveReview.status.replaceAll("-", " ")} with ${input.manualLiveReview.passed_signoff_count}/${input.manualLiveReview.required_signoff_count} signoffs passing.`,
    input.requestPacket.live_usability
      ? `Live-usability summary shows ${input.requestPacket.live_usability.real_capital_blocker_count} real-money blocker${input.requestPacket.live_usability.real_capital_blocker_count === 1 ? "" : "s"} with ${input.requestPacket.live_usability.listed_live_usability_row_count}/${input.requestPacket.live_usability.total_live_usability_row_count} rows listed.`
      : "Live-usability summary is not attached; load the blocker endpoint before external research.",
  ];
  const verifierCommands = Array.from(new Set([
    ...input.requestPacket.verifier_commands,
    ...input.runbook.verifier_commands,
    ...input.runway.safe_commands,
    "npm run verify:web3 -- --base-url=http://localhost:4010 --wallet=<public-solana-address> --require-operator-wallet --require-jupiter-order --require-dex-live --require-live-canary",
  ])).slice(0, 10);
  const packetBase = {
    mode: "web3-research-handoff-packet" as const,
    status,
    generated_at: generatedAt,
    source: input.state.market_source.mode,
    account: input.state.paper_account.mode,
    scenario: input.state.scenario,
    summary: researchHandoffSummary(status, openOperatorInputs.length, liveCapitalBlockers.length, researchQuestions.length),
    app_state: {
      usability_status: input.usability.status,
      runbook_status: input.runbook.status,
      cutover_status: input.cutover.status,
      manual_review_status: input.manualLiveReview.status,
      live_preflight_status: input.preflight.status,
      supervised_runway_status: input.runway.status,
      paper_equity_usd: input.state.autonomous_wallet_telemetry.equity_usd,
      paper_window_pnl_usd: input.state.autonomous_wallet_telemetry.window_pnl_usd,
      launch_readiness_score: input.manualLiveReview.launch_readiness_score,
      ready_credential_lanes: input.handoff.ready_count,
      total_credential_lanes: input.handoff.inputs.length,
    },
    current_capabilities: currentCapabilities,
    next_unlock_step: nextUnlockStep,
    operator_unlock_sequence: input.usability.operator_unlock_sequence,
    live_usability: input.requestPacket.live_usability,
    current_input: input.requestPacket.current_input,
    open_operator_inputs: openOperatorInputs,
    live_capital_blockers: liveCapitalBlockers,
    credential_requirements: credentialRequirements,
    research_questions: researchQuestions,
    safe_to_share: [
      ...input.requestPacket.safe_to_provide,
      "Exact first-canary live flag values for ignored local env: MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION=true, MASTERMOLD_LIVE_OPERATOR_APPROVAL=I_UNDERSTAND_REAL_FUNDS, MASTERMOLD_ALLOW_LIVE_UNSIGNED_CANARY_HANDOFF=true",
    ],
    never_provide: input.requestPacket.never_provide,
    source_endpoints: [
      "/api/web3-research-handoff-packet?source=live-dex&account=persistent",
      "/api/web3-credential-requirements?source=live-dex&account=persistent",
      "/api/web3-operator-request-packet?source=live-dex&account=persistent",
      "/api/web3-operator-runbook?source=live-dex&account=persistent",
      "/api/web3-cutover-blocker-board?source=live-dex&account=persistent",
      "/api/web3-live-capital-preflight?source=live-dex&account=persistent",
      "/api/web3-manual-live-review-packet?source=live-dex&account=persistent",
      "/api/web3-usability-status?source=live-dex&account=persistent",
    ],
    safe_export_commands: [
      "npm run --silent research:web3 -- --base-url=http://localhost:4010",
      "npm run --silent research:web3 -- --base-url=http://localhost:4010 --json",
      "npm run --silent requirements:web3 -- --base-url=http://localhost:4010",
      "npm run --silent requirements:web3 -- --base-url=http://localhost:4010 --json",
    ],
    verifier_commands: verifierCommands,
    live_execution_permission: "blocked" as const,
    wallet_mutation_permission: "blocked" as const,
    transaction_submission_permission: "blocked" as const,
    private_key_storage: "blocked" as const,
    seed_phrase_storage: "blocked" as const,
    secret_echo_permission: "blocked" as const,
    controls: [
      "This packet is safe to share with a research/helper agent because it contains status, target names, and questions only.",
      "It does not include configured secret values, raw wallet holdings, raw transactions, signed payloads, private keys, seed phrases, or wallet authority.",
      "Research answers can inform provider/custody/ops decisions, but they do not unlock live execution inside Mastermind.",
      "Live trading remains blocked until dedicated wallet, signer/custody, settlement/accounting, profit proof, production ops, emergency stop, and manual review gates are complete.",
    ],
  };
  const textPacket = renderResearchHandoffText(packetBase);
  const receiptBase = {
    ...packetBase,
    text_packet: textPacket,
  };

  return {
    ...receiptBase,
    receipt_hash: hashJson(receiptBase),
  };
}

export function buildWeb3ResearchHandoffHealth(packet: Web3ResearchHandoffPacket): Web3ResearchHandoffHealth {
  const nowQuestions = packet.research_questions.filter((question) => question.priority === "now");
  const beforeLiveQuestions = packet.research_questions.filter((question) => question.priority === "before-live");
  const strategyReviewQuestions = packet.research_questions.filter((question) => question.priority === "strategy-review");
  const firstQuestion = nowQuestions[0] ?? beforeLiveQuestions[0] ?? strategyReviewQuestions[0];
  return {
    mode: "web3-research-handoff-health",
    status: packet.status,
    generated_at: packet.generated_at,
    receipt_hash: packet.receipt_hash,
    source: packet.source,
    account: packet.account,
    scenario: packet.scenario,
    question_count: packet.research_questions.length,
    now_question_count: nowQuestions.length,
    before_live_question_count: beforeLiveQuestions.length,
    strategy_review_question_count: strategyReviewQuestions.length,
    open_operator_input_count: packet.open_operator_inputs.length,
    live_capital_blocker_count: packet.live_capital_blockers.length,
    credential_requirement_count: packet.credential_requirements.length,
    needed_now_requirement_count: packet.credential_requirements.filter((item) => item.priority === "needed-now").length,
    current_input: packet.current_input,
    next_question: firstQuestion?.question ?? "No research questions are open.",
    next_operator_input: packet.open_operator_inputs[0]?.next_action ?? "No required operator input is open.",
    next_unlock_step_label: packet.next_unlock_step?.label ?? null,
    next_unlock_step_action: packet.next_unlock_step?.next_action ?? null,
    source_endpoint: `/api/web3-research-handoff-packet?source=${packet.source}&account=${packet.account}&scenario=${packet.scenario}&cycles=0`,
    live_review_source_endpoint: "/api/web3-research-handoff-packet?source=live-dex&account=persistent&scenario=breakout&cycles=0",
    live_execution_permission: "blocked",
    wallet_mutation_permission: "blocked",
    transaction_submission_permission: "blocked",
    private_key_storage: "blocked",
    seed_phrase_storage: "blocked",
    secret_echo_permission: "blocked",
  };
}

function buildCredentialRequirements(
  requestPacket: Web3OperatorRequestPacket,
  researchQuestions: Web3ResearchQuestion[],
): Web3CredentialRequirement[] {
  const questionIds = new Set(researchQuestions.map((question) => question.id));
  const currentInput = requestPacket.current_input;
  const openInputById = new Map<string, Web3OperatorRequestPacket["required_inputs"][number]>(
    requestPacket.required_inputs.map((input) => [input.id, input]),
  );
  const targetNames = (id: string, fallback: string[]) => {
    const targets = openInputById.get(id)?.env_targets ?? [];
    return targets.length > 0 ? targets : fallback;
  };
  const walletOwnershipIsCurrent = currentInput?.id === "wallet-ownership-proof";
  const currentAction = currentInput?.id === "dedicated-trading-wallet"
    ? currentInput.next_action
    : walletOwnershipIsCurrent
      ? "A dedicated public wallet is scoped; keep it isolated and prove control with the browser wallet text-only challenge."
      : "Save a dedicated public Solana trading wallet address in the Trading live canary console; do not paste private keys or seed phrases.";
  const walletOwnershipTargetNames = walletOwnershipIsCurrent && currentInput.target_names.length > 0
    ? currentInput.target_names
    : ["wallet_public_key", "wallet_ownership_signature_hash"];
  const walletOwnershipSurface = walletOwnershipIsCurrent
    ? CANONICAL_LIVE_CANARY_SURFACE
    : CANONICAL_LIVE_CANARY_SURFACE;
  const walletOwnershipAction = walletOwnershipIsCurrent
    ? currentInput.next_action
    : "Connect the browser wallet only for a public-address prompt, then sign the app's text-only ownership message.";
  const linkedQuestions = (...ids: Web3ResearchQuestion["id"][]) => ids.filter((id) => questionIds.has(id));

  return [
    {
      id: "dedicated-public-wallet",
      label: "Dedicated public wallet",
      owner: "operator",
      priority: walletOwnershipIsCurrent ? "before-live" : "needed-now",
      safe_value_type: "Public Solana wallet address only",
      safe_collection_surface: CANONICAL_LIVE_CANARY_SURFACE,
      storage_rule: "browser-public-scope",
      target_names: ["wallet_public_key"],
      research_question_ids: linkedQuestions("credential-storage", "custody-architecture"),
      completion_signal: "Strict operator-wallet verifier passes with --require-operator-wallet and the sample all-ones wallet is rejected.",
      next_action: currentAction,
      blocks_live_capital: true,
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
      secret_echo_permission: "blocked",
    },
    {
      id: "wallet-ownership-proof",
      label: "Wallet ownership proof",
      owner: "operator",
      priority: "needed-now",
      safe_value_type: "Text-message signature receipt with hashes only",
      safe_collection_surface: walletOwnershipSurface,
      storage_rule: "hash-only-local-receipt",
      target_names: walletOwnershipTargetNames,
      research_question_ids: linkedQuestions("custody-architecture", "credential-storage"),
      completion_signal: "Wallet proof receipt stores challenge/signature hashes only and transaction signing stays blocked.",
      next_action: walletOwnershipAction,
      blocks_live_capital: true,
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
      secret_echo_permission: "blocked",
    },
    {
      id: "read-provider-rail",
      label: "Read provider rail",
      owner: "operator",
      priority: "needed-now",
      safe_value_type: "Helius API key or Solana RPC/WebSocket target",
      safe_collection_surface: "/settings/integrations#settings-web3-credentials-runway",
      storage_rule: "ignored-server-env-or-session-only-test",
      target_names: targetNames("provider-read-rail", ["HELIUS_API_KEY", "SOLANA_RPC_URL", "SOLANA_WS_URL"]),
      research_question_ids: linkedQuestions("provider-stack", "moonshot-data-sources", "credential-storage"),
      completion_signal: "Credential test or doctor receipt reports read-provider rail evidence without echoing the key or endpoint secret.",
      next_action: "Configure Helius/Solana read targets locally or run a session-only provider test from Settings.",
      blocks_live_capital: true,
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
      secret_echo_permission: "blocked",
    },
    {
      id: "jupiter-order-rail",
      label: "Jupiter order rail",
      owner: "operator",
      priority: "needed-now",
      safe_value_type: "Jupiter API key for quote/order rehearsal; server env is required for funded canary unsigned handoff",
      safe_collection_surface: "/settings/integrations#settings-web3-credentials-runway",
      storage_rule: "ignored-server-env-or-session-only-test",
      target_names: targetNames("jupiter-route-order-key", ["JUPITER_API_KEY"]),
      research_question_ids: linkedQuestions("provider-stack", "latency-budget", "credential-storage"),
      completion_signal: "Jupiter rehearsal records quote and unsigned-order readiness while withholding transaction bytes; funded canary handoff requires JUPITER_API_KEY in ignored server env.",
      next_action: "Install JUPITER_API_KEY through ignored local env for the funded canary; one-shot Settings rehearsal is evidence only, then run the strict order verifier.",
      blocks_live_capital: true,
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
      secret_echo_permission: "blocked",
    },
    {
      id: "first-canary-live-flags",
      label: "First canary live flags",
      owner: "operator",
      priority: "needed-now",
      safe_value_type: "Reviewed tiny-canary env flag values only",
      safe_collection_surface: "/settings/integrations#settings-web3-first-canary-live-flags",
      storage_rule: "ignored-server-env-exact-values-only",
      target_names: [
        "MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION",
        "MASTERMOLD_LIVE_OPERATOR_APPROVAL",
        "MASTERMOLD_ALLOW_LIVE_UNSIGNED_CANARY_HANDOFF",
      ],
      research_question_ids: linkedQuestions("first-live-mode", "risk-gates", "go-live-checklist", "compliance-boundaries"),
      completion_signal: "Ignored server env contains exactly true, I_UNDERSTAND_REAL_FUNDS, and true for the tiny unsigned canary handoff; signing and submission still require separate wallet proof and relay gates.",
      next_action: "Set the three exact first-canary live flags in ignored local env only after wallet ownership and Jupiter order proof are ready, then rerun the strict wallet/order verifier.",
      blocks_live_capital: true,
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
      secret_echo_permission: "blocked",
    },
    {
      id: "signer-policy",
      label: "Signer and custody policy",
      owner: "security",
      priority: "before-live",
      safe_value_type: "Signer provider mode, policy ids, and external custody decision",
      safe_collection_surface: "external-review-plus-ignored-env-targets",
      storage_rule: "provider-vault-or-external-wallet-only",
      target_names: [
        "MASTERMOLD_AUTONOMOUS_SIGNER_PROVIDER",
        "PRIVY_APP_ID",
        "PRIVY_SOLANA_WALLET_ID",
        "TURNKEY_ORGANIZATION_ID",
        "TURNKEY_SOLANA_WALLET_ACCOUNT",
        "MASTERMOLD_SESSION_POLICY_HASH",
      ],
      research_question_ids: linkedQuestions("custody-architecture", "first-live-mode", "risk-gates", "credential-storage"),
      completion_signal: "Signer packet shows provider choice and policy evidence, while wallet private keys, seed phrases, and raw/signed transactions remain absent.",
      next_action: "Choose manual external wallet, Privy, Turnkey, or reviewed session-key policy before any supervised live request.",
      blocks_live_capital: true,
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
      secret_echo_permission: "blocked",
    },
    {
      id: "ops-emergency-stop",
      label: "Ops and emergency stop",
      owner: "ops",
      priority: "before-live",
      safe_value_type: "Emergency contact/webhook target plus worker owner/process/restart targets",
      safe_collection_surface: "/settings/integrations#settings-web3-credentials-runway",
      storage_rule: "ignored-server-env-target-names",
      target_names: [
        "MASTERMOLD_EMERGENCY_STOP_WEBHOOK_URL",
        "MASTERMOLD_EMERGENCY_STOP_CONTACT",
        "MASTERMOLD_WEB3_PROCESS_MANAGER",
        "MASTERMOLD_WEB3_WORKER_OWNER",
        "MASTERMOLD_WEB3_ALERT_WEBHOOK_URL",
        "MASTERMOLD_WEB3_RESTART_POLICY_URL",
      ],
      research_question_ids: linkedQuestions("go-live-checklist", "latency-budget", "compliance-boundaries"),
      completion_signal: "Live-ops packet reports emergency-stop and production-worker review targets without dispatching webhooks or starting workers.",
      next_action: "Name the emergency-stop and production-worker review targets, then refresh live ops/preflight receipts.",
      blocks_live_capital: true,
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
      secret_echo_permission: "blocked",
    },
    {
      id: "accounting-ledger",
      label: "Accounting ledger",
      owner: "accounting",
      priority: "before-live",
      safe_value_type: "Tax/export target and settlement reconciliation policy",
      safe_collection_surface: "/settings/integrations#settings-web3-credentials-runway",
      storage_rule: "ignored-server-env-target-name-or-external-review",
      target_names: targetNames("accounting-export-target", ["MASTERMOLD_TAX_LEDGER_EXPORT_PATH"]),
      research_question_ids: linkedQuestions("settlement-accounting", "go-live-checklist"),
      completion_signal: "Accounting ledger receipt proves redacted settlement/export readiness without wallet mutation.",
      next_action: "Set the accounting/export target or document the external ledger workflow before real-capital review.",
      blocks_live_capital: true,
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
      secret_echo_permission: "blocked",
    },
    {
      id: "risk-policy",
      label: "Risk policy",
      owner: "strategy",
      priority: "before-live",
      safe_value_type: "Trade caps, daily cap, slippage cap, drawdown brake, and token-entry rules",
      safe_collection_surface: "/settings/integrations#settings-web3-credentials-runway",
      storage_rule: "dry-run-policy-and-external-review",
      target_names: ["max_trade_usd", "daily_spend_cap_usd", "max_slippage_bps", "risk_policy_review"],
      research_question_ids: linkedQuestions("risk-gates", "profit-proof", "go-live-checklist"),
      completion_signal: "Live-capital preflight reports risk gates as pass/watch with manual live review still required.",
      next_action: "Confirm the numeric risk caps and hard blockers for slippage, liquidity, holder concentration, authority risk, quote age, and kill switch.",
      blocks_live_capital: true,
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
      secret_echo_permission: "blocked",
    },
    {
      id: "manual-live-review",
      label: "Manual live review",
      owner: "manual-review",
      priority: "external-review",
      safe_value_type: "External approval decision after wallet, provider, signer, ops, accounting, and profit-proof gates pass",
      safe_collection_surface: "external-review",
      storage_rule: "external-approval-record-only",
      target_names: ["MASTERMOLD_LIVE_OPERATOR_APPROVAL"],
      research_question_ids: linkedQuestions("first-live-mode", "compliance-boundaries", "profit-proof", "go-live-checklist"),
      completion_signal: "Manual live-review packet reports all required signoffs passing; in-app autonomous live authority remains blocked until a separate executor exists.",
      next_action: "Request external review only after the strict wallet, Jupiter, live DEX, funded canary, signer, ops, accounting, and proof gates pass.",
      blocks_live_capital: true,
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
      secret_echo_permission: "blocked",
    },
  ];
}

function buildResearchQuestions(): Web3ResearchQuestion[] {
  return [
    {
      id: "custody-architecture",
      priority: "now",
      category: "custody",
      question: "What is the safest Solana custody architecture for autonomous memecoin trading when Mastermind must never store wallet private keys or seed phrases?",
      why_it_matters: "Signer choice determines whether the app can graduate from paper/order rehearsal to supervised live review without taking custody.",
      expected_answer_format: "Compare manual external wallet, Privy, Turnkey, session-key vault, multisig, and policy-wallet options with recommended first-live path.",
    },
    {
      id: "provider-stack",
      priority: "now",
      category: "market-data",
      question: "Which 2026 Solana provider stack should Mastermind use for wallet reads, launch discovery, DEX liquidity, OHLCV, route proof, and low-latency feeds?",
      why_it_matters: "The app needs current provider choices before live DEX reads, wallet accounting, and route/order rehearsal can be trusted.",
      expected_answer_format: "Rank Helius, Jupiter, Birdeye, DEX Screener, GeckoTerminal, Pump.fun/Raydium/Meteora feeds, and Yellowstone/gRPC by role, latency, cost, and reliability.",
    },
    {
      id: "moonshot-data-sources",
      priority: "now",
      category: "market-data",
      question: "What public or paid sources best reproduce Moonshot-style trending coin discovery, launch detection, promotion detection, holder flow, and rug-risk evidence?",
      why_it_matters: "The trading loop needs high-signal noise filtering before it can safely chase fast memecoin moves.",
      expected_answer_format: "List sources, endpoints or products, rate limits, freshness, trust caveats, and which app module each source should feed.",
    },
    {
      id: "latency-budget",
      priority: "before-live",
      category: "execution",
      question: "What latency budget is acceptable for this strategy across discovery, quote refresh, signing, submission, confirmation, and exit protection?",
      why_it_matters: "Memecoin trades decay quickly; the app needs a concrete threshold for when to refresh, resize, or stand down.",
      expected_answer_format: "Provide target and maximum milliseconds/seconds per stage, plus failure actions when data is stale.",
    },
    {
      id: "first-live-mode",
      priority: "before-live",
      category: "execution",
      question: "What should the first real-money mode be: read-only copilot, manual approve every trade, supervised live with strict caps, or policy-wallet autonomy?",
      why_it_matters: "This defines the narrowest safe live milestone and prevents jumping directly from paper autonomy to unrestricted live trading.",
      expected_answer_format: "Recommend one staged launch path with prerequisites, operator actions, and rollback rules.",
    },
    {
      id: "compliance-boundaries",
      priority: "strategy-review",
      category: "legal",
      question: "What legal, compliance, and disclosure boundaries are required for an app that autonomously trades crypto/memecoins for profit?",
      why_it_matters: "The app must not present unsafe or misleading live-trading capability, especially if it is ever multi-user.",
      expected_answer_format: "Summarize required warnings, user-scope assumptions, prohibited claims, jurisdiction concerns, and recommended product copy boundaries.",
    },
    {
      id: "risk-gates",
      priority: "now",
      category: "risk",
      question: "What exact risk gates should block or resize live Solana memecoin trades before signing?",
      why_it_matters: "The paper loop already has many gates; live review needs a minimal, auditable list of hard stop conditions.",
      expected_answer_format: "Give thresholds for trade size, daily cap, drawdown, slippage, liquidity, holder concentration, authority risk, token age, MEV, stale quote, and kill switch.",
    },
    {
      id: "settlement-accounting",
      priority: "before-live",
      category: "ops",
      question: "What settlement and accounting evidence is required to trust real PnL for Solana swaps?",
      why_it_matters: "The app must reconcile signatures, confirmations, token deltas, fees, slippage, and tax lots before live results are trusted.",
      expected_answer_format: "Define confirmation polling, getTransaction parsing, token balance delta logic, price source, fee accounting, idempotency, and export format.",
    },
    {
      id: "credential-storage",
      priority: "now",
      category: "custody",
      question: "Which credentials may be entered in Settings, which must remain server env only, and which must never be accepted anywhere?",
      why_it_matters: "The credential UI needs a final security contract before broader use.",
      expected_answer_format: "Return a table of credential names, allowed surface, storage rule, redaction rule, verifier, and never-store rationale.",
    },
    {
      id: "go-live-checklist",
      priority: "before-live",
      category: "ops",
      question: "What concrete go-live checklist should be required before even one real trade can be reviewed?",
      why_it_matters: "Manual live review needs objective gates rather than vibes.",
      expected_answer_format: "Provide an ordered checklist with pass/fail evidence and owner for operator, security, ops, accounting, and strategy review.",
    },
    {
      id: "cockpit-dashboard",
      priority: "strategy-review",
      category: "product",
      question: "Which charts and dashboard elements are essential for a non-technical Web3 Autopilot cockpit?",
      why_it_matters: "The UI still has deep diagnostics; the primary operator needs fewer, clearer decisions.",
      expected_answer_format: "Recommend first-screen panels, charts, interaction flow, alert hierarchy, and which diagnostics should be collapsed.",
    },
    {
      id: "profit-proof",
      priority: "before-live",
      category: "proof",
      question: "What objective proof should count as enough paper profitability before risking real capital?",
      why_it_matters: "The goal is to make money, but live execution should wait for durable out-of-sample paper evidence.",
      expected_answer_format: "Define run count, regimes, hit rate, profit factor, drawdown limit, slippage assumptions, out-of-sample windows, and promotion threshold.",
    },
  ];
}

function researchHandoffSummary(
  status: Web3ResearchHandoffPacket["status"],
  openInputs: number,
  blockers: number,
  questions: number,
) {
  if (status === "ready-for-external-review") {
    return `Research packet is ready for external review with ${questions} unresolved research question${questions === 1 ? "" : "s"} and live authority still blocked.`;
  }
  if (openInputs > 0) {
    return `Research packet is ready to share; ${openInputs} operator input${openInputs === 1 ? "" : "s"} and ${blockers} live blocker${blockers === 1 ? "" : "s"} remain before supervised trading review.`;
  }
  return `Research packet is ready to share; ${questions} architecture, provider, risk, ops, product, and proof question${questions === 1 ? "" : "s"} still need answers.`;
}

function renderResearchHandoffText(packet: Omit<Web3ResearchHandoffPacket, "receipt_hash" | "text_packet">) {
  const openInputs = packet.open_operator_inputs.length > 0
    ? packet.open_operator_inputs.map((input) => [
      `- ${input.label}`,
      `  Priority: ${input.priority}`,
      `  Storage: ${input.storage}`,
      `  Surface: ${input.safe_collection_surface}`,
      input.env_targets.length ? `  Target names: ${input.env_targets.join(", ")}` : null,
      `  Next action: ${input.next_action}`,
    ].filter(Boolean).join("\n")).join("\n")
    : "- No required operator inputs are open.";
  const blockers = packet.live_capital_blockers.length > 0
    ? packet.live_capital_blockers.map((blocker) => `- ${blocker.label}: ${blocker.status}; ${blocker.next_action}`).join("\n")
    : "- No live-capital blockers are open in this receipt; external review is still required.";
  const questions = packet.research_questions.map((question) => [
    `- ${question.question}`,
    `  Category: ${question.category}`,
    `  Priority: ${question.priority}`,
    `  Why: ${question.why_it_matters}`,
    `  Answer format: ${question.expected_answer_format}`,
  ].join("\n")).join("\n");
  const credentialRequirements = packet.credential_requirements.map((requirement) => [
    `- ${requirement.label}`,
    `  Owner: ${requirement.owner}`,
    `  Priority: ${requirement.priority}`,
    `  Safe value: ${requirement.safe_value_type}`,
    `  Surface: ${requirement.safe_collection_surface}`,
    `  Storage: ${requirement.storage_rule}`,
    requirement.target_names.length > 0 ? `  Target names: ${requirement.target_names.join(", ")}` : null,
    requirement.research_question_ids.length > 0 ? `  Related questions: ${requirement.research_question_ids.join(", ")}` : null,
    `  Done when: ${requirement.completion_signal}`,
    `  Next action: ${requirement.next_action}`,
    "  Live execution, wallet mutation, and secret echo: blocked",
  ].filter(Boolean).join("\n")).join("\n");
  const unlockSequence = packet.operator_unlock_sequence.length > 0
    ? packet.operator_unlock_sequence.map((step, index) => [
      `- ${index + 1}. ${step.label}: ${step.status}`,
      `  Storage: ${step.storage}`,
      `  Next action: ${step.next_action}`,
      `  Evidence: ${step.evidence}`,
    ].join("\n")).join("\n")
    : "- No operator unlock sequence is available in this packet.";
  const liveUsability = packet.live_usability
    ? [
      `- Status: ${packet.live_usability.status}`,
      `- Real-money blockers: ${packet.live_usability.real_capital_blocker_count}`,
      `- Rows listed: ${packet.live_usability.listed_live_usability_row_count}/${packet.live_usability.total_live_usability_row_count}`,
      `- Live lanes ready: ${packet.live_usability.ready_live_lane_count}/${packet.live_usability.total_live_lane_count}`,
      packet.live_usability.next_unlock_step_label
        ? `- Next unlock: ${packet.live_usability.next_unlock_step_label}; ${packet.live_usability.next_unlock_step_action}`
        : `- Next action: ${packet.live_usability.next_action}`,
      `- Evidence: ${packet.live_usability.evidence_endpoint}; receipt ${packet.live_usability.receipt_hash}`,
    ].join("\n")
    : "- No live-usability summary is attached. Load GET /api/web3-live-usability-blockers before live review.";
  const currentInput = packet.current_input
    ? [
      `- ${packet.current_input.label}: ${packet.current_input.next_action}`,
      `- Source: ${packet.current_input.source}`,
      `- Surface: ${packet.current_input.safe_collection_surface.replaceAll("-", " ")}`,
      `- Storage: ${packet.current_input.storage.replaceAll("-", " ")}`,
      packet.current_input.target_names.length > 0 ? `- Target names: ${packet.current_input.target_names.join(", ")}` : null,
      packet.current_input.verifier_command ? `- Verify: ${packet.current_input.verifier_command}` : null,
      "- Live execution, transaction submission, wallet mutation, private-key storage, seed-phrase storage, and secret echo: blocked",
    ].filter(Boolean).join("\n")
    : "- No current input is open.";

  return [
    "# Mastermind Web3 Research Handoff Packet",
    "",
    packet.summary,
    "",
    "## Current App State",
    `- Source: ${packet.source}`,
    `- Account: ${packet.account}`,
    `- Scenario: ${packet.scenario}`,
    `- Usability: ${packet.app_state.usability_status}`,
    `- Runbook: ${packet.app_state.runbook_status}`,
    `- Cutover: ${packet.app_state.cutover_status}`,
    `- Manual review: ${packet.app_state.manual_review_status}`,
    `- Paper equity: $${packet.app_state.paper_equity_usd.toFixed(2)}`,
    `- Paper window PnL: $${packet.app_state.paper_window_pnl_usd.toFixed(2)}`,
    `- Launch readiness score: ${packet.app_state.launch_readiness_score}/100`,
    "",
    "## Current Capabilities",
    ...packet.current_capabilities.map((item) => `- ${item}`),
    "",
    "## Next Ordered Unlock Step",
    packet.next_unlock_step
      ? `- ${packet.next_unlock_step.label}: ${packet.next_unlock_step.status}; ${packet.next_unlock_step.next_action}`
      : "- No ordered unlock step is open.",
    "",
    "## Current Input Contract",
    currentInput,
    "",
    "## Operator Unlock Sequence",
    unlockSequence,
    "",
    "## Live Usability Summary",
    liveUsability,
    "",
    "## Open Operator Inputs",
    openInputs,
    "",
    "## Credential Requirements",
    credentialRequirements,
    "",
    "## Live Capital Blockers",
    blockers,
    "",
    "## Research Questions",
    questions,
    "",
    "## Safe To Share",
    ...packet.safe_to_share.map((item) => `- ${item}`),
    "",
    "## Local Export Commands",
    ...packet.safe_export_commands.map((command) => `- ${command}`),
    "",
    "## Never Provide",
    ...packet.never_provide.map((item) => `- ${item}`),
    "",
    "## Source Endpoints",
    ...packet.source_endpoints.map((item) => `- ${item}`),
    "",
    "## Verifier Commands",
    ...packet.verifier_commands.map((item) => `- ${item}`),
    "",
    "## Boundaries",
    "- Live execution: blocked",
    "- Transaction submission: blocked",
    "- Wallet mutation: blocked",
    "- Private-key storage: blocked",
    "- Seed-phrase storage: blocked",
    "- Secret echo: blocked",
  ].join("\n");
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
