import { createHash } from "node:crypto";
import type { Web3LiveTradeCanaryReceipt } from "./web3-live-trade-canary";

export type Web3LiveTestLedgerRow = {
  id: "paper-autonomy" | "live-dex-read" | "order-rehearsal" | "live-flags" | "funded-wallet-trade";
  label: string;
  status: "pass" | "watch" | "fail";
  value: string;
  evidence_type: "paper" | "read-only-live" | "rehearsal" | "env-arming" | "funded-proof";
  counts_as_funded_trade_proof: boolean;
  detail: string;
  evidence_endpoint: string;
  next_action: string;
};

export type Web3LiveTestLedgerReceipt = {
  mode: "web3-live-test-ledger";
  status: "funded-proof-recorded" | "operator-input-needed" | "blocked";
  generated_at: string;
  receipt_hash: string;
  source: Web3LiveTradeCanaryReceipt["source"];
  account: Web3LiveTradeCanaryReceipt["account"];
  scenario: Web3LiveTradeCanaryReceipt["scenario"];
  actual_live_trade_tested: boolean;
  real_funds_moved_by_this_app: boolean;
  funded_trade_attempted_by_this_app: boolean;
  funded_trade_proof_row_id: "funded-wallet-trade";
  live_execution_permission: Web3LiveTradeCanaryReceipt["live_execution_permission"];
  transaction_submission_permission: Web3LiveTradeCanaryReceipt["transaction_submission_permission"];
  wallet_mutation_permission: "blocked";
  signing_permission: "blocked";
  private_key_storage: "blocked";
  seed_phrase_storage: "blocked";
  secret_echo_permission: "blocked";
  next_required_input: Web3LiveTradeCanaryReceipt["next_required_input"];
  rows: Web3LiveTestLedgerRow[];
  funded_trade_proof_requirements: string[];
  summary: string;
  next_action: string;
  controls: string[];
};

export function buildWeb3LiveTestLedgerReceipt(input: {
  canary: Web3LiveTradeCanaryReceipt;
  now?: Date;
}): Web3LiveTestLedgerReceipt {
  const canary = input.canary;
  const generatedAt = (input.now ?? new Date()).toISOString();
  const orderRail = canary.required_inputs.find((row) => row.id === "jupiter-order-rail");
  const liveFlags = canary.required_inputs.find((row) => row.id === "first-canary-live-flags");
  const fundedProofRecorded = canary.actual_live_trade_tested && canary.post_signing_evidence_status === "settlement-accounted";
  const status: Web3LiveTestLedgerReceipt["status"] = fundedProofRecorded
    ? "funded-proof-recorded"
    : canary.next_required_input
      ? "operator-input-needed"
      : "blocked";
  const canaryEndpoint = `/api/web3-live-trade-canary?source=${canary.source}&account=${canary.account}&scenario=${canary.scenario}&cycles=0`;
  const rows: Web3LiveTestLedgerRow[] = [
    {
      id: "paper-autonomy",
      label: "Paper autonomy",
      status: "pass",
      value: "tested",
      evidence_type: "paper",
      counts_as_funded_trade_proof: false,
      detail: "Backend loop, daemon, forward replay, and promoted-paper proof are simulator evidence only.",
      evidence_endpoint: "/api/web3-trading",
      next_action: "Use paper evidence to tune strategy, not to claim real-money proof.",
    },
    {
      id: "live-dex-read",
      label: "Live DEX read",
      status: canary.source === "live-dex" ? "watch" : "fail",
      value: canary.source === "live-dex" ? "read-only" : "sample",
      evidence_type: "read-only-live",
      counts_as_funded_trade_proof: false,
      detail: "Market and route reads can refresh public DEX evidence, but they cannot sign or move funds.",
      evidence_endpoint: "/api/web3-dex-discovery",
      next_action: canary.source === "live-dex" ? "Keep read-only market evidence fresh." : "Open the live DEX persistent cockpit before canary review.",
    },
    {
      id: "order-rehearsal",
      label: "Order rehearsal",
      status: orderRail?.status === "done" ? "pass" : "fail",
      value: orderRail?.status === "done" ? "ready" : "blocked",
      evidence_type: "rehearsal",
      counts_as_funded_trade_proof: false,
      detail: orderRail?.completion_signal ?? "Jupiter order proof is still required before an unsigned canary can be requested.",
      evidence_endpoint: "/api/web3-jupiter-order-packet",
      next_action: orderRail?.completion_signal ?? "Add server-scoped Jupiter order proof without exposing API keys.",
    },
    {
      id: "live-flags",
      label: "Live flags",
      status: liveFlags?.status === "done" ? "watch" : "fail",
      value: liveFlags?.status === "done" ? "armed" : "missing",
      evidence_type: "env-arming",
      counts_as_funded_trade_proof: false,
      detail: liveFlags?.completion_signal ?? "Exact first-canary flags stay in ignored local env and do not grant live authority by themselves.",
      evidence_endpoint: "/api/web3-credential-requirements",
      next_action: liveFlags?.completion_signal ?? "Set only the reviewed first-canary flags in ignored local env after wallet and order proof are ready.",
    },
    {
      id: "funded-wallet-trade",
      label: "Funded wallet trade",
      status: fundedProofRecorded ? "pass" : canary.actual_live_trade_tested ? "watch" : "fail",
      value: canary.actual_live_trade_tested ? "tested" : "not attempted",
      evidence_type: "funded-proof",
      counts_as_funded_trade_proof: true,
      detail: canary.actual_live_trade_tested
        ? "A signed canary has proof; inspect settlement and portfolio mirror status before any autonomy review."
        : "No funded trade counts until the signed relay confirms, settlement reconciles, and the portfolio mirror is accounted.",
      evidence_endpoint: canaryEndpoint,
      next_action: canary.actual_live_trade_tested ? canary.post_signing_next_action : canary.next_action,
    },
  ];
  const summary = canary.actual_live_trade_tested
    ? "Funded canary evidence exists, but settlement and mirror proof still decide whether it is usable for review."
    : "No funded wallet trade has been attempted by this app; paper profit, live reads, and order rehearsal are not funded-trade proof.";
  const receiptBase = {
    mode: "web3-live-test-ledger" as const,
    status,
    generated_at: generatedAt,
    source: canary.source,
    account: canary.account,
    scenario: canary.scenario,
    actual_live_trade_tested: canary.actual_live_trade_tested,
    real_funds_moved_by_this_app: canary.real_funds_moved_by_this_app,
    funded_trade_attempted_by_this_app: canary.actual_live_trade_tested,
    funded_trade_proof_row_id: "funded-wallet-trade" as const,
    live_execution_permission: canary.live_execution_permission,
    transaction_submission_permission: canary.transaction_submission_permission,
    wallet_mutation_permission: "blocked" as const,
    signing_permission: "blocked" as const,
    private_key_storage: "blocked" as const,
    seed_phrase_storage: "blocked" as const,
    secret_echo_permission: "blocked" as const,
    next_required_input: canary.next_required_input,
    rows,
    funded_trade_proof_requirements: [
      "A dedicated public wallet is scoped and the sample all-ones wallet is rejected.",
      "Wallet ownership proof is current for the canary.",
      "Jupiter order rail and exact first-canary live flags are ready.",
      "The browser wallet signs only the one-shot tiny canary request.",
      "Signed relay, chain confirmation, settlement reconciliation, and local portfolio mirror proof all pass.",
    ],
    summary,
    next_action: canary.actual_live_trade_tested ? canary.post_signing_next_action : canary.next_action,
    controls: [
      "This receipt is a truth ledger only; it cannot sign, submit, custody funds, mutate wallets, or unlock real-capital autonomy.",
      "Paper autonomy, read-only live DEX data, order rehearsal, and env arming do not count as funded-trade proof.",
      "The funded wallet trade row is the only row that can count as real-money canary proof, and only when post-signing proof is accounted.",
      "Private keys, seed phrases, keypair JSON, provider secrets, and raw payload values are never requested or echoed.",
    ],
  };

  return {
    ...receiptBase,
    receipt_hash: hashLedger(receiptBase),
  };
}

function hashLedger(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
