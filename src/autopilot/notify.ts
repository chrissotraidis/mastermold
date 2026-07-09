/**
 * Operator notifications (2026-07-09): an autonomous bot that cannot reach
 * you is just unattended. This pushes the moments that matter — fills, halts,
 * daemon lifecycle, analyst changes, promotion transitions — to Telegram
 * (cross-device, free) and/or the macOS notification center.
 *
 * Local-only configuration via ignored env (.env.local / shell):
 *   NOTIFY_TELEGRAM_BOT_TOKEN=  bot token from @BotFather
 *   NOTIFY_TELEGRAM_CHAT_ID=    your chat id (message the bot, then getUpdates)
 *   NOTIFY_DESKTOP=true         macOS notification center (osascript)
 *
 * Fire-and-forget by design: a notification failure must never fail a tick,
 * so every path swallows errors. Identical messages dedupe for 10 minutes so
 * a wedged loop cannot spam a phone.
 */

import { execFile } from "node:child_process";

export type NotifyKind = "entry" | "exit" | "halt" | "daemon" | "analyst" | "v3" | "error";

export const NOTIFY_DEDUPE_MS = 10 * 60_000;
const TELEGRAM_TIMEOUT_MS = 5_000;

/** Pure dedupe rule, exported for tests. */
export function shouldSend(lastSentMs: number | undefined, nowMs: number): boolean {
  return lastSentMs === undefined || nowMs - lastSentMs >= NOTIFY_DEDUPE_MS;
}

/** Pure message formatter: short, phone-notification-shaped. */
export function formatNotification(kind: NotifyKind, message: string): string {
  const tag = kind === "halt" || kind === "error" ? "⛔" : kind === "entry" || kind === "exit" ? "💱" : "🤖";
  return `${tag} Master Mold ${kind}: ${message}`.slice(0, 500);
}

export type NotifyConfig = {
  telegram_token: string | null;
  telegram_chat_id: string | null;
  desktop: boolean;
};

export function notifyConfigFromEnv(env: NodeJS.ProcessEnv = process.env): NotifyConfig {
  return {
    telegram_token: env.NOTIFY_TELEGRAM_BOT_TOKEN?.trim() || null,
    telegram_chat_id: env.NOTIFY_TELEGRAM_CHAT_ID?.trim() || null,
    desktop: env.NOTIFY_DESKTOP === "true" || env.NOTIFY_DESKTOP === "1",
  };
}

export function notifyEnabled(config: NotifyConfig = notifyConfigFromEnv()): boolean {
  return Boolean((config.telegram_token && config.telegram_chat_id) || config.desktop);
}

async function sendTelegram(config: NotifyConfig, text: string, doFetch: typeof fetch = fetch): Promise<void> {
  if (!config.telegram_token || !config.telegram_chat_id) return;
  try {
    await doFetch(`https://api.telegram.org/bot${config.telegram_token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: config.telegram_chat_id, text }),
      signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
    });
  } catch {
    // Notification failures are silent by contract.
  }
}

function sendDesktop(config: NotifyConfig, text: string): void {
  if (!config.desktop || process.platform !== "darwin") return;
  try {
    // osascript arguments are passed as argv (no shell), so the text needs
    // only double-quote escaping for the AppleScript literal.
    const safe = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    execFile("osascript", ["-e", `display notification "${safe}" with title "Master Mold"`], () => {});
  } catch {
    // Same contract: never throw.
  }
}

const lastSentByKey = new Map<string, number>();

/** Test seam. */
export function __resetNotifyDedupeForTests(): void {
  lastSentByKey.clear();
}

/**
 * Fire-and-forget operator notification. No-op unless configured; dedupes
 * identical (kind, message) pairs for 10 minutes; never throws or rejects.
 */
export function notifyOperator(
  kind: NotifyKind,
  message: string,
  options: { nowMs?: number; config?: NotifyConfig; fetchImpl?: typeof fetch } = {},
): void {
  const config = options.config ?? notifyConfigFromEnv();
  if (!notifyEnabled(config)) return;
  const nowMs = options.nowMs ?? Date.now();
  const key = `${kind}:${message}`;
  if (!shouldSend(lastSentByKey.get(key), nowMs)) return;
  lastSentByKey.set(key, nowMs);

  const text = formatNotification(kind, message);
  void sendTelegram(config, text, options.fetchImpl ?? fetch);
  sendDesktop(config, text);
}
