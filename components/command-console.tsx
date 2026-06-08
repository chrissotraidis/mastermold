"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";

const SUGGESTED = [
  "What should I look at first?",
  "Argue the bear case on the top idea",
  "What changed overnight?",
  "How's my recent hit-rate?",
];

/**
 * The way you talk to Master Mold. Submitting routes to the chat surface with your
 * question; Master Mold answers grounded in today's briefing, alerts, and track record.
 */
export function CommandConsole() {
  const router = useRouter();
  const [q, setQ] = useState("");

  function go(query: string) {
    const trimmed = query.trim();
    router.push(trimmed ? `/chat?q=${encodeURIComponent(trimmed)}` : "/chat");
  }

  return (
    <div className="relative z-20 w-full max-w-xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(q);
        }}
        className="flex items-center gap-3 border border-violet/40 bg-surface-dim/90 px-4 py-3.5 chamfer-sm inner-glow backdrop-blur-xl transition-colors focus-within:border-violet"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask Master Mold anything…"
          aria-label="Ask Master Mold"
          className="w-full bg-transparent text-base text-on-surface placeholder:text-outline focus:outline-none"
        />
        <button
          type="submit"
          aria-label="Send"
          className="bg-violet/20 p-2 text-violet chamfer-sm transition-colors hover:bg-violet/40 active:scale-95"
        >
          <Send className="size-4" />
        </button>
      </form>

      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {SUGGESTED.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => go(s)}
            className="border border-outline-variant/40 bg-surface-dim/50 px-3 py-1.5 text-[13px] text-on-surface-variant chamfer-sm transition-colors hover:border-violet/50 hover:text-violet"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
