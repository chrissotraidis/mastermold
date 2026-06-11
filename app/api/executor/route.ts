import { NextResponse } from "next/server";
import { toPublicExecutor, type PublicExecutor } from "@/lib/public-api-copy";
import { parseAsOf } from "@/src/db/bitemporal";
import { getExecutor } from "@/src/db/executor";

export function GET(
  request: Request,
): NextResponse<PublicExecutor | { error: string }> {
  const parsed = parseAsOf(new URL(request.url).searchParams.get("as_of"));

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 422 });
  }

  return NextResponse.json(toPublicExecutor(getExecutor(parsed.asOf)));
}
