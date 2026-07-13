/**
 * Executor interface — the daemon is executor-agnostic
 * (docs/roadmap/2026-07-03-autonomy-architecture.md, D3).
 *
 * `paper` simulates fills at the intent's reference price with the modeled
 * fee. The `jupiter-live` adapter (quote → swap → signed send from a spare,
 * capped wallet) lands in a later slice behind explicit env provisioning; the
 * interface is fixed now so the daemon's write path never changes when it
 * does. Executors fill; they never write the store — ledger and position
 * writes stay with the caller so one code path owns persistence.
 */

import type { TradeIntent } from "./intent";

/** 30bps per side: fees + slippage estimate for MAJORS in the paper book. */
export const PAPER_FEE_RATE = 0.003;
/** 125bps per side for off-universe/memecoin tokens (2026-07-09 cost
 * research: real round trips on that class run 1.5–4% all-in — flat 30bp
 * would flatter every promoted V3 fill and poison the go-live evidence). */
export const MEMECOIN_PAPER_FEE_RATE = 0.0125;

export type ExecutionFill = {
  qty: number;
  price_usd: number;
  value_usd: number;
  fee_usd: number;
  fill_basis?: "quoted" | "flat_fallback";
  /** Live fills only: the confirmed Solana transaction signature. */
  signature?: string;
};

export type ExecutionResult = { ok: true; fill: ExecutionFill } | { ok: false; error: string };

export interface Executor {
  readonly kind: "paper" | "jupiter-live";
  execute(intent: TradeIntent): Promise<ExecutionResult>;
}

export type PaperExecutorOptions = {
  /** Per-mint fee tier; defaults to the flat majors rate. The daemon passes a
   * classifier so off-universe fills pay the honest memecoin rate. */
  feeRateForMint?: (mint: string) => number;
  /** A fresh executable quote. Null preserves the existing flat model. */
  fillFor?: (intent: TradeIntent) => { price_usd: number; fee_usd: number } | null;
};

/** Simulated fills at the reference price; the only executor that exists today. */
export function paperExecutor(options: PaperExecutorOptions = {}): Executor {
  const feeRateFor = options.feeRateForMint ?? (() => PAPER_FEE_RATE);
  return {
    kind: "paper",
    async execute(intent: TradeIntent): Promise<ExecutionResult> {
      if (intent.mode !== "paper") {
        return { ok: false, error: `paper executor refuses ${intent.mode} intents` };
      }
      const quotedFill = options.fillFor?.(intent) ?? null;
      const fillPrice = quotedFill?.price_usd ?? intent.price_usd;
      const fillBasis = quotedFill ? "quoted" : "flat_fallback";
      if (!Number.isFinite(fillPrice) || fillPrice <= 0 || (quotedFill && (!Number.isFinite(quotedFill.fee_usd) || quotedFill.fee_usd < 0))) {
        return { ok: false, error: "paper executor received an invalid modeled fill" };
      }
      const feeRate = feeRateFor(intent.mint);
      if (intent.action === "buy") {
        const qty = intent.notional_usd / fillPrice;
        return {
          ok: true,
          fill: {
            qty,
            price_usd: fillPrice,
            value_usd: intent.notional_usd,
            fee_usd: quotedFill?.fee_usd ?? intent.notional_usd * feeRate,
            fill_basis: fillBasis,
          },
        };
      }
      if (intent.qty === null || intent.qty <= 0) {
        return { ok: false, error: "sell intent has no quantity" };
      }
      const value = intent.qty * fillPrice;
      return {
        ok: true,
        fill: {
          qty: intent.qty,
          price_usd: fillPrice,
          value_usd: value,
          fee_usd: quotedFill?.fee_usd ?? value * feeRate,
          fill_basis: fillBasis,
        },
      };
    },
  };
}
