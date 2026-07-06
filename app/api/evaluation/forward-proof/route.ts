import { getForwardProofStatus, startForwardMeasurement } from "@/src/db/forward-proof";

export async function GET(): Promise<Response> {
  return Response.json(getForwardProofStatus());
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => ({}));
  const proof = startForwardMeasurement({
    min_logged_calls: (body as { min_logged_calls?: unknown }).min_logged_calls,
    min_resolved_calls: (body as { min_resolved_calls?: unknown }).min_resolved_calls,
    trigger: (body as { trigger?: unknown }).trigger,
  });
  return Response.json(proof, { status: 201 });
}
