import { createHash } from "node:crypto";

export type Web3EmergencyStopDrillRequest = {
  reason?: string;
  operator_ack?: boolean;
};

export type Web3EmergencyStopSurface = {
  id:
    | "browser-auto-watch"
    | "paper-daemon"
    | "live-execution-flags"
    | "signer-boundary"
    | "submit-relay"
    | "wallet-mutation";
  label: string;
  status: "halted" | "blocked" | "dry-run";
  detail: string;
};

export type Web3EmergencyStopDrillReceipt = {
  mode: "web3-emergency-stop-drill";
  status: "drill-recorded" | "missing-ops-target" | "blocked";
  checked_at: string;
  receipt_hash: string;
  operator_acknowledged: boolean;
  ops_target_configured: boolean;
  webhook_configured: boolean;
  contact_configured: boolean;
  external_dispatch_attempted: false;
  external_dispatch_permission: "blocked";
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  summary: string;
  next_action: string;
  blockers: string[];
  surfaces: Web3EmergencyStopSurface[];
  controls: string[];
};

export function buildWeb3EmergencyStopDrillReceipt(
  request: Web3EmergencyStopDrillRequest = {},
  now = new Date(),
): Web3EmergencyStopDrillReceipt {
  const reason = normalizeText(request.reason) || "manual emergency-stop drill";
  const operatorAcknowledged = request.operator_ack === true;
  const webhookConfigured = Boolean(normalizeText(process.env.MASTERMOLD_EMERGENCY_STOP_WEBHOOK_URL));
  const contactConfigured = Boolean(normalizeText(process.env.MASTERMOLD_EMERGENCY_STOP_CONTACT));
  const opsTargetConfigured = webhookConfigured || contactConfigured;
  const liveExecutionFlagSet = Boolean(normalizeText(process.env.MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION));
  const liveApprovalFlagSet = Boolean(normalizeText(process.env.MASTERMOLD_LIVE_OPERATOR_APPROVAL));
  const surfaces = emergencyStopSurfaces({ liveExecutionFlagSet, liveApprovalFlagSet });
  const blockers = [
    !operatorAcknowledged ? "Operator acknowledgement is required before a drill receipt can stand in for review evidence." : null,
    !opsTargetConfigured ? "Emergency-stop webhook/contact is not configured." : null,
  ].filter((item): item is string => Boolean(item));
  const status: Web3EmergencyStopDrillReceipt["status"] = !operatorAcknowledged
    ? "blocked"
    : opsTargetConfigured
      ? "drill-recorded"
      : "missing-ops-target";
  const checkedAt = now.toISOString();
  const receiptHash = createHash("sha256")
    .update(JSON.stringify({
      checkedAt,
      reason,
      operatorAcknowledged,
      webhookConfigured,
      contactConfigured,
      liveExecutionFlagSet,
      liveApprovalFlagSet,
      surfaces: surfaces.map((surface) => [surface.id, surface.status]),
    }))
    .digest("hex");

  return {
    mode: "web3-emergency-stop-drill",
    status,
    checked_at: checkedAt,
    receipt_hash: receiptHash,
    operator_acknowledged: operatorAcknowledged,
    ops_target_configured: opsTargetConfigured,
    webhook_configured: webhookConfigured,
    contact_configured: contactConfigured,
    external_dispatch_attempted: false,
    external_dispatch_permission: "blocked",
    live_execution_permission: "blocked",
    wallet_mutation_permission: "blocked",
    summary: emergencyStopSummary(status, reason),
    next_action: emergencyStopNextAction(status),
    blockers,
    surfaces,
    controls: [
      "This is a local dry-run emergency-stop receipt; it does not send a webhook, submit a transaction, sign payloads, or mutate wallet funds.",
      "The browser can use this receipt to stop Auto Watch locally, while backend live execution and wallet mutation remain blocked.",
      "A real supervised-live cutover still needs an external kill-switch owner, tested alert channel, signer revocation path, and production runbook.",
      "Raw webhook URLs, contact details, API keys, private keys, signed payloads, and transaction bytes are never returned.",
    ],
  };
}

function emergencyStopSurfaces(input: {
  liveExecutionFlagSet: boolean;
  liveApprovalFlagSet: boolean;
}): Web3EmergencyStopSurface[] {
  return [
    {
      id: "browser-auto-watch",
      label: "Browser Auto Watch",
      status: "halted",
      detail: "The Wiring control stops browser-local Auto Watch after a drill receipt returns.",
    },
    {
      id: "paper-daemon",
      label: "Paper daemon",
      status: "dry-run",
      detail: "The receipt is review evidence only; it does not kill an external process by itself.",
    },
    {
      id: "live-execution-flags",
      label: "Live flags",
      status: input.liveExecutionFlagSet || input.liveApprovalFlagSet ? "blocked" : "halted",
      detail: input.liveExecutionFlagSet || input.liveApprovalFlagSet
        ? "A live flag appears configured, so external live-review must verify it is revoked before trading."
        : "Live execution flags are unset in this app environment.",
    },
    {
      id: "signer-boundary",
      label: "Signer boundary",
      status: "blocked",
      detail: "No signer secret, signature request, or raw transaction can be created by this drill.",
    },
    {
      id: "submit-relay",
      label: "Submit relay",
      status: "blocked",
      detail: "No signed transaction or relay call is dispatched.",
    },
    {
      id: "wallet-mutation",
      label: "Wallet mutation",
      status: "blocked",
      detail: "Wallet balances cannot be changed by this drill.",
    },
  ];
}

function emergencyStopSummary(status: Web3EmergencyStopDrillReceipt["status"], reason: string) {
  if (status === "drill-recorded") return `Emergency-stop dry run recorded for ${reason}; ops target is configured and live authority remains blocked.`;
  if (status === "missing-ops-target") return `Emergency-stop dry run recorded for ${reason}, but no ops webhook/contact is configured.`;
  return "Emergency-stop drill is blocked until the operator acknowledges the local stop action.";
}

function emergencyStopNextAction(status: Web3EmergencyStopDrillReceipt["status"]) {
  if (status === "drill-recorded") return "Use this receipt as dry-run evidence, then test the real external alert/revocation channel outside the app before supervised live review.";
  if (status === "missing-ops-target") return "Configure MASTERMOLD_EMERGENCY_STOP_WEBHOOK_URL or MASTERMOLD_EMERGENCY_STOP_CONTACT, then rerun the drill.";
  return "Acknowledge the emergency-stop drill before recording review evidence.";
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
