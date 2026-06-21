import { NextResponse } from "next/server";
import { buildWeb3DedicatedWalletPacket } from "@/src/db/web3-dedicated-wallet-packet";
import { getWeb3DaemonSupervisorHealth } from "@/src/db/web3-daemon-supervisor";
import { buildWeb3JupiterOrderPacket } from "@/src/db/web3-jupiter-order-packet";
import { buildWeb3AutonomyLaunchChecklist } from "@/src/db/web3-launch-checklist";
import { buildWeb3LiveCapitalPreflightReceipt } from "@/src/db/web3-live-capital-preflight";
import { buildWeb3LiveIgnitionReceipt } from "@/src/db/web3-live-ignition";
import { buildWeb3LiveTradeCanaryReceipt } from "@/src/db/web3-live-trade-canary";
import { buildWeb3LiveUnsignedOrderPreflightReceipt } from "@/src/db/web3-live-unsigned-order-handoff";
import { buildWeb3LiveUsabilityBlockersReceipt } from "@/src/db/web3-live-usability-blockers";
import { buildWeb3OperatorCredentialHandoffReceipt } from "@/src/db/web3-operator-credential-handoff";
import { buildWeb3OperatorRequestPacket } from "@/src/db/web3-operator-request-packet";
import { buildWeb3OperatorRunbook } from "@/src/db/web3-operator-runbook";
import { getWeb3PromotedPaperAutopilotHealth } from "@/src/db/web3-promoted-paper-autopilot";
import { buildWeb3CutoverBlockerBoard } from "@/src/db/web3-cutover-blocker-board";
import { buildWeb3SupervisedLiveRunway } from "@/src/db/web3-supervised-live-runway";
import { buildWeb3UsabilityStatus } from "@/src/db/web3-usability-status";
import { buildWeb3LiveOpsPacket } from "@/src/db/web3-live-ops-packet";
import { buildWeb3EmergencyStopDrillReceipt } from "@/src/db/web3-emergency-stop";
import { buildWeb3AccountingLedgerReceipt } from "@/src/db/web3-accounting-ledger";
import { buildWeb3ProductionSupervisorReadiness } from "@/src/db/web3-production-supervisor";
import { buildWeb3ManualLiveReviewPacket } from "@/src/db/web3-manual-live-review-packet";
import { buildWeb3AccountSetupReceipt } from "@/src/db/web3-account-setup";
import { buildWeb3AccountAcquisitionReceipt } from "@/src/db/web3-account-acquisition";
import { buildWeb3SignerCredentialPacket } from "@/src/db/web3-signer-credential-packet";
import {
  buildWeb3SupervisedCanaryReadinessReceipt,
  type Web3SupervisedCanaryReadinessReceipt,
} from "@/src/db/web3-supervised-canary-readiness";
import {
  getWeb3TradingStateAsync,
  isTradingAccountMode,
  isTradingMarketSource,
  isTradingScenario,
  type TradingAccountMode,
  type TradingMarketSource,
  type TradingScenario,
} from "@/src/db/web3-trading";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse<Web3SupervisedCanaryReadinessReceipt | { error: string }>> {
  const parsed = parseCanaryReadinessQuery(request.url);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 422 });

  const state = await getWeb3TradingStateAsync({
    ...parsed.value,
    advance: false,
  });
  const wallet = buildWeb3DedicatedWalletPacket(state);
  const jupiter = buildWeb3JupiterOrderPacket(state);
  const signer = buildWeb3SignerCredentialPacket(state);
  const supervisorHealth = getWeb3DaemonSupervisorHealth();
  const promotedAutopilotHealth = getWeb3PromotedPaperAutopilotHealth();
  const launchChecklist = buildWeb3AutonomyLaunchChecklist(state, promotedAutopilotHealth, supervisorHealth);
  const productionSupervisor = buildWeb3ProductionSupervisorReadiness(supervisorHealth);
  const accounting = buildWeb3AccountingLedgerReceipt(state);
  const liveOps = buildWeb3LiveOpsPacket({
    state,
    productionSupervisor,
    emergencyStop: buildWeb3EmergencyStopDrillReceipt({
      reason: "supervised canary readiness preview",
      operator_ack: true,
    }),
    accounting,
  });
  const runway = buildWeb3SupervisedLiveRunway({
    state,
    wallet,
    jupiter,
    signer,
    liveOps,
  });
  const usability = buildWeb3UsabilityStatus({
    state,
    launchChecklist,
    supervisedRunway: runway,
  });
  const handoff = buildWeb3OperatorCredentialHandoffReceipt({
    accountSetup: buildWeb3AccountSetupReceipt(state),
    acquisition: buildWeb3AccountAcquisitionReceipt(state),
    launchChecklist,
  });
  const requestPacket = buildWeb3OperatorRequestPacket(handoff, { usability });
  const cutover = buildWeb3CutoverBlockerBoard({
    requestPacket,
    runway,
    usability,
  });
  const livePreflight = buildWeb3LiveCapitalPreflightReceipt({
    state,
    checklist: launchChecklist,
  });
  const manualLiveReview = buildWeb3ManualLiveReviewPacket({
    state,
    checklist: launchChecklist,
    preflight: livePreflight,
    liveOps,
    runway,
  });
  const runbook = buildWeb3OperatorRunbook({
    state,
    usability,
    cutover,
    preflight: livePreflight,
    runway,
    currentInput: requestPacket.current_input,
  });
  const liveUsability = buildWeb3LiveUsabilityBlockersReceipt({
    state,
    usability,
    cutover,
    runbook,
    preflight: livePreflight,
    manualLiveReview,
    runway,
    currentInput: requestPacket.current_input,
  });
  const canary = buildWeb3LiveTradeCanaryReceipt(state);
  const ignition = buildWeb3LiveIgnitionReceipt({
    state,
    liveUsability,
    canary,
  });
  const unsignedPreflight = buildWeb3LiveUnsignedOrderPreflightReceipt(state, {
    operator_ack: true,
    canary_ack: "I_UNDERSTAND_THIS_UNSIGNED_ORDER_CAN_MOVE_REAL_FUNDS_IF_SIGNED",
    wallet_public_key: state.execution_readiness.config.wallet_public_key,
    amount_lamports: 100_000,
    max_slippage_bps: state.execution_readiness.config.max_slippage_bps,
  });

  return NextResponse.json(buildWeb3SupervisedCanaryReadinessReceipt({
    state,
    wallet,
    jupiter,
    signer,
    livePreflight,
    ignition,
    unsignedPreflight,
    canary,
  }));
}

function parseCanaryReadinessQuery(url: string):
  | { ok: true; value: { scenario: TradingScenario; source: TradingMarketSource; account: TradingAccountMode; cycles: number } }
  | { ok: false; error: string } {
  const search = new URL(url).searchParams;
  const scenario = search.get("scenario") ?? "breakout";
  const source = search.get("source") ?? "live-dex";
  const account = search.get("account") ?? "persistent";
  const cycles = Number(search.get("cycles") ?? "0");

  if (!isTradingScenario(scenario)) {
    return { ok: false, error: "scenario must be base, breakout, or rug-risk." };
  }
  if (!isTradingMarketSource(source)) {
    return { ok: false, error: "source must be sample or live-dex." };
  }
  if (!isTradingAccountMode(account)) {
    return { ok: false, error: "account must be ephemeral or persistent." };
  }
  if (!Number.isInteger(cycles) || cycles < 0 || cycles > 24) {
    return { ok: false, error: "cycles must be an integer from 0 to 24." };
  }

  return {
    ok: true,
    value: {
      scenario: scenario as TradingScenario,
      source: source as TradingMarketSource,
      account: account as TradingAccountMode,
      cycles,
    },
  };
}
