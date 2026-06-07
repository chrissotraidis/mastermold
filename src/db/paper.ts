import { demoDatabase } from "./seed-data";
import { store } from "./store";
import {
  engineBriefingCards,
  engineDriversFor,
  engineRunSummary,
  getEngineStatus,
  type EngineBundle,
} from "./engine-data";
import { isKnownBy, latestKnowledgeTime as getLatestKnowledgeTime, type AsOfFilter } from "./bitemporal";
import type { Asset, PaperPrediction, PaperTradingRound, RoundScore } from "./schema";

export type PaperPredictionDirection = PaperPrediction["direction"];
export type PaperSubmitter = "engine" | "operator";

export type PaperPredictionJson = PaperPrediction & {
  asset: Pick<Asset, "id" | "symbol" | "name" | "asset_class" | "venue">;
  submitter: PaperSubmitter;
};

export type PaperRoundJson = PaperTradingRound & {
  predictions: PaperPredictionJson[];
  score: RoundScore | null;
};

export type PaperJson = {
  rounds: PaperRoundJson[];
  predictions: PaperPredictionJson[];
  scores: RoundScore[];
};

export type PaperPageData = PaperJson & {
  assets: Array<Pick<Asset, "id" | "symbol" | "name" | "asset_class" | "venue">>;
  activeRound: PaperRoundJson | null;
  completedRounds: PaperRoundJson[];
  /** The engine's auto-entered predictions for the open round — the human-vs-engine arena. */
  enginePredictions: PaperPredictionJson[];
  provenance: {
    label: "Demo data" | "Engine output";
    source: string;
    as_of: string;
    replay_as_of: string | null;
  };
};

export type CreatePaperPredictionInput = {
  round_id: string;
  asset_id: string;
  direction: PaperPredictionDirection;
  conviction: number;
  rationale: string;
};

export function getPaper(asOf: AsOfFilter | null = null): PaperJson {
  const scores = getScores(asOf);
  const predictions = getPredictions(asOf);
  const rounds = getRounds(asOf, predictions, scores);

  return {
    rounds,
    predictions,
    scores,
  };
}

export function getPaperPageData(asOf: AsOfFilter | null = null): PaperPageData {
  const paper = getPaper(asOf);
  const activeRound =
    paper.rounds.find((round) => round.status === "open") ??
    paper.rounds.find((round) => round.status === "scoring") ??
    null;

  // The engine auto-enters a prediction per actionable card into the open round.
  // The engine auto-enters a prediction per actionable card into the open round.
  // Kept as a distinct list (not merged into the operator's predictions) so the
  // human-vs-engine arena renders side by side, not blurred together.
  const status = getEngineStatus(asOf);
  const engineLive = status.state === "live";
  const enginePredictions: PaperPredictionJson[] =
    engineLive && activeRound ? enginePredictionsForRound(status.bundle, activeRound) : [];

  return {
    ...paper,
    assets: demoDatabase.assets
      .filter((asset) => isKnownBy(asset.knowledge_time, asOf))
      .map(({ id, symbol, name, asset_class, venue }) => ({
        id,
        symbol,
        name,
        asset_class,
        venue,
      }))
      .sort((a, b) => a.symbol.localeCompare(b.symbol)),
    activeRound,
    completedRounds: paper.rounds.filter((round) => round.status !== "open"),
    enginePredictions,
    provenance: {
      label: engineLive ? "Engine output" : "Demo data",
      source: engineLive
        ? `${engineRunSummary(status.bundle)} · operator predictions seeded/durable`
        : "Seeded PaperTradingRound, PaperPrediction, and RoundScore rows",
      as_of: asOf?.iso ?? (engineLive ? status.bundle.run.knowledge_time : latestKnowledgeTime(asOf)),
      replay_as_of: asOf?.iso ?? null,
    },
  };
}

export function createPaperPrediction(
  input: CreatePaperPredictionInput,
): PaperPredictionJson {
  const round = demoDatabase.paperTradingRounds.find((item) => item.id === input.round_id);
  const asset = demoDatabase.assets.find((item) => item.id === input.asset_id);

  if (!round) {
    throw new Error("round_id does not match a paper trading round");
  }

  if (round.status !== "open") {
    throw new Error("predictions can only be submitted for the active open round");
  }

  if (!asset) {
    throw new Error("asset_id does not match a seeded asset");
  }

  const now = new Date().toISOString();
  const prediction: PaperPrediction = {
    id: `pred_submitted_${Date.now().toString(36)}`,
    round_id: input.round_id,
    asset_id: input.asset_id,
    direction: input.direction,
    conviction: input.conviction,
    rationale: input.rationale,
    submitted_at: now,
    event_time: now,
    knowledge_time: now,
  };

  store().addPrediction(prediction);
  return toPredictionJson(prediction) as PaperPredictionJson;
}

export function isPaperDirection(value: string): value is PaperPredictionDirection {
  return value === "long" || value === "short" || value === "flat";
}

function getRounds(
  asOf: AsOfFilter | null,
  predictions: PaperPredictionJson[],
  scores: RoundScore[],
): PaperRoundJson[] {
  return [...demoDatabase.paperTradingRounds]
    .filter((round) => isKnownBy(round.knowledge_time, asOf))
    .map((round) => ({
      ...round,
      predictions: predictions.filter((prediction) => prediction.round_id === round.id),
      score: scores.find((score) => score.round_id === round.id) ?? null,
    }))
    .sort((a, b) => Date.parse(b.opens_at) - Date.parse(a.opens_at));
}

function getPredictions(asOf: AsOfFilter | null): PaperPredictionJson[] {
  return [...demoDatabase.paperPredictions, ...store().submittedPredictions()]
    .filter((prediction) => isKnownBy(prediction.knowledge_time, asOf))
    .map(toPredictionJson)
    .filter((prediction): prediction is PaperPredictionJson => prediction !== null)
    .sort((a, b) => Date.parse(b.submitted_at) - Date.parse(a.submitted_at));
}

function getScores(asOf: AsOfFilter | null): RoundScore[] {
  return [...demoDatabase.roundScores]
    .filter((score) => isKnownBy(score.knowledge_time, asOf))
    .sort((a, b) => Date.parse(b.event_time) - Date.parse(a.event_time));
}

function toPredictionJson(prediction: PaperPrediction): PaperPredictionJson | null {
  const asset = demoDatabase.assets.find((item) => item.id === prediction.asset_id);

  if (!asset) {
    return null;
  }

  return {
    ...prediction,
    asset: {
      id: asset.id,
      symbol: asset.symbol,
      name: asset.name,
      asset_class: asset.asset_class,
      venue: asset.venue,
    },
    submitter: "operator",
  };
}

/**
 * The engine's auto-entered predictions for a round: one per actionable engine
 * briefing card. Direction is the card's net driver sign (bullish weight minus bearish
 * weight), conviction is the card's conviction, rationale is the headline. This is the
 * human-vs-engine arena — the engine commits a view, you submit yours, and the same
 * Stage-3 outcome data scores both.
 */
function enginePredictionsForRound(
  bundle: EngineBundle,
  round: PaperTradingRound,
): PaperPredictionJson[] {
  return engineBriefingCards(bundle)
    .filter((card) => card.status === "actionable" && card.asset_ids.length > 0)
    .map((card): PaperPredictionJson | null => {
      const asset = demoDatabase.assets.find((item) => item.id === card.asset_ids[0]);
      if (!asset) return null;
      const drivers = engineDriversFor(bundle, card.id);
      const net = drivers.reduce(
        (sum, d) => sum + (d.direction === "bullish" ? d.weight : -d.weight),
        0,
      );
      const direction: PaperPredictionDirection = net >= 0 ? "long" : "short";
      return {
        id: `engine_pred_${round.id}_${asset.id}`,
        round_id: round.id,
        asset_id: asset.id,
        direction,
        conviction: card.conviction,
        rationale: card.headline,
        submitted_at: card.knowledge_time,
        event_time: card.event_time,
        knowledge_time: card.knowledge_time,
        asset: {
          id: asset.id,
          symbol: asset.symbol,
          name: asset.name,
          asset_class: asset.asset_class,
          venue: asset.venue,
        },
        submitter: "engine" as const,
      };
    })
    .filter((prediction): prediction is PaperPredictionJson => prediction !== null);
}

function latestKnowledgeTime(asOf: AsOfFilter | null) {
  const knowledgeTimes = [
    ...demoDatabase.paperTradingRounds
      .filter((round) => isKnownBy(round.knowledge_time, asOf))
      .map((round) => round.knowledge_time),
    ...demoDatabase.paperPredictions
      .filter((prediction) => isKnownBy(prediction.knowledge_time, asOf))
      .map((prediction) => prediction.knowledge_time),
    ...store()
      .submittedPredictions()
      .filter((prediction) => isKnownBy(prediction.knowledge_time, asOf))
      .map((prediction) => prediction.knowledge_time),
    ...demoDatabase.roundScores
      .filter((score) => isKnownBy(score.knowledge_time, asOf))
      .map((score) => score.knowledge_time),
  ];

  return getLatestKnowledgeTime(knowledgeTimes);
}
