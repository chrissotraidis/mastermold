"use client";

import { useState } from "react";
import { BrainCircuit, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Web3ResearchAnswerIntakeReceipt } from "@/src/db/web3-research-answer-intake";

type SettingsWeb3ResearchAnswerConsoleProps = {
  scenario: string;
  source: string;
  account: string;
  cycles: number;
};

export function SettingsWeb3ResearchAnswerConsole({
  scenario,
  source,
  account,
  cycles,
}: SettingsWeb3ResearchAnswerConsoleProps) {
  const [answersText, setAnswersText] = useState("");
  const [receipt, setReceipt] = useState<Web3ResearchAnswerIntakeReceipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Paste redacted helper answers after exporting the research handoff packet.");

  async function reviewAnswers() {
    setBusy(true);
    setMessage("Reviewing research answers against the launch-decision lanes...");
    try {
      const params = new URLSearchParams({
        scenario,
        source,
        account,
        cycles: String(cycles),
      });
      const response = await fetch(`/api/web3-research-answer-intake?${params.toString()}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers_text: answersText }),
      });
      const payload = await response.json().catch(() => null) as Web3ResearchAnswerIntakeReceipt | { error: string } | null;
      if (!response.ok || !payload || "error" in payload) {
        throw new Error(payload && "error" in payload ? payload.error : "Research answer intake failed.");
      }
      setReceipt(payload);
      setMessage(payload.decision_summary);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Research answer intake failed.");
    } finally {
      setBusy(false);
    }
  }

  const visibleLanes = receipt?.lanes.slice(0, 6) ?? [];

  return (
    <div className="rounded-md border border-violet/25 bg-surface-dim/30 p-3" aria-label="Settings Web3 research answer intake">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-violet">Research answer intake</p>
          <p className="mt-1 text-sm font-semibold text-on-surface">Turn helper answers into launch-decision coverage</p>
          <p className="mt-1 text-xs leading-5 text-on-surface-variant">{message}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <ResearchAnswerBadge status={receipt?.status ?? "waiting-for-answers"} />
          <Badge variant="outline" className="border-critical/35 bg-critical/10 text-xs text-critical">live blocked</Badge>
        </div>
      </div>

      <label className="mt-3 block text-xs font-semibold text-on-surface" htmlFor="web3-research-answer-text">
        Redacted helper answer
      </label>
      <textarea
        id="web3-research-answer-text"
        value={answersText}
        onChange={(event) => setAnswersText(event.target.value)}
        className="mt-2 min-h-32 w-full resize-y rounded-md border border-outline-variant/35 bg-void/30 px-3 py-2 text-sm leading-6 text-on-surface outline-none transition placeholder:text-outline focus:border-violet/60"
        placeholder="Paste provider, custody, risk, ops, accounting, dashboard, and profit-proof recommendations. Do not paste keys, tokens, seed phrases, private keys, raw transactions, or signed payloads."
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={reviewAnswers}
          disabled={busy}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-violet/35 bg-violet/10 px-3 py-2 text-sm font-semibold text-violet transition hover:bg-violet/15 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <BrainCircuit aria-hidden="true" className="size-4" />
          {busy ? "Reviewing" : "Review answers"}
        </button>
        <span className="inline-flex min-h-11 items-center gap-2 rounded-md border border-outline-variant/25 bg-black/15 px-3 py-2 text-xs leading-5 text-outline">
          <ShieldCheck aria-hidden="true" className="size-4" />
          Session only
        </span>
      </div>

      {receipt ? (
        <div className="mt-3 grid gap-2">
          <div className="grid gap-2 sm:grid-cols-4" aria-label="Settings Web3 research answer counts">
            <ResearchMetric label="Answered" value={String(receipt.answered_count)} />
            <ResearchMetric label="Partial" value={String(receipt.partial_count)} />
            <ResearchMetric label="Missing" value={String(receipt.missing_count)} />
            <ResearchMetric label="Decision lanes" value={String(receipt.lanes.length)} />
          </div>

          <div className="grid gap-2 md:grid-cols-2" aria-label="Settings Web3 research answer decision lanes">
            {visibleLanes.map((lane) => (
              <div key={lane.id} className="rounded-md border border-outline-variant/25 bg-void/20 p-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-on-surface">{lane.label}</p>
                    <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-outline">
                      {lane.category} · {lane.priority}
                    </p>
                  </div>
                  <LaneStatusBadge status={lane.status} />
                </div>
                <p className="mt-2 text-[11px] leading-4 text-on-surface-variant">{lane.decision_needed}</p>
                <p className="mt-1 text-[11px] leading-4 text-outline">{lane.next_action}</p>
              </div>
            ))}
          </div>

          <div className="rounded-md border border-outline-variant/25 bg-black/15 p-2" aria-label="Settings Web3 research answer next action">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Next missing question</p>
            <p className="mt-1 text-xs leading-5 text-on-surface-variant">{receipt.next_missing_question}</p>
          </div>
        </div>
      ) : null}

      <p className="mt-3 text-xs leading-5 text-outline">
        Answer intake is a review surface only. It rejects secret-looking values and cannot sign, submit, custody funds, mutate wallets, echo secrets, or unlock live trading.
      </p>
    </div>
  );
}

function ResearchMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-outline-variant/25 bg-black/15 p-2">
      <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-on-surface">{value}</p>
    </div>
  );
}

function ResearchAnswerBadge({ status }: { status: Web3ResearchAnswerIntakeReceipt["status"] }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "border text-xs",
        status === "decision-ready" && "border-engine/35 bg-engine/10 text-engine",
        status === "needs-follow-up" && "border-caution/40 bg-caution/10 text-caution",
        status === "waiting-for-answers" && "border-outline-variant/40 bg-surface-dim/45 text-outline",
      )}
    >
      {status.replaceAll("-", " ")}
    </Badge>
  );
}

function LaneStatusBadge({ status }: { status: Web3ResearchAnswerIntakeReceipt["lanes"][number]["status"] }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "border text-xs",
        status === "answered" && "border-engine/35 bg-engine/10 text-engine",
        status === "partial" && "border-caution/40 bg-caution/10 text-caution",
        status === "missing" && "border-critical/35 bg-critical/10 text-critical",
      )}
    >
      {status}
    </Badge>
  );
}
