import { createHash } from "node:crypto";
import type { Web3TradingState } from "./web3-trading";

export type Web3SignerHandoffReceiptStatus =
  | "missing-wallet"
  | "policy-gated"
  | "signature-gated"
  | "request-ready"
  | "submit-gated"
  | "blocked";

export type Web3SignerHandoffReceiptCheck = {
  id:
    | "wallet-scope"
    | "custody-policy"
    | "signer-provider"
    | "payload-hash"
    | "pre-submit"
    | "relay-boundary"
    | "live-boundary"
    | "private-key-boundary";
  label: string;
  status: "pass" | "watch" | "fail";
  detail: string;
};

export type Web3SignerHandoffReceipt = {
  mode: "web3-signer-handoff-receipt";
  status: Web3SignerHandoffReceiptStatus;
  generated_at: string;
  source_state_as_of: string;
  receipt_hash: string;
  active_provider: Web3TradingState["autonomous_signer_ops"]["active_provider"];
  signer_scope: Web3TradingState["autonomous_custody_mandate"]["signer_scope"];
  wallet_scoped: boolean;
  wallet_public_key_preview: string | null;
  policy_hash_present: boolean;
  policy_hash_preview: string | null;
  request_summary: {
    status: "ready" | "blocked" | "missing";
    request_id: string | null;
    payload_hash_preview: string | null;
    request_body_hash_preview: string | null;
    handoff_id: string | null;
    plan_id: string | null;
    symbol: string | null;
    side: "buy" | "sell" | "hold";
    notional_usd: number;
    raw_transaction_included: false;
    signed_payload_included: false;
    private_key_required: false;
  };
  custody_summary: {
    status: Web3TradingState["autonomous_custody_mandate"]["status"];
    provider_configured: boolean;
    spend_limit_usd: number;
    per_trade_limit_usd: number;
    remaining_cap_usd: number;
    max_slippage_bps: number;
    allowed_path_count: number;
    allowed_side_count: number;
    allowed_symbol_count: number;
    expires_at: string;
    revoke_after_seconds: number;
  };
  signer_summary: {
    status: Web3TradingState["autonomous_signer_ops"]["status"];
    can_request_signature: boolean;
    can_auto_sign: boolean;
    requires_user_presence: boolean;
    provider_adapter_status: Web3TradingState["autonomous_signer_ops"]["provider_adapter"]["status"];
    provider_dispatch_ready: boolean;
    request_transport: Web3TradingState["autonomous_signer_ops"]["provider_adapter"]["request_transport"];
    expected_response: Web3TradingState["autonomous_signer_ops"]["provider_adapter"]["expected_response"];
    ready_count: number;
    signature_count: number;
    setup_count: number;
    blocked_count: number;
    providers: Array<{
      provider: Web3TradingState["autonomous_signer_ops"]["items"][number]["provider"];
      status: Web3TradingState["autonomous_signer_ops"]["items"][number]["status"];
      action: Web3TradingState["autonomous_signer_ops"]["items"][number]["action"];
      readiness_score: number;
      can_request_signature: boolean;
      can_auto_sign: boolean;
      requires_user_presence: boolean;
      next_action: string;
    }>;
  };
  handoff_summary: {
    status: Web3TradingState["autonomous_order_handoff"]["status"];
    action: Web3TradingState["autonomous_order_handoff"]["items"][number]["action"] | "none";
    path: Web3TradingState["autonomous_order_handoff"]["items"][number]["handoff_path"] | "none";
    symbol: string | null;
    side: "buy" | "sell" | "hold";
    signer_required: boolean;
    can_submit_signed_payload: boolean;
    request_id: string | null;
    payload_hash_preview: string | null;
    quote_age_seconds: number | null;
    ttl_seconds: number | null;
    notional_usd: number;
    landing_score: number;
  };
  pre_submit_summary: {
    status: Web3TradingState["pre_submit_rehearsal"]["status"];
    action: Web3TradingState["pre_submit_rehearsal"]["items"][number]["action"] | "none";
    rehearsal_score: number;
    submit_readiness_score: number;
    custody_score: number;
    request_id: string | null;
    payload_hash_preview: string | null;
    ttl_seconds: number | null;
  };
  relay_summary: {
    status: Web3TradingState["signed_transaction_relay"]["status"];
    submit_path: Web3TradingState["signed_transaction_relay"]["submit_path"];
    can_accept_signed_payload: boolean;
    requires_external_wallet: boolean;
    request_id: string | null;
    payload_hash_preview: string | null;
    latest_signature_hash: string | null;
    confirmation_status: Web3TradingState["signed_transaction_relay"]["confirmation_status"];
  };
  adapter_summary: {
    status: Web3TradingState["autonomous_execution_adapter_readiness"]["status"];
    active_adapter: Web3TradingState["autonomous_execution_adapter_readiness"]["active_adapter"];
    quote_request_ready: boolean;
    swap_v2_order_ready: boolean;
    signer_ready: boolean;
    submit_ready: boolean;
    paper_fallback_active: boolean;
    readiness_score: number;
  };
  live_autonomy_summary: {
    status: Web3TradingState["autonomous_live_autonomy_readiness"]["status"];
    readiness_score: number;
    can_run_unattended: boolean;
    can_trade_real_capital: boolean;
    live_execution_permitted: boolean;
  };
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  provider_dispatch_permission: "blocked";
  private_key_storage: "blocked";
  transaction_body_storage: "blocked";
  unsigned_transaction_storage: "blocked";
  signed_payload_storage: "blocked";
  checks: Web3SignerHandoffReceiptCheck[];
  blockers: string[];
  controls: string[];
  summary: string;
  next_action: string;
};

export function buildWeb3SignerHandoffReceipt(state: Web3TradingState): Web3SignerHandoffReceipt {
  const generatedAt = new Date().toISOString();
  const custody = state.autonomous_custody_mandate;
  const signer = state.autonomous_signer_ops;
  const activeRequest = signer.active_request;
  const adapter = signer.provider_adapter;
  const packet = adapter.provider_request_packet;
  const handoffItem = chooseHandoffItem(state);
  const rehearsalItem = chooseRehearsalItem(state);
  const relay = state.signed_transaction_relay;
  const executionAdapter = state.autonomous_execution_adapter_readiness;
  const liveAutonomy = state.autonomous_live_autonomy_readiness;
  const walletPublicKey = custody.wallet_public_key ?? activeRequest?.wallet_public_key ?? null;
  const payloadHash = activeRequest?.payload_hash ?? adapter.payload_hash ?? handoffItem?.payload_hash ?? rehearsalItem?.payload_hash ?? relay.payload_hash;
  const requestBodyHash = adapter.request_body_hash ?? packet.request_body_hash;
  const walletScoped = Boolean(walletPublicKey);
  const custodyUsable = custody.status === "armed" || custody.status === "bounded-ready";
  const payloadReady = Boolean(payloadHash);
  const requestStatus: Web3SignerHandoffReceipt["request_summary"]["status"] = activeRequest?.status ?? "missing";
  const canRequestSignature = signer.can_request_signature || adapter.can_request_provider_signature || activeRequest?.status === "ready";
  const submitGateVisible = relay.can_accept_signed_payload ||
    relay.status === "ready" ||
    relay.status === "relayed" ||
    relay.status === "confirmed" ||
    state.autonomous_order_handoff.status === "ready-to-submit" ||
    state.pre_submit_rehearsal.status === "submit-ready";
  const liveBoundaryBroken = liveAutonomy.can_trade_real_capital || liveAutonomy.live_execution_permitted;
  const status = signerHandoffStatus({
    walletScoped,
    custodyUsable,
    payloadReady,
    canRequestSignature,
    submitGateVisible,
    liveBoundaryBroken,
    custodyStatus: custody.status,
  });
  const checks = buildSignerHandoffChecks({
    state,
    walletScoped,
    custodyUsable,
    payloadReady,
    canRequestSignature,
    submitGateVisible,
    liveBoundaryBroken,
  });
  const blockers = uniqueStrings([
    ...custody.blockers,
    ...signer.items.flatMap((item) => item.blockers),
    ...signer.provider_adapter.blockers,
    ...packet.blockers,
    ...state.autonomous_order_handoff.items.flatMap((item) => item.blockers),
    ...state.pre_submit_rehearsal.items.flatMap((item) => item.blockers),
    ...relay.blockers,
    ...liveAutonomy.blockers,
    ...checks.filter((check) => check.status === "fail").map((check) => check.detail),
  ]).slice(0, 10);
  const controls = uniqueStrings([
    ...custody.safeguards,
    ...signer.controls,
    ...adapter.controls,
    ...packet.controls,
    ...relay.safeguards,
    "Private keys and seed phrases remain never-store inputs.",
    "Signer handoff receipts keep hashes and previews only; raw transaction bodies and signed payloads are blocked.",
    "Live execution and wallet mutation remain blocked until a separate reviewed executor is deliberately enabled.",
  ]).slice(0, 12);
  const receiptBase = {
    mode: "web3-signer-handoff-receipt" as const,
    status,
    generated_at: generatedAt,
    source_state_as_of: state.market_source.fetched_at,
    active_provider: signer.active_provider,
    signer_scope: custody.signer_scope,
    wallet_scoped: walletScoped,
    wallet_public_key_preview: previewValue(walletPublicKey),
    policy_hash_present: Boolean(custody.policy_hash || signer.policy_hash),
    policy_hash_preview: previewValue(custody.policy_hash || signer.policy_hash),
    request_summary: {
      status: requestStatus,
      request_id: activeRequest?.request_id ?? adapter.request_id ?? handoffItem?.request_id ?? rehearsalItem?.request_id ?? relay.request_id,
      payload_hash_preview: previewValue(payloadHash),
      request_body_hash_preview: previewValue(requestBodyHash),
      handoff_id: activeRequest?.handoff_id ?? handoffItem?.id ?? null,
      plan_id: activeRequest?.plan_id ?? handoffItem?.plan_id ?? rehearsalItem?.plan_id ?? relay.latest_plan_id,
      symbol: activeRequest?.symbol ?? handoffItem?.symbol ?? rehearsalItem?.symbol ?? relay.latest_symbol,
      side: activeRequest?.side ?? handoffItem?.side ?? rehearsalItem?.side ?? relay.latest_side ?? "hold",
      notional_usd: activeRequest?.notional_usd ?? handoffItem?.notional_usd ?? 0,
      raw_transaction_included: false as const,
      signed_payload_included: false as const,
      private_key_required: false as const,
    },
    custody_summary: {
      status: custody.status,
      provider_configured: custody.provider_configured,
      spend_limit_usd: custody.spend_limit_usd,
      per_trade_limit_usd: custody.per_trade_limit_usd,
      remaining_cap_usd: custody.remaining_cap_usd,
      max_slippage_bps: custody.max_slippage_bps,
      allowed_path_count: custody.allowed_paths.length,
      allowed_side_count: custody.allowed_sides.length,
      allowed_symbol_count: custody.allowed_symbols.length,
      expires_at: custody.expires_at,
      revoke_after_seconds: custody.revoke_after_seconds,
    },
    signer_summary: {
      status: signer.status,
      can_request_signature: signer.can_request_signature,
      can_auto_sign: signer.can_auto_sign,
      requires_user_presence: signer.requires_user_presence,
      provider_adapter_status: adapter.status,
      provider_dispatch_ready: packet.can_dispatch_now,
      request_transport: adapter.request_transport,
      expected_response: adapter.expected_response,
      ready_count: signer.ready_count,
      signature_count: signer.signature_count,
      setup_count: signer.setup_count,
      blocked_count: signer.blocked_count,
      providers: signer.items.map((item) => ({
        provider: item.provider,
        status: item.status,
        action: item.action,
        readiness_score: item.readiness_score,
        can_request_signature: item.can_request_signature,
        can_auto_sign: item.can_auto_sign,
        requires_user_presence: item.requires_user_presence,
        next_action: item.next_action,
      })),
    },
    handoff_summary: {
      status: state.autonomous_order_handoff.status,
      action: handoffItem?.action ?? "none",
      path: handoffItem?.handoff_path ?? "none",
      symbol: handoffItem?.symbol ?? null,
      side: handoffItem?.side ?? "hold",
      signer_required: handoffItem?.signer_required ?? false,
      can_submit_signed_payload: handoffItem?.can_submit_signed_payload ?? false,
      request_id: handoffItem?.request_id ?? null,
      payload_hash_preview: previewValue(handoffItem?.payload_hash),
      quote_age_seconds: handoffItem?.quote_age_seconds ?? null,
      ttl_seconds: handoffItem?.ttl_seconds ?? null,
      notional_usd: handoffItem?.notional_usd ?? 0,
      landing_score: handoffItem?.landing_score ?? 0,
    },
    pre_submit_summary: {
      status: state.pre_submit_rehearsal.status,
      action: rehearsalItem?.action ?? "none",
      rehearsal_score: rehearsalItem?.rehearsal_score ?? 0,
      submit_readiness_score: rehearsalItem?.submit_readiness_score ?? 0,
      custody_score: rehearsalItem?.custody_score ?? 0,
      request_id: rehearsalItem?.request_id ?? null,
      payload_hash_preview: previewValue(rehearsalItem?.payload_hash),
      ttl_seconds: rehearsalItem?.ttl_seconds ?? null,
    },
    relay_summary: {
      status: relay.status,
      submit_path: relay.submit_path,
      can_accept_signed_payload: relay.can_accept_signed_payload,
      requires_external_wallet: relay.requires_external_wallet,
      request_id: relay.request_id,
      payload_hash_preview: previewValue(relay.payload_hash),
      latest_signature_hash: relay.latest_signature ? shortHash(relay.latest_signature) : null,
      confirmation_status: relay.confirmation_status,
    },
    adapter_summary: {
      status: executionAdapter.status,
      active_adapter: executionAdapter.active_adapter,
      quote_request_ready: executionAdapter.quote_request_ready,
      swap_v2_order_ready: executionAdapter.swap_v2_order_ready,
      signer_ready: executionAdapter.signer_ready,
      submit_ready: executionAdapter.submit_ready,
      paper_fallback_active: executionAdapter.paper_fallback_active,
      readiness_score: executionAdapter.readiness_score,
    },
    live_autonomy_summary: {
      status: liveAutonomy.status,
      readiness_score: liveAutonomy.readiness_score,
      can_run_unattended: liveAutonomy.can_run_unattended,
      can_trade_real_capital: liveAutonomy.can_trade_real_capital,
      live_execution_permitted: liveAutonomy.live_execution_permitted,
    },
    live_execution_permission: "blocked" as const,
    wallet_mutation_permission: "blocked" as const,
    provider_dispatch_permission: "blocked" as const,
    private_key_storage: "blocked" as const,
    transaction_body_storage: "blocked" as const,
    unsigned_transaction_storage: "blocked" as const,
    signed_payload_storage: "blocked" as const,
    checks,
    blockers,
    controls,
    summary: signerHandoffSummary(status, signer, custody, relay),
    next_action: signerHandoffNextAction(status, signer, custody, state),
  };

  return {
    ...receiptBase,
    receipt_hash: hashJson(receiptBase),
  };
}

function chooseHandoffItem(state: Web3TradingState) {
  return state.autonomous_order_handoff.items.find((item) => item.signer_required || item.payload_hash || item.request_id) ??
    state.autonomous_order_handoff.items[0] ??
    null;
}

function chooseRehearsalItem(state: Web3TradingState) {
  return state.pre_submit_rehearsal.items.find((item) => item.payload_hash || item.request_id || item.action === "request-signature" || item.action === "submit-ready") ??
    state.pre_submit_rehearsal.items[0] ??
    null;
}

function signerHandoffStatus({
  walletScoped,
  custodyUsable,
  payloadReady,
  canRequestSignature,
  submitGateVisible,
  liveBoundaryBroken,
  custodyStatus,
}: {
  walletScoped: boolean;
  custodyUsable: boolean;
  payloadReady: boolean;
  canRequestSignature: boolean | undefined;
  submitGateVisible: boolean;
  liveBoundaryBroken: boolean;
  custodyStatus: Web3TradingState["autonomous_custody_mandate"]["status"];
}): Web3SignerHandoffReceiptStatus {
  if (liveBoundaryBroken || custodyStatus === "blocked") return "blocked";
  if (!walletScoped) return "missing-wallet";
  if (!custodyUsable) return "policy-gated";
  if (submitGateVisible) return "submit-gated";
  if (payloadReady && canRequestSignature) return "request-ready";
  return "signature-gated";
}

function buildSignerHandoffChecks({
  state,
  walletScoped,
  custodyUsable,
  payloadReady,
  canRequestSignature,
  submitGateVisible,
  liveBoundaryBroken,
}: {
  state: Web3TradingState;
  walletScoped: boolean;
  custodyUsable: boolean;
  payloadReady: boolean;
  canRequestSignature: boolean | undefined;
  submitGateVisible: boolean;
  liveBoundaryBroken: boolean;
}): Web3SignerHandoffReceiptCheck[] {
  const custody = state.autonomous_custody_mandate;
  const signer = state.autonomous_signer_ops;
  const relay = state.signed_transaction_relay;
  const preSubmit = state.pre_submit_rehearsal;
  return [
    {
      id: "wallet-scope",
      label: "Wallet scope",
      status: walletScoped ? "pass" : "fail",
      detail: walletScoped ? "A public trading wallet is scoped for signer review." : "A public trading wallet address is required before signer handoff review.",
    },
    {
      id: "custody-policy",
      label: "Custody policy",
      status: custodyUsable ? "pass" : custody.status === "setup-required" ? "watch" : "fail",
      detail: `${custody.provider.replaceAll("-", " ")} custody is ${custody.status.replaceAll("-", " ")} with ${custody.max_slippage_bps} bps max slippage and ${formatCompactValue(custody.per_trade_limit_usd)} per-trade cap.`,
    },
    {
      id: "signer-provider",
      label: "Signer provider",
      status: canRequestSignature ? "pass" : signer.status === "setup-required" || signer.status === "signature-needed" ? "watch" : "fail",
      detail: `${signer.active_provider.replaceAll("-", " ")} is ${signer.status.replaceAll("-", " ")}; provider adapter ${signer.provider_adapter.status.replaceAll("-", " ")}.`,
    },
    {
      id: "payload-hash",
      label: "Payload hash",
      status: payloadReady ? "pass" : "watch",
      detail: payloadReady ? "A hash-only signer request payload is available; raw transaction bytes are not included." : "No signer payload hash is active yet; request a dry-run order rehearsal first.",
    },
    {
      id: "pre-submit",
      label: "Pre-submit",
      status: preSubmit.status === "submit-ready" || preSubmit.status === "signing-needed" ? "pass" : preSubmit.status === "blocked" ? "fail" : "watch",
      detail: `Pre-submit rehearsal is ${preSubmit.status.replaceAll("-", " ")} with ${preSubmit.average_rehearsal_score}/100 average score.`,
    },
    {
      id: "relay-boundary",
      label: "Relay boundary",
      status: relay.status === "failed" ? "fail" : submitGateVisible || relay.status === "awaiting-signature" ? "pass" : "watch",
      detail: `Signed relay is ${relay.status.replaceAll("-", " ")} through ${relay.submit_path.replaceAll("-", " ")}; signed payload acceptance ${relay.can_accept_signed_payload ? "ready" : "locked"}.`,
    },
    {
      id: "live-boundary",
      label: "Live boundary",
      status: liveBoundaryBroken ? "fail" : "pass",
      detail: liveBoundaryBroken ? "Live-capital readiness appears armed; keep signer handoff blocked until manual executor review." : "Live execution and wallet mutation remain blocked from this receipt.",
    },
    {
      id: "private-key-boundary",
      label: "Private key boundary",
      status: "pass",
      detail: "Private keys, seed phrases, raw transaction bodies, and signed payload storage remain blocked.",
    },
  ];
}

function signerHandoffSummary(
  status: Web3SignerHandoffReceiptStatus,
  signer: Web3TradingState["autonomous_signer_ops"],
  custody: Web3TradingState["autonomous_custody_mandate"],
  relay: Web3TradingState["signed_transaction_relay"],
) {
  if (status === "missing-wallet") return "Signer handoff is missing a public trading wallet scope; no signature request can be reviewed yet.";
  if (status === "policy-gated") return `${custody.provider.replaceAll("-", " ")} custody policy is not armed enough for a signer request review.`;
  if (status === "request-ready") return `${signer.active_provider.replaceAll("-", " ")} can review a hash-only signature request while live execution remains blocked.`;
  if (status === "submit-gated") return `Signed relay is ${relay.status.replaceAll("-", " ")}; submit remains gated behind external signature and live-executor review.`;
  if (status === "blocked") return "Signer handoff is blocked because a custody or live-boundary check failed.";
  return "Signer handoff is signature-gated until a dry-run order rehearsal produces a scoped payload hash and request id.";
}

function signerHandoffNextAction(
  status: Web3SignerHandoffReceiptStatus,
  signer: Web3TradingState["autonomous_signer_ops"],
  custody: Web3TradingState["autonomous_custody_mandate"],
  state: Web3TradingState,
) {
  if (status === "missing-wallet") return "Enter a public dedicated trading wallet in Web3 credential setup, then test credentials.";
  if (status === "policy-gated") return custody.next_action;
  if (status === "request-ready") return signer.next_action;
  if (status === "submit-gated") return state.signed_transaction_relay.next_action;
  if (status === "blocked") return state.autonomous_live_autonomy_readiness.next_action;
  return state.pre_submit_rehearsal.next_action || "Run dry-run signer setup and order rehearsal before requesting any external signature.";
}

function previewValue(value: string | null | undefined) {
  if (!value) return null;
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function shortHash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value?.trim()))));
}

function formatCompactValue(value: number) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${Math.round(value)}`;
}
