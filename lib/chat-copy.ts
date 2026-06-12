export type ChatTextCleanupMode =
  | "daily-focus"
  | "daily-focus-with-portfolio"
  | "portfolio-truth"
  | "memory-refresh-truth"
  | "today-readiness-truth"
  | "schedule-truth"
  | "truth-boundary";

export function buildUserPromptForRequest(message: string) {
  const normalized = message.toLowerCase();
  const requestRules: string[] = [];
  const wantsOneSentence = /\b(one sentence|single sentence|just one|short answer|quick answer)\b/.test(normalized);

  const isDailyFocus =
    /\b(check|focus|look at|review)\b/.test(normalized) &&
    /\b(first|today|now|next)\b/.test(normalized);
  const includesPortfolioState = /\b(portfolio|holding|holdings)\b/.test(normalized) &&
    /\b(live|sample|demo|real|imported|connected|synced|manual)\b/.test(normalized);
  const asksSchedule =
    /\b(schedule|scheduled|daily|automatic|automated|cron|running)\b/.test(normalized) &&
    /\b(brain|market memory|scan|scans|memory)\b/.test(normalized);
  const asksMemoryRefresh =
    /\brefresh local memory\b/.test(normalized) ||
    (/\bchat context\b/.test(normalized) &&
      /\b(save|saves|saved|what|built|not built|missing|work|works|does)\b/.test(normalized)) ||
    /\bsave context for chat\b/.test(normalized) ||
    /\bsaved? (?:this )?(?:page|view|context) for chat\b/.test(normalized) ||
    (/\brefresh\b/.test(normalized) && /\b(memory|snapshot|brain)\b/.test(normalized)) ||
    /\bbroad (?:internet |market |news )?scan\b/.test(normalized);
  const asksTodayReadiness =
    /\b(more personal|ready to trust|readiness|setup|trust)\b/.test(normalized) &&
    /\b(today|read|rundown|briefing)\b/.test(normalized);
  const asksTruthBoundary =
    /\b(real|sample|demo|working|works|live|trust|not built|missing)\b/.test(normalized) &&
    /\b(what|which|here|still|actually|current|this build)\b/.test(normalized);

  if (asksTruthBoundary && !isDailyFocus && !includesPortfolioState && !asksTodayReadiness) {
    requestRules.push(
      "Begin with `Working here:`. Say saved reads are local saved app data, not live market coverage. Say sample portfolio values are not actual holdings. Do not call market moves actual/live; say the saved read marked them as worth checking.",
    );
  }

  if (asksTodayReadiness) {
    requestRules.push(
      "Begin with `Today readiness:`. Use daily_readiness. If it is a sample read, say to add manual holdings or import a holdings snapshot. Do not call sample data a general market scan.",
    );
  }

  if (asksMemoryRefresh) {
    requestRules.push(
      "Begin with `Chat context:`. Say Save context for chat saves or refreshes app context for chat. It does not check news, the market, or connected accounts.",
    );
  }

  if (asksSchedule) {
    requestRules.push(
      "Begin with `Chat context:`. Say whether the chat context check is running. If the context says off, manual, or on demand only, state that the chat context check is not running and that it does not change Today.",
    );
  }

  if (isDailyFocus && includesPortfolioState) {
    requestRules.push(
      "Begin with `Portfolio state:` in one sentence, then `Top priority:`. State whether the visible portfolio is sample, manual, or imported before calling any holding mine/yours. Do not use bullets or numbered sections.",
    );
  } else if (isDailyFocus) {
    requestRules.push(
      `Begin with \`Top priority:\`. Then give one plain-English reason and one next step. Do not summarize the whole context. Do not use bullets or numbered sections.${wantsOneSentence ? " Keep the whole answer to one sentence." : ""}`,
    );
  }

  if (!isDailyFocus && includesPortfolioState) {
    requestRules.push(
      "Begin with `Portfolio state:`. State clearly whether the visible portfolio is sample, manual, or imported. Do not mention unrelated alerts unless they change that answer.",
    );
  }

  if (!requestRules.length) return message;

  return [
    message,
    "",
    "Response rules for this request:",
    ...requestRules.map((rule) => `- ${rule}`),
  ].join("\n");
}

export function inferResponseCleanupMode(message: string): ChatTextCleanupMode | undefined {
  const normalized = message.toLowerCase();

  const isDailyFocus =
    /\b(check|focus|look at|review)\b/.test(normalized) &&
    /\b(first|today|now|next)\b/.test(normalized);
  const includesPortfolioState = /\b(portfolio|holding|holdings)\b/.test(normalized) &&
    /\b(live|sample|demo|real|imported|connected|synced|manual)\b/.test(normalized);
  const asksSchedule =
    /\b(schedule|scheduled|daily|automatic|automated|cron|running)\b/.test(normalized) &&
    /\b(brain|market memory|scan|scans|memory)\b/.test(normalized);
  const asksMemoryRefresh =
    /\brefresh local memory\b/.test(normalized) ||
    (/\bchat context\b/.test(normalized) &&
      /\b(save|saves|saved|what|built|not built|missing|work|works|does)\b/.test(normalized)) ||
    /\bsave context for chat\b/.test(normalized) ||
    /\bsaved? (?:this )?(?:page|view|context) for chat\b/.test(normalized) ||
    (/\brefresh\b/.test(normalized) && /\b(memory|snapshot|brain)\b/.test(normalized)) ||
    /\bbroad (?:internet |market |news )?scan\b/.test(normalized);
  const asksTodayReadiness =
    /\b(more personal|ready to trust|readiness|setup|trust)\b/.test(normalized) &&
    /\b(today|read|rundown|briefing)\b/.test(normalized);
  const asksTruthBoundary =
    /\b(real|sample|demo|working|works|live|trust|not built|missing)\b/.test(normalized) &&
    /\b(what|which|here|still|actually|current|this build)\b/.test(normalized);

  if (asksTodayReadiness) {
    return "today-readiness-truth";
  }

  if (asksTruthBoundary && !isDailyFocus && !includesPortfolioState && !asksTodayReadiness) {
    return "truth-boundary";
  }

  if (asksMemoryRefresh) {
    return "memory-refresh-truth";
  }

  if (asksSchedule) {
    return "schedule-truth";
  }

  if (isDailyFocus && includesPortfolioState) {
    return "daily-focus-with-portfolio";
  }

  if (isDailyFocus) {
    return "daily-focus";
  }

  if (includesPortfolioState) {
    return "portfolio-truth";
  }
}

export function cleanChatText(
  value: string,
  options: { responseMode?: ChatTextCleanupMode } = {},
) {
  const cleaned = cleanSamplePortfolioPossessives(value)
    .replace(/\*/g, "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\ba on-chain\b/gi, "an on-chain")
    .replace(/\byour saved market scan\b/gi, "the saved market read")
    .replace(/\byour visible portfolio\b/gi, "the visible portfolio")
    .replace(/\byour visible holdings\b/gi, "the visible holdings")
    .replace(/\byour overall portfolio\b/gi, "the visible portfolio")
    .replace(/\byour risk tolerance\b/gi, "the visible risk level")
    .replace(/\brisk tolerance\b/gi, "visible risk level")
    .replace(/\brisk comfort\b/gi, "visible risk level")
    .replace(/\bcomfort with volatility\b/gi, "visible risk level")
    .replace(/\bthe a mixed picture\b/gi, "the mixed picture")
    .replace(/\bvisible risk level matters\b/gi, "Why it matters")
    .replace(/\bunusual vs\. recent history\b/gi, "stronger than recent history")
    .replace(/\bheavier trading volume\b/gi, "heavier trading activity")
    .replace(/\bflags that\b/gi, "shows that")
    .replace(/\bflags\b/gi, "shows")
    .replace(/\bflagged\b/gi, "marked")
    .replace(/\bshows that ([^.]+?) is showing\b/gi, "shows that $1 has")
    .replace(/\bcan signal\b/gi, "can point to")
    .replace(/\bcould signal\b/gi, "could point to")
    .replace(/\bmay signal\b/gi, "may point to")
    .replace(/\bmight reason to watch\b/gi, "can point to")
    .replace(/\btrading much heavier than usual\b/gi, "trading much more than usual")
    .replace(/\btrading much more than usual volume\b/gi, "trading much more than usual")
    .replace(/\btrading unusually heavy\b/gi, "trading much more than usual")
    .replace(/\btrading unusually heavy trading\b/gi, "trading much more than usual")
    .replace(/\bheavy volume\b/gi, "heavy trading")
    .replace(/\btrading unusually heavy trading\b/gi, "trading much more than usual")
    .replace(/\bunusual trading volume\b/gi, "unusual trading activity")
    .replace(/([.!?]\s+)unusual trading activity\b/g, "$1Unusual trading activity")
    .replace(/\bsignals a\b/gi, "suggests a")
    .replace(/\bsignals an\b/gi, "suggests an")
    .replace(/\bsignals that\b/gi, "suggests that")
    .replace(/\bsignal a\b/gi, "suggests a")
    .replace(/\bsignal an\b/gi, "suggests an")
    .replace(/\bsignal that\b/gi, "suggests that")
    .replace(/\bsignaling a\b/gi, "suggesting a")
    .replace(/\bsignaling an\b/gi, "suggesting an")
    .replace(/\bactionable insights\b/gi, "things to check")
    .replace(/\bactionable signals\b/gi, "things to check")
    .replace(/\binsights\b/gi, "notes")
    .replace(/\bmixed reasons to watch\b/gi, "a mixed picture")
    .replace(/\bmixed reason to watch\b/gi, "a mixed picture")
    .replace(/\bsignals\b/gi, "reasons to watch")
    .replace(/\bThis signal\b/g, "This reason to watch")
    .replace(/\bThe signal\b/g, "The reason to watch")
    .replace(/\bA signal\b/g, "A reason to watch")
    .replace(/\ba signal\b/gi, "a reason to watch")
    .replace(/\bthe signal\b/gi, "the reason to watch")
    .replace(/\bthis signal\b/gi, "this reason to watch")
    .replace(/\bsignal\b/gi, "reason to watch")
    .replace(/\bactionable\b/gi, "worth checking")
    .replace(/\bconfigured outside(?= AI service\b)/gi, "outside")
    .replace(/\bconfigured external(?= AI service\b)/gi, "outside")
    .replace(/\boutside A[Ii] service\b/g, "live chat")
    .replace(/\bexternal(?= AI calls\b)/gi, "outside")
    .replace(/\bexternal(?= AI\b)/gi, "outside")
    .replace(/\blive portfolio advice\b/gi, "current personal portfolio advice")
    .replace(/\blive engine output\b/gi, "saved market read")
    .replace(/\bengine output\b/gi, "saved market read")
    .replace(/\bhigh-conviction\b/gi, "strongly scored")
    .replace(/\bconviction\b/gi, "confidence")
    .replace(/\bhighest-confidence\b/gi, "strongly scored")
    .replace(/\bhigher-confidence\b/gi, "strongly scored")
    .replace(/\bhigher confidence\b/gi, "stronger evidence")
    .replace(/\bhigh-confidence\b/gi, "strongly scored")
    .replace(/\bhigh confidence\b/gi, "strong confidence")
    .replace(/\bhypothesis-testing\b/gi, "paper trading and review")
    .replace(/\bhypothesis\b/gi, "idea")
    .replace(/\bpractice with sample data\b/gi, "demo review with sample data")
    .replace(/\breview and review\b/gi, "test and review")
    .replace(/\bdemo portfolio\b/gi, "sample portfolio")
    .replace(/\bdemo holdings\b/gi, "sample holdings")
    .replace(/\bdemo data\b/gi, "sample data")
    .replace(/\bdemo values\b/gi, "sample values")
    .replace(/\bdemo placeholder\b/gi, "sample placeholder")
    .replace(/\bpractice\b/gi, "review")
    .replace(/\bpicks\b/gi, "ideas")
    .replace(/\bthesis\b/gi, "call")
    .replace(/\bDeFi exposure\b/gi, "on-chain cash exposure")
    .replace(/\bDeFi\b/gi, "on-chain cash")
    .replace(/\bopen interest\b/gi, "borrow-market activity")
    .replace(/\bz-score\b/gi, "unusual move")
    .replace(/\bsigma\b/gi, "unusual move")
    .replace(/(^|[\n\r]|[.!?]\s+)(\s*\d+\.\s*)visible risk level\b/gi, "$1$2Visible risk level")
    .replace(
      /\bIf you connect a real brokerage or wallet later, the system can pull live holdings, but right now, everything is sample-based\.?/gi,
      "Connection checks exist, but holdings appear only after an explicit holdings snapshot import.",
    )
    .replace(
      /\bConnect a broker or wallet to replace the sample data\.?/gi,
      "Use Settings import for a holdings snapshot, or use manual entries.",
    )
    .replace(/\bimport real holdings\b/gi, "import a holdings snapshot")
    .replace(/\breal holdings\b/gi, "holdings snapshots")
    .replace(/\breal portfolio context\b/gi, "visible portfolio context")
    .replace(/\byour holdings snapshots\b/gi, "holdings snapshots")
    .replace(/\byour actual positions\b/gi, "manual or imported holdings")
    .replace(/\byour actual exposure\b/gi, "the visible exposure")
    .replace(/\byour real exposure\b/gi, "the visible exposure")
    .replace(/\byour specific exposure\b/gi, "the visible exposure")
    .replace(/\byour on-chain cash exposure\b/gi, "the visible on-chain cash exposure")
    .replace(/\byour specific assets\b/gi, "the visible holdings")
    .replace(/\byour specific holdings\b/gi, "the visible holdings")
    .replace(/\byour specific portfolio\b/gi, "the visible portfolio")
    .replace(/\byour largest holding\b/gi, "the visible portfolio's largest holding")
    .replace(/\byour top holding\b/gi, "the visible portfolio's top holding")
    .replace(/\byour largest position\b/gi, "the visible portfolio's largest position")
    .replace(/\byour top position\b/gi, "the visible portfolio's top position")
    .replace(/\byour ([A-Za-z][A-Za-z0-9]{0,8}) position\b/gi, "the visible $1 position")
    .replace(/\btailored to the visible portfolio\b/gi, "based on the visible portfolio")
    .replace(/\bportfolio settings\b/gi, "Portfolio or Settings")
    .replace(/\bdaily market-memory scans are not running\b/gi, "the chat context check is not running")
    .replace(/\bdaily market memory scans are not running\b/gi, "the chat context check is not running")
    .replace(/\bdaily scans are not running\b/gi, "the chat context check is not running")
    .replace(/\blocal (?:daily )?check is not running\b/gi, "chat context check is not running")
    .replace(/\bonly saves when you run scans\b/gi, "only saves chat context when you press Save context for chat or when the local check runs")
    .replace(/\bonly saves when you run checks\b/gi, "only saves chat context when you press Save context for chat or when the local check runs")
    .replace(/\bonly saves snapshots when you run a scan\b/gi, "only saves chat context when you press Save context for chat or when the local check runs")
    .replace(/\bdoes not fetch fresh market data unless you manually trigger a scan\b/gi, "does not fetch fresh market data")
    .replace(/\bdoesn't fetch fresh market data unless you manually trigger a scan\b/gi, "does not fetch fresh market data")
    .replace(/\bwon'?t fetch fresh data unless you explicitly load or import it\b/gi, "does not fetch fresh market data; import holdings again when balances change")
    .replace(/\bwill not fetch fresh data unless you explicitly load or import it\b/gi, "does not fetch fresh market data; import holdings again when balances change")
    .replace(/\bno live updates unless you save context for chat or import\b/gi, "no live market or account updates; import holdings again when balances change")
    .replace(/\bno live updates unless you save context or import\b/gi, "no live market or account updates; import holdings again when balances change")
    .replace(/\byour saved market reads\b/gi, "the saved market reads")
    .replace(/\byour saved reads\b/gi, "the saved reads")
    .replace(/\brun scans\b/gi, "save chat context")
    .replace(/\brun a scan\b/gi, "save chat context")
    .replace(/\brun checks\b/gi, "save chat context")
    .replace(/\brunning a scan\b/gi, "saving chat context")
    .replace(/\blast market scan\b/gi, "last saved read")
    .replace(/\blast saved scan\b/gi, "last saved read")
    .replace(/\bmanually trigger a new scan\b/gi, "save context for chat")
    .replace(/\bmanually trigger a scan\b/gi, "save context for chat")
    .replace(/\btrigger a scan\b/gi, "save context for chat")
    .replace(/\byour measurement window\b/gi, "the measurement window")
    .replace(/\byour measurement setup\b/gi, "the measurement setup")
    .replace(/\bthe measurement window is still setup only\b/gi, "the measurement window has only started the clock")
    .replace(/\bthe measurement window is setup only\b/gi, "the measurement window has only started the clock")
    .replace(/\bthe measurement setup is still setup only\b/gi, "the measurement window has only started the clock")
    .replace(/\blive account syncing\b/gi, "scheduled account refresh")
    .replace(/\bfresh market scans\b/gi, "fresh market reads")
    .replace(/\bsaved market scans\b/gi, "saved market reads")
    .replace(/\bmarket scans\b/gi, "market reads")
    .replace(/\brecent market scan results\b/gi, "saved market read")
    .replace(/\bsaved market scan\b/gi, "saved market read")
    .replace(/\bsaved scan\b/gi, "saved read")
    .replace(/\bmarket news snippets\b/gi, "market notes")
    .replace(/\bnews snippets\b/gi, "news notes")
    .replace(/\bsnippets\b/gi, "notes")
    .replace(/\bauto-refreshes\b/gi, "scheduled refreshes")
    .replace(/\bauto-refreshing\b/gi, "scheduled refreshing")
    .replace(/\brecent scans\b/gi, "saved reads")
    .replace(/\bsaved scans\b/gi, "saved reads")
    .replace(/\bcanned samples\b/gi, "sample notes")
    .replace(/\bfull portfolio import automation\b/gi, "scheduled holdings refresh")
    .replace(/\bportfolio import automation\b/gi, "scheduled holdings refresh")
    .replace(/\bautomatic portfolio imports\b/gi, "scheduled holdings refresh")
    .replace(/\byour last scan\b/gi, "the last saved context")
    .replace(/\blocal memory\b/gi, "chat context")
    .replace(/\bthe schedule check does not change Today\b/gi, "the local check does not change Today")
    .replace(/\bschedule check does not change Today\b/gi, "local check does not change Today")
    .replace(/\bgeneric preview\b/gi, "sample read")
    .replace(/\bgeneric read\b/gi, "sample read")
    .replace(/\bgeneric market observations\b/gi, "sample market observations")
    .replace(/\bgeneric market check\b/gi, "sample market check")
    .replace(/\bpersonalized briefing\b/gi, "portfolio-specific read")
    .replace(/\bsample portfolio data\b/gi, "visible holdings")
    .replace(
      /\benable scheduled scans or manually trigger a new scan\b/gi,
      "save context for chat or import holdings again for current balances",
    )
    .replace(/\benable scheduled scans\b/gi, "use the chat context check when it is available")
    .replace(/\bmanually trigger a new scan\b/gi, "save context for chat")
    .replace(/\bmanually enter the sample holdings\b/gi, "add manual holdings")
    .replace(/\bmanual(?:ly)? enter sample holdings\b/gi, "add manual holdings")
    .replace(/\bgeneral market scan\b/gi, "sample read")
    .replace(/\bgeneral market read\b/gi, "sample read")
    .replace(/\bReal \(from saved market reads\)\s*:/gi, "Working here:")
    .replace(/\bReal \(from saved market read\)\s*:/gi, "Working here:")
    .replace(/\bReal:\s*/gi, "Working here: ")
    .replace(/\bactual unusual activity captured in (?:that|the) (?:scan|read)\b/gi, "unusual activity marked in the saved read")
    .replace(/\breflect actual unusual activity\b/gi, "reflect unusual activity marked in the saved read")
    .replace(/\bactual market activity captured in (?:that|the) (?:scan|read)\b/gi, "market activity marked in the saved read")
    .replace(/\bactual holdings\b/gi, "actual account holdings")
    .replace(/\bnot holdings snapshots\b/gi, "not a manual or imported holdings snapshot")
    .replace(/\bnot imported or manual holdings\b/gi, "not a manual or imported holdings snapshot")
    .replace(/\bnot manual or imported holdings\b/gi, "not a manual or imported holdings snapshot")
    .replace(/\bimport a real portfolio snapshot\b/gi, "import a holdings snapshot")
    .replace(/\bImporting the sample holdings\b/g, "Importing a holdings snapshot")
    .replace(/\bimporting the sample holdings\b/g, "importing a holdings snapshot")
    .replace(/\bsnapshot of holdings snapshots\b/gi, "holdings snapshot")
    .replace(/\bholdings snapshots snapshots\b/gi, "holdings snapshots")
    .replace(
      /\buntil you refresh it or import data\b/gi,
      "until you save context again or import holdings; saving context still does not fetch live market data",
    );

  return prioritizeRequestedAnswer(cleaned, options.responseMode).trim();
}

function cleanSamplePortfolioPossessives(value: string) {
  if (!/\b(?:sample|demo) portfolio\b/i.test(value)) return value;

  return value
    .replace(/\byour sample portfolio\b/gi, "the sample portfolio")
    .replace(/\byour visible sample portfolio\b/gi, "the sample portfolio")
    .replace(/\byour visible demo portfolio\b/gi, "the sample portfolio")
    .replace(/\byour demo portfolio\b/gi, "the sample portfolio")
    .replace(/\byour portfolio's\b/gi, "the sample portfolio's")
    .replace(/\byour portfolio\b/gi, "the sample portfolio")
    .replace(/\byour overall value\b/gi, "the sample portfolio's total value")
    .replace(/\byour total value\b/gi, "the sample portfolio's total value")
    .replace(/\byour total portfolio value\b/gi, "the sample portfolio's total value")
    .replace(/\byour costs or yields\b/gi, "costs or yields in a real account")
    .replace(/\byour returns\b/gi, "returns in a real account")
    .replace(/\byour expected returns\b/gi, "expected returns in a real account")
    .replace(/\byour costs\b/gi, "costs in a real account")
    .replace(/\byour cost to borrow or lend\b/gi, "the cost to borrow or lend")
    .replace(/\byour borrowing costs\b/gi, "borrowing costs in a real account")
    .replace(/\byour yields\b/gi, "yields in a real account")
    .replace(/\byields in a real account or costs\b/gi, "yields or costs in a real account")
    .replace(/\byour current portfolio focus\b/gi, "the visible portfolio focus")
    .replace(/\byour on-chain cash exposure\b/gi, "the visible on-chain cash exposure")
    .replace(/\byou(?:['’]ve| have) already adjusted your position\b/gi, "a real position has already been adjusted")
    .replace(/\byour position is this small\b/gi, "the sample position is this small")
    .replace(/\byour position\b/gi, "the visible position")
    .replace(/\byour strategy\b/gi, "a real strategy")
    .replace(/\byour overall risk\b/gi, "the sample portfolio's overall risk")
    .replace(/\byour risk\b/gi, "the sample portfolio's risk")
    .replace(/\byour overall position\b/gi, "the sample portfolio's overall position")
    .replace(/\byour current fake-money allocation\b/gi, "the current paper allocation")
    .replace(/\bfake-money allocation\b/gi, "paper allocation")
    .replace(/\bfake-money change\b/gi, "paper-trade change")
    .replace(/\bfake-money test\b/gi, "paper-trade test")
    .replace(/\byour risk profile\b/gi, "the sample portfolio's risk profile")
    .replace(/\byour risk tolerance\b/gi, "the visible risk level")
    .replace(/\byour comfort with volatility\b/gi, "the visible risk level")
    .replace(/\byou(?:['’]re| are) overexposed\b/gi, "the sample portfolio is overexposed")
    .replace(/\bthe sample portfolio's risk tolerance\b/gi, "the visible risk level")
    .replace(/\bthe sample portfolio's comfort with volatility\b/gi, "the visible risk level")
    .replace(/\bthe sample portfolio's risk comfort\b/gi, "the visible risk level")
    .replace(/\brisk tolerance\b/gi, "visible risk level")
    .replace(/\bcomfort with volatility\b/gi, "visible risk level")
    .replace(/\brisk comfort\b/gi, "visible risk level")
    .replace(/\byour sample holdings\b/gi, "the sample holdings")
    .replace(/\byour demo holdings\b/gi, "the sample holdings")
    .replace(/\byour visible portfolio\b/gi, "the sample portfolio")
    .replace(/\byour visible holdings\b/gi, "the sample holdings")
    .replace(/\byour holdings\b/gi, "the sample holdings")
    .replace(/\byour larger positions\b/gi, "the sample portfolio's larger positions")
    .replace(/\byour larger holdings\b/gi, "the sample portfolio's larger holdings")
    .replace(/\byour bigger positions\b/gi, "the sample portfolio's bigger positions")
    .replace(/\byour bigger holdings\b/gi, "the sample portfolio's bigger holdings")
    .replace(/\byou(?:['’]re| are) not using Aave\b/gi, "the visible context is not using Aave")
    .replace(/\byou(?:['’]re| are) not actively borrowing or lending\b/gi, "the visible context does not show active borrowing or lending")
    .replace(/\byou(?:['’]re| are) not actively lending\/borrowing\b/gi, "the visible context does not show active lending or borrowing")
    .replace(/\byou(?:['’]re| are) not actively managing on-chain cash lending positions\b/gi, "the visible context does not show active on-chain cash lending")
    .replace(/\byou(?:['’]re| are) actively borrowing or lending\b/gi, "the visible context includes active borrowing or lending")
    .replace(/\byou(?:['’]re| are) supplying\b/gi, "a real account is supplying")
    .replace(/\byou(?:['’]re| are) using aUSDC\b/gi, "the visible context uses aUSDC")
    .replace(/\byou(?:['’]re| are) actively managing\b/gi, "the visible context includes active management of")
    .replace(/\byour position size\b/gi, "the position size")
    .replace(/\byour balance\b/gi, "the simulator balance")
    .replace(/\bnot in holdings\b/gi, "not in the sample holdings")
    .replace(/(\d+(?:\.\d+)?)%\s+of the portfolio\b/gi, "$1% of the sample portfolio")
    .replace(/(\d+(?:\.\d+)?)%\s+of portfolio\b/gi, "$1% of the sample portfolio")
    .replace(
      /\byour ((?:largest|second-largest|third-largest|top|main) (?:holding|position|exposure))\b/gi,
      "the sample portfolio's $1",
    )
    .replace(
      /\byour ([A-Z]{1,6}) (?:holding|position|exposure)\b/g,
      "the sample portfolio's $1 position",
    );
}

function prioritizeRequestedAnswer(value: string, responseMode?: ChatTextCleanupMode) {
  if (responseMode === "daily-focus") {
    return trimBefore(value, /\b(?:Top (?:priority|focus)|First thing to check)\s*:/i);
  }

  if (responseMode === "daily-focus-with-portfolio") {
    return trimBefore(value, /\b(?:Portfolio state|Portfolio)\s*:/i);
  }

  if (responseMode === "portfolio-truth") {
    return trimBefore(value, /\b(?:Portfolio state|Portfolio)\s*:/i);
  }

  if (responseMode === "memory-refresh-truth") {
    return trimBefore(value, /\b(?:Chat context|Local memory|Memory refresh|Refresh local memory|Save context for chat)\s*:/i)
      .replace(/^Local memory:/i, "Chat context:")
      .replace(/^Memory refresh:/i, "Chat context:")
      .replace(/^Refresh local memory:/i, "Chat context:");
  }

  if (responseMode === "today-readiness-truth") {
    return trimBefore(value, /\b(?:Today readiness|Readiness|Setup)\s*:/i);
  }

  if (responseMode === "schedule-truth") {
    return trimBefore(value, /\b(?:Chat context|Memory status|Schedule status|Schedule)\s*:/i)
      .replace(/^Memory status:/i, "Chat context:")
      .replace(/^Schedule status:/i, "Chat context:")
      .replace(/^Schedule:/i, "Chat context:");
  }

  if (responseMode === "truth-boundary") {
    return trimBefore(value, /\b(?:Working here|What works|What is working)\s*:/i);
  }

  return value;
}

function trimBefore(value: string, pattern: RegExp) {
  const match = pattern.exec(value);
  if (!match || match.index <= 0) return value;
  return value.slice(match.index);
}
