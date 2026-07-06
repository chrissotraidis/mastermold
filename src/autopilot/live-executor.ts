/**
 * Jupiter live executor (docs/roadmap/2026-07-03-autonomy-architecture.md, D3).
 *
 * The live cash leg is USDC — mirroring the paper book, where cash is USD and
 * positions are tokens: buys swap USDC→token, sells swap token→USDC. SOL is
 * only the fee reserve; `reserve_floor_sol` is checked against the live
 * balance before anything is signed, so discretionary trades can never spend
 * the wallet's fee budget.
 *
 * Pipeline per fill: Jupiter quote → swap-transaction build → local sign →
 * RPC. In DRY-RUN (the default, and the only mode the drill script uses) the
 * signed transaction goes to `simulateTransaction` and is NEVER broadcast; in
 * send mode it is broadcast and confirmed, and the confirmed signature lands
 * on the ledger row. Every guard failure returns a typed error — this module
 * never throws into the daemon loop.
 */

import { Connection, Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";

import { guardedConnectionFetch } from "../helius/firewall";
import type { Executor, ExecutionResult } from "./executor";
import type { TradeIntent } from "./intent";
import { keypairFromSecret, liveReadiness } from "./live";
import { MINT_DECIMALS } from "./rehearsal";

const QUOTE_URL = "https://lite-api.jup.ag/swap/v1/quote";
const SWAP_URL = "https://lite-api.jup.ag/swap/v1/swap";
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDC_DECIMALS = 6;
const FETCH_TIMEOUT_MS = 10_000;
export const LIVE_SLIPPAGE_BPS = 50;
/** Hard ceiling on quoted price impact; a route worse than this is refused. */
export const MAX_PRICE_IMPACT_PCT = 1.0;
/** Rough per-transaction fee headroom checked against the reserve floor. */
const EST_TX_FEE_SOL = 0.001;

export type SwapPlan = {
  input_mint: string;
  output_mint: string;
  in_amount_raw: number;
  out_amount_raw: number;
  /** Effective USD per token implied by the quote (USDC leg / token leg). */
  effective_price_usd: number;
  price_impact_pct: number | null;
  route_labels: string[];
};

/** Pure: turn a Jupiter quote body into a checked SwapPlan (or a reason). */
export function planFromQuote(
  body: unknown,
  args: { side: "buy" | "sell"; token_mint: string; token_decimals: number },
): { ok: true; plan: SwapPlan; quote: Record<string, unknown> } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "quote body was not an object" };
  const quote = body as Record<string, unknown>;
  const inAmount = Number(quote.inAmount);
  const outAmount = Number(quote.outAmount);
  if (!Number.isFinite(inAmount) || !Number.isFinite(outAmount) || inAmount <= 0 || outAmount <= 0) {
    return { ok: false, error: "no usable route in the quote response" };
  }
  const usdcRaw = args.side === "buy" ? inAmount : outAmount;
  const tokenRaw = args.side === "buy" ? outAmount : inAmount;
  const usdc = usdcRaw / 10 ** USDC_DECIMALS;
  const tokens = tokenRaw / 10 ** args.token_decimals;
  if (tokens <= 0) return { ok: false, error: "quoted token amount was zero" };

  const impactRaw = Number(quote.priceImpactPct);
  const impactPct = Number.isFinite(impactRaw) ? impactRaw * 100 : null;
  if (impactPct !== null && impactPct > MAX_PRICE_IMPACT_PCT) {
    return { ok: false, error: `quoted price impact ${impactPct.toFixed(2)}% exceeds the ${MAX_PRICE_IMPACT_PCT}% ceiling` };
  }
  const routePlan = Array.isArray(quote.routePlan) ? quote.routePlan : [];
  const labels = routePlan
    .map((leg) => (leg && typeof leg === "object" ? (leg as { swapInfo?: { label?: unknown } }).swapInfo?.label : null))
    .filter((label): label is string => typeof label === "string")
    .slice(0, 4);

  return {
    ok: true,
    quote,
    plan: {
      input_mint: args.side === "buy" ? USDC_MINT : args.token_mint,
      output_mint: args.side === "buy" ? args.token_mint : USDC_MINT,
      in_amount_raw: inAmount,
      out_amount_raw: outAmount,
      effective_price_usd: usdc / tokens,
      price_impact_pct: impactPct,
      route_labels: labels,
    },
  };
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`${new URL(url).pathname} ${response.status}`);
  return response.json();
}

/**
 * Robust confirmation: poll getSignatureStatuses instead of
 * confirmTransaction with a post-send blockhash (whose expiry window belongs
 * to a DIFFERENT blockhash than the transaction's own — a mismatch that can
 * report landed transactions as failed). Polls every 2s up to timeoutMs.
 */
export async function confirmSignature(
  connection: Connection,
  signature: string,
  timeoutMs = 60_000,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const startedAt = Date.now();
  for (;;) {
    const statuses = await connection.getSignatureStatuses([signature]);
    const status = statuses.value[0];
    if (status) {
      if (status.err !== null) return { ok: false, error: `transaction failed on chain: ${JSON.stringify(status.err)}` };
      if (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized") return { ok: true };
    }
    if (Date.now() - startedAt > timeoutMs) {
      return { ok: false, error: `confirmation timed out after ${Math.round(timeoutMs / 1000)}s (signature ${signature})` };
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
}

export type BuiltSwap = {
  plan: SwapPlan;
  /** Signed and ready; NOT broadcast. */
  transaction: VersionedTransaction;
};

/**
 * Quote and build a signed swap for one intent. Network + signing, no
 * broadcasting — the caller decides simulate vs send. Returns typed errors
 * instead of throwing.
 */
export async function buildSignedSwap(
  intent: Pick<TradeIntent, "action" | "mint" | "symbol" | "notional_usd" | "qty">,
  keypair: Keypair,
): Promise<{ ok: true; built: BuiltSwap } | { ok: false; error: string }> {
  const decimals = MINT_DECIMALS[intent.mint];
  if (decimals === undefined) return { ok: false, error: `no known decimals for mint ${intent.mint}` };

  const amountRaw =
    intent.action === "buy"
      ? Math.round(intent.notional_usd * 10 ** USDC_DECIMALS)
      : Math.round((intent.qty ?? 0) * 10 ** decimals);
  if (!Number.isFinite(amountRaw) || amountRaw <= 0) return { ok: false, error: "swap amount resolved to zero" };

  const [inputMint, outputMint] =
    intent.action === "buy" ? [USDC_MINT, intent.mint] : [intent.mint, USDC_MINT];

  try {
    const quoteBody = await fetchJson(
      `${QUOTE_URL}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountRaw}&slippageBps=${LIVE_SLIPPAGE_BPS}&swapMode=ExactIn`,
    );
    const planned = planFromQuote(quoteBody, { side: intent.action, token_mint: intent.mint, token_decimals: decimals });
    if (!planned.ok) return planned;

    const swapBody = (await fetchJson(SWAP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        quoteResponse: planned.quote,
        userPublicKey: keypair.publicKey.toBase58(),
        dynamicComputeUnitLimit: true,
      }),
    })) as { swapTransaction?: unknown };
    if (typeof swapBody.swapTransaction !== "string") {
      return { ok: false, error: "swap build returned no transaction" };
    }

    const transaction = VersionedTransaction.deserialize(Buffer.from(swapBody.swapTransaction, "base64"));
    transaction.sign([keypair]);
    return { ok: true, built: { plan: planned.plan, transaction } };
  } catch (error) {
    return { ok: false, error: `swap build failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export type LiveExecutorOptions = {
  /** True (default): simulate the signed transaction, never broadcast. */
  dry_run?: boolean;
  reserve_floor_sol: number;
  env?: NodeJS.ProcessEnv;
};

/**
 * The jupiter-live Executor. Refuses to fill anything unless the intent is
 * live-mode, the wallet parses from env, and the SOL balance clears the
 * reserve floor plus fee headroom. Dry-run results come back as errors on
 * purpose — a simulation is not a fill, and nothing may reach the ledger.
 */
export function jupiterLiveExecutor(options: LiveExecutorOptions): Executor {
  const dryRun = options.dry_run ?? true;
  return {
    kind: "jupiter-live",
    async execute(intent: TradeIntent): Promise<ExecutionResult> {
      if (intent.mode !== "live") return { ok: false, error: `jupiter-live executor refuses ${intent.mode} intents` };
      const env = options.env ?? process.env;
      const keypair = keypairFromSecret(env.AUTOPILOT_WALLET_SECRET);
      if (!keypair) return { ok: false, error: "no live wallet is provisioned (AUTOPILOT_WALLET_SECRET)" };

      const connection = new Connection(liveReadiness(env).rpc_url, {
        commitment: "confirmed",
        fetch: guardedConnectionFetch("autopilot-live-executor") as typeof fetch,
      });
      try {
        const lamports = await connection.getBalance(new PublicKey(keypair.publicKey.toBase58()));
        const balanceSol = lamports / 1e9;
        if (balanceSol < options.reserve_floor_sol + EST_TX_FEE_SOL) {
          return {
            ok: false,
            error: `SOL balance ${balanceSol.toFixed(4)} is at the ${options.reserve_floor_sol} reserve floor — refusing to spend fee budget`,
          };
        }
      } catch (error) {
        return { ok: false, error: `balance check failed: ${error instanceof Error ? error.message : String(error)}` };
      }

      const buildResult = await buildSignedSwap(intent, keypair);
      if (!buildResult.ok) return buildResult;
      const { plan, transaction } = buildResult.built;

      if (dryRun) {
        try {
          const simulation = await connection.simulateTransaction(transaction, { commitment: "confirmed" });
          const err = simulation.value.err;
          return {
            ok: false,
            error:
              err === null
                ? `DRY RUN ok (not sent): ${intent.action} ${intent.symbol} at ~$${plan.effective_price_usd.toFixed(4)} via ${plan.route_labels[0] ?? "route"}`
                : `DRY RUN simulation failed: ${JSON.stringify(err)}`,
          };
        } catch (error) {
          return { ok: false, error: `DRY RUN simulation errored: ${error instanceof Error ? error.message : String(error)}` };
        }
      }

      try {
        // Simulate first even in send mode (memo §9 Phase 2): a transaction
        // that fails simulation must never be broadcast.
        const preflight = await connection.simulateTransaction(transaction, { commitment: "confirmed" });
        if (preflight.value.err !== null) {
          return { ok: false, error: `pre-send simulation failed: ${JSON.stringify(preflight.value.err)}` };
        }
        const signature = await connection.sendRawTransaction(transaction.serialize(), { maxRetries: 3 });
        const confirmed = await confirmSignature(connection, signature);
        if (!confirmed.ok) {
          return { ok: false, error: `${confirmed.error}` };
        }
        const decimals = MINT_DECIMALS[intent.mint];
        const tokenRaw = intent.action === "buy" ? plan.out_amount_raw : plan.in_amount_raw;
        const usdcRaw = intent.action === "buy" ? plan.in_amount_raw : plan.out_amount_raw;
        const qty = tokenRaw / 10 ** decimals;
        const value = usdcRaw / 10 ** USDC_DECIMALS;
        return {
          ok: true,
          fill: {
            qty,
            price_usd: plan.effective_price_usd,
            value_usd: value,
            // Route costs are already inside the quoted amounts; the network
            // fee is paid in SOL from the reserve, not from USDC cash.
            fee_usd: 0,
            signature,
          },
        };
      } catch (error) {
        return { ok: false, error: `send failed: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  };
}
