import { NextResponse } from "next/server";
import { GET as LIVE_ACTIVATION_PLAN_GET } from "@/app/api/web3-live-activation-plan/route";
import {
  buildWeb3LiveActivationIntakeReceipt,
  buildWeb3LiveActivationIntakeSchema,
  type Web3LiveActivationIntakeReceipt,
  type Web3LiveActivationIntakeSchema,
} from "@/src/db/web3-live-activation-intake";
import type { Web3LiveActivationPlan } from "@/src/db/web3-live-activation-plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse<Web3LiveActivationIntakeSchema>> {
  return NextResponse.json(buildWeb3LiveActivationIntakeSchema());
}

export async function POST(request: Request): Promise<NextResponse<Web3LiveActivationIntakeReceipt | { error: string }>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 422 });
  }

  const planResponse = await LIVE_ACTIVATION_PLAN_GET(request);
  const planPayload = await planResponse.json().catch(() => null) as Web3LiveActivationPlan | { error: string } | null;
  if (!planResponse.ok || !planPayload || "error" in planPayload) {
    return NextResponse.json(errorPayload(planPayload, "Live activation plan source packet failed."), {
      status: planResponse.status,
    });
  }

  const receipt = buildWeb3LiveActivationIntakeReceipt({
    body,
    activationPlan: planPayload,
  });

  return NextResponse.json(receipt, {
    status: receipt.status === "unsafe-rejected" ? 422 : 200,
  });
}

function errorPayload(payload: unknown, fallback: string) {
  return payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
    ? { error: payload.error }
    : { error: fallback };
}
