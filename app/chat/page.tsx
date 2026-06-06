import { AppShell, FirstRunBanner } from "@/components/app-shell";
import { ChatWorkspace } from "@/components/chat-workspace";
import { Badge } from "@/components/ui/badge";
import { getChatContext } from "@/src/db/chat";

export default function ChatPage() {
  const context = getChatContext();

  return (
    <AppShell>
      <FirstRunBanner />
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-5 sm:py-8">
        <header className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="bg-cyan-300/10 text-cyan-100">
              Agent Chat
            </Badge>
            <Badge variant="outline" className="border-white/15 text-slate-200">
              Demo data
            </Badge>
            <Badge variant="outline" className="border-white/15 text-slate-200">
              BYOK optional
            </Badge>
          </div>
          <div className="max-w-3xl space-y-2">
            <h2 className="text-3xl font-semibold leading-tight text-white sm:text-4xl">
              Chat with seeded portfolio, alert, and journal context
            </h2>
            <p className="text-sm leading-6 text-slate-300 sm:text-base sm:leading-7">
              The /api/chat route returns a deterministic advisory response with no key. With an
              optional provider key in .env.local, it forwards only abstracted holding ratios to
              the selected LLM.
            </p>
          </div>
        </header>

        <ChatWorkspace prompts={context.prompts} />
      </div>
    </AppShell>
  );
}
