/// <reference types="bun" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { __resetStoreForTests } from "../src/db/store";
import { getChatContext } from "../src/db/chat";
import { buildUserPromptForRequest, cleanChatText, inferResponseCleanupMode } from "../lib/chat-copy";

const FIXTURES = join(process.cwd(), "tests", "fixtures", "engine");

let prevEngine: string | undefined;
let prevDb: string | undefined;

beforeEach(() => {
  prevEngine = process.env.ENGINE_OUT_DIR;
  prevDb = process.env.MASTERMOLD_DB;
  process.env.MASTERMOLD_DB = join(mkdtempSync(join(tmpdir(), "mm-chat-")), "db.sqlite");
  __resetStoreForTests();
});

afterEach(() => {
  if (prevEngine === undefined) delete process.env.ENGINE_OUT_DIR;
  else process.env.ENGINE_OUT_DIR = prevEngine;
  if (prevDb === undefined) delete process.env.MASTERMOLD_DB;
  else process.env.MASTERMOLD_DB = prevDb;
  __resetStoreForTests();
});

describe("chat context injection (Phase 3)", () => {
  test("GIVEN a saved engine run THEN the chat context carries saved market-read cards", () => {
    process.env.ENGINE_OUT_DIR = FIXTURES;
    const ctx = getChatContext();
    const parsed = JSON.parse(ctx.llm_context);
    expect(parsed.data_state.market_scan_state).toBe("saved market read");
    expect(parsed.daily_rundown_cards[0].data_state).toBe("saved market read");
    // the top engine card headline is included for briefing follow-ups
    expect(ctx.facts.briefing_headline).toContain("NVIDIA");
  });

  test("GIVEN no engine run THEN the chat context falls back to seeded sample data honestly", () => {
    const empty = mkdtempSync(join(tmpdir(), "engine-empty-"));
    process.env.ENGINE_OUT_DIR = empty;
    const ctx = getChatContext();
    const parsed = JSON.parse(ctx.llm_context);
    expect(parsed.data_state.market_scan_state).toBe("sample market context");
    expect(parsed.daily_readiness.title).toBe("Add portfolio context");
    expect(parsed.daily_readiness.label).toBe("Sample read");
    expect(parsed.daily_readiness.detail).toContain("before treating Today as personal");
    expect(parsed.advisory_boundary).toContain("No trading");
  });
});

describe("chat copy cleanup", () => {
  test("GIVEN model markdown and raw market jargon THEN cleanup returns plain product copy", () => {
    const cleaned = cleanChatText(
      "### Why it matters\n**Why it matters:** This alert flags that NVDA is showing unusual volume. Use the *Paper* tab. This signal can signal a shift. BTC has mixed reasons to watch. These actionable signals are high-conviction insights with z-score, sigma, and open interest detail.",
    );

    expect(cleaned).not.toContain("*");
    expect(cleaned).not.toContain("###");
    expect(cleaned).toContain("Use the Paper tab.");
    expect(cleaned).not.toMatch(/\bsignals?\b/i);
    expect(cleaned).not.toMatch(/actionable|insights|high-conviction|z-score|sigma|flags/i);
    expect(cleaned).toContain("This alert shows that NVDA has unusual volume.");
    expect(cleaned).toContain("This reason to watch can point to a shift.");
    expect(cleaned).toContain("BTC has a mixed picture.");
    expect(cleaned).not.toMatch(/mixed reasons to watch/i);
    expect(cleaned).toContain("things to check");
    expect(cleaned).toContain("strongly scored");
    expect(cleaned).toContain("unusual move");
    expect(cleaned).toContain("borrow-market activity");
  });

  test("GIVEN live provider wording drifts THEN cleanup keeps the answer product-readable", () => {
    const cleaned = cleanChatText(
      "1. Mixed Picture: BTC is up 0.6% today (unusual vs. recent history). 2. Visible risk level Matters: BTC is concentrated. Action: Check heavier trading volume and the a mixed picture. Paper is a way to review and review without risk.",
    );

    expect(cleaned).toContain("stronger than recent history");
    expect(cleaned).toContain("2. Why it matters");
    expect(cleaned).toContain("heavier trading activity");
    expect(cleaned).toContain("the mixed picture");
    expect(cleaned).toContain("test and review without risk");
    expect(cleaned).not.toMatch(/unusual vs\. recent history|Visible risk level Matters|heavier trading volume|the a mixed picture|review and review/i);
  });

  test("GIVEN a provider suggests connecting accounts THEN cleanup keeps portfolio import truthful", () => {
    const cleaned = cleanChatText(
      "Connect a broker or wallet to replace the sample data. If you connect a real brokerage or wallet later, the system can pull live holdings, but right now, everything is sample-based.",
    );

    expect(cleaned).toContain("Use Settings import for a holdings snapshot, or use manual entries.");
    expect(cleaned).toContain("Connection checks exist, but holdings appear only after an explicit holdings snapshot import.");
    expect(cleaned).not.toMatch(/pull live holdings|replace the sample data/i);
  });

  test("GIVEN live model copy says demo data THEN cleanup keeps product language serious", () => {
    const cleaned = cleanChatText(
      "The portfolio state is a demo portfolio, meaning it uses demo data rather than real or imported holdings. These are demo holdings and demo values. Import real holdings via Settings.",
    );

    expect(cleaned).toContain("The portfolio state is a sample portfolio");
    expect(cleaned).toContain("uses sample data");
    expect(cleaned).toContain("sample holdings");
    expect(cleaned).toContain("sample values");
    expect(cleaned).toContain("import a holdings snapshot");
    expect(cleaned).not.toMatch(/demo portfolio|demo data|demo holdings|demo values/i);
    expect(cleaned).not.toMatch(/real holdings/i);
  });

  test("GIVEN a sample portfolio answer uses possessive holdings THEN cleanup keeps sample ownership clear", () => {
    const cleaned = cleanChatText(
      "Portfolio state: This is a sample portfolio, not imported money. Top priority: Check NVDA. It's your second-largest holding at 27% of your visible portfolio and 27% of your visible holdings. BTC is your largest holding (49% of portfolio and 49% of the portfolio). It could change your portfolio's risk profile and your overall value. It is trading unusually heavy trading and trading much heavier than usual and trading unusually heavy with unusual trading volume and trading much more than usual volume. unusual trading activity can change risk. Track DeFi exposure later. ETH is not in your holdings, not in holdings, and this is your sample portfolio. BTC is 49% of your sample holdings. It is 3.7% of your portfolio.",
      { responseMode: "daily-focus-with-portfolio" },
    );

    expect(cleaned).toStartWith("Portfolio state:");
    expect(cleaned).toContain("the sample portfolio's second-largest holding at 27%");
    expect(cleaned).toContain("of the sample portfolio");
    expect(cleaned).toContain("of the sample holdings");
    expect(cleaned).toContain("49% of the sample holdings");
    expect(cleaned).toContain("49% of the sample portfolio");
    expect(cleaned).toContain("trading much more than usual");
    expect(cleaned).toContain("unusual trading activity");
    expect(cleaned).toContain("Unusual trading activity can change risk");
    expect(cleaned).toContain("the sample portfolio's largest holding");
    expect(cleaned).toContain("the sample portfolio's risk profile");
    expect(cleaned).toContain("the sample portfolio's total value");
    expect(cleaned).toContain("3.7% of the sample portfolio");
    expect(cleaned).toContain("on-chain cash exposure");
    expect(cleaned).toContain("not in the sample holdings");
    expect(cleaned).toContain("this is the sample portfolio");
    expect(cleaned).not.toMatch(/your (?:largest|second-largest|top|main) (?:holding|position|exposure)/i);
    expect(cleaned).not.toMatch(/your portfolio|your visible portfolio|your visible holdings|your holdings|your sample holdings|your sample portfolio|your portfolio's|your overall value|DeFi exposure|trading unusually heavy|trading much heavier than usual|trading much more than usual volume|unusual trading volume|not in holdings/i);

    const demoPortfolio = cleanChatText("BTC is 49% of your visible demo portfolio and 49% of your visible sample portfolio. This sample portfolio is concentrated.");
    expect(demoPortfolio).toContain("49% of the sample portfolio");
    expect(demoPortfolio).not.toMatch(/your visible demo portfolio/i);
    expect(demoPortfolio).not.toMatch(/your visible sample portfolio/i);

    const onChainCopy = cleanChatText(
      "This is a sample portfolio. aUSDC is a on-chain cash position. Rate changes could affect your costs or yields. Unusually high borrowing demand might reason to watch market stress. If you're not using Aave, ignore it unless you're actively managing on-chain cash positions. Focus on your larger positions first.",
    );
    expect(onChainCopy).toContain("aUSDC is an on-chain cash position");
    expect(onChainCopy).toContain("costs or yields in a real account");
    expect(onChainCopy).toContain("can point to market stress");
    expect(onChainCopy).toContain("the visible context is not using Aave");
    expect(onChainCopy).toContain("unless the visible context includes active management of on-chain cash positions");
    expect(onChainCopy).toContain("the sample portfolio's larger positions");
    expect(onChainCopy).not.toMatch(/a on-chain|your costs|your yields|might reason to watch|you're not using Aave|you're actively managing|your larger positions/i);

    const curlyApostropheCopy = cleanChatText(
      "This is a sample portfolio. Borrow-payment rate changes affect your cost to borrow or lend USDC, your borrowing costs, your expected returns, your yields or costs, and your position. If you’re actively borrowing or lending USDC, check it. If you’re supplying aUSDC, yields can move. If you’re using aUSDC as cash, review it. If you’re not actively lending/borrowing aUSDC, ignore it. If you’re not actively managing on-chain cash lending positions, ignore it. If you’ve already adjusted your position, skip it. The rate is tiny and your position is this small, so only review it if it fits your strategy, changes your on-chain cash exposure, changes your aUSDC position, or changes your BTC position.",
    );
    expect(curlyApostropheCopy).toContain("the visible context does not show active on-chain cash lending");
    expect(curlyApostropheCopy).toContain("the cost to borrow or lend USDC");
    expect(curlyApostropheCopy).toContain("borrowing costs in a real account");
    expect(curlyApostropheCopy).toContain("expected returns in a real account");
    expect(curlyApostropheCopy).toContain("yields or costs in a real account");
    expect(curlyApostropheCopy).toContain("the visible position");
    expect(curlyApostropheCopy).toContain("the visible context includes active borrowing or lending");
    expect(curlyApostropheCopy).toContain("a real account is supplying aUSDC");
    expect(curlyApostropheCopy).toContain("the visible context uses aUSDC");
    expect(curlyApostropheCopy).toContain("the visible context does not show active lending or borrowing");
    expect(curlyApostropheCopy).toContain("a real position has already been adjusted");
    expect(curlyApostropheCopy).toContain("the sample position is this small");
    expect(curlyApostropheCopy).toContain("fits a real strategy");
    expect(curlyApostropheCopy).toContain("the visible on-chain cash exposure");
    expect(curlyApostropheCopy).toContain("the visible aUSDC position");
    expect(curlyApostropheCopy).toContain("the sample portfolio's BTC position");
    expect(curlyApostropheCopy).not.toMatch(/you’re supplying|you’re using|you’re actively borrowing|you’re not actively|you’ve already adjusted your position|your borrowing costs|your expected returns|your yields|your position|your strategy|your on-chain cash exposure|your aUSDC position|your BTC position/i);

    const duplicateSnapshotCopy = cleanChatText(
      "Import a snapshot of holdings snapshots or import a real portfolio snapshot before treating this as personal. Importing the sample holdings would replace a demo placeholder until you refresh it or import data.",
    );
    expect(duplicateSnapshotCopy).toContain("Import a holdings snapshot");
    expect(duplicateSnapshotCopy).toContain("import a holdings snapshot");
    expect(duplicateSnapshotCopy).toContain("Importing a holdings snapshot");
    expect(duplicateSnapshotCopy).toContain("sample placeholder");
    expect(duplicateSnapshotCopy).toContain("saving context still does not fetch live market data");
    expect(duplicateSnapshotCopy).not.toContain("snapshot of holdings snapshots");
    expect(duplicateSnapshotCopy).not.toContain("real portfolio snapshot");
    expect(duplicateSnapshotCopy).not.toContain("demo placeholder");
    expect(duplicateSnapshotCopy).not.toContain("until you refresh it or import data");
  });

  test("GIVEN a sample portfolio response uses risk and position ownership THEN cleanup keeps the boundary clear", () => {
    const cleaned = cleanChatText(
      "This is a sample portfolio from your saved market scan. BTC is 49% of the sample portfolio, so it affects your overall risk, your risk, your total value, your total portfolio value, and your overall position. 2. visible risk level: Check if your position size still matches your comfort with volatility, your risk tolerance, risk tolerance, comfort with volatility, risk comfort, and the sample portfolio's risk tolerance. If you're overexposed, test a fake-money change to your balance and your current fake-money allocation. No trading needed; just assess whether the position size still matches the sample portfolio's risk comfort. The a mixed picture can affect your overall portfolio.",
    );

    expect(cleaned).toContain("the saved market read");
    expect(cleaned).toContain("the sample portfolio's overall risk");
    expect(cleaned).toContain("the sample portfolio's risk");
    expect(cleaned).toContain("the sample portfolio's total value");
    expect(cleaned).toContain("the sample portfolio's overall position");
    expect(cleaned).toContain("the position size");
    expect(cleaned).toContain("2. Visible risk level");
    expect(cleaned).toContain("the visible risk level");
    expect(cleaned).toContain("the sample portfolio is overexposed");
    expect(cleaned).toContain("the simulator balance");
    expect(cleaned).toContain("the current paper allocation");
    expect(cleaned).toContain("the mixed picture can affect the visible portfolio");
    expect(cleaned).not.toMatch(/your saved market scan|saved market scan|your overall portfolio|your overall risk|your risk|your total value|your total portfolio value|your overall position|your position size|your comfort with volatility|your risk tolerance|risk tolerance|comfort with volatility|risk comfort|you're overexposed|your balance|your current fake-money allocation|sample portfolio's risk tolerance|the a mixed picture/i);
  });

  test("GIVEN live chat says sample data is not holdings snapshots THEN cleanup keeps it product-readable", () => {
    const cleaned = cleanChatText(
      "Portfolio state: The visible portfolio is sample data, not holdings snapshots. This is not imported or manual holdings. It is not manual or imported holdings.",
      { responseMode: "daily-focus-with-portfolio" },
    );

    expect(cleaned).toStartWith("Portfolio state:");
    expect(cleaned).toContain("sample data, not a manual or imported holdings snapshot");
    expect(cleaned).not.toMatch(/not holdings snapshots|not imported or manual holdings|not manual or imported holdings/i);
  });

  test("GIVEN a model buries the answer THEN cleanup can surface the requested answer first", () => {
    const focus = cleanChatText(
      "Here's a concise summary of the context. Alerts are saved. Top priority: Check NVDA first. Why: unusual trading. Next: review before changing exposure.",
      { responseMode: "daily-focus" },
    );
    expect(focus).toStartWith("Top priority:");
    expect(focus).not.toContain("concise summary");

    const portfolio = cleanChatText(
      "Here's the key advisory context. Portfolio state: This is a sample portfolio; imports appear only after explicit holdings snapshot import.",
      { responseMode: "portfolio-truth" },
    );
    expect(portfolio).toStartWith("Portfolio state:");
    expect(portfolio).not.toContain("key advisory context");

    const dailyWithPortfolio = cleanChatText(
      "Here's the key advisory context. Top priority: Check NVDA first. Portfolio state: This is a sample portfolio. Top priority: Check NVDA first.",
      { responseMode: "daily-focus-with-portfolio" },
    );
    expect(dailyWithPortfolio).toStartWith("Portfolio state:");
    expect(dailyWithPortfolio).not.toContain("key advisory context");
  });

  test("GIVEN a user asks about scheduled scans THEN chat copy starts with schedule truth", () => {
    const prompt = buildUserPromptForRequest("Is the market memory running daily?");
    const mode = inferResponseCleanupMode("Is the market memory running daily?");
    const cleaned = cleanChatText(
      "Here's the key advisory context. Schedule status: Daily market-memory scans are not running. The schedule check does not change Today.",
      { responseMode: mode },
    );

    expect(mode).toBe("schedule-truth");
    expect(prompt).toContain("Begin with `Chat context:`");
    expect(cleaned).toStartWith("Chat context:");
    expect(cleaned).toContain("chat context check is not running");
    expect(cleaned).toContain("local check does not change Today");
    expect(cleaned).not.toContain("key advisory context");
    expect(cleaned).not.toContain("Daily market-memory scans");
  });

  test("GIVEN a user asks about Save context for chat THEN chat starts with the chat-context boundary", () => {
    const prompt = buildUserPromptForRequest("If I press Save context for chat, did it run a broad internet scan?");
    const mode = inferResponseCleanupMode("If I press Save context for chat, did it run a broad internet scan?");
    const cleaned = cleanChatText(
      "Here is context. Chat context: Save context for chat saves app context for chat. To get fresh data, enable scheduled scans or manually trigger a new scan.",
      { responseMode: mode },
    );

    expect(mode).toBe("memory-refresh-truth");
    expect(prompt).toContain("Begin with `Chat context:`");
    expect(prompt).toContain("does not check news, the market, or connected accounts");
    expect(cleaned).toStartWith("Chat context:");
    expect(cleaned).toContain("use the chat context check when it is available or save context for chat");
    expect(cleaned).not.toContain("Here is context");
    expect(cleaned).not.toContain("enable scheduled scans");
    expect(cleaned).not.toContain("manually trigger a new scan");
  });

  test("GIVEN a user asks what is real versus sample THEN chat avoids overstating saved reads", () => {
    const prompt = buildUserPromptForRequest("What is real here and what is still sample?");
    const mode = inferResponseCleanupMode("What is real here and what is still sample?");
    const cleaned = cleanChatText(
      "Here's the breakdown. Real (from saved market reads): The NVDA alert reflects actual unusual activity captured in that scan. Sample: these are not your actual holdings.",
      { responseMode: mode },
    );

    expect(mode).toBe("truth-boundary");
    expect(prompt).toContain("Begin with `Working here:`");
    expect(prompt).toContain("not live market coverage");
    expect(cleaned).toStartWith("Working here:");
    expect(cleaned).toContain("unusual activity marked in the saved read");
    expect(cleaned).toContain("these are not your actual account holdings");
    expect(cleaned).not.toContain("Here's the breakdown");
    expect(cleaned).not.toMatch(/Real \\(from saved market reads\\)|actual unusual activity|actual holdings/i);
  });

  test("GIVEN live chat describes Settings context THEN cleanup keeps Chat context product language", () => {
    const cleaned = cleanChatText(
      "For now, it's a local memory of your last scan. It only saves snapshots when you run a scan. Automatic portfolio imports are not built yet. Recent market scan results are saved, but it only saves when you run scans and full portfolio import automation is not built. Saved scans and canned samples are included. BTC is your largest holding at 49%. It only saves when you run checks and does not fetch fresh market data unless you manually trigger a scan. Your measurement window is still setup only. It won't fetch fresh data unless you explicitly load or import it, and your saved market reads are the source. There are no live updates unless you save context for chat or import. The last market scan is the source.",
    );

    expect(cleaned).toContain("chat context");
    expect(cleaned).toContain("the last saved context");
    expect(cleaned).toContain("only saves chat context when you press Save context for chat or when the local check runs");
    expect(cleaned).toContain("scheduled holdings refresh");
    expect(cleaned).toContain("saved market read");
    expect(cleaned).toContain("saved reads");
    expect(cleaned).toContain("sample notes");
    expect(cleaned).toContain("BTC is the visible portfolio's largest holding at 49%.");
    expect(cleaned).toContain("the measurement window has only started the clock");
    expect(cleaned).toContain("does not fetch fresh market data; import holdings again when balances change");
    expect(cleaned).toContain("no live market or account updates; import holdings again when balances change");
    expect(cleaned).toContain("the saved market reads are the source");
    expect(cleaned).toContain("The last saved read is the source.");
    expect(cleaned).not.toMatch(/local memory|your last scan|run a scan|run scans|run checks|manually trigger a scan|last market scan|explicitly load or import it|no live updates unless you save context|your saved market reads|your measurement window|measurement window is still setup only|Automatic portfolio imports|portfolio import automation|market scan results|Saved scans|canned samples|your largest holding/i);
  });

  test("GIVEN live chat uses old scan filler THEN cleanup says saved read plainly", () => {
    const cleaned = cleanChatText(
      "Saved market scan: market news snippets are saved from the latest saved scan, but no auto-refreshes are running.",
    );

    expect(cleaned).toContain("saved market read");
    expect(cleaned).toContain("market notes");
    expect(cleaned).toContain("scheduled refreshes");
    expect(cleaned).not.toMatch(/saved market scan|saved scan|snippets|auto-refreshes/i);
  });

  test("GIVEN a user asks what makes Today personal THEN chat starts with readiness truth", () => {
    const prompt = buildUserPromptForRequest("What would make today's read more personal and ready to trust?");
    const mode = inferResponseCleanupMode("What would make today's read more personal and ready to trust?");
    const cleaned = cleanChatText(
      "Some setup context. Today readiness: Add your real data first. Manually enter the sample holdings or treat this as a general market scan. Update Portfolio settings with real portfolio context, your holdings snapshots, and your actual positions so this stops being a generic read with generic market observations and a generic market check tailored to your specific holdings, your specific portfolio, your actual exposure, your real exposure, and your specific exposure as a personalized briefing.",
      { responseMode: mode },
    );

    expect(mode).toBe("today-readiness-truth");
    expect(prompt).toContain("Begin with `Today readiness:`");
    expect(prompt).toContain("Do not call sample data a general market scan.");
    expect(cleaned).toStartWith("Today readiness:");
    expect(cleaned).toContain("add manual holdings");
    expect(cleaned).toContain("sample read");
    expect(cleaned).toContain("Portfolio or Settings");
    expect(cleaned).toContain("manual or imported holdings");
    expect(cleaned).toContain("visible portfolio context");
    expect(cleaned).toContain("visible holdings");
    expect(cleaned).toContain("visible portfolio");
    expect(cleaned).toContain("visible exposure");
    expect(cleaned).toContain("sample market observations");
    expect(cleaned).toContain("sample market check");
    expect(cleaned).toContain("portfolio-specific read");
    expect(cleaned).not.toContain("Some setup context");
    expect(cleaned).not.toContain("Manually enter the sample holdings");
    expect(cleaned).not.toContain("general market scan");
    expect(cleaned).not.toContain("your holdings snapshots");
    expect(cleaned).not.toContain("real portfolio context");
    expect(cleaned).not.toContain("your actual positions");
    expect(cleaned).not.toContain("your actual exposure");
    expect(cleaned).not.toContain("your real exposure");
    expect(cleaned).not.toContain("your specific exposure");
    expect(cleaned).not.toContain("your specific holdings");
    expect(cleaned).not.toContain("your specific portfolio");
    expect(cleaned).not.toContain("generic read");
    expect(cleaned).not.toContain("generic market observations");
    expect(cleaned).not.toContain("generic market check");
    expect(cleaned).not.toContain("generic preview");
    expect(cleaned).not.toContain("personalized briefing");
  });
});
