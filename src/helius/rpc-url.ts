export const PUBLIC_RPC_URL = "https://api.mainnet-beta.solana.com";

export function isHeliusHost(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host.endsWith("helius-rpc.com") || host.endsWith("helius.xyz") || host.endsWith("helius.dev");
  } catch {
    return false;
  }
}

/**
 * Execution paths may use a Helius RPC only when the credit firewall is
 * explicitly enabled. Otherwise, standard RPC reads fall back to the public
 * Solana endpoint so status checks never spend Helius credits.
 */
export function resolveGuardedRpcUrl(
  env: Record<string, string | undefined> = process.env as unknown as Record<string, string | undefined>,
): string {
  const configured = env.SOLANA_RPC_URL ?? PUBLIC_RPC_URL;
  if (!isHeliusHost(configured)) return configured;
  return env.HELIUS_ENABLED === "true" ? configured : PUBLIC_RPC_URL;
}
