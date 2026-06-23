import Link from "next/link";
import { KeyRound, ShieldCheck, Wallet } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Web3TradingState } from "@/src/db/web3-trading";

export function WalletSetup({ state }: { state: Web3TradingState }) {
  const walletKey =
    state.autonomous_custody_mandate.wallet_public_key ??
    state.live_wallet_accounting_readiness.wallet_public_key ??
    state.execution_readiness.config.wallet_public_key ??
    null;
  const walletReady = Boolean(walletKey) && state.wallet_holdings_adapter.status !== "blocked";
  const safetyRows = [
    {
      label: "Dedicated wallet",
      value: walletKey ? shortWallet(walletKey) : "Needs wallet",
      ready: Boolean(walletKey),
    },
    {
      label: "Read-only portfolio scan",
      value: state.wallet_holdings_adapter.status.replaceAll("-", " "),
      ready: state.wallet_holdings_adapter.status === "synced" || state.wallet_holdings_adapter.status === "empty",
    },
    {
      label: "Live movement",
      value: "Off until reviewed",
      ready: true,
    },
  ];

  return (
    <section id="wallet-setup" className="rounded-md border border-outline-variant/40 bg-surface-high/25 p-4 sm:p-5" aria-labelledby="wallet-setup-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-telemetry text-outline">Web3 wallet and trading setup</p>
          <h2 id="wallet-setup-title" className="mt-1 text-xl font-semibold text-on-surface">
            {walletReady ? "Wallet is ready for paper trading." : "Finish wallet setup before live review."}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-on-surface-variant">
            Use a dedicated wallet, keep private keys out of the app, and confirm read-only holdings before any real-money setup.
          </p>
        </div>
        <Link
          href="/settings#web3-wallet-trading"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-outline-variant/50 px-3 py-2 text-sm font-semibold text-on-surface-variant transition hover:border-violet/50 hover:text-violet"
        >
          <KeyRound aria-hidden="true" className="size-4" />
          Open setup
        </Link>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {safetyRows.map((row) => (
          <div key={row.label} className="min-w-0 rounded-md border border-outline-variant/35 bg-surface-dim/35 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 break-words text-sm font-semibold text-on-surface">{row.label}</p>
              {row.ready ? <ShieldCheck aria-hidden="true" className="size-4 text-engine" /> : <Wallet aria-hidden="true" className="size-4 text-caution" />}
            </div>
            <p className={cn("mt-2 min-w-0 break-words text-sm", row.ready ? "text-on-surface-variant" : "text-caution")}>{row.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function shortWallet(value: string) {
  if (value.length <= 14) return value;
  return `${value.slice(0, 6)}...${value.slice(-6)}`;
}
