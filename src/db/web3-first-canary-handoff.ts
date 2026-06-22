import { createHash } from "node:crypto";
import type { Web3CredentialRequirementsReceipt } from "./web3-credential-requirements";
import type { Web3FirstCanaryDrillReceipt, Web3FirstCanaryUnblockStep } from "./web3-first-canary-drill";

export type Web3FirstCanaryHandoffReceipt = {
  mode: "web3-first-canary-handoff";
  status:
    | "operator-input-needed"
    | "ready-to-request-unsigned-order"
    | "ready-to-relay-signed-payload"
    | "canary-proven"
    | "blocked";
  generated_at: string;
  receipt_hash: string;
  first_canary_drill_hash: string;
  credential_requirements_hash: string;
  source: Web3FirstCanaryDrillReceipt["source"];
  account: Web3FirstCanaryDrillReceipt["account"];
  scenario: Web3FirstCanaryDrillReceipt["scenario"];
  operator_wallet_public_key: string | null;
  operator_wallet_strict_command: string | null;
  actual_live_trade_tested: boolean;
  real_funds_moved_by_this_app: boolean;
  proof_pass_count: number;
  proof_required_count: 4;
  next_operator_step: Web3FirstCanaryUnblockStep | null;
  current_step_contract: Web3FirstCanaryCurrentStepContract;
  proof_ledger: Web3FirstCanaryProofLedgerItem[];
  done_steps: Web3FirstCanaryUnblockStep[];
  open_steps: Web3FirstCanaryUnblockStep[];
  safe_to_provide_now: string[];
  never_provide: string[];
  safe_surfaces: string[];
  safe_commands: string[];
  proof_completion_criteria: string[];
  source_endpoints: string[];
  text_packet: string;
  summary: string;
  next_action: string;
  live_execution_permission: "blocked";
  transaction_submission_permission: "blocked";
  wallet_mutation_permission: "blocked";
  signing_permission: "blocked";
  private_key_storage: "blocked";
  seed_phrase_storage: "blocked";
  signed_payload_storage: "blocked";
  secret_echo_permission: "blocked";
  controls: string[];
};

export type Web3FirstCanaryCurrentStepContract = {
  mode: "web3-first-canary-current-step-contract";
  step_id: Web3FirstCanaryUnblockStep["id"] | null;
  label: string;
  phase: Web3FirstCanaryUnblockStep["phase"] | "complete";
  status: Web3FirstCanaryUnblockStep["status"] | "complete";
  action: string;
  safe_surface: string | null;
  command: string | null;
  safe_to_provide_now: string[];
  never_provide: string[];
  completion_signal: string;
  can_complete_in_app: boolean;
  next_verification_command: string | null;
  live_execution_permission: "blocked";
  transaction_submission_permission: "blocked";
  wallet_mutation_permission: "blocked";
  secret_echo_permission: "blocked";
};

export type Web3FirstCanaryProofLedgerItem = {
  id: Web3FirstCanaryUnblockStep["id"];
  label: string;
  status: Web3FirstCanaryUnblockStep["status"];
  phase: Web3FirstCanaryUnblockStep["phase"];
  done: boolean;
  blocks_funded_canary: boolean;
  completion_signal: string;
};

export function buildWeb3FirstCanaryHandoffReceipt(input: {
  drill: Web3FirstCanaryDrillReceipt;
  requirements: Web3CredentialRequirementsReceipt;
  now?: Date;
}): Web3FirstCanaryHandoffReceipt {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const nextOperatorStep = input.drill.next_unblock_step;
  const doneSteps = input.drill.operator_unblock_plan.filter((step) => step.status === "done");
  const openSteps = input.drill.operator_unblock_plan.filter((step) => step.status !== "done");
  const safeToProvideNow = buildSafeToProvideNow(nextOperatorStep, input.requirements);
  const safeCommands = uniqueText([
    `npm run --silent handoff-canary:web3 -- --base-url=http://localhost:4010 --source=${input.drill.source} --account=${input.drill.account} --scenario=${input.drill.scenario} --cycles=0`,
    `npm run --silent handoff-canary:web3 -- --base-url=http://localhost:4010 --source=${input.drill.source} --account=${input.drill.account} --scenario=${input.drill.scenario} --cycles=0 --json`,
    input.drill.strict_ready_command,
    input.drill.strict_proof_command,
    ...input.drill.safe_commands,
    ...input.requirements.safe_export_commands,
  ]);
  const sourceEndpoints = uniqueText([
    input.drill.source_endpoint,
    input.drill.live_review_source_endpoint,
    input.requirements.source_endpoint,
    input.requirements.live_review_source_endpoint,
  ]);
  const status = firstCanaryHandoffStatus(input.drill, input.requirements);
  const summary = firstCanaryHandoffSummary(input.drill, openSteps);
  const currentStepContract = buildCurrentStepContract({
    nextOperatorStep,
    safeToProvideNow,
    neverProvide: input.requirements.never_provide,
    fallbackAction: input.drill.next_action,
    fallbackCommand: input.drill.strict_ready_command,
  });
  const proofLedger = input.drill.operator_unblock_plan.map((step) => ({
    id: step.id,
    label: step.label,
    status: step.status,
    phase: step.phase,
    done: step.status === "done",
    blocks_funded_canary: step.blocks_funded_canary,
    completion_signal: step.completion_signal,
  }));
  const receiptBase = {
    mode: "web3-first-canary-handoff" as const,
    status,
    generated_at: generatedAt,
    first_canary_drill_hash: input.drill.receipt_hash,
    credential_requirements_hash: input.requirements.receipt_hash,
    source: input.drill.source,
    account: input.drill.account,
    scenario: input.drill.scenario,
    operator_wallet_public_key: input.drill.operator_wallet_public_key,
    operator_wallet_strict_command: input.drill.operator_wallet_strict_command,
    actual_live_trade_tested: input.drill.actual_live_trade_tested,
    real_funds_moved_by_this_app: input.drill.real_funds_moved_by_this_app,
    proof_pass_count: input.drill.proof_pass_count,
    proof_required_count: input.drill.proof_required_count,
    next_operator_step: nextOperatorStep,
    current_step_contract: currentStepContract,
    proof_ledger: proofLedger,
    done_steps: doneSteps,
    open_steps: openSteps,
    safe_to_provide_now: safeToProvideNow,
    never_provide: input.requirements.never_provide,
    safe_surfaces: uniqueText([
      nextOperatorStep?.safe_surface,
      ...input.drill.safe_surfaces,
      input.requirements.next_requirement?.safe_collection_surface,
    ]),
    safe_commands: safeCommands,
    proof_completion_criteria: [
      "A dedicated public Solana wallet is scoped and proven by a text-only browser-wallet ownership signature.",
      "Jupiter Swap V2 quote/order proof is ready without exposing transaction bytes or API-key values.",
      "The tiny one-shot unsigned canary is signed externally by the matching browser wallet and relayed through the guarded canary endpoint.",
      "Signed relay, chain confirmation, settlement reconciliation, and local portfolio mirror proof all pass.",
    ],
    source_endpoints: sourceEndpoints,
    summary,
    next_action: nextOperatorStep?.action ?? input.drill.next_action,
    live_execution_permission: "blocked" as const,
    transaction_submission_permission: "blocked" as const,
    wallet_mutation_permission: "blocked" as const,
    signing_permission: "blocked" as const,
    private_key_storage: "blocked" as const,
    seed_phrase_storage: "blocked" as const,
    signed_payload_storage: "blocked" as const,
    secret_echo_permission: "blocked" as const,
    controls: [
      "This packet is a redacted operator handoff for the first funded canary only; it is not an execution endpoint.",
      "It combines the first-canary drill and credential requirements so helpers can see what is done, what is next, and what proof will count.",
      "It never returns provider secrets, wallet private keys, seed phrases, raw transactions, unsigned transaction bytes, signed payloads, or wallet authority.",
      "Actual live trading remains unproven until the signed canary is relayed, confirmed, reconciled, and mirrored locally.",
    ],
  };
  const receiptWithText = {
    ...receiptBase,
    text_packet: renderFirstCanaryHandoffText(receiptBase),
  };

  return {
    ...receiptWithText,
    receipt_hash: hashJson(receiptWithText),
  };
}

function buildCurrentStepContract(input: {
  nextOperatorStep: Web3FirstCanaryUnblockStep | null;
  safeToProvideNow: string[];
  neverProvide: string[];
  fallbackAction: string;
  fallbackCommand: string;
}): Web3FirstCanaryCurrentStepContract {
  const step = input.nextOperatorStep;
  const safeSurface = step?.safe_surface ?? null;
  return {
    mode: "web3-first-canary-current-step-contract",
    step_id: step?.id ?? null,
    label: step?.label ?? "First funded canary proof complete",
    phase: step?.phase ?? "complete",
    status: step?.status ?? "complete",
    action: step?.action ?? input.fallbackAction,
    safe_surface: safeSurface,
    command: step?.command ?? input.fallbackCommand,
    safe_to_provide_now: input.safeToProvideNow,
    never_provide: input.neverProvide,
    completion_signal: step?.completion_signal ?? "Strict live-canary proof passes with signed relay, chain confirmation, settlement reconciliation, and local portfolio mirror evidence.",
    can_complete_in_app: typeof safeSurface === "string" && safeSurface.startsWith("/") && !safeSurface.startsWith("/api/"),
    next_verification_command: step?.command ?? input.fallbackCommand,
    live_execution_permission: "blocked",
    transaction_submission_permission: "blocked",
    wallet_mutation_permission: "blocked",
    secret_echo_permission: "blocked",
  };
}

function firstCanaryHandoffStatus(
  drill: Web3FirstCanaryDrillReceipt,
  requirements: Web3CredentialRequirementsReceipt,
): Web3FirstCanaryHandoffReceipt["status"] {
  if (drill.status === "canary-proven") return "canary-proven";
  if (drill.status === "ready-to-relay-signed-payload") return "ready-to-relay-signed-payload";
  if (drill.status === "ready-to-request-unsigned-order") return "ready-to-request-unsigned-order";
  if (requirements.needed_now_count > 0 || drill.next_unblock_step) return "operator-input-needed";
  return "blocked";
}

function firstCanaryHandoffSummary(
  drill: Web3FirstCanaryDrillReceipt,
  openSteps: Web3FirstCanaryUnblockStep[],
) {
  if (drill.actual_live_trade_tested && drill.real_funds_moved_by_this_app) {
    return "The first funded canary has live-trade evidence; strict proof review is still required before any broader autonomy.";
  }
  return `${openSteps.length} first-canary step${openSteps.length === 1 ? "" : "s"} remain; actual live trade tested is false and real funds moved by this app is false.`;
}

function buildSafeToProvideNow(
  nextOperatorStep: Web3FirstCanaryUnblockStep | null,
  requirements: Web3CredentialRequirementsReceipt,
) {
  const requirement = requirements.next_requirement;
  const requirementValues = requirement && firstCanaryStepMatchesRequirement(nextOperatorStep?.id ?? null, requirement.id)
    ? [
        requirement.safe_value_type,
        ...requirement.target_names,
      ]
    : [];

  if (requirementValues.length > 0) return uniqueText(requirementValues);

  if (nextOperatorStep?.id === "wallet-ownership") {
    return [
      "Browser-wallet text-message ownership proof only",
      "hash-only wallet ownership receipt",
    ];
  }
  if (nextOperatorStep?.id === "dedicated-wallet") {
    return [
      "Dedicated Solana public wallet address",
      "wallet_public_key",
    ];
  }
  if (nextOperatorStep?.id === "jupiter-order") {
    return [
      "JUPITER_API_KEY target in ignored server env for funded canary unsigned handoff",
      "one-shot Settings rehearsal as evidence only",
      "Jupiter Swap V2 quote/order proof without transaction bytes",
    ];
  }
  if (nextOperatorStep?.id === "live-flags") {
    return [
      "Exact first-canary live flags in ignored server env",
      "MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION=true",
      "MASTERMOLD_LIVE_OPERATOR_APPROVAL=I_UNDERSTAND_REAL_FUNDS",
      "MASTERMOLD_ALLOW_LIVE_UNSIGNED_CANARY_HANDOFF=true",
    ];
  }
  if (nextOperatorStep?.id === "unsigned-order-preflight") {
    return [
      "operator_ack=true",
      "tiny canary amount and slippage cap",
      "matching scoped public wallet",
    ];
  }
  if (nextOperatorStep?.id === "signer-relay") {
    return [
      "externally signed tiny canary payload through the guarded relay only",
      "matching one-shot request id",
    ];
  }
  if (nextOperatorStep?.id === "manual-live-review") {
    return [
      "external manual live review decision",
      "approved first-canary spend and risk caps",
    ];
  }
  if (nextOperatorStep?.id === "funded-canary-proof" || nextOperatorStep?.id === "post-signing-proof") {
    return [
      "confirmed canary signature",
      "settlement reconciliation evidence",
      "local portfolio mirror proof",
    ];
  }

  return requirement
    ? uniqueText([requirement.safe_value_type, ...requirement.target_names])
    : ["Rerun the first-canary drill to identify the next safe input."];
}

function firstCanaryStepMatchesRequirement(stepId: Web3FirstCanaryUnblockStep["id"] | null, requirementId: string) {
  if (stepId === "dedicated-wallet") return requirementId === "dedicated-public-wallet";
  if (stepId === "wallet-ownership") return requirementId === "wallet-ownership-proof";
  if (stepId === "jupiter-order") return requirementId === "jupiter-order-rail";
  if (stepId === "manual-live-review") return requirementId === "manual-live-review";
  return false;
}

function renderFirstCanaryHandoffText(
  receipt: Omit<Web3FirstCanaryHandoffReceipt, "receipt_hash" | "text_packet">,
) {
  const next = receipt.next_operator_step
    ? [
        `- ${receipt.next_operator_step.label}: ${receipt.next_operator_step.action}`,
        `- Phase: ${receipt.next_operator_step.phase}`,
        `- Safe surface: ${receipt.next_operator_step.safe_surface}`,
        receipt.next_operator_step.command ? `- Command: ${receipt.next_operator_step.command}` : null,
        `- Done when: ${receipt.next_operator_step.completion_signal}`,
      ].filter(Boolean).join("\n")
    : "- No next operator step is listed; rerun the strict canary drill.";
  const openSteps = receipt.open_steps.map((step, index) => [
    `${index + 1}. ${step.label}`,
    `   - Status: ${step.status}`,
    `   - Action: ${step.action}`,
    `   - Surface: ${step.safe_surface}`,
    step.command ? `   - Command: ${step.command}` : null,
    `   - Done when: ${step.completion_signal}`,
  ].filter(Boolean).join("\n"));

  return [
    "# Mastermind First Funded Canary Handoff",
    "",
    `Generated: ${receipt.generated_at}`,
    `Status: ${receipt.status}`,
    `Source/account/scenario: ${receipt.source}/${receipt.account}/${receipt.scenario}`,
    `Operator wallet: ${receipt.operator_wallet_public_key ?? "not scoped"}`,
    receipt.operator_wallet_strict_command ? `Operator wallet verifier: ${receipt.operator_wallet_strict_command}` : null,
    `Actual live trade tested: ${receipt.actual_live_trade_tested ? "true" : "false"}`,
    `Real funds moved by this app: ${receipt.real_funds_moved_by_this_app ? "true" : "false"}`,
    `Proof: ${receipt.proof_pass_count}/${receipt.proof_required_count}`,
    "",
    "## Summary",
    receipt.summary,
    "",
    "## Next Operator Step",
    next,
    "",
    "## Current Step Contract",
    `- Step id: ${receipt.current_step_contract.step_id ?? "complete"}`,
    `- Phase: ${receipt.current_step_contract.phase}`,
    `- Status: ${receipt.current_step_contract.status}`,
    `- Can complete in app: ${receipt.current_step_contract.can_complete_in_app ? "true" : "false"}`,
    receipt.current_step_contract.next_verification_command ? `- Verification: ${receipt.current_step_contract.next_verification_command}` : null,
    "",
    "## Open First-Canary Steps",
    ...(openSteps.length > 0 ? openSteps : ["- No open first-canary steps are listed."]),
    "",
    "## Safe To Provide Now",
    ...receipt.safe_to_provide_now.map((item) => `- ${item}`),
    "",
    "## Never Provide",
    ...receipt.never_provide.map((item) => `- ${item}`),
    "",
    "## Proof Completion Criteria",
    ...receipt.proof_completion_criteria.map((item) => `- ${item}`),
    "",
    "## Source Endpoints",
    ...receipt.source_endpoints.map((endpoint) => `- ${endpoint}`),
    "",
    "## Safe Commands",
    ...receipt.safe_commands.map((command) => `- ${command}`),
    "",
    "## Controls",
    ...receipt.controls.map((control) => `- ${control}`),
  ].join("\n");
}

function uniqueText(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
