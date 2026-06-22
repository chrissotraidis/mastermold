import { createHash } from "node:crypto";
import { buildWeb3ProviderCredentialsReadiness, type Web3ProviderCredentialsReadiness } from "./web3-provider-credentials";
import { getLatestWeb3WalletOwnershipReceipt } from "./web3-wallet-ownership";
import type { AutonomousSignerOpsProvider, Web3TradingState } from "./web3-trading";

export type Web3SignerCredentialPacketStatus =
  | "missing-wallet"
  | "needs-provider-choice"
  | "needs-provider-credentials"
  | "needs-policy"
  | "needs-signer-request"
  | "review-ready"
  | "blocked";

export type Web3SignerCredentialPath = {
  id: AutonomousSignerOpsProvider;
  label: string;
  status: "selected" | "candidate" | "blocked";
  setup_url: string;
  docs_url: string;
  env_targets: string[];
  credential_storage: "external-wallet" | "provider-vault" | "future-session-vault";
  signing_model: "wallet-prompt" | "provider-sign-only" | "provider-managed-submit" | "session-key-sign-only";
  requires_user_presence: boolean;
  can_auto_sign_after_review: boolean;
  configured: boolean;
  readiness_score: number;
  next_action: string;
  security_rule: string;
};

export type Web3SignerCredentialPacket = {
  mode: "web3-signer-credential-packet";
  status: Web3SignerCredentialPacketStatus;
  generated_at: string;
  source_state_as_of: string;
  receipt_hash: string;
  active_provider: AutonomousSignerOpsProvider;
  recommended_provider: "external-wallet";
  provider_readiness_status: Web3ProviderCredentialsReadiness["status"];
  provider_readiness_score: number;
  selected_path: Web3SignerCredentialPath;
  paths: Web3SignerCredentialPath[];
  missing_required: string[];
  next_action: string;
  wallet_public_key_preview: string | null;
  wallet_ownership_proved: boolean;
  policy_hash_present: boolean;
  policy_hash_preview: string | null;
  request_id_present: boolean;
  payload_hash_present: boolean;
  request_body_hash_present: boolean;
  required_evidence: string[];
  external_account_permission: "operator-external-only";
  in_app_provider_signup_permission: "blocked";
  credential_storage_permission: "external-wallet-or-provider-vault-only";
  secret_echo_permission: "blocked";
  private_key_storage: "blocked";
  seed_phrase_storage: "blocked";
  raw_transaction_storage: "blocked";
  signed_payload_storage: "blocked";
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  controls: string[];
  summary: string;
};

export function buildWeb3SignerCredentialPacket(state: Web3TradingState): Web3SignerCredentialPacket {
  const generatedAt = new Date().toISOString();
  const walletPublicKey = state.autonomous_custody_mandate.wallet_public_key ??
    state.live_wallet_accounting_readiness.wallet_public_key ??
    state.execution_readiness.config.wallet_public_key ??
    null;
  const walletOwnership = getLatestWeb3WalletOwnershipReceipt(walletPublicKey);
  const providerReadiness = buildWeb3ProviderCredentialsReadiness({
    custody: state.autonomous_custody_mandate,
    signer: state.autonomous_signer_ops,
    walletOwnership: walletOwnership
      ? {
          proved: true,
          verified_at: walletOwnership.generated_at,
          receipt_hash: walletOwnership.receipt_hash,
        }
      : undefined,
  });
  const paths = buildSignerCredentialPaths(state, providerReadiness);
  const selectedPath = paths.find((path) => path.id === state.autonomous_signer_ops.active_provider) ?? paths[0];
  const missingRequired = buildMissingRequired(providerReadiness, selectedPath);
  const status = signerCredentialPacketStatus(providerReadiness, selectedPath);
  const requiredEvidence = [
    "Dedicated public Solana trading wallet",
    "Hash-only wallet ownership proof",
    "Signer/custody provider decision",
    "Reviewed policy hash with trade caps, route scope, slippage cap, and expiry",
    "Hash-only signer request with request id and payload hash",
    "Redacted provider packet or external wallet prompt plan",
    "Manual live-executor review before any real signature or submit path",
  ];
  const receiptBase = {
    mode: "web3-signer-credential-packet" as const,
    status,
    generated_at: generatedAt,
    source_state_as_of: state.market_source.fetched_at,
    active_provider: state.autonomous_signer_ops.active_provider,
    recommended_provider: "external-wallet" as const,
    provider_readiness_status: providerReadiness.status,
    provider_readiness_score: providerReadiness.readiness_score,
    selected_path: selectedPath,
    paths,
    missing_required: missingRequired,
    next_action: missingRequired[0] ?? providerReadiness.next_action,
    wallet_public_key_preview: previewValue(walletPublicKey),
    wallet_ownership_proved: providerReadiness.wallet_ownership_proved,
    policy_hash_present: providerReadiness.policy_hash_valid,
    policy_hash_preview: previewValue(providerReadiness.policy_hash),
    request_id_present: Boolean(providerReadiness.request_id),
    payload_hash_present: Boolean(providerReadiness.payload_hash),
    request_body_hash_present: Boolean(providerReadiness.request_body_hash),
    required_evidence: requiredEvidence,
    external_account_permission: "operator-external-only" as const,
    in_app_provider_signup_permission: "blocked" as const,
    credential_storage_permission: "external-wallet-or-provider-vault-only" as const,
    secret_echo_permission: "blocked" as const,
    private_key_storage: "blocked" as const,
    seed_phrase_storage: "blocked" as const,
    raw_transaction_storage: "blocked" as const,
    signed_payload_storage: "blocked" as const,
    live_execution_permission: "blocked" as const,
    wallet_mutation_permission: "blocked" as const,
    controls: [
      "This packet names signer setup work only; it cannot create provider accounts, store signer secrets, request signatures, submit swaps, or move funds.",
      "Manual external wallet approval is the recommended first live-review posture because it keeps user presence in the signing loop.",
      "Privy, Turnkey, and session-key paths remain provider-vault candidates until policy, request, settlement, emergency stop, and manual review evidence pass.",
      "Private keys, seed phrases, raw transaction bodies, and signed payloads remain never-store inputs.",
    ],
    summary: signerCredentialPacketSummary(status, providerReadiness, selectedPath),
  };

  return {
    ...receiptBase,
    receipt_hash: hashJson(receiptBase),
  };
}

function buildSignerCredentialPaths(
  state: Web3TradingState,
  providerReadiness: Web3ProviderCredentialsReadiness,
): Web3SignerCredentialPath[] {
  const activeProvider = state.autonomous_signer_ops.active_provider;
  const signerItems = state.autonomous_signer_ops.items;
  const itemFor = (provider: AutonomousSignerOpsProvider) => signerItems.find((item) => item.provider === provider);
  return [
    {
      id: "external-wallet",
      label: "Manual external wallet",
      status: activeProvider === "external-wallet" ? "selected" : "candidate",
      setup_url: "https://solana.com/wallets",
      docs_url: "https://solana.com/docs/core/transactions",
      env_targets: ["MASTERMOLD_AUTONOMOUS_SIGNER_PROVIDER=external-wallet"],
      credential_storage: "external-wallet",
      signing_model: "wallet-prompt",
      requires_user_presence: true,
      can_auto_sign_after_review: false,
      configured: providerReadiness.provider === "external-wallet" && providerReadiness.provider_configured,
      readiness_score: itemFor("external-wallet")?.readiness_score ?? 0,
      next_action: "Use this as the first supervised-live path: connect only the public wallet, prove ownership, and approve each signature in the wallet surface.",
      security_rule: "Never paste a private key or seed phrase; the wallet prompt owns signing and Mastermind stores only hash-only evidence.",
    },
    {
      id: "privy-server-wallet",
      label: "Privy server wallet",
      status: activeProvider === "privy-server-wallet" ? "selected" : "candidate",
      setup_url: "https://www.privy.io/",
      docs_url: "https://docs.privy.io/guide/server-wallets/",
      env_targets: ["MASTERMOLD_AUTONOMOUS_SIGNER_PROVIDER=privy", "PRIVY_APP_ID", "PRIVY_APP_SECRET", "PRIVY_SOLANA_WALLET_ID"],
      credential_storage: "provider-vault",
      signing_model: "provider-sign-only",
      requires_user_presence: false,
      can_auto_sign_after_review: false,
      configured: hasEnv("PRIVY_APP_ID") && hasEnv("PRIVY_APP_SECRET") && hasEnv("PRIVY_SOLANA_WALLET_ID"),
      readiness_score: itemFor("privy-server-wallet")?.readiness_score ?? 0,
      next_action: "Use only after external policy review defines wallet id, spend cap, route scope, revocation, and emergency stop.",
      security_rule: "Privy app secrets stay in server env or provider vault; transaction bodies and signed payloads still stay out of app storage.",
    },
    {
      id: "turnkey-policy-wallet",
      label: "Turnkey policy wallet",
      status: activeProvider === "turnkey-policy-wallet" ? "selected" : "candidate",
      setup_url: "https://www.turnkey.com/",
      docs_url: "https://docs.turnkey.com/",
      env_targets: ["MASTERMOLD_AUTONOMOUS_SIGNER_PROVIDER=turnkey", "TURNKEY_ORGANIZATION_ID", "TURNKEY_API_PUBLIC_KEY", "TURNKEY_API_PRIVATE_KEY", "TURNKEY_SOLANA_WALLET_ACCOUNT"],
      credential_storage: "provider-vault",
      signing_model: "provider-managed-submit",
      requires_user_presence: false,
      can_auto_sign_after_review: false,
      configured: hasEnv("TURNKEY_ORGANIZATION_ID") && hasEnv("TURNKEY_API_PUBLIC_KEY") && hasEnv("TURNKEY_API_PRIVATE_KEY") && hasEnv("TURNKEY_SOLANA_WALLET_ACCOUNT"),
      readiness_score: itemFor("turnkey-policy-wallet")?.readiness_score ?? 0,
      next_action: "Use only after a Turnkey policy constrains allowed tokens, routes, amounts, slippage, expiry, and revocation.",
      security_rule: "Turnkey secrets stay in a dedicated signer vault or server env; Mastermind must keep policy and request hashes only.",
    },
    {
      id: "session-key-vault",
      label: "Session-key vault",
      status: activeProvider === "session-key-vault" ? "selected" : "blocked",
      setup_url: "https://solana.com/docs/core/transactions",
      docs_url: "https://solana.com/docs/core/transactions",
      env_targets: ["MASTERMOLD_AUTONOMOUS_SIGNER_PROVIDER=session-key", "MASTERMOLD_SESSION_KEY_PUBLIC_KEY", "MASTERMOLD_SESSION_POLICY_HASH"],
      credential_storage: "future-session-vault",
      signing_model: "session-key-sign-only",
      requires_user_presence: false,
      can_auto_sign_after_review: false,
      configured: hasEnv("MASTERMOLD_SESSION_KEY_PUBLIC_KEY") && hasEnv("MASTERMOLD_SESSION_POLICY_HASH"),
      readiness_score: itemFor("session-key-vault")?.readiness_score ?? 0,
      next_action: "Treat this as a future path until session-key revocation, policy enforcement, settlement, and legal review are implemented.",
      security_rule: "Session keys need a separately reviewed vault and revocation path; do not store session private keys in Mastermind.",
    },
  ];
}

function buildMissingRequired(
  providerReadiness: Web3ProviderCredentialsReadiness,
  selectedPath: Web3SignerCredentialPath,
) {
  return [
    !providerReadiness.dedicated_wallet_scoped ? "Save a dedicated public trading wallet before signer review." : null,
    !providerReadiness.wallet_ownership_proved ? "Run Prove ownership with the browser wallet; this signs text only and cannot move funds." : null,
    !selectedPath.configured ? `Configure ${selectedPath.label} credential scope without private keys or seed phrases in Mastermind.` : null,
    !providerReadiness.policy_hash_valid ? "Attach a reviewed signer policy hash with caps, route scope, slippage, expiry, and revocation." : null,
    !providerReadiness.can_request_signature && !providerReadiness.can_request_provider_signature ? "Create a hash-only signer request with request id and payload hash after policy review." : null,
  ].filter((item): item is string => Boolean(item));
}

function signerCredentialPacketStatus(
  providerReadiness: Web3ProviderCredentialsReadiness,
  selectedPath: Web3SignerCredentialPath,
): Web3SignerCredentialPacketStatus {
  if (providerReadiness.status === "blocked") return "blocked";
  if (!providerReadiness.dedicated_wallet_scoped) return "missing-wallet";
  if (!selectedPath) return "needs-provider-choice";
  if (!selectedPath.configured) return "needs-provider-credentials";
  if (!providerReadiness.policy_hash_valid) return "needs-policy";
  if (!providerReadiness.can_request_signature && !providerReadiness.can_request_provider_signature) return "needs-signer-request";
  return "review-ready";
}

function signerCredentialPacketSummary(
  status: Web3SignerCredentialPacketStatus,
  providerReadiness: Web3ProviderCredentialsReadiness,
  selectedPath: Web3SignerCredentialPath,
) {
  if (status === "review-ready") return `${selectedPath.label} has reviewable signer evidence; live execution still needs separate manual executor approval.`;
  if (status === "needs-signer-request") return `${selectedPath.label} needs a hash-only signer request before live review can inspect a payload.`;
  if (status === "needs-policy") return `${selectedPath.label} needs a reviewed policy hash, caps, expiry, and route scope.`;
  if (status === "needs-provider-credentials") return `${selectedPath.label} credential scope is not configured; signer secrets must stay outside browser storage.`;
  if (status === "needs-provider-choice") return "Choose a signer/custody path before building provider credentials.";
  if (status === "blocked") return providerReadiness.summary;
  return "A dedicated public trading wallet is required before signer credentials can be reviewed.";
}

function hasEnv(key: string) {
  return Boolean(process.env[key]?.trim());
}

function previewValue(value: string | null | undefined) {
  if (!value) return null;
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
