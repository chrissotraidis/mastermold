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
          subtitle="Today's briefing, your alerts, holdings, and record are in context. I answer; I don't execute."
          provenance={dataMode.label}
        />
        <ChatWorkspace prompts={context.prompts} initialQuery={initialQuery} />
      </div>
    </AppShell>
  );
}
