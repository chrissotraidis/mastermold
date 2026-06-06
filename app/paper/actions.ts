"use server";

import { revalidatePath } from "next/cache";
import {
  createPaperPrediction,
  isPaperDirection,
  type CreatePaperPredictionInput,
} from "@/src/db/paper";

export type PaperPredictionFormState = {
  status: "idle" | "success" | "error";
  message: string;
  errors: string[];
};

export async function submitPaperPrediction(
  _previousState: PaperPredictionFormState,
  formData: FormData,
): Promise<PaperPredictionFormState> {
  const normalized = normalizePredictionInput(formData);

  if (normalized.errors.length > 0) {
    return {
      status: "error",
      message: "Prediction could not be submitted. Review the form fields.",
      errors: normalized.errors,
    };
  }

  try {
    const prediction = createPaperPrediction(normalized.input);
    revalidatePath("/paper");

    return {
      status: "success",
      message: `Prediction submitted for ${prediction.asset.symbol} at ${formatTimestamp(
        prediction.submitted_at,
      )}.`,
      errors: [],
    };
  } catch (error) {
    return {
      status: "error",
      message: "Prediction could not be submitted.",
      errors: [error instanceof Error ? error.message : "Unexpected submission error"],
    };
  }
}

function normalizePredictionInput(formData: FormData): {
  input: CreatePaperPredictionInput;
  errors: string[];
} {
  const errors: string[] = [];
  const roundId = normalizeText(formData.get("round_id"));
  const assetId = normalizeText(formData.get("asset_id"));
  const direction = normalizeText(formData.get("direction"));
  const conviction = Number(normalizeText(formData.get("conviction")));
  const rationale = normalizeText(formData.get("rationale"));

  if (!roundId) {
    errors.push("round_id is required");
  }

  if (!assetId) {
    errors.push("asset is required");
  }

  if (!isPaperDirection(direction)) {
    errors.push("direction must be long, short, or flat");
  }

  if (!Number.isInteger(conviction) || conviction < 1 || conviction > 10) {
    errors.push("conviction must be an integer from 1 to 10");
  }

  if (!rationale) {
    errors.push("rationale is required");
  }

  return {
    input: {
      round_id: roundId,
      asset_id: assetId,
      direction: isPaperDirection(direction) ? direction : "flat",
      conviction,
      rationale,
    },
    errors,
  };
}

function normalizeText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(value));
}
