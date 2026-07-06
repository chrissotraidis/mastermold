import { getChatFacts, type ChatPageContext } from "@/src/db/chat";
import { getAlerts } from "@/src/db/alerts";
import { getBriefingCards } from "@/src/db/briefing";
import { getBrainState, initializeMarketBrain } from "@/src/db/brain";
import { getLatestDailyReport } from "@/src/db/daily-report";
import { getDailyTruthSummary } from "@/src/db/daily-truth";
import type { AsOfFilter } from "@/src/db/bitemporal";
import { getIntegrationStatuses } from "@/src/db/integrations";
import { executeChatAction } from "@/src/chat/actions";
import { createDecisionJournalEntry, getJournal } from "@/src/db/journal";
import { getPaperPageData } from "@/src/db/paper";
import { getPortfolio } from "@/src/db/portfolio";
import { getLatestPortfolioBrainSnapshot, getPortfolioBrainChangeSummary } from "@/src/db/portfolio-brain";
import { getScanStatusLine, isScanRunning, runMarketScan, scanRunnerAvailable } from "@/src/db/scan";
import {
  defaultMaxResponseTokens,
  defaultMaxTotalTokens,
  encodeHeaderJson,
} from "@/src/chat/context";
import { getAutopilotState } from "@/src/autopilot/control";
import { cleanAlertMessage, shortAlertTierLabel } from "@/lib/alert-loop";
import { plainBriefingHeadline, plainBriefingText } from "@/lib/plain-finance-copy";
import { plainPaperCopy } from "@/lib/paper-copy";

export type ChatAction = {
  label: string;
  href: string;
};

export type LocalCommandAnswer = {
  body: string;
  actions: ChatAction[];
};

export async function buildLocalCommandAnswer(
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

  // "I sold TCAI", "log: trimmed BTC" — the operator telling Master Mold what
  // they did. Save it to the journal directly instead of just talking about it.
  if (!asOf && wantsJournalLog(normalized)) {
    return buildJournalLogAnswer(message);
  }

  // Instant-tier bot controls: halting is always safe, stopping is reversible —
  // execute immediately and confirm (docs/chat-actions.md). Arming and param
  // changes go through the LLM's confirm-chip path instead.
  if (!asOf && /^(halt|kill)( the)? (bot|autopilot|trading)\b/.test(normalized)) {
    const result = executeChatAction({ kind: "halt" });
    return { body: result.message, actions: [{ label: "Autopilot", href: "/trading" }] };
  }
  if (!asOf && /^stop( the)? (bot|autopilot|trading)\b/.test(normalized)) {
    const result = executeChatAction({ kind: "stop" });
    return { body: result.message, actions: [{ label: "Autopilot", href: "/trading" }] };
  }

  if (wantsTradeStatus(normalized, pageContext)) {
    return buildTradeCommandAnswer();
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
    return buildTodayCommandAnswer(asOf, pageContext);
  }

  // Real questions belong to the live model when one is configured. The local
  // intent checks above stay first because they answer app status and portfolio
  // context without sending private page state to an external provider.
  if (liveChatConfigured() && !isCommandShaped(message)) {
    return null;
  }

  return null;
}

function buildTradeCommandAnswer(): LocalCommandAnswer {
  // The Trade page is the autonomous Autopilot lane; answer from its own
  // state instead of the retired supervised test-trade workspace.
  const state = getAutopilotState();
  const daemonLine =
    state.daemon === "live"
      ? "the trading loop's heartbeat is current"
      : state.daemon === "stale"
        ? "the trading loop's heartbeat is stale"
        : "the trading loop is offline";
  const modeLine = state.kill_switch
    ? "the kill switch is engaged, so nothing trades until you release it"
    : `mode is ${state.mode}`;

  return {
    body: [
      `Trade check: ${modeLine}, and ${daemonLine}.`,
      `${state.open_positions} open position${state.open_positions === 1 ? "" : "s"} and ${formatCurrency(state.equity_usd)} equity are visible on the Autopilot page.`,
      state.last_activity ? `Latest activity: ${state.last_activity.message}` : "No autopilot activity is recorded yet.",
      "Live money stays behind the go-live gate. I cannot sign, submit, or move funds.",
    ].join(" "),
    actions: tradeActions(),
  };
}

/** The operator reporting an action they took, phrased naturally or as "log:". */
function wantsJournalLog(normalized: string): boolean {
  if (/^(log|journal)[:\s]/.test(normalized)) return true;
  return /\bi (just )?(bought|sold|trimmed|added( to)?|exited|closed|took profits? (on|in))\b/.test(normalized);
}

function buildJournalLogAnswer(message: string): LocalCommandAnswer {
  const cleaned = message.replace(/^(log|journal)[:\s]+/i, "").trim().slice(0, 500);
  const holdings = getPortfolio().holdings;
  const symbol =
    holdings.find((holding) =>
      new RegExp(`\\b${holding.symbol.replace(/[^A-Za-z0-9]/g, "")}\\b`, "i").test(cleaned),
    )?.symbol ?? cleaned.match(/\b[A-Z]{2,6}\b/)?.[0] ?? null;

  const entry = createDecisionJournalEntry({
    thesis: cleaned,
    signals: [symbol ? `Operator action on ${symbol}, logged via chat.` : "Operator action, logged via chat."],
    conviction: 5,
    horizon: "1-3 days",
    falsification_condition: "Action already taken; judge the outcome at the next review.",
  });

  return {
    body: [
      `Logged to your journal: "${cleaned}".`,
      symbol ? `Tagged to ${symbol}.` : "",
      "When the outcome is clear, open the entry and score it so your track record stays honest.",
    ]
      .filter(Boolean)
      .join(" "),
    actions: [
      { label: "Open the entry", href: `/journal?entry=${encodeURIComponent(entry.id)}` },
      { label: "Journal", href: "/journal" },
    ],
  };
}

export function liveChatConfigured(): boolean {
  return Boolean(
    process.env.ANTHROPIC_API_KEY || process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY,
  );
}

/** Short imperative inputs ("portfolio status", "today check") read as commands;
 * anything with a question mark, a question opener, or real length is a question
 * for the live model. */
export function isCommandShaped(message: string): boolean {
  const trimmed = message.trim();
  if (trimmed.includes("?")) return false;
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 4) return false;
  const first = words[0].toLowerCase().replace(/[^a-z']/g, "");
  const questionOpeners = [
    "what", "whats", "why", "how", "hows", "should", "when", "where", "which", "who",
    "explain", "tell", "compare", "is", "are", "am", "can", "could", "does", "do",
    "did", "would", "will", "was", "were",
  ];
  return !questionOpeners.includes(first);
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
  const portfolioWords = ["portfolio", "holdings", "holding", "net worth", "allocation", "risk", "concentration", "own", "owns", "owned", "sync", "snapshot"];
  const actionWords = ["check", "status", "pull", "summary", "summarize", "review", "what", "next", "risk", "refresh", "import", "update", "balance", "balances", "own", "owns", "change", "changed"];
  return (onPortfolioSurface && actionWords.some((word) => normalized.includes(word))) ||
    (portfolioWords.some((word) => normalized.includes(word)) && actionWords.some((word) => normalized.includes(word)));
}

function wantsActivityStatus(normalized: string, pageContext?: ChatPageContext) {
  const onActivitySurface = pageContext?.surface.toLowerCase() === "activity";
  const activityWords = ["activity", "alert", "alerts", "item", "top item", "urgent", "attention", "changed", "needs"];
  const actionWords = ["check", "status", "pull", "summary", "summarize", "review", "what", "why", "matter", "matters", "mark", "useful", "save", "next", "need", "activity"];
  const portfolioChangePrompt = mentionsAny(normalized, ["portfolio", "holding", "holdings", "sync", "snapshot"]);
  if (!onActivitySurface && portfolioChangePrompt) return false;
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
        "Autopilot setup: open Settings at the Autopilot section.",
        "That is where the autonomous lane's mode, daemon health, and safety caps live in plain English.",
        "Master Mold cannot sign, submit, or move funds.",
      ].join(" "),
      actions: [
        { label: "Autopilot Settings", href: "/settings#web3-wallet-trading" },
        { label: "Open Trade", href: "/trading" },
        { label: "Safety Limits", href: "/settings#safety-limits" },
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
        "Autopilot status: open Trade where positions, the ledger, and the decision trace are grouped.",
        "Use it to review what the autonomous lane is already doing.",
        "Chat can route and explain, but it cannot submit or sign orders.",
      ].join(" "),
      actions: [
        { label: "Open Trade", href: "/trading" },
        { label: "Autopilot Settings", href: "/settings#web3-wallet-trading" },
        { label: "System Status", href: "/review" },
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
    "live trading review",
    "review before live trading",
    "before live trading",
  ])) {
    return {
      body: [
        "Technical details: open Trade for the autopilot trace and gate, or System status for what works and what is sample.",
        "Detailed status is read-only and cannot trade, sign, or move funds.",
      ].join(" "),
      actions: [
        { label: "Open Trade", href: "/trading" },
        { label: "System Status", href: "/review" },
        { label: "Health Status", href: "/api/health" },
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
        "Wallet setup: the autopilot wallet key lives in server env only (AUTOPILOT_WALLET_SECRET); the app never asks for private keys.",
        "Open Settings for the Autopilot section, and keep private keys out of chat.",
        "Master Mold cannot sign, submit, or move funds from chat.",
      ].join(" "),
      actions: [
        { label: "Autopilot Settings", href: "/settings#web3-wallet-trading" },
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
        { label: "Autopilot Settings", href: "/settings#web3-wallet-trading" },
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
      purpose: "Trade shows the Autopilot lane: mode, gate, feed, positions, ledger, and the decision trace.",
      related: [
        { label: "Autopilot Settings", href: "/settings#web3-wallet-trading" },
        { label: "Safety Limits", href: "/settings#safety-limits" },
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

function buildTodayCommandAnswer(asOf: AsOfFilter | null = null, pageContext?: ChatPageContext): LocalCommandAnswer {
  const facts = getChatFacts(asOf);
  const dailyReport = asOf ? null : getLatestDailyReport();
  const todayFocusLabel = todayPortfolioAwareFocusLabel(asOf) ?? facts.briefing_headline;
  const activityLine = facts.top_alert_tier === "n/a"
    ? facts.top_alert
    : `${facts.top_alert_tier}: ${facts.top_alert}`;
  const onToday = pageContext?.surface.toLowerCase() === "today";
  const focusVerdict = sentenceFragment(todayFocusLabel);
  const riskLine = todayRiskLine(facts);

  return {
    body: [
      "Today check:",
      `Focus: ${focusVerdict}`,
      `Why: ${todayFocusReason(activityLine, facts)}`,
      `Risk: ${riskLine}`,
      dailyReport ? `Report: ${dailyReport.focus.summary}` : "Report: no manual daily report has been saved yet.",
      onToday
        ? "Next: Check Activity; paper-test later if it still matters."
        : "Next: open Today; then paper-test before risking real money.",
    ].join("\n"),
    actions: onToday
      ? [
          { label: "Check Activity", href: "/activity" },
          { label: "Test On Paper", href: "/paper" },
        ]
      : [
          { label: "Open Today", href: "/" },
          { label: "Check Activity", href: "/activity" },
          { label: "Test On Paper", href: "/paper" },
        ],
  };
}

function todayFocusReason(activityLine: string, facts: ReturnType<typeof getChatFacts>) {
  const holdingPhrase = todayHoldingRiskPhrase(facts);

  if (activityLine === "No visible activity item") {
    return `${holdingPhrase}; ask before adding risk.`;
  }

  return `${plainTodayActivityLine(activityLine)}; ${holdingPhrase}.`;
}

function sentenceFragment(value: string) {
  const trimmed = value.trim().replace(/[.]+$/g, "");
  return `${trimmed}.`;
}

function todayRiskLine(facts: ReturnType<typeof getChatFacts>) {
  if (facts.top_holding_context === "No visible holding is loaded") {
    return "No personal sizing context is loaded yet.";
  }

  return `${todayHoldingRiskPhrase(facts)}; keep this as review until the check still matters.`;
}

function todayHoldingRiskPhrase(facts: ReturnType<typeof getChatFacts>) {
  if (facts.top_holding_context === "No visible holding is loaded") {
    return "No visible holding is loaded";
  }

  return `${facts.top_holding} is ${facts.top_holding_weight_pct.toFixed(1)}% visible exposure`;
}

function plainTodayActivityLine(activityLine: string) {
  return activityLine.replace(/^(Urgent|Worth checking|FYI):\s*/u, "");
}

function todayPortfolioAwareFocusLabel(asOf: AsOfFilter | null = null) {
  const portfolio = getPortfolio(asOf);
  const cards = getBriefingCards(asOf);
  const actionableCards = cards.filter((card) => card.status === "actionable");
  const orderedCards = [...actionableCards].sort((a, b) => {
    const aWeight = findTodayRelatedHoldingWeight(a, portfolio);
    const bWeight = findTodayRelatedHoldingWeight(b, portfolio);

    return bWeight - aWeight || b.conviction - a.conviction || a.rank - b.rank;
  });
  const topCard = orderedCards[0] ?? cards[0] ?? null;

  if (!topCard) return null;

  const relatedHolding = portfolio.holdings.find((holding) => {
    const searchable = `${topCard.headline} ${topCard.asset_ids.join(" ")}`.toLowerCase();
    return searchable.includes(holding.symbol.toLowerCase());
  });
  const symbol = relatedHolding?.symbol ?? topCard.asset_ids[0] ?? null;

  if (!symbol) return plainBriefingHeadline(topCard.headline);

  return `${symbol} first`;
}

function findTodayRelatedHoldingWeight(
  card: ReturnType<typeof getBriefingCards>[number],
  portfolio: ReturnType<typeof getPortfolio>,
) {
  const searchable = `${card.headline} ${card.asset_ids.join(" ")}`.toLowerCase();
  return portfolio.holdings.find((holding) => searchable.includes(holding.symbol.toLowerCase()))?.weight_pct ?? 0;
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
        "When the scan engine is configured, this command first runs a read-only portfolio preflight and syncs Monarch if available.",
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
      "It first runs a read-only portfolio preflight and syncs Monarch if configured, then it scans the market against the latest saved context.",
      "It can take a minute or two, so I am not making chat wait here.",
      "Open Today or Review to watch the saved read and preflight receipt update. This scan cannot place brokerage trades, sign transactions, or move funds.",
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
  const dailyTruth = getDailyTruthSummary(asOf);
  const brainSnapshot = asOf ? null : getLatestPortfolioBrainSnapshot();
  const changeSummary = brainSnapshot ? getPortfolioBrainChangeSummary() : null;
  const topHolding = portfolio.holdings[0];
  const value = formatCurrency(portfolio.total_market_value);
  const change = `${portfolio.daily_change_value >= 0 ? "+" : ""}${formatCurrency(portfolio.daily_change_value)}`;
  const source =
    brainSnapshot
      ? `Monarch MCP snapshot from ${formatReadableChatTime(brainSnapshot.synced_at)}`
      : portfolio.provenance.label === "Imported portfolio"
      ? "an imported holdings snapshot plus local manual entries"
      : portfolio.provenance.label === "Manual portfolio"
        ? "local manual entries"
        : "a sample portfolio";
  const snapshotSourceLine = portfolioSnapshotSourceLine(portfolio, brainSnapshot, changeSummary, source);
  const topHoldings = portfolio.holdings
    .slice(0, 5)
    .map((holding) => `${holding.symbol} ${holding.weight_pct.toFixed(1)}%`)
    .join(", ");
  const riskDriverLine = portfolioRiskDriverLine(portfolio);
  const holdingLine = topHolding
    ? brainSnapshot
      ? `Largest Monarch-synced holdings: ${topHoldings}.`
      : `Largest visible holding: ${topHolding.symbol} ${topHolding.weight_pct.toFixed(1)}%.`
    : "No visible holding loaded.";
  const nextLine = brainSnapshot
    ? "Review concentration; use Paper first. Chat cannot trade or move funds."
    : "Review concentration; add/import holdings if this is not yours. Chat cannot trade.";

  return {
    body: [
      "Portfolio check:",
      `Value: ${value}, ${change} today.`,
      `Exposure: ${holdingLine}`,
      `Source: ${snapshotSourceLine}.`,
      `Risk: ${riskDriverLine}`,
      `Data: ${dailyTruth.chat_line}`,
      `Next: ${nextLine}`,
    ].join("\n"),
      actions: [
        { label: "Open Portfolio", href: "/portfolio" },
        { label: "Add Holding", href: "/portfolio?action=add-holding#add-holdings" },
        { label: "Portfolio Settings", href: "/settings#portfolio-connections" },
      ],
    };
}

function portfolioSnapshotSourceLine(
  portfolio: ReturnType<typeof getPortfolio>,
  brainSnapshot: ReturnType<typeof getLatestPortfolioBrainSnapshot>,
  changeSummary: ReturnType<typeof getPortfolioBrainChangeSummary> | null,
  source: string,
) {
  if (brainSnapshot && changeSummary && changeSummary.status !== "no_snapshot") {
    return `${source}; ${changeSummary.detail}`;
  }
  if (portfolio.provenance.label === "Imported portfolio") {
    return "Imported snapshot; refresh by import or Monarch sync";
  }
  if (portfolio.provenance.label === "Manual portfolio") {
    return "Manual entries; not account-synced";
  }
  return "Sample data; add/import holdings to personalize";
}

function portfolioRiskDriverLine(portfolio: ReturnType<typeof getPortfolio>) {
  const topHolding = portfolio.holdings[0] ?? null;
  if (!topHolding) return "No visible holding is loaded yet.";

  const biggestMover = portfolio.holdings
    .filter((holding) => Math.abs(holding.daily_change_value) > 0)
    .sort((a, b) => Math.abs(b.daily_change_value) - Math.abs(a.daily_change_value))[0] ?? null;
  const concentrationDetail = topHolding.weight_pct >= 35
    ? `${topHolding.symbol} concentration ${topHolding.weight_pct.toFixed(1)}%`
    : `${topHolding.symbol} largest visible holding ${topHolding.weight_pct.toFixed(1)}%`;
  const movementDetail = biggestMover
    ? `${biggestMover.symbol} biggest daily move ${formatSignedCurrency(biggestMover.daily_change_value)}`
    : "no daily mover recorded";

  return `${concentrationDetail}; ${movementDetail}.`;
}

function formatSignedCurrency(value: number) {
  return `${value >= 0 ? "+" : ""}${formatCurrency(value)}`;
}

function formatReadableChatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown time";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
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
      body: [
        "Activity check:",
        "Status: Nothing needs attention right now.",
        "Next: Keep Activity open if you want to review dismissed items.",
      ].join("\n"),
      actions: [{ label: "Open Activity", href: "/activity" }],
    };
  }

  const status = active.length > 0
    ? `${active.length} item${active.length === 1 ? "" : "s"} still need attention`
    : "no active items need attention";

  return {
    body: [
      "Activity check:",
      `Status: ${status}.`,
      `Top: ${shortAlertTierLabel(top.tier)}: ${cleanAlertMessage(top.message)}.`,
      "Next: Open Activity, then dismiss, save, or test the item on paper.",
    ].join("\n"),
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

function tradeActions(): ChatAction[] {
  return [
    { label: "Open Trade", href: "/trading" },
    { label: "Autopilot Settings", href: "/settings#web3-wallet-trading" },
    { label: "Safety Limits", href: "/settings#safety-limits" },
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

export function localCommandHeaders(pageContext?: ChatPageContext, actions: ChatAction[] = []) {
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
      "What is the autopilot doing right now?",
      "What would have to be true before live mode?",
      "What can this Trade page do right now?",
    ];
  }

  return [
    "What should I focus on today?",
    "Check Web3 trading status.",
    "What can this app do for me?",
  ];
}
