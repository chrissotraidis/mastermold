import { getAlerts } from "./alerts";
import { isKnownBy, type AsOfFilter } from "./bitemporal";
import { demoDatabase } from "./seed-data";
import type { BrainRun, MarketMemoryFact } from "./schema";
import { store } from "./store";
import { getPortfolio } from "./portfolio";
import { getPortfolioBrainScanContext } from "./portfolio-brain";
import { recordProductMetric } from "./metrics";
import type { ProductMetricEventRow } from "./store";
import { plainBriefingHeadline, plainBriefingText } from "@/lib/plain-finance-copy";

export type BrainState = {
  initialized: boolean;
  latest_run: BrainRun | null;
  recent_runs: BrainRun[];
  facts: MarketMemoryFact[];
  source_ledger: BrainSourceLedgerItem[];
  schedule: {
    enabled: boolean;
    cadence: "manual" | "daily";
    status: string;
    next_run: string | null;
    last_run: string | null;
    last_check: string | null;
    last_check_message: string | null;
    last_check_status: "none" | "disabled" | "not_due" | "ran" | "failed";
    last_configured: string | null;
    configured_by: "environment" | "local setting";
    note: string;
  };
  summary: {
    status: string;
    snapshot_freshness: string;
    source_count: number;
    symbol_count: number;
    memory_count: number;
    chat_context: string;
    run_schedule: string;
  };
};

export type BrainScheduleCheckResult = {
  ok: boolean;
  status: "configured" | "disabled" | "not_due" | "ran" | "failed";
  message: string;
  checked_at: string;
  state: BrainState;
};

export type BrainSourceLedgerItem = {
  id: string;
  label: string;
  status:
    | "Imported + local/sample"
    | "Manual + sample"
    | "Sample only"
    | "Sample examples"
    | "No imported holdings"
    | "Imported holdings present";
  count: number;
  detail: string;
};

export async function initializeMarketBrain(): Promise<BrainState> {
  const startedAt = new Date().toISOString();
  const portfolio = getPortfolio();
  const alerts = getAlerts();
  const symbols = Array.from(new Set(portfolio.holdings.map((holding) => holding.symbol))).sort();
  const baseFacts = buildBaseFacts(startedAt);
  const modelSummary = await summarizeWithModel({
    symbols,
    portfolioTotal: portfolio.total_market_value,
    topHolding: portfolio.holdings[0]?.symbol ?? "none",
    alerts: alerts.slice(0, 3).map((alert) => alert.message),
    facts: baseFacts.map((fact) => fact.summary),
  });
  const completedAt = new Date().toISOString();
  const run: BrainRun = {
    id: `brain_run_${Date.now()}`,
    run_date: completedAt.slice(0, 10),
    status: "complete",
    started_at: startedAt,
    completed_at: completedAt,
    scope: portfolio.provenance.label === "Imported portfolio" ? "portfolio_snapshot" : "local_seed",
    source_count: sourceCount(baseFacts),
    symbols,
    inference_model: modelSummary.model,
    summary: modelSummary.summary,
    event_time: startedAt,
    knowledge_time: completedAt,
  };

  for (const fact of baseFacts) store().upsertMarketMemoryFact(fact);
  store().upsertBrainRun(run);
  return getBrainState();
}

export function getBrainState(asOf: AsOfFilter | null = null): BrainState {
  const runs = store()
    .brainRuns(5)
    .map(normalizeBrainRun)
    .filter((run) => isKnownBy(run.knowledge_time, asOf));
  const facts = store()
    .marketMemoryFacts(24)
    .map(normalizeMarketMemoryFact)
    .filter((fact) => isKnownBy(fact.knowledge_time, asOf));
  const latestRun = runs[0] ?? null;
  const schedule = asOf ? getReplayBrainSchedule(latestRun, asOf) : getBrainSchedule(latestRun);
  const freshness = asOf
    ? latestRun
      ? "Saved by replay time"
      : "No snapshot by replay time"
    : describeBrainSnapshotFreshness(latestRun?.completed_at ?? null);
  const sourceLedger = buildSourceLedger(facts, asOf);
  return {
    initialized: Boolean(latestRun),
    latest_run: latestRun,
    recent_runs: runs,
    facts,
    source_ledger: sourceLedger,
    schedule,
    summary: {
      status: latestRun
        ? asOf
          ? "Chat context existed by replay time"
          : "Chat context saved"
        : asOf
          ? "No snapshot saved by replay time"
          : "No snapshot saved",
      snapshot_freshness: freshness,
      source_count: latestRun?.source_count ?? 0,
      symbol_count: latestRun?.symbols.length ?? 0,
      memory_count: facts.length,
      chat_context: latestRun ? "Included in chat" : "Not included yet",
      run_schedule: schedule.status,
    },
  };
}

export async function runBrainScheduleCheck(input: {
  force?: boolean;
  trigger?: string;
} = {}): Promise<BrainScheduleCheckResult> {
  const checkedAt = new Date().toISOString();
  const latestRun = store().brainRuns(1).map(normalizeBrainRun)[0] ?? null;
  const schedule = getBrainSchedule(latestRun, new Date(checkedAt));
  const trigger = cleanScheduleTrigger(input.trigger);

  if (!schedule.enabled) {
    recordBrainScheduleCheck("disabled", checkedAt, trigger, "Chat context automation is off.");
    return {
      ok: true,
      status: "disabled",
      checked_at: checkedAt,
      message: "Chat context automation is off. No snapshot changed.",
      state: getBrainState(),
    };
  }

  if (!input.force && !scheduleIsDue(schedule, checkedAt)) {
    recordBrainScheduleCheck("not_due", checkedAt, trigger, "Chat context check already ran for this window.");
    return {
      ok: true,
      status: "not_due",
      checked_at: checkedAt,
      message: "Chat context check is not due yet. No snapshot changed.",
      state: getBrainState(),
    };
  }

  try {
    await initializeMarketBrain();
    recordBrainScheduleCheck("ran", checkedAt, trigger, "Chat context check saved a snapshot.");
    const state = getBrainState();
    return {
      ok: true,
      status: "ran",
      checked_at: checkedAt,
      message:
        "Chat context check saved a snapshot. Import holdings again when you want current balances.",
      state,
    };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Chat context check failed.";
    recordBrainScheduleCheck("failed", checkedAt, trigger, message);
    return {
      ok: false,
      status: "failed",
      checked_at: checkedAt,
      message: "Chat context check failed. Existing Today recommendations were left unchanged.",
      state: getBrainState(),
    };
  }
}

export async function getBrainStateAfterDueScheduleCheck(input: {
  trigger?: string;
} = {}): Promise<BrainState> {
  const state = getBrainState();
  const nextRun = state.schedule.next_run;
  if (!state.schedule.enabled || !nextRun || Date.parse(nextRun) > Date.now()) {
    return state;
  }

  return (await runBrainScheduleCheck({
    trigger: input.trigger ?? "app-open",
  })).state;
}

export function configureBrainSchedule(input: {
  enabled: boolean;
  trigger?: string;
}): BrainScheduleCheckResult {
  const checkedAt = new Date().toISOString();
  const trigger = cleanScheduleTrigger(input.trigger);
  const enabled = Boolean(input.enabled);

  recordProductMetric({
    event: "brain_schedule_config",
    surface: "settings",
    entity_id: "market-memory",
    value: enabled ? 1 : 0,
    metadata: {
      enabled,
      trigger,
      checked_at: checkedAt,
      message: enabled
        ? "Chat context automation armed."
        : "Chat context automation paused.",
    },
  });

  return {
    ok: true,
    status: "configured",
    checked_at: checkedAt,
    message: enabled
      ? "Chat context automation is on. It can save the same chat context when this app or a daily check runs; import holdings again when you want current balances."
      : "Chat context automation is off. You can still save chat context manually.",
    state: getBrainState(),
  };
}

export function describeBrainSnapshotFreshness(completedAt: string | null, now = new Date()): string {
  if (!completedAt) return "No snapshot yet";
  const completed = new Date(completedAt);
  if (Number.isNaN(completed.getTime())) return "Unknown";
  const ageHours = Math.max(0, (now.getTime() - completed.getTime()) / 3_600_000);
  if (ageHours < 24) return "Saved today";
  const ageDays = Math.max(1, Math.floor(ageHours / 24));
  return ageDays === 1 ? "Older than 1 day" : `Older than ${ageDays} days`;
}

export function getBrainContextForInference(asOf: AsOfFilter | null = null) {
  const state = getBrainState(asOf);
  return {
    initialized: state.initialized,
    latest_snapshot: state.latest_run
      ? {
          saved_at: state.latest_run.completed_at,
          evidence_count: state.latest_run.source_count,
          symbols: state.latest_run.symbols,
          summary: state.latest_run.summary,
      }
      : null,
    snapshot_freshness: state.summary.snapshot_freshness,
    schedule: {
      enabled: state.schedule.enabled,
      status: state.schedule.status,
      cadence: state.schedule.cadence,
      next_run: state.schedule.next_run,
      last_check_status: state.schedule.last_check_status,
      note: state.schedule.note,
    },
    memory_facts: state.facts.slice(0, 24).map((fact) => ({
      symbol: fact.symbol,
      category: brainFactCategory(fact.topic),
      summary: fact.summary,
      confidence: fact.confidence,
      evidence_count: fact.source_count,
      saved_at: fact.updated_at,
      as_of_date: fact.knowledge_time.slice(0, 10),
    })),
    snapshot_sources: state.source_ledger.map((item) => ({
      label: item.label,
      status: item.status,
      count: item.count,
      detail: item.detail,
    })),
  };
}

function brainFactCategory(topic: MarketMemoryFact["topic"]) {
  if (topic === "portfolio") return "Visible portfolio";
  if (topic === "news") return "Market news";
  if (topic === "funding") return "Borrow rates";
  if (topic === "risk") return "Portfolio risk";
  return plainBriefingText(topic);
}

function buildBaseFacts(now: string): MarketMemoryFact[] {
  const portfolio = getPortfolio();
  const portfolioScanContext = getPortfolioBrainScanContext();
  const facts: MarketMemoryFact[] = [];
  const topHolding = portfolio.holdings[0] ?? null;
  if (topHolding) {
    facts.push({
      id: "brain_fact_top_holding",
      symbol: topHolding.symbol,
      topic: "portfolio",
      summary: `${topHolding.symbol} is the largest ${holdingScope(topHolding.source)} at ${topHolding.weight_pct.toFixed(1)}%.`,
      confidence: 0.82,
      source_count: portfolioScanContext.holdings_count || portfolio.manual_holdings.length || demoDatabase.holdings.length,
      evidence_urls: [],
      created_at: now,
      updated_at: now,
      event_time: topHolding.as_of,
      knowledge_time: now,
    });
  }

  for (const item of demoDatabase.newsItems.slice(0, 8)) {
    const asset = item.asset_id ? demoDatabase.assets.find((candidate) => candidate.id === item.asset_id) : null;
    facts.push({
      id: `brain_fact_news_${item.id}`,
      symbol: asset?.symbol ?? null,
      topic: "news",
      summary: asset ? `${asset.symbol}: ${plainBriefingHeadline(item.headline)}` : plainBriefingHeadline(item.headline),
      confidence: 0.62,
      source_count: 1,
      evidence_urls: item.url ? [item.url] : [],
      created_at: now,
      updated_at: now,
      event_time: item.event_time,
      knowledge_time: item.knowledge_time,
    });
  }

  for (const observation of demoDatabase.fundingObservations.slice(0, 6)) {
    const asset = demoDatabase.assets.find((candidate) => candidate.id === observation.asset_id);
    facts.push({
      id: `brain_fact_funding_${observation.id}`,
      symbol: asset?.symbol ?? null,
      topic: "funding",
      summary: `${asset?.symbol ?? "Asset"} had a sample borrow-payment change worth checking. Treat it as borrow-market context, not a live rate feed.`,
      confidence: 0.58,
      source_count: 1,
      evidence_urls: [],
      created_at: now,
      updated_at: now,
      event_time: observation.period_ts,
      knowledge_time: observation.knowledge_time,
    });
  }

  const concentration = portfolio.concentration.top_symbol && portfolio.concentration.top_position_pct >= 25
    ? portfolio.concentration
    : null;
  if (concentration?.top_symbol) {
    facts.push({
      id: `brain_fact_risk_${concentration.top_symbol.toLowerCase()}`,
      symbol: concentration.top_symbol,
      topic: "risk",
      summary: `${concentration.top_symbol} concentration is high enough to affect daily recommendations.`,
      confidence: 0.75,
      source_count: 1,
      evidence_urls: [],
      created_at: now,
      updated_at: now,
      event_time: now,
      knowledge_time: now,
    });
  }

  return facts;
}

function getBrainSchedule(latestRun: BrainRun | null, now = new Date()): BrainState["schedule"] {
  const config = latestBrainScheduleConfig();
  const enabledByEnv = process.env.MASTERMOLD_BRAIN_DAILY_SCAN === "1";
  const enabledByLocalSetting = config?.enabled === true;
  const enabled = enabledByEnv || enabledByLocalSetting;
  const lastCheck = latestBrainScheduleCheck();
  const nextRun = enabled ? nextDailyRunIso(latestRun?.completed_at ?? null, now) : null;
  return {
    enabled,
    cadence: enabled ? "daily" : "manual",
    status: enabled ? (nextRun && Date.parse(nextRun) <= now.getTime() ? "Ready to save chat context" : "Chat context check armed") : "Manual only",
    next_run: nextRun,
    last_run: latestRun?.completed_at ?? null,
    last_check: lastCheck?.created_at ?? null,
    last_check_message: scheduleCheckMessage(lastCheck),
    last_check_status: scheduleCheckStatus(lastCheck),
    last_configured: config?.created_at ?? null,
    configured_by: enabledByEnv ? "environment" : "local setting",
    note: enabled
      ? "This only saves chat context when this app or a daily check runs. It does not fetch fresh market news or refresh accounts."
      : "Chat context automation is off. Save context when you want chat to remember the current view.",
  };
}

function getReplayBrainSchedule(latestRun: BrainRun | null, asOf: AsOfFilter): BrainState["schedule"] {
  return {
    enabled: false,
    cadence: "manual",
    status: latestRun ? "Replayed chat context" : "No memory at this time",
    next_run: null,
    last_run: latestRun?.completed_at ?? null,
    last_check: null,
    last_check_message: null,
    last_check_status: "none",
    last_configured: null,
    configured_by: "local setting",
    note: latestRun
      ? `Showing memory known by ${formatReplayDate(asOf.iso)}. Current schedule settings are hidden in rewind.`
      : `No chat context snapshot had been saved by ${formatReplayDate(asOf.iso)}.`,
  };
}

function scheduleIsDue(schedule: BrainState["schedule"], checkedAt: string) {
  if (!schedule.next_run) return true;
  return Date.parse(schedule.next_run) <= Date.parse(checkedAt);
}

function nextDailyRunIso(latestCompletedAt: string | null, now: Date) {
  if (!latestCompletedAt) return now.toISOString();
  const latest = new Date(latestCompletedAt);
  if (Number.isNaN(latest.getTime())) return now.toISOString();
  const next = new Date(latest);
  next.setUTCDate(next.getUTCDate() + 1);
  if (next.getTime() <= now.getTime()) return now.toISOString();
  return next.toISOString();
}

function latestBrainScheduleCheck() {
  return store()
    .productEvents(100)
    .find((event) => event.event === "brain_schedule_check");
}

function latestBrainScheduleConfig(): { enabled: boolean; created_at: string } | null {
  const event = store()
    .productEvents(100)
    .find((row) => row.event === "brain_schedule_config");
  if (!event || !event.metadata || typeof event.metadata !== "object") return null;
  const enabled = (event.metadata as { enabled?: unknown }).enabled;
  return {
    enabled: enabled === true,
    created_at: event.created_at,
  };
}

function scheduleCheckStatus(
  event: ProductMetricEventRow | undefined,
): BrainState["schedule"]["last_check_status"] {
  if (!event || !event.metadata || typeof event.metadata !== "object") return "none";
  const status = (event.metadata as { status?: unknown }).status;
  if (status === "disabled" || status === "not_due" || status === "ran" || status === "failed") {
    return status;
  }
  return "none";
}

function scheduleCheckMessage(event: ProductMetricEventRow | undefined) {
  if (!event || !event.metadata || typeof event.metadata !== "object") return null;
  const message = (event.metadata as { message?: unknown }).message;
  return typeof message === "string" && message.trim() ? cleanBrainCopy(message) : null;
}

function recordBrainScheduleCheck(
  status: BrainScheduleCheckResult["status"],
  checkedAt: string,
  trigger: string,
  message: string,
) {
  recordProductMetric({
    event: "brain_schedule_check",
    surface: "settings",
    entity_id: "market-memory",
    value: status === "ran" ? 1 : 0,
    metadata: { status, trigger, message, checked_at: checkedAt },
  });
}

function cleanScheduleTrigger(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 40) : "manual";
}

function buildSourceLedger(facts: MarketMemoryFact[], asOf: AsOfFilter | null = null): BrainSourceLedgerItem[] {
  const portfolio = getPortfolio(asOf);
  const portfolioScanContext = asOf ? null : getPortfolioBrainScanContext();
  const manualCount = portfolio.manual_holdings.length;
  const sampleCount = portfolio.holdings.filter((holding) => holding.source === "demo").length;
  const importedCount = portfolio.holdings.filter((holding) => holding.source === "connected").length;
  const countFacts = (topic: MarketMemoryFact["topic"]) =>
    facts.filter((fact) => fact.topic === topic).length;

  return [
    {
      id: "visible-portfolio",
      label: "Visible portfolio",
      status: importedCount > 0 ? "Imported + local/sample" : manualCount > 0 ? "Manual + sample" : "Sample only",
      count: portfolio.holdings.length,
      detail:
        importedCount > 0
          ? portfolioScanContext?.synced_at
            ? `${importedCount} imported ${importedCount === 1 ? "holding" : "holdings"} from the ${portfolioScanContext.source_label} snapshot, ${manualCount} manual ${manualCount === 1 ? "holding" : "holdings"}, and ${sampleCount} sample ${sampleCount === 1 ? "holding" : "holdings"}.`
            : `${importedCount} imported ${importedCount === 1 ? "holding" : "holdings"}, ${manualCount} manual ${manualCount === 1 ? "holding" : "holdings"}, and ${sampleCount} sample ${sampleCount === 1 ? "holding" : "holdings"}.`
          : manualCount > 0
          ? `${manualCount} local manual ${manualCount === 1 ? "holding" : "holdings"} plus ${sampleCount} sample ${sampleCount === 1 ? "holding" : "holdings"}.`
          : `${sampleCount} sample ${sampleCount === 1 ? "holding" : "holdings"}; no account holdings imported yet.`,
    },
    {
      id: "market-news",
      label: "Market and news examples",
      status: "Sample examples",
      count: countFacts("news"),
      detail: "Sample market and news examples only; use a saved market read when one exists. This snapshot does not fetch fresh news.",
    },
    {
      id: "borrow-rates",
      label: "Borrow-rate examples",
      status: "Sample examples",
      count: countFacts("funding"),
      detail: "Sample borrow-rate examples only; no live borrow-rate feed is connected.",
    },
    {
      id: "account-imports",
      label: "Account imports",
      status: importedCount > 0 ? "Imported holdings present" : "No imported holdings",
      count: importedCount,
      detail:
        importedCount > 0
          ? `${importedCount} imported ${importedCount === 1 ? "holding" : "holdings"} found.`
          : "Connection checks do not add holdings by themselves. Use Settings import to add a holdings snapshot.",
    },
  ];
}

function normalizeBrainRun(run: BrainRun): BrainRun {
  return {
    ...run,
    summary: cleanBrainCopy(run.summary)
      .replace(/\bLocal snapshot saved\b/g, "Chat context saved")
      .replace(/\blocal snapshot saved\b/g, "chat context saved")
      .replace(/\bLocal memory snapshot saved\b/g, "Chat context saved")
      .replace(/\blocal memory snapshot saved\b/g, "chat context saved")
      .replace(/\busing (\d+) local facts\b/gi, "using $1 saved notes")
      .replace(/\bmain portfolio anchor\b/gi, "main visible portfolio anchor"),
  };
}

function normalizeMarketMemoryFact(fact: MarketMemoryFact): MarketMemoryFact {
  return {
    ...fact,
    summary: cleanBrainCopy(fact.summary),
  };
}

function cleanBrainCopy(value: string) {
  return plainBriefingText(value)
    .replace(/\bdemo portfolio\b/gi, "sample portfolio")
    .replace(/\bin the sample portfolio, not imported money at\b/gi, "in the sample portfolio at");
}

function holdingScope(source: "demo" | "manual" | "connected") {
  if (source === "manual") return "visible holding after local manual entries and sample data";
  if (source === "connected") return "imported visible holding";
  return "sample holding in the sample portfolio, not imported money";
}

async function summarizeWithModel(input: {
  symbols: string[];
  portfolioTotal: number;
  topHolding: string;
  alerts: string[];
  facts: string[];
}): Promise<{ model: string; summary: string }> {
  if (process.env.MASTERMOLD_BRAIN_LLM !== "1") {
    return {
      model: "local-summary",
      summary: localSummary(input),
    };
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL ?? "deepseek/deepseek-chat";
  if (!apiKey) {
    return {
      model: "local-summary",
      summary: localSummary(input),
    };
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:4002",
        "X-OpenRouter-Title": "Master Mold",
      },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        model,
        max_tokens: 140,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: "Summarize saved chat context for an advisory-only finance app in one direct sentence. Do not give trading instructions.",
          },
          {
            role: "user",
            content: JSON.stringify(input),
          },
        ],
      }),
    });
    if (!response.ok) throw new Error(`OpenRouter HTTP ${response.status}`);
    const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return {
      model,
      summary: plainBriefingText(json.choices?.[0]?.message?.content?.trim() || localSummary(input)),
    };
  } catch {
    return {
      model: `${model} unavailable; local-summary`,
      summary: localSummary(input),
    };
  }
}

function localSummary(input: { symbols: string[]; topHolding: string; facts: string[] }) {
  const symbolText = input.symbols.length > 0 ? input.symbols.join(", ") : "no visible symbols";
  return `Chat context saved for ${symbolText}. ${input.topHolding} is the main visible portfolio anchor, using ${input.facts.length} saved notes.`;
}

function sourceCount(facts: MarketMemoryFact[]) {
  return facts.reduce((sum, fact) => sum + fact.source_count, 0);
}

function formatCompact(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatReplayDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}
