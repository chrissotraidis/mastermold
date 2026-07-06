import type { AsOfFilter } from "./bitemporal";
import { getBrainState } from "./brain";
import { getLatestDailyReport, type DailyReport } from "./daily-report";
import { getDataMode, getEngineStatus } from "./engine-data";
import { getPortfolio } from "./portfolio";
import { getPortfolioBrainScanContext, getPortfolioBrainState } from "./portfolio-brain";
import { getPortfolioRecommendations } from "./portfolio-recommendations";
import { getScanStatusLine, isScanRunning, scanRunnerAvailable } from "./scan";

export type DailyTruthTone = "ready" | "warn" | "stale" | "sample";

export type DailyTruthItem = {
  label: string;
  value: string;
  detail: string;
  tone: DailyTruthTone;
};

export type DailyTruthSummary = {
  portfolio: DailyTruthItem;
  market: DailyTruthItem;
  schedule: DailyTruthItem;
  recommendations: DailyTruthItem;
  headline: string;
  chat_line: string;
};

export function getDailyTruthSummary(asOf: AsOfFilter | null = null): DailyTruthSummary {
  const portfolio = getPortfolio(asOf);
  const dataMode = getDataMode(asOf);
  const brain = getBrainState(asOf);
  const recommendations = getPortfolioRecommendations(asOf, 5);
  const engineStatus = getEngineStatus(asOf);
  const dailyReport = asOf ? null : getLatestDailyReport();
  const portfolioTruth = portfolioTruthItem(asOf, portfolio);
  const marketTruth = marketTruthItem(dataMode, engineStatus, dailyReport);
  const scheduleTruth = scheduleTruthItem(brain, asOf);
  const recommendationTruth = recommendationTruthItem(recommendations, portfolioTruth, marketTruth, dailyReport);

  return {
    portfolio: portfolioTruth,
    market: marketTruth,
    schedule: scheduleTruth,
    recommendations: recommendationTruth,
    headline: `${portfolioTruth.value} · ${marketTruth.value}`,
    chat_line: [
      `Portfolio: ${portfolioTruth.value}.`,
      `Market: ${marketTruth.value}.`,
      `Daily scan: ${scheduleTruth.value}.`,
      `Recommendations: ${recommendationTruth.value}.`,
    ].join(" "),
  };
}

function portfolioTruthItem(
  asOf: AsOfFilter | null,
  portfolio: ReturnType<typeof getPortfolio>,
): DailyTruthItem {
  if (asOf) {
    return {
      label: "Portfolio",
      value: "Replay view",
      detail: `Showing holdings known by ${asOf.iso}.`,
      tone: "stale",
    };
  }

  const brain = getPortfolioBrainState();
  if (brain.latest_snapshot) {
    return {
      label: "Portfolio",
      value: brain.freshness.is_stale ? "Stale Monarch" : "Monarch",
      detail: `${brain.freshness.label}; ${brain.summary.holdings_count} holding${brain.summary.holdings_count === 1 ? "" : "s"} across ${brain.summary.accounts_count} account${brain.summary.accounts_count === 1 ? "" : "s"}. Read-only snapshot.`,
      tone: brain.freshness.is_stale ? "stale" : "ready",
    };
  }

  const scanContext = getPortfolioBrainScanContext();
  if (scanContext.status === "manual") {
    return {
      label: "Portfolio",
      value: "Manual",
      detail: `${scanContext.holdings_count} local holding${scanContext.holdings_count === 1 ? "" : "s"}; account balances do not refresh themselves.`,
      tone: "warn",
    };
  }
  if (scanContext.status === "imported" || scanContext.status === "stale") {
    return {
      label: "Portfolio",
      value: scanContext.status === "stale" ? "Stale import" : "Imported",
      detail: `${scanContext.holdings_count} imported holding${scanContext.holdings_count === 1 ? "" : "s"}; sync or import again before relying on balances.`,
      tone: scanContext.status === "stale" ? "stale" : "ready",
    };
  }

  return {
    label: "Portfolio",
    value: "Sample",
    detail:
      portfolio.provenance.label === "Demo data"
        ? "No personal holdings are loaded. Add manual holdings or sync Monarch before treating this as yours."
        : portfolio.provenance.source,
    tone: "sample",
  };
}

function marketTruthItem(
  dataMode: ReturnType<typeof getDataMode>,
  engineStatus: ReturnType<typeof getEngineStatus>,
  dailyReport: DailyReport | null,
): DailyTruthItem {
  if (dailyReport) {
    const skippedCount = dailyReport.freshness.skipped_symbols.length;
    const refreshedCount = dailyReport.market_rows.filter((row) => row.status === "refreshed").length;
    return {
      label: "Market",
      value: skippedCount > 0 ? "Partial report" : "Daily report",
      detail: `${ageFromIso(dailyReport.created_at)}; ${dailyReport.market_source}; ${refreshedCount} refreshed, ${skippedCount} skipped.`,
      tone: skippedCount > 0 ? "warn" : "ready",
    };
  }

  if (engineStatus.state === "live") {
    const refreshStage = engineStatus.bundle.run.stages.data_refresh;
    const refreshLabel = typeof refreshStage === "string" ? refreshStage : "saved";
    const isSynthetic = refreshLabel.includes("synthetic");
    const stale = engineStatus.freshness === "stale";
    return {
      label: "Market",
      value: stale ? "Stale read" : isSynthetic ? "Synthetic read" : "Saved read",
      detail: `${dataMode.age_label ?? "recent"}; data refresh: ${plainStageLabel(refreshLabel)}.`,
      tone: stale ? "stale" : isSynthetic ? "warn" : "ready",
    };
  }

  if (engineStatus.state === "invalid") {
    return {
      label: "Market",
      value: "Unreadable",
      detail: `Latest saved market bundle could not be used: ${engineStatus.reason}.`,
      tone: "stale",
    };
  }

  return {
    label: "Market",
    value: "Sample",
    detail: "No saved market read is loaded yet.",
    tone: "sample",
  };
}

function scheduleTruthItem(
  brain: ReturnType<typeof getBrainState>,
  asOf: AsOfFilter | null,
): DailyTruthItem {
  if (asOf) {
    return {
      label: "Daily scan",
      value: "Replay",
      detail: "Current schedule settings are hidden while viewing a replay.",
      tone: "stale",
    };
  }

  if (isScanRunning()) {
    return {
      label: "Daily scan",
      value: "Running",
      detail: "A read-only scan is currently running. Nothing can trade or move funds.",
      tone: "ready",
    };
  }

  if (!scanRunnerAvailable()) {
    return {
      label: "Daily scan",
      value: "Unavailable",
      detail: "This machine cannot run the scan engine yet.",
      tone: "stale",
    };
  }

  if (brain.schedule.enabled) {
    return {
      label: "Daily scan",
      value: "Daily on",
      detail: brain.schedule.next_run
        ? `Next check: ${formatShortTime(brain.schedule.next_run)}. ${getScanStatusLine()}`
        : getScanStatusLine(),
      tone: "ready",
    };
  }

  return {
    label: "Daily scan",
    value: "Manual only",
    detail: getScanStatusLine(),
    tone: "warn",
  };
}

function recommendationTruthItem(
  recommendations: ReturnType<typeof getPortfolioRecommendations>,
  portfolio: DailyTruthItem,
  market: DailyTruthItem,
  dailyReport: DailyReport | null,
): DailyTruthItem {
  if (dailyReport) {
    const stale = dailyReport.freshness.stale || portfolio.tone === "stale" || market.tone === "stale";
    return {
      label: "Recommendations",
      value: stale ? "Report prompts" : "Daily report",
      detail: `${dailyReport.ideas.length} idea${dailyReport.ideas.length === 1 ? "" : "s"} from the saved daily report. Review only; no brokerage orders.`,
      tone: stale ? "warn" : "ready",
    };
  }

  if (recommendations.length === 0) {
    return {
      label: "Recommendations",
      value: "None ready",
      detail: "Add holdings or run a market read before using review prompts.",
      tone: "sample",
    };
  }

  const sourceLabels = new Set(recommendations.map((item) => item.source_label));
  const onlySample = portfolio.tone === "sample" || sourceLabels.has("Sample market context");
  const stale = portfolio.tone === "stale" || market.tone === "stale";
  return {
    label: "Recommendations",
    value: stale ? "Stale prompts" : onlySample ? "Sample prompts" : "Review prompts",
    detail: `${recommendations.length} prompt${recommendations.length === 1 ? "" : "s"} from ${[...sourceLabels].join(", ")}. Review only; no brokerage orders.`,
    tone: stale ? "stale" : onlySample ? "sample" : "ready",
  };
}

function plainStageLabel(value: string) {
  return value.replaceAll("_", " ");
}

function ageFromIso(value: string) {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return "saved report";
  const ageHours = Math.max(0, (Date.now() - parsed) / 3_600_000);
  if (ageHours < 1) return "saved less than 1h ago";
  if (ageHours < 48) return `saved ${Math.round(ageHours)}h ago`;
  return `saved ${Math.round(ageHours / 24)}d ago`;
}

function formatShortTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}
