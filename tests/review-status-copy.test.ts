/// <reference types="bun" />

import { describe, expect, test } from "bun:test";
import { reviewResearchPathLabel, reviewRunNoteCopy, reviewScanActivityLabel } from "@/lib/review-status-copy";

describe("review status copy", () => {
  test("translates saved scan implementation labels into product language", () => {
    expect(reviewResearchPathLabel("openrouter_direct", { fallback: "missing graph" })).toBe(
      "Saved market summary",
    );
    expect(reviewResearchPathLabel("tradingagents_graph", {})).toBe("Market review");
    expect(reviewResearchPathLabel("quiet_no_agent_runs", {})).toBe("Skipped because nothing needed attention");
  });

  test("hides provider and dependency jargon from run notes", () => {
    const missingMarketData = reviewRunNoteCopy("ModuleNotFoundError: No module named 'yfinance'");
    const providerFallback = reviewRunNoteCopy("OpenRouter fallback used after graph dependency failed");

    expect(missingMarketData).toContain("optional market check");
    expect(missingMarketData).not.toMatch(/ModuleNotFoundError|yfinance|dependency|OpenRouter/i);
    expect(providerFallback).toBe("This read used the available local review path.");
    expect(providerFallback).not.toMatch(/OpenRouter|fallback|dependency/i);
    expect(`${missingMarketData} ${providerFallback}`).not.toMatch(/deeper research|saved-summary|this scan/i);
  });

  test("describes saved scan activity as things worth checking", () => {
    expect(reviewScanActivityLabel([])).toBe("Quiet day");
    expect(reviewScanActivityLabel(["NVDA"])).toBe("NVDA worth checking");
    expect(reviewScanActivityLabel(["NVDA", "BTC"])).toBe("NVDA, BTC worth checking");
    expect(reviewScanActivityLabel(["NVDA", "BTC", "ETH", "aUSDC"])).toBe("4 items worth checking");
    expect(reviewScanActivityLabel(["NVDA", "BTC", "ETH", "aUSDC"])).not.toMatch(/flagged|signal|screener/i);
  });
});
