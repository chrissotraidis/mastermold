import { createHash } from "node:crypto";
import { isLikelySolanaPublicKey } from "./web3-credentials";
import { store, type Web3ExecutionAuditRow } from "./store";
import type { ExecutionAuditEntry, Web3TradingState } from "./web3-trading";
import { getLatestWeb3WalletOwnershipReceipt } from "./web3-wallet-ownership";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SAMPLE_SYSTEM_WALLET = "11111111111111111111111111111111";
const JUPITER_ORDER_URL = "https://api.jup.ag/swap/v2/order";
const MAX_CANARY_LAMPORTS = 1_000_000;
const DEFAULT_CANARY_LAMPORTS = 100_000;
const MAX_CANARY_SLIPPAGE_BPS = 100;

type FetchLike = typeof fetch;

export type Web3LiveUnsignedOrderHandoffInput = {
  operator_ack?: unknown;
  canary_ack?: unknown;
  return_unsigned_transaction_ack?: unknown;
  wallet_public_key?: unknown;
  amount_lamports?: unknown;
  max_slippage_bps?: unknown;
};

export type Web3LiveUnsignedOrderPreflightReceipt = {
  mode: "web3-live-unsigned-order-preflight";
  status: "ready" | "blocked" | "unsafe-rejected";
  generated_at: string;
  receipt_hash: string;
  source: Web3TradingState["market_source"]["mode"];
  account: Web3TradingState["paper_account"]["mode"];
  scenario: Web3TradingState["scenario"];
  operator_acknowledged: boolean;
  canary_acknowledged: boolean;
  wallet_public_key_preview: string | null;
  canary_pair: "SOL-USDC";
  amount_lamports: number;
  max_lamports: number;
  max_slippage_bps: number;
  jupiter_key_configured: boolean;
  live_flags_ready: boolean;
  source_ready: boolean;
  account_ready: boolean;
  wallet_ready: boolean;
  scoped_wallet_public_key_preview: string | null;
  scoped_wallet_ownership_proved: boolean;
  wallet_matches_scoped_wallet: boolean;
  wallet_ownership_proved: boolean;
  can_request_one_shot_unsigned_order: boolean;
  unsigned_transaction_return: "blocked";
  transaction_body_storage: "blocked";
  signed_transaction_return: "blocked";
  execute_permission: "blocked";
  transaction_submission_permission: "blocked";
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  private_key_storage: "blocked";
  seed_phrase_storage: "blocked";
  secret_echo_permission: "blocked";
  unsafe_fields: string[];
  blockers: string[];
  next_action: string;
  controls: string[];
};

export type Web3LiveUnsignedOrderHandoffReceipt = {
  mode: "web3-live-unsigned-order-handoff";
  status: "blocked" | "unsafe-rejected" | "order-ready" | "order-failed";
  generated_at: string;
  receipt_hash: string;
  source: Web3TradingState["market_source"]["mode"];
  account: Web3TradingState["paper_account"]["mode"];
  scenario: Web3TradingState["scenario"];
  operator_acknowledged: boolean;
  canary_acknowledged: boolean;
  return_acknowledged: boolean;
  wallet_public_key_preview: string | null;
  scoped_wallet_public_key_preview: string | null;
  scoped_wallet_ownership_proved: boolean;
  wallet_matches_scoped_wallet: boolean;
  wallet_ownership_proved: boolean;
  canary_pair: "SOL-USDC";
  amount_lamports: number;
  max_lamports: number;
  max_slippage_bps: number;
  input_mint: typeof SOL_MINT;
  output_mint: typeof USDC_MINT;
  request_id: string | null;
  router: string | null;
  order_mode: string | null;
  fee_bps: number | null;
  unsigned_transaction: string | null;
  unsigned_transaction_return: "blocked" | "returned-one-shot";
  unsigned_payload_hash: string | null;
  unsigned_payload_byte_count: number;
  continuity_audit_recorded: boolean;
  transaction_body_storage: "blocked";
  signed_transaction_return: "blocked";
  execute_permission: "blocked";
  transaction_submission_permission: "blocked";
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  private_key_storage: "blocked";
  seed_phrase_storage: "blocked";
  secret_echo_permission: "blocked";
  unsafe_fields: string[];
  blockers: string[];
  next_action: string;
  controls: string[];
};

export function buildWeb3LiveUnsignedOrderPreflightReceipt(
  state: Web3TradingState,
  rawInput: Web3LiveUnsignedOrderHandoffInput,
): Web3LiveUnsignedOrderPreflightReceipt {
  const generatedAt = new Date().toISOString();
  const unsafeFields = findUnsafeFields(rawInput);
  const operatorAcknowledged = rawInput.operator_ack === true;
  const canaryAcknowledged = rawInput.canary_ack === "I_UNDERSTAND_THIS_UNSIGNED_ORDER_CAN_MOVE_REAL_FUNDS_IF_SIGNED";
  const amountLamports = canaryLamports(rawInput.amount_lamports);
  const maxSlippageBps = canarySlippage(rawInput.max_slippage_bps);
  const liveFlagsReady = liveUnsignedCanaryFlagsReady();
  const sourceReady = state.market_source.mode === "live-dex";
  const accountReady = state.paper_account.mode === "persistent";
  const scopedWallet = scopedWalletPublicKey(state);
  const wallet = handoffWalletPublicKey(rawInput.wallet_public_key, scopedWallet);
  const walletReady = Boolean(wallet) && isLikelySolanaPublicKey(wallet) && wallet !== SAMPLE_SYSTEM_WALLET;
  const scopedWalletReady = isDedicatedPublicWallet(scopedWallet);
  const scopedWalletOwnershipProved = scopedWalletReady && Boolean(getLatestWeb3WalletOwnershipReceipt(scopedWallet));
  const walletMatchesScopedWallet = walletReady && scopedWalletReady && wallet === scopedWallet;
  const walletOwnershipProved = walletMatchesScopedWallet && scopedWalletOwnershipProved;
  const blockers = [
    !sourceReady ? "Live canary preflight requires source=live-dex." : null,
    !accountReady ? "Live canary preflight requires account=persistent." : null,
    !scopedWallet ? "Save a dedicated public Solana wallet before live canary preflight." : null,
    scopedWallet && !isLikelySolanaPublicKey(scopedWallet) ? "Replace the scoped wallet with a valid public Solana address before live canary preflight." : null,
    scopedWallet === SAMPLE_SYSTEM_WALLET ? "The scoped sample all-ones wallet cannot pass live canary preflight." : null,
    scopedWalletReady && !scopedWalletOwnershipProved ? "Run Prove ownership with the scoped browser wallet before live canary preflight; this signs text only and cannot move funds." : null,
    !wallet ? "wallet_public_key is required." : null,
    wallet && !isLikelySolanaPublicKey(wallet) ? "wallet_public_key must be a valid public Solana address." : null,
    wallet === SAMPLE_SYSTEM_WALLET ? "The sample all-ones wallet cannot pass live canary preflight." : null,
    walletReady && scopedWalletReady && !walletMatchesScopedWallet ? "wallet_public_key must match the scoped dedicated wallet before live canary preflight." : null,
    walletMatchesScopedWallet && !walletOwnershipProved ? "Run Prove ownership with the scoped browser wallet before live canary preflight; this signs text only and cannot move funds." : null,
    amountLamports > MAX_CANARY_LAMPORTS ? `amount_lamports must be ${MAX_CANARY_LAMPORTS} or less for the first canary.` : null,
    !process.env.JUPITER_API_KEY ? "JUPITER_API_KEY must be configured in ignored server env." : null,
    !liveFlagsReady ? "Live canary preflight requires MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION=true, MASTERMOLD_LIVE_OPERATOR_APPROVAL=I_UNDERSTAND_REAL_FUNDS, and MASTERMOLD_ALLOW_LIVE_UNSIGNED_CANARY_HANDOFF=true." : null,
    !operatorAcknowledged ? "operator_ack must be true before live canary preflight can pass." : null,
    !canaryAcknowledged ? "canary_ack must equal I_UNDERSTAND_THIS_UNSIGNED_ORDER_CAN_MOVE_REAL_FUNDS_IF_SIGNED." : null,
  ].filter((item): item is string => Boolean(item));
  const status: Web3LiveUnsignedOrderPreflightReceipt["status"] = unsafeFields.length > 0
    ? "unsafe-rejected"
    : blockers.length > 0
      ? "blocked"
      : "ready";
  const allBlockers = [
    ...unsafeFields.map((field) => `Unsafe field rejected: ${field}.`),
    ...blockers,
  ];
  const receiptBase = {
    mode: "web3-live-unsigned-order-preflight" as const,
    status,
    generated_at: generatedAt,
    source: state.market_source.mode,
    account: state.paper_account.mode,
    scenario: state.scenario,
    operator_acknowledged: operatorAcknowledged,
    canary_acknowledged: canaryAcknowledged,
    wallet_public_key_preview: previewValue(wallet),
    scoped_wallet_public_key_preview: previewValue(scopedWallet),
    canary_pair: "SOL-USDC" as const,
    amount_lamports: amountLamports,
    max_lamports: MAX_CANARY_LAMPORTS,
    max_slippage_bps: maxSlippageBps,
    jupiter_key_configured: Boolean(process.env.JUPITER_API_KEY),
    live_flags_ready: liveFlagsReady,
    source_ready: sourceReady,
    account_ready: accountReady,
    wallet_ready: walletReady,
    scoped_wallet_ownership_proved: scopedWalletOwnershipProved,
    wallet_matches_scoped_wallet: walletMatchesScopedWallet,
    wallet_ownership_proved: walletOwnershipProved,
    can_request_one_shot_unsigned_order: status === "ready",
    unsigned_transaction_return: "blocked" as const,
    transaction_body_storage: "blocked" as const,
    signed_transaction_return: "blocked" as const,
    execute_permission: "blocked" as const,
    transaction_submission_permission: "blocked" as const,
    live_execution_permission: "blocked" as const,
    wallet_mutation_permission: "blocked" as const,
    private_key_storage: "blocked" as const,
    seed_phrase_storage: "blocked" as const,
    secret_echo_permission: "blocked" as const,
    unsafe_fields: unsafeFields,
    blockers: [...new Set(allBlockers)].slice(0, 10),
    next_action: unsignedPreflightNextAction(status, allBlockers),
    controls: [
      "This preflight checks the exact scoped wallet, hash-only ownership proof, tiny cap, Jupiter env, source, account, and live flags before any wallet prompt.",
      "It never calls Jupiter order creation, returns transaction bytes, signs, submits, stores payloads, or mutates a wallet.",
      "If ready, the next step is the explicit one-shot unsigned handoff and browser-wallet signature prompt.",
      "Private keys, seed phrases, keypair JSON, provider API key values, raw transactions, signed payloads, secret echo, and wallet authority remain blocked.",
    ],
  };

  return {
    ...receiptBase,
    receipt_hash: hashJson(receiptBase),
  };
}

export async function buildWeb3LiveUnsignedOrderHandoffReceipt(
  state: Web3TradingState,
  rawInput: Web3LiveUnsignedOrderHandoffInput,
  fetchImpl: FetchLike = fetch,
): Promise<Web3LiveUnsignedOrderHandoffReceipt> {
  const generatedAt = new Date().toISOString();
  const unsafeFields = findUnsafeFields(rawInput);
  const operatorAcknowledged = rawInput.operator_ack === true;
  const canaryAcknowledged = rawInput.canary_ack === "I_UNDERSTAND_THIS_UNSIGNED_ORDER_CAN_MOVE_REAL_FUNDS_IF_SIGNED";
  const returnAcknowledged = rawInput.return_unsigned_transaction_ack === true;
  const amountLamports = canaryLamports(rawInput.amount_lamports);
  const maxSlippageBps = canarySlippage(rawInput.max_slippage_bps);
  const liveFlagsReady = liveUnsignedCanaryFlagsReady();
  const scopedWallet = scopedWalletPublicKey(state);
  const wallet = handoffWalletPublicKey(rawInput.wallet_public_key, scopedWallet);
  const scopedWalletReady = isDedicatedPublicWallet(scopedWallet);
  const walletReady = Boolean(wallet) && isLikelySolanaPublicKey(wallet) && wallet !== SAMPLE_SYSTEM_WALLET;
  const scopedWalletOwnershipProved = scopedWalletReady && Boolean(getLatestWeb3WalletOwnershipReceipt(scopedWallet));
  const walletMatchesScopedWallet = walletReady && scopedWalletReady && wallet === scopedWallet;
  const walletOwnershipProved = walletMatchesScopedWallet && scopedWalletOwnershipProved;
  const blockers = [
    state.market_source.mode !== "live-dex" ? "Unsigned live canary handoff requires source=live-dex." : null,
    state.paper_account.mode !== "persistent" ? "Unsigned live canary handoff requires account=persistent." : null,
    !scopedWallet ? "Save a dedicated public Solana wallet before requesting a live unsigned canary order." : null,
    scopedWallet && !isLikelySolanaPublicKey(scopedWallet) ? "Replace the scoped wallet with a valid public Solana address before requesting a live unsigned canary order." : null,
    scopedWallet === SAMPLE_SYSTEM_WALLET ? "The scoped sample all-ones wallet cannot receive a live unsigned canary order." : null,
    scopedWalletReady && !scopedWalletOwnershipProved ? "Run Prove ownership with the scoped browser wallet before requesting a live unsigned canary order; this signs text only and cannot move funds." : null,
    !wallet ? "wallet_public_key is required." : null,
    wallet && !isLikelySolanaPublicKey(wallet) ? "wallet_public_key must be a valid public Solana address." : null,
    wallet === SAMPLE_SYSTEM_WALLET ? "The sample all-ones wallet cannot receive a live unsigned canary order." : null,
    walletReady && scopedWalletReady && !walletMatchesScopedWallet ? "wallet_public_key must match the scoped dedicated wallet before requesting a live unsigned canary order." : null,
    walletMatchesScopedWallet && !walletOwnershipProved ? "Run Prove ownership with the scoped browser wallet before requesting a live unsigned canary order; this signs text only and cannot move funds." : null,
    amountLamports > MAX_CANARY_LAMPORTS ? `amount_lamports must be ${MAX_CANARY_LAMPORTS} or less for the first canary.` : null,
    !process.env.JUPITER_API_KEY ? "JUPITER_API_KEY must be configured in ignored server env." : null,
    !liveFlagsReady ? "Live unsigned canary handoff requires MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION=true, MASTERMOLD_LIVE_OPERATOR_APPROVAL=I_UNDERSTAND_REAL_FUNDS, and MASTERMOLD_ALLOW_LIVE_UNSIGNED_CANARY_HANDOFF=true." : null,
    !operatorAcknowledged ? "operator_ack must be true before building a live canary order." : null,
    !canaryAcknowledged ? "canary_ack must equal I_UNDERSTAND_THIS_UNSIGNED_ORDER_CAN_MOVE_REAL_FUNDS_IF_SIGNED." : null,
    !returnAcknowledged ? "return_unsigned_transaction_ack must be true before unsigned transaction bytes can be returned." : null,
  ].filter((item): item is string => Boolean(item));

  if (unsafeFields.length > 0 || blockers.length > 0) {
    return receipt({
      state,
      generatedAt,
      status: unsafeFields.length > 0 ? "unsafe-rejected" : "blocked",
      operatorAcknowledged,
      canaryAcknowledged,
      returnAcknowledged,
      wallet,
      scopedWallet,
      scopedWalletOwnershipProved,
      walletMatchesScopedWallet,
      walletOwnershipProved,
      amountLamports,
      maxSlippageBps,
      unsafeFields,
      blockers,
    });
  }

  try {
    const params = new URLSearchParams({
      inputMint: SOL_MINT,
      outputMint: USDC_MINT,
      amount: String(amountLamports),
      taker: wallet,
      slippageBps: String(maxSlippageBps),
    });
    const response = await fetchImpl(`${JUPITER_ORDER_URL}?${params.toString()}`, {
      headers: {
        accept: "application/json",
        "x-api-key": process.env.JUPITER_API_KEY!,
      },
    });
    const json = await response.json().catch(() => null) as {
      transaction?: unknown;
      requestId?: unknown;
      router?: unknown;
      mode?: unknown;
      feeBps?: unknown;
      errorMessage?: unknown;
    } | null;
    const unsignedTransaction = typeof json?.transaction === "string" ? json.transaction : "";
    const payload = inspectPayload(unsignedTransaction);
    if (!response.ok || !payload.valid) {
      return receipt({
        state,
        generatedAt,
        status: "order-failed",
        operatorAcknowledged,
        canaryAcknowledged,
        returnAcknowledged,
        wallet,
        scopedWallet,
        scopedWalletOwnershipProved,
        walletMatchesScopedWallet,
        walletOwnershipProved,
        amountLamports,
        maxSlippageBps,
        requestId: typeof json?.requestId === "string" ? json.requestId : null,
        router: typeof json?.router === "string" ? json.router : null,
        orderMode: typeof json?.mode === "string" ? json.mode : null,
        feeBps: typeof json?.feeBps === "number" ? json.feeBps : null,
        unsafeFields,
        blockers: [response.ok ? "Jupiter did not return a valid unsigned transaction payload." : `Jupiter order failed with ${response.status}.`],
      });
    }
    return receipt({
      state,
      generatedAt,
      status: "order-ready",
      operatorAcknowledged,
      canaryAcknowledged,
      returnAcknowledged,
      wallet,
      scopedWallet,
      scopedWalletOwnershipProved,
      walletMatchesScopedWallet,
      walletOwnershipProved,
      amountLamports,
      maxSlippageBps,
      requestId: typeof json?.requestId === "string" ? json.requestId : null,
      router: typeof json?.router === "string" ? json.router : null,
      orderMode: typeof json?.mode === "string" ? json.mode : null,
      feeBps: typeof json?.feeBps === "number" ? json.feeBps : null,
      unsignedTransaction,
      unsignedPayloadHash: payload.hash,
      unsignedPayloadByteCount: payload.bytes,
      unsafeFields,
      blockers: [],
    });
  } catch (error) {
    return receipt({
      state,
      generatedAt,
      status: "order-failed",
      operatorAcknowledged,
      canaryAcknowledged,
      returnAcknowledged,
      wallet,
      scopedWallet,
      scopedWalletOwnershipProved,
      walletMatchesScopedWallet,
      walletOwnershipProved,
      amountLamports,
      maxSlippageBps,
      unsafeFields,
      blockers: [error instanceof Error ? error.message : "Jupiter unsigned order handoff failed."],
    });
  }
}

function receipt(input: {
  state: Web3TradingState;
  generatedAt: string;
  status: Web3LiveUnsignedOrderHandoffReceipt["status"];
  operatorAcknowledged: boolean;
  canaryAcknowledged: boolean;
  returnAcknowledged: boolean;
  wallet: string;
  scopedWallet: string | null;
  scopedWalletOwnershipProved: boolean;
  walletMatchesScopedWallet: boolean;
  walletOwnershipProved: boolean;
  amountLamports: number;
  maxSlippageBps: number;
  requestId?: string | null;
  router?: string | null;
  orderMode?: string | null;
  feeBps?: number | null;
  unsignedTransaction?: string | null;
  unsignedPayloadHash?: string | null;
  unsignedPayloadByteCount?: number;
  unsafeFields: string[];
  blockers: string[];
}): Web3LiveUnsignedOrderHandoffReceipt {
  const blockers = [
    ...input.unsafeFields.map((field) => `Unsafe field rejected: ${field}.`),
    ...input.blockers,
  ];
  const continuityAuditRecorded = recordCanaryContinuityAudit(input);
  const receiptBase = {
    mode: "web3-live-unsigned-order-handoff" as const,
    status: input.status,
    generated_at: input.generatedAt,
    source: input.state.market_source.mode,
    account: input.state.paper_account.mode,
    scenario: input.state.scenario,
    operator_acknowledged: input.operatorAcknowledged,
    canary_acknowledged: input.canaryAcknowledged,
    return_acknowledged: input.returnAcknowledged,
    wallet_public_key_preview: previewValue(input.wallet),
    scoped_wallet_public_key_preview: previewValue(input.scopedWallet),
    scoped_wallet_ownership_proved: input.scopedWalletOwnershipProved,
    wallet_matches_scoped_wallet: input.walletMatchesScopedWallet,
    wallet_ownership_proved: input.walletOwnershipProved,
    canary_pair: "SOL-USDC" as const,
    amount_lamports: input.amountLamports,
    max_lamports: MAX_CANARY_LAMPORTS,
    max_slippage_bps: input.maxSlippageBps,
    input_mint: SOL_MINT as typeof SOL_MINT,
    output_mint: USDC_MINT as typeof USDC_MINT,
    request_id: input.requestId ?? null,
    router: input.router ?? null,
    order_mode: input.orderMode ?? null,
    fee_bps: input.feeBps ?? null,
    unsigned_transaction: input.status === "order-ready" ? input.unsignedTransaction ?? null : null,
    unsigned_transaction_return: input.status === "order-ready" ? "returned-one-shot" as const : "blocked" as const,
    unsigned_payload_hash: input.unsignedPayloadHash ?? null,
    unsigned_payload_byte_count: input.unsignedPayloadByteCount ?? 0,
    continuity_audit_recorded: continuityAuditRecorded,
    transaction_body_storage: "blocked" as const,
    signed_transaction_return: "blocked" as const,
    execute_permission: "blocked" as const,
    transaction_submission_permission: "blocked" as const,
    live_execution_permission: "blocked" as const,
    wallet_mutation_permission: "blocked" as const,
    private_key_storage: "blocked" as const,
    seed_phrase_storage: "blocked" as const,
    secret_echo_permission: "blocked" as const,
    unsafe_fields: input.unsafeFields,
    blockers: [...new Set(blockers)].slice(0, 10),
    next_action: unsignedHandoffNextAction(input.status, blockers),
    controls: [
      "This route builds only a tiny SOL-to-USDC Jupiter canary order and never signs, submits, stores, or repeats the transaction body.",
      "Unsigned bytes are returned only after explicit live flags, source=live-dex, account=persistent, matching public wallet scope, hash-only ownership proof, and canary acknowledgements.",
      "The browser wallet or external signer must sign the one-shot transaction, then the signed payload must go through the live trade canary relay.",
      "Private keys, seed phrases, keypair JSON, provider API keys, raw transaction inputs, signed payload inputs, secret echo, and wallet mutation remain blocked.",
    ],
  };

  return {
    ...receiptBase,
    receipt_hash: hashJson({
      ...receiptBase,
      unsigned_transaction: receiptBase.unsigned_transaction ? "[one-shot-unsigned-transaction-redacted-from-hash]" : null,
    }),
  };
}

function recordCanaryContinuityAudit(input: {
  state: Web3TradingState;
  generatedAt: string;
  status: Web3LiveUnsignedOrderHandoffReceipt["status"];
  requestId?: string | null;
  router?: string | null;
  unsignedPayloadHash?: string | null;
  unsignedPayloadByteCount?: number;
}): boolean {
  if (
    input.status !== "order-ready" ||
    !input.requestId ||
    !input.unsignedPayloadHash ||
    !input.unsignedPayloadByteCount
  ) {
    return false;
  }

  const digest = createHash("sha256")
    .update(`${input.requestId}:${input.unsignedPayloadHash}:${input.generatedAt}`)
    .digest("hex");
  const entry: ExecutionAuditEntry = {
    id: `web3-canary-handoff-${digest.slice(0, 24)}`,
    created_at: input.generatedAt,
    nonce: `web3-canary-handoff-${digest.slice(0, 12)}`,
    plan_id: null,
    symbol: "SOL-USDC",
    side: "buy",
    status: "ready-to-sign",
    attempt: 0,
    max_attempts: 1,
    retry_window_seconds: 90,
    next_retry_at: null,
    request_id: input.requestId,
    router: input.router ?? "jupiter-swap-v2",
    relay_path: "jupiter-swap-v2",
    transaction_ready: true,
    payload_hash: input.unsignedPayloadHash,
    payload_bytes: input.unsignedPayloadByteCount,
    simulated_signature: null,
    relay_signature: null,
    relay_slot: null,
    confirmation_status: null,
    signer_session_label: "browser-wallet:live-canary-handoff",
    signer_network: null,
    kill_switch: input.state.execution_readiness.config.kill_switch,
    reason: "One-shot live canary unsigned order was returned for external browser-wallet signing; transaction bytes were not stored.",
  };
  store().appendWeb3ExecutionAudit({
    id: entry.id,
    created_at: entry.created_at,
    data: entry,
  } satisfies Web3ExecutionAuditRow);
  return true;
}

function unsignedHandoffNextAction(status: Web3LiveUnsignedOrderHandoffReceipt["status"], blockers: string[]) {
  if (status === "order-ready") return "Sign this one-shot unsigned transaction in the browser wallet, then submit the signed base64 payload to /api/web3-live-trade-canary.";
  if (status === "unsafe-rejected") return "Remove unsafe fields and provide only public wallet scope plus canary acknowledgements.";
  if (status === "order-failed") return blockers[0] ?? "Repair Jupiter order readiness before another canary handoff.";
  return blockers[0] ?? "Clear live unsigned canary blockers before requesting a signable order.";
}

function unsignedPreflightNextAction(status: Web3LiveUnsignedOrderPreflightReceipt["status"], blockers: string[]) {
  if (status === "ready") return "Preflight is ready. The next action can request the one-shot unsigned Jupiter canary and open the browser-wallet signing prompt.";
  if (status === "unsafe-rejected") return "Remove unsafe fields and preflight again with only public wallet scope and canary acknowledgements.";
  return blockers[0] ?? "Clear live canary preflight blockers before requesting an unsigned order.";
}

function scopedWalletPublicKey(state: Web3TradingState) {
  return state.autonomous_custody_mandate.wallet_public_key ??
    state.live_wallet_accounting_readiness.wallet_public_key ??
    state.execution_readiness.config.wallet_public_key ??
    null;
}

function handoffWalletPublicKey(value: unknown, scopedWallet: string | null) {
  const explicitWallet = text(value);
  if (explicitWallet) return explicitWallet;
  return isDedicatedPublicWallet(scopedWallet) ? scopedWallet! : "";
}

function isDedicatedPublicWallet(value: string | null) {
  return Boolean(value) && isLikelySolanaPublicKey(value!) && value !== SAMPLE_SYSTEM_WALLET;
}

function liveUnsignedCanaryFlagsReady() {
  return process.env.MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION === "true" &&
    process.env.MASTERMOLD_LIVE_OPERATOR_APPROVAL === "I_UNDERSTAND_REAL_FUNDS" &&
    process.env.MASTERMOLD_ALLOW_LIVE_UNSIGNED_CANARY_HANDOFF === "true";
}

function inspectPayload(value: string): { valid: true; hash: string; bytes: number } | { valid: false; hash: null; bytes: 0 } {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed)) {
    return { valid: false, hash: null, bytes: 0 };
  }
  const bytes = Buffer.from(trimmed, "base64");
  if (bytes.length === 0 || bytes.toString("base64").replace(/=+$/, "") !== trimmed.replace(/=+$/, "")) {
    return { valid: false, hash: null, bytes: 0 };
  }
  return { valid: true, hash: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length };
}

function findUnsafeFields(value: unknown, path = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const childPath = path ? `${path}.${key}` : key;
    const unsafeKey = key !== "return_unsigned_transaction_ack" && unsafeKeyPatterns.some((pattern) => pattern.test(key));
    const unsafeValue = typeof child === "string" && looksSecretLike(child);
    const nested = child && typeof child === "object" && !Array.isArray(child) ? findUnsafeFields(child, childPath) : [];
    return [
      unsafeKey || unsafeValue ? childPath : null,
      ...nested,
    ].filter((item): item is string => Boolean(item));
  });
}

const unsafeKeyPatterns = [
  /private/i,
  /seed/i,
  /mnemonic/i,
  /keypair/i,
  /secret/i,
  /password/i,
  /token/i,
  /api[_-]?key/i,
  /raw[_-]?transaction/i,
  /unsigned[_-]?transaction/i,
  /signed[_-]?transaction/i,
  /transaction[_-]?bytes/i,
  /signed[_-]?payload/i,
];

function looksSecretLike(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/api-key=|bearer\s+[A-Za-z0-9._-]{16,}|sk-[A-Za-z0-9_-]{16,}/i.test(trimmed)) return true;
  if (/private[_\s-]?key|seed\s+phrase|mnemonic|keypair/i.test(trimmed)) return true;
  if (trimmed.split(/\s+/).length >= 12 && /^[a-z\s]+$/i.test(trimmed)) return true;
  return false;
}

function canaryLamports(value: unknown) {
  const parsed = Number(value ?? DEFAULT_CANARY_LAMPORTS);
  if (!Number.isFinite(parsed)) return DEFAULT_CANARY_LAMPORTS;
  return Math.max(10_000, Math.min(Math.round(parsed), MAX_CANARY_LAMPORTS));
}

function canarySlippage(value: unknown) {
  const parsed = Number(value ?? 50);
  if (!Number.isFinite(parsed)) return 50;
  return Math.max(1, Math.min(Math.round(parsed), MAX_CANARY_SLIPPAGE_BPS));
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function previewValue(value: string | null | undefined) {
  return value ? `${value.slice(0, 4)}...${value.slice(-4)}` : null;
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
