import { buildPolymarketWatchSignals, hasPolymarketEntryHorizon, type PolymarketMarket } from "./markets";
import { summarizePolymarketBook, type PolymarketOrderBook } from "./orderbook";

export type PolymarketStrategyId = "momentum" | "book_pressure" | "binary_parity" | "maker_spread" | "analyst";
export type PolymarketLabelKind = "markout" | "structural" | "maker";

export type PolymarketBrainCandidate = {
  id: string;
  strategy_id: PolymarketStrategyId;
  label_kind: PolymarketLabelKind;
  market_id: string;
  token_id: string;
  outcome_index: number;
  question: string;
  slug: string;
  outcome: string;
  market_price: number;
  executable_entry_price: number | null;
  best_bid: number | null;
  best_ask: number | null;
  midpoint: number | null;
  spread_bps: number | null;
  bid_depth_shares: number;
  ask_depth_shares: number;
  depth_imbalance: number | null;
  executable_size_usd: number;
  move_24h: number | null;
  score: number;
  paper_eligible: false;
  thesis: string;
};

export function buildPolymarketBrainCandidates(
  markets: PolymarketMarket[],
  books: Map<string, PolymarketOrderBook>,
): PolymarketBrainCandidate[] {
  const candidates: PolymarketBrainCandidate[] = [];

  for (const signal of buildPolymarketWatchSignals(markets)) {
    const book = books.get(signal.token_id);
    const metrics = book ? summarizePolymarketBook(book) : null;
    candidates.push({
      id: `momentum:${signal.market_id}:${signal.outcome_index}`,
      strategy_id: "momentum",
      label_kind: "markout",
      market_id: signal.market_id,
      token_id: signal.token_id,
      outcome_index: signal.outcome_index,
      question: signal.question,
      slug: signal.slug,
      outcome: signal.outcome,
      market_price: signal.price,
      executable_entry_price: metrics?.best_ask ?? null,
      best_bid: metrics?.best_bid ?? null,
      best_ask: metrics?.best_ask ?? null,
      midpoint: metrics?.midpoint ?? null,
      spread_bps: metrics?.spread_bps ?? null,
      bid_depth_shares: metrics?.bid_depth_shares ?? 0,
      ask_depth_shares: metrics?.ask_depth_shares ?? 0,
      depth_imbalance: metrics?.depth_imbalance ?? null,
      executable_size_usd: metrics?.executable_size_usd ?? 0,
      move_24h: signal.move_24h,
      score: signal.score,
      paper_eligible: false,
      thesis: `${signal.thesis} The brain measures future executable bids against the current ask before this hypothesis can gain more authority.`,
    });
  }

  for (const market of markets) {
    if (!isResearchableBinaryMarket(market)) continue;
    const metrics = market.token_ids.map((token) => {
      const book = books.get(token);
      return book ? summarizePolymarketBook(book) : null;
    });

    for (let outcomeIndex = 0; outcomeIndex < 2; outcomeIndex += 1) {
      const book = metrics[outcomeIndex];
      if (!book || book.best_ask === null || book.best_bid === null || book.depth_imbalance === null) continue;
      const totalDepth = book.bid_depth_shares + book.ask_depth_shares;
      if (
        !market.fees_enabled
        && book.best_ask >= 0.08
        && book.best_ask <= 0.92
        && (book.spread_bps ?? Infinity) <= 500
        && totalDepth >= 200
        && book.depth_imbalance >= 0.35
        && book.executable_size_usd >= 10
      ) {
        const score = Math.min(99, Math.round(50 + book.depth_imbalance * 35 + Math.min(14, Math.log10(totalDepth) * 4)));
        candidates.push({
          id: `book_pressure:${market.id}:${outcomeIndex}`,
          strategy_id: "book_pressure",
          label_kind: "markout",
          market_id: market.id,
          token_id: market.token_ids[outcomeIndex],
          outcome_index: outcomeIndex,
          question: market.question,
          slug: market.slug,
          outcome: market.outcomes[outcomeIndex],
          market_price: market.outcome_prices[outcomeIndex],
          executable_entry_price: book.best_ask,
          ...bookFields(book),
          move_24h: market.price_change_24h,
          score,
          paper_eligible: false,
          thesis: `Resting depth within 3¢ is ${(book.depth_imbalance * 100).toFixed(0)}% bid-skewed with a ${formatSpread(book.spread_bps)} spread. This is a shadow order-book-pressure hypothesis, not inferred signed trade flow.`,
        });
      }

      const spread = book.best_ask - book.best_bid;
      if (spread >= 0.02 && spread <= 0.08 && totalDepth >= 300 && book.executable_size_usd >= 20) {
        const score = Math.min(99, Math.round(40 + spread * 500 + Math.min(20, Math.log10(totalDepth) * 5)));
        candidates.push({
          id: `maker_spread:${market.id}:${outcomeIndex}`,
          strategy_id: "maker_spread",
          label_kind: "maker",
          market_id: market.id,
          token_id: market.token_ids[outcomeIndex],
          outcome_index: outcomeIndex,
          question: market.question,
          slug: market.slug,
          outcome: market.outcomes[outcomeIndex],
          market_price: market.outcome_prices[outcomeIndex],
          executable_entry_price: book.best_bid,
          ...bookFields(book),
          move_24h: market.price_change_24h,
          score,
          paper_eligible: false,
          thesis: `${(spread * 100).toFixed(1)}¢ displayed spread with ${Math.round(totalDepth)} shares near top of book. Fill probability, queue position, adverse selection, fee schedule, and rebates are not yet modeled, so this remains maker research only.`,
        });
      }
    }

    const yesBook = metrics[0];
    const noBook = metrics[1];
    if (yesBook?.best_ask !== null && yesBook?.best_ask !== undefined && noBook?.best_ask !== null && noBook?.best_ask !== undefined) {
      const combinedAsk = yesBook.best_ask + noBook.best_ask;
      const executableSize = Math.min(yesBook.executable_size_usd, noBook.executable_size_usd);
      if (!market.fees_enabled && combinedAsk <= 0.995 && executableSize >= 5) {
        const edgeBps = (1 - combinedAsk) * 10_000;
        candidates.push({
          id: `binary_parity:${market.id}`,
          strategy_id: "binary_parity",
          label_kind: "structural",
          market_id: market.id,
          token_id: market.token_ids[0],
          outcome_index: 0,
          question: market.question,
          slug: market.slug,
          outcome: "YES + NO",
          market_price: combinedAsk,
          executable_entry_price: combinedAsk,
          best_bid: yesBook.best_bid,
          best_ask: combinedAsk,
          midpoint: null,
          spread_bps: null,
          bid_depth_shares: Math.min(yesBook.bid_depth_shares, noBook.bid_depth_shares),
          ask_depth_shares: Math.min(yesBook.ask_depth_shares, noBook.ask_depth_shares),
          depth_imbalance: null,
          executable_size_usd: executableSize,
          move_24h: market.price_change_24h,
          score: Math.min(99, Math.round(60 + edgeBps / 2)),
          paper_eligible: false,
          thesis: `Combined displayed asks are ${(combinedAsk * 100).toFixed(2)}¢ (${edgeBps.toFixed(0)}bp below payout) for about $${executableSize.toFixed(0)} top-level size. Atomicity, partial fills, settlement, and stale-book risk remain unmodeled.`,
        });
      }
    }
  }

  return dedupe(candidates).sort((a, b) => b.score - a.score || b.executable_size_usd - a.executable_size_usd);
}

function isResearchableBinaryMarket(market: PolymarketMarket) {
  return market.accepting_orders
    && market.order_book_enabled
    && hasPolymarketEntryHorizon(market)
    && !market.neg_risk
    && market.outcomes.length === 2
    && market.outcome_prices.length === 2
    && market.token_ids.length === 2
    && market.liquidity_usd >= 10_000;
}

function bookFields(book: ReturnType<typeof summarizePolymarketBook>) {
  return {
    best_bid: book.best_bid,
    best_ask: book.best_ask,
    midpoint: book.midpoint,
    spread_bps: book.spread_bps,
    bid_depth_shares: book.bid_depth_shares,
    ask_depth_shares: book.ask_depth_shares,
    depth_imbalance: book.depth_imbalance,
    executable_size_usd: book.executable_size_usd,
  };
}

function formatSpread(value: number | null) {
  return value === null ? "unknown" : `${Math.round(value)}bp`;
}

function dedupe(candidates: PolymarketBrainCandidate[]) {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.id)) return false;
    seen.add(candidate.id);
    return true;
  });
}
