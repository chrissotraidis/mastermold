/// <reference types="bun" />

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("mobile ergonomics source contracts", () => {
  test("GIVEN phone-first controls WHEN shared mobile surfaces render THEN primary tap targets stay large", () => {
    expect(source("components/today-metrics.tsx")).toContain("inline-flex size-11");
    expect(source("components/profile-settings.tsx")).toContain("min-h-11 rounded-md border");
    expect(source("app/briefing/[id]/page.tsx")).toContain("inline-flex min-h-11");
    expect(source("components/alert-feed.tsx")).toContain("inline-flex min-h-11 items-center justify-center gap-2 px-3 py-2");
    expect(source("components/alert-inbox-drawer.tsx")).toContain("inline-flex min-h-11 items-center justify-center gap-2 rounded-md border");
    expect(source("components/alert-feed.tsx")).toContain("inline-flex min-h-11 items-center justify-center rounded-md border");
    expect(source("components/alert-inbox-drawer.tsx")).toContain("inline-flex min-h-11 items-center justify-center rounded-md border");
    expect(source("components/manual-holdings-panel.tsx")).toContain("inline-flex min-h-11 items-center gap-2");
    expect(source("app/settings/integrations/page.tsx")).toContain("inline-flex min-h-11 items-center gap-1");
    expect(source("components/welcome-flow.tsx")).toContain("min-h-11 rounded-md border px-3 py-2");
    expect(source("components/journal-workspace.tsx")).toContain("min-h-11 rounded-md border px-3 py-2");
    expect(source("components/as-of-replay-control.tsx")).toContain("flex min-h-11 cursor-pointer");
    expect(source("components/command-console.tsx")).toContain("flex size-11 shrink-0");
    expect(source("components/command-console.tsx")).toContain("min-h-11 border border-outline-variant/40");
    expect(source("components/save-briefing-call-button.tsx")).toContain("min-h-11 w-full");
    expect(source("components/briefing-card.tsx")).toContain("group/title flex min-h-11");
    expect(source("components/master-mold-actions.tsx")).toContain("inline-flex min-h-11 items-center justify-center gap-2");
    expect(source("app/page.tsx")).toContain("inline-flex min-h-11 w-full items-center justify-center gap-2");
    expect(source("components/ui/button.tsx")).toContain('default: "min-h-11 px-4 py-2"');
    expect(source("components/ui/button.tsx")).toContain('icon: "h-11 w-11"');
    expect(source("components/ui/input.tsx")).toContain("flex h-11 w-full");
    expect(source("components/paper-workspace.tsx")).toContain("h-11 w-full rounded-md border");
    expect(source("components/paper-workspace.tsx")).toContain("relative flex min-h-11 cursor-pointer");
    expect(source("components/paper-workspace.tsx")).toContain("absolute inset-0 h-full w-full cursor-pointer opacity-0");
    expect(source("components/paper-workspace.tsx")).toContain("className=\"h-11 w-full accent-violet\"");
  });

  test("GIVEN alert actions render on phones WHEN source controls are checked THEN action buttons use the 44px floor", () => {
    const alertFeed = source("components/alert-feed.tsx");
    const alertDrawer = source("components/alert-inbox-drawer.tsx");
    const globalAssistant = source("components/global-assistant.tsx");

    expect(alertDrawer).toContain("Open alerts, ${activeAlerts.length} unread");
    expect(alertDrawer).toContain('className="alert-count-badge absolute -right-1 -top-1"');
    expect(alertDrawer).toContain("data-alert-count={String(activeAlerts.length)}");
    expect(source("app/globals.css")).toContain(".alert-count-badge::after");
    expect(alertFeed).toContain("inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-violet/35");
    expect(alertFeed).toContain("inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-engine/35");
    expect(alertFeed).toContain("inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-caution/35");
    expect(alertDrawer).toContain("inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-violet/35");
    expect(alertDrawer).toContain("inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-engine/35");
    expect(alertDrawer).toContain("inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-caution/35");
    expect(alertFeed).toContain("import type { PublicAlert, PublicJournal }");
    expect(alertDrawer).toContain("import type { PublicAlert, PublicJournal }");
    expect(alertFeed).toContain('type SavedJournalEntry = PublicJournal["entries"][number];');
    expect(alertDrawer).toContain('type SavedJournalEntry = PublicJournal["entries"][number];');
    expect(alertDrawer).toContain("ml-auto flex size-11 items-center justify-center rounded-md border");
    expect(globalAssistant).toContain("ml-auto flex size-11 items-center justify-center rounded-md border");
    expect(globalAssistant).toContain("className=\"flex size-11 items-center justify-center rounded-md border");
    expect(globalAssistant).toContain("What parts of this app are working with live chat or real saved data?");
    expect(alertFeed).toContain('const label = up ? "Useful" : "Not useful";');
    expect(alertDrawer).toContain("{label}");
    expect(`${alertFeed}\n${alertDrawer}`).not.toContain("JournalEntryJson");
    expect(`${alertFeed}\n${alertDrawer}`).not.toContain("Useful?");
    expect(`${alertFeed}\n${alertDrawer}\n${globalAssistant}`).not.toMatch(/inline-flex min-h-10|flex size-10 items-center justify-center rounded-md border|real inference/i);
  });

  test("GIVEN Brain borrow-rate facts feed UI and chat WHEN source copy is checked THEN raw open-interest wording stays hidden", () => {
    const brain = source("src/db/brain.ts");
    const chatRoute = source("app/api/chat/route.ts");
    const publicApiCopy = source("lib/public-api-copy.ts");
    const journalCopy = source("lib/journal-copy.ts");
    const executor = source("components/executor-workspace.tsx");

    expect(brain).toContain("had a sample borrow-payment change worth checking");
    expect(brain).toContain("not a live rate feed");
    expect(chatRoute).toContain("do not quote raw rates or open-interest figures");
    expect(publicApiCopy).toContain("publicBrainFactSummary");
    expect(publicApiCopy).toContain("borrow-market context, not a live rate feed");
    expect(journalCopy).toContain('replace(/\\bopen interest\\b/gi, "borrow-market activity")');
    expect(executor).toContain("Borrow-market activity");
    // lib/public-api-copy.ts may mention the raw phrase inside its cleanup regex;
    // the surfaces themselves must never emit it.
    expect(`${brain}\n${chatRoute}\n${executor}`).not.toContain("sample borrow-payment rate was");
    expect(`${brain}\n${chatRoute}\n${publicApiCopy}`).not.toContain("formatCompact(observation.open_interest)");
  });

  test("GIVEN alert and briefing disclosures render on phones WHEN source copy is checked THEN disclosure toggles are full-height controls", () => {
    const alertFeed = source("components/alert-feed.tsx");
    const alertDrawer = source("components/alert-inbox-drawer.tsx");
    const briefingDetail = source("app/briefing/[id]/page.tsx");

    expect(alertFeed).toContain("flex min-h-11 cursor-pointer items-center font-semibold text-on-surface");
    expect(alertFeed).toContain("flex min-h-11 cursor-pointer items-center text-sm font-semibold text-on-surface");
    expect(alertDrawer).toContain("flex min-h-11 cursor-pointer items-center font-semibold text-on-surface");
    expect(alertDrawer).toContain("flex min-h-11 cursor-pointer items-center text-sm font-semibold text-on-surface");
    expect(alertFeed).toContain('label="Reasonable response"');
    expect(alertFeed).toContain('label="Safe to ignore when"');
    expect(alertFeed).toContain("cleanAlertRationale(alert.rationale)");
    expect(alertDrawer).toContain('<DrawerExplanationPoint label="Why it matters" body={explainAlertRelevance(alert)} />');
    expect(alertDrawer).toContain('<DrawerExplanationPoint label="Reasonable response" body={buildAlertSuggestedResponse(alert)} />');
    expect(alertDrawer).toContain("Safe to ignore when:");
    expect(alertDrawer).toContain("cleanAlertRationale(alert.rationale)");
    expect(briefingDetail).toContain("flex min-h-11 cursor-pointer items-center text-sm font-medium text-violet");
    expect(briefingDetail).toContain("What supports this");
    expect(briefingDetail).toContain("Source note");
    expect(briefingDetail).toContain("Why it matters:");
    expect(briefingDetail).toContain("This ties the idea to the visible portfolio");
    expect(briefingDetail).toContain("Start here");
    expect(briefingDetail).toContain("Review score");
    expect(briefingDetail).toContain("before taking action elsewhere");
    expect(briefingDetail).toContain("Test as paper trade");
    expect(briefingDetail).toContain("Market time");
    expect(briefingDetail).toContain("Saved in app");
    expect(briefingDetail).toContain("Role");
    expect(briefingDetail).toContain("Main reason");
    expect(`${alertFeed}\n${alertDrawer}\n${briefingDetail}`).not.toMatch(
      /<summary className="cursor-pointer|Evidence and timing|Evidence used|Event time|Knowledge time|>Weight|>Importance|>Happened|Saved note|Decision strength|risking real money outside the app</i,
    );
  });

  test("GIVEN saved-read provenance appears in the UI WHEN chip titles render THEN raw provider and model names stay hidden", () => {
    const provenanceChip = source("components/provenance-chip.tsx");
    const briefingCard = source("components/briefing-card.tsx");
    const briefingDetail = source("app/briefing/[id]/page.tsx");
    const todayPage = source("app/page.tsx");
    const reviewReadiness = source("components/review-readiness.tsx");
    const appShell = source("components/app-shell.tsx");
    const routeSources = [
      source("app/alerts/page.tsx"),
      source("app/chat/page.tsx"),
      source("app/portfolio/page.tsx"),
      source("app/paper/page.tsx"),
      source("app/journal/page.tsx"),
      source("app/settings/integrations/page.tsx"),
      source("app/executor/page.tsx"),
      source("app/review/page.tsx"),
    ].join("\n");

    expect(provenanceChip).toContain('return "Saved market read";');
    expect(provenanceChip).toContain('return "Sample data for review and testing";');
    expect(appShell).toContain("type DataModeLabel = ProductProvenanceLabel;");
    expect(appShell).toContain('dataMode = "Sample data"');
    expect(briefingCard).toContain("<ProvenanceChip label={provenance.label} title={provenance.source} />");
    expect(briefingDetail).toContain("label={publicProvenanceLabel}");
    expect(briefingDetail).toContain("title={productProvenanceSource(card.provenance.label, card.provenance.source)}");
    expect(todayPage).toContain("label={publicPageDataMode}");
    expect(todayPage).toContain("title={productProvenanceSource(pageDataMode, portfolio.provenance.source)}");
    expect(reviewReadiness).toContain("<ProvenanceChip label={publicDataMode.label} title={publicDataMode.source} />");
    expect(routeSources).toContain("productProvenanceLabel");
    expect(routeSources).not.toMatch(/<AppShell dataMode=\{(?:dataMode\.label|portfolio\.provenance\.label|paper\.provenance\.label|journal\.provenance\.label|executor\.provenance\.label)\}|provenance=\{(?:dataMode\.label|portfolio\.provenance\.label|paper\.provenance\.label|journal\.provenance\.label|executor\.provenance\.label)\}/);
    expect(provenanceChip).not.toMatch(/OpenRouter direct run|deepseek|provider|model/i);
  });

  test("GIVEN manual holdings mix with sample data WHEN a holding describes its weight THEN it says visible portfolio", () => {
    const manualHoldings = source("components/manual-holdings-panel.tsx");

    expect(manualHoldings).toContain("% of visible portfolio");
    expect(manualHoldings).not.toContain("% of portfolio");
  });

  test("GIVEN Portfolio holdings render on mobile WHEN source copy is checked THEN each holding can expand into decision detail", () => {
    const portfolioPage = source("app/portfolio/page.tsx");
    const portfolioCopy = source("lib/portfolio-copy.ts");
    const portfolioCharts = source("components/portfolio-charts.tsx");

    expect(portfolioCopy).toContain("Net worth, holdings, allocation, and sources.");
    expect(portfolioCopy).toContain("Manual entries make Today and chat use what you enter.");
    // Charts lead the page; manual entry now lives in a collapsible editor below.
    expect(portfolioPage.indexOf("<PortfolioCharts")).toBeLessThan(
      portfolioPage.indexOf("<ManualHoldingsPanel"),
    );
    expect(portfolioPage).toContain("Add or edit manual holdings");
    expect(portfolioCharts).toContain("Trailing 7 days, priced from saved closes.");
    expect(portfolioPage).toContain("Open holding details");
    expect(portfolioPage).toContain("Related alert");
    expect(portfolioPage).toContain("return `${shortAlertTierLabel(alert.tier)}: ${cleanAlertMessage(alert.message)}`;");
    expect(portfolioPage).toContain("Position size");
    expect(portfolioPage).toContain("Recent move");
    expect(portfolioPage).toContain("Portfolio share");
    expect(portfolioPage).toContain("Sample holding, not imported money.");
    expect(portfolioPage).toContain("Imported snapshot");
    expect(portfolioPage).toContain("does not refresh by itself");
    expect(portfolioPage).toContain("status.toLowerCase()} + local/sample holdings");
    expect(portfolioPage).toContain("No current alert for this holding.");
    expect(`${portfolioPage}\n${portfolioCopy}\n${portfolioCharts}`).not.toMatch(
      /Tap a holding|thesis|your portfolio|>Weight|The visible money picture|Portfolio value, not individual asset price moves|alert: \\$\\{cleanAlertMessage|can shape Today/i,
    );
  });

  test("GIVEN Settings first-paint copy WHEN the profile state is not ready THEN it does not look stuck", () => {
    const profileSettings = source("components/profile-settings.tsx");

    expect(profileSettings).toContain("Profile settings live in this browser");
    expect(profileSettings).toContain("<summary className=\"flex min-h-11 cursor-pointer items-center text-sm font-semibold text-on-surface\">");
    expect(profileSettings).toContain("Backup &amp; restore");
    expect(profileSettings).toContain("Reset browser setup");
    expect(profileSettings).toContain("Click again to reset browser setup");
    expect(profileSettings).not.toMatch(/wipe everything/i);
    expect(profileSettings).not.toMatch(/Loading your profile/i);
  });

  test("GIVEN Chat opens with sample context WHEN the subtitle renders THEN it avoids ownership overclaims", () => {
    const chatPage = source("app/chat/page.tsx");
    const appShell = source("components/app-shell.tsx");
    const globalAssistant = source("components/global-assistant.tsx");

    expect(chatPage).toContain(
      "The visible daily read, alerts, holdings, and past calls are in context.",
    );
    expect(chatPage).toContain("parseAsOf(params?.as_of ?? null)");
    expect(chatPage).toContain("getChatContext(asOf)");
    expect(chatPage).toContain('apiPath="/api/chat"');
    expect(chatPage).toContain("buildChatRoute(initialQuery, asOf?.iso ?? null)");
    expect(chatPage).toContain("Answer only from the context known by then.");
    expect(appShell).toContain('const isChatPage = pathname.startsWith("/chat");');
    expect(appShell).toContain('{isChatPage ? (');
    expect(globalAssistant).toContain('const isChatPage = currentPath.startsWith("/chat");');
    expect(globalAssistant).toContain("{!isChatPage ? (");
    expect(globalAssistant).toContain('data-testid="global-assistant-open"');
    expect(globalAssistant).toContain("bottom-[4.75rem] right-3");
    expect(globalAssistant).toContain("size-12");
    expect(globalAssistant).toContain("md:bottom-6 md:right-6 md:size-16");
    // The top-left Master Mold icon navigates home (Today); chat is reachable
    // from the floating launcher and the /chat route, not the brand mark.
    expect(appShell).toContain('aria-label="Go to Today (home)"');
    expect(source("components/reviewer-evidence-panel.tsx")).toContain('"Today and alerts"');
    expect(chatPage).not.toMatch(/your alerts, holdings, and record/i);
  });

  test("GIVEN the daily shell renders outside Executor WHEN top-bar controls are checked THEN the drill is scoped to Executor", () => {
    const appShell = source("components/app-shell.tsx");

    expect(appShell).toContain('const showKillControl = pathname.startsWith("/executor") || killEngaged;');
    expect(appShell).toContain("{showKillControl ? (");
    expect(appShell).toContain('title="Kill-switch drill for the executor preview"');
    expect(appShell).toContain('aria-label="Kill-switch drill"');
  });

  test("GIVEN Executor explains future safeguards WHEN source copy is checked THEN it avoids implementation notes", () => {
    const executorPage = source("app/executor/page.tsx");
    const executorWorkspace = source("components/executor-workspace.tsx");
    const publicCopy = source("lib/public-api-copy.ts");

    expect(executorPage).toContain("Review the safety plan a real executor would need.");
    expect(executorPage).toContain("Before this could ever run, separate safety rules");
    expect(executorPage).toContain("beyond the amount you approve");
    expect(executorPage).toContain("Four checks before any live action");
    expect(executorPage).toContain("only edit a local safety draft");
    expect(executorPage).toContain("Show balance changes before any request");
    expect(executorPage).toContain("it only lets you review the local safety draft");
    expect(executorWorkspace).toContain("Review-only strategy examples");
    expect(executorWorkspace).toContain("Draft the limits a real executor would need");
    expect(executorWorkspace).toContain("Temporary access expiry");
    expect(executorWorkspace).toContain("Safety draft saved in this browser");
    expect(executorWorkspace).toContain("Pause in safety review");
    expect(publicCopy).toContain('return "Carry strategy preview";');
    expect(publicCopy).toContain('return "Sample carry venue";');
    expect(`${executorPage}\n${executorWorkspace}`).not.toMatch(/AI call|model answer|model request|outside the AI|future live version|future automated trading controls|local preview|future transaction|future executor|we still need to build|Temporary key expires|Borrow-payment carry preview|Perp sample venue|Borrow-rate preview|Price exposure|Borrow cushion|Example automation ideas|Session key expiry/i);
    expect(publicCopy).not.toMatch(/Borrow-payment carry preview/i);
  });

  test("GIVEN Journal shows past-call groups WHEN source copy is checked THEN score bands avoid edge-claim language", () => {
    const journalPage = source("app/journal/page.tsx");
    const journal = source("components/journal-workspace.tsx");
    const journalData = source("src/db/journal.ts");
    const outcomeRoute = source("app/api/journal/[id]/outcome/route.ts");
    const alertLoop = source("lib/alert-loop.ts");
    const journalCopy = source("lib/journal-copy.ts");
    const briefingDraft = source("lib/briefing-journal-copy.ts");
    const saveCallButton = source("components/save-briefing-call-button.tsx");
    const journalRoute = source("app/api/journal/route.ts");

    expect(journalPage).toContain("toPublicJournal(journal)");
    expect(journalPage).toContain("call?: string;");
    expect(journalRoute).toContain("call?: unknown;");
    expect(journalRoute).toContain("normalizeText(body.call) || normalizeText(body.thesis)");
    expect(journal).toContain("call: string;");
    expect(journal).toContain('id="journal-call"');
    expect(journal).toContain("call: form.call");
    expect(journal).toContain('const statusText = isPending ? "Logging decision." : message;');
    expect(journal).toContain('<p aria-live="polite" className="text-sm leading-6 text-outline">');
    // The outcome form pairs an sr-only live region with a visible message; the
    // status must never be screen-reader-only without a visible counterpart.
    expect(journal).toContain('{message ? <p className="text-sm text-outline">{message}</p> : null}');
    expect(journal).toContain("call_was_right: form.call_was_right");
    expect(journal).toContain("review_quality: Number(form.review_quality)");
    expect(journal).toContain("result_score: Number(form.result_score)");
    expect(journal).toContain("result_note: form.result_note");
    expect(journalPage.indexOf("<JournalWorkspace")).toBeLessThan(
      journalPage.indexOf("<ScoreAccuracyBars"),
    );
    expect(journal.indexOf("<aside")).toBeLessThan(journal.indexOf("<TrackRecordSection"));
    expect(outcomeRoute).toContain("call_was_right?: unknown;");
    expect(outcomeRoute).toContain("review_quality?: unknown;");
    expect(outcomeRoute).toContain("result_score?: unknown;");
    expect(outcomeRoute).toContain("result_note?: unknown;");
    expect(alertLoop).toContain("call: journalInput.call");
    expect(alertLoop).toContain("confidence: String(journalInput.confidence)");
    expect(briefingDraft).toContain("call: card.decision_journal_entry");
    expect(saveCallButton).toContain("call: headline");
    expect(saveCallButton).toContain("confidence: Math.max");
    expect(`${alertLoop}\n${briefingDraft}\n${saveCallButton}`).not.toMatch(/conviction: String|thesis: card\.decision_journal_entry|thesis: headline|conviction: Math\.max/i);
    expect(journal).toContain("type JournalWorkspaceData = PublicJournal");
    expect(journal).toContain("entry.confidence_band.label");
    expect(journalPage).toContain("ScoreAccuracyBars");
    expect(journalPage).toContain("provenance={publicJournal.provenance}");
    expect(journalPage).toContain('aria-labelledby="score-accuracy-title"');
    expect(journalPage).toContain("Score check");
    expect(journalPage).toContain("<ProvenanceChip label={provenance.label} title={provenance.source} />");
    expect(journalPage).toContain("Seeded and locally saved calls. Use this to compare score bands with closed results; it is not evidence that future calls will work.");
    expect(journalPage).toContain("Compares higher-scored saved calls with later results. Useful for review, not proof that future calls will work.");
    expect(journalPage).not.toMatch(/CalibrationCurve|calibration-title/i);
    expect(journalPage).not.toMatch(/Score accuracy|Confidence accuracy|higher-confidence|actually been right more often/i);
    expect(journal).toContain("Past calls by review score");
    expect(journal).toContain("<TrackRecordSection tiers={trackRecord} provenance={initialJournal.provenance} />");
    expect(journal).toContain("<ProvenanceChip label={provenance.label} title={provenance.source} />");
    expect(journal).toContain("Seeded and locally saved calls. Use this to check the scoring workflow; it is not evidence that future calls will work.");
    expect(journal).toContain("Compares higher-scored saved calls with later results. Useful for review, not proof that future calls will work.");
    expect(journal).toContain("formatTierResultCount(tier)");
    expect(journal).toContain('`${tier.wins}/${tier.resolved_count} marked right`');
    expect(journal).toContain('label="Avg result score"');
    expect(journal).toContain('`${value.toFixed(1)}/10`');
    expect(journal).not.toMatch(/Past calls by score|actually right more often|% right|Avg result"/i);
    expect(source("components/review-readiness.tsx")).toContain('"Score check"');
    expect(source("components/review-readiness.tsx")).not.toContain('"Score accuracy"');
    expect(journal).toContain('emptyTier("4-6", "4-6 cautious")');
    expect(journal).toContain('emptyTier("7-10", "7-10 stronger calls")');
    expect(journalData).toContain('label: "4-6 cautious"');
    expect(journalData).toContain('label: "7-10 stronger calls"');
    expect(journalData).not.toContain("4-6 watchlist");
    expect(journalData).not.toContain("7-10 strongly scored");
    expect(journal).toContain('import { plainJournalSignal, plainJournalText } from "@/lib/journal-copy";');
    expect(source("lib/public-api-copy.ts")).toContain('import { plainJournalSignal, plainJournalText } from "@/lib/journal-copy";');
    expect(journalCopy).toContain('replace(/\\bEngine output\\b/gi, "Saved market read")');
    expect(journalCopy).toContain('replace(/\\bDemo data\\b/gi, "Sample data")');
    expect(journalCopy).toContain('replace(/\\bFresh today\\b/gi, "Saved today")');
    expect(source("lib/plain-finance-copy.ts")).toContain("$1 moved up; check the bear case before adding risk");
    expect(journalCopy).toContain("Example saved call");
    expect(journalCopy).toContain("should not be used as investment evidence");
    expect(source("lib/public-api-copy.ts")).toContain("call: plainJournalText(thesis)");
    expect(`${journal}\n${journalPage}`).not.toMatch(/Temporary public outcome API check|Legacy call body still works|Saved local verification call|Result saved during local verification/i);
    expect(journal).toContain("Used for this call");
    expect(journal).toContain("Choose whether the call was right.");
    expect(journal).toContain("Add a result note.");
    expect(outcomeRoute).toContain("Choose whether the call was right.");
    expect(outcomeRoute).toContain("Result note is required.");
    expect(journal).toContain("journalSignalGroups(entry.reasons)");
    expect(journal).toContain("isJournalSourceSignal(signal)");
    expect(journal).toContain('/^(market read|portfolio|memory|source):/i');
    expect(journal).not.toMatch(/high confidence|medium confidence|high-conviction|high conviction|call played out|Outcome note is required|journal-conviction|journal-thesis|form\.thesis|errors\.thesis|thesis: form\.thesis|thesis_played_out: form|process_score: Number|outcome_score: Number|pnl_note: form|entry\.conviction|entry\.signals|entry\.outcome_score/i);
  });

  test("GIVEN Performance shows local activity WHEN source copy is checked THEN it uses product-facing metric names", () => {
    const reviewReadiness = source("components/review-readiness.tsx");

    expect(reviewReadiness).toContain("toPublicProductMetricSummary(getProductMetricSummary())");
    expect(reviewReadiness).toContain("summary.today_read.under_target");
    expect(reviewReadiness).toContain("summary.briefing_ratings.useful_share");
    expect(reviewReadiness).toContain("const briefingRatingCount = summary.briefing_ratings.useful + summary.briefing_ratings.not_useful;");
    expect(reviewReadiness).toContain("Today ratings");
    expect(reviewReadiness).toContain("These show usage, not proof");
    expect(reviewReadiness).toContain("summary.alert_ratings.not_useful_share");
    expect(reviewReadiness).toContain("summary.score_accuracy.average_miss");
    expect(reviewReadiness).toContain('key={`${alertSignalLabel(s.signal)}-${s.suggestion}`}');
    expect(reviewReadiness).not.toContain("key={s.signal}");
    expect(source("lib/public-api-copy.ts")).toContain('briefing_feedback: "Today rated"');
    // lib/public-api-copy.ts reads the raw internal names in order to translate
    // them; the UI component itself must only use product-facing names.
    expect(reviewReadiness).not.toMatch(/today_read_target|median_today_read_seconds|briefing_feedback\.usefulness_rate|alert_feedback\.fatigue_rate|calibration_outcomes|mean_abs_error|within_confidence_band|Briefing ratings|Briefing rated|opens · no ratings|opens`,/i);
  });

  test("GIVEN legacy routes are still reachable WHEN their source is checked THEN they render product surfaces without implementation copy", () => {
    const dashboardPage = source("app/dashboard/page.tsx");
    const settingsPage = source("app/settings/page.tsx");

    expect(dashboardPage).toContain('import TodayPage from "../page";');
    expect(dashboardPage).toContain('export const dynamic = "force-dynamic";');
    expect(dashboardPage).toContain("return <TodayPage {...props} />;");
    expect(dashboardPage).not.toMatch(/export \{ dynamic \}|redirect|Loading this view/i);
    expect(settingsPage).toContain("<IntegrationsSettingsPage />");
    expect(settingsPage).not.toMatch(/Settings route loaded|reviewer and operator flows/i);
  });

  test("GIVEN a route fails WHEN the fallback renders THEN it uses plain app copy", () => {
    const routeFeedback = source("components/route-feedback.tsx");

    expect(routeFeedback).toContain("Loading Master Mold.");
    expect(routeFeedback).toContain("This page did not load");
    expect(routeFeedback).toContain("Retry this page, or switch sections from the main navigation");
    // "Skeleton" appears in component identifiers (RouteLoadingSkeleton); the
    // user-visible loading/error copy is pinned by the positive checks above.
    expect(routeFeedback).not.toMatch(/Loading this view|surface did not load|route failure|server data fetch|persistent nav/i);
  });

  test("GIVEN Performance shows saved-read details WHEN source copy is checked THEN it avoids review-console wording", () => {
    const reviewReadiness = source("components/review-readiness.tsx");
    const reviewCopy = source("lib/review-status-copy.ts");

    expect(reviewReadiness).toContain("Saved market summary");
    expect(reviewReadiness).toContain("formatScanCost(run.cost.usd, run.cost.llm_calls)");
    expect(reviewReadiness).toContain("$0 · local rules only");
    expect(reviewReadiness).toContain("outside review");
    expect(reviewReadiness).toContain("Review passes");
    expect(reviewReadiness).toContain("Short questions can use a saved chat key");
    expect(reviewReadiness).toContain("Extra review");
    expect(reviewReadiness).toContain("flex min-h-11 cursor-pointer items-center text-sm font-semibold");
    expect(reviewReadiness).toContain("flex min-h-11 cursor-pointer items-center text-lg font-semibold");
    expect(reviewCopy).toContain("optional market check");
    expect(`${reviewReadiness}\n${reviewCopy}`).not.toMatch(
      /AI-assisted|Fast \+ Deep|Deeper research|Tried, then used|simpler|saved-summary|no AI calls/i,
    );
  });

  test("GIVEN live chat uses a saved key WHEN source copy is checked THEN size-limit stops are visible and plain", () => {
    const route = source("app/api/chat/route.ts");
    const chat = source("components/chat-workspace.tsx");
    const reviewReadiness = source("components/review-readiness.tsx");

    expect(route).toContain("MASTERMOLD_CHAT_MAX_TOTAL_TOKENS");
    expect(route).toContain("MASTERMOLD_CHAT_MAX_RESPONSE_TOKENS");
    expect(route).toContain("contextWithInferenceBudget");
    expect(route).toContain("live chat has a size limit");
    expect(route).toContain("Short questions can use a saved chat key");
    expect(route).toContain("The Today Save context for chat action only saves or refreshes local app context");
    expect(route).toContain("Do not say live chat requests never happen");
    expect(source("lib/chat-copy.ts")).toContain("Begin with `Today readiness:`");
    expect(source("lib/chat-copy.ts")).toContain("Do not call sample data a general market scan.");
    expect(route).toContain("This question is too large to send to live chat");
    expect(route).toContain("max_tokens: budget?.maxResponseTokens");
    expect(chat).toContain("Ask a shorter question or narrow the page context.");
    expect(chat).toContain('return "Live chat"');
    expect(chat).toContain('return "Kept short"');
    expect(chat).toContain("The saved chat key was rejected. No account action happened.");
    expect(chat).toContain("The selected chat model is unavailable. The app kept the decision flow read-only.");
    // friendlyChatError translates raw provider/model wording; the raw phrases
    // may only appear inside its replace() patterns.
    expect(chat).toContain('.replace(/\\bmodel provider\\b/gi, "chat service")');
    expect(chat).toContain('.replace(/\\bconfigured model\\b/gi, "selected chat model")');
    expect(chat).not.toMatch(/return "OpenRouter"|return "OpenAI"|return "Anthropic"|Provider down|Provider error|switch model provider/i);
    expect(reviewReadiness).toContain("oversized questions stop before any live chat request");
  });

  test("GIVEN Performance describes forward measurement WHEN source copy is checked THEN it separates local logs from real evidence", () => {
    const reviewReadiness = source("components/review-readiness.tsx");
    const forwardProof = source("src/db/forward-proof.ts");

    expect(reviewReadiness).toContain("Forward measurement");
    expect(reviewReadiness).toContain("What counts");
    expect(reviewReadiness).toContain("<ForwardTrialStarter status={proof.measurement.status} />");
    expect(reviewReadiness).toContain('ProgressStat label="Calls since start"');
    expect(reviewReadiness).toContain('ProgressStat label="Later results"');
    expect(reviewReadiness).toContain('ProgressStat label="Market reads"');
    expect(reviewReadiness).toContain('ProgressStat label="Next step"');
    expect(forwardProof).toContain("buildForwardProgress");
    expect(forwardProof).toContain("filterEntriesForMeasurementWindow");
    expect(forwardProof).toContain("Only calls saved after the start point count");
    expect(forwardProof).toContain("Older local calls stay in the trust log but do not count here");
    expect(forwardProof).toContain("saved after the start point");
    expect(forwardProof).toContain("later results");
    expect(source("components/forward-trial-starter.tsx")).toContain("Start measuring from today");
    expect(source("components/forward-trial-starter.tsx")).toContain("measures future saved calls only");
    expect(source("components/forward-trial-starter.tsx")).toContain("does not score old sample calls");
    expect(forwardProof).toContain("Save calls before results");
    expect(forwardProof).toContain("Score later results");
    expect(forwardProof).toContain("Compare with baselines and costs");
    expect(forwardProof).toContain("Run a dated measurement window");
    expect(forwardProof).toContain('id: "measurement_window"');
    expect(forwardProof).toContain('event: "forward_measurement_started"');
    expect(source("src/db/chat.ts")).toContain("forward_measurement: forwardProof");
    expect(forwardProof).toContain("Hold the visible portfolio evenly");
    expect(forwardProof).toContain("cleanBaseline(metadata.baseline)");
    expect(forwardProof).toContain("This starts the measurement window.");
    expect(forwardProof).toContain("needs enough later results for a baseline comparison");
    expect(forwardProof).toContain("before a baseline comparison means anything");
    expect(forwardProof).toContain("saved before any recorded result");
    expect(forwardProof).toContain("Seeded/sample calls do not count as forward evidence");
    expect(forwardProof).toContain("before the app can say the calls beat the baseline");
    expect(reviewReadiness).toContain("Current status: {proof.verdict}");
    expect(reviewReadiness).toContain("This check needs saved calls, later outcomes");
    expect(reviewReadiness).toContain("that future calls will work");
    expect(forwardProof).toContain("No dated measurement window is running.");
    // forward-proof.ts scrubs edge-claim language via cleanPassFailGate; those
    // phrases may only appear inside its detection regex.
    expect(forwardProof).toContain("function cleanPassFailGate");
    const forwardProofWithoutGateScrubber = forwardProof.replace(/edge claim\|proof of edge\|decision edge\|claim it is outperforming\|is outperforming/g, "");
    expect(`${reviewReadiness}\n${forwardProofWithoutGateScrubber}\n${source("components/forward-trial-starter.tsx")}`).not.toMatch(/proof that Master Mold can beat|proven Master Mold|show Master Mold can do better|proof of edge|decision edge|edge claim|claim it is outperforming|Measurement contract|Measurement-window calls|id: "forward_trial"|trial:|DSR|PBO|MinTRL|Alpaca paper shadow|Equal-weight|always-on market memory/i);
  });

  test("GIVEN Performance opens on mobile WHEN source copy is checked THEN it states the trust boundary first", () => {
    const reviewPage = source("app/review/page.tsx");
    const reviewReadiness = source("components/review-readiness.tsx");

    expect(reviewPage).toContain("<ReviewReadiness surface=\"public\" />");
    expect(reviewPage).not.toContain("<FirstRunBanner");
    expect(reviewReadiness).toContain("Trust summary");
    expect(reviewReadiness).toContain("Performance");
    expect(reviewReadiness).toContain("what still needs");
    expect(reviewReadiness).toContain("evidence before you rely on it.");
    expect(reviewReadiness).toContain('import { buildTodayReadiness } from "@/lib/today-readiness-copy";');
    expect(reviewReadiness).toContain("const readiness = buildTodayReadiness({ portfolio, dataMode, brain });");
    expect(reviewReadiness).toContain('label: "Best next step"');
    expect(reviewReadiness).toContain("value: nextStep.action");
    expect(reviewReadiness).toContain("Ask what is real");
    expect(reviewReadiness).toContain("const pastCallSourceLabel = productProvenanceLabel(journal.provenance.label);");
    expect(reviewReadiness).toContain("<ProvenanceChip label={pastCallSourceLabel} title={journal.provenance.source} />");
    expect(reviewReadiness).toContain("Seeded and locally saved calls.");
    expect(reviewReadiness).toContain("Use this to check the review workflow; it is not evidence that future calls will work.");
    expect(reviewReadiness).toContain("Learning check");
    expect(reviewReadiness).toContain("const lessonSource =");
    expect(reviewReadiness).toContain("Seeded history");
    expect(reviewReadiness).toContain("Saved outcomes");
    expect(reviewReadiness).toContain("no evidence gate has updated a live rule yet.");
    expect(reviewReadiness).toContain("Current boundary");
    expect(reviewReadiness).toContain("Use Master Mold to decide what to check.");
    expect(reviewReadiness).toContain("It can explain saved or sample reads");
    expect(reviewReadiness).toContain("Use it for today's decision");
    expect(reviewReadiness).toContain("Do not treat it as live account advice yet");
    expect(reviewReadiness).toContain("Autonomous trading status");
    expect(reviewReadiness).toContain("What is actually left");
    expect(reviewReadiness).toContain("Live capital locked");
    expect(reviewReadiness).toContain("Production trader");
    expect(reviewReadiness).toContain("Chat context saves what the app can remember");
    expect(reviewReadiness).toContain("Imported holdings are one-time snapshots.");
    expect(reviewReadiness).toContain('label: "Money shown"');
    expect(reviewReadiness).toContain("Manual, imported, or sample");
    expect(reviewReadiness).toContain("it cannot place orders,");
    expect(reviewReadiness).toContain("sign transactions, or use money");
    expect(reviewReadiness).toContain("from any account in this build.");
    expect(reviewReadiness).toContain("supporting notes, and alerts come from the saved read");
    expect(reviewReadiness).toContain("Saved market reads can inform Today, Alerts, Paper, and chat.");
    expect(reviewReadiness).toContain("They cannot touch accounts or move money.");
    expect(reviewReadiness).toContain("not a background market reader");
    expect(reviewReadiness).toContain("[\"Last read\", run.run_date]");
    expect(reviewReadiness).toContain("[\"Read date\", run.run_date]");
    expect(reviewReadiness).toContain("Read details");
    expect(reviewReadiness).toContain("Not needed for this read");
    expect(reviewReadiness).toContain("duplicate read");
    expect(reviewReadiness).toContain("chat context snapshots");
    expect(reviewReadiness).toContain("Live chat can be tested and used when a key is saved.");
    expect(reviewReadiness).toContain("inline-flex min-h-11");
    expect(reviewReadiness).toContain("className=\"min-h-11 border-outline-variant/50");
    expect(reviewReadiness).toContain("nothing can trade");
    expect(reviewReadiness).toContain("Cannot move money");
    expect(reviewReadiness).toContain("scheduled market/news reading, broader connected-portfolio coverage, source notes for every daily call, and forward scoring");
    expect(reviewReadiness).toContain("Try the app safely");
    expect(reviewReadiness).toContain("Local walkthrough account:");
    expect(reviewReadiness).toContain("Local walkthrough checklist");
    expect(reviewReadiness).not.toMatch(/Performance & trust|still sample before you trust|Safe to inspect|trust score|black box|Manual or sample only|real portfolio money|scanner reads|drivers, and alerts|OpenRouter, Anthropic, or OpenAI|always-on Brain described in the PRD|brain runs|Ask about this scan|Review the current Master Mold scan|What it learned|Confidence \\$\\{Math\\.round|seeded local account|Last scan|Scan date|Scan type|Scan details|Not needed for this scan|duplicate scan/i);
  });

  test("GIVEN Paper trading opens on mobile WHEN source copy is checked THEN it names the simulator workflow plainly", () => {
    const paperPage = source("app/paper/page.tsx");
    const paperWorkspace = source("components/paper-workspace.tsx");
    const web3Workspace = source("components/web3-trading-workspace-loader.tsx");

    expect(paperPage).toContain("Try a market call with simulator dollars");
    expect(paperPage).toContain("compare the result after the close date");
    expect(paperPage).toContain("Ideas to test");
    expect(paperPage).toContain("Saved market ideas you can try with simulator dollars");
    expect(paperPage.indexOf("<PaperWorkspace")).toBeGreaterThan(-1);
    expect(paperPage.indexOf("<MasterMoldPaperIdeas")).toBeGreaterThan(-1);
    expect(paperPage.indexOf("<PaperWorkspace")).toBeLessThan(paperPage.indexOf("<MasterMoldPaperIdeas"));
    expect(paperWorkspace).toContain("Open tests");
    expect(paperWorkspace).toContain("Use simulator dollars to test a call");
    expect(paperWorkspace).toContain("Tests from");
    expect(paperWorkspace).toContain("Test a paper trade");
    expect(paperWorkspace.indexOf("<PaperAccountPanel")).toBeGreaterThan(-1);
    expect(paperWorkspace.indexOf("<PaperTradeForm")).toBeGreaterThan(-1);
    expect(paperWorkspace.indexOf("<ActiveRoundPanel")).toBeGreaterThan(-1);
    expect(paperWorkspace.indexOf("<PaperAccountPanel")).toBeLessThan(paperWorkspace.indexOf("<ActiveRoundPanel"));
    expect(paperWorkspace.indexOf("<ActiveRoundPanel")).toBeLessThan(paperWorkspace.indexOf("<PaperTradeForm"));
    expect(paperWorkspace).toContain("mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4");
    expect(paperWorkspace).toContain("text-base font-semibold text-on-surface sm:text-lg");
    expect(paperWorkspace).toContain("Paper trades use this simulator balance only. No connected account is touched.");
    expect(web3Workspace).toContain("Paper execution priority");
    expect(web3Workspace).toContain("Account setup receipt");
    expect(web3Workspace).toContain("Build account receipt");
    expect(web3Workspace).toContain("Ownership");
    expect(web3Workspace).toContain("wallet_ownership_proved");
    expect(web3Workspace).toContain("hash-only wallet ownership proof");
    expect(web3Workspace).toContain("external signup permission blocked");
    expect(web3Workspace).toContain("Provider health receipt");
    expect(web3Workspace).toContain("Test provider health");
    expect(web3Workspace).toContain("Jupiter rehearsal receipt");
    expect(web3Workspace).toContain("Rehearse Jupiter order");
    expect(web3Workspace).toContain("one-shot key not saved");
    expect(web3Workspace).toContain("unsigned transaction return withheld");
    expect(web3Workspace).toContain("inline-flex min-h-11 items-center justify-center gap-1.5");
    expect(web3Workspace).toContain("secret echo blocked");
    expect(web3Workspace).toContain("Web3 operator input packet");
    expect(web3Workspace).toContain("Operator input packet");
    expect(web3Workspace).toContain("Safe credentials and approvals still needed before supervised trading review");
    expect(web3Workspace).toContain("operatorInputs.map");
    expect(web3Workspace).toContain("openOperatorInputs");
    expect(web3Workspace).toContain("Dedicated trading wallet");
    expect(web3Workspace).toContain("Jupiter route/order key");
    expect(web3Workspace).toContain("Private keys and seed phrases stay out of the app");
    expect(web3Workspace).toContain("operatorInputDotClass");
    expect(web3Workspace).toContain("operatorInputTextClass");
    expect(web3Workspace).toContain("Web3 launch repair queue");
    expect(web3Workspace).toContain("Launch repair queue");
    expect(web3Workspace).toContain("Safe next actions for fill quality, paper proof, supervisor freshness, route rehearsal, and verification");
    expect(web3Workspace).toContain("repairActions.map");
    expect(web3Workspace).toContain("openRepairActions");
    expect(web3Workspace).toContain("repairActionDotClass");
    expect(web3Workspace).toContain("repairActionTextClass");
    expect(web3Workspace).toContain("Repair actions refresh paper evidence only");
    expect(web3Workspace).toContain("Signer handoff receipt");
    expect(web3Workspace).toContain("Build signer receipt");
    expect(web3Workspace).toContain("private key storage blocked");
    expect(web3Workspace).toContain("Production worker review");
    expect(web3Workspace).toContain("Production supervisor readiness receipt");
    expect(web3Workspace).toContain("process gate blocked");
    expect(web3Workspace).toContain("npm run supervise:web3");
    expect(web3Workspace).toContain("Redeploy protect");
    expect(web3Workspace).toContain("Fresh entry");
    expect(web3Workspace).toContain("Paper execution priority receipt");
    expect(web3Workspace).toContain("Protect-first redeploy sell applied before released cash can chase again.");
    expect(web3Workspace).toContain('live execution {state.execution_gate.live_execution_enabled ? "armed" : "locked"}');
    expect(web3Workspace).toContain("Minute profit discipline");
    expect(web3Workspace).toContain("Minute profit discipline receipt");
    expect(web3Workspace).toContain("high-frequency allowed {discipline.high_frequency_allowed ? \"yes\" : \"no\"}");
    expect(web3Workspace).toContain("realized minute edge {formatSignedCurrency(discipline.realized_minute_edge_usd)}");
    expect(web3Workspace).toContain("Minute discipline");
    expect(web3Workspace).toContain("Position exit contract");
    expect(web3Workspace).toContain("Position exit contract receipt");
    expect(web3Workspace).toContain("hard-stop, take-profit, trailing-stop, and time-stop supervision");
    expect(web3Workspace).toContain("hard stop ${formatTokenPrice(visibleItems[0].hard_stop_price_usd)} trailing stop");
    expect(web3Workspace).toContain("exits {exitContract.fresh_entry_permission.replaceAll(\"-\", \" \")}");
    expect(web3Workspace).toContain("Price-action chart tape");
    expect(web3Workspace).toContain("Autonomous price-action chart tape receipt");
    expect(web3Workspace).toContain("First-screen autonomous price-action chart tape receipt");
    expect(web3Workspace).toContain("chart-tape execution contract");
    expect(web3Workspace).toContain("contract {contract.status.replaceAll(\"-\", \" \")}");
    expect(web3Workspace).toContain("boundary {contract.execution_boundary}");
    expect(web3Workspace).toContain("seven point price-action chart");
    expect(web3Workspace).toContain("volume bars · buy-flow shade");
    expect(web3Workspace).toContain("chart {chartTape.status.replaceAll(\"-\", \" \")}");
    expect(web3Workspace).toContain("First-screen autonomous profit benchmark");
    expect(web3Workspace).toContain("First-screen autonomous profit benchmark receipt");
    expect(web3Workspace).toContain("Agent alpha {formatCompactSignedCurrency(benchmark.cash_alpha_usd)} vs cash");
    expect(web3Workspace).toContain("equity solid · cash dash · hot tape dots");
    expect(web3Workspace).toContain("Autonomous operator next eight moves");
    expect(web3Workspace).toContain("re-entry {state.autonomous_reentry_hunter.status.replaceAll(\"-\", \" \")}");
    expect(web3Workspace).toContain("profit benchmark, re-entry hunter, command execution");
    expect(web3Workspace).toContain("re-entry leader {state.autonomous_reentry_hunter.leader_symbol ?? \"none\"}");
    expect(web3Workspace).toContain("re-entry cap {formatCurrency(state.autonomous_reentry_hunter.max_reentry_usd)}");
    expect(web3Workspace).toContain("Benchmark cadence:");
    expect(web3Workspace).toContain("feedback can tighten, retarget, or press Auto watch");
    expect(web3Workspace).toContain("Provider intake:");
    expect(web3Workspace).toContain("refresh or defer before fresh paper size");
    expect(web3Workspace).toContain("Execution runway:");
    expect(web3Workspace).toContain("proof/protect gate before paper");
    expect(web3Workspace).toContain("execution runway, heartbeat, loop impact, provider intake, and profit benchmark evidence");
    expect(web3Workspace).toContain("heartbeat {state.autonomous_execution_heartbeat.status}");
    expect(web3Workspace).toContain("paper lane {executionRunway.can_auto_paper ? \"clear\" : \"gated\"}");
    expect(web3Workspace).toContain("profit benchmark {state.autonomous_profit_benchmark.status}");
    expect(web3Workspace).toContain("provider budget {marketIntake.provider_budget_status}");
    expect(web3Workspace).toContain("risk-adjusted alpha {formatSignedCurrency(state.autonomous_profit_benchmark.risk_adjusted_alpha_usd)}");
    expect(web3Workspace).toContain("profit alpha {formatSignedCurrency(state.autonomous_profit_benchmark.cash_alpha_usd)}");
    expect(source("lib/paper-copy.ts")).toContain("Simulator example saved for later review.");
    expect(source("lib/paper-copy.ts")).toContain("Simulator example saved from the Paper form.");
    expect(source("lib/paper-copy.ts")).toContain("Simulator example saved to review the mobile Paper flow.");
    expect(source("lib/public-api-copy.ts")).toContain("plainPaperCopy(plainBriefingText(prediction.rationale))");
    expect(`${paperPage}\n${paperWorkspace}`).not.toMatch(/Suggested paper ideas|Ideas from the saved scan|Saved-scan calls|fake trade|fake wallet|fake money|Practice/i);
  });

  test("GIVEN Today explains its inputs WHEN source copy is checked THEN sources are visible without overclaiming live data", () => {
    const today = source("app/page.tsx");
    const refresh = source("components/today-memory-refresh.tsx");
    const readiness = source("lib/today-readiness-copy.ts");
    const metrics = source("components/today-metrics.tsx");

    expect(today).toContain("Today's inputs");
    expect(metrics).toContain("Rate today");
    expect(metrics).toContain('aria-label={`Mark today ${label.toLowerCase()}`}');
    expect(metrics).not.toContain("Mark briefing");
    expect(today).toContain('<span aria-hidden="true" className="text-outline/70"> · </span>');
    expect(today).toContain("Market read");
    expect(today).toContain("Portfolio");
    expect(today).toContain("Memory");
    expect(today.indexOf('id="briefing"')).toBeGreaterThan(-1);
    expect(today.indexOf("<TodaySourceTrail")).toBeGreaterThan(-1);
    expect(today.indexOf('id="briefing"')).toBeLessThan(today.indexOf("<TodaySourceTrail"));
    expect(today).toContain('aria-label="Portfolio context for today"');
    expect(today.indexOf('id="briefing"')).toBeLessThan(today.indexOf('aria-label="Portfolio context for today"'));
    expect(today.indexOf('aria-label="Portfolio context for today"')).toBeLessThan(today.indexOf("<TodaySourceTrail"));
    expect(today).toContain("No saved market read is loaded.");
    expect(today).toContain("Sample data only until you add manual holdings or import a holdings snapshot.");
    expect(today).toContain("imported holdings snapshots do not refresh by themselves");
    expect(today).toContain("Nothing remembered yet — runs with the first scan.");
    expect(today).toContain("<TodayMemoryRefresh />");
    expect(today).toContain("function todayMemoryDetail");
    expect(today).toContain("value: brain.summary.snapshot_freshness");
    expect(today).toContain("Local manual entries plus sample data.");
    expect(refresh).toContain('/api/brain/initialize');
    expect(refresh).toContain("Update chat memory");
    expect(refresh).toContain("Done. Chat now remembers this view.");
    expect(refresh).toContain("Could not update chat memory.");
    expect(refresh).toContain("min-h-11 w-full");
    expect(today).toContain("{readiness.title}");
    expect(readiness).toContain("title: \"Add portfolio context\"");
    expect(readiness).toContain("title: \"Save context for chat\"");
    expect(readiness).toContain("title: \"Market context is sample\"");
    expect(readiness).toContain("label: \"Sample market context\"");
    expect(readiness).not.toContain("Make it more personal");
    expect(readiness).toContain("Add a manual holding or import a holdings snapshot before treating Today as personal.");
    expect(readiness).toContain("Use Save context for chat here, or open Settings for Chat context controls.");
    expect(readiness).toContain("Open memory settings");
    expect(readiness).toContain("The portfolio can be personal, but Today and Alerts still use sample market examples until a saved read exists.");
    expect(readiness).toContain("See what is real");
    expect(readiness).toContain("Save context for chat when you want Master Mold to remember the current view.");
    expect(readiness).toContain("it does not refresh accounts or fetch fresh news.");
    expect(readiness).not.toMatch(new RegExp('action: "Save context for chat"[\\\\s\\\\S]*href: "/"'));
    expect(today).toContain("See what is real");
    expect(today).toContain("mt-2 inline-flex min-h-11 items-center gap-2");
    expect(today).toContain("mt-3 inline-flex min-h-11 items-center gap-2");
    expect(metrics).toContain("Rate today");
    expect(metrics).toContain("Saved for Performance.");
    expect(metrics).toContain('aria-live="polite"');
    expect(metrics).not.toContain("Noted.");
    expect(`${today}\n${refresh}\n${readiness}\n${metrics}`).not.toMatch(/live market scan|synced portfolio|real-time portfolio|always-on scan|Useful today|broad market\/news|does not read broad market|Run a market scan|Load a market scan|Wait for the next market scan/i);
  });

  test("GIVEN Today recommendations need accountability WHEN source copy is checked THEN calls can be saved before outcomes", () => {
    const card = source("components/briefing-card.tsx");
    const save = source("components/save-briefing-call-button.tsx");

    expect(card).toContain("<SaveBriefingCallButton");
    // The card may link out (headline, "Open idea"), but the save control must
    // not be nested inside a navigation Link.
    const saveIndex = card.indexOf("<SaveBriefingCallButton");
    expect(card.lastIndexOf("</Link>", saveIndex)).toBeGreaterThan(card.lastIndexOf("<Link", saveIndex));
    expect(save).toContain("/api/journal");
    expect(save).toContain("Save call");
    expect(card).toContain("Sources used for this read");
    expect(card).toContain("function SourceNoteLine");
    expect(card).toContain('const [label, ...rest] = note.split(":");');
    expect(card).toContain("flex min-h-11 cursor-pointer items-center text-sm font-semibold text-on-surface");
    expect(card).toContain("sourceNotes={sourceNotes}");
    expect(source("app/page.tsx")).toContain("todayRecommendationSourceNotes(card, portfolio, brain, dataMode)");
    expect(source("app/page.tsx")).toContain("Market read: saved read known");
    expect(source("app/page.tsx")).toContain("Portfolio: ${relatedHolding.symbol}");
    expect(source("app/page.tsx")).toContain("Memory: ${brain.summary.snapshot_freshness}");
    expect(source("app/page.tsx")).toContain("no matching saved context note for this idea");
    expect(save).toContain("plainSourceLabel(source)");
    expect(save).toContain('if (source === "Engine output") return "Saved market read";');
    expect(save).toContain("...sourceNotes.slice(0, 3)");
    expect(save).toContain("Saved before the outcome, so Performance can score it later.");
    expect(save).toContain("Adds this idea to the Decision journal before the result is known.");
    expect(`${card}\n${save}`).not.toMatch(/P&L|trade signal/i);
  });

  test("GIVEN Today ranks ideas for a portfolio WHEN source copy is checked THEN focus order uses visible exposure first", () => {
    const today = source("app/page.tsx");
    const card = source("components/briefing-card.tsx");

    expect(today).toContain("const portfolioAwareCards = orderTodayCardsForPortfolio(actionableCards, portfolio);");
    expect(today).toContain("const topCard = portfolioAwareCards[0] ?? cards[0] ?? null;");
    expect(today).toContain("portfolioAwareCards.slice(0, 3)");
    expect(today).toContain("function orderTodayCardsForPortfolio");
    expect(today).toContain("findRelatedHolding(a, portfolio)?.weight_pct ?? 0");
    expect(today).toContain("findRelatedHolding(b, portfolio)?.weight_pct ?? 0");
    expect(today).toContain("return bWeight - aWeight || b.conviction - a.conviction || a.rank - b.rank;");
    expect(source("lib/today-decision-copy.ts")).toContain("Start with ${ideaText}");
    expect(source("lib/today-decision-copy.ts")).toContain("it touches ${portfolioWeight.toFixed(1)}% of the visible portfolio");
    expect(source("lib/plain-finance-copy.ts")).toContain("$1 moved up; check the bear case before adding risk");
    // "picture is mixed" may appear inside plain-finance-copy translation
    // patterns; only emitted copy strings must avoid it.
    expect(source("lib/plain-finance-copy.ts")).toContain('is moving up, but the picture is mixed\\b/gi');
    expect(`${source("lib/today-decision-copy.ts")}\n${source("lib/plain-finance-copy.ts")}`).not.toMatch(/Focus first|"[^"\n]*picture is mixed|urgent alert:/i);
    expect(card).toContain("Focus {rank}");
    expect(card).not.toContain("Rank {rank}");
  });

  test("GIVEN Settings connection cards render WHEN source copy is checked THEN import is explicit and read-only", () => {
    const settingsPage = source("app/settings/integrations/page.tsx");
    const settingsConsole = source("components/settings-web3-credential-console.tsx");
    const input = source("components/integration-key-input.tsx");
    const integrations = source("src/db/integrations.ts");
    const imports = source("src/db/portfolio-imports.ts");

    expect(settingsPage).toContain("Add holdings, test account access, set up live chat");
    expect(settingsPage).toContain("Data and privacy");
    expect(settingsPage).toContain("Stays in this browser");
    expect(settingsPage).toContain("Sent to this local app");
    expect(settingsPage).toContain("Can leave this app");
    expect(settingsPage).toContain("Never sent by this app");
    expect(settingsPage).toContain("what can leave only when you press a button");
    expect(settingsPage).toContain("live chat sends the question plus visible app context");
    expect(settingsPage).toContain("selected chat service");
    expect(settingsPage).not.toContain("selected chat provider");
    expect(settingsPage).toContain("Web3 trading credentials");
    expect(settingsPage).toContain("Secure setup state for the autonomous Web3 paper desk");
    expect(settingsPage).toContain("SettingsWeb3CredentialConsole");
    expect(settingsPage).toContain("Secure credential handoff");
    expect(settingsPage).toContain("Next input:");
    expect(settingsPage).toContain("buildWeb3CredentialHandoffRows");
    expect(settingsPage).toContain("Helius read checks can be local server-env evidence");
    expect(settingsPage).toContain("npm run verify:web3 -- --base-url=http://localhost:4010");
    expect(settingsPage).toContain("Live credential queue");
    expect(settingsPage).toContain("What is left before supervised trading review");
    expect(settingsPage).toContain("buildWeb3CredentialActionQueue");
    expect(settingsPage).toContain("Live DEX scanner");
    expect(settingsPage).toContain("public market data: read-only");
    expect(settingsPage).toContain("Test DEX scanner or Web3 Live DEX read");
    expect(settingsPage).toContain("JUPITER_API_KEY in ignored local env");
    expect(settingsPage).toContain("signature evidence: hash-only");
    expect(settingsPage).toContain("signer secrets: never stored here");
    expect(settingsPage).toContain("private keys and seed phrases stay out of the app");
    expect(settingsPage).toContain("SettingsLaunchBlockerQueue");
    expect(settingsPage).toContain("Launch blocker queue");
    expect(settingsPage).toContain("Operator input packet");
    expect(settingsPage).toContain("What Mastermind still needs before supervised trading review");
    expect(settingsPage).toContain("Dedicated trading wallet");
    expect(settingsPage).toContain("Jupiter route/order key");
    expect(settingsPage).toContain("Signer/custody choice");
    expect(settingsPage).toContain("Manual live approval");
    expect(settingsPage).toContain("private keys and seed phrases stay out of the app");
    expect(settingsPage).toContain("Settings Web3 launch repair queue");
    expect(settingsPage).toContain("Launch repair queue");
    expect(settingsPage).toContain("Safe repair actions for proof, route, supervision, and verification");
    expect(settingsPage).toContain("repairActions.map");
    expect(settingsPage).toContain("repairActionBadgeStatus");
    expect(settingsPage).toContain("Repair actions can refresh paper/readiness evidence only");
    expect(settingsPage).toContain("Next cutover step");
    expect(settingsPage).toContain("Settings shows this queue for planning only");
    expect(settingsPage).toContain("buildWeb3AutonomyLaunchChecklist");
    expect(settingsPage).toContain("getWeb3DaemonSupervisorHealth");
    expect(settingsPage).toContain("getWeb3PromotedPaperAutopilotHealth");
    expect(settingsPage).toContain("Credential checklist");
    expect(settingsPage).toContain("Ignored env template");
    expect(settingsPage).toContain("Web3 credential environment template");
    expect(settingsPage).toContain("Test: {item.test_action}");
    expect(settingsPage).toContain("acquisition.items.map");
    expect(settingsConsole).toContain("Credential action console");
    expect(settingsConsole).toContain("Session-only provider tests");
    expect(settingsConsole).toContain("DEX scanner evidence");
    expect(settingsConsole).toContain("Save public scope");
    expect(settingsConsole).toContain("Saved public scope");
    expect(settingsConsole).toContain("API keys are not sent in this action");
    expect(settingsConsole).toContain("valid public Solana wallet address");
    expect(settingsConsole).toContain("Detect wallet");
    expect(settingsConsole).toContain("Connect wallet");
    expect(settingsConsole).toContain("Prove ownership");
    expect(settingsConsole).toContain("/api/web3-wallet-ownership");
    expect(settingsConsole).toContain("Wallet ownership receipt");
    expect(settingsConsole).toContain("Settings wallet ownership receipt");
    expect(settingsConsole).toContain("wallet ownership proof signs text only");
    expect(settingsConsole).toContain("Browser wallet receipt");
    expect(settingsConsole).toContain("Settings browser wallet readiness receipt");
    expect(settingsConsole).toContain("browser wallet detection requests public address only");
    expect(settingsConsole).toContain("getBrowserSolanaProvider");
    expect(settingsConsole).toContain("signing_permission: \"blocked\"");
    expect(settingsConsole).toContain("wallet_mutation_permission: \"blocked\"");
    expect(settingsConsole).toContain("transaction_signing_permission");
    expect(settingsConsole).toContain("Test credentials");
    expect(settingsConsole).toContain("Test DEX scanner");
    expect(settingsConsole).toContain("/api/web3-dex-discovery?");
    expect(settingsConsole).toContain("Run live preflight");
    expect(settingsConsole).toContain("/api/web3-live-capital-preflight?");
    expect(settingsConsole).toContain("Settings live capital preflight receipt");
    expect(settingsConsole).toContain("Live-capital preflight receipt");
    expect(settingsConsole).toContain("live-capital preflight receipt is review evidence only");
    expect(settingsConsole).toContain("source: \"live-dex\"");
    expect(settingsConsole).toContain("Settings DEX discovery receipt");
    expect(settingsConsole).toContain("scanner evidence only");
    expect(settingsConsole).toContain("Rehearse Jupiter");
    expect(settingsConsole).toContain("no browser storage for Helius or Jupiter keys");
    expect(settingsConsole).toContain("unsigned transaction return withheld");
    expect(settingsConsole).toContain("DEX scanner receipt is read-only paper evidence");
    expect(settingsConsole).toContain("Strict verifier runway");
    expect(settingsConsole).toContain("Operator wallet, Jupiter order, and live DEX gates");
    expect(settingsConsole).toContain("Live DEX gate");
    expect(settingsConsole).toContain("Wallet + order + DEX gate");
    expect(settingsConsole).toContain("--require-dex-live");
    expect(settingsConsole).toContain("SAMPLE_SYSTEM_WALLET");
    expect(source("src/db/web3-account-setup.ts")).toContain("wallet_is_sample");
    expect(source("src/db/web3-account-setup.ts")).toContain("dedicated_wallet_scoped");
    expect(source("src/db/web3-account-setup.ts")).toContain("sample all-ones wallet is allowed for demos");
    expect(source("src/db/web3-provider-credentials.ts")).toContain("demo-only and cannot satisfy operator wallet scope");
    expect(source("components/web3-trading-workspace-loader.tsx")).toContain("demo-only");
    expect(settingsPage).toContain("jupiterConfigured={receipt.environment_summary.jupiter_configured}");
    expect(source("package.json")).toContain("\"verify:web3\": \"node scripts/web3-readiness-verify.mjs\"");
    expect(source("docs/web3-credentials-runbook.md")).toContain("npm run verify:web3 -- --base-url=http://localhost:4010");
    expect(source("docs/web3-credentials-runbook.md")).toContain("--wallet=<public-solana-address> --require-operator-wallet");
    expect(source("docs/web3-credentials-runbook.md")).toContain("npm run verify:web3 -- --base-url=http://localhost:4010 --require-jupiter-order");
    expect(source("docs/web3-credentials-runbook.md")).toContain("npm run verify:web3 -- --base-url=http://localhost:4010 --require-dex-live");
    expect(source("docs/web3-credentials-runbook.md")).toContain("npm run supervise:web3 -- --base-url=http://localhost:4010 --rounds=1 --ticks-per-round=1 --target-net-pnl=1 --max-drawdown=250 --json");
    expect(source("src/db/web3-launch-checklist.ts")).toContain("--target-net-pnl=1 --max-drawdown=250 --json");
    expect(source("docs/web3-credentials-runbook.md")).toContain("strict verifier runway");
    expect(source("docs/web3-credentials-runbook.md")).toContain("read-only DEX scanner testing");
    expect(source("docs/web3-credentials-runbook.md")).toContain("browser-wallet public-address detection");
    expect(source("docs/web3-credentials-runbook.md")).toContain("POST /api/web3-wallet-ownership");
    expect(source("docs/web3-credentials-runbook.md")).toContain("GET /api/web3-dex-discovery");
    expect(source("docs/web3-credentials-runbook.md")).toContain("GET /api/web3-live-capital-preflight");
    expect(source("docs/web3-credentials-runbook.md")).toContain("launch-blocker queue");
    expect(source("docs/web3-credentials-runbook.md")).toContain("Operator input packet");
    expect(source("docs/web3-credentials-runbook.md")).toContain("dedicated trading wallet");
    expect(source("docs/web3-credentials-runbook.md")).toContain("wallet ownership proof");
    expect(source("docs/web3-credentials-runbook.md")).toContain("Jupiter route/order key");
    expect(source("docs/web3-credentials-runbook.md")).toContain("signer/custody choice");
    expect(source("docs/web3-credentials-runbook.md")).toContain("manual live approval");
    expect(source("docs/web3-credentials-runbook.md")).toContain("hard blockers, review gates, and the next cutover step");
    expect(source("docs/web3-credentials-runbook.md")).toContain("restores the original public wallet/risk scope");
    expect(source("src/db/web3-launch-checklist.ts")).toContain("operator_inputs_needed");
    expect(source("src/db/web3-launch-checklist.ts")).toContain("repair_actions");
    expect(source("src/db/web3-launch-checklist.ts")).toContain("local_accountability_repair_health");
    expect(source("src/db/web3-local-accountability-repair.ts")).toContain("web3-local-accountability-repair");
    expect(source("src/db/web3-local-accountability-repair.ts")).toContain("web3LocalAccountabilityRepairReceiptCandidatePaths");
    expect(source("components/web3-trading-workspace-loader.tsx")).toContain("Local paper accountability repair health");
    expect(source("app/settings/integrations/page.tsx")).toContain("Local paper repair health");
    expect(source("scripts/web3-local-accountability-repair.mjs")).toContain("writeLocalAccountabilityRepairReceipt");
    expect(source("scripts/web3-local-accountability-repair.mjs")).toContain("WEB3_LOCAL_ACCOUNTABILITY_REPAIR_STATUS_PATH");
    expect(source("scripts/web3-local-accountability-repair.mjs")).toContain("Refusing live-dex accountability repair unless");
    expect(source("src/db/web3-launch-checklist.ts")).toContain("--source=live-dex");
    expect(source("docs/web3-credentials-runbook.md")).toContain("local paper accountability repair receipt");
    expect(source("docs/web3-credentials-runbook.md")).toContain("freshest sanitized repair receipt");
    expect(source("src/db/web3-launch-checklist.ts")).toContain("buildRepairActions");
    expect(source("src/db/web3-launch-checklist.ts")).toContain("repair-execution-quality");
    expect(source("src/db/web3-launch-checklist.ts")).toContain("refresh-supervisor-proof");
    expect(source("src/db/web3-launch-checklist.ts")).toContain("run-web3-verifier");
    expect(source("src/db/web3-launch-checklist.ts")).toContain("dedicated-trading-wallet");
    expect(source("src/db/web3-launch-checklist.ts")).toContain("jupiter-route-order-key");
    expect(source("src/db/web3-launch-checklist.ts")).toContain("signer-custody-choice");
    expect(source("src/db/web3-launch-checklist.ts")).toContain("manual-live-approval");
    expect(source("src/db/web3-launch-checklist.ts")).toContain("private keys and seed phrases stay out of this app");
    expect(source("README.md")).toContain("/api/web3-dex-discovery?source=live-dex");
    expect(source("README.md")).toContain("/api/web3-live-capital-preflight?source=live-dex");
    expect(source("README.md")).toContain("/api/web3-wallet-ownership");
    expect(source("README.md")).toContain("detect or connect a browser Solana wallet only");
    expect(source("README.md")).toContain("snapshots the saved");
    expect(source("README.md")).toContain("restores the saved public wallet/risk scope before exit");
    expect(source("app/api/web3-wallet-ownership/route.ts")).toContain("buildWeb3WalletOwnershipReceipt");
    expect(source("app/api/web3-dex-discovery/route.ts")).toContain("buildWeb3DexDiscoveryReceipt");
    expect(source("app/api/web3-live-capital-preflight/route.ts")).toContain("buildWeb3LiveCapitalPreflightReceipt");
    expect(source("src/db/web3-wallet-ownership.ts")).toContain("web3-wallet-ownership-receipt");
    expect(source("src/db/web3-wallet-ownership.ts")).toContain("appendWeb3ExecutionAudit");
    expect(source("src/db/web3-wallet-ownership.ts")).toContain("getLatestWeb3WalletOwnershipReceipt");
    expect(source("src/db/web3-wallet-ownership.ts")).toContain("transaction_signing_permission: \"blocked\"");
    expect(source("src/db/web3-wallet-ownership.ts")).toContain("message_storage: \"hash-only\"");
    expect(source("src/db/web3-dex-discovery.ts")).toContain("web3-dex-discovery-receipt");
    expect(source("src/db/web3-live-capital-preflight.ts")).toContain("web3-live-capital-preflight-receipt");
    expect(source("src/db/web3-live-capital-preflight.ts")).toContain("operator-wallet");
    expect(source("src/db/web3-live-capital-preflight.ts")).toContain("jupiter-order");
    expect(source("src/db/web3-live-capital-preflight.ts")).toContain("manual-live-review");
    expect(source("src/db/web3-dex-discovery.ts")).toContain("Discovery endpoints are budgeted as 60 requests/minute");
    expect(source("src/db/web3-dex-discovery.ts")).toContain("token-pair backfill is budgeted separately as 300 requests/minute");
    expect(source("scripts/web3-readiness-verify.mjs")).toContain("verifyProviderHealthReceipt");
    expect(source("scripts/web3-readiness-verify.mjs")).toContain("verifyWalletOwnershipReceipt");
    expect(source("scripts/web3-readiness-verify.mjs")).toContain("/api/web3-provider-health?source=sample&account=persistent");
    expect(source("scripts/web3-readiness-verify.mjs")).toContain("/api/web3-wallet-ownership");
    expect(source("scripts/web3-readiness-verify.mjs")).toContain("verifyOperatorWalletScope");
    expect(source("scripts/web3-readiness-verify.mjs")).toContain("--require-operator-wallet");
    expect(source("scripts/web3-readiness-verify.mjs")).toContain("snapshotExecutionConfig");
    expect(source("scripts/web3-readiness-verify.mjs")).toContain("restoreExecutionConfig");
    expect(source("scripts/web3-readiness-verify.mjs")).toContain("restored original public wallet/risk scope after verifier canaries");
    expect(source("scripts/web3-readiness-verify.mjs")).toContain("verifyStrictJupiterOrderReadiness");
    expect(source("scripts/web3-readiness-verify.mjs")).toContain("--require-jupiter-order");
    expect(source("scripts/web3-readiness-verify.mjs")).toContain("verifyDexDiscoveryReceipt");
    expect(source("scripts/web3-readiness-verify.mjs")).toContain("verifyStrictDexLiveReadiness");
    expect(source("scripts/web3-readiness-verify.mjs")).toContain("--require-dex-live");
    expect(source("components/review-readiness.tsx")).toContain("A Node-only npm run verify:web3 gate");
    expect(source("components/review-readiness.tsx")).toContain("snapshots and restores the saved public wallet/risk scope");
    expect(source("components/review-readiness.tsx")).toContain("full credential checklist");
    expect(source("components/review-readiness.tsx")).toContain("read-only DEX scanner evidence");
    expect(source("components/review-readiness.tsx")).toContain("browser Solana wallet only far enough to read the public address");
    expect(source("components/review-readiness.tsx")).toContain("text-only wallet ownership proof");
    expect(source("components/review-readiness.tsx")).toContain("live-capital preflight receipt");
    expect(source("components/review-readiness.tsx")).toContain("Settings now also surfaces the Web3 launch-blocker queue");
    expect(source("components/review-readiness.tsx")).toContain("Settings now surfaces the Web3 operator input packet");
    expect(source("components/review-readiness.tsx")).toContain("The Web3 trading cockpit now shows the same operator input packet");
    expect(source("components/review-readiness.tsx")).toContain("dedicated trading wallet");
    expect(source("components/review-readiness.tsx")).toContain("Jupiter route/order key");
    expect(source("components/review-readiness.tsx")).toContain("signer/custody choice");
    expect(source("components/review-readiness.tsx")).toContain("hard blockers, review gates, and the next cutover step");
    expect(source("components/review-readiness.tsx")).toContain("hardened local paper command");
    expect(source("components/review-readiness.tsx")).toContain("compact DEX discovery receipt");
    expect(source("components/review-readiness.tsx")).toContain("Settings now shows a strict verifier runway");
    expect(source("components/review-readiness.tsx")).toContain("configured Helius/Solana provider-health proof");
    expect(source("components/review-readiness.tsx")).toContain("opt-in --require-operator-wallet gate");
    expect(source("components/review-readiness.tsx")).toContain("opt-in --require-jupiter-order gate");
    expect(source("components/review-readiness.tsx")).toContain("opt-in --require-dex-live gate");
    expect(settingsPage).toContain("Open Web3 wiring");
    expect(settingsPage).toContain("live execution blocked");
    expect(settingsPage).toContain("wallet mutation blocked");
    expect(settingsPage).toContain("secret echo blocked");
    expect(settingsPage).toContain("External setup packet");
    expect(settingsPage).toContain("Web3 external account setup packet");
    expect(settingsPage).toContain("storage rules");
    expect(settingsPage).toContain("setup links");
    expect(settingsPage).toContain("in app signup blocked");
    expect(settingsPage).toContain("setup_url");
    expect(settingsPage).toContain("https://developers.jup.ag/portal");
    expect(settingsPage.indexOf("<Web3CredentialsRunwayCard")).toBeLessThan(
      settingsPage.indexOf("<ConnectionChecks"),
    );
    expect(settingsPage).toContain("cannot sign transactions");
    expect(settingsPage).toContain("Check account access first, then import a holdings snapshot only when you press import.");
    expect(settingsPage).toContain("Connection checks");
    expect(settingsPage).toContain("Import refresh status");
    expect(settingsPage.indexOf("<ManualHoldingsPanel")).toBeLessThan(
      settingsPage.indexOf("<ProfileSettings"),
    );
    expect(settingsPage.indexOf("<ManualHoldingsPanel")).toBeLessThan(
      settingsPage.indexOf("<ConnectionChecks"),
    );
    expect(settingsPage.indexOf("<ConnectionChecks")).toBeLessThan(
      settingsPage.indexOf("<ProfileSettings"),
    );
    expect(settingsPage.indexOf("<ProfileSettings")).toBeLessThan(
      settingsPage.indexOf("<PortfolioImportStatusCard"),
    );
    expect(settingsPage.indexOf("<PortfolioImportStatusCard")).toBeLessThan(
      settingsPage.indexOf("<DataPrivacyCard"),
    );
    expect(settingsPage.indexOf("<DataPrivacyCard")).toBeLessThan(
      settingsPage.indexOf("<BrainInitializationPanel"),
    );
    expect(settingsPage).toContain("Manual refresh only");
    expect(settingsPage).toContain("Import again whenever you want current balances.");
    expect(settingsPage).not.toContain("Automatic daily account refresh is not running yet.");
    expect(source("components/manual-holdings-panel.tsx")).toContain(
      "Add holdings you want Master Mold to consider. Today and chat use them immediately.",
    );
    expect(source("components/manual-holdings-panel.tsx")).not.toContain("Add what you own here.");
    expect(settingsPage).toContain("No account holdings imported yet.");
    expect(input).toContain("Import holdings snapshot");
    expect(input).toContain("Importing creates Portfolio holdings from a holdings snapshot and still cannot trade.");
    expect(input).toContain("These entries are saved in this browser");
    expect(input).toContain("Use a key you are comfortable testing locally.");
    expect(input).toContain("docs_url?: string;");
    expect(input).toContain("Open connection docs");
    expect(input).toContain("inline-flex min-h-11 items-center text-xs font-semibold text-violet");
    expect(integrations).toContain("Sends one short test question.");
    expect(integrations).toContain("Wallet read key and address");
    expect(integrations).toContain("Live chat key");
    expect(integrations).toContain("Chat service");
    expect(integrations).toContain("Advanced override");
    expect(integrations).toContain("Usually leave blank");
    expect(input).toContain("Test live chat");
    expect(integrations).toContain("AccountInformation_getAllAccountPositions");
    expect(integrations).toContain("Coinbase CDP account key");
    expect(integrations).toContain("Accounts key / JWT");
    expect(imports).toContain("https://api.cdp.coinbase.com/platform/v2/accounts?pageSize=250");
    expect(imports).toContain("/balances?pageSize=250");
    expect(imports).toContain("https://api.zerion.io/v1/wallets/");
    expect(imports).toContain("/api/v1/accounts");
    expect(`${settingsPage}\n${settingsConsole}\n${input}\n${integrations}\n${imports}`).not.toMatch(/live sync|synced portfolio|place checked|brokerage\/orders|(?<!cannot )sign transaction|withdraw|test prompt|\\.env\\.local|account keys|chat inference keys|label: "Provider"|placeholder: "Provider"/i);
    expect(`${input}\n${integrations}`).not.toMatch(/Advanced Trade account credential|SnapTrade read credentials|Basic Auth against|Typed fields are saved|temporary AI key|AI service|Optional model override|Optional model name|Inference key|Inference service|Test AI|Chat inference|label: "Model"|placeholder: "Optional"/i);
    expect(integrations).not.toContain("Bearer token / JWT");
  });

  test("GIVEN the overhaul plan guides the next build WHEN source copy is checked THEN it points at remaining PRD work", () => {
    const plan = source("docs/mobile-native-product-overhaul-plan.md");

    expect(plan).toContain("Start with **Phase 7: Brain, import, and evaluation foundation**.");
    expect(plan).toContain("Scheduled market scan");
    expect(plan).toContain("Portfolio import hardening");
    expect(plan).toContain("Evaluation harness slice");
    expect(plan).toContain("Do not mark the full PRD complete");
    expect(plan).toContain("compact bottom-right launcher above the bottom nav");
    expect(plan).toContain("the 44px top-bar Master Mold head and the compact bottom-right page-aware launcher");
    expect(plan).not.toContain("Start with **Phase 1**.");
    expect(plan).not.toContain("This affects your largest holding");
    expect(plan).not.toMatch(/mobile floating launcher is hidden|floating opener is hidden on mobile|mobile chat access is intentionally the top-bar Master Mold head, while desktop keeps the bottom-right launcher/i);
  });

  test("GIVEN repo documentation describes current state WHEN source copy is checked THEN public copy stays plain and truthful", () => {
    const readme = source("README.md");
    const reviewReadiness = source("components/review-readiness.tsx");

    expect(readme).toContain("future bounded Web3 automation layer");
    expect(readme).toContain("Long-horizon live/out-of-sample forward evaluation with external baseline comparisons");
    expect(readme).toContain("broad TypeScript route, copy, persistence");
    expect(readme).toContain("explicit holdings snapshot import buttons in Settings");
    expect(readme).toContain("automatic broad internet/news scanning is still off by default");
    expect(readme).toContain("suggested paper trades");
    expect(readme).toContain("past-call review");
    expect(readme).toContain("alert-feedback → alert-rule tuning loop");
    expect(reviewReadiness).toContain("Long-horizon live/out-of-sample forward evaluation with external baselines");
    expect(`${readme}\n${reviewReadiness}`).not.toMatch(/54 TypeScript tests|16 deterministic|structural yield|DSR\/PBO\/MinTRL|Alpaca live-shadow|live evaluation harness|proof of edge|decision edge|edge claim|paper predictions|track-record-by-tier|screener-gated|screener-threshold/i);
  });

  test("GIVEN Settings shows Chat context WHEN source copy is checked THEN schedule status stays truthful", () => {
    const panel = source("components/brain-initialization-panel.tsx");
    const brain = source("src/db/brain.ts");
    const settingsPage = source("app/settings/integrations/page.tsx");

    expect(settingsPage).toContain('export const dynamic = "force-dynamic"');
    expect(settingsPage).toContain("getBrainStateAfterDueScheduleCheck");
    expect(settingsPage).toContain('trigger: "settings-open"');
    expect(panel).toContain("Context check");
    expect(panel).toContain("Last check");
    expect(panel).toContain("Last result");
    expect(panel).toContain("last_check_message");
    expect(panel).toContain("Automation set");
    expect(panel).toContain("Arm chat context");
    expect(panel).toContain("Pause chat context");
    expect(panel).toContain("Check context");
    expect(panel).toContain('/api/brain/schedule');
    expect(panel).toContain("Freshness");
    expect(panel).toContain("Snapshot history");
    expect(panel).toContain("Snapshot sources");
    expect(panel).toContain("This source list is for chat context.");
    expect(panel).toContain("Import holdings again when you want current balances.");
    expect(panel).toContain("Chat context automation is on");
    expect(panel).toContain("Today still uses the visible portfolio, alerts, and saved read.");
    expect(panel).toContain("Automation is off");
    expect(panel).toContain("It does not fetch fresh market news or refresh account balances.");
    expect(panel).toContain("Save a snapshot when you want chat to remember the current view");
    expect(panel).toContain("App context only; this did not fetch fresh market news.");
    expect(brain).toContain("Saved today");
    expect(brain).toContain("Older than 1 day");
    expect(brain).toContain("This snapshot does not fetch fresh news.");
    expect(brain).toContain('replace(/\\bLocal snapshot saved\\b/g, "Chat context saved")');
    expect(brain).toContain("no live borrow-rate feed is connected");
    expect(brain).toContain('label: "Account imports"');
    expect(brain).toContain("Connection checks do not add holdings by themselves.");
    expect(brain).toContain("Use Settings import to add a holdings snapshot.");
    expect(brain).toContain('status: enabled ?');
    expect(brain).toContain('event: "brain_schedule_config"');
    expect(brain).toContain('event: "brain_schedule_check"');
    expect(brain).toContain("last_check_message");
    expect(brain).toContain("Chat context automation is off. No snapshot changed.");
    expect(brain).toContain("source_ledger: sourceLedger");
    expect(brain).toContain("latest_snapshot: state.latest_run");
    expect(brain).toContain("snapshot_sources: state.source_ledger");
    expect(brain).toContain("category: brainFactCategory");
    expect(brain).toContain("evidence_count: fact.source_count");
    expect(brain).toContain("recent_runs: runs");
    expect(brain).toContain("snapshot_freshness: state.summary.snapshot_freshness");
    expect(brain).toContain("Chat context automation is off.");
    expect(brain).toContain("runBrainScheduleCheck");
    expect(brain).toContain("getBrainStateAfterDueScheduleCheck");
    expect(brain).toContain("Chat context check saved a snapshot.");
    expect(source("src/db/chat.ts")).toContain("Do not call it a whole-market reader.");
    expect(source("lib/chat-copy.ts")).toContain("chat context check is not running");
    expect(`${panel}\n${brain}`).not.toMatch(/always-on market scan yet|next scheduled scan|source-backed import|Daily scan schedule|Daily scan is not due|Daily schedule check|Daily local check|daily local check|still does not read the broader internet|broad scanning is still not automatic|broad internet reading is not scheduled|did not read broad market|does not read broad market|save a new engine scan|fresh market read|saved scan|exchange feed is running/i);
  });

  test("GIVEN Portfolio imports skip unpriced entries WHEN source copy is checked THEN the user can see why totals are incomplete", () => {
    const portfolioPage = source("app/portfolio/page.tsx");
    const imports = source("src/db/portfolio-imports.ts");
    const portfolio = source("src/db/portfolio.ts");
    const integrationInput = source("components/integration-key-input.tsx");
    const settingsPage = source("app/settings/integrations/page.tsx");

    expect(portfolioPage).toContain("Import issues");
    expect(portfolioPage).toContain("portfolio.import_snapshot.issue_count > 0");
    expect(portfolioPage).toContain("{portfolio.import_snapshot.status}. {portfolio.import_snapshot.note}");
    expect(portfolioPage).toContain("{issue.reason}");
    expect(settingsPage).toContain("Skipped entries");
    expect(settingsPage).toContain("Last checked");
    expect(settingsPage).toContain("snapshot.issue_count > 0");
    expect(settingsPage).toContain("Entries without a usable price or amount stay out of Portfolio");
    expect(settingsPage).toContain("Open the issue list before relying on the total.");
    expect(imports).toContain('event: "portfolio_import"');
    expect(imports).toContain("Account source did not return a usable price.");
    expect(imports).toContain("Account source did not return a usable amount.");
    expect(portfolio).toContain("latestPortfolioImportEvent");
    expect(portfolio).toContain("Some account entries were skipped because price or amount was missing.");
    expect(integrationInput).toContain("not imported because price or amount was missing");
    expect(`${settingsPage}\n${integrationInput}\n${portfolio}\n${imports}`).not.toMatch(/Skipped rows|every row|Rows without|provider rows|provider returned|Provider did not return|row was|rows were/i);
  });
});
