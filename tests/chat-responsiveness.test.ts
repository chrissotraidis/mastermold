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
    expect(globalAssistant).not.toContain("window.setTimeout(warmChat, 1200)");
    expect(globalAssistant).toContain("showEmptyPrompts={false}");
    expect(source("components/chat-workspace.tsx")).toContain("showEmptyPrompts = true");
    expect(source("components/chat-workspace.tsx")).toContain("showEmptyPrompts?: boolean;");
    expect(appShell).toContain('aria-label="Ask Master Mold from the top bar"');
    expect(appShell).toContain("openMasterMoldChat(undefined, pageContext)");
    expect(appShell).toContain("scrollLocalHashIntoView(href)");
    expect(appShell).toContain("}, [pathname]);");
    expect(appShell).toContain("md:hidden");
    expect(appShell).toContain("hidden min-h-11 items-center font-display text-2xl font-bold tracking-tighter text-violet md:flex");
  });

  test("GIVEN the floating assistant command is used WHEN a route intent is typed THEN routes are prefetched before tap", () => {
    const globalAssistant = source("components/global-assistant.tsx");
    const commandRouting = source("lib/master-mold-command-routing.ts");

    expect(globalAssistant).toContain('import { openMasterMoldCommandRoute } from "@/lib/master-mold-command-routing";');
    expect(globalAssistant).toContain("submittableCommandRoutesForChatDraft(trimmed, pageContext)[0] ?? null");
    expect(globalAssistant).toContain("openMasterMoldCommandRoute(router, readyRoute);");
    expect(globalAssistant).not.toContain("COMMAND_ROUTE_DELAY_MS");
    expect(commandRouting).toContain("router.push(handoffHref)");
    expect(commandRouting).toContain("scrollLocalHashIntoView(handoffHref)");
    expect(commandRouting).toContain("ensureMasterMoldRouteNavigation(router, handoffHref);");
    expect(commandRouting).toContain("window.requestAnimationFrame(() => {");
    expect(commandRouting).toContain("window.location.assign(href);");
    expect(commandRouting).toContain("rememberMasterMoldCommandHandoff(route)");
    expect(commandRouting).not.toContain("COMMAND_ROUTE_DELAY_MS");
    expect(globalAssistant).toContain("inputRef.current?.focus()");
    expect(globalAssistant).toContain('if (event.key === "Enter")');
    expect(globalAssistant).toContain("window.requestAnimationFrame");
    expect(globalAssistant).toContain("if (!draft.trim()) return [];");
    expect(globalAssistant).toContain("const trimmedDrawerDraft = drawerDraft.trim();");
    expect(globalAssistant).toContain("const drawerActions = useMemo(");
    expect(globalAssistant).toContain("trimmedDrawerDraft ? routeHintsForChatDraft(trimmedDrawerDraft, pageContext) : []");
    expect(globalAssistant).toContain("[pageContext, trimmedDrawerDraft]");
    expect(globalAssistant).toContain("const trimmedDraft = draft.trim();");
    expect(globalAssistant).toContain("() => quickActionsForDraft(trimmedDraft, pageContext)");
    expect(globalAssistant).toContain("() => readyActionForDraft(trimmedDraft, pageContext)");
    expect(globalAssistant).toContain("return routeHintsForChatDraft(draft, pageContext);");
    expect(globalAssistant).toContain("function readyActionForDraft");
    expect(globalAssistant).toContain("return submittableCommandRoutesForChatDraft(draft, pageContext)[0];");
    expect(globalAssistant).toContain("const drawerActionPrefetchKey = useMemo(");
    expect(globalAssistant).toContain("drawerActions.map((action) => prefetchableAppRoute(action.href)).filter(Boolean).join(\"|\")");
    expect(globalAssistant).toContain("const promptActionPrefetchKey = useMemo(");
    expect(globalAssistant).toContain("const assistantPrefetchKey = [drawerActionPrefetchKey, promptActionPrefetchKey].filter(Boolean).join(\"|\");");
    expect(globalAssistant).toContain("function promptPrefetchKey");
    expect(globalAssistant).toContain("const directRoute = directRouteForChatDraft(prompt.prompt, pageContext);");
    expect(globalAssistant).toContain("router.prefetch(href)");
    expect(globalAssistant).toContain('href.startsWith("/api/")');
    expect(globalAssistant).toContain('data-testid="assistant-command-status"');
    expect(globalAssistant).toContain("Ready. Press Enter or choose a route.");
    expect(globalAssistant).toContain("Master Mold is opening it now.");
    expect(globalAssistant).toContain("closeDrawerAfterCommand();");
    expect(globalAssistant).not.toContain("commandStatusTimerRef");
    expect(globalAssistant).not.toContain("window.setTimeout(() => {\n      setOpen(false)");
    expect(globalAssistant).toContain("hrefWithMasterMoldCommandHandoff");
    expect(globalAssistant).toContain("rememberMasterMoldCommandHandoff(action);");
  });

  test("GIVEN activity is opened from the app shell WHEN the bell is tapped THEN the drawer is already bundled", () => {
    const alertDrawer = source("components/alert-inbox-drawer.tsx");

    expect(alertDrawer).toContain('import { AlertInboxDrawerContent } from "@/components/alert-inbox-drawer-content";');
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
    expect(chatWorkspace).toContain("flushBufferedChatChunk");
    expect(chatWorkspace).toContain("window.requestAnimationFrame");
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
    expect(chatWorkspace).toContain('className="hidden max-w-lg flex-wrap justify-center gap-2 sm:flex"');
    expect(chatWorkspace).not.toContain('behavior: "smooth"');
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
    expect(appShell).toContain("flex min-h-12 items-center gap-2 rounded-md border border-violet/35");
    expect(appShell).toContain("min-h-11 w-56 bg-transparent text-sm font-medium");
    expect(appShell).toContain("xl:w-72");
    expect(appShell).toContain("flex size-11 shrink-0 items-center justify-center rounded-md bg-violet");
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
    const settingsPage = source("app/settings/integrations/page.tsx");
    const paperPage = source("app/paper/page.tsx");
    const paperWorkspace = source("components/paper-workspace.tsx");
    const journalPage = source("app/journal/page.tsx");
    const journalWorkspace = source("components/journal-workspace.tsx");
    const tradingPage = source("app/trading/page.tsx");
    const tradeDeferredDetails = source("components/trade-deferred-details.tsx");
    const testTradeFlow = source("components/test-trade-flow.tsx");
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
    expect(routeHints).toContain('/trading?action=run-kill-switch-drill#next-action');
    expect(routeHints).toContain('/trading?action=run-paper-test#test-trade-flow');
    expect(chatWorkspace).toContain('prompt: "Open Today."');
    expect(chatWorkspace).toContain('prompt: "Run today\'s scan."');
    expect(chatWorkspace).toContain('prompt: "Add holding."');
    expect(chatWorkspace).toContain('prompt: "Run paper test."');
    expect(chatWorkspace).toContain('prompt: "Import holdings snapshot."');
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
    expect(settingsPage).toContain('defaultOpen={commandAction === "test-portfolio-connection" || commandAction === "import-portfolio-snapshot"}');
    expect(settingsPage).toContain('defaultOpen={commandAction === "test-live-chat"}');
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
    expect(tradingPage).toContain('actionParam === "run-paper-test"');
    expect(tradeDeferredDetails).toContain("|| commandAction");
    expect(tradeDeferredDetails).toContain('const [hashTarget, setHashTarget] = useState("");');
    expect(tradeDeferredDetails).toContain("window.addEventListener(\"hashchange\", updateHashTarget)");
    expect(tradeDeferredDetails).toContain('document.getElementById("technical-status")?.closest("details")');
    expect(tradeDeferredDetails).toContain('details?.setAttribute("open", "");');
    expect(tradeDeferredDetails).toContain('details?.scrollIntoView({ block: "start", inline: "nearest" });');
    expect(tradeDeferredDetails).toContain('defaultOpen={technicalDetailsOpen || hashTarget === "#technical-status"}');
    expect(tradeDeferredDetails).toContain("onStateChange={setState}");
    expect(testTradeFlow).toContain("data-testid=\"run-paper-test-trade\"");
    expect(testTradeFlow).toContain("Master Mold is running the paper test.");
    expect(testTradeFlow).toContain("setCachedJson(cacheKey, payload);");
    expect(testTradeFlow).toContain("window.history.replaceState");
    expect(testTradeFlow).not.toContain('/api/web3-trading?action=cycle');

    expect(todayMetrics).toContain("useSearchParams");
    expect(todayMetrics).toContain("const actionQuery = searchParams.toString();");
    expect(todayMetrics).toContain("autoFeedbackRef.current === actionQuery");
    expect(todayMetrics).toContain('action === "mark-today-useful"');
    expect(todayMetrics).toContain('action === "mark-today-not-useful"');
    expect(todayMetrics).toContain('id="today-feedback"');
    expect(todayMetrics).toContain("submit(nextChoice);");
    expect(`${runScan}\n${memoryRefresh}\n${todayMetrics}\n${saveCall}\n${alertFeed}\n${manualHoldings}\n${integrationKeyInput}\n${testTradeFlow}\n${appShell}`).toContain("window.history.replaceState");
    expect(`${runScan}\n${memoryRefresh}\n${todayMetrics}\n${saveCall}\n${alertFeed}\n${manualHoldings}\n${integrationKeyInput}\n${testTradeFlow}\n${appShell}`).not.toContain("window.location.reload");
  });

  test("GIVEN a Trade status command is asked WHEN deep Web3 state is cold THEN Master Mold answers without waiting on the slow desk refresh", () => {
    const chatRoute = source("app/api/chat/route.ts");
    const stateCache = source("src/db/web3-trading-state-cache.ts");

    expect(chatRoute).toContain('import { peekCachedWeb3TradingState, warmCachedWeb3TradingState } from "@/src/db/web3-trading-state-cache";');
    expect(chatRoute).toContain("const state = peekCachedWeb3TradingState(request);");
    expect(chatRoute).toContain("warmCachedWeb3TradingState(request, TRADE_COMMAND_STATE_TTL_MS);");
    expect(chatRoute).not.toContain("getTradeStateForCommand");
    expect(chatRoute).not.toContain("promiseWithTimeout");
    expect(stateCache).toContain("export function peekCachedWeb3TradingState");
    expect(stateCache).toContain("export function warmCachedWeb3TradingState");
    expect(stateCache).toContain("void getCachedWeb3TradingState(input, ttlMs, staleTtlMs).catch(() => {});");
    expect(stateCache).toContain("timer.unref?.();");
  });

  test("GIVEN Trade is still loading WHEN the first viewport paints THEN Master Mold can route useful actions", () => {
    const tradingPage = source("app/trading/page.tsx");
    const tradingLoading = source("app/trading/loading.tsx");
    const tradeLoadingState = source("components/trade-loading-state.tsx");
    const tradeDeferredDetails = source("components/trade-deferred-details.tsx");

    expect(tradingPage).toContain('import { TradeLoadingState } from "@/components/trade-loading-state";');
    expect(tradingPage).toContain("<Suspense fallback={<TradeLoadingState />}>");
    expect(tradingPage).toContain('import { peekCachedWeb3TradingState, warmCachedWeb3TradingState } from "@/src/db/web3-trading-state-cache";');
    expect(tradingPage).toContain("const cachedOverviewState = peekCachedWeb3TradingState(stateRequest);");
    expect(tradingPage).toContain("const overviewState = cachedOverviewState ?? null;");
    expect(tradingPage).toContain("warmCachedWeb3TradingState(stateRequest);");
    expect(tradingPage).not.toContain("getWeb3TradingState(scenario, 0)");
    expect(tradingPage).not.toContain("getCachedWeb3TradingState");
    expect(tradingPage).toContain('<TradeOverview state={state} overviewMode={overviewMode} requestedSource={source} />');
    expect(tradeDeferredDetails).toContain("const WalletSetup = lazy(");
    expect(tradeDeferredDetails).toContain('import("@/components/wallet-setup")');
    expect(tradeDeferredDetails).toContain('import("@/components/test-trade-flow")');
    expect(tradeDeferredDetails).toContain('import("@/components/trading-monitor")');
    expect(tradeDeferredDetails).toContain('import("@/components/technical-status-drawer")');
    expect(tradeDeferredDetails).toContain("<Suspense fallback={<DeferredSectionSkeleton />}>");
    expect(tradingLoading).toContain("<TradeLoadingState />");
    expect(tradeLoadingState).toContain("<CommandConsole");
    expect(tradeLoadingState).toContain("Ask Master Mold while Trade opens.");
    expect(tradeLoadingState).toContain("Open test trade.");
    expect(tradeLoadingState).not.toContain("Check Web3 activity while Trade opens.");
    expect(tradeLoadingState).toContain('data-testid="trade-loading-state"');
    expect(tradeLoadingState).not.toContain("Checking wallet and test-trade status.");
  });

  test("GIVEN Settings opens WHEN setup state warms THEN Master Mold can route setup actions without waiting", () => {
    const settingsLoading = source("app/settings/loading.tsx");
    const settingsLoadingState = source("components/settings-loading-state.tsx");
    const settingsPage = source("app/settings/integrations/page.tsx");

    expect(settingsPage).toContain('import { Suspense } from "react";');
    expect(settingsPage).toContain("<Suspense");
    expect(settingsPage).toContain("<SettingsSectionsLoading");
    expect(settingsPage).toContain("<SettingsDeferredSections");
    expect(settingsPage.indexOf("<PageHeader")).toBeLessThan(settingsPage.indexOf("<Suspense"));
    expect(settingsPage).toContain("function SettingsDeferredSections");
    expect(settingsPage).toContain("const { brainStateRaw, web3State } = getFastSettingsState();");
    expect(settingsPage).toContain("warmSettingsState();");
    expect(settingsPage).toContain('web3State: getWeb3TradingState("base", 0),');
    expect(settingsPage).not.toContain("await getCachedSettingsState()");
    expect(settingsPage).toContain('data-testid="settings-deferred-loading"');
    expect(settingsLoading).toContain("<SettingsLoadingState />");
    expect(settingsLoadingState).toContain("<CommandConsole");
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
    expect(journalLoadingState).toContain("Ask Master Mold while Journal opens.");
    expect(journalLoadingState).toContain("Record a call.");
    expect(journalLoadingState).toContain("What do my recent saved calls say about my decision quality?");
    expect(journalLoadingState).toContain("Prepare paper trade.");
    expect(journalLoadingState).toContain('data-testid="journal-loading-state"');
    expect(journalLoadingState).toContain("You can still route to record a call, review decisions, or prepare a paper check.");
  });
});
