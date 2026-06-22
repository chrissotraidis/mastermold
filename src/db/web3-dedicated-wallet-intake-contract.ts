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

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
