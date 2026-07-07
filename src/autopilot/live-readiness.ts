import { ed25519 } from "@noble/curves/ed25519";

import { resolveGuardedRpcUrl } from "../helius/rpc-url";

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export type LiveReadiness = {
  /** True when AUTOPILOT_WALLET_SECRET parses to a valid keypair. */
  wallet_provisioned: boolean;
  /** Public key only — safe to show in the UI; the secret never leaves env. */
  wallet_pubkey: string | null;
  rpc_url: string;
};

/** Minimal base58 decode (Bitcoin alphabet). Returns null on invalid input. */
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

/** Minimal base58 encode for public keys; avoids pulling web3.js into status routes. */
export function encodeBase58(input: Uint8Array): string {
  if (input.length === 0) return "";
  const digits: number[] = [0];
  for (const byte of input) {
    let carry = byte;
    for (let index = 0; index < digits.length; index += 1) {
      carry += digits[index] << 8;
      digits[index] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }

  let output = "";
  for (const byte of input) {
    if (byte !== 0) break;
    output += BASE58_ALPHABET[0];
  }
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    output += BASE58_ALPHABET[digits[index]];
  }
  return output;
}

/**
 * Parse a Solana secret from its two common encodings: a base58 string or a
 * solana-keygen JSON byte array. Returns null (never throws) on anything that
 * is not exactly a 64-byte ed25519 secret key whose public half matches the
 * private seed.
 */
export function secretBytesFromSecret(secret: string | undefined | null): Uint8Array | null {
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
    const derivedPublicKey = ed25519.getPublicKey(bytes.slice(0, 32));
    if (!bytesEqual(derivedPublicKey, bytes.slice(32, 64))) return null;
    return bytes;
  } catch {
    return null;
  }
}

export function liveReadiness(env: NodeJS.ProcessEnv = process.env): LiveReadiness {
  const secretBytes = secretBytesFromSecret(env.AUTOPILOT_WALLET_SECRET);
  const publicKey = secretBytes ? secretBytes.slice(32, 64) : null;
  return {
    wallet_provisioned: publicKey !== null,
    wallet_pubkey: publicKey ? encodeBase58(publicKey) : null,
    rpc_url: resolveGuardedRpcUrl(env),
  };
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left[index] ^ right[index];
  }
  return diff === 0;
}
