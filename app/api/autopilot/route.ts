import { NextResponse } from "next/server";
import {
  getAutopilotState,
  setKillSwitch,
  setMode,
  updateCaps,
  type AutopilotStateView,
  type ControlResult,
} from "@/src/autopilot/control";
import { fetchMarketFeed, type MarketFeedRow } from "@/src/autopilot/feed";
import { buildAttribution, type AttributionSummary } from "@/src/autopilot/attribution";
import { calibrate, type CalibrationSummary } from "@/src/autopilot/v3/calibration";
import { evaluateGoLiveGate, type GoLiveGate } from "@/src/autopilot/gate";
import { liveReadiness } from "@/src/autopilot/live";
import type { ParamChangelogEntry, StrategyParams } from "@/src/autopilot/params";
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
  "Paper mode only. The Autopilot lane cannot touch brokerage, Monarch, or any other account.";

export type AutopilotApiPayload = {
  state: AutopilotStateView;
  positions: BotPositionRow[];
  equity: EquityPointRow[];
  recent_trades: BotTradeRow[];
  recent_activity: BotActivityRow[];
  recent_decisions: BotDecisionRow[];
  market_feed: MarketFeedRow[];
  go_live_gate: GoLiveGate;
  strategy_params: StrategyParams;
  param_changelog: ParamChangelogEntry[];
  attribution: AttributionSummary;
  analyst: { ts: string; memo: string } | null;
  /** V3 shadow status: dataset size + the calibration verdict. */
  v3: { snapshot_count: number; labeled_count: number; latest_note: string | null; calibration: CalibrationSummary };
  /** Public key only; the secret never leaves env (autonomy ADR, D6). */
  live_wallet: { provisioned: boolean; pubkey: string | null };
  data_boundary: string;
};

type AutopilotControlRequest = {
  action?: unknown;
  mode?: unknown;
  caps?: unknown;
};

async function payload(): Promise<AutopilotApiPayload> {
  const store = autopilotStore();
  // The feed is best-effort color: a DexScreener hiccup must never fail the
  // endpoint, so any error degrades to []. GET never writes bot_state — the
  // daemon owns the heartbeat; this path only derives status from it.
  const marketFeed = await fetchMarketFeed().catch(() => [] as MarketFeedRow[]);
  return {
    state: getAutopilotState(),
    positions: store.positions(),
    equity: store.equitySeries(200),
    recent_trades: store.trades(50),
    recent_activity: store.activity(50),
    recent_decisions: store.decisions(30),
    market_feed: marketFeed,
    // The wallet check reads env provisioning (AUTOPILOT_WALLET_SECRET); the
    // secret itself never enters the payload or the store (autonomy ADR, D6).
    go_live_gate: evaluateGoLiveGate({
      trades: store.trades(1000),
      decisions: store.decisions(400),
      equity_series: store.equitySeries(2000),
      wallet_provisioned: liveReadiness().wallet_provisioned,
      now_ms: Date.now(),
    }),
    strategy_params: store.strategyParams(),
    param_changelog: store.paramChangelog(20),
    attribution: buildAttribution({
      trades: store.trades(1000),
      decisions: store.decisions(400),
      exit_watches: store.exitWatches(200),
      param_changelog: store.paramChangelog(200),
    }).summary,
    analyst: store.analystMemo(),
    v3: (() => {
      const snapshots = store.candidateSnapshots(2000);
      const latest = store.activity(50).find((row) => row.kind === "v3-shadow") ?? null;
      return {
        snapshot_count: snapshots.length,
        labeled_count: snapshots.filter((row) => row.labeled).length,
        latest_note: latest?.message ?? null,
        calibration: calibrate(snapshots),
      };
    })(),
    live_wallet: { provisioned: liveReadiness().wallet_provisioned, pubkey: liveReadiness().wallet_pubkey },
    data_boundary: DATA_BOUNDARY,
  };
}

export async function GET(): Promise<NextResponse<AutopilotApiPayload>> {
  return NextResponse.json(await payload());
}

export async function POST(
  request: Request,
): Promise<NextResponse<AutopilotApiPayload | { error: string }>> {
  let body: AutopilotControlRequest;

  try {
    body = (await request.json()) as AutopilotControlRequest;
  } catch {
    return NextResponse.json({ error: "Expected JSON body" }, { status: 400 });
  }

  const store = autopilotStore();

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

    default:
      return NextResponse.json(
        { error: 'action must be one of "kill", "release", "set_mode", "set_caps".' },
        { status: 400 },
      );
  }
}

function describeCaps(caps: AutopilotCaps): string {
  return `$${caps.max_trade_usd} per paper entry, $${caps.daily_spend_limit_usd} daily spend, $${caps.daily_loss_limit_usd} daily loss limit, ${caps.max_positions} positions max, ${caps.drawdown_halt_pct}% drawdown halt`;
}
