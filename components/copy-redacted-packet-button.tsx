"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

type CopyRedactedPacketButtonProps = {
  text: string;
  label?: string;
  copiedLabel?: string;
  ariaLabel?: string;
  className?: string;
};

export function CopyRedactedPacketButton({
  text,
  label = "Copy packet",
  copiedLabel = "Copied",
  ariaLabel = "Copy redacted packet",
  className,
}: CopyRedactedPacketButtonProps) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  async function copyPacket() {
    setFailed(false);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setFailed(true);
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={copyPacket}
      className={cn(
        "inline-flex min-h-9 items-center gap-1.5 rounded-md border border-engine/30 bg-engine/[0.08] px-2 text-xs font-semibold text-engine transition hover:bg-engine/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-engine/60",
        failed && "border-caution/40 bg-caution/[0.08] text-caution hover:bg-caution/[0.12] focus-visible:ring-caution/60",
        className,
      )}
      aria-label={ariaLabel}
      title={failed ? "Clipboard access was blocked; select the redacted text below instead." : ariaLabel}
    >
      {copied ? <Check className="size-3.5 shrink-0" aria-hidden="true" /> : <Copy className="size-3.5 shrink-0" aria-hidden="true" />}
      <span>{failed ? "Select text" : copied ? copiedLabel : label}</span>
    </button>
  );
}
