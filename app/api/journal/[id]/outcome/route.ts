import { NextResponse } from "next/server";
import { toPublicJournal, type PublicJournal } from "@/lib/public-api-copy";
import {
  createOutcomeScore,
  type CreateOutcomeInput,
} from "@/src/db/journal";
import { recordProductMetric } from "@/src/db/metrics";

type OutcomeRequest = {
  call_was_right?: unknown;
  review_quality?: unknown;
  result_score?: unknown;
  result_note?: unknown;
};

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse<PublicJournal["entries"][number] | { error: string } | { errors: string[] }>> {
  const { id } = await context.params;
  let body: OutcomeRequest;

  try {
    body = (await request.json()) as OutcomeRequest;
  } catch {
    return NextResponse.json({ error: "Expected JSON body" }, { status: 400 });
  }

  const normalized = normalizeOutcomeInput(body);
  if (normalized.errors.length > 0) {
    return NextResponse.json({ errors: normalized.errors }, { status: 422 });
  }

  const entry = createOutcomeScore(id, normalized.input);
  if (!entry || !entry.outcome_score) {
    return NextResponse.json({ error: "Journal entry not found or already resolved" }, { status: 404 });
  }

  recordProductMetric({
    event: "calibration_outcome",
    surface: "journal",
    entity_id: entry.id,
    value: entry.outcome_score.outcome_score,
    metadata: {
      conviction: entry.conviction,
      thesis_played_out: entry.outcome_score.thesis_played_out,
      process_score: entry.outcome_score.process_score,
    },
  });

  return NextResponse.json(toPublicJournal({
    entries: [entry],
    outcome_scores: entry.outcome_score ? [entry.outcome_score] : [],
    track_record: [],
    calibration: [],
    strategy_beliefs: [],
    reflection_updates: [],
    provenance: {
      label: "Demo data",
      source: "Saved decision result",
      as_of: entry.knowledge_time,
      replay_as_of: null,
    },
  }).entries[0], { status: 201 });
}

function normalizeOutcomeInput(body: OutcomeRequest): {
  input: CreateOutcomeInput;
  errors: string[];
} {
  const errors: string[] = [];
  const callWasRight = body.call_was_right;
  const reviewQuality = body.review_quality;
  const resultScore = body.result_score;
  const resultNote = typeof body.result_note === "string" ? body.result_note.trim() : "";

  if (typeof callWasRight !== "boolean") {
    errors.push("Choose whether the call was right.");
  }
  if (!isScore(reviewQuality)) {
    errors.push("Review quality must be a number from 0 to 10.");
  }
  if (!isScore(resultScore)) {
    errors.push("Result score must be a number from 0 to 10.");
  }
  if (!resultNote) {
    errors.push("Result note is required.");
  }

  return {
    input: {
      thesis_played_out: callWasRight === true,
      process_score: typeof reviewQuality === "number" ? reviewQuality : 0,
      outcome_score: typeof resultScore === "number" ? resultScore : 0,
      pnl_note: resultNote,
    },
    errors,
  };
}

function isScore(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 10;
}
