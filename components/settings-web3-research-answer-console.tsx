"use client";

import { useState } from "react";
import { BrainCircuit, ClipboardList, RotateCcw, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Web3ResearchAnswerIntakeReceipt } from "@/src/db/web3-research-answer-intake";
import type { Web3ResearchQuestion } from "@/src/db/web3-research-handoff-packet";

type SettingsWeb3ResearchAnswerConsoleProps = {
  scenario: string;
  source: string;
  account: string;
  cycles: number;
  questions: Web3ResearchQuestion[];
};

export function SettingsWeb3ResearchAnswerConsole({
  scenario,
  source,
  account,
  cycles,
  questions,
}: SettingsWeb3ResearchAnswerConsoleProps) {
  const [answersText, setAnswersText] = useState("");
  const [receipt, setReceipt] = useState<Web3ResearchAnswerIntakeReceipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Paste redacted helper answers after exporting the research handoff packet.");

  const nowQuestions = questions.filter((question) => question.priority === "now");
  const templateQuestions = nowQuestions.length > 0 ? nowQuestions : questions;
  const answerTemplate = buildResearchAnswerTemplate(questions);

  function useTemplate() {
    setAnswersText(answerTemplate);
    setMessage("Template loaded. Replace each answer line with redacted recommendations only.");
  }

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
  const visibleDecisions = receipt?.implementation_decisions.slice(0, 6) ?? [];
  const implementationPlan = receipt?.implementation_plan ?? null;

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

      <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]" aria-label="Settings Web3 research answer template guide">
        <div className="rounded-md border border-violet/25 bg-violet/[0.035] p-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-violet">Answer template</p>
              <p className="mt-1 text-xs font-semibold text-on-surface">Paste-back format for the helper bot</p>
            </div>
            <Badge variant="outline" className="border-outline-variant/40 bg-surface-dim/45 text-xs text-outline">
              {questions.length} lanes
            </Badge>
          </div>
          <p className="mt-2 text-[11px] leading-5 text-on-surface-variant">
            Use the template to keep answers structured by lane. The intake checker scores coverage and rejects secret-looking values before anything reaches a launch decision queue.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={useTemplate}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-violet/35 bg-violet/10 px-3 py-2 text-xs font-semibold text-violet transition hover:bg-violet/15"
            >
              <ClipboardList aria-hidden="true" className="size-4" />
              Use template
            </button>
            <button
              type="button"
              onClick={() => {
                setAnswersText("");
                setReceipt(null);
                setMessage("Paste redacted helper answers after exporting the research handoff packet.");
              }}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-outline-variant/35 bg-black/15 px-3 py-2 text-xs font-semibold text-outline transition hover:bg-black/25"
            >
              <RotateCcw aria-hidden="true" className="size-4" />
              Reset
            </button>
          </div>
        </div>

        <div className="rounded-md border border-outline-variant/25 bg-black/15 p-2" aria-label="Settings Web3 research answer required lanes">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Answer first</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {templateQuestions.slice(0, 4).map((question) => (
              <div key={question.id} className="rounded-md border border-outline-variant/20 bg-void/20 p-2">
                <p className="text-xs font-semibold text-on-surface">{question.question}</p>
                <p className="mt-1 text-[11px] leading-4 text-outline">
                  {question.category} · {question.expected_answer_format}
                </p>
              </div>
            ))}
          </div>
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
            <ResearchMetric label="Ready tasks" value={String(receipt.ready_decision_count)} />
          </div>

          {implementationPlan ? (
            <div className="rounded-md border border-engine/25 bg-engine/[0.035] p-2" aria-label="Settings Web3 research implementation plan">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-engine">Implementation plan</p>
                  <p className="mt-1 text-xs font-semibold text-on-surface">
                    Next owner: {implementationPlan.next_owner.replaceAll("-", " ")} · {implementationPlan.next_phase.replaceAll("-", " ")}
                  </p>
                  <p className="mt-1 text-[11px] leading-4 text-on-surface-variant">
                    {implementationPlan.next_decision?.implementation_step ?? "Export answers and cover the missing research lanes before implementation work starts."}
                  </p>
                </div>
                <DecisionPlanStatusBadge status={implementationPlan.status} />
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-5" aria-label="Settings Web3 research implementation plan counts">
                <ResearchMetric label="Now" value={String(implementationPlan.ready_now_count)} />
                <ResearchMetric label="Before live" value={String(implementationPlan.before_live_count)} />
                <ResearchMetric label="Review" value={String(implementationPlan.review_count)} />
                <ResearchMetric label="Needs research" value={String(implementationPlan.needs_research_count)} />
                <ResearchMetric label="Blocked" value={String(implementationPlan.blocked_count)} />
              </div>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <div className="rounded-md border border-outline-variant/20 bg-void/20 p-2">
                  <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Owner coverage</p>
                  <p className="mt-1 text-[11px] leading-5 text-on-surface-variant">
                    {implementationPlan.owner_summary.map((owner) => `${owner.owner}: ${owner.ready} ready/${owner.blocked} blocked`).join(" · ")}
                  </p>
                </div>
                <div className="rounded-md border border-outline-variant/20 bg-void/20 p-2">
                  <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Verification</p>
                  <p className="mt-1 break-words font-mono text-[10px] leading-4 text-on-surface-variant">
                    {implementationPlan.next_decision?.verification_command ?? "npm run verify:web3 -- --base-url=http://localhost:4010"}
                  </p>
                </div>
              </div>
              <p className="mt-2 text-[11px] leading-4 text-outline">
                {implementationPlan.safety_boundary.join(" ")}
              </p>
            </div>
          ) : null}

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

          <div className="rounded-md border border-outline-variant/25 bg-black/15 p-2" aria-label="Settings Web3 research implementation queue">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Implementation queue</p>
                <p className="mt-1 text-xs leading-5 text-on-surface-variant">
                  {receipt.ready_decision_count} ready · {receipt.blocked_decision_count} blocked · live authority blocked
                </p>
              </div>
              <Badge variant="outline" className="border-critical/35 bg-critical/10 text-xs text-critical">live authority blocked</Badge>
            </div>
            <div className="mt-2 grid gap-2 lg:grid-cols-2">
              {visibleDecisions.map((decision) => (
                <div key={decision.id} className="min-w-0 rounded-md border border-outline-variant/20 bg-void/20 p-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-on-surface">{decision.label}</p>
                      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-outline">
                        {decision.owner} · {decision.phase}
                      </p>
                    </div>
                    <DecisionStatusBadge status={decision.status} />
                  </div>
                  <p className="mt-2 text-[11px] leading-4 text-on-surface-variant">{decision.implementation_step}</p>
                  <p className="mt-1 break-words font-mono text-[10px] leading-4 text-outline">{decision.verification_command}</p>
                </div>
              ))}
            </div>
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

function buildResearchAnswerTemplate(questions: Web3ResearchQuestion[]) {
  const lines = [
    "# Mastermind Web3 Research Answers",
    "",
    "Do not include API keys, private keys, seed phrases, raw transactions, signed payloads, account passwords, or custody credentials.",
    "Answer each lane with a concrete recommendation, the evidence source, risks, and implementation boundary.",
    "",
  ];

  for (const question of questions) {
    lines.push(`## ${question.id}`);
    lines.push(`Question: ${question.question}`);
    lines.push(`Expected format: ${question.expected_answer_format}`);
    lines.push("Recommendation:");
    lines.push("Evidence source:");
    lines.push("Risk boundary:");
    lines.push("Implementation notes:");
    lines.push("");
  }

  return lines.join("\n");
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

function DecisionStatusBadge({ status }: { status: Web3ResearchAnswerIntakeReceipt["implementation_decisions"][number]["status"] }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "border text-xs",
        status === "ready-to-spec" && "border-engine/35 bg-engine/10 text-engine",
        status === "needs-research" && "border-caution/40 bg-caution/10 text-caution",
        status === "blocked" && "border-critical/35 bg-critical/10 text-critical",
      )}
    >
      {status.replaceAll("-", " ")}
    </Badge>
  );
}

function DecisionPlanStatusBadge({ status }: { status: Web3ResearchAnswerIntakeReceipt["implementation_plan"]["status"] }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "border text-xs",
        status === "ready-to-spec" && "border-engine/35 bg-engine/10 text-engine",
        status === "follow-up-needed" && "border-caution/40 bg-caution/10 text-caution",
        status === "waiting-for-answers" && "border-outline-variant/40 bg-surface-dim/45 text-outline",
      )}
    >
      {status.replaceAll("-", " ")}
    </Badge>
  );
}
