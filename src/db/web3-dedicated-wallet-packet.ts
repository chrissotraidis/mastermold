import { createHash } from "node:crypto";
import { getLatestWeb3WalletOwnershipReceipt } from "./web3-wallet-ownership";
import type { Web3TradingState } from "./web3-trading";

export type Web3DedicatedWalletPacketStatus =
  | "missing-wallet"
  | "sample-wallet"
  | "ownership-needed"
  | "strict-verifier-ready"
  | "review-ready";

export type Web3DedicatedWalletPacketStep = {
  id:
    | "create-wallet"
    | "enter-public-address"
    | "reject-sample-wallet"
    | "prove-ownership"
    | "run-strict-verifier"
    | "keep-secrets-out";
  label: string;
  status: "done" | "active" | "blocked" | "review";
  detail: string;
  next_action: string;
};

export type Web3DedicatedWalletPacket = {
  mode: "web3-dedicated-wallet-packet";
  status: Web3DedicatedWalletPacketStatus;
  generated_at: string;
  source_state_as_of: string;
  receipt_hash: string;
  wallet_public_key_preview: string | null;
  wallet_scoped: boolean;
  wallet_is_sample: boolean;
  dedicated_wallet_scoped: boolean;
  sample_wallet_rejected: boolean;
  wallet_ownership_proved: boolean;
  wallet_ownership_verified_at: string | null;
  wallet_ownership_receipt_hash: string | null;
  read_provider_configured: boolean;
  jupiter_configured: boolean;
  strict_verifier_command: string;
  safe_collection_surface: "trading-live-canary-console";
  safe_collection_label: "Trading live canary console";
  safe_collection_href: string;
  missing_required: string[];
  setup_links: Array<{
    label: string;
    url: string;
    detail: string;
  }>;
  steps: Web3DedicatedWalletPacketStep[];
  public_address_storage: "browser-safe-public-scope";
  ownership_proof_storage: "hash-only-local-receipt";
  private_key_storage: "blocked";
  seed_phrase_storage: "blocked";
  secret_echo_permission: "blocked";
  signing_permission: "blocked";
  transaction_submission_permission: "blocked";
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  controls: string[];
  summary: string;
  next_action: string;
};

export function buildWeb3DedicatedWalletPacket(state: Web3TradingState): Web3DedicatedWalletPacket {
  const generatedAt = new Date().toISOString();
  const walletPublicKey = state.autonomous_custody_mandate.wallet_public_key ??
    state.live_wallet_accounting_readiness.wallet_public_key ??
    state.execution_readiness.config.wallet_public_key ??
    null;
  const walletScoped = Boolean(walletPublicKey);
  const walletLooksLikePublicKey = typeof walletPublicKey === "string" && isLikelySolanaPublicKey(walletPublicKey);
  const walletIsSample = walletPublicKey === SAMPLE_SYSTEM_WALLET;
  const dedicatedWalletScoped = walletScoped && walletLooksLikePublicKey && !walletIsSample;
  const walletOwnership = getLatestWeb3WalletOwnershipReceipt(walletPublicKey);
  const walletOwnershipProved = dedicatedWalletScoped && Boolean(walletOwnership);
  const readProviderConfigured = hasEnv("HELIUS_API_KEY") || hasEnv("SOLANA_RPC_URL") || hasEnv("NEXT_PUBLIC_SOLANA_RPC_URL");
  const jupiterConfigured = hasEnv("JUPITER_API_KEY");
  const safeCollectionHref = `/trading?source=live-dex&account=persistent&scenario=${state.scenario}#web3-live-canary-console`;
  const status = dedicatedWalletPacketStatus({
    walletScoped,
    walletIsSample,
    dedicatedWalletScoped,
    walletOwnershipProved,
  });
  const missingRequired = [
    !walletScoped ? "Dedicated public Solana trading wallet" : null,
    walletScoped && !walletLooksLikePublicKey ? "Valid public Solana trading wallet" : null,
    walletIsSample ? "Replace sample all-ones wallet" : null,
    dedicatedWalletScoped && !walletOwnershipProved ? "Hash-only wallet ownership proof" : null,
    !readProviderConfigured ? "Helius or Solana read provider" : null,
  ].filter((item): item is string => Boolean(item));
  const strictVerifierCommand = buildStrictVerifierCommand(walletPublicKey, dedicatedWalletScoped);
  const steps = buildDedicatedWalletSteps({
    walletScoped,
    walletIsSample,
    dedicatedWalletScoped,
    walletOwnershipProved,
    readProviderConfigured,
    strictVerifierCommand,
  });
  const receiptBase = {
    mode: "web3-dedicated-wallet-packet" as const,
    status,
    generated_at: generatedAt,
    source_state_as_of: state.market_source.fetched_at,
    wallet_public_key_preview: previewValue(walletPublicKey),
    wallet_scoped: walletScoped,
    wallet_is_sample: walletIsSample,
    dedicated_wallet_scoped: dedicatedWalletScoped,
    sample_wallet_rejected: walletIsSample || !dedicatedWalletScoped,
    wallet_ownership_proved: walletOwnershipProved,
    wallet_ownership_verified_at: walletOwnershipProved ? walletOwnership?.generated_at ?? null : null,
    wallet_ownership_receipt_hash: walletOwnershipProved ? walletOwnership?.receipt_hash ?? null : null,
    read_provider_configured: readProviderConfigured,
    jupiter_configured: jupiterConfigured,
    strict_verifier_command: strictVerifierCommand,
    safe_collection_surface: "trading-live-canary-console" as const,
    safe_collection_label: "Trading live canary console" as const,
    safe_collection_href: safeCollectionHref,
    missing_required: missingRequired,
    setup_links: [
      {
        label: "Solana wallets",
        url: "https://solana.com/wallets",
        detail: "Create a dedicated wallet externally and bring only the public address into Mastermind.",
      },
      {
        label: "Solana transaction docs",
        url: "https://solana.com/docs/core/transactions",
        detail: "Use only for signer review context; this packet never asks for a transaction signature.",
      },
    ],
    steps,
    public_address_storage: "browser-safe-public-scope" as const,
    ownership_proof_storage: "hash-only-local-receipt" as const,
    private_key_storage: "blocked" as const,
    seed_phrase_storage: "blocked" as const,
    secret_echo_permission: "blocked" as const,
    signing_permission: "blocked" as const,
    transaction_submission_permission: "blocked" as const,
    live_execution_permission: "blocked" as const,
    wallet_mutation_permission: "blocked" as const,
    controls: [
      "Use a dedicated Solana wallet created outside Mastermind; paste only its public address in the Trading live canary console.",
      "The sample all-ones wallet is rejected for operator-wallet readiness and can only exercise demo paths.",
      "Wallet ownership proof is a text-only browser-wallet signature stored as hashes; it is not a transaction signature.",
      "Private keys, seed phrases, raw transactions, signed payloads, live execution, and wallet mutation remain blocked.",
    ],
    summary: dedicatedWalletSummary(status),
    next_action: dedicatedWalletNextAction(status, readProviderConfigured),
  };

  return {
    ...receiptBase,
    receipt_hash: hashJson(receiptBase),
  };
}

function dedicatedWalletPacketStatus(input: {
  walletScoped: boolean;
  walletIsSample: boolean;
  dedicatedWalletScoped: boolean;
  walletOwnershipProved: boolean;
}): Web3DedicatedWalletPacketStatus {
  if (!input.walletScoped) return "missing-wallet";
  if (input.walletIsSample) return "sample-wallet";
  if (!input.dedicatedWalletScoped) return "missing-wallet";
  if (!input.walletOwnershipProved) return "ownership-needed";
  return "strict-verifier-ready";
}

function buildDedicatedWalletSteps(input: {
  walletScoped: boolean;
  walletIsSample: boolean;
  dedicatedWalletScoped: boolean;
  walletOwnershipProved: boolean;
  readProviderConfigured: boolean;
  strictVerifierCommand: string;
}): Web3DedicatedWalletPacketStep[] {
  return [
    {
      id: "create-wallet",
      label: "Create dedicated wallet",
      status: input.dedicatedWalletScoped ? "done" : "active",
      detail: "Use a fresh Solana wallet reserved for Mastermind trading review.",
      next_action: input.dedicatedWalletScoped
        ? "Keep this wallet separate from long-term treasury wallets."
        : "Create the wallet externally and do not paste its seed phrase here.",
    },
    {
      id: "enter-public-address",
      label: "Enter public address only",
      status: input.walletScoped ? "done" : "active",
      detail: "Mastermind stores only public wallet scope and non-secret risk preferences.",
      next_action: input.walletScoped ? "Confirm the preview matches the wallet you intend to review." : "Paste only the Solana public address in the Trading live canary console.",
    },
    {
      id: "reject-sample-wallet",
      label: "Reject sample wallet",
      status: input.walletIsSample ? "blocked" : input.dedicatedWalletScoped ? "done" : "review",
      detail: "The demo all-ones wallet never satisfies live operator-wallet scope.",
      next_action: input.walletIsSample ? "Replace the sample all-ones wallet with a dedicated public address in the Trading live canary console." : "Keep demo wallet use isolated from readiness review.",
    },
    {
      id: "prove-ownership",
      label: "Prove ownership",
      status: input.walletOwnershipProved ? "done" : input.dedicatedWalletScoped ? "active" : "blocked",
      detail: "Browser wallet signs a plain text challenge; the receipt stores challenge and signature hashes only.",
      next_action: input.walletOwnershipProved ? "Use the hash receipt as review evidence." : "Connect the browser wallet and run Prove ownership.",
    },
    {
      id: "run-strict-verifier",
      label: "Run strict verifier",
      status: input.dedicatedWalletScoped && input.readProviderConfigured ? "active" : "blocked",
      detail: input.strictVerifierCommand,
      next_action: input.readProviderConfigured
        ? "Run this after the wallet address is scoped and after ownership proof is recorded."
        : "Configure Helius or Solana RPC before strict wallet verification can pass.",
    },
    {
      id: "keep-secrets-out",
      label: "Keep secrets out",
      status: "done",
      detail: "No seed phrase, private key, transaction body, signed payload, or custody credential belongs in this app.",
      next_action: "Use external wallet or provider-vault surfaces for any future signer review.",
    },
  ];
}

function dedicatedWalletSummary(status: Web3DedicatedWalletPacketStatus) {
  if (status === "strict-verifier-ready") return "A dedicated public wallet and hash-only ownership proof are present; run strict verification before any live review.";
  if (status === "ownership-needed") return "A dedicated public wallet is scoped, but ownership proof is still missing.";
  if (status === "sample-wallet") return "The sample all-ones wallet is scoped for demo paths only and is rejected for operator-wallet readiness.";
  if (status === "review-ready") return "Dedicated wallet evidence is reviewable; live execution remains blocked.";
  return "A dedicated Solana trading wallet public address is still missing.";
}

function dedicatedWalletNextAction(status: Web3DedicatedWalletPacketStatus, readProviderConfigured: boolean) {
  if (status === "strict-verifier-ready") return readProviderConfigured
    ? "Run the strict operator-wallet verifier, then continue Jupiter order and signer review."
    : "Configure Helius or Solana RPC before running strict operator-wallet verification.";
  if (status === "ownership-needed") return "Run Prove ownership with the connected browser wallet; do not sign a transaction.";
  if (status === "sample-wallet") return "Replace the sample all-ones wallet with a dedicated Solana public address in the Trading live canary console.";
  return "Create a dedicated Solana wallet externally and enter only its public address in the Trading live canary console.";
}

function hasEnv(name: string) {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0;
}

function buildStrictVerifierCommand(walletPublicKey: string | null, dedicatedWalletScoped: boolean) {
  const placeholderCommand = "npm run verify:web3 -- --base-url=http://localhost:4010 --wallet=<public-solana-address> --require-operator-wallet";
  if (!dedicatedWalletScoped || !walletPublicKey || !isLikelySolanaPublicKey(walletPublicKey)) return placeholderCommand;
  return placeholderCommand.replace("<public-solana-address>", walletPublicKey);
}

function isLikelySolanaPublicKey(value: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
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
