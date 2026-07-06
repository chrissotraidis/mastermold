import { toPublicBrainState } from "@/lib/public-api-copy";
import { initializeMarketBrain } from "@/src/db/brain";

export async function POST(): Promise<Response> {
  const state = await initializeMarketBrain();
  return Response.json(toPublicBrainState(state));
}
