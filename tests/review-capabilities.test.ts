/// <reference types="bun" />

import { describe, expect, test } from "bun:test";
import {
  getReviewCapabilityCoverage,
  reviewCapabilitySections,
  type ReviewCapabilityStatus,
} from "@/src/product/capabilities";

const textForReviewSurface = reviewCapabilitySections
  .flatMap((section) => [
    section.title,
    section.summary,
    section.source,
    section.reviewCredential,
    section.userVisibleSurface,
    section.evidenceEndpoint,
    ...section.items,
  ])
  .join("\n");

describe("review capability truth surface", () => {
  test("GIVEN the review readiness ledger WHEN capabilities are loaded THEN required truth categories are present", () => {
    const statuses = new Set<ReviewCapabilityStatus>(reviewCapabilitySections.map((section) => section.status));

    expect(statuses.has("working")).toBe(true);
    expect(statuses.has("sample")).toBe(true);
    expect(statuses.has("credential-gated")).toBe(true);
    expect(statuses.has("local-only")).toBe(true);
    expect(statuses.has("missing")).toBe(true);
  });

  test("GIVEN the review readiness ledger WHEN sections are checked THEN each section has reusable structured review metadata", () => {
    expect(reviewCapabilitySections.length).toBeGreaterThanOrEqual(5);

    for (const section of reviewCapabilitySections) {
      expect(section.id.length).toBeGreaterThan(0);
      expect(section.source.length).toBeGreaterThan(0);
      expect(section.reviewCredential.length).toBeGreaterThan(0);
      expect(section.userVisibleSurface.length).toBeGreaterThan(0);
      expect(section.evidenceEndpoint).toMatch(/^\/api\//);
      expect(section.summary.length).toBeGreaterThan(0);
      expect(section.items.length).toBeGreaterThan(0);
    }
  });

  test("GIVEN the review readiness ledger WHEN coverage is summarized THEN required honesty boundaries stay explicit", () => {
    expect(getReviewCapabilityCoverage()).toEqual({
      hasWorkingNow: true,
      hasSampleOrSeededData: true,
      hasCredentialGates: true,
      hasLocalOnlyBoundaries: true,
      hasMissingOrRoadmap: true,
      explainsReviewCredentials: true,
      blocksSecretInputs: true,
      blocksLiveAuthority: true,
    });
  });

  test("GIVEN the review readiness ledger WHEN reviewers inspect credential language THEN unsafe review inputs remain rejected", () => {
    expect(textForReviewSurface).toMatch(/Zo review credentials/i);
    expect(textForReviewSurface).toMatch(/private keys/i);
    expect(textForReviewSurface).toMatch(/seed phrases/i);
    expect(textForReviewSurface).toMatch(/wallet authority/i);
    expect(textForReviewSurface).toMatch(/live execution/i);
    expect(textForReviewSurface).toMatch(/wallet mutation/i);
    expect(textForReviewSurface).toMatch(/not built|roadmap/i);
  });

  test("GIVEN the portfolio brain is reviewable WHEN the readiness ledger is inspected THEN portfolio recommendations stay read-only", () => {
    expect(textForReviewSurface).toMatch(/Monarch MCP portfolio brain V1/i);
    expect(textForReviewSurface).toMatch(/\/api\/portfolio\b.*daily_review/i);
    expect(textForReviewSurface).toMatch(/Review, Watch, Trim candidate, Add candidate, or Paper test first/i);
    expect(textForReviewSurface).toMatch(/read-only portfolio preflight/i);
    expect(textForReviewSurface).toMatch(/syncs Monarch when configured/i);
    expect(textForReviewSurface).toMatch(/Monarch snapshot, imported holdings, manual holdings, or sample fallback context/i);
    expect(textForReviewSurface).toMatch(/visible risk driver/i);
    expect(textForReviewSurface).toMatch(/concentration, daily movement, and asset-class exposure/i);
    expect(textForReviewSurface).toMatch(/Trade page is explicitly Web3 autonomy only/i);
    expect(textForReviewSurface).toMatch(/read-only context there/i);
    expect(textForReviewSurface).toMatch(/cannot create Robinhood or brokerage orders/i);
    expect(textForReviewSurface).toMatch(/cannot place brokerage trades/i);
    expect(textForReviewSurface).toMatch(/sign transactions/i);
    expect(textForReviewSurface).toMatch(/move funds/i);
    expect(textForReviewSurface).toMatch(/not personalized financial advice/i);
  });
});
