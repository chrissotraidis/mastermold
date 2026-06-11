import { AsOfReplayControl } from "@/components/as-of-replay-control";
import { AppShell } from "@/components/app-shell";
import { ChatWorkspace } from "@/components/chat-workspace";
import { PageHeader } from "@/components/page-header";
import { productProvenanceLabel } from "@/lib/provenance-copy";
import { parseAsOf } from "@/src/db/bitemporal";
import { getChatContext } from "@/src/db/chat";
import { getDataMode } from "@/src/db/engine-data";

type ChatPageProps = {
  searchParams?: Promise<{ q?: string; as_of?: string }>;
};

export default async function ChatPage({ searchParams }: ChatPageProps) {
  const params = await searchParams;
  const initialQuery = typeof params?.q === "string" ? params.q : undefined;
  const parsedAsOf = parseAsOf(params?.as_of ?? null);
  const asOf = parsedAsOf.ok ? parsedAsOf.asOf : null;
  const context = getChatContext(asOf);
  const dataMode = getDataMode(asOf);
  const publicDataMode = productProvenanceLabel(dataMode.label);
  const chatRoute = buildChatRoute(initialQuery, asOf?.iso ?? null);

  return (
    <AppShell dataMode={publicDataMode}>
      <div className="mx-auto max-w-4xl">
        <PageHeader
          title="Ask Master Mold"
          subtitle="The visible daily read, alerts, holdings, and past calls are in context. I answer; I don't execute."
          provenance={publicDataMode}
        />
        <div className="mb-4">
          <AsOfReplayControl activeAsOf={asOf?.iso ?? null} apiPath="/api/chat" />
        </div>
        <ChatWorkspace
          prompts={context.prompts}
          initialQuery={initialQuery}
          pageContext={{
            surface: "Chat",
            route: chatRoute,
            summary:
              asOf
                ? "The user is in the dedicated conversation view rewound to an earlier point in time. Answer only from the context known by then."
                : "The user is in the dedicated conversation view with today's saved market context, visible portfolio context, alerts, and recent calls available.",
          }}
        />
      </div>
    </AppShell>
  );
}

function buildChatRoute(initialQuery: string | undefined, asOf: string | null) {
  const params = new URLSearchParams();
  if (initialQuery) params.set("q", initialQuery);
  if (asOf) params.set("as_of", asOf);
  const query = params.toString();
  return query ? `/chat?${query}` : "/chat";
}
