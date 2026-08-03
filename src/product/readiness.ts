export type MasterMoldReadinessInput = {
  databaseStatus: string;
  dailyReportStatus: string;
  portfolioSource: string | null;
  engineStatus: string;
  autopilotEntryAuthority: string;
  polymarketPaperStrategy: string;
  polymarketStreamStatus: string;
};

export type MasterMoldReadiness = {
  status: "ready" | "limited" | "unavailable";
  decision_support: "ready" | "limited" | "unavailable";
  live_trading: "locked";
  reasons: string[];
};

export function masterMoldReadiness(input: MasterMoldReadinessInput): MasterMoldReadiness {
  if (input.databaseStatus !== "ok") {
    return {
      status: "unavailable",
      decision_support: "unavailable",
      live_trading: "locked",
      reasons: ["The local application database is unavailable."],
    };
  }

  const reasons: string[] = [];
  if (input.dailyReportStatus !== "fresh") {
    reasons.push("The daily report is missing or stale.");
  }
  if (!input.portfolioSource || /sample|fallback/i.test(input.portfolioSource)) {
    reasons.push("Portfolio context is sample or fallback data, not a current personal snapshot.");
  }
  if (input.engineStatus !== "live") {
    reasons.push("The analysis engine has no current validated output.");
  }
  if (input.autopilotEntryAuthority !== "active") {
    reasons.push("The Web3 entry strategy has no promotion authority.");
  }
  if (input.polymarketPaperStrategy === "none") {
    reasons.push("No Polymarket strategy currently qualifies even for paper authority.");
  }
  if (input.polymarketStreamStatus !== "live") {
    reasons.push("The Polymarket market stream is not live.");
  }

  return {
    status: reasons.length === 0 ? "ready" : "limited",
    decision_support: reasons.length === 0 ? "ready" : "limited",
    live_trading: "locked",
    reasons,
  };
}
