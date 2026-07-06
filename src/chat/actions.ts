/**
 * Chat actions — the small, bounded set of things Master Mold (the chat model)
 * is allowed to DO, not just say. Third instance of the house pattern: the
 * model proposes a TYPED intent, pure code validates, and execution goes
 * through the SAME clamped/validated control functions the panel and the
 * nightly Analyst already use. Nothing here has powers of its own.
 *
 * Tiers (docs/chat-actions.md):
 * - instant: always-safe, executed the moment they're parsed (halting is
 *   always safe; stopping paper is reversible; acknowledging an alert is
 *   cosmetic).
 * - confirm: the model's reply renders a chip; the OPERATOR's tap executes
 *   (arming the bot, strategy-parameter changes — still bound by the same
 *   hard clamps that bind the Analyst).
 * - Structurally impossible via chat (not in the type): kill-switch RELEASE,
 *   live-mode arming, cap edits, anything touching wallets or secrets.
 *
 * Every execution is logged to the autopilot activity tape as "chat".
 */

import { setKillSwitch, setMode } from "@/src/autopilot/control";
import { PARAM_CLAMPS, type ParamKey } from "@/src/autopilot/params";
import { autopilotStore } from "@/src/autopilot/store";
import { acknowledgeAlert } from "@/src/db/alerts";

export type ChatActionIntent =
  | { kind: "halt" }
  | { kind: "stop" }
  | { kind: "arm_paper" }
  | { kind: "ack_alert"; alert_id: string }
  | { kind: "set_param"; changes: Record<string, number>; reason?: string };

export type ActionTier = "instant" | "confirm";

export function actionTier(intent: ChatActionIntent): ActionTier {
  return intent.kind === "arm_paper" || intent.kind === "set_param" ? "confirm" : "instant";
}

/** Human line for the confirm chip / result row. */
export function describeAction(intent: ChatActionIntent): string {
  switch (intent.kind) {
    case "halt":
      return "Engage the kill switch (halts the bot)";
    case "stop":
      return "Stop the bot (mode → off)";
    case "arm_paper":
      return "Arm paper trading";
    case "ack_alert":
      return `Acknowledge alert ${intent.alert_id}`;
    case "set_param": {
      const parts = Object.entries(intent.changes).map(([key, value]) => `${key} → ${value}`);
      return `Change strategy params: ${parts.join(", ")}`;
    }
  }
}

/** Strict parse of a model-emitted action JSON object. Null = not an action. */
export function parseActionIntent(raw: unknown): ChatActionIntent | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  switch (obj.kind) {
    case "halt":
    case "stop":
    case "arm_paper":
      return { kind: obj.kind };
    case "ack_alert":
      return typeof obj.alert_id === "string" && obj.alert_id.length > 0 ? { kind: "ack_alert", alert_id: obj.alert_id } : null;
    case "set_param": {
      if (!obj.changes || typeof obj.changes !== "object") return null;
      const changes: Record<string, number> = {};
      for (const [key, value] of Object.entries(obj.changes as Record<string, unknown>)) {
        // Only known clamped params pass; anything else makes the whole
        // intent invalid rather than silently dropping keys.
        if (!(key in PARAM_CLAMPS) || typeof value !== "number" || !Number.isFinite(value)) return null;
        changes[key] = value;
      }
      if (Object.keys(changes).length === 0) return null;
      return { kind: "set_param", changes, reason: typeof obj.reason === "string" ? obj.reason.slice(0, 200) : undefined };
    }
    default:
      return null;
  }
}

/** The fenced block the model emits inside a reply: ```action\n{...}\n``` */
export function extractActionBlock(text: string): { intent: ChatActionIntent; blockText: string } | null {
  const match = text.match(/```action\s*\n([\s\S]*?)```/);
  if (!match) return null;
  try {
    const intent = parseActionIntent(JSON.parse(match[1]));
    return intent ? { intent, blockText: match[0] } : null;
  } catch {
    return null;
  }
}

export type ActionResult = { ok: boolean; message: string };

/**
 * Execute a validated intent through the existing control surfaces. All the
 * real safety lives THERE (mode rules, param clamps, one-changeset budgets);
 * this function only routes and logs.
 */
export function executeChatAction(intent: ChatActionIntent): ActionResult {
  const store = autopilotStore();
  switch (intent.kind) {
    case "halt": {
      setKillSwitch(true);
      store.appendActivity("chat", "Kill switch engaged via chat. Release requires the Autopilot page.");
      return { ok: true, message: "Halted. The kill switch is engaged — release it from the Autopilot page when ready." };
    }
    case "stop": {
      const result = setMode("off");
      if (result.ok) store.appendActivity("chat", "Bot set to off via chat.");
      return result.ok
        ? { ok: true, message: "Bot stopped (mode off). Arm paper trading to resume." }
        : { ok: false, message: result.error ?? "Could not stop the bot." };
    }
    case "arm_paper": {
      const result = setMode("paper");
      if (result.ok) store.appendActivity("chat", "Paper trading armed via chat.");
      return result.ok
        ? { ok: true, message: "Paper trading armed. The daemon picks it up on its next tick." }
        : { ok: false, message: result.error ?? "Could not arm paper mode." };
    }
    case "ack_alert": {
      const updated = acknowledgeAlert(intent.alert_id);
      return updated
        ? { ok: true, message: `Alert acknowledged: ${updated.message}` }
        : { ok: false, message: "That alert id was not found." };
    }
    case "set_param": {
      const reason = `via chat${intent.reason ? `: ${intent.reason}` : ""}`;
      const applied = store.applyParamChangeset(intent.changes as Partial<Record<ParamKey, number>>, "operator", reason);
      if (!applied.ok) return { ok: false, message: `Refused by the rails: ${applied.error}` };
      store.appendActivity("chat", `Strategy params changed via chat: ${describeAction(intent).replace("Change strategy params: ", "")}.`);
      return { ok: true, message: `Applied. ${describeAction(intent).replace("Change strategy params: ", "")} — the daemon reads it next tick. Logged to the changelog.` };
    }
  }
}
