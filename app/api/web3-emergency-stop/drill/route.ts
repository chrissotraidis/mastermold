import { NextResponse } from "next/server";
import {
  buildWeb3EmergencyStopDrillReceipt,
  type Web3EmergencyStopDrillReceipt,
  type Web3EmergencyStopDrillRequest,
} from "@/src/db/web3-emergency-stop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse<Web3EmergencyStopDrillReceipt | { error: string }>> {
  const body = (await request.json().catch(() => null)) as Web3EmergencyStopDrillRequest | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body must be an emergency-stop drill object." }, { status: 422 });
  }
  if (body.reason !== undefined && (typeof body.reason !== "string" || body.reason.trim().length > 240)) {
    return NextResponse.json({ error: "reason must be a string up to 240 characters." }, { status: 422 });
  }
  if (body.operator_ack !== true) {
    return NextResponse.json({ error: "operator_ack must be true before recording an emergency-stop drill." }, { status: 422 });
  }

  return NextResponse.json(buildWeb3EmergencyStopDrillReceipt(body));
}

export function GET(): NextResponse<Web3EmergencyStopDrillReceipt> {
  return NextResponse.json(buildWeb3EmergencyStopDrillReceipt({
    reason: "readiness preview",
    operator_ack: true,
  }));
}
