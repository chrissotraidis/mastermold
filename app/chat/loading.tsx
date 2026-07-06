import { AppShell } from "@/components/app-shell";
import { ChatLoadingState } from "@/components/chat-loading-state";
import { PageHeader } from "@/components/page-header";

export default function ChatLoading() {
  return (
    <AppShell dataMode="Sample data">
      <div className="mx-auto max-w-4xl">
        <PageHeader
          title="Ask Master Mold"
          subtitle="The conversation view is opening. Page routes and safe checks are ready now."
          provenance="Sample data"
          back={false}
        />
        <ChatLoadingState />
      </div>
    </AppShell>
  );
}
