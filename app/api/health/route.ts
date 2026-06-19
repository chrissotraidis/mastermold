import { NextResponse } from "next/server";
import { getWeb3DaemonSupervisorHealth } from "@/src/db/web3-daemon-supervisor";
import { getWeb3PromotedPaperAutopilotHealth } from "@/src/db/web3-promoted-paper-autopilot";
import { buildWeb3ProductionSupervisorReadiness } from "@/src/db/web3-production-supervisor";
import { buildWeb3ProfitProofReadiness } from "@/src/db/web3-profit-proof";

export function GET() {
  const web3DaemonSupervisor = getWeb3DaemonSupervisorHealth();
  const web3PromotedPaperAutopilot = getWeb3PromotedPaperAutopilotHealth();
  return NextResponse.json({
    status: "ok",
    web3_daemon_supervisor: web3DaemonSupervisor,
    web3_production_supervisor: buildWeb3ProductionSupervisorReadiness(web3DaemonSupervisor),
    web3_promoted_paper_autopilot: web3PromotedPaperAutopilot,
    web3_profit_proof: buildWeb3ProfitProofReadiness({ promotedHealth: web3PromotedPaperAutopilot }),
  });
}
