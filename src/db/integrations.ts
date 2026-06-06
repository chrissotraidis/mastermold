import { demoDatabase } from "./seed-data";
import type { IntegrationStatus } from "./schema";

export type IntegrationStatusJson = IntegrationStatus & {
  display_name: string;
  credential_hint: string;
};

const serviceDisplay: Record<IntegrationStatus["service"], Pick<IntegrationStatusJson, "display_name" | "credential_hint">> = {
  coinbase: {
    display_name: "Coinbase CDP",
    credential_hint: "Optional Coinbase CDP API key",
  },
  robinhood: {
    display_name: "Robinhood via SnapTrade",
    credential_hint: "Optional SnapTrade client key",
  },
  onchain_wallet: {
    display_name: "Zerion on-chain",
    credential_hint: "Optional Zerion API key",
  },
  llm: {
    display_name: "LLM",
    credential_hint: "Optional LLM API key",
  },
};

export function getIntegrationStatuses(): IntegrationStatusJson[] {
  return demoDatabase.integrationStatuses.map((status) => ({
    ...status,
    ...serviceDisplay[status.service],
  }));
}
