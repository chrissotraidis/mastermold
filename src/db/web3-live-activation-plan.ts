import { createHash } from "node:crypto";
import type { Web3CredentialRequirementsReceipt } from "./web3-credential-requirements";
import type { Web3LiveUsabilityBlockersReceipt } from "./web3-live-usability-blockers";
import type { Web3TradingState } from "./web3-trading";

export type Web3LiveActivationMilestone = {
  id: string;
  label: string;
  owner: "operator" | "security" | "ops" | "accounting" | "strategy" | "manual-review" | "system";
  status: "next" | "blocked" | "external-review" | "watch" | "ready";
  safe_value_type: string;
  safe_collection_surface: string;
  storage_rule: string;
  target_names: string[];
  completion_signal: string;
  verifier_command: string | null;
  next_action: string;
  blocks_live_capital: boolean;
};

export type Web3LiveActivationPlan = {
  mode: "web3-live-activation-plan";
  status:
    | "operator-input-needed"
    | "verification-needed"
    | "external-review-needed"
    | "activation-ready"
    | "blocked";
  generated_at: string;
  receipt_hash: string;
  source: Web3CredentialRequirementsReceipt["source"];
  account: Web3CredentialRequirementsReceipt["account"];
  scenario: Web3CredentialRequirementsReceipt["scenario"];
  readiness_score: number;
  live_autonomy_status: Web3TradingState["autonomous_live_autonomy_readiness"]["status"];
  live_usability_status: Web3LiveUsabilityBlockersReceipt["status"];
  can_run_unattended: boolean;
  can_trade_real_capital: boolean;
  live_execution_permitted: boolean;
  activation_permitted: false;
  milestone_count: number;
  next_milestone: Web3LiveActivationMilestone | null;
  milestones: Web3LiveActivationMilestone[];
  real_capital_blocker_count: number;
  requirement_count: number;
  credential_requirement_count: number;
  next_credential_request: Web3LiveUsabilityBlockersReceipt["next_credential_request"];
  next_action: string;
  summary: string;
  activation_commands: string[];
  source_endpoint: string;
  live_review_source_endpoint: string;
  text_packet: string;
  safe_to_provide: string[];
  never_provide: string[];
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  transaction_submission_permission: "blocked";
  signing_permission: "blocked";
  private_key_storage: "blocked";
  seed_phrase_storage: "blocked";
  secret_echo_permission: "blocked";
  controls: string[];
};

export type Web3LiveActivationPlanHealth = {
  mode: "web3-live-activation-health";
  status: Web3LiveActivationPlan["status"];
  receipt_hash: string;
  source: Web3LiveActivationPlan["source"];
  account: Web3LiveActivationPlan["account"];
  scenario: Web3LiveActivationPlan["scenario"];
  readiness_score: number;
  live_autonomy_status: Web3LiveActivationPlan["live_autonomy_status"];
  live_usability_status: Web3LiveActivationPlan["live_usability_status"];
  can_run_unattended: boolean;
  can_trade_real_capital: boolean;
  live_execution_permitted: boolean;
  activation_permitted: false;
  milestone_count: number;
  real_capital_blocker_count: number;
  next_milestone: Web3LiveActivationMilestone | null;
  next_action: string;
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

export function buildWeb3LiveActivationPlan(input: {
  requirements: Web3CredentialRequirementsReceipt;
  liveUsability: Web3LiveUsabilityBlockersReceipt;
  liveAutonomy: Web3TradingState["autonomous_live_autonomy_readiness"];
  now?: Date;
}): Web3LiveActivationPlan {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const milestones = buildActivationMilestones(input);
  const nextMilestone = milestones.find((item) => item.status === "next") ??
    milestones.find((item) => item.status === "blocked") ??
    milestones.find((item) => item.status === "watch") ??
    milestones.find((item) => item.status === "external-review") ??
    null;
  const status = activationPlanStatus(input, nextMilestone);
  const activationCommands = buildActivationCommands(input);
  const receiptBase = {
    mode: "web3-live-activation-plan" as const,
    status,
    generated_at: generatedAt,
    source: input.requirements.source,
    account: input.requirements.account,
    scenario: input.requirements.scenario,
    readiness_score: input.liveAutonomy.readiness_score,
    live_autonomy_status: input.liveAutonomy.status,
    live_usability_status: input.liveUsability.status,
    can_run_unattended: input.liveAutonomy.can_run_unattended,
    can_trade_real_capital: input.liveAutonomy.can_trade_real_capital,
    live_execution_permitted: input.liveAutonomy.live_execution_permitted,
    activation_permitted: false as const,
    milestone_count: milestones.length,
    next_milestone: nextMilestone,
    milestones,
    real_capital_blocker_count: input.liveUsability.real_capital_blocker_count,
    requirement_count: input.requirements.requirement_count,
    credential_requirement_count: input.requirements.requirement_count,
    next_credential_request: input.liveUsability.next_credential_request,
    next_action: nextMilestone?.next_action ?? input.liveAutonomy.next_action,
    summary: activationPlanSummary(input, status, nextMilestone),
    activation_commands: activationCommands,
    source_endpoint: `/api/web3-live-activation-plan?source=${input.requirements.source}&account=${input.requirements.account}&scenario=${input.requirements.scenario}&cycles=0`,
    live_review_source_endpoint: "/api/web3-live-activation-plan?source=live-dex&account=persistent&scenario=breakout&cycles=0",
    safe_to_provide: input.requirements.safe_to_share,
    never_provide: input.requirements.never_provide,
    live_execution_permission: "blocked" as const,
    wallet_mutation_permission: "blocked" as const,
    transaction_submission_permission: "blocked" as const,
    signing_permission: "blocked" as const,
    private_key_storage: "blocked" as const,
    seed_phrase_storage: "blocked" as const,
    secret_echo_permission: "blocked" as const,
    controls: [
      "This activation plan is a go/no-go checklist only; it is not an execution endpoint.",
      "It can name public wallet, provider, signer, operations, accounting, risk, and review targets, but it cannot store secrets or wallet authority.",
      "Live execution, signing, transaction submission, wallet mutation, private-key storage, seed-phrase storage, and secret echo remain blocked.",
      "Activation is not permitted until strict verification, external signer/executor review, and manual live approval are complete.",
    ],
  };
  const receiptWithText = {
    ...receiptBase,
    text_packet: renderActivationPlanText(receiptBase),
  };

  return {
    ...receiptWithText,
    receipt_hash: hashJson(receiptWithText),
  };
}

export function buildWeb3LiveActivationPlanHealth(
  plan: Web3LiveActivationPlan,
): Web3LiveActivationPlanHealth {
  return {
    mode: "web3-live-activation-health",
    status: plan.status,
    receipt_hash: plan.receipt_hash,
    source: plan.source,
    account: plan.account,
    scenario: plan.scenario,
    readiness_score: plan.readiness_score,
    live_autonomy_status: plan.live_autonomy_status,
    live_usability_status: plan.live_usability_status,
    can_run_unattended: plan.can_run_unattended,
    can_trade_real_capital: plan.can_trade_real_capital,
    live_execution_permitted: plan.live_execution_permitted,
    activation_permitted: false,
    milestone_count: plan.milestone_count,
    real_capital_blocker_count: plan.real_capital_blocker_count,
    next_milestone: plan.next_milestone,
    next_action: plan.next_action,
    source_endpoint: plan.source_endpoint,
    live_review_source_endpoint: plan.live_review_source_endpoint,
    live_execution_permission: "blocked",
    wallet_mutation_permission: "blocked",
    transaction_submission_permission: "blocked",
    signing_permission: "blocked",
    private_key_storage: "blocked",
    seed_phrase_storage: "blocked",
    secret_echo_permission: "blocked",
  };
}

function buildActivationMilestones(input: {
  requirements: Web3CredentialRequirementsReceipt;
  liveUsability: Web3LiveUsabilityBlockersReceipt;
  liveAutonomy: Web3TradingState["autonomous_live_autonomy_readiness"];
}): Web3LiveActivationMilestone[] {
  const nextRequirementId = input.requirements.next_requirement?.id ?? null;
  const requirementMilestones = input.requirements.requirements.map((requirement) => ({
    id: requirement.id,
    label: requirement.label,
    owner: requirement.owner,
    status: requirement.id === nextRequirementId
      ? "next" as const
      : requirement.priority === "external-review"
        ? "external-review" as const
        : "blocked" as const,
    safe_value_type: requirement.safe_value_type,
    safe_collection_surface: requirement.safe_collection_surface,
    storage_rule: requirement.storage_rule,
    target_names: requirement.target_names,
    completion_signal: requirement.completion_signal,
    verifier_command: verifierCommandForRequirement(requirement.id, input),
    next_action: requirement.next_action,
    blocks_live_capital: requirement.blocks_live_capital,
  }));
  const autonomyStatus = input.liveAutonomy.can_trade_real_capital && input.liveAutonomy.live_execution_permitted
    ? "ready"
    : input.liveAutonomy.status === "blocked"
      ? "blocked"
      : "watch";

  return [
    ...requirementMilestones,
    {
      id: "live-autonomy-final-gate",
      label: "Live autonomy final gate",
      owner: "system",
      status: autonomyStatus,
      safe_value_type: "readiness receipt",
      safe_collection_surface: "/api/web3-live-autonomy-readiness",
      storage_rule: "status-only",
      target_names: ["web3_live_autonomy_readiness"],
      completion_signal: "Daemon, market, route, fees, policy, signer, relay, and kill-switch items pass with external live-executor approval.",
      verifier_command: "npm run verify:web3 -- --base-url=http://localhost:4010 --require-operator-wallet --require-jupiter-order --require-dex-live",
      next_action: input.liveAutonomy.next_action,
      blocks_live_capital: true,
    },
  ];
}

function verifierCommandForRequirement(
  id: Web3CredentialRequirementsReceipt["requirements"][number]["id"],
  input: {
    requirements: Web3CredentialRequirementsReceipt;
    liveUsability: Web3LiveUsabilityBlockersReceipt;
  },
) {
  if (id === "dedicated-public-wallet" || id === "wallet-ownership-proof") {
    return input.liveUsability.next_credential_request?.verifier_command ??
      "npm run verify:web3 -- --base-url=http://localhost:4010 --wallet=<public-solana-address> --require-operator-wallet";
  }
  if (id === "jupiter-order-rail") {
    return "npm run verify:web3 -- --base-url=http://localhost:4010 --wallet=<public-solana-address> --require-operator-wallet --require-jupiter-order";
  }
  if (id === "read-provider-rail") {
    return "npm run verify:web3 -- --base-url=http://localhost:4010 --require-dex-live";
  }
  if (id === "manual-live-review") {
    return "npm run preflight-live:web3 -- --base-url=http://localhost:4010 --source=live-dex --account=persistent --scenario=breakout --json";
  }
  return null;
}

function activationPlanStatus(
  input: {
    requirements: Web3CredentialRequirementsReceipt;
    liveUsability: Web3LiveUsabilityBlockersReceipt;
    liveAutonomy: Web3TradingState["autonomous_live_autonomy_readiness"];
  },
  nextMilestone: Web3LiveActivationMilestone | null,
): Web3LiveActivationPlan["status"] {
  if (input.liveAutonomy.can_trade_real_capital && input.liveAutonomy.live_execution_permitted) return "activation-ready";
  if (input.requirements.needed_now_count > 0 || input.liveUsability.open_operator_input_count > 0) return "operator-input-needed";
  if (input.requirements.before_live_count > 0 || input.liveUsability.real_capital_blocker_count > 0) return "verification-needed";
  if (input.requirements.external_review_count > 0 || nextMilestone?.status === "external-review") return "external-review-needed";
  return "blocked";
}

function buildActivationCommands(input: {
  requirements: Web3CredentialRequirementsReceipt;
  liveUsability: Web3LiveUsabilityBlockersReceipt;
}) {
  return Array.from(new Set([
    ...input.requirements.safe_export_commands,
    ...input.liveUsability.verifier_commands,
    "npm run --silent activate:web3 -- --base-url=http://localhost:4010",
    "npm run verify:web3 -- --base-url=http://localhost:4010 --wallet=<public-solana-address> --require-operator-wallet",
    "npm run verify:web3 -- --base-url=http://localhost:4010 --wallet=<public-solana-address> --require-operator-wallet --require-jupiter-order --require-dex-live",
    "npm run preflight-live:web3 -- --base-url=http://localhost:4010 --source=live-dex --account=persistent --scenario=breakout --json",
  ].filter((command): command is string => typeof command === "string" && command.length > 0)));
}

function activationPlanSummary(
  input: {
    requirements: Web3CredentialRequirementsReceipt;
    liveUsability: Web3LiveUsabilityBlockersReceipt;
    liveAutonomy: Web3TradingState["autonomous_live_autonomy_readiness"];
  },
  status: Web3LiveActivationPlan["status"],
  nextMilestone: Web3LiveActivationMilestone | null,
) {
  if (status === "activation-ready") {
    return "All activation gates report ready, but this receipt still does not submit trades or move wallet funds.";
  }
  return [
    `Live activation is ${status.replaceAll("-", " ")} at ${input.liveAutonomy.readiness_score}/100.`,
    `${input.requirements.requirement_count} credential requirements and ${input.liveUsability.real_capital_blocker_count} real-capital blockers remain tracked.`,
    nextMilestone ? `Next milestone: ${nextMilestone.label}.` : "No milestone is selected.",
  ].join(" ");
}

function renderActivationPlanText(
  receipt: Omit<Web3LiveActivationPlan, "receipt_hash" | "text_packet">,
) {
  const nextMilestone = receipt.next_milestone
    ? [
        `- ${receipt.next_milestone.label}: ${receipt.next_milestone.next_action}`,
        `- Owner: ${receipt.next_milestone.owner}`,
        `- Status: ${receipt.next_milestone.status}`,
        `- Safe value: ${receipt.next_milestone.safe_value_type}`,
        `- Surface: ${receipt.next_milestone.safe_collection_surface}`,
        `- Storage: ${receipt.next_milestone.storage_rule}`,
        `- Targets: ${receipt.next_milestone.target_names.join(", ")}`,
        receipt.next_milestone.verifier_command ? `- Verifier: ${receipt.next_milestone.verifier_command}` : null,
      ].filter(Boolean).join("\n")
    : "- No next milestone is selected.";
  const milestones = receipt.milestones.map((milestone, index) => [
    `${index + 1}. ${milestone.label}`,
    `   - Owner: ${milestone.owner}`,
    `   - Status: ${milestone.status}`,
    `   - Safe value: ${milestone.safe_value_type}`,
    `   - Surface: ${milestone.safe_collection_surface}`,
    `   - Storage: ${milestone.storage_rule}`,
    `   - Targets: ${milestone.target_names.join(", ")}`,
    milestone.verifier_command ? `   - Verifier: ${milestone.verifier_command}` : null,
    `   - Done when: ${milestone.completion_signal}`,
  ].filter(Boolean).join("\n"));

  return [
    "# Mastermind Web3 Live Activation Plan",
    "",
    `Generated: ${receipt.generated_at}`,
    `Status: ${receipt.status}`,
    `Source: ${receipt.source}`,
    `Account: ${receipt.account}`,
    `Scenario: ${receipt.scenario}`,
    `Readiness score: ${receipt.readiness_score}/100`,
    `Activation permitted: ${receipt.activation_permitted ? "yes" : "no"}`,
    "",
    "## Summary",
    receipt.summary,
    "",
    "## Next Milestone",
    nextMilestone,
    "",
    "## Milestones",
    ...milestones,
    "",
    "## Commands",
    ...receipt.activation_commands.map((command) => `- ${command}`),
    "",
    "## Safe To Provide",
    ...receipt.safe_to_provide.map((item) => `- ${item}`),
    "",
    "## Never Provide",
    ...receipt.never_provide.map((item) => `- ${item}`),
    "",
    "## Source Endpoints",
    `- ${receipt.source_endpoint}`,
    `- ${receipt.live_review_source_endpoint}`,
    "",
    "## Controls",
    ...receipt.controls.map((control) => `- ${control}`),
  ].join("\n");
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
