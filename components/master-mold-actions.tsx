"use client";

import { type ReactNode } from "react";
import { MessageSquareText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatPageContext } from "@/src/db/chat";

export const MASTER_MOLD_CHAT_EVENT = "mastermold:open-chat";

export type MasterMoldChatEventDetail = {
  prompt?: string;
  pageContext?: ChatPageContext;
};

export function openMasterMoldChat(prompt?: string, pageContext?: ChatPageContext) {
  window.dispatchEvent(
    new CustomEvent<MasterMoldChatEventDetail>(MASTER_MOLD_CHAT_EVENT, {
      detail: { prompt, pageContext },
    }),
  );
}

export function AskMasterMoldButton({
  prompt,
  pageContext,
  children = "Ask Master Mold",
  className,
  variant = "outline",
}: {
  prompt: string;
  pageContext?: ChatPageContext;
  children?: ReactNode;
  className?: string;
  variant?: "outline" | "primary";
}) {
  function ask() {
    openMasterMoldChat(prompt, pageContext);
  }

  return (
    <button
      type="button"
      onClick={ask}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet",
        variant === "primary"
          ? "bg-violet text-void hover:bg-violet/90"
          : "border border-violet/35 bg-violet/10 text-violet hover:bg-violet/15",
        className,
      )}
    >
      <MessageSquareText aria-hidden="true" className="size-4" />
      {children}
    </button>
  );
}
