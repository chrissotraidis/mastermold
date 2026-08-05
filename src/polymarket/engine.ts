import {
  fetchPolymarketMarkets,
  fetchPolymarketResolutions,
  hasPolymarketEntryHorizon,
  type PolymarketResolution,
  type PolymarketMarketSnapshot,
} from "./markets";
import { notifyOperator } from "@/src/autopilot/notify";
import {
  evaluatePolymarketPaperAuthority,
  POLYMARKET_EXPLORATION_MAX_OPEN_PER_STRATEGY,
  POLYMARKET_EXPLORATION_STAKE_USD,
  strategyName,
} from "./authority";
import { polymarketBrain, safePolymarketBrainReport, type PolymarketBrainReport } from "./brain";
import { fetchPolymarketOrderBooks, quotePolymarketPaperBuy, quotePolymarketPaperSell } from "./orderbook";
import { validatePolymarketPaperEntry } from "./policy";
import { polymarketStore, type PolymarketPaperPosition } from "./store";
import { startOrUpdatePolymarketStream } from "./stream";
import { buildPolymarketBrainCandidates, type PolymarketStrategyId } from "./strategies";

const ENTRY_MAX_SPREAD_BPS = 500;

function journalPaperClose(
  position: PolymarketPaperPosition,
  closed: { exit_value_usd: number; pnl_usd: number },
  exitPrice: number,
  reason: string,
) {
  try {
    polymarketBrain().recordPaperTrade({
      event: "close",
      position_id: position.id,
      strategy_id: (position.strategy_id as PolymarketStrategyId | undefined) ?? null,
      tier: position.tier ?? null,
      market_id: position.market_id,
      token_id: position.token_id,
      outcome: position.outcome,
      question: position.question,
      slug: position.slug,
      price: exitPrice,
      stake_usd: position.stake_usd,
      pnl_usd: closed.pnl_usd,
      reason,
    });
  } catch {
    // The JSON store remains the fallback record; a ledger write failure must not block exits.
  }
  const pnl = closed.pnl_usd;
  notifyOperator(
    "exit",
    `Polymarket paper close ${position.outcome} ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)} at ${(exitPrice * 100).toFixed(1)}¢ · ${reason}`,
  );
}

export type PolymarketSnapshotView = PolymarketMarketSnapshot | {
  markets: PolymarketMarketSnapshot["markets"];
  fetched_at: string;
  source: "persistent-cache";
  error: string;
};

export async function getPolymarketSnapshot(force = false): Promise<PolymarketSnapshotView> {
  const store = polymarketStore();
  try {
    const snapshot = await fetchPolymarketMarkets(force);
    if (snapshot.source === "live") store.saveSnapshot(snapshot);
    return snapshot;
  } catch (error) {
    const cached = store.lastSnapshot();
    if (!cached) throw error;
    return {
      ...cached,
      source: "persistent-cache",
      error: error instanceof Error ? error.message : "Live Polymarket data is unavailable.",
    };
  }
}

export async function runPolymarketBrainCycle(trigger: "scheduled" | "manual" = "scheduled") {
  const brain = polymarketBrain();
  let previouslyPromoted: Set<PolymarketStrategyId> | null = null;
  try {
    previouslyPromoted = new Set(
      brain.report().strategies.filter((strategy) => strategy.paper_candidate).map((strategy) => strategy.strategy_id),
    );
  } catch {
    // A failed pre-read only suppresses the promotion-transition alert for this cycle.
  }
  try {
    const snapshot = await getPolymarketSnapshot(true);
    const pendingResolutionIds = brain.pendingResolutionMarketIds();
    let resolutionSummary = { resolved_markets: 0, invalid_markets: 0, graded_observations: 0 };
    let resolutionNote = "";
    if (pendingResolutionIds.length > 0) {
      try {
        const resolutions = await fetchPolymarketResolutions(pendingResolutionIds);
        resolutionSummary = brain.applyResolutionChecks(
          pendingResolutionIds,
          new Map(resolutions.map((row) => [row.market_id, row])),
        );
      } catch (error) {
        resolutionNote = ` Resolution check deferred: ${error instanceof Error ? error.message : "Gamma read unavailable."}`;
      }
    }
    const researchMarkets = snapshot.markets
      .filter((market) => market.accepting_orders && market.order_book_enabled && hasPolymarketEntryHorizon(market) && market.token_ids.length === 2)
      .slice(0, 20);
    const currentTokens = researchMarkets.flatMap((market) => market.token_ids);
    startOrUpdatePolymarketStream(currentTokens);
    const tokenIds = [...new Set([...currentTokens, ...brain.pendingTokenIds()])].slice(0, 50);
    const books = await fetchPolymarketOrderBooks(tokenIds, true);
    const labeled = brain.labelDue(books);
    const candidates = buildPolymarketBrainCandidates(researchMarkets, books);
    brain.recordCycle({
      source: `${snapshot.source}+clob-books`,
      markets: researchMarkets,
      candidates,
    });
    const report = brain.report();
    if (previouslyPromoted) {
      for (const strategy of report.strategies) {
        if (strategy.paper_candidate && !previouslyPromoted.has(strategy.strategy_id)) {
          notifyOperator(
            "analyst",
            `Polymarket: ${strategyName(strategy.strategy_id)} cleared the shadow promotion gate (${strategy.labels_1h} one-hour labels, mean ${strategy.mean_1h_bps}bp, hit ${Math.round((strategy.hit_rate_1h ?? 0) * 100)}%). Paper entries may now use it.`,
          );
        }
      }
    }
    return {
      action: "learned" as const,
      detail: `${trigger === "manual" ? "Manual" : "Scheduled"} brain cycle recorded ${candidates.length} candidates, advanced ${labeled} due markouts, and graded ${resolutionSummary.graded_observations} resolved observations.${resolutionNote}`,
      report,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Polymarket brain cycle failed.";
    try {
      brain.recordCycle({ source: "unavailable", markets: [], candidates: [], error: detail });
    } catch {
      // The caller still receives a fail-closed report if the brain store itself is unavailable.
    }
    return { action: "unavailable" as const, detail, report: safePolymarketBrainReport() };
  }
}

export function settleResolvedPolymarketPaperPositions(resolutions: PolymarketResolution[]): number {
  const store = polymarketStore();
  const byMarket = new Map(resolutions.map((resolution) => [resolution.market_id, resolution]));
  let settled = 0;
  for (const position of store.positions()) {
    const resolution = byMarket.get(position.market_id);
    if (resolution?.status !== "resolved" || resolution.winning_outcome_index === null) continue;
    const won = position.outcome_index === resolution.winning_outcome_index;
    const reason = `Market resolved · ${won ? "selected outcome won" : "selected outcome lost"}`;
    const closed = store.closePosition(position.id, won ? 1 : 0, reason);
    if (closed) journalPaperClose(position, closed, won ? 1 : 0, reason);
    settled += 1;
  }
  return settled;
}

export async function runPolymarketPaperCycle(trigger: "scheduled" | "manual" = "scheduled") {
  const store = polymarketStore();
  const state = store.state();
  if (state.mode !== "paper" || state.kill_switch) return { action: "idle" as const, detail: "Paper mode is not armed." };

  const snapshot = await getPolymarketSnapshot(true);
  if (snapshot.source === "persistent-cache") {
    store.markCycle(trigger === "manual" ? "Paper cycle skipped because only a saved market snapshot was available." : undefined);
    return { action: "skipped" as const, detail: "A live market read is required for automatic paper actions." };
  }

  let settled = 0;
  const openMarketIds = [...new Set(store.positions().map((position) => position.market_id))];
  if (openMarketIds.length > 0) {
    try {
      settled = settleResolvedPolymarketPaperPositions(await fetchPolymarketResolutions(openMarketIds));
    } catch {
      // A resolution lookup failure must not block executable CLOB exits for still-open markets.
    }
  }

  const marketsById = new Map(snapshot.markets.map((market) => [market.id, market]));
  const paperAuthority = evaluatePolymarketPaperAuthority(safePolymarketBrainReport());
  let brainReport: PolymarketBrainReport;
  try {
    brainReport = polymarketBrain().report(30);
  } catch {
    brainReport = safePolymarketBrainReport();
  }
  // Entries come from the brain's journaled candidates so every simulator
  // position is attributable to a measured strategy hypothesis. Only markout
  // (taker-testable) candidates are tradable; maker and structural stay shadow.
  const entryCandidates = brainReport.recent_candidates.filter((candidate) =>
    candidate.label_kind === "markout"
    && paperAuthority.entry_strategies.includes(candidate.strategy_id)
    && candidate.executable_entry_price !== null
    && (candidate.spread_bps === null || candidate.spread_bps <= ENTRY_MAX_SPREAD_BPS));
  let books;
  try {
    const tokens = [
      ...store.positions().map((position) => position.token_id),
      ...entryCandidates.slice(0, 20).map((candidate) => candidate.token_id),
    ];
    books = await fetchPolymarketOrderBooks(tokens, true);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "CLOB order books are unavailable.";
    store.markCycle(`Paper cycle skipped because executable CLOB depth was unavailable: ${detail}`);
    return { action: "skipped" as const, detail: "Executable CLOB depth is required for paper actions." };
  }

  for (const position of store.positions()) {
    const exitQuote = quotePolymarketPaperSell(books.get(position.token_id)!, position.shares);
    if (!exitQuote) continue;
    const returnPct = exitQuote.average_price / position.entry_price - 1;
    const ageMs = Date.now() - Date.parse(position.opened_at);
    const exitReason = returnPct >= 0.05
      ? "5% paper take-profit reached"
      : returnPct <= -0.03
        ? "3% paper stop-loss reached"
        : ageMs >= 4 * 60 * 60 * 1_000
          ? "4-hour paper hold limit reached"
          : null;
    if (exitReason) {
      const reason = `${exitReason} · displayed CLOB depth walk`;
      const closed = store.closePosition(position.id, exitQuote.average_price, reason);
      if (closed) journalPaperClose(position, closed, exitQuote.average_price, reason);
    }
  }

  if (!paperAuthority.available) {
    if (trigger === "manual") store.markCycle(`Research-only cycle: ${paperAuthority.detail}`);
    return {
      action: "research-only" as const,
      detail: `${paperAuthority.detail} Existing positions were still checked for protective exits and settlement.`,
    };
  }

  const account = store.account(snapshot.markets);
  const openByStrategy = new Map<string, number>();
  for (const position of store.positions()) {
    if (position.strategy_id) openByStrategy.set(position.strategy_id, (openByStrategy.get(position.strategy_id) ?? 0) + 1);
  }
  for (const candidate of entryCandidates) {
    const market = marketsById.get(candidate.market_id);
    if (!market) continue;
    if (
      paperAuthority.tier === "exploration"
      && (openByStrategy.get(candidate.strategy_id) ?? 0) >= POLYMARKET_EXPLORATION_MAX_OPEN_PER_STRATEGY
    ) {
      continue;
    }
    const stake = Math.min(POLYMARKET_EXPLORATION_STAKE_USD, store.state().caps.max_trade_usd);
    const book = books.get(candidate.token_id);
    if (!book) continue;
    const entryQuote = quotePolymarketPaperBuy(book, stake);
    if (!entryQuote) continue;
    const policy = validatePolymarketPaperEntry({
      state: store.state(),
      positions: store.positions(),
      market_id: candidate.market_id,
      outcome_index: candidate.outcome_index,
      stake_usd: stake,
      entry_price: entryQuote.average_price,
      available_cash_usd: account.cash_usd,
      realized_today_usd: account.realized_today_usd,
    });
    if (!policy.ok) continue;

    const tierLabel = paperAuthority.tier === "exploration" ? "exploration" : "promoted";
    const position = store.openPosition({
      market_id: market.id,
      token_id: candidate.token_id,
      question: candidate.question,
      slug: candidate.slug,
      outcome_index: candidate.outcome_index,
      outcome: candidate.outcome,
      stake_usd: stake,
      entry_price: entryQuote.average_price,
      strategy_id: candidate.strategy_id,
      tier: tierLabel,
      thesis: `${trigger === "manual" ? "Manual" : "Scheduled"} ${tierLabel} entry (${strategyName(candidate.strategy_id)}, score ${candidate.score}) · displayed CLOB ask depth walk across ${entryQuote.levels_used} level(s) · ${candidate.thesis}`,
    });
    try {
      polymarketBrain().recordPaperTrade({
        event: "open",
        position_id: position.id,
        strategy_id: candidate.strategy_id,
        tier: tierLabel,
        market_id: candidate.market_id,
        token_id: candidate.token_id,
        outcome: candidate.outcome,
        question: candidate.question,
        slug: candidate.slug,
        price: entryQuote.average_price,
        stake_usd: stake,
        pnl_usd: null,
        reason: position.thesis,
      });
    } catch {
      // The JSON store remains the fallback record; a ledger write failure must not block the entry.
    }
    notifyOperator(
      "entry",
      `Polymarket paper buy ${candidate.outcome} $${stake.toFixed(2)} at ${(entryQuote.average_price * 100).toFixed(1)}¢ · ${strategyName(candidate.strategy_id)} (${tierLabel}) · ${truncate(candidate.question, 80)}`,
    );
    store.markCycle();
    return {
      action: "opened" as const,
      detail: `Opened a $${stake.toFixed(2)} ${tierLabel} paper position on ${candidate.outcome} via ${strategyName(candidate.strategy_id)}.`,
    };
  }

  const settlementDetail = settled > 0 ? ` Settled ${settled} resolved paper position${settled === 1 ? "" : "s"}.` : "";
  store.markCycle(trigger === "manual" ? `Paper cycle completed; no eligible new setup cleared the fixed risk filters.${settlementDetail}` : undefined);
  return { action: "no-signal" as const, detail: `No eligible new setup cleared the fixed risk filters.${settlementDetail}` };
}

function truncate(value: string, max: number) {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
