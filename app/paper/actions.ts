"use server";

import { revalidatePath } from "next/cache";
import {
  createPaperPrediction,
  isPaperDirection,
  resolvePaperAssetKey,
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
      message: "Paper trade could not be submitted. Review the form fields.",
      errors: normalized.errors,
    };
  }

  try {
    const prediction = createPaperPrediction(normalized.input);
    revalidatePath("/paper");

    return {
      status: "success",
      message: `Paper trade submitted for ${prediction.asset.symbol} at ${formatTimestamp(
        prediction.submitted_at,
      )}.`,
      errors: [],
    };
  } catch (error) {
    return {
      status: "error",
      message: "Paper trade could not be submitted.",
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
  const assetKey = normalizeText(formData.get("asset_key")) || normalizeText(formData.get("asset_id"));
  const assetId = assetKey ? resolvePaperAssetKey(assetKey) : null;
  const direction = normalizeText(formData.get("direction"));
  const paperSizeUsd = Number(
    normalizeText(formData.get("paper_size_usd")) || normalizeText(formData.get("fake_size_usd")),
  );
  const conviction = Number(normalizeText(formData.get("confidence")) || normalizeText(formData.get("conviction")));
  const rationale = normalizeText(formData.get("rationale"));

  if (!roundId) {
    errors.push("Choose a paper-test window.");
  }

  if (!assetKey || !assetId) {
    errors.push("Choose an asset.");
  }

  if (!isPaperDirection(direction)) {
    errors.push("Choose Long, Short, or No position.");
  }

  if (!Number.isFinite(paperSizeUsd) || paperSizeUsd < 100 || paperSizeUsd > 100000) {
    errors.push("Paper trade size must be between $100 and $100,000.");
  }

  if (!Number.isInteger(conviction) || conviction < 1 || conviction > 10) {
    errors.push("Confidence must be a whole number from 1 to 10.");
  }

  if (!rationale) {
    errors.push("Add why this paper trade makes sense.");
  }

  return {
    input: {
      round_id: roundId,
      asset_id: assetId ?? "",
      direction: isPaperDirection(direction) ? direction : "flat",
      fake_size_usd: Number.isFinite(paperSizeUsd) ? paperSizeUsd : 0,
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
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(value));
}
