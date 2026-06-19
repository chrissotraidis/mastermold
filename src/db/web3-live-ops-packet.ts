import { createHash } from "node:crypto";
import type { Web3AccountingLedgerReceipt } from "./web3-accounting-ledger";
import type { Web3EmergencyStopDrillReceipt } from "./web3-emergency-stop";
import type { Web3ProductionSupervisorReadiness } from "./web3-production-supervisor";
import type { Web3TradingState } from "./web3-trading";

export type Web3LiveOpsPacketStatus =
  | "missing-supervisor"
  | "stale-supervisor"
  | "missing-emergency-stop"
  | "accounting-needed"
  | "process-review-needed"
  | "manual-review-needed"
  | "blocked";

export type Web3LiveOpsPacketStep = {
  id:
    | "refresh-supervisor"
    | "configure-emergency-stop"
    | "run-stop-drill"
    | "configure-accounting"
    | "review-process-manager"
    | "manual-live-review";
  label: string;
  status: "done" | "active" | "blocked" | "review";
  detail: string;
  next_action: string;
};

export type Web3LiveOpsPacket = {
  mode: "web3-live-ops-packet";
  status: Web3LiveOpsPacketStatus;
  generated_at: string;
  source_state_as_of: string;
  receipt_hash: string;
  production_supervisor_status: Web3ProductionSupervisorReadiness["status"];
  production_supervisor_score: number;
  production_supervisor_fresh: boolean;
  paper_supervision_evidence: boolean;
  process_manager: Web3ProductionSupervisorReadiness["process_manager"];
  can_satisfy_process_gate: false;
  emergency_stop_status: Web3EmergencyStopDrillReceipt["status"];
  emergency_stop_configured: boolean;
  emergency_stop_webhook_configured: boolean;
  emergency_stop_contact_configured: boolean;
  accounting_status: Web3AccountingLedgerReceipt["status"];
  accounting_export_configured: boolean;
  accounting_boundary: Web3AccountingLedgerReceipt["accounting_boundary"];
  settlement_status: Web3AccountingLedgerReceipt["settlement_summary"]["settlement_status"];
  portfolio_mirror_status: Web3AccountingLedgerReceipt["settlement_summary"]["mirror_status"];
  process_manager_configured: boolean;
  worker_owner_configured: boolean;
  alert_route_configured: boolean;
  restart_policy_configured: boolean;
  production_ops_targets_configured: boolean;
  manual_live_review_required: true;
  external_process_manager_required: true;
  missing_required: string[];
  safe_commands: string[];
  steps: Web3LiveOpsPacketStep[];
  live_execution_flag_set: boolean;
  live_operator_approval_flag_set: boolean;
  external_dispatch_permission: "blocked";
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  transaction_submission_permission: "blocked";
  private_key_storage: "blocked";
  seed_phrase_storage: "blocked";
  secret_echo_permission: "blocked";
  controls: string[];
  summary: string;
  next_action: string;
};

export function buildWeb3LiveOpsPacket(input: {
  state: Web3TradingState;
  productionSupervisor: Web3ProductionSupervisorReadiness;
  emergencyStop: Web3EmergencyStopDrillReceipt;
  accounting: Web3AccountingLedgerReceipt;
  now?: Date;
}): Web3LiveOpsPacket {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const emergencyStopConfigured = input.emergencyStop.ops_target_configured;
  const accountingExportConfigured = hasEnv("MASTERMOLD_TAX_LEDGER_EXPORT_PATH");
  const processManagerConfigured = hasEnv("MASTERMOLD_WEB3_PROCESS_MANAGER");
  const workerOwnerConfigured = hasEnv("MASTERMOLD_WEB3_WORKER_OWNER");
  const alertRouteConfigured = hasEnv("MASTERMOLD_WEB3_ALERT_WEBHOOK_URL");
  const restartPolicyConfigured = hasEnv("MASTERMOLD_WEB3_RESTART_POLICY_URL");
  const productionOpsTargetsConfigured = processManagerConfigured && workerOwnerConfigured && alertRouteConfigured && restartPolicyConfigured;
  const liveExecutionFlagSet = hasEnv("MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION");
  const liveApprovalFlagSet = hasEnv("MASTERMOLD_LIVE_OPERATOR_APPROVAL");
  const status = liveOpsPacketStatus({
    productionSupervisor: input.productionSupervisor,
    emergencyStopConfigured,
    accountingExportConfigured,
    productionOpsTargetsConfigured,
    liveExecutionFlagSet,
    liveApprovalFlagSet,
  });
  const missingRequired = [
    !input.productionSupervisor.paper_supervision_evidence ? "Fresh supervised paper worker receipt" : null,
    input.productionSupervisor.paper_supervision_evidence && !input.productionSupervisor.receipt_fresh ? "Fresh production-supervisor receipt under 15 minutes" : null,
    !emergencyStopConfigured ? "Emergency-stop webhook or contact" : null,
    !accountingExportConfigured ? "Reviewed accounting/export target" : null,
    !processManagerConfigured ? "External process manager target" : null,
    !workerOwnerConfigured ? "Production worker owner" : null,
    !alertRouteConfigured ? "Production alert route" : null,
    !restartPolicyConfigured ? "Restart policy review URL" : null,
    "Manual live-executor approval",
    liveExecutionFlagSet || liveApprovalFlagSet ? "Revoke live execution flags until manual review completes" : null,
  ].filter((item): item is string => Boolean(item));
  const safeCommands = [
    "npm run supervise:web3 -- --base-url=http://localhost:4010 --rounds=1 --ticks-per-round=1 --target-net-pnl=1 --max-drawdown=250 --json",
    "npm run doctor:web3 -- --json",
    "npm run verify:web3 -- --base-url=http://localhost:4010",
    "curl -s -X POST http://localhost:4010/api/web3-emergency-stop/drill -H 'content-type: application/json' -d '{\"operator_ack\":true,\"reason\":\"local dry-run review\"}'",
  ];
  const steps = buildLiveOpsSteps({
    productionSupervisor: input.productionSupervisor,
    emergencyStop: input.emergencyStop,
    accountingExportConfigured,
    productionOpsTargetsConfigured,
  });
  const receiptBase = {
    mode: "web3-live-ops-packet" as const,
    status,
    generated_at: generatedAt,
    source_state_as_of: input.state.market_source.fetched_at,
    production_supervisor_status: input.productionSupervisor.status,
    production_supervisor_score: input.productionSupervisor.readiness_score,
    production_supervisor_fresh: input.productionSupervisor.receipt_fresh,
    paper_supervision_evidence: input.productionSupervisor.paper_supervision_evidence,
    process_manager: input.productionSupervisor.process_manager,
    can_satisfy_process_gate: false as const,
    emergency_stop_status: input.emergencyStop.status,
    emergency_stop_configured: emergencyStopConfigured,
    emergency_stop_webhook_configured: input.emergencyStop.webhook_configured,
    emergency_stop_contact_configured: input.emergencyStop.contact_configured,
    accounting_status: input.accounting.status,
    accounting_export_configured: accountingExportConfigured,
    accounting_boundary: input.accounting.accounting_boundary,
    settlement_status: input.accounting.settlement_summary.settlement_status,
    portfolio_mirror_status: input.accounting.settlement_summary.mirror_status,
    process_manager_configured: processManagerConfigured,
    worker_owner_configured: workerOwnerConfigured,
    alert_route_configured: alertRouteConfigured,
    restart_policy_configured: restartPolicyConfigured,
    production_ops_targets_configured: productionOpsTargetsConfigured,
    manual_live_review_required: true as const,
    external_process_manager_required: true as const,
    missing_required: missingRequired,
    safe_commands: safeCommands,
    steps,
    live_execution_flag_set: liveExecutionFlagSet,
    live_operator_approval_flag_set: liveApprovalFlagSet,
    external_dispatch_permission: "blocked" as const,
    live_execution_permission: "blocked" as const,
    wallet_mutation_permission: "blocked" as const,
    transaction_submission_permission: "blocked" as const,
    private_key_storage: "blocked" as const,
    seed_phrase_storage: "blocked" as const,
    secret_echo_permission: "blocked" as const,
    controls: [
      "This packet consolidates live-ops review evidence only; it cannot create process managers, send webhooks, or approve live trading.",
      "Emergency-stop targets are reported as configured/missing booleans only; raw webhook URLs and contact values are never returned.",
      "Production worker process, owner, alert, and restart-policy targets are reported only as configured/missing booleans.",
      "Accounting export remains paper-only until settlement reconciliation, portfolio mirror review, and CPA-reviewed handling exist.",
      "Live execution, wallet mutation, transaction submission, external dispatch, private-key storage, seed-phrase storage, and secret echo remain blocked.",
    ],
    summary: liveOpsSummary(status, input.productionSupervisor),
    next_action: liveOpsNextAction(status, missingRequired),
  };

  return {
    ...receiptBase,
    receipt_hash: hashJson(receiptBase),
  };
}

function liveOpsPacketStatus(input: {
  productionSupervisor: Web3ProductionSupervisorReadiness;
  emergencyStopConfigured: boolean;
  accountingExportConfigured: boolean;
  productionOpsTargetsConfigured: boolean;
  liveExecutionFlagSet: boolean;
  liveApprovalFlagSet: boolean;
}): Web3LiveOpsPacketStatus {
  if (input.liveExecutionFlagSet || input.liveApprovalFlagSet || input.productionSupervisor.status === "blocked") return "blocked";
  if (!input.productionSupervisor.paper_supervision_evidence) return "missing-supervisor";
  if (!input.productionSupervisor.receipt_fresh) return "stale-supervisor";
  if (!input.emergencyStopConfigured) return "missing-emergency-stop";
  if (!input.accountingExportConfigured) return "accounting-needed";
  if (!input.productionOpsTargetsConfigured) return "process-review-needed";
  return "manual-review-needed";
}

function buildLiveOpsSteps(input: {
  productionSupervisor: Web3ProductionSupervisorReadiness;
  emergencyStop: Web3EmergencyStopDrillReceipt;
  accountingExportConfigured: boolean;
  productionOpsTargetsConfigured: boolean;
}): Web3LiveOpsPacketStep[] {
  return [
    {
      id: "refresh-supervisor",
      label: "Refresh supervisor",
      status: input.productionSupervisor.receipt_fresh ? "done" : input.productionSupervisor.paper_supervision_evidence ? "active" : "blocked",
      detail: input.productionSupervisor.summary,
      next_action: input.productionSupervisor.next_action,
    },
    {
      id: "configure-emergency-stop",
      label: "Configure emergency stop",
      status: input.emergencyStop.ops_target_configured ? "done" : "active",
      detail: "A live review needs an external stop owner/channel, reported here only as configured or missing.",
      next_action: input.emergencyStop.ops_target_configured
        ? "Run the local stop drill and separately test the real external channel."
        : "Set MASTERMOLD_EMERGENCY_STOP_CONTACT or webhook target in ignored server env.",
    },
    {
      id: "run-stop-drill",
      label: "Run stop drill",
      status: input.emergencyStop.status === "drill-recorded" ? "done" : input.emergencyStop.ops_target_configured ? "active" : "blocked",
      detail: input.emergencyStop.summary,
      next_action: input.emergencyStop.next_action,
    },
    {
      id: "configure-accounting",
      label: "Configure accounting",
      status: input.accountingExportConfigured ? "review" : "active",
      detail: "Real fills need reviewed settlement export handling before they become authoritative.",
      next_action: input.accountingExportConfigured
        ? "Keep exports paper-only until settlement/fill reconciliation and CPA review pass."
        : "Choose MASTERMOLD_TAX_LEDGER_EXPORT_PATH or an external accounting workflow before live review.",
    },
    {
      id: "review-process-manager",
      label: "Review process manager",
      status: input.productionOpsTargetsConfigured ? "review" : "active",
      detail: input.productionOpsTargetsConfigured
        ? "Process, owner, alert, and restart-policy targets are configured as redacted review evidence."
        : "The app can read sanitized receipts, but it cannot install production process supervision by itself.",
      next_action: input.productionOpsTargetsConfigured
        ? "Externally verify process manager, restart behavior, alert delivery, secret scope, and owner before manual live approval."
        : "Document process manager, restart policy, alerts, secret scope, and owner outside the app.",
    },
    {
      id: "manual-live-review",
      label: "Manual live review",
      status: "blocked",
      detail: "Manual live-executor approval is required after wallet, Jupiter, signer, settlement, ops, and profit gates pass.",
      next_action: "Keep live flags unset and request external manual review only after every packet is review-ready.",
    },
  ];
}

function liveOpsSummary(status: Web3LiveOpsPacketStatus, productionSupervisor: Web3ProductionSupervisorReadiness) {
  if (status === "manual-review-needed") return "Live-ops inputs are configured enough for external review, but this app still cannot unlock real-capital execution.";
  if (status === "process-review-needed") return "Live-ops review still needs production-worker process, owner, alert, and restart-policy targets.";
  if (status === "accounting-needed") return "Live-ops review still needs accounting/export handling before real fills can become authoritative.";
  if (status === "missing-emergency-stop") return "Live-ops review still needs an emergency-stop owner or channel.";
  if (status === "stale-supervisor") return "Live-ops review has paper-supervisor evidence, but the receipt is stale.";
  if (status === "blocked") return "Live-ops review is blocked by unsafe flags or unhealthy supervisor evidence.";
  return productionSupervisor.summary;
}

function liveOpsNextAction(status: Web3LiveOpsPacketStatus, missingRequired: string[]) {
  if (status === "manual-review-needed") return "Prepare external process-manager, alerting, signer revocation, and manual live-executor review materials.";
  if (status === "process-review-needed") return "Add production worker process, owner, alert, and restart-policy targets in ignored server env.";
  return missingRequired[0] ?? "Keep live execution blocked while refreshing live-ops evidence.";
}

function hasEnv(name: string) {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0;
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
