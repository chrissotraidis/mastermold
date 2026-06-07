"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";

const SUGGESTED = [
  "Summarize today's briefing",
  "What's the bear case on the top card?",
  "Show me critical alerts",
  "How calibrated am I lately?",
];

/**
 * The command console docked beneath the sentinel face — the primary way to drive the
 * app by talking to MasterMold. Submitting routes to the chat surface with the query;
 * the vocal HUD streams MasterMold's current console state.
 */
export function CommandConsole({ vocal }: { vocal: string[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");

  function go(query: string) {
    const trimmed = query.trim();
    router.push(trimmed ? `/chat?q=${encodeURIComponent(trimmed)}` : "/chat");
  }

  return (
    <div className="relative z-20 -mt-12 w-full max-w-xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(q);
        }}
        className="flex items-center gap-3 border-b border-violet/50 bg-surface-dim/95 px-4 py-3 chamfer-sm inner-glow backdrop-blur-xl"
      >
        <Terminal aria-hidden="true" className="size-5 shrink-0 text-violet" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask MasterMold…"
          aria-label="Ask MasterMold"
          className="w-full bg-transparent font-mono text-base text-on-surface placeholder:text-outline focus:outline-none"
        />
        <button
          type="submit"
          aria-label="Send to MasterMold"
          className="bg-violet/20 p-2 text-violet chamfer-sm transition-colors hover:bg-violet/40 active:scale-95"
        >
          <Send className="size-4" style={{ fontVariationSettings: "'FILL' 1" }} />
        </button>
      </form>

      <div className="relative h-24 overflow-y-auto border-x border-b border-outline-variant/30 bg-panel p-4 font-mono text-[13px] leading-5 text-on-surface-variant inner-glow">
        <div className="pointer-events-none absolute inset-0 brushed-metal opacity-20" aria-hidden="true" />
        {vocal.map((line, i) => (
          <p key={i} className={cn("mb-1", i === 0 ? "text-violet" : i === 1 ? "opacity-80" : "opacity-50")}>
            <span className={i === 0 ? "text-violet" : "text-outline"}>&gt;</span> {line}
          </p>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {SUGGESTED.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => go(s)}
            className="border border-outline-variant/40 bg-surface-dim/50 px-3 py-1 font-mono text-[11px] text-on-surface-variant chamfer-sm transition-colors hover:border-violet/50 hover:text-violet"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
