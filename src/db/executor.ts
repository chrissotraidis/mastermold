import { demoDatabase } from "./seed-data";
import { isKnownBy, latestKnowledgeTime, type AsOfFilter } from "./bitemporal";
import type {
  Asset,
  ExecutorStrategy,
  FundingObservation,
  GuardrailConfig,
} from "./schema";

export type ExecutorFundingObservationJson = FundingObservation & {
  asset: Pick<Asset, "id" | "symbol" | "name" | "asset_class" | "venue">;
};

export type ExecutorJson = {
  strategies: ExecutorStrategy[];
  guardrail_configs: GuardrailConfig[];
  funding_observations: ExecutorFundingObservationJson[];
  provenance: {
    label: "Demo data";
    source: "Seeded ExecutorStrategy, GuardrailConfig, and FundingObservation rows";
    as_of: string;
    replay_as_of: string | null;
  };
};

export function getExecutor(asOf: AsOfFilter | null = null): ExecutorJson {
  const strategies = demoDatabase.executorStrategies
    .filter((strategy) => isKnownBy(strategy.knowledge_time, asOf))
    .sort((a, b) => a.name.localeCompare(b.name));
  const guardrailConfigs = demoDatabase.guardrailConfigs
    .filter((config) => isKnownBy(config.knowledge_time, asOf))
    .sort((a, b) => Date.parse(b.event_time) - Date.parse(a.event_time));
  const fundingObservations = demoDatabase.fundingObservations
    .filter((observation) => isKnownBy(observation.knowledge_time, asOf))
    .map(toFundingObservationJson)
    .filter((observation): observation is ExecutorFundingObservationJson => observation !== null)
    .sort((a, b) => Date.parse(a.period_ts) - Date.parse(b.period_ts));

  return {
    strategies,
    guardrail_configs: guardrailConfigs,
    funding_observations: fundingObservations,
    provenance: {
      label: "Demo data",
      source: "Seeded ExecutorStrategy, GuardrailConfig, and FundingObservation rows",
      as_of:
        asOf?.iso ??
        latestKnowledgeTime([
          ...strategies.map((strategy) => strategy.knowledge_time),
          ...guardrailConfigs.map((config) => config.knowledge_time),
          ...fundingObservations.map((observation) => observation.knowledge_time),
        ]),
      replay_as_of: asOf?.iso ?? null,
    },
  };
}

function toFundingObservationJson(
  observation: FundingObservation,
): ExecutorFundingObservationJson | null {
  const asset = demoDatabase.assets.find((item) => item.id === observation.asset_id);

  if (!asset) {
    return null;
  }

  return {
    ...observation,
    asset: {
      id: asset.id,
      symbol: asset.symbol,
      name: asset.name,
      asset_class: asset.asset_class,
      venue: asset.venue,
    },
  };
}
