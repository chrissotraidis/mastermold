import { describe, expect, test } from "bun:test";
import { GET as FIRST_CANARY_HANDOFF_GET } from "@/app/api/web3-first-canary-handoff/route";
import { buildWeb3FirstCanaryHandoffReceipt } from "@/src/db/web3-first-canary-handoff";

const baseStep = {
  phase: "credential-intake",
  safe_surface: "/trading?source=live-dex&account=persistent",
  command: "npm run verify:web3 -- --base-url=http://localhost:4010 --wallet=Q7QnmNVtS8AFaW2x9j7pYq3Na1bC4dE5fG6hHJKSJ4u --require-operator-wallet",
  completion_signal: "A browser wallet signs the text-only ownership challenge and the app stores hash-only proof.",
  blocks_funded_canary: true,
} as const;

const drill = {
  mode: "web3-first-canary-drill",
  status: "blocked",
  generated_at: "2026-06-21T00:00:00.000Z",
  receipt_hash: "a".repeat(64),
  source: "live-dex",
  account: "persistent",
  scenario: "breakout",
  wallet_public_key_present: true,
  wallet_public_key_preview: "Q7QnmN...SJ4u",
  operator_wallet_public_key: "Q7QnmNVtS8AFaW2x9j7pYq3Na1bC4dE5fG6hHJKSJ4u",
  operator_wallet_strict_command: "npm run verify:web3 -- --base-url=http://localhost:4010 --wallet=Q7QnmNVtS8AFaW2x9j7pYq3Na1bC4dE5fG6hHJKSJ4u --require-operator-wallet",
  amount_lamports: 100_000,
  current_input_label: "Wallet ownership proof",
  next_blocker_label: "Wallet ownership proof",
  next_credential_label: "Wallet ownership proof",
  supervised_canary_status: "blocked",
  can_request_unsigned_order_now: false,
  unsigned_preflight_status: "blocked",
  unsigned_order_handoff_ready: false,
  jupiter_order_status: "missing-key",
  signed_relay_status: "locked",
  actual_live_trade_tested: false,
  real_funds_moved_by_this_app: false,
  post_signing_evidence_status: "needs-signed-relay",
  proof_pass_count: 0,
  proof_required_count: 4,
  hard_fail_count: 5,
  watch_count: 0,
  next_lane_id: "wallet-ownership",
  next_lane_label: "Wallet ownership proof",
  next_lane_status: "fail",
  next_lane_action: "Run Prove ownership; this signs text only and cannot move funds.",
  next_action: "Run Prove ownership; this signs text only and cannot move funds.",
  next_unblock_step: {
    ...baseStep,
    id: "wallet-ownership",
    label: "Wallet ownership proof",
    status: "next",
    action: "Run Prove ownership; this signs text only and cannot move funds.",
  },
  operator_unblock_plan: [
    {
      ...baseStep,
      id: "live-scope",
      label: "Live DEX persistent scope",
      status: "done",
      action: "Keep the live canary scoped to this source/account pair.",
      blocks_funded_canary: false,
    },
    {
      ...baseStep,
      id: "wallet-ownership",
      label: "Wallet ownership proof",
      status: "next",
      action: "Run Prove ownership; this signs text only and cannot move funds.",
    },
    {
      ...baseStep,
      id: "jupiter-order",
      phase: "route-readiness",
      label: "Jupiter route/order proof",
      status: "blocked",
      action: "Install JUPITER_API_KEY in ignored server env for the funded canary; one-shot Settings rehearsal is evidence only and cannot arm the unsigned handoff.",
      safe_surface: "/settings/integrations#web3-credential-action-console",
      command: "npm run verify:web3 -- --base-url=http://localhost:4010 --require-jupiter-order",
      completion_signal: "Jupiter Swap V2 order proof is ready without exposing transaction bytes or API-key values.",
    },
  ],
  blockers: ["Run Prove ownership; this signs text only and cannot move funds."],
  safe_commands: [
    "npm run verify:web3 -- --base-url=http://localhost:4010",
    "npm run verify:web3 -- --base-url=http://localhost:4010 --wallet=Q7QnmNVtS8AFaW2x9j7pYq3Na1bC4dE5fG6hHJKSJ4u --require-operator-wallet",
  ],
  safe_surfaces: ["/trading?source=live-dex&account=persistent"],
  source_endpoint: "/api/web3-first-canary-drill?source=live-dex&account=persistent&scenario=breakout&cycles=0",
  live_review_source_endpoint: "/api/web3-first-canary-drill?source=live-dex&account=persistent&scenario=breakout&cycles=0",
  strict_ready_command: "npm run drill-canary:web3 -- --base-url=http://localhost:4010 --json --require-ready",
  strict_proof_command: "npm run prove-canary:web3 -- --base-url=http://localhost:4010 --run-watchdog --attempts=3 --json",
  live_execution_permission: "blocked",
  transaction_submission_permission: "blocked",
  wallet_mutation_permission: "blocked",
  signing_permission: "blocked",
  private_key_storage: "blocked",
  seed_phrase_storage: "blocked",
  signed_payload_storage: "blocked",
  secret_echo_permission: "blocked",
  controls: ["This drill is read-only."],
  lanes: [],
} as any;

const requirements = {
  mode: "web3-credential-requirements",
  status: "operator-input-needed",
  generated_at: "2026-06-21T00:00:00.000Z",
  receipt_hash: "b".repeat(64),
  research_handoff_hash: "c".repeat(64),
  source: "live-dex",
  account: "persistent",
  scenario: "breakout",
  requirement_count: 2,
  needed_now_count: 1,
  before_live_count: 1,
  external_review_count: 0,
  blocker_count: 2,
  next_requirement: {
    id: "wallet-ownership-proof",
    label: "Wallet ownership proof",
    owner: "operator",
    priority: "needed-now",
    safe_value_type: "hash-only wallet ownership receipt",
    safe_collection_surface: "/trading?source=live-dex&account=persistent",
    storage_rule: "hash-only local receipt",
    target_names: ["hash-only wallet ownership receipt"],
    research_question_ids: [],
    completion_signal: "A browser wallet signs the text-only ownership challenge.",
    blocks_live_capital: true,
    next_action: "Run Prove ownership; this signs text only and cannot move funds.",
  },
  requirements: [],
  safe_to_share: ["public Solana wallet address", "hash-only wallet ownership receipt"],
  never_provide: ["private keys", "seed phrases", "raw transactions", "signed payloads"],
  source_endpoint: "/api/web3-credential-requirements?source=live-dex&account=persistent&scenario=breakout&cycles=0",
  live_review_source_endpoint: "/api/web3-credential-requirements?source=live-dex&account=persistent&scenario=breakout&cycles=0",
  safe_export_commands: ["npm run --silent requirements:web3 -- --base-url=http://localhost:4010"],
  text_packet: "# Mastermind Web3 Credential Requirements Packet",
  summary: "2 safe requirements are tracked.",
  next_action: "Run Prove ownership; this signs text only and cannot move funds.",
  live_execution_permission: "blocked",
  wallet_mutation_permission: "blocked",
  transaction_submission_permission: "blocked",
  signing_permission: "blocked",
  private_key_storage: "blocked",
  seed_phrase_storage: "blocked",
  secret_echo_permission: "blocked",
  controls: ["This receipt is a credential collection checklist only."],
} as any;

describe("Web3 first canary handoff", () => {
  test("GIVEN first-canary drill and credential requirements WHEN handoff is built THEN it returns one redacted operator packet", () => {
    const receipt = buildWeb3FirstCanaryHandoffReceipt({
      drill,
      requirements,
      now: new Date("2026-06-21T00:01:00.000Z"),
    });

    expect(receipt.mode).toBe("web3-first-canary-handoff");
    expect(receipt.status).toBe("operator-input-needed");
    expect(receipt.first_canary_drill_hash).toBe(drill.receipt_hash);
    expect(receipt.credential_requirements_hash).toBe(requirements.receipt_hash);
    expect(receipt.operator_wallet_public_key).toBe(drill.operator_wallet_public_key);
    expect(receipt.operator_wallet_strict_command).toBe(drill.operator_wallet_strict_command);
    expect(receipt.actual_live_trade_tested).toBe(false);
    expect(receipt.real_funds_moved_by_this_app).toBe(false);
    expect(receipt.next_operator_step?.id).toBe("wallet-ownership");
    expect(receipt.safe_to_provide_now).toContain("hash-only wallet ownership receipt");
    expect(receipt.safe_to_provide_now).not.toContain("public Solana wallet address");
    expect(receipt.safe_to_provide_now.join(" ")).not.toContain("JUPITER_API_KEY");
    expect(receipt.never_provide).toContain("private keys");
    expect(receipt.proof_completion_criteria).toHaveLength(4);
    expect(receipt.text_packet).toContain("# Mastermind First Funded Canary Handoff");
    expect(receipt.text_packet).toContain(`Operator wallet verifier: ${drill.operator_wallet_strict_command}`);
    expect(receipt.text_packet).not.toContain("<public-solana-address>");
    expect(receipt.safe_commands.join(" ")).not.toContain("<public-solana-address>");
    expect(receipt.text_packet).toContain("Actual live trade tested: false");
    expect(receipt.text_packet).toContain("Real funds moved by this app: false");
    expect(receipt.live_execution_permission).toBe("blocked");
    expect(receipt.transaction_submission_permission).toBe("blocked");
    expect(receipt.wallet_mutation_permission).toBe("blocked");
    expect(receipt.signing_permission).toBe("blocked");
    expect(receipt.private_key_storage).toBe("blocked");
    expect(receipt.seed_phrase_storage).toBe("blocked");
    expect(receipt.signed_payload_storage).toBe("blocked");
    expect(receipt.secret_echo_permission).toBe("blocked");
  });

  test("GIVEN the running route WHEN handoff is requested THEN it composes drill and requirement evidence", async () => {
    const response = await FIRST_CANARY_HANDOFF_GET(new Request("http://localhost/api/web3-first-canary-handoff?source=live-dex&account=persistent&scenario=breakout&cycles=0"));
    const receipt = await response.json();

    expect(response.status).toBe(200);
    expect(receipt.mode).toBe("web3-first-canary-handoff");
    expect(receipt.actual_live_trade_tested).toBe(false);
    expect(receipt.real_funds_moved_by_this_app).toBe(false);
    expect(receipt.next_operator_step).toBeTruthy();
    if (receipt.next_operator_step?.id === "wallet-ownership") {
      expect(receipt.safe_to_provide_now.join(" ")).toContain("wallet ownership");
      expect(receipt.safe_to_provide_now.join(" ")).not.toContain("JUPITER_API_KEY");
      expect(receipt.safe_to_provide_now.join(" ")).not.toContain("Emergency-stop");
      if (receipt.operator_wallet_public_key) {
        expect(receipt.operator_wallet_strict_command).toContain(`--wallet=${receipt.operator_wallet_public_key}`);
        expect(receipt.text_packet).not.toContain("<public-solana-address>");
        expect(receipt.safe_commands.join(" ")).not.toContain("<public-solana-address>");
      }
    }
    expect(receipt.safe_commands.join(" ")).toContain("drill-canary:web3");
    expect(receipt.safe_commands.join(" ")).toContain("prove-canary:web3");
    expect(receipt.source_endpoints.join(" ")).toContain("/api/web3-first-canary-drill");
    expect(receipt.source_endpoints.join(" ")).toContain("/api/web3-credential-requirements");
    expect(receipt.text_packet).toContain("## Next Operator Step");
    expect(receipt.private_key_storage).toBe("blocked");
    expect(receipt.secret_echo_permission).toBe("blocked");
  }, 30_000);
});
