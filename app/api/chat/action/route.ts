import { NextResponse } from "next/server";

import { actionTier, describeAction, executeChatAction, parseActionIntent } from "@/src/chat/actions";
import { isAutopilotStoreUnavailable } from "@/src/autopilot/control";

// Executes a chat action intent. Confirm-tier intents only ever reach this
// endpoint because the operator tapped the confirm chip the model's reply
// rendered; instant-tier intents may be posted directly. All real safety
// (mode rules, param clamps, changeset budgets) lives in the control
// functions this routes to — see src/chat/actions.ts and docs/chat-actions.md.

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Expected a JSON body." }, { status: 400 });
  }
  const intent = parseActionIntent((body as { intent?: unknown })?.intent ?? body);
  if (!intent) {
    return NextResponse.json({ ok: false, message: "Not a recognized chat action." }, { status: 422 });
  }
  // Bot-control intents touch the autopilot store; when its SQLite driver is
  // missing the store throws. The panel returns a clean 503 for exactly this
  // state (and disables its own controls) — the chat path must match rather
  // than 500, so the confirm chip degrades honestly instead of crashing.
  let result;
  try {
    result = executeChatAction(intent);
  } catch (error) {
    if (isAutopilotStoreUnavailable(error)) {
      return NextResponse.json(
        { ok: false, message: "Autopilot controls are unavailable right now.", tier: actionTier(intent) },
        { status: 503 },
      );
    }
    throw error;
  }
  return NextResponse.json({ ...result, tier: actionTier(intent), description: describeAction(intent) }, { status: result.ok ? 200 : 409 });
}
