import { NextResponse } from "next/server";
import { getWeb3DaemonSupervisorHealth } from "@/src/db/web3-daemon-supervisor";

export function GET() {
  return NextResponse.json({
    status: "ok",
    web3_daemon_supervisor: getWeb3DaemonSupervisorHealth(),
  });
}
