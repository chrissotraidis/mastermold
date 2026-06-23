import Link from "next/link";
import { Database, ExternalLink } from "lucide-react";

import type { Web3TradingState } from "@/src/db/web3-trading";

export function TechnicalStatusDrawer({
  state,
  source,
  account,
  defaultOpen = false,
}: {
  state: Web3TradingState;
  source: "sample" | "live-dex";
  account: "persistent" | "ephemeral";
  defaultOpen?: boolean;
}) {
  const scenario = state.scenario;
  const query = `source=${source}&account=${account}&scenario=${scenario}&cycles=0`;
  const rows = [
    {
      label: "Trade status",
      value: state.autonomous_trading_directive.status.replaceAll("-", " "),
      href: `/api/web3-trading?${query}`,
    },
    {
      label: "Readiness status",
      value: state.autonomous_live_autonomy_readiness.status.replaceAll("-", " "),
      href: `/api/web3-live-autonomy-readiness?${query}`,
    },
    {
      label: "Test trade status",
      value: state.autonomous_order_ticket.status.replaceAll("-", " "),
      href: `/api/web3-live-trade-canary?${query}`,
    },
    {
      label: "Wallet setup status",
      value: state.wallet_holdings_adapter.status.replaceAll("-", " "),
      href: "/settings#web3-wallet-trading",
    },
  ];

  return (
    <details
      id="web3-live-canary-console"
      open={defaultOpen}
      className="rounded-md border border-outline-variant/40 bg-surface-high/20 px-4 pb-4 pt-3"
    >
      <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center justify-between gap-3 text-sm font-semibold text-on-surface">
        <span id="technical-status" className="sr-only">Technical status</span>
        <span className="inline-flex min-w-0 items-center gap-2">
          <Database aria-hidden="true" className="size-4 text-outline" />
          Technical details
        </span>
        <span className="text-xs font-normal text-outline sm:ml-auto">Reviewer checks and endpoint links</span>
      </summary>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {rows.map((row) => (
          <Link
            key={row.label}
            href={row.href}
            className="min-w-0 rounded-md border border-outline-variant/35 bg-surface-dim/35 p-3 transition hover:border-violet/40"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-on-surface">{row.label}</p>
                <p className="mt-1 break-words text-xs capitalize text-outline">{row.value}</p>
              </div>
              <ExternalLink aria-hidden="true" className="size-4 shrink-0 text-outline" />
            </div>
          </Link>
        ))}
      </div>
      <p className="mt-3 text-xs leading-5 text-outline">
        Detailed endpoint status, reviewer checks, confirmations, and setup notes live here so the main trade flow stays readable.
      </p>
    </details>
  );
}
