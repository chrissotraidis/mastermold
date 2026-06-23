import { getChatContext, getChatFacts, type ChatPageContext } from "@/src/db/chat";
import { getAlerts } from "@/src/db/alerts";
import { getBrainState, initializeMarketBrain } from "@/src/db/brain";
import { parseAsOf, type AsOfFilter } from "@/src/db/bitemporal";
import { getIntegrationStatuses } from "@/src/db/integrations";
import { getJournal } from "@/src/db/journal";
import { getPaperPageData } from "@/src/db/paper";
import { getPortfolio } from "@/src/db/portfolio";
import { getScanStatusLine, isScanRunning, runMarketScan, scanRunnerAvailable } from "@/src/db/scan";
import { peekCachedWeb3TradingState, warmCachedWeb3TradingState } from "@/src/db/web3-trading-state-cache";
import {
  type TradingAccountMode,
  type TradingMarketSource,
  type TradingScenario,
} from "@/src/db/web3-trading";
import { cleanAlertMessage, shortAlertTierLabel } from "@/lib/alert-loop";
import { plainBriefingHeadline, plainBriefingText } from "@/lib/plain-finance-copy";
import { plainPaperCopy } from "@/lib/paper-copy";
import {
  buildUserPromptForRequest,
  cleanChatText,
  inferResponseCleanupMode,
  type ChatTextCleanupMode,
} from "@/lib/chat-copy";

type ChatRequest = {
  message?: unknown;
  messages?: unknown;
  page_context?: unknown;
  as_of?: unknown;
};

type TradeCommandRequest = {
  account: TradingAccountMode;
  source: TradingMarketSource;
  scenario: TradingScenario;
};

type ChatAction = {
  label: string;
  href: string;
};

type LocalCommandAnswer = {
  body: string;
  actions: ChatAction[];
};

const TRADE_COMMAND_STATE_TTL_MS = 10_000;

export async function POST(request: Request): Promise<Response> {
  const parsed = await parseChatRequest(request);

  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 422 });
  }

  const message = parsed.message || "Summarize the advisory context.";
  const localCommandAnswer = await buildLocalCommandAnswer(message, parsed.pageContext, parsed.asOf);

  if (localCommandAnswer) {
    return textStream(localCommandAnswer.body, localCommandHeaders(parsed.pageContext, localCommandAnswer.actions));
  }

  const context = getChatContext(parsed.asOf);
  const userMessage = buildUserPromptForRequest(message);
  const responseMode = inferResponseCleanupMode(message);
  const baseLlmContext = contextWithPageContext(context.llm_context, parsed.pageContext);
  const budget = chatBudget(userMessage, baseLlmContext);
  const llmContext = contextWithInferenceBudget(baseLlmContext, budget);
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!budget.ok) {
    return Response.json(
      {
        error: "This question is too large to send to live chat. Ask a shorter question or narrow the page context.",
        code: "budget",
        provider: "Master Mold",
      },
      {
        status: 413,
        headers: {
          ...chatHeaders(context, "canned", "budget-guard", budget),
          "X-Chat-Error-Code": "budget",
        },
      },
    );
  }

  if (anthropicKey) {
    const model = process.env.ANTHROPIC_MODEL ?? "claude-3-5-haiku-latest";
    return streamAnthropicResponse(
      anthropicKey,
      model,
      userMessage,
      llmContext,
      chatHeaders(context, "anthropic", model, budget),
      responseMode,
      budget,
    );
  }

  if (openrouterKey) {
    const model = process.env.OPENROUTER_MODEL ?? "deepseek/deepseek-chat";
    return streamOpenRouterResponse(
      openrouterKey,
      model,
      userMessage,
      llmContext,
      chatHeaders(context, "openrouter", model, budget),
      responseMode,
      budget,
    );
  }

  if (openaiKey) {
    const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
    return streamOpenAIResponse(
      openaiKey,
      model,
      userMessage,
      llmContext,
      chatHeaders(context, "openai", model, budget),
      responseMode,
      budget,
    );
  }

  return textStream(context.fallback_response, {
    ...chatHeaders(context, "canned", "local-fallback", budget),
  });
}

async function buildLocalCommandAnswer(
  message: string,
  pageContext?: ChatPageContext,
  asOf: AsOfFilter | null = null,
): Promise<LocalCommandAnswer | null> {
  const normalized = message.toLowerCase();

  if (wantsCapabilityAnswer(normalized)) {
    return {
      body: [
        "You can ask Master Mold to check Today, explain portfolio risk, review activity, prepare a paper trade, check Trade/Web3 status, open setup flows, and point you to the right Settings step.",
        "It can pull local app context and saved reads into one plain answer.",
        "It cannot sign transactions, place orders, move funds, reveal credentials, or make a live-money decision for you.",
      ].join(" "),
      actions: [
        { label: "Open Today", href: "/" },
        { label: "Check Portfolio", href: "/portfolio" },
        { label: "Check Trade", href: "/trading" },
        { label: "Open Settings", href: "/settings" },
      ],
    };
  }

  const appActionAnswer = buildDirectAppActionAnswer(normalized);
  if (appActionAnswer) {
    return appActionAnswer;
  }

  if (wantsSpecificActivityExplanation(normalized)) {
    return buildSpecificActivityExplanationAnswer(message);
  }

  if (wantsTradeStatus(normalized, pageContext)) {
    return buildTradeCommandAnswer(pageContext);
  }

  if (wantsActivityStatus(normalized, pageContext)) {
    return buildActivityCommandAnswer(asOf);
  }

  if (wantsPortfolioStatus(normalized, pageContext)) {
    return buildPortfolioCommandAnswer(asOf);
  }

  if (wantsPaperStatus(normalized, pageContext)) {
    return buildPaperCommandAnswer(asOf);
  }

  if (wantsJournalStatus(normalized, pageContext)) {
    return buildJournalCommandAnswer(asOf);
  }

  if (wantsSettingsStatus(normalized, pageContext)) {
    return buildSettingsCommandAnswer();
  }

  if (wantsChatContextRefresh(normalized)) {
    return buildChatContextRefreshAnswer();
  }

  if (wantsMarketScanRun(normalized)) {
    return buildMarketScanRunAnswer();
  }

  if (wantsTodayStatus(normalized, pageContext)) {
    return buildTodayCommandAnswer(asOf);
  }

  return null;
}

function buildTradeCommandAnswer(pageContext?: ChatPageContext): LocalCommandAnswer {
  const request = tradeStatusRequestFromPage(pageContext);
  const state = peekCachedWeb3TradingState(request);

  if (!state) {
    warmCachedWeb3TradingState(request, TRADE_COMMAND_STATE_TTL_MS);
    return {
      body: [
        "Trade check: safe action first.",
        "Open Trade and start with wallet setup, then review the next test trade once the desk status finishes refreshing.",
        "I am warming the deeper Web3 status in the background. No trade can run from chat, and I cannot sign, submit, or move funds.",
      ].join(" "),
      actions: tradeActions(),
    };
  }

  const walletKey =
    state.autonomous_custody_mandate.wallet_public_key ??
    state.live_wallet_accounting_readiness.wallet_public_key ??
    state.execution_readiness.config.wallet_public_key ??
    null;
  const walletNeedsSetup = !walletKey || state.wallet_holdings_adapter.status === "blocked";
  const positions = state.autonomous_portfolio_mark_board.items;
  const orders = state.autonomous_action_queue.items.filter((item) =>
    item.priority === "now" || item.priority === "next" || item.status === "ready",
  );
  const directive = state.autonomous_trading_directive;
  const nextAction = walletNeedsSetup
    ? "set up a dedicated wallet before any live-trading review"
    : directive.paper_trade_ready || state.autonomous_order_ticket.can_auto_paper
      ? `review the next test trade${directive.symbol ? ` for ${directive.symbol}` : ""}`
      : plainCommandCopy(directive.next_action || state.autonomous_action_queue.next_action || "review the trade monitor");
  const cleanNextAction = nextAction.replace(/[.]+$/g, "");

  return {
    body: [
      `Trade check: wallet status ${walletNeedsSetup ? "needs setup" : "looks connected"}.`,
      `${positions.length} open position${positions.length === 1 ? "" : "s"} and ${orders.length} queued paper order${orders.length === 1 ? "" : "s"} are visible in Trade status.`,
      `Next: ${cleanNextAction}.`,
      "I can help you review the setup and test-trade flow, but I cannot sign, submit, or move funds.",
    ].join(" "),
    actions: tradeActions(walletNeedsSetup),
  };
}

function wantsCapabilityAnswer(normalized: string) {
  return (
    normalized.includes("what can you do") ||
    normalized.includes("what can master mold do") ||
    normalized.includes("what can this app do") ||
    normalized.includes("what can the app do") ||
    normalized.includes("what commands can i use") ||
    normalized.includes("show commands") ||
    normalized.includes("list commands") ||
    normalized.includes("command list") ||
    normalized.includes("what can i ask") ||
    normalized.includes("what can i do") ||
    normalized === "help"
  );
}

function wantsTradeStatus(normalized: string, pageContext?: ChatPageContext) {
  const onTradeSurface = pageContext?.surface.toLowerCase() === "trade";
  const tradeWords = [
    "web3",
    "trade",
    "trading",
    "wallet",
    "order",
    "orders",
    "position",
    "positions",
    "test trade",
    "provider",
    "ownership",
    "live trading",
    "technical",
  ];
  const actionWords = ["check", "status", "pull", "do", "next", "need", "needs", "review", "activity", "setup", "set up", "show", "run", "start"];
  const hasTradeWord = tradeWords.some((word) => normalized.includes(word));
  const hasActionWord = actionWords.some((word) => normalized.includes(word));
  const hasSurfaceOnlyAction = ["next", "need", "needs", "status", "review", "activity", "setup", "set up", "do"].some((word) =>
    normalized.includes(word),
  );
  const hasExplicitOtherDomain = [
    "win rate",
    "journal",
    "decision",
    "portfolio",
    "holding",
    "holdings",
    "top idea",
    "best idea",
    "today",
    "connection",
    "connections",
    "settings",
    "profile",
    "safety",
    "paper",
  ].some((word) => normalized.includes(word));

  return (onTradeSurface && hasActionWord && (hasTradeWord || (hasSurfaceOnlyAction && !hasExplicitOtherDomain))) ||
    (hasTradeWord && hasActionWord);
}

function wantsTodayStatus(normalized: string, pageContext?: ChatPageContext) {
  const onTodaySurface = pageContext?.surface.toLowerCase() === "today";
  const todayWords = ["today", "focus", "rundown", "daily", "top idea", "best idea", "what should i do", "next step"];
  const actionWords = ["check", "status", "pull", "summary", "summarize", "review", "what", "why", "show", "next", "focus", "today", "do"];
  return (onTodaySurface && actionWords.some((word) => normalized.includes(word))) ||
    (todayWords.some((word) => normalized.includes(word)) && actionWords.some((word) => normalized.includes(word)));
}

function wantsPortfolioStatus(normalized: string, pageContext?: ChatPageContext) {
  const onPortfolioSurface = pageContext?.surface.toLowerCase() === "portfolio";
  const portfolioWords = ["portfolio", "holdings", "holding", "net worth", "allocation", "risk", "concentration"];
  const actionWords = ["check", "status", "pull", "summary", "summarize", "review", "what", "next", "risk", "refresh", "import", "update", "balance", "balances"];
  return (onPortfolioSurface && actionWords.some((word) => normalized.includes(word))) ||
    (portfolioWords.some((word) => normalized.includes(word)) && actionWords.some((word) => normalized.includes(word)));
}

function wantsActivityStatus(normalized: string, pageContext?: ChatPageContext) {
  const onActivitySurface = pageContext?.surface.toLowerCase() === "activity";
  const activityWords = ["activity", "alert", "alerts", "item", "top item", "urgent", "attention", "changed", "needs"];
  const actionWords = ["check", "status", "pull", "summary", "summarize", "review", "what", "why", "matter", "matters", "mark", "useful", "save", "next", "need", "activity"];
  return (onActivitySurface && actionWords.some((word) => normalized.includes(word))) ||
    (activityWords.some((word) => normalized.includes(word)) && actionWords.some((word) => normalized.includes(word)));
}

function wantsSettingsStatus(normalized: string, pageContext?: ChatPageContext) {
  const onSettingsSurface = pageContext?.surface.toLowerCase() === "settings";
  const setupWords = ["settings", "setup", "configure", "configuration", "connect", "connection", "connections", "keys", "key", "profile", "safety", "limits"];
  const actionWords = ["check", "test", "status", "pull", "summary", "summarize", "review", "what", "next", "need", "needs", "set up", "setup", "configure"];
  return (onSettingsSurface && actionWords.some((word) => normalized.includes(word))) ||
    (setupWords.some((word) => normalized.includes(word)) && actionWords.some((word) => normalized.includes(word)));
}

function wantsPaperStatus(normalized: string, pageContext?: ChatPageContext) {
  const onPaperSurface = pageContext?.surface.toLowerCase() === "paper";
  const paperWords = ["paper", "paper trade", "paper trading", "simulator", "test idea", "test trade"];
  const actionWords = ["prepare", "check", "status", "pull", "summary", "summarize", "review", "what", "next", "test", "trade", "paper"];
  return (onPaperSurface && actionWords.some((word) => normalized.includes(word))) ||
    (paperWords.some((word) => normalized.includes(word)) && actionWords.some((word) => normalized.includes(word)));
}

function wantsJournalStatus(normalized: string, pageContext?: ChatPageContext) {
  const onJournalSurface = pageContext?.surface.toLowerCase() === "decision journal";
  const journalWords = ["journal", "decision", "call", "calls", "track record", "review quality", "record", "win rate"];
  const actionWords = ["check", "status", "pull", "summary", "summarize", "review", "what", "show", "next", "record", "log", "recent", "latest", "calls", "win rate"];
  return (onJournalSurface && actionWords.some((word) => normalized.includes(word))) ||
    (journalWords.some((word) => normalized.includes(word)) && actionWords.some((word) => normalized.includes(word)));
}

function wantsChatContextRefresh(normalized: string) {
  const contextWords = [
    "save context for chat",
    "update chat memory",
    "update chat context",
    "refresh chat memory",
    "refresh chat context",
    "save chat context",
    "save today context",
    "save page context",
    "save current context",
    "save context",
    "save this context",
    "remember context",
    "remember this view",
    "remember this page",
    "remember current view",
  ];
  const actionWords = ["save", "update", "refresh", "remember"];
  return contextWords.some((word) => normalized.includes(word)) ||
    (normalized.includes("chat context") && actionWords.some((word) => normalized.includes(word)));
}

function wantsMarketScanRun(normalized: string) {
  const scanWords = [
    "run today's scan",
    "run todays scan",
    "run scan",
    "run a scan",
    "start today's scan",
    "start todays scan",
    "start scan",
    "start a scan",
    "scan markets",
    "scan the market",
    "scan market",
    "scan watchlist",
    "refresh today's read",
    "refresh todays read",
    "pull fresh market",
    "pull a fresh market",
  ];
  return scanWords.some((word) => normalized.includes(word));
}

function buildDirectAppActionAnswer(normalized: string): LocalCommandAnswer | null {
  if (mentionsAny(normalized, ["system health", "pull system health", "app health", "health status", "health check", "health json", "reviewer health"])) {
    return {
      body: [
        "System health: open System status for the plain reviewer view, or Health status for the local check.",
        "Use this to see what works, what is sample, what needs keys, and what is missing.",
        "Health checks are read-only; they cannot trade, sign, or move funds.",
      ].join(" "),
      actions: [
        { label: "System Status", href: "/review" },
        { label: "Health Status", href: "/api/health" },
        { label: "Open Settings", href: "/settings" },
      ],
    };
  }

  if (mentionsAny(normalized, ["web3 setup", "web3 settings", "trading setup", "trade setup", "open web3 setup", "open trading setup"])) {
    return {
      body: [
        "Web3 setup: open Settings at the wallet and trading setup section.",
        "That is where wallet/provider readiness and safety setup live in plain English.",
        "Master Mold cannot sign, submit, or move funds.",
      ].join(" "),
      actions: [
        { label: "Web3 Setup", href: "/settings#web3-wallet-trading" },
        { label: "Set Up Wallet", href: "/trading#wallet-setup" },
        { label: "Open Trade", href: "/trading" },
      ],
    };
  }

  if (mentionsAny(normalized, ["account connections", "connection setup", "connected accounts", "brokerage connections", "portfolio accounts", "account access"])) {
    return {
      body: [
        "Account connections: open Portfolio connections in Settings.",
        "You can test read-only access or import a holdings snapshot only when you press the import action.",
        "Connection checks do not trade, move funds, or import balances by themselves.",
      ].join(" "),
      actions: [
        { label: "Portfolio Connections", href: "/settings#portfolio-connections" },
        { label: "Open Portfolio", href: "/portfolio" },
        { label: "Add Holding", href: "/portfolio?action=add-holding#add-holdings" },
      ],
    };
  }

  if (mentionsAny(normalized, ["profile backup", "restore backup", "restore my backup", "restore profile backup", "restore my profile backup", "import profile", "export profile", "backup profile"])) {
    return {
      body: [
        "Profile backup: open Settings and use Backup & restore inside Profile.",
        "Backups restore local preferences and saved setup fields only after you choose the file.",
        "Chat cannot read your files, import a backup, or change local storage by itself.",
      ].join(" "),
      actions: [
        { label: "Open Profile", href: "/settings#profile" },
        { label: "Open Settings", href: "/settings" },
        { label: "Check Setup", href: "/chat?q=Check%20setup" },
      ],
    };
  }

  if (mentionsAny(normalized, ["profile setup", "set up profile", "setup profile", "update profile", "edit profile", "profile settings", "open profile"])) {
    return {
      body: [
        "Profile setup: open Settings and review your name, style, and local preferences.",
        "Those details help Today, chat, and saved briefings feel personal.",
        "No credentials, trades, or account access are changed from this answer.",
      ].join(" "),
      actions: [
        { label: "Open Profile", href: "/settings#profile" },
        { label: "Open Settings", href: "/settings" },
        { label: "Portfolio Setup", href: "/settings#portfolio-connections" },
      ],
    };
  }

  if (mentionsAny(normalized, [
    "urgent activity",
    "urgent alerts",
    "show urgent",
    "what needs attention",
    "needs attention",
  ])) {
    return buildActivityFilterCommandAnswer(
      "Urgent activity",
      "/activity?filter=urgent#activity-list",
      "Urgent activity: open Activity filtered to the items that need attention first.",
    );
  }

  if (mentionsAny(normalized, [
    "worth checking activity",
    "worth checking alerts",
    "show worth checking",
    "worth checking",
  ])) {
    return buildActivityFilterCommandAnswer(
      "Worth checking",
      "/activity?filter=worth-checking#activity-list",
      "Worth checking: open Activity filtered to items worth reviewing when you have a minute.",
    );
  }

  if (mentionsAny(normalized, [
    "fyi activity",
    "fyi alerts",
    "show fyi",
    "for your information",
  ])) {
    return buildActivityFilterCommandAnswer(
      "FYI activity",
      "/activity?filter=fyi#activity-list",
      "FYI activity: open Activity filtered to lower-priority context.",
    );
  }

  if (mentionsAny(normalized, [
    "review active items",
    "open active items",
    "activity list",
    "review activity list",
    "open activity list",
    "dismiss the top activity item",
    "dismiss top activity",
    "dismiss activity item",
    "dismiss top alert",
    "acknowledge the top alert",
    "acknowledge top alert",
    "acknowledge alert",
    "restore alert",
  ])) {
    return {
      body: [
        "Activity list: open Activity and start with the active items.",
        "You can dismiss, restore, ask why an item matters, save it as a decision, or test it on paper from there.",
        "Chat does not dismiss items by itself; the Activity page keeps the visible confirmation step.",
      ].join(" "),
      actions: [
        { label: "Review Active Items", href: "/activity#activity-list" },
        { label: "Ask Why It Matters", href: "/chat?q=Why%20does%20the%20top%20activity%20item%20matter%3F" },
        { label: "Test On Paper", href: "/paper#paper-trade-form" },
      ],
    };
  }

  if (mentionsAny(normalized, ["system status", "health json", "health check", "reviewer status", "what is real"])) {
    return {
      body: [
        "System status: open the reviewer status page for what works, what is sample, what needs keys, and what is missing.",
        "Health status is available for reviewers who need the local endpoint check.",
        "This status check does not run trades, sign, or move funds.",
      ].join(" "),
      actions: [
        { label: "System Status", href: "/review" },
        { label: "Health Status", href: "/api/health" },
        { label: "Open Settings", href: "/settings" },
      ],
    };
  }

  if (mentionsAny(normalized, ["trade monitor", "trading monitor", "open monitor", "active positions", "active orders"])) {
    return {
      body: [
        "Trading monitor: open Trade where active positions, queued paper orders, and monitor status are grouped.",
        "Use it to review what is already open before touching the test-trade flow.",
        "Chat can route and explain, but it cannot submit or sign orders.",
      ].join(" "),
      actions: [
        { label: "Open Monitor", href: "/trading#trading-monitor" },
        { label: "Open Trade", href: "/trading" },
        { label: "Review Test Trade", href: "/trading#test-trade-flow" },
      ],
    };
  }

  if (mentionsAny(normalized, ["test trade flow", "run a test trade", "start a test trade", "start test trade", "review test trade", "next test trade"])) {
    return {
      body: [
        "Test trade flow: open Trade and review the next test-trade step before anything live is considered.",
        "The flow stays paper-gated and requires visible setup review.",
        "Chat cannot sign, submit, or move funds.",
      ].join(" "),
      actions: [
        { label: "Review Test Trade", href: "/trading#test-trade-flow" },
        { label: "Set Up Wallet", href: "/trading#wallet-setup" },
        { label: "Open Monitor", href: "/trading#trading-monitor" },
      ],
    };
  }

  if (mentionsAny(normalized, [
    "technical details",
    "technical status",
    "raw diagnostics",
    "raw status",
    "open diagnostics",
    "provider health",
    "wallet ownership",
    "ownership check",
    "live trading review",
    "review before live trading",
    "before live trading",
  ])) {
    return {
      body: [
        "Technical details: open the collapsed Trade details for reviewer endpoints and deeper status.",
        "The main Trade page stays plain; detailed status remains tucked away unless you ask for it.",
        "Detailed status is read-only and cannot trade, sign, or move funds.",
      ].join(" "),
      actions: [
        { label: "Technical Details", href: "/trading?details=technical#technical-status" },
        { label: "System Status", href: "/review" },
        { label: "Open Trade", href: "/trading" },
      ],
    };
  }

  if (mentionsAny(normalized, ["add holding", "add a holding", "add holdings", "enter holding", "enter a holding", "manual holding", "manual holdings"])) {
    return {
      body: [
        "Add holding: open Portfolio and use the manual holdings form.",
        "Manual entries update Today, Portfolio, and chat context locally.",
        "No brokerage, wallet, trade, or live account action happens from this step.",
      ].join(" "),
      actions: [
        { label: "Add Holding", href: "/portfolio?action=add-holding#add-holdings" },
        { label: "Portfolio Setup", href: "/settings#portfolio-connections" },
        { label: "Save Context", href: "/?action=save-context#today-inputs" },
      ],
    };
  }

  if (mentionsAny(normalized, ["import holdings", "import my holdings", "import portfolio", "import my portfolio", "connect portfolio", "portfolio connection", "portfolio setup"])) {
    return {
      body: [
        "Portfolio setup: open Settings to test read-only portfolio connections or import a holdings snapshot when you choose.",
        "Connection checks do not import balances by themselves.",
        "No trading or fund movement happens here.",
      ].join(" "),
      actions: [
        { label: "Portfolio Setup", href: "/settings#portfolio-connections" },
        { label: "Open Portfolio", href: "/portfolio" },
        { label: "Add Holding", href: "/portfolio?action=add-holding#add-holdings" },
      ],
    };
  }

  if (mentionsAny(normalized, ["submit paper trade", "start paper trade", "new paper trade", "paper trade form", "paper test"])) {
    return {
      body: [
        "Paper trade: open the paper form and write the reason before the result is obvious.",
        "This uses simulator dollars only.",
        "No real money moves from Paper.",
      ].join(" "),
      actions: [
        { label: "Submit Paper Trade", href: "/paper#paper-trade-form" },
        { label: "Open Paper", href: "/paper" },
        { label: "Record A Call", href: "/journal#record-call" },
      ],
    };
  }

  if (mentionsAny(normalized, ["record a call", "record a journal call", "log a call", "save a call", "record decision", "log decision", "journal entry"])) {
    return {
      body: [
        "Record a call: open the journal form and save the reason before the result is obvious.",
        "That gives Master Mold something honest to review later.",
        "No trade, order, or account action happens from a journal entry.",
      ].join(" "),
      actions: [
        { label: "Record A Call", href: "/journal#record-call" },
        { label: "Open Journal", href: "/journal" },
        { label: "Submit Paper Trade", href: "/paper#paper-trade-form" },
      ],
    };
  }

  if (mentionsAny(normalized, ["set up wallet", "setup wallet", "wallet setup", "connect wallet", "dedicated wallet"])) {
    return {
      body: [
        "Wallet setup: open Trade wallet setup or the Web3 setup section in Settings.",
        "Use a dedicated wallet and keep private keys out of chat.",
        "Master Mold cannot sign, submit, or move funds.",
      ].join(" "),
      actions: [
        { label: "Set Up Wallet", href: "/trading#wallet-setup" },
        { label: "Web3 Setup", href: "/settings#web3-wallet-trading" },
        { label: "Open Trade", href: "/trading" },
      ],
    };
  }

  if (mentionsAny(normalized, ["ai key", "chat key", "live chat key", "api key", "model key"])) {
    return {
      body: [
        "AI/chat keys: open Settings and test live chat only if you want Master Mold to use an external chat provider.",
        "Keep credentials out of chat.",
        "The app still works with local command answers when no live chat key is saved.",
      ].join(" "),
      actions: [
        { label: "AI/chat Keys", href: "/settings#ai-chat-keys" },
        { label: "Open Chat", href: "/chat" },
        { label: "System Status", href: "/review" },
      ],
    };
  }

  if (mentionsAny(normalized, ["safety limit", "safety limits", "trade limit", "max trade", "risk limit"])) {
    return {
      body: [
        "Safety limits: open Settings and review caps before any live-trading review.",
        "Limits are part of the safety boundary; chat cannot override them.",
        "No trade can run from this answer.",
      ].join(" "),
      actions: [
        { label: "Safety Limits", href: "/settings#safety-limits" },
        { label: "Web3 Setup", href: "/settings#web3-wallet-trading" },
        { label: "Open Trade", href: "/trading" },
      ],
    };
  }

  const navigationAnswer = buildRouteNavigationAnswer(normalized);
  if (navigationAnswer) {
    return navigationAnswer;
  }

  return null;
}

function buildRouteNavigationAnswer(normalized: string): LocalCommandAnswer | null {
  if (!hasNavigationIntent(normalized)) return null;

  const destination = routeDestinationForMessage(normalized);
  if (!destination) return null;

  return {
    body: [
      `${destination.label}: I found the right place.`,
      destination.purpose,
      "Use the action below to jump there. I will not trade, sign, or move funds.",
    ].join(" "),
    actions: [
      { label: destination.actionLabel, href: destination.href },
      ...destination.related,
    ],
  };
}

function hasNavigationIntent(normalized: string) {
  return mentionsAny(normalized, [
    "open",
    "show",
    "go to",
    "take me",
    "take me to",
    "send me to",
    "bring up",
    "pull up",
    "navigate",
    "route me",
    "jump to",
  ]);
}

function routeDestinationForMessage(normalized: string):
  | {
      label: string;
      actionLabel: string;
      href: string;
      purpose: string;
      related: ChatAction[];
    }
  | null {
  if (mentionsAny(normalized, ["portfolio", "holdings", "net worth", "allocation"])) {
    return {
      label: "Portfolio",
      actionLabel: "Open Portfolio",
      href: "/portfolio",
      purpose: "Portfolio shows net worth, holdings, allocation, and concentration.",
      related: [
        { label: "Add Holding", href: "/portfolio?action=add-holding#add-holdings" },
        { label: "Portfolio Setup", href: "/settings#portfolio-connections" },
      ],
    };
  }

  if (mentionsAny(normalized, ["activity", "alerts", "alert inbox", "active items"])) {
    return {
      label: "Activity",
      actionLabel: "Open Activity",
      href: "/activity",
      purpose: "Activity shows what needs attention and the next plain response.",
      related: [
        { label: "Test On Paper", href: "/paper#paper-trade-form" },
        { label: "Record A Call", href: "/journal#record-call" },
      ],
    };
  }

  if (mentionsAny(normalized, ["paper", "paper trading", "paper trade", "simulator"])) {
    return {
      label: "Paper trading",
      actionLabel: "Open Paper",
      href: "/paper",
      purpose: "Paper lets you test an idea with simulator dollars before risking real money.",
      related: [
        { label: "Submit Paper Trade", href: "/paper#paper-trade-form" },
        { label: "Open Journal", href: "/journal" },
      ],
    };
  }

  if (mentionsAny(normalized, ["journal", "decision journal", "saved calls", "past calls"])) {
    return {
      label: "Decision journal",
      actionLabel: "Open Journal",
      href: "/journal",
      purpose: "Journal keeps saved calls, review quality, and lessons learned.",
      related: [
        { label: "Record A Call", href: "/journal#record-call" },
        { label: "Open Paper", href: "/paper" },
      ],
    };
  }

  if (mentionsAny(normalized, ["settings", "setup", "configure", "profile", "keys"])) {
    return {
      label: "Settings",
      actionLabel: "Open Settings",
      href: "/settings",
      purpose: "Settings groups profile, portfolio connections, AI keys, Web3 setup, and safety limits.",
      related: [
        { label: "Portfolio Setup", href: "/settings#portfolio-connections" },
        { label: "Web3 Setup", href: "/settings#web3-wallet-trading" },
      ],
    };
  }

  if (mentionsAny(normalized, ["trade", "trading", "web3", "wallet", "orders", "positions"])) {
    return {
      label: "Trade",
      actionLabel: "Open Trade",
      href: "/trading",
      purpose: "Trade shows wallet status, the next required action, chart, positions, orders, and test trades.",
      related: [
        { label: "Set Up Wallet", href: "/trading#wallet-setup" },
        { label: "Open Monitor", href: "/trading#trading-monitor" },
      ],
    };
  }

  if (mentionsAny(normalized, ["system status", "review", "reviewer", "health"])) {
    return {
      label: "System status",
      actionLabel: "System Status",
      href: "/review",
      purpose: "System status shows what works, what is sample, what needs keys, and what is missing.",
      related: [
        { label: "Health Status", href: "/api/health" },
        { label: "Open Settings", href: "/settings" },
      ],
    };
  }

  if (mentionsAny(normalized, ["chat", "assistant", "master mold"])) {
    return {
      label: "Ask Master Mold",
      actionLabel: "Open Chat",
      href: "/chat",
      purpose: "Chat is the control room for asking, checking, routing, and pulling the app context together.",
      related: [
        { label: "Open Today", href: "/" },
        { label: "Open Trade", href: "/trading" },
      ],
    };
  }

  if (mentionsAny(normalized, ["today", "home", "daily", "focus", "rundown"])) {
    return {
      label: "Today",
      actionLabel: "Open Today",
      href: "/",
      purpose: "Today gives the short rundown, top activity, portfolio context, and next action.",
      related: [
        { label: "Check Activity", href: "/activity" },
        { label: "Open Portfolio", href: "/portfolio" },
      ],
    };
  }

  return null;
}

function mentionsAny(normalized: string, phrases: string[]) {
  return phrases.some((phrase) => normalized.includes(phrase));
}

function buildTodayCommandAnswer(asOf: AsOfFilter | null = null): LocalCommandAnswer {
  const facts = getChatFacts(asOf);
  return {
    body: [
      `Today check: start with ${facts.briefing_headline}.`,
      `Portfolio context: ${facts.top_holding_context}.`,
      `Activity context: ${facts.top_alert_tier}: ${facts.top_alert}.`,
      "Next: open Today for the short rundown, then use paper trading before risking real money.",
    ].join(" "),
    actions: [
      { label: "Open Today", href: "/" },
      { label: "Check Activity", href: "/activity" },
      { label: "Test On Paper", href: "/paper" },
    ],
  };
}

function buildPaperCommandAnswer(asOf: AsOfFilter | null = null): LocalCommandAnswer {
  const paper = getPaperPageData(asOf);
  const topIdea = paper.enginePredictions[0] ?? paper.predictions[0] ?? null;
  const availableCash = formatCurrency(paper.fake_wallet.available_cash);
  const openValue = formatCurrency(paper.fake_wallet.open_fake_value);
  const activeWindow = paper.activeRound
    ? `${paper.activeRound.week_label} is open`
    : "no paper-test window is open";
  const ideaLine = topIdea
    ? `Best starting idea: ${topIdea.asset.symbol}, ${topIdea.direction}, confidence ${topIdea.conviction}/10.`
    : "No saved paper idea is queued yet.";
  const reasonLine = topIdea
    ? `Reason to test: ${plainPaperCopy(plainBriefingHeadline(plainBriefingText(topIdea.rationale)))}.`
    : "Next: pick an asset and write the reason before the result is obvious.";

  return {
    body: [
      `Paper check: ${activeWindow}. Available simulator cash is ${availableCash}, with ${openValue} already reserved.`,
      ideaLine,
      reasonLine,
      "No real money moves here.",
    ].join(" "),
    actions: [
      { label: "Open Paper", href: "/paper" },
      { label: "Submit Paper Trade", href: "/paper#paper-trade-form" },
      { label: "Check Journal", href: "/journal" },
    ],
  };
}

function buildJournalCommandAnswer(asOf: AsOfFilter | null = null): LocalCommandAnswer {
  const journal = getJournal(asOf);
  const entries = journal.entries;
  const unresolved = entries.filter((entry) => !entry.outcome_score).length;
  const latest = entries[0] ?? null;
  const resolvedScores = journal.outcome_scores.filter((score) => score.thesis_played_out);
  const processAverage =
    journal.outcome_scores.length > 0
      ? journal.outcome_scores.reduce((sum, score) => sum + score.process_score, 0) / journal.outcome_scores.length
      : 0;
  const recordLine = journal.outcome_scores.length > 0
    ? `${resolvedScores.length}/${journal.outcome_scores.length} closed calls were right with ${processAverage.toFixed(1)}/10 average review quality.`
    : "No closed calls have enough review data yet.";
  const latestLine = latest
    ? `Latest saved call: ${plainBriefingHeadline(plainBriefingText(latest.thesis))}.`
    : "No saved calls yet.";

  return {
    body: [
      `Journal check: ${entries.length} saved call${entries.length === 1 ? "" : "s"}, ${unresolved} still waiting for review.`,
      recordLine,
      latestLine,
      "Next: record the next call before the result is obvious, or review the oldest unresolved call.",
    ].join(" "),
    actions: [
      { label: "Open Journal", href: "/journal" },
      { label: "Record A Call", href: "/journal#record-call" },
      { label: "Open Paper", href: "/paper" },
    ],
  };
}

async function buildChatContextRefreshAnswer(): Promise<LocalCommandAnswer> {
  try {
    const state = await initializeMarketBrain();
    const snapshot = state.latest_run;
    const savedAt = snapshot?.completed_at ? formatClockTime(snapshot.completed_at) : "just now";

    return {
      body: [
        `Chat context: saved local app context ${savedAt}.`,
        `${state.summary.source_count} source${state.summary.source_count === 1 ? "" : "s"}, ${state.summary.symbol_count} symbol${state.summary.symbol_count === 1 ? "" : "s"}, and ${state.summary.memory_count} memory note${state.summary.memory_count === 1 ? "" : "s"} are now available to chat.`,
        "This does not fetch fresh news, refresh accounts, trade, sign, or move funds.",
      ].join(" "),
      actions: [
        { label: "Open Today", href: "/" },
        { label: "Open Chat", href: "/chat" },
        { label: "Chat Settings", href: "/settings#ai-chat-keys" },
      ],
    };
  } catch {
    const state = getBrainState();
    return {
      body: [
        "Chat context: I could not save a new local context snapshot.",
        state.latest_run
          ? `The previous saved context is still available from ${formatClockTime(state.latest_run.completed_at)}.`
          : "No previous saved context is available yet.",
        "Nothing traded, signed, or moved.",
      ].join(" "),
      actions: [
        { label: "Open Today", href: "/" },
        { label: "Open Settings", href: "/settings#ai-chat-keys" },
      ],
    };
  }
}

async function buildMarketScanRunAnswer(): Promise<LocalCommandAnswer> {
  const statusLine = getScanStatusLine();

  if (!scanRunnerAvailable()) {
    return {
      body: [
        "Market scan: this machine is not set up to run the scan engine.",
        "The app is still using the last saved read and local context.",
        "Nothing traded, signed, or moved.",
      ].join(" "),
      actions: [
        { label: "Open Today", href: "/" },
        { label: "System Status", href: "/review" },
      ],
    };
  }

  if (isScanRunning()) {
    return {
      body: [
        "Market scan: a scan is already running.",
        statusLine,
        "I will not start a duplicate scan. Nothing can trade, sign, or move funds from this.",
      ].join(" "),
      actions: [
        { label: "Open Today", href: "/" },
        { label: "Check Activity", href: "/activity" },
      ],
    };
  }

  void runMarketScan({ trigger: "chat-command" }).catch(() => {});
  return {
    body: [
      "Market scan: started.",
      "It can take a minute or two, so I am not making chat wait here.",
      "Open Today to watch the saved read update. This scan reads market data only; it cannot trade, sign, or move funds.",
    ].join(" "),
    actions: [
      { label: "Open Today", href: "/" },
      { label: "Check Activity", href: "/activity" },
      { label: "System Status", href: "/review" },
    ],
  };
}

function buildPortfolioCommandAnswer(asOf: AsOfFilter | null = null): LocalCommandAnswer {
  const portfolio = getPortfolio(asOf);
  const topHolding = portfolio.holdings[0];
  const value = formatCurrency(portfolio.total_market_value);
  const change = `${portfolio.daily_change_value >= 0 ? "+" : ""}${formatCurrency(portfolio.daily_change_value)}`;
  const source =
    portfolio.provenance.label === "Imported portfolio"
      ? "an imported holdings snapshot plus local/sample data"
      : portfolio.provenance.label === "Manual portfolio"
        ? "local manual entries plus sample data"
        : "a sample portfolio";
  const holdingLine = topHolding
    ? `Largest visible holding: ${topHolding.symbol} at ${topHolding.weight_pct.toFixed(1)}% of the portfolio.`
    : "No visible holding is loaded yet.";

  return {
    body: [
      `Portfolio check: net worth is ${value}, with ${change} today.`,
      holdingLine,
      `Data source: ${source}.`,
      "Next: review concentration before any money decision, or add/import holdings if this does not match your real portfolio.",
    ].join(" "),
      actions: [
        { label: "Open Portfolio", href: "/portfolio" },
        { label: "Add Holding", href: "/portfolio?action=add-holding#add-holdings" },
        { label: "Portfolio Settings", href: "/settings#portfolio-connections" },
      ],
    };
}

function buildSettingsCommandAnswer(): LocalCommandAnswer {
  const integrations = getIntegrationStatuses();
  const portfolioConnections = integrations.filter((integration) => integration.service !== "llm").length;
  const liveChat = integrations.find((integration) => integration.service === "llm");
  const connectedCount = integrations.filter((integration) => integration.status === "connected").length;
  const needsKeyCount = integrations.filter((integration) => integration.status === "credential_gated").length;
  const needsKeyPhrase = `${needsKeyCount} item${needsKeyCount === 1 ? " needs" : "s need"} keys`;
  const chatStatus = liveChat?.status === "connected"
    ? "live chat key test passed"
    : liveChat?.status === "credential_gated"
      ? "live chat needs a key"
      : "live chat is optional";

  return {
    body: [
      `Setup check: ${connectedCount} connection check${connectedCount === 1 ? "" : "s"} passed and ${needsKeyPhrase}.`,
      `Portfolio connections: ${portfolioConnections} read-only source${portfolioConnections === 1 ? "" : "s"} are available to test or import by choice.`,
      `AI/chat keys: ${chatStatus}.`,
      "Next: update Profile if stale, then handle Portfolio connections or Web3 wallet setup depending on what you want Master Mold to use.",
    ].join(" "),
    actions: [
      { label: "Open Settings", href: "/settings" },
      { label: "Portfolio Setup", href: "/settings#portfolio-connections" },
      { label: "AI/chat Keys", href: "/settings#ai-chat-keys" },
      { label: "Web3 Setup", href: "/settings#web3-wallet-trading" },
    ],
  };
}

function buildActivityCommandAnswer(asOf: AsOfFilter | null = null): LocalCommandAnswer {
  const alerts = getAlerts(asOf);
  const active = alerts.filter((alert) => !alert.acknowledged);
  const top = active[0] ?? alerts[0];

  if (!top) {
    return {
      body: "Activity check: nothing needs attention right now. Next: keep the activity list open if you want to review dismissed items.",
      actions: [{ label: "Open Activity", href: "/activity" }],
    };
  }

  const status = active.length > 0
    ? `${active.length} item${active.length === 1 ? "" : "s"} still need attention`
    : "no active items need attention";

  return {
    body: [
      `Activity check: ${status}.`,
      `Top item: ${shortAlertTierLabel(top.tier)}: ${cleanAlertMessage(top.message)}.`,
      "Next: open Activity, then either restore/dismiss the item or use it as a paper-trade or journal check.",
    ].join(" "),
    actions: [
      { label: "Open Activity", href: "/activity" },
      { label: "Ask Why It Matters", href: "/chat?q=Why%20does%20the%20top%20activity%20item%20matter%3F" },
      { label: "Test On Paper", href: "/paper" },
    ],
  };
}

function buildActivityFilterCommandAnswer(label: string, href: string, lead: string): LocalCommandAnswer {
  return {
    body: [
      lead,
      "From there you can ask why an item matters, save it as a decision, test it on paper, or dismiss it with a visible confirmation.",
      "Chat does not dismiss items by itself.",
    ].join(" "),
    actions: [
      { label, href },
      { label: "All Activity", href: "/activity#activity-list" },
      { label: "Test On Paper", href: "/paper#paper-trade-form" },
    ],
  };
}

function wantsSpecificActivityExplanation(normalized: string) {
  return (
    normalized.includes("explain this activity item") ||
    normalized.includes("this activity item") ||
    normalized.includes("this alert")
  );
}

function buildSpecificActivityExplanationAnswer(message: string): LocalCommandAnswer {
  const title = extractActivityPromptPart(message, /activity item in plain english:\s*(.+?)\.\s*keep raw/i) ??
    extractActivityPromptPart(message, /activity item:\s*(.+?)(?:\.|$)/i) ??
    "this activity item";
  const relevance = extractActivityPromptPart(message, /plain relevance:\s*(.+?)\s+suggested response:/i);
  const response = extractActivityPromptPart(message, /suggested response:\s*(.+)$/i);
  const whyLine = relevance
    ? `Why it matters: ${plainCommandCopy(relevance)}`
    : "Why it matters: it was flagged because it may affect a visible holding or today's risk.";
  const responseLine = response
    ? `Reasonable response: ${plainCommandCopy(response)}`
    : "Reasonable response: review the item before adding exposure, then dismiss it if it does not change today's decision.";

  return {
    body: [
      `Activity check: ${plainCommandCopy(title)}.`,
      whyLine,
      responseLine,
      "Next: open Activity if you want to dismiss it, save it as a decision, or test it on paper. No trade can run from chat.",
    ].join(" "),
    actions: [
      { label: "Open Activity", href: "/activity#activity-list" },
      { label: "Test On Paper", href: "/paper#paper-trade-form" },
      { label: "Record A Call", href: "/journal#record-call" },
    ],
  };
}

function extractActivityPromptPart(message: string, pattern: RegExp) {
  const match = message.match(pattern);
  return match?.[1]?.replace(/\s+/g, " ").trim() || null;
}

function tradeActions(walletNeedsSetup = true): ChatAction[] {
  return walletNeedsSetup
    ? [
        { label: "Open Trade", href: "/trading" },
        { label: "Set Up Wallet", href: "/trading#wallet-setup" },
        { label: "Trading Settings", href: "/settings#web3-wallet-trading" },
      ]
    : [
        { label: "Open Trade", href: "/trading" },
        { label: "Review Test Trade", href: "/trading#test-trade-flow" },
        { label: "Open Monitor", href: "/trading#trading-monitor" },
      ];
}

function plainCommandCopy(value: string) {
  return value
    .replaceAll("canary", "test trade")
    .replaceAll("Canary", "Test trade")
    .replaceAll("receipt", "status")
    .replaceAll("Receipt", "Status")
    .replaceAll("packet", "status")
    .replaceAll("Packet", "Status")
    .replaceAll("blocker", "need")
    .replaceAll("Blocker", "Need")
    .replaceAll("blockers", "needs")
    .replaceAll("Blockers", "Needs")
    .replaceAll("relay", "confirmation")
    .replaceAll("Relay", "Confirmation")
    .replaceAll("proof chain", "confirmation")
    .replaceAll("Proof chain", "Confirmation");
}

function tradeStatusRequestFromPage(pageContext?: ChatPageContext): TradeCommandRequest {
  const fallback: TradeCommandRequest = {
    account: "persistent",
    source: "live-dex",
    scenario: "breakout",
  };

  if (!pageContext?.route) return fallback;

  try {
    const search = new URL(pageContext.route, "http://localhost").searchParams;
    const account = search.get("account");
    const source = search.get("source");
    const scenario = search.get("scenario");

    return {
      account: account === "ephemeral" ? "ephemeral" : fallback.account,
      source: source === "sample" ? "sample" : fallback.source,
      scenario: scenario === "base" || scenario === "rug-risk" ? scenario : fallback.scenario,
    };
  } catch {
    return fallback;
  }
}

function localCommandHeaders(pageContext?: ChatPageContext, actions: ChatAction[] = []) {
  return {
    "X-Chat-Mode": "canned",
    "X-Chat-Model": "local-command",
    "X-Chat-Sources": encodeHeaderJson([
      pageContext?.surface ? `${pageContext.surface} page` : "Master Mold app",
      "Local app status",
      "Advisory safety boundary",
    ]),
    "X-Chat-Followups": encodeHeaderJson(localCommandFollowups(pageContext)),
    "X-Chat-Actions": encodeHeaderJson(actions),
    "X-Chat-Estimated-Prompt-Tokens": "0",
    "X-Chat-Max-Total-Tokens": String(defaultMaxTotalTokens()),
    "X-Chat-Max-Response-Tokens": String(defaultMaxResponseTokens()),
  };
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

function formatClockTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "just now";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function localCommandFollowups(pageContext?: ChatPageContext) {
  if (pageContext?.surface.toLowerCase() === "trade") {
    return [
      "What is the next required action on this Trade page?",
      "What should I review before starting a test trade?",
      "What can this Trade page do right now?",
    ];
  }

  return [
    "What should I focus on today?",
    "Check Web3 trading status.",
    "What can this app do for me?",
  ];
}

async function parseChatRequest(request: Request): Promise<
  | {
      ok: true;
      message: string;
      pageContext?: ChatPageContext;
      asOf: AsOfFilter | null;
    }
  | {
      ok: false;
      error: string;
    }
> {
  let text = "";

  try {
    text = await request.text();
  } catch {
    return { ok: false, error: "Unable to read request body" };
  }

  if (!text.trim()) {
    return { ok: true, message: "", asOf: null };
  }

  let body: ChatRequest;

  try {
    body = JSON.parse(text) as ChatRequest;
  } catch {
    return { ok: false, error: "Expected JSON body with a message field" };
  }

  if (body.message === undefined || body.message === null) {
    if (body.messages !== undefined && body.messages !== null) {
      const extracted = extractLastUserMessage(body.messages);
      if (!extracted.ok) return extracted;

      const message = extracted.message.trim();

      if (message.length > 2000) {
        return { ok: false, error: "message must be 2000 characters or fewer" };
      }

      const parsedContext = parsePageContext(body.page_context);
      if (!parsedContext.ok) return parsedContext;
      const parsedAsOf = parseChatAsOf(body.as_of, parsedContext.pageContext);
      if (!parsedAsOf.ok) return parsedAsOf;

      return { ok: true, message, pageContext: parsedContext.pageContext, asOf: parsedAsOf.asOf };
    }

    const parsedContext = parsePageContext(body.page_context);
    if (!parsedContext.ok) return parsedContext;
    const parsedAsOf = parseChatAsOf(body.as_of, parsedContext.pageContext);
    if (!parsedAsOf.ok) return parsedAsOf;
    return { ok: true, message: "", pageContext: parsedContext.pageContext, asOf: parsedAsOf.asOf };
  }

  if (typeof body.message !== "string") {
    return { ok: false, error: "message must be a string" };
  }

  const message = body.message.trim();

  if (message.length > 2000) {
    return { ok: false, error: "message must be 2000 characters or fewer" };
  }

  const parsedContext = parsePageContext(body.page_context);
  if (!parsedContext.ok) return parsedContext;
  const parsedAsOf = parseChatAsOf(body.as_of, parsedContext.pageContext);
  if (!parsedAsOf.ok) return parsedAsOf;

  return { ok: true, message, pageContext: parsedContext.pageContext, asOf: parsedAsOf.asOf };
}

function extractLastUserMessage(value: unknown):
  | {
      ok: true;
      message: string;
    }
  | {
      ok: false;
      error: string;
    } {
  if (!Array.isArray(value)) {
    return { ok: false, error: "messages must be an array" };
  }

  for (let index = value.length - 1; index >= 0; index -= 1) {
    const item = value[index];
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;

    const record = item as Record<string, unknown>;
    if (record.role !== "user") continue;

    if (typeof record.content === "string") {
      return { ok: true, message: record.content };
    }

    if (Array.isArray(record.content)) {
      const text = record.content
        .map((part) => {
          if (!part || typeof part !== "object" || Array.isArray(part)) return "";
          const partRecord = part as Record<string, unknown>;
          return typeof partRecord.text === "string" ? partRecord.text : "";
        })
        .filter(Boolean)
        .join(" ");
      if (text.trim()) return { ok: true, message: text };
    }

    return { ok: false, error: "messages user content must be text" };
  }

  return { ok: false, error: "messages must include a user message" };
}

function parsePageContext(value: unknown):
  | {
      ok: true;
      pageContext?: ChatPageContext;
    }
  | {
      ok: false;
      error: string;
    } {
  if (value === undefined || value === null) {
    return { ok: true };
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "page_context must be an object" };
  }

  const record = value as Record<string, unknown>;
  const surface = cleanContextField(record.surface, 60);
  const route = cleanContextField(record.route, 140);
  const summary = cleanContextField(record.summary, 500);
  const selected = cleanContextField(record.selected, 240);

  if (!surface || !route || !summary) {
    return { ok: false, error: "page_context must include surface, route, and summary" };
  }

  return {
    ok: true,
    pageContext: selected
      ? { surface, route, summary, selected }
      : { surface, route, summary },
  };
}

function cleanContextField(value: unknown, maxLength: number) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function parseChatAsOf(
  bodyAsOf: unknown,
  pageContext?: ChatPageContext,
):
  | {
      ok: true;
      asOf: AsOfFilter | null;
    }
  | {
      ok: false;
      error: string;
    } {
  if (bodyAsOf !== undefined && bodyAsOf !== null) {
    if (typeof bodyAsOf !== "string") {
      return { ok: false, error: "as_of must be a string" };
    }

    const parsed = parseAsOf(bodyAsOf);
    return parsed.ok ? { ok: true, asOf: parsed.asOf } : parsed;
  }

  const routeAsOf = asOfFromRoute(pageContext?.route);
  if (!routeAsOf) {
    return { ok: true, asOf: null };
  }

  const parsed = parseAsOf(routeAsOf);
  return parsed.ok ? { ok: true, asOf: parsed.asOf } : parsed;
}

function asOfFromRoute(route?: string) {
  if (!route) return null;

  try {
    return new URL(route, "http://localhost").searchParams.get("as_of");
  } catch {
    return null;
  }
}

function contextWithPageContext(llmContext: string, pageContext?: ChatPageContext) {
  if (!pageContext) return llmContext;

  try {
    const parsed = JSON.parse(llmContext) as Record<string, unknown>;
    return JSON.stringify({
      ...parsed,
      current_surface: pageContext,
    });
  } catch {
    return JSON.stringify({
      app_context: llmContext,
      current_surface: pageContext,
    });
  }
}

function contextWithInferenceBudget(llmContext: string, budget: ChatBudget) {
  const inferenceBudget = {
    status: budget.ok ? "within local cap" : "stopped before live chat request",
    estimated_prompt_tokens: budget.estimatedPromptTokens,
    max_response_tokens: budget.maxResponseTokens,
    max_total_tokens: budget.maxTotalTokens,
    user_facing_summary:
      "Live chat has a local size limit. Short questions can use a saved chat key; oversized questions stop before any live chat request.",
  };

  try {
    const parsed = JSON.parse(llmContext) as Record<string, unknown>;
    return JSON.stringify({
      ...parsed,
      inference_budget: inferenceBudget,
    });
  } catch {
    return JSON.stringify({
      app_context: llmContext,
      inference_budget: inferenceBudget,
    });
  }
}

async function streamOpenAIResponse(
  apiKey: string,
  model: string,
  message: string,
  llmContext: string,
  headers: Record<string, string>,
  responseMode?: ChatTextCleanupMode,
  budget?: ChatBudget,
) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: budget?.maxResponseTokens ?? defaultMaxResponseTokens(),
      stream: true,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: buildSystemPrompt(llmContext),
        },
        {
          role: "user",
          content: message,
        },
      ],
    }),
  });

  if (!response.ok || !response.body) {
    return providerErrorResponse(response, "OpenAI", headers);
  }

  return streamServerSentEvents(response.body, "openai", headers, responseMode);
}

async function streamOpenRouterResponse(
  apiKey: string,
  model: string,
  message: string,
  llmContext: string,
  headers: Record<string, string>,
  responseMode?: ChatTextCleanupMode,
  budget?: ChatBudget,
) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:4002",
      "X-OpenRouter-Title": "Master Mold",
    },
    body: JSON.stringify({
      model,
      max_tokens: budget?.maxResponseTokens ?? defaultMaxResponseTokens(),
      stream: true,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: buildSystemPrompt(llmContext),
        },
        {
          role: "user",
          content: message,
        },
      ],
    }),
  });

  if (!response.ok || !response.body) {
    return providerErrorResponse(response, "OpenRouter", headers);
  }

  return streamServerSentEvents(response.body, "openrouter", headers, responseMode);
}

async function streamAnthropicResponse(
  apiKey: string,
  model: string,
  message: string,
  llmContext: string,
  headers: Record<string, string>,
  responseMode?: ChatTextCleanupMode,
  budget?: ChatBudget,
) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: budget?.maxResponseTokens ?? defaultMaxResponseTokens(),
      stream: true,
      system: buildSystemPrompt(llmContext),
      messages: [
        {
          role: "user",
          content: message,
        },
      ],
    }),
  });

  if (!response.ok || !response.body) {
    return providerErrorResponse(response, "Anthropic", headers);
  }

  return streamServerSentEvents(response.body, "anthropic", headers, responseMode);
}

function buildSystemPrompt(llmContext: string) {
  return [
    "You are an advisory-only financial copilot for Master Mold.",
    "You cannot buy or sell assets, sign transactions, move funds, or imply market-action authority.",
    "The app can create paper trades on the Paper page using simulator dollars. When asked about paper trading an activity item or idea, explain that it is simulated only, not real execution.",
    "Use only the supplied context. Holdings are intentionally abstracted as portfolio-weight ratios and percentages.",
    "When current_surface is present, answer from that page's point of view, but do not claim to see unsent UI details.",
    "Answer the user's exact question first. Do not open with a broad context summary unless they explicitly ask for a summary.",
    "For daily-focus questions such as what to check first, give one top focus, why it matters in plain language, and the next no-trading step.",
    "Answer in plain prose. Do not quote JSON keys, raw context field names, or implementation labels.",
    "Do not call portfolio values live, real-time, connected, synced, or imported unless the plain context summary says imported portfolio.",
    "Avoid toy-sounding paper-trading language plus the phrases live engine output, engine output, actionable, signals, insights, conviction, high-conviction, high-confidence, higher-confidence, higher confidence, highest-confidence, hypothesis, picks, and practice. Say saved market read, things to check, reasons to watch, stronger evidence, confidence, paper trade, review, and strongly scored calls.",
    "When discussing recent calls, group them as strongly scored, middle-scored, or early watchlist calls.",
    "When the portfolio state is Demo data, call it a sample portfolio. When it is Manual portfolio, call it local manual entries plus sample data. When it is Imported portfolio, say imported holdings snapshot plus local/sample data.",
    "Connection checks do not import holdings by themselves. Imported holdings appear only after the explicit Settings import action.",
    "Imported portfolio holdings are read-only snapshots. If the context says fresh, aging, stale, or no automatic refresh, repeat that plainly.",
    "The Today Save context for chat action only saves or refreshes local app context for chat. It does not check the internet, news, connected accounts, or full market research. Do not suggest those checks can be enabled or manually triggered in this app unless context explicitly says they exist.",
    "When discussing Chat context, do not say the user can run checks, load fresh market data, trigger a scan, or manually trigger a scan to fetch fresh market data. Say it saves local app context only.",
    "Do not describe Save context for chat as a way to get live updates. It only saves local context for future chat answers.",
    "If asked whether Master Mold has evidence it can beat the market or a simple baseline, use forward_measurement status. A running measurement window only starts the clock; it needs enough later results before the baseline comparison means anything.",
    "If asked about inference budgets, cost controls, or runaway inference, use inference_budget status. Say live chat has a size limit and oversized questions stop before any live chat request.",
    "Do not say live chat requests never happen. If a live key is saved and the prompt is within budget, chat can use live chat.",
    "For real-vs-sample questions, say saved reads are local saved app data, not live market coverage. Do not call saved-read market moves actual or live; say they were marked as worth checking in the saved read.",
    "Never ask for or reveal account IDs, raw quantities, private keys, tokens, or credentials.",
    "When explaining activity items, start with why the user should care. Do not mention z-scores, z= values, sigma, standard deviations, or raw signal names unless the user asks for raw math.",
    "When explaining borrow-payment or funding activity, do not quote raw rates or open-interest figures unless the user asks for raw math. Say borrow-payment conditions changed and explain whether that matters to the visible portfolio.",
    "Do not tell the user that Master Mold cannot simulate or paper trade. Say it can test paper trades in Paper while still being unable to place real trades.",
    "Keep answers concise and cite the supplied app context by name.",
    `Context JSON: ${llmContext}`,
  ].join("\n");
}

async function providerErrorResponse(response: Response, provider: string, headers: Record<string, string>) {
  const detail = await response.text().catch(() => "");
  const code = classifyProviderError(response.status, detail);
  return Response.json(
    {
      error: `${provider} chat request failed`,
      provider,
      code,
      detail: detail.slice(0, 300),
    },
    {
      status: 502,
      headers: {
        ...headers,
        "X-Chat-Error-Code": code,
      },
    },
  );
}

function streamServerSentEvents(
  body: ReadableStream<Uint8Array>,
  provider: "openai" | "openrouter" | "anthropic",
  headers: Record<string, string>,
  responseMode?: ChatTextCleanupMode,
) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  let output = "";
  // Tokens are relayed as they arrive so the answer reads progressively instead
  // of landing as one blob after the full model latency. Copy cleanup runs over
  // the accumulated text each flush; the trailing holdback keeps phrase-level
  // replacements stable across chunk boundaries before their region is emitted.
  const CLEANUP_HOLDBACK = 160;
  let sentLength = 0;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = body.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          let grew = false;
          for (const line of lines) {
            const text = parseProviderLine(line, provider);

            if (text) {
              output += text;
              grew = true;
            }
          }

          if (grew) {
            const cleaned = cleanProviderChatText(output, responseMode);
            const safeLength = Math.max(0, cleaned.length - CLEANUP_HOLDBACK);
            if (safeLength > sentLength) {
              controller.enqueue(encoder.encode(cleaned.slice(sentLength, safeLength)));
              sentLength = safeLength;
            }
          }
        }
      } catch (error) {
        controller.error(error);
        return;
      }

      const cleaned = cleanProviderChatText(output, responseMode);
      if (cleaned.length > sentLength) {
        controller.enqueue(encoder.encode(cleaned.slice(sentLength)));
      }
      controller.close();
    },
  });

  return textStream(stream, {
    ...headers,
    "X-Chat-Mode": provider,
    "X-Chat-Cleanup-Mode": responseMode ?? "general",
  });
}

function cleanProviderChatText(output: string, responseMode?: ChatTextCleanupMode) {
  return cleanChatText(output, { responseMode })
    .replace(/\bmixed reasons to watch\b/gi, "a mixed picture")
    .replace(/\bmixed reason to watch\b/gi, "a mixed picture")
    .replace(
      /\bNo real-money execution or outside AI calls are made\b/gi,
      "No real-money execution happens. Short questions may use live chat when a key is saved",
    )
    .replace(
      /\bNo outside AI calls are made\b/gi,
      "Short questions may use live chat when a key is saved",
    )
    .replace(/\bToday's a mixed picture\b/gi, "today's read")
    .replace(/\bToday’s a mixed picture\b/gi, "today's read")
    .replace(/\ba on-chain\b/gi, "an on-chain")
    .replace(/(^|\n)(\s*\d+\.\s*)a mixed picture\b/gi, "$1$2Mixed picture");
}

function parseProviderLine(line: string, provider: "openai" | "openrouter" | "anthropic") {
  const trimmed = line.trim();

  if (!trimmed.startsWith("data:")) {
    return "";
  }

  const payload = trimmed.slice(5).trim();

  if (!payload || payload === "[DONE]") {
    return "";
  }

  try {
    const json = JSON.parse(payload) as {
      choices?: Array<{ delta?: { content?: string } }>;
      type?: string;
      delta?: { text?: string };
    };

    if (provider === "openai" || provider === "openrouter") {
      return json.choices?.[0]?.delta?.content ?? "";
    }

    return json.type === "content_block_delta" ? json.delta?.text ?? "" : "";
  } catch {
    return "";
  }
}

function textStream(
  body: string | ReadableStream<Uint8Array>,
  headers: Record<string, string> = {},
) {
  return new Response(typeof body === "string" ? body : body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

function chatHeaders(
  context: ReturnType<typeof getChatContext>,
  provider: "canned" | "openai" | "openrouter" | "anthropic",
  model: string,
  budget?: ChatBudget,
) {
  const sources = [
    context.facts.top_holding_context,
    `Top activity item: ${context.facts.top_alert_tier} ${context.facts.top_alert}`,
    `Daily read: ${context.facts.briefing_headline}`,
    `Decision history: ${context.facts.decision_accuracy}`,
  ];
  const followups = context.prompts.slice(0, 3).map((prompt) => prompt.prompt);

  return {
    "X-Chat-Mode": provider,
    "X-Chat-Model": model,
    "X-Chat-Sources": encodeHeaderJson(sources),
    "X-Chat-Followups": encodeHeaderJson(followups),
    "X-Chat-Estimated-Prompt-Tokens": String(budget?.estimatedPromptTokens ?? 0),
    "X-Chat-Max-Total-Tokens": String(budget?.maxTotalTokens ?? defaultMaxTotalTokens()),
    "X-Chat-Max-Response-Tokens": String(budget?.maxResponseTokens ?? defaultMaxResponseTokens()),
  };
}

type ChatBudget = {
  ok: boolean;
  estimatedPromptTokens: number;
  estimatedTotalTokens: number;
  maxTotalTokens: number;
  maxResponseTokens: number;
};

function chatBudget(message: string, llmContext: string): ChatBudget {
  const maxResponseTokens = defaultMaxResponseTokens();
  const maxTotalTokens = defaultMaxTotalTokens();
  const estimatedPromptTokens = estimateTokens(`${buildSystemPrompt(llmContext)}\n${message}`);
  const estimatedTotalTokens = estimatedPromptTokens + maxResponseTokens;
  return {
    ok: estimatedTotalTokens <= maxTotalTokens,
    estimatedPromptTokens,
    estimatedTotalTokens,
    maxTotalTokens,
    maxResponseTokens,
  };
}

function defaultMaxResponseTokens() {
  return envInt("MASTERMOLD_CHAT_MAX_RESPONSE_TOKENS", 700, 80, 1600);
}

function defaultMaxTotalTokens() {
  return envInt("MASTERMOLD_CHAT_MAX_TOTAL_TOKENS", 30000, 1000, 200000);
}

function estimateTokens(value: string) {
  return Math.max(1, Math.ceil(value.length / 4));
}

function envInt(name: string, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function encodeHeaderJson(value: unknown) {
  return encodeURIComponent(JSON.stringify(value));
}

function classifyProviderError(status: number, detail: string) {
  const lower = detail.toLowerCase();
  if (status === 401 || status === 403 || lower.includes("auth") || lower.includes("key")) {
    return "auth";
  }
  if (status === 402 || lower.includes("quota") || lower.includes("credit") || lower.includes("balance")) {
    return "quota";
  }
  if (status === 429 || lower.includes("rate limit")) {
    return "rate_limit";
  }
  if (
    status === 404 ||
    lower.includes("model") ||
    lower.includes("not found") ||
    lower.includes("not available")
  ) {
    return "model";
  }
  if (status >= 500) {
    return "provider_down";
  }
  return "provider_error";
}
