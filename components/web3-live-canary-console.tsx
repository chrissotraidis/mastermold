"use client";

import { useEffect, useState } from "react";
import { ArrowRight, RefreshCw, ShieldCheck, Wallet, Zap } from "lucide-react";
import Link from "next/link";
import type { Web3LiveTradeCanaryActionReceipt, Web3LiveTradeCanaryReceipt } from "@/src/db/web3-live-trade-canary";
import type { Web3LiveUnsignedOrderHandoffReceipt } from "@/src/db/web3-live-unsigned-order-handoff";
import type { TradingAccountMode, TradingMarketSource, TradingScenario, Web3TradingState } from "@/src/db/web3-trading";

type BrowserSolanaProvider = {
  isPhantom?: boolean;
  isSolflare?: boolean;
  isBackpack?: boolean;
  isConnected?: boolean;
  publicKey?: { toString: () => string };
  connect?: (options?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey?: { toString: () => string } } | void>;
  signTransaction?: (transaction: unknown) => Promise<unknown>;
};

type Web3LiveCanaryConsoleProps = {
  receipt: Web3LiveTradeCanaryReceipt;
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

export function Web3LiveCanaryConsole({
  receipt,
  source,
  account,
  scenario,
  cycles,
  maxSlippageBps,
  defaultWalletPublicKey,
}: Web3LiveCanaryConsoleProps) {
  const [canaryReceipt, setCanaryReceipt] = useState(receipt);
  const [message, setMessage] = useState(receipt.next_action);
  const [busy, setBusy] = useState(false);
  const [proofBusy, setProofBusy] = useState<"refresh" | "watchdog" | null>(null);
  const [autoProofMonitorEnabled, setAutoProofMonitorEnabled] = useState(false);
  const [autoProofAttempt, setAutoProofAttempt] = useState(0);
  const [autoProofLastCheckedAt, setAutoProofLastCheckedAt] = useState<string | null>(null);
  const [unsignedReceipt, setUnsignedReceipt] = useState<Web3LiveUnsignedOrderHandoffReceipt | null>(null);
  const [actionReceipt, setActionReceipt] = useState<Web3LiveTradeCanaryActionReceipt | null>(null);
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
  const unsignedHref = `/api/web3-live-unsigned-order-handoff?${params.toString()}`;
  const liveTradingHref = `/trading?source=live-dex${account !== "persistent" ? "&account=persistent" : ""}`;
  const latestStatus = actionReceipt?.status ?? unsignedReceipt?.status ?? canaryReceipt.status;
  const actualTradeTested = actionReceipt?.actual_live_trade_tested ?? canaryReceipt.actual_live_trade_tested;
  const sourceReady = source === "live-dex" && account === "persistent";
  const autoProofTerminal = AUTO_PROOF_TERMINAL_STATUSES.includes(canaryReceipt.post_signing_evidence_status);
  const autoProofExhausted = autoProofAttempt >= AUTO_PROOF_MAX_ATTEMPTS;
  const autoProofStatus = autoProofTerminal
    ? canaryReceipt.post_signing_evidence_status.replaceAll("-", " ")
    : autoProofMonitorEnabled
      ? `${autoProofAttempt}/${AUTO_PROOF_MAX_ATTEMPTS} checks`
      : "off";

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
      const refreshed = await refreshCanaryReceipt("auto");
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
        await refreshCanaryReceipt("auto");
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
              <button
                type="button"
                onClick={() => void signTinyCanary()}
                disabled={busy}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-critical/45 bg-critical/10 px-3 py-2 text-sm font-semibold text-critical transition hover:bg-critical/15 disabled:cursor-not-allowed disabled:border-outline/20 disabled:bg-surface-dim/45 disabled:text-outline"
              >
                <Wallet aria-hidden="true" className={busy ? "size-4 animate-pulse" : "size-4"} />
                {busy ? "Signing canary" : "Sign tiny canary"}
              </button>
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
                disabled={busy || proofBusy !== null}
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
              onClick={() => void refreshCanaryReceipt()}
              disabled={busy || proofBusy !== null}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-outline/20 bg-surface-dim/55 px-3 py-2 text-sm font-semibold text-on-surface-variant transition hover:border-engine/35 hover:text-engine disabled:cursor-not-allowed disabled:text-outline"
            >
              <RefreshCw aria-hidden="true" className={proofBusy === "refresh" ? "size-4 animate-spin" : "size-4"} />
              Refresh receipt
            </button>
          </div>

          <p className="mt-3 text-xs leading-5 text-outline">
            This control can request only a tiny one-shot unsigned Jupiter canary, ask the external browser wallet to sign it, relay the signed payload through the guarded canary endpoint, then run bounded read-only confirmation and settlement checks. It cannot store wallet authority, private keys, seed phrases, or transaction bodies.
          </p>
        </div>

        <div className="grid min-w-0 gap-2">
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
              {(actionReceipt?.blockers ?? unsignedReceipt?.blockers ?? canaryReceipt.blockers).slice(0, 4).map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </div>

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

function canaryStatusClassName(status: Web3LiveTradeCanaryReceipt["status"] | Web3LiveTradeCanaryActionReceipt["status"] | Web3LiveUnsignedOrderHandoffReceipt["status"]) {
  const base = "shrink-0 rounded-md border px-2.5 py-1 text-xs font-semibold capitalize";
  if (status === "live-relay-evidence-recorded" || status === "order-ready") return `${base} border-engine/35 bg-engine/10 text-engine`;
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
