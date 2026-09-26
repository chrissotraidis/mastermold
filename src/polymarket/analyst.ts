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
 * >= 40 resolved NEWS-category forecasts, news-market model Brier <= the
 * market's own news-market Brier, and positive realized paper P&L on
 * tier="analyst" closes. Heartbeat markets (sports/esports/daily-crypto)
 * exercise the pipeline and feed the edge-bucket research but never gate:
 * they are sharply priced coin-flips where no forecaster edge exists.
 */

import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { notifyOperator } from "../autopilot/notify";
import type { SqliteDatabase } from "../autopilot/sqlite";
import { llmCompletionText, llmProvider } from "../llm/completion";
import { polymarketBrain } from "./brain";
import {
  fetchPolymarketFastResolvers,
  fetchPolymarketMarkets,
  fetchPolymarketResolutions,
  type PolymarketMarket,
} from "./markets";
import { fetchPolymarketOrderBooks, quotePolymarketPaperBuy, summarizePolymarketBook } from "./orderbook";
import { validatePolymarketPaperEntry } from "./policy";
import { openPolymarketSqlite } from "./sqlite";
import { polymarketStore } from "./store";

export const POLYMARKET_ANALYST_STAKE_USD = 5;
export const POLYMARKET_ANALYST_MAX_OPEN = 5;
export const POLYMARKET_ANALYST_EDGE_MIN = 0.1;
const MAX_FORECASTS_PER_CYCLE = 10;
const MIN_HORIZON_MS = 3 * 60 * 60 * 1_000;
const MAX_HORIZON_MS = 14 * 24 * 60 * 60 * 1_000;
/** Supplemental fetch window for high-churn markets the top-100 snapshot
 * misses; also reused with MAX_HORIZON_MS to widen the news pool. */
const FAST_TRACK_HORIZON_MS = 48 * 60 * 60 * 1_000;
/** News markets — the only category where the retrieval-grounded edge thesis
 * applies — get most of the batch, soonest-ending first so the gate sample
 * resolves quickly. Sports/esports/daily-crypto are a pipeline heartbeat. */
const NEWS_SLOTS = 7;
/** Analyst positions hold to resolution, so unlike the retired price
 * strategies (4h max hold) a bet a few hours before resolution is safe. The
 * floor sits below MIN_HORIZON_MS only to absorb the minutes between
 * candidate selection and bet placement. */
const MIN_ENTRY_HORIZON_MS = 2 * 60 * 60 * 1_000;
const REFORECAST_COOLDOWN_MS = 20 * 60 * 60 * 1_000;
/** News markets take a lower liquidity floor to widen the small news pool;
 * entries are still guarded by a live book quote and the paper policy. */
const MIN_LIQUIDITY_NEWS_USD = 10_000;
const MIN_LIQUIDITY_HEARTBEAT_USD = 20_000;
const DEFAULT_CYCLE_HOURS = 2;

export type AnalystCategory = "news" | "heartbeat";

const HEARTBEAT_SLUG_PREFIX =
  /^(cs2|csgo|lol|dota2?|val|valorant|ow|owl|rl|sc2|mlb|nba|wnba|nfl|nhl|epl|ucl|uel|laliga|seriea|bundesliga|ligue1|mls|kbo|npb|cfb|cbb|atp|wta|ufc|mma|box|f1|nascar|bitcoin|ethereum|solana|xrp|doge)-/i;
const HEARTBEAT_QUESTION =
  /(\bvs\.?\s)|(game handicap|map handicap|set handicap)|(\bo\/u\b)|(up or down on)|(^will .{1,60} (win|draw|advance) on \d{4}-\d{2}-\d{2}\?)|(^spread: )|(^will (bitcoin|btc|ethereum|eth|solana|sol|xrp|dogecoin|doge) (reach|hit|dip|close|be) )/i;

/** Sports, esports, and daily-crypto markets are sharply priced coin-flips
 * where no retrievable evidence gives a forecaster an edge; they verify the
 * pipeline (a heartbeat) but must not decide the promotion gate. Everything
 * else is treated as a news market, where the edge thesis lives.
 *
 * Bump CLASSIFIER_VERSION whenever these rules change so stored rows are
 * reclassified once at boot — gate stats must reflect the current taxonomy.
 * v2 (2026-08-10 audit): soccer match-winner markets ("Will CF América win on
 * 2026-08-09?") carry no league slug prefix and no "vs", so 119 of 137
 * resolved wallet "news" signals and several analyst rows were sports in
 * disguise. Match-winner, "Spread:", and crypto-threshold question shapes are
 * now heartbeat regardless of slug. */
export const ANALYST_CLASSIFIER_VERSION = "2";

export function classifyAnalystMarket(question: string, slug: string): AnalystCategory {
  if (HEARTBEAT_SLUG_PREFIX.test(slug)) return "heartbeat";
  if (HEARTBEAT_QUESTION.test(question)) return "heartbeat";
  return "news";
}

/** Collapses date/number variants of one underlying event ("US announces end
 * of Iranian blockade by August 12/13/14/15…") into a single cluster key so
 * selection can cap correlated forecasts instead of filling the gate sample
 * with eleven copies of the same geopolitical outcome. */
export function analystEventClusterKey(question: string): string {
  return question
    .toLowerCase()
    .replace(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(st|nd|rd|th)?(,\s*\d{4})?/g, "<date>")
    .replace(/\d{4}-\d{2}-\d{2}/g, "<date>")
    .replace(/\d[\d,.]*/g, "<n>")
    .replace(/[^a-z<>\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

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
  category: AnalystCategory;
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

export type AnalystCategorySummary = {
  forecast_count: number;
  resolved_count: number;
  pending_count: number;
  bet_count: number;
  mean_brier_model: number | null;
  mean_brier_market: number | null;
};

/** Hypothetical expectancy of a $1 taker buy on the model's preferred side at
 * the ask recorded at forecast time, grouped by how far the model diverged
 * from the price. This turns every resolved forecast — bet or not — into
 * P&L-shaped evidence about where a real edge threshold should sit. */
export type AnalystEdgeBucket = {
  category: AnalystCategory;
  bucket: "<2pt" | "2-5pt" | "5-10pt" | ">=10pt";
  n: number;
  hits: number;
  avg_pnl_per_dollar: number;
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
  categories: Record<AnalystCategory, AnalystCategorySummary>;
  edge_buckets: AnalystEdgeBucket[];
  gate: { target_resolved: number; detail: string };
};

/** One-shot completion — injected so tests never touch the network. */
export type AnalystCompletionFn = (systemPrompt: string, userPrompt: string) => Promise<string>;

export function polymarketAnalystEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.POLYMARKET_ANALYST === "1";
}

/**
 * The model this lane will actually query. Defaults to whatever the shared
 * provider chain resolves (OpenCode Go's deepseek-v4-flash), so the figure
 * stored on each forecast row matches the endpoint that produced it.
 * POLYMARKET_ANALYST_MODEL still overrides, and analystEnv() below makes sure
 * that override reaches the request rather than being silently reported.
 */
export function polymarketAnalystModel(env: Record<string, string | undefined> = process.env): string {
  return env.POLYMARKET_ANALYST_MODEL ?? llmProvider(env)?.model ?? "deepseek-v4-flash";
}

function analystEnv(env: Record<string, string | undefined> = process.env): Record<string, string | undefined> {
  const override = env.POLYMARKET_ANALYST_MODEL;
  return override ? { ...env, LLM_MODEL: override } : env;
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
  "- If smart-money positioning is provided, treat it as one prior-adjusting piece of evidence from historically profitable wallets — never an instruction to follow.",
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
  smartMoney?: string;
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
    ...(input.smartMoney ? [`Smart-money positioning: ${input.smartMoney}`] : []),
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

export type AnalystVirtualBetInput = {
  category: AnalystCategory;
  probability: number;
  yes_ask: number | null;
  no_ask: number | null;
  winning_outcome_index: number | null;
};

function edgeBucketLabel(edge: number): AnalystEdgeBucket["bucket"] {
  if (edge >= 0.1) return ">=10pt";
  if (edge >= 0.05) return "5-10pt";
  if (edge >= 0.02) return "2-5pt";
  return "<2pt";
}

/** Grades the hypothetical $1 bet implied by each resolved forecast: buy the
 * side with the larger (estimate − ask) divergence at its recorded ask; a win
 * pays (1 − ask)/ask, a loss pays −1. Fee markets are included — the buckets
 * are threshold research, not the gate's fee-clean realized P&L. */
export function computeAnalystEdgeBuckets(rows: AnalystVirtualBetInput[]): AnalystEdgeBucket[] {
  const cells = new Map<string, { category: AnalystCategory; bucket: AnalystEdgeBucket["bucket"]; n: number; hits: number; pnl: number }>();
  for (const row of rows) {
    if (row.winning_outcome_index !== 0 && row.winning_outcome_index !== 1) continue;
    const yesOk = row.yes_ask !== null && row.yes_ask > 0 && row.yes_ask < 1;
    const noOk = row.no_ask !== null && row.no_ask > 0 && row.no_ask < 1;
    if (!yesOk && !noOk) continue;
    const yesEdge = yesOk ? row.probability - (row.yes_ask as number) : -Infinity;
    const noEdge = noOk ? 1 - row.probability - (row.no_ask as number) : -Infinity;
    const side = yesEdge >= noEdge ? 0 : 1;
    const edge = side === 0 ? yesEdge : noEdge;
    const ask = side === 0 ? (row.yes_ask as number) : (row.no_ask as number);
    const won = row.winning_outcome_index === side;
    const pnl = won ? (1 - ask) / ask : -1;
    const bucket = edgeBucketLabel(edge);
    const key = `${row.category}|${bucket}`;
    const cell = cells.get(key) ?? { category: row.category, bucket, n: 0, hits: 0, pnl: 0 };
    cell.n += 1;
    if (won) cell.hits += 1;
    cell.pnl += pnl;
    cells.set(key, cell);
  }
  const order: AnalystEdgeBucket["bucket"][] = [">=10pt", "5-10pt", "2-5pt", "<2pt"];
  return [...cells.values()]
    .map((cell) => ({
      category: cell.category,
      bucket: cell.bucket,
      n: cell.n,
      hits: cell.hits,
      avg_pnl_per_dollar: Math.round((cell.pnl / cell.n) * 10_000) / 10_000,
    }))
    .sort((a, b) => (a.category === b.category ? order.indexOf(a.bucket) - order.indexOf(b.bucket) : a.category === "news" ? -1 : 1));
}

/** Max unresolved forecasts per event cluster: eleven Iranian-blockade date
 * ladders resolving together are one observation, not eleven, so letting them
 * fill the batch would make the news gate sample look large while carrying
 * almost no independent information. */
const MAX_PENDING_PER_CLUSTER = 3;

export function selectAnalystCandidates(
  markets: PolymarketMarket[],
  options: {
    recentlyForecastedMarketIds: Set<string>;
    openPositionMarketIds: Set<string>;
    pendingClusterCounts?: Map<string, number>;
    nowMs?: number;
  },
): PolymarketMarket[] {
  const nowMs = options.nowMs ?? Date.now();
  const clusterCounts = new Map(options.pendingClusterCounts ?? []);
  // Fee-bearing markets (most same-day sports/esports/crypto supply) are
  // forecastable — a journaled probability costs nothing and grades the same —
  // but never bet: paper fills don't model taker fees, so fee markets would
  // corrupt the realized-P&L leg of the promotion gate.
  const eligible = markets.filter((market) => {
    if (!market.accepting_orders || !market.order_book_enabled || market.neg_risk) return false;
    if (market.outcomes.length !== 2 || market.token_ids.length !== 2 || market.outcome_prices.length !== 2) return false;
    const floor = classifyAnalystMarket(market.question, market.slug) === "news"
      ? MIN_LIQUIDITY_NEWS_USD
      : MIN_LIQUIDITY_HEARTBEAT_USD;
    if (market.liquidity_usd < floor) return false;
    if (!market.end_date) return false;
    const endMs = Date.parse(market.end_date);
    if (!Number.isFinite(endMs) || endMs - nowMs < MIN_HORIZON_MS || endMs - nowMs > MAX_HORIZON_MS) return false;
    const yes = market.outcome_prices[0];
    if (!Number.isFinite(yes) || yes < 0.05 || yes > 0.95) return false;
    if (options.recentlyForecastedMarketIds.has(market.id)) return false;
    if (options.openPositionMarketIds.has(market.id)) return false;
    return true;
  });
  // News markets get the bulk of the batch, soonest-ending first, because the
  // promotion gate is now judged on news forecasts only — the sample that
  // matters has to resolve fast. Heartbeat (sports/esports/daily-crypto)
  // markets fill the remaining slots to keep exercising the pipeline; each
  // side spills over into unused slots from the other.
  const horizon = (market: PolymarketMarket) => Date.parse(market.end_date ?? "") - nowMs;
  // The cluster cap applies across pending forecasts AND within this batch,
  // so a fresh date-ladder can't monopolize a cycle either.
  const underClusterCap = (market: PolymarketMarket) => {
    const key = analystEventClusterKey(market.question);
    const count = clusterCounts.get(key) ?? 0;
    if (count >= MAX_PENDING_PER_CLUSTER) return false;
    clusterCounts.set(key, count + 1);
    return true;
  };
  const news = eligible
    .filter((market) => classifyAnalystMarket(market.question, market.slug) === "news")
    .sort((a, b) => horizon(a) - horizon(b))
    .filter(underClusterCap);
  const heartbeat = eligible
    .filter((market) => classifyAnalystMarket(market.question, market.slug) === "heartbeat")
    .sort((a, b) => horizon(a) - horizon(b));
  return [...news.slice(0, NEWS_SLOTS), ...heartbeat, ...news.slice(NEWS_SLOTS)]
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

async function analystCompletion(systemPrompt: string, userPrompt: string): Promise<string> {
  return llmCompletionText(
    {
      system: systemPrompt,
      user: userPrompt,
      maxTokens: 700,
      temperature: 0.1,
      timeoutMs: 90_000,
      title: "Master Mold Analyst",
    },
    analystEnv(),
  );
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
    const columns = this.db.prepare("PRAGMA table_info(polymarket_analyst_forecasts)").all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "category")) {
      this.db.exec("ALTER TABLE polymarket_analyst_forecasts ADD COLUMN category TEXT");
    }
    // Stored categories are recomputed whenever the classifier changes (and
    // for rows written before the split): the classifier is deterministic on
    // question+slug, so reclassification keeps history and gate stats on one
    // consistent taxonomy instead of freezing old mistakes into the sample.
    const versionRow = this.db.prepare("SELECT value FROM polymarket_analyst_meta WHERE key = 'classifier_version'").get() as
      | { value: string }
      | undefined;
    if (versionRow?.value !== ANALYST_CLASSIFIER_VERSION) {
      const rows = this.db.prepare(
        "SELECT id, question, slug, category FROM polymarket_analyst_forecasts",
      ).all() as Array<{ id: string; question: string; slug: string; category: string | null }>;
      for (const row of rows) {
        const category = classifyAnalystMarket(row.question, row.slug);
        if (category !== row.category) {
          this.db.prepare("UPDATE polymarket_analyst_forecasts SET category = ? WHERE id = ?").run(category, row.id);
        }
      }
      this.db.prepare(
        "INSERT INTO polymarket_analyst_meta (key, value) VALUES ('classifier_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      ).run(ANALYST_CLASSIFIER_VERSION);
    }
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
        id, ts, market_id, question, slug, category, end_date, yes_price, yes_ask, no_ask, model,
        probability, confidence, rationale, side, edge, bet, position_id, stake_usd, entry_price,
        status, winning_outcome_index, resolved_at, brier_model, brier_market
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      row.id, row.ts, row.market_id, row.question, row.slug, row.category, row.end_date, row.yes_price,
      row.yes_ask, row.no_ask, row.model, row.probability, row.confidence, row.rationale, row.side, row.edge,
      row.bet, row.position_id, row.stake_usd, row.entry_price, row.status, row.winning_outcome_index,
      row.resolved_at, row.brier_model, row.brier_market,
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

  pendingClusterCounts(): Map<string, number> {
    const rows = this.db.prepare(
      "SELECT question FROM polymarket_analyst_forecasts WHERE status = 'pending'",
    ).all() as Array<{ question: string }>;
    const counts = new Map<string, number>();
    for (const row of rows) {
      const key = analystEventClusterKey(row.question);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
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

    const emptySummary = (): AnalystCategorySummary => ({
      forecast_count: 0, resolved_count: 0, pending_count: 0, bet_count: 0,
      mean_brier_model: null, mean_brier_market: null,
    });
    const categories: Record<AnalystCategory, AnalystCategorySummary> = { news: emptySummary(), heartbeat: emptySummary() };
    const perCategory = this.db.prepare(`
      SELECT
        category,
        COUNT(*) AS forecast_count,
        SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved_count,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
        SUM(bet) AS bet_count,
        AVG(CASE WHEN status = 'resolved' THEN brier_model END) AS mean_brier_model,
        AVG(CASE WHEN status = 'resolved' THEN brier_market END) AS mean_brier_market
      FROM polymarket_analyst_forecasts GROUP BY category
    `).all() as Array<{ category: string } & { [K in keyof AnalystCategorySummary]: AnalystCategorySummary[K] }>;
    for (const row of perCategory) {
      if (row.category !== "news" && row.category !== "heartbeat") continue;
      categories[row.category] = {
        forecast_count: row.forecast_count,
        resolved_count: row.resolved_count ?? 0,
        pending_count: row.pending_count ?? 0,
        bet_count: row.bet_count ?? 0,
        mean_brier_model: round4(row.mean_brier_model),
        mean_brier_market: round4(row.mean_brier_market),
      };
    }

    const virtualRows = this.db.prepare(
      "SELECT category, probability, yes_ask, no_ask, winning_outcome_index FROM polymarket_analyst_forecasts WHERE status = 'resolved'",
    ).all() as AnalystVirtualBetInput[];
    const news = categories.news;
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
      categories,
      edge_buckets: computeAnalystEdgeBuckets(virtualRows),
      gate: {
        target_resolved: 40,
        detail: `Live-money discussion requires >= 40 resolved NEWS forecasts (${news.resolved_count} so far), news-market model Brier <= news-market market Brier (now ${fmt(news.mean_brier_model)} vs ${fmt(news.mean_brier_market)}), and positive realized analyst paper P&L. Heartbeat forecasts (${categories.heartbeat.resolved_count} resolved) verify the pipeline but do not gate.`,
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
      categories: {
        news: { forecast_count: 0, resolved_count: 0, pending_count: 0, bet_count: 0, mean_brier_model: null, mean_brier_market: null },
        heartbeat: { forecast_count: 0, resolved_count: 0, pending_count: 0, bet_count: 0, mean_brier_model: null, mean_brier_market: null },
      },
      edge_buckets: [],
      gate: { target_resolved: 40, detail: "Analyst store is unavailable." },
    };
  }
}

let cycleInFlight = false;

export async function runPolymarketAnalystCycle(
  trigger: "scheduled" | "manual" = "scheduled",
  completion: AnalystCompletionFn = analystCompletion,
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
  const universe = new Map(snapshot.markets.map((market) => [market.id, market]));
  for (const market of await fetchPolymarketFastResolvers(FAST_TRACK_HORIZON_MS)) {
    if (!universe.has(market.id)) universe.set(market.id, market);
  }
  // Second, wider pass over the full eligible horizon: the top-100 snapshot
  // under-samples mid-volume news markets, and the gate now depends on news
  // resolution velocity.
  try {
    for (const market of await fetchPolymarketFastResolvers(MAX_HORIZON_MS)) {
      if (!universe.has(market.id)) universe.set(market.id, market);
    }
  } catch {
    // The narrower universe still forecasts; width is an accelerant, not a dependency.
  }
  const candidates = selectAnalystCandidates([...universe.values()], {
    recentlyForecastedMarketIds: analystStore.recentlyForecastedMarketIds(new Date(nowMs - REFORECAST_COOLDOWN_MS).toISOString()),
    openPositionMarketIds: openMarketIds,
    pendingClusterCounts: analystStore.pendingClusterCounts(),
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
  // Smart-money fusion: followed-wallet positioning becomes one more evidence
  // line in the prompt. Dynamic import keeps the module graph acyclic
  // (wallets.ts imports the classifier from this file).
  let smartMoney = new Map<string, string>();
  try {
    const { smartMoneyContextForMarkets } = await import("./wallets");
    smartMoney = smartMoneyContextForMarkets(candidates.map((market) => market.id));
  } catch {
    // Wallet lane evidence is optional; forecasts proceed without it.
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
          smartMoney: smartMoney.get(market.id),
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
      category: classifyAnalystMarket(market.question, market.slug),
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

    if (decision && !market.fees_enabled && Date.parse(market.end_date ?? "") - nowMs >= MIN_ENTRY_HORIZON_MS) {
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
