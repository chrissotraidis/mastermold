import { AsOfReplayControl } from "@/components/as-of-replay-control";
import { AppShell } from "@/components/app-shell";
import { ChatWorkspace } from "@/components/chat-workspace";
import { PageHeader } from "@/components/page-header";
import { parseAsOf } from "@/src/db/bitemporal";

type ChatPageProps = {
  searchParams?: Promise<{ q?: string; as_of?: string }>;
};

export default async function ChatPage({ searchParams }: ChatPageProps) {
  const params = await searchParams;
  const initialQuery = typeof params?.q === "string" ? params.q : undefined;
  const parsedAsOf = parseAsOf(params?.as_of ?? null);
  const asOf = parsedAsOf.ok ? parsedAsOf.asOf : null;
  const chatRoute = buildChatRoute(initialQuery, asOf?.iso ?? null);
  const isReplay = Boolean(asOf);

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl">
        <PageHeader
          title="Ask Master Mold"
          subtitle="Ask Master Mold to open routes, check status, pull context, or explain what to do next. It answers; it does not execute."
        />
        <div id="ask-master-mold" className="scroll-mt-24">
          <ChatWorkspace
            initialQuery={initialQuery}
            pageContext={{
              surface: "Chat",
              route: chatRoute,
              summary:
                isReplay
                  ? "The user is in the dedicated conversation view rewound to an earlier point in time. Answer only from the context known by then."
                  : "The user is in the dedicated conversation view with today's saved market context, visible portfolio context, activity, and recent calls available.",
            }}
          />
        </div>
        <div className="mt-4">
          <AsOfReplayControl activeAsOf={asOf?.iso ?? null} apiPath="/api/chat" />
        </div>
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
