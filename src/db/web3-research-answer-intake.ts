import { createHash } from "node:crypto";
import type { Web3ResearchHandoffPacket, Web3ResearchQuestion } from "./web3-research-handoff-packet";

export type Web3ResearchAnswerLaneStatus = "answered" | "partial" | "missing";

export type Web3ResearchAnswerLane = {
  id: Web3ResearchQuestion["id"];
  label: string;
  category: Web3ResearchQuestion["category"];
  priority: Web3ResearchQuestion["priority"];
  status: Web3ResearchAnswerLaneStatus;
  matched_terms: string[];
  missing_terms: string[];
  decision_needed: string;
  next_action: string;
  answer_storage: "local-session-only" | "not-stored";
};

export type Web3ResearchImplementationDecision = {
  id:
    | "custody-signer-path"
    | "provider-stack"
    | "signal-quality-stack"
    | "latency-execution-budget"
    | "first-live-mode"
    | "compliance-copy"
    | "risk-gate-thresholds"
    | "settlement-accounting-proof"
    | "credential-storage-contract"
    | "manual-go-live-checklist"
    | "operator-cockpit-dashboard"
    | "profit-proof-threshold";
  label: string;
  owner: "security" | "engineering" | "ops" | "accounting" | "product" | "strategy";
  phase: "now" | "before-live" | "review";
  status: "ready-to-spec" | "needs-research" | "blocked";
  source_lanes: Web3ResearchQuestion["id"][];
  implementation_step: string;
  verification_command: string;
  live_authority: "blocked";
};

export type Web3ResearchImplementationPlan = {
  status: "waiting-for-answers" | "follow-up-needed" | "ready-to-spec";
  next_owner: Web3ResearchImplementationDecision["owner"] | "research";
  next_phase: Web3ResearchImplementationDecision["phase"] | "answer-intake";
  ready_now_count: number;
  before_live_count: number;
  review_count: number;
  needs_research_count: number;
  blocked_count: number;
  next_decision: Pick<Web3ResearchImplementationDecision, "id" | "label" | "owner" | "phase" | "status" | "implementation_step" | "verification_command" | "live_authority"> | null;
  owner_summary: Array<{
    owner: Web3ResearchImplementationDecision["owner"];
    ready: number;
    needs_research: number;
    blocked: number;
  }>;
  phase_summary: Array<{
    phase: Web3ResearchImplementationDecision["phase"];
    ready: number;
    needs_research: number;
    blocked: number;
  }>;
  safety_boundary: string[];
};

export type Web3ResearchAnswerIntakeReceipt = {
  mode: "web3-research-answer-intake";
  status: "waiting-for-answers" | "needs-follow-up" | "decision-ready";
  generated_at: string;
  receipt_hash: string;
  handoff_receipt_hash: string;
  answer_hash: string | null;
  answer_length: number;
  answered_count: number;
  partial_count: number;
  missing_count: number;
  decision_ready_count: number;
  lanes: Web3ResearchAnswerLane[];
  implementation_decisions: Web3ResearchImplementationDecision[];
  implementation_plan: Web3ResearchImplementationPlan;
  ready_decision_count: number;
  blocked_decision_count: number;
  next_missing_question: string;
  decision_summary: string;
  safe_next_actions: string[];
  redacted_preview: string;
  safe_to_paste: string[];
  never_paste: string[];
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  transaction_submission_permission: "blocked";
  signing_permission: "blocked";
  private_key_storage: "blocked";
  seed_phrase_storage: "blocked";
  secret_echo_permission: "blocked";
  controls: string[];
};

type ResearchAnswerLaneSpec = {
  id: Web3ResearchQuestion["id"];
  label: string;
  required_terms: string[];
  helpful_terms: string[];
  decision_needed: string;
  next_action: string;
};

type ResearchImplementationDecisionSpec = Omit<Web3ResearchImplementationDecision, "status" | "live_authority">;

const LANE_SPECS: ResearchAnswerLaneSpec[] = [
  {
    id: "custody-architecture",
    label: "Signer and custody architecture",
    required_terms: ["turnkey", "privy", "external wallet", "policy", "private key", "seed phrase"],
    helpful_terms: ["session key", "multisig", "revocation", "caps"],
    decision_needed: "Choose the first supervised-live signer path without letting Mastermind store wallet secrets.",
    next_action: "Pick manual external wallet or a reviewed policy-wallet provider, then build signer evidence only from provider-safe target names.",
  },
  {
    id: "provider-stack",
    label: "Read and market provider stack",
    required_terms: ["helius", "jupiter", "birdeye", "dex screener", "geckoterminal"],
    helpful_terms: ["yellowstone", "grpc", "pump.fun", "raydium", "meteora"],
    decision_needed: "Confirm the read-provider stack for wallet reads, route proof, and live market discovery.",
    next_action: "Map each provider to read-only wallet, discovery, OHLCV, route, and low-latency roles before adding more keys.",
  },
  {
    id: "moonshot-data-sources",
    label: "Moonshot-style signal sources",
    required_terms: ["trending", "launch", "holder", "liquidity", "rug"],
    helpful_terms: ["promotion", "boost", "creator", "whale", "social"],
    decision_needed: "Decide which sources make a coin high-signal enough for paper or supervised-live review.",
    next_action: "Turn the source list into scanner lanes with freshness, rate limit, and trust caveat rows.",
  },
  {
    id: "latency-budget",
    label: "Latency and staleness budget",
    required_terms: ["latency", "milliseconds", "seconds", "stale", "refresh"],
    helpful_terms: ["quote age", "confirmation", "expiry", "priority fee"],
    decision_needed: "Set max age thresholds for discovery, quote, signing, submission, and exit protection.",
    next_action: "Add fail-closed staleness thresholds before allowing any live order review.",
  },
  {
    id: "first-live-mode",
    label: "First real-money mode",
    required_terms: ["manual", "supervised", "caps", "approval", "rollback"],
    helpful_terms: ["copilot", "policy wallet", "external review", "single trade"],
    decision_needed: "Select the smallest real-money launch mode that is safer than autonomous live trading.",
    next_action: "Convert the recommendation into a manual-live review checklist with caps and rollback rules.",
  },
  {
    id: "compliance-boundaries",
    label: "Compliance and product copy",
    required_terms: ["disclosure", "risk", "jurisdiction", "tax", "not financial advice"],
    helpful_terms: ["consumer", "terms", "regulatory", "claims"],
    decision_needed: "Define what the product can claim before it helps with live crypto trading.",
    next_action: "Keep UI copy from promising profit and add required review/disclosure gates before live mode.",
  },
  {
    id: "risk-gates",
    label: "Live risk gates",
    required_terms: ["slippage", "daily cap", "drawdown", "liquidity", "holder"],
    helpful_terms: ["token age", "authority", "mev", "kill switch", "trade size"],
    decision_needed: "Define hard blocks and resize rules before any signer-bound step.",
    next_action: "Turn thresholds into verifier checks for size, slippage, drawdown, liquidity, holder risk, and stale quotes.",
  },
  {
    id: "settlement-accounting",
    label: "Settlement and accounting proof",
    required_terms: ["gettransaction", "confirmation", "token balance", "fees", "tax"],
    helpful_terms: ["idempotency", "lot", "pnl", "export", "reconciliation"],
    decision_needed: "Define evidence required before real PnL can be trusted.",
    next_action: "Require confirmation polling, token delta parsing, fee accounting, idempotency, and export review before live fills are mirrored.",
  },
  {
    id: "credential-storage",
    label: "Credential storage contract",
    required_terms: ["server env", "browser", "never store", "redaction", "verifier"],
    helpful_terms: ["one-shot", "target name", "api key", "private key"],
    decision_needed: "Classify every credential by allowed surface and storage rule.",
    next_action: "Update Settings copy and verifier rules only for credentials that are safe to collect.",
  },
  {
    id: "go-live-checklist",
    label: "Go-live checklist",
    required_terms: ["checklist", "operator", "security", "ops", "accounting"],
    helpful_terms: ["strategy", "pass", "fail", "owner", "rollback"],
    decision_needed: "Define objective pass/fail evidence before one supervised live trade can be reviewed.",
    next_action: "Turn the checklist into owner-grouped gates for operator, security, ops, accounting, and strategy.",
  },
  {
    id: "cockpit-dashboard",
    label: "Operator cockpit dashboard",
    required_terms: ["chart", "dashboard", "pnl", "drawdown", "position"],
    helpful_terms: ["first screen", "alert", "timeline", "diagnostics", "mobile"],
    decision_needed: "Decide what the non-technical operator must see first to trust or stop the agent.",
    next_action: "Promote wallet equity, position risk, next action, and blocked-live authority into the first viewport.",
  },
  {
    id: "profit-proof",
    label: "Paper profit proof",
    required_terms: ["run count", "hit rate", "drawdown", "profit factor", "out-of-sample"],
    helpful_terms: ["slippage", "baseline", "regime", "promotion", "threshold"],
    decision_needed: "Define how much paper evidence is enough before risking real capital.",
    next_action: "Encode proof thresholds into the paper-promotion guard before manual live review can pass.",
  },
];

const IMPLEMENTATION_DECISION_SPECS: ResearchImplementationDecisionSpec[] = [
  {
    id: "custody-signer-path",
    label: "Choose signer and custody path",
    owner: "security",
    phase: "now",
    source_lanes: ["custody-architecture", "credential-storage"],
    implementation_step: "Convert the selected manual-wallet, Privy, Turnkey, or session-key recommendation into a signer policy envelope with no private-key collection.",
    verification_command: "npm run verify:web3 -- --base-url=http://localhost:4010 --require-operator-wallet",
  },
  {
    id: "provider-stack",
    label: "Lock read and route provider stack",
    owner: "engineering",
    phase: "now",
    source_lanes: ["provider-stack", "moonshot-data-sources"],
    implementation_step: "Map each provider to wallet reads, launch discovery, OHLCV proof, route quotes, order rehearsal, and optional low-latency stream roles.",
    verification_command: "npm run verify:web3 -- --base-url=http://localhost:4010 --require-dex-live",
  },
  {
    id: "signal-quality-stack",
    label: "Define high-signal memecoin filters",
    owner: "strategy",
    phase: "now",
    source_lanes: ["moonshot-data-sources", "risk-gates"],
    implementation_step: "Turn Moonshot-style research into source-quality, holder-flow, liquidity, promotion, creator, and rug-risk score thresholds.",
    verification_command: "npm run monitor:web3 -- --base-url=http://localhost:4010 --source=live-dex --json",
  },
  {
    id: "latency-execution-budget",
    label: "Set staleness and execution age budgets",
    owner: "engineering",
    phase: "before-live",
    source_lanes: ["latency-budget", "risk-gates"],
    implementation_step: "Encode max ages for discovery, candle proof, route quote, unsigned order, signature prompt, submit relay, and confirmation polling.",
    verification_command: "npm run landing-drill:web3",
  },
  {
    id: "first-live-mode",
    label: "Pick first real-money mode",
    owner: "ops",
    phase: "review",
    source_lanes: ["first-live-mode", "go-live-checklist"],
    implementation_step: "Translate the smallest approved live mode into capped manual-review steps with rollback and kill-switch requirements.",
    verification_command: "npm run verify:web3 -- --base-url=http://localhost:4010",
  },
  {
    id: "compliance-copy",
    label: "Finalize live-trading product copy",
    owner: "product",
    phase: "before-live",
    source_lanes: ["compliance-boundaries", "first-live-mode"],
    implementation_step: "Replace any profit-promising language with reviewed risk, jurisdiction, tax, autonomy, and not-financial-advice boundaries.",
    verification_command: "npm run typecheck",
  },
  {
    id: "risk-gate-thresholds",
    label: "Encode hard risk gates",
    owner: "strategy",
    phase: "now",
    source_lanes: ["risk-gates", "latency-budget", "moonshot-data-sources"],
    implementation_step: "Implement threshold constants for slippage, daily cap, drawdown, liquidity, holder concentration, authority risk, token age, and MEV exposure.",
    verification_command: "npm run verify:web3 -- --base-url=http://localhost:4010",
  },
  {
    id: "settlement-accounting-proof",
    label: "Prove settlement and accounting",
    owner: "accounting",
    phase: "before-live",
    source_lanes: ["settlement-accounting", "credential-storage"],
    implementation_step: "Require confirmation polling, owner-scoped token deltas, fee accounting, lot/idempotency handling, and reviewed export readiness before mirroring live fills.",
    verification_command: "npm run doctor:web3 -- --json",
  },
  {
    id: "credential-storage-contract",
    label: "Publish credential storage contract",
    owner: "security",
    phase: "now",
    source_lanes: ["credential-storage", "custody-architecture"],
    implementation_step: "Update the credential form and runbook with server-env, session-only, browser-public, hash-only, future-vault, and never-store rules.",
    verification_command: "npm run verify:web3 -- --base-url=http://localhost:4010",
  },
  {
    id: "manual-go-live-checklist",
    label: "Build manual go-live checklist",
    owner: "ops",
    phase: "review",
    source_lanes: ["go-live-checklist", "first-live-mode", "settlement-accounting"],
    implementation_step: "Convert research into owner-grouped pass/fail gates for operator, security, ops, accounting, product, and strategy signoff.",
    verification_command: "npm run doctor:web3 -- --json",
  },
  {
    id: "operator-cockpit-dashboard",
    label: "Tighten operator cockpit first viewport",
    owner: "product",
    phase: "now",
    source_lanes: ["cockpit-dashboard", "risk-gates", "profit-proof"],
    implementation_step: "Promote wallet net worth, PnL, drawdown, exposure, held-position pressure, next action, queue status, and live authority blocked state into the first screen.",
    verification_command: "npm run typecheck",
  },
  {
    id: "profit-proof-threshold",
    label: "Set paper profit proof threshold",
    owner: "strategy",
    phase: "before-live",
    source_lanes: ["profit-proof", "go-live-checklist"],
    implementation_step: "Encode required run count, hit rate, max drawdown, profit factor, regime coverage, baseline alpha, and out-of-sample proof into the promotion guard.",
    verification_command: "npm run forward-repeat:web3 -- --base-url=http://localhost:4010 --json",
  },
];

export function buildWeb3ResearchAnswerIntakeReceipt(input: {
  handoff: Web3ResearchHandoffPacket;
  answersText?: string;
  now?: Date;
}): Web3ResearchAnswerIntakeReceipt {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const cleaned = sanitizeAnswerText(input.answersText ?? "");
  const normalized = cleaned.toLowerCase();
  const lanes = LANE_SPECS.map((spec) => buildLane(spec, input.handoff, normalized));
  const answeredCount = lanes.filter((lane) => lane.status === "answered").length;
  const partialCount = lanes.filter((lane) => lane.status === "partial").length;
  const missingCount = lanes.filter((lane) => lane.status === "missing").length;
  const implementationDecisions = buildImplementationDecisions(lanes);
  const readyDecisionCount = implementationDecisions.filter((decision) => decision.status === "ready-to-spec").length;
  const blockedDecisionCount = implementationDecisions.filter((decision) => decision.status === "blocked").length;
  const status: Web3ResearchAnswerIntakeReceipt["status"] = cleaned.length === 0
      ? "waiting-for-answers"
      : missingCount > 0 || partialCount > 0
        ? "needs-follow-up"
        : "decision-ready";
  const implementationPlan = buildImplementationPlan(status, implementationDecisions);
  const nextMissing = lanes.find((lane) => lane.status !== "answered");
  const receiptBase = {
    mode: "web3-research-answer-intake" as const,
    status,
    generated_at: generatedAt,
    handoff_receipt_hash: input.handoff.receipt_hash,
    answer_hash: cleaned.length > 0 ? hashText(cleaned) : null,
    answer_length: cleaned.length,
    answered_count: answeredCount,
    partial_count: partialCount,
    missing_count: missingCount,
    decision_ready_count: answeredCount,
    lanes,
    implementation_decisions: implementationDecisions,
    implementation_plan: implementationPlan,
    ready_decision_count: readyDecisionCount,
    blocked_decision_count: blockedDecisionCount,
    next_missing_question: nextMissing
      ? input.handoff.research_questions.find((question) => question.id === nextMissing.id)?.question ?? nextMissing.decision_needed
      : "Research answers cover every tracked decision lane; review manually before changing live gates.",
    decision_summary: answerDecisionSummary(status, answeredCount, partialCount, missingCount),
    safe_next_actions: buildSafeNextActions(status, lanes, implementationDecisions),
    redacted_preview: cleaned.length > 0 ? cleaned.slice(0, 900) : "Paste research answers from the helper bot to score launch-decision coverage.",
    safe_to_paste: [
      "Provider recommendations and docs links",
      "Custody architecture comparison",
      "Risk thresholds and launch checklist ideas",
      "Accounting, ops, and dashboard recommendations",
      "Public wallet addresses or env target names only when needed",
    ],
    never_paste: [
      "Seed phrases or mnemonics",
      "Wallet private keys or keypair JSON",
      "Raw API key values, bearer tokens, or webhook secrets",
      "Unsigned or signed transaction payloads",
      "Anything that would let another system move funds",
    ],
    live_execution_permission: "blocked" as const,
    wallet_mutation_permission: "blocked" as const,
    transaction_submission_permission: "blocked" as const,
    signing_permission: "blocked" as const,
    private_key_storage: "blocked" as const,
    seed_phrase_storage: "blocked" as const,
    secret_echo_permission: "blocked" as const,
    controls: [
      "Research answer intake is local review only; it does not store answers server-side.",
      "Secret-looking pasted values are rejected before a receipt is returned.",
      "A decision-ready receipt can inform product work, but it cannot unlock live execution, signing, transaction submission, or wallet mutation.",
    ],
  };

  return {
    ...receiptBase,
    receipt_hash: hashJson(receiptBase),
  };
}

export function assertResearchAnswerTextIsSafe(value: unknown): string {
  if (typeof value !== "string") return "";
  if (value.length > 24000) throw new Error("Research answers must be 24,000 characters or fewer.");
  const unsafe = findUnsafeResearchAnswerPattern(value);
  if (unsafe) {
    throw new Error(`Research answers include a secret-looking ${unsafe}; remove it and paste only redacted research.`);
  }
  return value;
}

function buildLane(spec: ResearchAnswerLaneSpec, handoff: Web3ResearchHandoffPacket, normalized: string): Web3ResearchAnswerLane {
  const question = handoff.research_questions.find((item) => item.id === spec.id);
  const matchedRequired = spec.required_terms.filter((term) => normalized.includes(term));
  const matchedHelpful = spec.helpful_terms.filter((term) => normalized.includes(term));
  const status: Web3ResearchAnswerLaneStatus = normalized.length === 0
    ? "missing"
    : matchedRequired.length >= Math.min(3, spec.required_terms.length)
      ? "answered"
      : matchedRequired.length > 0 || matchedHelpful.length > 0
        ? "partial"
        : "missing";

  return {
    id: spec.id,
    label: spec.label,
    category: question?.category ?? "ops",
    priority: question?.priority ?? "before-live",
    status,
    matched_terms: [...matchedRequired, ...matchedHelpful].slice(0, 8),
    missing_terms: spec.required_terms.filter((term) => !matchedRequired.includes(term)).slice(0, 8),
    decision_needed: spec.decision_needed,
    next_action: status === "answered"
      ? "Review this recommendation, choose the app decision deliberately, and keep live gates blocked until implementation evidence exists."
      : spec.next_action,
    answer_storage: normalized.length > 0 ? "local-session-only" : "not-stored",
  };
}

function buildImplementationDecisions(lanes: Web3ResearchAnswerLane[]): Web3ResearchImplementationDecision[] {
  const laneById = new Map(lanes.map((lane) => [lane.id, lane]));
  return IMPLEMENTATION_DECISION_SPECS.map((spec) => {
    const sourceLanes = spec.source_lanes.map((laneId) => laneById.get(laneId));
    const missing = sourceLanes.some((lane) => !lane || lane.status === "missing");
    const partial = sourceLanes.some((lane) => lane?.status === "partial");
    const status: Web3ResearchImplementationDecision["status"] = missing
      ? "blocked"
      : partial
        ? "needs-research"
        : "ready-to-spec";

    return {
      ...spec,
      status,
      live_authority: "blocked",
    };
  });
}

function buildImplementationPlan(
  receiptStatus: Web3ResearchAnswerIntakeReceipt["status"],
  decisions: Web3ResearchImplementationDecision[],
): Web3ResearchImplementationPlan {
  const followUpDecision = decisions.find((decision) => decision.status === "blocked" || decision.status === "needs-research");
  const readyDecision = decisions.find((decision) => decision.status === "ready-to-spec");
  const nextDecision = followUpDecision ?? readyDecision ?? null;
  const planStatus: Web3ResearchImplementationPlan["status"] = receiptStatus === "waiting-for-answers"
    ? "waiting-for-answers"
    : followUpDecision
      ? "follow-up-needed"
      : "ready-to-spec";

  return {
    status: planStatus,
    next_owner: nextDecision?.owner ?? "research",
    next_phase: nextDecision?.phase ?? "answer-intake",
    ready_now_count: decisions.filter((decision) => decision.status === "ready-to-spec" && decision.phase === "now").length,
    before_live_count: decisions.filter((decision) => decision.status === "ready-to-spec" && decision.phase === "before-live").length,
    review_count: decisions.filter((decision) => decision.status === "ready-to-spec" && decision.phase === "review").length,
    needs_research_count: decisions.filter((decision) => decision.status === "needs-research").length,
    blocked_count: decisions.filter((decision) => decision.status === "blocked").length,
    next_decision: nextDecision
      ? {
          id: nextDecision.id,
          label: nextDecision.label,
          owner: nextDecision.owner,
          phase: nextDecision.phase,
          status: nextDecision.status,
          implementation_step: nextDecision.implementation_step,
          verification_command: nextDecision.verification_command,
          live_authority: nextDecision.live_authority,
        }
      : null,
    owner_summary: summarizeDecisionsByOwner(decisions),
    phase_summary: summarizeDecisionsByPhase(decisions),
    safety_boundary: [
      "Implementation plan is sequencing evidence only.",
      "Ready-to-spec decisions still require code, tests, operator review, and strict verification before live review.",
      "The plan cannot sign, submit, mutate wallets, store wallet secrets, or unlock autonomous live trading.",
    ],
  };
}

function summarizeDecisionsByOwner(decisions: Web3ResearchImplementationDecision[]): Web3ResearchImplementationPlan["owner_summary"] {
  const owners: Web3ResearchImplementationDecision["owner"][] = ["security", "engineering", "strategy", "ops", "accounting", "product"];
  return owners.map((owner) => {
    const owned = decisions.filter((decision) => decision.owner === owner);
    return {
      owner,
      ready: owned.filter((decision) => decision.status === "ready-to-spec").length,
      needs_research: owned.filter((decision) => decision.status === "needs-research").length,
      blocked: owned.filter((decision) => decision.status === "blocked").length,
    };
  });
}

function summarizeDecisionsByPhase(decisions: Web3ResearchImplementationDecision[]): Web3ResearchImplementationPlan["phase_summary"] {
  const phases: Web3ResearchImplementationDecision["phase"][] = ["now", "before-live", "review"];
  return phases.map((phase) => {
    const phased = decisions.filter((decision) => decision.phase === phase);
    return {
      phase,
      ready: phased.filter((decision) => decision.status === "ready-to-spec").length,
      needs_research: phased.filter((decision) => decision.status === "needs-research").length,
      blocked: phased.filter((decision) => decision.status === "blocked").length,
    };
  });
}

function sanitizeAnswerText(value: string) {
  return value
    .replace(/([?&](?:api[-_]?key|token|secret|signature)=)[^&\s]+/gi, "$1<redacted>")
    .replace(/\b(?:sk|pk|jup|helius)_[A-Za-z0-9_-]{16,}\b/g, "<redacted-secret>")
    .replace(/\b[A-Za-z0-9+/]{80,}={0,2}\b/g, "<redacted-long-value>")
    .replace(/[^\w\s.,:/?=&%+<>|()[\]{}'"`!*@#$^-]/g, "")
    .trim();
}

function findUnsafeResearchAnswerPattern(value: string) {
  const patterns: Array<[string, RegExp]> = [
    ["seed phrase", /(?:seed phrase|mnemonic)\s*[:=]\s*(?:[a-z]+\s+){5,}[a-z]+/i],
    ["private key", /(?:private[_\s-]?key|keypair)\s*[:=]\s*[A-Za-z0-9_[\]{}"',:/+=-]{24,}/i],
    ["API key", /(?:api[_\s-]?key|bearer token|webhook secret|app secret)\s*[:=]\s*[A-Za-z0-9_.:/?=&%+-]{16,}/i],
    ["API-key query value", /api-key=[A-Za-z0-9_-]{16,}/i],
    ["secret token", /\b(?:sk|pk|jup|helius)_[A-Za-z0-9_-]{16,}\b/g],
  ];
  return patterns.find(([, pattern]) => pattern.test(value))?.[0] ?? null;
}

function answerDecisionSummary(status: Web3ResearchAnswerIntakeReceipt["status"], answered: number, partial: number, missing: number) {
  if (status === "waiting-for-answers") {
    return "No research answers have been pasted yet; every launch-decision lane is still waiting for helper output.";
  }
  if (status === "decision-ready") {
    return `Research answers cover all ${answered} tracked launch-decision lanes; review choices manually before changing any live gate.`;
  }
  return `Research answers cover ${answered} lane${answered === 1 ? "" : "s"}, partially cover ${partial}, and still miss ${missing}; follow up before supervised live review.`;
}

function buildSafeNextActions(
  status: Web3ResearchAnswerIntakeReceipt["status"],
  lanes: Web3ResearchAnswerLane[],
  implementationDecisions: Web3ResearchImplementationDecision[],
) {
  if (status === "waiting-for-answers") {
    return [
      "Export the Web3 research handoff packet.",
      "Ask the helper bot to answer every research question without secrets.",
      "Paste the redacted answer back into this intake console.",
    ];
  }
  const gaps = lanes.filter((lane) => lane.status !== "answered").slice(0, 4);
  if (gaps.length > 0) return gaps.map((lane) => `${lane.label}: ${lane.next_action}`);
  const readySteps = implementationDecisions
    .filter((decision) => decision.status === "ready-to-spec")
    .slice(0, 3)
    .map((decision) => decision.implementation_step);
  return [
    ...readySteps,
    "Convert covered research decisions into provider, custody, risk, ops, accounting, and dashboard implementation tasks.",
    "Run strict Web3 verification after each implementation task.",
    "Keep live execution blocked until manual live review independently passes.",
  ];
}

function hashText(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function hashJson(value: unknown) {
  return hashText(JSON.stringify(value));
}
