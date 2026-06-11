import { demoDatabase } from "./seed-data";
import type { IntegrationStatus } from "./schema";

export type IntegrationStatusJson = IntegrationStatus & {
  display_name: string;
  credential_hint: string;
  permission_scope: string;
  docs_url: string;
  researched_at: string;
  test_fields: IntegrationTestField[];
};

export type IntegrationTestField = {
  name: string;
  label: string;
  type: "password" | "text" | "select";
  placeholder: string;
  required: boolean;
  options?: Array<{ value: string; label: string }>;
};

const serviceDisplay: Record<
  IntegrationStatus["service"],
  Pick<
    IntegrationStatusJson,
    "display_name" | "credential_hint" | "permission_scope" | "docs_url" | "researched_at" | "test_fields"
  >
> = {
  coinbase: {
    display_name: "Coinbase",
    credential_hint: "Coinbase CDP account key",
    permission_scope: "Reads CDP accounts and balances only. No transfer, wallet-create, or trading permission.",
    docs_url: "https://docs.cdp.coinbase.com/api-reference/v2/rest-api/accounts/list-accounts",
    researched_at: "2026-06-09",
    test_fields: [
      {
        name: "api_key",
        label: "Accounts key / JWT",
        type: "password",
        placeholder: "Paste a short-lived accounts key",
        required: true,
      },
    ],
  },
  robinhood: {
    display_name: "Robinhood",
    credential_hint: "SnapTrade account access",
    permission_scope: "Reads account positions for one user. Trading capability is ignored; Master Mold never calls order endpoints.",
    docs_url: "https://docs.snaptrade.com/reference/Account%20Information/AccountInformation_getAllAccountPositions",
    researched_at: "2026-06-09",
    test_fields: [
      { name: "client_id", label: "Client ID", type: "text", placeholder: "SnapTrade clientId", required: true },
      { name: "consumer_key", label: "Consumer key", type: "password", placeholder: "SnapTrade consumerKey", required: true },
      { name: "user_id", label: "User ID", type: "text", placeholder: "SnapTrade userId", required: true },
      { name: "user_secret", label: "User secret", type: "password", placeholder: "SnapTrade userSecret", required: true },
    ],
  },
  onchain_wallet: {
    display_name: "On-chain wallet",
    credential_hint: "Wallet read key and address",
    permission_scope: "Reads wallet token positions through Zerion. It cannot sign transactions or move tokens.",
    docs_url: "https://developers.zerion.io/api-reference/wallets/get-wallet-fungible-positions",
    researched_at: "2026-06-09",
    test_fields: [
      { name: "api_key", label: "Zerion API key", type: "password", placeholder: "zk_dev_ or zk_prod_...", required: true },
      { name: "wallet_address", label: "Wallet address", type: "text", placeholder: "0x... or Solana address", required: true },
    ],
  },
  llm: {
    display_name: "Live chat",
    credential_hint: "Live chat key",
    permission_scope: "Sends one short test question. Uses the saved server key if the key field is blank; no account action happens.",
    docs_url: "https://openrouter.ai/docs/api-reference/chat-completion",
    researched_at: "2026-06-09",
    test_fields: [
      {
        name: "provider",
        label: "Chat service",
        type: "select",
        placeholder: "Chat service",
        required: true,
        options: [
          { value: "openrouter", label: "OpenRouter" },
          { value: "openai", label: "OpenAI" },
          { value: "anthropic", label: "Anthropic" },
        ],
      },
      { name: "api_key", label: "Live chat key", type: "password", placeholder: "Leave blank to use saved server key", required: false },
      { name: "model", label: "Advanced override", type: "text", placeholder: "Usually leave blank", required: false },
    ],
  },
};

export function getIntegrationStatuses(): IntegrationStatusJson[] {
  return demoDatabase.integrationStatuses.map((status) => ({
    ...status,
    ...serviceDisplay[status.service],
  }));
}
