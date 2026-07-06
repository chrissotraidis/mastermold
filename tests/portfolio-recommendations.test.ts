/// <reference types="bun" />

import { describe, expect, test } from "bun:test";
import { getChatContext } from "@/src/db/chat";
import { getPortfolioRecommendations } from "@/src/db/portfolio-recommendations";

describe("portfolio-aware recommendations", () => {
  test("GIVEN visible holdings and Today cards WHEN recommendations are built THEN review classes stay advisory-only", () => {
    const recommendations = getPortfolioRecommendations(null, 6);

    expect(recommendations.length).toBeGreaterThan(0);
    expect(recommendations.map((item) => item.classification)).toContain("Trim candidate");
    expect(recommendations.map((item) => item.symbol)).toContain("BTC");
    expect(recommendations.map((item) => item.symbol)).toContain("NVDA");
    expect(recommendations.every((item) => item.data_boundary.includes("cannot place brokerage trades"))).toBe(true);
    expect(recommendations.every((item) => !/place (a )?(Robinhood|Monarch|brokerage) trade/i.test(item.detail))).toBe(true);
  });

  test("GIVEN chat context is built WHEN portfolio recommendations exist THEN live context carries review prompts only", () => {
    const context = getChatContext();

    expect(context.llm_context).toContain("portfolio_recommendations");
    expect(context.llm_context).toContain("Review prompt only");
    expect(context.llm_context).toContain("cannot place brokerage trades");
  });
});
