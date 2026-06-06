import { NextResponse } from "next/server";
import { parseAsOf } from "@/src/db/bitemporal";
import { getPortfolio, type PortfolioJson } from "@/src/db/portfolio";

export function GET(
  request: Request,
): NextResponse<PortfolioJson | { error: string }> {
  const parsed = parseAsOf(new URL(request.url).searchParams.get("as_of"));

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 422 });
  }

  return NextResponse.json(getPortfolio(parsed.asOf));
}
