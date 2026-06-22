import { createHash } from "node:crypto";
import { getWeb3CredentialDoctorHealth, type Web3CredentialDoctorHealth } from "./web3-credential-doctor";
import type { Web3CutoverBlockerBoard } from "./web3-cutover-blocker-board";
import type { Web3LiveCapitalPreflightReceipt } from "./web3-live-capital-preflight";
import type { Web3ManualLiveReviewPacket } from "./web3-manual-live-review-packet";
import type { Web3OperatorCurrentInput } from "./web3-operator-request-packet";
import type { Web3OperatorRunbookReceipt } from "./web3-operator-runbook";
import type { Web3SupervisedLiveRunway } from "./web3-supervised-live-runway";
import type { Web3TradingState } from "./web3-trading";
import type { Web3UsabilityStatusReceipt } from "./web3-usability-status";

const CANONICAL_LIVE_CANARY_SURFACE = "/trading?source=live-dex&account=persistent&scenario=breakout#web3-live-canary-console";

export type Web3LiveUsabilityBlockerOwner = "operator" | "security" | "ops" | "accounting" | "strategy" | "manual-review";

export type Web3LiveUsabilityMissingItem = {
  id: string;
  label: string;
  owner: Web3LiveUsabilityBlockerOwner;
  source: "cutover" | "preflight" | "manual-review" | "runway";
  status: "needed" | "blocked" | "review" | "watch" | "fail";
  next_action: string;
  blocks_live_capital: boolean;
};

export type Web3LiveUsabilityOwnerSummary = {
  owner: Web3LiveUsabilityBlockerOwner;
  missing_count: number;
  real_capital_blocker_count: number;
  first_label: string;
  next_action: string;
  sources: Web3LiveUsabilityMissingItem["source"][];
};

export type Web3LiveUsabilitySourceSummary = {
  source: Web3LiveUsabilityMissingItem["source"];
  missing_count: number;
  real_capital_blocker_count: number;
  first_label: string;
  next_action: string;
};

export type Web3LiveUsabilityCredentialDoctorSummary = {
  status: Web3CredentialDoctorHealth["status"];
  receipt_fresh: boolean;
  ready_count: number;
  watch_count: number;
  blocked_count: number;
  next_action: string;
  safe_command: string;
  receipt_hash: string | null;
};

export type Web3LiveUsabilityNextBlocker = {
  id: string;
  label: string;
  owner: Web3LiveUsabilityBlockerOwner;
  source: Web3LiveUsabilityMissingItem["source"];
  status: Web3LiveUsabilityMissingItem["status"];
  next_action: string;
  href: string;
  safe_command: string | null;
  blocks_live_capital: boolean;
};

export type Web3LiveUsabilityCredentialRequest = {
  id: string;
  label: string;
  status: string;
  source: Web3OperatorCurrentInput["source"] | "dependency-blocker";
  priority: string;
  safe_collection_surface: string;
  storage: string;
  can_enter_in_app: boolean;
  target_names: string[];
  fix_href: string;
  safe_value_description: string;
  verifier_command: string | null;
  next_action: string;
  blocker_id: string | null;
  blocker_owner: Web3LiveUsabilityBlockerOwner | null;
  blocks_live_capital: boolean;
  safe_to_provide: string[];
  never_provide: string[];
  completion_criteria: string[];
  verification_runway: Array<{
    id: string;
    label: string;
    surface: "settings" | "trading" | "browser-wallet" | "local-command" | "read-only-api" | "external-review";
    href: string | null;
    command: string | null;
    status: "next" | "after-input" | "gated" | "external";
    next_action: string;
    live_execution_permission: "blocked";
    wallet_mutation_permission: "blocked";
    secret_echo_permission: "blocked";
  }>;
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  transaction_submission_permission: "blocked";
  signing_permission: "blocked";
  private_key_storage: "blocked";
  seed_phrase_storage: "blocked";
  secret_echo_permission: "blocked";
};

export type Web3LiveUsabilityBlockersReceipt = {
  mode: "web3-live-usability-blockers";
  status:
    | "operator-input-needed"
    | "external-review-needed"
    | "live-review-ready"
    | "autonomous-live-locked";
  generated_at: string;
  receipt_hash: string;
  source: Web3TradingState["market_source"]["mode"];
  account: Web3TradingState["paper_account"]["mode"];
  scenario: Web3TradingState["scenario"];
  current_mode: Web3UsabilityStatusReceipt["current_mode"];
  usability_status: Web3UsabilityStatusReceipt["status"];
  manual_review_status: Web3ManualLiveReviewPacket["status"];
  live_review_permitted: boolean;
  can_request_external_review: boolean;
  paper_usable: boolean;
  dry_run_usable: boolean;
  supervised_review_ready: boolean;
  autonomous_live_locked: true;
  open_operator_input_count: number;
  open_cutover_blocker_count: number;
  real_capital_blocker_count: number;
  total_live_usability_row_count: number;
  listed_live_usability_row_count: number;
  live_usability_row_scope: "compact" | "all";
  required_signoff_count: number;
  passed_signoff_count: number;
  failed_or_watch_signoff_count: number;
  ready_live_lane_count: number;
  total_live_lane_count: number;
  safe_action_count: number;
  gated_action_count: number;
  operator_wallet_public_key: string | null;
  operator_wallet_strict_command: string | null;
  current_input: Web3OperatorCurrentInput | null;
  next_operator_input: {
    label: string;
    next_action: string;
    safe_collection_surface: string;
    storage: string;
  } | null;
  next_blocker: Web3LiveUsabilityNextBlocker | null;
  next_credential_request: Web3LiveUsabilityCredentialRequest | null;
  next_unlock_step: Web3UsabilityStatusReceipt["operator_unlock_sequence"][number] | null;
  next_action: string;
  summary: string;
  operator_unlock_sequence: Web3UsabilityStatusReceipt["operator_unlock_sequence"];
  missing_for_live_usability: Web3LiveUsabilityMissingItem[];
  missing_owner_summary: Web3LiveUsabilityOwnerSummary[];
  missing_source_summary: Web3LiveUsabilitySourceSummary[];
  credential_doctor: Web3LiveUsabilityCredentialDoctorSummary;
  safe_next_actions: Array<{
    id: Web3OperatorRunbookReceipt["run_now"][number]["id"];
    label: string;
    status: Web3OperatorRunbookReceipt["run_now"][number]["status"];
    surface: Web3OperatorRunbookReceipt["run_now"][number]["surface"];
    href: string | null;
    command: string | null;
    next_action: string;
  }>;
  verifier_commands: string[];
  evidence_endpoints: string[];
  safe_to_provide: string[];
  never_provide: string[];
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  transaction_submission_permission: "blocked";
  signing_permission: "blocked";
  private_key_storage: "blocked";
  seed_phrase_storage: "blocked";
  secret_echo_permission: "blocked";
  controls: string[];
};

export type Web3LiveUsabilityBlockersHealth = {
  mode: "web3-live-usability-health";
  status: Web3LiveUsabilityBlockersReceipt["status"];
  receipt_hash: string;
  current_mode: Web3LiveUsabilityBlockersReceipt["current_mode"];
  usability_status: Web3LiveUsabilityBlockersReceipt["usability_status"];
  manual_review_status: Web3LiveUsabilityBlockersReceipt["manual_review_status"];
  open_operator_input_count: number;
  open_cutover_blocker_count: number;
  real_capital_blocker_count: number;
  total_live_usability_row_count: number;
  listed_live_usability_row_count: number;
  failed_or_watch_signoff_count: number;
  ready_live_lane_count: number;
  total_live_lane_count: number;
  safe_action_count: number;
  operator_wallet_public_key: string | null;
  operator_wallet_strict_command: string | null;
  current_input: Web3OperatorCurrentInput | null;
  next_operator_input_label: string | null;
  next_unlock_step_label: string | null;
  next_unlock_step_status: Web3UsabilityStatusReceipt["operator_unlock_sequence"][number]["status"] | null;
  next_unlock_step_action: string | null;
  credential_doctor_status: Web3LiveUsabilityCredentialDoctorSummary["status"];
  credential_doctor_receipt_fresh: boolean;
  credential_doctor_blocked_count: number;
  credential_doctor_next_action: string;
  next_blocker: Web3LiveUsabilityNextBlocker | null;
  next_credential_request: Web3LiveUsabilityCredentialRequest | null;
  next_action: string;
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  transaction_submission_permission: "blocked";
  signing_permission: "blocked";
  private_key_storage: "blocked";
  seed_phrase_storage: "blocked";
  secret_echo_permission: "blocked";
};

export function buildWeb3LiveUsabilityBlockersReceipt(input: {
  state: Web3TradingState;
  usability: Web3UsabilityStatusReceipt;
  cutover: Web3CutoverBlockerBoard;
  runbook: Web3OperatorRunbookReceipt;
  preflight: Web3LiveCapitalPreflightReceipt;
  manualLiveReview: Web3ManualLiveReviewPacket;
  runway: Web3SupervisedLiveRunway;
  currentInput?: Web3OperatorCurrentInput | null;
  credentialDoctor?: Web3CredentialDoctorHealth;
  now?: Date;
  rowScope?: "compact" | "all";
}): Web3LiveUsabilityBlockersReceipt {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const operatorWalletPublicKey = safeWalletCommandValue(input.state.execution_readiness.config.wallet_public_key);
  const operatorWalletStrictCommand = walletStrictVerifierCommand(operatorWalletPublicKey);
  const currentInput = scopeCurrentInput(input.currentInput ?? null, operatorWalletPublicKey);
  const missing = buildMissingItems(input);
  const paper = input.usability.capabilities.find((item) => item.id === "paper-autonomy");
  const dryRun = input.usability.capabilities.find((item) => item.id === "jupiter-dry-run");
  const autonomousLive = input.usability.capabilities.find((item) => item.id === "autonomous-live");
  const openOperatorInputCount = input.cutover.rows.filter((row) =>
    row.owner === "operator" && row.status !== "ready"
  ).length;
  const realCapitalBlockerCount = missing.filter((item) => item.blocks_live_capital).length;
  const failedOrWatchSignoffCount = input.manualLiveReview.failed_signoff_count + input.manualLiveReview.watch_signoff_count;
  const status = blockersStatus(input, openOperatorInputCount, failedOrWatchSignoffCount);
  const nextUnlockStep = input.usability.operator_unlock_sequence.find((step) => step.status !== "ready") ??
    input.usability.operator_unlock_sequence[input.usability.operator_unlock_sequence.length - 1] ??
    null;
  const safeNextActions = input.runbook.run_now
    .filter((action) => action.status !== "blocked")
    .map((action) => ({
      id: action.id,
      label: action.label,
      status: action.status,
      surface: action.surface,
      href: action.href,
      command: walletScopedCommand(action.command, operatorWalletPublicKey),
      next_action: action.next_action,
    }))
    .slice(0, 6);
  const rowScope = input.rowScope ?? "compact";
  const listedMissing = rowScope === "all" ? missing : missing.slice(0, 14);
  const ownerSummary = summarizeMissingByOwner(missing);
  const sourceSummary = summarizeMissingBySource(missing);
  const credentialDoctor = summarizeCredentialDoctor(input.credentialDoctor ?? getWeb3CredentialDoctorHealth());
  const nextBlocker = scopeNextBlocker(summarizeNextBlocker(missing[0], currentInput), operatorWalletPublicKey);
  const nextCredentialRequest = summarizeNextCredentialRequest(
    currentInput,
    nextBlocker,
    input.cutover.safe_to_provide,
    input.cutover.never_provide,
    operatorWalletPublicKey,
  );
  const verifierCommands = Array.from(new Set([
    operatorWalletStrictCommand,
    ...input.runbook.verifier_commands,
    ...input.manualLiveReview.safe_commands,
    ...input.cutover.verifier_commands,
  ]
    .map((command) => walletScopedCommand(command, operatorWalletPublicKey))
    .filter((command): command is string => Boolean(command)))).slice(0, 8);
  const receiptBase = {
    mode: "web3-live-usability-blockers" as const,
    status,
    generated_at: generatedAt,
    source: input.state.market_source.mode,
    account: input.state.paper_account.mode,
    scenario: input.state.scenario,
    current_mode: input.usability.current_mode,
    usability_status: input.usability.status,
    manual_review_status: input.manualLiveReview.status,
    live_review_permitted: input.manualLiveReview.live_review_permitted,
    can_request_external_review: input.manualLiveReview.can_request_external_review,
    paper_usable: paper?.status === "usable" || paper?.status === "watch",
    dry_run_usable: dryRun?.status === "usable",
    supervised_review_ready: input.runway.can_request_live_review && input.manualLiveReview.can_request_external_review,
    autonomous_live_locked: true as const,
    open_operator_input_count: openOperatorInputCount,
    open_cutover_blocker_count: input.cutover.open_blocker_count,
    real_capital_blocker_count: realCapitalBlockerCount,
    total_live_usability_row_count: missing.length,
    listed_live_usability_row_count: listedMissing.length,
    live_usability_row_scope: rowScope,
    required_signoff_count: input.manualLiveReview.required_signoff_count,
    passed_signoff_count: input.manualLiveReview.passed_signoff_count,
    failed_or_watch_signoff_count: failedOrWatchSignoffCount,
    ready_live_lane_count: input.runway.ready_lane_count,
    total_live_lane_count: input.runway.total_lane_count,
    safe_action_count: input.runbook.allowed_now_count,
    gated_action_count: input.runbook.gated_count,
    operator_wallet_public_key: operatorWalletPublicKey,
    operator_wallet_strict_command: operatorWalletStrictCommand,
    current_input: currentInput,
    next_operator_input: input.cutover.next_safe_input
      ? {
        label: input.cutover.next_safe_input.label,
        next_action: input.cutover.next_safe_input.next_action,
        safe_collection_surface: input.cutover.next_safe_input.safe_collection_surface,
        storage: input.cutover.next_safe_input.storage,
      }
      : null,
    next_blocker: nextBlocker,
    next_credential_request: nextCredentialRequest,
    next_unlock_step: nextUnlockStep,
    next_action: liveUsabilityNextAction(status, input, missing),
    summary: liveUsabilitySummary(status, input, missing, autonomousLive?.detail),
    operator_unlock_sequence: input.usability.operator_unlock_sequence,
    missing_for_live_usability: listedMissing,
    missing_owner_summary: ownerSummary,
    missing_source_summary: sourceSummary,
    credential_doctor: credentialDoctor,
    safe_next_actions: safeNextActions,
    verifier_commands: verifierCommands,
    evidence_endpoints: [
      "GET /api/web3-usability-status",
      "GET /api/web3-cutover-blocker-board",
      "GET /api/web3-live-capital-preflight",
      "GET /api/web3-supervised-live-runway",
      "GET /api/web3-manual-live-review-packet",
      "GET /api/web3-operator-runbook",
      "LOCAL data/web3-credential-doctor.json",
    ],
    safe_to_provide: input.cutover.safe_to_provide,
    never_provide: input.cutover.never_provide,
    live_execution_permission: "blocked" as const,
    wallet_mutation_permission: "blocked" as const,
    transaction_submission_permission: "blocked" as const,
    signing_permission: "blocked" as const,
    private_key_storage: "blocked" as const,
    seed_phrase_storage: "blocked" as const,
    secret_echo_permission: "blocked" as const,
    controls: [
      "This receipt answers what is left before real-money Web3 usability; it is not an execution endpoint.",
      "Safe actions are limited to cockpit review, paper autonomy, read-only market refresh, credential setup, verifier commands, and external review packets.",
      "It summarizes target names, owner/source groups, credential-doctor status, labels, next actions, and blocker counts only; provider secrets, wallet secrets, transaction bodies, signatures, and webhook values are never returned.",
      "Pass rows=all to inspect every dependency-ranked missing row; the default receipt stays compact for dashboards.",
      "Autonomous live trading remains locked in-app even when supervised live review becomes externally requestable.",
    ],
  };

  return {
    ...receiptBase,
    receipt_hash: hashJson(receiptBase),
  };
}

export function buildWeb3LiveUsabilityBlockersHealth(
  receipt: Web3LiveUsabilityBlockersReceipt,
  currentInput: Web3OperatorCurrentInput | null = null,
): Web3LiveUsabilityBlockersHealth {
  const healthCurrentInput = scopeCurrentInput(currentInput ?? receipt.current_input, receipt.operator_wallet_public_key);
  const healthCredentialRequest = summarizeNextCredentialRequest(
    healthCurrentInput,
    receipt.next_blocker,
    receipt.safe_to_provide,
    receipt.never_provide,
    receipt.operator_wallet_public_key,
  );
  return {
    mode: "web3-live-usability-health",
    status: receipt.status,
    receipt_hash: receipt.receipt_hash,
    current_mode: receipt.current_mode,
    usability_status: receipt.usability_status,
    manual_review_status: receipt.manual_review_status,
    open_operator_input_count: receipt.open_operator_input_count,
    open_cutover_blocker_count: receipt.open_cutover_blocker_count,
    real_capital_blocker_count: receipt.real_capital_blocker_count,
    total_live_usability_row_count: receipt.total_live_usability_row_count,
    listed_live_usability_row_count: receipt.listed_live_usability_row_count,
    failed_or_watch_signoff_count: receipt.failed_or_watch_signoff_count,
    ready_live_lane_count: receipt.ready_live_lane_count,
    total_live_lane_count: receipt.total_live_lane_count,
    safe_action_count: receipt.safe_action_count,
    operator_wallet_public_key: receipt.operator_wallet_public_key,
    operator_wallet_strict_command: receipt.operator_wallet_strict_command,
    current_input: healthCurrentInput,
    next_operator_input_label: receipt.next_operator_input?.label ?? null,
    next_unlock_step_label: receipt.next_unlock_step?.label ?? null,
    next_unlock_step_status: receipt.next_unlock_step?.status ?? null,
    next_unlock_step_action: receipt.next_unlock_step?.next_action ?? null,
    credential_doctor_status: receipt.credential_doctor.status,
    credential_doctor_receipt_fresh: receipt.credential_doctor.receipt_fresh,
    credential_doctor_blocked_count: receipt.credential_doctor.blocked_count,
    credential_doctor_next_action: receipt.credential_doctor.next_action,
    next_blocker: receipt.next_blocker,
    next_credential_request: healthCredentialRequest,
    next_action: receipt.next_action,
    live_execution_permission: "blocked",
    wallet_mutation_permission: "blocked",
    transaction_submission_permission: "blocked",
    signing_permission: "blocked",
    private_key_storage: "blocked",
    seed_phrase_storage: "blocked",
    secret_echo_permission: "blocked",
  };
}

function summarizeNextCredentialRequest(
  currentInput: Web3OperatorCurrentInput | null,
  nextBlocker: Web3LiveUsabilityNextBlocker | null,
  safeToProvide: string[],
  neverProvide: string[],
  operatorWalletPublicKey: string | null = null,
): Web3LiveUsabilityCredentialRequest | null {
  if (!currentInput && !nextBlocker) return null;
  const useCurrentInput = shouldUseCurrentInputForCredentialRequest(currentInput, nextBlocker);
  const id = useCurrentInput ? currentInput!.id : nextBlocker?.id ?? currentInput?.id ?? "next-web3-credential";
  const label = useCurrentInput ? currentInput!.label : nextBlocker?.label ?? currentInput?.label ?? "Next Web3 setup input";
  const verifierCommand = walletScopedCommand(nextBlocker?.safe_command ?? currentInput?.verifier_command ?? null, operatorWalletPublicKey);
  const fixHref = credentialRequestFixHref(currentInput, nextBlocker, useCurrentInput);
  return {
    id,
    label,
    status: useCurrentInput ? currentInput!.status : nextBlocker?.status ?? currentInput?.status ?? "needed",
    source: useCurrentInput ? currentInput!.source : "dependency-blocker",
    priority: useCurrentInput ? currentInput!.priority : "required-now",
    safe_collection_surface: useCurrentInput ? currentInput!.safe_collection_surface : fixHref,
    storage: useCurrentInput ? currentInput!.storage : credentialRequestStorageRule(id),
    can_enter_in_app: useCurrentInput ? currentInput!.can_enter_in_app : Boolean(
      fixHref.includes("#settings-web3-wallet-public-key") ||
      fixHref.includes("#web3-credential-action-console") ||
      fixHref.includes("#web3-live-canary-console")
    ),
    target_names: useCurrentInput ? currentInput!.target_names : credentialRequestTargetNames(id),
    fix_href: fixHref,
    safe_value_description: credentialRequestSafeValueDescription(id, currentInput, nextBlocker),
    verifier_command: verifierCommand,
    next_action: useCurrentInput ? currentInput!.next_action : nextBlocker?.next_action ?? currentInput?.next_action ?? "Open Settings and resolve the next Web3 setup gate.",
    blocker_id: nextBlocker?.id ?? null,
    blocker_owner: nextBlocker?.owner ?? null,
    blocks_live_capital: nextBlocker?.blocks_live_capital ?? true,
    safe_to_provide: credentialRequestSafeToProvide(id, currentInput, nextBlocker, safeToProvide),
    never_provide: neverProvide.slice(0, 6),
    completion_criteria: credentialRequestCompletionCriteria(id),
    verification_runway: credentialRequestVerificationRunway(id, verifierCommand, fixHref, operatorWalletPublicKey),
    live_execution_permission: "blocked",
    wallet_mutation_permission: "blocked",
    transaction_submission_permission: "blocked",
    signing_permission: "blocked",
    private_key_storage: "blocked",
    seed_phrase_storage: "blocked",
    secret_echo_permission: "blocked",
  };
}

function credentialRequestSafeToProvide(
  id: string,
  currentInput: Web3OperatorCurrentInput | null,
  nextBlocker: Web3LiveUsabilityNextBlocker | null,
  fallback: string[],
) {
  const normalized = `${id} ${currentInput?.target_names.join(" ") ?? ""} ${nextBlocker?.id ?? ""}`.toLowerCase();
  if (normalized.includes("wallet-ownership") || normalized.includes("hash-only wallet ownership")) {
    return [
      "Text-message signature receipt with hashes only",
      "hash-only wallet ownership receipt",
    ];
  }
  if (normalized.includes("wallet")) {
    return [
      "Dedicated Solana public wallet address",
      "Browser-safe public wallet scope",
    ];
  }
  if (normalized.includes("jupiter")) {
    return [
      "JUPITER_API_KEY in ignored server env",
      "JUPITER_API_KEY in a one-shot Settings credential test",
    ];
  }
  if (normalized.includes("helius") || normalized.includes("rpc") || normalized.includes("read-provider")) {
    return [
      "HELIUS_API_KEY in ignored server env",
      "SOLANA_RPC_URL in ignored server env",
      "SOLANA_WS_URL in ignored server env",
    ];
  }
  if (normalized.includes("signer") || normalized.includes("custody")) {
    return [
      "Signer provider mode",
      "Signer provider target names",
      "Policy identifier or policy hash",
    ];
  }
  if (normalized.includes("accounting") || normalized.includes("settlement")) {
    return [
      "Accounting export target name",
      "Settlement review status",
    ];
  }
  if (normalized.includes("production") || normalized.includes("emergency") || normalized.includes("ops")) {
    return [
      "Emergency-stop contact or webhook target name",
      "Production worker owner/process/restart target names",
    ];
  }
  return fallback.slice(0, 6);
}

function shouldUseCurrentInputForCredentialRequest(
  currentInput: Web3OperatorCurrentInput | null,
  nextBlocker: Web3LiveUsabilityNextBlocker | null,
) {
  if (!currentInput) return false;
  if (!nextBlocker) return true;
  if (nextBlocker.id.includes(currentInput.id)) return true;
  return currentInput.id === "wallet-ownership-proof" &&
    nextBlocker.id === "runway:wallet" &&
    currentInput.storage === "hash-only-local-receipt";
}

function credentialRequestFixHref(
  currentInput: Web3OperatorCurrentInput | null,
  nextBlocker: Web3LiveUsabilityNextBlocker | null,
  useCurrentInput: boolean,
) {
  if (useCurrentInput && currentInput?.id === "wallet-ownership-proof") {
    return CANONICAL_LIVE_CANARY_SURFACE;
  }
  return nextBlocker?.href ?? "/settings/integrations#settings-web3-credentials-runway";
}

function credentialRequestCompletionCriteria(id: string) {
  const normalized = id.toLowerCase();
  if (normalized.includes("wallet-ownership")) {
    return [
      "The connected browser wallet matches the saved dedicated public wallet.",
      "The browser wallet signs the Mastermind text-only ownership challenge.",
      "The app stores only hash evidence for the challenge and signature.",
      "The refreshed live-usability receipt advances past wallet ownership while live execution, transaction submission, wallet mutation, private-key storage, seed-phrase storage, and secret echo stay blocked.",
    ];
  }
  if (normalized.includes("wallet")) {
    return [
      "A dedicated public Solana wallet address is saved; the sample all-ones wallet is rejected.",
      "The strict operator-wallet verifier passes with --require-operator-wallet.",
      "Wallet ownership proof is recorded as a hash-only text-message signature receipt.",
      "The refreshed live-usability receipt no longer ranks dedicated wallet scope as the next blocker, while live execution, signing, submission, wallet mutation, and secret echo stay blocked.",
    ];
  }
  if (normalized.includes("jupiter")) {
    return [
      "JUPITER_API_KEY is available through ignored server env for funded canary order creation; session-only Settings tests are evidence only.",
      "The strict Jupiter verifier passes with --require-jupiter-order.",
      "Quote and unsigned order readiness are recorded without returning transaction bytes.",
      "The refreshed live-usability receipt advances to the next non-Jupiter blocker while live execution, signing, submission, wallet mutation, and secret echo stay blocked.",
    ];
  }
  if (normalized.includes("signer") || normalized.includes("custody")) {
    return [
      "Signer provider mode and policy targets are documented without wallet private keys or seed phrases.",
      "Provider custody review records hash-only request or policy evidence.",
      "External signer approval remains separate from in-app live execution authority.",
      "The refreshed live-usability receipt keeps signing and wallet mutation blocked until manual live review.",
    ];
  }
  if (normalized.includes("accounting") || normalized.includes("settlement")) {
    return [
      "Accounting or settlement target names are configured without raw secrets.",
      "A redacted ledger/accounting receipt proves the review path.",
      "The refreshed live-usability receipt keeps live settlement and wallet mutation blocked.",
    ];
  }
  if (normalized.includes("production") || normalized.includes("emergency") || normalized.includes("ops")) {
    return [
      "Ops target names, process owner, restart policy, or emergency-stop contact route are configured without secret echo.",
      "The Web3 credential doctor reports the local ops receipt as fresh or ready for review.",
      "The refreshed live-usability receipt keeps external dispatch, live execution, and wallet mutation blocked.",
    ];
  }
  return [
    "The safe setup value or review decision is recorded in the linked surface.",
    "The safe verifier passes after the value changes.",
    "The refreshed live-usability receipt advances to the next blocker while live execution, signing, submission, wallet mutation, and secret echo stay blocked.",
  ];
}

function credentialRequestVerificationRunway(
  id: string,
  verifierCommand: string | null,
  fixHref: string,
  operatorWalletPublicKey: string | null = null,
): Web3LiveUsabilityCredentialRequest["verification_runway"] {
  const normalized = id.toLowerCase();
  if (normalized.includes("wallet-ownership")) {
    return [
      verificationRunwayStep({
        id: "check-wallet-challenge",
        label: "Check wallet challenge",
        surface: "browser-wallet",
        href: fixHref,
        command: null,
        status: "next",
        next_action: "Use Check wallet in Trading to fetch the text-only challenge without a signature prompt.",
      }),
      verificationRunwayStep({
        id: "prove-wallet-ownership",
        label: "Prove wallet ownership",
        surface: "browser-wallet",
        href: fixHref,
        command: null,
        status: "after-input",
        next_action: "Use Prove wallet with the matching browser wallet; this signs text only and cannot move funds.",
      }),
      verificationRunwayStep({
        id: "strict-wallet-verifier",
        label: "Run wallet verifier",
        surface: "local-command",
        href: null,
        command: verifierCommand,
        status: "after-input",
        next_action: "Run the strict operator-wallet verifier and keep live authority blocked.",
      }),
      verificationRunwayStep({
        id: "refresh-live-usability",
        label: "Refresh what is left",
        surface: "read-only-api",
        href: "/api/web3-live-usability-blockers?source=live-dex&account=persistent&rows=all",
        command: walletScopedCommand("npm run verify:web3 -- --base-url=http://localhost:4010 --wallet=<public-solana-address> --require-operator-wallet", operatorWalletPublicKey),
        status: "after-input",
        next_action: "Refresh the live-usability receipt so the next blocker advances only after the proof is recorded.",
      }),
    ];
  }
  if (normalized.includes("wallet")) {
    return [
      verificationRunwayStep({
        id: "save-public-wallet",
        label: "Save public wallet scope",
        surface: "trading",
        href: fixHref,
        command: null,
        status: "next",
        next_action: "Save only the dedicated public Solana wallet address in the Trading live canary console.",
      }),
      verificationRunwayStep({
        id: "strict-wallet-verifier",
        label: "Run wallet verifier",
        surface: "local-command",
        href: null,
        command: verifierCommand,
        status: "after-input",
        next_action: "Run the strict operator-wallet verifier and keep the sample wallet rejected.",
      }),
      verificationRunwayStep({
        id: "prove-wallet-ownership",
        label: "Prove wallet ownership",
        surface: "browser-wallet",
        href: CANONICAL_LIVE_CANARY_SURFACE,
        command: null,
        status: "after-input",
        next_action: "Use the browser wallet to sign the text-only ownership challenge; this is not a transaction signature.",
      }),
      verificationRunwayStep({
        id: "refresh-live-usability",
        label: "Refresh what is left",
        surface: "read-only-api",
        href: "/api/web3-live-usability-blockers?source=live-dex&account=persistent&rows=all",
        command: walletScopedCommand("npm run verify:web3 -- --base-url=http://localhost:4010 --wallet=<public-solana-address> --require-operator-wallet", operatorWalletPublicKey),
        status: "after-input",
        next_action: "Refresh the live-usability receipt so the next blocker advances only after the wallet gate proves out.",
      }),
    ];
  }
  if (normalized.includes("jupiter")) {
    return [
      verificationRunwayStep({
        id: "install-jupiter-key",
        label: "Install Jupiter key",
        surface: "settings",
        href: fixHref,
        command: null,
        status: "next",
        next_action: "Install JUPITER_API_KEY through ignored local env for funded canary order creation; session-only Settings tests are evidence only.",
      }),
      verificationRunwayStep({
        id: "strict-jupiter-verifier",
        label: "Run Jupiter verifier",
        surface: "local-command",
        href: null,
        command: verifierCommand ?? "npm run verify:web3 -- --base-url=http://localhost:4010 --require-jupiter-order",
        status: "after-input",
        next_action: "Prove quote and unsigned order readiness while transaction bytes stay withheld.",
      }),
      verificationRunwayStep({
        id: "refresh-live-usability",
        label: "Refresh what is left",
        surface: "read-only-api",
        href: "/api/web3-live-usability-blockers?source=live-dex&account=persistent&rows=all",
        command: "npm run verify:web3 -- --base-url=http://localhost:4010 --require-jupiter-order",
        status: "after-input",
        next_action: "Refresh the live-usability receipt after route/order proof is recorded.",
      }),
    ];
  }
  return [
    verificationRunwayStep({
      id: "open-safe-surface",
      label: "Open safe setup surface",
      surface: fixHref.includes("/api/") ? "read-only-api" : "settings",
      href: fixHref,
      command: null,
      status: "next",
      next_action: "Open the linked safe setup surface and provide only the requested redacted value or review decision.",
    }),
    verificationRunwayStep({
      id: "run-safe-verifier",
      label: "Run safe verifier",
      surface: "local-command",
      href: null,
      command: verifierCommand ?? "npm run verify:web3 -- --base-url=http://localhost:4010",
      status: "after-input",
      next_action: "Run the safe verifier after the setup value changes.",
    }),
    verificationRunwayStep({
      id: "refresh-live-usability",
      label: "Refresh what is left",
      surface: "read-only-api",
      href: "/api/web3-live-usability-blockers?source=live-dex&account=persistent&rows=all",
      command: "npm run verify:web3 -- --base-url=http://localhost:4010",
      status: "after-input",
      next_action: "Refresh the live-usability receipt and confirm live authority is still blocked.",
    }),
  ];
}

function verificationRunwayStep(input: {
  id: string;
  label: string;
  surface: Web3LiveUsabilityCredentialRequest["verification_runway"][number]["surface"];
  href: string | null;
  command: string | null;
  status: Web3LiveUsabilityCredentialRequest["verification_runway"][number]["status"];
  next_action: string;
}) {
  return {
    ...input,
    live_execution_permission: "blocked" as const,
    wallet_mutation_permission: "blocked" as const,
    secret_echo_permission: "blocked" as const,
  };
}

function credentialRequestStorageRule(id: string) {
  const normalized = id.toLowerCase();
  if (normalized.includes("wallet")) return "browser-public-scope";
  if (normalized.includes("jupiter") || normalized.includes("provider") || normalized.includes("helius") || normalized.includes("rpc")) return "ignored-server-env";
  if (normalized.includes("signer") || normalized.includes("custody")) return "external-provider-policy";
  if (normalized.includes("accounting") || normalized.includes("settlement")) return "external-accounting-review";
  if (normalized.includes("production") || normalized.includes("emergency") || normalized.includes("ops")) return "ops-target-review";
  return "safe-setup-surface";
}

function credentialRequestTargetNames(id: string) {
  const normalized = id.toLowerCase();
  if (normalized.includes("wallet")) return ["wallet_public_key"];
  if (normalized.includes("jupiter")) return ["JUPITER_API_KEY"];
  if (normalized.includes("helius") || normalized.includes("rpc")) return ["HELIUS_API_KEY", "SOLANA_RPC_URL", "SOLANA_WS_URL"];
  if (normalized.includes("accounting") || normalized.includes("settlement")) return ["MASTERMOLD_TAX_LEDGER_EXPORT_PATH"];
  if (normalized.includes("production")) return ["MASTERMOLD_WEB3_PROCESS_MANAGER", "MASTERMOLD_WEB3_WORKER_OWNER", "MASTERMOLD_WEB3_RESTART_POLICY_URL"];
  if (normalized.includes("emergency")) return ["MASTERMOLD_EMERGENCY_STOP_WEBHOOK_URL", "MASTERMOLD_EMERGENCY_STOP_CONTACT"];
  return [];
}

function credentialRequestSafeValueDescription(
  id: string,
  currentInput: Web3OperatorCurrentInput | null,
  nextBlocker: Web3LiveUsabilityNextBlocker | null,
) {
  const normalized = `${id} ${currentInput?.target_names.join(" ") ?? ""} ${nextBlocker?.id ?? ""}`.toLowerCase();
  if (normalized.includes("wallet-ownership") || normalized.includes("hash-only wallet ownership")) {
    return "Browser-wallet text-message ownership proof only; never a private key, seed phrase, keypair JSON, transaction signature, signed payload, or transaction body.";
  }
  if (normalized.includes("wallet")) return "Dedicated public Solana trading wallet address only; never a private key, seed phrase, keypair JSON, signed payload, or transaction body.";
  if (normalized.includes("jupiter")) return "Jupiter provider key in ignored server env for funded canary order creation; session-only Settings tests are evidence only, never wallet authority or signed transaction data.";
  if (normalized.includes("signer") || normalized.includes("custody")) return "Signer provider choice, policy identifier, and provider target names only; custody credentials stay in the external provider surface.";
  if (normalized.includes("accounting") || normalized.includes("settlement")) return "Accounting/export target name and review decision only; no wallet secrets or raw private ledger credentials.";
  if (normalized.includes("production") || normalized.includes("emergency") || normalized.includes("ops")) return "Ops target names, process owner, restart policy, or emergency-stop contact route only; no webhook secret echo or live execution authority.";
  return "Redacted setup status, target names, or review decision only; secrets and wallet authority stay out of the app.";
}

function summarizeNextBlocker(
  item: Web3LiveUsabilityMissingItem | undefined,
  currentInput: Web3OperatorCurrentInput | null,
): Web3LiveUsabilityNextBlocker | null {
  if (!item) return null;
  if (currentInput?.id === "wallet-ownership-proof" && item.id === "runway:wallet") {
    return {
      id: currentInput.id,
      label: currentInput.label,
      owner: item.owner,
      source: item.source,
      status: item.status,
      next_action: currentInput.next_action,
      href: CANONICAL_LIVE_CANARY_SURFACE,
      safe_command: currentInput.verifier_command,
      blocks_live_capital: item.blocks_live_capital,
    };
  }
  return {
    id: item.id,
    label: item.label,
    owner: item.owner,
    source: item.source,
    status: item.status,
    next_action: item.next_action,
    href: nextBlockerHref(item),
    safe_command: nextBlockerSafeCommand(item, currentInput),
    blocks_live_capital: item.blocks_live_capital,
  };
}

function nextBlockerHref(item: Web3LiveUsabilityMissingItem) {
  if (
    item.id.includes("dedicated-trading-wallet") ||
    item.id.includes("operator-wallet") ||
    item.id.includes("wallet-ownership") ||
    item.id === "runway:wallet"
  ) {
    return CANONICAL_LIVE_CANARY_SURFACE;
  }
  if (
    item.id.includes("jupiter") ||
    item.id.includes("signer") ||
    item.id.includes("emergency-stop") ||
    item.id.includes("production-worker") ||
    item.id.includes("accounting") ||
    item.id.includes("settlement") ||
    item.id === "runway:ops" ||
    item.id === "runway:accounting"
  ) {
    return "/settings/integrations#web3-credential-action-console";
  }
  if (item.source === "manual-review" || item.id.includes("manual-live")) {
    return "/settings/integrations#settings-web3-research-handoff";
  }
  return "/settings/integrations#settings-web3-credentials-runway";
}

function nextBlockerSafeCommand(
  item: Web3LiveUsabilityMissingItem,
  currentInput: Web3OperatorCurrentInput | null,
) {
  if (currentInput?.verifier_command && item.id.includes(currentInput.id)) {
    return currentInput.verifier_command;
  }
  if (item.id.includes("dedicated-trading-wallet") || item.id.includes("operator-wallet") || item.id === "runway:wallet") {
    return "npm run verify:web3 -- --base-url=http://localhost:4010 --wallet=<public-solana-address> --require-operator-wallet";
  }
  if (item.id.includes("jupiter")) {
    return "npm run verify:web3 -- --base-url=http://localhost:4010 --require-jupiter-order";
  }
  if (item.id.includes("production-worker") || item.id.includes("emergency-stop")) {
    return "npm run doctor:web3 -- --json";
  }
  return null;
}

function scopeCurrentInput(
  currentInput: Web3OperatorCurrentInput | null,
  walletPublicKey: string | null | undefined,
): Web3OperatorCurrentInput | null {
  if (!currentInput) return null;
  return {
    ...currentInput,
    verifier_command: walletScopedCommand(currentInput.verifier_command, walletPublicKey),
  };
}

function scopeNextBlocker(
  nextBlocker: Web3LiveUsabilityNextBlocker | null,
  walletPublicKey: string | null | undefined,
): Web3LiveUsabilityNextBlocker | null {
  if (!nextBlocker) return null;
  return {
    ...nextBlocker,
    safe_command: walletScopedCommand(nextBlocker.safe_command, walletPublicKey),
  };
}

function summarizeCredentialDoctor(health: Web3CredentialDoctorHealth): Web3LiveUsabilityCredentialDoctorSummary {
  return {
    status: health.status,
    receipt_fresh: health.receipt_fresh,
    ready_count: health.ready_count,
    watch_count: health.watch_count,
    blocked_count: health.blocked_count,
    next_action: health.next_action,
    safe_command: "npm run doctor:web3 -- --json",
    receipt_hash: health.receipt_hash || null,
  };
}

function blockersStatus(
  input: {
    manualLiveReview: Web3ManualLiveReviewPacket;
    runway: Web3SupervisedLiveRunway;
  },
  openOperatorInputCount: number,
  failedOrWatchSignoffCount: number,
): Web3LiveUsabilityBlockersReceipt["status"] {
  if (openOperatorInputCount > 0 || input.manualLiveReview.status === "waiting-for-operator-input") {
    return "operator-input-needed";
  }
  if (input.manualLiveReview.can_request_external_review || input.runway.can_request_live_review) {
    return "live-review-ready";
  }
  if (failedOrWatchSignoffCount > 0 || input.manualLiveReview.status === "blocked") {
    return "external-review-needed";
  }
  return "autonomous-live-locked";
}

function buildMissingItems(input: {
  cutover: Web3CutoverBlockerBoard;
  preflight: Web3LiveCapitalPreflightReceipt;
  manualLiveReview: Web3ManualLiveReviewPacket;
  runway: Web3SupervisedLiveRunway;
}): Web3LiveUsabilityMissingItem[] {
  const items = [
    ...input.cutover.rows
      .filter((row) => row.status !== "ready")
      .map((row): Web3LiveUsabilityMissingItem => ({
        id: `cutover:${row.id}`,
        label: row.label,
        owner: row.owner,
        source: "cutover",
        status: row.status === "ready" ? "review" : row.status,
        next_action: row.next_action,
        blocks_live_capital: true,
      })),
    ...input.preflight.gates
      .filter((gate) => gate.status !== "pass")
      .map((gate): Web3LiveUsabilityMissingItem => ({
        id: `preflight:${gate.id}`,
        label: gate.label,
        owner: ownerForGate(gate.id),
        source: "preflight",
        status: gate.status === "fail" ? "fail" : "watch",
        next_action: liveUsabilityPreflightNextAction(gate),
        blocks_live_capital: gate.blocks_live_capital,
      })),
    ...input.manualLiveReview.signoffs
      .filter((signoff) => signoff.status !== "pass")
      .map((signoff): Web3LiveUsabilityMissingItem => ({
        id: `manual:${signoff.id}`,
        label: signoff.label,
        owner: signoff.reviewer,
        source: "manual-review",
        status: signoff.status === "fail" ? "fail" : "watch",
        next_action: liveUsabilityManualReviewNextAction(signoff),
        blocks_live_capital: signoff.blocks_live_capital,
      })),
    ...input.runway.lanes
      .filter((lane) => lane.status !== "ready" && lane.status !== "review")
      .map((lane): Web3LiveUsabilityMissingItem => ({
        id: `runway:${lane.id}`,
        label: lane.label,
        owner: lane.id === "accounting" ? "accounting" : lane.id === "ops" ? "ops" : lane.id === "signer" ? "security" : lane.id === "manual-review" ? "manual-review" : "operator",
        source: "runway",
        status: lane.status === "ready" ? "review" : lane.status,
        next_action: liveUsabilityRunwayNextAction(lane),
        blocks_live_capital: true,
      })),
  ];

  const seen = new Set<string>();
  return items
    .filter((item) => {
      const key = `${item.label}:${item.next_action}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => missingItemRank(a) - missingItemRank(b));
}

function summarizeMissingByOwner(items: Web3LiveUsabilityMissingItem[]): Web3LiveUsabilityOwnerSummary[] {
  const groups = new Map<Web3LiveUsabilityBlockerOwner, Web3LiveUsabilityMissingItem[]>();
  items.forEach((item) => {
    const group = groups.get(item.owner) ?? [];
    group.push(item);
    groups.set(item.owner, group);
  });

  return Array.from(groups.entries())
    .map(([owner, group]) => ({
      owner,
      missing_count: group.length,
      real_capital_blocker_count: group.filter((item) => item.blocks_live_capital).length,
      first_label: group[0]?.label ?? "No blocker",
      next_action: group[0]?.next_action ?? "No action is open for this owner.",
      sources: Array.from(new Set(group.map((item) => item.source))).sort((a, b) => sourceRank(a) - sourceRank(b)),
    }))
    .sort((a, b) => ownerRank(a.owner) - ownerRank(b.owner));
}

function summarizeMissingBySource(items: Web3LiveUsabilityMissingItem[]): Web3LiveUsabilitySourceSummary[] {
  const groups = new Map<Web3LiveUsabilityMissingItem["source"], Web3LiveUsabilityMissingItem[]>();
  items.forEach((item) => {
    const group = groups.get(item.source) ?? [];
    group.push(item);
    groups.set(item.source, group);
  });

  return Array.from(groups.entries())
    .map(([source, group]) => ({
      source,
      missing_count: group.length,
      real_capital_blocker_count: group.filter((item) => item.blocks_live_capital).length,
      first_label: group[0]?.label ?? "No blocker",
      next_action: group[0]?.next_action ?? "No action is open for this source.",
    }))
    .sort((a, b) => sourceRank(a.source) - sourceRank(b.source));
}

function ownerRank(owner: Web3LiveUsabilityBlockerOwner) {
  return ["operator", "security", "ops", "accounting", "strategy", "manual-review"].indexOf(owner);
}

function sourceRank(source: Web3LiveUsabilityMissingItem["source"]) {
  return ["cutover", "preflight", "runway", "manual-review"].indexOf(source);
}

function ownerForGate(id: Web3LiveCapitalPreflightReceipt["gates"][number]["id"]): Web3LiveUsabilityBlockerOwner {
  if (id === "operator-wallet" || id === "manual-live-review") return "operator";
  if (id === "signer-custody" || id === "kill-switch" || id === "risk-policy") return "security";
  if (id === "settlement") return "accounting";
  if (id === "profit-proof") return "strategy";
  return "ops";
}

function liveUsabilityPreflightNextAction(gate: Web3LiveCapitalPreflightReceipt["gates"][number]) {
  if (gate.id === "provider-read-rail") {
    return gate.status === "pass"
      ? "Keep read-provider credentials server-scoped and redacted before manual live review."
      : "Configure Helius/Solana read credentials and Jupiter route evidence in ignored server env or one-shot tests.";
  }
  if (gate.id === "live-dex") {
    return "Run the read-only live DEX monitor until mapped live pairs, source coverage, and candle evidence are current; do not submit trades.";
  }
  if (gate.id === "jupiter-order") {
    return "Add JUPITER_API_KEY in ignored server env or run a one-shot Settings Jupiter rehearsal, then run the strict --require-jupiter-order verifier; transaction bytes stay withheld.";
  }
  if (gate.id === "risk-policy") {
    return "Set positive max trade, daily cap, slippage, and loss controls before any supervised live review.";
  }
  if (gate.id === "kill-switch") {
    return "Keep the emergency stop tested and clear only after live-capital preflight and review gates pass.";
  }
  if (gate.id === "signer-custody") {
    return "Choose manual external wallet custody or a reviewed policy signer, then build the signer handoff receipt without private keys, seed phrases, raw transactions, or signed payload storage.";
  }
  if (gate.id === "settlement") {
    return "Prove submitted-to-landed confirmation, settlement reconciliation, and local portfolio mirror accounting with redacted receipts before live review.";
  }
  if (gate.id === "manual-live-review") {
    return "Complete the external manual-live review packet after wallet proof, Jupiter order proof, signer/custody, ops/accounting, and funded-canary proof are ready.";
  }
  return gate.next_action;
}

function liveUsabilityManualReviewNextAction(signoff: Web3ManualLiveReviewPacket["signoffs"][number]) {
  if (signoff.id === "provider-read-rail") {
    return signoff.status === "pass"
      ? "Keep read-provider credentials server-scoped and redacted before manual live review."
      : "Configure Helius/Solana read credentials and Jupiter route evidence in ignored server env or one-shot tests.";
  }
  if (signoff.id === "jupiter-order") {
    return "Add JUPITER_API_KEY in ignored server env or run a one-shot Settings Jupiter rehearsal, then run the strict --require-jupiter-order verifier; transaction bytes stay withheld.";
  }
  if (signoff.id === "signer-custody") {
    return "Choose manual external wallet custody or a reviewed policy signer, then build the signer handoff receipt without private keys, seed phrases, raw transactions, or signed payload storage.";
  }
  if (signoff.id === "settlement") {
    return "Prove submitted-to-landed confirmation, settlement reconciliation, and local portfolio mirror accounting with redacted receipts before live review.";
  }
  if (signoff.id === "manual-live-review") {
    return "Complete the external manual-live review packet after wallet proof, Jupiter order proof, signer/custody, ops/accounting, and funded-canary proof are ready.";
  }
  if (signoff.id === "supervised-runway") {
    return "Clear the supervised-live runway lanes for wallet proof, Jupiter order proof, signer/custody, ops, accounting, and manual review.";
  }
  if (signoff.id === "live-ops") {
    return "Refresh production supervisor, emergency-stop, worker, and accounting evidence before external manual live review.";
  }
  return signoff.next_action;
}

function liveUsabilityRunwayNextAction(lane: Web3SupervisedLiveRunway["lanes"][number]) {
  if (lane.id === "wallet") {
    return "Run Prove ownership with the connected browser wallet; this signs text only and cannot move funds.";
  }
  if (lane.id === "jupiter") {
    return "Install JUPITER_API_KEY in ignored server env for the funded canary; one-shot Settings rehearsal is evidence only and cannot arm the unsigned handoff.";
  }
  if (lane.id === "signer") {
    return "Choose manual external wallet custody or a reviewed policy signer after wallet proof and Jupiter order proof are ready.";
  }
  if (lane.id === "ops") {
    return "Refresh production supervisor evidence and configure emergency-stop plus worker targets for external review.";
  }
  if (lane.id === "accounting") {
    return "Set MASTERMOLD_TAX_LEDGER_EXPORT_PATH or choose an external accounting workflow.";
  }
  if (lane.id === "manual-review") {
    return "Keep live flags unset until external review approves process, signer, settlement, and emergency-stop controls.";
  }
  return lane.next_action;
}

function missingItemRank(item: Web3LiveUsabilityMissingItem) {
  const dependencyRank = [
    "cutover:dedicated-trading-wallet",
    "preflight:operator-wallet",
    "runway:wallet",
    "cutover:wallet-ownership-proof",
    "cutover:jupiter-route-order-key",
    "runway:jupiter",
    "preflight:jupiter-order",
    "cutover:signer-custody-choice",
    "cutover:signer-provider-credentials",
    "preflight:signer-custody",
    "runway:signer",
    "cutover:emergency-stop-target",
    "cutover:production-worker-ops",
    "preflight:kill-switch",
    "runway:ops",
    "cutover:accounting-export-target",
    "cutover:settlement-accounting-review",
    "preflight:settlement",
    "runway:accounting",
    "cutover:manual-live-approval",
    "preflight:manual-live-review",
    "runway:manual-review",
  ].indexOf(item.id);
  if (dependencyRank >= 0) return dependencyRank;

  const statusRank = item.status === "blocked" || item.status === "fail" ? 0 : item.status === "needed" ? 1 : 2;
  const sourceRank = item.source === "cutover" ? 0 : item.source === "preflight" ? 5 : item.source === "manual-review" ? 10 : 15;
  return 100 + statusRank + sourceRank;
}

function liveUsabilityNextAction(
  status: Web3LiveUsabilityBlockersReceipt["status"],
  input: {
    cutover: Web3CutoverBlockerBoard;
    manualLiveReview: Web3ManualLiveReviewPacket;
    runbook: Web3OperatorRunbookReceipt;
  },
  missing: Web3LiveUsabilityMissingItem[],
) {
  if (status === "live-review-ready") {
    return "Export the manual live-review packet to an external reviewer; keep Mastermind signing and submission blocked.";
  }
  if (status === "operator-input-needed") {
    return input.cutover.next_safe_input?.next_action ?? missing[0]?.next_action ?? "Provide the next safe public/env-target input in Settings.";
  }
  if (status === "external-review-needed") {
    return input.manualLiveReview.next_action ?? missing[0]?.next_action ?? "Clear manual-review signoffs before requesting supervised live review.";
  }
  return input.runbook.run_now.find((action) => action.id === "autonomous-live-trading")?.next_action ??
    "Keep autonomous live trading locked until an external executor, custody, risk, settlement, and legal review exist.";
}

function liveUsabilitySummary(
  status: Web3LiveUsabilityBlockersReceipt["status"],
  input: {
    cutover: Web3CutoverBlockerBoard;
    manualLiveReview: Web3ManualLiveReviewPacket;
    runway: Web3SupervisedLiveRunway;
    rowScope?: "compact" | "all";
  },
  missing: Web3LiveUsabilityMissingItem[],
  autonomousLiveDetail?: string,
) {
  if (status === "live-review-ready") {
    return "Supervised live review can be requested externally; Mastermind still blocks signing, submission, wallet mutation, and autonomous live trading.";
  }
  if (status === "operator-input-needed") {
    const listedCount = input.rowScope === "all" ? missing.length : Math.min(missing.length, 14);
    if (input.rowScope === "all") {
      return `${input.cutover.open_blocker_count} cutover setup blocker${input.cutover.open_blocker_count === 1 ? "" : "s"} and ${missing.length} total live-usability row${missing.length === 1 ? "" : "s"} remain before real-money usability can be reviewed; all dependency-ranked rows are listed.`;
    }
    return `${input.cutover.open_blocker_count} cutover setup blocker${input.cutover.open_blocker_count === 1 ? "" : "s"} and ${missing.length} total live-usability row${missing.length === 1 ? "" : "s"} remain before real-money usability can be reviewed; the first ${listedCount} dependency-ranked row${listedCount === 1 ? "" : "s"} are listed.`;
  }
  if (status === "external-review-needed") {
    return `${input.manualLiveReview.failed_signoff_count + input.manualLiveReview.watch_signoff_count} live-review signoff${input.manualLiveReview.failed_signoff_count + input.manualLiveReview.watch_signoff_count === 1 ? "" : "s"} still need review; ${input.runway.ready_lane_count}/${input.runway.total_lane_count} supervised lanes are ready.`;
  }
  return autonomousLiveDetail ?? `${missing.length} blockers remain and autonomous live trading is locked inside the app.`;
}

function safeWalletCommandValue(walletPublicKey: string | null | undefined) {
  if (typeof walletPublicKey !== "string") return null;
  const trimmed = walletPublicKey.trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed)) return null;
  return trimmed;
}

function walletStrictVerifierCommand(walletPublicKey: string | null | undefined) {
  const wallet = safeWalletCommandValue(walletPublicKey);
  return wallet
    ? `npm run verify:web3 -- --base-url=http://localhost:4010 --wallet=${wallet} --require-operator-wallet`
    : null;
}

function walletScopedCommand(command: string | null | undefined, walletPublicKey: string | null | undefined) {
  if (!command) return null;
  const wallet = safeWalletCommandValue(walletPublicKey);
  if (!wallet) return command;
  if (command.includes("--wallet=<public-solana-address>")) {
    return command.replaceAll("--wallet=<public-solana-address>", `--wallet=${wallet}`);
  }
  if (command.includes("--require-operator-wallet") && !command.includes("--wallet=")) {
    return command.replace("--require-operator-wallet", `--wallet=${wallet} --require-operator-wallet`);
  }
  return command;
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
