import { describe, expect, test } from "bun:test";
import { masterMoldReadiness } from "../src/product/readiness";

describe("Master Mold decision readiness", () => {
  const readyInput = {
    databaseStatus: "ok",
    dailyReportStatus: "fresh",
    portfolioSource: "Monarch snapshot",
    engineStatus: "live",
    autopilotEntryAuthority: "active",
    polymarketPaperStrategy: "momentum",
    polymarketStreamStatus: "live",
  };

  test("distinguishes operational service health from limited decision inputs", () => {
    const readiness = masterMoldReadiness({
      ...readyInput,
      portfolioSource: "Sample fallback",
      engineStatus: "absent",
      autopilotEntryAuthority: "retired",
      polymarketPaperStrategy: "none",
      polymarketStreamStatus: "stale",
    });

    expect(readiness.status).toBe("limited");
    expect(readiness.decision_support).toBe("limited");
    expect(readiness.live_trading).toBe("locked");
    expect(readiness.reasons).toHaveLength(5);
  });

  test("reports ready only when every declared input is current and authorized", () => {
    expect(masterMoldReadiness(readyInput)).toEqual({
      status: "ready",
      decision_support: "ready",
      live_trading: "locked",
      reasons: [],
    });
  });

  test("an unavailable database makes decision support unavailable", () => {
    expect(masterMoldReadiness({ ...readyInput, databaseStatus: "error" })).toEqual({
      status: "unavailable",
      decision_support: "unavailable",
      live_trading: "locked",
      reasons: ["The local application database is unavailable."],
    });
  });
});
