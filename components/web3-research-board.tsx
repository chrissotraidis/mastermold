"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { ResearchBoard, type BoardProgram } from "@/components/polymarket-research-board";
import { toast } from "@/components/ui/toast";

/** Web3 lab research program: evidence vs pre-registered gates, no orders. */
export function Web3ResearchBoard() {
  const [program, setProgram] = useState<(BoardProgram & { daemon: string }) | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(async () => {
    const response = await fetch("/api/autopilot/research", { cache: "no-store" });
    if (response.ok) setProgram(await response.json());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!program) return <div className="mm-panel p-5 text-sm text-on-surface-variant">Loading the research program…</div>;

  return (
    <ResearchBoard
      program={program}
      pending={pending}
      canControl
      lastCycleAt={null}
      runLabel="Sample costs"
      runTitle="Reads the public Jito tip floor and SOL price. Sends no transaction."
      statusLine={`Bot daemon ${program.daemon} · mode off · live money locked`}
      onRunResearch={() =>
        startTransition(async () => {
          const response = await fetch("/api/autopilot/research", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "sample_costs" }),
          });
          const body = await response.json();
          if (!response.ok) {
            toast({ title: "Cost sample failed", description: body.error, tone: "error" });
            return;
          }
          setProgram(body);
          toast({ title: "Costs sampled", description: "W3 updated from live tip-floor data." });
        })
      }
    />
  );
}
