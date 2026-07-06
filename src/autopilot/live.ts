/**
 * Live-wallet provisioning (docs/roadmap/2026-07-03-autonomy-architecture.md,
 * D3/D5): the spare, capped Solana wallet the jupiter-live executor will sign
 * from. This slice only PARSES and REPORTS — the secret comes from the
 * AUTOPILOT_WALLET_SECRET env var (never the store, never committed), and the
 * only consumers are the go-live gate's wallet check and, next slice, the
 * live executor itself. Nothing here signs or sends.
 */

import { Keypair } from "@solana/web3.js";

import { guardedHeliusFetch, resolveGuardedRpcUrl } from "../helius/firewall";

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Minimal base58 decode (Bitcoin alphabet) — avoids a new dependency for the
 * one place a Solana secret key needs decoding. Returns null on any invalid
 * character rather than throwing. */
export function decodeBase58(input: string): Uint8Array | null {
  if (input.length === 0) return null;
  const bytes: number[] = [0];
  for (const char of input) {
    const value = BASE58_ALPHABET.indexOf(char);
    if (value === -1) return null;
    let carry = value;
    for (let index = 0; index < bytes.length; index += 1) {
      carry += bytes[index] * 58;
      bytes[index] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  // Leading '1's encode leading zero bytes.
  for (const char of input) {
    if (char !== "1") break;
    bytes.push(0);
  }
  return Uint8Array.from(bytes.reverse());
}

/**
 * Parse a Solana secret from its two common encodings: a base58 string or a
 * solana-keygen JSON byte array. Returns null (never throws) on anything that
 * is not exactly a 64-byte ed25519 secret key.
 */
export function keypairFromSecret(secret: string | undefined | null): Keypair | null {
  if (!secret) return null;
  const trimmed = secret.trim();
  if (trimmed.length === 0) return null;

  let bytes: Uint8Array | null = null;
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed) && parsed.every((value) => typeof value === "number")) {
        bytes = Uint8Array.from(parsed);
      }
    } catch {
      return null;
    }
  } else {
    bytes = decodeBase58(trimmed);
  }
  if (!bytes || bytes.length !== 64) return null;
  try {
    return Keypair.fromSecretKey(bytes);
  } catch {
    return null;
  }
}

export type LiveReadiness = {
  /** True when AUTOPILOT_WALLET_SECRET parses to a valid keypair. */
  wallet_provisioned: boolean;
  /** Public key only — safe to show in the UI; the secret never leaves env. */
  wallet_pubkey: string | null;
  rpc_url: string;
};

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

export function liveReadiness(env: NodeJS.ProcessEnv = process.env): LiveReadiness {
  const keypair = keypairFromSecret(env.AUTOPILOT_WALLET_SECRET);
  return {
    wallet_provisioned: keypair !== null,
    wallet_pubkey: keypair ? keypair.publicKey.toBase58() : null,
    // Firewall-resolved: falls back to the public RPC (zero credits) when
    // the configured URL is Helius but HELIUS_ENABLED is not true.
    rpc_url: resolveGuardedRpcUrl(env),
  };
}
