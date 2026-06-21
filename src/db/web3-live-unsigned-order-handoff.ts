import { createHash } from "node:crypto";
import { isLikelySolanaPublicKey } from "./web3-credentials";
import type { Web3TradingState } from "./web3-trading";

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
  const wallet = text(rawInput.wallet_public_key);
  const amountLamports = canaryLamports(rawInput.amount_lamports);
  const maxSlippageBps = canarySlippage(rawInput.max_slippage_bps);
  const liveFlagsReady = process.env.MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION === "true" &&
    process.env.MASTERMOLD_LIVE_OPERATOR_APPROVAL === "I_UNDERSTAND_REAL_FUNDS" &&
    process.env.MASTERMOLD_ALLOW_LIVE_UNSIGNED_CANARY_HANDOFF === "true";
  const blockers = [
    !operatorAcknowledged ? "operator_ack must be true before building a live canary order." : null,
    !canaryAcknowledged ? "canary_ack must equal I_UNDERSTAND_THIS_UNSIGNED_ORDER_CAN_MOVE_REAL_FUNDS_IF_SIGNED." : null,
    !returnAcknowledged ? "return_unsigned_transaction_ack must be true before unsigned transaction bytes can be returned." : null,
    state.market_source.mode !== "live-dex" ? "Unsigned live canary handoff requires source=live-dex." : null,
    state.paper_account.mode !== "persistent" ? "Unsigned live canary handoff requires account=persistent." : null,
    !wallet ? "wallet_public_key is required." : null,
    wallet && !isLikelySolanaPublicKey(wallet) ? "wallet_public_key must be a valid public Solana address." : null,
    wallet === SAMPLE_SYSTEM_WALLET ? "The sample all-ones wallet cannot receive a live unsigned canary order." : null,
    amountLamports > MAX_CANARY_LAMPORTS ? `amount_lamports must be ${MAX_CANARY_LAMPORTS} or less for the first canary.` : null,
    !process.env.JUPITER_API_KEY ? "JUPITER_API_KEY must be configured in ignored server env." : null,
    !liveFlagsReady ? "Live unsigned canary handoff requires MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION=true, MASTERMOLD_LIVE_OPERATOR_APPROVAL=I_UNDERSTAND_REAL_FUNDS, and MASTERMOLD_ALLOW_LIVE_UNSIGNED_CANARY_HANDOFF=true." : null,
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
      "Unsigned bytes are returned only after explicit live flags, source=live-dex, account=persistent, public wallet scope, and canary acknowledgements.",
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

function unsignedHandoffNextAction(status: Web3LiveUnsignedOrderHandoffReceipt["status"], blockers: string[]) {
  if (status === "order-ready") return "Sign this one-shot unsigned transaction in the browser wallet, then submit the signed base64 payload to /api/web3-live-trade-canary.";
  if (status === "unsafe-rejected") return "Remove unsafe fields and provide only public wallet scope plus canary acknowledgements.";
  if (status === "order-failed") return blockers[0] ?? "Repair Jupiter order readiness before another canary handoff.";
  return blockers[0] ?? "Clear live unsigned canary blockers before requesting a signable order.";
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

function previewValue(value: string) {
  return value ? `${value.slice(0, 4)}...${value.slice(-4)}` : null;
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
