import { createHash } from "node:crypto";
import type { Web3OperatorRequestPacket, Web3OperatorRequestPacketInput } from "./web3-operator-request-packet";
import type { Web3SupervisedLiveRunway } from "./web3-supervised-live-runway";
import type { Web3UsabilityStatusReceipt } from "./web3-usability-status";

export type Web3CutoverBlockerOwner = "operator" | "security" | "ops" | "accounting" | "manual-review";
export type Web3CutoverBlockerPhase = "now" | "before-live" | "review";

export type Web3CutoverBlockerRow = {
  id: string;
  label: string;
  owner: Web3CutoverBlockerOwner;
  phase: Web3CutoverBlockerPhase;
  status: "needed" | "blocked" | "review" | "ready";
  severity: "critical" | "needed" | "review";
  input_kind: Web3OperatorRequestPacketInput["input_kind"];
  safe_collection_surface: Web3OperatorRequestPacketInput["safe_collection_surface"];
  storage: Web3OperatorRequestPacketInput["storage"];
  can_enter_in_app: boolean;
  env_targets: string[];
  next_action: string;
  verifier_command: string | null;
  live_lane: Web3SupervisedLiveRunway["lanes"][number]["id"] | null;
  secret_handling: string;
};

export type Web3CutoverBlockerBoard = {
  mode: "web3-cutover-blocker-board";
  status: "needs-input" | "ready-for-review";
  generated_at: string;
  summary: string;
  receipt_hash: string;
  request_packet_hash: string;
  runway_hash: string;
  usability_hash: string;
  next_safe_input: Web3CutoverBlockerRow | null;
  next_live_lane_action: string;
  open_blocker_count: number;
  now_count: number;
  before_live_count: number;
  review_count: number;
  owner_counts: Record<Web3CutoverBlockerOwner, number>;
  rows: Web3CutoverBlockerRow[];
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

export function buildWeb3CutoverBlockerBoard(input: {
  requestPacket: Web3OperatorRequestPacket;
  runway: Web3SupervisedLiveRunway;
  usability: Web3UsabilityStatusReceipt;
  now?: Date;
}): Web3CutoverBlockerBoard {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const rows = [
    ...input.requestPacket.required_inputs.map((item) => toCutoverRow(item, input.runway)),
    ...input.requestPacket.review_inputs
      .filter((item) => !input.requestPacket.required_inputs.some((required) => required.id === item.id))
      .map((item) => toCutoverRow(item, input.runway)),
  ].sort((a, b) => rowRank(a) - rowRank(b));
  const ownerCounts = rows.reduce<Record<Web3CutoverBlockerOwner, number>>((counts, row) => {
    counts[row.owner] += row.status === "ready" ? 0 : 1;
    return counts;
  }, {
    operator: 0,
    security: 0,
    ops: 0,
    accounting: 0,
    "manual-review": 0,
  });
  const requestNextInputId = input.requestPacket.next_input?.id;
  const nextSafeInput = (requestNextInputId ? rows.find((row) => row.id === requestNextInputId) : null) ??
    rows.find((row) => row.phase === "now" && row.status === "needed") ??
    rows.find((row) => row.status === "needed") ??
    rows.find((row) => row.status === "review") ??
    rows.find((row) => row.status !== "ready") ??
    null;
  const openBlockerCount = rows.filter((row) => row.status !== "ready").length;
  const nowCount = rows.filter((row) => row.phase === "now" && row.status !== "ready").length;
  const beforeLiveCount = rows.filter((row) => row.phase === "before-live" && row.status !== "ready").length;
  const reviewCount = rows.filter((row) => row.phase === "review" && row.status !== "ready").length;
  const verifierCommands = Array.from(new Set([
    ...input.requestPacket.verifier_commands,
    ...input.runway.safe_commands,
    ...input.usability.safe_commands,
    ...rows.map((row) => row.verifier_command).filter((command): command is string => Boolean(command)),
  ])).slice(0, 10);
  const status: Web3CutoverBlockerBoard["status"] = openBlockerCount > 0 ? "needs-input" : "ready-for-review";
  const receiptBase = {
    mode: "web3-cutover-blocker-board" as const,
    status,
    generated_at: generatedAt,
    summary: cutoverSummary(openBlockerCount, nowCount, beforeLiveCount, reviewCount, nextSafeInput, input.runway),
    request_packet_hash: input.requestPacket.receipt_hash,
    runway_hash: input.runway.receipt_hash,
    usability_hash: input.usability.receipt_hash,
    next_safe_input: nextSafeInput,
    next_live_lane_action: input.runway.next_action,
    open_blocker_count: openBlockerCount,
    now_count: nowCount,
    before_live_count: beforeLiveCount,
    review_count: reviewCount,
    owner_counts: ownerCounts,
    rows,
    safe_to_provide: input.requestPacket.safe_to_provide,
    never_provide: input.requestPacket.never_provide,
    verifier_commands: verifierCommands,
    live_execution_permission: "blocked" as const,
    wallet_mutation_permission: "blocked" as const,
    transaction_submission_permission: "blocked" as const,
    private_key_storage: "blocked" as const,
    seed_phrase_storage: "blocked" as const,
    secret_echo_permission: "blocked" as const,
    controls: [
      "This blocker board is an operator checklist only; it cannot sign, submit, custody funds, mutate wallets, or grant live execution.",
      "Rows show safe collection surfaces, env target names, storage rules, and verifier commands without echoing configured secret values.",
      "The next safe input can differ from the next live-review lane; both must clear before supervised live review is meaningful.",
      "Private keys, seed phrases, raw keypairs, raw transactions, signed payloads, unrestricted signer policies, and secret echo stay blocked.",
    ],
  };

  return {
    ...receiptBase,
    receipt_hash: hashJson(receiptBase),
  };
}

function toCutoverRow(
  input: Web3OperatorRequestPacketInput,
  runway: Web3SupervisedLiveRunway,
): Web3CutoverBlockerRow {
  return {
    id: input.id,
    label: input.label,
    owner: ownerForInput(input),
    phase: phaseForInput(input),
    status: input.status,
    severity: severityForInput(input),
    input_kind: input.input_kind,
    safe_collection_surface: input.safe_collection_surface,
    storage: input.storage,
    can_enter_in_app: input.can_enter_in_app,
    env_targets: input.env_targets,
    next_action: input.next_action,
    verifier_command: input.verifier_command,
    live_lane: liveLaneForInput(input, runway),
    secret_handling: input.secret_handling,
  };
}

function ownerForInput(input: Web3OperatorRequestPacketInput): Web3CutoverBlockerOwner {
  if (input.input_kind === "ops-target" || input.input_kind === "ops-policy") return "ops";
  if (input.input_kind === "accounting-target") return "accounting";
  if (input.input_kind === "signer-policy") return "security";
  if (input.input_kind === "approval") return "manual-review";
  return "operator";
}

function phaseForInput(input: Web3OperatorRequestPacketInput): Web3CutoverBlockerPhase {
  if (input.priority === "required-now") return "now";
  if (input.priority === "review-before-live") return "review";
  return "before-live";
}

function severityForInput(input: Web3OperatorRequestPacketInput): Web3CutoverBlockerRow["severity"] {
  if (input.status === "blocked") return "critical";
  if (input.status === "review") return "review";
  return "needed";
}

function liveLaneForInput(
  input: Web3OperatorRequestPacketInput,
  runway: Web3SupervisedLiveRunway,
): Web3CutoverBlockerRow["live_lane"] {
  if (input.id === "dedicated-trading-wallet" || input.id === "wallet-ownership-proof") return "wallet";
  if (input.id === "jupiter-route-order-key") return "jupiter";
  if (input.id === "signer-custody-choice" || input.id === "signer-provider-credentials") return "signer";
  if (input.id === "emergency-stop-target" || input.id === "production-worker-ops") return "ops";
  if (input.id === "accounting-export-target" || input.id === "settlement-accounting-review") return "accounting";
  if (input.id === "manual-live-approval") return "manual-review";
  return runway.lanes.find((lane) => lane.next_action === input.next_action)?.id ?? null;
}

function rowRank(row: Web3CutoverBlockerRow) {
  const phaseRank = row.phase === "now" ? 0 : row.phase === "before-live" ? 10 : 20;
  const severityRank = row.severity === "critical" ? 0 : row.severity === "needed" ? 1 : 2;
  return phaseRank + severityRank;
}

function cutoverSummary(
  openBlockerCount: number,
  nowCount: number,
  beforeLiveCount: number,
  reviewCount: number,
  nextSafeInput: Web3CutoverBlockerRow | null,
  runway: Web3SupervisedLiveRunway,
) {
  if (openBlockerCount === 0) return "No open cutover blockers are listed; keep live execution blocked until external review signs off.";
  const next = nextSafeInput ? `${nextSafeInput.label}: ${nextSafeInput.next_action}` : runway.next_action;
  return `${openBlockerCount} open cutover blocker${openBlockerCount === 1 ? "" : "s"} remain (${nowCount} now, ${beforeLiveCount} before live, ${reviewCount} review). Next safe input is ${next}`;
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
