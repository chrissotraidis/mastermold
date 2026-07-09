import Link from "next/link";

import { getAutopilotState } from "@/src/autopilot/control";

/**
 * Silent-failure guard (usability audit 2026-07-09): the bot is armed from
 * /trading, but its daemon is a separate process that laptop sleep or a crash
 * kills without a sound — and the only place that showed it was the Autopilot
 * page itself. This banner puts "armed but not actually running" on the page
 * people open every day. Renders nothing when everything is healthy, the bot
 * is deliberately off, or the autopilot store is unavailable.
 */
export function AutomationHealthBanner() {
  let state: ReturnType<typeof getAutopilotState>;
  try {
    state = getAutopilotState();
  } catch {
    return null;
  }
  if (state.runtime_unavailable) return null;
  const armed = state.mode === "paper" || state.mode === "live";
  if (!armed || state.daemon === "live") return null;

  const detail =
    state.daemon === "offline"
      ? "its daemon process is not running"
      : "its daemon has not ticked recently (asleep or wedged)";

  return (
    <div
      role="status"
      className="rounded-md border border-caution/40 bg-caution/10 px-3 py-2 text-xs leading-5 text-on-surface"
    >
      <span className="font-semibold text-caution">Autopilot is armed but {detail}.</span>{" "}
      No market watching or paper trading is happening. Start everything with{" "}
      <code className="rounded bg-surface-dim/70 px-1">npm run up</code> (or just the bot with{" "}
      <code className="rounded bg-surface-dim/70 px-1">npm run autopilot</code>), or stop the bot from the{" "}
      <Link href="/trading" className="font-semibold text-violet hover:text-tertiary">
        Autopilot page
      </Link>
      .
    </div>
  );
}
