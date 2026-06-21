"use client";

import { useEffect, useState } from "react";
import { ArrowRight, RefreshCw, ShieldCheck, Wallet, Zap } from "lucide-react";
import Link from "next/link";
import type { Web3FirstCanaryDrillReceipt } from "@/src/db/web3-first-canary-drill";
import type { Web3LiveTradeCanaryActionReceipt, Web3LiveTradeCanaryReceipt } from "@/src/db/web3-live-trade-canary";
import type { Web3LiveUnsignedOrderHandoffReceipt, Web3LiveUnsignedOrderPreflightReceipt } from "@/src/db/web3-live-unsigned-order-handoff";
import type { Web3WalletOwnershipChallengeReceipt, Web3WalletOwnershipReceipt } from "@/src/db/web3-wallet-ownership";
import type { TradingAccountMode, TradingMarketSource, TradingScenario, Web3TradingState } from "@/src/db/web3-trading";

type BrowserSolanaProvider = {
  isPhantom?: boolean;
  isSolflare?: boolean;
  isBackpack?: boolean;
  isConnected?: boolean;
  publicKey?: { toString: () => string };
  connect?: (options?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey?: { toString: () => string } } | void>;
  signMessage?: (message: Uint8Array, display?: "utf8" | "hex") => Promise<Uint8Array | { signature: Uint8Array }>;
  signTransaction?: (transaction: unknown) => Promise<unknown>;
};

type Web3LiveCanaryConsoleProps = {
  receipt: Web3LiveTradeCanaryReceipt;
  firstCanaryDrill: Web3FirstCanaryDrillReceipt;
  initialWalletOwnershipReceipt: Web3WalletOwnershipReceipt | null;
  source: TradingMarketSource;
  account: TradingAccountMode;
  scenario: TradingScenario;
  cycles: number;
  maxSlippageBps: number;
  defaultWalletPublicKey: string | null;
};

const AUTO_PROOF_INTERVAL_SECONDS = 12;
const AUTO_PROOF_MAX_ATTEMPTS = 12;
const AUTO_PROOF_TERMINAL_STATUSES: Web3LiveTradeCanaryReceipt["post_signing_evidence_status"][] = [
  "settlement-accounted",
  "review-required",
];

type CanaryLaunchStep = {
  id: "preflight" | "wallet-signature" | "signed-relay" | "confirmation-accounting";
  label: string;
  status: "pass" | "watch" | "fail";
  detail: string;
};

export function Web3LiveCanaryConsole({
  receipt,
  firstCanaryDrill,
  initialWalletOwnershipReceipt,
  source,
  account,
  scenario,
  cycles,
  maxSlippageBps,
  defaultWalletPublicKey,
}: Web3LiveCanaryConsoleProps) {
  const [canaryReceipt, setCanaryReceipt] = useState(receipt);
  const [firstCanaryDrillReceipt, setFirstCanaryDrillReceipt] = useState(firstCanaryDrill);
  const [message, setMessage] = useState(receipt.next_action);
  const [busy, setBusy] = useState(false);
  const [ownershipBusy, setOwnershipBusy] = useState(false);
  const [preflightBusy, setPreflightBusy] = useState(false);
  const [drillBusy, setDrillBusy] = useState(false);
  const [proofBusy, setProofBusy] = useState<"refresh" | "watchdog" | null>(null);
  const [autoProofMonitorEnabled, setAutoProofMonitorEnabled] = useState(false);
  const [autoProofAttempt, setAutoProofAttempt] = useState(0);
  const [autoProofLastCheckedAt, setAutoProofLastCheckedAt] = useState<string | null>(null);
  const [preflightReceipt, setPreflightReceipt] = useState<Web3LiveUnsignedOrderPreflightReceipt | null>(null);
  const [unsignedReceipt, setUnsignedReceipt] = useState<Web3LiveUnsignedOrderHandoffReceipt | null>(null);
  const [actionReceipt, setActionReceipt] = useState<Web3LiveTradeCanaryActionReceipt | null>(null);
  const [ownershipChallengeReceipt, setOwnershipChallengeReceipt] = useState<Web3WalletOwnershipChallengeReceipt | null>(null);
  const [ownershipReceipt, setOwnershipReceipt] = useState<Web3WalletOwnershipReceipt | null>(initialWalletOwnershipReceipt);
  const [ownershipCheckBusy, setOwnershipCheckBusy] = useState(false);
  const [walletPreview, setWalletPreview] = useState(previewValue(defaultWalletPublicKey));

  const params = new URLSearchParams({
    scenario,
    source: "live-dex",
    account: "persistent",
    cycles: String(cycles),
  });
  const currentParams = new URLSearchParams({
    scenario,
    source,
    account,
    cycles: String(cycles),
  });
  const canaryHref = `/api/web3-live-trade-canary?${currentParams.toString()}`;
  const drillHref = `/api/web3-first-canary-drill?${currentParams.toString()}`;
  const unsignedHref = `/api/web3-live-unsigned-order-handoff?${params.toString()}`;
  const liveTradingHref = `/trading?source=live-dex${account !== "persistent" ? "&account=persistent" : ""}`;
  const latestStatus = actionReceipt?.status ?? unsignedReceipt?.status ?? preflightReceipt?.status ?? canaryReceipt.status;
  const actualTradeTested = actionReceipt?.actual_live_trade_tested ?? canaryReceipt.actual_live_trade_tested;
  const sourceReady = source === "live-dex" && account === "persistent";
  const autoProofTerminal = AUTO_PROOF_TERMINAL_STATUSES.includes(canaryReceipt.post_signing_evidence_status);
  const autoProofExhausted = autoProofAttempt >= AUTO_PROOF_MAX_ATTEMPTS;
  const autoProofStatus = autoProofTerminal
    ? canaryReceipt.post_signing_evidence_status.replaceAll("-", " ")
    : autoProofMonitorEnabled
      ? `${autoProofAttempt}/${AUTO_PROOF_MAX_ATTEMPTS} checks`
      : "off";
  const canaryLaunchSteps = buildCanaryLaunchSteps({
    receipt: canaryReceipt,
    preflightReceipt,
    unsignedReceipt,
    actionReceipt,
  });

  useEffect(() => {
    if (!autoProofMonitorEnabled || !sourceReady) return;
    if (autoProofTerminal) {
      setAutoProofMonitorEnabled(false);
      return;
    }
    if (autoProofExhausted) {
      setAutoProofMonitorEnabled(false);
      setMessage("Auto proof watch reached its bounded check limit. Review the current proof chain before trying again.");
      return;
    }
    if (busy || proofBusy !== null) return;
    const timer = window.setTimeout(() => {
      void runPostSigningProofCheck("auto-monitor");
    }, AUTO_PROOF_INTERVAL_SECONDS * 1_000);
    return () => window.clearTimeout(timer);
  }, [
    autoProofAttempt,
    autoProofExhausted,
    autoProofMonitorEnabled,
    autoProofTerminal,
    busy,
    canaryReceipt.post_signing_evidence_status,
    proofBusy,
    sourceReady,
  ]);

  async function refreshCanaryReceipt(mode: "manual" | "auto" = "manual") {
    setProofBusy("refresh");
    try {
      const response = await fetch(canaryHref);
      const payload = await response.json().catch(() => null) as Web3LiveTradeCanaryReceipt | { error: string } | null;
      if (!response.ok || !payload || "error" in payload) {
        throw new Error(payload && "error" in payload ? payload.error : "Live canary receipt refresh failed.");
      }
      setCanaryReceipt(payload);
      if (mode === "manual") setMessage(payload.post_signing_next_action);
      return payload;
    } finally {
      setProofBusy(null);
    }
  }

  async function refreshFirstCanaryDrill(mode: "manual" | "auto" = "manual") {
    setDrillBusy(true);
    try {
      const response = await fetch(drillHref);
      const payload = await response.json().catch(() => null) as Web3FirstCanaryDrillReceipt | { error: string } | null;
      if (!response.ok || !payload || "error" in payload) {
        throw new Error(payload && "error" in payload ? payload.error : "First canary drill refresh failed.");
      }
      setFirstCanaryDrillReceipt(payload);
      if (mode === "manual") setMessage(payload.next_action);
      return payload;
    } finally {
      setDrillBusy(false);
    }
  }

  async function refreshCanaryConsoleReceipts(mode: "manual" | "auto" = "manual") {
    const refreshed = await refreshCanaryReceipt(mode);
    await refreshFirstCanaryDrill("auto").catch(() => null);
    return refreshed;
  }

  async function runPostSigningProofCheck(mode: "manual" | "auto" | "auto-monitor" = "manual") {
    if (!sourceReady) {
      setMessage("Open the live DEX canary view before checking signed-transaction proof.");
      return;
    }
    if (mode === "auto-monitor") {
      setAutoProofAttempt((attempt) => Math.min(AUTO_PROOF_MAX_ATTEMPTS, attempt + 1));
      setAutoProofLastCheckedAt(new Date().toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      }));
    }
    setProofBusy("watchdog");
    if (mode === "manual") {
      setMessage("Checking confirmation, settlement, and local accounting evidence for the latest signed canary...");
    }
    try {
      const response = await fetch("/api/web3-trading", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scenario,
          cycles,
          source: "live-dex",
          account: "persistent",
          advance: false,
          settlement_watchdog: {
            action: "run",
            apply_mirror: true,
            commitment: "confirmed",
            search_transaction_history: true,
          },
        }),
      });
      const payload = await response.json().catch(() => null) as Web3TradingState | { error: string } | null;
      if (!response.ok || !payload || "error" in payload) {
        throw new Error(payload && "error" in payload ? payload.error : "Post-signing proof check failed.");
      }
      const summary = payload.autonomous_settlement_watchdog?.summary ??
        payload.signature_confirmation_poll?.summary ??
        "Post-signing proof check completed.";
      setMessage(summary);
      const refreshed = await refreshCanaryConsoleReceipts("auto");
      if (refreshed.post_signing_evidence_status === "settlement-accounted") {
        setAutoProofMonitorEnabled(false);
        setMessage("Live canary proof chain is accounted locally. Review the mirrored fill before another canary.");
      } else if (refreshed.post_signing_evidence_status === "review-required") {
        setAutoProofMonitorEnabled(false);
        setMessage(refreshed.post_signing_next_action);
      } else {
        setMessage(refreshed.post_signing_next_action);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Post-signing proof check failed.");
    } finally {
      setProofBusy(null);
    }
  }

  function startAutoProofMonitor() {
    if (!sourceReady) {
      setMessage("Open the live DEX canary view before starting auto proof watch.");
      return;
    }
    setAutoProofAttempt(0);
    setAutoProofLastCheckedAt(null);
    setAutoProofMonitorEnabled(true);
    setMessage(`Auto proof watch started. Mastermind will check the latest signed canary every ${AUTO_PROOF_INTERVAL_SECONDS} seconds until the bounded limit or a terminal proof state.`);
    void runPostSigningProofCheck("auto-monitor");
  }

  function stopAutoProofMonitor() {
    setAutoProofMonitorEnabled(false);
    setMessage("Auto proof watch stopped. The latest proof chain stays visible for manual review.");
  }

  async function runCanaryPreflight() {
    setPreflightBusy(true);
    setMessage("Checking live canary readiness before any wallet prompt or transaction handoff...");
    try {
      if (!sourceReady) {
        throw new Error("Open the live DEX canary view before running canary preflight.");
      }
      setWalletPreview(previewValue(defaultWalletPublicKey));
      const preflightParams = new URLSearchParams(params);
      preflightParams.set("operator_ack", "true");
      preflightParams.set("canary_ack", "I_UNDERSTAND_THIS_UNSIGNED_ORDER_CAN_MOVE_REAL_FUNDS_IF_SIGNED");
      preflightParams.set("amount_lamports", "100000");
      preflightParams.set("max_slippage_bps", String(Math.max(1, Math.min(100, Math.trunc(maxSlippageBps || 50)))));
      const response = await fetch(`/api/web3-live-unsigned-order-handoff?${preflightParams.toString()}`);
      const payload = await response.json().catch(() => null) as Web3LiveUnsignedOrderPreflightReceipt | { error: string } | null;
      if (!response.ok || !payload || "error" in payload) {
        throw new Error(payload && "error" in payload ? payload.error : "Live canary preflight failed.");
      }
      setPreflightReceipt(payload);
      setMessage(payload.next_action);
      await refreshFirstCanaryDrill("auto").catch(() => null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Live canary preflight failed.");
    } finally {
      setPreflightBusy(false);
    }
  }

  async function checkWalletOwnershipChallenge() {
    setOwnershipCheckBusy(true);
    setMessage("Checking the text-only wallet ownership challenge without asking for a signature...");
    try {
      if (!sourceReady) {
        throw new Error("Open the live DEX canary view before checking wallet ownership proof.");
      }
      const trustedPublicKey = await getTrustedBrowserWalletPublicKey();
      const savedPublicKey = defaultWalletPublicKey && isLikelySolanaPublicKey(defaultWalletPublicKey)
        ? defaultWalletPublicKey
        : null;
      if (trustedPublicKey && savedPublicKey && trustedPublicKey !== savedPublicKey) {
        throw new Error("Connected browser wallet does not match the saved dedicated trading wallet. Switch wallets or update the public wallet scope first.");
      }
      const wallet = trustedPublicKey && isLikelySolanaPublicKey(trustedPublicKey) ? trustedPublicKey : savedPublicKey;
      if (!wallet || !isLikelySolanaPublicKey(wallet)) {
        throw new Error("Connect or save a valid public Solana wallet before checking the ownership challenge.");
      }
      setWalletPreview(previewValue(wallet));
      const payload = await requestWalletOwnershipChallengeReceipt(wallet);
      setOwnershipChallengeReceipt(payload);
      setMessage(payload.next_action);
      await refreshFirstCanaryDrill("auto").catch(() => null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Wallet ownership challenge check failed.");
    } finally {
      setOwnershipCheckBusy(false);
    }
  }

  async function proveWalletOwnership() {
    setOwnershipBusy(true);
    setMessage("Requesting a text-only wallet ownership signature. This is not a transaction and cannot move funds...");
    try {
      const provider = getBrowserSolanaProvider();
      if (!provider || typeof provider.signMessage !== "function") {
        throw new Error("No browser wallet with message signing is available on this browser.");
      }
      let publicKey = provider.publicKey?.toString() ?? null;
      if ((!publicKey || !isLikelySolanaPublicKey(publicKey)) && typeof provider.connect === "function") {
        const result = await provider.connect();
        publicKey = result?.publicKey?.toString() ?? provider.publicKey?.toString() ?? null;
      }
      if (!publicKey || !isLikelySolanaPublicKey(publicKey)) {
        throw new Error("Connect a valid public Solana wallet before proving ownership.");
      }
      if (defaultWalletPublicKey && isLikelySolanaPublicKey(defaultWalletPublicKey) && publicKey !== defaultWalletPublicKey) {
        throw new Error("Connected browser wallet does not match the saved dedicated trading wallet. Switch wallets or update the public wallet scope first.");
      }
      setWalletPreview(previewValue(publicKey));
      const challengeReceipt = await requestWalletOwnershipChallengeReceipt(publicKey);
      setOwnershipChallengeReceipt(challengeReceipt);
      const challenge = challengeReceipt.message;
      if (!challenge) {
        throw new Error(challengeReceipt.next_action);
      }
      const signed = await provider.signMessage(new TextEncoder().encode(challenge), "utf8");
      const signatureBytes = signed instanceof Uint8Array ? signed : signed.signature;
      if (!(signatureBytes instanceof Uint8Array)) {
        throw new Error("Wallet did not return a valid message signature.");
      }
      const response = await fetch("/api/web3-wallet-ownership", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          wallet_public_key: publicKey,
          message: challenge,
          signature_base64: bytesToBase64(signatureBytes),
          provider: browserWalletProviderName(provider),
        }),
      });
      const payload = await response.json().catch(() => null) as Web3WalletOwnershipReceipt | { error: string } | null;
      if (!response.ok || !payload || "error" in payload) {
        throw new Error(payload && "error" in payload ? payload.error : "Wallet ownership proof failed.");
      }
      setOwnershipReceipt(payload);
      setMessage(payload.summary);
      await refreshCanaryConsoleReceipts("auto");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Wallet ownership proof failed.");
    } finally {
      setOwnershipBusy(false);
    }
  }

  async function signTinyCanary() {
    setBusy(true);
    setMessage("Preparing the tiny SOL-to-USDC canary handoff for browser-wallet signing...");
    try {
      const provider = getBrowserSolanaProvider();
      if (!provider || typeof provider.signTransaction !== "function") {
        throw new Error("No browser wallet with transaction signing is available on this browser.");
      }
      let publicKey = provider.publicKey?.toString() ?? null;
      if ((!publicKey || !isLikelySolanaPublicKey(publicKey)) && typeof provider.connect === "function") {
        const result = await provider.connect();
        publicKey = result?.publicKey?.toString() ?? provider.publicKey?.toString() ?? null;
      }
      if (!publicKey || !isLikelySolanaPublicKey(publicKey)) {
        throw new Error("Connect a valid public Solana wallet before requesting the tiny live canary.");
      }
      setWalletPreview(previewValue(publicKey));

      const unsignedResponse = await fetch(unsignedHref, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operator_ack: true,
          canary_ack: "I_UNDERSTAND_THIS_UNSIGNED_ORDER_CAN_MOVE_REAL_FUNDS_IF_SIGNED",
          return_unsigned_transaction_ack: true,
          wallet_public_key: publicKey,
          amount_lamports: 100_000,
          max_slippage_bps: Math.max(1, Math.min(100, Math.trunc(maxSlippageBps || 50))),
        }),
      });
      const unsignedPayload = await unsignedResponse.json().catch(() => null) as Web3LiveUnsignedOrderHandoffReceipt | { error: string } | null;
      if (!unsignedResponse.ok || !unsignedPayload || "error" in unsignedPayload) {
        throw new Error(unsignedPayload && "error" in unsignedPayload ? unsignedPayload.error : "Live unsigned order handoff failed.");
      }
      setUnsignedReceipt(unsignedPayload);
      if (unsignedPayload.status !== "order-ready" || !unsignedPayload.unsigned_transaction || !unsignedPayload.request_id) {
        throw new Error(unsignedPayload.next_action);
      }

      setMessage("Wallet prompt opening. Confirm the tiny canary only if the wallet preview and amount look correct.");
      const { VersionedTransaction } = await import("@solana/web3.js");
      const transaction = VersionedTransaction.deserialize(base64ToBytes(unsignedPayload.unsigned_transaction));
      const signedTransaction = await provider.signTransaction(transaction);
      const serialized = serializeSignedWalletTransaction(signedTransaction);
      if (!serialized) throw new Error("Wallet did not return a serializable signed transaction.");

      const relayResponse = await fetch(`/api/web3-live-trade-canary?${params.toString()}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operator_ack: true,
          canary_ack: "I_UNDERSTAND_THIS_CAN_MOVE_REAL_FUNDS",
          signed_transaction: bytesToBase64(serialized),
          request_id: unsignedPayload.request_id,
          route: "jupiter-swap-v2",
        }),
      });
      const relayPayload = await relayResponse.json().catch(() => null) as Web3LiveTradeCanaryActionReceipt | { error: string } | null;
      if (!relayResponse.ok || !relayPayload || "error" in relayPayload) {
        throw new Error(relayPayload && "error" in relayPayload ? relayPayload.error : "Live canary relay failed.");
      }
      setActionReceipt(relayPayload);
      setMessage(relayPayload.next_action);
      if (relayPayload.actual_live_trade_tested) {
        setAutoProofAttempt(0);
        setAutoProofLastCheckedAt(null);
        setAutoProofMonitorEnabled(true);
        await runPostSigningProofCheck("auto-monitor");
      } else {
        await refreshCanaryConsoleReceipts("auto");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Tiny canary signing failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="web3-live-canary-console-title"
      className="rounded-md border border-critical/30 bg-critical/[0.035] p-4 sm:p-5"
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(20rem,0.95fr)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-critical/30 bg-critical/10 text-critical">
                <Zap aria-hidden="true" className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-critical">Live money canary</p>
                <h2 id="web3-live-canary-console-title" className="mt-1 font-display text-xl font-semibold text-on-surface">
                  {actualTradeTested ? "Tiny live trade evidence recorded" : "No real trade tested yet"}
                </h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-on-surface-variant">{message}</p>
              </div>
            </div>
            <span className={canaryStatusClassName(latestStatus)}>
              {latestStatus.replaceAll("-", " ")}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <CanaryMetric label="Actual trade" value={actualTradeTested ? "yes" : "no"} tone={actualTradeTested ? "engine" : "critical"} />
            <CanaryMetric label="Browser sign" value={canaryReceipt.browser_wallet_signature_flow.replaceAll("-", " ")} tone="caution" />
            <CanaryMetric label="Submit path" value={canaryReceipt.transaction_submission_permission.replaceAll("-", " ")} tone={canaryReceipt.can_submit_from_app_now ? "caution" : "neutral"} />
            <CanaryMetric label="Wallet" value={walletPreview ?? "not connected"} tone={walletPreview ? "caution" : "neutral"} />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {sourceReady ? (
              <>
                <button
                  type="button"
                  onClick={() => void runCanaryPreflight()}
                  disabled={busy || ownershipBusy || ownershipCheckBusy || preflightBusy}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-caution/40 bg-caution/10 px-3 py-2 text-sm font-semibold text-caution transition hover:bg-caution/15 disabled:cursor-not-allowed disabled:border-outline/20 disabled:bg-surface-dim/45 disabled:text-outline"
                >
                  <ShieldCheck aria-hidden="true" className={preflightBusy ? "size-4 animate-pulse" : "size-4"} />
                  {preflightBusy ? "Checking canary" : "Canary preflight"}
                </button>
                <button
                  type="button"
                  onClick={() => void proveWalletOwnership()}
                  disabled={busy || ownershipBusy || ownershipCheckBusy || preflightBusy}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-engine/35 bg-engine/10 px-3 py-2 text-sm font-semibold text-engine transition hover:bg-engine/15 disabled:cursor-not-allowed disabled:border-outline/20 disabled:bg-surface-dim/45 disabled:text-outline"
                >
                  <ShieldCheck aria-hidden="true" className={ownershipBusy ? "size-4 animate-pulse" : "size-4"} />
                  {ownershipBusy ? "Proving wallet" : "Prove wallet"}
                </button>
                <button
                  type="button"
                  onClick={() => void checkWalletOwnershipChallenge()}
                  disabled={busy || ownershipBusy || ownershipCheckBusy || preflightBusy}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-outline/25 bg-surface-dim/55 px-3 py-2 text-sm font-semibold text-on-surface-variant transition hover:border-engine/35 hover:text-engine disabled:cursor-not-allowed disabled:border-outline/20 disabled:bg-surface-dim/45 disabled:text-outline"
                >
                  <ShieldCheck aria-hidden="true" className={ownershipCheckBusy ? "size-4 animate-pulse" : "size-4"} />
                  {ownershipCheckBusy ? "Checking wallet" : "Check wallet"}
                </button>
                <button
                  type="button"
                  onClick={() => void signTinyCanary()}
                  disabled={busy || ownershipBusy || ownershipCheckBusy || preflightBusy}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-critical/45 bg-critical/10 px-3 py-2 text-sm font-semibold text-critical transition hover:bg-critical/15 disabled:cursor-not-allowed disabled:border-outline/20 disabled:bg-surface-dim/45 disabled:text-outline"
                >
                  <Wallet aria-hidden="true" className={busy ? "size-4 animate-pulse" : "size-4"} />
                  {busy ? "Signing canary" : "Sign tiny canary"}
                </button>
              </>
            ) : (
              <Link
                href={liveTradingHref}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-critical/45 bg-critical/10 px-3 py-2 text-sm font-semibold text-critical transition hover:bg-critical/15"
              >
                Open live DEX canary
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            )}
            <Link
              href="/settings/integrations#settings-web3-credentials-runway"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-engine/35 bg-engine/10 px-3 py-2 text-sm font-semibold text-engine transition hover:bg-engine/15"
            >
              Fix credential gates
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
            <Link
              href={canaryHref}
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-outline/20 bg-surface-dim/55 px-3 py-2 text-sm font-semibold text-on-surface-variant transition hover:border-engine/35 hover:text-engine"
            >
              Open canary JSON
            </Link>
            {sourceReady ? (
              <button
                type="button"
                onClick={() => void runPostSigningProofCheck()}
                disabled={busy || preflightBusy || proofBusy !== null}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-caution/35 bg-caution/10 px-3 py-2 text-sm font-semibold text-caution transition hover:bg-caution/15 disabled:cursor-not-allowed disabled:border-outline/20 disabled:bg-surface-dim/45 disabled:text-outline"
              >
                <RefreshCw aria-hidden="true" className={proofBusy === "watchdog" ? "size-4 animate-spin" : "size-4"} />
                {proofBusy === "watchdog" ? "Checking proof" : "Check proof chain"}
              </button>
            ) : null}
            {sourceReady ? (
              <button
                type="button"
                onClick={() => (autoProofMonitorEnabled ? stopAutoProofMonitor() : startAutoProofMonitor())}
                disabled={busy || proofBusy !== null}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-engine/35 bg-engine/10 px-3 py-2 text-sm font-semibold text-engine transition hover:bg-engine/15 disabled:cursor-not-allowed disabled:border-outline/20 disabled:bg-surface-dim/45 disabled:text-outline"
              >
                <RefreshCw aria-hidden="true" className={autoProofMonitorEnabled ? "size-4 animate-spin" : "size-4"} />
                {autoProofMonitorEnabled ? "Stop auto watch" : "Auto watch proof"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void refreshCanaryConsoleReceipts()}
              disabled={busy || proofBusy !== null || drillBusy}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-outline/20 bg-surface-dim/55 px-3 py-2 text-sm font-semibold text-on-surface-variant transition hover:border-engine/35 hover:text-engine disabled:cursor-not-allowed disabled:text-outline"
            >
              <RefreshCw aria-hidden="true" className={proofBusy === "refresh" || drillBusy ? "size-4 animate-spin" : "size-4"} />
              Refresh receipts
            </button>
          </div>

          <p className="mt-3 text-xs leading-5 text-outline">
            This control can preflight the exact wallet and tiny cap before any prompt, request only a one-shot unsigned Jupiter canary, ask the external browser wallet to sign it, relay the signed payload through the guarded canary endpoint, then run bounded read-only confirmation and settlement checks. It cannot store wallet authority, private keys, seed phrases, or transaction bodies.
          </p>
        </div>

        <div className="grid min-w-0 gap-2">
          <div className="rounded-md border border-critical/20 bg-surface/55 p-3" aria-label="Trading refreshed first canary drill status">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-critical">First canary drill</p>
                <p className="mt-1 text-sm font-semibold text-on-surface">
                  {firstCanaryDrillReceipt.next_unblock_step?.label ?? firstCanaryDrillReceipt.next_lane_label ?? "First funded canary"}
                </p>
              </div>
              <span className={firstCanaryDrillStatusClassName(firstCanaryDrillReceipt.status)}>
                {firstCanaryDrillReceipt.status.replaceAll("-", " ")}
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-on-surface-variant">
              {firstCanaryDrillReceipt.next_unblock_step?.action ?? firstCanaryDrillReceipt.next_lane_action ?? firstCanaryDrillReceipt.next_action}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <CanaryMetric label="Actual trade" value={firstCanaryDrillReceipt.actual_live_trade_tested ? "yes" : "no"} tone={firstCanaryDrillReceipt.actual_live_trade_tested ? "engine" : "critical"} />
              <CanaryMetric label="Proof" value={`${firstCanaryDrillReceipt.proof_pass_count}/${firstCanaryDrillReceipt.proof_required_count}`} tone={firstCanaryDrillReceipt.actual_live_trade_tested ? "engine" : "critical"} />
              <CanaryMetric label="Hard fails" value={`${firstCanaryDrillReceipt.hard_fail_count}`} tone={firstCanaryDrillReceipt.hard_fail_count > 0 ? "critical" : "engine"} />
              <CanaryMetric label="Unsigned" value={firstCanaryDrillReceipt.can_request_unsigned_order_now ? "ready" : "blocked"} tone={firstCanaryDrillReceipt.can_request_unsigned_order_now ? "caution" : "critical"} />
            </div>
            <div className="mt-2 grid gap-1.5" aria-label="Trading refreshed first canary ordered gates">
              {firstCanaryDrillReceipt.operator_unblock_plan.slice(0, 4).map((step) => (
                <div key={step.id} className="grid gap-1 rounded-md border border-outline/15 bg-surface-dim/35 p-2 sm:grid-cols-[7.5rem_minmax(0,1fr)]">
                  <div className="flex items-center gap-2">
                    <span className={firstCanaryUnblockStepClassName(step.status)}>{step.status}</span>
                    <span className="truncate text-[11px] font-semibold text-on-surface">{step.label}</span>
                  </div>
                  <p className="min-w-0 text-[11px] leading-4 text-on-surface-variant">{step.action}</p>
                </div>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void refreshFirstCanaryDrill()}
                disabled={busy || preflightBusy || proofBusy !== null || drillBusy}
                className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-outline/20 bg-surface-dim/55 px-2.5 py-1.5 text-xs font-semibold text-on-surface-variant transition hover:border-engine/35 hover:text-engine disabled:cursor-not-allowed disabled:text-outline"
              >
                <RefreshCw aria-hidden="true" className={drillBusy ? "size-3.5 animate-spin" : "size-3.5"} />
                Refresh drill
              </button>
              <Link
                href={drillHref}
                className="inline-flex min-h-9 items-center justify-center rounded-md border border-outline/20 bg-surface-dim/55 px-2.5 py-1.5 text-xs font-semibold text-on-surface-variant transition hover:border-engine/35 hover:text-engine"
              >
                Open drill JSON
              </Link>
            </div>
            <p className="mt-2 text-[11px] leading-4 text-outline">
              Paper trades, DEX reads, and Jupiter rehearsals do not count as live-trade proof; only the signed, relayed, confirmed, reconciled, and mirrored canary does.
            </p>
          </div>

          <div className="rounded-md border border-caution/25 bg-surface/60 p-3" aria-label="Trading live canary launch checklist">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-caution">Canary launch checklist</p>
                <p className="mt-1 text-sm font-semibold text-on-surface">
                  {actualTradeTested ? "Funded canary evidence exists" : "Funded canary still not proven"}
                </p>
              </div>
              <span className={evidenceStatusClassName(actualTradeTested ? "pass" : "fail")}>
                {actualTradeTested ? "live tested" : "not live tested"}
              </span>
            </div>
            <div className="mt-2 grid gap-1.5">
              {canaryLaunchSteps.map((step) => (
                <div key={step.id} className="grid gap-1 rounded-md border border-outline/15 bg-surface-dim/35 p-2 sm:grid-cols-[8rem_minmax(0,1fr)]">
                  <div className="flex items-center gap-2">
                    <span className={evidenceStatusClassName(step.status)}>{step.status}</span>
                    <span className="text-[11px] font-semibold text-on-surface">{step.label}</span>
                  </div>
                  <p className="min-w-0 text-[11px] leading-4 text-on-surface-variant">{step.detail}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-4 text-outline">
              The only result that counts as a live test is a signed wallet canary that relays, confirms on-chain, reconciles settlement, and updates the local portfolio mirror.
            </p>
          </div>

          <div className="rounded-md border border-engine/20 bg-surface/60 p-3" aria-label="Trading post-signing proof chain">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-engine">Post-signing proof chain</p>
                <p className="mt-1 text-sm font-semibold text-on-surface">
                  {canaryReceipt.post_signing_evidence_status.replaceAll("-", " ")}
                </p>
              </div>
              <span className={postSigningStatusClassName(canaryReceipt.post_signing_evidence_status)}>
                {canaryReceipt.post_signing_evidence.filter((item) => item.status === "pass").length}/4 proven
              </span>
            </div>
            <div className="mt-2 grid gap-1.5">
              {canaryReceipt.post_signing_evidence.map((item) => (
                <div key={item.id} className="grid gap-1 rounded-md border border-outline/15 bg-surface-dim/35 p-2 sm:grid-cols-[7rem_minmax(0,1fr)]">
                  <div className="flex items-center gap-2">
                    <span className={evidenceStatusClassName(item.status)}>{item.status}</span>
                    <span className="text-[11px] font-semibold text-on-surface">{item.label}</span>
                  </div>
                  <p className="min-w-0 text-[11px] leading-4 text-on-surface-variant">{item.detail}</p>
                </div>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <CanaryMetric label="Confirm" value={canaryReceipt.confirmation_poll_status.replaceAll("-", " ")} tone={canaryReceipt.confirmation_poll_status === "confirmed" ? "engine" : "neutral"} />
              <CanaryMetric label="Settle" value={canaryReceipt.settlement_reconciliation_status.replaceAll("-", " ")} tone={canaryReceipt.settlement_reconciliation_status === "reconciled" ? "engine" : "neutral"} />
              <CanaryMetric label="Watchdog" value={canaryReceipt.settlement_watchdog_status.replaceAll("-", " ")} tone={["mirrored", "reconciled", "confirmed"].includes(canaryReceipt.settlement_watchdog_status) ? "engine" : "neutral"} />
              <CanaryMetric label="Mirror" value={canaryReceipt.portfolio_mirror_status.replaceAll("-", " ")} tone={["applied", "duplicate"].includes(canaryReceipt.portfolio_mirror_status) ? "engine" : "neutral"} />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <CanaryMetric label="Auto watch" value={autoProofStatus} tone={autoProofMonitorEnabled || autoProofTerminal ? "engine" : autoProofExhausted ? "caution" : "neutral"} />
              <CanaryMetric label="Last check" value={autoProofLastCheckedAt ?? "not yet"} tone={autoProofLastCheckedAt ? "caution" : "neutral"} />
            </div>
            <p className="mt-2 text-[11px] leading-4 text-outline">{canaryReceipt.post_signing_next_action}</p>
          </div>

          <div className="rounded-md border border-critical/20 bg-surface/55 p-3" aria-label="Trading live canary blockers">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-critical">Blocking real trade proof</p>
                <p className="mt-1 text-sm font-semibold text-on-surface">
                  {canaryReceipt.blockers.length > 0 ? `${canaryReceipt.blockers.length} blocker${canaryReceipt.blockers.length === 1 ? "" : "s"}` : "No listed blocker"}
                </p>
              </div>
              <ShieldCheck aria-hidden="true" className="size-4 text-outline" />
            </div>
            <ul className="mt-2 grid gap-1.5 text-[11px] leading-4 text-on-surface-variant">
              {(actionReceipt?.blockers ?? unsignedReceipt?.blockers ?? preflightReceipt?.blockers ?? canaryReceipt.blockers).slice(0, 4).map((blocker, blockerIndex) => (
                <li key={`${blockerIndex}-${blocker}`}>{blocker}</li>
              ))}
            </ul>
          </div>

          {ownershipReceipt ? (
            <div className="rounded-md border border-engine/25 bg-engine/[0.035] p-3" aria-label="Trading wallet ownership receipt">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-engine">Wallet ownership</p>
                  <p className="mt-1 text-sm font-semibold text-on-surface">{ownershipReceipt.status}</p>
                </div>
                <span className={evidenceStatusClassName(ownershipReceipt.signature_verified ? "pass" : "fail")}>
                  {ownershipReceipt.signature_verified ? "verified" : "not verified"}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <CanaryMetric label="Wallet" value={ownershipReceipt.wallet_public_key_preview} tone={ownershipReceipt.signature_verified ? "engine" : "caution"} />
                <CanaryMetric label="Message" value={ownershipReceipt.message_storage} tone="neutral" />
                <CanaryMetric label="Tx signing" value={ownershipReceipt.transaction_signing_permission} tone="neutral" />
                <CanaryMetric label="Submit" value={ownershipReceipt.transaction_submission_permission} tone="neutral" />
              </div>
              <p className="mt-2 text-[11px] leading-4 text-outline">{ownershipReceipt.next_action}</p>
            </div>
          ) : null}

          {ownershipChallengeReceipt ? (
            <div className="rounded-md border border-engine/20 bg-surface/60 p-3" aria-label="Trading wallet ownership challenge receipt">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-engine">Wallet challenge</p>
                  <p className="mt-1 text-sm font-semibold text-on-surface">{ownershipChallengeReceipt.status}</p>
                </div>
                <span className={evidenceStatusClassName(ownershipChallengeReceipt.status === "ready" ? "watch" : "fail")}>
                  {ownershipChallengeReceipt.message_return.replaceAll("-", " ")}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <CanaryMetric label="Wallet" value={ownershipChallengeReceipt.wallet_public_key_preview} tone={ownershipChallengeReceipt.status === "ready" ? "engine" : "critical"} />
                <CanaryMetric label="Message" value={ownershipChallengeReceipt.message_storage} tone="neutral" />
                <CanaryMetric label="Tx signing" value={ownershipChallengeReceipt.transaction_signing_permission} tone="neutral" />
                <CanaryMetric label="Submit" value={ownershipChallengeReceipt.transaction_submission_permission} tone="neutral" />
              </div>
              <p className="mt-2 text-[11px] leading-4 text-outline">{ownershipChallengeReceipt.next_action}</p>
              <p className="mt-1 truncate text-[10px] leading-4 text-outline">receipt {ownershipChallengeReceipt.receipt_hash.slice(0, 10)}</p>
            </div>
          ) : null}

          {preflightReceipt ? (
            <div className="rounded-md border border-caution/25 bg-caution/[0.04] p-3" aria-label="Trading live canary preflight receipt">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-caution">Canary preflight</p>
                  <p className="mt-1 text-sm font-semibold text-on-surface">{preflightReceipt.status.replaceAll("-", " ")}</p>
                </div>
                <span className={canaryStatusClassName(preflightReceipt.status)}>
                  {preflightReceipt.can_request_one_shot_unsigned_order ? "order gate ready" : "no transaction"}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <CanaryMetric label="Jupiter" value={preflightReceipt.jupiter_key_configured ? "ready" : "missing"} tone={preflightReceipt.jupiter_key_configured ? "engine" : "neutral"} />
                <CanaryMetric label="Live flags" value={preflightReceipt.live_flags_ready ? "ready" : "missing"} tone={preflightReceipt.live_flags_ready ? "engine" : "critical"} />
                <CanaryMetric label="Wallet" value={preflightReceipt.wallet_ready ? "ready" : "blocked"} tone={preflightReceipt.wallet_ready ? "engine" : "critical"} />
                <CanaryMetric label="Tx bytes" value={preflightReceipt.unsigned_transaction_return} tone="neutral" />
              </div>
              <p className="mt-2 text-[11px] leading-4 text-outline">{preflightReceipt.next_action}</p>
            </div>
          ) : null}

          {unsignedReceipt ? (
            <div className="rounded-md border border-caution/25 bg-caution/[0.04] p-3" aria-label="Trading unsigned canary receipt">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-caution">Unsigned handoff</p>
                  <p className="mt-1 text-sm font-semibold text-on-surface">{unsignedReceipt.status.replaceAll("-", " ")}</p>
                </div>
                <span className="rounded-md border border-caution/30 bg-caution/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-caution">
                  {unsignedReceipt.unsigned_transaction_return.replaceAll("-", " ")}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <CanaryMetric label="Request" value={unsignedReceipt.request_id ?? "none"} tone={unsignedReceipt.request_id ? "caution" : "neutral"} />
                <CanaryMetric label="Bytes" value={String(unsignedReceipt.unsigned_payload_byte_count)} tone={unsignedReceipt.unsigned_payload_byte_count > 0 ? "caution" : "neutral"} />
              </div>
              <p className="mt-2 text-[11px] leading-4 text-outline">{unsignedReceipt.next_action}</p>
            </div>
          ) : null}

          {actionReceipt ? (
            <div className="rounded-md border border-engine/25 bg-engine/[0.035] p-3" aria-label="Trading signed canary relay receipt">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-engine">Signed relay</p>
                  <p className="mt-1 text-sm font-semibold text-on-surface">{actionReceipt.status.replaceAll("-", " ")}</p>
                </div>
                <span className={actionReceipt.actual_live_trade_tested ? canaryStatusClassName("live-relay-evidence-recorded") : canaryStatusClassName(actionReceipt.status)}>
                  {actionReceipt.actual_live_trade_tested ? "evidence" : "pending"}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <CanaryMetric label="Signed bytes" value={String(actionReceipt.signed_payload_byte_count)} tone={actionReceipt.signed_payload_byte_count > 0 ? "caution" : "neutral"} />
                <CanaryMetric label="Echoed" value={String(actionReceipt.signed_payload_echoed)} tone="neutral" />
              </div>
              <p className="mt-2 text-[11px] leading-4 text-outline">{actionReceipt.next_action}</p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function CanaryMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "engine" | "caution" | "critical" | "neutral";
}) {
  const toneClassName = tone === "engine"
    ? "text-engine"
    : tone === "caution"
      ? "text-caution"
      : tone === "critical"
        ? "text-critical"
        : "text-on-surface";
  return (
    <div className="min-w-0 rounded-md border border-outline/15 bg-surface-dim/45 p-2.5">
      <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">{label}</p>
      <p className={`mt-1 truncate text-sm font-semibold ${toneClassName}`}>{value}</p>
    </div>
  );
}

function canaryStatusClassName(status: Web3LiveTradeCanaryReceipt["status"] | Web3LiveTradeCanaryActionReceipt["status"] | Web3LiveUnsignedOrderHandoffReceipt["status"] | Web3LiveUnsignedOrderPreflightReceipt["status"]) {
  const base = "shrink-0 rounded-md border px-2.5 py-1 text-xs font-semibold capitalize";
  if (status === "live-relay-evidence-recorded" || status === "order-ready" || status === "ready") return `${base} border-engine/35 bg-engine/10 text-engine`;
  if (status === "relay-attempted" || status === "ready-for-external-signed-payload" || status === "order-failed") return `${base} border-caution/35 bg-caution/10 text-caution`;
  return `${base} border-critical/35 bg-critical/10 text-critical`;
}

function evidenceStatusClassName(status: Web3LiveTradeCanaryReceipt["post_signing_evidence"][number]["status"]) {
  const base = "rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]";
  if (status === "pass") return `${base} border-engine/30 bg-engine/10 text-engine`;
  if (status === "watch") return `${base} border-caution/30 bg-caution/10 text-caution`;
  return `${base} border-critical/30 bg-critical/10 text-critical`;
}

function postSigningStatusClassName(status: Web3LiveTradeCanaryReceipt["post_signing_evidence_status"]) {
  const base = "shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]";
  if (status === "settlement-accounted") return `${base} border-engine/30 bg-engine/10 text-engine`;
  if (status === "review-required") return `${base} border-critical/30 bg-critical/10 text-critical`;
  return `${base} border-caution/30 bg-caution/10 text-caution`;
}

function firstCanaryDrillStatusClassName(status: Web3FirstCanaryDrillReceipt["status"]) {
  const base = "shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]";
  if (status === "canary-proven" || status === "ready-to-request-unsigned-order" || status === "ready-to-relay-signed-payload") {
    return `${base} border-engine/30 bg-engine/10 text-engine`;
  }
  if (status === "unsafe-permission-drift") return `${base} border-critical/30 bg-critical/10 text-critical`;
  return `${base} border-critical/30 bg-critical/10 text-critical`;
}

function firstCanaryUnblockStepClassName(status: Web3FirstCanaryDrillReceipt["operator_unblock_plan"][number]["status"]) {
  const base = "rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]";
  if (status === "done") return `${base} border-engine/30 bg-engine/10 text-engine`;
  if (status === "next" || status === "watch") return `${base} border-caution/30 bg-caution/10 text-caution`;
  return `${base} border-critical/30 bg-critical/10 text-critical`;
}

export function buildCanaryLaunchSteps(input: {
  receipt: Web3LiveTradeCanaryReceipt;
  preflightReceipt: Web3LiveUnsignedOrderPreflightReceipt | null;
  unsignedReceipt: Web3LiveUnsignedOrderHandoffReceipt | null;
  actionReceipt: Web3LiveTradeCanaryActionReceipt | null;
}): CanaryLaunchStep[] {
  const { receipt, preflightReceipt, unsignedReceipt, actionReceipt } = input;
  const preflightReady = preflightReceipt?.status === "ready";
  const preflightFailed = Boolean(preflightReceipt && preflightReceipt.status !== "ready");
  const unsignedReady = unsignedReceipt?.status === "order-ready";
  const unsignedFailed = Boolean(unsignedReceipt && unsignedReceipt.status !== "order-ready");
  const signedRelayAttempted = Boolean(
    actionReceipt?.relay_attempted ||
    actionReceipt?.actual_live_trade_tested ||
    receipt.actual_live_trade_tested ||
    receipt.latest_signature_preview ||
    receipt.signed_relay_status === "relayed" ||
    receipt.signed_relay_status === "confirmed",
  );
  const proofAccounted = receipt.post_signing_evidence_status === "settlement-accounted";
  const proofReviewRequired = receipt.post_signing_evidence_status === "review-required";

  return [
    {
      id: "preflight",
      label: "Preflight",
      status: preflightReady ? "pass" : preflightFailed ? "fail" : "watch",
      detail: preflightReady
        ? "Wallet, tiny cap, slippage, live flags, source, account, and Jupiter env are ready before any prompt."
        : preflightFailed
          ? preflightReceipt?.next_action ?? "Preflight is blocked; fix the listed wallet or live-gate issue before signing."
          : "Run Canary preflight first. This creates no transaction and moves no funds.",
    },
    {
      id: "wallet-signature",
      label: "Wallet sign",
      status: signedRelayAttempted || unsignedReady ? "pass" : unsignedFailed ? "fail" : preflightReady ? "watch" : "fail",
      detail: signedRelayAttempted
        ? "A wallet-signed canary moved into the relay path for the current request."
        : unsignedReady
          ? "One-shot unsigned order is ready; the external browser wallet still has to sign it."
          : unsignedFailed
            ? unsignedReceipt?.next_action ?? "Unsigned handoff is blocked; no wallet signature has happened."
            : preflightReady
              ? "Preflight passed. Next step is Sign tiny canary in the browser wallet."
              : "No wallet signature has happened yet.",
    },
    {
      id: "signed-relay",
      label: "Relay",
      status: receipt.actual_live_trade_tested ? "pass" : signedRelayAttempted ? "watch" : actionReceipt ? "fail" : "fail",
      detail: receipt.actual_live_trade_tested
        ? "The app has recorded a live relay signature for the canary request."
        : signedRelayAttempted
          ? "Signed relay was attempted; confirmation and accounting still need proof."
          : actionReceipt?.next_action ?? "No signed canary relay is recorded yet.",
    },
    {
      id: "confirmation-accounting",
      label: "Proof",
      status: proofAccounted ? "pass" : proofReviewRequired ? "fail" : signedRelayAttempted ? "watch" : "fail",
      detail: proofAccounted
        ? "Chain confirmation, settlement reconciliation, and the local portfolio mirror are accounted."
        : proofReviewRequired
          ? receipt.post_signing_next_action
          : signedRelayAttempted
            ? "Run Check proof chain or Auto watch proof until the canary is confirmed and mirrored."
            : "Nothing can be confirmed or accounted until a funded canary is signed and relayed.",
    },
  ];
}

function getBrowserSolanaProvider(): BrowserSolanaProvider | null {
  if (typeof window === "undefined") return null;
  const maybeWindow = window as typeof window & {
    solana?: BrowserSolanaProvider;
    phantom?: { solana?: BrowserSolanaProvider };
    solflare?: BrowserSolanaProvider;
    backpack?: BrowserSolanaProvider;
  };
  return maybeWindow.solana ?? maybeWindow.phantom?.solana ?? maybeWindow.solflare ?? maybeWindow.backpack ?? null;
}

function browserWalletProviderName(provider: BrowserSolanaProvider | null) {
  if (!provider) return "none";
  if (provider.isPhantom) return "Phantom";
  if (provider.isSolflare) return "Solflare";
  if (provider.isBackpack) return "Backpack";
  return "Solana wallet";
}

async function getTrustedBrowserWalletPublicKey() {
  const provider = getBrowserSolanaProvider();
  if (!provider) return null;
  const current = provider.publicKey?.toString();
  if (current && isLikelySolanaPublicKey(current)) return current;
  if (typeof provider.connect !== "function") return null;
  try {
    const result = await provider.connect({ onlyIfTrusted: true });
    return result?.publicKey?.toString() ?? provider.publicKey?.toString() ?? null;
  } catch {
    return null;
  }
}

function isLikelySolanaPublicKey(value: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}

function base64ToBytes(value: string) {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return window.btoa(binary);
}

async function requestWalletOwnershipChallengeReceipt(walletPublicKey: string) {
  const response = await fetch(`/api/web3-wallet-ownership?wallet_public_key=${encodeURIComponent(walletPublicKey)}`);
  const payload = await response.json().catch(() => null) as Web3WalletOwnershipChallengeReceipt | { error: string } | null;
  if (!response.ok || !payload || "error" in payload || payload.status !== "ready" || !payload.message) {
    throw new Error(payload && "error" in payload ? payload.error : "Wallet ownership challenge failed.");
  }
  return payload;
}

function serializeSignedWalletTransaction(value: unknown): Uint8Array | null {
  if (!value || typeof value !== "object") return null;
  const maybeSerializable = value as { serialize?: () => Uint8Array };
  if (typeof maybeSerializable.serialize !== "function") return null;
  const serialized = maybeSerializable.serialize();
  return serialized instanceof Uint8Array ? serialized : null;
}

function previewValue(value: string | null | undefined) {
  if (!value) return null;
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}
