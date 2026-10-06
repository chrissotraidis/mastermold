"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

const KEY = "mastermold.hide-amounts";

/** Read once on load so amounts are hidden before first paint where possible. */
export function applyStoredPrivacy() {
  if (typeof document === "undefined") return false;
  const on = window.localStorage.getItem(KEY) === "1";
  document.documentElement.classList.toggle("mm-private", on);
  return on;
}

/**
 * Hide amounts: blurs every dollar figure (anything drawn with .mm-num) so the
 * app can be opened in public or on a shared screen. Stays on this device only.
 */
export function PrivacyToggle({ className }: { className?: string }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => setHidden(applyStoredPrivacy()), []);
  const toggle = () => {
    const next = !hidden;
    window.localStorage.setItem(KEY, next ? "1" : "0");
    document.documentElement.classList.toggle("mm-private", next);
    setHidden(next);
  };
  const Icon = hidden ? EyeOff : Eye;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={hidden}
      aria-label={hidden ? "Show amounts" : "Hide amounts"}
      title={hidden ? "Show amounts" : "Hide amounts"}
      className={cn(
        "flex size-10 items-center justify-center rounded-xl border border-outline-variant/60 transition-colors hover:border-violet/45 hover:text-violet",
        hidden ? "bg-violet/15 text-violet" : "text-on-surface-variant",
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-4" />
    </button>
  );
}
