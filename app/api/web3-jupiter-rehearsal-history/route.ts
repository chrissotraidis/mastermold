import { NextResponse } from "next/server";
import { getWeb3JupiterRehearsalHistory } from "@/src/db/web3-jupiter-rehearsal-history";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getWeb3JupiterRehearsalHistory());
}
