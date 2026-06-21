import { NextResponse } from "next/server";
import { buildWeb3AccountAcquisitionReceipt } from "@/src/db/web3-account-acquisition";
import { buildWeb3AccountSetupReceipt } from "@/src/db/web3-account-setup";
import { buildWeb3AccountingLedgerReceipt } from "@/src/db/web3-accounting-ledger";
import { buildWeb3CutoverBlockerBoard } from "@/src/db/web3-cutover-blocker-board";
import { getWeb3DaemonSupervisorHealth } from "@/src/db/web3-daemon-supervisor";
import { buildWeb3DedicatedWalletPacket } from "@/src/db/web3-dedicated-wallet-packet";
import { buildWeb3EmergencyStopDrillReceipt } from "@/src/db/web3-emergency-stop";
import {
  buildWeb3FirstCanaryDrillReceipt,
  type Web3FirstCanaryDrillReceipt,
} from "@/src/db/web3-first-canary-drill";
import { buildWeb3JupiterOrderPacket } from "@/src/db/web3-jupiter-order-packet";
import { buildWeb3AutonomyLaunchChecklist } from "@/src/db/web3-launch-checklist";
import { buildWeb3LiveCapitalPreflightReceipt } from "@/src/db/web3-live-capital-preflight";
import { buildWeb3LiveIgnitionReceipt } from "@/src/db/web3-live-ignition";
import { buildWeb3LiveOpsPacket } from "@/src/db/web3-live-ops-packet";
import { buildWeb3LiveTradeCanaryReceipt } from "@/src/db/web3-live-trade-canary";
import { buildWeb3LiveUnsignedOrderPreflightReceipt } from "@/src/db/web3-live-unsigned-order-handoff";
import { buildWeb3LiveUsabilityBlockersReceipt } from "@/src/db/web3-live-usability-blockers";
import { buildWeb3ManualLiveReviewPacket } from "@/src/db/web3-manual-live-review-packet";
import { buildWeb3OperatorCredentialHandoffReceipt } from "@/src/db/web3-operator-credential-handoff";
import { buildWeb3OperatorRequestPacket } from "@/src/db/web3-operator-request-packet";
import { buildWeb3OperatorRunbook } from "@/src/db/web3-operator-runbook";
import { getWeb3PromotedPaperAutopilotHealth } from "@/src/db/web3-promoted-paper-autopilot";
import { buildWeb3ProductionSupervisorReadiness } from "@/src/db/web3-production-supervisor";
import { buildWeb3SignerCredentialPacket } from "@/src/db/web3-signer-credential-packet";
import { buildWeb3SupervisedCanaryReadinessReceipt } from "@/src/db/web3-supervised-canary-readiness";
import { buildWeb3SupervisedLiveRunway } from "@/src/db/web3-supervised-live-runway";
import {
  getWeb3TradingStateAsync,
  isTradingAccountMode,
  isTradingMarketSource,
  isTradingScenario,
  type TradingAccountMode,
  type TradingMarketSource,
  type TradingScenario,
} from "@/src/db/web3-trading";
import { buildWeb3UsabilityStatus } from "@/src/db/web3-usability-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse<Web3FirstCanaryDrillReceipt | { error: string }>> {
  const parsed = parseFirstCanaryDrillQuery(request.url);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 422 });

  const state = await getWeb3TradingStateAsync({
    ...parsed.value,
    advance: false,
  });
  const daemonHealth = getWeb3DaemonSupervisorHealth();
  const promotedHealth = getWeb3PromotedPaperAutopilotHealth();
  const wallet = buildWeb3DedicatedWalletPacket(state);
  const jupiter = buildWeb3JupiterOrderPacket(state);
  const signer = buildWeb3SignerCredentialPacket(state);
  const checklist = buildWeb3AutonomyLaunchChecklist(state, promotedHealth, daemonHealth);
  const productionSupervisor = buildWeb3ProductionSupervisorReadiness(daemonHealth);
  const accounting = buildWeb3AccountingLedgerReceipt(state);
  const liveOps = buildWeb3LiveOpsPacket({
    state,
    productionSupervisor,
    emergencyStop: buildWeb3EmergencyStopDrillReceipt({
      reason: "first canary drill preview",
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
    launchChecklist: checklist,
    supervisedRunway: runway,
  });
  const handoff = buildWeb3OperatorCredentialHandoffReceipt({
    accountSetup: buildWeb3AccountSetupReceipt(state),
    acquisition: buildWeb3AccountAcquisitionReceipt(state),
    launchChecklist: checklist,
  });
  const requestPacket = buildWeb3OperatorRequestPacket(handoff, { usability });
  const cutover = buildWeb3CutoverBlockerBoard({
    requestPacket,
    runway,
    usability,
  });
  const preflight = buildWeb3LiveCapitalPreflightReceipt({
    state,
    checklist,
  });
  const manualLiveReview = buildWeb3ManualLiveReviewPacket({
    state,
    checklist,
    preflight,
    liveOps,
    runway,
  });
  const runbook = buildWeb3OperatorRunbook({
    state,
    usability,
    cutover,
    preflight,
    runway,
    currentInput: requestPacket.current_input,
  });
  const liveUsability = buildWeb3LiveUsabilityBlockersReceipt({
    state,
    usability,
    cutover,
    runbook,
    preflight,
    manualLiveReview,
    runway,
    currentInput: requestPacket.current_input,
    rowScope: "all",
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
    amount_lamports: parsed.value.amountLamports,
    max_slippage_bps: state.execution_readiness.config.max_slippage_bps,
  });
  const readiness = buildWeb3SupervisedCanaryReadinessReceipt({
    state,
    wallet,
    jupiter,
    signer,
    livePreflight: preflight,
    ignition,
    unsignedPreflight,
    canary,
  });

  return NextResponse.json(buildWeb3FirstCanaryDrillReceipt({
    state,
    liveUsability,
    readiness,
    jupiter,
    unsignedPreflight,
    canary,
    amountLamports: parsed.value.amountLamports,
  }));
}

function parseFirstCanaryDrillQuery(url: string):
  | { ok: true; value: { scenario: TradingScenario; source: TradingMarketSource; account: TradingAccountMode; cycles: number; amountLamports: number } }
  | { ok: false; error: string } {
  const search = new URL(url).searchParams;
  const unsafeField = [...search.keys()].find((key) => unsafeQueryKeyPatterns.some((pattern) => pattern.test(key)));
  if (unsafeField) {
    return { ok: false, error: `Unsafe query field rejected: ${unsafeField}.` };
  }

  const scenario = search.get("scenario") ?? "breakout";
  const source = search.get("source") ?? "live-dex";
  const account = search.get("account") ?? "persistent";
  const cycles = Number(search.get("cycles") ?? "0");
  const amountLamports = Number(search.get("amount_lamports") ?? "100000");

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
  if (!Number.isInteger(amountLamports) || amountLamports < 1 || amountLamports > 1_000_000) {
    return { ok: false, error: "amount_lamports must be an integer from 1 to 1000000." };
  }

  return {
    ok: true,
    value: {
      scenario: scenario as TradingScenario,
      source: source as TradingMarketSource,
      account: account as TradingAccountMode,
      cycles,
      amountLamports,
    },
  };
}

const unsafeQueryKeyPatterns = [
  /private/i,
  /seed/i,
  /mnemonic/i,
  /keypair/i,
  /secret/i,
  /signed[_-]?transaction/i,
  /raw[_-]?transaction/i,
  /api[_-]?key/i,
  /payload/i,
];
