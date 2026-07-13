import { NextResponse } from "next/server";
import {
  getAutopilotState,
  isAutopilotStoreUnavailable,
  setKillSwitch,
  setMode,
  updateCaps,
  type AutopilotStateView,
  type ControlResult,
} from "@/src/autopilot/control";
import { fetchMarketFeed, type MarketFeedRow } from "@/src/autopilot/feed";
import { fetchTrendingTokens, type TrendingToken } from "@/src/autopilot/v3/trending";
import { buildAttribution, type AttributionSummary } from "@/src/autopilot/attribution";
import { summarizeBpTimingEvidence, type BpTimingEvidence } from "@/src/autopilot/bp-evidence";
import { calibrate, calibrateStrategy, type CalibrationSummary } from "@/src/autopilot/v3/calibration";
import { summarizeCarryBook, type CarrySummary } from "@/src/autopilot/v3/carry-book";
import { evaluateModuleLiveCandidate, evaluateV3Promotion, paperPromotionSnapshots, type V3LiveCandidate, type V3Promotion } from "@/src/autopilot/v3/promotion";
import {
  isPlausibleSolanaAddress,
  walletReportCards,
  MAX_WATCHED_WALLETS,
  type WalletReportCard,
} from "@/src/autopilot/v3/smart-wallets";
import { priceSeriesFromHistory } from "@/src/autopilot/v3/candidate-store";
import type { WalletSuggestions } from "@/src/autopilot/v3/wallet-discovery";
import { checkBudget, solanaTrackerBudget, type BudgetCheck } from "@/src/autopilot/v3/api-budget";
import { buildTradableUniverse, type TierBToken } from "@/src/autopilot/v3/universe-tiers";
import { evaluateGoLiveGate, type GoLiveGate } from "@/src/autopilot/gate";
import { liveReadiness } from "@/src/autopilot/live-readiness";
import { EXPERIMENT_DEFINITIONS } from "@/src/autopilot/experiments/definitions";
import { experimentStore } from "@/src/autopilot/experiments/store";
import type { ExperimentId, ExperimentSummary } from "@/src/autopilot/experiments/types";
import { DEFAULT_STRATEGY_PARAMS, type ParamChangelogEntry, type StrategyParams } from "@/src/autopilot/params";
import {
  describeStrategyRules,
  STRATEGY_NAME,
  STRATEGY_SUMMARY,
  type EvaluationSnapshot,
} from "@/src/autopilot/strategy-view";
import {
  autopilotStore,
  type AutopilotCaps,
  type BotActivityRow,
  type BotPositionRow,
  type BotTradeRow,
  type BotDecisionRow,
  type EquityPointRow,
} from "@/src/autopilot/store";

// Control plane for the paper bot; writes bot DB state only (kill switch,
// mode, caps), no chain calls, never stores keys. The Autopilot lane has its
// own database, fully disjoint from the advisory store.

export const dynamic = "force-dynamic";

const DATA_BOUNDARY =
  "Paper mode only. The Autopilot lane cannot touch connected accounts or move funds.";

export type AutopilotApiPayload = {
  state: AutopilotStateView;
  positions: BotPositionRow[];
  equity: EquityPointRow[];
  recent_trades: BotTradeRow[];
  recent_activity: BotActivityRow[];
  recent_decisions: BotDecisionRow[];
  market_feed: MarketFeedRow[];
  /** Solana trending radar (keyless GeckoTerminal + DexScreener boosts) —
   * where attention is flowing right now; feeds the V3 trending module. */
  trending: TrendingToken[];
  go_live_gate: GoLiveGate;
  /** The strategy made legible: name, rules as sentences from the LIVE params,
   * and the daemon's latest per-symbol verdicts. */
  strategy: {
    name: string;
    summary: string;
    rules: string[];
    evaluations: EvaluationSnapshot | null;
  };
  strategy_params: StrategyParams;
  param_changelog: ParamChangelogEntry[];
  attribution: AttributionSummary;
  analyst: { ts: string; memo: string } | null;
  /** V3 shadow status: dataset size, the calibration verdict, and the
   * paper-promotion gate (whether shadow candidates may co-pilot the book). */
  v3: {
    snapshot_count: number;
    labeled_count: number;
    latest_note: string | null;
    calibration: CalibrationSummary;
    promotion: V3Promotion;
    by_strategy: Record<string, { calibration: CalibrationSummary; promotion: V3Promotion; stored_ready: boolean; stored_eligible: boolean; operator_confirmed_at: string | null; live_candidate: V3LiveCandidate }>;
    bp_timing: BpTimingEvidence;
    /** Synthetic funding-carry book: the delta-neutral strategy's evidence. */
    carry: CarrySummary;
  };
  /** Public key only; the secret never leaves env (autonomy ADR, D6). */
  live_wallet: { provisioned: boolean; pubkey: string | null };
  /** Operator-curated smart-money list the copy_wallets module follows,
   * plus the system's own scored discovery suggestions. */
  smart_wallets: {
    watched: string[];
    suggestions: WalletSuggestions | null;
    /** Followed wallets judged by OUR OWN price record of their buys. */
    report_cards: WalletReportCard[];
    /** SolanaTracker's metered monthly request budget — never assumed unlimited. */
    api_budget: BudgetCheck;
  };
  tier_b: {
    active: TierBToken[];
    denylist: string[];
    last_rotation_at: string | null;
  };
  experiments: {
    summaries: ExperimentSummary[];
    data_boundary: string;
  };
  data_boundary: string;
};

type AutopilotControlRequest = {
  action?: unknown;
  mode?: unknown;
  caps?: unknown;
  wallets?: unknown;
  denylist?: unknown;
  strategy?: unknown;
  experiment_id?: unknown;
  paused?: unknown;
};

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

function loopbackHost(value: string): boolean {
  return LOOPBACK_HOSTS.has(value.toLowerCase());
}

/** Local control writes require the exact loopback origin serving this route. */
export function isAuthorizedLocalControlRequest(request: Request): boolean {
  try {
    const target = new URL(request.url);
    if (!loopbackHost(target.hostname)) return false;
    const hostHeader = request.headers.get("host");
    if (hostHeader) {
      const headerUrl = new URL(`http://${hostHeader}`);
      if (!loopbackHost(headerUrl.hostname) || headerUrl.host !== target.host) return false;
    }
    const originHeader = request.headers.get("origin");
    if (!originHeader) return false;
    const origin = new URL(originHeader);
    return loopbackHost(origin.hostname) && origin.origin === target.origin;
  } catch {
    return false;
  }
}

async function payload(): Promise<AutopilotApiPayload> {
  const state = getAutopilotState();
  if (state.runtime_unavailable) return unavailablePayload(state, []);

  const store = autopilotStore();
  const tierBDenylist = store.tierBDenylist();
  const deniedTierBMints = new Set(tierBDenylist);
  const activeTierB = store.tierB().filter((token) => !deniedTierBMints.has(token.mint));
  // The feed is best-effort color: a DexScreener hiccup must never fail the
  // endpoint, so any error degrades to []. GET never writes bot_state — the
  // daemon owns the heartbeat; this path only derives status from it.
  const marketFeed = await fetchMarketFeed(Date.now(), buildTradableUniverse(activeTierB, store.mintMeta())).catch(() => [] as MarketFeedRow[]);
  const marketPriceBySymbol = new Map(marketFeed.map((row) => [row.symbol, row.price_usd]));
  const experimentPrices = new Map(
    buildTradableUniverse(activeTierB, store.mintMeta())
      .map((asset) => [asset.mint, marketPriceBySymbol.get(asset.symbol)] as const)
      .filter((entry): entry is readonly [string, number] => typeof entry[1] === "number"),
  );
  const trending = await fetchTrendingTokens().catch(() => [] as TrendingToken[]);
  const readiness = liveReadiness();
  const allTrades = store.trades(2_000);
  const recentActivity = store.activity(2_000);
  const goLiveGate = evaluateGoLiveGate({
    trades: store.trades(1000), decisions: store.decisions(3000), equity_series: store.equitySeries(2000),
    wallet_provisioned: readiness.wallet_provisioned, now_ms: Date.now(), price_history: store.priceHistory(),
  });
  return {
    state,
    positions: store.positions(),
    equity: store.equitySeries(200),
    recent_trades: store.trades(50),
    recent_activity: store.activity(50),
    recent_decisions: store.decisions(30),
    market_feed: marketFeed,
    trending,
    // The wallet check reads env provisioning (AUTOPILOT_WALLET_SECRET); the
    // secret itself never enters the payload or the store (autonomy ADR, D6).
    go_live_gate: goLiveGate,
    strategy: {
      name: STRATEGY_NAME,
      summary: STRATEGY_SUMMARY,
      rules: describeStrategyRules(store.strategyParams()),
      evaluations: store.lastEvaluations(),
    },
    strategy_params: store.strategyParams(),
    param_changelog: store.paramChangelog(20),
    attribution: buildAttribution({
      trades: store.trades(1000),
      decisions: store.decisions(3000),
      exit_watches: store.exitWatches(200),
      param_changelog: store.paramChangelog(200),
    }).summary,
    analyst: store.analystMemo(),
    v3: (() => {
      const snapshots = store.candidateSnapshots(2000);
      const latest = store.activity(50).find((row) => row.kind === "v3-shadow") ?? null;
      const calibration = calibrateStrategy(paperPromotionSnapshots(snapshots, "xsec"), "xsec");
      const strategyIds = [...new Set(snapshots.map((row) => row.strategy_id))];
      return {
        snapshot_count: snapshots.length,
        labeled_count: snapshots.filter((row) => row.labeled).length,
        latest_note: latest?.message ?? null,
        calibration,
        promotion: evaluateV3Promotion(calibration, store.replayConfirmation("xsec")),
        by_strategy: Object.fromEntries(strategyIds.map((strategyId) => {
          const strategyCalibration = calibrateStrategy(paperPromotionSnapshots(snapshots, strategyId), strategyId);
          return [strategyId, {
            calibration: strategyCalibration,
            promotion: evaluateV3Promotion(strategyCalibration, store.replayConfirmation(strategyId)),
            stored_ready: store.v3Promotion(strategyId)?.ready ?? false,
            stored_eligible: store.v3Promotion(strategyId)?.eligible ?? false,
            operator_confirmed_at: store.v3Promotion(strategyId)?.operator_confirmed_at ?? null,
            live_candidate: evaluateModuleLiveCandidate({
              trades: allTrades, strategy_id: strategyId, now_ms: Date.now(),
              existing_go_live_gate_passes: goLiveGate.ready,
              module_risk_halts: recentActivity.filter((row) => row.kind === "halt" && row.message.includes(strategyId)).length,
            }),
          }];
        })),
        bp_timing: summarizeBpTimingEvidence(
          store.vetoWatches(1_000),
          store.trades(2_000),
          priceSeriesFromHistory(store.priceHistory()),
        ),
        carry: summarizeCarryBook(store.carryBook(), Date.now()),
      };
    })(),
    live_wallet: { provisioned: readiness.wallet_provisioned, pubkey: readiness.wallet_pubkey },
    smart_wallets: {
      watched: store.watchedWallets(),
      suggestions: store.walletSuggestions(),
      report_cards: walletReportCards(store.walletBuys(), priceSeriesFromHistory(store.priceHistory()), Date.now()),
      api_budget: (() => {
        const config = solanaTrackerBudget();
        return checkBudget(store.apiBudget(config.service), config, Date.now());
      })(),
    },
    tier_b: {
      active: activeTierB,
      denylist: tierBDenylist,
      last_rotation_at: store.tierBLastRotationAt(),
    },
    experiments: {
      summaries: experimentStore().summaries(experimentPrices),
      data_boundary: "Five isolated synthetic paper accounts. No live execution path and no access to the primary paper book.",
    },
    data_boundary: DATA_BOUNDARY,
  };
}

export async function GET(): Promise<NextResponse<AutopilotApiPayload>> {
  return NextResponse.json(await payload());
}

export async function POST(
  request: Request,
): Promise<NextResponse<AutopilotApiPayload | { error: string }>> {
  if (!isAuthorizedLocalControlRequest(request)) {
    return NextResponse.json(
      { error: "Autopilot controls require a matching local loopback origin." },
      { status: 403 },
    );
  }
  let body: AutopilotControlRequest;

  try {
    body = (await request.json()) as AutopilotControlRequest;
  } catch {
    return NextResponse.json({ error: "Expected JSON body" }, { status: 400 });
  }

  let store: ReturnType<typeof autopilotStore>;
  try {
    store = autopilotStore();
  } catch (error) {
    if (isAutopilotStoreUnavailable(error)) {
      return NextResponse.json(
        { error: "Autopilot store is unavailable; bot controls are locked." },
        { status: 503 },
      );
    }
    throw error;
  }

  switch (body.action) {
    case "kill": {
      setKillSwitch(true);
      store.appendActivity("control", "Kill switch engaged from the dashboard. Mode set to halted.");
      return NextResponse.json(await payload());
    }

    case "release": {
      setKillSwitch(false);
      store.appendActivity(
        "control",
        "Kill switch released from the dashboard. Mode set to off; paper mode must be re-armed manually.",
      );
      return NextResponse.json(await payload());
    }

    case "set_mode": {
      // "live" is accepted here but evidence-gated inside setMode: it arms
      // only when every go-live gate check passes (autonomy ADR, D6).
      if (body.mode !== "off" && body.mode !== "paper" && body.mode !== "live") {
        return NextResponse.json({ error: 'mode must be "off", "paper", or "live".' }, { status: 422 });
      }
      const result = setMode(body.mode);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 409 });
      }
      store.appendActivity("control", `Mode set to ${body.mode} from the dashboard.`);
      return NextResponse.json(await payload());
    }

    case "set_caps": {
      if (!body.caps || typeof body.caps !== "object" || Array.isArray(body.caps)) {
        return NextResponse.json({ error: "caps must be an object." }, { status: 422 });
      }
      const result: ControlResult = updateCaps(body.caps as Partial<AutopilotCaps>);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 422 });
      }
      store.appendActivity("control", `Caps updated from the dashboard: ${describeCaps(result.state.caps)}.`);
      return NextResponse.json(await payload());
    }

    case "set_watched_wallets": {
      // The copy_wallets module follows these addresses (read-only public-RPC
      // polling; no keys, no authority). Base58-shaped, deduped, capped.
      if (!Array.isArray(body.wallets) || body.wallets.some((wallet) => typeof wallet !== "string")) {
        return NextResponse.json({ error: "wallets must be an array of addresses." }, { status: 422 });
      }
      const cleaned = [...new Set((body.wallets as string[]).map((wallet) => wallet.trim()).filter(Boolean))];
      const invalid = cleaned.filter((wallet) => !isPlausibleSolanaAddress(wallet));
      if (invalid.length > 0) {
        return NextResponse.json(
          { error: `not Solana addresses: ${invalid.slice(0, 3).join(", ")}` },
          { status: 422 },
        );
      }
      if (cleaned.length > MAX_WATCHED_WALLETS) {
        return NextResponse.json(
          { error: `watch at most ${MAX_WATCHED_WALLETS} wallets — this is a curated list, not a firehose.` },
          { status: 422 },
        );
      }
      store.setWatchedWallets(cleaned);
      store.appendActivity(
        "copy",
        cleaned.length > 0
          ? `Watched wallet list updated: following ${cleaned.length} wallet${cleaned.length === 1 ? "" : "s"}.`
          : "Watched wallet list cleared.",
      );
      return NextResponse.json(await payload());
    }

    case "set_tier_b_denylist": {
      if (!Array.isArray(body.denylist) || body.denylist.some((mint) => typeof mint !== "string")) {
        return NextResponse.json({ error: "denylist must be an array of mint addresses." }, { status: 422 });
      }
      const cleaned = [...new Set((body.denylist as string[]).map((mint) => mint.trim()).filter(Boolean))];
      const invalid = cleaned.filter((mint) => !isPlausibleSolanaAddress(mint));
      if (invalid.length > 0) {
        return NextResponse.json({ error: `not Solana mint addresses: ${invalid.slice(0, 3).join(", ")}` }, { status: 422 });
      }
      if (cleaned.length > 100) {
        return NextResponse.json({ error: "denylist is capped at 100 mints." }, { status: 422 });
      }
      store.setTierBDenylist(cleaned);
      store.appendActivity("tier-b", `Tier B operator denylist updated: ${cleaned.length} mint${cleaned.length === 1 ? "" : "s"}.`);
      return NextResponse.json(await payload());
    }

    case "confirm_v3_promotion": {
      if (typeof body.strategy !== "string" || !body.strategy.trim()) {
        return NextResponse.json({ error: "strategy must be a non-empty strategy id." }, { status: 422 });
      }
      const strategyId = body.strategy.trim();
      const calibration = calibrateStrategy(paperPromotionSnapshots(store.candidateSnapshots(2_000), strategyId), strategyId);
      const eligibility = evaluateV3Promotion(calibration, store.replayConfirmation(strategyId));
      if (!eligibility.ready) {
        return NextResponse.json({ error: `strategy is not eligible: ${eligibility.checks.filter((check) => !check.pass).map((check) => check.detail).join("; ")}` }, { status: 409 });
      }
      const now = new Date().toISOString();
      store.setV3Promotion(strategyId, { ready: true, eligible: true, ts: now, operator_confirmed_at: now, last_reason: "Explicitly confirmed from the operator dashboard." });
      store.appendActivity("control", `Operator confirmed V3 ${strategyId} for PAPER co-pilot only.`);
      return NextResponse.json(await payload());
    }

    case "demote_v3_strategy": {
      if (typeof body.strategy !== "string" || !body.strategy.trim()) {
        return NextResponse.json({ error: "strategy must be a non-empty strategy id." }, { status: 422 });
      }
      const strategyId = body.strategy.trim();
      const previous = store.v3Promotion(strategyId);
      if (!previous) return NextResponse.json({ error: "strategy has no promotion state." }, { status: 404 });
      store.setV3Promotion(strategyId, { ...previous, ready: false, ts: new Date().toISOString(), last_reason: "Manually demoted from the operator dashboard." });
      store.appendActivity("control", `Operator demoted V3 ${strategyId} from the PAPER co-pilot.`);
      return NextResponse.json(await payload());
    }

    case "set_experiment_paused": {
      const experimentIds = new Set(EXPERIMENT_DEFINITIONS.map((definition) => definition.id));
      if (typeof body.experiment_id !== "string" || !experimentIds.has(body.experiment_id as ExperimentId)) {
        return NextResponse.json({ error: "experiment_id is not a current experiment." }, { status: 422 });
      }
      if (typeof body.paused !== "boolean") {
        return NextResponse.json({ error: "paused must be a boolean." }, { status: 422 });
      }
      experimentStore().setPaused(body.experiment_id as ExperimentId, body.paused);
      store.appendActivity("control", `${body.paused ? "Paused" : "Resumed"} paper experiment ${body.experiment_id}.`);
      return NextResponse.json(await payload());
    }

    default:
      return NextResponse.json(
        { error: 'action must be one of "kill", "release", "set_mode", "set_caps", "set_watched_wallets", "set_tier_b_denylist", "confirm_v3_promotion", "demote_v3_strategy", "set_experiment_paused".' },
        { status: 400 },
      );
  }
}

function describeCaps(caps: AutopilotCaps): string {
  return `$${caps.max_trade_usd} per paper entry, $${caps.daily_spend_limit_usd} daily spend, $${caps.daily_loss_limit_usd} daily loss limit, ${caps.max_positions} positions max, ${caps.drawdown_halt_pct}% drawdown halt`;
}

function unavailablePayload(state: AutopilotStateView, marketFeed: MarketFeedRow[]): AutopilotApiPayload {
  const readiness = liveReadiness();
  const goLiveGate = evaluateGoLiveGate({
    trades: [],
    decisions: [],
    equity_series: [],
    wallet_provisioned: readiness.wallet_provisioned,
    now_ms: Date.now(),
  });
  return {
    state,
    positions: [],
    equity: [],
    recent_trades: [],
    recent_activity: [],
    recent_decisions: [],
    market_feed: marketFeed,
    trending: [],
    go_live_gate: goLiveGate,
    strategy: {
      name: STRATEGY_NAME,
      summary: STRATEGY_SUMMARY,
      rules: describeStrategyRules({ ...DEFAULT_STRATEGY_PARAMS }),
      evaluations: null,
    },
    strategy_params: { ...DEFAULT_STRATEGY_PARAMS },
    param_changelog: [],
    attribution: buildAttribution({ trades: [], decisions: [], exit_watches: [], param_changelog: [] }).summary,
    analyst: null,
    v3: {
      snapshot_count: 0,
      labeled_count: 0,
      latest_note: null,
      calibration: calibrate([]),
      promotion: evaluateV3Promotion(calibrate([])),
      by_strategy: {},
      bp_timing: { veto_samples: 0, veto_mean_30m_bps: null, taken_samples: 0, taken_mean_30m_bps: null, ready: false },
      carry: summarizeCarryBook({ positions: {}, realized_usd: 0, round_trips: 0, history: [] }, Date.now()),
    },
    live_wallet: { provisioned: readiness.wallet_provisioned, pubkey: readiness.wallet_pubkey },
    smart_wallets: {
      watched: [],
      suggestions: null,
      report_cards: [],
      api_budget: checkBudget({ month_key: "", used: 0 }, solanaTrackerBudget(), Date.now()),
    },
    tier_b: { active: [], denylist: [], last_rotation_at: null },
    experiments: {
      summaries: [],
      data_boundary: "Five isolated synthetic paper accounts. No live execution path and no access to the primary paper book.",
    },
    data_boundary: DATA_BOUNDARY,
  };
}
