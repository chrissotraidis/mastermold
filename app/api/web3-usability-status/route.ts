import { NextResponse } from "next/server";
import { buildWeb3AccountingLedgerReceipt } from "@/src/db/web3-accounting-ledger";
import { getWeb3DaemonSupervisorHealth } from "@/src/db/web3-daemon-supervisor";
import { buildWeb3DedicatedWalletPacket } from "@/src/db/web3-dedicated-wallet-packet";
import { buildWeb3EmergencyStopDrillReceipt } from "@/src/db/web3-emergency-stop";
import { buildWeb3JupiterOrderPacket } from "@/src/db/web3-jupiter-order-packet";
import { buildWeb3AutonomyLaunchChecklist } from "@/src/db/web3-launch-checklist";
import { buildWeb3LiveOpsPacket } from "@/src/db/web3-live-ops-packet";
import { getWeb3PromotedPaperAutopilotHealth } from "@/src/db/web3-promoted-paper-autopilot";
import { buildWeb3ProductionSupervisorReadiness } from "@/src/db/web3-production-supervisor";
import { buildWeb3SignerCredentialPacket } from "@/src/db/web3-signer-credential-packet";
import { buildWeb3SupervisedLiveRunway } from "@/src/db/web3-supervised-live-runway";
import { buildWeb3UsabilityStatus, type Web3UsabilityStatusReceipt } from "@/src/db/web3-usability-status";
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

export async function GET(request: Request): Promise<NextResponse<Web3UsabilityStatusReceipt | { error: string }>> {
  const search = new URL(request.url).searchParams;
  const scenario = normalizeScenario(search.get("scenario"));
  const source = normalizeSource(search.get("source"));
  const account = normalizeAccount(search.get("account"));

  try {
    const state = await getWeb3TradingStateAsync({
      scenario,
      source,
      account,
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
        reason: "usability status preview",
        operator_ack: true,
      }),
      accounting,
    });
    const supervisedRunway = buildWeb3SupervisedLiveRunway({
      state,
      wallet: buildWeb3DedicatedWalletPacket(state),
      jupiter: buildWeb3JupiterOrderPacket(state),
      signer: buildWeb3SignerCredentialPacket(state),
      liveOps,
    });

    return NextResponse.json(buildWeb3UsabilityStatus({
      state,
      launchChecklist,
      supervisedRunway,
    }));
  } catch {
    return NextResponse.json({ error: "Web3 usability status could not be built." }, { status: 500 });
  }
}

function normalizeScenario(value: string | null): TradingScenario {
  return value && isTradingScenario(value) ? value : "breakout";
}

function normalizeSource(value: string | null): TradingMarketSource {
  return value && isTradingMarketSource(value) ? value : "sample";
}

function normalizeAccount(value: string | null): TradingAccountMode {
  return value && isTradingAccountMode(value) ? value : "persistent";
}
