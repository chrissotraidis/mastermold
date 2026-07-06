"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

export const TODAY_CHAT_PROMPT_EVENT = "mastermold:today-chat-prompt";

export function TodayChatAskButton({
  prompt,
  children,
  className,
}: {
  prompt: string;
  children: ReactNode;
  className?: string;
}) {
  function askInTodayChat() {
    window.dispatchEvent(
      new CustomEvent<{ prompt: string }>(TODAY_CHAT_PROMPT_EVENT, {
        detail: { prompt },
      }),
    );

    const chat = document.getElementById("today-chat");
    chat?.scrollIntoView({ block: "start", inline: "nearest" });

    window.requestAnimationFrame(() => {
      chat?.querySelector<HTMLTextAreaElement>("textarea")?.focus();
    });
  }

  return (
    <button
      type="button"
      onClick={askInTodayChat}
      className={cn(
        "inline-flex min-h-9 shrink-0 items-center justify-center rounded-md border border-violet/20 bg-surface-high/25 px-2 text-[11px] font-semibold text-violet transition hover:border-violet/45 hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet",
        className,
      )}
    >
      {children}
    </button>
  );
}
