import { NextResponse } from "next/server";
import { buildWeb3AccountAcquisitionReceipt } from "@/src/db/web3-account-acquisition";
import { buildWeb3AccountSetupReceipt } from "@/src/db/web3-account-setup";
import { buildWeb3AccountingLedgerReceipt } from "@/src/db/web3-accounting-ledger";
import { buildWeb3CutoverBlockerBoard } from "@/src/db/web3-cutover-blocker-board";
import {
  buildWeb3CredentialRequirementsHealth,
  buildWeb3CredentialRequirementsReceipt,
} from "@/src/db/web3-credential-requirements";
import { getWeb3DaemonSupervisorHealth } from "@/src/db/web3-daemon-supervisor";
import { buildWeb3DedicatedWalletPacket } from "@/src/db/web3-dedicated-wallet-packet";
import { buildWeb3EmergencyStopDrillReceipt } from "@/src/db/web3-emergency-stop";
import { buildWeb3FirstCanaryDrillHealth, buildWeb3FirstCanaryDrillReceipt } from "@/src/db/web3-first-canary-drill";
import { buildWeb3JupiterOrderPacket } from "@/src/db/web3-jupiter-order-packet";
import { buildWeb3AutonomyLaunchChecklist } from "@/src/db/web3-launch-checklist";
import { buildWeb3LiveActivationPlan, buildWeb3LiveActivationPlanHealth } from "@/src/db/web3-live-activation-plan";
import { buildWeb3LiveCapitalPreflightReceipt } from "@/src/db/web3-live-capital-preflight";
import { buildWeb3LiveAutonomyReadinessHealth } from "@/src/db/web3-live-autonomy-readiness";
import { buildWeb3LiveIgnitionHealth, buildWeb3LiveIgnitionReceipt } from "@/src/db/web3-live-ignition";
import { buildWeb3LiveOpsPacket } from "@/src/db/web3-live-ops-packet";
import { buildWeb3LiveTradeCanaryHealth, buildWeb3LiveTradeCanaryReceipt } from "@/src/db/web3-live-trade-canary";
import { buildWeb3LiveUnsignedOrderPreflightReceipt } from "@/src/db/web3-live-unsigned-order-handoff";
import {
  buildWeb3LiveUsabilityBlockersHealth,
  buildWeb3LiveUsabilityBlockersReceipt,
} from "@/src/db/web3-live-usability-blockers";
import { buildWeb3ManualLiveReviewPacket } from "@/src/db/web3-manual-live-review-packet";
import { buildWeb3OperatorCredentialHandoffReceipt } from "@/src/db/web3-operator-credential-handoff";
import { buildWeb3OperatorRequestPacket } from "@/src/db/web3-operator-request-packet";
import { buildWeb3OperatorRunbook, buildWeb3OperatorRunbookHealth } from "@/src/db/web3-operator-runbook";
import { getWeb3PromotedPaperAutopilotHealth } from "@/src/db/web3-promoted-paper-autopilot";
import { buildWeb3ProductionSupervisorReadiness } from "@/src/db/web3-production-supervisor";
import { buildWeb3ProfitProofReadiness } from "@/src/db/web3-profit-proof";
import { buildWeb3ResearchHandoffHealth, buildWeb3ResearchHandoffPacket } from "@/src/db/web3-research-handoff-packet";
import { buildWeb3SignerCredentialPacket } from "@/src/db/web3-signer-credential-packet";
import {
  buildWeb3SupervisedCanaryAttemptHealth,
  buildWeb3SupervisedCanaryReadinessReceipt,
} from "@/src/db/web3-supervised-canary-readiness";
import { buildWeb3SupervisedLiveRunway } from "@/src/db/web3-supervised-live-runway";
import {
  getCachedWeb3TradingState,
  type CachedWeb3TradingStateInput,
} from "@/src/db/web3-trading-state-cache";
import { type Web3TradingState } from "@/src/db/web3-trading";
import { buildWeb3UsabilityStatus } from "@/src/db/web3-usability-status";

const CANONICAL_LIVE_STATE_INPUT: CachedWeb3TradingStateInput = {
  source: "live-dex",
  account: "persistent",
  scenario: "breakout",
};

const DEFAULT_HEALTH_STATE_INPUT: CachedWeb3TradingStateInput = {
  source: "sample",
  account: "ephemeral",
  scenario: "base",
};

const HEALTH_CACHE_TTL_MS = 5_000;
const HEALTH_WEB3_STATE_TTL_MS = 10_000;
let cachedHealth:
  | {
      expiresAt: number;
      body: Record<string, unknown>;
    }
  | null = null;

export async function GET() {
  const now = Date.now();
  if (cachedHealth && cachedHealth.expiresAt > now) {
    return NextResponse.json(cachedHealth.body, {
      headers: {
        "Cache-Control": "no-store",
        "X-MasterMold-Cache": "hit",
      },
    });
  }

  const canonicalLiveStatePromise = getCachedWeb3TradingState(CANONICAL_LIVE_STATE_INPUT, HEALTH_WEB3_STATE_TTL_MS);
  const web3DaemonSupervisor = getWeb3DaemonSupervisorHealth();
  const web3PromotedPaperAutopilot = getWeb3PromotedPaperAutopilotHealth();
  const web3State = await getCachedWeb3TradingState(DEFAULT_HEALTH_STATE_INPUT, HEALTH_WEB3_STATE_TTL_MS);
  const web3LaunchChecklist = buildWeb3AutonomyLaunchChecklist(
    web3State,
    web3PromotedPaperAutopilot,
    web3DaemonSupervisor,
  );
  const web3ProductionSupervisor = buildWeb3ProductionSupervisorReadiness(web3DaemonSupervisor);
  const web3Accounting = buildWeb3AccountingLedgerReceipt(web3State);
  const web3Wallet = buildWeb3DedicatedWalletPacket(web3State);
  const web3Jupiter = buildWeb3JupiterOrderPacket(web3State);
  const web3Signer = buildWeb3SignerCredentialPacket(web3State);
  const web3LiveOps = buildWeb3LiveOpsPacket({
    state: web3State,
    productionSupervisor: web3ProductionSupervisor,
    emergencyStop: buildWeb3EmergencyStopDrillReceipt({ reason: "health research handoff preview", operator_ack: true }),
    accounting: web3Accounting,
  });
  const web3SupervisedRunway = buildWeb3SupervisedLiveRunway({
    state: web3State,
    wallet: web3Wallet,
    jupiter: web3Jupiter,
    signer: web3Signer,
    liveOps: web3LiveOps,
  });
  const web3Usability = buildWeb3UsabilityStatus({
    state: web3State,
    launchChecklist: web3LaunchChecklist,
    supervisedRunway: web3SupervisedRunway,
  });
  const web3AccountSetup = buildWeb3AccountSetupReceipt(web3State);
  const web3Handoff = buildWeb3OperatorCredentialHandoffReceipt({
    accountSetup: web3AccountSetup,
    acquisition: buildWeb3AccountAcquisitionReceipt(web3State),
    launchChecklist: web3LaunchChecklist,
  });
  const web3BaseRequestPacket = buildWeb3OperatorRequestPacket(web3Handoff, { usability: web3Usability });
  const web3Cutover = buildWeb3CutoverBlockerBoard({
    requestPacket: web3BaseRequestPacket,
    runway: web3SupervisedRunway,
    usability: web3Usability,
  });
  const web3Preflight = buildWeb3LiveCapitalPreflightReceipt({
    state: web3State,
    checklist: web3LaunchChecklist,
  });
  const web3Runbook = buildWeb3OperatorRunbook({
    state: web3State,
    usability: web3Usability,
    cutover: web3Cutover,
    preflight: web3Preflight,
    runway: web3SupervisedRunway,
    currentInput: web3BaseRequestPacket.current_input,
  });
  const web3ManualLiveReview = buildWeb3ManualLiveReviewPacket({
    state: web3State,
    checklist: web3LaunchChecklist,
    preflight: web3Preflight,
    liveOps: web3LiveOps,
    runway: web3SupervisedRunway,
  });
  const web3LiveUsability = buildWeb3LiveUsabilityBlockersReceipt({
    state: web3State,
    usability: web3Usability,
    cutover: web3Cutover,
    runbook: web3Runbook,
    preflight: web3Preflight,
    manualLiveReview: web3ManualLiveReview,
    runway: web3SupervisedRunway,
    currentInput: web3BaseRequestPacket.current_input,
  });
  const web3EnrichedHandoff = buildWeb3OperatorCredentialHandoffReceipt({
    accountSetup: web3AccountSetup,
    acquisition: buildWeb3AccountAcquisitionReceipt(web3State),
    launchChecklist: web3LaunchChecklist,
    liveUsability: web3LiveUsability,
  });
  const web3RequestPacket = buildWeb3OperatorRequestPacket(web3EnrichedHandoff, { usability: web3Usability });
  const web3ResearchHandoff = buildWeb3ResearchHandoffPacket({
    state: web3State,
    usability: web3Usability,
    handoff: web3EnrichedHandoff,
    requestPacket: web3RequestPacket,
    cutover: web3Cutover,
    runbook: web3Runbook,
    preflight: web3Preflight,
    runway: web3SupervisedRunway,
    manualLiveReview: web3ManualLiveReview,
  });
  const web3CredentialRequirements = buildWeb3CredentialRequirementsReceipt(web3ResearchHandoff);
  const web3LiveActivationPlan = buildWeb3LiveActivationPlan({
    requirements: web3CredentialRequirements,
    liveUsability: web3LiveUsability,
    liveAutonomy: web3State.autonomous_live_autonomy_readiness,
    operatorWalletPublicKey: web3State.execution_readiness.config.wallet_public_key,
  });
  const web3Canary = buildWeb3LiveTradeCanaryReceipt(web3State);
  const web3LiveIgnition = buildWeb3LiveIgnitionReceipt({
    state: web3State,
    liveUsability: web3LiveUsability,
    canary: web3Canary,
  });
  const web3UnsignedPreflight = buildWeb3LiveUnsignedOrderPreflightReceipt(web3State, {
    operator_ack: true,
    canary_ack: "I_UNDERSTAND_THIS_UNSIGNED_ORDER_CAN_MOVE_REAL_FUNDS_IF_SIGNED",
    wallet_public_key: web3State.execution_readiness.config.wallet_public_key,
    amount_lamports: 100_000,
    max_slippage_bps: web3State.execution_readiness.config.max_slippage_bps,
  });
  const web3CanaryReadiness = buildWeb3SupervisedCanaryReadinessReceipt({
    state: web3State,
    wallet: web3Wallet,
    jupiter: web3Jupiter,
    signer: web3Signer,
    livePreflight: web3Preflight,
    ignition: web3LiveIgnition,
    unsignedPreflight: web3UnsignedPreflight,
    canary: web3Canary,
  });
  const web3FirstCanaryDrill = buildWeb3FirstCanaryDrillReceipt({
    state: web3State,
    liveUsability: web3LiveUsability,
    readiness: web3CanaryReadiness,
    jupiter: web3Jupiter,
    unsignedPreflight: web3UnsignedPreflight,
    canary: web3Canary,
  });
  const {
    web3LiveFirstCanaryDrillHealth,
    web3LiveCanaryProofHealth,
    web3LiveCanaryAttemptHealth,
  } = buildCanonicalLiveHealthBundle(await canonicalLiveStatePromise);
  const body = {
    status: "ok",
    web3_daemon_supervisor: web3DaemonSupervisor,
    web3_production_supervisor: web3ProductionSupervisor,
    web3_promoted_paper_autopilot: web3PromotedPaperAutopilot,
    web3_profit_proof: buildWeb3ProfitProofReadiness({ promotedHealth: web3PromotedPaperAutopilot }),
    web3_operator_runbook: buildWeb3OperatorRunbookHealth(web3Runbook),
    web3_live_activation: buildWeb3LiveActivationPlanHealth(web3LiveActivationPlan),
    web3_live_autonomy_readiness: buildWeb3LiveAutonomyReadinessHealth(web3State),
    web3_live_ignition: buildWeb3LiveIgnitionHealth(web3LiveIgnition),
    web3_canary_proof: buildWeb3LiveTradeCanaryHealth(web3Canary),
    web3_live_canary_proof: web3LiveCanaryProofHealth,
    web3_live_canary_attempt: web3LiveCanaryAttemptHealth,
    web3_first_canary_drill: buildWeb3FirstCanaryDrillHealth(web3FirstCanaryDrill),
    web3_live_first_canary_drill: web3LiveFirstCanaryDrillHealth,
    web3_live_usability: buildWeb3LiveUsabilityBlockersHealth(web3LiveUsability, web3RequestPacket.current_input),
    web3_research_handoff: buildWeb3ResearchHandoffHealth(web3ResearchHandoff),
    web3_credential_requirements: buildWeb3CredentialRequirementsHealth(web3CredentialRequirements),
  };

  cachedHealth = {
    expiresAt: Date.now() + HEALTH_CACHE_TTL_MS,
    body,
  };

  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "no-store",
      "X-MasterMold-Cache": "miss",
    },
  });
}

function buildCanonicalLiveHealthBundle(state: Web3TradingState) {
  const readiness = buildCanonicalLiveCanaryReadinessReceipt(state);
  return {
    web3LiveFirstCanaryDrillHealth: buildCanonicalLiveFirstCanaryDrillHealth(state),
    web3LiveCanaryProofHealth: buildWeb3LiveTradeCanaryHealth(buildWeb3LiveTradeCanaryReceipt(state)),
    web3LiveCanaryAttemptHealth: buildWeb3SupervisedCanaryAttemptHealth(readiness),
  };
}

function buildCanonicalLiveCanaryReadinessReceipt(state: Web3TradingState) {
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
    emergencyStop: buildWeb3EmergencyStopDrillReceipt({ reason: "health canonical live canary attempt preview", operator_ack: true }),
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
  const accountSetup = buildWeb3AccountSetupReceipt(state);
  const handoff = buildWeb3OperatorCredentialHandoffReceipt({
    accountSetup,
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
  return buildWeb3SupervisedCanaryReadinessReceipt({
    state,
    wallet,
    jupiter,
    signer,
    livePreflight: preflight,
    ignition,
    unsignedPreflight,
    canary,
  });
}

function buildCanonicalLiveFirstCanaryDrillHealth(state: Web3TradingState) {
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
    emergencyStop: buildWeb3EmergencyStopDrillReceipt({ reason: "health canonical live canary preview", operator_ack: true }),
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
    amount_lamports: 100_000,
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
  const receipt = buildWeb3FirstCanaryDrillReceipt({
    state,
    liveUsability,
    readiness,
    jupiter,
    unsignedPreflight,
    canary,
  });
  return buildWeb3FirstCanaryDrillHealth(receipt);
}
