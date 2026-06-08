import { demoDatabase } from "./seed-data";
import type { IntegrationStatus } from "./schema";

export type IntegrationStatusJson = IntegrationStatus & {
  display_name: string;
  credential_hint: string;
};

const serviceDisplay: Record<IntegrationStatus["service"], Pick<IntegrationStatusJson, "display_name" | "credential_hint">> = {
  coinbase: {
    display_name: "Coinbase",
    credential_hint: "Coinbase API key (read-only)",
  },
  robinhood: {
    display_name: "Robinhood",
    credential_hint: "SnapTrade client key",
  },
  onchain_wallet: {
    display_name: "On-chain wallet",
    credential_hint: "Zerion API key",
  },
  llm: {
    display_name: "Reasoning model",
    credential_hint: "Model API key",
  },
};

export function getIntegrationStatuses(): IntegrationStatusJson[] {
  return demoDatabase.integrationStatuses.map((status) => ({
    ...status,
    ...serviceDisplay[status.service],
  }));
}
