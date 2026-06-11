import { toPublicBrainScheduleCheck, toPublicBrainState } from "@/lib/public-api-copy";
import { configureBrainSchedule, getBrainState, runBrainScheduleCheck } from "@/src/db/brain";

export async function GET(): Promise<Response> {
  return Response.json({ ok: true, schedule: toPublicBrainState(getBrainState()).schedule });
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    enabled?: unknown;
    force?: unknown;
    trigger?: unknown;
  };

  if (typeof body.enabled === "boolean") {
    const result = configureBrainSchedule({
      enabled: body.enabled,
      trigger: typeof body.trigger === "string" ? body.trigger : "manual",
    });
    return Response.json(toPublicBrainScheduleCheck(result));
  }

  const result = await runBrainScheduleCheck({
    force: body.force === true,
    trigger: typeof body.trigger === "string" ? body.trigger : "manual",
  });

  return Response.json(toPublicBrainScheduleCheck(result), { status: result.ok ? 200 : 500 });
}
