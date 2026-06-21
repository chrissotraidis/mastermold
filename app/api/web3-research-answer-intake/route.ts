import { NextResponse } from "next/server";
import { buildWeb3AccountAcquisitionReceipt } from "@/src/db/web3-account-acquisition";
import { buildWeb3AccountSetupReceipt } from "@/src/db/web3-account-setup";
import { buildWeb3AccountingLedgerReceipt } from "@/src/db/web3-accounting-ledger";
import { buildWeb3CutoverBlockerBoard } from "@/src/db/web3-cutover-blocker-board";
import { getWeb3DaemonSupervisorHealth } from "@/src/db/web3-daemon-supervisor";
import { buildWeb3DedicatedWalletPacket } from "@/src/db/web3-dedicated-wallet-packet";
import { buildWeb3EmergencyStopDrillReceipt } from "@/src/db/web3-emergency-stop";
import { buildWeb3JupiterOrderPacket } from "@/src/db/web3-jupiter-order-packet";
import { buildWeb3AutonomyLaunchChecklist } from "@/src/db/web3-launch-checklist";
import { buildWeb3LiveCapitalPreflightReceipt } from "@/src/db/web3-live-capital-preflight";
import { buildWeb3LiveOpsPacket } from "@/src/db/web3-live-ops-packet";
import { buildWeb3LiveUsabilityBlockersReceipt } from "@/src/db/web3-live-usability-blockers";
import { buildWeb3ManualLiveReviewPacket } from "@/src/db/web3-manual-live-review-packet";
import { buildWeb3OperatorCredentialHandoffReceipt } from "@/src/db/web3-operator-credential-handoff";
import { buildWeb3OperatorRequestPacket } from "@/src/db/web3-operator-request-packet";
import { buildWeb3OperatorRunbook } from "@/src/db/web3-operator-runbook";
import { getWeb3PromotedPaperAutopilotHealth } from "@/src/db/web3-promoted-paper-autopilot";
import { buildWeb3ProductionSupervisorReadiness } from "@/src/db/web3-production-supervisor";
import {
  assertResearchAnswerTextIsSafe,
  buildWeb3ResearchAnswerIntakeReceipt,
  type Web3ResearchAnswerIntakeReceipt,
} from "@/src/db/web3-research-answer-intake";
import { buildWeb3ResearchHandoffPacket } from "@/src/db/web3-research-handoff-packet";
import { buildWeb3SignerCredentialPacket } from "@/src/db/web3-signer-credential-packet";
import { buildWeb3SupervisedLiveRunway } from "@/src/db/web3-supervised-live-runway";
import { buildWeb3UsabilityStatus } from "@/src/db/web3-usability-status";
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

type ResearchAnswerIntakeBody = {
  answers_text?: unknown;
};

export async function POST(request: Request): Promise<NextResponse<Web3ResearchAnswerIntakeReceipt | { error: string }>> {
  const search = new URL(request.url).searchParams;
  const scenario = search.get("scenario") ?? "breakout";
  const source = search.get("source") ?? "live-dex";
  const account = search.get("account") ?? "persistent";
  const cycles = Number(search.get("cycles") ?? "0");

  const validationError = validateSearch({ scenario, source, account, cycles });
  if (validationError) return validationError;

  let body: ResearchAnswerIntakeBody;
  try {
    body = await request.json() as ResearchAnswerIntakeBody;
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 422 });
  }

  let answersText: string;
  try {
    answersText = assertResearchAnswerTextIsSafe(body.answers_text);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Research answers were rejected." }, { status: 422 });
  }

  const handoff = await buildResearchHandoffForSearch({
    scenario: scenario as TradingScenario,
    source: source as TradingMarketSource,
    account: account as TradingAccountMode,
    cycles,
  });

  return NextResponse.json(buildWeb3ResearchAnswerIntakeReceipt({
    handoff,
    answersText,
  }));
}

function validateSearch(input: { scenario: string; source: string; account: string; cycles: number }) {
  if (!isTradingScenario(input.scenario)) {
    return NextResponse.json({ error: "scenario must be base, breakout, or rug-risk." }, { status: 422 });
  }
  if (!isTradingMarketSource(input.source)) {
    return NextResponse.json({ error: "source must be sample or live-dex." }, { status: 422 });
  }
  if (!isTradingAccountMode(input.account)) {
    return NextResponse.json({ error: "account must be ephemeral or persistent." }, { status: 422 });
  }
  if (!Number.isInteger(input.cycles) || input.cycles < 0 || input.cycles > 24) {
    return NextResponse.json({ error: "cycles must be an integer from 0 to 24." }, { status: 422 });
  }
  return null;
}

async function buildResearchHandoffForSearch(input: {
  scenario: TradingScenario;
  source: TradingMarketSource;
  account: TradingAccountMode;
  cycles: number;
}) {
  const state = await getWeb3TradingStateAsync({
    scenario: input.scenario,
    source: input.source,
    account: input.account,
    cycles: input.cycles,
    advance: false,
  });
  const supervisorHealth = getWeb3DaemonSupervisorHealth();
  const promotedHealth = getWeb3PromotedPaperAutopilotHealth();
  const launchChecklist = buildWeb3AutonomyLaunchChecklist(state, promotedHealth, supervisorHealth);
  const productionSupervisor = buildWeb3ProductionSupervisorReadiness(supervisorHealth);
  const accounting = buildWeb3AccountingLedgerReceipt(state);
  const liveOps = buildWeb3LiveOpsPacket({
    state,
    productionSupervisor,
    emergencyStop: buildWeb3EmergencyStopDrillReceipt({
      reason: "research answer intake preview",
      operator_ack: true,
    }),
    accounting,
  });
  const runway = buildWeb3SupervisedLiveRunway({
    state,
    wallet: buildWeb3DedicatedWalletPacket(state),
    jupiter: buildWeb3JupiterOrderPacket(state),
    signer: buildWeb3SignerCredentialPacket(state),
    liveOps,
  });
  const usability = buildWeb3UsabilityStatus({
    state,
    launchChecklist,
    supervisedRunway: runway,
  });
  const accountSetup = buildWeb3AccountSetupReceipt(state);
  const baseHandoff = buildWeb3OperatorCredentialHandoffReceipt({
    accountSetup,
    acquisition: buildWeb3AccountAcquisitionReceipt(state),
    launchChecklist,
  });
  const requestPacket = buildWeb3OperatorRequestPacket(baseHandoff, { usability });
  const cutover = buildWeb3CutoverBlockerBoard({
    requestPacket,
    runway,
    usability,
  });
  const preflight = buildWeb3LiveCapitalPreflightReceipt({
    state,
    checklist: launchChecklist,
  });
  const runbook = buildWeb3OperatorRunbook({
    state,
    usability,
    cutover,
    preflight,
    runway,
  });
  const manualLiveReview = buildWeb3ManualLiveReviewPacket({
    state,
    checklist: launchChecklist,
    preflight,
    liveOps,
    runway,
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
  const handoff = buildWeb3OperatorCredentialHandoffReceipt({
    accountSetup,
    acquisition: buildWeb3AccountAcquisitionReceipt(state),
    launchChecklist,
    liveUsability,
  });
  const enrichedRequestPacket = buildWeb3OperatorRequestPacket(handoff, { usability });

  return buildWeb3ResearchHandoffPacket({
    state,
    usability,
    handoff,
    requestPacket: enrichedRequestPacket,
    cutover,
    runbook,
    preflight,
    runway,
    manualLiveReview,
  });
}
