import { createHash } from "node:crypto";
import {
  buildWeb3CredentialsSetupReadiness,
  type Web3CredentialLevel,
  type Web3ProviderAccountRunwayItem,
  type Web3SignerSetupMode,
} from "./web3-credentials";
import { getLatestWeb3WalletOwnershipReceipt } from "./web3-wallet-ownership";
import type { Web3TradingState } from "./web3-trading";

export type Web3AccountSetupReceiptStatus =
  | "missing-read-rail"
  | "missing-execution-rail"
  | "missing-wallet"
  | "ops-gated"
  | "dry-run-ready"
  | "live-review-blocked";

export type Web3AccountSetupReceiptCheck = {
  id:
    | "helius-read-rail"
    | "jupiter-execution-rail"
    | "dedicated-wallet"
    | "manual-signer"
    | "emergency-stop"
    | "accounting"
    | "live-boundary"
    | "secret-boundary";
  label: string;
  status: "pass" | "watch" | "fail";
  detail: string;
};

export type Web3AccountSetupReceipt = {
  mode: "web3-account-setup-receipt";
  status: Web3AccountSetupReceiptStatus;
  generated_at: string;
  source_state_as_of: string;
  receipt_hash: string;
  account_creation_permission: "operator-external-only";
  external_signup_permission: "blocked";
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  private_key_storage: "blocked";
  seed_phrase_storage: "blocked";
  secret_echo_permission: "blocked";
  environment_summary: {
    helius_read_rail_configured: boolean;
    solana_rpc_configured: boolean;
    solana_ws_configured: boolean;
    jupiter_configured: boolean;
    signer_provider: Web3SignerSetupMode;
    emergency_stop_configured: boolean;
    tax_ledger_configured: boolean;
    optional_market_feed_count: number;
    required_configured_count: number;
    required_account_count: number;
    missing_required: string[];
  };
  wallet_summary: {
    wallet_scoped: boolean;
    wallet_is_sample: boolean;
    dedicated_wallet_scoped: boolean;
    wallet_ownership_proved: boolean;
    wallet_ownership_verified_at: string | null;
    wallet_ownership_provider: string | null;
    wallet_ownership_receipt_hash: string | null;
    wallet_public_key_preview: string | null;
    custody_status: Web3TradingState["autonomous_custody_mandate"]["status"];
    signer_scope: Web3TradingState["autonomous_custody_mandate"]["signer_scope"];
    live_wallet_accounting_status: Web3TradingState["live_wallet_accounting_readiness"]["status"];
    can_trust_live_pnl: boolean;
  };
  credential_plan_summary: {
    status: ReturnType<typeof buildWeb3CredentialsSetupReadiness>["credential_plan"]["status"];
    active_level: Web3CredentialLevel["id"];
    read_only_level: Web3CredentialLevel["status"];
    dry_run_level: Web3CredentialLevel["status"];
    supervised_live_level: Web3CredentialLevel["status"];
    autonomous_live_level: Web3CredentialLevel["status"];
  };
  provider_runway_status: ReturnType<typeof buildWeb3CredentialsSetupReadiness>["provider_account_runway"]["status"];
  items: Array<Web3ProviderAccountRunwayItem & {
    configured: boolean;
    env_targets: string[];
  }>;
  checks: Web3AccountSetupReceiptCheck[];
  blockers: string[];
  controls: string[];
  summary: string;
  next_action: string;
};

export function buildWeb3AccountSetupReceipt(state: Web3TradingState): Web3AccountSetupReceipt {
  const generatedAt = new Date().toISOString();
  const walletPublicKey = state.autonomous_custody_mandate.wallet_public_key ??
    state.live_wallet_accounting_readiness.wallet_public_key ??
    state.execution_readiness.config.wallet_public_key ??
    null;
  const signerProvider = configuredSignerProvider();
  const readiness = buildWeb3CredentialsSetupReadiness({
    provider: hasEnv("HELIUS_API_KEY") ? "helius" : "custom-rpc",
    wallet_public_key: walletPublicKey ?? undefined,
    signer_mode: signerProvider,
    max_trade_usd: state.execution_readiness.config.max_trade_usd,
    daily_spend_cap_usd: state.execution_readiness.config.daily_spend_cap_usd,
    max_slippage_bps: state.execution_readiness.config.max_slippage_bps,
    require_manual_confirmation: true,
    test_mode: "validate-only",
  });
  const heliusConfigured = hasEnv("HELIUS_API_KEY") || hasEnv("SOLANA_RPC_URL") || hasEnv("NEXT_PUBLIC_SOLANA_RPC_URL");
  const solanaRpcConfigured = hasEnv("SOLANA_RPC_URL") || hasEnv("NEXT_PUBLIC_SOLANA_RPC_URL") || hasEnv("HELIUS_API_KEY");
  const solanaWsConfigured = hasEnv("SOLANA_WS_URL");
  const jupiterConfigured = hasEnv("JUPITER_API_KEY");
  const emergencyStopConfigured = hasEnv("MASTERMOLD_EMERGENCY_STOP_WEBHOOK_URL") || hasEnv("MASTERMOLD_EMERGENCY_STOP_CONTACT");
  const taxLedgerConfigured = hasEnv("MASTERMOLD_TAX_LEDGER_EXPORT_PATH");
  const optionalMarketFeedCount = [
    hasEnv("BIRDEYE_API_KEY"),
    hasEnv("PUMPFUN_FEED_URL") || hasEnv("PUMP_FUN_FEED_URL"),
    hasEnv("YELLOWSTONE_GRPC_ENDPOINT") || hasEnv("YELLOWSTONE_GRPC_TOKEN"),
  ].filter(Boolean).length;
  const walletScoped = Boolean(walletPublicKey);
  const walletIsSample = isSampleSystemWallet(walletPublicKey);
  const dedicatedWalletScoped = walletScoped && !walletIsSample;
  const walletOwnership = getLatestWeb3WalletOwnershipReceipt(walletPublicKey);
  const missingRequired = [
    !heliusConfigured ? "Helius/Solana read rail" : null,
    !jupiterConfigured ? "Jupiter execution rail" : null,
    !dedicatedWalletScoped ? "Dedicated public trading wallet" : null,
  ].filter((item): item is string => Boolean(item));
  const requiredAccountCount = 3;
  const requiredConfiguredCount = requiredAccountCount - missingRequired.length;
  const checks = buildAccountSetupChecks({
    heliusConfigured,
    jupiterConfigured,
    walletIsSample,
    dedicatedWalletScoped,
    signerProvider,
    emergencyStopConfigured,
    taxLedgerConfigured,
  });
  const status = accountSetupStatus({
    heliusConfigured,
    jupiterConfigured,
    dedicatedWalletScoped,
    emergencyStopConfigured,
    taxLedgerConfigured,
  });
  const items = readiness.provider_account_runway.items.map((item) => ({
    ...item,
    status: accountItemStatusOverride(item, {
      heliusConfigured,
      jupiterConfigured,
      dedicatedWalletScoped,
      signerProvider,
      emergencyStopConfigured,
      taxLedgerConfigured,
    }),
    configured: accountItemConfigured(item.id, {
      heliusConfigured,
      jupiterConfigured,
      dedicatedWalletScoped,
      signerProvider,
      emergencyStopConfigured,
      taxLedgerConfigured,
    }),
    env_targets: accountItemEnvTargets(item.id),
  }));
  const blockers = uniqueStrings([
    ...missingRequired,
    ...checks.filter((check) => check.status === "fail").map((check) => check.detail),
    ...state.autonomous_live_autonomy_readiness.blockers,
  ]).slice(0, 10);
  const levels = readiness.credential_plan.levels;
  const receiptBase = {
    mode: "web3-account-setup-receipt" as const,
    status,
    generated_at: generatedAt,
    source_state_as_of: state.market_source.fetched_at,
    account_creation_permission: "operator-external-only" as const,
    external_signup_permission: "blocked" as const,
    live_execution_permission: "blocked" as const,
    wallet_mutation_permission: "blocked" as const,
    private_key_storage: "blocked" as const,
    seed_phrase_storage: "blocked" as const,
    secret_echo_permission: "blocked" as const,
    environment_summary: {
      helius_read_rail_configured: heliusConfigured,
      solana_rpc_configured: solanaRpcConfigured,
      solana_ws_configured: solanaWsConfigured,
      jupiter_configured: jupiterConfigured,
      signer_provider: signerProvider,
      emergency_stop_configured: emergencyStopConfigured,
      tax_ledger_configured: taxLedgerConfigured,
      optional_market_feed_count: optionalMarketFeedCount,
      required_configured_count: requiredConfiguredCount,
      required_account_count: requiredAccountCount,
      missing_required: missingRequired,
    },
    wallet_summary: {
      wallet_scoped: walletScoped,
      wallet_is_sample: walletIsSample,
      dedicated_wallet_scoped: dedicatedWalletScoped,
      wallet_ownership_proved: Boolean(walletOwnership),
      wallet_ownership_verified_at: walletOwnership?.generated_at ?? null,
      wallet_ownership_provider: walletOwnership?.provider ?? null,
      wallet_ownership_receipt_hash: walletOwnership?.receipt_hash ?? null,
      wallet_public_key_preview: previewValue(walletPublicKey),
      custody_status: state.autonomous_custody_mandate.status,
      signer_scope: state.autonomous_custody_mandate.signer_scope,
      live_wallet_accounting_status: state.live_wallet_accounting_readiness.status,
      can_trust_live_pnl: state.live_wallet_accounting_readiness.can_trust_live_pnl,
    },
    credential_plan_summary: {
      status: readiness.credential_plan.status,
      active_level: readiness.credential_plan.active_level,
      read_only_level: levels.find((level) => level.id === "read-only-sync")?.status ?? "blocked",
      dry_run_level: levels.find((level) => level.id === "dry-run-rehearsal")?.status ?? "blocked",
      supervised_live_level: levels.find((level) => level.id === "supervised-live")?.status ?? "blocked",
      autonomous_live_level: levels.find((level) => level.id === "autonomous-live")?.status ?? "blocked",
    },
    provider_runway_status: readiness.provider_account_runway.status,
    items,
    checks,
    blockers,
    controls: [
      "This receipt detects local provider/account setup only; it does not create third-party accounts or transmit credentials.",
      "Create Helius, Jupiter, wallet, signer, ops, and accounting accounts outside the app, then store secrets in ignored server env.",
      "The browser may keep only public wallet scope and non-secret risk preferences; wallet ownership evidence is stored as a hash-only local audit receipt.",
      "Private keys, seed phrases, raw transactions, signed payloads, live execution, and wallet mutation remain blocked.",
    ],
    summary: accountSetupSummary(status, requiredConfiguredCount, requiredAccountCount),
    next_action: accountSetupNextAction(status, checks),
  };

  return {
    ...receiptBase,
    receipt_hash: hashJson(receiptBase),
  };
}

function accountSetupStatus(input: {
  heliusConfigured: boolean;
  jupiterConfigured: boolean;
  dedicatedWalletScoped: boolean;
  emergencyStopConfigured: boolean;
  taxLedgerConfigured: boolean;
}): Web3AccountSetupReceiptStatus {
  if (!input.heliusConfigured) return "missing-read-rail";
  if (!input.jupiterConfigured) return "missing-execution-rail";
  if (!input.dedicatedWalletScoped) return "missing-wallet";
  if (!input.emergencyStopConfigured) return "ops-gated";
  if (input.taxLedgerConfigured) return "live-review-blocked";
  return "dry-run-ready";
}

function buildAccountSetupChecks(input: {
  heliusConfigured: boolean;
  jupiterConfigured: boolean;
  walletIsSample: boolean;
  dedicatedWalletScoped: boolean;
  signerProvider: Web3SignerSetupMode;
  emergencyStopConfigured: boolean;
  taxLedgerConfigured: boolean;
}): Web3AccountSetupReceiptCheck[] {
  return [
    {
      id: "helius-read-rail",
      label: "Helius read rail",
      status: input.heliusConfigured ? "pass" : "fail",
      detail: input.heliusConfigured
        ? "Helius API key or Solana RPC is configured locally; run credential test for network proof."
        : "Add HELIUS_API_KEY or SOLANA_RPC_URL in ignored server env.",
    },
    {
      id: "jupiter-execution-rail",
      label: "Jupiter execution rail",
      status: input.jupiterConfigured ? "pass" : "fail",
      detail: input.jupiterConfigured
        ? "Jupiter key is configured locally for quote/order rehearsal checks."
        : "Add JUPITER_API_KEY before Swap V2 order rehearsal can be trusted.",
    },
    {
      id: "dedicated-wallet",
      label: "Dedicated wallet",
      status: input.dedicatedWalletScoped ? "pass" : "fail",
      detail: input.dedicatedWalletScoped
        ? "A dedicated public trading wallet is scoped; keep private keys and seed phrases outside the app."
        : input.walletIsSample
          ? "The sample all-ones wallet is allowed for demos but cannot satisfy dedicated trading-wallet readiness."
          : "Enter only a public Solana trading-wallet address in credential setup.",
    },
    {
      id: "manual-signer",
      label: "Manual signer",
      status: input.signerProvider === "external-wallet" ? "pass" : "watch",
      detail: input.signerProvider === "external-wallet"
        ? "Manual external wallet is the first live-review signer posture."
        : `${input.signerProvider.replaceAll("-", " ")} still needs policy-wallet review before live use.`,
    },
    {
      id: "emergency-stop",
      label: "Emergency stop",
      status: input.emergencyStopConfigured ? "pass" : "watch",
      detail: input.emergencyStopConfigured
        ? "Emergency-stop target metadata is configured; run the stop drill before live review."
        : "Configure an external stop owner/channel before supervised live trading.",
    },
    {
      id: "accounting",
      label: "Accounting",
      status: input.taxLedgerConfigured ? "pass" : "watch",
      detail: input.taxLedgerConfigured
        ? "Tax/accounting export target is configured; use only after confirmed settlement."
        : "Choose accounting export handling before real fills become authoritative.",
    },
    {
      id: "live-boundary",
      label: "Live boundary",
      status: "pass",
      detail: "Live execution and wallet mutation remain blocked by this receipt.",
    },
    {
      id: "secret-boundary",
      label: "Secret boundary",
      status: "pass",
      detail: "Secrets are detected as configured/missing only and are never echoed in the response.",
    },
  ];
}

function accountItemStatusOverride(
  item: Web3ProviderAccountRunwayItem,
  input: {
    heliusConfigured: boolean;
    jupiterConfigured: boolean;
    dedicatedWalletScoped: boolean;
    signerProvider: Web3SignerSetupMode;
    emergencyStopConfigured: boolean;
    taxLedgerConfigured: boolean;
  },
): Web3ProviderAccountRunwayItem["status"] {
  if (item.id === "helius-read-rail") return input.heliusConfigured ? "configured" : "needed";
  if (item.id === "jupiter-execution-rail") return input.jupiterConfigured ? "configured" : "needed";
  if (item.id === "dedicated-trading-wallet") return input.dedicatedWalletScoped ? "configured" : "needed";
  if (item.id === "external-signer") return input.signerProvider === "external-wallet" ? "configured" : "needed";
  if (item.id === "emergency-stop") return input.emergencyStopConfigured ? "configured" : "blocked";
  if (item.id === "tax-ledger") return input.taxLedgerConfigured ? "configured" : "future";
  return item.status;
}

function accountItemConfigured(
  id: Web3ProviderAccountRunwayItem["id"],
  input: {
    heliusConfigured: boolean;
    jupiterConfigured: boolean;
    dedicatedWalletScoped: boolean;
    signerProvider: Web3SignerSetupMode;
    emergencyStopConfigured: boolean;
    taxLedgerConfigured: boolean;
  },
) {
  if (id === "helius-read-rail") return input.heliusConfigured;
  if (id === "jupiter-execution-rail") return input.jupiterConfigured;
  if (id === "dedicated-trading-wallet") return input.dedicatedWalletScoped;
  if (id === "external-signer") return input.signerProvider === "external-wallet";
  if (id === "emergency-stop") return input.emergencyStopConfigured;
  if (id === "tax-ledger") return input.taxLedgerConfigured;
  if (id === "birdeye-discovery") return hasEnv("BIRDEYE_API_KEY");
  if (id === "pumpfun-launch-feed") return hasEnv("PUMPFUN_FEED_URL") || hasEnv("PUMP_FUN_FEED_URL");
  if (id === "yellowstone-grpc-stream") return hasEnv("YELLOWSTONE_GRPC_ENDPOINT") || hasEnv("YELLOWSTONE_GRPC_TOKEN");
  return id === "dexscreener-discovery";
}

function accountItemEnvTargets(id: Web3ProviderAccountRunwayItem["id"]) {
  const targets: Record<Web3ProviderAccountRunwayItem["id"], string[]> = {
    "helius-read-rail": ["HELIUS_API_KEY", "SOLANA_RPC_URL", "SOLANA_WS_URL"],
    "jupiter-execution-rail": ["JUPITER_API_KEY"],
    "dexscreener-discovery": [],
    "birdeye-discovery": ["BIRDEYE_API_KEY"],
    "pumpfun-launch-feed": ["PUMPFUN_FEED_URL"],
    "yellowstone-grpc-stream": ["YELLOWSTONE_GRPC_ENDPOINT", "YELLOWSTONE_GRPC_TOKEN"],
    "dedicated-trading-wallet": ["wallet_public_key"],
    "external-signer": ["MASTERMOLD_AUTONOMOUS_SIGNER_PROVIDER"],
    "emergency-stop": ["MASTERMOLD_EMERGENCY_STOP_WEBHOOK_URL", "MASTERMOLD_EMERGENCY_STOP_CONTACT"],
    "tax-ledger": ["MASTERMOLD_TAX_LEDGER_EXPORT_PATH"],
  };
  return targets[id];
}

function configuredSignerProvider(): Web3SignerSetupMode {
  const value = process.env.MASTERMOLD_AUTONOMOUS_SIGNER_PROVIDER;
  if (value === "privy-server-wallet" || value === "turnkey-policy-wallet" || value === "session-key-vault") return value;
  return "external-wallet";
}

function accountSetupSummary(status: Web3AccountSetupReceiptStatus, configured: number, required: number) {
  if (status === "missing-read-rail") return `Account setup has ${configured}/${required} required rails configured; Helius or Solana RPC is still missing.`;
  if (status === "missing-execution-rail") return `Account setup has ${configured}/${required} required rails configured; Jupiter Swap V2 order rail is still missing.`;
  if (status === "missing-wallet") return `Account setup has ${configured}/${required} required rails configured; a dedicated public trading wallet is still missing.`;
  if (status === "ops-gated") return "Core provider accounts are present, but emergency-stop operations are not configured for supervised live review.";
  if (status === "dry-run-ready") return "Core provider accounts are present for dry-run review; live trading still needs ops, settlement, accounting, and manual review.";
  return "Provider accounts are configured enough for manual live-review planning, but real execution remains blocked.";
}

function accountSetupNextAction(status: Web3AccountSetupReceiptStatus, checks: Web3AccountSetupReceiptCheck[]) {
  if (status === "dry-run-ready") return "Run Test credentials, Build signer receipt, Build ledger receipt, and landing drill before any manual live review.";
  if (status === "live-review-blocked") return "Collect network test evidence, signer proof, settlement proof, production worker proof, and manual live-review approval.";
  const fail = checks.find((check) => check.status === "fail");
  const watch = checks.find((check) => check.status === "watch");
  return fail?.detail ?? watch?.detail ?? "Keep account setup in paper/dry-run mode.";
}

function previewValue(value: string | null | undefined) {
  if (!value) return null;
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value?.trim()))));
}

function hasEnv(name: string) {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0;
}

function isSampleSystemWallet(value: string | null | undefined) {
  return value === SAMPLE_SYSTEM_WALLET;
}

const SAMPLE_SYSTEM_WALLET = "11111111111111111111111111111111";
