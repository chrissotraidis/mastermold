import { createHash } from "node:crypto";
import type { Web3DedicatedWalletPacket } from "./web3-dedicated-wallet-packet";
import type { Web3TradingState } from "./web3-trading";

export type Web3DedicatedWalletIntakeContract = {
  mode: "web3-dedicated-wallet-intake-contract";
  status: "public-wallet-needed" | "sample-wallet-rejected" | "ownership-proof-needed" | "strict-verifier-ready";
  generated_at: string;
  receipt_hash: string;
  source: Web3TradingState["market_source"]["mode"];
  account: Web3TradingState["paper_account"]["mode"];
  scenario: Web3TradingState["scenario"];
  wallet_public_key_preview: string | null;
  dedicated_wallet_scoped: boolean;
  wallet_ownership_proved: boolean;
  sample_wallet_rejected: boolean;
  safe_collection_surface: Web3DedicatedWalletPacket["safe_collection_href"];
  can_enter_in_app: true;
  existing_save_endpoint: "/api/web3-trading";
  existing_save_method: "POST";
  existing_save_body_template: {
    scenario: Web3TradingState["scenario"];
    source: Web3TradingState["market_source"]["mode"];
    account: Web3TradingState["paper_account"]["mode"];
    cycles: 0;
    advance: false;
    execution: {
      mode: "dry-run";
      kill_switch: false;
      wallet_public_key: "<public-solana-address>";
      signer_simulation_enabled: true;
      signer_session_label: "settings-external-wallet";
      signer_network: "devnet";
      max_trade_usd: number;
      daily_spend_cap_usd: number;
      max_slippage_bps: number;
    };
  };
  accepted_fields: Array<{
    path: string;
    type: string;
    storage: string;
    required: boolean;
    example: string | number | boolean;
    validation: string;
  }>;
  rejected_fields: string[];
  after_save_steps: Array<{
    id: "strict-wallet-verifier" | "wallet-ownership-proof" | "jupiter-order-rail" | "live-canary-summary";
    label: string;
    command_or_href: string;
    next_action: string;
  }>;
  verifier_command: string;
  next_action: string;
  summary: string;
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  transaction_submission_permission: "blocked";
  signing_permission: "blocked";
  private_key_storage: "blocked";
  seed_phrase_storage: "blocked";
  secret_echo_permission: "blocked";
  controls: string[];
};

export type Web3DedicatedWalletIntakeValidationStatus =
  | "valid-public-wallet"
  | "sample-wallet-rejected"
  | "invalid-wallet"
  | "invalid-risk-caps"
  | "unsafe-input-rejected";

export type Web3DedicatedWalletIntakeValidationReceipt = {
  mode: "web3-dedicated-wallet-intake-validation";
  status: Web3DedicatedWalletIntakeValidationStatus;
  generated_at: string;
  receipt_hash: string;
  source: Web3TradingState["market_source"]["mode"];
  account: Web3TradingState["paper_account"]["mode"];
  scenario: Web3TradingState["scenario"];
  wallet_public_key_preview: string | null;
  wallet_public_key_valid: boolean;
  sample_wallet_rejected: boolean;
  can_save_public_scope: boolean;
  accepted_field_paths: string[];
  rejected_field_paths: string[];
  unsafe_field_paths: string[];
  risk_caps: {
    max_trade_usd: number | null;
    daily_spend_cap_usd: number | null;
    max_slippage_bps: number | null;
    valid: boolean;
    blockers: string[];
  };
  next_proof_runway: Web3DedicatedWalletIntakeProofStep[];
  existing_save_endpoint: "/api/web3-trading";
  existing_save_method: "POST";
  save_body_template: Web3DedicatedWalletIntakeContract["existing_save_body_template"];
  verifier_command: string;
  next_action: string;
  summary: string;
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  transaction_submission_permission: "blocked";
  signing_permission: "blocked";
  private_key_storage: "blocked";
  seed_phrase_storage: "blocked";
  secret_echo_permission: "blocked";
  controls: string[];
};

export type Web3DedicatedWalletIntakeProofStep = {
  id:
    | "validate-public-wallet"
    | "save-public-scope"
    | "request-ownership-challenge"
    | "prove-wallet-ownership"
    | "run-strict-wallet-verifier"
    | "prepare-jupiter-order"
    | "arm-live-canary-flags"
    | "run-unsigned-order-preflight"
    | "relay-signed-canary"
    | "watch-funded-proof";
  label: string;
  status: "done" | "next" | "after-input" | "blocked";
  surface: "settings" | "trading" | "browser-wallet" | "local-command" | "read-only-api";
  command_or_href: string | null;
  next_action: string;
  completion_signal: string;
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  transaction_submission_permission: "blocked";
  secret_echo_permission: "blocked";
};

export function buildWeb3DedicatedWalletIntakeContract(input: {
  state: Web3TradingState;
  wallet: Web3DedicatedWalletPacket;
  now?: Date;
}): Web3DedicatedWalletIntakeContract {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const status = intakeStatus(input.wallet);
  const maxTradeUsd = Math.max(1, input.state.execution_readiness.config.max_trade_usd || 25);
  const dailySpendCapUsd = Math.max(maxTradeUsd, input.state.execution_readiness.config.daily_spend_cap_usd || 100);
  const maxSlippageBps = Math.max(1, Math.min(2_000, input.state.execution_readiness.config.max_slippage_bps || 150));
  const receiptBase = {
    mode: "web3-dedicated-wallet-intake-contract" as const,
    status,
    generated_at: generatedAt,
    source: input.state.market_source.mode,
    account: input.state.paper_account.mode,
    scenario: input.state.scenario,
    wallet_public_key_preview: input.wallet.wallet_public_key_preview,
    dedicated_wallet_scoped: input.wallet.dedicated_wallet_scoped,
    wallet_ownership_proved: input.wallet.wallet_ownership_proved,
    sample_wallet_rejected: input.wallet.sample_wallet_rejected,
    safe_collection_surface: input.wallet.safe_collection_href,
    can_enter_in_app: true as const,
    existing_save_endpoint: "/api/web3-trading" as const,
    existing_save_method: "POST" as const,
    existing_save_body_template: {
      scenario: input.state.scenario,
      source: input.state.market_source.mode,
      account: input.state.paper_account.mode,
      cycles: 0 as const,
      advance: false as const,
      execution: {
        mode: "dry-run" as const,
        kill_switch: false as const,
        wallet_public_key: "<public-solana-address>" as const,
        signer_simulation_enabled: true as const,
        signer_session_label: "settings-external-wallet" as const,
        signer_network: "devnet" as const,
        max_trade_usd: maxTradeUsd,
        daily_spend_cap_usd: dailySpendCapUsd,
        max_slippage_bps: maxSlippageBps,
      },
    },
    accepted_fields: [
      {
        path: "execution.wallet_public_key",
        type: "public Solana address",
        storage: "browser-safe public scope and local dry-run config",
        required: true,
        example: "<public-solana-address>",
        validation: "Base58-like Solana public key, 32 to 44 characters, never the sample all-ones system wallet for funded canary readiness.",
      },
      {
        path: "execution.max_trade_usd",
        type: "number",
        storage: "local dry-run risk cap",
        required: true,
        example: maxTradeUsd,
        validation: "Positive dry-run cap used for rehearsal sizing only.",
      },
      {
        path: "execution.daily_spend_cap_usd",
        type: "number",
        storage: "local dry-run risk cap",
        required: true,
        example: dailySpendCapUsd,
        validation: "Must be at least max_trade_usd; still does not authorize live capital.",
      },
      {
        path: "execution.max_slippage_bps",
        type: "number",
        storage: "local dry-run risk cap",
        required: true,
        example: maxSlippageBps,
        validation: "Integer from 1 to 2000 basis points for rehearsal and canary planning.",
      },
    ],
    rejected_fields: [
      "private_key",
      "seed_phrase",
      "mnemonic",
      "keypair",
      "wallet_secret",
      "raw_transaction",
      "unsigned_transaction",
      "signed_transaction",
      "signed_payload",
      "api_key",
    ],
    after_save_steps: [
      {
        id: "strict-wallet-verifier" as const,
        label: "Run strict wallet verifier",
        command_or_href: input.wallet.strict_verifier_command,
        next_action: "Confirm the scoped wallet is valid, non-sample, and ready for review before any canary handoff.",
      },
      {
        id: "wallet-ownership-proof" as const,
        label: "Prove wallet ownership",
        command_or_href: "/api/web3-wallet-ownership?wallet_public_key=<public-solana-address>",
        next_action: "Use the browser wallet to sign the text-only ownership challenge; this is not a transaction signature.",
      },
      {
        id: "jupiter-order-rail" as const,
        label: "Prepare Jupiter order rail",
        command_or_href: "npm run verify:web3 -- --base-url=http://localhost:4010 --require-jupiter-order",
        next_action: "Install or rehearse Jupiter order readiness without returning transaction bytes.",
      },
      {
        id: "live-canary-summary" as const,
        label: "Recheck live usability summary",
        command_or_href: "/api/web3-live-usability-summary?source=live-dex&account=persistent&scenario=breakout&cycles=0",
        next_action: "Verify the app still reports real-capital trading blocked until funded canary proof exists.",
      },
    ],
    verifier_command: input.wallet.strict_verifier_command,
    next_action: input.wallet.next_action,
    summary: intakeSummary(status),
    live_execution_permission: "blocked" as const,
    wallet_mutation_permission: "blocked" as const,
    transaction_submission_permission: "blocked" as const,
    signing_permission: "blocked" as const,
    private_key_storage: "blocked" as const,
    seed_phrase_storage: "blocked" as const,
    secret_echo_permission: "blocked" as const,
    controls: [
      "This contract is an intake map only; it reuses the existing /api/web3-trading dry-run scope save path.",
      "Only a dedicated public Solana wallet address and non-secret dry-run risk caps belong in the save body.",
      "It cannot sign, submit, custody funds, mutate wallets, store private keys, store seed phrases, or unlock autonomous real-capital trading.",
      "After saving public scope, wallet ownership proof is text-only and stored as hashes; funded trade proof still requires the separate signed canary, settlement, mirror, and external review chain.",
    ],
  };

  return {
    ...receiptBase,
    receipt_hash: hashJson(receiptBase),
  };
}

export function validateWeb3DedicatedWalletIntake(input: {
  state: Web3TradingState;
  body: unknown;
  now?: Date;
}): Web3DedicatedWalletIntakeValidationReceipt {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const body = isRecord(input.body) ? input.body : {};
  const unsafeFieldPaths = findUnsafeWalletIntakeFieldPaths(body);
  const walletValue = extractString(body, ["execution", "wallet_public_key"]) ?? extractString(body, ["wallet_public_key"]);
  const walletPath = hasPath(body, ["execution", "wallet_public_key"]) ? "execution.wallet_public_key" : hasPath(body, ["wallet_public_key"]) ? "wallet_public_key" : null;
  const walletValid = isLikelySolanaPublicKey(walletValue);
  const sampleWalletRejected = walletValue === SAMPLE_SYSTEM_WALLET;
  const riskCaps = validateRiskCaps(body, input.state);
  const acceptedFieldPaths = [
    walletPath,
    hasPath(body, ["execution", "max_trade_usd"]) ? "execution.max_trade_usd" : null,
    hasPath(body, ["execution", "daily_spend_cap_usd"]) ? "execution.daily_spend_cap_usd" : null,
    hasPath(body, ["execution", "max_slippage_bps"]) ? "execution.max_slippage_bps" : null,
  ].filter((path): path is string => Boolean(path));
  const status: Web3DedicatedWalletIntakeValidationStatus = unsafeFieldPaths.length > 0
    ? "unsafe-input-rejected"
    : !walletValid
      ? "invalid-wallet"
      : sampleWalletRejected
        ? "sample-wallet-rejected"
        : !riskCaps.valid
          ? "invalid-risk-caps"
          : "valid-public-wallet";
  const canSavePublicScope = status === "valid-public-wallet";
  const saveBodyTemplate = buildSaveBodyTemplate(input.state, riskCaps);
  const nextProofRunway = buildValidationProofRunway({ state: input.state, walletValue, status, riskCaps });
  const receiptBase = {
    mode: "web3-dedicated-wallet-intake-validation" as const,
    status,
    generated_at: generatedAt,
    source: input.state.market_source.mode,
    account: input.state.paper_account.mode,
    scenario: input.state.scenario,
    wallet_public_key_preview: previewWallet(walletValue),
    wallet_public_key_valid: walletValid,
    sample_wallet_rejected: sampleWalletRejected,
    can_save_public_scope: canSavePublicScope,
    accepted_field_paths: acceptedFieldPaths,
    rejected_field_paths: [
      "private_key",
      "seed_phrase",
      "mnemonic",
      "keypair",
      "wallet_secret",
      "raw_transaction",
      "unsigned_transaction",
      "signed_transaction",
      "signed_payload",
      "api_key",
    ],
    unsafe_field_paths: unsafeFieldPaths,
    risk_caps: riskCaps,
    next_proof_runway: nextProofRunway,
    existing_save_endpoint: "/api/web3-trading" as const,
    existing_save_method: "POST" as const,
    save_body_template: saveBodyTemplate,
    verifier_command: "npm run verify:web3 -- --base-url=http://localhost:4010 --wallet=<public-solana-address> --require-operator-wallet",
    next_action: validationNextAction(status),
    summary: validationSummary(status),
    live_execution_permission: "blocked" as const,
    wallet_mutation_permission: "blocked" as const,
    transaction_submission_permission: "blocked" as const,
    signing_permission: "blocked" as const,
    private_key_storage: "blocked" as const,
    seed_phrase_storage: "blocked" as const,
    secret_echo_permission: "blocked" as const,
    controls: [
      "This validation route checks public wallet scope only; it does not save state.",
      "Responses include wallet previews and field paths only; private keys, seed phrases, keypairs, transaction bodies, signed payloads, and API keys are rejected without echoing values.",
      "A valid receipt still only permits the existing dry-run public-scope save path; it cannot sign, submit, custody funds, mutate wallets, or unlock live execution.",
      "The sample all-ones system wallet is always rejected for funded canary readiness.",
    ],
  };

  return {
    ...receiptBase,
    receipt_hash: hashJson(receiptBase),
  };
}

function intakeStatus(wallet: Web3DedicatedWalletPacket): Web3DedicatedWalletIntakeContract["status"] {
  if (wallet.wallet_is_sample) return "sample-wallet-rejected";
  if (!wallet.dedicated_wallet_scoped) return "public-wallet-needed";
  if (!wallet.wallet_ownership_proved) return "ownership-proof-needed";
  return "strict-verifier-ready";
}

function intakeSummary(status: Web3DedicatedWalletIntakeContract["status"]) {
  if (status === "strict-verifier-ready") return "Dedicated public wallet scope and ownership proof exist; strict verification is the next review step.";
  if (status === "ownership-proof-needed") return "Dedicated public wallet scope exists, but the text-only wallet ownership proof is still required.";
  if (status === "sample-wallet-rejected") return "The sample all-ones wallet is rejected for funded canary readiness; replace it with a dedicated public wallet.";
  return "A dedicated public Solana wallet address is the next safe operator input.";
}

function buildValidationProofRunway(input: {
  state: Web3TradingState;
  walletValue: string | null;
  status: Web3DedicatedWalletIntakeValidationStatus;
  riskCaps: Web3DedicatedWalletIntakeValidationReceipt["risk_caps"];
}): Web3DedicatedWalletIntakeProofStep[] {
  const walletReady = input.status === "valid-public-wallet";
  const walletPlaceholder = walletReady && input.walletValue ? "<validated-public-solana-address>" : "<public-solana-address>";
  const tradingSurface = `/trading?source=live-dex&account=persistent&scenario=${input.state.scenario}#web3-live-canary-console`;
  const ownershipChallengeHref = `/api/web3-wallet-ownership?wallet_public_key=${walletPlaceholder}`;
  const unsignedPreflightHref = `/api/web3-live-unsigned-order-handoff?source=live-dex&account=persistent&scenario=${input.state.scenario}&cycles=0&operator_ack=true&canary_ack=I_UNDERSTAND_THIS_UNSIGNED_ORDER_CAN_MOVE_REAL_FUNDS_IF_SIGNED&wallet_public_key=${walletPlaceholder}&amount_lamports=100000&max_slippage_bps=${input.riskCaps.max_slippage_bps ?? 150}`;
  const canaryReceiptHref = `/api/web3-live-trade-canary?source=live-dex&account=persistent&scenario=${input.state.scenario}&cycles=0`;
  const base = {
    live_execution_permission: "blocked" as const,
    wallet_mutation_permission: "blocked" as const,
    transaction_submission_permission: "blocked" as const,
    secret_echo_permission: "blocked" as const,
  };
  return [
    {
      id: "validate-public-wallet" as const,
      label: "Validate public wallet",
      status: walletReady ? "done" as const : "next" as const,
      surface: "settings" as const,
      command_or_href: "POST /api/web3-dedicated-wallet-intake-contract",
      next_action: walletReady ? "Use the validated public wallet preview for the dry-run save body." : validationNextAction(input.status),
      completion_signal: "Receipt status is valid-public-wallet and can_save_public_scope is true.",
      ...base,
    },
    {
      id: "save-public-scope" as const,
      label: "Save public scope",
      status: walletReady ? "next" as const : "blocked" as const,
      surface: "trading" as const,
      command_or_href: tradingSurface,
      next_action: "Save only the public wallet and dry-run caps through the existing /api/web3-trading scope path.",
      completion_signal: "The scoped wallet is a non-sample public Solana address in live-dex persistent scope.",
      ...base,
    },
    {
      id: "request-ownership-challenge" as const,
      label: "Request ownership challenge",
      status: walletReady ? "after-input" as const : "blocked" as const,
      surface: "read-only-api" as const,
      command_or_href: ownershipChallengeHref,
      next_action: "Request the text-only ownership challenge after saving the matching public wallet scope.",
      completion_signal: "The challenge receipt returns message_return=returned-for-signing and no transaction permission.",
      ...base,
    },
    {
      id: "prove-wallet-ownership" as const,
      label: "Prove wallet ownership",
      status: walletReady ? "after-input" as const : "blocked" as const,
      surface: "browser-wallet" as const,
      command_or_href: tradingSurface,
      next_action: "Use the browser wallet to sign the text-only challenge; never sign a transaction for this proof.",
      completion_signal: "A hash-only wallet ownership receipt is stored for the same public wallet.",
      ...base,
    },
    {
      id: "run-strict-wallet-verifier" as const,
      label: "Run strict wallet verifier",
      status: walletReady ? "after-input" as const : "blocked" as const,
      surface: "local-command" as const,
      command_or_href: `npm run verify:web3 -- --base-url=http://localhost:4010 --wallet=${walletPlaceholder} --require-operator-wallet`,
      next_action: "Run the strict wallet verifier after scope and ownership proof are both present.",
      completion_signal: "The verifier accepts the dedicated wallet and keeps live execution blocked.",
      ...base,
    },
    {
      id: "prepare-jupiter-order" as const,
      label: "Prepare Jupiter order",
      status: "after-input" as const,
      surface: "settings" as const,
      command_or_href: "npm run verify:web3 -- --base-url=http://localhost:4010 --require-jupiter-order",
      next_action: "Configure or rehearse the Jupiter order rail without returning transaction bytes.",
      completion_signal: "Jupiter quote and Swap V2 order readiness pass while unsigned bytes remain withheld.",
      ...base,
    },
    {
      id: "arm-live-canary-flags" as const,
      label: "Arm live canary flags",
      status: "after-input" as const,
      surface: "settings" as const,
      command_or_href: "/settings/integrations#settings-web3-first-canary-live-flags",
      next_action: "Set only the exact reviewed first-canary flags in ignored local env.",
      completion_signal: "The running server reports the exact first-canary flags active.",
      ...base,
    },
    {
      id: "run-unsigned-order-preflight" as const,
      label: "Run unsigned order preflight",
      status: "after-input" as const,
      surface: "read-only-api" as const,
      command_or_href: unsignedPreflightHref,
      next_action: "Check the exact wallet, tiny amount, caps, live flags, and Jupiter readiness before any wallet prompt.",
      completion_signal: "Unsigned order preflight returns ready for the one-shot browser-wallet handoff.",
      ...base,
    },
    {
      id: "relay-signed-canary" as const,
      label: "Relay signed canary",
      status: "after-input" as const,
      surface: "trading" as const,
      command_or_href: canaryReceiptHref,
      next_action: "Relay only the matching externally signed tiny canary payload through the guarded canary endpoint.",
      completion_signal: "A signed relay receipt exists with request-id continuity and no stored signed payload.",
      ...base,
    },
    {
      id: "watch-funded-proof" as const,
      label: "Watch funded proof",
      status: "after-input" as const,
      surface: "local-command" as const,
      command_or_href: "npm run prove-canary:web3 -- --base-url=http://localhost:4010 --run-watchdog --attempts=3 --json",
      next_action: "After signed relay, watch confirmation, settlement reconciliation, and portfolio mirror proof.",
      completion_signal: "Signed relay, chain confirmation, settlement reconciliation, and local portfolio mirror all pass.",
      ...base,
    },
  ];
}

function buildSaveBodyTemplate(
  state: Web3TradingState,
  riskCaps: Web3DedicatedWalletIntakeValidationReceipt["risk_caps"],
): Web3DedicatedWalletIntakeContract["existing_save_body_template"] {
  const maxTradeUsd = riskCaps.max_trade_usd ?? Math.max(1, state.execution_readiness.config.max_trade_usd || 25);
  const dailySpendCapUsd = riskCaps.daily_spend_cap_usd ?? Math.max(maxTradeUsd, state.execution_readiness.config.daily_spend_cap_usd || 100);
  const maxSlippageBps = riskCaps.max_slippage_bps ?? Math.max(1, Math.min(2_000, state.execution_readiness.config.max_slippage_bps || 150));
  return {
    scenario: state.scenario,
    source: state.market_source.mode,
    account: state.paper_account.mode,
    cycles: 0,
    advance: false,
    execution: {
      mode: "dry-run",
      kill_switch: false,
      wallet_public_key: "<public-solana-address>",
      signer_simulation_enabled: true,
      signer_session_label: "settings-external-wallet",
      signer_network: "devnet",
      max_trade_usd: maxTradeUsd,
      daily_spend_cap_usd: dailySpendCapUsd,
      max_slippage_bps: maxSlippageBps,
    },
  };
}

function validateRiskCaps(body: Record<string, unknown>, state: Web3TradingState): Web3DedicatedWalletIntakeValidationReceipt["risk_caps"] {
  const execution = isRecord(body.execution) ? body.execution : {};
  const fallbackMaxTrade = Math.max(1, state.execution_readiness.config.max_trade_usd || 25);
  const maxTradeUsd = numericField(execution.max_trade_usd, fallbackMaxTrade);
  const dailySpendCapUsd = numericField(execution.daily_spend_cap_usd, Math.max(maxTradeUsd ?? fallbackMaxTrade, state.execution_readiness.config.daily_spend_cap_usd || 100));
  const maxSlippageBps = numericField(execution.max_slippage_bps, Math.max(1, Math.min(2_000, state.execution_readiness.config.max_slippage_bps || 150)));
  const blockers = [
    maxTradeUsd === null || maxTradeUsd <= 0 ? "execution.max_trade_usd must be positive." : null,
    dailySpendCapUsd === null || dailySpendCapUsd < (maxTradeUsd ?? fallbackMaxTrade) ? "execution.daily_spend_cap_usd must be at least max_trade_usd." : null,
    maxSlippageBps === null || !Number.isInteger(maxSlippageBps) || maxSlippageBps < 1 || maxSlippageBps > 2_000 ? "execution.max_slippage_bps must be an integer from 1 to 2000." : null,
  ].filter((blocker): blocker is string => Boolean(blocker));
  return {
    max_trade_usd: maxTradeUsd,
    daily_spend_cap_usd: dailySpendCapUsd,
    max_slippage_bps: maxSlippageBps,
    valid: blockers.length === 0,
    blockers,
  };
}

function numericField(value: unknown, fallback: number) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validationNextAction(status: Web3DedicatedWalletIntakeValidationStatus) {
  if (status === "valid-public-wallet") return "Save this public wallet scope through /api/web3-trading, then run the strict operator-wallet verifier.";
  if (status === "sample-wallet-rejected") return "Replace the sample all-ones wallet with a dedicated public Solana trading wallet address.";
  if (status === "invalid-risk-caps") return "Fix the dry-run caps before saving public wallet scope.";
  if (status === "unsafe-input-rejected") return "Remove private keys, seed phrases, keypairs, transaction bodies, signed payloads, and API-key fields before validating again.";
  return "Enter a valid dedicated public Solana wallet address only.";
}

function validationSummary(status: Web3DedicatedWalletIntakeValidationStatus) {
  if (status === "valid-public-wallet") return "Public wallet scope is valid for dry-run saving; live execution remains blocked.";
  if (status === "sample-wallet-rejected") return "The sample all-ones system wallet is safe for tests but rejected for funded canary readiness.";
  if (status === "invalid-risk-caps") return "Wallet shape is acceptable, but dry-run risk caps need correction before saving.";
  if (status === "unsafe-input-rejected") return "Unsafe wallet or transaction fields were rejected without storing or echoing values.";
  return "The wallet field is missing or is not a valid public Solana address.";
}

function findUnsafeWalletIntakeFieldPaths(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findUnsafeWalletIntakeFieldPaths(item, `${prefix}[${index}]`));
  }
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    const unsafe = UNSAFE_WALLET_INTAKE_KEYS.some((needle) => normalized.includes(needle));
    return [
      unsafe ? path : null,
      ...findUnsafeWalletIntakeFieldPaths(child, path),
    ].filter((item): item is string => Boolean(item));
  });
}

function extractString(value: Record<string, unknown>, path: string[]) {
  let current: unknown = value;
  for (const segment of path) {
    if (!isRecord(current)) return null;
    current = current[segment];
  }
  return typeof current === "string" ? current.trim() : null;
}

function hasPath(value: Record<string, unknown>, path: string[]) {
  let current: unknown = value;
  for (const segment of path) {
    if (!isRecord(current) || !Object.prototype.hasOwnProperty.call(current, segment)) return false;
    current = current[segment];
  }
  return true;
}

function previewWallet(value: string | null) {
  if (!value) return null;
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function isLikelySolanaPublicKey(value: string | null | undefined) {
  return Boolean(value && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

const SAMPLE_SYSTEM_WALLET = "11111111111111111111111111111111";

const UNSAFE_WALLET_INTAKE_KEYS = [
  "privatekey",
  "seedphrase",
  "mnemonic",
  "keypair",
  "walletsecret",
  "rawtransaction",
  "unsignedtransaction",
  "signedtransaction",
  "signedpayload",
  "apikey",
];
