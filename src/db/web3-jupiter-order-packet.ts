import { createHash } from "node:crypto";
import { isLikelySolanaPublicKey } from "./web3-credentials";
import type { Web3TradingState } from "./web3-trading";

export type Web3JupiterOrderPacketStatus =
  | "missing-key"
  | "wallet-needed"
  | "rehearsal-needed"
  | "review-ready";

export type Web3JupiterOrderPacketStep = {
  id:
    | "create-jupiter-key"
    | "install-server-env"
    | "scope-wallet"
    | "rehearse-order"
    | "run-strict-verifier"
    | "withhold-transaction-bytes";
  label: string;
  status: "done" | "active" | "blocked" | "review";
  detail: string;
  next_action: string;
};

export type Web3JupiterOrderPacket = {
  mode: "web3-jupiter-order-packet";
  status: Web3JupiterOrderPacketStatus;
  generated_at: string;
  source_state_as_of: string;
  receipt_hash: string;
  jupiter_configured: boolean;
  key_source: "server-env-or-one-shot-required" | "server-env-configured";
  env_targets: string[];
  wallet_public_key_preview: string | null;
  wallet_scoped: boolean;
  wallet_valid: boolean;
  wallet_is_sample: boolean;
  dedicated_wallet_scoped: boolean;
  read_provider_configured: boolean;
  quote_provider: Web3TradingState["autonomous_execution_adapter_readiness"]["quote_provider"];
  quote_request_ready: boolean;
  swap_v2_order_ready: boolean;
  adapter_status: Web3TradingState["autonomous_execution_adapter_readiness"]["status"];
  adapter_readiness_score: number;
  strict_verifier_command: string;
  rehearsal_endpoint: "POST /api/web3-jupiter-rehearsal";
  local_install_endpoint: "POST /api/web3-local-credentials";
  missing_required: string[];
  setup_links: Array<{
    label: string;
    url: string;
    detail: string;
  }>;
  steps: Web3JupiterOrderPacketStep[];
  key_storage: "server-env-or-one-shot-only";
  browser_storage_permission: "blocked";
  secret_echo_permission: "blocked";
  private_key_storage: "blocked";
  seed_phrase_storage: "blocked";
  unsigned_transaction_return: "withheld";
  transaction_body_storage: "blocked";
  execute_permission: "blocked";
  signing_permission: "blocked";
  transaction_submission_permission: "blocked";
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  controls: string[];
  summary: string;
  next_action: string;
};

export function buildWeb3JupiterOrderPacket(state: Web3TradingState): Web3JupiterOrderPacket {
  const generatedAt = new Date().toISOString();
  const walletPublicKey = state.autonomous_custody_mandate.wallet_public_key ??
    state.live_wallet_accounting_readiness.wallet_public_key ??
    state.execution_readiness.config.wallet_public_key ??
    null;
  const jupiterConfigured = hasEnv("JUPITER_API_KEY");
  const readProviderConfigured = hasEnv("HELIUS_API_KEY") || hasEnv("SOLANA_RPC_URL") || hasEnv("NEXT_PUBLIC_SOLANA_RPC_URL");
  const walletScoped = Boolean(walletPublicKey);
  const walletValid = Boolean(walletPublicKey && isLikelySolanaPublicKey(walletPublicKey));
  const walletIsSample = walletPublicKey === SAMPLE_SYSTEM_WALLET;
  const dedicatedWalletScoped = walletValid && !walletIsSample;
  const adapter = state.autonomous_execution_adapter_readiness;
  const status = jupiterOrderPacketStatus({
    jupiterConfigured,
    dedicatedWalletScoped,
    swapV2OrderReady: adapter.swap_v2_order_ready,
  });
  const missingRequired = [
    !jupiterConfigured ? "Jupiter API key for Swap V2 order rehearsal" : null,
    !dedicatedWalletScoped ? "Dedicated public Solana trading wallet" : null,
    walletIsSample ? "Replace sample all-ones wallet before order proof" : null,
    jupiterConfigured && dedicatedWalletScoped && !adapter.swap_v2_order_ready ? "Redacted Jupiter quote/order rehearsal receipt" : null,
    !readProviderConfigured ? "Helius or Solana read provider" : null,
  ].filter((item): item is string => Boolean(item));
  const strictVerifierCommand = "npm run verify:web3 -- --base-url=http://localhost:4010 --require-jupiter-order";
  const steps = buildJupiterOrderSteps({
    jupiterConfigured,
    dedicatedWalletScoped,
    walletIsSample,
    swapV2OrderReady: adapter.swap_v2_order_ready,
    strictVerifierCommand,
  });
  const receiptBase = {
    mode: "web3-jupiter-order-packet" as const,
    status,
    generated_at: generatedAt,
    source_state_as_of: state.market_source.fetched_at,
    jupiter_configured: jupiterConfigured,
    key_source: jupiterConfigured ? "server-env-configured" as const : "server-env-or-one-shot-required" as const,
    env_targets: ["JUPITER_API_KEY"],
    wallet_public_key_preview: previewValue(walletPublicKey),
    wallet_scoped: walletScoped,
    wallet_valid: walletValid,
    wallet_is_sample: walletIsSample,
    dedicated_wallet_scoped: dedicatedWalletScoped,
    read_provider_configured: readProviderConfigured,
    quote_provider: adapter.quote_provider,
    quote_request_ready: adapter.quote_request_ready,
    swap_v2_order_ready: adapter.swap_v2_order_ready,
    adapter_status: adapter.status,
    adapter_readiness_score: adapter.readiness_score,
    strict_verifier_command: strictVerifierCommand,
    rehearsal_endpoint: "POST /api/web3-jupiter-rehearsal" as const,
    local_install_endpoint: "POST /api/web3-local-credentials" as const,
    missing_required: missingRequired,
    setup_links: [
      {
        label: "Jupiter portal",
        url: "https://developers.jup.ag/portal",
        detail: "Create the API key externally; store it only in ignored server env or a one-shot local test.",
      },
      {
        label: "Swap API docs",
        url: "https://dev.jup.ag/docs/swap-api/",
        detail: "Use for quote/order rehearsal context; Mastermind still withholds transaction bytes.",
      },
    ],
    steps,
    key_storage: "server-env-or-one-shot-only" as const,
    browser_storage_permission: "blocked" as const,
    secret_echo_permission: "blocked" as const,
    private_key_storage: "blocked" as const,
    seed_phrase_storage: "blocked" as const,
    unsigned_transaction_return: "withheld" as const,
    transaction_body_storage: "blocked" as const,
    execute_permission: "blocked" as const,
    signing_permission: "blocked" as const,
    transaction_submission_permission: "blocked" as const,
    live_execution_permission: "blocked" as const,
    wallet_mutation_permission: "blocked" as const,
    controls: [
      "Jupiter API keys belong in ignored server env or one-shot local tests only; they are never saved to browser storage.",
      "Order rehearsal may prove quote and unsigned order readiness, but transaction bytes are withheld from receipts.",
      "A dedicated public Solana wallet is required before strict order proof can count toward live review.",
      "Execute, signing, transaction submission, live execution, wallet mutation, private-key storage, and secret echo remain blocked.",
    ],
    summary: jupiterOrderSummary(status, adapter.swap_v2_order_ready),
    next_action: jupiterOrderNextAction(status),
  };

  return {
    ...receiptBase,
    receipt_hash: hashJson(receiptBase),
  };
}

function jupiterOrderPacketStatus(input: {
  jupiterConfigured: boolean;
  dedicatedWalletScoped: boolean;
  swapV2OrderReady: boolean;
}): Web3JupiterOrderPacketStatus {
  if (!input.jupiterConfigured) return "missing-key";
  if (!input.dedicatedWalletScoped) return "wallet-needed";
  if (!input.swapV2OrderReady) return "rehearsal-needed";
  return "review-ready";
}

function buildJupiterOrderSteps(input: {
  jupiterConfigured: boolean;
  dedicatedWalletScoped: boolean;
  walletIsSample: boolean;
  swapV2OrderReady: boolean;
  strictVerifierCommand: string;
}): Web3JupiterOrderPacketStep[] {
  return [
    {
      id: "create-jupiter-key",
      label: "Create Jupiter key",
      status: input.jupiterConfigured ? "done" : "active",
      detail: "Use Jupiter Developer Platform for Swap API quote/order access.",
      next_action: input.jupiterConfigured ? "Keep the key in ignored server env or one-shot local tests." : "Create the key externally; do not paste it into chat or source files.",
    },
    {
      id: "install-server-env",
      label: "Install local env",
      status: input.jupiterConfigured ? "done" : "active",
      detail: "Settings can install JUPITER_API_KEY into ignored local env on trusted localhost.",
      next_action: input.jupiterConfigured ? "Restart or verify the server sees the key after changes." : "Use Settings Install local env or edit ignored server env manually.",
    },
    {
      id: "scope-wallet",
      label: "Scope dedicated wallet",
      status: input.dedicatedWalletScoped ? "done" : input.walletIsSample ? "blocked" : "active",
      detail: "Jupiter order rehearsal needs a public Solana taker wallet; the sample wallet does not count.",
      next_action: input.dedicatedWalletScoped ? "Run order rehearsal with this public taker scope." : "Add a dedicated public wallet and prove ownership before strict review.",
    },
    {
      id: "rehearse-order",
      label: "Rehearse order",
      status: input.swapV2OrderReady ? "done" : input.jupiterConfigured && input.dedicatedWalletScoped ? "active" : "blocked",
      detail: "POST /api/web3-jupiter-rehearsal hashes request evidence and withholds transaction bytes.",
      next_action: input.swapV2OrderReady ? "Use the redacted receipt as order-readiness evidence." : "Run Rehearse Jupiter from Settings after key and wallet scope are ready.",
    },
    {
      id: "run-strict-verifier",
      label: "Run strict verifier",
      status: input.jupiterConfigured ? "active" : "blocked",
      detail: input.strictVerifierCommand,
      next_action: input.jupiterConfigured ? "Run after rehearsal; strict mode must prove quote and unsigned order readiness." : "Install a Jupiter key before strict order verification can pass.",
    },
    {
      id: "withhold-transaction-bytes",
      label: "Withhold transaction bytes",
      status: "done",
      detail: "Receipts never return unsigned transaction bodies or signed payloads.",
      next_action: "Keep execute/sign/submit disabled until a separate manual live-executor review.",
    },
  ];
}

function jupiterOrderSummary(status: Web3JupiterOrderPacketStatus, swapV2OrderReady: boolean) {
  if (status === "review-ready") return "Jupiter credential, dedicated wallet scope, and redacted Swap V2 order evidence are reviewable; live execution remains blocked.";
  if (status === "rehearsal-needed") return swapV2OrderReady
    ? "Swap V2 order evidence is present; run strict verification before live review."
    : "Jupiter and wallet prerequisites are present, but redacted quote/order rehearsal still needs to pass.";
  if (status === "wallet-needed") return "Jupiter key scope is present, but a dedicated public Solana wallet is still needed for order proof.";
  return "Jupiter Swap V2 order rehearsal is missing its API key.";
}

function jupiterOrderNextAction(status: Web3JupiterOrderPacketStatus) {
  if (status === "review-ready") return "Run landing drill, signer handoff, settlement checks, and manual live review while execution stays blocked.";
  if (status === "rehearsal-needed") return "Run Rehearse Jupiter, then run strict Jupiter order verification.";
  if (status === "wallet-needed") return "Scope a dedicated public Solana wallet before strict order proof.";
  return "Add JUPITER_API_KEY in ignored server env or use a one-shot Settings rehearsal test.";
}

function hasEnv(name: string) {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0;
}

function previewValue(value: string | null | undefined) {
  if (!value) return null;
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

const SAMPLE_SYSTEM_WALLET = "11111111111111111111111111111111";
