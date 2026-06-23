/// <reference types="bun" />

import { describe, expect, test } from "bun:test";
import {
  commandRoutesForChatDraft,
  directRouteForChatDraft,
  routeHintsForChatDraft,
  submittableCommandRoutesForChatDraft,
} from "@/lib/chat-route-hints";
import type { ChatPageContext } from "@/src/db/chat";

const tradeContext: ChatPageContext = {
  surface: "Trade",
  route: "/trading",
  summary: "Wallet status and test-trade setup.",
};

const chatContext: ChatPageContext = {
  surface: "Chat",
  route: "/chat",
  summary: "Dedicated Master Mold command center.",
};

const portfolioReplayContext: ChatPageContext = {
  surface: "Portfolio",
  route: "/portfolio?as_of=2026-06-22T14%3A00%3A00Z",
  summary: "Portfolio replay view.",
};

describe("chat route hints", () => {
  test("GIVEN a blank Trade drawer WHEN it opens THEN wallet and trading actions are ready immediately", () => {
    expect(routeHintsForChatDraft("", tradeContext)).toEqual([
      { label: "Next Action", href: "/trading#next-action" },
      { label: "Active Positions", href: "/trading#active-positions-orders" },
      { label: "Set Up Wallet", href: "/trading#wallet-setup" },
    ]);
  });

  test("GIVEN natural user wording WHEN typed THEN Master Mold shows matching app routes before submit", () => {
    expect(routeHintsForChatDraft("show me the top idea").map((hint) => hint.href)).toContain("/");
    expect(routeHintsForChatDraft("show my win rate").map((hint) => hint.href)).toContain("/journal");
    expect(routeHintsForChatDraft("test my connections").map((hint) => hint.href)).toContain("/settings#portfolio-connections");
    expect(routeHintsForChatDraft("refresh portfolio balances").map((hint) => hint.href)).toContain("/portfolio#holdings");
    expect(routeHintsForChatDraft("test my connections").map((hint) => hint.href)).toContain("/settings?action=test-portfolio-connection#portfolio-connections");
    expect(routeHintsForChatDraft("import holdings snapshot").map((hint) => hint.href)).toContain("/settings?action=import-portfolio-snapshot#portfolio-connections");
    expect(routeHintsForChatDraft("add holding").map((hint) => hint.href)).toContain("/portfolio?action=add-holding#add-holdings");
    expect(routeHintsForChatDraft("manual holding").map((hint) => hint.href)).toContain("/portfolio?action=add-holding#add-holdings");
    expect(routeHintsForChatDraft("test live chat").map((hint) => hint.href)).toContain("/settings?action=test-live-chat#ai-chat-keys");
    expect(routeHintsForChatDraft("show holdings").map((hint) => hint.href)).toContain("/portfolio#holdings");
    expect(routeHintsForChatDraft("show portfolio chart").map((hint) => hint.href)).toContain("/portfolio#portfolio-chart");
    expect(routeHintsForChatDraft("what does the largest visible holding mean for today's risk?")[0]).toEqual({
      label: "Holdings",
      href: "/portfolio#holdings",
    });
    expect(routeHintsForChatDraft("why would this paper idea teach me something before risking real money?")[0]).toEqual({
      label: "Open Paper",
      href: "/paper",
    });
    expect(routeHintsForChatDraft("pull up run scan").map((hint) => hint.href)).toContain("/?action=run-scan#run-scan");
    expect(routeHintsForChatDraft("save context for chat").map((hint) => hint.href)).toContain("/?action=save-context#today-inputs");
    expect(routeHintsForChatDraft("check trade").map((hint) => hint.href)).toContain("/trading#next-action");
    expect(routeHintsForChatDraft("check portfolio risk").map((hint) => hint.href)).toContain("/portfolio#holdings");
    expect(routeHintsForChatDraft("review activity").map((hint) => hint.href)).toContain("/activity#activity-list");
    expect(routeHintsForChatDraft("check setup").map((hint) => hint.href)).toContain("/settings");
    expect(routeHintsForChatDraft("check connections").map((hint) => hint.href)).toContain("/settings#portfolio-connections");
    expect(routeHintsForChatDraft("prepare paper trade").map((hint) => hint.href)).toContain("/paper#paper-trade-form");
    expect(routeHintsForChatDraft("record decision").map((hint) => hint.href)).toContain("/journal#record-call");
    expect(routeHintsForChatDraft("pull holdings").map((hint) => hint.href)).toContain("/portfolio#holdings");
    expect(routeHintsForChatDraft("get portfolio chart").map((hint) => hint.href)).toContain("/portfolio#portfolio-chart");
    expect(routeHintsForChatDraft("pull activity").map((hint) => hint.href)).toContain("/activity#activity-list");
    expect(routeHintsForChatDraft("get setup").map((hint) => hint.href)).toContain("/settings");
    expect(routeHintsForChatDraft("do paper trade").map((hint) => hint.href)).toContain("/paper#paper-trade-form");
    expect(routeHintsForChatDraft("run kill switch drill").map((hint) => hint.href)).toContain("/trading?action=run-kill-switch-drill#next-action");
    expect(routeHintsForChatDraft("trade safety drill").map((hint) => hint.href)).toContain("/trading?action=run-kill-switch-drill#next-action");
    expect(routeHintsForChatDraft("run paper test").map((hint) => hint.href)).toContain("/trading?action=run-paper-test#test-trade-flow");
    expect(routeHintsForChatDraft("test top idea on paper").map((hint) => hint.href)).toContain("/paper?action=prepare-top-paper-trade#paper-trade-form");
    expect(routeHintsForChatDraft("test as paper trade").map((hint) => hint.href)).toContain("/paper?action=prepare-top-paper-trade#paper-trade-form");
    expect(routeHintsForChatDraft("test top activity on paper").map((hint) => hint.href)).toContain("/paper?action=prepare-top-activity-paper-trade#paper-trade-form");
    expect(routeHintsForChatDraft("prepare a paper trade check from the most important activity item").map((hint) => hint.href)).toContain("/paper?action=prepare-top-activity-paper-trade#paper-trade-form");
    expect(routeHintsForChatDraft("record top idea as decision").map((hint) => hint.href)).toContain("/journal?action=record-top-idea#record-call");
    expect(routeHintsForChatDraft("save top call").map((hint) => hint.href)).toContain("/?action=save-top-call#top-idea");
    expect(routeHintsForChatDraft("open top idea").map((hint) => hint.href)).toContain("/#top-idea");
    expect(routeHintsForChatDraft("open idea for BTC shows mixed picture with slight bullish tilt").map((hint) => hint.href)).toContain("/#top-idea");
    expect(routeHintsForChatDraft("mark today useful").map((hint) => hint.href)).toContain("/?action=mark-today-useful#today-feedback");
    expect(routeHintsForChatDraft("mark today not useful").map((hint) => hint.href)).toContain("/?action=mark-today-not-useful#today-feedback");
    expect(routeHintsForChatDraft("show urgent activity").map((hint) => hint.href)).toContain("/activity?filter=urgent#activity-list");
    expect(routeHintsForChatDraft("show worth checking activity").map((hint) => hint.href)).toContain("/activity?filter=worth-checking#activity-list");
    expect(routeHintsForChatDraft("show fyi activity").map((hint) => hint.href)).toContain("/activity?filter=fyi#activity-list");
    expect(routeHintsForChatDraft("show all activity").map((hint) => hint.href)).toContain("/activity#activity-list");
    expect(routeHintsForChatDraft("FYI").map((hint) => hint.href)).toContain("/activity?filter=fyi#activity-list");
    expect(routeHintsForChatDraft("All").map((hint) => hint.href)).toContain("/activity#activity-list");
    expect(routeHintsForChatDraft("save top activity").map((hint) => hint.href)).toContain("/activity?action=save-top-activity#activity-list");
    expect(routeHintsForChatDraft("save as decision").map((hint) => hint.href)).toContain("/activity?action=save-top-activity#activity-list");
    expect(routeHintsForChatDraft("dismiss top activity").map((hint) => hint.href)).toContain("/activity?action=dismiss-top-activity#activity-list");
    expect(routeHintsForChatDraft("mark top activity useful").map((hint) => hint.href)).toContain("/activity?action=mark-top-activity-useful#activity-list");
    expect(routeHintsForChatDraft("mark top activity not useful").map((hint) => hint.href)).toContain("/activity?action=mark-top-activity-not-useful#activity-list");
    expect(routeHintsForChatDraft("paper trade this activity").map((hint) => hint.href)).toContain("/paper?action=prepare-top-activity-paper-trade#paper-trade-form");
    expect(routeHintsForChatDraft("details and response").map((hint) => hint.href)).toContain("/activity#activity-list");
    expect(routeHintsForChatDraft("show today inputs").map((hint) => hint.href)).toContain("/#today-inputs");
    expect(routeHintsForChatDraft("show today inputs").map((hint) => hint.href)).not.toContain("/?action=save-context#today-inputs");
    expect(routeHintsForChatDraft("show data privacy").map((hint) => hint.href)).toContain("/settings#data-privacy");
    expect(routeHintsForChatDraft("open safety limits").map((hint) => hint.href)).toContain("/settings#safety-limits");
    expect(routeHintsForChatDraft("open profile settings").map((hint) => hint.href)).toContain("/settings#profile");
    expect(routeHintsForChatDraft("set up a profile").map((hint) => hint.href)).toContain("/settings#profile");
    expect(routeHintsForChatDraft("restore from backup").map((hint) => hint.href)).toContain("/settings#profile");
    expect(routeHintsForChatDraft("recent calls").map((hint) => hint.href)).toContain("/journal");
    expect(routeHintsForChatDraft("next paper trade").map((hint) => hint.href)).toContain("/paper#paper-trade-form");
    expect(routeHintsForChatDraft("Today")[0]).toEqual({ label: "Open Today", href: "/" });
    expect(routeHintsForChatDraft("Portfolio")[0]).toEqual({ label: "Open Portfolio", href: "/portfolio" });
    expect(routeHintsForChatDraft("Activity")[0]).toEqual({ label: "Open Activity", href: "/activity" });
    expect(routeHintsForChatDraft("Trade")[0]).toEqual({ label: "Open Trade", href: "/trading" });
    expect(routeHintsForChatDraft("Settings")[0]).toEqual({ label: "Open Settings", href: "/settings" });
    expect(routeHintsForChatDraft("Top holding")[0]).toEqual({ label: "Holdings", href: "/portfolio#holdings" });
    expect(routeHintsForChatDraft("Holdings")[0]).toEqual({ label: "Holdings", href: "/portfolio#holdings" });
    expect(routeHintsForChatDraft("Next action")[0]).toEqual({ label: "Next Action", href: "/trading#next-action" });
    expect(routeHintsForChatDraft("Wallet status")[0]).toEqual({ label: "Wallet Status", href: "/trading#wallet-status" });
    expect(routeHintsForChatDraft("Set up wallet")[0]).toEqual({ label: "Set Up Wallet", href: "/trading#wallet-setup" });
    expect(routeHintsForChatDraft("Needs attention")[0]).toEqual({ label: "Urgent Activity", href: "/activity?filter=urgent#activity-list" });
    expect(routeHintsForChatDraft("Urgent")[0]).toEqual({ label: "Urgent Activity", href: "/activity?filter=urgent#activity-list" });
    expect(routeHintsForChatDraft("AI keys")[0]).toEqual({ label: "AI/chat Keys", href: "/settings#ai-chat-keys" });
    expect(routeHintsForChatDraft("Safety")[0]).toEqual({ label: "Safety Limits", href: "/settings#safety-limits" });
    expect(routeHintsForChatDraft("Record a call")[0]).toEqual({ label: "Record A Call", href: "/journal#record-call" });
    expect(routeHintsForChatDraft("Show past view", portfolioReplayContext)[0]).toEqual({ label: "Past View", href: "/portfolio?as_of=2026-06-22T14%3A00%3A00Z#past-view" });
    expect(routeHintsForChatDraft("Return to now", portfolioReplayContext)[0]).toEqual({ label: "Return To Now", href: "/portfolio" });
    expect(routeHintsForChatDraft("open health JSON")[0]).toEqual({
      label: "Health Status",
      href: "/api/health",
    });
    expect(routeHintsForChatDraft("open web3 setup", tradeContext)[0]).toEqual({
      label: "Web3 Setup",
      href: "/settings#web3-wallet-trading",
    });
    expect(routeHintsForChatDraft("check web3 trading setup", tradeContext)[0]).toEqual({
      label: "Web3 Setup",
      href: "/settings#web3-wallet-trading",
    });
    expect(routeHintsForChatDraft("open ai chat keys", tradeContext)[0]).toEqual({
      label: "AI/chat Keys",
      href: "/settings#ai-chat-keys",
    });
    expect(routeHintsForChatDraft("open ai chat keys", tradeContext).map((hint) => hint.href)).not.toContain("/chat");
    expect(routeHintsForChatDraft("show technical status", tradeContext).map((hint) => hint.href)).toContain("/trading?details=technical#technical-status");
    expect(routeHintsForChatDraft("show next action", tradeContext)[0]).toEqual({
      label: "Next Action",
      href: "/trading#next-action",
    });
    expect(routeHintsForChatDraft("show active positions and orders", tradeContext)[0]).toEqual({
      label: "Active Positions",
      href: "/trading#active-positions-orders",
    });
    expect(routeHintsForChatDraft("show wallet status", tradeContext)[0]).toEqual({
      label: "Wallet Status",
      href: "/trading#wallet-status",
    });
    expect(submittableCommandRoutesForChatDraft("Open Today.")[0]).toEqual({
      label: "Open Today",
      href: "/",
    });
    expect(submittableCommandRoutesForChatDraft("Run safety drill.")[0]).toEqual({
      label: "Run Safety Drill",
      href: "/trading?action=run-kill-switch-drill#next-action",
    });
    expect(submittableCommandRoutesForChatDraft("Details and response.")[0]).toEqual({
      label: "Activity Details",
      href: "/activity#activity-list",
    });
    expect(submittableCommandRoutesForChatDraft("Connections")[0]).toEqual({
      label: "Portfolio Setup",
      href: "/settings#portfolio-connections",
    });
    expect(submittableCommandRoutesForChatDraft("Next review")[0]).toEqual({
      label: "Open Journal",
      href: "/journal",
    });
    expect(submittableCommandRoutesForChatDraft("Paper check")[0]).toEqual({
      label: "Submit Paper Trade",
      href: "/paper#paper-trade-form",
    });
    expect(submittableCommandRoutesForChatDraft("Paper trade")[0]).toEqual({
      label: "Submit Paper Trade",
      href: "/paper#paper-trade-form",
    });
    expect(submittableCommandRoutesForChatDraft("Next paper trade")[0]).toEqual({
      label: "Submit Paper Trade",
      href: "/paper#paper-trade-form",
    });
    expect(submittableCommandRoutesForChatDraft("Test as paper trade")[0]).toEqual({
      label: "Prepare Top Paper Trade",
      href: "/paper?action=prepare-top-paper-trade#paper-trade-form",
    });
    expect(submittableCommandRoutesForChatDraft("Submit paper trade")[0]).toEqual({
      label: "Submit Paper Trade",
      href: "/paper#paper-trade-form",
    });
    expect(submittableCommandRoutesForChatDraft("Top activity")[0]).toEqual({
      label: "Activity List",
      href: "/activity#activity-list",
    });
    expect(submittableCommandRoutesForChatDraft("Worth checking")[0]).toEqual({
      label: "Worth Checking",
      href: "/activity?filter=worth-checking#activity-list",
    });
    expect(submittableCommandRoutesForChatDraft("All")[0]).toEqual({
      label: "All Activity",
      href: "/activity#activity-list",
    });
    expect(submittableCommandRoutesForChatDraft("FYI")[0]).toEqual({
      label: "FYI Activity",
      href: "/activity?filter=fyi#activity-list",
    });
    expect(submittableCommandRoutesForChatDraft("Save call")[0]).toEqual({
      label: "Save Top Call",
      href: "/?action=save-top-call#top-idea",
    });
    expect(submittableCommandRoutesForChatDraft("Open idea")[0]).toEqual({
      label: "Top Idea",
      href: "/#top-idea",
    });
    expect(submittableCommandRoutesForChatDraft("Today")[0]).toEqual({
      label: "Open Today",
      href: "/",
    });
    expect(submittableCommandRoutesForChatDraft("Activity")[0]).toEqual({
      label: "Open Activity",
      href: "/activity",
    });
    expect(submittableCommandRoutesForChatDraft("Top holding")[0]).toEqual({
      label: "Holdings",
      href: "/portfolio#holdings",
    });
    expect(submittableCommandRoutesForChatDraft("Holdings")[0]).toEqual({
      label: "Holdings",
      href: "/portfolio#holdings",
    });
    expect(submittableCommandRoutesForChatDraft("Next action")[0]).toEqual({
      label: "Next Action",
      href: "/trading#next-action",
    });
    expect(submittableCommandRoutesForChatDraft("Wallet status")[0]).toEqual({
      label: "Wallet Status",
      href: "/trading#wallet-status",
    });
    expect(submittableCommandRoutesForChatDraft("Set up wallet")[0]).toEqual({
      label: "Set Up Wallet",
      href: "/trading#wallet-setup",
    });
    expect(submittableCommandRoutesForChatDraft("Needs attention")[0]).toEqual({
      label: "Urgent Activity",
      href: "/activity?filter=urgent#activity-list",
    });
    expect(submittableCommandRoutesForChatDraft("Urgent")[0]).toEqual({
      label: "Urgent Activity",
      href: "/activity?filter=urgent#activity-list",
    });
    expect(submittableCommandRoutesForChatDraft("AI keys")[0]).toEqual({
      label: "AI/chat Keys",
      href: "/settings#ai-chat-keys",
    });
    expect(submittableCommandRoutesForChatDraft("Safety")[0]).toEqual({
      label: "Safety Limits",
      href: "/settings#safety-limits",
    });
    expect(submittableCommandRoutesForChatDraft("Record a call")[0]).toEqual({
      label: "Record A Call",
      href: "/journal#record-call",
    });
    expect(submittableCommandRoutesForChatDraft("Show past view", portfolioReplayContext)[0]).toEqual({
      label: "Past View",
      href: "/portfolio?as_of=2026-06-22T14%3A00%3A00Z#past-view",
    });
    expect(submittableCommandRoutesForChatDraft("Return to now", portfolioReplayContext)[0]).toEqual({
      label: "Return To Now",
      href: "/portfolio",
    });
    expect(submittableCommandRoutesForChatDraft("Set up a profile")[0]).toEqual({
      label: "Profile",
      href: "/settings#profile",
    });
    expect(submittableCommandRoutesForChatDraft("Restore from backup")[0]).toEqual({
      label: "Profile",
      href: "/settings#profile",
    });
    expect(submittableCommandRoutesForChatDraft("Recent calls")[0]).toEqual({
      label: "Open Journal",
      href: "/journal",
    });
    expect(submittableCommandRoutesForChatDraft("Open health JSON")[0]).toEqual({
      label: "Health Status",
      href: "/api/health",
    });
    expect(routeHintsForChatDraft("check wallet ownership", tradeContext).map((hint) => hint.href)).toContain("/settings#web3-wallet-trading");
    expect(routeHintsForChatDraft("open test trade", tradeContext)[0]).toEqual({
      label: "Test Trade",
      href: "/trading#test-trade-flow",
    });
    expect(routeHintsForChatDraft("show trading monitor", tradeContext)[0]).toEqual({
      label: "Trade Monitor",
      href: "/trading#trading-monitor",
    });
    expect(routeHintsForChatDraft("show technical details", tradeContext)[0]).toEqual({
      label: "Technical Details",
      href: "/trading?details=technical#technical-status",
    });
  });

  test("GIVEN a direct command has a broad keyword WHEN previewed THEN the committed route appears first", () => {
    expect(commandRoutesForChatDraft("open settings", tradeContext)[0]).toEqual({
      label: "Open Settings",
      href: "/settings",
    });
    expect(commandRoutesForChatDraft("check trade", tradeContext)[0]).toEqual({
      label: "Next Action",
      href: "/trading#next-action",
    });
    expect(commandRoutesForChatDraft("show portfolio", tradeContext)[0]).toEqual({
      label: "Holdings",
      href: "/portfolio#holdings",
    });
  });

  test("GIVEN a question-shaped draft WHEN the command box previews routes THEN submit behavior stays honest", () => {
    expect(routeHintsForChatDraft("What is the next required action on this Trade page?", tradeContext)[0]).toEqual({
      label: "Next Action",
      href: "/trading#next-action",
    });
    expect(submittableCommandRoutesForChatDraft("What is the next required action on this Trade page?", tradeContext)).toEqual([]);
    expect(submittableCommandRoutesForChatDraft("check next action", tradeContext)[0]).toEqual({
      label: "Next Action",
      href: "/trading#next-action",
    });
    expect(submittableCommandRoutesForChatDraft("open largest visible holding", tradeContext)[0]).toEqual({
      label: "Holdings",
      href: "/portfolio#holdings",
    });
  });

  test("GIVEN a page capability question WHEN typed THEN Master Mold previews useful routes without auto-navigating", () => {
    expect(routeHintsForChatDraft("What can you do here?", tradeContext)).toEqual([
      { label: "Next Action", href: "/trading#next-action" },
      { label: "Active Positions", href: "/trading#active-positions-orders" },
      { label: "Set Up Wallet", href: "/trading#wallet-setup" },
    ]);
    expect(routeHintsForChatDraft("Show me what I can do on this page", tradeContext)).toEqual([
      { label: "Next Action", href: "/trading#next-action" },
      { label: "Active Positions", href: "/trading#active-positions-orders" },
      { label: "Set Up Wallet", href: "/trading#wallet-setup" },
    ]);
    expect(directRouteForChatDraft("show me what I can do on this page", tradeContext)).toBeNull();
    expect(submittableCommandRoutesForChatDraft("show me what I can do on this page", tradeContext)).toEqual([]);
  });

  test("GIVEN the dedicated Chat page is used WHEN capability help appears THEN it previews real app jobs", () => {
    expect(routeHintsForChatDraft("", chatContext)).toEqual([
      { label: "Run Scan", href: "/?action=run-scan#run-scan" },
      { label: "Add Holding", href: "/portfolio?action=add-holding#add-holdings" },
      { label: "Check Trade", href: "/trading#next-action" },
      { label: "Import Holdings", href: "/settings?action=import-portfolio-snapshot#portfolio-connections" },
    ]);
    expect(routeHintsForChatDraft("What can you do here?", chatContext)).toEqual([
      { label: "Run Scan", href: "/?action=run-scan#run-scan" },
      { label: "Add Holding", href: "/portfolio?action=add-holding#add-holdings" },
      { label: "Check Trade", href: "/trading#next-action" },
      { label: "Import Holdings", href: "/settings?action=import-portfolio-snapshot#portfolio-connections" },
    ]);
    expect(directRouteForChatDraft("what can you do here?", chatContext)).toBeNull();
    expect(submittableCommandRoutesForChatDraft("what can you do here?", chatContext)).toEqual([]);
  });

  test("GIVEN a mixed Web3 activity request WHEN typed THEN Master Mold keeps activity and trade routes together", () => {
    expect(routeHintsForChatDraft("show me web3 activity", tradeContext)).toEqual([
      { label: "Open Activity", href: "/activity" },
      { label: "Open Trade", href: "/trading" },
      { label: "Set Up Wallet", href: "/trading#wallet-setup" },
      { label: "Trading Settings", href: "/settings#web3-wallet-trading" },
    ]);
  });

  test("GIVEN an explicit navigation command WHEN submitted THEN Master Mold can route immediately", () => {
    expect(directRouteForChatDraft("open activity", tradeContext)).toEqual({
      label: "Open Activity",
      href: "/activity",
    });
    expect(directRouteForChatDraft("today", tradeContext)).toEqual({
      label: "Open Today",
      href: "/",
    });
    expect(directRouteForChatDraft("activity", tradeContext)).toEqual({
      label: "Open Activity",
      href: "/activity",
    });
    expect(directRouteForChatDraft("top holding", tradeContext)).toEqual({
      label: "Holdings",
      href: "/portfolio#holdings",
    });
    expect(directRouteForChatDraft("holdings", tradeContext)).toEqual({
      label: "Holdings",
      href: "/portfolio#holdings",
    });
    expect(directRouteForChatDraft("next action", tradeContext)).toEqual({
      label: "Next Action",
      href: "/trading#next-action",
    });
    expect(directRouteForChatDraft("wallet status", tradeContext)).toEqual({
      label: "Wallet Status",
      href: "/trading#wallet-status",
    });
    expect(directRouteForChatDraft("set up wallet", tradeContext)).toEqual({
      label: "Set Up Wallet",
      href: "/trading#wallet-setup",
    });
    expect(directRouteForChatDraft("needs attention", tradeContext)).toEqual({
      label: "Urgent Activity",
      href: "/activity?filter=urgent#activity-list",
    });
    expect(directRouteForChatDraft("urgent", tradeContext)).toEqual({
      label: "Urgent Activity",
      href: "/activity?filter=urgent#activity-list",
    });
    expect(directRouteForChatDraft("ai keys", tradeContext)).toEqual({
      label: "AI/chat Keys",
      href: "/settings#ai-chat-keys",
    });
    expect(directRouteForChatDraft("safety", tradeContext)).toEqual({
      label: "Safety Limits",
      href: "/settings#safety-limits",
    });
    expect(directRouteForChatDraft("show past view", portfolioReplayContext)).toEqual({
      label: "Past View",
      href: "/portfolio?as_of=2026-06-22T14%3A00%3A00Z#past-view",
    });
    expect(directRouteForChatDraft("return to now", portfolioReplayContext)).toEqual({
      label: "Return To Now",
      href: "/portfolio",
    });
    expect(directRouteForChatDraft("show me web3 activity", tradeContext)).toEqual({
      label: "Open Activity",
      href: "/activity",
    });
    expect(directRouteForChatDraft("open wallet setup", tradeContext)).toEqual({
      label: "Set Up Wallet",
      href: "/trading#wallet-setup",
    });
    expect(directRouteForChatDraft("show next action", tradeContext)).toEqual({
      label: "Next Action",
      href: "/trading#next-action",
    });
    expect(directRouteForChatDraft("open active positions", tradeContext)).toEqual({
      label: "Active Positions",
      href: "/trading#active-positions-orders",
    });
    expect(directRouteForChatDraft("show wallet status", tradeContext)).toEqual({
      label: "Wallet Status",
      href: "/trading#wallet-status",
    });
    expect(directRouteForChatDraft("open test trade", tradeContext)).toEqual({
      label: "Test Trade",
      href: "/trading#test-trade-flow",
    });
    expect(directRouteForChatDraft("show trading monitor", tradeContext)).toEqual({
      label: "Trade Monitor",
      href: "/trading#trading-monitor",
    });
    expect(directRouteForChatDraft("show technical details", tradeContext)).toEqual({
      label: "Technical Details",
      href: "/trading?details=technical#technical-status",
    });
    expect(directRouteForChatDraft("open web3 setup", tradeContext)).toEqual({
      label: "Web3 Setup",
      href: "/settings#web3-wallet-trading",
    });
    expect(directRouteForChatDraft("check web3 trading setup", tradeContext)).toEqual({
      label: "Web3 Setup",
      href: "/settings#web3-wallet-trading",
    });
    expect(directRouteForChatDraft("open ai chat keys", tradeContext)).toEqual({
      label: "AI/chat Keys",
      href: "/settings#ai-chat-keys",
    });
    expect(directRouteForChatDraft("open add holding", tradeContext)).toEqual({
      label: "Add Holding",
      href: "/portfolio?action=add-holding#add-holdings",
    });
    expect(directRouteForChatDraft("add holding", chatContext)).toEqual({
      label: "Add Holding",
      href: "/portfolio?action=add-holding#add-holdings",
    });
    expect(directRouteForChatDraft("manual holding", chatContext)).toEqual({
      label: "Add Holding",
      href: "/portfolio?action=add-holding#add-holdings",
    });
    expect(directRouteForChatDraft("show holdings", tradeContext)).toEqual({
      label: "Holdings",
      href: "/portfolio#holdings",
    });
    expect(directRouteForChatDraft("show portfolio chart", tradeContext)).toEqual({
      label: "Portfolio Chart",
      href: "/portfolio#portfolio-chart",
    });
    expect(directRouteForChatDraft("open run scan", tradeContext)).toEqual({
      label: "Run Scan",
      href: "/?action=run-scan#run-scan",
    });
    expect(directRouteForChatDraft("run scan", tradeContext)).toEqual({
      label: "Run Scan",
      href: "/?action=run-scan#run-scan",
    });
    expect(directRouteForChatDraft("open save context", tradeContext)).toEqual({
      label: "Save Context",
      href: "/?action=save-context#today-inputs",
    });
    expect(directRouteForChatDraft("save context for chat", tradeContext)).toEqual({
      label: "Save Context",
      href: "/?action=save-context#today-inputs",
    });
    expect(directRouteForChatDraft("check trade", tradeContext)).toEqual({
      label: "Next Action",
      href: "/trading#next-action",
    });
    expect(directRouteForChatDraft("check web3", tradeContext)).toEqual({
      label: "Next Action",
      href: "/trading#next-action",
    });
    expect(directRouteForChatDraft("check portfolio risk", tradeContext)).toEqual({
      label: "Holdings",
      href: "/portfolio#holdings",
    });
    expect(directRouteForChatDraft("review activity", tradeContext)).toEqual({
      label: "Activity List",
      href: "/activity#activity-list",
    });
    expect(directRouteForChatDraft("check setup", tradeContext)).toEqual({
      label: "Open Settings",
      href: "/settings",
    });
    expect(directRouteForChatDraft("open settings", tradeContext)).toEqual({
      label: "Open Settings",
      href: "/settings",
    });
    expect(directRouteForChatDraft("check connections", tradeContext)).toEqual({
      label: "Portfolio Setup",
      href: "/settings#portfolio-connections",
    });
    expect(directRouteForChatDraft("prepare paper trade", tradeContext)).toEqual({
      label: "Submit Paper Trade",
      href: "/paper#paper-trade-form",
    });
    expect(directRouteForChatDraft("record decision", tradeContext)).toEqual({
      label: "Record A Call",
      href: "/journal#record-call",
    });
    expect(directRouteForChatDraft("pull holdings", tradeContext)).toEqual({
      label: "Holdings",
      href: "/portfolio#holdings",
    });
    expect(directRouteForChatDraft("get portfolio chart", tradeContext)).toEqual({
      label: "Portfolio Chart",
      href: "/portfolio#portfolio-chart",
    });
    expect(directRouteForChatDraft("pull activity", tradeContext)).toEqual({
      label: "Activity List",
      href: "/activity#activity-list",
    });
    expect(directRouteForChatDraft("get setup", tradeContext)).toEqual({
      label: "Open Settings",
      href: "/settings",
    });
    expect(directRouteForChatDraft("do setup check", tradeContext)).toEqual({
      label: "Open Settings",
      href: "/settings",
    });
    expect(directRouteForChatDraft("do connection check", tradeContext)).toEqual({
      label: "Test Portfolio Connection",
      href: "/settings?action=test-portfolio-connection#portfolio-connections",
    });
    expect(directRouteForChatDraft("do paper trade", tradeContext)).toEqual({
      label: "Submit Paper Trade",
      href: "/paper#paper-trade-form",
    });
    expect(directRouteForChatDraft("run kill switch drill", tradeContext)).toEqual({
      label: "Run Safety Drill",
      href: "/trading?action=run-kill-switch-drill#next-action",
    });
    expect(directRouteForChatDraft("run paper test", tradeContext)).toEqual({
      label: "Run Paper Test",
      href: "/trading?action=run-paper-test#test-trade-flow",
    });
    expect(directRouteForChatDraft("test top idea on paper", tradeContext)).toEqual({
      label: "Prepare Top Paper Trade",
      href: "/paper?action=prepare-top-paper-trade#paper-trade-form",
    });
    expect(directRouteForChatDraft("test as paper trade", tradeContext)).toEqual({
      label: "Prepare Top Paper Trade",
      href: "/paper?action=prepare-top-paper-trade#paper-trade-form",
    });
    expect(directRouteForChatDraft("test top activity on paper", tradeContext)).toEqual({
      label: "Prepare Top Activity Paper Trade",
      href: "/paper?action=prepare-top-activity-paper-trade#paper-trade-form",
    });
    expect(directRouteForChatDraft("record top idea as decision", tradeContext)).toEqual({
      label: "Record Top Idea",
      href: "/journal?action=record-top-idea#record-call",
    });
    expect(directRouteForChatDraft("pull today's scan", tradeContext)).toEqual({
      label: "Run Scan",
      href: "/?action=run-scan#run-scan",
    });
    expect(directRouteForChatDraft("get wallet setup", tradeContext)).toEqual({
      label: "Set Up Wallet",
      href: "/trading#wallet-setup",
    });
    expect(directRouteForChatDraft("save top call", tradeContext)).toEqual({
      label: "Save Top Call",
      href: "/?action=save-top-call#top-idea",
    });
    expect(directRouteForChatDraft("save this idea", tradeContext)).toEqual({
      label: "Save Top Call",
      href: "/?action=save-top-call#top-idea",
    });
    expect(directRouteForChatDraft("open top idea", tradeContext)).toEqual({
      label: "Top Idea",
      href: "/#top-idea",
    });
    expect(directRouteForChatDraft("open idea for BTC shows mixed picture with slight bullish tilt", tradeContext)).toEqual({
      label: "Top Idea",
      href: "/#top-idea",
    });
    expect(directRouteForChatDraft("mark today useful", tradeContext)).toEqual({
      label: "Mark Today Useful",
      href: "/?action=mark-today-useful#today-feedback",
    });
    expect(directRouteForChatDraft("mark today not useful", tradeContext)).toEqual({
      label: "Mark Today Not Useful",
      href: "/?action=mark-today-not-useful#today-feedback",
    });
    expect(directRouteForChatDraft("show urgent activity", tradeContext)).toEqual({
      label: "Urgent Activity",
      href: "/activity?filter=urgent#activity-list",
    });
    expect(directRouteForChatDraft("show worth checking activity", tradeContext)).toEqual({
      label: "Worth Checking",
      href: "/activity?filter=worth-checking#activity-list",
    });
    expect(directRouteForChatDraft("show fyi activity", tradeContext)).toEqual({
      label: "FYI Activity",
      href: "/activity?filter=fyi#activity-list",
    });
    expect(directRouteForChatDraft("all", tradeContext)).toEqual({
      label: "All Activity",
      href: "/activity#activity-list",
    });
    expect(directRouteForChatDraft("fyi", tradeContext)).toEqual({
      label: "FYI Activity",
      href: "/activity?filter=fyi#activity-list",
    });
    expect(directRouteForChatDraft("save top activity", tradeContext)).toEqual({
      label: "Save Top Activity",
      href: "/activity?action=save-top-activity#activity-list",
    });
    expect(directRouteForChatDraft("dismiss top activity", tradeContext)).toEqual({
      label: "Dismiss Top Activity",
      href: "/activity?action=dismiss-top-activity#activity-list",
    });
    expect(directRouteForChatDraft("mark top activity useful", tradeContext)).toEqual({
      label: "Mark Top Activity Useful",
      href: "/activity?action=mark-top-activity-useful#activity-list",
    });
    expect(directRouteForChatDraft("mark top activity not useful", tradeContext)).toEqual({
      label: "Mark Top Activity Not Useful",
      href: "/activity?action=mark-top-activity-not-useful#activity-list",
    });
    expect(directRouteForChatDraft("show data privacy", tradeContext)).toEqual({
      label: "Data Privacy",
      href: "/settings#data-privacy",
    });
    expect(directRouteForChatDraft("open safety limits", tradeContext)).toEqual({
      label: "Safety Limits",
      href: "/settings#safety-limits",
    });
    expect(directRouteForChatDraft("open profile settings", tradeContext)).toEqual({
      label: "Profile",
      href: "/settings#profile",
    });
    expect(directRouteForChatDraft("set up a profile", tradeContext)).toEqual({
      label: "Profile",
      href: "/settings#profile",
    });
    expect(directRouteForChatDraft("restore from backup", tradeContext)).toEqual({
      label: "Profile",
      href: "/settings#profile",
    });
    expect(directRouteForChatDraft("recent calls", tradeContext)).toEqual({
      label: "Open Journal",
      href: "/journal",
    });
    expect(directRouteForChatDraft("next paper trade", tradeContext)).toEqual({
      label: "Submit Paper Trade",
      href: "/paper#paper-trade-form",
    });
    expect(directRouteForChatDraft("show portfolio connections", tradeContext)).toEqual({
      label: "Portfolio Setup",
      href: "/settings#portfolio-connections",
    });
    expect(directRouteForChatDraft("open chat keys", tradeContext)).toEqual({
      label: "AI/chat Keys",
      href: "/settings#ai-chat-keys",
    });
    expect(directRouteForChatDraft("check wallet ownership", tradeContext)).toEqual({
      label: "Trading Settings",
      href: "/settings#web3-wallet-trading",
    });
    expect(directRouteForChatDraft("test my connections", tradeContext)).toEqual({
      label: "Test Portfolio Connection",
      href: "/settings?action=test-portfolio-connection#portfolio-connections",
    });
    expect(directRouteForChatDraft("import holdings snapshot", tradeContext)).toEqual({
      label: "Import Holdings Snapshot",
      href: "/settings?action=import-portfolio-snapshot#portfolio-connections",
    });
    expect(directRouteForChatDraft("test live chat", tradeContext)).toEqual({
      label: "Test Live Chat",
      href: "/settings?action=test-live-chat#ai-chat-keys",
    });
    expect(directRouteForChatDraft("open health JSON", tradeContext)).toEqual({
      label: "Health Status",
      href: "/api/health",
    });
    expect(directRouteForChatDraft("get help", tradeContext)).toBeNull();
    expect(directRouteForChatDraft("do I need to worry about this?", tradeContext)).toBeNull();
  });
});
