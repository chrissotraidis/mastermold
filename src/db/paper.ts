import { demoDatabase } from "./seed-data";
import { isKnownBy, latestKnowledgeTime as getLatestKnowledgeTime, type AsOfFilter } from "./bitemporal";
import type { Asset, PaperPrediction, PaperTradingRound, RoundScore } from "./schema";

export type PaperPredictionDirection = PaperPrediction["direction"];

export type PaperPredictionJson = PaperPrediction & {
  asset: Pick<Asset, "id" | "symbol" | "name" | "asset_class" | "venue">;
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
  provenance: {
    label: "Demo data";
    source: "Seeded PaperTradingRound, PaperPrediction, and RoundScore rows";
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

const submittedPredictions: PaperPrediction[] = [];

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
    provenance: {
      label: "Demo data",
      source: "Seeded PaperTradingRound, PaperPrediction, and RoundScore rows",
      as_of: asOf?.iso ?? latestKnowledgeTime(asOf),
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

  submittedPredictions.push(prediction);
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
  return [...demoDatabase.paperPredictions, ...submittedPredictions]
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
  };
}

function latestKnowledgeTime(asOf: AsOfFilter | null) {
  const knowledgeTimes = [
    ...demoDatabase.paperTradingRounds
      .filter((round) => isKnownBy(round.knowledge_time, asOf))
      .map((round) => round.knowledge_time),
    ...demoDatabase.paperPredictions
      .filter((prediction) => isKnownBy(prediction.knowledge_time, asOf))
      .map((prediction) => prediction.knowledge_time),
    ...submittedPredictions
      .filter((prediction) => isKnownBy(prediction.knowledge_time, asOf))
      .map((prediction) => prediction.knowledge_time),
    ...demoDatabase.roundScores
      .filter((score) => isKnownBy(score.knowledge_time, asOf))
      .map((score) => score.knowledge_time),
  ];

  return getLatestKnowledgeTime(knowledgeTimes);
}
