import { NextResponse } from "next/server";
import { getWeb3MarketMonitorHistory } from "@/src/db/web3-market-monitor-history";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getWeb3MarketMonitorHistory());
}
