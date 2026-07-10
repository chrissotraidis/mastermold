"use client";

import { useState } from "react";

/** Fires a real notification through the same path fills and halts use, so
 * "configured" means proven, not assumed. */
export function NotificationTestButton() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function sendTest() {
    setBusy(true);
    setMessage("Sending…");
    try {
      const response = await fetch("/api/notifications/test", { method: "POST" });
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string; channels?: { telegram?: boolean; desktop?: boolean } }
        | null;
      if (!response.ok || !body?.ok) {
        setMessage(body?.error ?? "Test failed.");
        return;
      }
      const channels = [body.channels?.telegram ? "Telegram" : null, body.channels?.desktop ? "desktop" : null]
        .filter(Boolean)
        .join(" and ");
      setMessage(`Test sent via ${channels}. Check your device.`);
    } catch {
      setMessage("Test failed — is the server running?");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => void sendTest()}
        disabled={busy}
        className="inline-flex min-h-11 items-center justify-center rounded-md border border-outline-variant/40 px-3 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-dim/40 disabled:opacity-50 sm:min-h-8"
      >
        Send test notification
      </button>
      <span aria-live="polite" className="text-xs text-outline">
        {message}
      </span>
    </div>
  );
}
