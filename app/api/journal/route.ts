import { NextResponse } from "next/server";
import { toPublicJournal, type PublicJournal } from "@/lib/public-api-copy";
import { parseAsOf } from "@/src/db/bitemporal";
import {
  createDecisionJournalEntry,
  getJournal,
  type CreateDecisionInput,
} from "@/src/db/journal";
import { recordProductMetric } from "@/src/db/metrics";

type JournalRequest = {
  call?: unknown;
  thesis?: unknown;
  reasons?: unknown;
  signals?: unknown;
  confidence?: unknown;
  conviction?: unknown;
  horizon?: unknown;
  falsification_condition?: unknown;
};

export function GET(
  request: Request,
): NextResponse<PublicJournal | { error: string }> {
  const parsed = parseAsOf(new URL(request.url).searchParams.get("as_of"));

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 422 });
  }

  return NextResponse.json(toPublicJournal(getJournal(parsed.asOf)));
}

export async function POST(
  request: Request,
): Promise<NextResponse<PublicJournal["entries"][number] | { error: string } | { errors: string[] }>> {
  let body: JournalRequest;

  try {
    body = (await request.json()) as JournalRequest;
  } catch {
    return NextResponse.json({ error: "Expected JSON body" }, { status: 400 });
  }

  const normalized = normalizeDecisionInput(body);

  if (normalized.errors.length > 0) {
    return NextResponse.json({ errors: normalized.errors }, { status: 422 });
  }

  const entry = createDecisionJournalEntry(normalized.input);
  recordProductMetric({
    event: "decision_logged",
    surface: "journal",
    entity_id: entry.id,
    value: entry.conviction,
    metadata: { horizon: entry.horizon, signal_count: entry.signals.length },
  });

  return NextResponse.json(toPublicJournal({ ...getJournal(), entries: [entry] }).entries[0], { status: 201 });
}

function normalizeDecisionInput(body: JournalRequest): {
  input: CreateDecisionInput;
  errors: string[];
} {
  const errors: string[] = [];
  const thesis = normalizeText(body.call) || normalizeText(body.thesis);
  const horizon = normalizeText(body.horizon);
  const falsificationCondition = normalizeText(body.falsification_condition);
  const confidence = body.confidence ?? body.conviction;
  const conviction =
    typeof confidence === "number" && Number.isInteger(confidence)
      ? confidence
      : NaN;
  const signals = normalizeSignals(body.reasons ?? body.signals);

  if (!thesis) {
    errors.push("Call is required.");
  }

  if (signals.length === 0) {
    errors.push("Add at least one thing that changed.");
  }

  if (!Number.isInteger(conviction) || conviction < 1 || conviction > 10) {
    errors.push("Confidence must be a whole number from 1 to 10.");
  }

  if (!horizon) {
    errors.push("Time horizon is required.");
  }

  if (!falsificationCondition) {
    errors.push("Add what would prove this wrong.");
  }

  return {
    input: {
      thesis,
      signals,
      conviction,
      horizon,
      falsification_condition: falsificationCondition,
    },
    errors,
  };
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSignals(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}
