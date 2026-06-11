"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function TodayMemoryRefresh() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  function refreshMemory() {
    setMessage("Saving this page for chat...");
    startTransition(async () => {
      try {
        const response = await fetch("/api/brain/initialize", { method: "POST" });
        const body = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(body.error ?? "Could not save this page for chat.");
        }
        setMessage("Saved for chat. Import holdings again when you want current balances.");
        router.refresh();
      } catch (caught) {
        setMessage(caught instanceof Error ? caught.message : "Could not save this page for chat.");
      }
    });
  }

  return (
    <div className="mt-4 border-t border-outline-variant/35 pt-3">
      <Button
        type="button"
        onClick={refreshMemory}
        disabled={isPending}
        variant="outline"
        className="min-h-11 w-full border-outline-variant/45 bg-surface-dim/45 text-on-surface hover:bg-violet/10 hover:text-on-surface"
      >
        {isPending ? <Loader2 aria-hidden="true" className="animate-spin" /> : <RefreshCw aria-hidden="true" />}
        Save context for chat
      </Button>
      <p className="mt-2 text-xs leading-5 text-outline" aria-live="polite">
        {message || "Saves this app view for chat. It does not check news, markets, or account balances."}
      </p>
    </div>
  );
}
