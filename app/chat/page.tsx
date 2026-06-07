import { AppShell, FirstRunBanner } from "@/components/app-shell";
import { ChatWorkspace } from "@/components/chat-workspace";
import { ProvenanceChip } from "@/components/provenance-chip";
import { AuthorityBadge, Chip } from "@/components/sentinel";
import { getChatContext } from "@/src/db/chat";
import { getDataMode } from "@/src/db/engine-data";

type ChatPageProps = {
  searchParams?: Promise<{ q?: string }>;
};

export default async function ChatPage({ searchParams }: ChatPageProps) {
  const params = await searchParams;
  const initialQuery = typeof params?.q === "string" ? params.q : undefined;
  const context = getChatContext();
  const dataMode = getDataMode();

  return (
    <AppShell dataMode={dataMode.label}>
      <FirstRunBanner />
      <div className="mx-auto max-w-6xl space-y-6 py-2">
        <header className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone="violet">Interrogate</Chip>
            <AuthorityBadge zone="advise" />
            <ProvenanceChip label={dataMode.label} title={dataMode.source} />
            <Chip tone="neutral">BYOK optional</Chip>
          </div>
          <div className="max-w-3xl space-y-2">
            <h2 className="font-display text-3xl font-semibold leading-tight tracking-tight text-on-surface sm:text-4xl">
              Interrogate today&apos;s briefing
            </h2>
            <p className="text-sm leading-6 text-on-surface-variant sm:text-base sm:leading-7">
              Talk to MasterMold directly. The chat is grounded in the live engine context —
              today&apos;s briefing, alerts, portfolio, and decision track record. Without a provider
              key it returns a deterministic advisory response; with a key in{" "}
              <code className="font-mono text-violet">.env.local</code> it forwards only abstracted
              holding ratios to the model.
            </p>
          </div>
        </header>

        <ChatWorkspace prompts={context.prompts} initialQuery={initialQuery} />
      </div>
    </AppShell>
  );
}
