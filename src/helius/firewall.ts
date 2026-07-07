/// <reference types="node" />

/**
 * Helius Credit Firewall (docs/research/2026-07-04-helius-decision-memo.md §7).
 *
 * The 2026-07-04 exhaustion postmortem: 88.1% of the burned 1M credits were
 * Enhanced API calls and 9.4% DAS — the app was casually using Helius as a
 * wallet-analytics provider. Policy adopted: Helius is EXECUTION
 * infrastructure; expensive data APIs are manual, opt-in, budgeted.
 *
 * This module is the single choke point. Every Helius-bound request must flow
 * through `guardedHeliusFetch` (or a `Connection` built with
 * `guardedConnectionConfig`). It FAILS CLOSED:
 *   - `HELIUS_ENABLED` !== "true"      → every Helius call blocked
 *   - DAS methods                       → blocked unless HELIUS_ALLOW_DAS=true
 *   - Enhanced endpoints/methods        → blocked unless HELIUS_ALLOW_ENHANCED=true
 *   - unknown methods                   → blocked (no flag to allow blindly)
 *   - daily credit budget exceeded      → blocked
 * Non-Helius hosts pass through untouched (public RPC costs nothing).
 *
 * Every allowed AND blocked call is recorded in `.data/helius-firewall.json`
 * (day-scoped counters + a rolling log) so the daemon and the Next server
 * share one budget.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { PUBLIC_RPC_URL, isHeliusHost, resolveGuardedRpcUrl } from "./rpc-url";
export { PUBLIC_RPC_URL, isHeliusHost, resolveGuardedRpcUrl } from "./rpc-url";

export type HeliusCategory = "rpc" | "das" | "enhanced" | "unknown";

/** Standard, cheap RPC methods the live execution path is allowed to use
 * automatically (memo §6.2). Everything else is not "RPC" to the firewall. */
const RPC_ALLOWLIST = new Set([
  "getbalance",
  "gettokenaccountbalance",
  "gettokenaccountsbyowner",
  "getlatestblockhash",
  "sendrawtransaction",
  "sendtransaction",
  "getsignaturestatuses",
  "getsignaturesforaddress",
  "simulatetransaction",
  "gethealth",
  "getslot",
  "getversion",
  "getaccountinfo",
  "getrecentprioritizationfees",
  "gettokensupply",
  "gettransaction",
]);

const DAS_METHODS = new Set([
  "getasset",
  "getassetproof",
  "getassetsbyowner",
  "getassetsbygroup",
  "getassetsbycreator",
  "getassetsbyauthority",
  "searchassets",
]);

const ENHANCED_METHODS = new Set(["gettransactionsforaddress", "parsetransactions"]);

/** Estimated credits per call, per the memo's published costs. */
const CATEGORY_COST: Record<HeliusCategory, number> = { rpc: 1, das: 10, enhanced: 100, unknown: 100 };

/** Classify a call by URL path + JSON-RPC method name. */
export function classifyHeliusCall(url: string, method: string | null): HeliusCategory {
  try {
    const path = new URL(url).pathname.toLowerCase();
    if (path.startsWith("/v0/")) return "enhanced"; // /v0/addresses/…/transactions etc.
  } catch {
    return "unknown";
  }
  const name = (method ?? "").toLowerCase();
  if (name.length === 0) return "unknown";
  if (DAS_METHODS.has(name)) return "das";
  if (ENHANCED_METHODS.has(name)) return "enhanced";
  if (RPC_ALLOWLIST.has(name)) return "rpc";
  return "unknown";
}

export type FirewallEnv = Partial<
  Record<"HELIUS_ENABLED" | "HELIUS_ALLOW_DAS" | "HELIUS_ALLOW_ENHANCED" | "HELIUS_MAX_CREDITS_PER_DAY" | "HELIUS_LOG_CALLS", string>
>;

export type FirewallVerdict =
  | { allowed: true; category: HeliusCategory; cost: number }
  | { allowed: false; category: HeliusCategory; cost: number; reason: string };

/** Pure policy: should this Helius call happen? (memo §7.2, fail closed). */
export function evaluateHeliusCall(
  input: { url: string; method: string | null; spent_today: number },
  env: FirewallEnv = process.env as unknown as FirewallEnv,
): FirewallVerdict {
  const category = classifyHeliusCall(input.url, input.method);
  const cost = CATEGORY_COST[category];
  if (env.HELIUS_ENABLED !== "true") {
    return { allowed: false, category, cost, reason: "HELIUS_ENABLED is not true — Helius is disabled (credit firewall)" };
  }
  if (category === "unknown") {
    return { allowed: false, category, cost, reason: `unknown Helius method "${input.method ?? "?"}" — fail closed` };
  }
  if (category === "das" && env.HELIUS_ALLOW_DAS !== "true") {
    return { allowed: false, category, cost, reason: "DAS calls are blocked by default (HELIUS_ALLOW_DAS)" };
  }
  if (category === "enhanced" && env.HELIUS_ALLOW_ENHANCED !== "true") {
    return { allowed: false, category, cost, reason: "Enhanced API calls are blocked by default (HELIUS_ALLOW_ENHANCED)" };
  }
  const budget = Number(env.HELIUS_MAX_CREDITS_PER_DAY ?? 25_000);
  if (Number.isFinite(budget) && input.spent_today + cost > budget) {
    return { allowed: false, category, cost, reason: `daily Helius budget (${budget} credits) would be exceeded` };
  }
  return { allowed: true, category, cost };
}

// --- shared day-scoped ledger (daemon + Next server share one budget file) ----

type FirewallLedger = {
  day: string;
  spent_credits: number;
  calls: Record<HeliusCategory, number>;
  blocked: number;
  log: Array<{ ts: string; feature: string; category: HeliusCategory; cost: number; allowed: boolean; detail: string }>;
};

function ledgerPath(): string {
  return process.env.HELIUS_FIREWALL_LEDGER ?? join(/* turbopackIgnore: true */ process.cwd(), ".data", "helius-firewall.json");
}

function emptyLedger(day: string): FirewallLedger {
  return { day, spent_credits: 0, calls: { rpc: 0, das: 0, enhanced: 0, unknown: 0 }, blocked: 0, log: [] };
}

function readLedger(): FirewallLedger {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const parsed = JSON.parse(readFileSync(ledgerPath(), "utf8")) as FirewallLedger;
    if (parsed.day !== today) return emptyLedger(today);
    return parsed;
  } catch {
    return emptyLedger(today);
  }
}

function writeLedger(ledger: FirewallLedger): void {
  try {
    const path = ledgerPath();
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(path, JSON.stringify({ ...ledger, log: ledger.log.slice(-200) }, null, 2));
  } catch {
    // Logging must never break execution.
  }
}

export function firewallStatus(): { day: string; spent_credits: number; calls: FirewallLedger["calls"]; blocked: number } {
  const { day, spent_credits, calls, blocked } = readLedger();
  return { day, spent_credits, calls, blocked };
}

function record(feature: string, verdict: FirewallVerdict, detail: string): void {
  if (process.env.HELIUS_LOG_CALLS === "false") return;
  // Test runs never write the shared ledger unless a test points at its own file.
  if (process.env.NODE_ENV === "test" && !process.env.HELIUS_FIREWALL_LEDGER) return;
  const ledger = readLedger();
  if (verdict.allowed) {
    ledger.spent_credits += verdict.cost;
    ledger.calls[verdict.category] += 1;
  } else {
    ledger.blocked += 1;
  }
  ledger.log.push({
    ts: new Date().toISOString(),
    feature,
    category: verdict.category,
    cost: verdict.cost,
    allowed: verdict.allowed,
    detail: detail.slice(0, 160),
  });
  writeLedger(ledger);
}

export class HeliusBlockedError extends Error {
  constructor(reason: string) {
    super(`Helius call blocked: ${reason}`);
    this.name = "HeliusBlockedError";
  }
}

function methodFromBody(body: unknown): string | null {
  if (typeof body !== "string") return null;
  try {
    const parsed = JSON.parse(body) as { method?: unknown } | Array<{ method?: unknown }>;
    const first = Array.isArray(parsed) ? parsed[0] : parsed;
    return typeof first?.method === "string" ? first.method : null;
  } catch {
    return null;
  }
}

/**
 * The choke point. Non-Helius URLs pass straight through. Helius URLs are
 * policy-checked and recorded; blocked calls throw HeliusBlockedError so
 * callers degrade with an honest message instead of silently spending.
 */
export async function guardedHeliusFetch(
  url: string,
  init: RequestInit | undefined,
  meta: { feature: string; method?: string | null; fetchImpl?: (url: string, init?: RequestInit) => Promise<Response> },
): Promise<Response> {
  const fetchImpl = meta.fetchImpl ?? ((input: string, requestInit?: RequestInit) => fetch(input, requestInit));
  if (!isHeliusHost(url)) return fetchImpl(url, init);
  const method = meta.method ?? methodFromBody(init?.body ?? null);
  const verdict = evaluateHeliusCall({ url, method, spent_today: readLedger().spent_credits });
  record(meta.feature, verdict, verdict.allowed ? (method ?? new URL(url).pathname) : (verdict as { reason: string }).reason);
  if (!verdict.allowed) throw new HeliusBlockedError(verdict.reason);
  return fetchImpl(url, init);
}

/** Fetch impl for @solana/web3.js Connection so even library-internal calls
 * flow through the firewall's accounting. */
export function guardedConnectionFetch(feature: string) {
  return (input: string | URL | Request, init?: RequestInit): Promise<Response> =>
    guardedHeliusFetch(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url, init, {
      feature,
    });
}
