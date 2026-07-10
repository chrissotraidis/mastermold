import { NextResponse } from "next/server";

import { notifyConfigFromEnv, notifyEnabled, notifyOperator } from "@/src/autopilot/notify";

// Notification config lives in .env.local (the daemon must read it, so the
// browser can't own it). This endpoint lets Settings prove the pipe works:
// it fires a real notification through the same path fills and halts use.

export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  const config = notifyConfigFromEnv();
  if (!notifyEnabled(config)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "No notification channel is configured. Add NOTIFY_TELEGRAM_BOT_TOKEN + NOTIFY_TELEGRAM_CHAT_ID (or NOTIFY_DESKTOP=true) to .env.local, then restart.",
      },
      { status: 409 },
    );
  }
  // Seconds in the message keep repeat tests outside the dedupe window.
  notifyOperator("daemon", `Test notification from Settings · ${new Date().toISOString().slice(11, 19)} UTC`);
  return NextResponse.json({
    ok: true,
    channels: {
      telegram: Boolean(config.telegram_token && config.telegram_chat_id),
      desktop: config.desktop,
    },
  });
}
