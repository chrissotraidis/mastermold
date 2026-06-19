import { NextResponse } from "next/server";
import {
  buildWeb3LocalCredentialInstallHealth,
  installWeb3LocalCredentials,
  type Web3LocalCredentialInstallReceipt,
} from "@/src/db/web3-local-credential-install";

export async function GET(request: Request): Promise<NextResponse<Web3LocalCredentialInstallReceipt>> {
  const receipt = buildWeb3LocalCredentialInstallHealth(request);
  return NextResponse.json(receipt, { status: receipt.status === "blocked" ? 403 : 200 });
}

export async function POST(request: Request): Promise<NextResponse<Web3LocalCredentialInstallReceipt | { error: string }>> {
  const body = await request.json().catch(() => null);
  const receipt = installWeb3LocalCredentials(body, request);
  if (receipt.status === "blocked") {
    return NextResponse.json(receipt, { status: 403 });
  }
  if (receipt.status === "invalid") {
    return NextResponse.json(receipt, { status: 422 });
  }
  return NextResponse.json(receipt);
}
