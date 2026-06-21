import { NextResponse } from "next/server";
import { GET as CREDENTIAL_REQUIREMENTS_GET } from "@/app/api/web3-credential-requirements/route";
import { GET as FIRST_CANARY_DRILL_GET } from "@/app/api/web3-first-canary-drill/route";
import {
  buildWeb3FirstCanaryHandoffReceipt,
  type Web3FirstCanaryHandoffReceipt,
} from "@/src/db/web3-first-canary-handoff";
import type { Web3CredentialRequirementsReceipt } from "@/src/db/web3-credential-requirements";
import type { Web3FirstCanaryDrillReceipt } from "@/src/db/web3-first-canary-drill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
): Promise<NextResponse<Web3FirstCanaryHandoffReceipt | { error: string }>> {
  const [drillResponse, requirementsResponse] = await Promise.all([
    FIRST_CANARY_DRILL_GET(request),
    CREDENTIAL_REQUIREMENTS_GET(request),
  ]);
  const drill = (await drillResponse.json().catch(() => null)) as
    | Web3FirstCanaryDrillReceipt
    | { error: string }
    | null;
  const requirements = (await requirementsResponse.json().catch(() => null)) as
    | Web3CredentialRequirementsReceipt
    | { error: string }
    | null;

  if (!drillResponse.ok || !drill || "error" in drill) {
    const error = drill && "error" in drill ? drill : { error: "First canary drill source packet failed." };
    return NextResponse.json(error, { status: drillResponse.status });
  }
  if (!requirementsResponse.ok || !requirements || "error" in requirements) {
    const error = requirements && "error" in requirements ? requirements : { error: "Credential requirements source packet failed." };
    return NextResponse.json(error, { status: requirementsResponse.status });
  }

  return NextResponse.json(buildWeb3FirstCanaryHandoffReceipt({
    drill,
    requirements,
  }));
}
