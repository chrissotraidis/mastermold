import { createHash } from "node:crypto";
import type { Web3AccountAcquisitionReceipt } from "./web3-account-acquisition";
import type { Web3AccountSetupReceipt } from "./web3-account-setup";
import type {
  Web3AutonomyLaunchChecklist,
  Web3AutonomyLaunchOperatorInput,
} from "./web3-launch-checklist";

export type Web3OperatorCredentialHandoffStatus =
  | "needs-operator-input"
  | "ready-for-dry-run-rehearsal"
  | "ready-for-manual-live-review";

export type Web3OperatorCredentialHandoffInput = {
  id: Web3AutonomyLaunchOperatorInput["id"];
  label: string;
  status: Web3AutonomyLaunchOperatorInput["status"];
  priority: "required-now" | "required-before-live" | "review-before-live";
  input_kind: "api-key" | "public-wallet" | "wallet-proof" | "signer-policy" | "ops-policy" | "approval";
  safe_collection_surface: "settings-console" | "browser-wallet" | "external-system" | "manual-review";
  can_enter_in_app: boolean;
  env_targets: string[];
  storage: Web3AutonomyLaunchOperatorInput["storage"];
  detail: string;
  next_action: string;
  verifier_command: string | null;
  secret_handling: string;
};

export type Web3OperatorCredentialHandoffReceipt = {
  mode: "web3-operator-credential-handoff";
  status: Web3OperatorCredentialHandoffStatus;
  generated_at: string;
  summary: string;
  next_action: string;
  receipt_hash: string;
  ready_count: number;
  required_count: number;
  open_required_count: number;
  next_input: Web3OperatorCredentialHandoffInput | null;
  inputs: Web3OperatorCredentialHandoffInput[];
  allowed_inputs: string[];
  never_request: string[];
  safe_commands: string[];
  account_creation_permission: "operator-external-only";
  external_signup_permission: "blocked";
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  transaction_submission_permission: "blocked";
  private_key_storage: "blocked";
  seed_phrase_storage: "blocked";
  secret_echo_permission: "blocked";
  controls: string[];
};

export function buildWeb3OperatorCredentialHandoffReceipt(input: {
  accountSetup: Web3AccountSetupReceipt;
  acquisition: Web3AccountAcquisitionReceipt;
  launchChecklist: Web3AutonomyLaunchChecklist;
}): Web3OperatorCredentialHandoffReceipt {
  const generatedAt = new Date().toISOString();
  const inputs = input.launchChecklist.operator_inputs_needed.map((item) =>
    buildHandoffInput(item, input.accountSetup, input.acquisition),
  );
  const requiredInputs = inputs.filter((item) => item.priority !== "review-before-live");
  const readyCount = inputs.filter((item) => item.status === "ready").length;
  const openRequiredCount = requiredInputs.filter((item) => item.status !== "ready").length;
  const launchNextInput = input.launchChecklist.next_operator_action;
  const nextInput = launchNextInput
    ? inputs.find((item) => item.id === launchNextInput.id) ?? null
    : inputs.find((item) => item.status === "needed" || item.status === "blocked") ??
    inputs.find((item) => item.status === "review") ??
    null;
  const status: Web3OperatorCredentialHandoffStatus = input.launchChecklist.live_review_permitted
    ? "ready-for-manual-live-review"
    : openRequiredCount === 0 && input.accountSetup.status !== "missing-read-rail" && input.accountSetup.status !== "missing-execution-rail"
      ? "ready-for-dry-run-rehearsal"
      : "needs-operator-input";

  const receiptBase = {
    mode: "web3-operator-credential-handoff" as const,
    status,
    generated_at: generatedAt,
    summary: handoffSummary(status, readyCount, inputs.length, openRequiredCount, nextInput),
    next_action: nextInput?.next_action ?? input.launchChecklist.next_action,
    ready_count: readyCount,
    required_count: requiredInputs.length,
    open_required_count: openRequiredCount,
    next_input: nextInput,
    inputs,
    allowed_inputs: [
      "HELIUS_API_KEY or SOLANA_RPC_URL in ignored server env",
      "JUPITER_API_KEY in ignored server env or one-shot credential test",
      "Dedicated Solana public wallet address",
      "Browser-wallet text-message ownership proof",
      "Signer provider mode plus reviewed provider API credentials",
      "Emergency-stop owner/contact or webhook target",
      "Accounting/export target for reviewed fill records",
      "Manual live-review approval outside the app",
    ],
    never_request: [
      "Wallet private key",
      "Seed phrase or mnemonic",
      "Raw keypair JSON",
      "Session private key",
      "Unsigned or signed transaction bytes for storage",
      "Unrestricted signer policy",
      "Exchange/broker trade authority unrelated to Web3 dry-run review",
    ],
    safe_commands: [
      "npm run verify:web3 -- --base-url=http://localhost:4010",
      "npm run verify:web3 -- --base-url=http://localhost:4010 --require-dex-live",
      "npm run verify:web3 -- --base-url=http://localhost:4010 --wallet=<public-solana-address> --require-operator-wallet",
      "npm run verify:web3 -- --base-url=http://localhost:4010 --require-jupiter-order",
      "npm run monitor:web3 -- --base-url=http://localhost:4010 --source=live-dex --json",
      "npm run landing-drill:web3",
    ],
    account_creation_permission: "operator-external-only" as const,
    external_signup_permission: "blocked" as const,
    live_execution_permission: "blocked" as const,
    wallet_mutation_permission: "blocked" as const,
    transaction_submission_permission: "blocked" as const,
    private_key_storage: "blocked" as const,
    seed_phrase_storage: "blocked" as const,
    secret_echo_permission: "blocked" as const,
    controls: [
      "This receipt is a credential handoff contract, not a live executor.",
      "It can guide setup and verifier commands, but it cannot create provider accounts, sign, submit, custody funds, or mutate wallets.",
      "Configured secrets are reported only as configured/missing booleans and env target names.",
      "Private keys, seed phrases, raw keypairs, raw transaction bodies, signed payloads, live execution, wallet mutation, and secret echo stay blocked.",
    ],
  };

  return {
    ...receiptBase,
    receipt_hash: hashJson(receiptBase),
  };
}

function buildHandoffInput(
  item: Web3AutonomyLaunchOperatorInput,
  accountSetup: Web3AccountSetupReceipt,
  acquisition: Web3AccountAcquisitionReceipt,
): Web3OperatorCredentialHandoffInput {
  const envTargets = envTargetsForInput(item.id);
  return {
    id: item.id,
    label: item.label,
    status: item.status,
    priority: priorityForInput(item.id),
    input_kind: inputKindForInput(item.id),
    safe_collection_surface: collectionSurfaceForInput(item.id),
    can_enter_in_app: canEnterInApp(item.id),
    env_targets: envTargets,
    storage: item.storage,
    detail: detailForInput(item, accountSetup, acquisition),
    next_action: item.next_action,
    verifier_command: verifierCommandForInput(item.id),
    secret_handling: item.secret_handling,
  };
}

function priorityForInput(id: Web3AutonomyLaunchOperatorInput["id"]): Web3OperatorCredentialHandoffInput["priority"] {
  if (id === "manual-live-approval" || id === "settlement-accounting-review") return "review-before-live";
  if (id === "signer-provider-credentials" || id === "signer-custody-choice") return "required-before-live";
  return "required-now";
}

function inputKindForInput(id: Web3AutonomyLaunchOperatorInput["id"]): Web3OperatorCredentialHandoffInput["input_kind"] {
  if (id === "helius-solana-read-rail" || id === "jupiter-route-order-key") return "api-key";
  if (id === "dedicated-trading-wallet") return "public-wallet";
  if (id === "wallet-ownership-proof") return "wallet-proof";
  if (id === "signer-custody-choice" || id === "signer-provider-credentials") return "signer-policy";
  if (id === "settlement-accounting-review") return "ops-policy";
  return "approval";
}

function collectionSurfaceForInput(id: Web3AutonomyLaunchOperatorInput["id"]): Web3OperatorCredentialHandoffInput["safe_collection_surface"] {
  if (id === "wallet-ownership-proof") return "browser-wallet";
  if (id === "manual-live-approval" || id === "settlement-accounting-review") return "manual-review";
  if (id === "signer-custody-choice") return "external-system";
  return "settings-console";
}

function canEnterInApp(id: Web3AutonomyLaunchOperatorInput["id"]) {
  return id === "helius-solana-read-rail" ||
    id === "jupiter-route-order-key" ||
    id === "dedicated-trading-wallet" ||
    id === "wallet-ownership-proof" ||
    id === "signer-provider-credentials";
}

function envTargetsForInput(id: Web3AutonomyLaunchOperatorInput["id"]) {
  const targets: Record<Web3AutonomyLaunchOperatorInput["id"], string[]> = {
    "helius-solana-read-rail": ["HELIUS_API_KEY", "SOLANA_RPC_URL", "SOLANA_WS_URL"],
    "dedicated-trading-wallet": ["wallet_public_key"],
    "wallet-ownership-proof": ["hash-only wallet ownership receipt"],
    "jupiter-route-order-key": ["JUPITER_API_KEY"],
    "signer-custody-choice": ["MASTERMOLD_AUTONOMOUS_SIGNER_PROVIDER"],
    "signer-provider-credentials": [
      "PRIVY_APP_ID",
      "PRIVY_APP_SECRET",
      "PRIVY_SOLANA_WALLET_ID",
      "TURNKEY_ORGANIZATION_ID",
      "TURNKEY_API_PUBLIC_KEY",
      "TURNKEY_API_PRIVATE_KEY",
      "TURNKEY_SOLANA_WALLET_ACCOUNT",
      "MASTERMOLD_SESSION_KEY_PUBLIC_KEY",
      "MASTERMOLD_SESSION_POLICY_HASH",
    ],
    "settlement-accounting-review": ["MASTERMOLD_TAX_LEDGER_EXPORT_PATH"],
    "manual-live-approval": ["MASTERMOLD_LIVE_OPERATOR_APPROVAL"],
  };
  return targets[id];
}

function verifierCommandForInput(id: Web3AutonomyLaunchOperatorInput["id"]) {
  if (id === "dedicated-trading-wallet" || id === "wallet-ownership-proof") {
    return "npm run verify:web3 -- --base-url=http://localhost:4010 --wallet=<public-solana-address> --require-operator-wallet";
  }
  if (id === "jupiter-route-order-key") {
    return "npm run verify:web3 -- --base-url=http://localhost:4010 --require-jupiter-order";
  }
  if (id === "helius-solana-read-rail") {
    return "npm run verify:web3 -- --base-url=http://localhost:4010";
  }
  return null;
}

function detailForInput(
  item: Web3AutonomyLaunchOperatorInput,
  accountSetup: Web3AccountSetupReceipt,
  acquisition: Web3AccountAcquisitionReceipt,
) {
  if (item.id === "helius-solana-read-rail") {
    return accountSetup.environment_summary.helius_read_rail_configured
      ? "Helius/Solana read rail is detected locally; keep the value server-side and rerun provider health checks after changes."
      : "Add the read-provider key or RPC URL outside committed source, then run the verifier.";
  }
  if (item.id === "jupiter-route-order-key") {
    return accountSetup.environment_summary.jupiter_configured
      ? "Jupiter key is detected for quote/order rehearsal; transaction bytes and execution remain blocked."
      : "Add the Jupiter key so quote plus unsigned order rehearsal can be proven.";
  }
  const acquisitionItem = acquisition.items.find((candidate) => candidate.id.includes(item.id.split("-")[0]));
  return acquisitionItem?.next_action ?? item.detail;
}

function handoffSummary(
  status: Web3OperatorCredentialHandoffStatus,
  readyCount: number,
  totalCount: number,
  openRequiredCount: number,
  nextInput: Web3OperatorCredentialHandoffInput | null,
) {
  if (status === "ready-for-manual-live-review") {
    return `Credential handoff has ${readyCount}/${totalCount} lanes ready; move only to external manual live review.`;
  }
  if (status === "ready-for-dry-run-rehearsal") {
    return `Credential handoff has required dry-run lanes ready with ${readyCount}/${totalCount} total lanes ready; live execution remains blocked.`;
  }
  return `Credential handoff needs ${openRequiredCount} required input${openRequiredCount === 1 ? "" : "s"}; next input is ${nextInput?.label ?? "operator review"}.`;
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
