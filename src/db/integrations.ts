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
    display_name: "Coinbase read-only",
    credential_hint: "Coinbase accounts key / OAuth token",
    permission_scope: "Reads Coinbase accounts and balances only. No transfer, wallet-create, or trading permission.",
    docs_url: "https://docs.cdp.coinbase.com/coinbase-app/advanced-trade-apis/guides/oauth-access",
    researched_at: "2026-06-25",
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
    display_name: "Brokerages via SnapTrade",
    credential_hint: "SnapTrade user connection",
    permission_scope: "Reads brokerage accounts and positions for one user. Trading capability is ignored; Master Mold never calls order endpoints.",
    docs_url: "https://docs.snaptrade.com/docs/account-data",
    researched_at: "2026-06-25",
    test_fields: [
      { name: "client_id", label: "Client ID", type: "text", placeholder: "SnapTrade clientId", required: true },
      { name: "consumer_key", label: "Consumer key", type: "password", placeholder: "SnapTrade consumerKey", required: true },
      { name: "user_id", label: "User ID", type: "text", placeholder: "SnapTrade userId", required: true },
      { name: "user_secret", label: "User secret", type: "password", placeholder: "SnapTrade userSecret", required: true },
    ],
  },
  onchain_wallet: {
    display_name: "Web3 wallets via Zerion",
    credential_hint: "Zerion key and public wallet",
    permission_scope: "Reads wallet token positions through Zerion. It cannot sign transactions or move tokens.",
    docs_url: "https://developers.zerion.io/api-reference/wallets/get-wallet-fungible-positions",
    researched_at: "2026-06-25",
    test_fields: [
      { name: "api_key", label: "Zerion API key", type: "password", placeholder: "zk_dev_ or zk_prod_...", required: true },
      { name: "wallet_address", label: "Wallet address", type: "text", placeholder: "0x... or Solana address", required: true },
    ],
  },
  llm: {
    display_name: "Live chat",
    credential_hint: "Provider key for live chat",
    permission_scope: "Sends one short test question to the selected chat service. Uses the saved server key if the key field is blank; no account action happens.",
    docs_url: "https://openrouter.ai/docs/api-reference/chat-completion",
    researched_at: "2026-06-25",
    test_fields: [
      {
        name: "provider",
        label: "Chat provider",
        type: "select",
        placeholder: "Chat provider",
        required: true,
        options: [
          { value: "openrouter", label: "OpenRouter" },
          { value: "openai", label: "OpenAI" },
          { value: "anthropic", label: "Anthropic" },
        ],
      },
      { name: "api_key", label: "Provider API key", type: "password", placeholder: "Optional one-time key for this browser", required: false },
      { name: "model", label: "Model override", type: "text", placeholder: "Optional, usually blank", required: false },
    ],
  },
};

export function getIntegrationStatuses(): IntegrationStatusJson[] {
  return demoDatabase.integrationStatuses.map((status) => ({
    ...status,
    ...serviceDisplay[status.service],
  }));
}
