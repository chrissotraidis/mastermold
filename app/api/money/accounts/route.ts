import { NextResponse } from "next/server";
import { createAccount, parseAccountInput } from "@/src/db/money";

export async function POST(request: Request) {
  const parsed = parseAccountInput(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 422 });
  return NextResponse.json({ account: createAccount(parsed.input) });
}
