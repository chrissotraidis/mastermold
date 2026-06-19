import type { AutonomousCustodyMandate, AutonomousSignerOps } from "./web3-trading";

export type Web3ProviderCredentialsReadinessStatus =
  | "missing-wallet"
  | "credentials-missing"
  | "policy-gated"
  | "request-gated"
  | "provider-ready"
  | "blocked";

export type Web3ProviderCredentialsReadinessCheck = {
  id:
    | "wallet-scope"
    | "read-provider-rail"
    | "provider-secret-scope"
    | "policy-hash"
    | "custody-envelope"
    | "signer-request"
    | "provider-packet"
    | "user-presence"
    | "live-boundary";
  label: string;
  status: "pass" | "watch" | "fail";
  detail: string;
};

export type Web3ProviderCredentialsReadiness = {
  mode: "web3-provider-credentials-readiness";
  status: Web3ProviderCredentialsReadinessStatus;
  readiness_score: number;
  provider: AutonomousSignerOps["active_provider"];
  signer_scope: AutonomousCustodyMandate["signer_scope"];
  wallet_public_key: string | null;
  read_provider_status: "missing" | "partial" | "ready";
  helius_rpc_configured: boolean;
  jupiter_configured: boolean;
  provider_configured: boolean;
  credential_configured: boolean;
  policy_hash: string | null;
  policy_hash_valid: boolean;
  custody_status: AutonomousCustodyMandate["status"];
  signer_status: AutonomousSignerOps["status"];
  adapter_status: AutonomousSignerOps["provider_adapter"]["status"];
  request_transport: AutonomousSignerOps["provider_adapter"]["request_transport"];
  request_id: string | null;
  payload_hash: string | null;
  request_body_hash: string | null;
  can_request_signature: boolean;
  can_request_provider_signature: boolean;
  requires_user_presence: boolean;
  can_satisfy_provider_gate: boolean;
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  summary: string;
  next_action: string;
  blockers: string[];
  checks: Web3ProviderCredentialsReadinessCheck[];
  controls: string[];
};

export function buildWeb3ProviderCredentialsReadiness({
  custody,
  signer,
}: {
  custody: AutonomousCustodyMandate;
  signer: AutonomousSignerOps;
}): Web3ProviderCredentialsReadiness {
  const adapter = signer.provider_adapter;
  const packet = adapter.provider_request_packet;
  const walletScoped = Boolean(custody.wallet_public_key);
  const heliusRpcConfigured = Boolean(process.env.HELIUS_API_KEY || process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL);
  const jupiterConfigured = Boolean(process.env.JUPITER_API_KEY);
  const readProviderStatus: Web3ProviderCredentialsReadiness["read_provider_status"] = heliusRpcConfigured && jupiterConfigured
    ? "ready"
    : heliusRpcConfigured || jupiterConfigured
      ? "partial"
      : "missing";
  const policyHash = adapter.policy_hash ?? signer.policy_hash ?? custody.policy_hash ?? null;
  const policyHashValid = typeof policyHash === "string" && /^[0-9a-f]{64}$/i.test(policyHash);
  const providerConfigured = custody.provider_configured || signer.active_provider === "external-wallet";
  const credentialConfigured = adapter.credential_configured;
  const custodyArmed = custody.status === "armed";
  const custodyBounded = custody.status === "armed" || custody.status === "bounded-ready";
  const signerRequestReady = signer.active_request?.status === "ready" && signer.can_request_signature;
  const packetReady = packet.status === "ready" &&
    packet.can_dispatch_now &&
    Boolean(packet.request_body_hash && packet.request_body_fields.payload_hash);
  const canSatisfyProviderGate = walletScoped &&
    providerConfigured &&
    credentialConfigured &&
    policyHashValid &&
    custodyArmed &&
    signerRequestReady &&
    adapter.status === "ready-to-request" &&
    adapter.can_request_provider_signature &&
    packetReady;
  const checks = providerCredentialChecks({
    custody,
    signer,
    walletScoped,
    readProviderStatus,
    heliusRpcConfigured,
    jupiterConfigured,
    providerConfigured,
    credentialConfigured,
    policyHashValid,
    custodyArmed,
    custodyBounded,
    signerRequestReady,
    packetReady,
  });
  const blockers = checks
    .filter((check) => check.status === "fail")
    .map((check) => check.detail)
    .slice(0, 6);
  const readinessScore = Math.round(checks.reduce((sum, check) => sum + checkScore(check.status), 0) / checks.length);
  const status: Web3ProviderCredentialsReadinessStatus = !walletScoped
    ? "missing-wallet"
    : !providerConfigured || !credentialConfigured
      ? "credentials-missing"
      : custody.status === "blocked" || signer.status === "blocked"
        ? "blocked"
        : !policyHashValid || !custodyArmed
          ? "policy-gated"
          : !signerRequestReady || !packetReady || adapter.status !== "ready-to-request" || !adapter.can_request_provider_signature
            ? "request-gated"
            : "provider-ready";

  return {
    mode: "web3-provider-credentials-readiness",
    status,
    readiness_score: readinessScore,
    provider: signer.active_provider,
    signer_scope: custody.signer_scope,
    wallet_public_key: custody.wallet_public_key,
    read_provider_status: readProviderStatus,
    helius_rpc_configured: heliusRpcConfigured,
    jupiter_configured: jupiterConfigured,
    provider_configured: providerConfigured,
    credential_configured: credentialConfigured,
    policy_hash: policyHash,
    policy_hash_valid: policyHashValid,
    custody_status: custody.status,
    signer_status: signer.status,
    adapter_status: adapter.status,
    request_transport: adapter.request_transport,
    request_id: adapter.request_id,
    payload_hash: adapter.payload_hash,
    request_body_hash: adapter.request_body_hash,
    can_request_signature: signer.can_request_signature,
    can_request_provider_signature: adapter.can_request_provider_signature,
    requires_user_presence: signer.requires_user_presence,
    can_satisfy_provider_gate: canSatisfyProviderGate,
    live_execution_permission: "blocked",
    wallet_mutation_permission: "blocked",
    summary: providerCredentialsSummary(status, signer, readinessScore),
    next_action: blockers[0] ?? providerCredentialsNextAction(status),
    blockers,
    checks,
    controls: [
      "Provider credentials readiness is a redacted evidence receipt; it never exposes secrets, private keys, raw transactions, or signed payloads.",
      "Read-provider rail evidence can prove Helius/Solana and Jupiter credentials are present, but it cannot replace signer custody or authorize trades.",
      "Live review requires provider credential scope, wallet scope, policy hash continuity, custody envelope, signer request, and provider packet evidence.",
      "This gate can make a signer request reviewable, but it cannot unlock real-capital trading or wallet mutation by itself.",
    ],
  };
}

function providerCredentialChecks(evidence: {
  custody: AutonomousCustodyMandate;
  signer: AutonomousSignerOps;
  walletScoped: boolean;
  readProviderStatus: Web3ProviderCredentialsReadiness["read_provider_status"];
  heliusRpcConfigured: boolean;
  jupiterConfigured: boolean;
  providerConfigured: boolean;
  credentialConfigured: boolean;
  policyHashValid: boolean;
  custodyArmed: boolean;
  custodyBounded: boolean;
  signerRequestReady: boolean;
  packetReady: boolean;
}): Web3ProviderCredentialsReadinessCheck[] {
  const { custody, signer } = evidence;
  const adapter = signer.provider_adapter;
  const packet = adapter.provider_request_packet;
  const providerLabel = signer.active_provider.replaceAll("-", " ");
  return [
    {
      id: "wallet-scope",
      label: "Wallet scope",
      status: evidence.walletScoped ? "pass" : "fail",
      detail: evidence.walletScoped ? "A public wallet key scopes every provider credential and signer request." : "A public wallet key is required before provider credentials can be reviewed.",
    },
    {
      id: "read-provider-rail",
      label: "Read provider rail",
      status: evidence.readProviderStatus === "ready" ? "pass" : evidence.readProviderStatus === "partial" ? "watch" : "fail",
      detail: evidence.readProviderStatus === "ready"
        ? "Helius/Solana reads and Jupiter route/order rehearsal credentials are present in server scope."
        : evidence.readProviderStatus === "partial"
          ? `${evidence.heliusRpcConfigured ? "Helius/Solana read rail is configured" : "Helius/Solana read rail is missing"}; ${evidence.jupiterConfigured ? "Jupiter route/order rail is configured" : "Jupiter route/order rail is missing"}.`
          : "Add HELIUS_API_KEY or SOLANA_RPC_URL plus JUPITER_API_KEY before provider-backed route and wallet evidence can be fully reviewed.",
    },
    {
      id: "provider-secret-scope",
      label: "Provider secret scope",
      status: evidence.providerConfigured && evidence.credentialConfigured ? "pass" : signer.active_provider === "external-wallet" && evidence.walletScoped ? "watch" : "fail",
      detail: evidence.providerConfigured && evidence.credentialConfigured
        ? `${providerLabel} credential scope is configured without exposing secrets.`
        : signer.active_provider === "external-wallet"
          ? "External wallet mode can request user-present signatures, but no autonomous provider credential is configured."
          : `${providerLabel} credentials, wallet ids, or policy ids are missing.`,
    },
    {
      id: "policy-hash",
      label: "Policy hash",
      status: evidence.policyHashValid ? "pass" : "fail",
      detail: evidence.policyHashValid ? "A 64-character policy hash ties signer requests to the custody envelope." : "Provider credentials require a valid policy hash.",
    },
    {
      id: "custody-envelope",
      label: "Custody envelope",
      status: evidence.custodyArmed ? "pass" : evidence.custodyBounded ? "watch" : "fail",
      detail: `${custody.status.replaceAll("-", " ")} custody with ${formatCompactValue(custody.per_trade_limit_usd)} per-trade cap and ${formatCompactValue(custody.remaining_cap_usd)} remaining.`,
    },
    {
      id: "signer-request",
      label: "Signer request",
      status: evidence.signerRequestReady ? "pass" : signer.active_request ? "watch" : "fail",
      detail: signer.active_request
        ? `${signer.active_request.status.replaceAll("-", " ")} hash-only request ${signer.active_request.request_id ?? "without request id"}.`
        : "No hash-only signer request is active.",
    },
    {
      id: "provider-packet",
      label: "Provider packet",
      status: evidence.packetReady ? "pass" : packet.status === "blocked" ? "fail" : "watch",
      detail: packet.status === "ready"
        ? `Provider packet is ready with ${packet.request_body_hash ? "redacted body hash" : "missing body hash"}.`
        : packet.blockers[0] ?? "Provider request packet is not ready.",
    },
    {
      id: "user-presence",
      label: "User presence",
      status: signer.requires_user_presence ? "watch" : "pass",
      detail: signer.requires_user_presence ? "Active provider requires a user-present wallet prompt for each signature." : "Active provider does not require user presence for the redacted request packet.",
    },
    {
      id: "live-boundary",
      label: "Live boundary",
      status: "pass",
      detail: "Provider credential evidence remains blocked from live execution and wallet mutation inside this app.",
    },
  ];
}

function providerCredentialsSummary(
  status: Web3ProviderCredentialsReadinessStatus,
  signer: AutonomousSignerOps,
  score: number,
) {
  const provider = signer.active_provider.replaceAll("-", " ");
  if (status === "provider-ready") return `${provider} credentials are provider-ready at ${score}/100; live execution still needs separate review.`;
  if (status === "request-gated") return `${provider} credentials are request-gated at ${score}/100; signer request or provider packet evidence is incomplete.`;
  if (status === "policy-gated") return `${provider} credentials are policy-gated at ${score}/100; custody must be armed with policy continuity.`;
  if (status === "blocked") return `${provider} credentials are blocked at ${score}/100 by signer or custody state.`;
  if (status === "credentials-missing") return `${provider} credentials are missing at ${score}/100.`;
  return `Provider credential readiness is missing wallet scope at ${score}/100.`;
}

function providerCredentialsNextAction(status: Web3ProviderCredentialsReadinessStatus) {
  if (status === "provider-ready") return "Keep the provider request behind manual live-executor review; do not self-enable real-capital trading.";
  if (status === "request-gated") return "Build or refresh a hash-only signer request and redacted provider packet before live-capital review.";
  if (status === "policy-gated") return "Arm a reviewed custody policy envelope with valid policy hash, caps, expiry, and route scope.";
  if (status === "blocked") return "Clear signer/custody blockers before provider credentials can be reviewed.";
  if (status === "credentials-missing") return "Configure reviewed provider credentials, wallet ids, and policy ids outside the app's persisted state.";
  return "Scope a public wallet key before provider credentials can be reviewed.";
}

function checkScore(status: Web3ProviderCredentialsReadinessCheck["status"]) {
  if (status === "pass") return 100;
  if (status === "watch") return 55;
  return 10;
}

function formatCompactValue(value: number) {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (absolute >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}
