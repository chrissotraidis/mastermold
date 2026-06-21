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

  return {
    ...receiptBase,
    receipt_hash: hashJson(receiptBase),
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

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
