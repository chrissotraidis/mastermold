import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import type { SqliteDatabase } from "@/src/autopilot/sqlite";

import type { PolymarketMarket, PolymarketResolution } from "./markets";
import { summarizePolymarketBook, type PolymarketOrderBook } from "./orderbook";
import { openPolymarketSqlite } from "./sqlite";
import type { PolymarketBrainCandidate, PolymarketStrategyId } from "./strategies";

const FIVE_MINUTES_MS = 5 * 60_000;
const RETENTION_MS = 90 * 86_400_000;
const MAX_OBSERVATIONS = 50_000;
const PROMOTION_MIN_LABELS = 100;
const PROMOTION_MIN_HIT_RATE = 0.52;
const STREAM_RETENTION_MS = 7 * 86_400_000;
const MAX_STREAM_EVENTS = 100_000;

export type PolymarketStreamEventRecord = {
  id: string;
  timestamp_ms: number;
  event_type: "book" | "price_change" | "last_trade_price" | "best_bid_ask" | "tick_size_change" | "new_market" | "market_resolved";
  market_id: string;
  token_id: string;
  best_bid: number | null;
  best_ask: number | null;
  spread: number | null;
  bid_depth_shares: number | null;
  ask_depth_shares: number | null;
  depth_imbalance: number | null;
  price: number | null;
  size: number | null;
  side: "BUY" | "SELL" | null;
  fee_rate_bps: number | null;
  tick_size: number | null;
};

export type PolymarketStreamStatusInput = {
  status: "disabled" | "connecting" | "live" | "error";
  connected_at?: string | null;
  last_message_at?: string | null;
  reconnects?: number;
  subscribed_tokens?: number;
  error?: string | null;
};


export type PolymarketBrainStrategyMetric = {
  strategy_id: PolymarketStrategyId;
  observations: number;
  labels_15m: number;
  labels_1h: number;
  labels_4h: number;
  mean_1h_bps: number | null;
  hit_rate_1h: number | null;
  resolved_labels: number;
  mean_brier_score: number | null;
  paper_candidate: boolean;
  promotion_detail: string;
};

export type PolymarketBrainReport = {
  status: "learning" | "unavailable";
  database: "sqlite";
  latest_cycle_at: string | null;
  observations: number;
  labeled_1h: number;
  calibration: {
    resolved_observations: number;
    resolved_markets: number;
    invalid_markets: number;
    mean_brier_score: number | null;
  };
  stream: {
    status: "disabled" | "connecting" | "live" | "stale" | "error";
    connected_at: string | null;
    last_message_at: string | null;
    last_event_at: string | null;
    event_count_24h: number;
    retained_coverage_hours: number;
    trade_events_24h: number;
    labeled_trades_1m: number;
    mean_reported_side_markout_1m_bps: number | null;
    reconnects: number;
    subscribed_tokens: number;
    error: string | null;
  };
  strategies: PolymarketBrainStrategyMetric[];
  recent_candidates: PolymarketBrainCandidate[];
  error: string | null;
};

type ObservationRow = {
  id: string;
  ts: string;
  strategy_id: PolymarketStrategyId;
  label_kind: PolymarketBrainCandidate["label_kind"];
  market_id: string;
  token_id: string;
  outcome_index: number;
  question: string;
  slug: string;
  outcome: string;
  market_price: number;
  entry_price: number | null;
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
  thesis: string;
  paper_eligible: number;
  due_15m_ms: number;
  due_1h_ms: number;
  due_4h_ms: number;
};

class PolymarketBrain {
  private readonly db: SqliteDatabase;
  private lastStreamPruneAtMs = 0;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = openPolymarketSqlite(path);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA synchronous=NORMAL;");
    this.migrate();
  }

  close() {
    this.db.close();
  }

  recordCycle(input: {
    source: string;
    markets: PolymarketMarket[];
    candidates: PolymarketBrainCandidate[];
    now_ms?: number;
    error?: string | null;
  }) {
    const nowMs = input.now_ms ?? Date.now();
    const ts = new Date(nowMs).toISOString();
    const bucket = Math.floor(nowMs / FIVE_MINUTES_MS);
    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO polymarket_observations (
        id, ts, strategy_id, label_kind, market_id, token_id, outcome_index,
        question, slug, outcome, market_price, entry_price, best_bid, best_ask,
        midpoint, spread_bps, bid_depth_shares, ask_depth_shares,
        depth_imbalance, executable_size_usd, move_24h, score, thesis,
        paper_eligible, due_15m_ms, due_1h_ms, due_4h_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const watchResolution = this.db.prepare(`
      INSERT INTO polymarket_market_resolutions (
        market_id, question, end_date, status, next_check_at_ms
      ) VALUES (?, ?, ?, 'pending', ?)
      ON CONFLICT(market_id) DO UPDATE SET
        question = excluded.question,
        end_date = COALESCE(excluded.end_date, polymarket_market_resolutions.end_date),
        next_check_at_ms = MAX(polymarket_market_resolutions.next_check_at_ms, excluded.next_check_at_ms)
    `);

    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const candidate of input.candidates) {
        insert.run(
          `${bucket}:${candidate.id}`,
          ts,
          candidate.strategy_id,
          candidate.label_kind,
          candidate.market_id,
          candidate.token_id,
          candidate.outcome_index,
          candidate.question,
          candidate.slug,
          candidate.outcome,
          candidate.market_price,
          candidate.executable_entry_price,
          candidate.best_bid,
          candidate.best_ask,
          candidate.midpoint,
          candidate.spread_bps,
          candidate.bid_depth_shares,
          candidate.ask_depth_shares,
          candidate.depth_imbalance,
          candidate.executable_size_usd,
          candidate.move_24h,
          candidate.score,
          candidate.thesis,
          candidate.paper_eligible ? 1 : 0,
          nowMs + 15 * 60_000,
          nowMs + 60 * 60_000,
          nowMs + 4 * 60 * 60_000,
        );
      }
      for (const market of input.markets) {
        const endMs = market.end_date ? Date.parse(market.end_date) : Number.NaN;
        const nextCheckMs = Number.isFinite(endMs) ? Math.max(nowMs, endMs) : nowMs + 24 * 60 * 60_000;
        watchResolution.run(market.id, market.question, market.end_date, nextCheckMs);
      }
      this.db.prepare(`
        INSERT INTO polymarket_brain_cycles (id, ts, source, market_count, candidate_count, error)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(randomUUID(), ts, input.source, input.markets.length, input.candidates.length, input.error ?? null);
      this.prune(nowMs);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  labelDue(books: Map<string, PolymarketOrderBook>, nowMs = Date.now()) {
    if (books.size === 0) return 0;
    const rows = this.db.prepare(`
      SELECT id, token_id, entry_price, due_15m_ms, due_1h_ms, due_4h_ms,
             price_15m, price_1h, price_4h
      FROM polymarket_observations
      WHERE label_kind = 'markout' AND entry_price IS NOT NULL
        AND ((price_15m IS NULL AND due_15m_ms <= ?)
          OR (price_1h IS NULL AND due_1h_ms <= ?)
          OR (price_4h IS NULL AND due_4h_ms <= ?))
      ORDER BY ts ASC LIMIT 2000
    `).all(nowMs, nowMs, nowMs) as Array<{
      id: string;
      token_id: string;
      entry_price: number;
      due_15m_ms: number;
      due_1h_ms: number;
      due_4h_ms: number;
      price_15m: number | null;
      price_1h: number | null;
      price_4h: number | null;
    }>;
    const update = this.db.prepare(`
      UPDATE polymarket_observations SET
        price_15m = COALESCE(price_15m, ?), return_15m_bps = COALESCE(return_15m_bps, ?),
        price_1h = COALESCE(price_1h, ?), return_1h_bps = COALESCE(return_1h_bps, ?),
        price_4h = COALESCE(price_4h, ?), return_4h_bps = COALESCE(return_4h_bps, ?)
      WHERE id = ?
    `);

    let labeled = 0;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const row of rows) {
        const book = books.get(row.token_id);
        if (!book) continue;
        const futureBid = summarizePolymarketBook(book).best_bid;
        if (futureBid === null || !(row.entry_price > 0)) continue;
        const markout = ((futureBid / row.entry_price) - 1) * 10_000;
        const p15 = row.price_15m === null && row.due_15m_ms <= nowMs ? futureBid : null;
        const p1h = row.price_1h === null && row.due_1h_ms <= nowMs ? futureBid : null;
        const p4h = row.price_4h === null && row.due_4h_ms <= nowMs ? futureBid : null;
        update.run(
          p15, p15 === null ? null : markout,
          p1h, p1h === null ? null : markout,
          p4h, p4h === null ? null : markout,
          row.id,
        );
        if (p15 !== null || p1h !== null || p4h !== null) labeled += 1;
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return labeled;
  }

  pendingTokenIds(nowMs = Date.now(), limit = 50): string[] {
    const rows = this.db.prepare(`
      SELECT token_id, MIN(due_15m_ms) AS next_due
      FROM polymarket_observations
      WHERE label_kind = 'markout'
        AND ((price_15m IS NULL AND due_15m_ms <= ?)
          OR (price_1h IS NULL AND due_1h_ms <= ?)
          OR (price_4h IS NULL AND due_4h_ms <= ?))
      GROUP BY token_id ORDER BY next_due ASC LIMIT ?
    `).all(nowMs, nowMs, nowMs, limit) as Array<{ token_id: string }>;
    return rows.map((row) => row.token_id);
  }

  pendingResolutionMarketIds(nowMs = Date.now(), limit = 25): string[] {
    const rows = this.db.prepare(`
      SELECT market_id FROM polymarket_market_resolutions
      WHERE status = 'pending' AND next_check_at_ms <= ?
      ORDER BY next_check_at_ms ASC LIMIT ?
    `).all(nowMs, limit) as Array<{ market_id: string }>;
    return rows.map((row) => row.market_id);
  }

  applyResolutionChecks(
    requestedMarketIds: string[],
    resolutions: Map<string, PolymarketResolution>,
    nowMs = Date.now(),
  ) {
    const requested = [...new Set(requestedMarketIds)].slice(0, 50);
    if (requested.length === 0) return { resolved_markets: 0, invalid_markets: 0, graded_observations: 0 };
    const checkedAt = new Date(nowMs).toISOString();
    const defer = this.db.prepare(`
      UPDATE polymarket_market_resolutions
      SET last_checked_at = ?, next_check_at_ms = ?
      WHERE market_id = ? AND status = 'pending'
    `);
    const settle = this.db.prepare(`
      UPDATE polymarket_market_resolutions SET
        status = ?, last_checked_at = ?, next_check_at_ms = NULL,
        closed_at = ?, winning_outcome_index = ?, outcome_prices_json = ?
      WHERE market_id = ?
    `);
    const observations = this.db.prepare(`
      SELECT id, outcome_index, market_price FROM polymarket_observations WHERE market_id = ?
    `);
    const score = this.db.prepare(`
      INSERT INTO polymarket_resolution_scores (
        observation_id, market_id, resolved_at, result, brier_score
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(observation_id) DO UPDATE SET
        resolved_at = excluded.resolved_at,
        result = excluded.result,
        brier_score = excluded.brier_score
    `);

    let resolvedMarkets = 0;
    let invalidMarkets = 0;
    let gradedObservations = 0;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const marketId of requested) {
        const resolution = resolutions.get(marketId);
        if (!resolution) {
          defer.run(checkedAt, nowMs + 60 * 60_000, marketId);
          continue;
        }
        settle.run(
          resolution.status,
          checkedAt,
          resolution.closed_at ?? checkedAt,
          resolution.winning_outcome_index,
          JSON.stringify(resolution.outcome_prices),
          marketId,
        );
        if (resolution.status !== "resolved" || resolution.winning_outcome_index === null) {
          invalidMarkets += 1;
          continue;
        }
        resolvedMarkets += 1;
        const rows = observations.all(marketId) as Array<{ id: string; outcome_index: number; market_price: number }>;
        for (const row of rows) {
          const result = row.outcome_index === resolution.winning_outcome_index ? 1 : 0;
          const brier = (row.market_price - result) ** 2;
          score.run(row.id, marketId, resolution.closed_at ?? checkedAt, result, brier);
          gradedObservations += 1;
        }
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return { resolved_markets: resolvedMarkets, invalid_markets: invalidMarkets, graded_observations: gradedObservations };
  }

  recordStreamStatus(input: PolymarketStreamStatusInput) {
    this.db.prepare(`
      INSERT INTO polymarket_stream_status (
        id, status, connected_at, last_message_at, last_event_at,
        reconnects, subscribed_tokens, error
      ) VALUES (1, ?, ?, ?, NULL, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        connected_at = COALESCE(excluded.connected_at, polymarket_stream_status.connected_at),
        last_message_at = COALESCE(excluded.last_message_at, polymarket_stream_status.last_message_at),
        reconnects = COALESCE(excluded.reconnects, polymarket_stream_status.reconnects),
        subscribed_tokens = COALESCE(excluded.subscribed_tokens, polymarket_stream_status.subscribed_tokens),
        error = excluded.error
    `).run(
      input.status,
      input.connected_at ?? null,
      input.last_message_at ?? null,
      input.reconnects ?? null,
      input.subscribed_tokens ?? null,
      input.error ?? null,
    );
  }

  recordStreamEvents(events: PolymarketStreamEventRecord[], receivedAtMs = Date.now()) {
    if (events.length === 0) return { inserted: 0, labeled_trades: 0 };
    const receivedAt = new Date(receivedAtMs).toISOString();
    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO polymarket_stream_events (
        id, timestamp_ms, received_at, event_type, market_id, token_id,
        best_bid, best_ask, spread, bid_depth_shares, ask_depth_shares,
        depth_imbalance, price, size, side, fee_rate_bps, tick_size
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const dueTrades = this.db.prepare(`
      SELECT e.id, e.market_id, e.token_id, e.timestamp_ms, e.price, e.side
      FROM polymarket_stream_events e
      LEFT JOIN polymarket_stream_trade_labels l ON l.trade_event_id = e.id
      WHERE e.event_type = 'last_trade_price'
        AND e.token_id = ?
        AND e.timestamp_ms + 60000 <= ?
        AND e.price IS NOT NULL
        AND e.side IN ('BUY', 'SELL')
        AND l.trade_event_id IS NULL
      ORDER BY e.timestamp_ms ASC LIMIT 1000
    `);
    const labelTrade = this.db.prepare(`
      INSERT OR IGNORE INTO polymarket_stream_trade_labels (
        trade_event_id, market_id, token_id, trade_timestamp_ms, labeled_at_ms,
        trade_price, reported_side, future_midpoint,
        absolute_move_1m_bps, reported_side_markout_1m_bps
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let inserted = 0;
    let labeledTrades = 0;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const event of events) {
        const result = insert.run(
          event.id,
          event.timestamp_ms,
          receivedAt,
          event.event_type,
          event.market_id,
          event.token_id,
          event.best_bid,
          event.best_ask,
          event.spread,
          event.bid_depth_shares,
          event.ask_depth_shares,
          event.depth_imbalance,
          event.price,
          event.size,
          event.side,
          event.fee_rate_bps,
          event.tick_size,
        ) as { changes?: number };
        inserted += Number(result.changes ?? 0);

        if (!event.token_id || event.best_bid === null || event.best_ask === null || event.best_ask < event.best_bid) continue;
        const midpoint = (event.best_bid + event.best_ask) / 2;
        if (!(midpoint > 0)) continue;
        const rows = dueTrades.all(event.token_id, event.timestamp_ms) as Array<{
          id: string;
          market_id: string;
          token_id: string;
          timestamp_ms: number;
          price: number;
          side: "BUY" | "SELL";
        }>;
        for (const trade of rows) {
          if (!(trade.price > 0)) continue;
          const rawMoveBps = ((midpoint / trade.price) - 1) * 10_000;
          const reportedSideMarkout = trade.side === "BUY" ? rawMoveBps : -rawMoveBps;
          const result = labelTrade.run(
            trade.id,
            trade.market_id,
            trade.token_id,
            trade.timestamp_ms,
            event.timestamp_ms,
            trade.price,
            trade.side,
            midpoint,
            Math.abs(rawMoveBps),
            reportedSideMarkout,
          ) as { changes?: number };
          labeledTrades += Number(result.changes ?? 0);
        }
      }
      this.db.prepare(`
        INSERT INTO polymarket_stream_status (
          id, status, connected_at, last_message_at, last_event_at,
          reconnects, subscribed_tokens, error
        ) VALUES (1, 'live', NULL, ?, ?, 0, 0, NULL)
        ON CONFLICT(id) DO UPDATE SET
          status = 'live', last_message_at = excluded.last_message_at,
          last_event_at = excluded.last_event_at, error = NULL
      `).run(receivedAt, receivedAt);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    if (receivedAtMs - this.lastStreamPruneAtMs >= 10_000) {
      this.pruneStream(receivedAtMs);
      this.lastStreamPruneAtMs = receivedAtMs;
    }
    return { inserted, labeled_trades: labeledTrades };
  }

  recordStreamHeartbeat(at = new Date().toISOString()) {
    this.db.prepare(`
      UPDATE polymarket_stream_status SET last_message_at = ?, error = NULL
      WHERE id = 1 AND status = 'live'
    `).run(at);
  }

  report(limit = 12): PolymarketBrainReport {
    const total = this.db.prepare("SELECT COUNT(*) AS count, COUNT(return_1h_bps) AS labeled FROM polymarket_observations").get() as { count: number; labeled: number };
    const latest = this.db.prepare("SELECT ts, error FROM polymarket_brain_cycles ORDER BY ts DESC LIMIT 1").get() as { ts: string; error: string | null } | undefined;
    const calibration = this.db.prepare("SELECT COUNT(*) AS count, AVG(brier_score) AS mean_brier FROM polymarket_resolution_scores").get() as { count: number; mean_brier: number | null };
    const resolutionCounts = this.db.prepare(`
      SELECT
        SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved,
        SUM(CASE WHEN status = 'invalid' THEN 1 ELSE 0 END) AS invalid
      FROM polymarket_market_resolutions
    `).get() as { resolved: number | null; invalid: number | null };
    const streamStatus = this.db.prepare(`
      SELECT status, connected_at, last_message_at, last_event_at,
             reconnects, subscribed_tokens, error
      FROM polymarket_stream_status WHERE id = 1
    `).get() as {
      status: "disabled" | "connecting" | "live" | "error";
      connected_at: string | null;
      last_message_at: string | null;
      last_event_at: string | null;
      reconnects: number;
      subscribed_tokens: number;
      error: string | null;
    } | undefined;
    const streamCounts = this.db.prepare(`
      SELECT COUNT(*) AS events,
             SUM(CASE WHEN event_type = 'last_trade_price' THEN 1 ELSE 0 END) AS trades,
             MIN(timestamp_ms) AS first_ms,
             MAX(timestamp_ms) AS last_ms
      FROM polymarket_stream_events WHERE timestamp_ms >= ?
    `).get(Date.now() - 86_400_000) as { events: number; trades: number | null; first_ms: number | null; last_ms: number | null };
    const streamLabels = this.db.prepare(`
      SELECT COUNT(*) AS count, AVG(reported_side_markout_1m_bps) AS mean_markout
      FROM polymarket_stream_trade_labels
    `).get() as { count: number; mean_markout: number | null };
    const rows = this.db.prepare(`
      SELECT o.strategy_id,
             COUNT(*) AS observations,
             COUNT(o.return_15m_bps) AS labels_15m,
             COUNT(o.return_1h_bps) AS labels_1h,
             COUNT(o.return_4h_bps) AS labels_4h,
             AVG(o.return_1h_bps) AS mean_1h_bps,
             AVG(CASE WHEN o.return_1h_bps > 0 THEN 1.0 ELSE 0.0 END) FILTER (WHERE o.return_1h_bps IS NOT NULL) AS hit_rate_1h,
             COUNT(s.brier_score) AS resolved_labels,
             AVG(s.brier_score) AS mean_brier_score
      FROM polymarket_observations o
      LEFT JOIN polymarket_resolution_scores s ON s.observation_id = o.id
      GROUP BY o.strategy_id ORDER BY o.strategy_id
    `).all() as Array<{
      strategy_id: PolymarketStrategyId;
      observations: number;
      labels_15m: number;
      labels_1h: number;
      labels_4h: number;
      mean_1h_bps: number | null;
      hit_rate_1h: number | null;
      resolved_labels: number;
      mean_brier_score: number | null;
    }>;
    const strategies = rows.map((row) => {
      const ready = row.labels_1h >= PROMOTION_MIN_LABELS
        && (row.mean_1h_bps ?? -Infinity) > 0
        && (row.hit_rate_1h ?? 0) >= PROMOTION_MIN_HIT_RATE;
      return {
        ...row,
        mean_1h_bps: roundOrNull(row.mean_1h_bps),
        hit_rate_1h: roundOrNull(row.hit_rate_1h),
        mean_brier_score: roundBrier(row.mean_brier_score),
        paper_candidate: ready,
        promotion_detail: ready
          ? "Clears the minimum shadow gate for operator review; no live authority."
          : `${row.labels_1h}/${PROMOTION_MIN_LABELS} one-hour labels; mean ${formatBps(row.mean_1h_bps)}; hit ${formatRate(row.hit_rate_1h)}.`,
      } satisfies PolymarketBrainStrategyMetric;
    });

    return {
      status: "learning",
      database: "sqlite",
      latest_cycle_at: latest?.ts ?? null,
      observations: Number(total?.count ?? 0),
      labeled_1h: Number(total?.labeled ?? 0),
      calibration: {
        resolved_observations: Number(calibration?.count ?? 0),
        resolved_markets: Number(resolutionCounts?.resolved ?? 0),
        invalid_markets: Number(resolutionCounts?.invalid ?? 0),
        mean_brier_score: roundBrier(calibration?.mean_brier ?? null),
      },
      stream: {
        status: streamStatus?.status === "live"
          && streamStatus.last_message_at
          && Date.now() - Date.parse(streamStatus.last_message_at) > 30_000
          ? "stale"
          : streamStatus?.status ?? "disabled",
        connected_at: streamStatus?.connected_at ?? null,
        last_message_at: streamStatus?.last_message_at ?? null,
        last_event_at: streamStatus?.last_event_at ?? null,
        event_count_24h: Number(streamCounts?.events ?? 0),
        retained_coverage_hours: streamCounts?.first_ms != null && streamCounts.last_ms != null
          ? Math.round(((streamCounts.last_ms - streamCounts.first_ms) / 3_600_000) * 100) / 100
          : 0,
        trade_events_24h: Number(streamCounts?.trades ?? 0),
        labeled_trades_1m: Number(streamLabels?.count ?? 0),
        mean_reported_side_markout_1m_bps: roundOrNull(streamLabels?.mean_markout ?? null),
        reconnects: Number(streamStatus?.reconnects ?? 0),
        subscribed_tokens: Number(streamStatus?.subscribed_tokens ?? 0),
        error: streamStatus?.error ?? null,
      },
      strategies,
      recent_candidates: this.recentCandidates(limit),
      error: latest?.error ?? null,
    };
  }

  private recentCandidates(limit: number): PolymarketBrainCandidate[] {
    const rows = this.db.prepare(`
      SELECT * FROM polymarket_observations
      WHERE ts = (SELECT MAX(ts) FROM polymarket_observations)
      ORDER BY score DESC, executable_size_usd DESC LIMIT ?
    `).all(limit) as ObservationRow[];
    return rows.map((row) => ({
      id: row.id,
      strategy_id: row.strategy_id,
      label_kind: row.label_kind,
      market_id: row.market_id,
      token_id: row.token_id,
      outcome_index: row.outcome_index,
      question: row.question,
      slug: row.slug,
      outcome: row.outcome,
      market_price: row.market_price,
      executable_entry_price: row.entry_price,
      best_bid: row.best_bid,
      best_ask: row.best_ask,
      midpoint: row.midpoint,
      spread_bps: row.spread_bps,
      bid_depth_shares: row.bid_depth_shares,
      ask_depth_shares: row.ask_depth_shares,
      depth_imbalance: row.depth_imbalance,
      executable_size_usd: row.executable_size_usd,
      move_24h: row.move_24h,
      score: row.score,
      paper_eligible: false,
      thesis: row.thesis,
    }));
  }

  private prune(nowMs: number) {
    this.db.prepare("DELETE FROM polymarket_observations WHERE ts < ?").run(new Date(nowMs - RETENTION_MS).toISOString());
    this.db.prepare(`
      DELETE FROM polymarket_observations WHERE id NOT IN (
        SELECT id FROM polymarket_observations ORDER BY ts DESC LIMIT ?
      )
    `).run(MAX_OBSERVATIONS);
    this.db.prepare("DELETE FROM polymarket_brain_cycles WHERE ts < ?").run(new Date(nowMs - RETENTION_MS).toISOString());
    this.db.exec(`
      DELETE FROM polymarket_resolution_scores
      WHERE observation_id NOT IN (SELECT id FROM polymarket_observations);
      DELETE FROM polymarket_market_resolutions
      WHERE market_id NOT IN (SELECT DISTINCT market_id FROM polymarket_observations);
    `);
    this.pruneStream(nowMs);
  }

  private pruneStream(nowMs: number) {
    this.db.prepare("DELETE FROM polymarket_stream_events WHERE timestamp_ms < ?").run(nowMs - STREAM_RETENTION_MS);
    this.db.prepare(`
      DELETE FROM polymarket_stream_events WHERE id IN (
        SELECT id FROM polymarket_stream_events ORDER BY timestamp_ms DESC, id DESC LIMIT -1 OFFSET ?
      )
    `).run(MAX_STREAM_EVENTS);
    this.db.exec("DELETE FROM polymarket_stream_trade_labels WHERE trade_event_id NOT IN (SELECT id FROM polymarket_stream_events)");
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS polymarket_brain_cycles (
        id TEXT PRIMARY KEY,
        ts TEXT NOT NULL,
        source TEXT NOT NULL,
        market_count INTEGER NOT NULL,
        candidate_count INTEGER NOT NULL,
        error TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_polymarket_brain_cycles_ts ON polymarket_brain_cycles(ts DESC);

      CREATE TABLE IF NOT EXISTS polymarket_observations (
        id TEXT PRIMARY KEY,
        ts TEXT NOT NULL,
        strategy_id TEXT NOT NULL,
        label_kind TEXT NOT NULL,
        market_id TEXT NOT NULL,
        token_id TEXT NOT NULL,
        outcome_index INTEGER NOT NULL,
        question TEXT NOT NULL,
        slug TEXT NOT NULL,
        outcome TEXT NOT NULL,
        market_price REAL NOT NULL,
        entry_price REAL,
        best_bid REAL,
        best_ask REAL,
        midpoint REAL,
        spread_bps REAL,
        bid_depth_shares REAL NOT NULL,
        ask_depth_shares REAL NOT NULL,
        depth_imbalance REAL,
        executable_size_usd REAL NOT NULL,
        move_24h REAL,
        score REAL NOT NULL,
        thesis TEXT NOT NULL,
        paper_eligible INTEGER NOT NULL DEFAULT 0,
        due_15m_ms INTEGER NOT NULL,
        due_1h_ms INTEGER NOT NULL,
        due_4h_ms INTEGER NOT NULL,
        price_15m REAL,
        return_15m_bps REAL,
        price_1h REAL,
        return_1h_bps REAL,
        price_4h REAL,
        return_4h_bps REAL
      );
      CREATE INDEX IF NOT EXISTS idx_polymarket_observations_due ON polymarket_observations(label_kind, due_1h_ms);
      CREATE INDEX IF NOT EXISTS idx_polymarket_observations_strategy ON polymarket_observations(strategy_id, ts DESC);
      CREATE INDEX IF NOT EXISTS idx_polymarket_observations_token ON polymarket_observations(token_id, ts DESC);

      CREATE TABLE IF NOT EXISTS polymarket_market_resolutions (
        market_id TEXT PRIMARY KEY,
        question TEXT NOT NULL,
        end_date TEXT,
        status TEXT NOT NULL,
        last_checked_at TEXT,
        next_check_at_ms INTEGER,
        closed_at TEXT,
        winning_outcome_index INTEGER,
        outcome_prices_json TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_polymarket_market_resolutions_due
        ON polymarket_market_resolutions(status, next_check_at_ms);

      CREATE TABLE IF NOT EXISTS polymarket_resolution_scores (
        observation_id TEXT PRIMARY KEY,
        market_id TEXT NOT NULL,
        resolved_at TEXT NOT NULL,
        result REAL NOT NULL,
        brier_score REAL NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_polymarket_resolution_scores_market
        ON polymarket_resolution_scores(market_id, resolved_at DESC);

      CREATE TABLE IF NOT EXISTS polymarket_stream_events (
        id TEXT PRIMARY KEY,
        timestamp_ms INTEGER NOT NULL,
        received_at TEXT NOT NULL,
        event_type TEXT NOT NULL,
        market_id TEXT NOT NULL,
        token_id TEXT NOT NULL,
        best_bid REAL,
        best_ask REAL,
        spread REAL,
        bid_depth_shares REAL,
        ask_depth_shares REAL,
        depth_imbalance REAL,
        price REAL,
        size REAL,
        side TEXT,
        fee_rate_bps REAL,
        tick_size REAL
      );
      CREATE INDEX IF NOT EXISTS idx_polymarket_stream_events_ts
        ON polymarket_stream_events(timestamp_ms DESC);
      CREATE INDEX IF NOT EXISTS idx_polymarket_stream_events_token
        ON polymarket_stream_events(token_id, event_type, timestamp_ms DESC);

      CREATE TABLE IF NOT EXISTS polymarket_stream_trade_labels (
        trade_event_id TEXT PRIMARY KEY,
        market_id TEXT NOT NULL,
        token_id TEXT NOT NULL,
        trade_timestamp_ms INTEGER NOT NULL,
        labeled_at_ms INTEGER NOT NULL,
        trade_price REAL NOT NULL,
        reported_side TEXT NOT NULL,
        future_midpoint REAL NOT NULL,
        absolute_move_1m_bps REAL NOT NULL,
        reported_side_markout_1m_bps REAL NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_polymarket_stream_trade_labels_ts
        ON polymarket_stream_trade_labels(trade_timestamp_ms DESC);

      CREATE TABLE IF NOT EXISTS polymarket_stream_status (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        status TEXT NOT NULL,
        connected_at TEXT,
        last_message_at TEXT,
        last_event_at TEXT,
        reconnects INTEGER NOT NULL DEFAULT 0,
        subscribed_tokens INTEGER NOT NULL DEFAULT 0,
        error TEXT
      );
      INSERT OR IGNORE INTO polymarket_stream_status (
        id, status, reconnects, subscribed_tokens
      ) VALUES (1, 'disabled', 0, 0);

      INSERT OR IGNORE INTO polymarket_market_resolutions (
        market_id, question, end_date, status, next_check_at_ms
      )
      SELECT market_id, MAX(question), NULL, 'pending', 0
      FROM polymarket_observations
      GROUP BY market_id;
    `);
  }
}

let singleton: PolymarketBrain | null = null;
let singletonPath = "";
const TEST_BRAIN_PATH = join(tmpdir(), `mastermold-polymarket-brain-${process.pid}-${randomUUID()}.db`);

export function polymarketBrain() {
  const path = process.env.POLYMARKET_BRAIN_DB ?? (process.env.NODE_ENV === "test"
    ? TEST_BRAIN_PATH
    : join(/* turbopackIgnore: true */ process.cwd(), ".data", "polymarket-brain.db"));
  if (!singleton || singletonPath !== path) {
    singleton?.close();
    singleton = new PolymarketBrain(path);
    singletonPath = path;
  }
  return singleton;
}

export function safePolymarketBrainReport(): PolymarketBrainReport {
  try {
    return polymarketBrain().report();
  } catch (error) {
    console.error(
      "[mastermold] Polymarket brain unavailable:",
      error instanceof Error ? error.message : "unknown local SQLite error",
    );
    return {
      status: "unavailable",
      database: "sqlite",
      latest_cycle_at: null,
      observations: 0,
      labeled_1h: 0,
      calibration: {
        resolved_observations: 0,
        resolved_markets: 0,
        invalid_markets: 0,
        mean_brier_score: null,
      },
      stream: {
        status: "error",
        connected_at: null,
        last_message_at: null,
        last_event_at: null,
        event_count_24h: 0,
        retained_coverage_hours: 0,
        trade_events_24h: 0,
        labeled_trades_1m: 0,
        mean_reported_side_markout_1m_bps: null,
        reconnects: 0,
        subscribed_tokens: 0,
        error: "The local Polymarket stream status is unavailable.",
      },
      strategies: [],
      recent_candidates: [],
      error: "The local Polymarket brain database is unavailable; no state was replaced.",
    };
  }
}

export function __resetPolymarketBrainForTests() {
  singleton?.close();
  singleton = null;
  singletonPath = "";
}

function roundOrNull(value: number | null) {
  return value === null || !Number.isFinite(value) ? null : Math.round(value * 100) / 100;
}

function roundBrier(value: number | null) {
  return value === null || !Number.isFinite(value) ? null : Math.round(value * 10_000) / 10_000;
}

function formatBps(value: number | null) {
  return value === null || !Number.isFinite(value) ? "not labeled" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}bp`;
}

function formatRate(value: number | null) {
  return value === null || !Number.isFinite(value) ? "not labeled" : `${Math.round(value * 100)}%`;
}
