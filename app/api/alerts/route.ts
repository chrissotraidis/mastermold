import { NextResponse } from "next/server";
import { toPublicAlert, type PublicAlert } from "@/lib/public-api-copy";
import { parseAsOf } from "@/src/db/bitemporal";
import { getAlerts } from "@/src/db/alerts";

export function GET(request: Request): NextResponse<PublicAlert[] | { error: string }> {
  const parsed = parseAsOf(new URL(request.url).searchParams.get("as_of"));

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 422 });
  }

  return NextResponse.json(getAlerts(parsed.asOf).map(toPublicAlert));
}
