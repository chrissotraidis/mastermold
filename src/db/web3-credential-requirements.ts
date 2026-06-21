import { createHash } from "node:crypto";
import type { Web3CredentialRequirement, Web3ResearchHandoffPacket } from "./web3-research-handoff-packet";

export type Web3CredentialRequirementsReceipt = {
  mode: "web3-credential-requirements";
  status: "operator-input-needed" | "before-live-needed" | "external-review-needed" | "requirements-ready";
  generated_at: string;
  receipt_hash: string;
  research_handoff_hash: string;
  source: Web3ResearchHandoffPacket["source"];
  account: Web3ResearchHandoffPacket["account"];
  scenario: Web3ResearchHandoffPacket["scenario"];
  requirement_count: number;
  needed_now_count: number;
  before_live_count: number;
  external_review_count: number;
  blocker_count: number;
  next_requirement: Web3CredentialRequirement | null;
  requirements: Web3CredentialRequirement[];
  safe_to_share: string[];
  never_provide: string[];
  source_endpoint: string;
  live_review_source_endpoint: string;
  safe_export_commands: string[];
  text_packet: string;
  summary: string;
  next_action: string;
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  transaction_submission_permission: "blocked";
  signing_permission: "blocked";
  private_key_storage: "blocked";
  seed_phrase_storage: "blocked";
  secret_echo_permission: "blocked";
  controls: string[];
};

export type Web3CredentialRequirementsHealth = {
  mode: "web3-credential-requirements-health";
  status: Web3CredentialRequirementsReceipt["status"];
  receipt_hash: string;
  research_handoff_hash: string;
  requirement_count: number;
  needed_now_count: number;
  before_live_count: number;
  external_review_count: number;
  blocker_count: number;
  next_requirement: Web3CredentialRequirement | null;
  source_endpoint: string;
  live_review_source_endpoint: string;
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  transaction_submission_permission: "blocked";
  signing_permission: "blocked";
  private_key_storage: "blocked";
  seed_phrase_storage: "blocked";
  secret_echo_permission: "blocked";
};

export function buildWeb3CredentialRequirementsReceipt(
  packet: Web3ResearchHandoffPacket,
  now = new Date(),
): Web3CredentialRequirementsReceipt {
  const requirements = packet.credential_requirements;
  const neededNowCount = requirements.filter((item) => item.priority === "needed-now").length;
  const beforeLiveCount = requirements.filter((item) => item.priority === "before-live").length;
  const externalReviewCount = requirements.filter((item) => item.priority === "external-review").length;
  const blockerCount = requirements.filter((item) => item.blocks_live_capital).length;
  const nextRequirement = requirements.find((item) => item.priority === "needed-now") ??
    requirements.find((item) => item.priority === "before-live") ??
    requirements.find((item) => item.priority === "external-review") ??
    null;
  const status = credentialRequirementsStatus(neededNowCount, beforeLiveCount, externalReviewCount);
  const receiptBase = {
    mode: "web3-credential-requirements" as const,
    status,
    generated_at: now.toISOString(),
    research_handoff_hash: packet.receipt_hash,
    source: packet.source,
    account: packet.account,
    scenario: packet.scenario,
    requirement_count: requirements.length,
    needed_now_count: neededNowCount,
    before_live_count: beforeLiveCount,
    external_review_count: externalReviewCount,
    blocker_count: blockerCount,
    next_requirement: nextRequirement,
    requirements,
    safe_to_share: packet.safe_to_share,
    never_provide: packet.never_provide,
    source_endpoint: `/api/web3-credential-requirements?source=${packet.source}&account=${packet.account}&scenario=${packet.scenario}&cycles=0`,
    live_review_source_endpoint: "/api/web3-credential-requirements?source=live-dex&account=persistent&scenario=breakout&cycles=0",
    safe_export_commands: [
      "npm run --silent requirements:web3 -- --base-url=http://localhost:4010",
      "npm run --silent requirements:web3 -- --base-url=http://localhost:4010 --json",
    ],
    summary: credentialRequirementsSummary(requirements.length, neededNowCount, beforeLiveCount, externalReviewCount),
    next_action: nextRequirement?.next_action ?? "No credential requirement is open; run strict verification and external review before any live authority.",
    live_execution_permission: "blocked" as const,
    wallet_mutation_permission: "blocked" as const,
    transaction_submission_permission: "blocked" as const,
    signing_permission: "blocked" as const,
    private_key_storage: "blocked" as const,
    seed_phrase_storage: "blocked" as const,
    secret_echo_permission: "blocked" as const,
    controls: [
      "This receipt is a credential collection checklist only; it is not an execution endpoint.",
      "It names safe value types, target names, surfaces, storage rules, related research lanes, and completion signals only.",
      "Provider secrets, wallet private keys, seed phrases, raw transactions, signed payloads, and wallet authority are never returned.",
      "Every requirement keeps live execution, signing, transaction submission, wallet mutation, private-key storage, seed-phrase storage, and secret echo blocked.",
    ],
  };
  const receiptWithText = {
    ...receiptBase,
    text_packet: renderCredentialRequirementsText(receiptBase),
  };

  return {
    ...receiptWithText,
    receipt_hash: hashJson(receiptWithText),
  };
}

export function buildWeb3CredentialRequirementsHealth(
  receipt: Web3CredentialRequirementsReceipt,
): Web3CredentialRequirementsHealth {
  return {
    mode: "web3-credential-requirements-health",
    status: receipt.status,
    receipt_hash: receipt.receipt_hash,
    research_handoff_hash: receipt.research_handoff_hash,
    requirement_count: receipt.requirement_count,
    needed_now_count: receipt.needed_now_count,
    before_live_count: receipt.before_live_count,
    external_review_count: receipt.external_review_count,
    blocker_count: receipt.blocker_count,
    next_requirement: receipt.next_requirement,
    source_endpoint: receipt.source_endpoint,
    live_review_source_endpoint: receipt.live_review_source_endpoint,
    live_execution_permission: "blocked",
    wallet_mutation_permission: "blocked",
    transaction_submission_permission: "blocked",
    signing_permission: "blocked",
    private_key_storage: "blocked",
    seed_phrase_storage: "blocked",
    secret_echo_permission: "blocked",
  };
}

function credentialRequirementsStatus(
  neededNowCount: number,
  beforeLiveCount: number,
  externalReviewCount: number,
): Web3CredentialRequirementsReceipt["status"] {
  if (neededNowCount > 0) return "operator-input-needed";
  if (beforeLiveCount > 0) return "before-live-needed";
  if (externalReviewCount > 0) return "external-review-needed";
  return "requirements-ready";
}

function credentialRequirementsSummary(
  total: number,
  neededNowCount: number,
  beforeLiveCount: number,
  externalReviewCount: number,
) {
  return `${total} safe Web3 credential requirement${total === 1 ? "" : "s"} are tracked: ${neededNowCount} needed now, ${beforeLiveCount} before live review, and ${externalReviewCount} external review gate${externalReviewCount === 1 ? "" : "s"}.`;
}

function renderCredentialRequirementsText(
  receipt: Omit<Web3CredentialRequirementsReceipt, "receipt_hash" | "text_packet">,
) {
  const sourceEndpoints = Array.from(new Set([receipt.source_endpoint, receipt.live_review_source_endpoint]));
  const nextRequirement = receipt.next_requirement
    ? [
        `- ${receipt.next_requirement.label}: ${receipt.next_requirement.next_action}`,
        `- Owner: ${receipt.next_requirement.owner}`,
        `- Priority: ${receipt.next_requirement.priority.replaceAll("-", " ")}`,
        `- Safe value: ${receipt.next_requirement.safe_value_type}`,
        `- Surface: ${receipt.next_requirement.safe_collection_surface}`,
        `- Storage: ${receipt.next_requirement.storage_rule}`,
        `- Target names: ${receipt.next_requirement.target_names.join(", ")}`,
        `- Done when: ${receipt.next_requirement.completion_signal}`,
      ].join("\n")
    : "- No credential requirement is currently open.";
  const requirements = receipt.requirements.map((requirement, index) => [
    `${index + 1}. ${requirement.label}`,
    `   - Owner: ${requirement.owner}`,
    `   - Priority: ${requirement.priority.replaceAll("-", " ")}`,
    `   - Safe value: ${requirement.safe_value_type}`,
    `   - Surface: ${requirement.safe_collection_surface}`,
    `   - Storage: ${requirement.storage_rule}`,
    `   - Target names: ${requirement.target_names.join(", ")}`,
    requirement.research_question_ids.length > 0 ? `   - Related research: ${requirement.research_question_ids.join(", ")}` : null,
    `   - Done when: ${requirement.completion_signal}`,
    `   - Permissions: live execution blocked; signing blocked; transaction submission blocked; wallet mutation blocked; secret echo blocked.`,
  ].filter(Boolean).join("\n"));

  return [
    "# Mastermind Web3 Credential Requirements Packet",
    "",
    `Generated: ${receipt.generated_at}`,
    `Status: ${receipt.status}`,
    `Source: ${receipt.source}`,
    `Account: ${receipt.account}`,
    `Scenario: ${receipt.scenario}`,
    `Research handoff hash: ${receipt.research_handoff_hash}`,
    "",
    "## Summary",
    receipt.summary,
    "",
    "## Next Requirement",
    nextRequirement,
    "",
    "## Requirements",
    ...requirements,
    "",
    "## Safe To Share",
    ...receipt.safe_to_share.map((item) => `- ${item}`),
    "",
    "## Never Provide",
    ...receipt.never_provide.map((item) => `- ${item}`),
    "",
    "## Source Endpoints",
    ...sourceEndpoints.map((endpoint) => `- ${endpoint}`),
    "",
    "## Local Export Commands",
    ...receipt.safe_export_commands.map((command) => `- ${command}`),
    "",
    "## Controls",
    ...receipt.controls.map((control) => `- ${control}`),
  ].join("\n");
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
