import { plainPaperCopy } from "@/lib/paper-copy";
import { demoDatabase } from "./seed-data";
import { store } from "./store";
import {
  allRounds,
  allRoundScores,
  deriveRoundStatus,
  ensureOpenRound,
  resolveDueRounds,
} from "./paper-lifecycle";
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
  fake_size_usd: number;
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
  /** The engine's auto-entered predictions for the open round. */
  enginePredictions: PaperPredictionJson[];
  fake_wallet: {
    starting_balance: number;
    available_cash: number;
    open_fake_value: number;
    closed_result_value: number;
    open_positions: number;
  };
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
  fake_size_usd?: number;
  conviction: number;
  rationale: string;
};

const fakeStartingBalance = 100_000;

export function getPaper(asOf: AsOfFilter | null = null): PaperJson {
  // Current view only (never a replay): settle anything due, then make sure a
  // round is open for this trading week.
  if (!asOf) {
    resolveDueRounds();
    ensureOpenRound();
  }
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
  // Kept as a distinct list (not merged into the operator's predictions) so the
  // comparison panel renders side by side, not blurred together.
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
    fake_wallet: buildFakeWallet(paper.predictions, activeRound),
    provenance: {
      label: engineLive ? "Engine output" : "Demo data",
      source: engineLive
        ? `${engineRunSummary(status.bundle)} · local paper trades`
        : "Seeded PaperTradingRound, PaperPrediction, and RoundScore rows",
      as_of: asOf?.iso ?? (engineLive ? status.bundle.run.knowledge_time : latestKnowledgeTime(asOf)),
      replay_as_of: asOf?.iso ?? null,
    },
  };
}

export function createPaperPrediction(
  input: CreatePaperPredictionInput,
): PaperPredictionJson {
  const round = allRounds().find((item) => item.id === input.round_id);
  const asset = demoDatabase.assets.find((item) => item.id === input.asset_id);

  if (!round) {
    throw new Error("round_id does not match a paper trading round");
  }

  const nowMs = Date.now();
  const hasScore = allRoundScores().some((s) => s.round_id === round.id);
  if (deriveRoundStatus(round, hasScore, nowMs) !== "open") {
    throw new Error(
      `this round closed on ${round.closes_at.slice(0, 10)}; submit into the current open round instead`,
    );
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
    fake_size_usd: input.fake_size_usd ?? defaultFakeSize(input.conviction),
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

export function resolvePaperAssetKey(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  const asset = demoDatabase.assets.find(
    (item) => item.symbol.toLowerCase() === normalized || item.id.toLowerCase() === normalized,
  );

  return asset?.id ?? null;
}

function getRounds(
  asOf: AsOfFilter | null,
  predictions: PaperPredictionJson[],
  scores: RoundScore[],
): PaperRoundJson[] {
  // Status is always derived from closes_at + scores at the viewer's clock (or
  // the replayed moment) — the stored column is never trusted, so a round can
  // no longer sit "Open" weeks after its close date.
  const viewedAt = asOf ? asOf.time : Date.now();
  return allRounds()
    .filter((round) => isKnownBy(round.knowledge_time, asOf))
    .map((round) => {
      const score = scores.find((s) => s.round_id === round.id) ?? null;
      return {
        ...round,
        status: deriveRoundStatus(round, score !== null, viewedAt),
        predictions: predictions.filter((prediction) => prediction.round_id === round.id),
        score,
      };
    })
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
  return allRoundScores()
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
    fake_size_usd: prediction.fake_size_usd ?? defaultFakeSize(prediction.conviction),
    rationale: plainPaperCopy(prediction.rationale),
    submitter: "operator",
  };
}

/**
 * The engine's auto-entered predictions for a round: one per actionable engine
 * briefing card. Direction is the card's net driver sign (bullish weight minus bearish
 * weight), conviction is the card's conviction, rationale is the headline. This is the
 * paper-trade comparison panel — the engine commits a view, you submit yours, and the same
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
        fake_size_usd: defaultFakeSize(card.conviction),
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
    ...allRounds()
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

function buildFakeWallet(predictions: PaperPredictionJson[], activeRound: PaperRoundJson | null) {
  const operatorPredictions = predictions.filter((prediction) => prediction.submitter === "operator");
  const openPredictions = activeRound
    ? operatorPredictions.filter((prediction) => prediction.round_id === activeRound.id && prediction.direction !== "flat")
    : [];
  const closedPredictions = operatorPredictions.filter(
    (prediction) => !activeRound || prediction.round_id !== activeRound.id,
  );
  const openFakeValue = roundMoney(openPredictions.reduce((sum, prediction) => sum + prediction.fake_size_usd, 0));
  const closedResultValue = roundMoney(
    closedPredictions.reduce((sum, prediction) => {
      const directionSign = prediction.direction === "short" ? -1 : prediction.direction === "flat" ? 0 : 1;
      return sum + prediction.fake_size_usd * directionSign * (prediction.conviction / 100);
    }, 0),
  );

  return {
    starting_balance: fakeStartingBalance,
    available_cash: Math.max(roundMoney(fakeStartingBalance + closedResultValue - openFakeValue), 0),
    open_fake_value: openFakeValue,
    closed_result_value: closedResultValue,
    open_positions: openPredictions.length,
  };
}

function defaultFakeSize(conviction: number) {
  return Math.min(Math.max(conviction, 1), 10) * 1_000;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
