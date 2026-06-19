import { NextResponse } from "next/server";
import {
  buildWeb3WalletOwnershipReceipt,
  validateWalletOwnershipInput,
  type Web3WalletOwnershipReceipt,
} from "@/src/db/web3-wallet-ownership";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse<Web3WalletOwnershipReceipt | { error: string }>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "request body must be JSON." }, { status: 422 });
  }

  const parsed = validateWalletOwnershipInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 422 });
  }

  return NextResponse.json(await buildWeb3WalletOwnershipReceipt(parsed.value));
}
