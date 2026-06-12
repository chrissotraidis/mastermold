import { cleanAlertMessage, shortAlertTierLabel } from "@/lib/alert-loop";
import { plainBriefingHeadline, plainBriefingText } from "@/lib/plain-finance-copy";
import { plainJournalSignal, plainJournalText } from "@/lib/journal-copy";
import { plainPaperCopy } from "@/lib/paper-copy";
import { publicAlertId } from "@/lib/public-ids";
import type { AlertJson } from "@/src/db/alerts";
import type { BrainScheduleCheckResult, BrainState } from "@/src/db/brain";
import type { BriefingCardJson, BriefingDetailJson, BriefingProvenance } from "@/src/db/briefing";
import type { ExecutorJson } from "@/src/db/executor";
import type { JournalEntryJson, JournalJson } from "@/src/db/journal";
import type { ProductMetricSummary } from "@/src/db/metrics";
import type { PaperJson, PaperPredictionJson, PaperRoundJson } from "@/src/db/paper";
import type { AllocationJson, PortfolioHoldingJson, PortfolioJson } from "@/src/db/portfolio";
import type { DecisionJournalEntry, Driver, OutcomeScore, ReflectionUpdate, StrategyBelief } from "@/src/db/schema";
import { demoDatabase } from "@/src/db/seed-data";

type PublicProvenance = Omit<BriefingProvenance, "label"> & {
  label: "Sample data" | "Saved read";
};

export type PublicBriefingCard = Omit<
  BriefingCardJson,
  | "asset_ids"
  | "headline"
  | "why_now"
  | "relevance_note"
  | "bull_case"
  | "bear_case"
  | "conviction"
  | "status"
  | "provenance"
  | "event_time"
  | "knowledge_time"
> & {
  asset_keys: string[];
  headline: string;
  why_now: string;
  relevance_note: string;
  bull_case: string;
  bear_case: string;
  confidence: number;
  status: "worth_checking" | "nothing_urgent";
  provenance: PublicProvenance;
  happened_at: string;
  saved_at: string;
};

export type PublicBriefingDriver = Omit<Driver, "briefing_card_id" | "label" | "weight" | "source_citation" | "event_time" | "knowledge_time"> & {
  label: string;
  importance: number;
  support_note: string;
  happened_at: string;
  saved_at: string;
};

export type PublicBriefingDetail = Omit<
  BriefingDetailJson,
  | "asset_ids"
  | "headline"
  | "why_now"
  | "relevance_note"
  | "bull_case"
  | "bear_case"
  | "conviction"
  | "status"
  | "drivers"
  | "decision_journal_entry"
  | "provenance"
  | "event_time"
  | "knowledge_time"
> & {
  asset_keys: string[];
  headline: string;
  why_now: string;
  relevance_note: string;
  bull_case: string;
  bear_case: string;
  confidence: number;
  status: "worth_checking" | "nothing_urgent";
  drivers: PublicBriefingDriver[];
  decision_journal_entry: PublicDecisionJournalEntry | null;
  provenance: PublicProvenance;
  happened_at: string;
  saved_at: string;
};

export type PublicAlert = Omit<AlertJson, "id" | "asset_id" | "tier" | "z_score" | "message" | "rationale" | "signal" | "provenance"> & {
  id: string;
  asset_key: string;
  severity: "Urgent" | "Worth checking" | "FYI";
  priority_score: number;
  message: string;
  rationale: string;
  reason_type: string;
  provenance: PublicProvenance;
};

type PublicDecisionJournalEntry = Omit<
  JournalEntryJson,
  | "briefing_card_id"
  | "thesis"
  | "signals"
  | "conviction"
  | "conviction_tier"
  | "falsification_condition"
  | "outcome_score"
  | "event_time"
  | "knowledge_time"
> & {
  call: string;
  reasons: string[];
  confidence: number;
  confidence_band: JournalEntryJson["conviction_tier"];
  what_would_prove_wrong: string;
  result: PublicOutcomeScore | null;
  happened_at: string;
  saved_at: string;
};

type PublicOutcomeScore = Omit<OutcomeScore, "pnl_note" | "thesis_played_out" | "process_score" | "outcome_score" | "event_time" | "knowledge_time"> & {
  result_note: string;
  call_was_right: boolean;
  review_quality: number;
  result_score: number;
  happened_at: string;
  saved_at: string;
};

type PublicReflectionUpdate = Omit<ReflectionUpdate, "event_time" | "knowledge_time"> & {
  happened_at: string;
  saved_at: string;
};

type PublicStrategyBelief = Omit<StrategyBelief, "reflection_updates" | "event_time" | "knowledge_time"> & {
  reflection_updates: PublicReflectionUpdate[];
  happened_at: string;
  saved_at: string;
};

type PublicConfidenceBucket = Omit<JournalJson["calibration"][number], "conviction"> & {
  confidence: number;
};

type PublicTrackRecordTier = Omit<JournalJson["track_record"][number], "mean_outcome_score"> & {
  mean_result_score: number | null;
};

export type PublicJournal = Omit<
  JournalJson,
  "entries" | "outcome_scores" | "track_record" | "calibration" | "strategy_beliefs" | "reflection_updates" | "provenance"
> & {
  entries: PublicDecisionJournalEntry[];
  results: PublicOutcomeScore[];
  track_record: PublicTrackRecordTier[];
  confidence_check: PublicConfidenceBucket[];
  strategy_beliefs: PublicStrategyBelief[];
  reflection_updates: PublicReflectionUpdate[];
  provenance: PublicProvenance & { replay_as_of: string | null };
};

export type PublicExecutor = {
  strategies: Array<{
    id: string;
    name: string;
    status: "Paused" | "Safe mode" | "Preview only";
    venue: string;
    price_exposure: number;
    borrow_cushion: number;
    borrow_rate: number;
    price_gap: number;
    happened_at: string;
    saved_at: string;
  }>;
  safety_drafts: Array<{
    id: string;
    per_transaction_cap_usd: number;
    daily_cap_usd: number;
    approved_contracts: string[];
    approved_recipients: string[];
    temporary_key_expires: string;
    note: string;
    happened_at: string;
    saved_at: string;
  }>;
  borrow_rate_preview: Array<{
    id: string;
    asset_key: string;
    asset_symbol: string;
    asset_name: string;
    period_time: string;
    borrow_rate: number;
    open_interest: number;
    saved_at: string;
  }>;
  provenance: {
    label: "Sample data";
    source: string;
    as_of: string;
    replay_as_of: string | null;
  };
};

export type PublicPortfolioHolding = {
  id: string;
  symbol: string;
  name: string;
  type: "Stock" | "Crypto" | "On-chain" | "Cash";
  venue: string;
  quantity: number;
  paid_amount: number;
  value: number;
  today_change_pct: number;
  today_change_value: number;
  portfolio_share: number;
  as_of: string;
  source_label: "Sample holding" | "Manual entry" | "Imported holding";
  account_label: string;
  read_only: boolean;
};

type PublicPortfolioPriceBar = Omit<PortfolioJson["chart_assets"][number]["bars"][number], "knowledge_time"> & {
  saved_at: string;
};

export type PublicPortfolio = {
  summary: {
    total_value: number;
    today_change_value: number;
    today_change_pct: number;
    data_state: "Sample data" | "Manual portfolio" | "Imported portfolio";
    source_note: string;
  };
  holdings: PublicPortfolioHolding[];
  on_chain_positions: PublicPortfolioHolding[];
  allocation: Array<{
    type: PublicPortfolioHolding["type"];
    value: number;
    portfolio_share: number;
  }>;
  net_worth_series: PortfolioJson["net_worth_series"];
  manual_entries: PublicPortfolioHolding[];
  imported_holdings: PublicPortfolioHolding[];
  import_snapshot: PortfolioJson["import_snapshot"];
  concentration: PortfolioJson["concentration"];
  asset_history: Array<{
    asset: {
      id: string;
      symbol: string;
      name: string;
      type: PublicPortfolioHolding["type"];
      venue: string;
    };
    bars: PublicPortfolioPriceBar[];
  }>;
  provenance: {
    label: "Sample data" | "Manual portfolio" | "Imported portfolio";
    source: string;
    as_of: string;
    replay_as_of: string | null;
  };
};

export type PublicPaperTrade = {
  id: string;
  round_id: string;
  asset_key: string;
  asset: {
    key: string;
    symbol: string;
    name: string;
    type: PublicPortfolioHolding["type"];
    venue: string;
  };
  call: "Long" | "Short" | "No position";
  paper_size_usd: number;
  confidence: number;
  reason: string;
  submitted_at: string;
  submitted_by: "User" | "Master Mold";
  happened_at: string;
  saved_at: string;
};

export type PublicPaperResult = {
  id: string;
  round_id: string;
  was_it_right_score: number;
  patience_score: number;
  variety_score: number;
  total_score: number;
  happened_at: string;
  saved_at: string;
};

export type PublicPaperRound = Omit<PaperRoundJson, "predictions" | "score" | "event_time" | "knowledge_time"> & {
  happened_at: string;
  saved_at: string;
  paper_trades: PublicPaperTrade[];
  result: PublicPaperResult | null;
};

export type PublicPaper = {
  rounds: PublicPaperRound[];
  paper_trades: PublicPaperTrade[];
  results: PublicPaperResult[];
};

export type PublicBrainSnapshot = {
  id: string;
  date: string;
  status: "Saved" | "Failed" | "In progress";
  started_at: string;
  saved_at: string | null;
  symbols: string[];
  evidence_count: number;
  summary: string;
  happened_at: string;
};

export type PublicBrainFact = {
  id: string;
  symbol: string | null;
  category: string;
  summary: string;
  confidence: number;
  evidence_count: number;
  source_links: string[];
  saved_at: string;
  happened_at: string;
};

export type PublicBrainSnapshotSource = Omit<BrainState["source_ledger"][number], "id" | "detail"> & {
  key: string;
  detail: string;
};

export type PublicBrainState = Omit<
  BrainState,
  "latest_run" | "recent_runs" | "facts" | "source_ledger" | "summary"
> & {
  latest_snapshot: PublicBrainSnapshot | null;
  snapshot_history: PublicBrainSnapshot[];
  snapshot_sources: PublicBrainSnapshotSource[];
  facts: PublicBrainFact[];
  summary: Omit<BrainState["summary"], "source_count"> & {
    evidence_count: number;
  };
};

export type PublicBrainScheduleCheckResult = Omit<BrainScheduleCheckResult, "state"> & {
  state: PublicBrainState;
};

export type PublicProductMetricEvent = {
  id: string;
  activity: string;
  area: string;
  subject: string | null;
  value: number | null;
  detail: string;
  created_at: string;
};

export type PublicProductMetricSummary = Omit<
  ProductMetricSummary,
  | "events"
  | "counts"
  | "briefing_feedback"
  | "alert_feedback"
  | "calibration_outcomes"
  | "median_today_read_seconds"
  | "today_read_target"
> & {
  events: PublicProductMetricEvent[];
  activity_counts: Array<{
    activity: string;
    count: number;
  }>;
  briefing_ratings: {
    useful: number;
    not_useful: number;
    useful_share: number | null;
  };
  alert_ratings: {
    useful: number;
    not_useful: number;
    useful_share: number | null;
    not_useful_share: number | null;
  };
  today_read: {
    median_seconds: number | null;
    target_seconds: number;
    under_target: boolean | null;
  };
  score_accuracy: {
    closed_calls: number;
    score_groups: number;
    average_hit_rate: number | null;
    average_miss: number | null;
    close_enough: boolean | null;
  };
};

export function toPublicBriefingCard(card: BriefingCardJson): PublicBriefingCard {
  const {
    asset_ids,
    conviction,
    provenance,
    headline,
    why_now,
    relevance_note,
    bull_case,
    bear_case,
    status,
    event_time,
    knowledge_time,
    ...rest
  } = card;
  return {
    ...rest,
    asset_keys: asset_ids.map(publicAssetKey),
    headline: plainBriefingHeadline(headline),
    why_now: plainBriefingText(why_now),
    relevance_note: plainBriefingText(relevance_note),
    bull_case: plainBriefingText(bull_case),
    bear_case: plainBriefingText(bear_case),
    confidence: conviction,
    status: publicBriefingStatus(status),
    provenance: publicProvenance(provenance),
    happened_at: event_time,
    saved_at: knowledge_time,
  };
}

export function toPublicBriefingDetail(detail: BriefingDetailJson): PublicBriefingDetail {
  const {
    conviction,
    provenance,
    headline,
    why_now,
    relevance_note,
    bull_case,
    bear_case,
    status,
    asset_ids,
    drivers,
    decision_journal_entry,
    event_time,
    knowledge_time,
    ...rest
  } = detail;
  return {
    ...rest,
    asset_keys: asset_ids.map(publicAssetKey),
    headline: plainBriefingHeadline(headline),
    why_now: plainBriefingText(why_now),
    relevance_note: plainBriefingText(relevance_note),
    bull_case: plainBriefingText(bull_case),
    bear_case: plainBriefingText(bear_case),
    confidence: conviction,
    status: publicBriefingStatus(status),
    drivers: drivers.map(toPublicBriefingDriver),
    decision_journal_entry: decision_journal_entry
      ? publicDecisionEntry({
          ...decision_journal_entry,
          conviction_tier: { key: "4-6", label: "4-6 cautious" },
          outcome_score: null,
          review_due: false,
          past_horizon: false,
          review_note: null,
        })
      : null,
    provenance: publicProvenance(provenance),
    happened_at: event_time,
    saved_at: knowledge_time,
  };
}

export function toPublicAlert(alert: AlertJson): PublicAlert {
  const { id, asset_id, tier, z_score, signal, message, rationale, provenance, ...rest } = alert;
  return {
    ...rest,
    id: publicAlertId(id),
    asset_key: alert.asset_symbol,
    severity: shortAlertTierLabel(tier),
    priority_score: z_score,
    message: cleanAlertMessage(message),
    rationale: plainBriefingText(rationale),
    reason_type: publicAlertReason(signal),
    provenance: publicProvenance(provenance),
  };
}

export function toPublicJournal(journal: JournalJson): PublicJournal {
  const {
    entries,
    outcome_scores,
    track_record,
    calibration,
    strategy_beliefs,
    reflection_updates,
    provenance,
    ...rest
  } = journal;
  return {
    ...rest,
    entries: entries.map(publicDecisionEntry),
    results: outcome_scores.map(publicOutcomeScore),
    track_record: track_record.map(({ mean_outcome_score, ...tier }) => ({
      ...tier,
      mean_result_score: mean_outcome_score,
    })),
    confidence_check: calibration.map(({ conviction, ...bucket }) => ({
      ...bucket,
      confidence: conviction,
    })),
    strategy_beliefs: strategy_beliefs.map((belief) => ({
      ...publicStrategyBeliefFields(belief),
      statement: plainBriefingText(belief.statement),
      reflection_updates: belief.reflection_updates.map(publicReflectionUpdate),
    })),
    reflection_updates: reflection_updates.map(publicReflectionUpdate),
    provenance: {
      ...publicProvenance(provenance),
      replay_as_of: provenance.replay_as_of,
    },
  };
}

export function toPublicExecutor(executor: ExecutorJson): PublicExecutor {
  return {
    strategies: executor.strategies.map((strategy) => ({
      id: strategy.id,
      name: publicExecutorStrategyName(strategy.name),
      status: publicExecutorStatus(strategy.status),
      venue: publicExecutorVenue(strategy.venue),
      price_exposure: strategy.net_delta,
      borrow_cushion: strategy.margin_ratio,
      borrow_rate: strategy.funding_rate,
      price_gap: strategy.basis,
      happened_at: strategy.event_time,
      saved_at: strategy.knowledge_time,
    })),
    safety_drafts: executor.guardrail_configs.map((config) => ({
      id: config.id,
      per_transaction_cap_usd: config.per_tx_cap,
      daily_cap_usd: config.daily_cap,
      approved_contracts: config.contract_allowlist,
      approved_recipients: config.recipient_allowlist,
      temporary_key_expires: config.session_key_expiry,
      note: "Preview only. Nothing here signs transactions or moves funds.",
      happened_at: config.event_time,
      saved_at: config.knowledge_time,
    })),
    borrow_rate_preview: executor.funding_observations.map((observation) => ({
      id: observation.id,
      asset_key: observation.asset.symbol,
      asset_symbol: observation.asset.symbol,
      asset_name: observation.asset.name,
      period_time: observation.period_ts,
      borrow_rate: observation.funding_rate,
      open_interest: observation.open_interest,
      saved_at: observation.knowledge_time,
    })),
    provenance: {
      label: "Sample data",
      source: "Executor preview data. It is local sample data and cannot sign or move funds.",
      as_of: executor.provenance.as_of,
      replay_as_of: executor.provenance.replay_as_of,
    },
  };
}

export function toPublicPortfolio(portfolio: PortfolioJson): PublicPortfolio {
  const holdings = portfolio.holdings.map(toPublicPortfolioHolding);
  const manualEntries = portfolio.manual_holdings.map(toPublicPortfolioHolding);
  const importedHoldings = portfolio.imported_holdings.map(toPublicPortfolioHolding);
  return {
    summary: {
      total_value: portfolio.total_market_value,
      today_change_value: portfolio.daily_change_value,
      today_change_pct: portfolio.daily_change_pct,
      data_state: portfolio.provenance.label === "Demo data" ? "Sample data" : portfolio.provenance.label,
      source_note: publicPortfolioSourceNote(portfolio.provenance.label),
    },
    holdings,
    on_chain_positions: portfolio.defi_positions.map(toPublicPortfolioHolding),
    allocation: portfolio.allocation.map(publicAllocation),
    net_worth_series: portfolio.net_worth_series,
    manual_entries: manualEntries,
    imported_holdings: importedHoldings,
    import_snapshot: {
      ...portfolio.import_snapshot,
      note: plainBriefingText(portfolio.import_snapshot.note),
    },
    concentration: portfolio.concentration,
    asset_history: portfolio.chart_assets.map(({ asset, bars }) => ({
      asset: {
        id: asset.id,
        symbol: asset.symbol,
        name: asset.name,
        type: publicAssetType(asset.asset_class),
        venue: asset.venue,
      },
      bars: bars.map(publicPortfolioPriceBar),
    })),
    provenance: {
      label: portfolio.provenance.label === "Demo data" ? "Sample data" : portfolio.provenance.label,
      source: publicPortfolioSourceNote(portfolio.provenance.label),
      as_of: portfolio.provenance.as_of,
      replay_as_of: portfolio.provenance.replay_as_of,
    },
  };
}

export function toPublicPaper(paper: PaperJson): PublicPaper {
  return {
    rounds: paper.rounds.map(toPublicPaperRound),
    paper_trades: paper.predictions.map(toPublicPaperTrade),
    results: paper.scores.map(toPublicPaperResult),
  };
}

export function toPublicBrainState(state: BrainState): PublicBrainState {
  const { latest_run, recent_runs, facts, source_ledger, summary, ...rest } = state;
  const { source_count, ...publicSummary } = summary;
  return {
    ...rest,
    latest_snapshot: latest_run ? toPublicBrainSnapshot(latest_run) : null,
    snapshot_history: recent_runs.map(toPublicBrainSnapshot),
    snapshot_sources: source_ledger.map(toPublicBrainSnapshotSource),
    facts: facts.map(toPublicBrainFact),
    summary: {
      ...publicSummary,
      evidence_count: source_count,
    },
  };
}

export function toPublicBrainScheduleCheck(
  result: BrainScheduleCheckResult,
): PublicBrainScheduleCheckResult {
  return {
    ...result,
    state: toPublicBrainState(result.state),
  };
}

export function toPublicProductMetricSummary(summary: ProductMetricSummary): PublicProductMetricSummary {
  const {
    events,
    counts,
    briefing_feedback,
    alert_feedback,
    calibration_outcomes,
    median_today_read_seconds,
    today_read_target,
    ...rest
  } = summary;
  return {
    ...rest,
    events: events.map((event) => ({
      id: event.id,
      activity: publicMetricEventLabel(event.event),
      area: publicMetricSurface(event.surface),
      subject: publicMetricSubject(event.entity_id),
      value: event.value,
      detail: publicMetricDetail(event.event, event.metadata),
      created_at: event.created_at,
    })),
    activity_counts: Object.entries(counts)
      .filter(([, count]) => count > 0)
      .map(([event, count]) => ({
        activity: publicMetricEventLabel(event),
        count,
      })),
    briefing_ratings: {
      useful: briefing_feedback.useful,
      not_useful: briefing_feedback.not_useful,
      useful_share: briefing_feedback.usefulness_rate,
    },
    alert_ratings: {
      useful: alert_feedback.useful,
      not_useful: alert_feedback.not_useful,
      useful_share: alert_feedback.precision_rate,
      not_useful_share: alert_feedback.fatigue_rate,
    },
    today_read: {
      median_seconds: median_today_read_seconds,
      target_seconds: today_read_target.target_seconds,
      under_target: today_read_target.met,
    },
    score_accuracy: {
      closed_calls: calibration_outcomes.resolved,
      score_groups: calibration_outcomes.buckets,
      average_hit_rate: calibration_outcomes.mean_hit_rate,
      average_miss: calibration_outcomes.mean_abs_error,
      close_enough: calibration_outcomes.within_confidence_band,
    },
  };
}

function toPublicBriefingDriver(driver: Driver): PublicBriefingDriver {
  const { briefing_card_id, label, weight, source_citation, event_time, knowledge_time, ...rest } = driver;
  return {
    ...rest,
    label: plainBriefingText(label),
    importance: weight,
    support_note: plainBriefingText(source_citation),
    happened_at: event_time,
    saved_at: knowledge_time,
  };
}

function toPublicBrainSnapshot(run: NonNullable<BrainState["latest_run"]>): PublicBrainSnapshot {
  return {
    id: run.id,
    date: run.run_date,
    status: publicBrainRunStatus(run.status),
    started_at: run.started_at,
    saved_at: run.completed_at,
    symbols: run.symbols,
    evidence_count: run.source_count,
    summary: plainBriefingText(run.summary),
    happened_at: run.event_time,
  };
}

function toPublicBrainFact(fact: BrainState["facts"][number]): PublicBrainFact {
  return {
    id: fact.id,
    symbol: fact.symbol,
    category: publicBrainFactCategory(fact.topic),
    summary: publicBrainFactSummary(fact.summary),
    confidence: fact.confidence,
    evidence_count: fact.source_count,
    source_links: fact.evidence_urls,
    saved_at: fact.updated_at,
    happened_at: fact.event_time,
  };
}

function publicBrainFactSummary(summary: string) {
  return plainBriefingHeadline(summary)
    .replace(
      /\b([A-Z]{1,6}) sample borrow-payment rate was [^.;]+(?:\.|$)/g,
      "$1 had a sample borrow-payment change worth checking. Treat it as borrow-market context, not a live rate feed.",
    )
    .replace(/\bopen interest\b/gi, "borrow-market activity");
}

function toPublicBrainSnapshotSource(source: BrainState["source_ledger"][number]): PublicBrainSnapshotSource {
  const { id, detail, ...rest } = source;
  return {
    ...rest,
    key: id,
    detail: plainBriefingText(detail)
      .replace(/\bSeeded\b/g, "Sample")
      .replace(/\bseeded\b/g, "sample")
      .replace(/\bbroad internet reading is not scheduled\b/i, "this does not read the broader internet"),
  };
}

function toPublicPaperRound(round: PaperRoundJson): PublicPaperRound {
  const { predictions, score, event_time, knowledge_time, ...rest } = round;
  return {
    ...rest,
    happened_at: event_time,
    saved_at: knowledge_time,
    paper_trades: predictions.map(toPublicPaperTrade),
    result: score ? toPublicPaperResult(score) : null,
  };
}

function toPublicPaperTrade(prediction: PaperPredictionJson): PublicPaperTrade {
  return {
    id: prediction.id,
    round_id: prediction.round_id,
    asset_key: prediction.asset.symbol,
    asset: {
      key: prediction.asset.symbol,
      symbol: prediction.asset.symbol,
      name: prediction.asset.name,
      type: publicAssetType(prediction.asset.asset_class),
      venue: prediction.asset.venue,
    },
    call: publicPaperCall(prediction.direction),
    paper_size_usd: prediction.fake_size_usd,
    confidence: prediction.conviction,
    reason: plainPaperCopy(plainBriefingText(prediction.rationale)),
    submitted_at: prediction.submitted_at,
    submitted_by: prediction.submitter === "engine" ? "Master Mold" : "User",
    happened_at: prediction.event_time,
    saved_at: prediction.knowledge_time,
  };
}

function toPublicPaperResult(score: PaperJson["scores"][number]): PublicPaperResult {
  return {
    id: score.id,
    round_id: score.round_id,
    was_it_right_score: score.calibration,
    patience_score: score.patience,
    variety_score: score.diversification,
    total_score: score.total,
    happened_at: score.event_time,
    saved_at: score.knowledge_time,
  };
}

function toPublicPortfolioHolding(holding: PortfolioHoldingJson): PublicPortfolioHolding {
  return {
    id: holding.id,
    symbol: holding.symbol,
    name: holding.asset_name,
    type: publicAssetType(holding.asset_class),
    venue: holding.venue,
    quantity: holding.quantity,
    paid_amount: holding.cost_basis,
    value: holding.market_value,
    today_change_pct: holding.daily_change_pct,
    today_change_value: holding.daily_change_value,
    portfolio_share: holding.weight_pct,
    as_of: holding.as_of,
    source_label: publicHoldingSource(holding.source),
    account_label: holding.account.label,
    read_only: holding.source !== "manual",
  };
}

function publicPortfolioPriceBar(bar: PortfolioJson["chart_assets"][number]["bars"][number]): PublicPortfolioPriceBar {
  const { knowledge_time, ...rest } = bar;
  return {
    ...rest,
    saved_at: knowledge_time,
  };
}

function publicAllocation(allocation: AllocationJson) {
  return {
    type: publicAssetType(allocation.asset_class),
    value: allocation.market_value,
    portfolio_share: allocation.weight_pct,
  };
}

function publicAssetType(assetClass: AllocationJson["asset_class"]): PublicPortfolioHolding["type"] {
  if (assetClass === "equity") return "Stock";
  if (assetClass === "crypto") return "Crypto";
  if (assetClass === "defi") return "On-chain";
  return "Cash";
}

function publicHoldingSource(source: PortfolioHoldingJson["source"]): PublicPortfolioHolding["source_label"] {
  if (source === "manual") return "Manual entry";
  if (source === "connected") return "Imported holding";
  return "Sample holding";
}

function publicPaperCall(direction: PaperPredictionJson["direction"]): PublicPaperTrade["call"] {
  if (direction === "short") return "Short";
  if (direction === "flat") return "No position";
  return "Long";
}

function publicBrainRunStatus(status: string): PublicBrainSnapshot["status"] {
  if (status === "complete") return "Saved";
  if (status === "failed") return "Failed";
  return "In progress";
}

function publicBrainFactCategory(topic: BrainState["facts"][number]["topic"]) {
  if (topic === "portfolio") return "Visible portfolio";
  if (topic === "news") return "Market news";
  if (topic === "funding") return "Borrow rates";
  if (topic === "risk") return "Portfolio risk";
  return plainBriefingText(topic);
}

function publicPortfolioSourceNote(label: PortfolioJson["provenance"]["label"]) {
  if (label === "Imported portfolio") {
    return "Imported holdings snapshots plus local manual entries and sample holdings when available.";
  }
  if (label === "Manual portfolio") {
    return "Local manual entries plus sample holdings.";
  }
  return "Sample holdings for review and testing.";
}

function publicDecisionEntry(entry: JournalEntryJson): PublicDecisionJournalEntry {
  const {
    briefing_card_id,
    thesis,
    signals,
    conviction,
    conviction_tier,
    falsification_condition,
    outcome_score,
    event_time,
    knowledge_time,
    ...rest
  } = entry;
  return {
    ...rest,
    call: plainJournalText(thesis),
    reasons: signals.map(plainJournalSignal).filter(Boolean),
    confidence: conviction,
    confidence_band: conviction_tier,
    what_would_prove_wrong: plainJournalText(falsification_condition),
    result: outcome_score ? publicOutcomeScore(outcome_score) : null,
    happened_at: event_time,
    saved_at: knowledge_time,
  };
}

function publicOutcomeScore(score: OutcomeScore): PublicOutcomeScore {
  const { pnl_note, thesis_played_out, process_score, outcome_score, event_time, knowledge_time, ...rest } = score;
  return {
    ...rest,
    result_note: plainJournalText(pnl_note),
    call_was_right: thesis_played_out,
    review_quality: process_score,
    result_score: outcome_score,
    happened_at: event_time,
    saved_at: knowledge_time,
  };
}

function publicStrategyBeliefFields(belief: StrategyBelief) {
  const { event_time, knowledge_time, ...rest } = belief;
  return {
    ...rest,
    happened_at: event_time,
    saved_at: knowledge_time,
  };
}

function publicReflectionUpdate(update: ReflectionUpdate): PublicReflectionUpdate {
  const { event_time, knowledge_time, ...rest } = update;
  return {
    ...rest,
    evidence_summary: plainBriefingText(update.evidence_summary),
    happened_at: event_time,
    saved_at: knowledge_time,
  };
}

function publicProvenance<T extends { label: string; source: string; as_of: string; notice?: string }>(
  provenance: T,
): PublicProvenance {
  const label = provenance.label === "Engine output" ? "Saved read" : "Sample data";
  return {
    label,
    source: label === "Saved read" ? "Saved market read" : plainBriefingText(provenance.source),
    as_of: provenance.as_of,
    notice: provenance.notice ? plainBriefingText(provenance.notice) : undefined,
  };
}

function publicMetricEventLabel(event: string) {
  const labels: Record<string, string> = {
    today_read_time: "Today read",
    briefing_opened: "Idea opened",
    briefing_feedback: "Today rated",
    chat_sent: "Chat sent",
    chat_followup_clicked: "Chat follow-up",
    alert_acknowledged: "Alert dismissed",
    alert_reopened: "Alert restored",
    alert_feedback: "Alert rated",
    decision_logged: "Call logged",
    calibration_outcome: "Result saved",
    brain_schedule_config: "Chat context automation changed",
    brain_schedule_check: "Chat context check ran",
    forward_measurement_started: "Forward measurement started",
    forward_trial_started: "Forward measurement started",
  };
  return labels[event] ?? plainBriefingText(event).replace(/_/g, " ");
}

function publicMetricSurface(surface: string) {
  if (surface === "app") return "App";
  if (surface === "today") return "Today";
  if (surface === "alerts") return "Alerts";
  if (surface === "journal") return "Decision journal";
  if (surface === "settings") return "Settings";
  if (surface === "chat") return "Chat";
  if (surface === "paper") return "Paper";
  if (surface === "review") return "Performance";
  return plainBriefingText(surface).replace(/_/g, " ");
}

function publicMetricSubject(subject: string | null) {
  if (!subject) return null;
  if (/^engine_alert_|^alert_/i.test(subject)) return "Alert";
  if (/^journal_/i.test(subject)) return "Decision journal call";
  if (/^brain_|market-memory/i.test(subject)) return "Chat context";
  if (/^brief_/i.test(subject)) return "Daily idea";
  return "App item";
}

function publicMetricDetail(event: string, rawMetadata: unknown) {
  const metadata =
    rawMetadata && typeof rawMetadata === "object" && !Array.isArray(rawMetadata)
      ? (rawMetadata as Record<string, unknown>)
      : {};
  if (event === "briefing_feedback" || event === "alert_feedback") {
    return metadata.useful === true ? "Marked useful" : metadata.useful === false ? "Marked not useful" : "Rating saved";
  }
  if (event === "today_read_time") return "Read-time sample saved";
  if (event === "decision_logged") return "Call saved before the result";
  if (event === "calibration_outcome") return "Result saved for a past call";
  if (event === "brain_schedule_config") return metadata.enabled === true ? "Chat context automation armed" : "Chat context automation paused";
  if (event === "brain_schedule_check") {
    const status = typeof metadata.status === "string" ? metadata.status : "";
    if (status === "ran") return "Chat context saved";
    if (status === "disabled") return "Chat context automation is off";
    if (status === "not_due") return "Already checked for this window";
    return "Context check saved";
  }
  if (event === "forward_measurement_started" || event === "forward_trial_started") return "Forward measurement started";
  return "Activity saved";
}

function publicBriefingStatus(status: string): PublicBriefingCard["status"] {
  return status === "nothing_actionable" ? "nothing_urgent" : "worth_checking";
}

function publicAlertReason(signal: string | undefined) {
  if (signal === "return_z") return "Unusual price move";
  if (signal === "volume_z") return "Unusual trading volume";
  if (signal === "news_count_z") return "News pickup";
  if (signal === "funding") return "Borrow-payment change";
  return "Market move";
}

function publicExecutorStrategyName(name: string) {
  if (name === "stablecoin_lending") return "Stablecoin lending preview";
  if (name === "delta_neutral_funding_carry") return "Carry strategy preview";
  return plainBriefingText(name.replace(/_/g, " "));
}

function publicExecutorVenue(venue: string) {
  if (venue === "Perp sample venue") return "Sample carry venue";
  if (venue === "Aave/Base sample") return "Sample lending venue";
  return plainBriefingText(venue);
}

function publicExecutorStatus(status: string): PublicExecutor["strategies"][number]["status"] {
  if (status === "safe_mode") return "Safe mode";
  if (status === "running_demo") return "Preview only";
  return "Paused";
}

function publicAssetKey(assetId: string) {
  const asset = demoDatabase.assets.find((item) => item.id === assetId);
  if (asset) return asset.symbol;
  return assetId.replace(/^asset_/i, "").replace(/_/g, "-").toUpperCase();
}
