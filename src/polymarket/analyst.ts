/**
 * The Analyst lane: an LLM prices selected Polymarket binary markets
 * independently, treating the current market price as the prior (MixMCP
 * discipline — arXiv:2607.20441), and opens a small paper position only when
 * its estimate diverges from the executable ask by a fixed edge threshold.
 *
 * Every forecast is journaled and graded against resolution regardless of
 * whether it was bet, so the lane accumulates a Brier-scored calibration
 * record vs the market itself. Positions hold to resolution — no price stops —
 * because the hypothesis under test is the probability estimate, not a path.
 *
 * Promotion gate to any live-money discussion (docs/analyst-lane.md):
 * >= 50 resolved forecasts, mean model Brier <= mean market Brier, and
 * positive realized paper P&L on tier="analyst" closes.
 */

import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { notifyOperator } from "../autopilot/notify";
import type { SqliteDatabase } from "../autopilot/sqlite";
import { polymarketBrain } from "./brain";
import {
  fetchPolymarketMarkets,
  fetchPolymarketResolutions,
  hasPolymarketEntryHorizon,
  type PolymarketMarket,
} from "./markets";
import { fetchPolymarketOrderBooks, quotePolymarketPaperBuy, summarizePolymarketBook } from "./orderbook";
import { validatePolymarketPaperEntry } from "./policy";
import { openPolymarketSqlite } from "./sqlite";
import { polymarketStore } from "./store";

export const POLYMARKET_ANALYST_STAKE_USD = 5;
export const POLYMARKET_ANALYST_MAX_OPEN = 3;
export const POLYMARKET_ANALYST_EDGE_MIN = 0.1;
const MAX_FORECASTS_PER_CYCLE = 5;
const MIN_HORIZON_MS = 24 * 60 * 60 * 1_000;
const MAX_HORIZON_MS = 14 * 24 * 60 * 60 * 1_000;
const REFORECAST_COOLDOWN_MS = 20 * 60 * 60 * 1_000;
const MIN_LIQUIDITY_USD = 20_000;
const DEFAULT_CYCLE_HOURS = 3;

export type AnalystConfidence = "low" | "medium" | "high";

export type AnalystForecast = {
  probability: number;
  confidence: AnalystConfidence;
  rationale: string;
};

export type AnalystForecastRow = {
  id: string;
  ts: string;
  market_id: string;
  question: string;
  slug: string;
  end_date: string | null;
  yes_price: number;
  yes_ask: number | null;
  no_ask: number | null;
  model: string;
  probability: number;
  confidence: AnalystConfidence;
  rationale: string;
  side: "YES" | "NO" | null;
  edge: number | null;
  bet: 0 | 1;
  position_id: string | null;
  stake_usd: number | null;
  entry_price: number | null;
  status: "pending" | "resolved" | "invalid";
  winning_outcome_index: number | null;
  resolved_at: string | null;
  brier_model: number | null;
  brier_market: number | null;
};

export type AnalystReport = {
  enabled: boolean;
  model: string;
  forecast_count: number;
  resolved_count: number;
  pending_count: number;
  bet_count: number;
  mean_brier_model: number | null;
  mean_brier_market: number | null;
  realized_pnl_usd: number;
  last_cycle_at: string | null;
  recent_forecasts: AnalystForecastRow[];
  gate: { target_resolved: number; detail: string };
};

/** One-shot completion — injected so tests never touch the network. */
export type AnalystCompletionFn = (systemPrompt: string, userPrompt: string) => Promise<string>;

export function polymarketAnalystEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.POLYMARKET_ANALYST === "1";
}

export function polymarketAnalystModel(env: Record<string, string | undefined> = process.env): string {
  return env.POLYMARKET_ANALYST_MODEL ?? "deepseek/deepseek-v4-flash:online";
}

export const ANALYST_FORECAST_SYSTEM_PROMPT = [
  "You are a careful probabilistic forecaster pricing one prediction-market question.",
  "Discipline you must follow exactly:",
  "- The current market price is a strong prior set by people betting real money. Start from it.",
  "- Move away from the prior only for concrete, checkable evidence you can name; cite it in the rationale.",
  "- Read the resolution criteria literally. Price the stated criteria, not the vibe of the headline.",
  "- Mind the clock: if the remaining time is short, weigh how much can still change before the deadline.",
  "- No motivated rounding: 0.5 is not a safe default, and 0.99/0.01 require overwhelming evidence.",
  "- If your evidence is thin or conflicting, stay near the market prior and mark confidence low.",
  "- If your recent track record is provided, use it to correct systematic bias (chronic over- or under-confidence, a category you keep misreading). It is context, not precedent.",
  'Output STRICT JSON only, no markdown fences, matching:',
  '{"probability": <number 0..1 that the YES outcome occurs>,',
  ' "confidence": "low" | "medium" | "high",',
  ' "rationale": "2-4 sentences naming the decisive evidence"}',
].join("\n");

export function buildAnalystForecastPrompt(input: {
  question: string;
  description: string;
  endDate: string | null;
  yesPrice: number;
  nowIso: string;
  trackRecord?: string;
}): string {
  const horizon = input.endDate
    ? `${input.endDate} (${Math.max(0, Math.round((Date.parse(input.endDate) - Date.parse(input.nowIso)) / 86_400_000))} days away)`
    : "unknown";
  return [
    `Today is ${input.nowIso.slice(0, 10)}.`,
    `Question: ${input.question}`,
    `Resolution criteria: ${truncate(input.description || "(none provided — price the question text literally)", 1_500)}`,
    `Market end date: ${horizon}`,
    `Current market price for YES: ${input.yesPrice.toFixed(3)} (this is your prior).`,
    ...(input.trackRecord ? [`Your recent track record on this venue:\n${input.trackRecord}`] : []),
    "Estimate the probability that this market resolves YES.",
  ].join("\n");
}

/** Compact self-review context: overall calibration plus the latest graded
 * calls, so the model can iterate on its own logged ideas across cycles. */
export function formatAnalystTrackRecord(input: {
  resolved_count: number;
  mean_brier_model: number | null;
  mean_brier_market: number | null;
  recent: Array<{ question: string; probability: number; yes_price: number; winning_outcome_index: number | null; brier_model: number | null }>;
}): string | undefined {
  if (input.resolved_count === 0 || input.recent.length === 0) return undefined;
  const lines = [
    `${input.resolved_count} resolved forecasts. Mean Brier: you ${fmt(input.mean_brier_model)} vs market ${fmt(input.mean_brier_market)} (lower is better).`,
    ...input.recent.map((row) =>
      `- "${row.question.length <= 90 ? row.question : `${row.question.slice(0, 89)}…`}" you ${row.probability.toFixed(2)}, market ${row.yes_price.toFixed(2)}, resolved ${row.winning_outcome_index === 0 ? "YES" : "NO"} (your Brier ${fmt(row.brier_model)})`),
  ];
  return lines.join("\n");
}

function fmt(value: number | null): string {
  return value === null ? "n/a" : value.toFixed(3);
}

/** Tolerates fenced or prose-wrapped JSON; clamps and validates the result. */
export function parseAnalystForecast(raw: string): AnalystForecast | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as Record<string, unknown>;
  const probability = typeof record.probability === "number" ? record.probability : Number(record.probability);
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) return null;
  const confidence = record.confidence === "high" || record.confidence === "medium" ? record.confidence : "low";
  const rationale = typeof record.rationale === "string" ? record.rationale.trim() : "";
  if (!rationale) return null;
  return { probability: Math.min(0.99, Math.max(0.01, probability)), confidence, rationale: truncate(rationale, 600) };
}

export type AnalystBetDecision = {
  side: "YES" | "NO";
  outcome_index: 0 | 1;
  edge: number;
} | null;

/** Bet the side whose executable ask the model's estimate beats by the edge
 * threshold. Low-confidence forecasts never bet — they still get graded. */
export function decideAnalystBet(input: {
  probability: number;
  confidence: AnalystConfidence;
  yesAsk: number | null;
  noAsk: number | null;
}): AnalystBetDecision {
  if (input.confidence === "low") return null;
  const yesEdge = input.yesAsk !== null && input.yesAsk > 0 && input.yesAsk < 1 ? input.probability - input.yesAsk : -Infinity;
  const noEdge = input.noAsk !== null && input.noAsk > 0 && input.noAsk < 1 ? 1 - input.probability - input.noAsk : -Infinity;
  const best = yesEdge >= noEdge
    ? { side: "YES" as const, outcome_index: 0 as const, edge: yesEdge }
    : { side: "NO" as const, outcome_index: 1 as const, edge: noEdge };
  return best.edge >= POLYMARKET_ANALYST_EDGE_MIN ? best : null;
}

export function brierScore(probability: number, yesWon: boolean): number {
  const outcome = yesWon ? 1 : 0;
  return (probability - outcome) ** 2;
}

export function selectAnalystCandidates(
  markets: PolymarketMarket[],
  options: { recentlyForecastedMarketIds: Set<string>; openPositionMarketIds: Set<string>; nowMs?: number },
): PolymarketMarket[] {
  const nowMs = options.nowMs ?? Date.now();
  return markets
    .filter((market) => {
      if (!market.accepting_orders || !market.order_book_enabled || market.neg_risk || market.fees_enabled) return false;
      if (market.outcomes.length !== 2 || market.token_ids.length !== 2 || market.outcome_prices.length !== 2) return false;
      if (market.liquidity_usd < MIN_LIQUIDITY_USD) return false;
      if (!market.end_date) return false;
      const endMs = Date.parse(market.end_date);
      if (!Number.isFinite(endMs) || endMs - nowMs < MIN_HORIZON_MS || endMs - nowMs > MAX_HORIZON_MS) return false;
      const yes = market.outcome_prices[0];
      if (!Number.isFinite(yes) || yes < 0.05 || yes > 0.95) return false;
      if (options.recentlyForecastedMarketIds.has(market.id)) return false;
      if (options.openPositionMarketIds.has(market.id)) return false;
      return true;
    })
    .sort((a, b) => b.volume_24h_usd - a.volume_24h_usd)
    .slice(0, MAX_FORECASTS_PER_CYCLE);
}

/** Gamma market descriptions are fetched on demand for just the markets being
 * priced, so the cached snapshot and brain journal stay lean. */
async function fetchMarketDescriptions(marketIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(marketIds)].filter((id) => /^\d+$/.test(id)).slice(0, MAX_FORECASTS_PER_CYCLE);
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const url = new URL("https://gamma-api.polymarket.com/markets");
  url.searchParams.set("limit", String(ids.length));
  for (const id of ids) url.searchParams.append("id", id);
  const response = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json", "User-Agent": "MasterMold/0.1 (local Polymarket analyst)" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Polymarket Gamma description read returned ${response.status}.`);
  const body = await response.json() as unknown;
  if (!Array.isArray(body)) return out;
  for (const item of body) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const id = typeof raw.id === "string" ? raw.id : typeof raw.id === "number" ? String(raw.id) : "";
    const description = typeof raw.description === "string" ? raw.description : "";
    if (id) out.set(id, description);
  }
  return out;
}

async function openrouterCompletion(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured.");
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:4002",
      "X-OpenRouter-Title": "Master Mold Analyst",
    },
    signal: AbortSignal.timeout(90_000),
    body: JSON.stringify({
      model: polymarketAnalystModel(),
      max_tokens: 700,
      temperature: 0.1,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });
  if (!response.ok) throw new Error(`OpenRouter HTTP ${response.status}`);
  const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("OpenRouter returned an empty completion.");
  return content;
}

class PolymarketAnalystStore {
  private readonly db: SqliteDatabase;

  constructor(path: string) {
    this.db = openPolymarketSqlite(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS polymarket_analyst_forecasts (
        id TEXT PRIMARY KEY,
        ts TEXT NOT NULL,
        market_id TEXT NOT NULL,
        question TEXT NOT NULL,
        slug TEXT NOT NULL,
        end_date TEXT,
        yes_price REAL NOT NULL,
        yes_ask REAL,
        no_ask REAL,
        model TEXT NOT NULL,
        probability REAL NOT NULL,
        confidence TEXT NOT NULL,
        rationale TEXT NOT NULL,
        side TEXT,
        edge REAL,
        bet INTEGER NOT NULL DEFAULT 0,
        position_id TEXT,
        stake_usd REAL,
        entry_price REAL,
        status TEXT NOT NULL DEFAULT 'pending',
        winning_outcome_index INTEGER,
        resolved_at TEXT,
        brier_model REAL,
        brier_market REAL
      );
      CREATE INDEX IF NOT EXISTS idx_polymarket_analyst_forecasts_status
        ON polymarket_analyst_forecasts(status, ts DESC);
      CREATE INDEX IF NOT EXISTS idx_polymarket_analyst_forecasts_market
        ON polymarket_analyst_forecasts(market_id, ts DESC);
      CREATE TABLE IF NOT EXISTS polymarket_analyst_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  lastCycleAt(): string | null {
    const row = this.db.prepare("SELECT value FROM polymarket_analyst_meta WHERE key = 'last_cycle_at'").get() as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  markCycle(ts: string) {
    this.db.prepare(
      "INSERT INTO polymarket_analyst_meta (key, value) VALUES ('last_cycle_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run(ts);
  }

  insertForecast(row: AnalystForecastRow) {
    this.db.prepare(`
      INSERT INTO polymarket_analyst_forecasts (
        id, ts, market_id, question, slug, end_date, yes_price, yes_ask, no_ask, model,
        probability, confidence, rationale, side, edge, bet, position_id, stake_usd, entry_price,
        status, winning_outcome_index, resolved_at, brier_model, brier_market
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      row.id, row.ts, row.market_id, row.question, row.slug, row.end_date, row.yes_price, row.yes_ask,
      row.no_ask, row.model, row.probability, row.confidence, row.rationale, row.side, row.edge, row.bet,
      row.position_id, row.stake_usd, row.entry_price, row.status, row.winning_outcome_index, row.resolved_at,
      row.brier_model, row.brier_market,
    );
  }

  pendingMarketIds(limit = 50): string[] {
    const rows = this.db.prepare(
      "SELECT DISTINCT market_id FROM polymarket_analyst_forecasts WHERE status = 'pending' ORDER BY ts ASC LIMIT ?",
    ).all(limit) as Array<{ market_id: string }>;
    return rows.map((row) => row.market_id);
  }

  resolvedTrackRecord(limit = 8): Array<{ question: string; probability: number; yes_price: number; winning_outcome_index: number | null; brier_model: number | null }> {
    return this.db.prepare(
      "SELECT question, probability, yes_price, winning_outcome_index, brier_model FROM polymarket_analyst_forecasts WHERE status = 'resolved' ORDER BY resolved_at DESC LIMIT ?",
    ).all(limit) as Array<{ question: string; probability: number; yes_price: number; winning_outcome_index: number | null; brier_model: number | null }>;
  }

  recentlyForecastedMarketIds(sinceIso: string): Set<string> {
    const rows = this.db.prepare(
      "SELECT DISTINCT market_id FROM polymarket_analyst_forecasts WHERE ts >= ?",
    ).all(sinceIso) as Array<{ market_id: string }>;
    return new Set(rows.map((row) => row.market_id));
  }

  gradeResolution(marketId: string, winningOutcomeIndex: number | null, status: "resolved" | "invalid", resolvedAt: string) {
    const rows = this.db.prepare(
      "SELECT id, probability, yes_price FROM polymarket_analyst_forecasts WHERE market_id = ? AND status = 'pending'",
    ).all(marketId) as Array<{ id: string; probability: number; yes_price: number }>;
    for (const row of rows) {
      if (status === "resolved" && winningOutcomeIndex !== null) {
        const yesWon = winningOutcomeIndex === 0;
        this.db.prepare(
          "UPDATE polymarket_analyst_forecasts SET status = 'resolved', winning_outcome_index = ?, resolved_at = ?, brier_model = ?, brier_market = ? WHERE id = ?",
        ).run(winningOutcomeIndex, resolvedAt, brierScore(row.probability, yesWon), brierScore(row.yes_price, yesWon), row.id);
      } else {
        this.db.prepare(
          "UPDATE polymarket_analyst_forecasts SET status = 'invalid', resolved_at = ? WHERE id = ?",
        ).run(resolvedAt, row.id);
      }
    }
    return rows.length;
  }

  report(model: string, enabled: boolean, limit = 10): AnalystReport {
    const totals = this.db.prepare(`
      SELECT
        COUNT(*) AS forecast_count,
        SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved_count,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
        SUM(bet) AS bet_count,
        AVG(CASE WHEN status = 'resolved' THEN brier_model END) AS mean_brier_model,
        AVG(CASE WHEN status = 'resolved' THEN brier_market END) AS mean_brier_market
      FROM polymarket_analyst_forecasts
    `).get() as {
      forecast_count: number;
      resolved_count: number | null;
      pending_count: number | null;
      bet_count: number | null;
      mean_brier_model: number | null;
      mean_brier_market: number | null;
    };
    const pnl = this.db.prepare(
      "SELECT COALESCE(SUM(pnl_usd), 0) AS realized FROM polymarket_paper_trades WHERE tier = 'analyst' AND event = 'close'",
    ).get() as { realized: number };
    const recent = this.db.prepare(
      "SELECT * FROM polymarket_analyst_forecasts ORDER BY ts DESC LIMIT ?",
    ).all(limit) as AnalystForecastRow[];
    const resolved = totals.resolved_count ?? 0;
    return {
      enabled,
      model,
      forecast_count: totals.forecast_count,
      resolved_count: resolved,
      pending_count: totals.pending_count ?? 0,
      bet_count: totals.bet_count ?? 0,
      mean_brier_model: round4(totals.mean_brier_model),
      mean_brier_market: round4(totals.mean_brier_market),
      realized_pnl_usd: Math.round(pnl.realized * 100) / 100,
      last_cycle_at: this.lastCycleAt(),
      recent_forecasts: recent,
      gate: {
        target_resolved: 50,
        detail: `Live-money discussion requires >= 50 resolved forecasts (${resolved} so far), mean model Brier <= market Brier, and positive realized analyst paper P&L.`,
      },
    };
  }
}

let singleton: PolymarketAnalystStore | null = null;
let singletonPath = "";
const TEST_DB_PATH = join(tmpdir(), `mastermold-polymarket-analyst-${process.pid}-${randomUUID()}.db`);

export function polymarketAnalystStore(): PolymarketAnalystStore {
  const path = process.env.POLYMARKET_BRAIN_DB ?? (process.env.NODE_ENV === "test"
    ? TEST_DB_PATH
    : join(/* turbopackIgnore: true */ process.cwd(), ".data", "polymarket-brain.db"));
  if (!singleton || singletonPath !== path) {
    singleton = new PolymarketAnalystStore(path);
    singletonPath = path;
  }
  return singleton;
}

export function safePolymarketAnalystReport(): AnalystReport {
  try {
    return polymarketAnalystStore().report(polymarketAnalystModel(), polymarketAnalystEnabled());
  } catch {
    return {
      enabled: polymarketAnalystEnabled(),
      model: polymarketAnalystModel(),
      forecast_count: 0,
      resolved_count: 0,
      pending_count: 0,
      bet_count: 0,
      mean_brier_model: null,
      mean_brier_market: null,
      realized_pnl_usd: 0,
      last_cycle_at: null,
      recent_forecasts: [],
      gate: { target_resolved: 50, detail: "Analyst store is unavailable." },
    };
  }
}

let cycleInFlight = false;

export async function runPolymarketAnalystCycle(
  trigger: "scheduled" | "manual" = "scheduled",
  completion: AnalystCompletionFn = openrouterCompletion,
): Promise<{ action: "idle" | "graded-only" | "forecasted" | "error"; detail: string }> {
  if (!polymarketAnalystEnabled()) return { action: "idle", detail: "Analyst lane is not enabled (POLYMARKET_ANALYST=1)." };
  // Manual triggers and the scheduler share one process; overlapping cycles
  // would double-forecast the same markets (observed at first boot).
  if (cycleInFlight) return { action: "idle", detail: "An analyst cycle is already running." };
  cycleInFlight = true;
  try {
    return await runCycleLocked(trigger, completion);
  } finally {
    cycleInFlight = false;
  }
}

async function runCycleLocked(
  trigger: "scheduled" | "manual",
  completion: AnalystCompletionFn,
): Promise<{ action: "idle" | "graded-only" | "forecasted" | "error"; detail: string }> {
  const analystStore = polymarketAnalystStore();
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  let graded = 0;
  const pendingIds = analystStore.pendingMarketIds();
  if (pendingIds.length > 0) {
    try {
      for (const resolution of await fetchPolymarketResolutions(pendingIds)) {
        graded += analystStore.gradeResolution(
          resolution.market_id,
          resolution.winning_outcome_index,
          resolution.status,
          resolution.closed_at ?? nowIso,
        );
      }
    } catch {
      // Grading retries next cycle; a Gamma hiccup must not block new forecasts.
    }
  }

  const cycleHours = Number(process.env.POLYMARKET_ANALYST_CYCLE_HOURS) || DEFAULT_CYCLE_HOURS;
  const lastCycleAt = analystStore.lastCycleAt();
  if (trigger !== "manual" && lastCycleAt && nowMs - Date.parse(lastCycleAt) < cycleHours * 60 * 60 * 1_000) {
    return { action: "graded-only", detail: `Graded ${graded} resolutions; next forecast batch is not due yet.` };
  }

  let snapshot;
  try {
    snapshot = await fetchPolymarketMarkets(true);
  } catch (error) {
    return { action: "error", detail: error instanceof Error ? error.message : "Polymarket market read failed." };
  }
  if (snapshot.source !== "live") {
    return { action: "graded-only", detail: `Graded ${graded} resolutions; a live market read is required for new forecasts.` };
  }

  const store = polymarketStore();
  const openMarketIds = new Set(store.positions().map((position) => position.market_id));
  const candidates = selectAnalystCandidates(snapshot.markets, {
    recentlyForecastedMarketIds: analystStore.recentlyForecastedMarketIds(new Date(nowMs - REFORECAST_COOLDOWN_MS).toISOString()),
    openPositionMarketIds: openMarketIds,
    nowMs,
  });
  if (candidates.length === 0) {
    analystStore.markCycle(nowIso);
    return { action: "graded-only", detail: `Graded ${graded} resolutions; no market passed the analyst candidate filters.` };
  }

  let descriptions = new Map<string, string>();
  try {
    descriptions = await fetchMarketDescriptions(candidates.map((market) => market.id));
  } catch {
    // Forecasting proceeds on question text alone rather than skipping the cycle.
  }

  let books = new Map<string, ReturnType<typeof summarizePolymarketBook>>();
  try {
    const rawBooks = await fetchPolymarketOrderBooks(candidates.flatMap((market) => market.token_ids), true);
    books = new Map([...rawBooks.entries()].map(([token, book]) => [token, summarizePolymarketBook(book)]));
  } catch {
    // Without books the lane still forecasts (calibration data) but cannot bet.
  }

  const model = polymarketAnalystModel();
  let trackRecord: string | undefined;
  try {
    const summary = analystStore.report(model, true, 0);
    trackRecord = formatAnalystTrackRecord({
      resolved_count: summary.resolved_count,
      mean_brier_model: summary.mean_brier_model,
      mean_brier_market: summary.mean_brier_market,
      recent: analystStore.resolvedTrackRecord(),
    });
  } catch {
    // A summary failure only omits self-review context from this batch.
  }
  let forecasts = 0;
  let bets = 0;
  for (const market of candidates) {
    let raw: string;
    try {
      raw = await completion(
        ANALYST_FORECAST_SYSTEM_PROMPT,
        buildAnalystForecastPrompt({
          question: market.question,
          description: descriptions.get(market.id) ?? "",
          endDate: market.end_date,
          yesPrice: market.outcome_prices[0],
          nowIso,
          trackRecord,
        }),
      );
    } catch {
      continue;
    }
    const forecast = parseAnalystForecast(raw);
    if (!forecast) continue;

    const yesBook = books.get(market.token_ids[0]);
    const noBook = books.get(market.token_ids[1]);
    const yesAsk = yesBook?.best_ask ?? null;
    const noAsk = noBook?.best_ask ?? null;
    const decision = decideAnalystBet({ probability: forecast.probability, confidence: forecast.confidence, yesAsk, noAsk });

    const row: AnalystForecastRow = {
      id: randomUUID(),
      ts: new Date().toISOString(),
      market_id: market.id,
      question: market.question,
      slug: market.slug,
      end_date: market.end_date,
      yes_price: market.outcome_prices[0],
      yes_ask: yesAsk,
      no_ask: noAsk,
      model,
      probability: forecast.probability,
      confidence: forecast.confidence,
      rationale: forecast.rationale,
      side: decision?.side ?? null,
      edge: decision ? round4(decision.edge) : null,
      bet: 0,
      position_id: null,
      stake_usd: null,
      entry_price: null,
      status: "pending",
      winning_outcome_index: null,
      resolved_at: null,
      brier_model: null,
      brier_market: null,
    };

    if (decision && hasPolymarketEntryHorizon(market, nowMs)) {
      const openAnalyst = store.positions().filter((position) => position.tier === "analyst").length;
      const state = store.state();
      const stake = Math.min(POLYMARKET_ANALYST_STAKE_USD, state.caps.max_trade_usd);
      const rawBook = openAnalyst < POLYMARKET_ANALYST_MAX_OPEN
        ? (await fetchPolymarketOrderBooks([market.token_ids[decision.outcome_index]], false)).get(market.token_ids[decision.outcome_index])
        : undefined;
      const quote = rawBook ? quotePolymarketPaperBuy(rawBook, stake) : null;
      if (quote) {
        const account = store.account(snapshot.markets);
        const policy = validatePolymarketPaperEntry({
          state,
          positions: store.positions(),
          market_id: market.id,
          outcome_index: decision.outcome_index,
          stake_usd: stake,
          entry_price: quote.average_price,
          available_cash_usd: account.cash_usd,
          realized_today_usd: account.realized_today_usd,
        });
        if (policy.ok) {
          const position = store.openPosition({
            market_id: market.id,
            token_id: market.token_ids[decision.outcome_index],
            question: market.question,
            slug: market.slug,
            outcome_index: decision.outcome_index,
            outcome: market.outcomes[decision.outcome_index],
            stake_usd: stake,
            entry_price: quote.average_price,
            strategy_id: "analyst",
            tier: "analyst",
            thesis: `Analyst ${decision.side} at model p=${forecast.probability.toFixed(2)} vs ask ${(decision.side === "YES" ? yesAsk : noAsk)?.toFixed(2)} (edge ${(decision.edge * 100).toFixed(0)}pt, ${forecast.confidence} confidence). Holds to resolution. ${forecast.rationale}`,
          });
          row.bet = 1;
          row.position_id = position.id;
          row.stake_usd = stake;
          row.entry_price = quote.average_price;
          bets += 1;
          try {
            polymarketBrain().recordPaperTrade({
              event: "open",
              position_id: position.id,
              strategy_id: "analyst",
              tier: "analyst",
              market_id: market.id,
              token_id: position.token_id,
              outcome: position.outcome,
              question: market.question,
              slug: market.slug,
              price: quote.average_price,
              stake_usd: stake,
              pnl_usd: null,
              reason: position.thesis,
            });
          } catch {
            // The JSON store remains the fallback record; a ledger write failure must not block the entry.
          }
          notifyOperator(
            "entry",
            `Polymarket analyst buy ${position.outcome} $${stake.toFixed(2)} at ${(quote.average_price * 100).toFixed(1)}¢ · model p=${forecast.probability.toFixed(2)}, edge ${(decision.edge * 100).toFixed(0)}pt · ${truncate(market.question, 80)}`,
          );
        }
      }
    }

    analystStore.insertForecast(row);
    forecasts += 1;
  }

  analystStore.markCycle(nowIso);
  return {
    action: "forecasted",
    detail: `Recorded ${forecasts} forecast${forecasts === 1 ? "" : "s"} (${bets} bet${bets === 1 ? "" : "s"}), graded ${graded} resolution${graded === 1 ? "" : "s"}.`,
  };
}

function truncate(value: string, max: number) {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function round4(value: number | null): number | null {
  return value === null ? null : Math.round(value * 10_000) / 10_000;
}

export function __resetPolymarketAnalystStoreForTests() {
  singleton = null;
  singletonPath = "";
}
