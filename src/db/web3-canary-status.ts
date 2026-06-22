import { createHash } from "node:crypto";
import type { Web3LiveIgnitionReceipt } from "./web3-live-ignition";
import type { Web3LiveTradeCanaryReceipt, Web3LiveTradeCanaryRequiredInput } from "./web3-live-trade-canary";
import type { Web3LocalCredentialInstallReceipt } from "./web3-local-credential-install";

export type Web3CanaryStatusReceipt = {
  mode: "web3-canary-status";
  status: "blocked" | "ready-for-supervised-canary" | "canary-proven" | "can-autonomously-trade";
  generated_at: string;
  receipt_hash: string;
  source: Web3LiveIgnitionReceipt["source"];
  account: Web3LiveIgnitionReceipt["account"];
  scenario: Web3LiveIgnitionReceipt["scenario"];
  actual_live_trade_tested: boolean;
  real_funds_moved_by_this_app: boolean;
  can_start_supervised_canary_now: boolean;
  can_autonomously_trade_real_money_now: boolean;
  next_gate_id: Web3LiveIgnitionReceipt["next_gate_id"];
  next_gate_label: Web3LiveIgnitionReceipt["next_gate_label"];
  next_required_input_id: Web3LiveTradeCanaryRequiredInput["id"] | null;
  next_required_input_label: string | null;
  next_action: string;
  safe_next_commands: Web3CanaryStatusSafeCommand[];
  blocker_count: number;
  signed_relay_status: Web3LiveTradeCanaryReceipt["signed_relay_status"];
  current_request_id: string | null;
  latest_signature_preview: string | null;
  local_credentials: {
    status: Web3LocalCredentialInstallReceipt["status"];
    configured_count: number;
    missing_count: number;
    configured_keys: string[];
    missing_keys: string[];
    runtime_effective: boolean;
    next_action: string;
  };
  alignment: {
    status: "pass";
    detail: string;
  };
  http_status: {
    canary: number;
    ignition: number;
    local: number;
  };
  canary_endpoint: string;
  ignition_endpoint: string;
  local_credentials_endpoint: "/api/web3-local-credentials";
  transaction_submission_permission: Web3LiveTradeCanaryReceipt["transaction_submission_permission"];
  live_execution_permission: Web3LiveIgnitionReceipt["live_execution_permission"];
  wallet_mutation_permission: "blocked";
  private_key_storage: "blocked";
  seed_phrase_storage: "blocked";
  secret_echo_permission: "blocked";
  controls: string[];
};

export type Web3CanaryStatusSafeCommand = {
  id: string;
  label: string;
  command: string;
  purpose: string;
  safe_surface: string;
  completion_signal: string;
  uses_placeholder: boolean;
  live_execution_permission: "blocked";
  transaction_submission_permission: "blocked";
  wallet_mutation_permission: "blocked";
  secret_echo_permission: "blocked";
};

const strictGateMap: Partial<Record<Web3LiveTradeCanaryRequiredInput["id"], NonNullable<Web3LiveIgnitionReceipt["next_gate_id"]>>> = {
  "dedicated-public-wallet": "wallet-scope",
  "wallet-ownership-proof": "wallet-ownership",
  "jupiter-order-rail": "route-order",
};

export function buildWeb3CanaryStatusReceipt(input: {
  canary: Web3LiveTradeCanaryReceipt;
  ignition: Web3LiveIgnitionReceipt;
  localCredentials: Web3LocalCredentialInstallReceipt;
  httpStatus?: {
    canary?: number;
    ignition?: number;
    local?: number;
  };
  now?: Date;
}): Web3CanaryStatusReceipt {
  assertWeb3CanaryStatusSources(input);
  const generatedAt = (input.now ?? new Date()).toISOString();
  const nextRequiredInput = input.canary.next_required_input;
  const expectedIgnitionGate = nextRequiredInput ? strictGateMap[nextRequiredInput.id] ?? null : null;
  const alignmentDetail = expectedIgnitionGate
    ? `Canary next input ${nextRequiredInput?.id} maps to ignition gate ${input.ignition.next_gate_id}.`
    : `Canary next input ${nextRequiredInput?.id ?? "none"} has no strict ignition mapping.`;
  const canStartSupervisedCanary = input.ignition.can_start_supervised_canary_now;
  const canAutonomouslyTrade = input.ignition.can_autonomously_trade_real_money_now;
  const actualLiveTradeTested = input.canary.actual_live_trade_tested || input.ignition.actual_live_trade_tested;
  const realFundsMoved = input.canary.real_funds_moved_by_this_app || input.ignition.real_funds_moved_by_this_app;
  const status: Web3CanaryStatusReceipt["status"] = canAutonomouslyTrade
    ? "can-autonomously-trade"
    : actualLiveTradeTested && realFundsMoved
      ? "canary-proven"
      : canStartSupervisedCanary
        ? "ready-for-supervised-canary"
        : "blocked";
  const endpointParams = `source=${input.ignition.source}&account=${input.ignition.account}&scenario=${input.ignition.scenario}&cycles=0`;
  const safeNextCommands = buildSafeNextCommands(input.canary, endpointParams);
  const receiptBase = {
    mode: "web3-canary-status" as const,
    status,
    generated_at: generatedAt,
    source: input.ignition.source,
    account: input.ignition.account,
    scenario: input.ignition.scenario,
    actual_live_trade_tested: actualLiveTradeTested,
    real_funds_moved_by_this_app: realFundsMoved,
    can_start_supervised_canary_now: canStartSupervisedCanary,
    can_autonomously_trade_real_money_now: canAutonomouslyTrade,
    next_gate_id: input.ignition.next_gate_id,
    next_gate_label: input.ignition.next_gate_label,
    next_required_input_id: nextRequiredInput?.id ?? null,
    next_required_input_label: nextRequiredInput?.label ?? null,
    next_action: input.ignition.next_action || input.canary.next_action,
    safe_next_commands: safeNextCommands,
    blocker_count: Math.max(input.ignition.blocker_count, input.canary.blockers.length),
    signed_relay_status: input.canary.signed_relay_status,
    current_request_id: input.canary.current_request_id,
    latest_signature_preview: input.canary.latest_signature_preview,
    local_credentials: {
      status: input.localCredentials.status,
      configured_count: input.localCredentials.configured_keys.length,
      missing_count: input.localCredentials.missing_keys.length,
      configured_keys: input.localCredentials.configured_keys,
      missing_keys: input.localCredentials.missing_keys,
      runtime_effective: input.localCredentials.runtime_effective,
      next_action: input.localCredentials.runtime_effective_next_action || input.localCredentials.next_action,
    },
    alignment: {
      status: "pass" as const,
      detail: alignmentDetail,
    },
    http_status: {
      canary: input.httpStatus?.canary ?? 200,
      ignition: input.httpStatus?.ignition ?? 200,
      local: input.httpStatus?.local ?? 200,
    },
    canary_endpoint: `/api/web3-live-trade-canary?${endpointParams}`,
    ignition_endpoint: `/api/web3-live-ignition?${endpointParams}`,
    local_credentials_endpoint: "/api/web3-local-credentials" as const,
    transaction_submission_permission: input.canary.transaction_submission_permission,
    live_execution_permission: input.ignition.live_execution_permission,
    wallet_mutation_permission: "blocked" as const,
    private_key_storage: "blocked" as const,
    seed_phrase_storage: "blocked" as const,
    secret_echo_permission: "blocked" as const,
    controls: [
      "This receipt reconciles live-canary truth, bot ignition, and local credential status from the running app.",
      "A running app can be tested without executing a funded trade; actual_live_trade_tested stays false until the signed canary proof chain is real.",
      "Private keys, seed phrases, API key values, raw transactions, signed payload storage, wallet mutation, and secret echo remain blocked.",
    ],
  };

  return {
    ...receiptBase,
    receipt_hash: hashJson(receiptBase),
  };
}

function buildSafeNextCommands(canary: Web3LiveTradeCanaryReceipt, endpointParams: string): Web3CanaryStatusSafeCommand[] {
  const nextInput = canary.next_required_input;
  const statusCommand = "npm run status-canary:web3 -- --base-url=http://localhost:4010 --json";
  const common = {
    live_execution_permission: "blocked" as const,
    transaction_submission_permission: "blocked" as const,
    wallet_mutation_permission: "blocked" as const,
    secret_echo_permission: "blocked" as const,
  };
  const commands: Web3CanaryStatusSafeCommand[] = [];

  if (nextInput?.id === "dedicated-public-wallet") {
    commands.push(
      {
        id: "validate-public-wallet",
        label: "Validate public wallet",
        command: "npm run validate-wallet:web3 -- --base-url=http://localhost:4010 --wallet=<public-solana-address> --json",
        purpose: "Checks the public wallet and proof runway without saving state.",
        safe_surface: "/api/web3-dedicated-wallet-intake-contract",
        completion_signal: "The validation receipt reports valid-public-wallet and can_save_public_scope=true.",
        uses_placeholder: true,
        ...common,
      },
      {
        id: "save-public-wallet-scope",
        label: "Save public wallet scope",
        command: "npm run scope-wallet:web3 -- --base-url=http://localhost:4010 --wallet=<public-solana-address> --save --json",
        purpose: "Saves only the dedicated public wallet and dry-run caps, then refreshes canary status.",
        safe_surface: nextInput.safe_surface,
        completion_signal: "The canary status next gate advances to wallet-ownership.",
        uses_placeholder: true,
        ...common,
      },
      {
        id: "fetch-wallet-ownership-challenge",
        label: "Fetch ownership challenge after scope",
        command: "npm run prove-wallet:web3 -- --base-url=http://localhost:4010 --wallet=<public-solana-address> --json",
        purpose: "Fetches public text for browser-wallet ownership proof after the public wallet is scoped.",
        safe_surface: "/api/web3-wallet-ownership",
        completion_signal: "The command returns status=challenge-ready and message_base64 for external message signing.",
        uses_placeholder: true,
        ...common,
      },
    );
  } else if (nextInput?.id === "wallet-ownership-proof") {
    const scopedWallet = extractPublicWalletFromVerifierCommand(nextInput.verifier_command);
    const walletArg = scopedWallet ?? "<scoped-public-solana-address>";
    commands.push(
      {
        id: "fetch-wallet-ownership-challenge",
        label: "Fetch ownership challenge",
        command: `npm run prove-wallet:web3 -- --base-url=http://localhost:4010 --wallet=${walletArg} --json`,
        purpose: "Fetches the text-only challenge for the already scoped public wallet.",
        safe_surface: "/api/web3-wallet-ownership",
        completion_signal: "The command returns status=challenge-ready and message_base64 for external message signing.",
        uses_placeholder: scopedWallet === null,
        ...common,
      },
      {
        id: "submit-wallet-ownership-proof",
        label: "Submit ownership signature",
        command: `npm run prove-wallet:web3 -- --base-url=http://localhost:4010 --wallet=${walletArg} --message-base64=<challenge-text-base64> --signature-base64=<wallet-message-signature> --json`,
        purpose: "Submits an external browser-wallet message signature and stores hash-only proof.",
        safe_surface: "/api/web3-wallet-ownership",
        completion_signal: "The proof receipt reports proof-verified and the live canary sees wallet_ownership_current_for_canary=true.",
        uses_placeholder: true,
        ...common,
      },
    );
  } else if (nextInput?.id === "jupiter-order-rail") {
    commands.push({
      id: "print-jupiter-requirements",
      label: "Print Jupiter requirements",
      command: "npm run requirements:web3 -- --base-url=http://localhost:4010 --json",
      purpose: "Prints the safe JUPITER_API_KEY target, storage rule, and current wallet/order gate without exposing secret values.",
      safe_surface: nextInput.safe_surface,
      completion_signal: "The requirements packet names JUPITER_API_KEY as the active order-rail target and keeps live authority blocked.",
      uses_placeholder: false,
      ...common,
    });
  } else if (nextInput?.id === "first-canary-live-flags") {
    commands.push({
      id: "print-live-flag-requirements",
      label: "Print live-flag requirements",
      command: "npm run requirements:web3 -- --base-url=http://localhost:4010 --json",
      purpose: "Prints the exact first-canary live flag target names and accepted values for ignored local env.",
      safe_surface: nextInput.safe_surface,
      completion_signal: "The requirements packet names the three first-canary live flags while signing, submission, and wallet mutation remain blocked.",
      uses_placeholder: false,
      ...common,
    });
  }

  if (nextInput?.verifier_command) {
    commands.push({
      id: `${nextInput.id}-strict-verifier`,
      label: `${nextInput.label} verifier`,
      command: nextInput.verifier_command,
      purpose: "Runs the strict verifier for the current required input without granting live authority.",
      safe_surface: nextInput.safe_surface,
      completion_signal: nextInput.completion_signal,
      uses_placeholder: nextInput.verifier_command.includes("<"),
      ...common,
    });
  }

  commands.push({
    id: "rerun-canary-status",
    label: "Rerun canary status",
    command: statusCommand,
    purpose: "Confirms the running app's next gate after the safe input is handled.",
    safe_surface: `/api/web3-canary-status?${endpointParams}`,
    completion_signal: "The status receipt shows the next gate changed, or still names the active blocker.",
    uses_placeholder: false,
    ...common,
  });

  return dedupeCommands(commands).slice(0, 5);
}

function extractPublicWalletFromVerifierCommand(command: string | null) {
  const match = command?.match(/--wallet=([1-9A-HJ-NP-Za-km-z]{32,44})(?:\s|$)/);
  return match?.[1] ?? null;
}

function dedupeCommands(commands: Web3CanaryStatusSafeCommand[]) {
  const seen = new Set<string>();
  return commands.filter((command) => {
    if (seen.has(command.command)) return false;
    seen.add(command.command);
    return true;
  });
}

export function assertWeb3CanaryStatusSources(input: {
  canary: Web3LiveTradeCanaryReceipt;
  ignition: Web3LiveIgnitionReceipt;
  localCredentials: Web3LocalCredentialInstallReceipt;
  httpStatus?: {
    canary?: number;
    ignition?: number;
    local?: number;
  };
}) {
  assert(input.canary.mode === "web3-live-trade-canary", "Live canary should expose the expected mode.");
  assert(input.ignition.mode === "web3-live-ignition", "Live ignition should expose the expected mode.");
  assert(input.localCredentials.mode === "web3-local-credential-install", "Local credentials should expose the expected mode.");
  assert(isKnownStatus(input.httpStatus?.canary ?? 200), "Live canary should use a known HTTP status.");
  assert(isKnownStatus(input.httpStatus?.ignition ?? 200), "Live ignition should use a known HTTP status.");
  assert(isKnownStatus(input.httpStatus?.local ?? 200), "Local credentials should use a known HTTP status.");
  assert(input.canary.actual_live_trade_tested === input.ignition.actual_live_trade_tested, "Canary and ignition disagree on actual live trade proof.");
  assert(input.canary.real_funds_moved_by_this_app === input.ignition.real_funds_moved_by_this_app, "Canary and ignition disagree on real fund movement.");
  if (!input.canary.actual_live_trade_tested) {
    assert(input.ignition.can_autonomously_trade_real_money_now === false, "Ignition cannot claim autonomy before a funded live canary is proven.");
  }
  const nextRequiredInput = input.canary.next_required_input;
  const expectedIgnitionGate = nextRequiredInput ? strictGateMap[nextRequiredInput.id] ?? null : null;
  if (expectedIgnitionGate) {
    assert(input.ignition.next_gate_id === expectedIgnitionGate, "Live canary and ignition disagree on the next gate.");
  }
  assert(input.localCredentials.live_execution_permission === "blocked", "Local credentials must keep live execution blocked.");
  assert(input.localCredentials.wallet_mutation_permission === "blocked", "Local credentials must keep wallet mutation blocked.");
  assert(input.localCredentials.secret_echo_permission === "blocked", "Local credentials must keep secret echo blocked.");
  assert(input.canary.wallet_mutation_permission === "blocked", "Live canary must keep wallet mutation blocked.");
  assert(input.canary.private_key_storage === "blocked", "Live canary must keep private key storage blocked.");
  assert(input.canary.seed_phrase_storage === "blocked", "Live canary must keep seed phrase storage blocked.");
  assert(input.canary.secret_echo_permission === "blocked", "Live canary must keep secret echo blocked.");
  assert(input.ignition.wallet_mutation_permission === "blocked", "Live ignition must keep wallet mutation blocked.");
  assert(input.ignition.private_key_storage === "blocked", "Live ignition must keep private key storage blocked.");
  assert(input.ignition.seed_phrase_storage === "blocked", "Live ignition must keep seed phrase storage blocked.");
  assert(input.ignition.secret_echo_permission === "blocked", "Live ignition must keep secret echo blocked.");
  assert(input.ignition.next_action.length > 0, "Ignition should include a next action.");
}

function isKnownStatus(status: number) {
  return [200, 403, 409, 422].includes(status);
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
