import { NextResponse } from "next/server";

import { GET as RESEARCH_HANDOFF_GET } from "@/app/api/web3-research-handoff-packet/route";
import {
  buildWeb3CredentialRequirementsReceipt,
  type Web3CredentialRequirementsReceipt,
} from "@/src/db/web3-credential-requirements";
import type { Web3ResearchHandoffPacket } from "@/src/db/web3-research-handoff-packet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
): Promise<NextResponse<Web3CredentialRequirementsReceipt | { error: string }>> {
  const researchResponse = await RESEARCH_HANDOFF_GET(request);
  const payload = (await researchResponse.json().catch(() => null)) as
    | Web3ResearchHandoffPacket
    | { error: string }
    | null;

  if (!researchResponse.ok || !payload || "error" in payload) {
    const error = payload && "error" in payload ? payload : { error: "Credential requirements source packet failed." };
    return NextResponse.json(error, { status: researchResponse.status });
  }

  return NextResponse.json(buildWeb3CredentialRequirementsReceipt(payload));
}
