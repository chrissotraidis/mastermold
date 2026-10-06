import { NextResponse } from "next/server";
import { getAutopilotState } from "@/src/autopilot/control";
import { autopilotStore } from "@/src/autopilot/store";
import { sampleExecutionCosts } from "@/src/autopilot/v3/cost-sampler";
import { buildWeb3ResearchProgram } from "@/src/autopilot/v3/research-program";

export const dynamic = "force-dynamic";

function program() {
  const state = getAutopilotState();
  let snapshots: ReturnType<ReturnType<typeof autopilotStore>["candidateSnapshots"]> = [];
  let storeAvailable = true;
  try {
    snapshots = autopilotStore().candidateSnapshots(5_000);
  } catch {
    storeAvailable = false;
  }
  return buildWeb3ResearchProgram({ snapshots, daemon: state.daemon, storeAvailable });
}

export function GET() {
  return NextResponse.json(program());
}

/** { action: "sample_costs" } reads public tip-floor and price data. Sends nothing. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { action?: string } | null;
  if (body?.action !== "sample_costs") return NextResponse.json({ error: "Unknown action." }, { status: 422 });
  const notional = getAutopilotState().caps.max_trade_usd || 25;
  const sample = await sampleExecutionCosts(notional);
  if (!sample) return NextResponse.json({ error: "Tip-floor or price data was unavailable; try again." }, { status: 503 });
  return NextResponse.json(program());
}
