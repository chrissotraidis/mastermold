/**
 * Live-wallet provisioning (docs/roadmap/2026-07-03-autonomy-architecture.md,
 * D3/D5): the spare, capped Solana wallet the jupiter-live executor will sign
 * from. This slice only PARSES and REPORTS — the secret comes from the
 * AUTOPILOT_WALLET_SECRET env var (never the store, never committed), and the
 * only consumers are the go-live gate's wallet check and, next slice, the
 * live executor itself. Nothing here signs or sends.
 */

import { Keypair } from "@solana/web3.js";

import { guardedHeliusFetch } from "../helius/firewall";
import { liveReadiness, secretBytesFromSecret } from "./live-readiness";
export { decodeBase58, encodeBase58, liveReadiness, type LiveReadiness } from "./live-readiness";

/**
 * Parse a Solana secret from its two common encodings: a base58 string or a
 * solana-keygen JSON byte array. Returns null (never throws) on anything that
 * is not exactly a 64-byte ed25519 secret key.
 */
export function keypairFromSecret(secret: string | undefined | null): Keypair | null {
  const bytes = secretBytesFromSecret(secret);
  if (!bytes) return null;
  try {
    return Keypair.fromSecretKey(bytes);
  } catch {
    return null;
  }
}

const USDC_MINT_ADDR = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

/** Sum of the wallet's ui-amount balance for ONE mint. Null on any failure —
 * callers must treat unknown as "do not proceed", never as zero. */
export async function fetchTokenBalanceUi(mint: string, env: NodeJS.ProcessEnv = process.env): Promise<number | null> {
  const readiness = liveReadiness(env);
  if (!readiness.wallet_pubkey) return null;
  try {
    const response = await guardedHeliusFetch(readiness.rpc_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTokenAccountsByOwner",
        params: [readiness.wallet_pubkey, { mint }, { encoding: "jsonParsed" }],
      }),
    }, { feature: "autopilot-usdc-balance", method: "getTokenAccountsByOwner" });
    if (!response.ok) return null;
    const body = (await response.json()) as { result?: { value?: Array<{ account?: { data?: { parsed?: { info?: { tokenAmount?: { uiAmount?: number } } } } } }> } };
    const accounts = body.result?.value ?? [];
    let total = 0;
    for (const account of accounts) {
      const amount = account.account?.data?.parsed?.info?.tokenAmount?.uiAmount;
      if (typeof amount === "number" && Number.isFinite(amount)) total += amount;
    }
    return total;
  } catch {
    return null;
  }
}

/** Live cash leg: the wallet's USDC balance in USD (back-compat wrapper). */
export async function fetchUsdcBalanceUsd(env: NodeJS.ProcessEnv = process.env): Promise<number | null> {
  return fetchTokenBalanceUi(USDC_MINT_ADDR, env);
}
