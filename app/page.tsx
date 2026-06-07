import Link from "next/link";
import {
  ArrowRight,
  Bot,
  CircleSlash2,
  Cpu,
  DollarSign,
  BrainCircuit,
  PauseCircle,
  Wallet,
  Wifi,
} from "lucide-react";
import { AppShell, FirstRunBanner } from "@/components/app-shell";
import { CommandConsole } from "@/components/command-console";
import { DailyBriefingCard } from "@/components/briefing-card";
import { SentinelFace } from "@/components/sentinel-face";
import { AuthorityBadge, Chip, Panel } from "@/components/sentinel";
import { ProvenanceChip } from "@/components/provenance-chip";
import { getBriefingCards } from "@/src/db/briefing";
import { getDataMode } from "@/src/db/engine-data";
import { getSystemState } from "@/src/db/system";

export default function CommandDeckPage() {
  const system = getSystemState();
  const dataMode = getDataMode();
  const cards = getBriefingCards();
  const actionable = cards.filter((c) => c.status === "nothing_actionable").length !== cards.length;

  return (
    <AppShell dataMode={dataMode.label} faceState={system.state}>
      {/* ===== Hero: the face, HUD, command console ===== */}
      <section className="flex flex-col items-center pt-2" aria-label="MasterMold command deck">
        {/* Telemetry HUD strip */}
        <div className="z-20 mb-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border border-violet/30 bg-panel/80 px-4 py-2 chamfer-sm backdrop-blur-md inner-glow">
          <Telemetry icon={Wifi} label={system.dataFresh ? "Data: Fresh" : "Data: Stale"} tone={system.dataFresh ? "engine" : "caution"} />
          <Sep />
          <Telemetry label={`As-of: ${system.asOf}`} />
          <Sep />
          <Telemetry icon={Cpu} label={`Model: ${system.modelTier}`} />
          <Sep />
          <Telemetry icon={DollarSign} label={system.costLabel} />
          <Sep />
          <span className="inline-flex items-center">
            <ProvenanceChip label={system.provenance} />
          </span>
        </div>

        {/* The face */}
        <div className="relative flex w-full max-w-2xl flex-col items-center">
          <div className="pointer-events-none absolute inset-0 -m-6 rounded-full border border-dashed border-violet/20 [animation:spin_80s_linear_infinite]" aria-hidden="true" />
          <div className="pointer-events-none absolute inset-0 -m-12 rounded-full border border-tertiary/10 [animation:spin_120s_linear_infinite_reverse]" aria-hidden="true" />
          <div className="relative z-10 mb-2 size-60 bg-panel p-2 hex-clip glow-pulse sm:size-72">
            <div className="flex size-full items-center justify-center hex-clip bg-void">
              <SentinelFace state={system.state} className="scale-[1.15]" />
            </div>
          </div>
        </div>

        <CommandConsole vocal={system.vocal} />

        {/* Facets */}
        <div className="z-20 mt-8 grid w-full grid-cols-1 gap-gutter md:grid-cols-3">
          <Facet
            icon={BrainCircuit}
            title="BRAIN"
            zone="advise"
            accent="text-violet"
            statusLabel="Live status"
            statusValue={system.facets.brain}
            cta="Access matrix"
            href="/journal"
          />
          <Facet
            icon={Bot}
            title="COPILOT"
            zone="advise"
            accent="text-tertiary"
            statusLabel="Recommendations"
            statusValue={system.facets.copilot}
            cta="View advice"
            href="#briefing"
          />
          <Facet
            icon={Wallet}
            title="EXECUTOR"
            zone="act"
            accent="text-caution"
            statusLabel="Status"
            statusValue={system.facets.executor}
            cta="Configure"
            href="/executor"
            statusIcon={PauseCircle}
          />
        </div>

        <div className="mt-8 w-full max-w-4xl">
          <FirstRunBanner />
        </div>
      </section>

      {/* ===== Briefing ===== */}
      <section id="briefing" className="mt-4 scroll-mt-24 space-y-4" aria-labelledby="briefing-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 id="briefing-title" className="font-display text-2xl font-semibold tracking-tight text-on-surface">
                Daily Briefing
              </h2>
              <AuthorityBadge zone="advise" />
            </div>
            <p className="mt-1 text-sm text-on-surface-variant">
              Ranked tactical suggestions. MasterMold recommends — you execute.
            </p>
          </div>
          <ProvenanceChip label={dataMode.label} title={dataMode.source} />
        </div>

        {actionable ? (
          <div className="grid gap-gutter">
            {cards.map((card) => (
              <DailyBriefingCard key={card.id} card={card} />
            ))}
          </div>
        ) : (
          <NothingActionable isEngine={dataMode.label === "Engine output"} />
        )}
      </section>
    </AppShell>
  );
}

function Telemetry({
  icon: Icon,
  label,
  tone = "default",
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  tone?: "default" | "engine" | "caution";
}) {
  const toneCls = tone === "engine" ? "text-engine" : tone === "caution" ? "text-caution" : "text-violet";
  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-telemetry ${toneCls}`}>
      {Icon ? <Icon className="size-3.5" /> : null}
      {label}
    </span>
  );
}

function Sep() {
  return <span className="text-outline-variant" aria-hidden="true">|</span>;
}

function Facet({
  icon: Icon,
  title,
  zone,
  accent,
  statusLabel,
  statusValue,
  cta,
  href,
  statusIcon: StatusIcon,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  zone: "advise" | "act" | "observe";
  accent: string;
  statusLabel: string;
  statusValue: string;
  cta: string;
  href: string;
  statusIcon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Panel tint={zone} className="group p-6">
      <div className="relative z-10 mb-4 flex items-center justify-between border-b border-outline-variant/40 pb-3">
        <h3 className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight text-on-surface">
          <Icon className={`size-5 ${accent}`} /> {title}
        </h3>
        <AuthorityBadge zone={zone} />
      </div>
      <div className="relative z-10">
        <p className={`mb-2 flex items-center gap-2 font-mono text-[12px] uppercase tracking-telemetry ${accent}`}>
          {StatusIcon ? <StatusIcon className="size-3.5" /> : <span className={`size-1.5 rounded-full ${accent.replace("text-", "bg-")} animate-pulse`} />}
          {statusLabel}
        </p>
        <p className="text-lg text-on-surface-variant">{statusValue}</p>
      </div>
      <div className="relative z-10 mt-6 flex justify-end border-t border-outline-variant/30 pt-4">
        <Link
          href={href}
          className={`flex items-center gap-1 font-mono text-[11px] uppercase tracking-telemetry ${accent} transition-colors hover:brightness-125`}
        >
          {cta} <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </Panel>
  );
}

function NothingActionable({ isEngine }: { isEngine: boolean }) {
  return (
    <Panel tint="advise" className="overflow-hidden">
      <div className="relative z-10 grid gap-0 lg:grid-cols-[18rem_1fr]">
        <div className="flex items-center justify-center border-b border-caution/15 bg-void/40 p-8 lg:border-b-0 lg:border-r">
          <div className="flex size-24 items-center justify-center border border-caution/25 bg-caution/10 text-caution chamfer">
            <CircleSlash2 className="size-12" />
          </div>
        </div>
        <div className="space-y-4 p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone="caution">Nothing actionable today</Chip>
            <ProvenanceChip label={isEngine ? "Engine output" : "Demo data"} />
          </div>
          <h2 className="font-display text-2xl font-semibold text-on-surface">No forced trade when the signal is weak</h2>
          <p className="max-w-2xl text-sm leading-6 text-on-surface-variant">
            {isEngine
              ? "MasterMold screened the watchlist and nothing cleared the trigger — a zero-cost quiet day, with no agent runs."
              : "Waiting is an explicit outcome. The briefing renders a designed empty state instead of manufacturing action."}
          </p>
        </div>
      </div>
    </Panel>
  );
}
