import { createHash } from "node:crypto";
import type { Web3LiveTestLedgerReceipt, Web3LiveTestLedgerRow } from "./web3-live-test-ledger";
import type { Web3LiveUsabilityBlockersReceipt } from "./web3-live-usability-blockers";
import type { Web3LocalCredentialInstallReceipt } from "./web3-local-credential-install";

export type Web3LiveUsabilitySummaryLane = {
  id: "paper-autonomy" | "live-dex-read" | "order-rehearsal" | "live-flags" | "funded-wallet-trade" | "autonomous-real-capital";
  label: string;
  status: "usable" | "review" | "blocked";
  evidence_type: Web3LiveTestLedgerRow["evidence_type"] | "external-review";
  counts_as_funded_trade_proof: boolean;
  next_action: string;
};

export type Web3LiveUsabilitySummaryReceipt = {
  mode: "web3-live-usability-summary";
  status: "operator-input-needed" | "verification-needed" | "funded-canary-needed" | "external-review-needed" | "usable-for-funded-autonomy";
  generated_at: string;
  receipt_hash: string;
  source: Web3LiveUsabilityBlockersReceipt["source"];
  account: Web3LiveUsabilityBlockersReceipt["account"];
  scenario: Web3LiveUsabilityBlockersReceipt["scenario"];
  actual_live_trade_tested: boolean;
  real_funds_moved_by_this_app: boolean;
  funded_trade_attempted_by_this_app: boolean;
  can_trade_real_capital_now: boolean;
  can_run_unattended_now: boolean;
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  transaction_submission_permission: "blocked";
  signing_permission: "blocked";
  private_key_storage: "blocked";
  seed_phrase_storage: "blocked";
  secret_echo_permission: "blocked";
  current_input: {
    id: string;
    label: string;
    safe_surface: string;
    storage: string;
    verifier_command: string | null;
    next_action: string;
  } | null;
  next_blocker: Web3LiveUsabilityBlockersReceipt["next_blocker"];
  local_credentials: {
    status: Web3LocalCredentialInstallReceipt["status"];
    configured_count: number;
    missing_count: number;
    runtime_effective: boolean;
    runtime_applied_keys: string[];
    runtime_restart_required_keys: string[];
    next_action: string;
  };
  counts: {
    real_capital_blockers: number;
    open_operator_inputs: number;
    credential_requirements_open: number;
    live_usability_rows: number;
    funded_proof_rows_ready: number;
  };
  lanes: Web3LiveUsabilitySummaryLane[];
  evidence_endpoints: string[];
  safe_to_provide: string[];
  never_provide: string[];
  summary: string;
  next_action: string;
  controls: string[];
};

export function buildWeb3LiveUsabilitySummaryReceipt(input: {
  liveUsability: Web3LiveUsabilityBlockersReceipt;
  liveTestLedger: Web3LiveTestLedgerReceipt;
  localCredentials: Web3LocalCredentialInstallReceipt;
  now?: Date;
}): Web3LiveUsabilitySummaryReceipt {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const fundedProofReady = input.liveTestLedger.rows.filter((row) =>
    row.counts_as_funded_trade_proof && row.status === "pass"
  ).length;
  const canTradeRealCapital = input.liveTestLedger.actual_live_trade_tested &&
    input.liveTestLedger.real_funds_moved_by_this_app &&
    input.liveUsability.real_capital_blocker_count === 0 &&
    input.liveUsability.supervised_review_ready;
  const currentInput = currentInputFrom(input.liveUsability);
  const status = summaryStatus({
    actualLiveTradeTested: input.liveTestLedger.actual_live_trade_tested,
    blockerCount: input.liveUsability.real_capital_blocker_count,
    openInputs: input.liveUsability.open_operator_input_count,
    canTradeRealCapital,
  });
  const lanes = buildSummaryLanes(input, canTradeRealCapital);
  const nextAction = canTradeRealCapital
    ? "External live review can inspect proof, caps, kill switch, and worker readiness before any autonomous real-capital enablement."
    : currentInput?.next_action ??
      input.liveUsability.next_blocker?.next_action ??
      input.liveTestLedger.next_action;
  const receiptBase = {
    mode: "web3-live-usability-summary" as const,
    status,
    generated_at: generatedAt,
    source: input.liveUsability.source,
    account: input.liveUsability.account,
    scenario: input.liveUsability.scenario,
    actual_live_trade_tested: input.liveTestLedger.actual_live_trade_tested,
    real_funds_moved_by_this_app: input.liveTestLedger.real_funds_moved_by_this_app,
    funded_trade_attempted_by_this_app: input.liveTestLedger.funded_trade_attempted_by_this_app,
    can_trade_real_capital_now: canTradeRealCapital,
    can_run_unattended_now: false,
    live_execution_permission: "blocked" as const,
    wallet_mutation_permission: "blocked" as const,
    transaction_submission_permission: "blocked" as const,
    signing_permission: "blocked" as const,
    private_key_storage: "blocked" as const,
    seed_phrase_storage: "blocked" as const,
    secret_echo_permission: "blocked" as const,
    current_input: currentInput,
    next_blocker: input.liveUsability.next_blocker,
    local_credentials: {
      status: input.localCredentials.status,
      configured_count: input.localCredentials.configured_keys.length,
      missing_count: input.localCredentials.missing_keys.length,
      runtime_effective: input.localCredentials.runtime_effective,
      runtime_applied_keys: input.localCredentials.runtime_applied_keys,
      runtime_restart_required_keys: input.localCredentials.runtime_restart_required_keys,
      next_action: input.localCredentials.next_action,
    },
    counts: {
      real_capital_blockers: input.liveUsability.real_capital_blocker_count,
      open_operator_inputs: input.liveUsability.open_operator_input_count,
      credential_requirements_open: input.liveUsability.next_credential_request ? 1 : 0,
      live_usability_rows: input.liveUsability.total_live_usability_row_count,
      funded_proof_rows_ready: fundedProofReady,
    },
    lanes,
    evidence_endpoints: Array.from(new Set([
      "/api/web3-dedicated-wallet-intake-contract?scenario=breakout&account=persistent&cycles=0",
      "/api/web3-live-usability-blockers?source=live-dex&account=persistent&scenario=breakout&cycles=0&rows=all",
      "/api/web3-live-test-ledger?source=live-dex&account=persistent&scenario=breakout&cycles=0",
      "/api/web3-local-credentials",
      ...input.liveUsability.evidence_endpoints,
    ])),
    safe_to_provide: input.liveUsability.safe_to_provide,
    never_provide: input.liveUsability.never_provide,
    summary: summaryText(status, input),
    next_action: nextAction,
    controls: [
      "This summary is a usability receipt only; it cannot sign, submit, custody funds, mutate wallets, or enable autonomous real-capital trading.",
      "Paper autonomy, read-only DEX data, order rehearsal, and live flag arming are useful setup evidence but are not funded trade proof.",
      "Real-money usability requires a dedicated public wallet, current ownership proof, Jupiter order rail, live canary flags, one externally signed tiny canary, settlement/accounting proof, and manual external review.",
      "Private keys, seed phrases, keypair JSON, raw transaction bytes, signed payload storage, provider secrets, and secret echo are not exposed by this receipt.",
    ],
  };

  return {
    ...receiptBase,
    receipt_hash: hashJson(receiptBase),
  };
}

export function buildWeb3LiveUsabilitySummaryFallbackReceipt(input: {
  source: Web3LiveTestLedgerReceipt["source"];
  account: Web3LiveTestLedgerReceipt["account"];
  scenario: Web3LiveTestLedgerReceipt["scenario"];
  liveTestLedger: Web3LiveTestLedgerReceipt;
  localCredentials: Web3LocalCredentialInstallReceipt;
  reason: string;
  now?: Date;
}): Web3LiveUsabilitySummaryReceipt {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const currentInput = input.liveTestLedger.next_required_input
    ? {
      id: input.liveTestLedger.next_required_input.id,
      label: input.liveTestLedger.next_required_input.label,
      safe_surface: input.liveTestLedger.next_required_input.safe_surface,
      storage: input.liveTestLedger.next_required_input.safe_value_type,
      verifier_command: input.liveTestLedger.next_required_input.verifier_command,
      next_action: input.liveTestLedger.next_action,
    }
    : null;
  const lanes = [
    ...input.liveTestLedger.rows.map((row): Web3LiveUsabilitySummaryLane => ({
      id: row.id,
      label: row.label,
      status: row.status === "pass" ? "usable" : row.status === "watch" ? "review" : "blocked",
      evidence_type: row.evidence_type,
      counts_as_funded_trade_proof: row.counts_as_funded_trade_proof,
      next_action: row.next_action,
    })),
    {
      id: "autonomous-real-capital" as const,
      label: "Autonomous real capital",
      status: "blocked" as const,
      evidence_type: "external-review" as const,
      counts_as_funded_trade_proof: false,
      next_action: "Restore the full live-usability blocker packet, then clear dedicated wallet, ownership, order, live flag, canary, settlement, accounting, and external review gates.",
    },
  ];
  const receiptBase = {
    mode: "web3-live-usability-summary" as const,
    status: "operator-input-needed" as const,
    generated_at: generatedAt,
    source: input.source,
    account: input.account,
    scenario: input.scenario,
    actual_live_trade_tested: input.liveTestLedger.actual_live_trade_tested,
    real_funds_moved_by_this_app: input.liveTestLedger.real_funds_moved_by_this_app,
    funded_trade_attempted_by_this_app: input.liveTestLedger.funded_trade_attempted_by_this_app,
    can_trade_real_capital_now: false,
    can_run_unattended_now: false,
    live_execution_permission: "blocked" as const,
    wallet_mutation_permission: "blocked" as const,
    transaction_submission_permission: "blocked" as const,
    signing_permission: "blocked" as const,
    private_key_storage: "blocked" as const,
    seed_phrase_storage: "blocked" as const,
    secret_echo_permission: "blocked" as const,
    current_input: currentInput,
    next_blocker: null,
    local_credentials: {
      status: input.localCredentials.status,
      configured_count: input.localCredentials.configured_keys.length,
      missing_count: input.localCredentials.missing_keys.length,
      runtime_effective: input.localCredentials.runtime_effective,
      runtime_applied_keys: input.localCredentials.runtime_applied_keys,
      runtime_restart_required_keys: input.localCredentials.runtime_restart_required_keys,
      next_action: input.localCredentials.next_action,
    },
    counts: {
      real_capital_blockers: 1,
      open_operator_inputs: currentInput ? 1 : 0,
      credential_requirements_open: currentInput ? 1 : 0,
      live_usability_rows: 0,
      funded_proof_rows_ready: 0,
    },
    lanes,
    evidence_endpoints: [
      "/api/web3-dedicated-wallet-intake-contract?scenario=breakout&account=persistent&cycles=0",
      "/api/web3-live-usability-summary?source=live-dex&account=persistent&scenario=breakout&cycles=0",
      "/api/web3-live-test-ledger?source=live-dex&account=persistent&scenario=breakout&cycles=0",
      "/api/web3-local-credentials",
    ],
    safe_to_provide: [
      "Dedicated public Solana wallet address.",
      "Provider and Jupiter credential values only through ignored local env or approved one-shot setup fields.",
      "Hash-only wallet ownership proof from a text message signature.",
    ],
    never_provide: [
      "Wallet private keys.",
      "Seed phrases or mnemonics.",
      "Keypair JSON.",
      "Raw transaction bytes or signed payloads in chat.",
      "Provider secrets outside the approved local credential installer.",
    ],
    summary: `Not usable for funded autonomous trading yet: ${input.reason} Next safe input: ${currentInput?.label ?? "review the live-test ledger"}.`,
    next_action: currentInput?.next_action ?? input.liveTestLedger.next_action,
    controls: [
      "This fallback summary failed closed because the full live-usability blocker packet could not be built quickly enough.",
      "It cannot sign, submit, custody funds, mutate wallets, or enable autonomous real-capital trading.",
      "Paper autonomy, read-only DEX data, order rehearsal, and live flag arming are not funded trade proof.",
      "Private keys, seed phrases, keypair JSON, raw transaction bytes, signed payload storage, provider secrets, and secret echo are not exposed by this receipt.",
    ],
  };

  return {
    ...receiptBase,
    receipt_hash: hashJson(receiptBase),
  };
}

function currentInputFrom(liveUsability: Web3LiveUsabilityBlockersReceipt): Web3LiveUsabilitySummaryReceipt["current_input"] {
  const request = liveUsability.next_credential_request;
  if (request) {
    return {
      id: request.id,
      label: request.label,
      safe_surface: actionableSurface(request.fix_href, request.safe_collection_surface),
      storage: request.storage,
      verifier_command: request.verifier_command,
      next_action: request.next_action,
    };
  }
  const input = liveUsability.current_input;
  if (!input) return null;
  return {
    id: input.id,
    label: input.label,
    safe_surface: actionableSurface(null, input.safe_collection_surface),
    storage: input.storage,
    verifier_command: input.verifier_command,
    next_action: input.next_action,
  };
}

function actionableSurface(fixHref: string | null | undefined, safeCollectionSurface: string) {
  if (fixHref && fixHref !== "#") return fixHref;
  if (safeCollectionSurface === "trading-console") return "/trading?source=live-dex&account=persistent&scenario=breakout#web3-live-canary-console";
  if (safeCollectionSurface === "settings-console") return "/settings/integrations#settings-web3-credentials-runway";
  return safeCollectionSurface;
}

function summaryStatus(input: {
  actualLiveTradeTested: boolean;
  blockerCount: number;
  openInputs: number;
  canTradeRealCapital: boolean;
}): Web3LiveUsabilitySummaryReceipt["status"] {
  if (input.canTradeRealCapital) return "usable-for-funded-autonomy";
  if (input.openInputs > 0) return "operator-input-needed";
  if (input.blockerCount > 0) return "verification-needed";
  if (!input.actualLiveTradeTested) return "funded-canary-needed";
  return "external-review-needed";
}

function buildSummaryLanes(
  input: {
    liveUsability: Web3LiveUsabilityBlockersReceipt;
    liveTestLedger: Web3LiveTestLedgerReceipt;
  },
  canTradeRealCapital: boolean,
): Web3LiveUsabilitySummaryLane[] {
  const ledgerLanes = input.liveTestLedger.rows.map((row): Web3LiveUsabilitySummaryLane => ({
    id: row.id,
    label: row.label,
    status: row.status === "pass" ? "usable" : row.status === "watch" ? "review" : "blocked",
    evidence_type: row.evidence_type,
    counts_as_funded_trade_proof: row.counts_as_funded_trade_proof,
    next_action: row.next_action,
  }));
  return [
    ...ledgerLanes,
    {
      id: "autonomous-real-capital",
      label: "Autonomous real capital",
      status: canTradeRealCapital ? "review" : "blocked",
      evidence_type: "external-review",
      counts_as_funded_trade_proof: false,
      next_action: canTradeRealCapital
        ? "Run external live review before any unattended worker can be considered."
        : input.liveUsability.next_action,
    },
  ];
}

function summaryText(
  status: Web3LiveUsabilitySummaryReceipt["status"],
  input: {
    liveUsability: Web3LiveUsabilityBlockersReceipt;
    liveTestLedger: Web3LiveTestLedgerReceipt;
  },
) {
  if (status === "usable-for-funded-autonomy") {
    return "Funded canary proof and live-usability gates are present, but this receipt still requires external review before autonomous real-capital enablement.";
  }
  if (!input.liveTestLedger.actual_live_trade_tested) {
    return `Not usable for funded autonomous trading yet: no funded wallet trade has been attempted by this app and ${input.liveUsability.real_capital_blocker_count} real-capital blocker${input.liveUsability.real_capital_blocker_count === 1 ? "" : "s"} remain.`;
  }
  return `Not usable for unattended funded autonomy yet: funded proof exists, but ${input.liveUsability.real_capital_blocker_count} real-capital blocker${input.liveUsability.real_capital_blocker_count === 1 ? "" : "s"} or external review gates remain.`;
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
