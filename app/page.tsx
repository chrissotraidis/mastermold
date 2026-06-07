import Link from "next/link";
import { ArrowRight, BookOpenText, CircleSlash2, ShieldCheck, Wallet } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { CommandConsole } from "@/components/command-console";
import { DailyBriefingCard } from "@/components/briefing-card";
import { SentinelFace } from "@/components/sentinel-face";
import { ProvenanceChip } from "@/components/provenance-chip";
import { getBriefingCards } from "@/src/db/briefing";
import { getDataMode } from "@/src/db/engine-data";
import { getSystemState } from "@/src/db/system";

export default function DeckPage() {
  const system = getSystemState();
  const dataMode = getDataMode();
  const cards = getBriefingCards();
  const hasActionable = cards.some((c) => c.status === "actionable");

  return (
    <AppShell dataMode={dataMode.label} faceState={system.state}>
      {/* Hero: Master Mold + what needs you + the ask */}
      <section className="flex flex-col items-center pt-4 text-center" aria-label="Master Mold">
        <div className="relative mb-2 size-40 sm:size-48">
          <div className="pointer-events-none absolute inset-0 -m-4 rounded-full border border-dashed border-violet/15 [animation:spin_90s_linear_infinite]" aria-hidden="true" />
          <SentinelFace state={system.state} className="scale-110" />
        </div>

        <h1 className="max-w-2xl text-balance font-display text-2xl font-semibold leading-snug tracking-tight text-on-surface sm:text-[28px]">
          {system.greeting}
        </h1>
        <p className="mt-2 flex items-center gap-2 text-xs text-outline">
          <ProvenanceChip label={system.provenance} />
          <span>{system.updatedLabel}</span>
        </p>

        <div className="mt-6 flex w-full justify-center">
          <CommandConsole />
        </div>
      </section>

      {/* Today's briefing */}
      <section id="briefing" className="mt-12 scroll-mt-24" aria-labelledby="today-title">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 id="today-title" className="font-display text-lg font-semibold tracking-tight text-on-surface">
            Today
          </h2>
          {hasActionable ? (
            <span className="text-xs text-outline">
              {system.actionableCount} idea{system.actionableCount > 1 ? "s" : ""} · tap to open
            </span>
          ) : null}
        </div>

        {hasActionable ? (
          <div className="grid gap-4">
            {cards
              .filter((c) => c.status === "actionable")
              .map((card) => (
                <DailyBriefingCard key={card.id} card={card} />
              ))}
          </div>
        ) : (
          <NothingActionable isEngine={dataMode.label === "Engine output"} />
        )}
      </section>

      {/* Quiet footer: where else to go, stated plainly */}
      <section className="mt-12 grid gap-3 sm:grid-cols-3" aria-label="Elsewhere">
        <FooterLink href="/journal" icon={BookOpenText} label="Track record" note={system.memoryNote} />
        <FooterLink href="/executor" icon={Wallet} label="Web3 strategies" note={system.executorNote} />
        <FooterLink
          href="/review"
          icon={ShieldCheck}
          label="What's real"
          note="Advisory only — I can't move your money"
        />
      </section>
    </AppShell>
  );
}

function FooterLink({
  href,
  icon: Icon,
  label,
  note,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  note: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 border border-outline-variant/30 bg-surface-dim/40 p-4 chamfer-sm transition-colors hover:border-violet/40 hover:bg-surface-dim/70"
    >
      <Icon className="size-5 shrink-0 text-outline transition-colors group-hover:text-violet" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-on-surface">{label}</p>
        <p className="truncate text-xs text-outline">{note}</p>
      </div>
      <ArrowRight className="ml-auto size-4 shrink-0 text-outline transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function NothingActionable({ isEngine }: { isEngine: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 border border-outline-variant/30 bg-surface-dim/40 p-10 text-center chamfer-sm">
      <div className="flex size-14 items-center justify-center rounded-full border border-caution/25 bg-caution/10 text-caution">
        <CircleSlash2 className="size-7" />
      </div>
      <h3 className="font-display text-xl font-semibold text-on-surface">Nothing to act on today</h3>
      <p className="max-w-md text-sm leading-6 text-on-surface-variant">
        {isEngine
          ? "I screened your watchlist and nothing cleared the bar. Waiting is a real answer — I'll ping you when something matters."
          : "This is sample data. Connect the engine and I'll show you what actually needs you."}
      </p>
    </div>
  );
}
