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
    expect(source("components/alert-feed.tsx")).toContain("inline-flex min-h-11 items-center justify-center gap-1");
    expect(source("components/alert-inbox-drawer.tsx")).toContain("relative flex size-11 items-center justify-center rounded-md border");
    expect(source("components/alert-feed.tsx")).toContain("inline-flex min-h-11 items-center justify-center rounded-md border");
    expect(source("components/alert-inbox-drawer.tsx")).toContain("inline-flex min-h-11 items-center justify-center rounded-md border");
    expect(source("components/manual-holdings-panel.tsx")).toContain("inline-flex min-h-11 shrink-0 items-center gap-1.5");
    // Settings is one flat page now; its disclosure summaries keep the 44px floor.
    expect(source("app/settings/page.tsx")).toContain("flex min-h-11 cursor-pointer");
    expect(source("app/portfolio/page.tsx")).toContain("inline-flex min-h-11 items-center gap-2");
    expect(source("components/welcome-flow.tsx")).toContain("min-h-11 rounded-md border px-3 py-2");
    expect(source("components/welcome-flow.tsx")).toContain("lg:grid-cols-[minmax(0,0.78fr)_minmax(26rem,1fr)]");
    expect(source("components/welcome-flow.tsx")).toContain("Start with the sample dashboard");
    expect(source("components/welcome-flow.tsx")).toContain("Before you start");
    expect(source("components/welcome-flow.tsx")).toContain("Save preferences");
    expect(source("components/welcome-flow.tsx")).not.toContain("Set up profile");
    expect(source("components/journal-workspace.tsx")).toContain("min-h-11 rounded-md border px-3 py-2");
    expect(source("components/as-of-replay-control.tsx")).toContain("flex min-h-11 cursor-pointer");
    expect(source("components/command-console.tsx")).toContain("flex size-11 shrink-0");
    expect(source("components/command-console.tsx")).toContain("className=\"min-h-11 w-full bg-transparent");
    expect(source("components/command-console.tsx")).toContain("inline-flex min-h-11 min-w-0 items-center justify-center");
    expect(source("components/command-console.tsx")).toContain("Suggestions");
    expect(source("components/command-console.tsx")).toContain("sm:hidden");
    expect(source("components/command-console.tsx")).toContain("hidden gap-2 sm:flex sm:flex-wrap");
    expect(source("components/page-header.tsx")).toContain("hidden min-h-11 items-center");
    expect(source("components/page-header.tsx")).toContain("sm:inline-flex");
    expect(source("components/command-console.tsx")).not.toContain("min-h-10");
    // Drawer close button: 44px on phones, compact on pointer devices.
    expect(source("components/global-assistant.tsx")).toContain("inline-flex size-11 shrink-0 items-center justify-center rounded-md");
    expect(source("components/global-assistant.tsx")).not.toContain("min-h-10");
    expect(source("components/app-shell.tsx")).toContain("flex min-h-11 shrink-0 items-center whitespace-nowrap");
    expect(source("components/app-shell.tsx")).toContain("inline-flex min-h-11 items-center justify-center");
    expect(source("components/save-briefing-call-button.tsx")).toContain("min-h-11 w-full");
    expect(source("components/briefing-card.tsx")).toContain("group/title flex min-h-11");
    expect(source("components/master-mold-actions.tsx")).toContain("inline-flex min-h-11 items-center justify-center gap-2");
    expect(source("app/page.tsx")).toContain("flex min-h-11");
    // 44px touch floor on phones; compact (sm:) sizing is pointer-only.
    expect(source("components/ui/button.tsx")).toContain('default: "min-h-11 px-4 py-2 sm:min-h-9 sm:py-1.5"');
    expect(source("app/globals.css")).toContain("scroll-padding-bottom: calc(8rem + env(safe-area-inset-bottom));");
    expect(source("app/globals.css")).toContain(':where(a[href], button, input, textarea, select, summary, [tabindex]:not([tabindex="-1"]))');
    expect(source("app/globals.css")).toContain("scroll-margin-bottom: calc(6.5rem + env(safe-area-inset-bottom));");
    expect(source("components/ui/button.tsx")).toContain('icon: "h-11 w-11 sm:h-9 sm:w-9"');
    expect(source("components/ui/input.tsx")).toContain("flex h-11 w-full");
    expect(source("components/paper-workspace.tsx")).toContain("h-11 w-full rounded-md border");
    expect(source("components/paper-workspace.tsx")).toContain("relative flex min-h-11 cursor-pointer");
    expect(source("components/paper-workspace.tsx")).toContain("absolute inset-0 h-full w-full cursor-pointer opacity-0");
    expect(source("components/paper-workspace.tsx")).toContain('id="paper-confidence"');
  });

  test("GIVEN replay tooling exists WHEN pages render on phones THEN it stays compact until opened", () => {
    const replayControl = source("components/as-of-replay-control.tsx");

    expect(replayControl).toContain('data-testid="as-of-replay-control"');
    expect(replayControl).toContain("Optional timeline check");
    expect(replayControl).not.toContain("open={Boolean(activeAsOf)}");
    expect(replayControl).not.toContain("See this page at an earlier time");
  });

  test("GIVEN alert actions render on phones WHEN source controls are checked THEN action buttons use the 44px floor", () => {
    const alertFeed = source("components/alert-feed.tsx");
    const alertDrawer = source("components/alert-inbox-drawer.tsx");
    const alertBell = alertDrawer;
    const globalAssistant = source("components/global-assistant.tsx");

    expect(alertBell).toContain("Open activity, ${activeAlerts.length} unread");
    expect(alertBell).toContain('className="alert-count-badge absolute right-0 top-0"');
    expect(alertBell).toContain("data-alert-count={String(activeAlerts.length)}");
    expect(source("app/globals.css")).toContain(".alert-count-badge::after");
    // Redesign: alerts are one-line rows; the expanded row shows a single compact
    // action strip whose controls keep the 44px floor and only shrink at sm+.
    expect(alertFeed).toContain(
      "inline-flex min-h-11 items-center justify-center gap-1 rounded-md border px-2.5 text-xs font-medium transition-colors disabled:opacity-50 sm:min-h-8",
    );
    expect(alertDrawer).toContain(
      "inline-flex min-h-11 items-center justify-center gap-1 rounded-md border px-2.5 text-xs font-medium transition-colors disabled:opacity-50 sm:min-h-8",
    );
    for (const surfaceSource of [alertFeed, alertDrawer]) {
      expect(surfaceSource).toContain('aria-label="Ask Master Mold"');
      expect(surfaceSource).toContain('title="Ask Master Mold"');
      expect(surfaceSource).toContain('aria-label="Save as decision"');
      // Plain-language button labels: what the tap does, not jargon.
      expect(surfaceSource).toContain('title="Save this as a call in your journal"');
      expect(surfaceSource).toContain("To journal");
      expect(surfaceSource).toContain("Test trade");
      expect(surfaceSource).toContain('aria-label="Paper trade"');
      expect(surfaceSource).toContain('title="Try this idea with simulator dollars"');
      expect(surfaceSource).toContain('aria-label="Dismiss activity"');
      expect(surfaceSource).toContain('title="Dismiss activity"');
      // Thumbs are icon-only, so the 44px floor holds on both axes.
      expect(surfaceSource).toContain("inline-flex min-h-11 min-w-11 items-center justify-center");
    }
    expect(alertDrawer).toContain('data-testid="alert-drawer-actions"');
    expect(alertFeed).toContain("import type { PublicAlert, PublicJournal }");
    expect(alertDrawer).toContain("import type { PublicAlert, PublicJournal }");
    expect(alertFeed).toContain('type SavedJournalEntry = PublicJournal["entries"][number];');
    expect(alertDrawer).toContain('type SavedJournalEntry = PublicJournal["entries"][number];');
    expect(alertDrawer).toContain("ml-auto flex size-11 items-center justify-center rounded-md border");
    // Rework: drawer header controls are borderless icon buttons; the always-
    // visible close button keeps a 44px target on phones.
    expect(globalAssistant).toContain("inline-flex size-11 shrink-0 items-center justify-center rounded-md");
    expect(globalAssistant).toContain('aria-label="Close chat"');
    expect(globalAssistant).toContain("What parts of this app are working with live chat or real saved data?");
    expect(alertFeed).toContain('const label = up ? "Useful" : "Not useful";');
    expect(alertDrawer).toContain('aria-label="Useful"');
    expect(alertDrawer).toContain('aria-label="Not useful"');
    expect(alertDrawer).toContain('aria-label="Dismiss activity"');
    expect(`${alertFeed}\n${alertDrawer}`).not.toContain("JournalEntryJson");
    expect(`${alertFeed}\n${alertDrawer}`).not.toContain("Useful?");
    expect(`${alertFeed}\n${alertDrawer}`).not.toMatch(/flex size-10 items-center justify-center rounded-md border|real inference/i);
    expect(globalAssistant).not.toMatch(/real inference/i);
  });

  test("GIVEN Brain borrow-rate facts feed UI and chat WHEN source copy is checked THEN raw open-interest wording stays hidden", () => {
    const brain = source("src/db/brain.ts");
    const chatRoute = source("app/api/chat/route.ts");
    const chatContext = source("src/chat/context.ts");
    const publicApiCopy = source("lib/public-api-copy.ts");
    const journalCopy = source("lib/journal-copy.ts");
    const executor = source("components/executor-workspace.tsx");

    expect(brain).toContain("had a sample borrow-payment change worth checking");
    expect(brain).toContain("not a live rate feed");
    expect(chatContext).toContain("do not quote raw rates or open-interest figures");
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
    const activityPage = source("app/activity/page.tsx");
    const briefingDetail = source("app/briefing/[id]/page.tsx");

    expect(alertFeed).toContain("function ActivityFilterControls");
    expect(alertFeed).toContain("{filter} activity");
    expect(alertFeed).toContain("sm:hidden");
    expect(alertFeed).toContain("hidden items-center justify-between gap-3 border-b border-outline-variant/20 pb-3 sm:flex");
    expect(alertFeed).toContain("inline-flex flex-wrap items-center gap-1 rounded-md border border-outline-variant/30 bg-surface-dim/25 p-1");
    // Filter pills read small (text-xs, h-8 at sm+) but keep the 44px floor on phones.
    expect(alertFeed).toContain("min-h-11 rounded-md px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet sm:h-8 sm:min-h-8");
    expect(alertFeed).toContain("{activeCount} active");
    expect(alertFeed).toContain('data-testid="alert-feed"');
    expect(alertFeed).toContain('data-testid="alert-card"');
    expect(activityPage).not.toContain("showSuggestions: false");
    expect(activityPage).not.toContain('className: "hidden sm:block"');
    expect(activityPage).not.toContain("<PageHeader");
    // Redesign: Activity has a slim hand-rolled header; the review-queue framing
    // is the count line plus the unchanged AlertFeed.
    expect(activityPage).toContain("to review");
    expect(activityPage).toContain("Back to Today");
    expect(activityPage).toContain("<AlertFeed");
    expect(alertDrawer).toContain("Checking the latest activity...");
    expect(alertDrawer).toContain('data-testid="alert-drawer-card"');
    // Redesign: every alert is a one-line disclosure row — severity dot with an
    // sr-only tier label, single truncated message, quiet symbol on the right —
    // and the whole 44px row is the toggle. No per-card badges or chips.
    expect(alertFeed).toContain("flex min-h-11 w-full cursor-pointer items-center gap-3 px-3 py-2 text-left");
    expect(alertDrawer).toContain("flex min-h-11 cursor-pointer list-none items-center gap-3 px-3 py-2");
    for (const surfaceSource of [alertFeed, alertDrawer]) {
      expect(surfaceSource).toContain("size-2 shrink-0 rounded-full");
      expect(surfaceSource).toContain('<span className="sr-only">{alert.severity}:</span>');
      expect(surfaceSource).toContain("min-w-0 flex-1 truncate text-sm text-on-surface");
      expect(surfaceSource).toContain('alert.asset_symbol !== "Unknown"');
      expect(surfaceSource).toContain("divide-y divide-outline-variant/20 rounded-md border border-outline-variant/25");
      expect(surfaceSource).toContain("{buildAlertSuggestedResponse(alert)}");
      expect(surfaceSource).toContain("{explainAlertRelevance(alert)}");
      expect(surfaceSource).toContain("cleanAlertRationale(alert.rationale)");
      expect(surfaceSource).toContain("Ignore when: {buildAlertIgnoreCondition(alert)}");
      // Dismissed items stay reachable behind a full-height summary toggle.
      expect(surfaceSource).toContain("flex min-h-11 cursor-pointer items-center px-3 text-sm font-semibold text-on-surface");
      expect(surfaceSource).not.toContain("severityStyles");
      expect(surfaceSource).not.toContain("<Badge");
      expect(surfaceSource).not.toContain("ProvenanceChip");
    }
    expect(alertDrawer.indexOf("data-testid={`alert-ask-")).toBeGreaterThan(alertDrawer.indexOf("{buildAlertSuggestedResponse(alert)}"));
    expect(alertFeed).toContain('data-testid="activity-details-panel"');
    expect(alertFeed).toContain('aria-label="Dismiss activity"');
    expect(alertFeed).toContain("inline-flex min-h-11 min-w-11 items-center justify-center");
    expect(alertFeed).toContain("function AlertRow");
    expect(alertFeed).not.toContain("Details and response");
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
    const appShell = source("components/app-shell.tsx");
    // Redesign: /review is a redirect; its status view lives on /settings#health.
    const settingsPage = source("app/settings/page.tsx");
    const routeSources = [
      source("app/alerts/page.tsx"),
      source("app/chat/page.tsx"),
      source("app/portfolio/page.tsx"),
      source("app/paper/page.tsx"),
      source("app/journal/page.tsx"),
      source("app/executor/page.tsx"),
      settingsPage,
    ].join("\n");

    expect(provenanceChip).toContain('return "Saved market read";');
    expect(provenanceChip).toContain('return "Read-only public DEX market evidence";');
    expect(provenanceChip).toContain('isLiveDex ? "Live DEX read"');
    expect(provenanceChip).toContain('return "Sample data for review and testing";');
    expect(appShell).toContain("type DataModeLabel = ProductProvenanceLabel;");
    expect(appShell).toContain('dataMode = "Sample data"');
    expect(appShell).toContain('isLiveDex ? "Live DEX"');
    expect(briefingCard).toContain("<ProvenanceChip label={provenance.label} title={provenance.source} />");
    expect(briefingDetail).toContain("label={publicProvenanceLabel}");
    expect(briefingDetail).toContain("title={productProvenanceSource(card.provenance.label, card.provenance.source)}");
    expect(todayPage).toContain("<AppShell dataMode={productProvenanceLabel(pageDataMode)}>");
    expect(settingsPage).toContain("productProvenanceLabel(dataMode.label)");
    expect(settingsPage).toContain("<HealthRow label=\"Data mode\" value={publicDataMode} />");
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
    // Redesign: expandable holding cards became one dense table. The decision
    // detail per holding is now the Rule column, which links every row to its
    // standing position policy.
    const portfolioPage = source("app/portfolio/page.tsx");
    const portfolioCopy = source("lib/portfolio-copy.ts");
    const portfolioCharts = source("components/portfolio-charts.tsx");

    expect(portfolioCopy).toContain("Holdings, allocation, and source status for Today and chat.");
    // The Add holding action lands on the actual form, but the first screen stays focused on the portfolio read.
    expect(portfolioPage).toContain('href="#add-holdings"');
    expect(portfolioPage).toContain('id="add-holdings"');
    // Every row shows symbol, amount, value, and share of the visible portfolio.
    expect(portfolioPage).toContain("{holding.symbol}");
    expect(portfolioPage).toContain("formatQuantity(holding.quantity)");
    expect(portfolioPage).toContain("formatCurrency(holding.market_value)");
    expect(portfolioPage).toContain("{holding.weight_pct.toFixed(1)}%");
    // The Rule column links each holding to its position policy.
    expect(portfolioPage).toContain('href="#position-policies"');
    expect(portfolioPage).toContain("Your standing rule");
    expect(portfolioPage).toContain("Set a standing rule for this position");
    expect(portfolioPage).toContain('id="position-policies"');
    expect(portfolioPage).toContain("<PositionPoliciesPanel");
    // Policy breaches surface as banners above the table.
    expect(portfolioPage).toContain('aria-label="Policy checks"');
    expect(portfolioPage).toContain("{finding.title}");
    expect(portfolioPage).toContain("{finding.detail}");
    // Source honesty: the header names manual/imported/sample state plainly.
    expect(portfolioPage).toContain("manual holdings · local only");
    expect(portfolioPage).toContain("imported holdings · read-only snapshot");
    expect(portfolioPage).toContain("Sample data until you add holdings");
    expect(portfolioPage.indexOf("<ManualHoldingsPanel")).toBeGreaterThan(
      portfolioPage.indexOf('id="holdings-title"'),
    );
    // The net worth chart stays honest about its source: one dot per saved
    // daily close, with hover detail and up/down day-over-day coloring.
    expect(portfolioCharts).toContain("One dot per saved daily close");
    expect(portfolioCharts).toContain('data-testid="net-worth-dot"');
    expect(portfolioCharts).toContain('data-testid="net-worth-tooltip"');
    expect(portfolioCharts).toContain("vs prior day");
    expect(portfolioCharts).toContain("first saved close");
    expect(`${portfolioPage}\n${portfolioCopy}\n${portfolioCharts}`).not.toMatch(
      /Tap a holding|thesis|your portfolio|>Weight|The visible money picture|Portfolio value, not individual asset price moves|alert: \\$\\{cleanAlertMessage|can shape Today/i,
    );
  });

  test("GIVEN Settings first-paint copy WHEN the profile state is not ready THEN it does not look stuck", () => {
    // Redesign: the settings hub + integrations pages merged into one flat
    // /settings page with plain sections; the old lane index went away.
    const profileSettings = source("components/profile-settings.tsx");
    const settingsPage = source("app/settings/page.tsx");
    const integrationsRedirect = source("app/settings/integrations/page.tsx");

    expect(profileSettings).toContain("Profile settings live in this browser");
    expect(profileSettings).toContain("<summary className=\"flex min-h-11 cursor-pointer list-none items-center gap-3 px-3 py-2 marker:hidden [&::-webkit-details-marker]:hidden\">");
    expect(settingsPage).toContain("Choose what to connect. Nothing here places trades, signs transactions, or moves funds.");
    expect(settingsPage).toContain("New here?");
    expect(settingsPage).toContain('id="connections"');
    expect(settingsPage).toContain('id="profile"');
    expect(settingsPage).toContain('id="chat"');
    expect(settingsPage).toContain('id="autopilot"');
    expect(settingsPage).toContain('id="safety"');
    expect(settingsPage).toContain('id="health"');
    expect(settingsPage.indexOf('id="connections"')).toBeLessThan(settingsPage.indexOf('id="profile"'));
    expect(settingsPage.indexOf('id="profile"')).toBeLessThan(settingsPage.indexOf('id="health"'));
    expect(settingsPage).toContain("<ProfileSettings />");
    // Legacy deep links keep working: old anchors stay, and the old integrations
    // URL redirects into /settings with the query preserved.
    expect(settingsPage).toContain('id="portfolio-connections"');
    expect(settingsPage).toContain('id="ai-chat-keys"');
    expect(integrationsRedirect).toContain("redirect(`/settings${suffix}`);");
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
      "Ask Master Mold to open routes, check status, pull context, or explain what to do next.",
    );
    expect(chatPage).toContain("parseAsOf(params?.as_of ?? null)");
    expect(chatPage).not.toContain("getChatPrompts");
    expect(chatPage).not.toContain("getDataMode");
    expect(chatPage).toContain('apiPath="/api/chat"');
    expect(chatPage).toContain("buildChatRoute(initialQuery, asOf?.iso ?? null)");
    expect(chatPage).toContain("Answer only from the context known by then.");
    expect(chatPage.indexOf('id="ask-master-mold"')).toBeLessThan(chatPage.indexOf('apiPath="/api/chat"'));
    expect(chatPage).not.toContain("Ask a question");
    expect(appShell).toContain('const isChatPage = pathname.startsWith("/chat");');
    expect(appShell).toContain('{isChatPage ? (');
    expect(globalAssistant).toContain('const isChatPage = currentPath.startsWith("/chat");');
    // Master Mold persists through the top-bar brand on phones and the
    // floating launcher on desktop.
    expect(source("app/page.tsx")).toContain('id="today-chat"');
    expect(source("app/page.tsx")).not.toContain("<ChatWorkspace");
    // The launcher remains available outside /chat without covering mobile
    // page content; the mobile top-bar brand opens the same drawer.
    expect(globalAssistant).toContain("const showFloatingLauncher = !open && !isChatPage;");
    expect(globalAssistant).toContain("{showFloatingLauncher ? (");
    expect(globalAssistant).toContain('data-testid="global-assistant-open"');
    expect(globalAssistant).toContain("fixed bottom-4 right-4");
    expect(globalAssistant).toContain("hidden min-h-12");
    expect(globalAssistant).toContain("xl:flex");
    expect(globalAssistant).toContain("size-12");
    expect(globalAssistant).not.toContain("bottom-[4.85rem] right-3");
    expect(appShell).toContain('aria-label="Mobile primary"');
    expect(appShell).toContain("fixed bottom-3 left-1/2");
    expect(appShell).toContain("w-[calc(100%-1.5rem)] -translate-x-1/2");
    expect(appShell).toContain("relative flex min-h-11 min-w-0 flex-1 flex-col");
    // The face still navigates home, while the sticky wordmark opens Master
    // Mold at every breakpoint without relying on an overlapping launcher.
    expect(appShell).toContain('aria-label="Go to Today (home)"');
    expect(appShell).toContain('aria-label="Ask Master Mold from the top bar"');
    expect(appShell).toContain("openMasterMoldChat(undefined, pageContext)");
    expect(appShell).toContain("fixed top-0 left-0 z-50 flex h-14 w-full");
    expect(appShell).toContain("flex min-h-11 shrink-0 items-center whitespace-nowrap");
    expect(appShell).not.toContain("hidden min-h-11 items-center whitespace-nowrap font-display text-base font-bold tracking-tight text-violet md:flex");
    expect(appShell).toContain("hidden h-full w-14 flex-col");
    expect(appShell).toContain("pt-20 md:pl-16");
    expect(source("components/reviewer-evidence-panel.tsx")).toContain('"Today and activity"');
    expect(chatPage).not.toMatch(/your alerts, holdings, and record/i);
  });

  test("GIVEN the daily shell renders outside Trade WHEN top-bar controls are checked THEN the drill is scoped to Trade", () => {
    const appShell = source("components/app-shell.tsx");

    expect(appShell).toContain('const showKillControl = pathname.startsWith("/trading") || killEngaged;');
    expect(appShell).toContain("{showKillControl ? (");
    expect(appShell).toContain('title="Run safety drill"');
    expect(appShell).toContain('aria-label="Run safety drill"');
  });

  test("GIVEN Executor redirects into Trade WHEN source copy is checked THEN it avoids duplicate control rooms", () => {
    const executorPage = source("app/executor/page.tsx");
    const executorWorkspace = source("components/executor-workspace.tsx");
    const publicCopy = source("lib/public-api-copy.ts");

    expect(executorPage).toContain('redirect(`/trading${query}`);');
    expect(executorPage).not.toContain("<ExecutorWorkspace");
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

    expect(journalPage).not.toContain("showSuggestions: false");
    expect(journalPage).not.toContain('className: "hidden sm:block"');
    expect(journalPage).toContain("toPublicJournal(journal)");
    expect(journalPage).toContain("call?: string;");
    expect(journalRoute).toContain("call?: unknown;");
    expect(journalRoute).toContain("normalizeText(body.call) || normalizeText(body.thesis)");
    expect(journal).toContain("call: string;");
    expect(journal).toContain('id="journal-call"');
    expect(journal).toContain("call: form.call");
    expect(journal).toContain('const statusText = isPending ? "Logging decision." : message;');
    expect(journal).toContain("const [recordOpen, setRecordOpen] = useState(Boolean(initialDraft));");
    expect(journal).toContain('window.location.hash === "#record-call"');
    expect(journal).toContain('open={recordOpen}');
    expect(journal).toContain('<p aria-live="polite" className="text-sm leading-5 text-outline">');
    // The outcome form pairs an sr-only live region with a visible message; the
    // status must never be screen-reader-only without a visible counterpart.
    expect(journal).toContain('{message ? <p className="text-sm text-outline">{message}</p> : null}');
    expect(journal).toContain("call_was_right: form.call_was_right");
    expect(journal).toContain("review_quality: Number(form.review_quality)");
    expect(journal).toContain("result_score: Number(form.result_score)");
    expect(journal).toContain("result_note: form.result_note");
    // Redesign: the page-level ScoreAccuracyBars duplicated the workspace's
    // "Review scores" section and was removed; the workspace owns score bands.
    expect(journalPage).not.toContain("<ScoreAccuracyBars");
    expect(journal.indexOf("<EntryList")).toBeLessThan(journal.indexOf("<TrackRecordSection"));
    expect(journal.indexOf("<TrackRecordSection")).toBeLessThan(journal.indexOf("<aside"));
    expect(journal).toContain("data-journal-task-first");
    expect(journal).toContain('className="min-w-0 scroll-mt-24 xl:sticky xl:top-6"');
    expect(journalPage).toContain('className="mx-auto w-full min-w-0 max-w-4xl overflow-hidden"');
    expect(journal).toContain('className="grid w-full min-w-0 gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start"');
    expect(journal).toContain('id="record-call"');
    expect(journal).toContain("Save a new decision before the result is obvious.");
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
    // Redesign: score bands live only in the workspace's Review scores region.
    expect(journal).toContain("Review scores");
    expect(journal).toContain('{entry.result.call_was_right ? "Right" : "Missed"}');
    // Redesign: provenance-gated sample-vs-saved wording lives in the
    // workspace's Review scores region (the page-level duplicate was removed).
    expect(journal).toContain('const isSample = provenance.label === "Sample data";');
    expect(journal).toContain("Seeded and locally saved calls. Use this to check the scoring workflow; it is not evidence that future calls will work.");
    expect(journal).toContain("Compares higher-scored saved calls with later results. Useful for review, not proof that future calls will work.");
    expect(journalPage).not.toMatch(/CalibrationCurve|calibration-title/i);
    expect(journalPage).not.toMatch(/Score accuracy|Confidence accuracy|higher-confidence|actually been right more often/i);
    expect(journal).toContain("Review scores");
    expect(journal).toContain("const INITIAL_JOURNAL_ENTRY_LIMIT = 1;");
    expect(journal).toContain("entries.slice(0, INITIAL_JOURNAL_ENTRY_LIMIT)");
    expect(journal).toContain("Showing {visibleEntries.length} of {entries.length} saved calls.");
    expect(journal).toContain("Show ${hiddenEntryCount} older calls");
    expect(journal).toContain("Show recent only");
    expect(journal).toContain("Older calls stay in the archive until review time.");
    expect(journal).toContain("aria-expanded={showDetails}");
    expect(journal).toContain('aria-controls="strategy-belief-detail"');
    expect(journal).toContain("Show lesson details");
    expect(journal).toContain("{showDetails ? (");
    expect(journal).toContain('id="strategy-belief-detail"');
    expect(journal).toContain("<TrackRecordSection tiers={trackRecord} provenance={initialJournal.provenance} />");
    expect(journal).toContain("<ProvenanceChip label={provenance.label} title={provenance.source} />");
    expect(journal).toContain("data-journal-score-strip");
    expect(journal).toContain("Open when you are checking your process.");
    expect(journal).toContain('<span className="sr-only">Score details</span>');
    expect(journal).toContain('className="grid gap-2 sm:gap-4"');
    expect(journal).toContain('className="group cursor-pointer list-none space-y-1.5 p-2.5 marker:hidden sm:space-y-3 sm:p-5 [&::-webkit-details-marker]:hidden"');
    // Redesign: the entry list is one journal stream with author attribution —
    // human calls carry a "You" chip, Master Mold's analyst memo and lessons
    // interleave as read-only violet-accented rows.
    expect(journal).toContain("Journal stream");
    expect(journal).toContain('data-testid="journal-author-you"');
    expect(journal).toContain('data-testid="journal-author-master-mold"');
    expect(journal).toContain('data-testid="journal-system-entry"');
    expect(journal).toContain('entry.kind === "lesson" ? "lesson" : "daily review"');
    expect(journalPage).toContain('import { autopilotStore } from "@/src/autopilot/store";');
    expect(journalPage).toContain('.filter((row) => row.kind === "lesson")');
    expect(journal).toContain('<ChevronDown aria-hidden="true" className="size-4" />');
    expect(journal).toContain('<span className="sr-only">Details</span>');
    expect(journal).toContain("formatCompactTierResultCount(tier)");
    expect(journal).toContain("{entries.length} saved");
    expect(journal).toContain("line-clamp-2 text-sm leading-5");
    expect(journal).toContain("grid min-h-16 content-center gap-1 rounded-md");
    expect(journal).toContain("flex min-h-14 cursor-pointer list-none items-center justify-between gap-3");
    expect(journal).toContain("Seeded and locally saved calls. Use this to check the scoring workflow; it is not evidence that future calls will work.");
    expect(journal).toContain("Compares higher-scored saved calls with later results. Useful for review, not proof that future calls will work.");
    expect(journal).toContain("formatCompactTierResultCount(tier)");
    expect(journal).toContain('return tier.resolved_count === 0 ? "No closed" : `${tier.wins}/${tier.resolved_count} right`;');
    expect(journal).toContain('`${value.toFixed(1)}/10`');
    expect(journal).not.toMatch(/Past calls by score|actually right more often|% right|Avg result"/i);
    expect(source("src/product/capabilities.ts")).not.toContain('"Score accuracy"');
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
    // Redesign: the /review status page became the Settings "System health"
    // section; its rows must keep product-facing names, not raw metric keys.
    const settingsPage = source("app/settings/page.tsx");

    expect(settingsPage).toContain("System health");
    expect(settingsPage).toContain('<HealthRow label="Data mode"');
    expect(settingsPage).toContain('label="Portfolio source"');
    expect(settingsPage).toContain('label="Daily report"');
    expect(settingsPage).toContain('<HealthRow label="Credentials" value="Local reviewer" detail="No secrets required for local review." />');
    expect(source("lib/public-api-copy.ts")).toContain('briefing_feedback: "Today rated"');
    expect(settingsPage).not.toMatch(/today_read_target|median_today_read_seconds|briefing_feedback\.usefulness_rate|alert_feedback\.fatigue_rate|calibration_outcomes|mean_abs_error|within_confidence_band|Briefing ratings|Briefing rated|opens · no ratings|opens`,/i);
  });

  test("GIVEN legacy routes are still reachable WHEN their source is checked THEN they render product surfaces without implementation copy", () => {
    // Redesign: /settings/integrations and /review became redirects into the
    // single flat /settings page; /dashboard still renders Today.
    const dashboardPage = source("app/dashboard/page.tsx");
    const settingsPage = source("app/settings/page.tsx");
    const integrationsRedirect = source("app/settings/integrations/page.tsx");
    const reviewRoute = source("app/review/route.ts");

    expect(dashboardPage).toContain('import TodayPage from "../page";');
    expect(dashboardPage).toContain('export const dynamic = "force-dynamic";');
    expect(dashboardPage).toContain("return <TodayPage {...props} />;");
    expect(dashboardPage).not.toMatch(/export \{ dynamic \}|redirect|Loading this view/i);
    expect(settingsPage).toContain("export default async function SettingsPage()");
    expect(integrationsRedirect).toContain("redirect(`/settings${suffix}`);");
    expect(reviewRoute).toContain('headers: { location: "/settings#health" }');
    expect(settingsPage).not.toMatch(/Settings route loaded|reviewer and operator flows/i);
  });

  test("GIVEN a route fails WHEN the fallback renders THEN it uses plain app copy", () => {
    const routeFeedback = source("components/route-feedback.tsx");

    expect(routeFeedback).toContain("Loading the page controls.");
    expect(routeFeedback).toContain("Master Mold stays ready for a quick check");
    expect(routeFeedback).toContain('if (pathname.startsWith("/chat"))');
    expect(routeFeedback).toContain('surface: "Chat"');
    expect(routeFeedback).toContain("The Master Mold chat view is loading.");
    expect(routeFeedback).toContain("This page did not load");
    expect(routeFeedback).toContain("Retry this page, or switch sections from the main navigation");
    // "Skeleton" appears in component identifiers (RouteLoadingSkeleton); the
    // user-visible loading/error copy is pinned by the positive checks above.
    expect(routeFeedback).not.toMatch(/Loading this view|surface did not load|route failure|server data fetch|persistent nav/i);
  });

  test("GIVEN Performance shows saved-read details WHEN source copy is checked THEN it avoids review-console wording", () => {
    // Redesign: the /review status view is now the Settings "System health"
    // section; the scope boundary strings stay in the daily-report module.
    const reviewCapabilities = source("src/product/capabilities.ts");
    const reviewCopy = source("lib/review-status-copy.ts");
    const settingsPage = source("app/settings/page.tsx");
    const dailyReport = source("src/db/daily-report.ts");
    const reviewSurface = `${settingsPage}\n${reviewCapabilities}`;

    expect(settingsPage).toContain('label="Daily report"');
    expect(settingsPage).toContain("auto-refresh");
    expect(dailyReport).toContain('market_scope: "market data only"');
    expect(settingsPage).toContain("No swaps, signatures, or fund movement.");
    expect(reviewSurface).toContain("Short questions can use a saved chat key");
    expect(reviewSurface).toContain("Saved market reads can inform Today, Alerts, Paper, and chat.");
    expect(reviewCopy).toContain("optional market check");
    expect(`${reviewSurface}\n${reviewCopy}`).not.toMatch(
      /AI-assisted|Fast \+ Deep|Deeper research|Tried, then used|simpler|saved-summary|no AI calls/i,
    );
  });

  test("GIVEN live chat uses a saved key WHEN source copy is checked THEN size-limit stops are visible and plain", () => {
    const route = source("app/api/chat/route.ts");
    const chatContext = source("src/chat/context.ts");
    const providers = [
      source("src/chat/providers/anthropic.ts"),
      source("src/chat/providers/openai.ts"),
      source("src/chat/providers/openrouter.ts"),
    ].join("\n");
    const chat = source("components/chat-workspace.tsx");
    const reviewCapabilities = source("src/product/capabilities.ts");

    expect(chatContext).toContain("MASTERMOLD_CHAT_MAX_TOTAL_TOKENS");
    expect(chatContext).toContain("MASTERMOLD_CHAT_MAX_RESPONSE_TOKENS");
    expect(route).toContain("contextWithInferenceBudget");
    expect(chatContext).toContain("live chat has a size limit");
    expect(chatContext).toContain("Short questions can use a saved chat key");
    expect(chatContext).toContain("The Today Save context for chat action only saves or refreshes local app context");
    expect(chatContext).toContain("Do not say live chat requests never happen");
    expect(source("lib/chat-copy.ts")).toContain("Begin with `Today readiness:`");
    expect(source("lib/chat-copy.ts")).toContain("Do not call sample data a general market scan.");
    expect(source("src/chat/local-commands.ts")).toContain("Today check:");
    expect(source("src/chat/local-commands.ts")).toContain("Focus: ${focusVerdict}");
    expect(source("src/chat/local-commands.ts")).toContain("Why: ${todayFocusReason(activityLine, facts)}");
    expect(source("src/chat/local-commands.ts")).toContain("Risk: ${riskLine}");
    expect(source("src/chat/local-commands.ts")).toContain("function todayFocusReason");
    expect(source("src/chat/local-commands.ts")).toContain("function todayRiskLine");
    expect(source("src/chat/local-commands.ts")).toContain("Next: Check Activity; paper-test later if it still matters.");
    expect(source("src/chat/local-commands.ts")).toContain("Next: open Today; then paper-test before risking real money.");
    expect(route).toContain("This question is too large to send to live chat");
    expect(providers).toContain("max_tokens: budget?.maxResponseTokens");
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
    expect(reviewCapabilities).toContain("oversized questions stop before any live chat request");
  });

  test("GIVEN Performance describes forward measurement WHEN source copy is checked THEN it separates local logs from real evidence", () => {
    const forwardProof = source("src/db/forward-proof.ts");

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
    expect(forwardProof).toContain("No dated measurement window is running.");
    // forward-proof.ts scrubs edge-claim language via cleanPassFailGate; those
    // phrases may only appear inside its detection regex.
    expect(forwardProof).toContain("function cleanPassFailGate");
    const forwardProofWithoutGateScrubber = forwardProof.replace(/edge claim\|proof of edge\|decision edge\|claim it is outperforming\|is outperforming/g, "");
    expect(`${forwardProofWithoutGateScrubber}\n${source("components/forward-trial-starter.tsx")}`).not.toMatch(/proof that Master Mold can beat|proven Master Mold|show Master Mold can do better|proof of edge|decision edge|edge claim|claim it is outperforming|Measurement contract|Measurement-window calls|id: "forward_trial"|trial:|DSR|PBO|MinTRL|Alpaca paper shadow|Equal-weight|always-on market memory/i);
  });

  test("GIVEN System status opens on mobile WHEN source copy is checked THEN it states the trust boundary first", () => {
    // Redesign: the /review status page became the Settings "System health"
    // section, and the trust boundary is now stated globally (AppShell footer
    // + side-rail health link) plus the Live trading health row.
    const settingsPage = source("app/settings/page.tsx");
    const appShell = source("components/app-shell.tsx");
    const reviewRoute = source("app/review/route.ts");
    const reviewCapabilities = source("src/product/capabilities.ts");
    const reviewSurface = `${settingsPage}\n${reviewCapabilities}`;

    expect(reviewRoute).toContain('headers: { location: "/settings#health" }');
    expect(appShell).toContain("Advisory only — Master Mold never places trades or moves funds.");
    expect(appShell).toContain('href="/settings#health"');
    expect(settingsPage).toContain("System health");
    expect(settingsPage).toContain('label="Portfolio source"');
    expect(settingsPage).toContain("portfolioSource.source_label");
    expect(settingsPage).toContain('<HealthRow label="Live trading" value="Locked" detail="No swaps, signatures, or fund movement." />');
    expect(settingsPage).toContain('label="Daily report"');
    expect(settingsPage).toContain('value="Local reviewer"');
    expect(settingsPage).toContain("No secrets required for local review.");
    expect(reviewSurface).toContain("Chat context saves what the app can remember");
    expect(reviewSurface).toContain("supporting notes, and alerts come from the saved read");
    expect(reviewSurface).toContain("Saved market reads can inform Today, Alerts, Paper, and chat.");
    expect(reviewSurface).toContain("They cannot touch accounts or move money.");
    expect(reviewSurface).toContain("chat context snapshots");
    expect(reviewSurface).toContain("Live chat can be tested and used when a key is saved.");
    expect(reviewSurface).not.toMatch(/Performance & trust|still sample before you trust|Safe to inspect|trust score|black box|Manual or sample only|real portfolio money|scanner reads|drivers, and alerts|OpenRouter, Anthropic, or OpenAI|always-on Brain described in the PRD|brain runs|Ask about this scan|Review the current Master Mold scan|What it learned|Confidence \\$\\{Math\\.round|seeded local account|Last scan|Scan date|Scan type|Scan details|Not needed for this scan|duplicate scan/i);
  });

  test("GIVEN Paper and Trade open on mobile WHEN source copy is checked THEN they keep simulator and Web3 flows plain", () => {
    const paperPage = source("app/paper/page.tsx");
    const paperWorkspace = source("components/paper-workspace.tsx");
    const tradingPage = source("app/trading/page.tsx");

    // Redesign: the Paper header is hand-rolled "Simulator" copy now.
    expect(paperPage).toContain("Test calls with simulator dollars before risking anything.");
    expect(paperPage).toContain("Ideas to test");
    expect(paperPage).not.toContain("showSuggestions: false");
    expect(paperPage).not.toContain('className: "hidden sm:block"');
    expect(paperPage.indexOf("<PaperWorkspace")).toBeGreaterThan(-1);
    expect(paperPage.indexOf("<MasterMoldPaperIdeas")).toBeGreaterThan(-1);
    expect(paperWorkspace).toContain("Open tests");
    expect(paperWorkspace).toContain("Use simulator dollars to test a call");
    expect(paperWorkspace).toContain("Test a paper trade");
    expect(paperWorkspace).toContain("Paper trades use this simulator balance only. No connected account is touched.");
    expect(paperWorkspace).toContain("const INITIAL_CLOSED_ROUND_LIMIT = 3;");
    expect(paperWorkspace).toContain("rounds.slice(0, INITIAL_CLOSED_ROUND_LIMIT)");
    expect(paperWorkspace).toContain("Show closed-test history");
    expect(paperWorkspace).toContain("Hide closed-test history");
    expect(paperWorkspace).toContain('aria-controls="paper-round-history-detail"');
    expect(paperWorkspace).toContain('id="paper-round-history-detail"');
    expect(paperWorkspace).toContain("Showing {visibleRounds.length} of {rounds.length} closed rounds.");
    expect(paperWorkspace).toContain("Show ${hiddenRoundCount} older rounds");
    expect(paperWorkspace).toContain("Show recent rounds");
    expect(paperWorkspace).toContain("min-h-11 rounded-md border border-outline-variant/40 px-3");
    expect(paperWorkspace).not.toContain("min-h-10");

    // Retirement 2026-07-05: the supervised test-trade workspace is gone; the
    // Trade page is the autonomous Autopilot lane only.
    expect(tradingPage).toContain("<AutopilotPanel />");
    // Redesign: TradeScopeBanner was replaced by the global AppShell footer;
    // Trade's own header still pins the live-money lock.
    expect(tradingPage).toContain("Live money stays locked.");
    expect(source("components/app-shell.tsx")).toContain("Advisory only — Master Mold never places trades or moves funds.");
    expect(tradingPage).not.toContain("showSuggestions: false");
    expect(tradingPage).not.toContain('className: "hidden sm:block"');
    expect(tradingPage).not.toContain("Web3 desk status, next test trade, and live-money locks.");
    expect(tradingPage).not.toContain("Supervised test-trade tools");
    expect(tradingPage).not.toMatch(/receipt wall|Open all blockers JSON|flex-nowrap gap-2 overflow-x-auto/i);
    expect(`${paperPage}\n${paperWorkspace}`).not.toMatch(/Suggested paper ideas|Ideas from the saved scan|Saved-scan calls|fake trade|fake wallet|fake money|Practice/i);
  });

  test("GIVEN Paper trading opens on mobile WHEN source copy is checked THEN it names the simulator workflow plainly", () => {
    const paperPage = source("app/paper/page.tsx");
    const paperWorkspace = source("components/paper-workspace.tsx");

    // Redesign: the Paper header is hand-rolled "Simulator" copy now.
    expect(paperPage).toContain(">Simulator</h1>");
    expect(paperPage).toContain("Test calls with simulator dollars before risking anything.");
    expect(paperPage).toContain("Back to Journal");
    expect(paperPage).toContain("Ideas to test");
    expect(paperPage).toContain("Saved market ideas you can try with simulator dollars");
    expect(paperPage).toContain("New test");
    expect(paperPage).toContain("hiddenMobileCount");
    expect(paperPage).toContain("index >= 2 ? \"hidden sm:block\" : \"\"");
    expect(paperPage).toContain("more ideas appear on wider screens");
    expect(paperPage).not.toContain("showSuggestions: false");
    expect(paperPage).not.toContain('className: "hidden sm:block"');
    expect(paperPage.indexOf("<PaperWorkspace")).toBeGreaterThan(-1);
    expect(paperPage.indexOf("<MasterMoldPaperIdeas")).toBeGreaterThan(-1);
    expect(paperPage.indexOf("<PaperWorkspace")).toBeLessThan(paperPage.indexOf("<MasterMoldPaperIdeas"));
    expect(paperWorkspace).toContain("Paper trading only. Compare the result after the close date.");
    expect(paperWorkspace).toContain("Nothing here places a real trade.");
    expect(paperWorkspace).toContain("Simulator dollars reserved until the close date.");
    expect(paperWorkspace).toContain("Test a paper trade");
    expect(paperWorkspace).toContain('window.location.hash === "#paper-trade-form"');
    expect(paperWorkspace).toContain("open={open}");
    expect(paperWorkspace).toContain('onToggle={(event) => setOpen(event.currentTarget.open)}');
    expect(paperWorkspace).toContain("Choose the asset, direction, amount, and reason only when you are ready to test.");
    expect(paperWorkspace.indexOf("<PaperAccountPanel")).toBeGreaterThan(-1);
    expect(paperWorkspace.indexOf("<PaperTradeForm")).toBeGreaterThan(-1);
    expect(paperWorkspace.indexOf("<ActiveRoundPanel")).toBeGreaterThan(-1);
    expect(paperWorkspace.indexOf("<ActiveRoundPanel")).toBeLessThan(paperWorkspace.indexOf("<PaperTradeForm"));
    expect(paperWorkspace.indexOf("<PaperTradeForm")).toBeLessThan(paperWorkspace.indexOf("<PaperAccountPanel"));
    expect(paperWorkspace.indexOf("<PaperAccountPanel")).toBeLessThan(paperWorkspace.indexOf("<RoundScorePanel"));
    expect(paperWorkspace.indexOf("<ActiveRoundPanel")).toBeLessThan(paperWorkspace.indexOf("<RoundScorePanel"));
    expect(paperWorkspace.indexOf("<ActiveRoundPanel")).toBeLessThan(paperWorkspace.indexOf("<RoundHistory"));
    expect(paperWorkspace.indexOf("<PaperTradeForm")).toBeLessThan(paperWorkspace.indexOf("<RoundHistory"));
    expect(paperWorkspace).toContain('className="order-1 space-y-3 sm:space-y-5 lg:col-start-1 lg:row-start-1"');
    expect(paperWorkspace).toContain('className="order-2 space-y-3 sm:space-y-5 lg:sticky lg:top-6 lg:col-start-2 lg:row-span-2 lg:row-start-1"');
    expect(paperWorkspace).toContain('className="order-3 space-y-3 sm:space-y-5 lg:col-start-1 lg:row-start-2"');
    expect(paperWorkspace).toContain('aria-labelledby="active-paper-round-title" className="space-y-2 sm:space-y-4"');
    expect(paperWorkspace).toContain('className="mt-1 hidden text-sm leading-6 text-outline sm:block"');
    expect(paperWorkspace).toContain('className="space-y-2 p-3 pt-0 sm:space-y-5 sm:p-5 sm:pt-0"');
    expect(paperWorkspace).toContain("grid gap-2 text-sm min-[360px]:grid-cols-2 sm:gap-3");
    expect(paperWorkspace).toContain("No simulator tests submitted for this window.");
    expect(paperWorkspace).toContain("data-paper-account-compact");
    expect(paperWorkspace).toContain("mt-2 grid grid-cols-3 gap-1.5 sm:hidden");
    expect(paperWorkspace).toContain("<CompactAccountMetric label=\"Start\"");
    expect(paperWorkspace).toContain("<CompactAccountMetric label=\"Active\"");
    expect(paperWorkspace).toContain("<CompactAccountMetric label=\"Reserved\"");
    expect(paperWorkspace).toContain("mt-3 hidden grid-cols-2 gap-3 sm:grid");
    expect(paperWorkspace).toContain("compact?: boolean;");
    expect(paperWorkspace).toContain("<RoundScorePanel round={latestCompletedRound} compact />");
    expect(paperWorkspace).toContain('aria-labelledby="round-history-title" className="space-y-2 sm:space-y-4"');
    expect(paperWorkspace).toContain("grid grid-cols-3 gap-1.5 sm:gap-3");
    expect(paperWorkspace).toContain("block text-sm font-semibold");
    expect(paperWorkspace).toContain("Paper trades use this simulator balance only. No connected account is touched.");
    expect(paperWorkspace).toContain("mt-1 hidden text-sm leading-5 text-outline sm:block");
    expect(`${paperPage}\n${paperWorkspace}`).not.toMatch(/Suggested paper ideas|Ideas from the saved scan|Saved-scan calls|fake trade|fake wallet|fake money|Practice/i);
  });

  test("GIVEN Today explains its inputs WHEN source copy is checked THEN sources are visible without overclaiming live data", () => {
    // Redesign: Today is a 90-second brief. The input drawer / source trail /
    // proof lines went away; honesty now lives in the pulse line, the dated
    // "report saved" line, refreshed-only movers, and plain empty states.
    const today = source("app/page.tsx");
    const refresh = source("components/today-memory-refresh.tsx");

    // The brief is grounded in the saved daily report, dated on screen.
    expect(today).toContain("getLatestDailyReport");
    expect(today).toContain("ensureDailyReportAutoRefresh");
    expect(today).toContain("report saved");
    expect(today).toContain('data-testid="today-pulse"');
    expect(today).toContain('<DailyReportRefreshButton variant="ghost" />');
    // Movers only show rows the market source actually refreshed.
    expect(today).toContain('data-testid="today-movers"');
    expect(today).toContain('row.daily_move_pct !== null && row.status === "refreshed"');
    // Empty states say plainly when nothing is saved or pending.
    expect(today).toContain("No report saved yet for today. Refresh to read the portfolio and market now.");
    expect(today).toContain("Nothing needs a decision right now.");
    expect(today).toContain("No unreviewed activity.");
    // The page label only claims a personal portfolio when provenance is personal.
    expect(today).toContain(
      'portfolio.provenance.label === "Manual portfolio" || portfolio.provenance.label === "Imported portfolio"',
    );
    expect(today).toContain("<AppShell dataMode={productProvenanceLabel(pageDataMode)}>");
    // Memory refresh stays embedded (quiet utility); chat lives in the launcher.
    expect(today).toContain('id="today-chat"');
    expect(today).toContain("<TodayMemoryRefresh compact />");
    expect(today).toContain("<TodayReadTimer />");
    expect(refresh).toContain('/api/brain/initialize');
    expect(refresh).toContain("Update chat memory");
    expect(refresh).toContain("Done. Chat now remembers this view.");
    expect(refresh).toContain("Could not update chat memory.");
    // Redesign: memory upkeep is a quiet text button (44px floor, compacting).
    expect(refresh).toContain("min-h-11 gap-1.5 px-2 text-xs");
    expect(`${today}\n${refresh}`).not.toMatch(/live market scan|synced portfolio|real-time portfolio|always-on scan|Useful today|broad market\/news|does not read broad market|Run a market scan|Load a market scan|Wait for the next market scan/i);
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
    expect(source("app/page.tsx")).not.toContain("Today context routes");
    // Redesign: the top-idea card left Today; each recommendation line opens the
    // surface where the call can be reviewed and saved.
    expect(source("app/page.tsx")).toContain("Worth your attention");
    expect(source("app/page.tsx")).toContain("href={recommendation.href}");
    expect(save).toContain("plainSourceLabel(source)");
    expect(save).toContain('if (source === "Engine output") return "Saved market read";');
    expect(save).toContain("...sourceNotes.slice(0, 3)");
    expect(save).toContain("Saved before the outcome for later review.");
    expect(save).toContain("Adds this idea to the Decision journal before the result is known.");
    expect(`${card}\n${save}`).not.toMatch(/P&L|trade signal/i);
  });

  test("GIVEN Today ranks ideas for a portfolio WHEN source copy is checked THEN focus order uses visible exposure first", () => {
    // Redesign: exposure-first ordering moved from Today's local card sort into
    // getPortfolioRecommendations, which Today renders top-5.
    const today = source("app/page.tsx");
    const card = source("components/briefing-card.tsx");
    const recommendations = source("src/db/portfolio-recommendations.ts");

    expect(today).toContain("getPortfolioRecommendations(asOf, 5)");
    expect(recommendations).toContain(".sort((a, b) => recommendationPriority(a) - recommendationPriority(b))");
    expect(recommendations).toContain("const weightBoost = recommendation.portfolio_weight_pct === null ? 100 : -recommendation.portfolio_weight_pct;");
    expect(recommendations).toContain("% of the visible portfolio");
    expect(source("lib/plain-finance-copy.ts")).toContain("$1 moved up; check the bear case before adding risk");
    // "picture is mixed" may appear inside plain-finance-copy translation
    // patterns; only emitted copy strings must avoid it.
    expect(source("lib/plain-finance-copy.ts")).toContain('is moving up, but the picture is mixed\\b/gi');
    expect(source("lib/plain-finance-copy.ts")).not.toMatch(/Focus first|"[^"\n]*picture is mixed|urgent alert:/i);
    expect(card).toContain("Focus {rank}");
    expect(card).not.toContain("Rank {rank}");
  });

  test("GIVEN Settings connection cards render WHEN source copy is checked THEN setup is sectioned and Web3 details stay hidden", () => {
    // Redesign: the settings hub + integrations pages merged into one flat page
    // with plain sections; Web3 internals stay behind a Technical details toggle.
    const settingsPage = source("app/settings/page.tsx");
    const input = source("components/integration-key-input.tsx");
    const integrations = source("src/db/integrations.ts");
    const imports = source("src/db/portfolio-imports.ts");

    expect(settingsPage).toContain("Choose what to connect. Nothing here places trades, signs transactions, or moves funds.");
    expect(settingsPage).toContain("New here?");
    expect(settingsPage).toContain('id="connections"');
    expect(settingsPage).toContain('id="profile"');
    expect(settingsPage).toContain('id="chat"');
    expect(settingsPage).toContain('id="autopilot"');
    expect(settingsPage).toContain('id="safety"');
    expect(settingsPage).toContain('id="health"');
    expect(settingsPage.indexOf('id="connections"')).toBeLessThan(settingsPage.indexOf('id="profile"'));
    expect(settingsPage.indexOf('id="autopilot"')).toBeLessThan(settingsPage.indexOf('id="safety"'));
    expect(settingsPage).toContain('import { MonarchMcpPanel } from "@/components/monarch-mcp-panel";');
    expect(settingsPage).toContain("<MonarchMcpPanel");
    expect(source("components/monarch-mcp-panel.tsx")).toContain("Test MCP connection");
    expect(source("components/monarch-mcp-panel.tsx")).toContain("Sync Monarch now");
    expect(source("app/api/portfolio-brain/monarch/route.ts")).toContain("monarch-mcp-portfolio-brain");
    expect(source("app/api/portfolio-brain/monarch/test/route.ts")).toContain("testMonarchMcpConnection");
    expect(source("app/api/portfolio-brain/monarch/sync/route.ts")).toContain("syncMonarchMcpPortfolio");
    expect(source("src/db/investment-awareness.ts")).toContain("Robinhood and brokerages via SnapTrade");
    expect(source("src/db/investment-awareness.ts")).toContain("buildInvestmentIntegrationPlan");
    expect(source("src/db/investment-awareness.ts")).toContain("Brokerage fallback via Plaid Investments");
    expect(source("src/db/investment-awareness.ts")).toContain("Automatic updates are not live yet");
    expect(source("app/api/investment-sync/status/route.ts")).toContain("integration_plan");
    expect(source("app/api/investment-sync/status/route.ts")).toContain("buildInvestmentRealtimePlan");
    expect(source("app/api/investment-sync/status/route.ts")).toContain("live_trading_boundary");
    // Web3 internals stay hidden until the Technical details toggle opens.
    expect(settingsPage).toContain("Technical details");
    expect(settingsPage.indexOf("Technical details")).toBeGreaterThan(settingsPage.indexOf('id="autopilot"'));
    expect(settingsPage).toContain("<details");
    expect(settingsPage).toContain("Stays in this browser");
    expect(settingsPage).toContain("Sent to this local app");
    expect(settingsPage).toContain("Can leave this app");
    expect(settingsPage).toContain("Never sent by this app");
    expect(settingsPage).toContain("No account holdings imported yet. Check account access, then press Import holdings.");
    expect(settingsPage).not.toMatch(/SettingsWeb3CredentialConsole|first funded canary|credential wall|receipt wall/i);
    expect(input).toContain("Import holdings");
    expect(input).toContain("Test read-only access");
    expect(integrations).toContain("Reads");
    expect(imports).toContain('event: "portfolio_import"');
  });

  test("GIVEN Settings connection cards render WHEN source copy is checked THEN import is explicit and read-only", () => {
    // Redesign: the merged flat /settings page carries the read-only import and
    // privacy boundaries directly.
    const settingsPage = source("app/settings/page.tsx");
    const tradingPage = source("app/trading/page.tsx");
    const input = source("components/integration-key-input.tsx");
    const integrations = source("src/db/integrations.ts");
    const imports = source("src/db/portfolio-imports.ts");

    expect(settingsPage).toContain("Read-only portfolio sources.");
    expect(settingsPage).toContain("Manual holdings are often the fastest first setup");
    expect(settingsPage).toContain("Stays in this browser");
    expect(settingsPage).toContain("Sent to this local app");
    expect(settingsPage).toContain("Can leave this app");
    expect(settingsPage).toContain("Never sent by this app");
    expect(settingsPage).toContain("Only the action you choose can contact an outside service");
    expect(settingsPage).toContain("live chat sends the question plus visible app context");
    expect(settingsPage).toContain("selected chat service");
    expect(settingsPage).not.toContain("selected chat provider");
    expect(settingsPage).toContain("One-time import; import again for current balances.");
    expect(source("components/monarch-mcp-panel.tsx")).toContain("Connect Monarch through MCP, test read-only access");
    expect(source("components/monarch-mcp-panel.tsx")).toContain("Read-only scope");
    expect(source("components/monarch-mcp-panel.tsx")).toContain("sync-monarch-mcp");
    expect(integrations).toContain("Brokerages via SnapTrade");
    expect(integrations).toContain("Coinbase read-only");
    expect(integrations).toContain("Web3 wallets via Zerion");
    expect(settingsPage).toContain("Master Mold has no order endpoint, cannot sign transactions, and never asks for private wallet keys.");
    expect(settingsPage).not.toMatch(/SettingsWeb3CredentialConsole|credential wall|receipt wall/i);
    expect(input).toContain("Import holdings");
    expect(input).toContain("Test read-only access");
    expect(integrations).toContain("Reads");
    expect(imports).toContain('event: "portfolio_import"');
    expect(tradingPage).toContain("Live money stays locked");
  });

  test("GIVEN public privacy docs guide the repo WHEN source copy is checked THEN local-only boundaries are explicit", () => {
    const privacy = source("docs/PRIVACY.md");

    expect(privacy).toContain("user data is local by default");
    expect(privacy).toContain(".data/");
    expect(privacy).toContain("docs/private/");
    expect(privacy).toContain("npm run privacy:audit");
    expect(privacy).not.toContain(["Chris", "Operator"].join(" "));
    expect(privacy).not.toMatch(/demo\.local|wallet-balance-fragment/i);
  });

  test("GIVEN repo documentation describes current state WHEN source copy is checked THEN public copy stays plain and truthful", () => {
    const readme = source("README.md");
    const reviewCapabilities = source("src/product/capabilities.ts");

    expect(readme).toContain("synthetic sample data only");
    expect(readme).toContain("does not include a live portfolio");
    expect(readme).toContain("npm run privacy:audit");
    expect(readme).toContain("A formal open-source license has not been");
    expect(reviewCapabilities).toContain("Long-horizon live/out-of-sample forward evaluation with external baselines");
    expect(readme).not.toMatch(/real ~?\$?\d{2,4}(?:[.,]\d+)?k\b|demo\.local|docs\/STATUS/i);
    expect(readme).not.toContain(["docs", "ref"].join("/"));
  });

  test("GIVEN Settings shows Chat context WHEN source copy is checked THEN schedule status stays truthful", () => {
    // Redesign: the settings-open schedule check left with the old integrations
    // page; the truthful schedule copy stays pinned in the brain module and its
    // API route, and Today keeps the explicit chat-memory refresh control.
    const panel = source("components/brain-initialization-panel.tsx");
    const brain = source("src/db/brain.ts");
    const scheduleRoute = source("app/api/brain/schedule/route.ts");

    expect(source("app/settings/page.tsx")).toContain('export const dynamic = "force-dynamic"');
    expect(scheduleRoute).toContain("runBrainScheduleCheck");
    expect(scheduleRoute).toContain('typeof body.trigger === "string" ? body.trigger : "manual"');
    expect(source("app/page.tsx")).toContain("<TodayMemoryRefresh compact />");
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
    expect(panel).toContain("Today still uses the visible portfolio, activity, and saved read.");
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
    // Redesign: the Import issues list now lives on the flat /settings page
    // (Import status card); Portfolio's header names the imported snapshot count.
    const portfolioPage = source("app/portfolio/page.tsx");
    const imports = source("src/db/portfolio-imports.ts");
    const portfolio = source("src/db/portfolio.ts");
    const integrationInput = source("components/integration-key-input.tsx");
    const settingsPage = source("app/settings/page.tsx");

    expect(portfolioPage).toContain("imported holdings · read-only snapshot");
    expect(settingsPage).toContain("Import issues");
    expect(settingsPage).toContain("snapshot.issue_count > 0");
    expect(settingsPage).toContain("{issue.reason}");
    // Compact redesign: metric boxes became one inline status line.
    expect(settingsPage).toContain("{snapshot.skipped_count} skipped");
    expect(settingsPage).toContain("formatSettingsTime(snapshot.last_imported_at ?? snapshot.last_checked_at)");
    expect(settingsPage).toContain("could not add every holding");
    expect(settingsPage).toContain("Open the issue list before relying on the total.");
    expect(imports).toContain('event: "portfolio_import"');
    expect(imports).toContain("Account source did not return a usable price.");
    expect(imports).toContain("Account source did not return a usable amount.");
    expect(portfolio).toContain("latestPortfolioImportEvent");
    expect(portfolio).toContain("Some account entries were skipped because price or amount was missing.");
    expect(integrationInput).toContain("not imported because price or amount was missing");
    expect(`${settingsPage}\n${integrationInput}\n${imports}`).not.toMatch(/Skipped rows|every row|Rows without|provider rows|provider returned|Provider did not return|row was|rows were/i);
  });
});
