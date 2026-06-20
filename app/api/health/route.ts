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
import { buildWeb3ManualLiveReviewPacket } from "@/src/db/web3-manual-live-review-packet";
import { buildWeb3OperatorCredentialHandoffReceipt } from "@/src/db/web3-operator-credential-handoff";
import { buildWeb3OperatorRequestPacket } from "@/src/db/web3-operator-request-packet";
import { buildWeb3OperatorRunbook } from "@/src/db/web3-operator-runbook";
import { getWeb3PromotedPaperAutopilotHealth } from "@/src/db/web3-promoted-paper-autopilot";
import { buildWeb3ProductionSupervisorReadiness } from "@/src/db/web3-production-supervisor";
import { buildWeb3ProfitProofReadiness } from "@/src/db/web3-profit-proof";
import { buildWeb3ResearchHandoffHealth, buildWeb3ResearchHandoffPacket } from "@/src/db/web3-research-handoff-packet";
import { buildWeb3SignerCredentialPacket } from "@/src/db/web3-signer-credential-packet";
import { buildWeb3SupervisedLiveRunway } from "@/src/db/web3-supervised-live-runway";
import { getWeb3TradingStateAsync } from "@/src/db/web3-trading";
import { buildWeb3UsabilityStatus } from "@/src/db/web3-usability-status";

export async function GET() {
  const web3DaemonSupervisor = getWeb3DaemonSupervisorHealth();
  const web3PromotedPaperAutopilot = getWeb3PromotedPaperAutopilotHealth();
  const web3State = await getWeb3TradingStateAsync({ advance: false });
  const web3LaunchChecklist = buildWeb3AutonomyLaunchChecklist(
    web3State,
    web3PromotedPaperAutopilot,
    web3DaemonSupervisor,
  );
  const web3ProductionSupervisor = buildWeb3ProductionSupervisorReadiness(web3DaemonSupervisor);
  const web3Accounting = buildWeb3AccountingLedgerReceipt(web3State);
  const web3LiveOps = buildWeb3LiveOpsPacket({
    state: web3State,
    productionSupervisor: web3ProductionSupervisor,
    emergencyStop: buildWeb3EmergencyStopDrillReceipt({ reason: "health research handoff preview", operator_ack: true }),
    accounting: web3Accounting,
  });
  const web3SupervisedRunway = buildWeb3SupervisedLiveRunway({
    state: web3State,
    wallet: buildWeb3DedicatedWalletPacket(web3State),
    jupiter: buildWeb3JupiterOrderPacket(web3State),
    signer: buildWeb3SignerCredentialPacket(web3State),
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
  const web3RequestPacket = buildWeb3OperatorRequestPacket(web3Handoff);
  const web3Cutover = buildWeb3CutoverBlockerBoard({
    requestPacket: web3RequestPacket,
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
  });
  const web3ManualLiveReview = buildWeb3ManualLiveReviewPacket({
    state: web3State,
    checklist: web3LaunchChecklist,
    preflight: web3Preflight,
    liveOps: web3LiveOps,
    runway: web3SupervisedRunway,
  });
  const web3ResearchHandoff = buildWeb3ResearchHandoffPacket({
    state: web3State,
    usability: web3Usability,
    handoff: web3Handoff,
    requestPacket: web3RequestPacket,
    cutover: web3Cutover,
    runbook: web3Runbook,
    preflight: web3Preflight,
    runway: web3SupervisedRunway,
    manualLiveReview: web3ManualLiveReview,
  });
  return NextResponse.json({
    status: "ok",
    web3_daemon_supervisor: web3DaemonSupervisor,
    web3_production_supervisor: web3ProductionSupervisor,
    web3_promoted_paper_autopilot: web3PromotedPaperAutopilot,
    web3_profit_proof: buildWeb3ProfitProofReadiness({ promotedHealth: web3PromotedPaperAutopilot }),
    web3_research_handoff: buildWeb3ResearchHandoffHealth(web3ResearchHandoff),
  });
}
