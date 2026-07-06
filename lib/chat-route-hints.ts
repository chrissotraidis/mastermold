import type { ChatPageContext } from "@/src/db/chat";

export type ChatRouteHint = {
  label: string;
  href: string;
};

export function routeHintsForChatDraft(draft: string, pageContext?: ChatPageContext): ChatRouteHint[] {
  const normalized = draft.toLowerCase().trim();
  const surface = pageContext?.surface.toLowerCase() ?? "";
  const wantsTrade = mentionsAny(normalized, ["web3", "trade", "trading", "wallet", "order", "orders", "position", "positions", "test trade", "provider", "ownership", "live trading", "technical"]);
  const wantsPortfolio = mentionsAny(normalized, ["portfolio", "holding", "holdings", "net worth", "allocation", "risk", "balance", "balances", "concentration"]);
  const wantsActivity = mentionsAny(normalized, ["activity", "alert", "alerts", "attention", "needs attention", "top item", "urgent", "worth checking", "fyi", "matter", "useful"]);
  const wantsSettings = mentionsAny(normalized, ["settings", "setup", "configure", "configuration", "connect", "connection", "connections", "keys", "key", "profile", "safety", "limits"]);
  const wantsPaper = mentionsAny(normalized, ["paper", "paper trade", "test trade", "simulator"]);
  const wantsJournal = mentionsAny(normalized, ["journal", "decision", "record", "call", "calls", "win rate"]);

  if (!normalized) {
    return routeHintsForSurface(surface);
  }

  if (mentionsAny(normalized, ["health json", "open health json", "api health", "open api health"])) {
    return [
      { label: "Health Status", href: "/api/health" },
      { label: "System Status", href: "/review" },
      { label: "Open Settings", href: "/settings" },
    ];
  }

  if (mentionsAny(normalized, ["system status", "reviewer", "health check", "what is real"])) {
    return [
      { label: "System Status", href: "/review" },
      { label: "Health Status", href: "/api/health" },
      { label: "Open Settings", href: "/settings" },
    ];
  }

  const capabilityHints = capabilityQuestionHints(normalized, surface);
  if (capabilityHints.length > 0) return capabilityHints;

  const exactAppTaskHints = exactAppTaskSectionHints(normalized, pageContext);
  if (exactAppTaskHints.length > 0) return exactAppTaskHints;

  if (mentionsAny(normalized, ["today", "home", "daily", "rundown", "top idea", "best idea", "focus"])) {
    return [
      { label: "Open Today", href: "/" },
      { label: "Check Activity", href: "/activity" },
      { label: "Open Portfolio", href: "/portfolio" },
    ];
  }

  if (mentionsAny(normalized, ["chat", "assistant", "master mold", "command"])) {
    return [
      { label: "Open Chat", href: "/chat" },
      { label: "Open Today", href: "/" },
      { label: "Open Trade", href: "/trading" },
    ];
  }

  const exactTradeHints = exactTradeSectionHints(normalized);
  if (exactTradeHints.length > 0) return exactTradeHints;

  const mixedIntentHints = combineIntentHints({
    wantsActivity,
    wantsTrade,
    wantsPortfolio,
    wantsSettings,
    wantsPaper,
    wantsJournal,
  });
  if (mixedIntentHints.length > 0) return mixedIntentHints;

  return routeHintsForSurface(surface);
}

export function directRouteForChatDraft(draft: string, pageContext?: ChatPageContext): ChatRouteHint | null {
  const normalized = draft.toLowerCase().trim();
  if (capabilityQuestionHints(normalized, pageContext?.surface.toLowerCase() ?? "").length > 0) return null;

  const directAction = directActionRoute(normalized, pageContext);
  if (directAction) return directAction;

  if (!isDirectNavigationRequest(normalized)) return null;

  const specificRoute = specificDirectRoute(normalized, pageContext);
  if (specificRoute) return specificRoute;

  return routeHintsForChatDraft(draft, pageContext).find((hint) => isSafeAppRoute(hint.href)) ?? null;
}

export function commandRoutesForChatDraft(draft: string, pageContext?: ChatPageContext): ChatRouteHint[] {
  const normalized = draft.toLowerCase().trim();
  if (!normalized) return [];
  if (isAnswerRequest(normalized)) return [];

  const directRoute = directRouteForChatDraft(draft, pageContext);
  const hintedRoutes = routeHintsForChatDraft(draft, pageContext);

  return directRoute ? dedupeHints([directRoute, ...hintedRoutes]) : hintedRoutes;
}

export function submittableCommandRoutesForChatDraft(draft: string, pageContext?: ChatPageContext): ChatRouteHint[] {
  const normalized = draft.toLowerCase().trim();
  if (!normalized) return [];
  if (isAnswerRequest(normalized)) return [];
  if (capabilityQuestionHints(normalized, pageContext?.surface.toLowerCase() ?? "").length > 0) return [];

  const directRoute = directRouteForChatDraft(draft, pageContext);
  if (directRoute) return dedupeHints([directRoute, ...routeHintsForChatDraft(draft, pageContext)]);

  return isCommandLikeDraft(normalized) ? commandRoutesForChatDraft(draft, pageContext) : [];
}

function directActionRoute(normalized: string, pageContext?: ChatPageContext): ChatRouteHint | null {
  const exact = exactVisibleCommandRoute(normalized, pageContext);
  if (exact) return exact;

  if (mentionsAny(normalized, ["kill switch drill", "kill-switch drill", "safety drill", "trade safety drill", "run kill switch drill", "run kill-switch drill", "run safety drill", "run trade safety drill", "run stop drill", "do kill switch drill", "do safety drill", "test kill switch", "test kill-switch", "start kill switch drill"])) {
    return { label: "Run Safety Drill", href: "/trading?action=run-kill-switch-drill" };
  }

  if (mentionsAny(normalized, ["run paper test", "run the paper test", "run test trade", "run the test trade", "start paper test", "start the paper test", "start test trade", "do paper test", "do test trade"])) {
    return { label: "Run Paper Test", href: "/paper#paper-trade-form" };
  }

  if (mentionsAny(normalized, ["record top idea", "record the top idea", "record top idea as decision", "record the top idea as a decision", "log top idea", "log the top idea", "journal top idea", "journal the top idea", "record top call", "log top call"])) {
    return { label: "Record Top Idea", href: "/journal?action=record-top-idea#record-call" };
  }

  if (mentionsAny(normalized, ["test top activity on paper", "test top alert on paper", "paper trade top activity", "paper trade top alert", "paper test top activity", "paper test top alert", "try top activity on paper", "try top alert on paper", "prepare top activity paper trade", "prepare top alert paper trade", "prepare activity item paper trade", "most important activity item", "paper trade activity", "paper trade this activity", "paper trade visible activity"])) {
    return { label: "Prepare Top Activity Paper Trade", href: "/paper?action=prepare-top-activity-paper-trade#paper-trade-form" };
  }

  if (mentionsAny(normalized, ["test top idea on paper", "paper trade top idea", "paper test top idea", "test top call on paper", "try top idea on paper", "prepare top paper trade"])) {
    return { label: "Prepare Top Paper Trade", href: "/paper?action=prepare-top-paper-trade#paper-trade-form" };
  }

  if (mentionsAny(normalized, ["test as paper trade", "test as a paper trade", "test this as paper trade", "test this as a paper trade", "test today's idea as paper trade", "test today idea as paper trade"])) {
    return { label: "Prepare Top Paper Trade", href: "/paper?action=prepare-top-paper-trade#paper-trade-form" };
  }

  if (mentionsAny(normalized, ["open idea for", "open the idea for"])) {
    return { label: "Top Idea", href: "/#top-idea" };
  }

  if (mentionsAny(normalized, ["test portfolio connection", "test portfolio connections", "test account access", "test my connections", "test connections", "do connection check"])) {
    return { label: "Test Portfolio Connection", href: "/settings?action=test-portfolio-connection#portfolio-connections" };
  }

  if (mentionsAny(normalized, ["import holdings snapshot", "import portfolio snapshot", "refresh portfolio balances", "refresh holdings", "pull portfolio balances", "pull holdings snapshot", "get holdings snapshot"])) {
    return { label: "Import Holdings Snapshot", href: "/settings?action=import-portfolio-snapshot#portfolio-connections" };
  }

  if (mentionsAny(normalized, ["test live chat", "test chat key", "test chat keys", "test ai key", "test ai keys", "test ai chat"])) {
    return { label: "Test Live Chat", href: "/settings?action=test-live-chat#ai-chat-keys" };
  }

  if (mentionsAny(normalized, ["add holding", "add a holding", "add holdings", "enter holding", "enter a holding", "manual holding", "manual holdings"])) {
    return { label: "Add Holding", href: "/portfolio?action=add-holding#add-holdings" };
  }

  if (mentionsAny(normalized, ["activity details", "details and response", "show response", "open response", "show suggested response", "open suggested response"])) {
    return { label: "Activity Details", href: "/activity#activity-list" };
  }

  if (mentionsAny(normalized, ["save top activity", "save first activity", "save this activity", "save top alert", "save first alert", "save this alert", "save activity as decision", "save top activity as decision", "save as decision"])) {
    return { label: "Save Top Activity", href: "/activity?action=save-top-activity#activity-list" };
  }

  if (mentionsAny(normalized, ["dismiss top activity", "dismiss first activity", "dismiss this activity", "dismiss top alert", "dismiss first alert", "dismiss this alert"])) {
    return { label: "Dismiss Top Activity", href: "/activity?action=dismiss-top-activity#activity-list" };
  }

  if (mentionsAny(normalized, ["mark top activity useful", "mark first activity useful", "mark this activity useful", "top activity was useful", "rate top activity useful", "mark top alert useful"])) {
    return { label: "Mark Top Activity Useful", href: "/activity?action=mark-top-activity-useful#activity-list" };
  }

  if (mentionsAny(normalized, ["mark top activity not useful", "mark first activity not useful", "mark this activity not useful", "top activity was not useful", "rate top activity not useful", "mark top alert not useful"])) {
    return { label: "Mark Top Activity Not Useful", href: "/activity?action=mark-top-activity-not-useful#activity-list" };
  }

  if (mentionsAny(normalized, ["save top call", "save the top call", "save this call", "save today call", "save top idea", "save this idea"])) {
    return { label: "Save Top Call", href: "/?action=save-top-call#top-idea" };
  }

  if (mentionsAny(normalized, ["mark today useful", "rate today useful", "today was useful", "mark this useful", "rate this useful"])) {
    return { label: "Mark Today Useful", href: "/?action=mark-today-useful#today-feedback" };
  }

  if (mentionsAny(normalized, ["mark today not useful", "rate today not useful", "today was not useful", "mark this not useful", "rate this not useful"])) {
    return { label: "Mark Today Not Useful", href: "/?action=mark-today-not-useful#today-feedback" };
  }

  if (mentionsAny(normalized, ["run scan", "run today's scan", "market scan", "scan markets", "start scan", "pull scan", "pull today's scan", "get scan", "get today's scan", "do scan", "do a scan"])) {
    return { label: "Run Scan", href: "/?action=run-scan#run-scan" };
  }

  if (mentionsAny(normalized, ["save context", "saved context", "update memory", "update chat memory", "pull context into chat", "get context into chat", "do memory update"])) {
    return { label: "Save Context", href: "/?action=save-context#today-inputs" };
  }

  if (mentionsAny(normalized, ["health json", "open health json", "api health", "open api health"])) {
    return { label: "Health Status", href: "/api/health" };
  }

  return null;
}

function exactVisibleCommandRoute(normalized: string, pageContext?: ChatPageContext): ChatRouteHint | null {
  const exact = normalized.replace(/[.!?]+$/g, "").trim();

  if (exact === "today") {
    return { label: "Open Today", href: "/" };
  }

  if (exact === "portfolio") {
    return { label: "Open Portfolio", href: "/portfolio" };
  }

  if (exact === "activity") {
    return { label: "Open Activity", href: "/activity" };
  }

  if (exact === "trade") {
    return { label: "Open Trade", href: "/trading" };
  }

  if (exact === "settings") {
    return { label: "Open Settings", href: "/settings" };
  }

  if (exact === "connections") {
    return { label: "Portfolio Setup", href: "/settings#portfolio-connections" };
  }

  if (exact === "portfolio setup") {
    return { label: "Portfolio Setup", href: "/settings#portfolio-connections" };
  }

  if (exact === "next review") {
    return { label: "Open Journal", href: "/journal" };
  }

  if (exact === "recent calls") {
    return { label: "Open Journal", href: "/journal" };
  }

  if (exact === "record a call") {
    return { label: "Record A Call", href: "/journal#record-call" };
  }

  if (exact === "paper check") {
    return { label: "Submit Paper Trade", href: "/paper#paper-trade-form" };
  }

  if (exact === "paper trade" || exact === "submit paper trade" || exact === "next paper trade") {
    return { label: "Submit Paper Trade", href: "/paper#paper-trade-form" };
  }

  if (exact === "test as paper trade" || exact === "test as a paper trade") {
    return { label: "Prepare Top Paper Trade", href: "/paper?action=prepare-top-paper-trade#paper-trade-form" };
  }

  if (exact === "top activity") {
    return { label: "Activity List", href: "/activity#activity-list" };
  }

  if (exact === "needs attention" || exact === "urgent") {
    return { label: "Urgent Activity", href: "/activity?filter=urgent#activity-list" };
  }

  if (exact === "all") {
    return { label: "All Activity", href: "/activity#activity-list" };
  }

  if (exact === "worth checking") {
    return { label: "Worth Checking", href: "/activity?filter=worth-checking#activity-list" };
  }

  if (exact === "fyi") {
    return { label: "FYI Activity", href: "/activity?filter=fyi#activity-list" };
  }

  if (exact === "save call") {
    return { label: "Save Top Call", href: "/?action=save-top-call#top-idea" };
  }

  if (exact === "open idea") {
    return { label: "Top Idea", href: "/#top-idea" };
  }

  if (exact === "top holding") {
    return { label: "Holdings", href: "/portfolio#holdings" };
  }

  if (exact === "holdings") {
    return { label: "Holdings", href: "/portfolio#holdings" };
  }

  if (exact === "next action") {
    return { label: "Open Trade", href: "/trading" };
  }

  if (exact === "wallet status") {
    return { label: "Open Trade", href: "/trading" };
  }

  if (exact === "set up wallet") {
    return { label: "Open Trade", href: "/trading" };
  }

  if (exact === "ai keys" || exact === "ai/chat keys") {
    return { label: "AI/chat Keys", href: "/settings#ai-chat-keys" };
  }

  if (exact === "safety") {
    return { label: "Safety Limits", href: "/settings#safety-limits" };
  }

  if (exact === "show past view" || exact === "past view") {
    return { label: "Past View", href: pageRouteWithHash(pageContext, "past-view") };
  }

  if (exact === "return to now") {
    return { label: "Return To Now", href: pageRouteWithoutParam(pageContext, "as_of") };
  }

  if (exact === "paper") {
    return { label: "Open Paper", href: "/paper" };
  }

  if (exact === "journal") {
    return { label: "Open Journal", href: "/journal" };
  }

  if (exact === "set up a profile" || exact === "restore from backup") {
    return { label: "Profile", href: "/settings#profile" };
  }

  if (exact === "open health json" || exact === "health json") {
    return { label: "Health Status", href: "/api/health" };
  }

  return null;
}

function specificDirectRoute(normalized: string, pageContext?: ChatPageContext): ChatRouteHint | null {
  const exactAppTaskHint = exactAppTaskSectionHints(normalized, pageContext)[0];
  if (exactAppTaskHint) return exactAppTaskHint;

  if (mentionsAny(normalized, ["open settings", "go to settings", "show settings", "settings page", "open setup", "go to setup"])) {
    return { label: "Open Settings", href: "/settings" };
  }

  if (mentionsAny(normalized, ["web3 setup", "web3 wallet setup", "web3 trading setup", "wallet trading setup", "dedicated wallet setup", "trading settings", "web3 settings", "wallet settings"])) {
    return { label: "Web3 Setup", href: "/settings#web3-wallet-trading" };
  }

  if (mentionsAny(normalized, ["check trade", "check trading", "check web3", "web3 status", "trade status", "trading status", "pull trade", "pull trading", "pull web3", "get trade", "get trading", "get web3", "do web3 check", "do trade check"])) {
    return { label: "Open Trade", href: "/trading" };
  }

  if (mentionsAny(normalized, ["check portfolio", "portfolio risk", "check risk", "portfolio status", "pull portfolio", "pull holdings", "get portfolio", "get holdings", "do portfolio check", "do risk check"])) {
    return { label: "Holdings", href: "/portfolio#holdings" };
  }

  if (mentionsAny(normalized, ["check activity", "review activity", "activity status", "attention items", "pull activity", "pull alerts", "get activity", "get alerts", "do activity check"])) {
    return { label: "Activity List", href: "/activity#activity-list" };
  }

  if (mentionsAny(normalized, ["check setup", "check settings", "setup status", "settings status", "pull setup", "get setup", "do setup check", "do settings check"])) {
    return { label: "Open Settings", href: "/settings" };
  }

  if (mentionsAny(normalized, ["check connections", "test connections", "connection status", "connection checks", "pull connections", "get connections", "do connection check"])) {
    return { label: "Portfolio Setup", href: "/settings#portfolio-connections" };
  }

  if (mentionsAny(normalized, ["prepare paper trade", "prep paper trade", "start paper trade", "paper trade check", "pull paper trade", "get paper trade", "do paper trade", "do a paper trade"])) {
    return { label: "Submit Paper Trade", href: "/paper#paper-trade-form" };
  }

  if (mentionsAll(normalized, ["wallet", "setup"])) {
    return { label: "Open Trade", href: "/trading" };
  }

  if (mentionsAll(normalized, ["wallet", "status"])) {
    return { label: "Open Trade", href: "/trading" };
  }

  if (mentionsAll(normalized, ["next", "action"])) {
    return { label: "Open Trade", href: "/trading" };
  }

  if (
    mentionsAny(normalized, ["active position", "active positions", "open position", "open positions", "active order", "active orders", "open order", "open orders"]) ||
    mentionsAll(normalized, ["positions", "orders"])
  ) {
    return { label: "Open Trade", href: "/trading" };
  }

  if (mentionsAny(normalized, ["test trade", "paper test", "test-trade"])) {
    return { label: "Open Trade", href: "/trading" };
  }

  if (mentionsAny(normalized, ["trade monitor", "trading monitor", "monitor"])) {
    return { label: "Open Trade", href: "/trading" };
  }

  if (mentionsAny(normalized, ["technical details", "technical status", "status drawer"])) {
    return { label: "Open Trade", href: "/trading" };
  }

  if (mentionsAll(normalized, ["add", "holding"]) || mentionsAll(normalized, ["manual", "holding"])) {
    return { label: "Add Holding", href: "/portfolio?action=add-holding#add-holdings" };
  }

  if (mentionsAny(normalized, ["portfolio setup", "portfolio connection", "portfolio connections", "brokerage connection", "brokerage connections"])) {
    return { label: "Portfolio Setup", href: "/settings#portfolio-connections" };
  }

  if (mentionsAny(normalized, ["ai key", "ai keys", "chat key", "chat keys"])) {
    return { label: "AI/chat Keys", href: "/settings#ai-chat-keys" };
  }

  if (mentionsAny(normalized, ["record call", "record a call", "record decision", "record a decision", "save decision", "decision record"])) {
    return { label: "Record A Call", href: "/journal#record-call" };
  }

  if (mentionsAll(normalized, ["paper", "trade"]) || mentionsAny(normalized, ["paper trade form", "submit paper trade"])) {
    return { label: "Submit Paper Trade", href: "/paper#paper-trade-form" };
  }

  return null;
}

function combineIntentHints({
  wantsActivity,
  wantsTrade,
  wantsPortfolio,
  wantsSettings,
  wantsPaper,
  wantsJournal,
}: {
  wantsActivity: boolean;
  wantsTrade: boolean;
  wantsPortfolio: boolean;
  wantsSettings: boolean;
  wantsPaper: boolean;
  wantsJournal: boolean;
}): ChatRouteHint[] {
  const intentCount = [wantsActivity, wantsTrade, wantsPortfolio, wantsSettings, wantsPaper, wantsJournal].filter(Boolean).length;

  if (intentCount === 0) return [];

  if (intentCount === 1) {
    if (wantsTrade) return tradeHints();
    if (wantsPortfolio) return portfolioHints();
    if (wantsActivity) return activityHints();
    if (wantsSettings) return settingsHints();
    if (wantsPaper) return paperHints();
    if (wantsJournal) return journalHints();
  }

  if (wantsActivity && wantsTrade) {
    return dedupeHints([
      { label: "Open Activity", href: "/activity" },
      { label: "Open Trade", href: "/trading" },
      { label: "Trading Settings", href: "/settings#web3-wallet-trading" },
    ]);
  }

  if (wantsActivity && wantsPortfolio) {
    return dedupeHints([
      { label: "Open Activity", href: "/activity" },
      { label: "Open Portfolio", href: "/portfolio" },
      { label: "Add Holding", href: "/portfolio?action=add-holding#add-holdings" },
      { label: "Record A Call", href: "/journal#record-call" },
    ]);
  }

  if (wantsPortfolio && wantsSettings) {
    return dedupeHints([
      { label: "Open Portfolio", href: "/portfolio" },
      { label: "Portfolio Setup", href: "/settings#portfolio-connections" },
      { label: "Open Settings", href: "/settings" },
    ]);
  }

  if (wantsTrade && wantsSettings) {
    return dedupeHints([
      { label: "Open Trade", href: "/trading" },
      { label: "Trading Settings", href: "/settings#web3-wallet-trading" },
    ]);
  }

  return dedupeHints([
    ...(wantsActivity ? activityHints() : []),
    ...(wantsTrade ? tradeHints() : []),
    ...(wantsPortfolio ? portfolioHints() : []),
    ...(wantsSettings ? settingsHints() : []),
    ...(wantsPaper ? paperHints() : []),
    ...(wantsJournal ? journalHints() : []),
  ]);
}

function exactTradeSectionHints(normalized: string): ChatRouteHint[] {
  if (mentionsAll(normalized, ["wallet", "ownership"])) {
    return [
      { label: "Trading Settings", href: "/settings#web3-wallet-trading" },
      { label: "Open Trade", href: "/trading" },
    ];
  }

  if (mentionsAll(normalized, ["wallet", "status"])) {
    return [
      { label: "Open Trade", href: "/trading" },
    ];
  }

  if (mentionsAll(normalized, ["next", "action"])) {
    return [
      { label: "Open Trade", href: "/trading" },
    ];
  }

  if (
    mentionsAny(normalized, ["active position", "active positions", "open position", "open positions", "active order", "active orders", "open order", "open orders"]) ||
    mentionsAll(normalized, ["positions", "orders"])
  ) {
    return [
      { label: "Open Trade", href: "/trading" },
    ];
  }

  if (mentionsAll(normalized, ["wallet", "setup"])) {
    return [
      { label: "Open Trade", href: "/trading" },
      { label: "Trading Settings", href: "/settings#web3-wallet-trading" },
    ];
  }

  if (mentionsAny(normalized, ["test trade", "paper test", "test-trade"])) {
    return [
      { label: "Open Trade", href: "/trading" },
    ];
  }

  if (mentionsAny(normalized, ["trade monitor", "trading monitor", "monitor"])) {
    return [
      { label: "Open Trade", href: "/trading" },
    ];
  }

  if (mentionsAny(normalized, ["technical details", "technical status", "status drawer"])) {
    return [
      { label: "Open Trade", href: "/trading" },
      { label: "Trading Settings", href: "/settings#web3-wallet-trading" },
    ];
  }

  return [];
}

function exactAppTaskSectionHints(normalized: string, pageContext?: ChatPageContext): ChatRouteHint[] {
  const exactVisibleRoute = exactVisibleCommandRoute(normalized, pageContext);
  if (exactVisibleRoute) return [exactVisibleRoute];

  if (mentionsAny(normalized, ["largest visible holding", "largest holding", "top holding", "biggest holding", "largest position", "top position", "biggest position"])) {
    return [
      { label: "Holdings", href: "/portfolio#holdings" },
      { label: "Portfolio Chart", href: "/portfolio#portfolio-chart" },
      { label: "Activity List", href: "/activity#activity-list" },
    ];
  }

  if (mentionsAny(normalized, ["why test it", "why test this", "why would this paper idea", "why would this paper trade", "paper idea teach", "before risking real money"])) {
    return [
      { label: "Open Paper", href: "/paper" },
      { label: "Submit Paper Trade", href: "/paper#paper-trade-form" },
      { label: "Open Journal", href: "/journal" },
    ];
  }

  if (mentionsAny(normalized, ["add holding", "add a holding", "add holdings", "enter holding", "enter a holding", "manual holding", "manual holdings"])) {
    return [
      { label: "Add Holding", href: "/portfolio?action=add-holding#add-holdings" },
      { label: "Holdings", href: "/portfolio#holdings" },
      { label: "Portfolio Setup", href: "/settings#portfolio-connections" },
    ];
  }

  if (mentionsAny(normalized, ["kill switch drill", "kill-switch drill", "safety drill", "trade safety drill", "run kill switch drill", "run kill-switch drill", "run safety drill", "run trade safety drill", "run stop drill", "do kill switch drill", "do safety drill", "test kill switch", "test kill-switch", "start kill switch drill"])) {
    return [
      { label: "Run Safety Drill", href: "/trading?action=run-kill-switch-drill" },
      { label: "Open Trade", href: "/trading" },
    ];
  }

  if (mentionsAny(normalized, ["run paper test", "run the paper test", "run test trade", "run the test trade", "start paper test", "start the paper test", "start test trade", "do paper test", "do test trade"])) {
    return [
      { label: "Run Paper Test", href: "/paper#paper-trade-form" },
      { label: "Open Trade", href: "/trading" },
    ];
  }

  if (mentionsAny(normalized, ["record top idea", "record the top idea", "record top idea as decision", "record the top idea as a decision", "log top idea", "log the top idea", "journal top idea", "journal the top idea", "record top call", "log top call"])) {
    return [
      { label: "Record Top Idea", href: "/journal?action=record-top-idea#record-call" },
      { label: "Top Idea", href: "/#top-idea" },
      { label: "Open Journal", href: "/journal#record-call" },
    ];
  }

  if (mentionsAny(normalized, ["test top activity on paper", "test top alert on paper", "paper trade top activity", "paper trade top alert", "paper test top activity", "paper test top alert", "try top activity on paper", "try top alert on paper", "prepare top activity paper trade", "prepare top alert paper trade", "prepare activity item paper trade", "most important activity item", "paper trade activity", "paper trade this activity", "paper trade visible activity"])) {
    return [
      { label: "Prepare Top Activity Paper Trade", href: "/paper?action=prepare-top-activity-paper-trade#paper-trade-form" },
      { label: "Open Activity", href: "/activity#activity-list" },
      { label: "Open Paper", href: "/paper#paper-trade-form" },
    ];
  }

  if (mentionsAny(normalized, ["test top idea on paper", "paper trade top idea", "paper test top idea", "test top call on paper", "try top idea on paper", "prepare top paper trade", "test as paper trade", "test as a paper trade", "test this as paper trade", "test this as a paper trade", "test today's idea as paper trade", "test today idea as paper trade"])) {
    return [
      { label: "Prepare Top Paper Trade", href: "/paper?action=prepare-top-paper-trade#paper-trade-form" },
      { label: "Top Idea", href: "/#top-idea" },
      { label: "Open Paper", href: "/paper#paper-trade-form" },
    ];
  }

  if (mentionsAny(normalized, ["test portfolio connection", "test portfolio connections", "test account access", "test my connections", "test connections", "do connection check"])) {
    return [
      { label: "Test Portfolio Connection", href: "/settings?action=test-portfolio-connection#portfolio-connections" },
      { label: "Portfolio Setup", href: "/settings#portfolio-connections" },
      { label: "Data Privacy", href: "/settings#data-privacy" },
    ];
  }

  if (mentionsAny(normalized, ["import holdings snapshot", "import portfolio snapshot", "refresh portfolio balances", "refresh holdings", "pull portfolio balances", "pull holdings snapshot", "get holdings snapshot"])) {
    return [
      { label: "Import Holdings Snapshot", href: "/settings?action=import-portfolio-snapshot#portfolio-connections" },
      { label: "Open Portfolio", href: "/portfolio#holdings" },
      { label: "Portfolio Setup", href: "/settings#portfolio-connections" },
    ];
  }

  if (mentionsAny(normalized, ["test live chat", "test chat key", "test chat keys", "test ai key", "test ai keys", "test ai chat"])) {
    return [
      { label: "Test Live Chat", href: "/settings?action=test-live-chat#ai-chat-keys" },
      { label: "AI/chat Keys", href: "/settings#ai-chat-keys" },
      { label: "Data Privacy", href: "/settings#data-privacy" },
    ];
  }

  if (mentionsAny(normalized, ["ai/chat keys", "ai chat keys", "ai key", "ai keys", "chat key", "chat keys", "live chat key", "live chat keys"])) {
    return [
      { label: "AI/chat Keys", href: "/settings#ai-chat-keys" },
      { label: "Test Live Chat", href: "/settings?action=test-live-chat#ai-chat-keys" },
      { label: "Open Settings", href: "/settings" },
    ];
  }

  if (mentionsAny(normalized, ["save top activity", "save first activity", "save this activity", "save top alert", "save first alert", "save this alert", "save activity as decision", "save top activity as decision", "save as decision"])) {
    return [
      { label: "Save Top Activity", href: "/activity?action=save-top-activity#activity-list" },
      { label: "Open Activity", href: "/activity#activity-list" },
      { label: "Open Journal", href: "/journal" },
    ];
  }

  if (mentionsAny(normalized, ["dismiss top activity", "dismiss first activity", "dismiss this activity", "dismiss top alert", "dismiss first alert", "dismiss this alert"])) {
    return [
      { label: "Dismiss Top Activity", href: "/activity?action=dismiss-top-activity#activity-list" },
      { label: "Open Activity", href: "/activity#activity-list" },
      { label: "Undo In Activity", href: "/activity#activity-list" },
    ];
  }

  if (mentionsAny(normalized, ["mark top activity useful", "mark first activity useful", "mark this activity useful", "top activity was useful", "rate top activity useful", "mark top alert useful"])) {
    return [
      { label: "Mark Top Activity Useful", href: "/activity?action=mark-top-activity-useful#activity-list" },
      { label: "Open Activity", href: "/activity#activity-list" },
      { label: "Record A Call", href: "/journal#record-call" },
    ];
  }

  if (mentionsAny(normalized, ["mark top activity not useful", "mark first activity not useful", "mark this activity not useful", "top activity was not useful", "rate top activity not useful", "mark top alert not useful"])) {
    return [
      { label: "Mark Top Activity Not Useful", href: "/activity?action=mark-top-activity-not-useful#activity-list" },
      { label: "Open Activity", href: "/activity#activity-list" },
      { label: "Activity Filters", href: "/activity#activity-list" },
    ];
  }

  if (mentionsAny(normalized, ["save top call", "save the top call", "save this call", "save today call", "save top idea", "save this idea"])) {
    return [
      { label: "Save Top Call", href: "/?action=save-top-call#top-idea" },
      { label: "Top Idea", href: "/#top-idea" },
      { label: "Open Journal", href: "/journal" },
    ];
  }

  if (mentionsAny(normalized, ["open top idea", "show top idea", "pull top idea", "get top idea", "open today idea", "show today idea", "open idea for", "open the idea for"])) {
    return [
      { label: "Top Idea", href: "/#top-idea" },
      { label: "Open Today", href: "/" },
      { label: "Test On Paper", href: "/paper#paper-trade-form" },
    ];
  }

  if (mentionsAny(normalized, ["mark today useful", "rate today useful", "today was useful", "mark this useful", "rate this useful"])) {
    return [
      { label: "Mark Today Useful", href: "/?action=mark-today-useful#today-feedback" },
      { label: "Today Feedback", href: "/#today-feedback" },
      { label: "Open Journal", href: "/journal" },
    ];
  }

  if (mentionsAny(normalized, ["mark today not useful", "rate today not useful", "today was not useful", "mark this not useful", "rate this not useful"])) {
    return [
      { label: "Mark Today Not Useful", href: "/?action=mark-today-not-useful#today-feedback" },
      { label: "Today Feedback", href: "/#today-feedback" },
      { label: "Open Journal", href: "/journal" },
    ];
  }

  if (mentionsAny(normalized, ["run scan", "run today's scan", "market scan", "scan markets", "start scan"])) {
    return [
      { label: "Run Scan", href: "/?action=run-scan#run-scan" },
      { label: "Daily Rundown", href: "/#briefing" },
      { label: "System Status", href: "/review" },
    ];
  }

  if (mentionsAny(normalized, ["save context", "saved context", "update memory", "update chat memory"])) {
    return [
      { label: "Save Context", href: "/?action=save-context#today-inputs" },
      { label: "Today Inputs", href: "/#today-inputs" },
      { label: "Open Chat", href: "/chat" },
    ];
  }

  if (mentionsAny(normalized, ["today inputs", "chat memory"])) {
    return [
      { label: "Today Inputs", href: "/#today-inputs" },
      { label: "Open Chat", href: "/chat" },
      { label: "System Status", href: "/review" },
    ];
  }

  if (mentionsAny(normalized, ["holdings table", "show holdings", "view holdings", "portfolio holdings", "my holdings", "pull holdings", "get holdings"])) {
    return [
      { label: "Holdings", href: "/portfolio#holdings" },
      { label: "Add Holding", href: "/portfolio?action=add-holding#add-holdings" },
      { label: "Portfolio Setup", href: "/settings#portfolio-connections" },
    ];
  }

  if (mentionsAny(normalized, ["portfolio chart", "net worth chart", "allocation chart", "portfolio graph", "pull portfolio chart", "get portfolio chart", "pull net worth", "get net worth"])) {
    return [
      { label: "Portfolio Chart", href: "/portfolio#portfolio-chart" },
      { label: "Holdings", href: "/portfolio#holdings" },
      { label: "Open Trade", href: "/trading" },
    ];
  }

  const activityFilterHint = activityFilterSectionHints(normalized);
  if (activityFilterHint.length > 0) return activityFilterHint;

  if (mentionsAny(normalized, ["activity details", "details and response", "show response", "open response", "show suggested response", "open suggested response"])) {
    return [
      { label: "Activity Details", href: "/activity#activity-list" },
      { label: "Activity List", href: "/activity#activity-list" },
      { label: "Urgent Activity", href: "/activity?filter=urgent#activity-list" },
    ];
  }

  if (mentionsAny(normalized, ["activity list", "active items", "latest activity", "activity history"])) {
    return [
      { label: "Activity List", href: "/activity#activity-list" },
      { label: "Open Activity", href: "/activity" },
      { label: "Test On Paper", href: "/paper" },
    ];
  }

  if (mentionsAny(normalized, ["check activity", "review activity", "activity status", "attention items", "pull activity", "pull alerts", "get activity", "get alerts", "do activity check"])) {
    return [
      { label: "Activity List", href: "/activity#activity-list" },
      { label: "Urgent Activity", href: "/activity?filter=urgent#activity-list" },
      { label: "Test On Paper", href: "/paper#paper-trade-form" },
    ];
  }

  if (mentionsAny(normalized, ["check portfolio", "portfolio risk", "check risk", "portfolio status", "pull portfolio", "pull holdings", "get portfolio", "get holdings", "do portfolio check", "do risk check"])) {
    return [
      { label: "Holdings", href: "/portfolio#holdings" },
      { label: "Portfolio Chart", href: "/portfolio#portfolio-chart" },
      { label: "Add Holding", href: "/portfolio?action=add-holding#add-holdings" },
    ];
  }

  if (mentionsAny(normalized, ["check setup", "check settings", "setup status", "settings status", "pull setup", "get setup", "do setup check", "do settings check"])) {
    return [
      { label: "Open Settings", href: "/settings" },
      { label: "Portfolio Setup", href: "/settings#portfolio-connections" },
      { label: "Safety Limits", href: "/settings#safety-limits" },
    ];
  }

  if (mentionsAny(normalized, ["check connections", "test connections", "connection status", "connection checks", "pull connections", "get connections", "do connection check"])) {
    return [
      { label: "Portfolio Setup", href: "/settings#portfolio-connections" },
      { label: "AI/chat Keys", href: "/settings#ai-chat-keys" },
      { label: "Web3 Setup", href: "/settings#web3-wallet-trading" },
    ];
  }

  if (mentionsAny(normalized, ["record decision", "record a decision", "decision record"])) {
    return [
      { label: "Record A Call", href: "/journal#record-call" },
      { label: "Open Journal", href: "/journal" },
      { label: "Open Paper", href: "/paper" },
    ];
  }

  if (mentionsAny(normalized, ["prepare paper trade", "prep paper trade", "start paper trade", "paper trade check", "pull paper trade", "get paper trade", "do paper trade", "do a paper trade", "next paper trade"])) {
    return [
      { label: "Submit Paper Trade", href: "/paper#paper-trade-form" },
      { label: "Open Paper", href: "/paper" },
      { label: "Record A Call", href: "/journal#record-call" },
    ];
  }

  if (mentionsAny(normalized, ["profile settings", "my profile", "profile section", "edit profile", "set up a profile", "restore from backup"])) {
    return [
      { label: "Profile", href: "/settings#profile" },
      { label: "Portfolio Setup", href: "/settings#portfolio-connections" },
      { label: "Safety Limits", href: "/settings#safety-limits" },
    ];
  }

  if (mentionsAny(normalized, ["safety limit", "safety limits", "risk limit", "risk limits", "trade cap", "daily cap", "slippage"])) {
    return [
      { label: "Safety Limits", href: "/settings#safety-limits" },
      { label: "Trading Settings", href: "/settings#web3-wallet-trading" },
      { label: "Open Trade", href: "/trading" },
    ];
  }

  if (mentionsAny(normalized, ["data privacy", "privacy", "what leaves", "what stays local", "local data"])) {
    return [
      { label: "Data Privacy", href: "/settings#data-privacy" },
      { label: "Safety Limits", href: "/settings#safety-limits" },
      { label: "System Status", href: "/review" },
    ];
  }

  if (mentionsAny(normalized, ["web3 setup", "web3 wallet setup", "web3 trading setup", "wallet trading setup", "dedicated wallet setup", "trading settings", "web3 settings", "wallet settings"])) {
    return [
      { label: "Web3 Setup", href: "/settings#web3-wallet-trading" },
      { label: "Open Trade", href: "/trading" },
    ];
  }

  if (mentionsAny(normalized, ["recent calls", "saved calls", "past calls"])) {
    return [
      { label: "Open Journal", href: "/journal" },
      { label: "Record A Call", href: "/journal#record-call" },
      { label: "Open Paper", href: "/paper" },
    ];
  }

  return [];
}

function activityFilterSectionHints(normalized: string): ChatRouteHint[] {
  if (normalized === "all" || mentionsAny(normalized, ["show all activity", "open all activity", "all activity", "activity all"])) {
    return [
      { label: "All Activity", href: "/activity#activity-list" },
      { label: "Urgent Activity", href: "/activity?filter=urgent#activity-list" },
      { label: "Worth Checking", href: "/activity?filter=worth-checking#activity-list" },
    ];
  }

  if (mentionsAny(normalized, ["urgent activity", "urgent alerts", "needs attention", "what needs attention"])) {
    return [
      { label: "Urgent Activity", href: "/activity?filter=urgent#activity-list" },
      { label: "All Activity", href: "/activity#activity-list" },
      { label: "Test On Paper", href: "/paper" },
    ];
  }

  if (mentionsAny(normalized, ["worth checking activity", "worth checking alerts", "worth checking"])) {
    return [
      { label: "Worth Checking", href: "/activity?filter=worth-checking#activity-list" },
      { label: "All Activity", href: "/activity#activity-list" },
      { label: "Record A Call", href: "/journal#record-call" },
    ];
  }

  if (normalized === "fyi" || mentionsAny(normalized, ["fyi activity", "fyi alerts", "for your information"])) {
    return [
      { label: "FYI Activity", href: "/activity?filter=fyi#activity-list" },
      { label: "All Activity", href: "/activity#activity-list" },
      { label: "Open Portfolio", href: "/portfolio" },
    ];
  }

  return [];
}

function routeHintsForSurface(surface: string): ChatRouteHint[] {
  if (surface === "trade") return tradeHints();
  if (surface === "portfolio") return portfolioHints();
  if (surface === "activity") return activityHints();
  if (surface === "settings") return settingsHints();
  if (surface === "paper") return paperHints();
  if (surface === "decision journal") return journalHints();
  if (surface === "chat") return chatHints();

  return [
    { label: "Open Today", href: "/" },
    { label: "Check Activity", href: "/activity" },
    { label: "Open Trade", href: "/trading" },
  ];
}

function capabilityQuestionHints(normalized: string, surface: string): ChatRouteHint[] {
  if (!mentionsAny(normalized, [
    "what can you do",
    "what can this do",
    "what can it do",
    "what can i do",
    "what can master mold do",
    "what should i do here",
    "what can i ask",
    "what can i ask you",
    "help me use this",
    "help me with this page",
    "show me what i can do",
  ])) {
    return [];
  }

  return routeHintsForSurface(surface);
}

function tradeHints(): ChatRouteHint[] {
  return [
    { label: "Open Trade", href: "/trading" },
    { label: "Autopilot Settings", href: "/settings#web3-wallet-trading" },
    { label: "Safety Limits", href: "/settings#safety-limits" },
  ];
}

function portfolioHints(): ChatRouteHint[] {
  return [
    { label: "Holdings", href: "/portfolio#holdings" },
    { label: "Add Holding", href: "/portfolio?action=add-holding#add-holdings" },
    { label: "Portfolio Setup", href: "/settings#portfolio-connections" },
  ];
}

function activityHints(): ChatRouteHint[] {
  return [
    { label: "Open Activity", href: "/activity" },
    { label: "Test On Paper", href: "/paper" },
    { label: "Record A Call", href: "/journal#record-call" },
  ];
}

function settingsHints(): ChatRouteHint[] {
  return [
    { label: "Profile", href: "/settings#profile" },
    { label: "Portfolio Setup", href: "/settings#portfolio-connections" },
    { label: "Web3 Setup", href: "/settings#web3-wallet-trading" },
    { label: "Safety Limits", href: "/settings#safety-limits" },
  ];
}

function paperHints(): ChatRouteHint[] {
  return [
    { label: "Open Paper", href: "/paper" },
    { label: "Submit Paper Trade", href: "/paper#paper-trade-form" },
    { label: "Open Journal", href: "/journal" },
  ];
}

function journalHints(): ChatRouteHint[] {
  return [
    { label: "Open Journal", href: "/journal" },
    { label: "Record A Call", href: "/journal#record-call" },
    { label: "Open Paper", href: "/paper" },
  ];
}

function chatHints(): ChatRouteHint[] {
  return [
    { label: "Run Scan", href: "/?action=run-scan#run-scan" },
    { label: "Add Holding", href: "/portfolio?action=add-holding#add-holdings" },
    { label: "Open Trade", href: "/trading" },
    { label: "Import Holdings", href: "/settings?action=import-portfolio-snapshot#portfolio-connections" },
  ];
}

function pageRouteWithHash(pageContext: ChatPageContext | undefined, hash: string) {
  const base = safePageContextRoute(pageContext);
  const [withoutHash] = base.split("#");
  return `${withoutHash}#${hash}`;
}

function pageRouteWithoutParam(pageContext: ChatPageContext | undefined, paramName: string) {
  const base = safePageContextRoute(pageContext);
  const [withoutHash] = base.split("#");
  const [pathname, query = ""] = withoutHash.split("?");
  if (!query) return pathname || "/";

  const params = new URLSearchParams(query);
  params.delete(paramName);
  const nextQuery = params.toString();
  return nextQuery ? `${pathname}?${nextQuery}` : pathname || "/";
}

function safePageContextRoute(pageContext: ChatPageContext | undefined) {
  const route = pageContext?.route?.trim();
  if (!route || !route.startsWith("/") || route.startsWith("//") || route.startsWith("/api/")) return "/";
  return route;
}

function mentionsAny(normalized: string, phrases: string[]) {
  return phrases.some((phrase) => normalized.includes(phrase));
}

function mentionsAll(normalized: string, phrases: string[]) {
  return phrases.every((phrase) => normalized.includes(phrase));
}

function isDirectNavigationRequest(normalized: string) {
  return mentionsAny(normalized, [
    "open ",
    "show ",
    "show me",
    "check ",
    "review ",
    "prepare ",
    "prep ",
    "start ",
    "record ",
    "save ",
    "go to",
    "take me",
    "take me to",
    "pull up",
    "bring up",
    "view ",
    "jump to",
  ]) || (
    mentionsAny(normalized, ["pull ", "get ", "do "]) &&
    mentionsAny(normalized, [
      "activity",
      "alert",
      "chart",
      "connection",
      "context",
      "holding",
      "memory",
      "paper trade",
      "portfolio",
      "risk",
      "scan",
      "setup",
      "settings",
      "trade",
      "trading",
      "wallet",
      "web3",
    ])
  );
}

function isCommandLikeDraft(normalized: string) {
  return /^(check|open|show|review|prepare|prep|start|record|save|add|enter|go|pull|get|do|run|mark|import|dismiss|test)\b/i.test(normalized);
}

function isAnswerRequest(normalized: string) {
  return /^(what|why|how|should|could|would|can you|do i|does|is|are|tell me|explain|summarize)\b/i.test(normalized);
}

function isSafeAppRoute(href: string) {
  return href.startsWith("/") && !href.startsWith("//") && !href.startsWith("/api/");
}

function dedupeHints(hints: ChatRouteHint[]) {
  const seen = new Set<string>();
  const deduped: ChatRouteHint[] = [];

  for (const hint of hints) {
    if (seen.has(hint.href)) continue;
    seen.add(hint.href);
    deduped.push(hint);
  }

  return deduped;
}
