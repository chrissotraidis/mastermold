import { NextResponse } from "next/server";

import { actionTier, describeAction, executeChatAction, parseActionIntent } from "@/src/chat/actions";

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
  const result = executeChatAction(intent);
  return NextResponse.json({ ...result, tier: actionTier(intent), description: describeAction(intent) }, { status: result.ok ? 200 : 409 });
}
