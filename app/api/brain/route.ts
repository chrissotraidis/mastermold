import { toPublicBrainState } from "@/lib/public-api-copy";
import { parseAsOf } from "@/src/db/bitemporal";
import { getBrainState } from "@/src/db/brain";

export async function GET(request: Request): Promise<Response> {
  const parsed = parseAsOf(new URL(request.url).searchParams.get("as_of"));

  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 422 });
  }

  return Response.json(toPublicBrainState(getBrainState(parsed.asOf)));
}
