import { guardedHeliusFetch } from "../helius/firewall";
import { resolveGuardedRpcUrl } from "../helius/rpc-url";

export type MintMetaRow = {
  mint: string;
  symbol: string;
  decimals: number;
  resolved_at: string;
};

/** Immutable metadata for the nine hand-curated Tier A assets. */
export const STATIC_MINT_DECIMALS: Record<string, number> = {
  So11111111111111111111111111111111111111112: 9,
  JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: 6,
  DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: 5,
  EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm: 6,
  jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL: 9,
  "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs": 8,
  "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh": 8,
  "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R": 6,
  HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3: 6,
};

/** Static Tier A metadata wins; otherwise read the persisted on-chain cache. */
export function decimalsFor(mint: string, rows: MintMetaRow[] = []): number | null {
  const fixed = STATIC_MINT_DECIMALS[mint];
  if (fixed !== undefined) return fixed;
  const cached = rows.find((row) => row.mint === mint)?.decimals;
  return typeof cached === "number" && Number.isInteger(cached) && cached >= 0 && cached <= 18
    ? cached
    : null;
}

/** Pure parser for getAccountInfo base64 or parsed-json response shapes. SPL
 * Mint decimals are the u8 at byte offset 44 in the canonical layout. */
export function parseMintDecimals(body: unknown): number | null {
  if (!body || typeof body !== "object") return null;
  const value = ((body as { result?: { value?: unknown } }).result?.value ?? null) as
    | Record<string, unknown>
    | null;
  if (!value || typeof value !== "object") return null;
  const data = value.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const decimals = Number(
      (((data as { parsed?: { info?: { decimals?: unknown } } }).parsed ?? {}).info ?? {}).decimals,
    );
    if (Number.isInteger(decimals) && decimals >= 0 && decimals <= 18) return decimals;
  }
  if (!Array.isArray(data) || typeof data[0] !== "string") return null;
  try {
    const bytes = Buffer.from(data[0], "base64");
    if (bytes.length <= 44) return null;
    const decimals = bytes[44];
    return decimals <= 18 ? decimals : null;
  } catch {
    return null;
  }
}

/** Guarded, keyless-compatible on-chain resolution. Never throws. */
export async function fetchMintDecimals(
  mint: string,
  rpcUrl: string = resolveGuardedRpcUrl(),
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response> = fetch,
): Promise<number | null> {
  if (!mint) return null;
  try {
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: "mastermold-mint-meta",
      method: "getAccountInfo",
      params: [mint, { encoding: "base64", commitment: "confirmed" }],
    });
    const response = await guardedHeliusFetch(
      rpcUrl,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body,
        signal: AbortSignal.timeout(8_000),
      },
      { feature: "autopilot-mint-meta", method: "getAccountInfo", fetchImpl },
    );
    if (!response.ok) return null;
    return parseMintDecimals(await response.json());
  } catch {
    return null;
  }
}
