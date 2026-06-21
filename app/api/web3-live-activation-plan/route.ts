import { NextResponse } from "next/server";
import { GET as CREDENTIAL_REQUIREMENTS_GET } from "@/app/api/web3-credential-requirements/route";
import { GET as LIVE_AUTONOMY_READINESS_GET } from "@/app/api/web3-live-autonomy-readiness/route";
import { GET as LIVE_USABILITY_BLOCKERS_GET } from "@/app/api/web3-live-usability-blockers/route";
import { buildWeb3LiveActivationPlan, type Web3LiveActivationPlan } from "@/src/db/web3-live-activation-plan";
import type { Web3CredentialRequirementsReceipt } from "@/src/db/web3-credential-requirements";
import type { Web3LiveUsabilityBlockersReceipt } from "@/src/db/web3-live-usability-blockers";
import type { Web3TradingState } from "@/src/db/web3-trading";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse<Web3LiveActivationPlan | { error: string }>> {
  const [requirementsResponse, liveUsabilityResponse, liveAutonomyResponse] = await Promise.all([
    CREDENTIAL_REQUIREMENTS_GET(request),
    LIVE_USABILITY_BLOCKERS_GET(new Request(withRowsAll(request.url))),
    LIVE_AUTONOMY_READINESS_GET(request),
  ]);
  const [requirementsPayload, liveUsabilityPayload, liveAutonomyPayload] = await Promise.all([
    requirementsResponse.json().catch(() => null) as Promise<Web3CredentialRequirementsReceipt | { error: string } | null>,
    liveUsabilityResponse.json().catch(() => null) as Promise<Web3LiveUsabilityBlockersReceipt | { error: string } | null>,
    liveAutonomyResponse.json().catch(() => null) as Promise<Web3TradingState["autonomous_live_autonomy_readiness"] | { error: string } | null>,
  ]);

  if (!requirementsResponse.ok || !requirementsPayload || "error" in requirementsPayload) {
    return NextResponse.json(errorPayload(requirementsPayload, "Credential requirements source packet failed."), {
      status: requirementsResponse.status,
    });
  }
  if (!liveUsabilityResponse.ok || !liveUsabilityPayload || "error" in liveUsabilityPayload) {
    return NextResponse.json(errorPayload(liveUsabilityPayload, "Live usability source packet failed."), {
      status: liveUsabilityResponse.status,
    });
  }
  if (!liveAutonomyResponse.ok || !liveAutonomyPayload || "error" in liveAutonomyPayload) {
    return NextResponse.json(errorPayload(liveAutonomyPayload, "Live autonomy readiness source packet failed."), {
      status: liveAutonomyResponse.status,
    });
  }

  return NextResponse.json(buildWeb3LiveActivationPlan({
    requirements: requirementsPayload,
    liveUsability: liveUsabilityPayload,
    liveAutonomy: liveAutonomyPayload,
  }));
}

function withRowsAll(url: string) {
  const nextUrl = new URL(url);
  nextUrl.searchParams.set("rows", "all");
  return nextUrl.toString();
}

function errorPayload(payload: unknown, fallback: string) {
  return payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
    ? { error: payload.error }
    : { error: fallback };
}
