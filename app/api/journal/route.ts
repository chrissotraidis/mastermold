import { NextResponse } from "next/server";
import { parseAsOf } from "@/src/db/bitemporal";
import {
  createDecisionJournalEntry,
  getJournal,
  type CreateDecisionInput,
  type JournalEntryJson,
  type JournalJson,
} from "@/src/db/journal";

type JournalRequest = {
  thesis?: unknown;
  signals?: unknown;
  conviction?: unknown;
  horizon?: unknown;
  falsification_condition?: unknown;
};

export function GET(
  request: Request,
): NextResponse<JournalJson | { error: string }> {
  const parsed = parseAsOf(new URL(request.url).searchParams.get("as_of"));

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 422 });
  }

  return NextResponse.json(getJournal(parsed.asOf));
}

export async function POST(
  request: Request,
): Promise<NextResponse<JournalEntryJson | { error: string } | { errors: string[] }>> {
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

  return NextResponse.json(createDecisionJournalEntry(normalized.input), { status: 201 });
}

function normalizeDecisionInput(body: JournalRequest): {
  input: CreateDecisionInput;
  errors: string[];
} {
  const errors: string[] = [];
  const thesis = normalizeText(body.thesis);
  const horizon = normalizeText(body.horizon);
  const falsificationCondition = normalizeText(body.falsification_condition);
  const conviction =
    typeof body.conviction === "number" && Number.isInteger(body.conviction)
      ? body.conviction
      : NaN;
  const signals = normalizeSignals(body.signals);

  if (!thesis) {
    errors.push("thesis is required");
  }

  if (signals.length === 0) {
    errors.push("signals must include at least one item");
  }

  if (!Number.isInteger(conviction) || conviction < 1 || conviction > 10) {
    errors.push("conviction must be an integer from 1 to 10");
  }

  if (!horizon) {
    errors.push("horizon is required");
  }

  if (!falsificationCondition) {
    errors.push("falsification_condition is required");
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
