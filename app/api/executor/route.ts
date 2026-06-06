import { NextResponse } from "next/server";
import { parseAsOf } from "@/src/db/bitemporal";
import { getExecutor, type ExecutorJson } from "@/src/db/executor";

export function GET(
  request: Request,
): NextResponse<ExecutorJson | { error: string }> {
  const parsed = parseAsOf(new URL(request.url).searchParams.get("as_of"));

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 422 });
  }

  return NextResponse.json(getExecutor(parsed.asOf));
}
