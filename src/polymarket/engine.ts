import {
  buildPolymarketWatchSignals,
  fetchPolymarketMarkets,
  fetchPolymarketResolutions,
  hasPolymarketEntryHorizon,
  type PolymarketResolution,
  type PolymarketMarketSnapshot,
} from "./markets";
import { evaluatePolymarketPaperAuthority } from "./authority";
import { polymarketBrain, safePolymarketBrainReport } from "./brain";
import { fetchPolymarketOrderBooks, quotePolymarketPaperBuy, quotePolymarketPaperSell } from "./orderbook";
import { validatePolymarketPaperEntry } from "./policy";
import { polymarketStore } from "./store";
import { startOrUpdatePolymarketStream } from "./stream";
import { buildPolymarketBrainCandidates } from "./strategies";

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
    return {
      action: "learned" as const,
      detail: `${trigger === "manual" ? "Manual" : "Scheduled"} brain cycle recorded ${candidates.length} candidates, advanced ${labeled} due markouts, and graded ${resolutionSummary.graded_observations} resolved observations.${resolutionNote}`,
      report: brain.report(),
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
    store.closePosition(
      position.id,
      won ? 1 : 0,
      `Market resolved · ${won ? "selected outcome won" : "selected outcome lost"}`,
    );
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
  const signals = buildPolymarketWatchSignals(snapshot.markets);
  let books;
  try {
    const tokens = [...store.positions().map((position) => position.token_id), ...signals.slice(0, 20).map((signal) => signal.token_id)];
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
      store.closePosition(position.id, exitQuote.average_price, `${exitReason} · displayed CLOB depth walk`);
    }
  }

  const paperAuthority = evaluatePolymarketPaperAuthority(safePolymarketBrainReport());
  if (!paperAuthority.available) {
    if (trigger === "manual") store.markCycle(`Research-only cycle: ${paperAuthority.detail}`);
    return {
      action: "research-only" as const,
      detail: `${paperAuthority.detail} Existing positions were still checked for protective exits and settlement.`,
    };
  }

  const account = store.account(snapshot.markets);
  for (const signal of signals) {
    const market = marketsById.get(signal.market_id);
    if (!market) continue;
    const stake = Math.min(5, store.state().caps.max_trade_usd);
    const entryQuote = quotePolymarketPaperBuy(books.get(signal.token_id)!, stake);
    if (!entryQuote) continue;
    const policy = validatePolymarketPaperEntry({
      state: store.state(),
      positions: store.positions(),
      market_id: signal.market_id,
      outcome_index: signal.outcome_index,
      stake_usd: stake,
      entry_price: entryQuote.average_price,
      available_cash_usd: account.cash_usd,
      realized_today_usd: account.realized_today_usd,
    });
    if (!policy.ok) continue;

    store.openPosition({
      market_id: market.id,
      token_id: signal.token_id,
      question: signal.question,
      slug: signal.slug,
      outcome_index: signal.outcome_index,
      outcome: signal.outcome,
      stake_usd: stake,
      entry_price: entryQuote.average_price,
      thesis: `${trigger === "manual" ? "Manual" : "Scheduled"} paper cycle · displayed CLOB ask depth walk across ${entryQuote.levels_used} level(s) · ${signal.thesis}`,
    });
    store.markCycle();
    return { action: "opened" as const, detail: `Opened a $${stake.toFixed(2)} paper position on ${signal.outcome}.` };
  }

  const settlementDetail = settled > 0 ? ` Settled ${settled} resolved paper position${settled === 1 ? "" : "s"}.` : "";
  store.markCycle(trigger === "manual" ? `Paper cycle completed; no eligible new setup cleared the fixed risk filters.${settlementDetail}` : undefined);
  return { action: "no-signal" as const, detail: `No eligible new setup cleared the fixed risk filters.${settlementDetail}` };
}
