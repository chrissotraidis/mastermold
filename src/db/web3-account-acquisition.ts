import { createHash } from "node:crypto";
import { buildWeb3AccountSetupReceipt, type Web3AccountSetupReceipt } from "./web3-account-setup";
import type { Web3TradingState } from "./web3-trading";

export type Web3AccountAcquisitionReceiptStatus =
  | "ready-for-order-rehearsal"
  | "needs-jupiter"
  | "needs-wallet"
  | "needs-read-rail"
  | "needs-ops"
  | "live-blocked";

export type Web3AccountAcquisitionItem = {
  id:
    | "helius"
    | "jupiter"
    | "dedicated-wallet"
    | "manual-signer"
    | "emergency-stop"
    | "accounting";
  label: string;
  status: "configured" | "needed" | "blocked" | "future";
  priority: "required-now" | "next" | "later";
  setup_url: string;
  docs_url: string;
  env_targets: string[];
  account_owner: "operator";
  app_permission: "inspect-config-only";
  next_action: string;
  security_rule: string;
  test_action: string;
};

export type Web3AccountAcquisitionReceipt = {
  mode: "web3-account-acquisition-receipt";
  status: Web3AccountAcquisitionReceiptStatus;
  generated_at: string;
  source_state_as_of: string;
  receipt_hash: string;
  account_creation_permission: "operator-external-only";
  in_app_signup_permission: "blocked";
  credential_storage_permission: "server-env-or-session-only";
  secret_echo_permission: "blocked";
  private_key_storage: "blocked";
  seed_phrase_storage: "blocked";
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  required_configured_count: number;
  required_account_count: number;
  missing_required: string[];
  next_external_action: string;
  env_template: string[];
  items: Web3AccountAcquisitionItem[];
  controls: string[];
  summary: string;
};

export function buildWeb3AccountAcquisitionReceipt(state: Web3TradingState): Web3AccountAcquisitionReceipt {
  const generatedAt = new Date().toISOString();
  const setup = buildWeb3AccountSetupReceipt(state);
  const items = buildAcquisitionItems(setup);
  const required = items.filter((item) => item.priority === "required-now");
  const missingRequired = required
    .filter((item) => item.status !== "configured")
    .map((item) => item.label);
  const status = acquisitionStatus(setup, missingRequired);
  const nextItem = items.find((item) => item.status === "needed" || item.status === "blocked") ??
    items.find((item) => item.priority === "next") ??
    items[0];
  const receiptBase = {
    mode: "web3-account-acquisition-receipt" as const,
    status,
    generated_at: generatedAt,
    source_state_as_of: state.market_source.fetched_at,
    account_creation_permission: "operator-external-only" as const,
    in_app_signup_permission: "blocked" as const,
    credential_storage_permission: "server-env-or-session-only" as const,
    secret_echo_permission: "blocked" as const,
    private_key_storage: "blocked" as const,
    seed_phrase_storage: "blocked" as const,
    live_execution_permission: "blocked" as const,
    wallet_mutation_permission: "blocked" as const,
    required_configured_count: required.length - missingRequired.length,
    required_account_count: required.length,
    missing_required: missingRequired,
    next_external_action: nextItem?.next_action ?? "Keep the Web3 account setup in dry-run review.",
    env_template: buildEnvTemplate(items),
    items,
    controls: [
      "This receipt can name external setup actions, but it cannot create accounts, submit signup forms, or transmit credentials.",
      "API keys belong in ignored server env or one-shot browser tests; private keys and seed phrases are never accepted.",
      "A dedicated wallet public address may be stored as non-secret scope, but wallet authority stays outside the app.",
      "Live execution, signing, submission, and wallet mutation remain blocked after the account packet is complete.",
    ],
    summary: acquisitionSummary(status, missingRequired),
  };

  return {
    ...receiptBase,
    receipt_hash: hashJson(receiptBase),
  };
}

function buildAcquisitionItems(setup: Web3AccountSetupReceipt): Web3AccountAcquisitionItem[] {
  const env = setup.environment_summary;
  const wallet = setup.wallet_summary;
  return [
    {
      id: "helius",
      label: "Helius Solana read rail",
      status: env.helius_read_rail_configured ? "configured" : "needed",
      priority: "required-now",
      setup_url: "https://www.helius.dev/",
      docs_url: "https://www.helius.dev/docs",
      env_targets: ["HELIUS_API_KEY", "SOLANA_RPC_URL", "SOLANA_WS_URL"],
      account_owner: "operator",
      app_permission: "inspect-config-only",
      next_action: env.helius_read_rail_configured
        ? "Keep Helius in ignored server env and run provider health when changing keys."
        : "Create or open Helius externally, generate an API key, and place it in ignored server env.",
      security_rule: "Restrict and rotate Helius keys; never expose them in browser storage or client-rendered responses.",
      test_action: "Run Test provider health and confirm Solana RPC plus latest blockhash pass.",
    },
    {
      id: "jupiter",
      label: "Jupiter execution rehearsal",
      status: env.jupiter_configured ? "configured" : "needed",
      priority: "required-now",
      setup_url: "https://developers.jup.ag/portal",
      docs_url: "https://dev.jup.ag/docs/swap",
      env_targets: ["JUPITER_API_KEY"],
      account_owner: "operator",
      app_permission: "inspect-config-only",
      next_action: env.jupiter_configured
        ? "Run provider health and dry-run order rehearsal; keep signing and submission blocked."
        : "Create or open the Jupiter Developer Platform externally, generate an API key, and add JUPITER_API_KEY to ignored server env.",
      security_rule: "Use the key only server-side or as a one-shot test input; never save it to browser storage.",
      test_action: "Run Test provider health and confirm Jupiter order changes from gated to ready with wallet scope.",
    },
    {
      id: "dedicated-wallet",
      label: "Dedicated Solana trading wallet",
      status: wallet.dedicated_wallet_scoped ? "configured" : "needed",
      priority: "required-now",
      setup_url: "https://solana.com/wallets",
      docs_url: "https://solana.com/docs/core/accounts",
      env_targets: ["wallet_public_key"],
      account_owner: "operator",
      app_permission: "inspect-config-only",
      next_action: wallet.dedicated_wallet_scoped
        ? "Keep only the public wallet address scoped; fund or sign outside the app only after manual review."
        : wallet.wallet_is_sample
          ? "Replace the sample all-ones wallet with a dedicated public Solana trading wallet before live-readiness review."
        : "Create a dedicated wallet externally and enter only its public Solana address in Web3 credential setup.",
      security_rule: "Never paste the private key or seed phrase into Master Mold.",
      test_action: "Run Test credentials and Test provider health to prove wallet-specific reads without mutation.",
    },
    {
      id: "manual-signer",
      label: "Manual external signer",
      status: env.signer_provider === "external-wallet" ? "configured" : "needed",
      priority: "next",
      setup_url: "https://solana.com/wallets",
      docs_url: "https://docs.turnkey.com/features/networks/solana",
      env_targets: ["MASTERMOLD_AUTONOMOUS_SIGNER_PROVIDER"],
      account_owner: "operator",
      app_permission: "inspect-config-only",
      next_action: env.signer_provider === "external-wallet"
        ? "Keep manual external wallet approval as the first supervised-live posture."
        : "Switch signer posture to manual external wallet before any live review.",
      security_rule: "Signer credentials and approvals stay in the wallet/provider surface, not in this app.",
      test_action: "Build signer receipt and confirm provider dispatch, signing, and wallet mutation remain blocked.",
    },
    {
      id: "emergency-stop",
      label: "Emergency stop operations",
      status: env.emergency_stop_configured ? "configured" : "blocked",
      priority: "next",
      setup_url: "https://www.helius.dev/docs/rpc/protect-your-keys",
      docs_url: "https://www.helius.dev/docs/rpc/protect-your-keys",
      env_targets: ["MASTERMOLD_EMERGENCY_STOP_WEBHOOK_URL", "MASTERMOLD_EMERGENCY_STOP_CONTACT"],
      account_owner: "operator",
      app_permission: "inspect-config-only",
      next_action: env.emergency_stop_configured
        ? "Run the local emergency-stop drill before supervised live review."
        : "Choose the external stop owner/channel and add redacted ops targets before supervised live review.",
      security_rule: "Ops targets stay server-side and must not expose webhook secrets in receipts.",
      test_action: "Run stop drill and confirm external dispatch is still blocked in local dry-run mode.",
    },
    {
      id: "accounting",
      label: "Tax/accounting evidence",
      status: env.tax_ledger_configured ? "configured" : "future",
      priority: "later",
      setup_url: "https://solana.com/docs/core/accounts",
      docs_url: "https://solana.com/docs/core/accounts",
      env_targets: ["MASTERMOLD_TAX_LEDGER_EXPORT_PATH"],
      account_owner: "operator",
      app_permission: "inspect-config-only",
      next_action: env.tax_ledger_configured
        ? "Use accounting export only after confirmed settlement and reviewed fill reconciliation."
        : "Choose a ledger/export target after settlement reconciliation is clean.",
      security_rule: "Persist reviewed fill evidence, not wallet authority or raw signer secrets.",
      test_action: "Build ledger receipt and confirm tax export remains paper-only until real settlement is reviewed.",
    },
  ];
}

function acquisitionStatus(
  setup: Web3AccountSetupReceipt,
  missingRequired: string[],
): Web3AccountAcquisitionReceiptStatus {
  if (missingRequired.some((item) => item.includes("Helius"))) return "needs-read-rail";
  if (missingRequired.some((item) => item.includes("Jupiter"))) return "needs-jupiter";
  if (missingRequired.some((item) => item.includes("wallet"))) return "needs-wallet";
  if (!setup.environment_summary.emergency_stop_configured) return "needs-ops";
  if (setup.environment_summary.jupiter_configured && setup.wallet_summary.dedicated_wallet_scoped) return "ready-for-order-rehearsal";
  return "live-blocked";
}

function buildEnvTemplate(items: Web3AccountAcquisitionItem[]) {
  return Array.from(new Set(
    items
      .flatMap((item) => item.env_targets)
      .filter((target) => target !== "wallet_public_key"),
  ))
    .map((target) => `${target}=<set in ignored local env>`);
}

function acquisitionSummary(status: Web3AccountAcquisitionReceiptStatus, missingRequired: string[]) {
  if (status === "needs-read-rail") return "External setup still needs a Solana read provider before wallet/provider proof is trustworthy.";
  if (status === "needs-jupiter") return "External setup still needs Jupiter API access before unsigned order rehearsal can be proven.";
  if (status === "needs-wallet") return "External setup still needs a dedicated public wallet address before account-scoped checks can be trusted.";
  if (status === "needs-ops") return "Core provider setup is close, but emergency-stop operations are still missing for supervised live review.";
  if (status === "ready-for-order-rehearsal") return "Required provider accounts are present for dry-run order rehearsal; live execution remains blocked.";
  return missingRequired.length > 0
    ? `External setup is missing ${missingRequired.join(", ")}.`
    : "External setup is sequenced, but live execution remains blocked pending signer, settlement, accounting, and manual review.";
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
