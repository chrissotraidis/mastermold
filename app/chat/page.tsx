import { AppShell } from "@/components/app-shell";
import { ChatWorkspace } from "@/components/chat-workspace";
import { PageHeader } from "@/components/page-header";
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
      <div className="mx-auto max-w-4xl">
        <PageHeader
          title="Ask Master Mold"
          subtitle="I know today's briefing, your alerts, holdings, and track record. Ask me anything — I'll answer, but I can't trade for you."
          provenance={dataMode.label}
        />
        <ChatWorkspace prompts={context.prompts} initialQuery={initialQuery} />
      </div>
    </AppShell>
  );
}
