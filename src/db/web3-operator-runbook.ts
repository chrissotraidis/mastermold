import { createHash } from "node:crypto";
import type { Web3CutoverBlockerBoard } from "./web3-cutover-blocker-board";
import type { Web3LiveCapitalPreflightReceipt } from "./web3-live-capital-preflight";
import type { Web3SupervisedLiveRunway } from "./web3-supervised-live-runway";
import type { Web3TradingState } from "./web3-trading";
import type { Web3UsabilityStatusReceipt } from "./web3-usability-status";

export type Web3OperatorRunbookActionStatus = "allowed" | "gated" | "blocked";
export type Web3OperatorRunbookActionKind = "app-link" | "safe-command" | "external-review";

export type Web3OperatorRunbookAction = {
  id:
    | "open-copilot"
    | "run-paper-autonomy"
    | "refresh-live-dex"
    | "rehearse-jupiter-order"
    | "continue-credential-setup"
    | "request-supervised-live-review"
    | "autonomous-live-trading";
  label: string;
  status: Web3OperatorRunbookActionStatus;
  kind: Web3OperatorRunbookActionKind;
  surface: "trading" | "settings" | "terminal" | "external-review";
  href: string | null;
  command: string | null;
  reason: string;
  next_action: string;
  permission_scope: string;
};

export type Web3OperatorRunbookReceipt = {
  mode: "web3-operator-runbook";
  status: "setup-needed" | "paper-operable" | "supervised-review-ready";
  generated_at: string;
  receipt_hash: string;
  source: Web3TradingState["market_source"]["mode"];
  account: Web3TradingState["paper_account"]["mode"];
  scenario: Web3TradingState["scenario"];
  summary: string;
  primary_safe_action: Web3OperatorRunbookAction | null;
  next_safe_input: Web3CutoverBlockerBoard["next_safe_input"];
  next_live_lane_action: string;
  allowed_now_count: number;
  gated_count: number;
  blocked_count: number;
  run_now: Web3OperatorRunbookAction[];
  real_capital_blockers: Array<{
    id: Web3LiveCapitalPreflightReceipt["gates"][number]["id"];
    label: string;
    status: Web3LiveCapitalPreflightReceipt["gates"][number]["status"];
    next_action: string;
  }>;
  safe_to_provide: string[];
  never_provide: string[];
  verifier_commands: string[];
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  transaction_submission_permission: "blocked";
  private_key_storage: "blocked";
  seed_phrase_storage: "blocked";
  secret_echo_permission: "blocked";
  controls: string[];
};

export function buildWeb3OperatorRunbook(input: {
  state: Web3TradingState;
  usability: Web3UsabilityStatusReceipt;
  cutover: Web3CutoverBlockerBoard;
  preflight: Web3LiveCapitalPreflightReceipt;
  runway: Web3SupervisedLiveRunway;
  now?: Date;
}): Web3OperatorRunbookReceipt {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const runNow = buildRunNowActions(input);
  const allowedNowCount = runNow.filter((action) => action.status === "allowed").length;
  const gatedCount = runNow.filter((action) => action.status === "gated").length;
  const blockedCount = runNow.filter((action) => action.status === "blocked").length;
  const primarySafeAction = runNow.find((action) => action.status === "allowed") ??
    runNow.find((action) => action.status === "gated") ??
    null;
  const realCapitalBlockers = input.preflight.gates
    .filter((gate) => gate.blocks_live_capital && gate.status !== "pass")
    .map((gate) => ({
      id: gate.id,
      label: gate.label,
      status: gate.status,
      next_action: gate.next_action,
    }))
    .slice(0, 8);
  const status: Web3OperatorRunbookReceipt["status"] = input.runway.can_request_live_review
    ? "supervised-review-ready"
    : allowedNowCount > 0
      ? "paper-operable"
      : "setup-needed";
  const verifierCommands = Array.from(new Set([
    ...input.cutover.verifier_commands,
    ...input.usability.safe_commands,
    ...input.runway.safe_commands,
  ])).slice(0, 8);
  const receiptBase = {
    mode: "web3-operator-runbook" as const,
    status,
    generated_at: generatedAt,
    source: input.state.market_source.mode,
    account: input.state.paper_account.mode,
    scenario: input.state.scenario,
    summary: operatorRunbookSummary(status, allowedNowCount, gatedCount, blockedCount, input.cutover.open_blocker_count),
    primary_safe_action: primarySafeAction,
    next_safe_input: input.cutover.next_safe_input,
    next_live_lane_action: input.cutover.next_live_lane_action,
    allowed_now_count: allowedNowCount,
    gated_count: gatedCount,
    blocked_count: blockedCount,
    run_now: runNow,
    real_capital_blockers: realCapitalBlockers,
    safe_to_provide: input.cutover.safe_to_provide,
    never_provide: input.cutover.never_provide,
    verifier_commands: verifierCommands,
    live_execution_permission: "blocked" as const,
    wallet_mutation_permission: "blocked" as const,
    transaction_submission_permission: "blocked" as const,
    private_key_storage: "blocked" as const,
    seed_phrase_storage: "blocked" as const,
    secret_echo_permission: "blocked" as const,
    controls: [
      "This runbook is an operator action map only; it cannot sign, submit, custody funds, mutate wallets, or grant live execution.",
      "Allowed actions are limited to app review, paper-only autonomy, read-only market refresh, credential setup, and verifier commands.",
      "Gated actions name the missing setup input or review step without asking for private keys, seed phrases, raw transactions, or signed payloads.",
      "Autonomous live trading remains blocked until dedicated wallet, signer/custody, settlement, ops, accounting, profit proof, and manual live review are complete.",
    ],
  };

  return {
    ...receiptBase,
    receipt_hash: hashJson(receiptBase),
  };
}

function buildRunNowActions(input: {
  state: Web3TradingState;
  usability: Web3UsabilityStatusReceipt;
  cutover: Web3CutoverBlockerBoard;
  preflight: Web3LiveCapitalPreflightReceipt;
  runway: Web3SupervisedLiveRunway;
}): Web3OperatorRunbookAction[] {
  const capability = (id: Web3UsabilityStatusReceipt["capabilities"][number]["id"]) =>
    input.usability.capabilities.find((item) => item.id === id);
  const copilot = capability("copilot");
  const paper = capability("paper-autonomy");
  const liveDex = capability("live-dex-read");
  const jupiter = capability("jupiter-dry-run");
  const supervised = capability("supervised-live");
  const autonomousLive = capability("autonomous-live");
  const paperAllowed = paper?.status !== "locked";
  const liveDexAllowed = liveDex?.status === "usable" || liveDex?.status === "watch";
  const jupiterAllowed = jupiter?.status === "usable";
  const setupAllowed = input.cutover.open_blocker_count > 0;
  const sourceParam = input.state.market_source.mode;
  const accountParam = input.state.paper_account.mode;

  return [
    {
      id: "open-copilot",
      label: "Review Web3 copilot",
      status: copilot?.status === "usable" ? "allowed" : "gated",
      kind: "app-link",
      surface: "trading",
      href: `/trading?source=${sourceParam}&account=${accountParam}`,
      command: null,
      reason: copilot?.detail ?? "The Web3 cockpit can be reviewed without wallet authority.",
      next_action: copilot?.next_action ?? "Open the trading cockpit and review the current paper/read-only decision.",
      permission_scope: "Read-only cockpit and paper decision review; no signing or wallet mutation.",
    },
    {
      id: "run-paper-autonomy",
      label: "Run bounded paper autonomy",
      status: paperAllowed ? "allowed" : "gated",
      kind: "safe-command",
      surface: "terminal",
      href: null,
      command: "npm run smoke:web3 -- --base-url=http://localhost:4010",
      reason: paper?.detail ?? "Paper autonomy needs a healthy paper execution envelope.",
      next_action: paperAllowed
        ? paper?.status === "usable" || paper?.status === "watch"
          ? "Run the paper smoke/autonomy check, then review wallet equity and blocked fills before increasing cadence."
          : "Run the bounded paper smoke check as a safe repair/proof action, then review the remaining paper-autonomy gate."
        : paper?.next_action ?? "Repair paper autonomy gates before running another paper session.",
      permission_scope: "Paper-only local fills; live execution and wallet mutation remain blocked.",
    },
    {
      id: "refresh-live-dex",
      label: "Refresh read-only live DEX tape",
      status: liveDexAllowed ? "allowed" : "gated",
      kind: "safe-command",
      surface: "terminal",
      href: null,
      command: "npm run monitor:web3 -- --base-url=http://localhost:4010 --source=live-dex --json",
      reason: liveDex?.detail ?? input.state.market_source.detail,
      next_action: liveDexAllowed
        ? "Run the monitor to refresh discovery, candle proof, and sanitized market tape."
        : liveDex?.next_action ?? "Switch to live DEX read and verify public scanner evidence.",
      permission_scope: "Read-only public market data; no orders, signatures, or wallet mutation.",
    },
    {
      id: "rehearse-jupiter-order",
      label: "Rehearse Jupiter order",
      status: jupiterAllowed ? "allowed" : "gated",
      kind: "safe-command",
      surface: "terminal",
      href: "/settings/integrations",
      command: "npm run verify:web3 -- --base-url=http://localhost:4010 --require-jupiter-order",
      reason: jupiter?.detail ?? "Jupiter dry-run order evidence is gated.",
      next_action: jupiterAllowed
        ? "Run the strict Jupiter verifier and keep unsigned transaction bytes withheld."
        : jupiter?.next_action ?? input.cutover.next_safe_input?.next_action ?? "Add Jupiter order-rehearsal evidence first.",
      permission_scope: "Quote/order rehearsal only; execute, signing, submission, and transaction bytes remain blocked.",
    },
    {
      id: "continue-credential-setup",
      label: "Continue secure setup",
      status: setupAllowed ? "allowed" : "gated",
      kind: "app-link",
      surface: "settings",
      href: "/settings/integrations",
      command: null,
      reason: input.cutover.summary,
      next_action: input.cutover.next_safe_input?.next_action ?? "Review the manual live packet before any live-capital request.",
      permission_scope: "Safe setup only: public wallet, server-env target names, hash-only proof, and external review decisions.",
    },
    {
      id: "request-supervised-live-review",
      label: "Request supervised-live review",
      status: input.runway.can_request_live_review ? "allowed" : "gated",
      kind: "external-review",
      surface: "external-review",
      href: "/api/web3-manual-live-review-packet?source=live-dex&account=persistent",
      command: "npm run verify:web3 -- --base-url=http://localhost:4010 --require-operator-wallet --require-jupiter-order --require-dex-live",
      reason: supervised?.detail ?? input.runway.summary,
      next_action: input.runway.can_request_live_review
        ? "Send the manual live-review packet to the external reviewer; Mastermind still keeps execution blocked."
        : input.runway.next_action,
      permission_scope: "External review packet only; no in-app approval, signing, submission, or wallet mutation.",
    },
    {
      id: "autonomous-live-trading",
      label: "Autonomous live trading",
      status: "blocked",
      kind: "external-review",
      surface: "external-review",
      href: null,
      command: null,
      reason: autonomousLive?.detail ?? input.preflight.summary,
      next_action: input.preflight.next_action,
      permission_scope: "Blocked: live execution, transaction submission, wallet mutation, private-key storage, and seed-phrase storage.",
    },
  ];
}

function operatorRunbookSummary(
  status: Web3OperatorRunbookReceipt["status"],
  allowed: number,
  gated: number,
  blocked: number,
  openBlockers: number,
) {
  if (status === "supervised-review-ready") {
    return "Paper/read-only actions are available and supervised-live review can be requested externally; autonomous live trading is still blocked in app.";
  }
  if (status === "paper-operable") {
    return `${allowed} safe action${allowed === 1 ? "" : "s"} can run now; ${gated} gated and ${blocked} blocked action${blocked === 1 ? "" : "s"} remain with ${openBlockers} setup blocker${openBlockers === 1 ? "" : "s"}.`;
  }
  return `Setup is needed before useful paper or live-read actions can run; ${openBlockers} setup blocker${openBlockers === 1 ? "" : "s"} remain.`;
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
