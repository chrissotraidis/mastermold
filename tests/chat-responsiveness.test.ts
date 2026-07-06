/// <reference types="bun" />

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("Master Mold responsiveness contracts", () => {
  test("GIVEN the floating assistant is central to the app WHEN the drawer opens THEN the chat workspace is already bundled", () => {
    const globalAssistant = source("components/global-assistant.tsx");
    const appShell = source("components/app-shell.tsx");

    expect(globalAssistant).toContain('import { ChatWorkspace } from "@/components/chat-workspace";');
    expect(globalAssistant).not.toContain('import dynamic from "next/dynamic"');
    expect(globalAssistant).not.toContain("ChatWorkspaceLoading");
    expect(globalAssistant).not.toContain("preloadChatWorkspace");
    expect(globalAssistant).not.toContain("requestIdleCallback(warmChat");
    expect(globalAssistant).toContain("showEmptyPrompts");
    expect(globalAssistant).toContain("document.body.dataset.masterMoldAssistant");
    expect(globalAssistant).toContain("onConversationStateChange={setDrawerHasMessages}");
    expect(globalAssistant).toContain("aria-modal={false}");

    // Rework: the drawer is an OVERLAY panel — one composer owned by
    // ChatWorkspace, fixed panel size, and it must never reflow the page.
    // Single composer, pinned bottom.
    expect(globalAssistant).toContain("showComposer");
    expect(globalAssistant).toContain('composerPlacement="bottom"');
    expect(globalAssistant).toContain('compactHeight="fill"');
    // Fixed floating card on desktop, bottom sheet on mobile.
    expect(globalAssistant).toContain("md:inset-auto md:bottom-4 md:right-4");
    expect(globalAssistant).toContain("md:h-[34rem] md:w-[24rem]");
    expect(globalAssistant).toContain("md:h-[80vh] md:w-[40rem]");
    expect(globalAssistant).toContain('data-testid="global-assistant-drawer"');
    // The old bolted-on second composer and its command helpers are gone.
    expect(globalAssistant).not.toContain("InstantAssistantCommand");
    expect(globalAssistant).not.toContain("drawerDraft");
    expect(globalAssistant).not.toContain("quickActionsForDraft");

    // The whole-point fix: the panel overlays, so the page-squeeze CSS that
    // reflowed <main> when the drawer opened is REMOVED.
    expect(source("app/globals.css")).not.toContain('body[data-master-mold-assistant="open"] main');
    expect(source("app/globals.css")).not.toContain("margin-right: 23rem;");
    expect(source("app/globals.css")).not.toContain("body[data-master-mold-assistant] [data-portfolio-overview-layout]");
    // The mobile full-screen sheet still hides the bottom nav underneath it.
    expect(source("app/globals.css")).toContain('body[data-master-mold-assistant] nav[aria-label="Mobile primary"]');

    expect(source("components/chat-workspace.tsx")).toContain("showEmptyPrompts = true");
    expect(source("components/chat-workspace.tsx")).toContain("showEmptyPrompts?: boolean;");
    expect(source("components/chat-workspace.tsx")).toContain("function PromptRail");
    expect(source("components/chat-workspace.tsx")).toContain('data-chat-prompt-rail="compact"');
    expect(source("components/chat-workspace.tsx")).toContain('composerPlacement?: "top" | "bottom";');
    expect(source("components/chat-workspace.tsx")).toContain("flex h-full min-h-0 flex-1 flex-col");
    expect(source("components/chat-workspace.tsx")).toContain('data-testid="compact-user-receipt"');
    expect(appShell).toContain('aria-label="Ask Master Mold from the top bar"');
    expect(appShell).toContain("openMasterMoldChat(undefined, pageContext)");
    expect(appShell).toContain("md:hidden");
    expect(appShell).toContain("fixed top-0 left-0 z-50 flex h-14 w-full");
    expect(appShell).toContain("hidden h-full w-14 flex-col");
    // Redesign: Master Mold persists via the floating launcher only — Today has
    // no embedded chat block, just the legacy anchor for old #today-chat links.
    expect(source("app/page.tsx")).toContain('id="today-chat"');
    expect(source("app/page.tsx")).not.toContain("<ChatWorkspace");
    // The floating launcher is the one always-visible chat entry; it hides only
    // while the drawer is open or on the dedicated /chat page.
    expect(globalAssistant).toContain("const showFloatingLauncher = !open && !isChatPage;");
    expect(globalAssistant).toContain("{showFloatingLauncher ? (");
  });

  test("GIVEN the floating assistant command is used WHEN a route intent is typed THEN routes are prefetched before tap", () => {
    // Rework: the drawer's composer is now ChatWorkspace's own composer, which
    // owns command routing. The routing library contract is unchanged.
    const chatWorkspace = source("components/chat-workspace.tsx");
    const commandRouting = source("lib/master-mold-command-routing.ts");

    expect(chatWorkspace).toContain('import { openMasterMoldCommandRoute } from "@/lib/master-mold-command-routing";');
    expect(chatWorkspace).toContain("openMasterMoldCommandRoute(router, readyComposerAction);");
    expect(chatWorkspace).not.toContain("COMMAND_ROUTE_DELAY_MS");
    expect(commandRouting).toContain("router.push(handoffHref)");
    expect(commandRouting).toContain("scrollLocalHashIntoView(handoffHref)");
    expect(commandRouting).toContain("ensureMasterMoldRouteNavigation(router, handoffHref);");
    expect(commandRouting).toContain("window.requestAnimationFrame(() => {");
    expect(commandRouting).toContain("window.location.assign(href);");
    expect(commandRouting).toContain("rememberMasterMoldCommandHandoff(route)");
    expect(commandRouting).not.toContain("COMMAND_ROUTE_DELAY_MS");
    // The drawer prefetches its page prompts' routes on open.
    const globalAssistant = source("components/global-assistant.tsx");
    expect(globalAssistant).toContain("const promptActionPrefetchKey = useMemo(");
    expect(globalAssistant).toContain("function promptPrefetchKey");
    expect(globalAssistant).toContain("const directRoute = directRouteForChatDraft(prompt.prompt, pageContext);");
    expect(globalAssistant).toContain("router.prefetch(href)");
    expect(globalAssistant).toContain('href.startsWith("/api/")');
    // Command status + handoff now live in the ChatWorkspace composer.
    expect(chatWorkspace).toContain("hrefWithMasterMoldCommandHandoff");
    expect(chatWorkspace).toContain('data-testid="chat-composer"');
  });

  test("GIVEN activity is opened from the app shell WHEN the bell is tapped THEN the drawer is already bundled", () => {
    const alertDrawer = source("components/alert-inbox-drawer.tsx");

    // Redesign: the drawer UI lives in the same module as the bell, so tapping
    // the bell never lazy-loads a separate chunk.
    expect(alertDrawer).toContain("function AlertInboxDrawerContent");
    expect(alertDrawer).toContain("createPortal(drawer, document.body)");
    expect(alertDrawer).not.toContain('import dynamic from "next/dynamic"');
    expect(alertDrawer).not.toContain("loading: () => null");
    expect(alertDrawer).not.toContain("preloadActivityDrawer");
  });

  test("GIVEN Master Mold is used repeatedly WHEN chat renders THEN history and scrolling stay lightweight", () => {
    const chatWorkspace = source("components/chat-workspace.tsx");

    expect(chatWorkspace).toContain("directRouteForChatDraft(trimmed, pageContext)");
    expect(chatWorkspace).toContain("openMasterMoldCommandRoute(router, directRoute);");
    expect(chatWorkspace).not.toContain("COMMAND_ROUTE_DELAY_MS");
    expect(chatWorkspace).toContain("hrefWithMasterMoldCommandHandoff");
    expect(chatWorkspace).toContain("rememberMasterMoldCommandHandoff(action);");
    expect(chatWorkspace).toContain("const CHAT_HISTORY_LIMIT = 24");
    expect(chatWorkspace).toContain("trimChatMessages");
    expect(chatWorkspace).toContain("const MessageBubble = memo");
    expect(chatWorkspace).toContain("areChatMessagePropsEqual");
    expect(chatWorkspace).toContain("const STREAM_REVEAL_DELAY_MS");
    expect(chatWorkspace).toContain("revealTextProgressively");
    expect(chatWorkspace).toContain("nextRevealCursor");
    expect(chatWorkspace).toContain("node.scrollTop = node.scrollHeight");
    expect(chatWorkspace).toContain("prefetchableChatActionRoutes");
    expect(chatWorkspace).toContain("prefetchablePromptRoutes");
    expect(chatWorkspace).toContain("const promptPrefetchRoutes = useMemo(");
    expect(chatWorkspace).toContain("const directRoute = directRouteForChatDraft(prompt.prompt, pageContext);");
    expect(chatWorkspace).toContain("action={directRouteForChatDraft(prompt.prompt, pageContext)}");
    expect(chatWorkspace).toContain("if (action && !disabled) {");
    expect(chatWorkspace).toContain("href={hrefWithMasterMoldCommandHandoff(action)}");
    expect(chatWorkspace).toContain("rememberMasterMoldCommandHandoff(action);");
    expect(chatWorkspace).toContain("const actions = commandRoutesForChatDraft(message, pageContext);");
    expect(chatWorkspace).toContain("const trimmedDraft = draft.trim();");
    expect(chatWorkspace).toContain("const composerRouteMeta = useMemo(");
    expect(chatWorkspace).toContain("optimisticCommandMeta(trimmedDraft, pageContext)");
    expect(chatWorkspace).toContain("const readyComposerAction = useMemo(");
    expect(chatWorkspace).toContain("trimmedDraft ? submittableCommandRoutesForChatDraft(trimmedDraft, pageContext)[0] : undefined");
    expect(chatWorkspace).toContain("const actionPrefetchKey = useMemo(");
    expect(chatWorkspace).toContain("if (!message.trim()) return undefined;");
    expect(chatWorkspace).toContain("router.prefetch(href)");
    expect(chatWorkspace).toContain('href.startsWith("/api/")');
    expect(chatWorkspace).toContain('data-testid="chat-composer-status"');
    expect(chatWorkspace).toContain("Ready. Press Enter or choose a route.");
    expect(chatWorkspace).toContain("Master Mold is opening it now.");
    expect(chatWorkspace).toContain("showRunningCommand(directRoute);");
    expect(chatWorkspace).toContain("function prepareCommandNavigation(action: ChatAction)");
    expect(chatWorkspace).toContain("if (readyComposerAction) {");
    expect(chatWorkspace).toContain("prepareCommandNavigation(readyComposerAction);");
    expect(chatWorkspace).toContain("openMasterMoldCommandRoute(router, readyComposerAction);");
    expect(chatWorkspace).toContain("href={hrefWithMasterMoldCommandHandoff(readyComposerAction)}");
    expect(chatWorkspace).toContain("onActionStart={showRunningCommand}");
    expect(chatWorkspace.indexOf("{showComposer ? (")).toBeLessThan(chatWorkspace.indexOf("{showCommandShelf ? ("));
    expect(chatWorkspace).toContain('function MessageActionStrip');
    expect(chatWorkspace).toContain('data-testid="message-action-strip"');
    expect(chatWorkspace).toContain("suppressActions = false");
    expect(chatWorkspace).toContain("suppressAnswerDetails = false");
    expect(chatWorkspace).toContain("externalPromptEventName");
    expect(chatWorkspace).toContain("suppressActions?: boolean");
    expect(chatWorkspace).toContain("suppressAnswerDetails?: boolean");
    expect(chatWorkspace).toContain("externalPromptEventName?: string");
    expect(chatWorkspace).toContain("suppressActions={suppressActions}");
    expect(chatWorkspace).toContain("suppressAnswerDetails={suppressAnswerDetails}");
    expect(chatWorkspace).toContain("window.addEventListener(externalPromptEventName, onExternalPrompt);");
    expect(chatWorkspace).toContain("sendMessage(detail?.prompt ?? \"\", \"prompt\");");
    expect(chatWorkspace).toContain("showControls && !suppressActions && meta && meta.actions.length > 0");
    expect(chatWorkspace).toContain('data-testid="message-secondary-actions"');
    expect(chatWorkspace).toContain('const [primaryAction, ...secondaryActions] = actions.slice(0, 4);');
    expect(chatWorkspace).toContain("More actions");
    expect(chatWorkspace).toContain("group w-full min-w-0 sm:w-auto sm:min-w-40");
    expect(chatWorkspace).toContain("function MessageContent");
    expect(chatWorkspace).toContain("function parseStructuredAnswer");
    expect(chatWorkspace).toContain('data-testid="structured-chat-answer"');
    // MessageContent now composes the structured answer with an optional
    // action-confirm chip (docs/chat-actions.md); the component wiring is the
    // same, the exact return shape changed.
    expect(chatWorkspace).toContain("<StructuredAnswer answer={structuredAnswer} compact={compact} suppressDetails={suppressAnswerDetails} />");
    expect(chatWorkspace).toContain('if (!["Today check", "Portfolio check", "Activity check"].includes(title)) return null;');
    expect(chatWorkspace).toContain("/^(Focus|Reason|Why|Value|Exposure|Source|Status|Top|Risk|Next):\\s*(.+)$/u");
    expect(chatWorkspace).toContain("return rows.length >= 2 ? { title, rows } : null;");
    expect(chatWorkspace).toContain("const primaryRow = answer.rows.find");
    expect(chatWorkspace).toContain('data-testid="structured-chat-answer-details"');
    expect(chatWorkspace).toContain("Why");
    expect(chatWorkspace).toContain('compactHeight?: "fill" | "content";');
    expect(chatWorkspace).toContain('emptyStateMode?: "standard" | "quiet" | "none";');
    expect(chatWorkspace).toContain('composerPlacement === "bottom" && compactHeight === "fill" && "mt-auto"');
    expect(chatWorkspace).toContain("type ChatEmptyHint");
    expect(chatWorkspace).toContain("emptyStateHint?: ChatEmptyHint;");
    expect(chatWorkspace).toContain("showThreadControls = false");
    expect(chatWorkspace).toContain("showThreadControls?: boolean;");
    expect(chatWorkspace).toContain("function ChatThreadControls");
    expect(chatWorkspace).toContain('data-testid="chat-thread-controls"');
    expect(chatWorkspace).toContain('aria-label="Start a new chat"');
    expect(chatWorkspace).toContain("function QuietEmptyState");
    expect(chatWorkspace).toContain('data-testid="chat-empty-hint"');
    expect(chatWorkspace).toContain('isEmpty && emptyStateMode === "none" && "hidden"');
    expect(chatWorkspace).toContain('emptyStateMode === "none" && compact ? null');
    expect(chatWorkspace).toContain('compactHeight === "fill"');
    expect(chatWorkspace).toContain('max-h-[min(20rem,calc(100vh-16rem))]');
    expect(chatWorkspace).toContain('data-testid="chat-workspace"');
    expect(chatWorkspace).toContain('Ask for the move, the risk, or the next check.');
    expect(chatWorkspace).toContain('className="sr-only" data-testid="structured-chat-answer-primary"');
    expect(chatWorkspace).toContain('data-testid="structured-chat-answer-primary"');
    expect(chatWorkspace).toContain('data-testid="structured-chat-answer-row"');
    expect(chatWorkspace).toContain("line-clamp-2");
    expect(chatWorkspace).toContain('data-testid="chat-context-meta"');
    expect(chatWorkspace).toContain("function shortProviderLabel");
    expect(chatWorkspace).toContain('title="Answer source and context"');
    expect(chatWorkspace).toContain("const statusLabel = meta.status === \"failed\" ? \"Failed\" : shortProviderLabel(meta.provider);");
    expect(chatWorkspace).toContain("const sourceLabel = meta.sources.length > 0 ? meta.sources.slice(0, 2).join(\" + \") : \"This view\";");
    expect(chatWorkspace).toContain("function ChatReceiptLine");
    expect(chatWorkspace).toContain('<ChatReceiptLine label="Status" value={labelProvider(meta.provider)} />');
    expect(chatWorkspace).toContain('<ChatReceiptLine label="Source" value={sourceLabel} />');
    expect(chatWorkspace).toContain('provider === "local-command" || provider === "local"');
    expect(chatWorkspace).toContain('return "Local";');
    expect(chatWorkspace).toContain('return "Live";');
    expect(chatWorkspace).toContain("answer source details");
    expect(chatWorkspace).not.toContain("Used this context");
    expect(chatWorkspace).toContain('function FollowupChips');
    expect(chatWorkspace).toContain('data-testid="message-followup-chips"');
    expect(chatWorkspace).toContain('followups.slice(0, 3)');
    expect(chatWorkspace).toContain("showControls={message.role === \"assistant\" && message.id === latestAssistantId}");
    expect(chatWorkspace).toContain("suppressFollowups={suppressFollowups || Boolean(trimmedDraft)}");
    expect(chatWorkspace).toContain("prev.suppressActions === next.suppressActions");
    expect(chatWorkspace).toContain("prev.suppressAnswerDetails === next.suppressAnswerDetails");
    expect(chatWorkspace).not.toContain("group-open:hidden");
    expect(chatWorkspace).not.toContain("Hide details");
    expect(chatWorkspace).not.toContain("absolute bottom-full");
    expect(chatWorkspace).not.toContain("function ChatActionButtons");
    expect(chatWorkspace).not.toContain('actions.slice(0, 4).map((action)');
    expect(chatWorkspace).not.toContain('className="hidden max-w-lg flex-wrap justify-center gap-2 sm:flex"');
    expect(chatWorkspace).not.toContain('behavior: "smooth"');
  });

  test("GIVEN chat starts a market scan WHEN Portfolio Brain is wired THEN scan copy names the read-only preflight", () => {
    const localCommands = source("src/chat/local-commands.ts");

    expect(localCommands).toContain("read-only portfolio preflight");
    expect(localCommands).toContain("syncs Monarch if configured");
    expect(localCommands).toContain("syncs Monarch if available");
    expect(localCommands).toContain("preflight receipt");
    expect(localCommands).toContain("cannot place brokerage trades, sign transactions, or move funds");
    expect(localCommands).not.toContain("This scan reads market data only");
  });

  test("GIVEN the dedicated chat page opens WHEN context is cold THEN the command surface does not wait on market facts", () => {
    const chatPage = source("app/chat/page.tsx");

    expect(chatPage).not.toContain("getChatPrompts");
    expect(chatPage).not.toContain("getDataMode");
    expect(chatPage).not.toContain("productProvenanceLabel");
    expect(chatPage).toContain("<AppShell>");
    expect(chatPage).toContain("Ask Master Mold to open routes, check status, pull context, or explain what to do next.");
    expect(chatPage).toContain("buildChatRoute(initialQuery, asOf?.iso ?? null)");
    expect(chatPage).toContain("Answer only from the context known by then.");
    expect(chatPage).not.toContain("prompts={");
    expect(chatPage).toContain("initialQuery={initialQuery}");
  });

  test("GIVEN the page command box is used WHEN a route intent is typed THEN routes are ready before submit", () => {
    const commandConsole = source("components/command-console.tsx");

    expect(commandConsole).toContain('import { openMasterMoldCommandRoute } from "@/lib/master-mold-command-routing";');
    expect(commandConsole).toContain("submittableCommandRoutesForChatDraft");
    expect(commandConsole).toContain("openMasterMoldCommandRoute(router, readyRoute);");
    expect(commandConsole).not.toContain("COMMAND_ROUTE_DELAY_MS");
    expect(commandConsole).toContain("hrefWithMasterMoldCommandHandoff");
    expect(commandConsole).toContain("const readyRoute = submittableCommandRoutesForChatDraft(trimmed, pageContext)[0] ?? null;");
    expect(commandConsole).toContain('data-testid="command-console-status"');
    expect(commandConsole).toContain("Ready. Press Enter or choose a route.");
    expect(commandConsole).toContain("Master Mold is opening it now.");
    expect(commandConsole).toContain('import { usePathname, useRouter } from "next/navigation";');
    expect(commandConsole).toContain("MASTER_MOLD_COMMAND_HANDOFF_EVENT");
    expect(commandConsole).toContain("window.addEventListener(MASTER_MOLD_COMMAND_HANDOFF_EVENT, clearCommandStatus);");
    expect(commandConsole).toContain("useEffect(() => setStatus(undefined), [pathname]);");
    expect(commandConsole).not.toContain("useSearchParams");
    expect(commandConsole).not.toContain("openingTimerRef");
    expect(commandConsole).not.toContain("setOpening(true)");
    expect(commandConsole).not.toContain("aria-busy={opening}");
    expect(commandConsole).toContain("rememberMasterMoldCommandHandoff(action);");
    expect(commandConsole).toContain("const trimmedQuery = q.trim();");
    expect(commandConsole).toContain("const typedActions = useMemo(");
    expect(commandConsole).toContain("trimmedQuery ? routeHintsForChatDraft(trimmedQuery, pageContext) : []");
    expect(commandConsole).toContain("const readySubmitAction = useMemo(");
    expect(commandConsole).toContain("trimmedQuery ? submittableCommandRoutesForChatDraft(trimmedQuery, pageContext)[0] : undefined");
    expect(commandConsole).toContain("const suggestionActionPrefetchKey = useMemo(");
    expect(commandConsole).toContain("commandSuggestionPrefetchKey(suggestions, pageContext)");
    expect(commandConsole).toContain("function commandSuggestionPrefetchKey");
    expect(commandConsole).toContain("const directRoute = directRouteForChatDraft(suggestion.prompt, pageContext);");
    expect(commandConsole).toContain("const VISIBLE_SUGGESTION_LIMIT = 3;");
    expect(commandConsole).toContain("const PREFETCH_SUGGESTION_LIMIT = 5;");
    expect(commandConsole).toContain("suggestions.slice(0, VISIBLE_SUGGESTION_LIMIT)");
    expect(commandConsole).toContain("suggestions.slice(0, PREFETCH_SUGGESTION_LIMIT)");
    expect(commandConsole).toContain("typedActions.length === 0 ? (");
    expect(commandConsole).toContain('data-testid="command-ready-routes"');
    expect(commandConsole).toContain("router.prefetch(href)");
    expect(commandConsole).toContain('href.startsWith("/api/")');
  });

  test("GIVEN the desktop top bar command is used WHEN a route intent is typed THEN routes are ready before submit", () => {
    const appShell = source("components/app-shell.tsx");
    const handoff = source("lib/master-mold-command-handoff.ts");

    expect(appShell).toContain('import { openMasterMoldCommandRoute } from "@/lib/master-mold-command-routing";');
    expect(appShell).toContain("submittableCommandRoutesForChatDraft");
    expect(appShell).toContain("openMasterMoldCommandRoute(router, readyRoute);");
    expect(appShell).not.toContain("COMMAND_ROUTE_DELAY_MS");
    expect(appShell).toContain("consumeMasterMoldCommandHandoff");
    expect(appShell).toContain("MASTER_MOLD_COMMAND_HANDOFF_PARAM");
    expect(appShell).toContain("const readyRoute = submittableCommandRoutesForChatDraft(trimmed, pageContext)[0] ?? null;");
    expect(appShell).toContain("MASTER_MOLD_COMMAND_HANDOFF_EVENT");
    expect(appShell).toContain("rememberMasterMoldCommandHandoff(action);");
    expect(appShell).toContain('data-testid="master-mold-command-toast"');
    expect(appShell).toContain("Keep asking from any Master Mold command box.");
    expect(appShell).not.toContain("You can keep asking from the chat button.");
    expect(appShell).toContain('data-testid="topbar-command-status"');
    expect(appShell).toContain("flex min-h-10 items-center gap-2 rounded-md border border-violet/25");
    expect(appShell).toContain("min-h-9 w-52 bg-transparent text-sm font-medium");
    expect(appShell).toContain("xl:w-64");
    expect(appShell).toContain("flex size-9 shrink-0 items-center justify-center rounded-md bg-violet");
    expect(appShell).toContain("w-[22rem]");
    expect(appShell).toContain("const locationKey = `${pathname}?${searchParams.toString()}`;");
    expect(appShell).toContain("useEffect(() => setCommandStatus(undefined), [locationKey]);");
    expect(appShell).not.toContain("commandOpeningTimerRef");
    expect(appShell).not.toContain("setCommandOpening(true)");
    expect(appShell).not.toContain("aria-busy={commandOpening}");
    expect(handoff).toContain("window.sessionStorage.setItem");
    expect(handoff).toContain('typeof window.CustomEvent === "function"');
    expect(handoff).toContain("Object.assign(new Event(MASTER_MOLD_COMMAND_HANDOFF_EVENT)");
    expect(handoff).toContain("window.dispatchEvent(event);");
    expect(appShell).toContain("const trimmedCommand = q.trim();");
    expect(appShell).toContain("() => (trimmedCommand ? routeHintsForChatDraft(trimmedCommand, pageContext) : [])");
    expect(appShell).toContain("const readyCommandAction = trimmedCommand");
    expect(appShell).toContain("? submittableCommandRoutesForChatDraft(trimmedCommand, pageContext)[0]");
    expect(appShell).toContain("const surfaceCommandActions = useMemo(");
    expect(appShell).toContain('() => routeHintsForChatDraft("", pageContext)');
    expect(appShell).toContain("const visibleCommandActions = trimmedCommand ? commandActions : surfaceCommandActions;");
    expect(appShell).toContain("prefetchKeyForShellActions([...surfaceCommandActions, ...commandActions])");
    expect(appShell).toContain("hidden group-focus-within:grid");
    expect(appShell).toContain('commandStatus || trimmedCommand ? "grid"');
    expect(appShell).toContain('data-testid="topbar-ready-routes"');
    expect(appShell).toContain("router.prefetch(href)");
    expect(appShell).toContain('href.startsWith("/api/")');
    expect(appShell).toContain("function prefetchKeyForShellActions");
  });

  test("GIVEN primary navigation is used WHEN a user reaches for a route THEN the destination is warmed immediately", () => {
    const appShell = source("components/app-shell.tsx");

    expect(appShell).toContain("function IntentPrefetchLink");
    expect(appShell).toContain("function prefetchAppRoute");
    expect(appShell).toContain("const frame = window.requestAnimationFrame(warmRoutes);");
    expect(appShell).toContain("const retry = window.setTimeout(warmRoutes, 500);");
    expect(appShell).toContain("onPointerEnter={(event) => {");
    expect(appShell).toContain("onPointerDown={(event) => {");
    expect(appShell).toContain("onTouchStart={(event) => {");
    expect(appShell).toContain("onFocus={(event) => {");
    expect(appShell).toContain("<IntentPrefetchLink");
    expect(appShell).toContain("prefetch");
    expect(appShell).not.toContain("requestIdleCallback");
    expect(appShell).not.toContain("window.setTimeout(warmRoutes, 1200)");
  });

  test("GIVEN Master Mold runs safe local actions WHEN action URLs land THEN existing Today controls perform the work", () => {
    const masterMoldActions = source("components/master-mold-actions.tsx");
    const runScan = source("components/run-scan-button.tsx");
    const memoryRefresh = source("components/today-memory-refresh.tsx");
    const routeHints = source("lib/chat-route-hints.ts");
    const briefingCard = source("components/briefing-card.tsx");
    const saveCall = source("components/save-briefing-call-button.tsx");
    const alertFeed = source("components/alert-feed.tsx");
    const manualHoldings = source("components/manual-holdings-panel.tsx");
    const integrationKeyInput = source("components/integration-key-input.tsx");
    const appShell = source("components/app-shell.tsx");
    const asOfReplayControl = source("components/as-of-replay-control.tsx");
    const chatWorkspace = source("components/chat-workspace.tsx");
    const settingsSection = source("components/settings-section.tsx");
    const clientHashScroll = source("lib/client-hash-scroll.ts");
    const settingsPage = source("app/settings/page.tsx");
    const paperPage = source("app/paper/page.tsx");
    const paperWorkspace = source("components/paper-workspace.tsx");
    const journalPage = source("app/journal/page.tsx");
    const journalWorkspace = source("components/journal-workspace.tsx");
    const todayMetrics = source("components/today-metrics.tsx");

    expect(masterMoldActions).toContain("openMasterMoldChat(prompt, pageContext);");
    expect(masterMoldActions).not.toContain("setOpening");
    expect(masterMoldActions).not.toContain("openingTimerRef");
    expect(masterMoldActions).not.toContain("aria-busy={opening}");
    expect(routeHints).toContain('/?action=run-scan#run-scan');
    expect(routeHints).toContain('/?action=save-context#today-inputs');
    expect(routeHints).toContain('/?action=mark-today-useful#today-feedback');
    expect(routeHints).toContain('/?action=mark-today-not-useful#today-feedback');
    expect(routeHints).toContain('/?action=save-top-call#top-idea');
    expect(routeHints).toContain('/activity?action=save-top-activity#activity-list');
    expect(routeHints).toContain('/activity?action=dismiss-top-activity#activity-list');
    expect(routeHints).toContain('/activity?action=mark-top-activity-useful#activity-list');
    expect(routeHints).toContain('/activity?action=mark-top-activity-not-useful#activity-list');
    expect(routeHints).toContain('/settings?action=test-portfolio-connection#portfolio-connections');
    expect(routeHints).toContain('/settings?action=import-portfolio-snapshot#portfolio-connections');
    expect(routeHints).toContain('/settings?action=test-live-chat#ai-chat-keys');
    expect(routeHints).toContain('/portfolio?action=add-holding#add-holdings');
    expect(routeHints).toContain('/paper?action=prepare-top-paper-trade#paper-trade-form');
    expect(routeHints).toContain('/paper?action=prepare-top-activity-paper-trade#paper-trade-form');
    expect(routeHints).toContain('/journal?action=record-top-idea#record-call');
    expect(routeHints).toContain('/trading?action=run-kill-switch-drill');
    expect(routeHints).not.toContain('run-paper-test');
    expect(chatWorkspace).toContain('prompt: "Open Today."');
    expect(chatWorkspace).toContain('prompt: "Run today\'s scan."');
    expect(chatWorkspace).toContain('prompt: "Add holding."');
    expect(chatWorkspace).toContain('prompt: "Run paper test."');
    expect(chatWorkspace).toContain('prompt: "Import holdings."');
    expect(chatWorkspace).toContain('prompt: "Save context for chat."');
    expect(chatWorkspace.indexOf('id: "command-run-scan"')).toBeLessThan(chatWorkspace.indexOf('id: "command-today"'));
    expect(chatWorkspace.indexOf('id: "command-add-holding"')).toBeLessThan(chatWorkspace.indexOf('id: "command-portfolio"'));
    expect(chatWorkspace).toContain('aria-label={`Ask Master Mold: ${prompt}`}');
    expect(chatWorkspace).not.toContain("Ask Master Mold to check ${label}");
    expect(routeHints).toContain('if (surface === "chat") return chatHints();');
    expect(routeHints).toContain('function chatHints()');
    expect(appShell).toContain('title="Run safety drill"');
    expect(appShell).toContain('aria-label="Run safety drill"');
    expect(asOfReplayControl).toContain("Show past view");
    expect(asOfReplayControl).toContain("Return to now");
    expect(todayMetrics).toContain("title={`Mark today ${label.toLowerCase()}`}");
    expect(runScan).toContain("useSearchParams");
    expect(runScan).toContain("const actionQuery = searchParams.toString();");
    expect(runScan).toContain("autoRunRef.current === actionQuery");
    expect(runScan).toContain('params.get("action") !== "run-scan"');
    expect(runScan).toContain('void run("master-mold-command")');
    expect(runScan).toContain('body: JSON.stringify({ trigger })');
    expect(memoryRefresh).toContain("useSearchParams");
    expect(memoryRefresh).toContain("const actionQuery = searchParams.toString();");
    expect(memoryRefresh).toContain("autoRefreshRef.current === actionQuery");
    expect(memoryRefresh).toContain('params.get("action") !== "save-context"');
    expect(memoryRefresh).toContain("refreshMemory();");
    expect(briefingCard).toContain('id={rank === 1 ? "top-idea"');
    expect(briefingCard).toContain("autoSaveFromCommand={rank === 1}");
    expect(saveCall).toContain("useSearchParams");
    expect(saveCall).toContain("const actionQuery = searchParams.toString();");
    expect(saveCall).toContain("autoSaveRef.current === actionQuery");
    expect(saveCall).toContain('params.get("action") !== "save-top-call"');
    expect(saveCall).toContain("saveCall();");
    expect(alertFeed).toContain("useSearchParams");
    expect(alertFeed).toContain("const actionQuery = searchParams.toString();");
    expect(alertFeed).toContain("handledCommandActionRef.current === actionQuery");
    expect(alertFeed).toContain("isActivityCommandAction(action)");
    expect(alertFeed).toContain('action === "save-top-activity"');
    expect(alertFeed).toContain("saveAsDecision(topAlert);");
    expect(alertFeed).toContain('action === "dismiss-top-activity"');
    expect(alertFeed).toContain("dismiss(topAlert);");
    expect(alertFeed).toContain('action === "mark-top-activity-useful"');
    expect(alertFeed).toContain("submitFeedback(topAlert, true);");
    expect(alertFeed).toContain("submitFeedback(topAlert, false);");
    expect(manualHoldings).toContain("useSearchParams");
    expect(manualHoldings).toContain("const actionQuery = searchParams.toString();");
    expect(manualHoldings).toContain("handledCommandActionRef.current === actionQuery");
    expect(manualHoldings).toContain('params.get("action") !== "add-holding"');
    expect(manualHoldings).toContain('symbolInputRef.current?.scrollIntoView({ block: "center", inline: "nearest" });');
    expect(manualHoldings).toContain("symbolInputRef.current?.focus({ preventScroll: true });");
    expect(manualHoldings).toContain('data-testid="manual-holdings-command-status"');
    // Redesign: Settings is one flat page; sections are always visible and the
    // first connection card in each group auto-runs the routed command action.
    expect(settingsPage).toContain("commandPrimary={index === 0}");
    expect(settingsPage).toContain('commandGroup="portfolio"');
    expect(settingsPage).toContain('commandGroup="chat"');
    expect(settingsSection).toContain("LOCAL_HASH_TARGET_EVENT");
    expect(settingsSection).toContain("openCommandHashTarget");
    expect(settingsSection).toContain("openTarget(detail.id);");
    expect(clientHashScroll).toContain('export const LOCAL_HASH_TARGET_EVENT = "master-mold-local-hash-target";');
    expect(clientHashScroll).toContain("window.dispatchEvent(event);");
    expect(integrationKeyInput).toContain("useSearchParams");
    expect(integrationKeyInput).toContain("const actionQuery = searchParams.toString();");
    expect(integrationKeyInput).toContain("handledCommandActionRef.current === actionQuery");
    expect(integrationKeyInput).toContain('action === "test-portfolio-connection"');
    expect(integrationKeyInput).toContain('action === "import-portfolio-snapshot"');
    expect(integrationKeyInput).toContain('action === "test-live-chat"');
    expect(integrationKeyInput).toContain("void testConnection();");
    expect(integrationKeyInput).toContain("void importHoldings();");
    expect(appShell).toContain('searchParams.get("action") !== "run-kill-switch-drill"');
    expect(appShell).toContain('if (action === "add-holding") return "Add Holding";');
    expect(appShell).toContain("setKillEngaged(true);");
    expect(appShell).toContain("setKillOpen(true);");
    expect(appShell).toContain('data-testid="kill-switch-drill-dialog"');
    expect(appShell).toContain('data-testid="kill-switch-drill-banner"');
    expect(appShell).toContain("clearAppShellCommandAction(\"run-kill-switch-drill\")");
    expect(paperPage).toContain('action === "prepare-top-paper-trade"');
    expect(paperPage).toContain('action === "prepare-top-activity-paper-trade"');
    expect(paperPage).toContain("getAlerts(parsedAsOf.ok ? parsedAsOf.asOf : null).find((alert) => !alert.acknowledged)");
    expect(paperPage).toContain("Testing the top activity item with simulator dollars");
    expect(paperPage).toContain("paper.enginePredictions[0]");
    expect(paperWorkspace).toContain("Prepared by Master Mold.");
    expect(paperWorkspace).toContain("prefill?.direction ?? \"long\"");
    expect(paperWorkspace).toContain("clampConfidence(prefill?.confidence ?? 6)");
    expect(journalPage).toContain('action !== "record-top-idea"');
    expect(journalPage).toContain("getBriefingCardById(topCard.id, asOf)");
    expect(journalWorkspace).toContain('data-testid="journal-prepared-draft"');
    expect(journalWorkspace).toContain("Prepared by Master Mold.");
    expect(journalWorkspace).toContain("setForm({ ...initialFormState, ...initialDraft });");
    expect(journalWorkspace).toContain("Draft prepared. Review it before saving.");
    expect(todayMetrics).toContain("useSearchParams");
    expect(todayMetrics).toContain("const actionQuery = searchParams.toString();");
    expect(todayMetrics).toContain("autoFeedbackRef.current === actionQuery");
    expect(todayMetrics).toContain('action === "mark-today-useful"');
    expect(todayMetrics).toContain('action === "mark-today-not-useful"');
    expect(todayMetrics).toContain('id="today-feedback"');
    expect(todayMetrics).toContain("submit(nextChoice);");
    expect(`${runScan}\n${memoryRefresh}\n${todayMetrics}\n${saveCall}\n${alertFeed}\n${manualHoldings}\n${integrationKeyInput}\n${appShell}`).toContain("window.history.replaceState");
    expect(`${runScan}\n${memoryRefresh}\n${todayMetrics}\n${saveCall}\n${alertFeed}\n${manualHoldings}\n${integrationKeyInput}\n${appShell}`).not.toContain("window.location.reload");
  });

  test("GIVEN a Trade status command is asked WHEN chat answers locally THEN it reads the autopilot lane's own state", () => {
    // Retirement 2026-07-05: the supervised web3 state cache is gone; the trade
    // command answers synchronously from the autopilot store.
    const localCommands = source("src/chat/local-commands.ts");

    expect(localCommands).toContain('import { getAutopilotState } from "@/src/autopilot/control";');
    expect(localCommands).toContain("const state = getAutopilotState();");
    expect(localCommands).not.toContain("peekCachedWeb3TradingState");
    expect(localCommands).not.toContain("warmCachedWeb3TradingState");
    expect(localCommands).not.toContain("promiseWithTimeout");
  });

  test("GIVEN Trade is still loading WHEN the first viewport paints THEN the loading state stays plain", () => {
    // Retirement 2026-07-05: the supervised test-trade workspace is gone; the
    // Trade page is the autonomous Autopilot lane only.
    const tradingPage = source("app/trading/page.tsx");
    const tradingLoading = source("app/trading/loading.tsx");

    expect(tradingPage).toContain("<AutopilotPanel />");
    expect(tradingLoading).toContain("Loading autopilot status");
    expect(tradingLoading).toContain('role="status"');
  });

  test("GIVEN Settings opens WHEN setup state warms THEN Master Mold can route setup actions without waiting", () => {
    // Redesign: Settings is one flat server page; the route-level loading state
    // keeps Master Mold routable while the page renders.
    const settingsLoading = source("app/settings/loading.tsx");
    const settingsLoadingState = source("components/settings-loading-state.tsx");
    const settingsPage = source("app/settings/page.tsx");

    expect(settingsPage).toContain('id="connections"');
    expect(settingsPage).toContain('id="chat"');
    expect(settingsPage).toContain('id="autopilot"');
    expect(settingsPage).toContain('id="safety"');
    expect(settingsPage).toContain('id="health"');
    expect(settingsPage).toContain('id="portfolio-connections"');
    expect(settingsPage).toContain('id="ai-chat-keys"');
    expect(settingsLoading).toContain("<SettingsLoadingState />");
    expect(settingsLoadingState).toContain("<CommandConsole");
    expect(settingsLoadingState).toContain("hidden min-w-0 rounded-md border border-violet/30 bg-violet/[0.045] p-4 sm:block sm:p-5");
    expect(settingsLoadingState).toContain("Ask Master Mold while Settings opens.");
    expect(settingsLoadingState).toContain("Open portfolio connections.");
    expect(settingsLoadingState).toContain("Open AI/chat keys.");
    expect(settingsLoadingState).toContain("Open Web3 setup.");
    expect(settingsLoadingState).toContain("Open safety limits.");
    expect(settingsLoadingState).toContain('data-testid="settings-loading-state"');
    expect(settingsLoadingState).toContain("No account import, live chat test, or trade can run unless you choose it.");
  });

  test("GIVEN Portfolio is still loading WHEN the first viewport paints THEN Master Mold can route portfolio actions", () => {
    const portfolioLoading = source("app/portfolio/loading.tsx");
    const portfolioLoadingState = source("components/portfolio-loading-state.tsx");

    expect(portfolioLoading).toContain("<PortfolioLoadingState />");
    expect(portfolioLoadingState).toContain("<CommandConsole");
    expect(portfolioLoadingState).toContain("Ask Master Mold while Portfolio opens.");
    expect(portfolioLoadingState).toContain("Show holdings.");
    expect(portfolioLoadingState).toContain("Add holding.");
    expect(portfolioLoadingState).toContain("Open portfolio connections.");
    expect(portfolioLoadingState).toContain("Check Trade.");
    expect(portfolioLoadingState).toContain('data-testid="portfolio-loading-state"');
    expect(portfolioLoadingState).toContain("You can still route to risk, holdings, setup, or Trade right away.");
  });

  test("GIVEN Activity is still loading WHEN the first viewport paints THEN Master Mold can route activity actions", () => {
    const activityLoading = source("app/activity/loading.tsx");
    const activityLoadingState = source("components/activity-loading-state.tsx");

    expect(activityLoading).toContain("<ActivityLoadingState />");
    expect(activityLoadingState).toContain("<CommandConsole");
    expect(activityLoadingState).toContain("hidden min-w-0 rounded-md border border-violet/30 bg-violet/[0.045] p-4 sm:block sm:p-5");
    expect(activityLoadingState).toContain("Ask Master Mold while Activity opens.");
    expect(activityLoadingState).toContain("Show urgent activity.");
    expect(activityLoadingState).toContain("Prepare a paper trade check from the most important activity item.");
    expect(activityLoadingState).toContain("Save context for chat.");
    expect(activityLoadingState).toContain('data-testid="activity-loading-state"');
    expect(activityLoadingState).toContain("You can still ask what matters, open urgent items, or prepare a paper check.");
  });

  test("GIVEN Chat is still loading WHEN the first viewport paints THEN Master Mold does not fall back to Today", () => {
    const chatLoading = source("app/chat/loading.tsx");
    const chatLoadingState = source("components/chat-loading-state.tsx");

    expect(chatLoading).toContain("<ChatLoadingState />");
    expect(chatLoading).toContain('title="Ask Master Mold"');
    expect(chatLoadingState).toContain("<CommandConsole");
    expect(chatLoadingState).toContain('surface: "Chat"');
    expect(chatLoadingState).toContain('route: "/chat"');
    expect(chatLoadingState).toContain("Ask Master Mold while chat opens.");
    expect(chatLoadingState).toContain("Today, portfolio, activity, Trade, and setup routes are ready");
    expect(chatLoadingState).toContain('data-testid="chat-loading-state"');
    expect(chatLoadingState).toContain("Use a chip or ask a question; no trade runs from chat.");
  });

  test("GIVEN Paper is still loading WHEN the first viewport paints THEN Master Mold can route paper actions", () => {
    const paperLoading = source("app/paper/loading.tsx");
    const paperLoadingState = source("components/paper-loading-state.tsx");

    expect(paperLoading).toContain("<PaperLoadingState />");
    expect(paperLoadingState).toContain("<CommandConsole");
    expect(paperLoadingState).toContain("hidden rounded-md border border-violet/30 bg-violet/[0.045] p-4 sm:block sm:p-5");
    expect(paperLoadingState).toContain("Ask Master Mold while Paper opens.");
    expect(paperLoadingState).toContain("Prepare paper trade.");
    expect(paperLoadingState).toContain("Test top idea on paper.");
    expect(paperLoadingState).toContain("Open journal.");
    expect(paperLoadingState).toContain('data-testid="paper-loading-state"');
    expect(paperLoadingState).toContain("You can still route to a paper test or journal review right away.");
  });

  test("GIVEN Journal is still loading WHEN the first viewport paints THEN Master Mold can route journal actions", () => {
    const journalLoading = source("app/journal/loading.tsx");
    const journalLoadingState = source("components/journal-loading-state.tsx");

    expect(journalLoading).toContain("<JournalLoadingState />");
    expect(journalLoadingState).toContain("<CommandConsole");
    expect(journalLoadingState).toContain("hidden rounded-md border border-violet/30 bg-violet/[0.045] p-4 sm:block sm:p-5");
    expect(journalLoadingState).toContain("Ask Master Mold while Journal opens.");
    expect(journalLoadingState).toContain("Record a call.");
    expect(journalLoadingState).toContain("What do my recent saved calls say about my decision quality?");
    expect(journalLoadingState).toContain("Prepare paper trade.");
    expect(journalLoadingState).toContain('data-testid="journal-loading-state"');
    expect(journalLoadingState).toContain("You can still route to record a call, review decisions, or prepare a paper check.");
  });
});
