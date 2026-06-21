import { createHash } from "node:crypto";
import type {
  Web3OperatorCredentialHandoffInput,
  Web3OperatorCredentialHandoffReceipt,
} from "./web3-operator-credential-handoff";
import type { Web3OperatorUnlockStep, Web3UsabilityStatusReceipt } from "./web3-usability-status";

export type Web3OperatorRequestPacketInput = {
  id: Web3OperatorCredentialHandoffInput["id"];
  label: string;
  status: Web3OperatorCredentialHandoffInput["status"];
  priority: Web3OperatorCredentialHandoffInput["priority"];
  input_kind: Web3OperatorCredentialHandoffInput["input_kind"];
  safe_collection_surface: Web3OperatorCredentialHandoffInput["safe_collection_surface"];
  storage: Web3OperatorCredentialHandoffInput["storage"];
  can_enter_in_app: boolean;
  env_targets: string[];
  next_action: string;
  verifier_command: string | null;
  secret_handling: string;
};

export type Web3OperatorRequestPacket = {
  mode: "web3-operator-request-packet";
  status: "needs-input" | "ready-for-review";
  generated_at: string;
  summary: string;
  receipt_hash: string;
  handoff_receipt_hash: string;
  next_unlock_step: Web3OperatorUnlockStep | null;
  operator_unlock_sequence: Web3OperatorUnlockStep[];
  live_usability: Web3OperatorCredentialHandoffReceipt["live_usability"];
  next_input: Web3OperatorRequestPacketInput | null;
  required_inputs: Web3OperatorRequestPacketInput[];
  review_inputs: Web3OperatorRequestPacketInput[];
  safe_to_provide: string[];
  never_provide: string[];
  verifier_commands: string[];
  text_packet: string;
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  transaction_submission_permission: "blocked";
  private_key_storage: "blocked";
  seed_phrase_storage: "blocked";
  secret_echo_permission: "blocked";
  controls: string[];
};

export function buildWeb3OperatorRequestPacket(
  handoff: Web3OperatorCredentialHandoffReceipt,
  options: { usability?: Web3UsabilityStatusReceipt } = {},
): Web3OperatorRequestPacket {
  const generatedAt = new Date().toISOString();
  const openRequired = handoff.inputs
    .filter((item) => item.priority !== "review-before-live" && item.status !== "ready")
    .map(toRequestInput);
  const reviewInputs = handoff.inputs
    .filter((item) => item.priority === "review-before-live" || item.status === "review")
    .map(toRequestInput);
  const nextInput = handoff.next_input ? toRequestInput(handoff.next_input) : openRequired[0] ?? reviewInputs[0] ?? null;
  const operatorUnlockSequence = options.usability?.operator_unlock_sequence ?? [];
  const nextUnlockStep = operatorUnlockSequence.find((step) => step.status !== "ready") ??
    operatorUnlockSequence[operatorUnlockSequence.length - 1] ??
    null;
  const verifierCommands = Array.from(new Set([
    ...handoff.safe_commands,
    ...handoff.inputs.map((item) => item.verifier_command).filter((command): command is string => Boolean(command)),
  ])).slice(0, 8);
  const status: Web3OperatorRequestPacket["status"] = openRequired.length > 0 ? "needs-input" : "ready-for-review";
  const packetBase = {
    mode: "web3-operator-request-packet" as const,
    status,
    generated_at: generatedAt,
    summary: status === "needs-input"
      ? `Mastermind still needs ${openRequired.length} required Web3 setup input${openRequired.length === 1 ? "" : "s"} before supervised trading review.`
      : "Required Web3 setup inputs are ready; keep live review external.",
    handoff_receipt_hash: handoff.receipt_hash,
    next_unlock_step: nextUnlockStep,
    operator_unlock_sequence: operatorUnlockSequence,
    live_usability: handoff.live_usability,
    next_input: nextInput,
    required_inputs: openRequired,
    review_inputs: reviewInputs,
    safe_to_provide: handoff.allowed_inputs,
    never_provide: handoff.never_request,
    verifier_commands: verifierCommands,
    live_execution_permission: "blocked" as const,
    wallet_mutation_permission: "blocked" as const,
    transaction_submission_permission: "blocked" as const,
    private_key_storage: "blocked" as const,
    seed_phrase_storage: "blocked" as const,
    secret_echo_permission: "blocked" as const,
    controls: [
      "This packet is safe to share with a research/helper agent because it contains target names and status only.",
      "When a usability receipt is supplied, the packet carries the ordered unlock sequence so setup helpers can resolve wallet scope before downstream proof and review work.",
      "When a live-usability summary is supplied, the packet includes blocker counts, listed-versus-total rows, live-lane counts, and the next unlock step without embedding secrets or full diagnostic rows.",
      "It asks for public wallet, server-env API keys, ops contacts, accounting target, signer/custody decision, and manual review decisions; it never asks for wallet private keys or seed phrases.",
      "Live execution, transaction submission, wallet mutation, private-key storage, seed-phrase storage, and secret echo remain blocked.",
    ],
  };
  const textPacket = renderOperatorRequestText(packetBase);
  const receiptBase = {
    ...packetBase,
    text_packet: textPacket,
  };

  return {
    ...receiptBase,
    receipt_hash: hashJson(receiptBase),
  };
}

function toRequestInput(input: Web3OperatorCredentialHandoffInput): Web3OperatorRequestPacketInput {
  return {
    id: input.id,
    label: input.label,
    status: input.status,
    priority: input.priority,
    input_kind: input.input_kind,
    safe_collection_surface: input.safe_collection_surface,
    storage: input.storage,
    can_enter_in_app: input.can_enter_in_app,
    env_targets: input.env_targets,
    next_action: input.next_action,
    verifier_command: input.verifier_command,
    secret_handling: input.secret_handling,
  };
}

function renderOperatorRequestText(packet: Omit<Web3OperatorRequestPacket, "receipt_hash" | "text_packet">) {
  const requiredLines = packet.required_inputs.length > 0
    ? packet.required_inputs.map((item) => [
      `- ${item.label}`,
      `  Status: ${item.status}`,
      `  Provide via: ${item.safe_collection_surface.replaceAll("-", " ")}`,
      `  Storage: ${item.storage.replaceAll("-", " ")}`,
      item.env_targets.length > 0 ? `  Target names: ${item.env_targets.join(", ")}` : null,
      `  Next action: ${item.next_action}`,
      `  Secret handling: ${item.secret_handling}`,
      item.verifier_command ? `  Verify: ${item.verifier_command}` : null,
    ].filter(Boolean).join("\n")).join("\n")
    : "- No required inputs are open.";
  const reviewLines = packet.review_inputs.length > 0
    ? packet.review_inputs.slice(0, 6).map((item) => `- ${item.label}: ${item.next_action}`).join("\n")
    : "- No review inputs are open.";
  const unlockLines = packet.operator_unlock_sequence.length > 0
    ? packet.operator_unlock_sequence.map((step, index) => [
      `- ${index + 1}. ${step.label}`,
      `  Status: ${step.status}`,
      `  Storage: ${step.storage.replaceAll("-", " ")}`,
      `  Next action: ${step.next_action}`,
      `  Evidence: ${step.evidence}`,
    ].join("\n")).join("\n")
    : "- No ordered unlock sequence was attached.";
  const liveUsabilityLines = packet.live_usability
    ? [
      `- Status: ${packet.live_usability.status}`,
      `- Real-money blockers: ${packet.live_usability.real_capital_blocker_count}`,
      `- Rows listed: ${packet.live_usability.listed_live_usability_row_count}/${packet.live_usability.total_live_usability_row_count}`,
      `- Live lanes ready: ${packet.live_usability.ready_live_lane_count}/${packet.live_usability.total_live_lane_count}`,
      packet.live_usability.next_unlock_step_label
        ? `- Next unlock: ${packet.live_usability.next_unlock_step_label}; ${packet.live_usability.next_unlock_step_action}`
        : `- Next action: ${packet.live_usability.next_action}`,
      `- Evidence: ${packet.live_usability.evidence_endpoint}; receipt ${packet.live_usability.receipt_hash}`,
    ].join("\n")
    : "- No live-usability summary was attached; load GET /api/web3-live-usability-blockers for the full blocker packet.";
  return [
    "# Mastermind Web3 Operator Request Packet",
    "",
    packet.summary,
    "",
    "## Next Ordered Unlock Step",
    packet.next_unlock_step
      ? `${packet.next_unlock_step.label}: ${packet.next_unlock_step.status}; ${packet.next_unlock_step.next_action}`
      : "No ordered unlock step was attached.",
    "",
    "## Next Safe Input",
    packet.next_input ? `${packet.next_input.label}: ${packet.next_input.next_action}` : "No next input is open.",
    "",
    "## Operator Unlock Sequence",
    unlockLines,
    "",
    "## Live Usability Summary",
    liveUsabilityLines,
    "",
    "## Required Inputs",
    requiredLines,
    "",
    "## Review Inputs",
    reviewLines,
    "",
    "## Safe To Provide",
    ...packet.safe_to_provide.map((item) => `- ${item}`),
    "",
    "## Never Provide",
    ...packet.never_provide.map((item) => `- ${item}`),
    "",
    "## Verifier Commands",
    ...packet.verifier_commands.map((item) => `- ${item}`),
    "",
    "## Boundaries",
    "- Live execution: blocked",
    "- Transaction submission: blocked",
    "- Wallet mutation: blocked",
    "- Private-key storage: blocked",
    "- Seed-phrase storage: blocked",
    "- Secret echo: blocked",
  ].join("\n");
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
