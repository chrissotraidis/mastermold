import { buildDaemonTickBody, runWeb3AutonomousDaemon } from "./web3-autonomous-daemon.mjs";
import { buildSupervisorReceipt, runWeb3DaemonSupervisor } from "./web3-daemon-supervisor.mjs";
import { buildForwardRepeatReport, runWeb3AutonomousForwardRun } from "./web3-autonomous-forward-run.mjs";
import { buildLiveLandingDrillReport } from "./web3-live-landing-drill.mjs";
import { buildLiveCapitalPreflightReport } from "./web3-live-capital-preflight.mjs";
import { buildPaperPromotionGuardReport } from "./web3-paper-promotion-guard.mjs";
import { buildPortfolioMirrorGuardReport } from "./web3-portfolio-mirror-guard.mjs";
import { buildPromotedPaperAutopilotReport } from "./web3-promoted-paper-autopilot.mjs";
import { buildSettlementReconciliationReport } from "./web3-settlement-reconciliation.mjs";

const baseUrl = (process.env.WEB3_TRADING_BASE_URL ?? "http://localhost:4010").replace(/\/$/, "");

function fail(message, detail) {
  const suffix = detail === undefined ? "" : `\n${typeof detail === "string" ? detail : JSON.stringify(detail, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}

function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}

async function readJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    fail(`Expected JSON from ${response.url || "response"}.`, text.slice(0, 500));
  }
}

async function request(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...(init.body === undefined ? {} : { "content-type": "application/json" }),
      ...init.headers,
    },
    signal: AbortSignal.timeout(15_000),
  });
  return response;
}

async function postTrading(body) {
  const response = await request("/api/web3-trading", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return { response, payload: await readJson(response) };
}

async function main() {
  const healthResponse = await request("/api/health");
  const health = await readJson(healthResponse);
  assert(healthResponse.status === 200, "Health endpoint should remain available.", { status: healthResponse.status, health });
  assert(health.status === "ok", "Health endpoint should preserve the ok status.", health);
  assert(health.web3_daemon_supervisor, "Health endpoint should expose Web3 daemon supervisor health.", health);
  assert(["absent", "running", "idle", "completed", "circuit-open", "error"].includes(health.web3_daemon_supervisor.status), "Supervisor health should return a known status.", health.web3_daemon_supervisor);
  assert(health.web3_daemon_supervisor.live_execution_permission === "blocked", "Supervisor health should keep live execution blocked.", health.web3_daemon_supervisor);
  assert(health.web3_daemon_supervisor.wallet_mutation_permission === "blocked", "Supervisor health should keep wallet mutation blocked.", health.web3_daemon_supervisor);
  assert(!("receipt_path" in health.web3_daemon_supervisor), "Supervisor health should not expose local receipt paths.", health.web3_daemon_supervisor);
  assert(typeof health.web3_daemon_supervisor.net_pnl_usd === "number", "Supervisor health should expose sanitized paper PnL.", health.web3_daemon_supervisor);
  assert(typeof health.web3_daemon_supervisor.max_drawdown_usd === "number", "Supervisor health should expose sanitized drawdown.", health.web3_daemon_supervisor);
  assert(health.web3_production_supervisor?.mode === "web3-production-supervisor-readiness", "Health endpoint should expose production supervisor readiness.", health.web3_production_supervisor);
  assert(health.web3_production_supervisor.live_execution_permission === "blocked", "Production supervisor readiness should keep live execution blocked.", health.web3_production_supervisor);
  assert(health.web3_production_supervisor.wallet_mutation_permission === "blocked", "Production supervisor readiness should keep wallet mutation blocked.", health.web3_production_supervisor);
  assert(health.web3_production_supervisor.can_satisfy_process_gate === false, "Production supervisor readiness should not self-satisfy the process gate.", health.web3_production_supervisor);
  assert(!("receipt_path" in health.web3_production_supervisor), "Production supervisor readiness should not expose local receipt paths.", health.web3_production_supervisor);
  assert(health.web3_promoted_paper_autopilot, "Health endpoint should expose promoted paper autopilot health.", health);
  assert(["absent", "blocked", "target-hit", "completed", "running", "paper-guarded", "not-started"].includes(health.web3_promoted_paper_autopilot.status), "Promoted paper autopilot health should return a known status.", health.web3_promoted_paper_autopilot);
  assert(health.web3_promoted_paper_autopilot.live_execution_permission === "blocked", "Promoted paper autopilot health should keep live execution blocked.", health.web3_promoted_paper_autopilot);
  assert(health.web3_promoted_paper_autopilot.wallet_mutation_permission === "blocked", "Promoted paper autopilot health should keep wallet mutation blocked.", health.web3_promoted_paper_autopilot);
  assert(!("receipt_path" in health.web3_promoted_paper_autopilot), "Promoted paper autopilot health should not expose local receipt paths.", health.web3_promoted_paper_autopilot);
  assert(typeof health.web3_promoted_paper_autopilot.net_pnl_usd === "number", "Promoted paper autopilot health should expose sanitized paper PnL.", health.web3_promoted_paper_autopilot);
  assert(typeof health.web3_promoted_paper_autopilot.posted_ticks === "number", "Promoted paper autopilot health should expose sanitized posted ticks.", health.web3_promoted_paper_autopilot);
  assert(typeof health.web3_promoted_paper_autopilot.run_count === "number", "Promoted paper autopilot health should expose sanitized history count.", health.web3_promoted_paper_autopilot);
  assert(typeof health.web3_promoted_paper_autopilot.total_net_pnl_usd === "number", "Promoted paper autopilot health should expose cumulative history PnL.", health.web3_promoted_paper_autopilot);
  assert(Array.isArray(health.web3_promoted_paper_autopilot.recent_runs), "Promoted paper autopilot health should expose compact recent run history.", health.web3_promoted_paper_autopilot);
  assert(["learning", "extend-paper", "continue-paper", "tighten-paper", "protect-paper", "stand-down"].includes(health.web3_promoted_paper_autopilot.run_memory_status), "Promoted paper autopilot health should expose a known run-memory status.", health.web3_promoted_paper_autopilot);
  assert(typeof health.web3_promoted_paper_autopilot.recommended_supervisor_round_cap === "number", "Promoted paper autopilot health should expose a memory-based supervisor round cap.", health.web3_promoted_paper_autopilot);
  assert(health.web3_profit_proof?.mode === "web3-profit-proof-readiness", "Health endpoint should expose Web3 profit-proof readiness.", health.web3_profit_proof);
  assert(health.web3_profit_proof.live_execution_permission === "blocked", "Profit-proof readiness should keep live execution blocked.", health.web3_profit_proof);
  assert(health.web3_profit_proof.wallet_mutation_permission === "blocked", "Profit-proof readiness should keep wallet mutation blocked.", health.web3_profit_proof);
  assert(Array.isArray(health.web3_profit_proof.checks) && health.web3_profit_proof.checks.some((check) => check.id === "target-hit-rate"), "Profit-proof readiness should expose target-hit evidence.", health.web3_profit_proof);

  const launchChecklistResponse = await request("/api/web3-launch-checklist?scenario=breakout&source=sample&account=persistent");
  const launchChecklist = await readJson(launchChecklistResponse);
  assert(launchChecklistResponse.status === 200, "Web3 launch checklist endpoint should return a readiness contract.", { status: launchChecklistResponse.status, launchChecklist });
  assert(launchChecklist.mode === "web3-autonomy-launch-checklist", "Web3 launch checklist should expose the expected mode.", launchChecklist);
  assert(["paper-operational", "paper-scale-ready", "paper-memory-gated", "live-gated", "manual-live-review", "blocked"].includes(launchChecklist.status), "Web3 launch checklist should return a known status.", launchChecklist);
  assert(typeof launchChecklist.readiness_score === "number", "Web3 launch checklist should expose a numeric readiness score.", launchChecklist);
  assert(typeof launchChecklist.paper_scale_permitted === "boolean", "Web3 launch checklist should expose paper-scale permission.", launchChecklist);
  assert(typeof launchChecklist.live_review_permitted === "boolean", "Web3 launch checklist should expose live-review permission.", launchChecklist);
  assert(launchChecklist.real_capital_blocked === true, "Web3 launch checklist should keep real capital blocked in the default local build.", launchChecklist);
  assert(typeof launchChecklist.completed_proof_count === "number", "Web3 launch checklist should expose completed proof count.", launchChecklist);
  assert(typeof launchChecklist.remaining_work_count === "number", "Web3 launch checklist should expose remaining work count.", launchChecklist);
  assert(Array.isArray(launchChecklist.items), "Web3 launch checklist should expose proof items.", launchChecklist);
  assert(["paper-profit", "promoted-memory", "market-feed", "route-proof", "execution-quality", "custody-policy", "signer", "relay", "settlement", "kill-switch", "process-supervision", "provider-credentials", "wallet-accounting", "profit-proof", "live-boundary"].every((id) => launchChecklist.items.some((item) => item.id === id)), "Web3 launch checklist should cover paper, market, execution, custody, settlement, production, wallet accounting, profit proof, and live-boundary proofs.", launchChecklist);
  assert(Array.isArray(launchChecklist.remaining_work), "Web3 launch checklist should expose structured remaining work.", launchChecklist);
  assert(launchChecklist.profit_proof_readiness?.mode === "web3-profit-proof-readiness", "Web3 launch checklist should expose profit-proof readiness.", launchChecklist);
  assert(launchChecklist.profit_proof_readiness.live_execution_permission === "blocked", "Checklist profit-proof readiness should keep live execution blocked.", launchChecklist.profit_proof_readiness);
  assert(launchChecklist.profit_proof_readiness.wallet_mutation_permission === "blocked", "Checklist profit-proof readiness should keep wallet mutation blocked.", launchChecklist.profit_proof_readiness);
  assert(launchChecklist.remaining_work_count === launchChecklist.remaining_work.length, "Web3 launch checklist remaining work count should match remaining work rows.", launchChecklist);
  assert(launchChecklist.completed_proof_count + launchChecklist.remaining_work_count === launchChecklist.items.length, "Web3 launch checklist proof counts should reconcile.", launchChecklist);
  assert(launchChecklist.remaining_work.every((item) => ["required", "review"].includes(item.priority) && item.next_action.length > 0), "Web3 launch checklist remaining work rows should include priority and next action.", launchChecklist);

  const page = await request("/trading");
  const html = await page.text();
  assert(page.status === 200, "Trading page should render.", { status: page.status });
  assert(html.includes("Web3 Autopilot"), "Trading page should include the distinct Web3 Autopilot title.");
  assert(html.includes("Autonomous Web3 trading desk"), "Trading page should describe the autonomous Web3 trading desk.");
  assert(html.includes("Autonomous command"), "Trading page should expose the compact autonomous command deck.");
  assert(html.includes("Autonomous trading command deck"), "Trading page should label the new first-screen command deck.");
  assert(html.includes("Promoted run"), "Trading page should expose the promoted paper autopilot control.");
  assert(html.includes("Promoted paper autopilot"), "Trading page should expose persisted promoted autopilot health.");
  assert(html.includes("Promoted run memory"), "Trading page should expose promoted paper autopilot history memory.");
  assert(html.includes("Memory gate"), "Trading page should expose the promoted autopilot memory gate.");
  assert(html.includes("Round cap"), "Trading page should expose the memory-based promoted supervisor cap.");
  assert(html.includes("Launch checklist"), "Trading page should expose the Web3 autonomy launch checklist.");
  assert(html.includes("Web3 autonomy launch checklist"), "Trading page should render the launch checklist as a first-screen cockpit surface.");
  assert(html.includes("Web3 launch checklist receipt"), "Trading page should expose an accessible launch checklist receipt.");
  assert(html.includes("real-cap blocked"), "Trading page should make the real-capital boundary visible in the launch checklist.");
  assert(html.includes("Actually left"), "Trading page should expose what is actually left for Web3 launch readiness.");
  assert(html.includes("actual remaining gates"), "Trading page should summarize the remaining launch gates.");
  assert(html.includes("Dry-run signer"), "Trading page should expose a safe dry-run signer setup action in the launch checklist.");
  assert(html.includes("Order rehearsal"), "Trading page should expose a safe live DEX dry-run order rehearsal action in the launch checklist.");
  assert(html.includes("Dry-run signer and order rehearsal only scope public-key rehearsal"), "Trading page should disclose the dry-run signer and order boundary.");
  assert(html.includes("Wallet net worth curve"), "Trading page should render the first-screen wallet net worth curve.");
  assert(html.includes("Autonomous wallet net worth chart"), "Trading page should render the state-driven wallet performance chart.");
  assert(html.includes("Active price action"), "Trading page should render the active target price-action cockpit before the long workbench.");
  assert(html.includes("Active target price action chart"), "Trading page should expose a first-screen momentum, flow, stop, and target chart.");
  assert(html.includes("Profit loop"), "Trading page should render the high-frequency profit loop in the command deck.");
  assert(html.includes("High frequency profit loop chart"), "Trading page should expose a first-screen profit velocity and throttle chart.");
  assert(html.includes("trades/min cap"), "Trading page should show the next-minute trade-rate cap before the long workbench.");
  assert(html.includes("High-signal coin race"), "Trading page should expose ranked memecoin opportunities before the long workbench.");
  assert(html.includes("Discovery delta"), "Trading page should summarize live boost/profile/CTO/ad discovery changes without adding another first-screen strip.");
  assert(html.includes("HFT reaction"), "Trading page should expose the next-few-seconds autonomous HFT reaction loop before the long workbench.");
  assert(html.includes("Autonomous HFT reaction pressure chart"), "Trading page should chart buy, sell, route, wallet, landing, and run pressure before the long workbench.");
  assert(html.includes("HFT reaction loop receipt"), "Trading page should expose a review receipt for reaction-loop, landing, run-envelope, and live-gate status.");
  assert(html.includes("Session ticket"), "Trading page should expose the next bounded autonomous paper session ticket before the long workbench.");
  assert(html.includes("Autonomous session ticket chart"), "Trading page should chart session plan, wake plan, order ticket, route proof, and paper-apply readiness before the long workbench.");
  assert(html.includes("Autonomous session ticket receipt"), "Trading page should expose a review receipt for session caps, budgets, order boundary, and live-gate status.");
  assert(html.includes("Profit proof"), "Trading page should expose whether the autonomous paper loop is making money before the long workbench.");
  assert(html.includes("Autonomous profit accountability chart"), "Trading page should chart paper PnL, win rate, fills, loop feedback, and outcome memory before the long workbench.");
  assert(html.includes("Profit accountability loop receipt"), "Trading page should expose a review receipt for paper profit accountability, loop feedback, outcome memory, and live-gate status.");
  assert(html.includes("Profit integrity circuit"), "Trading page should expose the closed-loop profit integrity permission before the long workbench.");
  assert(html.includes("Execution quality"), "Trading page should expose execution quality before the long workbench.");
  assert(html.includes("Autonomous execution quality gate chart"), "Trading page should chart execution, route cost, landing path, MEV/slippage, and token safety before the long workbench.");
  assert(html.includes("Execution quality gate receipt"), "Trading page should expose a review receipt for execution-quality, route, MEV, safety, and live-gate status.");
  assert(html.includes("Decision owner"), "Trading page should expose the autonomous layer that owns the next paper/protect decision before the long workbench.");
  assert(html.includes("Autonomous decision owner chart"), "Trading page should chart directive, queue, pressure, ticket, exit, and proof ownership before the long workbench.");
  assert(html.includes("Autonomous decision owner receipt"), "Trading page should expose a review receipt for autonomous decision ownership and paper/live boundaries.");
  assert(html.includes("Position reaction"), "Trading page should expose held-position reaction decisions before the long workbench.");
  assert(html.includes("Autonomous held position reaction chart"), "Trading page should chart held-position action pressure, release pressure, and risk before the long workbench.");
  assert(html.includes("Position reaction tape receipt"), "Trading page should expose a review receipt for the position reaction tape.");
  assert(html.includes("Proof queue"), "Trading page should expose source, freshness, candle, route, wallet, and live-gate proof before the long workbench.");
  assert(html.includes("Autonomous proof queue chart"), "Trading page should render a first-screen proof queue chart instead of a duplicate executor panel.");
  assert(html.includes("Autonomous proof queue receipt"), "Trading page should expose a review receipt for the proof queue wiring.");
  assert(html.includes("Autonomous command deck receipt"), "Trading page should expose a review receipt for the compact command deck.");
  assert(html.includes("Run autonomous now decision"), "Trading page should expose one primary recommended autonomous action.");
  assert(html.includes("Trading cockpit view"), "Trading page should keep Copilot, Market, Portfolio, and Wiring focus views.");
  assert(html.includes("Expert receipts"), "Trading page should keep deep diagnostics behind an explicit disclosure.");
  assert(html.includes("Quick agent controls are armed"), "Trading page should surface the compact autonomous trading cockpit state.");
  assert(html.includes("Quick autonomous controls"), "Trading page should expose always-visible quick autonomous controls.");
  assert(html.includes("Daemon supervisor"), "Trading page should expose the external daemon supervisor status near the autonomous cockpit.");
  assert(html.includes("Web3 daemon supervisor receipt"), "Trading page should expose an accessible supervisor receipt.");
  assert(html.includes("Refresh read"), "Trading page should let the operator refresh the autonomous market read from the cockpit.");
  assert(html.includes("Proof + tick") || html.includes("Run tick"), "Trading page should expose a backend autonomous loop tick control even when fresh buys are blocked.");
  assert(html.includes("Run minute"), "Trading page should expose a next-minute high-frequency paper loop from the first screen.");
  assert(html.includes("Auto watch"), "Trading page should expose a browser-local autonomous watch scheduler control.");
  assert(html.includes("auto watch off"), "Trading page should disclose whether the browser-local watch loop is running.");
  assert(html.includes("Auto decision"), "Trading page should disclose the browser-local auto-watch minute, cycle, or sprint decision.");
  assert(
    ["auto minute", "auto single minute", "auto protect minute", "auto cycle", "auto sprint", "auto protect", "auto refresh", "auto blocked", "auto cooldown"].some((label) => html.includes(label)),
    "Trading page should show the chosen auto-watch mode.",
  );
  assert(html.includes("Source refresh"), "Trading page should disclose that Auto watch refreshes the selected market source before backend action.");
  assert(
    html.includes("backend loop tick owns trade and protect actions") ||
      html.includes("backend loop owns trade and protect actions"),
    "Trading page should explain that backend loop tick owns Auto watch trade/protect actions.",
  );
  assert(html.includes("Auto watch backend authority receipt"), "Trading page should expose the backend-authority receipt for Auto watch.");
  assert(html.includes("Rotation director"), "Trading page should expose the autonomous rotate/retarget/protect director.");
  assert(html.includes("Autonomous rotation evidence rows"), "Trading page should show the evidence rows behind the rotation decision.");
  assert(html.includes("Autonomous rotation budgets"), "Trading page should show deploy, release, and edge budgets for rotation.");
  assert(html.includes("Autonomous rotation director receipt"), "Trading page should expose a paper-only receipt for rotation decisions.");
  if (process.env.WEB3_TRADING_LEGACY_UI_SMOKE === "1") {
  assert(html.includes("Net worth curve"), "Trading page should expose the wallet net worth curve before the long cockpit.");
  assert(html.includes("Make-money pulse"), "Trading page should expose the fused make-money pulse before the long cockpit.");
  assert(html.includes("Agent alpha"), "Trading page should expose the paper agent alpha benchmark before the long cockpit.");
  assert(html.includes("Alpha feedback"), "Trading page should expose the benchmark-to-action alpha feedback before the long cockpit.");
  assert(html.includes("Profit thesis"), "Trading page should expose the autonomous profit thesis verdict before the long cockpit.");
  assert(html.includes("Profit feedback"), "Trading page should expose first-screen paper PnL and learning feedback before the long cockpit.");
  assert(html.includes("Forward replay"), "Trading page should show replay-gated profit learning before scaling high-frequency paper bursts.");
  assert(html.includes("Autonomous money loop"), "Trading page should group held positions and ranked entries into one first-screen money loop.");
  assert(html.includes("Position watch"), "Trading page should expose first-screen held-position watch pressure before the long cockpit.");
  assert(html.includes("Opportunity rank"), "Trading page should expose the autonomous memecoin opportunity rank before the long cockpit.");
  assert(html.includes("Rank exec"), "Trading page should expose the ranked opportunity execution receipt before the long cockpit.");
  assert(html.includes("Source trust"), "Trading page should explain source trust and refresh timing inside the compact opportunity ranker.");
  assert(html.includes("Pulse money"), "Trading page should show expected pulse profit in the compact wallet strip.");
  assert(html.includes("Window PnL"), "Trading page should expose quick paper PnL before the long cockpit.");
  assert(html.includes("Last cycle"), "Trading page should expose the latest bounded paper-cycle outcome before the long cockpit.");
  assert(html.includes("Held defense"), "Trading page should expose held-position defense pressure in the first cockpit wallet strip.");
  assert(html.includes("Trigger cover"), "Trading page should expose protective trigger coverage in the first cockpit wallet strip.");
  assert(html.includes("Autopilot mission"), "Trading page should expose a concise first-screen autonomous trading mission.");
  assert(html.includes("Autopilot mission control"), "Trading page should label the mission control panel for the autonomous trading loop.");
  assert(html.includes("Autonomous market-to-wallet wiring path"), "Trading page should show one market-to-wallet wiring path instead of repeated execution panels.");
  assert(html.includes("Wallet profit runway and autonomous capital path chart"), "Trading page should render the mission profit runway and capital path chart.");
  assert(html.includes("Autopilot mission receipt"), "Trading page should expose the mission-control receipt for review.");
  assert(html.includes("One-minute loop"), "Trading page should show next-minute high-frequency loop capacity in the mission panel.");
  assert(html.includes("Autopilot mission readout"), "Trading page should consolidate the old paper-loop scoreboard into the mission readout.");
  assert(html.includes("Autopilot mission metrics"), "Trading page should show target, edge, batch, route, candle, and wallet metrics in the mission panel.");
  assert(html.includes("Autonomous market intake plan receipt"), "Trading page should expose the provider intake plan receipt for review.");
  assert(html.includes("Autonomous profit allocation receipt"), "Trading page should expose the closed-loop allocation receipt for review.");
  assert(html.includes("cadence"), "Trading page should show the autonomous loop cadence before the long cockpit.");
  assert(html.includes("Market"), "Trading page should expose a Market focus for hot-candidate analysis.");
  assert(html.includes("Portfolio"), "Trading page should expose a Portfolio focus for held-position and profit management.");
  assert(!html.includes("Autonomous sprint tape"), "Trading page should move hot-candidate sprint tape out of the first-load wallet focus.");
  assert(!html.includes("Autonomous fill learning ledger"), "Trading page should keep fill-learning detail behind the Portfolio focus on first load.");
  assert(!html.includes("Autonomous recent fill contribution and lane attribution chart"), "Trading page should avoid stacking the fill-learning chart into the first-load Copilot view.");
  assert(html.includes("Moonshot-style hot coin signal versus noise chart"), "Trading page should expose the signal/noise chart in the first-load Copilot cockpit.");
  assert(html.includes("Autonomous signal/noise trade decision"), "Trading page should show the signal/noise decision beside wallet performance in the Copilot cockpit.");
  assert(!html.includes("Holding sentry"), "Trading page should move detailed held-position pressure into the Portfolio focus.");
  assert(!html.includes("Autonomous smart exit pressure chart"), "Trading page should keep smart-exit detail behind the Portfolio focus.");
  assert(html.includes("Reset paper"), "Trading page should expose a local paper-account reset control.");
  assert(html.includes("Chart proof"), "Trading page should expose a quick chart-proof action for the autonomous candle gate.");
  assert(html.includes("Autonomous chart proof action receipt"), "Trading page should disclose that chart proof records read-only candle evidence only.");
  assert(html.includes("Autonomous smart tick receipt"), "Trading page should disclose that smart ticks can carry chart proof into backend loop decisions.");
  assert(html.includes("Proof plus tick refreshes the chart gate"), "Trading page should explain the proof-plus-tick backend handoff.");
  assert(html.includes("Auto watch smart tick receipt"), "Trading page should disclose that Auto watch uses smart ticks for candle-gate refresh wakes.");
  assert(html.includes("chart-proof wake can immediately hand the refreshed evidence to the backend loop"), "Trading page should explain that Auto watch no longer waits for a separate later tick after chart proof.");
  assert(html.includes("What is wired"), "Trading page should explain which trading paths are wired.");
  assert(html.includes("Net worth curve"), "Trading page should expose the first-screen wallet net worth curve.");
  assert(html.includes("Autonomous wallet net worth chart"), "Trading page should render the compact first-screen wallet net worth chart.");
  assert(html.includes("Web3 operator focus deck"), "Trading page should replace stacked trading panels with a focused operator deck.");
  assert(html.includes("Trading cockpit view"), "Trading page should expose Copilot, Market, Portfolio, and Wiring cockpit views.");
  assert(html.includes("Web3 operator focus deck receipt"), "Trading page should disclose the active focus deck state.");
  assert(html.includes("Focus deck active") && html.includes("cockpit") && html.includes("wallet equity"), "Trading page should open on the unified Copilot cockpit instead of a long stacked report.");
  assert(!html.includes("Autonomous situation change tape"), "Trading page should keep the market change tape behind the Market focus on first load.");
  assert(!html.includes("Autonomous trap clearance board"), "Trading page should keep trap-clearance detail behind the Market focus on first load.");
  assert(!html.includes("Autonomous trap risk versus chase clearance chart"), "Trading page should avoid stacking the trap-clearance chart into the first-load Copilot view.");
  assert(!html.includes("Autonomous execution runway steps"), "Trading page should move runway steps out of the first-load wallet focus.");
  assert(!html.includes("Autonomous profit target progress chart"), "Trading page should move profit planning into the Command focus.");
  assert(!html.includes("Autonomous operator next six moves"), "Trading page should move next moves into the Command focus.");
  assert(!html.includes("Autonomous command spine"), "Trading page should not repeat the command spine below the first-screen command deck.");
  assert(!html.includes("Autonomous command spine chart"), "Trading page should replace the repeated command forecast chart with the mission runway chart.");
  assert(!html.includes("Autonomous command spine receipt"), "Trading page should keep command-spine receipt detail out of the first-load Copilot stack.");
  assert(!html.includes("Make-money governor"), "Trading page should not stack the old make-money governor under the mission panel.");
  assert(!html.includes("Make-money governor metrics"), "Trading page should consolidate governor metrics into the mission and profit-accountability surfaces.");
  assert(!html.includes("Make-money governor receipt"), "Trading page should keep make-money governor receipts out of first-load Copilot scrolling.");
  assert(html.includes("Autonomous profit authority lane"), "Trading page should expose a compact press/protect/observe profit authority lane.");
  assert(html.includes("Autonomous profit authority metrics"), "Trading page should show edge, lane, wallet, and cap metrics for profit authority.");
  assert(html.includes("Autonomous profit authority receipt"), "Trading page should disclose the profit authority scoreboard for review.");
  assert(html.includes("Autonomous wiring map"), "Trading page should expose a visible autonomous wiring map before the Now action.");
  assert(html.includes("Autonomous signal to wallet pipeline"), "Trading page should show the signal-to-wallet pipeline as a compact visual lane.");
  assert(html.includes("Autonomous wiring map receipt"), "Trading page should disclose how signal, chart, route, paper, wallet, and live gates are wired.");
  assert(html.includes("Final size"), "Trading page should show the active size-governor final paper size before diagnostics.");
  assert(html.includes("Loop permission matrix"), "Trading page should expose a compact first-screen autonomous loop permission matrix.");
  assert(html.includes("Autonomous loop permission matrix chart"), "Trading page should render the autonomous loop gate matrix instead of hiding permission behind receipts.");
  assert(html.includes("Autonomous high-frequency run caps"), "Trading page should show high-frequency fresh-buy, protect-sell, size, and burst caps.");
  assert(html.includes("Tape reaction"), "Trading page should show the situation-aware tape reaction window in the compact loop matrix.");
  assert(html.includes("urgent changes"), "Trading page should disclose urgent tape changes in the loop permission receipt.");
  assert(html.includes("Net worth curve"), "Trading page should surface the autonomous wallet net worth curve in the first cockpit readout.");
  assert(html.includes("Autonomous wallet net worth chart"), "Trading page should render a wallet chart for autonomous paper trading performance.");
  assert(html.includes("make-money pulse"), "Trading page should disclose the fused make-money pulse in the wallet receipt.");
  assert(html.includes("agent alpha"), "Trading page should disclose the paper agent benchmark in the wallet receipt.");
  assert(html.includes("alpha feedback"), "Trading page should disclose the paper alpha feedback loop in the wallet receipt.");
  assert(html.includes("held defense"), "Trading page should disclose held-position defense in the wallet net worth receipt.");
  assert(html.includes("trigger coverage"), "Trading page should disclose protective trigger coverage in the wallet net worth receipt.");
  assert(html.includes("Autonomous loop permission receipt"), "Trading page should expose the autonomous loop permission receipt for review.");
  assert(html.includes("Fast paper loop is cleared") || html.includes("fills max"), "Trading page should summarize whether the fast paper loop can run now.");
  assert(html.includes("Autonomous fill tape"), "Trading page should expose a compact first-screen autonomous fill tape.");
  assert(html.includes("Autonomous recent paper fill tape"), "Trading page should show recent local paper fills before the long diagnostics.");
  assert(html.includes("Autonomous fill tape wallet impact"), "Trading page should tie recent fills to wallet impact in the Copilot cockpit.");
  assert(html.includes("Autonomous fill tape receipt"), "Trading page should disclose the paper-only fill-tape boundary.");
  assert(html.includes("Autonomous now decision"), "Trading page should expose the server-authored now decision in the compact cockpit.");
  assert(html.includes("Autonomous now decision proof stack"), "Trading page should show the now-decision proof stack before the long workbench.");
  assert(html.includes("Autonomous now decision receipt"), "Trading page should expose the now-decision receipt for review.");
  assert(html.includes("Run autonomous now decision"), "Trading page should expose one primary recommended now-decision action.");
  assert(html.includes("Autonomous primary action receipt"), "Trading page should disclose how the primary now-decision action maps to read-only refreshes or bounded paper ticks.");
  assert(html.includes("Autonomous route repair receipt"), "Trading page should disclose whether the route refresh can request a quote or must repair read-only evidence first.");
  assert(html.includes("Live route repair") || html.includes("Repair route read"), "Trading page should label blocked route refreshes as route repair instead of a generic refresh.");
  assert(html.includes("Agent action outcome"), "Trading page should expose immediate after-action accountability in the compact cockpit.");
  assert(html.includes("Agent action outcome metrics"), "Trading page should show wallet, exposure, loop, and proof deltas for the last agent action.");
  assert(html.includes("Agent action outcome receipt"), "Trading page should disclose the before/after agent action outcome for review.");
  assert(html.includes("High-frequency minute loop"), "Trading page should expose the next-minute high-frequency loop summary.");
  assert(html.includes("High-frequency minute loop receipt"), "Trading page should expose the high-frequency minute loop receipt.");
  assert(html.includes("Autonomous action queue receipt"), "Trading page should keep action-queue evidence folded into the command spine receipt.");
  assert(html.includes("launch-blocked buys"), "Trading page should disclose launch-timing gating in the folded action queue receipt.");
  assert(!html.includes("Autonomous action queue cockpit"), "Trading page should not render a separate redundant action queue cockpit on first load.");
  assert(!html.includes("Autonomous ranked action queue chart"), "Trading page should fold ranked action evidence into the command spine instead of stacking another chart.");
  const seededPage = await request("/trading?account=ephemeral");
  const seededHtml = await seededPage.text();
  assert(seededPage.status === 200, "Seeded ephemeral trading page should render.", { status: seededPage.status });
  assert(seededHtml.includes("auto protect minute"), "Seeded ephemeral trading page should expose the protect-minute Auto watch mode.");
  assert(seededHtml.includes("1/m max"), "Seeded ephemeral trading page should show the one-trade next-minute cap.");
  assert(seededHtml.includes("1 queued action"), "Seeded ephemeral trading page should count the ready queue-owned sell as a minute-loop action.");
  assert(seededHtml.includes("Backend loop tick owns the trade/protect action"), "Seeded ephemeral Auto watch reason should route protect-minute decisions through the backend loop tick.");
  assert(seededHtml.includes("Run minute"), "Seeded ephemeral trading page should keep the next-minute run control visible.");
  const livePage = await request("/trading?account=ephemeral&source=live-dex");
  const liveHtml = await livePage.text();
  assert(livePage.status === 200, "Live DEX trading page should render or fall back visibly.", { status: livePage.status });
  if (liveHtml.includes("DEX Screener live")) {
    assert(liveHtml.includes("auto refresh"), "Live DEX trading page should keep Auto watch in read-only refresh mode when market evidence is stale.");
    assert(liveHtml.includes("read-only DEX Screener live evidence"), "Live DEX auto refresh should disclose the read-only evidence refresh.");
  }
  assert(html.includes("Wiring"), "Trading page should expose a Wiring focus for execution readiness.");
  assert(!html.includes("Autonomous execution readiness bridge"), "Trading page should keep execution readiness behind the Wiring focus on first load.");
  assert(!html.includes("Autonomous execution adapter readiness chart"), "Trading page should avoid stacking execution adapter charts on first load.");
  assert(!html.includes("Moonshot-style price action tape chart"), "Trading page should keep price-action tape behind the Market focus on first load.");
  assert(!html.includes("Autonomous opportunity versus risk map"), "Trading page should keep opportunity/risk map behind the Market focus on first load.");
  assert(html.includes("Wired paths"), "Trading page should summarize the wired trading paths in the compact cockpit.");
  assert(html.includes("Visible wired trading paths"), "Trading page should keep wired-path state visible without opening expert diagnostics.");
  assert(html.includes("Candle proof"), "Trading page should expose candle proof in the compact wired-path summary.");
  assert(html.includes("Candle memory"), "Trading page should expose latest read-only candle memory in the compact cockpit.");
  assert(html.includes("Autonomous candle refresh receipt"), "Trading page should expose a candle-refresh receipt for review.");
  assert(html.includes("Autonomous candle target lock receipt"), "Trading page should expose whether saved chart proof matches the active autonomous target.");
  assert(html.includes("Autonomous chart proof target"), "Trading page should show the server-selected chart proof target in the compact cockpit.");
  assert(html.includes("Autonomous chart proof target receipt"), "Trading page should expose the server-authored chart-proof target receipt.");
  assert(html.includes("Paper ledger, DEX read, route proof, candle evidence, wallet feedback"), "Trading page should disclose the compact wired-path receipt.");
  assert(html.includes("Autonomous authority path"), "Trading page should expose the first-screen scheduler-to-backend authority path.");
  assert(html.includes("Authority path"), "Trading page should label the autonomous authority path in the compact cockpit.");
  assert(html.includes("backend decides"), "Trading page should state that backend loop ticks decide trade/protect actions.");
  assert(html.includes("Autonomous authority path receipt"), "Trading page should expose an authority-path receipt for review.");
  assert(html.includes("backend autonomous loop tick owns trade and protect decisions"), "Trading page should disclose the browser scheduler to backend tick handoff.");
  assert(html.includes("Recent autonomous loop memory"), "Trading page should expose recent autonomous loop memory in the compact cockpit.");
  assert(html.includes("Loop memory"), "Trading page should label the autonomous loop memory strip.");
  assert(html.includes("Autonomous loop memory receipt"), "Trading page should expose the loop-memory receipt for review.");
  assert(html.includes("No autonomous loop memory yet") || html.includes("session ticks") || html.includes("daemon memory"), "Trading page should show a useful loop-memory state.");
  assert(html.includes("Advanced workbench"), "Trading page should keep deeper controls reachable without presenting them as the primary flow.");
  assert(html.includes("Advanced workbench collapsed receipt"), "Trading page should disclose that legacy controls and diagnostics are lazy-loaded behind the compact deck.");
  assert(html.includes("Open workbench"), "Trading page should lazy-load the old long controls on demand.");
  assert(html.includes("Expert receipts"), "Trading page should expose an explicit expert receipt action.");
  assert(!html.includes("Autonomous profit mission control"), "Trading page should not render the heavy expert diagnostics on initial load.");
  assert(!html.includes("Make-money proof stack"), "Trading page should keep proof-stack diagnostics out of the initial page HTML.");
  assert(!html.includes("Autopilot</button>"), "Trading page should not render the full tabbed desk until controls are opened.");

  assert(html.includes("Autonomous trading cockpit"), "Trading page should expose the trading cockpit.");
  }

  const baselineResponse = await request("/api/web3-trading?scenario=base&source=sample&account=persistent&reset=true");
  const baseline = await readJson(baselineResponse);
  assert(baselineResponse.status === 200, "Baseline trading state should load.", baseline);
  assert(baseline.autonomous_burst_scheduler?.mode === "autonomous-burst-scheduler", "Burst scheduler should be present.");
  assert(baseline.autonomous_trade_mission?.mode === "autonomous-trade-mission", "Trade mission should be present.");
  assert(
    baseline.autonomous_trade_mission.steps.some((step) => step.id === "mission-race-execution"),
    "Trade mission should expose the race execution runway step.",
    baseline.autonomous_trade_mission,
  );
  assert(baseline.autonomous_edge_verifier?.mode === "autonomous-edge-verifier", "Edge verifier should be present.");
  assert(
    ["increase-size", "small-probe", "protect-only", "stand-down"].includes(baseline.autonomous_edge_verifier.permission),
    "Edge verifier should return a known capital permission.",
    baseline.autonomous_edge_verifier,
  );
  assert(baseline.autonomous_opportunity_cost_auditor?.mode === "autonomous-opportunity-cost-auditor", "Opportunity-cost auditor should be present.", baseline.autonomous_opportunity_cost_auditor);
  assert(
    ["press", "probe", "learn", "protected", "idle"].includes(baseline.autonomous_opportunity_cost_auditor.status),
    "Opportunity-cost auditor should return a known status.",
    baseline.autonomous_opportunity_cost_auditor,
  );
  assert(baseline.autonomous_opportunity_cost_auditor.missed_edge_usd >= 0, "Opportunity-cost auditor should expose non-negative missed edge.", baseline.autonomous_opportunity_cost_auditor);
  assert(baseline.autonomous_opportunity_cost_auditor.expected_recovery_usd >= 0, "Opportunity-cost auditor should expose non-negative recoverable edge.", baseline.autonomous_opportunity_cost_auditor);
  assert(baseline.autonomous_opportunity_cost_auditor.opportunity_score >= 0 && baseline.autonomous_opportunity_cost_auditor.opportunity_score <= 100, "Opportunity-cost auditor score should be bounded.", baseline.autonomous_opportunity_cost_auditor);
  assert(baseline.autonomous_opportunity_cost_auditor.size_multiplier >= 0, "Opportunity-cost auditor should expose non-negative size bias.", baseline.autonomous_opportunity_cost_auditor);
  assert(baseline.autonomous_opportunity_cost_auditor.items.length > 0, "Opportunity-cost auditor should score current high-signal candidates.", baseline.autonomous_opportunity_cost_auditor);
  assert(
    baseline.autonomous_opportunity_cost_auditor.controls.some((control) => control.includes("missed paper edge")),
    "Opportunity-cost auditor should disclose its missed-edge paper scope.",
    baseline.autonomous_opportunity_cost_auditor,
  );
  assert(baseline.autonomous_edge_verifier.checks.length >= 9, "Edge verifier should expose replay, route, fill, and missed-opportunity checks.", baseline.autonomous_edge_verifier);
  assert(
    baseline.autonomous_edge_verifier.checks.some((check) => check.id === "opportunity-cost"),
    "Edge verifier should consume missed-opportunity proof.",
    baseline.autonomous_edge_verifier,
  );
  assert(baseline.autonomous_edge_stack?.mode === "autonomous-edge-stack", "Edge stack should be present.");
  assert(
    ["paper-attack", "paper-probe", "protect-only", "refresh-first", "stand-down"].includes(baseline.autonomous_edge_stack.permission),
    "Edge stack should return a known paper-trading permission.",
    baseline.autonomous_edge_stack,
  );
  assert(baseline.autonomous_edge_stack.items.map((item) => item.lane).join(",") === "signal,replay,route,wallet,cost,safety", "Edge stack should fuse the expected proof lanes.", baseline.autonomous_edge_stack);
  assert(baseline.autonomous_edge_stack.controls.some((control) => control.includes("local paper-ledger only")), "Edge stack should disclose its paper-only boundary.", baseline.autonomous_edge_stack);
  assert(baseline.autonomous_edge_stack_execution?.mode === "autonomous-edge-stack-execution", "Edge stack execution should be present.", baseline.autonomous_edge_stack_execution);
  assert(
    ["queued", "applied", "refresh-only", "protect-only", "blocked", "idle"].includes(baseline.autonomous_edge_stack_execution.status),
    "Edge stack execution should return a known status.",
    baseline.autonomous_edge_stack_execution,
  );
  assert(
    baseline.autonomous_edge_stack_execution.permission === baseline.autonomous_edge_stack.permission,
    "Edge stack execution should mirror the fused paper-trading permission.",
    { stack: baseline.autonomous_edge_stack, execution: baseline.autonomous_edge_stack_execution },
  );
  assert(baseline.autonomous_edge_stack_execution.execution_boundary === "paper-ledger-or-readonly-route", "Edge stack execution should disclose the combined boundary.", baseline.autonomous_edge_stack_execution);
  assert(baseline.autonomous_edge_stack_execution.paper_boundary === "paper-ledger-only", "Edge stack execution should keep paper fills in the local ledger.", baseline.autonomous_edge_stack_execution);
  assert(baseline.autonomous_edge_stack_execution.route_boundary === "read-only-route-refresh", "Edge stack execution should keep route refreshes read-only.", baseline.autonomous_edge_stack_execution);
  assert(
    baseline.autonomous_edge_stack_execution.controls.some((control) => control.includes("concrete existing lane")) &&
      baseline.autonomous_edge_stack_execution.controls.some((control) => control.includes("read-only")),
    "Edge stack execution should disclose lane selection and read-only route controls.",
    baseline.autonomous_edge_stack_execution,
  );
  assert(baseline.autonomous_opportunity_race?.mode === "autonomous-opportunity-race", "Opportunity race should be present.");
  assert(
    ["attack", "probe", "protect", "stand-down", "idle"].includes(baseline.autonomous_opportunity_race.status),
    "Opportunity race should return a known status.",
    baseline.autonomous_opportunity_race,
  );
  assert(Array.isArray(baseline.autonomous_opportunity_race.items), "Opportunity race should expose ranked items.", baseline.autonomous_opportunity_race);
  assert(baseline.autonomous_opportunity_race.items.length > 0, "Opportunity race should have at least one ranked item.", baseline.autonomous_opportunity_race);
  assert(baseline.high_frequency_profit_race?.mode === "high-frequency-profit-race", "High-frequency profit race should be present.", baseline.high_frequency_profit_race);
  assert(
    ["attack", "scalp", "protect", "cooldown", "blocked", "idle"].includes(baseline.high_frequency_profit_race.status),
    "High-frequency profit race should return a known status.",
    baseline.high_frequency_profit_race,
  );
  assert(
    Array.isArray(baseline.high_frequency_profit_race.items) && baseline.high_frequency_profit_race.items.length > 0,
    "High-frequency profit race should expose ranked paper actions.",
    baseline.high_frequency_profit_race,
  );
  assert(
    ["fast-entry", "scalp", "profit-protect", "route-repair", "cooldown-watch"].includes(baseline.high_frequency_profit_race.action_plan?.mode),
    "High-frequency profit race should expose a known fast action plan.",
    baseline.high_frequency_profit_race,
  );
  assert(baseline.high_frequency_profit_race.action_plan.cadence_seconds > 0, "High-frequency action plan should expose a positive cadence.", baseline.high_frequency_profit_race.action_plan);
  assert(
    ["dex-discovery", "pair-refresh", "route-quote", "wallet-protect", "signal-watch"].includes(baseline.high_frequency_profit_race.action_plan.data_lane),
    "High-frequency action plan should expose a valid data lane.",
    baseline.high_frequency_profit_race.action_plan,
  );
  assert(typeof baseline.high_frequency_profit_race.action_plan.route_refresh_required === "boolean", "High-frequency action plan should disclose route refresh need.", baseline.high_frequency_profit_race.action_plan);
  assert(
    baseline.high_frequency_profit_race.controls.some((control) => control.includes("expected paper profit per minute")),
    "High-frequency profit race should disclose its after-cost ranking rule.",
    baseline.high_frequency_profit_race,
  );
  assert(
    baseline.high_frequency_profit_race.items.every((item) => typeof item.paper_route_fallback === "boolean" && Array.isArray(item.live_route_blockers)),
    "High-frequency race items should disclose paper-route fallback and live blockers separately.",
    baseline.high_frequency_profit_race,
  );
  assert(baseline.churn_efficiency_auditor?.mode === "churn-efficiency-auditor", "Churn efficiency entry governor should be present.", baseline.churn_efficiency_auditor);
  assert(
    ["open", "selective", "cooldown", "blocked"].includes(baseline.churn_efficiency_auditor.entry_permission),
    "Churn efficiency should expose a known fresh-entry permission.",
    baseline.churn_efficiency_auditor,
  );
  assert(
    baseline.churn_efficiency_auditor.can_open_fresh_entries ===
      (baseline.churn_efficiency_auditor.entry_permission === "open" || baseline.churn_efficiency_auditor.entry_permission === "selective"),
    "Churn efficiency fresh-entry boolean should match the permission.",
    baseline.churn_efficiency_auditor,
  );
  assert(baseline.churn_efficiency_auditor.max_fresh_entry_usd >= 0, "Churn efficiency should expose the next fresh-entry cap.", baseline.churn_efficiency_auditor);
  assert(baseline.churn_efficiency_auditor.entry_governor_summary.length > 0, "Churn efficiency should explain the entry-governor decision.", baseline.churn_efficiency_auditor);
  assert(
    baseline.autonomous_trade_readiness_gate.checks.some((check) => check.id === "churn-governor"),
    "Trade readiness should include the churn governor check.",
    baseline.autonomous_trade_readiness_gate,
  );
  assert(
    ["snipe", "probe", "confirm", "late-chase", "fade", "blocked", "idle", "missing"].includes(baseline.autonomous_trade_readiness_gate.launch_timing_status),
    "Trade readiness should expose a known launch-timing gate status.",
    baseline.autonomous_trade_readiness_gate,
  );
  assert(typeof baseline.autonomous_trade_readiness_gate.launch_timing_blocks_fresh_buys === "boolean", "Trade readiness should disclose whether launch timing blocks fresh buys.", baseline.autonomous_trade_readiness_gate);
  assert(
    baseline.autonomous_trade_readiness_gate.launch_timing_blocker === null || typeof baseline.autonomous_trade_readiness_gate.launch_timing_blocker === "string",
    "Trade readiness should expose an optional launch-timing blocker.",
    baseline.autonomous_trade_readiness_gate,
  );
  assert(
    baseline.autonomous_trade_readiness_gate.checks.some((check) => check.id === "launch-timing"),
    "Trade readiness should include the launch timing check.",
    baseline.autonomous_trade_readiness_gate,
  );
  assert(baseline.tape_memory.tokens_tracked > 0, "Tape memory should expose tracked market rows for the Market focus.", baseline.tape_memory);
  assert(baseline.tape_memory.pressure_score >= 0 && baseline.tape_memory.pressure_score <= 100, "Tape memory pressure score should be bounded.", baseline.tape_memory);
  assert(baseline.tape_memory.acceleration_count >= 0 && baseline.tape_memory.deterioration_count >= 0 && baseline.tape_memory.urgent_count >= 0, "Tape memory should expose non-negative change counts.", baseline.tape_memory);
  assert(
    baseline.tape_memory.events.every((event) =>
      ["info", "watch", "urgent"].includes(event.severity) &&
      ["press", "probe", "watch", "trim", "exit", "block"].includes(event.action) &&
      event.confidence >= 0 &&
      event.confidence <= 100 &&
      typeof event.summary === "string" &&
      event.summary.length > 0
    ),
    "Tape memory events should be bounded actionable changes.",
    baseline.tape_memory,
  );
  assert(["selective-momentum", "risk-on", "chop", "rug-watch", "stand-down"].includes(baseline.situation_monitor.regime), "Situation monitor should expose a known regime.", baseline.situation_monitor);
  assert(baseline.situation_monitor.tape_score >= 0 && baseline.situation_monitor.tape_score <= 100, "Situation tape score should be bounded.", baseline.situation_monitor);
  assert(baseline.situation_monitor.risk_score >= 0 && baseline.situation_monitor.risk_score <= 100, "Situation risk score should be bounded.", baseline.situation_monitor);
  assert(baseline.situation_monitor.flow_score >= 0 && baseline.situation_monitor.flow_score <= 100, "Situation flow score should be bounded.", baseline.situation_monitor);
  assert(baseline.situation_monitor.playbook.length > 0, "Situation monitor should expose an actionable playbook for the Market focus.", baseline.situation_monitor);
  if (baseline.autonomous_trade_readiness_gate.launch_timing_blocks_fresh_buys) {
    assert(baseline.autonomous_trade_readiness_gate.can_apply_buys === false, "Launch timing should close final readiness buys when it blocks fresh entries.", baseline.autonomous_trade_readiness_gate);
    assert(baseline.autonomous_trade_readiness_gate.max_buy_notional_usd === 0, "Launch timing block should zero final readiness buy notional.", baseline.autonomous_trade_readiness_gate);
  }
  assert(baseline.high_frequency_profit_race_execution?.mode === "high-frequency-paper-execution", "High-frequency paper execution should be present.", baseline.high_frequency_profit_race_execution);
  assert(
    ["queued", "applied", "blocked", "idle"].includes(baseline.high_frequency_profit_race_execution.status),
    "High-frequency paper execution should return a known status.",
    baseline.high_frequency_profit_race_execution,
  );
  assert(baseline.high_frequency_profit_race_execution.execution_boundary === "paper-ledger-only", "High-frequency paper execution should stay paper-only.", baseline.high_frequency_profit_race_execution);
  assert(
    baseline.high_frequency_profit_race_execution.controls.some((control) => control.includes("one local paper-ledger fill")),
    "High-frequency paper execution should disclose the bounded local ledger fill rule.",
    baseline.high_frequency_profit_race_execution,
  );
  assert(typeof baseline.high_frequency_profit_race_execution.paper_route_fallback === "boolean", "High-frequency execution should disclose whether a paper route fallback is active.", baseline.high_frequency_profit_race_execution);
  assert(Array.isArray(baseline.high_frequency_profit_race_execution.live_route_blockers), "High-frequency execution should preserve live route/signature blockers separately.", baseline.high_frequency_profit_race_execution);
  if (baseline.high_frequency_profit_race_execution.paper_route_fallback) {
    assert(
      baseline.high_frequency_profit_race_execution.live_route_blockers.length > 0,
      "Paper route fallback should only be marked when live blockers remain visible.",
      baseline.high_frequency_profit_race_execution,
    );
  }
  assert(baseline.autonomous_opportunity_race_execution?.mode === "opportunity-race-paper-execution", "Opportunity race execution should be present.");
  assert(
    ["queued", "applied", "blocked", "idle"].includes(baseline.autonomous_opportunity_race_execution.status),
    "Opportunity race execution should return a known status.",
    baseline.autonomous_opportunity_race_execution,
  );
  assert(baseline.autonomous_opportunity_race_execution.execution_boundary === "paper-ledger-only", "Race execution should stay paper-only.", baseline.autonomous_opportunity_race_execution);
  assert(baseline.autonomous_position_risk_execution?.mode === "autonomous-position-risk-execution", "Position risk execution should be present.");
  assert(
    ["queued", "applied", "blocked", "idle"].includes(baseline.autonomous_position_risk_execution.status),
    "Position risk execution should return a known status.",
    baseline.autonomous_position_risk_execution,
  );
  assert(baseline.autonomous_position_risk_execution.execution_boundary === "paper-ledger-only", "Position risk execution should stay paper-only.", baseline.autonomous_position_risk_execution);
  assert(baseline.portfolio_tape_guard_execution?.mode === "portfolio-tape-guard-execution", "Portfolio tape guard execution should be present.");
  assert(
    ["queued", "applied", "blocked", "idle"].includes(baseline.portfolio_tape_guard_execution.status),
    "Portfolio tape guard execution should return a known status.",
    baseline.portfolio_tape_guard_execution,
  );
  assert(baseline.portfolio_tape_guard_execution.execution_boundary === "paper-ledger-only", "Portfolio tape guard execution should stay paper-only.", baseline.portfolio_tape_guard_execution);
  assert(baseline.autonomous_strategy_attribution?.mode === "autonomous-strategy-attribution", "Strategy attribution should be present.");
  assert(
    ["scale", "selective", "tighten", "protect", "learning", "idle"].includes(baseline.autonomous_strategy_attribution.status),
    "Strategy attribution should return a known status.",
    baseline.autonomous_strategy_attribution,
  );
  assert(Array.isArray(baseline.autonomous_strategy_attribution.items), "Strategy attribution should expose lane items.", baseline.autonomous_strategy_attribution);
  assert(baseline.autonomous_strategy_attribution.items.length > 0, "Strategy attribution should include at least one lane.", baseline.autonomous_strategy_attribution);
  assert(
    baseline.autonomous_strategy_attribution.controls.some((control) => control.includes("local paper fills")),
    "Strategy attribution should disclose its local paper-fill boundary.",
    baseline.autonomous_strategy_attribution,
  );
  assert(baseline.autonomous_policy_optimizer?.attribution_size_bias > 0, "Policy optimizer should consume strategy attribution bias.", baseline.autonomous_policy_optimizer);
  assert(
    ["snipe", "scalp", "compound", "harvest", "protect", "stand-down"].includes(baseline.autonomous_policy_optimizer.desk_mode),
    "Policy optimizer should expose the current autonomous desk mode.",
    baseline.autonomous_policy_optimizer,
  );
  assert(baseline.autonomous_policy_optimizer.allowed_actions.includes("watch"), "Policy optimizer should expose allowed autonomous desk actions.", baseline.autonomous_policy_optimizer);
  assert(
    baseline.autonomous_policy_optimizer.items.some((item) => item.id === "strategy-policy" && item.lane === "strategy"),
    "Policy optimizer should expose lane-attribution evidence.",
    baseline.autonomous_policy_optimizer,
  );
  assert(baseline.autonomous_profit_objective?.mode === "autonomous-profit-objective", "Autonomous profit objective should be present.", baseline.autonomous_profit_objective);
  assert(
    ["press", "compound", "harvest", "protect", "cooldown"].includes(baseline.autonomous_profit_objective.status),
    "Autonomous profit objective should return a known status.",
    baseline.autonomous_profit_objective,
  );
  assert(baseline.autonomous_profit_objective.target_net_pnl_usd > 0, "Profit objective should expose a positive target.", baseline.autonomous_profit_objective);
  assert(baseline.autonomous_profit_objective.required_edge_usd >= 0, "Profit objective should expose required edge.", baseline.autonomous_profit_objective);
  assert(baseline.autonomous_profit_objective.stop_loss_usd > 0, "Profit objective should expose a stop-loss budget.", baseline.autonomous_profit_objective);
  assert(baseline.autonomous_profit_objective.items.length >= 5, "Profit objective should expose target evidence rows.", baseline.autonomous_profit_objective);
  assert(baseline.autonomous_profit_control?.mode === "autonomous-profit-control", "Autonomous profit control should be present.", baseline.autonomous_profit_control);
  assert(
    ["press", "compound", "harvest", "redeploy", "protect", "cooldown"].includes(baseline.autonomous_profit_control.status),
    "Autonomous profit control should return a known status.",
    baseline.autonomous_profit_control,
  );
  assert(
    ["burst", "active", "selective", "defensive", "paused"].includes(baseline.autonomous_profit_control.loop_intensity),
    "Autonomous profit control should return a known loop intensity.",
    baseline.autonomous_profit_control,
  );
  assert(baseline.autonomous_profit_control.deploy_now_usd >= 0, "Profit control should expose deploy budget.", baseline.autonomous_profit_control);
  assert(baseline.autonomous_profit_control.release_now_usd >= 0, "Profit control should expose release budget.", baseline.autonomous_profit_control);
  assert(baseline.autonomous_profit_control.items.length >= 6, "Profit control should expose control evidence rows.", baseline.autonomous_profit_control);
  assert(
    baseline.autonomous_profit_control.controls.some((control) => control.includes("objective")),
    "Profit control should disclose objective and guardrail inputs.",
    baseline.autonomous_profit_control,
  );
  assert(baseline.autonomous_command_center?.mode === "autonomous-command-center", "Autonomous command center should be present.", baseline.autonomous_command_center);
  assert(
    ["attack", "protect", "harvest", "prepare", "blocked", "watch"].includes(baseline.autonomous_command_center.status),
    "Autonomous command center should return a known status.",
    baseline.autonomous_command_center,
  );
  assert(Array.isArray(baseline.autonomous_command_center.items), "Command center should expose ranked commands.", baseline.autonomous_command_center);
  assert(baseline.autonomous_command_center.items.length > 0, "Command center should have at least one ranked command.", baseline.autonomous_command_center);
  assert(
    baseline.autonomous_command_center.items.every((item) =>
      typeof item.rehearsal_score === "number" &&
      ["pass", "watch", "fail"].includes(item.rehearsal_verdict) &&
      typeof item.projected_equity_usd === "number" &&
      typeof item.projected_pnl_usd === "number" &&
      typeof item.projected_drawdown_pct === "number"
    ),
    "Command center items should expose deterministic paper rehearsal projections.",
    baseline.autonomous_command_center,
  );
  assert(
    baseline.autonomous_command_center.controls.some((control) => control.includes("Collapses the fast race")),
    "Command center should disclose that it consolidates overlapping decision lanes.",
    baseline.autonomous_command_center,
  );
  assert(baseline.autonomous_command_center_execution?.mode === "command-center-paper-execution", "Command center paper executor should be present.", baseline.autonomous_command_center_execution);
  assert(
    ["queued", "applied", "blocked", "idle"].includes(baseline.autonomous_command_center_execution.status),
    "Command center executor should return a known status.",
    baseline.autonomous_command_center_execution,
  );
  assert(baseline.autonomous_command_center_execution.execution_boundary === "paper-ledger-only", "Command center executor should stay paper-only.", baseline.autonomous_command_center_execution);
  assert(
    baseline.autonomous_command_center_execution.controls.some((control) => control.includes("one local paper-ledger fill")),
    "Command center executor should disclose the one-fill paper boundary.",
    baseline.autonomous_command_center_execution,
  );
  assert(baseline.autonomous_command_performance?.mode === "autonomous-command-performance", "Command performance auditor should be present.", baseline.autonomous_command_performance);
  assert(
    ["press", "selective", "tighten", "protect", "learning", "idle"].includes(baseline.autonomous_command_performance.status),
    "Command performance should return a known status.",
    baseline.autonomous_command_performance,
  );
  assert(baseline.autonomous_command_performance.items.length > 0, "Command performance should expose symbol rows.", baseline.autonomous_command_performance);
  assert(
    baseline.autonomous_command_performance.controls.some((control) => control.includes("command-center paper fills")),
    "Command performance should disclose command-owned paper scope.",
    baseline.autonomous_command_performance,
  );
  assert(baseline.autonomous_profit_learning?.mode === "autonomous-profit-learning", "Profit learning loop should be present.", baseline.autonomous_profit_learning);
  assert(
    ["press", "selective", "tighten", "protect", "learning", "idle"].includes(baseline.autonomous_profit_learning.status),
    "Profit learning should return a known status.",
    baseline.autonomous_profit_learning,
  );
  assert(baseline.autonomous_profit_learning.items.length >= 7, "Profit learning should expose feedback rows including opportunity cost.", baseline.autonomous_profit_learning);
  assert(
    baseline.autonomous_profit_learning.items.some((item) => item.lane === "opportunity"),
    "Profit learning should consume missed-opportunity feedback.",
    baseline.autonomous_profit_learning,
  );
  assert(baseline.autonomous_profit_learning.size_multiplier > 0, "Profit learning should expose next-size guidance.", baseline.autonomous_profit_learning);
  assert(baseline.autonomous_profit_learning.cadence_seconds > 0, "Profit learning should expose cadence guidance.", baseline.autonomous_profit_learning);
  assert(
    baseline.autonomous_profit_learning.controls.some((control) => control.includes("local paper PnL")) &&
      baseline.autonomous_profit_learning.controls.some((control) => control.includes("missed opportunities")),
    "Profit learning should disclose its paper-only feedback scope.",
    baseline.autonomous_profit_learning,
  );
  assert(baseline.autonomous_profit_allocation_plan?.mode === "autonomous-profit-allocation-plan", "Profit allocation plan should be present.", baseline.autonomous_profit_allocation_plan);
  assert(
    ["press", "rotate", "protect", "cooldown", "learning", "idle"].includes(baseline.autonomous_profit_allocation_plan.status),
    "Profit allocation plan should expose a known status.",
    baseline.autonomous_profit_allocation_plan,
  );
  assert(baseline.autonomous_profit_allocation_plan.deploy_budget_usd >= 0, "Profit allocation plan should publish deploy budget.", baseline.autonomous_profit_allocation_plan);
  assert(baseline.autonomous_profit_allocation_plan.release_budget_usd >= 0, "Profit allocation plan should publish release budget.", baseline.autonomous_profit_allocation_plan);
  assert(baseline.autonomous_profit_allocation_plan.max_trade_usd >= 0, "Profit allocation plan should publish max trade.", baseline.autonomous_profit_allocation_plan);
  assert(baseline.autonomous_profit_allocation_plan.size_multiplier > 0, "Profit allocation plan should publish size guidance.", baseline.autonomous_profit_allocation_plan);
  assert(baseline.autonomous_profit_allocation_plan.cadence_seconds > 0, "Profit allocation plan should publish cadence guidance.", baseline.autonomous_profit_allocation_plan);
  assert(
    baseline.autonomous_profit_allocation_plan.controls.some((control) => control.includes("next-cycle sizing plan")),
    "Profit allocation plan should explain its closed-loop sizing scope.",
    baseline.autonomous_profit_allocation_plan,
  );
  assert(
    baseline.autonomous_profit_allocation_plan.controls.some((control) => control.includes("allocator gate")) &&
      baseline.autonomous_profit_allocation_plan.controls.some((control) => control.includes("protective sells bypass")) &&
      baseline.autonomous_profit_allocation_plan.controls.some((control) => control.includes("clipped to the learned lane cap")),
    "Profit allocation plan should disclose that it gates and clips fresh buys while preserving protective sells.",
    baseline.autonomous_profit_allocation_plan,
  );
  assert(baseline.autonomous_wallet_performance_governor?.mode === "wallet-performance-governor", "Wallet performance governor should be present.", baseline.autonomous_wallet_performance_governor);
  assert(
    ["press", "compound", "selective", "harvest", "cooldown", "protect", "learning"].includes(baseline.autonomous_wallet_performance_governor.status),
    "Wallet performance governor should publish a known status.",
    baseline.autonomous_wallet_performance_governor,
  );
  assert(
    ["open", "selective", "blocked"].includes(baseline.autonomous_wallet_performance_governor.fresh_buy_permission),
    "Wallet performance governor should publish fresh-buy permission.",
    baseline.autonomous_wallet_performance_governor,
  );
  assert(typeof baseline.autonomous_wallet_performance_governor.protective_sell_only === "boolean", "Wallet performance governor should publish protective-sell-only state.", baseline.autonomous_wallet_performance_governor);
  assert(baseline.autonomous_wallet_performance_governor.make_money_score >= 0 && baseline.autonomous_wallet_performance_governor.make_money_score <= 100, "Wallet performance governor should score make-money quality.", baseline.autonomous_wallet_performance_governor);
  assert(baseline.autonomous_wallet_performance_governor.wallet_score >= 0 && baseline.autonomous_wallet_performance_governor.wallet_score <= 100, "Wallet performance governor should score wallet quality.", baseline.autonomous_wallet_performance_governor);
  assert(baseline.autonomous_wallet_performance_governor.next_trade_cap >= 0, "Wallet performance governor should cap next trades.", baseline.autonomous_wallet_performance_governor);
  assert(baseline.autonomous_wallet_performance_governor.next_size_multiplier >= 0, "Wallet performance governor should publish non-negative sizing.", baseline.autonomous_wallet_performance_governor);
  assert(baseline.autonomous_wallet_performance_governor.cadence_seconds > 0, "Wallet performance governor should publish cadence.", baseline.autonomous_wallet_performance_governor);
  assert(
    baseline.autonomous_wallet_performance_governor.items.length === 5 &&
      JSON.stringify(baseline.autonomous_wallet_performance_governor.items.map((item) => item.id)) === JSON.stringify(["curve", "expectancy", "drawdown", "discipline", "learning"]),
    "Wallet performance governor should expose curve, expectancy, drawdown, discipline, and learning checks.",
    baseline.autonomous_wallet_performance_governor,
  );
  assert(
    baseline.autonomous_wallet_performance_governor.controls.some((control) => control.includes("actually making money")),
    "Wallet performance governor should disclose that it scores actual paper wallet performance.",
    baseline.autonomous_wallet_performance_governor,
  );
  assert(baseline.autonomous_exit_bracket_governor?.mode === "autonomous-exit-bracket-governor", "Exit bracket governor should be present.", baseline.autonomous_exit_bracket_governor);
  assert(
    ["covered", "harvest", "protect", "repair", "blocked", "idle"].includes(baseline.autonomous_exit_bracket_governor.status),
    "Exit bracket governor should publish a known status.",
    baseline.autonomous_exit_bracket_governor,
  );
  assert(
    ["open", "selective", "blocked"].includes(baseline.autonomous_exit_bracket_governor.fresh_buy_permission),
    "Exit bracket governor should publish fresh-buy permission.",
    baseline.autonomous_exit_bracket_governor,
  );
  assert(baseline.autonomous_exit_bracket_governor.coverage_score >= 0 && baseline.autonomous_exit_bracket_governor.coverage_score <= 100, "Exit bracket governor should score bracket coverage.", baseline.autonomous_exit_bracket_governor);
  assert(baseline.autonomous_exit_bracket_governor.uncovered_exposure_usd >= 0, "Exit bracket governor should expose uncovered exposure.", baseline.autonomous_exit_bracket_governor);
  assert(baseline.autonomous_exit_bracket_governor.release_ready_usd >= 0, "Exit bracket governor should expose release-ready notional.", baseline.autonomous_exit_bracket_governor);
  assert(baseline.autonomous_exit_bracket_governor.fastest_review_seconds > 0, "Exit bracket governor should expose review cadence.", baseline.autonomous_exit_bracket_governor);
  assert(
    baseline.autonomous_exit_bracket_governor.items.length === baseline.portfolio.open_positions.length,
    "Exit bracket governor should publish one row per open paper position.",
    baseline.autonomous_exit_bracket_governor,
  );
  assert(
    baseline.autonomous_exit_bracket_governor.items.every((item) =>
      ["harvest", "protect", "repair", "arm-bracket", "monitor"].includes(item.action) &&
      ["covered", "planned", "auth-required", "repair", "uncovered", "watch", "missing"].includes(item.coverage_status) &&
      ["now", "next", "watch"].includes(item.priority) &&
      item.bracket_score >= 0 &&
      item.bracket_score <= 100 &&
      item.stop_price_usd >= 0 &&
      item.take_profit_price_usd >= 0 &&
      item.trailing_stop_price_usd >= 0 &&
      item.reason.length > 0 &&
      item.next_action.length > 0
    ),
    "Exit bracket governor items should be priced, scored, and explainable.",
    baseline.autonomous_exit_bracket_governor,
  );
  assert(
    baseline.autonomous_exit_bracket_governor.controls.some((control) => control.includes("OCO-style")),
    "Exit bracket governor should disclose its OCO-style paper-only boundary.",
    baseline.autonomous_exit_bracket_governor,
  );
  assert(baseline.autonomous_profit_runway_governor?.mode === "autonomous-profit-runway-governor", "Profit runway governor should be present.", baseline.autonomous_profit_runway_governor);
  assert(
    ["scale", "trade", "probe", "harvest", "protect", "refresh", "learn", "blocked"].includes(baseline.autonomous_profit_runway_governor.status),
    "Profit runway governor should publish a known status.",
    baseline.autonomous_profit_runway_governor,
  );
  assert(
    ["open", "selective", "protect-only", "refresh-only", "blocked"].includes(baseline.autonomous_profit_runway_governor.trade_permission),
    "Profit runway governor should publish trade permission.",
    baseline.autonomous_profit_runway_governor,
  );
  assert(baseline.autonomous_profit_runway_governor.runway_score >= 0 && baseline.autonomous_profit_runway_governor.runway_score <= 100, "Profit runway score should be bounded.", baseline.autonomous_profit_runway_governor);
  assert(baseline.autonomous_profit_runway_governor.expected_runway_usd >= 0, "Profit runway should expose non-negative expected runway.", baseline.autonomous_profit_runway_governor);
  assert(baseline.autonomous_profit_runway_governor.break_even_ticks > 0, "Profit runway should expose positive break-even ticks.", baseline.autonomous_profit_runway_governor);
  assert(baseline.autonomous_profit_runway_governor.max_next_notional_usd >= 0, "Profit runway should expose non-negative max next notional.", baseline.autonomous_profit_runway_governor);
  assert(baseline.autonomous_profit_runway_governor.release_first_usd >= 0, "Profit runway should expose non-negative release-first notional.", baseline.autonomous_profit_runway_governor);
  assert(baseline.autonomous_profit_runway_governor.cadence_seconds > 0, "Profit runway should expose a positive cadence.", baseline.autonomous_profit_runway_governor);
  assert(
    baseline.autonomous_profit_runway_governor.items.length === 5 &&
      JSON.stringify(baseline.autonomous_profit_runway_governor.items.map((item) => item.id)) === JSON.stringify(["wallet", "edge", "route", "brackets", "cadence"]),
    "Profit runway governor should expose wallet, edge, route, bracket, and cadence checks.",
    baseline.autonomous_profit_runway_governor,
  );
  assert(
    baseline.autonomous_profit_runway_governor.controls.some((control) => control.includes("profit-seeking paper governor")),
    "Profit runway governor should disclose its paper-only profit-seeking boundary.",
    baseline.autonomous_profit_runway_governor,
  );
  assert(baseline.autonomous_profit_velocity_governor?.mode === "autonomous-profit-velocity-governor", "Profit velocity governor should be present.", baseline.autonomous_profit_velocity_governor);
  assert(
    ["burst", "trade", "probe", "protect", "refresh", "cooldown", "blocked", "idle"].includes(baseline.autonomous_profit_velocity_governor.status),
    "Profit velocity governor should publish a known status.",
    baseline.autonomous_profit_velocity_governor,
  );
  assert(
    ["multi-fill", "single-fill", "protect-only", "refresh-only", "observe", "blocked"].includes(baseline.autonomous_profit_velocity_governor.loop_permission),
    "Profit velocity governor should publish loop permission.",
    baseline.autonomous_profit_velocity_governor,
  );
  assert(baseline.autonomous_profit_velocity_governor.velocity_score >= 0 && baseline.autonomous_profit_velocity_governor.velocity_score <= 100, "Profit velocity score should be bounded.", baseline.autonomous_profit_velocity_governor);
  assert(baseline.autonomous_profit_velocity_governor.target_trades_per_minute >= 0, "Profit velocity should expose non-negative target trades per minute.", baseline.autonomous_profit_velocity_governor);
  assert(baseline.autonomous_profit_velocity_governor.max_trades_next_minute >= 0, "Profit velocity should expose non-negative max trades next minute.", baseline.autonomous_profit_velocity_governor);
  assert(baseline.autonomous_profit_velocity_governor.max_churn_notional_usd >= 0, "Profit velocity should expose non-negative churn notional cap.", baseline.autonomous_profit_velocity_governor);
  assert(baseline.autonomous_profit_velocity_governor.expected_profit_per_minute_usd >= 0, "Profit velocity should expose non-negative expected profit per minute.", baseline.autonomous_profit_velocity_governor);
  assert(baseline.autonomous_profit_velocity_governor.data_calls_per_minute >= 0, "Profit velocity should expose provider data call budget.", baseline.autonomous_profit_velocity_governor);
  assert(baseline.autonomous_profit_velocity_governor.route_quotes_per_minute >= 0, "Profit velocity should expose route quote budget.", baseline.autonomous_profit_velocity_governor);
  assert(baseline.autonomous_profit_velocity_governor.provider_utilization_pct >= 0 && baseline.autonomous_profit_velocity_governor.provider_utilization_pct <= 100, "Profit velocity provider utilization should be bounded.", baseline.autonomous_profit_velocity_governor);
  assert(baseline.autonomous_profit_velocity_governor.cooldown_seconds > 0, "Profit velocity should expose a positive cooldown/retry cadence.", baseline.autonomous_profit_velocity_governor);
  assert(
    baseline.autonomous_profit_velocity_governor.items.length === 5 &&
      JSON.stringify(baseline.autonomous_profit_velocity_governor.items.map((item) => item.id)) === JSON.stringify(["runway", "bundle", "churn", "provider", "wallet"]),
    "Profit velocity governor should expose runway, bundle, churn, provider, and wallet checks.",
    baseline.autonomous_profit_velocity_governor,
  );
  assert(
    baseline.autonomous_profit_velocity_governor.controls.some((control) => control.includes("high-frequency loop throttle")),
    "Profit velocity governor should disclose its high-frequency paper-loop scope.",
    baseline.autonomous_profit_velocity_governor,
  );
  const hasReadyProtectLane = baseline.autonomous_tick_plan.items.some((item) => item.action === "protect-now" && item.status === "ready");
  const hasReadyQueueSell = baseline.autonomous_action_queue_execution.selected_side === "sell" &&
    baseline.autonomous_action_queue_execution.paper_trade_ready;
  if (baseline.autonomous_profit_velocity_governor.loop_permission === "protect-only" && (hasReadyProtectLane || hasReadyQueueSell)) {
    assert(
      baseline.autonomous_profit_velocity_governor.max_trades_next_minute > 0,
      "Protect-only profit velocity should still allow a bounded paper sell in the next minute.",
      baseline.autonomous_profit_velocity_governor,
    );
    assert(
      baseline.autonomous_profit_velocity_governor.target_trades_per_minute > 0,
      "Protect-only profit velocity should keep an active sell cadence.",
      baseline.autonomous_profit_velocity_governor,
    );
    assert(
      baseline.autonomous_profit_velocity_governor.max_churn_notional_usd > 0,
      "Protect-only profit velocity should publish the sell notional cap.",
      baseline.autonomous_profit_velocity_governor,
    );
  }
  assert(baseline.autonomous_outcome_memory_governor?.mode === "autonomous-outcome-memory-governor", "Outcome memory governor should be present.", baseline.autonomous_outcome_memory_governor);
  assert(
    ["press", "compound", "selective", "protect", "cooldown", "learning", "idle"].includes(baseline.autonomous_outcome_memory_governor.status),
    "Outcome memory governor should publish a known status.",
    baseline.autonomous_outcome_memory_governor,
  );
  assert(
    ["press-winner", "compound-winner", "single-probe", "exit-first", "cooldown-lane", "collect-evidence", "wait"].includes(baseline.autonomous_outcome_memory_governor.next_bias),
    "Outcome memory governor should publish a known next-cycle bias.",
    baseline.autonomous_outcome_memory_governor,
  );
  assert(
    baseline.autonomous_outcome_memory_governor.memory_score >= 0 &&
      baseline.autonomous_outcome_memory_governor.memory_score <= 100,
    "Outcome memory score should be bounded.",
    baseline.autonomous_outcome_memory_governor,
  );
  assert(typeof baseline.autonomous_outcome_memory_governor.expectancy_usd === "number", "Outcome memory should expose expectancy.", baseline.autonomous_outcome_memory_governor);
  assert(baseline.autonomous_outcome_memory_governor.profit_factor >= 0, "Outcome memory should expose non-negative profit factor.", baseline.autonomous_outcome_memory_governor);
  assert(
    baseline.autonomous_outcome_memory_governor.win_rate_pct >= 0 &&
      baseline.autonomous_outcome_memory_governor.win_rate_pct <= 100,
    "Outcome memory win rate should be bounded.",
    baseline.autonomous_outcome_memory_governor,
  );
  assert(baseline.autonomous_outcome_memory_governor.size_multiplier >= 0, "Outcome memory should expose a non-negative size multiplier.", baseline.autonomous_outcome_memory_governor);
  assert(Array.isArray(baseline.autonomous_outcome_memory_governor.cooldown_symbols), "Outcome memory should expose cooldown symbols.", baseline.autonomous_outcome_memory_governor);
  assert(Array.isArray(baseline.autonomous_outcome_memory_governor.press_symbols), "Outcome memory should expose press symbols.", baseline.autonomous_outcome_memory_governor);
  assert(Array.isArray(baseline.autonomous_outcome_memory_governor.exit_first_symbols), "Outcome memory should expose exit-first symbols.", baseline.autonomous_outcome_memory_governor);
  assert(
    baseline.autonomous_outcome_memory_governor.items.length === 5 &&
      JSON.stringify(baseline.autonomous_outcome_memory_governor.items.map((item) => item.id)) === JSON.stringify(["symbol", "lane", "expectancy", "discipline", "risk"]),
    "Outcome memory governor should expose symbol, lane, expectancy, discipline, and risk checks.",
    baseline.autonomous_outcome_memory_governor,
  );
  assert(
    baseline.autonomous_outcome_memory_governor.controls.some((control) => control.includes("next-cycle outcome bias")),
    "Outcome memory governor should disclose its next-cycle paper-loop scope.",
    baseline.autonomous_outcome_memory_governor,
  );
  assert(baseline.autonomous_market_intelligence?.mode === "autonomous-market-intelligence", "Market intelligence should be present.", baseline.autonomous_market_intelligence);
  assert(
    ["chase", "selective", "watch", "protect", "blocked", "idle"].includes(baseline.autonomous_market_intelligence.status),
    "Market intelligence should return a known status.",
    baseline.autonomous_market_intelligence,
  );
  assert(
    ["sample", "live", "repair", "blocked"].includes(baseline.autonomous_market_intelligence.provider_status),
    "Market intelligence should return a known provider status.",
    baseline.autonomous_market_intelligence,
  );
  assert(baseline.autonomous_market_intelligence.items.length > 0, "Market intelligence should expose ranked rows.", baseline.autonomous_market_intelligence);
  assert(baseline.autonomous_market_intelligence.recommended_cadence_seconds > 0, "Market intelligence should expose cadence guidance.", baseline.autonomous_market_intelligence);
  assert(baseline.autonomous_market_intelligence.provider_plan.length >= 2, "Market intelligence should expose a provider plan.", baseline.autonomous_market_intelligence);
  assert(
    baseline.autonomous_market_intelligence.controls.some((control) => control.includes("DEX discovery")),
    "Market intelligence should disclose provider fusion scope.",
    baseline.autonomous_market_intelligence,
  );
  assert(
    baseline.autonomous_market_intelligence.controls.some((control) => control.includes("local paper")),
    "Market intelligence should disclose the local paper boundary.",
    baseline.autonomous_market_intelligence,
  );
  assert(baseline.market_intelligence_execution?.mode === "market-intelligence-paper-execution", "Market intelligence execution should be present.", baseline.market_intelligence_execution);
  assert(
    ["queued", "applied", "blocked", "idle"].includes(baseline.market_intelligence_execution.status),
    "Market intelligence execution should return a known status.",
    baseline.market_intelligence_execution,
  );
  assert(baseline.market_intelligence_execution.execution_boundary === "paper-ledger-only", "Market intelligence execution should stay paper-only.", baseline.market_intelligence_execution);
  assert(typeof baseline.market_intelligence_execution.projected_pnl_usd === "number", "Market intelligence execution should expose projected PnL.", baseline.market_intelligence_execution);
  assert(
    baseline.market_intelligence_execution.controls.some((control) => control.includes("bounded local paper buy")) &&
      baseline.market_intelligence_execution.controls.some((control) => control.includes("live signing")),
    "Market intelligence execution should disclose paper-only execution controls.",
    baseline.market_intelligence_execution,
  );
  assert(baseline.autonomous_watchlist_rotation?.mode === "autonomous-watchlist-rotation", "Watchlist rotation should be present.", baseline.autonomous_watchlist_rotation);
  assert(
    ["trade-now", "quote-first", "chart-first", "refresh-first", "protect", "watch", "idle"].includes(baseline.autonomous_watchlist_rotation.status),
    "Watchlist rotation should return a known status.",
    baseline.autonomous_watchlist_rotation,
  );
  assert(baseline.autonomous_watchlist_rotation.items.length > 0, "Watchlist rotation should expose ranked targets.", baseline.autonomous_watchlist_rotation);
  assert(baseline.autonomous_watchlist_rotation.fastest_refresh_seconds > 0, "Watchlist rotation should expose refresh timing.", baseline.autonomous_watchlist_rotation);
  assert(
    baseline.autonomous_watchlist_rotation.items.every((item) =>
      ["paper-trade", "quote-route", "fetch-candles", "refresh-pair", "protect-position", "watch"].includes(item.action) &&
      ["trade", "route", "chart", "pair", "portfolio", "watch"].includes(item.lane) &&
      item.rotation_score >= 0 &&
      item.rotation_score <= 100 &&
      item.refresh_after_seconds > 0 &&
      item.reason.length > 0
    ),
    "Watchlist rotation should rank actionable lanes with bounded scores and timing.",
    baseline.autonomous_watchlist_rotation,
  );
  assert(
    baseline.autonomous_watchlist_rotation.controls.some((control) => control.includes("wallet funds")),
    "Watchlist rotation should disclose that it does not move wallet funds.",
    baseline.autonomous_watchlist_rotation,
  );
  assert(baseline.watchlist_rotation_execution?.mode === "watchlist-rotation-paper-execution", "Watchlist rotation execution should be present.", baseline.watchlist_rotation_execution);
  assert(
    ["queued", "applied", "blocked", "idle"].includes(baseline.watchlist_rotation_execution.status),
    "Watchlist rotation execution should return a known status.",
    baseline.watchlist_rotation_execution,
  );
  assert(baseline.watchlist_rotation_execution.execution_boundary === "paper-ledger-only", "Watchlist rotation execution should stay paper-only.", baseline.watchlist_rotation_execution);
  assert(typeof baseline.watchlist_rotation_execution.projected_pnl_usd === "number", "Watchlist rotation execution should expose projected PnL.", baseline.watchlist_rotation_execution);
  assert(
    baseline.watchlist_rotation_execution.controls.some((control) => control.includes("paper-ledger-only")) &&
      baseline.watchlist_rotation_execution.controls.some((control) => control.includes("wallet fund")),
    "Watchlist rotation execution should disclose paper-only controls.",
    baseline.watchlist_rotation_execution,
  );
  if (baseline.watchlist_rotation_execution.paper_trade) {
    assert(
      ["buy", "sell"].includes(baseline.watchlist_rotation_execution.paper_trade.side),
      "Watchlist rotation execution should only create paper buy/sell fills.",
      baseline.watchlist_rotation_execution,
    );
    assert(
      baseline.watchlist_rotation_execution.paper_trade.reason.includes("Watchlist rotation"),
      "Watchlist rotation paper trade should identify its source.",
      baseline.watchlist_rotation_execution,
    );
  }
  assert(
    baseline.autonomous_policy_optimizer.safeguards.some((item) => item.includes("lane attribution")),
    "Policy optimizer should disclose attribution-biased sizing.",
    baseline.autonomous_policy_optimizer,
  );
  assert(
    ["within-budget", "hot", "throttled", "paused"].includes(baseline.market_ingestion_plan.provider_budget_status),
    "Market ingestion should expose provider budget status.",
    baseline.market_ingestion_plan,
  );
  assert(baseline.market_ingestion_plan.provider_budget_lanes.length >= 5, "Market ingestion should expose provider budget lanes.", baseline.market_ingestion_plan);
  assert(
    baseline.market_ingestion_plan.provider_budget_lanes.some((lane) => lane.id === "dex-pairs" && lane.limit_per_minute === 300),
    "Market ingestion should separate DEX pair budget from discovery budget.",
    baseline.market_ingestion_plan,
  );
  assert(
    baseline.market_ingestion_plan.provider_budget_lanes.some((lane) => lane.id === "gecko-ohlcv" && lane.limit_per_minute === 10),
    "Market ingestion should expose GeckoTerminal OHLCV budget.",
    baseline.market_ingestion_plan,
  );
  const marketIntakePlan = baseline.autonomous_market_intake_plan;
  assert(marketIntakePlan?.mode === "autonomous-market-intake-plan", "Autonomous market intake plan should be present.", marketIntakePlan);
  assert(["attack", "refresh", "watch", "blocked", "sample"].includes(marketIntakePlan.status), "Market intake plan should expose a known status.", marketIntakePlan);
  assert(["dex-discovery", "dex-pairs", "paid-orders", "candles", "route-quotes", "wallet-net-worth", "none"].includes(marketIntakePlan.next_lane), "Market intake plan should expose a known next lane.", marketIntakePlan);
  assert(["DEX Screener", "Birdeye", "Jupiter", "Local paper wallet", "none"].includes(marketIntakePlan.next_provider), "Market intake plan should expose a known provider.", marketIntakePlan);
  assert(marketIntakePlan.next_endpoint.length > 0, "Market intake plan should expose the next endpoint.", marketIntakePlan);
  assert(marketIntakePlan.next_request_seconds > 0 && marketIntakePlan.next_request_seconds <= 60, "Market intake plan should bound the next request interval.", marketIntakePlan);
  assert(marketIntakePlan.provider_budget_status === baseline.market_ingestion_plan.provider_budget_status, "Market intake plan should mirror provider budget status.", { marketIntakePlan, ingestion: baseline.market_ingestion_plan });
  assert(marketIntakePlan.data_score === baseline.autonomous_data_freshness_gate.data_score, "Market intake plan should mirror the data freshness score.", { marketIntakePlan, gate: baseline.autonomous_data_freshness_gate });
  assert(typeof marketIntakePlan.loop_ready === "boolean" && typeof marketIntakePlan.can_feed_trade_loop === "boolean", "Market intake plan should publish loop readiness.", marketIntakePlan);
  assert(typeof marketIntakePlan.route_refresh_first === "boolean" && typeof marketIntakePlan.wallet_mark_required === "boolean", "Market intake plan should publish route and wallet prerequisites.", marketIntakePlan);
  assert(marketIntakePlan.max_candidate_refreshes >= 0 && marketIntakePlan.expected_trade_window_seconds > 0, "Market intake plan should publish bounded refresh and trade windows.", marketIntakePlan);
  assert(marketIntakePlan.items.length === 6, "Market intake plan should expose six provider lanes.", marketIntakePlan);
  assert(
    ["dex-discovery", "dex-pairs", "paid-orders", "candles", "route-quotes", "wallet-net-worth"].every((id) =>
      marketIntakePlan.items.some((item) =>
        item.id === id &&
        ["ready", "poll", "refresh", "throttled", "blocked", "sample"].includes(item.status) &&
        ["stream", "poll", "backfill", "quote", "wallet-mark", "stand-down"].includes(item.action) &&
        item.priority_score >= 0 &&
        item.priority_score <= 100 &&
        item.calls_per_minute >= 0 &&
        item.limit_per_minute > 0 &&
        item.cadence_seconds > 0 &&
        item.detail.length > 0
      )
    ),
    "Market intake plan should expose bounded provider evidence lanes.",
    marketIntakePlan,
  );
  assert(
    marketIntakePlan.controls.some((control) => control.includes("DEX Screener")) &&
      marketIntakePlan.controls.some((control) => control.includes("Jupiter")) &&
      marketIntakePlan.controls.some((control) => control.includes("cannot sign")),
    "Market intake plan should disclose provider coverage and live-execution boundary.",
    marketIntakePlan,
  );
  assert(baseline.dex_stream_freshness?.mode === "dex-stream-freshness", "DEX stream freshness should be present.", baseline.dex_stream_freshness);
  assert(
    ["hot", "ready", "watch", "backfill", "blocked", "sample"].includes(baseline.dex_stream_freshness.status),
    "DEX stream freshness should expose a known status.",
    baseline.dex_stream_freshness,
  );
  assert(
    baseline.dex_stream_freshness.items.map((item) => item.id).join(",") === "token-profiles,boosts,community-takeovers",
    "DEX stream freshness should expose profile, boost, and takeover lanes.",
    baseline.dex_stream_freshness,
  );
  assert(
    baseline.dex_stream_freshness.items.every((item) => item.websocket_path.startsWith("wss://api.dexscreener.com/") && item.next_action.length > 0),
    "DEX stream freshness lanes should disclose websocket paths and next actions.",
    baseline.dex_stream_freshness,
  );
  assert(
    baseline.autonomous_discovery_intake?.mode === "autonomous-discovery-intake",
    "Autonomous discovery intake should be present.",
    baseline.autonomous_discovery_intake,
  );
  assert(
    ["attack-ready", "probe-ready", "refresh-first", "blocked", "sample", "idle"].includes(baseline.autonomous_discovery_intake.status),
    "Autonomous discovery intake should expose a known status.",
    baseline.autonomous_discovery_intake,
  );
  assert(
    baseline.autonomous_discovery_intake.controls.some((control) => control.includes("read-only")),
    "Autonomous discovery intake should disclose its read-only boundary.",
    baseline.autonomous_discovery_intake,
  );
  assert(
    baseline.autonomous_discovery_intake.source_coverage_pct >= 0 &&
      baseline.autonomous_discovery_intake.pair_coverage_pct >= 0 &&
      typeof baseline.autonomous_discovery_intake.max_paper_size_usd === "number" &&
      Array.isArray(baseline.autonomous_discovery_intake.items),
    "Autonomous discovery intake should publish coverage, pair mapping, size, and item rows.",
    baseline.autonomous_discovery_intake,
  );
  assert(
    baseline.autonomous_discovery_intake.items.every((item) =>
      ["attack", "probe", "refresh", "watch", "block"].includes(item.action) &&
      item.intake_score >= 0 &&
      item.intake_score <= 100 &&
      item.review_after_seconds > 0 &&
      item.reason.length > 0
    ),
    "Autonomous discovery intake should score candidate rows.",
    baseline.autonomous_discovery_intake,
  );
  const dataFreshnessGate = baseline.autonomous_data_freshness_gate;
  assert(dataFreshnessGate?.mode === "autonomous-data-freshness-gate", "Autonomous data freshness gate should be present.", dataFreshnessGate);
  assert(["clear", "tradeable", "refresh", "backfill", "blocked", "sample"].includes(dataFreshnessGate.status), "Autonomous data freshness gate should expose a known status.", dataFreshnessGate);
  assert(["allow-paper", "size-down", "refresh-stream", "fetch-candles", "refresh-quote", "stand-down"].includes(dataFreshnessGate.action), "Autonomous data freshness gate should expose a known action.", dataFreshnessGate);
  assert(typeof dataFreshnessGate.can_trade === "boolean", "Autonomous data freshness gate should publish trade permission.", dataFreshnessGate);
  assert(dataFreshnessGate.data_score >= 0 && dataFreshnessGate.data_score <= 100, "Autonomous data freshness gate score should be bounded.", dataFreshnessGate);
  assert(["dex-stream", "dex-rest", "paid-orders", "gecko-ohlcv", "jupiter-quote", "none"].includes(dataFreshnessGate.next_refresh_lane), "Autonomous data freshness gate should publish a known next refresh lane.", dataFreshnessGate);
  assert(dataFreshnessGate.size_multiplier >= 0 && dataFreshnessGate.size_multiplier <= 1.5, "Autonomous data freshness gate size multiplier should be bounded.", dataFreshnessGate);
  assert(dataFreshnessGate.max_next_fills >= 0 && dataFreshnessGate.max_next_fills <= 6, "Autonomous data freshness gate fill cap should be bounded.", dataFreshnessGate);
  assert(dataFreshnessGate.items.length === 6, "Autonomous data freshness gate should expose six evidence rows.", dataFreshnessGate);
  assert(
    ["stream", "discovery", "paid-orders", "ohlcv", "quote", "budget"].every((id) =>
      dataFreshnessGate.items.some((item) => item.id === id && ["pass", "watch", "fail"].includes(item.status) && item.score >= 0 && item.score <= 100 && item.value.length > 0 && item.detail.length > 0)
    ),
    "Autonomous data freshness gate should expose bounded evidence rows.",
    dataFreshnessGate,
  );
  assert(
    dataFreshnessGate.controls.some((control) => control.includes("DEX Screener")) &&
      dataFreshnessGate.controls.some((control) => control.includes("Jupiter-style read-only route quotes")) &&
      dataFreshnessGate.controls.some((control) => control.includes("does not open durable sockets")),
    "Autonomous data freshness gate should disclose provider coverage and read-only boundaries.",
    dataFreshnessGate,
  );
  const marketEvidenceFusion = baseline.autonomous_market_evidence_fusion;
  assert(marketEvidenceFusion?.mode === "autonomous-market-evidence-fusion", "Autonomous market evidence fusion should be present.", marketEvidenceFusion);
  assert(["attack", "selective", "refresh", "protect", "blocked", "watch", "sample", "idle"].includes(marketEvidenceFusion.status), "Market evidence fusion should expose a known status.", marketEvidenceFusion);
  assert(marketEvidenceFusion.fusion_score >= 0 && marketEvidenceFusion.fusion_score <= 100, "Market evidence fusion score should be bounded.", marketEvidenceFusion);
  assert(marketEvidenceFusion.organic_momentum_score >= 0 && marketEvidenceFusion.organic_momentum_score <= 100, "Market evidence fusion organic score should be bounded.", marketEvidenceFusion);
  assert(marketEvidenceFusion.promotion_noise_score >= 0 && marketEvidenceFusion.promotion_noise_score <= 100, "Market evidence fusion promo-noise score should be bounded.", marketEvidenceFusion);
  assert(marketEvidenceFusion.data_score >= 0 && marketEvidenceFusion.data_score <= 100, "Market evidence fusion data score should be bounded.", marketEvidenceFusion);
  assert(["dex-stream", "dex-rest", "paid-orders", "gecko-ohlcv", "jupiter-quote", "wallet-protect", "none"].includes(marketEvidenceFusion.provider_lane), "Market evidence fusion should publish a known provider lane.", marketEvidenceFusion);
  assert(["dex-stream", "dex-rest", "paid-orders", "gecko-ohlcv", "jupiter-quote", "none"].includes(marketEvidenceFusion.next_refresh_lane), "Market evidence fusion should publish a known refresh lane.", marketEvidenceFusion);
  assert(typeof marketEvidenceFusion.can_trade === "boolean", "Market evidence fusion should publish trade permission.", marketEvidenceFusion);
  assert(marketEvidenceFusion.max_next_fills >= 0 && marketEvidenceFusion.max_next_fills <= dataFreshnessGate.max_next_fills, "Market evidence fusion fills should respect the data freshness cap.", marketEvidenceFusion);
  assert(marketEvidenceFusion.items.length > 0, "Market evidence fusion should expose candidate rows.", marketEvidenceFusion);
  assert(
    marketEvidenceFusion.items.every((item) =>
      ["trade", "probe", "refresh-route", "refresh-candles", "protect", "reject", "watch"].includes(item.action) &&
      ["hot-tape", "route", "chart", "protection", "watch"].includes(item.lane) &&
      item.fusion_score >= 0 &&
      item.fusion_score <= 100 &&
      item.data_score >= 0 &&
      item.data_score <= 100 &&
      item.reason.length > 0 &&
      item.evidence.length >= 4
    ),
    "Market evidence fusion should expose bounded candidate evidence rows.",
    marketEvidenceFusion,
  );
  assert(
    marketEvidenceFusion.controls.some((control) => control.includes("hot-coin tape")) &&
      marketEvidenceFusion.controls.some((control) => control.includes("paper/read-only evidence layer")),
    "Market evidence fusion should disclose its evidence scope and paper boundary.",
    marketEvidenceFusion,
  );
  const signalNoiseDecision = baseline.autonomous_signal_noise_trade_decision;
  assert(signalNoiseDecision?.mode === "autonomous-signal-noise-trade-decision", "Autonomous signal/noise trade decision should be present.", signalNoiseDecision);
  assert(["attack", "probe", "protect", "refresh", "blocked", "watch", "idle"].includes(signalNoiseDecision.status), "Signal/noise trade decision should expose a known status.", signalNoiseDecision);
  assert(["paper-buy", "paper-probe", "protect", "refresh-route", "refresh-candles", "stand-down", "watch"].includes(signalNoiseDecision.action), "Signal/noise trade decision should expose a known action.", signalNoiseDecision);
  assert(signalNoiseDecision.signal_score >= 0 && signalNoiseDecision.signal_score <= 100, "Signal/noise decision signal score should be bounded.", signalNoiseDecision);
  assert(signalNoiseDecision.noise_score >= 0 && signalNoiseDecision.noise_score <= 100, "Signal/noise decision noise score should be bounded.", signalNoiseDecision);
  assert(signalNoiseDecision.route_score >= 0 && signalNoiseDecision.route_score <= 100, "Signal/noise decision route score should be bounded.", signalNoiseDecision);
  assert(signalNoiseDecision.chart_score >= 0 && signalNoiseDecision.chart_score <= 100, "Signal/noise decision chart score should be bounded.", signalNoiseDecision);
  assert(signalNoiseDecision.wallet_fit_score >= 0 && signalNoiseDecision.wallet_fit_score <= 100, "Signal/noise decision wallet-fit score should be bounded.", signalNoiseDecision);
  assert(signalNoiseDecision.data_score >= 0 && signalNoiseDecision.data_score <= 100, "Signal/noise decision data score should be bounded.", signalNoiseDecision);
  assert(signalNoiseDecision.decision_score >= 0 && signalNoiseDecision.decision_score <= 100, "Signal/noise decision score should be bounded.", signalNoiseDecision);
  assert(Number.isFinite(signalNoiseDecision.signal_to_noise_ratio) && signalNoiseDecision.signal_to_noise_ratio >= 0, "Signal/noise decision ratio should be non-negative.", signalNoiseDecision);
  assert(signalNoiseDecision.recommended_size_usd >= 0, "Signal/noise decision should expose a non-negative paper size.", signalNoiseDecision);
  assert(signalNoiseDecision.size_multiplier >= 0 && signalNoiseDecision.size_multiplier <= 1.5, "Signal/noise decision size multiplier should be bounded.", signalNoiseDecision);
  assert(signalNoiseDecision.max_next_fills >= 0 && signalNoiseDecision.max_next_fills <= dataFreshnessGate.max_next_fills, "Signal/noise decision fill cap should obey data freshness.", signalNoiseDecision);
  assert(typeof signalNoiseDecision.can_auto_paper === "boolean", "Signal/noise decision should publish paper permission.", signalNoiseDecision);
  assert(typeof signalNoiseDecision.should_refresh_route === "boolean", "Signal/noise decision should publish route-refresh pressure.", signalNoiseDecision);
  assert(typeof signalNoiseDecision.should_refresh_chart === "boolean", "Signal/noise decision should publish chart-refresh pressure.", signalNoiseDecision);
  assert(typeof signalNoiseDecision.should_protect_first === "boolean", "Signal/noise decision should publish protect-first pressure.", signalNoiseDecision);
  assert(signalNoiseDecision.summary.length > 0 && signalNoiseDecision.next_action.length > 0, "Signal/noise decision should explain its next action.", signalNoiseDecision);
  assert(signalNoiseDecision.evidence.length >= 4, "Signal/noise decision should expose fused evidence.", signalNoiseDecision);
  assert(
    signalNoiseDecision.controls.some((control) => control.includes("local paper")) &&
      signalNoiseDecision.controls.some((control) => control.includes("live signing")),
    "Signal/noise decision should disclose local paper and live-signing boundaries.",
    signalNoiseDecision,
  );
  if (signalNoiseDecision.can_auto_paper) {
    assert(["paper-buy", "paper-probe"].includes(signalNoiseDecision.action), "Auto-paper permission should map to a paper buy or probe action.", signalNoiseDecision);
    assert(signalNoiseDecision.recommended_size_usd > 0, "Auto-paper permission should include a positive paper size.", signalNoiseDecision);
  }
  const executionRunway = baseline.autonomous_execution_runway;
  assert(executionRunway?.mode === "autonomous-execution-runway", "Autonomous execution runway should be present.", executionRunway);
  assert(["attack", "probe", "protect", "refresh", "blocked", "watch", "idle"].includes(executionRunway.status), "Execution runway should expose a known status.", executionRunway);
  assert(["paper-buy", "paper-probe", "paper-sell", "protect", "refresh-route", "refresh-candles", "stand-down", "watch"].includes(executionRunway.action), "Execution runway should expose a known action.", executionRunway);
  assert(["scan", "decide", "route", "paper", "wallet"].includes(executionRunway.next_step_id), "Execution runway should publish a known next step.", executionRunway);
  assert(executionRunway.runway_score >= 0 && executionRunway.runway_score <= 100, "Execution runway score should be bounded.", executionRunway);
  assert(executionRunway.latency_target_ms >= 250, "Execution runway should expose a latency target.", executionRunway);
  assert(executionRunway.next_tick_seconds > 0, "Execution runway should expose positive next-tick timing.", executionRunway);
  assert(executionRunway.ticks_per_minute >= 0, "Execution runway should expose non-negative tick throughput.", executionRunway);
  assert(executionRunway.paper_size_usd >= 0, "Execution runway should expose non-negative paper size.", executionRunway);
  assert(executionRunway.max_next_fills >= 0, "Execution runway should expose a non-negative fill cap.", executionRunway);
  assert(typeof executionRunway.can_auto_paper === "boolean", "Execution runway should publish paper permission.", executionRunway);
  assert(typeof executionRunway.should_refresh_route === "boolean", "Execution runway should publish route-refresh pressure.", executionRunway);
  assert(typeof executionRunway.should_refresh_chart === "boolean", "Execution runway should publish chart-refresh pressure.", executionRunway);
  assert(typeof executionRunway.should_protect_first === "boolean", "Execution runway should publish protect-first pressure.", executionRunway);
  assert(typeof executionRunway.route_vetoed === "boolean", "Execution runway should publish route veto state.", executionRunway);
  assert(typeof executionRunway.chart_refresh_required === "boolean", "Execution runway should publish chart-refresh state.", executionRunway);
  assert(["paper-ledger-only", "read-only-route-refresh", "read-only-chart-refresh", "blocked-paper-only"].includes(executionRunway.execution_boundary), "Execution runway should disclose a known execution boundary.", executionRunway);
  assert(executionRunway.summary.length > 0 && executionRunway.next_action.length > 0, "Execution runway should explain its next action.", executionRunway);
  assert(JSON.stringify(executionRunway.steps.map((step) => step.id)) === JSON.stringify(["scan", "decide", "route", "paper", "wallet"]), "Execution runway should expose the expected five-step timeline.", executionRunway);
  assert(executionRunway.steps.every((step) =>
    ["ready", "running", "waiting", "blocked", "done"].includes(step.status) &&
    ["paper-buy", "paper-probe", "paper-sell", "protect", "refresh-route", "refresh-candles", "stand-down", "watch"].includes(step.action) &&
    step.score >= 0 &&
    step.score <= 100 &&
    step.notional_usd >= 0 &&
    step.eta_seconds > 0 &&
    step.detail.length > 0
  ), "Execution runway steps should expose bounded scored details.", executionRunway);
  assert(
    executionRunway.controls.some((control) => control.includes("immediate paper-runway receipt")) &&
      executionRunway.controls.some((control) => control.includes("live signing")),
    "Execution runway should disclose its paper/read-only and live-signing boundaries.",
    executionRunway,
  );
  assert(baseline.live_scanner_readiness?.mode === "live-scanner-readiness", "Live scanner readiness should be present.", baseline.live_scanner_readiness);
  assert(
    ["attack-ready", "probe-ready", "refresh-first", "blocked", "sample", "idle"].includes(baseline.live_scanner_readiness.status),
    "Live scanner readiness should expose a known status.",
    baseline.live_scanner_readiness,
  );
  assert(
    baseline.live_scanner_readiness.controls.some((control) => control.includes("read-only scanner evidence")),
    "Live scanner readiness should disclose its read-only evidence boundary.",
    baseline.live_scanner_readiness,
  );
  assert(
    baseline.live_scanner_readiness.items.every((item) =>
      ["attack", "probe", "refresh", "watch", "protect", "blocked"].includes(item.action) &&
      item.scanner_score >= 0 &&
      item.scanner_score <= 100 &&
      item.route_score >= 0 &&
      item.source_confirmation_score >= 0 &&
      item.evidence.some((entry) => entry.includes("DEX stream freshness")) &&
      item.next_action.length > 0
    ),
    "Live scanner readiness should score candidate intake rows.",
    baseline.live_scanner_readiness,
  );
  assert(baseline.autonomous_alpha_quality?.mode === "autonomous-alpha-quality", "Autonomous alpha quality should be present.", baseline.autonomous_alpha_quality);
  assert(
    ["attack", "probe", "refresh", "watch", "protect", "blocked", "sample"].includes(baseline.autonomous_alpha_quality.status),
    "Autonomous alpha quality should expose a known status.",
    baseline.autonomous_alpha_quality,
  );
  assert(
    baseline.autonomous_alpha_quality.controls.some((control) => control.includes("paid-order evidence")),
    "Autonomous alpha quality should disclose its paid-order/source evidence rule.",
    baseline.autonomous_alpha_quality,
  );
  assert(
    baseline.autonomous_alpha_quality.items.every((item) =>
      ["paper-attack", "paper-probe", "refresh-first", "watch", "protect", "blocked"].includes(item.action) &&
      item.alpha_quality_score >= 0 &&
      item.alpha_quality_score <= 100 &&
      item.noise_score >= 0 &&
      item.noise_score <= 100 &&
      item.evidence.some((entry) => entry.includes("organic confirmation")) &&
      item.decision.length > 0
    ),
    "Autonomous alpha quality should score candidate quality/noise rows.",
    baseline.autonomous_alpha_quality,
  );
  assert(baseline.autonomous_tradeability_simulator?.mode === "autonomous-tradeability-simulator", "Autonomous tradeability simulator should be present.", baseline.autonomous_tradeability_simulator);
  assert(
    ["fillable", "probe", "resize", "requote", "protect", "blocked", "watch", "sample"].includes(baseline.autonomous_tradeability_simulator.status),
    "Autonomous tradeability simulator should expose a known status.",
    baseline.autonomous_tradeability_simulator,
  );
  assert(
    baseline.autonomous_tradeability_simulator.controls.some((control) => control.includes("route confidence")),
    "Autonomous tradeability simulator should disclose route/depth/fill controls.",
    baseline.autonomous_tradeability_simulator,
  );
  assert(
    baseline.autonomous_tradeability_simulator.items.every((item) =>
      ["paper-fill", "paper-probe", "resize", "requote", "protect", "blocked", "watch"].includes(item.action) &&
      item.tradeability_score >= 0 &&
      item.tradeability_score <= 100 &&
      item.simulated_fill_rate_pct >= 0 &&
      item.simulated_fill_rate_pct <= 100 &&
      item.modeled_slippage_bps >= 0 &&
      item.evidence.some((entry) => entry.includes("route confidence")) &&
      item.decision.length > 0
    ),
    "Autonomous tradeability simulator should score route/fill/slippage rows.",
    baseline.autonomous_tradeability_simulator,
  );
  assert(baseline.autonomous_tradeability_execution?.mode === "tradeability-paper-execution", "Tradeability paper execution should be present.", baseline.autonomous_tradeability_execution);
  assert(
    ["queued", "applied", "blocked", "idle"].includes(baseline.autonomous_tradeability_execution.status),
    "Tradeability paper execution should expose a known status.",
    baseline.autonomous_tradeability_execution,
  );
  assert(
    baseline.autonomous_tradeability_execution.execution_boundary === "paper-ledger-only" &&
      typeof baseline.autonomous_tradeability_execution.paper_trade_ready === "boolean" &&
      typeof baseline.autonomous_tradeability_execution.ledger_applied === "boolean" &&
      baseline.autonomous_tradeability_execution.paper_size_usd >= 0 &&
      baseline.autonomous_tradeability_execution.controls.some((control) => control.includes("bounded local paper-ledger buy")),
    "Tradeability paper execution should disclose bounded local paper behavior.",
    baseline.autonomous_tradeability_execution,
  );
  assert(baseline.autonomous_fill_ledger_digest?.mode === "autonomous-fill-ledger-digest", "Fill ledger digest should be present.", baseline.autonomous_fill_ledger_digest);
  assert(
    ["pressing", "profitable", "protecting", "cooldown", "learning", "idle"].includes(baseline.autonomous_fill_ledger_digest.status),
    "Fill ledger digest should expose a known status.",
    baseline.autonomous_fill_ledger_digest,
  );
  assert(
    baseline.autonomous_fill_ledger_digest.recent_fill_count <= Math.min(8, baseline.trade_tape.length),
    "Fill ledger digest should summarize recent paper fills.",
    baseline.autonomous_fill_ledger_digest,
  );
  assert(
    baseline.autonomous_fill_ledger_digest.controls.some((control) => control.includes("local paper-ledger fills")),
    "Fill ledger digest should disclose its local paper boundary.",
    baseline.autonomous_fill_ledger_digest,
  );
  assert(Array.isArray(baseline.autonomous_fill_ledger_digest.items), "Fill ledger digest should expose recent fill rows.", baseline.autonomous_fill_ledger_digest);
  assert(
    baseline.autonomous_fill_ledger_digest.items.every((item) =>
      ["press", "keep", "tighten", "protect"].includes(item.discipline) &&
      ["profitable", "learning", "dragging", "protective"].includes(item.status)
    ),
    "Fill ledger rows should expose known learning discipline and status values.",
    baseline.autonomous_fill_ledger_digest,
  );
  assert(baseline.autonomous_tick_plan?.mode === "autonomous-tick-plan", "Tick plan should be present.", baseline.autonomous_tick_plan);
  assert(
    ["trade", "protect", "refresh", "observe", "stand-down", "blocked"].includes(baseline.autonomous_tick_plan.status),
    "Tick plan should return a known status.",
    baseline.autonomous_tick_plan,
  );
  assert(
    ["burst", "steady", "refresh-first", "protect-first", "cooldown", "blocked"].includes(baseline.autonomous_tick_plan.throughput_mode),
    "Tick plan should expose a known throughput mode.",
    baseline.autonomous_tick_plan,
  );
  assert(baseline.autonomous_tick_plan.max_actions_next_minute >= 0, "Tick plan should expose bounded next-minute actions.", baseline.autonomous_tick_plan);
  assert(baseline.autonomous_tick_plan.execution_slots_remaining >= 0, "Tick plan should expose remaining execution slots.", baseline.autonomous_tick_plan);
  assert(baseline.autonomous_tick_plan.bundle_action_count >= 0, "Tick plan should expose a next-minute bundle count.", baseline.autonomous_tick_plan);
  assert(
    baseline.autonomous_tick_plan.bundle_action_count <= baseline.autonomous_tick_plan.max_actions_next_minute,
    "Tick plan bundle should stay inside next-minute throughput.",
    baseline.autonomous_tick_plan,
  );
  assert(baseline.autonomous_tick_plan.bundle_trade_count >= 0, "Tick plan should expose bundled paper execution count.", baseline.autonomous_tick_plan);
  assert(baseline.autonomous_tick_plan.bundle_refresh_count >= 0, "Tick plan should expose bundled refresh count.", baseline.autonomous_tick_plan);
  assert(baseline.autonomous_tick_plan.bundle_expected_edge_usd >= 0, "Tick plan should expose bundled expected edge.", baseline.autonomous_tick_plan);
  assert(baseline.autonomous_tick_plan.bundle_trade_budget_usd >= 0, "Tick plan should expose bundled trade budget.", baseline.autonomous_tick_plan);
  assert(baseline.autonomous_tick_plan.bundle_summary.length > 0, "Tick plan should explain its next-minute bundle.", baseline.autonomous_tick_plan);
  assert(baseline.autonomous_tick_plan.next_minute_trade_budget_usd >= 0, "Tick plan should expose next-minute paper trade budget.", baseline.autonomous_tick_plan);
  assert(baseline.autonomous_tick_plan.throttle_reason.length > 0, "Tick plan should explain its throughput throttle.", baseline.autonomous_tick_plan);
  const baselineEdgeTickItem = baseline.autonomous_tick_plan.items.find((item) => item.id === "tick-plan-edge-action");
  assert(baselineEdgeTickItem, "Tick plan should include the fused edge-action lane.", baseline.autonomous_tick_plan);
  assert(baselineEdgeTickItem.lane === "edge", "Edge tick-plan item should use the edge lane.", baselineEdgeTickItem);
  assert(
    ["trade-now", "protect-now", "refresh-routes", "stand-down"].includes(baselineEdgeTickItem.action),
    "Edge tick-plan item should map to a known loop action.",
    baselineEdgeTickItem,
  );
  assert(
    baseline.autonomous_tick_plan.controls.some((control) => control.includes("fused edge action")),
    "Tick plan should disclose that fused edge action can lead the loop.",
    baseline.autonomous_tick_plan,
  );
  assert(baseline.autonomous_tick_governor?.mode === "autonomous-tick-governor", "Tick governor should be present.", baseline.autonomous_tick_governor);
  assert(
    ["run-now", "protect-first", "refresh-first", "observe", "paused", "blocked"].includes(baseline.autonomous_tick_governor.status),
    "Tick governor should expose a known status.",
    baseline.autonomous_tick_governor,
  );
  assert(
    ["trade", "protect", "refresh-routes", "refresh-market", "observe", "pause"].includes(baseline.autonomous_tick_governor.action),
    "Tick governor should expose a known action.",
    baseline.autonomous_tick_governor,
  );
  assert(typeof baseline.autonomous_tick_governor.can_auto_advance === "boolean", "Tick governor should publish auto-advance permission.", baseline.autonomous_tick_governor);
  assert(typeof baseline.autonomous_tick_governor.protective_sell_override === "boolean", "Tick governor should publish protective sell override state.", baseline.autonomous_tick_governor);
  assert(baseline.autonomous_tick_governor.protective_sell_release_usd >= 0, "Tick governor should publish non-negative protective release sizing.", baseline.autonomous_tick_governor);
  assert(
    ["ready", "sell-first", "route-refresh", "market-refresh", "cooldown", "blocked"].includes(baseline.autonomous_tick_governor.rearm_mode),
    "Tick governor should publish a known re-arm mode.",
    baseline.autonomous_tick_governor,
  );
  assert(baseline.autonomous_tick_governor.rearm_eta_seconds >= 0, "Tick governor should publish a non-negative re-arm ETA.", baseline.autonomous_tick_governor);
  assert(
    Array.isArray(baseline.autonomous_tick_governor.rearm_steps) &&
      baseline.autonomous_tick_governor.rearm_steps.length > 0 &&
      baseline.autonomous_tick_governor.rearm_steps.every((step) => typeof step === "string" && step.length > 0),
    "Tick governor should publish readable re-arm steps.",
    baseline.autonomous_tick_governor,
  );
  assert(typeof baseline.autonomous_tick_governor.should_trade === "boolean", "Tick governor should publish trade permission.", baseline.autonomous_tick_governor);
  assert(
    !baseline.autonomous_tick_governor.should_trade || (baseline.autonomous_tick_governor.can_auto_advance && baseline.autonomous_tick_governor.action === "trade"),
    "Tick governor trade permission should only appear on an auto-advance trade action.",
    baseline.autonomous_tick_governor,
  );
  assert(
    !baseline.autonomous_tick_governor.should_request_route_quote || baseline.autonomous_tick_governor.action === "refresh-routes",
    "Tick governor route-quote permission should only appear on a route-refresh action.",
    baseline.autonomous_tick_governor,
  );
  assert(baseline.autonomous_tick_governor.next_tick_seconds >= 0, "Tick governor should expose a next-tick clock.", baseline.autonomous_tick_governor);
  assert(baseline.autonomous_tick_governor.decision_score >= 0 && baseline.autonomous_tick_governor.decision_score <= 100, "Tick governor should score the next decision.", baseline.autonomous_tick_governor);
  assert(baseline.autonomous_tick_governor.confidence_score >= 0 && baseline.autonomous_tick_governor.confidence_score <= 100, "Tick governor should score confidence.", baseline.autonomous_tick_governor);
  assert(
    Array.isArray(baseline.autonomous_tick_governor.checks) && baseline.autonomous_tick_governor.checks.length === 6,
    "Tick governor should expose the six autonomous checks.",
    baseline.autonomous_tick_governor,
  );
  assert(
    baseline.autonomous_tick_governor.controls.some((control) => control.includes("local paper-only")),
    "Tick governor should disclose the local paper-only boundary.",
    baseline.autonomous_tick_governor,
  );
  assert(
    baseline.autonomous_tick_governor.controls.some((control) => control.includes("fresh paper buys remain paused")),
    "Tick governor should disclose the sell-only protect-first override.",
    baseline.autonomous_tick_governor,
  );
  assert(
    baseline.autonomous_tick_governor.controls.some((control) => control.includes("read-only re-arm steps")),
    "Tick governor should disclose read-only re-arm behavior.",
    baseline.autonomous_tick_governor,
  );
  assert(baseline.autonomous_tick_bundle_execution?.mode === "tick-bundle-paper-rehearsal", "Tick bundle rehearsal should be present.", baseline.autonomous_tick_bundle_execution);
  assert(
    ["ready", "applied", "refresh-only", "blocked", "empty", "mixed"].includes(baseline.autonomous_tick_bundle_execution.status),
    "Tick bundle rehearsal should expose a known status.",
    baseline.autonomous_tick_bundle_execution,
  );
  assert(baseline.autonomous_tick_bundle_execution.execution_boundary === "paper-ledger-only", "Tick bundle rehearsal should stay paper-only.", baseline.autonomous_tick_bundle_execution);
  assert(
    ["requesting", "ready", "blocked", "watching", "idle"].includes(baseline.autonomous_tick_bundle_execution.route_refresh_status),
    "Tick bundle rehearsal should expose route freshness status.",
    baseline.autonomous_tick_bundle_execution,
  );
  assert(typeof baseline.autonomous_tick_bundle_execution.route_refresh_vetoed === "boolean", "Tick bundle rehearsal should disclose route veto status.", baseline.autonomous_tick_bundle_execution);
  assert(
    baseline.autonomous_tick_bundle_execution.route_refresh_blocker === null ||
      typeof baseline.autonomous_tick_bundle_execution.route_refresh_blocker === "string",
    "Tick bundle rehearsal should expose a nullable route blocker.",
    baseline.autonomous_tick_bundle_execution,
  );
  assert(baseline.autonomous_tick_bundle_execution.route_vetoed_count >= 0, "Tick bundle rehearsal should count route-vetoed lanes.", baseline.autonomous_tick_bundle_execution);
  assert(
    baseline.autonomous_tick_bundle_execution.bundle_size <= baseline.autonomous_tick_plan.max_actions_next_minute + baseline.autonomous_tick_bundle_execution.applied_trade_count,
    "Tick bundle rehearsal should keep ready lanes inside throughput while preserving applied lanes.",
    baseline.autonomous_tick_bundle_execution,
  );
  assert(baseline.autonomous_tick_bundle_execution.summary.length > 0, "Tick bundle rehearsal should explain its status.", baseline.autonomous_tick_bundle_execution);
  assert(baseline.autonomous_tick_bundle_execution.next_action.length > 0, "Tick bundle rehearsal should publish a next action.", baseline.autonomous_tick_bundle_execution);
  assert(
    baseline.autonomous_tick_bundle_execution.controls.some((control) => control.includes("bounded local paper fills")),
    "Tick bundle rehearsal should disclose bounded paper apply behavior.",
    baseline.autonomous_tick_bundle_execution,
  );
  assert(
    baseline.autonomous_tick_bundle_execution.controls.some((control) => control.includes("paper-ledger boundary")),
    "Tick bundle rehearsal should disclose the existing paper-ledger boundary.",
    baseline.autonomous_tick_bundle_execution,
  );
  assert(
    baseline.autonomous_tick_bundle_execution.controls.some((control) => control.includes("route-refresh execution")),
    "Tick bundle rehearsal should disclose the route freshness veto.",
    baseline.autonomous_tick_bundle_execution,
  );
  if (baseline.autonomous_tick_bundle_execution.route_refresh_vetoed) {
    assert(Boolean(baseline.autonomous_tick_bundle_execution.route_refresh_blocker), "Route-vetoed tick bundle should include the blocker.", baseline.autonomous_tick_bundle_execution);
    assert(baseline.autonomous_tick_bundle_execution.route_vetoed_count > 0, "Route-vetoed tick bundle should count vetoed lanes.", baseline.autonomous_tick_bundle_execution);
    assert(
      baseline.autonomous_tick_bundle_execution.items.every((item) => !(item.status === "ready" && item.side === "buy" && item.lane === "entry")),
      "Route-vetoed tick bundle should not leave fresh entry buys ready.",
      baseline.autonomous_tick_bundle_execution,
    );
  }
  assert(baseline.autonomous_tick_bundle_feedback?.mode === "tick-bundle-feedback-governor", "Tick bundle feedback governor should be present.", baseline.autonomous_tick_bundle_feedback);
  assert(
    ["press", "selective", "cooldown", "protect", "idle"].includes(baseline.autonomous_tick_bundle_feedback.status),
    "Tick bundle feedback should expose a known status.",
    baseline.autonomous_tick_bundle_feedback,
  );
  assert(baseline.autonomous_tick_bundle_feedback.bundle_quality_score >= 0 && baseline.autonomous_tick_bundle_feedback.bundle_quality_score <= 100, "Tick bundle feedback should score bundle quality.", baseline.autonomous_tick_bundle_feedback);
  assert(baseline.autonomous_tick_bundle_feedback.next_bundle_trade_cap >= 0, "Tick bundle feedback should publish a next bundle trade cap.", baseline.autonomous_tick_bundle_feedback);
  assert(baseline.autonomous_tick_bundle_feedback.next_size_multiplier >= 0, "Tick bundle feedback should publish a sizing multiplier.", baseline.autonomous_tick_bundle_feedback);
  assert(baseline.autonomous_tick_bundle_feedback.summary.length > 0, "Tick bundle feedback should explain its status.", baseline.autonomous_tick_bundle_feedback);
  assert(baseline.autonomous_tick_bundle_feedback.next_action.length > 0, "Tick bundle feedback should publish a next action.", baseline.autonomous_tick_bundle_feedback);
  assert(
    baseline.autonomous_tick_bundle_feedback.controls.some((control) => control.includes("local paper-ledger sizing")),
    "Tick bundle feedback should disclose that it only governs local paper sizing.",
    baseline.autonomous_tick_bundle_feedback,
  );
  assert(baseline.autonomous_lane_capital_controller?.mode === "autonomous-lane-capital-controller", "Lane capital controller should be present.", baseline.autonomous_lane_capital_controller);
  assert(
    ["press", "balanced", "selective", "cooldown", "protect", "idle"].includes(baseline.autonomous_lane_capital_controller.status),
    "Lane capital should expose a known status.",
    baseline.autonomous_lane_capital_controller,
  );
  assert(baseline.autonomous_lane_capital_controller.total_lane_budget_usd >= 0, "Lane capital should publish a non-negative lane budget.", baseline.autonomous_lane_capital_controller);
  assert(baseline.autonomous_lane_capital_controller.max_trade_usd >= 0, "Lane capital should publish a non-negative max trade.", baseline.autonomous_lane_capital_controller);
  assert(baseline.autonomous_lane_capital_controller.summary.length > 0, "Lane capital should explain its status.", baseline.autonomous_lane_capital_controller);
  assert(baseline.autonomous_lane_capital_controller.next_action.length > 0, "Lane capital should publish a next action.", baseline.autonomous_lane_capital_controller);
  assert(
    baseline.autonomous_lane_capital_controller.controls.some((control) => control.includes("local paper capital")),
    "Lane capital should disclose that it only allocates local paper capital.",
    baseline.autonomous_lane_capital_controller,
  );
  assert(
    baseline.autonomous_lane_capital_controller.items.every((item) =>
      ["press", "fund", "probe", "cooldown", "stop", "protect"].includes(item.status) &&
      item.lane_budget_usd >= 0 &&
      item.max_trade_usd >= 0 &&
      item.confidence_score >= 0 &&
      item.confidence_score <= 100
    ),
    "Lane capital rows should publish bounded per-lane budgets.",
    baseline.autonomous_lane_capital_controller,
  );
  assert(
    baseline.autonomous_profit_allocation_plan.items.every((item) =>
      ["press", "fund", "probe", "release", "cooldown", "stop"].includes(item.action) &&
      ["pass", "watch", "fail"].includes(item.status) &&
      item.allocation_weight_pct >= 0 &&
      item.allocation_weight_pct <= 100 &&
      item.budget_usd >= 0 &&
      item.max_trade_usd >= 0 &&
      item.confidence_score >= 0 &&
      item.confidence_score <= 100
    ),
    "Profit allocation rows should publish bounded per-lane next-cycle sizing.",
    baseline.autonomous_profit_allocation_plan,
  );
  assert(baseline.autonomous_regime_tape?.mode === "autonomous-regime-tape", "Autonomous regime tape should be present.", baseline.autonomous_regime_tape);
  assert(
    ["attack", "scalp", "rotate", "distribute", "protect", "chop", "idle"].includes(baseline.autonomous_regime_tape.status),
    "Regime tape should expose a known status.",
    baseline.autonomous_regime_tape,
  );
  assert(baseline.autonomous_regime_tape.average_regime_score >= 0 && baseline.autonomous_regime_tape.average_regime_score <= 100, "Regime tape should publish a bounded regime score.", baseline.autonomous_regime_tape);
  assert(baseline.autonomous_regime_tape.average_risk_score >= 0 && baseline.autonomous_regime_tape.average_risk_score <= 100, "Regime tape should publish a bounded risk score.", baseline.autonomous_regime_tape);
  assert(baseline.autonomous_regime_tape.max_buy_usd >= 0, "Regime tape should publish a non-negative max buy.", baseline.autonomous_regime_tape);
  assert(baseline.autonomous_regime_tape.summary.length > 0, "Regime tape should explain its status.", baseline.autonomous_regime_tape);
  assert(baseline.autonomous_regime_tape.next_action.length > 0, "Regime tape should publish a next action.", baseline.autonomous_regime_tape);
  assert(
    baseline.autonomous_regime_tape.controls.some((control) => control.includes("local simulator control")),
    "Regime tape should disclose that it only governs the local simulator.",
    baseline.autonomous_regime_tape,
  );
  assert(
    baseline.autonomous_regime_tape.items.every((item) =>
      ["breakout", "scalp", "rotation", "distribution", "rug-risk", "dead-chop"].includes(item.regime) &&
      ["attack", "scalp", "probe", "rotate", "trim", "protect", "avoid"].includes(item.action) &&
      item.regime_score >= 0 &&
      item.regime_score <= 100 &&
      item.risk_score >= 0 &&
      item.risk_score <= 100 &&
      item.max_buy_usd >= 0
    ),
    "Regime tape rows should publish bounded per-symbol regimes.",
    baseline.autonomous_regime_tape,
  );
  assert(baseline.autonomous_wallet_growth_director?.mode === "autonomous-wallet-growth-director", "Wallet growth director should be present.", baseline.autonomous_wallet_growth_director);
  assert(
    ["press", "scalp", "compound", "harvest", "protect", "recover", "pause", "idle"].includes(baseline.autonomous_wallet_growth_director.status),
    "Wallet growth director should expose a known status.",
    baseline.autonomous_wallet_growth_director,
  );
  assert(baseline.autonomous_wallet_growth_director.growth_score >= 0 && baseline.autonomous_wallet_growth_director.growth_score <= 100, "Wallet growth director should publish a bounded growth score.", baseline.autonomous_wallet_growth_director);
  assert(baseline.autonomous_wallet_growth_director.risk_score >= 0 && baseline.autonomous_wallet_growth_director.risk_score <= 100, "Wallet growth director should publish a bounded risk score.", baseline.autonomous_wallet_growth_director);
  assert(baseline.autonomous_wallet_growth_director.portfolio_heat_score >= 0 && baseline.autonomous_wallet_growth_director.portfolio_heat_score <= 100, "Wallet growth director should publish bounded portfolio heat.", baseline.autonomous_wallet_growth_director);
  assert(["open", "selective", "cooldown", "exit-only"].includes(baseline.autonomous_wallet_growth_director.fresh_entry_permission), "Wallet growth director should expose a known fresh-entry permission.", baseline.autonomous_wallet_growth_director);
  assert(baseline.autonomous_wallet_growth_director.confidence_score >= 0 && baseline.autonomous_wallet_growth_director.confidence_score <= 100, "Wallet growth director should publish bounded confidence.", baseline.autonomous_wallet_growth_director);
  assert(baseline.autonomous_wallet_growth_director.max_fresh_buy_usd >= 0, "Wallet growth director should expose a non-negative fresh buy cap.", baseline.autonomous_wallet_growth_director);
  assert(baseline.autonomous_wallet_growth_director.heat_limited_buy_usd >= 0, "Wallet growth director should expose a non-negative heat-limited buy cap.", baseline.autonomous_wallet_growth_director);
  assert(
    baseline.autonomous_wallet_growth_director.max_fresh_buy_usd <= baseline.autonomous_wallet_growth_director.heat_limited_buy_usd ||
      baseline.autonomous_wallet_growth_director.status === "protect" ||
      baseline.autonomous_wallet_growth_director.status === "recover" ||
      baseline.autonomous_wallet_growth_director.status === "pause",
    "Wallet growth director fresh-buy cap should respect the heat-limited buy envelope.",
    baseline.autonomous_wallet_growth_director,
  );
  assert(baseline.autonomous_wallet_growth_director.summary.length > 0, "Wallet growth director should summarize the wallet posture.", baseline.autonomous_wallet_growth_director);
  assert(baseline.autonomous_wallet_growth_director.next_action.length > 0, "Wallet growth director should publish a next action.", baseline.autonomous_wallet_growth_director);
  assert(
    baseline.autonomous_wallet_growth_director.controls.some((control) => control.includes("paper/simulator control")) &&
      baseline.autonomous_wallet_growth_director.controls.some((control) => control.includes("heat-capped")),
    "Wallet growth director should disclose simulator and heat-capped buy limits.",
    baseline.autonomous_wallet_growth_director,
  );
  assert(
    baseline.autonomous_wallet_growth_director.items.every((item) =>
      ["wallet", "regime", "capital", "execution", "portfolio", "loop"].includes(item.id) &&
      ["pass", "watch", "fail"].includes(item.status) &&
      ["press", "scalp", "compound", "harvest", "protect", "recover", "pause"].includes(item.action) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.budget_usd >= 0
    ),
    "Wallet growth director rows should expose bounded evidence.",
    baseline.autonomous_wallet_growth_director,
  );
  assert(baseline.autonomous_reentry_hunter?.mode === "autonomous-reentry-hunter", "Re-entry hunter should be present.", baseline.autonomous_reentry_hunter);
  assert(
    ["rebuy", "probe", "watch", "blocked", "idle"].includes(baseline.autonomous_reentry_hunter.status),
    "Re-entry hunter should expose a known status.",
    baseline.autonomous_reentry_hunter,
  );
  assert(baseline.autonomous_reentry_hunter.max_reentry_usd >= 0, "Re-entry hunter should publish a non-negative rebuy cap.", baseline.autonomous_reentry_hunter);
  assert(baseline.autonomous_reentry_hunter.expected_edge_usd >= 0, "Re-entry hunter should publish a non-negative expected edge.", baseline.autonomous_reentry_hunter);
  assert(baseline.autonomous_reentry_hunter.fastest_review_seconds > 0, "Re-entry hunter should publish a positive review cadence.", baseline.autonomous_reentry_hunter);
  assert(baseline.autonomous_reentry_hunter.summary.length > 0, "Re-entry hunter should summarize its decision.", baseline.autonomous_reentry_hunter);
  assert(baseline.autonomous_reentry_hunter.next_action.length > 0, "Re-entry hunter should publish a next action.", baseline.autonomous_reentry_hunter);
  assert(
    baseline.autonomous_reentry_hunter.controls.some((control) => control.includes("paper/simulator control")),
    "Re-entry hunter should disclose that it only controls the simulator.",
    baseline.autonomous_reentry_hunter,
  );
  assert(
    baseline.autonomous_reentry_hunter.items.every((item) =>
      ["rebuy", "probe", "wait", "blocked"].includes(item.action) &&
      ["ready", "watch", "blocked"].includes(item.status) &&
      item.reentry_score >= 0 &&
      item.reentry_score <= 100 &&
      item.reclaim_score >= 0 &&
      item.reclaim_score <= 100 &&
      item.signal_score >= 0 &&
      item.signal_score <= 100 &&
      item.risk_score >= 0 &&
      item.risk_score <= 100 &&
      item.last_exit_size_usd >= 0 &&
      item.recommended_size_usd >= 0 &&
      item.expected_edge_usd >= 0 &&
      item.review_after_seconds > 0
    ),
    "Re-entry hunter rows should expose bounded reclaim evidence.",
    baseline.autonomous_reentry_hunter,
  );
  assert(baseline.autonomous_profit_route_selector?.mode === "autonomous-profit-route-selector", "Profit route selector should be present.", baseline.autonomous_profit_route_selector);
  assert(
    ["execute", "selective", "protect", "observe", "blocked", "idle"].includes(baseline.autonomous_profit_route_selector.status),
    "Profit route selector should expose a known status.",
    baseline.autonomous_profit_route_selector,
  );
  assert(baseline.autonomous_profit_route_selector.selected_score >= 0 && baseline.autonomous_profit_route_selector.selected_score <= 100, "Profit route selector should publish a bounded selected score.", baseline.autonomous_profit_route_selector);
  assert(baseline.autonomous_profit_route_selector.max_buy_usd >= 0, "Profit route selector should publish a non-negative max buy.", baseline.autonomous_profit_route_selector);
  assert(baseline.autonomous_profit_route_selector.release_usd >= 0, "Profit route selector should publish a non-negative release amount.", baseline.autonomous_profit_route_selector);
  assert(baseline.autonomous_profit_route_selector.average_fill_quality_score >= 0 && baseline.autonomous_profit_route_selector.average_fill_quality_score <= 100, "Profit route selector should publish bounded fill quality.", baseline.autonomous_profit_route_selector);
  assert(baseline.autonomous_profit_route_selector.summary.length > 0, "Profit route selector should summarize its route decision.", baseline.autonomous_profit_route_selector);
  assert(baseline.autonomous_profit_route_selector.next_action.length > 0, "Profit route selector should publish a next action.", baseline.autonomous_profit_route_selector);
  assert(
    baseline.autonomous_profit_route_selector.controls.some((control) => control.includes("paper/simulator control")),
    "Profit route selector should disclose that it only controls the simulator.",
    baseline.autonomous_profit_route_selector,
  );
  assert(
    baseline.autonomous_profit_route_selector.items.every((item) =>
      ["command-center", "high-frequency", "opportunity-race", "market-intelligence", "market-pulse", "trend-chase", "reentry-hunter", "portfolio-protect", "route-profit", "wallet-growth"].includes(item.lane) &&
      ["execute", "queue", "protect", "resize", "observe", "block"].includes(item.action) &&
      ["selected", "ready", "watch", "blocked"].includes(item.status) &&
      ["buy", "sell", "hold"].includes(item.side) &&
      item.route_score >= 0 &&
      item.route_score <= 100 &&
      item.fill_quality_score >= 0 &&
      item.fill_quality_score <= 100 &&
      item.notional_usd >= 0 &&
      item.risk_usd >= 0
    ),
    "Profit route selector rows should expose bounded ranked lanes.",
    baseline.autonomous_profit_route_selector,
  );
  assert(baseline.autonomous_profit_lane_scoreboard?.mode === "autonomous-profit-lane-scoreboard", "Profit lane scoreboard should be present.", baseline.autonomous_profit_lane_scoreboard);
  assert(
    ["press", "selective", "protect", "cooldown", "blocked", "idle"].includes(baseline.autonomous_profit_lane_scoreboard.status),
    "Profit lane scoreboard should expose a known status.",
    baseline.autonomous_profit_lane_scoreboard,
  );
  assert(baseline.autonomous_profit_lane_scoreboard.make_money_score >= 0 && baseline.autonomous_profit_lane_scoreboard.make_money_score <= 100, "Profit lane make-money score should be bounded.", baseline.autonomous_profit_lane_scoreboard);
  assert(baseline.autonomous_profit_lane_scoreboard.expected_net_profit_usd >= 0, "Profit lane scoreboard should expose non-negative expected edge.", baseline.autonomous_profit_lane_scoreboard);
  assert(baseline.autonomous_profit_lane_scoreboard.trade_frequency_score >= 0 && baseline.autonomous_profit_lane_scoreboard.trade_frequency_score <= 100, "Profit lane trade-frequency score should be bounded.", baseline.autonomous_profit_lane_scoreboard);
  assert(baseline.autonomous_profit_lane_scoreboard.capital_efficiency_score >= 0 && baseline.autonomous_profit_lane_scoreboard.capital_efficiency_score <= 100, "Profit lane capital-efficiency score should be bounded.", baseline.autonomous_profit_lane_scoreboard);
  assert(baseline.autonomous_profit_lane_scoreboard.ready_lane_count >= 0, "Profit lane scoreboard should expose ready lane count.", baseline.autonomous_profit_lane_scoreboard);
  assert(baseline.autonomous_profit_lane_scoreboard.blocked_lane_count >= 0, "Profit lane scoreboard should expose blocked lane count.", baseline.autonomous_profit_lane_scoreboard);
  assert(baseline.autonomous_profit_lane_scoreboard.review_after_seconds > 0, "Profit lane scoreboard should expose a positive review cadence.", baseline.autonomous_profit_lane_scoreboard);
  assert(
    baseline.autonomous_profit_lane_scoreboard.controls.some((control) => control.includes("make-money goal")) &&
      baseline.autonomous_profit_lane_scoreboard.controls.some((control) => control.includes("does not sign swaps")),
    "Profit lane scoreboard should disclose its make-money role and paper-only boundary.",
    baseline.autonomous_profit_lane_scoreboard,
  );
  assert(
    baseline.autonomous_profit_lane_scoreboard.items.length > 0 &&
      baseline.autonomous_profit_lane_scoreboard.items.every((item) =>
        ["command-center", "high-frequency", "opportunity-race", "market-intelligence", "market-pulse", "trend-chase", "reentry-hunter", "portfolio-protect", "route-profit", "wallet-growth"].includes(item.lane) &&
        ["press", "probe", "protect", "refresh", "stand-down"].includes(item.action) &&
        ["leader", "ready", "watch", "blocked", "protect"].includes(item.status) &&
        ["buy", "sell", "hold"].includes(item.side) &&
        item.rank_score >= 0 &&
        item.rank_score <= 100 &&
        item.fill_quality_score >= 0 &&
        item.fill_quality_score <= 100 &&
        item.notional_usd >= 0 &&
        item.review_after_seconds > 0
      ),
    "Profit lane scoreboard should expose bounded make-money lane rows.",
    baseline.autonomous_profit_lane_scoreboard,
  );
  assert(baseline.autonomous_position_situation_board?.mode === "autonomous-position-situation-board", "Position situation board should be present.", baseline.autonomous_position_situation_board);
  assert(
    ["exit", "harvest", "trim", "defend", "refresh", "watch", "idle"].includes(baseline.autonomous_position_situation_board.status),
    "Position situation board should expose a known status.",
    baseline.autonomous_position_situation_board,
  );
  assert(baseline.autonomous_position_situation_board.held_count >= 0, "Position situation board should expose held count.", baseline.autonomous_position_situation_board);
  assert(baseline.autonomous_position_situation_board.release_usd >= 0, "Position situation board should expose non-negative release notional.", baseline.autonomous_position_situation_board);
  assert(baseline.autonomous_position_situation_board.protected_profit_usd >= 0, "Position situation board should expose non-negative protected profit.", baseline.autonomous_position_situation_board);
  assert(baseline.autonomous_position_situation_board.capital_at_risk_usd >= 0, "Position situation board should expose non-negative capital at risk.", baseline.autonomous_position_situation_board);
  assert(baseline.autonomous_position_situation_board.average_situation_score >= 0 && baseline.autonomous_position_situation_board.average_situation_score <= 100, "Position situation average score should be bounded.", baseline.autonomous_position_situation_board);
  assert(baseline.autonomous_position_situation_board.fastest_review_seconds > 0, "Position situation board should expose a positive review cadence.", baseline.autonomous_position_situation_board);
  assert(
    baseline.autonomous_position_situation_board.controls.some((control) => control.includes("fresh paper buys")) &&
      baseline.autonomous_position_situation_board.controls.some((control) => control.includes("does not sign swaps")),
    "Position situation board should disclose fresh-buy gating and paper-only boundary.",
    baseline.autonomous_position_situation_board,
  );
  assert(
    baseline.autonomous_position_situation_board.items.every((item) =>
      ["exit", "trim", "harvest", "defend", "refresh", "trail", "press", "hold"].includes(item.action) &&
      ["urgent", "ready", "refresh", "defend", "watch", "blocked"].includes(item.status) &&
      ["now", "next", "watch"].includes(item.priority) &&
      item.situation_score >= 0 &&
      item.situation_score <= 100 &&
      item.confidence_score >= 0 &&
      item.confidence_score <= 100 &&
      item.position_usd >= 0 &&
      item.release_usd >= 0 &&
      item.review_after_seconds > 0
    ),
    "Position situation board should expose bounded held-coin rows.",
    baseline.autonomous_position_situation_board,
  );
  const portfolioMarkBoard = baseline.autonomous_portfolio_mark_board;
  assert(portfolioMarkBoard?.mode === "autonomous-portfolio-mark-board", "Portfolio mark board should be present.", portfolioMarkBoard);
  assert(
    ["compound", "harvest", "protect", "exit", "watch", "idle"].includes(portfolioMarkBoard.status),
    "Portfolio mark board should expose a known status.",
    portfolioMarkBoard,
  );
  assert(portfolioMarkBoard.held_count === baseline.portfolio.open_positions.length, "Portfolio mark board should match open position count.", portfolioMarkBoard);
  assert(portfolioMarkBoard.items.length === baseline.portfolio.open_positions.length, "Portfolio mark rows should match open position count.", portfolioMarkBoard);
  assert(portfolioMarkBoard.equity_usd >= 0 && portfolioMarkBoard.cash_usd >= 0 && portfolioMarkBoard.exposure_usd >= 0, "Portfolio mark board should expose non-negative wallet values.", portfolioMarkBoard);
  assert(portfolioMarkBoard.exposure_pct >= 0, "Portfolio mark board should expose non-negative exposure percent.", portfolioMarkBoard);
  assert(portfolioMarkBoard.fastest_review_seconds > 0, "Portfolio mark board should expose a positive review cadence.", portfolioMarkBoard);
  assert(portfolioMarkBoard.release_pressure_usd >= 0 && portfolioMarkBoard.press_budget_usd >= 0, "Portfolio mark board should publish bounded action budgets.", portfolioMarkBoard);
  assert(
    portfolioMarkBoard.controls.some((control) => control.includes("mark-to-market")) &&
      portfolioMarkBoard.controls.some((control) => control.includes("cannot guarantee profit")),
    "Portfolio mark board should disclose mark-to-market scope and profit boundary.",
    portfolioMarkBoard,
  );
  assert(
    portfolioMarkBoard.items.every((item) =>
      ["press", "harvest", "trim", "exit", "protect", "refresh", "hold"].includes(item.action) &&
      ["winner", "watch", "risk", "exit", "idle"].includes(item.status) &&
      item.current_value_usd >= 0 &&
      item.cost_basis_usd >= 0 &&
      item.exposure_pct >= 0 &&
      item.suggested_release_usd >= 0 &&
      item.suggested_press_usd >= 0 &&
      item.review_after_seconds > 0 &&
      item.reason.length > 0
    ),
    "Portfolio mark board should expose bounded held-coin mark rows.",
    portfolioMarkBoard,
  );
  assert(baseline.autonomous_trading_directive?.mode === "autonomous-trading-directive", "Autonomous trading directive should be present.", baseline.autonomous_trading_directive);
  assert(
    ["paper-ready", "protect-first", "refresh-first", "selective", "blocked", "observe"].includes(baseline.autonomous_trading_directive.status),
    "Autonomous trading directive should expose a known status.",
    baseline.autonomous_trading_directive,
  );
  assert(
    ["protect", "harvest", "refresh", "attack", "probe", "stand-down", "observe"].includes(baseline.autonomous_trading_directive.action),
    "Autonomous trading directive should expose a known action.",
    baseline.autonomous_trading_directive,
  );
  assert(["buy", "sell", "hold"].includes(baseline.autonomous_trading_directive.side), "Autonomous trading directive should expose a known side.", baseline.autonomous_trading_directive);
  assert(baseline.autonomous_trading_directive.max_notional_usd >= 0, "Autonomous trading directive should expose non-negative max notional.", baseline.autonomous_trading_directive);
  assert(baseline.autonomous_trading_directive.release_usd >= 0, "Autonomous trading directive should expose non-negative release notional.", baseline.autonomous_trading_directive);
  assert(baseline.autonomous_trading_directive.expected_edge_usd >= 0, "Autonomous trading directive should expose non-negative expected edge.", baseline.autonomous_trading_directive);
  assert(baseline.autonomous_trading_directive.make_money_score >= 0 && baseline.autonomous_trading_directive.make_money_score <= 100, "Autonomous trading directive make-money score should be bounded.", baseline.autonomous_trading_directive);
  assert(baseline.autonomous_trading_directive.confidence_score >= 0 && baseline.autonomous_trading_directive.confidence_score <= 100, "Autonomous trading directive confidence should be bounded.", baseline.autonomous_trading_directive);
  assert(baseline.autonomous_trading_directive.review_after_seconds > 0, "Autonomous trading directive should expose a positive review cadence.", baseline.autonomous_trading_directive);
  assert(
    baseline.autonomous_trading_directive.controls.some((control) => control.includes("make-money goal")) &&
      baseline.autonomous_trading_directive.controls.some((control) => control.includes("does not sign swaps")),
    "Autonomous trading directive should disclose its make-money role and paper-only boundary.",
    baseline.autonomous_trading_directive,
  );
  assert(
    baseline.autonomous_trading_directive.evidence.length === 6 &&
      baseline.autonomous_trading_directive.evidence.every((item) =>
        ["position", "profit-lane", "ticket", "route", "wallet", "cadence"].includes(item.id) &&
        ["pass", "watch", "block"].includes(item.status) &&
        item.score >= 0 &&
        item.score <= 100 &&
        item.detail.length > 0
      ),
    "Autonomous trading directive should expose bounded evidence rows.",
    baseline.autonomous_trading_directive,
  );
  assert(baseline.autonomous_directive_outcome_auditor?.mode === "autonomous-directive-outcome-auditor", "Directive outcome auditor should be present.", baseline.autonomous_directive_outcome_auditor);
  assert(
    ["press", "keep", "tighten", "protect", "refresh", "blocked", "observe"].includes(baseline.autonomous_directive_outcome_auditor.status),
    "Directive outcome auditor should expose a known status.",
    baseline.autonomous_directive_outcome_auditor,
  );
  assert(
    ["press-size", "hold-size", "shrink-size", "protect-first", "refresh-evidence", "stand-down", "observe"].includes(baseline.autonomous_directive_outcome_auditor.action),
    "Directive outcome auditor should expose a known action.",
    baseline.autonomous_directive_outcome_auditor,
  );
  assert(baseline.autonomous_directive_outcome_auditor.outcome_score >= 0 && baseline.autonomous_directive_outcome_auditor.outcome_score <= 100, "Directive outcome score should be bounded.", baseline.autonomous_directive_outcome_auditor);
  assert(baseline.autonomous_directive_outcome_auditor.wallet_trend_score >= 0 && baseline.autonomous_directive_outcome_auditor.wallet_trend_score <= 100, "Directive wallet trend score should be bounded.", baseline.autonomous_directive_outcome_auditor);
  assert(baseline.autonomous_directive_outcome_auditor.directive_edge_score >= 0 && baseline.autonomous_directive_outcome_auditor.directive_edge_score <= 100, "Directive edge audit score should be bounded.", baseline.autonomous_directive_outcome_auditor);
  assert(baseline.autonomous_directive_outcome_auditor.execution_followthrough_score >= 0 && baseline.autonomous_directive_outcome_auditor.execution_followthrough_score <= 100, "Directive follow-through score should be bounded.", baseline.autonomous_directive_outcome_auditor);
  assert(baseline.autonomous_directive_outcome_auditor.size_multiplier >= 0, "Directive outcome size multiplier should be non-negative.", baseline.autonomous_directive_outcome_auditor);
  assert(baseline.autonomous_directive_outcome_auditor.next_notional_usd >= 0, "Directive outcome next notional should be non-negative.", baseline.autonomous_directive_outcome_auditor);
  assert(baseline.autonomous_directive_outcome_auditor.release_target_usd >= 0, "Directive outcome release target should be non-negative.", baseline.autonomous_directive_outcome_auditor);
  assert(baseline.autonomous_directive_outcome_auditor.review_after_seconds > 0, "Directive outcome auditor should expose a positive review cadence.", baseline.autonomous_directive_outcome_auditor);
  assert(
    baseline.autonomous_directive_outcome_auditor.controls.some((control) => control.includes("make-money directive")) &&
      baseline.autonomous_directive_outcome_auditor.controls.some((control) => control.includes("does not sign swaps")),
    "Directive outcome auditor should disclose its make-money feedback role and paper-only boundary.",
    baseline.autonomous_directive_outcome_auditor,
  );
  assert(
    baseline.autonomous_directive_outcome_auditor.items.length === 6 &&
      baseline.autonomous_directive_outcome_auditor.items.every((item) =>
        ["directive", "wallet", "execution", "route", "positions", "cadence"].includes(item.id) &&
        ["pass", "watch", "fail"].includes(item.status) &&
        item.score >= 0 &&
        item.score <= 100 &&
        item.detail.length > 0
      ),
    "Directive outcome auditor should expose bounded evidence rows.",
    baseline.autonomous_directive_outcome_auditor,
  );
  assert(baseline.autonomous_reaction_loop?.mode === "autonomous-reaction-loop", "Autonomous reaction loop should be present.", baseline.autonomous_reaction_loop);
  assert(
    ["press", "scalp", "protect", "refresh", "cooldown", "blocked", "observe"].includes(baseline.autonomous_reaction_loop.status),
    "Autonomous reaction loop should expose a known status.",
    baseline.autonomous_reaction_loop,
  );
  assert(
    ["buy-now", "scalp-buy", "sell-now", "trim-now", "refresh-route", "refresh-chart", "cooldown", "stand-down", "observe"].includes(baseline.autonomous_reaction_loop.action),
    "Autonomous reaction loop should expose a known action.",
    baseline.autonomous_reaction_loop,
  );
  assert(["buy", "sell", "hold"].includes(baseline.autonomous_reaction_loop.side), "Autonomous reaction loop should expose a known side.", baseline.autonomous_reaction_loop);
  for (const [label, value] of Object.entries({
    urgency_score: baseline.autonomous_reaction_loop.urgency_score,
    buy_pressure_score: baseline.autonomous_reaction_loop.buy_pressure_score,
    sell_pressure_score: baseline.autonomous_reaction_loop.sell_pressure_score,
    route_pressure_score: baseline.autonomous_reaction_loop.route_pressure_score,
    wallet_pressure_score: baseline.autonomous_reaction_loop.wallet_pressure_score,
  })) {
    assert(value >= 0 && value <= 100, `Autonomous reaction loop ${label} should be bounded.`, baseline.autonomous_reaction_loop);
  }
  assert(baseline.autonomous_reaction_loop.max_notional_usd >= 0, "Autonomous reaction loop should expose non-negative max notional.", baseline.autonomous_reaction_loop);
  assert(baseline.autonomous_reaction_loop.release_usd >= 0, "Autonomous reaction loop should expose non-negative release amount.", baseline.autonomous_reaction_loop);
  assert(baseline.autonomous_reaction_loop.expected_edge_usd >= 0, "Autonomous reaction loop should expose non-negative expected edge.", baseline.autonomous_reaction_loop);
  assert(baseline.autonomous_reaction_loop.hft_cadence_seconds > 0, "Autonomous reaction loop should expose positive HFT cadence.", baseline.autonomous_reaction_loop);
  assert(baseline.autonomous_reaction_loop.invalidates_in_seconds > 0, "Autonomous reaction loop should expose positive invalidation timing.", baseline.autonomous_reaction_loop);
  assert(
    baseline.autonomous_reaction_loop.controls.some((control) => control.includes("next-few-seconds reaction")) &&
      baseline.autonomous_reaction_loop.controls.some((control) => control.includes("cannot sign swaps")),
    "Autonomous reaction loop should disclose its immediate-reaction role and paper-only boundary.",
    baseline.autonomous_reaction_loop,
  );
  assert(
    baseline.autonomous_reaction_loop.items.length === 7 &&
      baseline.autonomous_reaction_loop.items.every((item) =>
        ["market", "velocity", "directive", "outcome", "route", "wallet", "positions"].includes(item.id) &&
        ["pass", "watch", "fail"].includes(item.status) &&
        item.score >= 0 &&
        item.score <= 100 &&
        item.value.length > 0 &&
        item.detail.length > 0
      ),
    "Autonomous reaction loop should expose bounded evidence rows.",
    baseline.autonomous_reaction_loop,
  );
  assert(baseline.autonomous_landing_optimizer?.mode === "autonomous-landing-optimizer", "Autonomous landing optimizer should be present.", baseline.autonomous_landing_optimizer);
  assert(
    ["land-now", "priority", "managed", "paper", "refresh", "fee-drag", "signature-gated", "blocked", "idle"].includes(baseline.autonomous_landing_optimizer.status),
    "Autonomous landing optimizer should expose a known status.",
    baseline.autonomous_landing_optimizer,
  );
  assert(
    ["submit-managed", "use-sender", "router-submit", "paper-fill", "refresh-route", "tighten-fees", "request-signature", "stand-down", "observe"].includes(baseline.autonomous_landing_optimizer.action),
    "Autonomous landing optimizer should expose a known action.",
    baseline.autonomous_landing_optimizer,
  );
  assert(["paper-ledger", "jupiter-v2-managed", "jupiter-router-submit", "helius-sender", "blocked"].includes(baseline.autonomous_landing_optimizer.selected_path), "Autonomous landing optimizer should expose a known path.", baseline.autonomous_landing_optimizer);
  assert(["buy", "sell", "hold"].includes(baseline.autonomous_landing_optimizer.side), "Autonomous landing optimizer should expose a known side.", baseline.autonomous_landing_optimizer);
  for (const [label, value] of Object.entries({
    landing_score: baseline.autonomous_landing_optimizer.landing_score,
    landing_probability_pct: baseline.autonomous_landing_optimizer.landing_probability_pct,
  })) {
    assert(value >= 0 && value <= 100, `Autonomous landing optimizer ${label} should be bounded.`, baseline.autonomous_landing_optimizer);
  }
  for (const [label, value] of Object.entries({
    latency_target_ms: baseline.autonomous_landing_optimizer.latency_target_ms,
    ttl_seconds: baseline.autonomous_landing_optimizer.ttl_seconds,
    priority_fee_lamports: baseline.autonomous_landing_optimizer.priority_fee_lamports,
    sender_tip_lamports: baseline.autonomous_landing_optimizer.sender_tip_lamports,
    compute_unit_limit: baseline.autonomous_landing_optimizer.compute_unit_limit,
    compute_unit_price_micro_lamports: baseline.autonomous_landing_optimizer.compute_unit_price_micro_lamports,
    max_slippage_bps: baseline.autonomous_landing_optimizer.max_slippage_bps,
    expected_edge_usd: baseline.autonomous_landing_optimizer.expected_edge_usd,
    expected_fee_drag_usd: baseline.autonomous_landing_optimizer.expected_fee_drag_usd,
    expected_fee_drag_bps: baseline.autonomous_landing_optimizer.expected_fee_drag_bps,
  })) {
    assert(value >= 0, `Autonomous landing optimizer ${label} should be non-negative.`, baseline.autonomous_landing_optimizer);
  }
  assert(
    baseline.autonomous_landing_optimizer.controls.some((control) => control.includes("priority-fee")) &&
      baseline.autonomous_landing_optimizer.controls.some((control) => control.includes("cannot sign swaps")),
    "Autonomous landing optimizer should disclose fee planning and signer boundary.",
    baseline.autonomous_landing_optimizer,
  );
  assert(
    baseline.autonomous_landing_optimizer.items.length === 6 &&
      baseline.autonomous_landing_optimizer.items.every((item) =>
        ["landing", "fee", "latency", "slippage", "route", "signer"].includes(item.id) &&
        ["pass", "watch", "fail"].includes(item.status) &&
        item.score >= 0 &&
        item.score <= 100 &&
        item.value.length > 0 &&
        item.detail.length > 0
      ),
    "Autonomous landing optimizer should expose bounded evidence rows.",
    baseline.autonomous_landing_optimizer,
  );
  assert(baseline.autonomous_run_envelope?.mode === "autonomous-run-envelope", "Autonomous run envelope should be present.", baseline.autonomous_run_envelope);
  assert(
    ["running", "armed", "protect", "refresh", "observe", "cooldown", "blocked", "idle"].includes(baseline.autonomous_run_envelope.status),
    "Autonomous run envelope should expose a known status.",
    baseline.autonomous_run_envelope,
  );
  assert(
    ["run-session", "protect-book", "refresh-route", "refresh-market", "paper-observe", "cooldown", "stand-down"].includes(baseline.autonomous_run_envelope.action),
    "Autonomous run envelope should expose a known action.",
    baseline.autonomous_run_envelope,
  );
  assert(typeof baseline.autonomous_run_envelope.run_enabled === "boolean", "Autonomous run envelope should disclose run enablement.", baseline.autonomous_run_envelope);
  assert(typeof baseline.autonomous_run_envelope.keep_running === "boolean", "Autonomous run envelope should disclose keep-running posture.", baseline.autonomous_run_envelope);
  for (const [label, value] of Object.entries({
    next_wake_seconds: baseline.autonomous_run_envelope.next_wake_seconds,
    cadence_seconds: baseline.autonomous_run_envelope.cadence_seconds,
    max_session_ticks: baseline.autonomous_run_envelope.max_session_ticks,
    max_session_fills: baseline.autonomous_run_envelope.max_session_fills,
    max_trades_next_minute: baseline.autonomous_run_envelope.max_trades_next_minute,
    dex_calls_per_minute: baseline.autonomous_run_envelope.dex_calls_per_minute,
    pair_calls_per_minute: baseline.autonomous_run_envelope.pair_calls_per_minute,
    route_quotes_per_minute: baseline.autonomous_run_envelope.route_quotes_per_minute,
    provider_utilization_pct: baseline.autonomous_run_envelope.provider_utilization_pct,
    expected_profit_per_minute_usd: baseline.autonomous_run_envelope.expected_profit_per_minute_usd,
    expected_next_profit_usd: baseline.autonomous_run_envelope.expected_next_profit_usd,
    loop_score: baseline.autonomous_run_envelope.loop_score,
    run_confidence_score: baseline.autonomous_run_envelope.run_confidence_score,
  })) {
    assert(value >= 0, `Autonomous run envelope ${label} should be non-negative.`, baseline.autonomous_run_envelope);
  }
  assert(baseline.autonomous_run_envelope.next_wake_seconds > 0 && baseline.autonomous_run_envelope.next_wake_seconds <= 60, "Autonomous run envelope should publish a bounded next wake.", baseline.autonomous_run_envelope);
  assert(baseline.autonomous_run_envelope.provider_utilization_pct <= 100, "Autonomous run envelope provider utilization should be bounded.", baseline.autonomous_run_envelope);
  assert(baseline.autonomous_run_envelope.loop_score <= 100 && baseline.autonomous_run_envelope.run_confidence_score <= 100, "Autonomous run envelope scores should be bounded.", baseline.autonomous_run_envelope);
  assert(
    baseline.autonomous_run_envelope.controls.some((control) => control.includes("browser loop")) &&
      baseline.autonomous_run_envelope.controls.some((control) => control.includes("cannot sign or submit swaps")),
    "Autonomous run envelope should disclose browser-loop scope and signer boundary.",
    baseline.autonomous_run_envelope,
  );
  assert(
    baseline.autonomous_run_envelope.items.length === 7 &&
      baseline.autonomous_run_envelope.items.every((item) =>
        ["loop", "tick", "reaction", "landing", "provider", "wallet", "memory"].includes(item.id) &&
        ["pass", "watch", "fail"].includes(item.status) &&
        item.score >= 0 &&
        item.score <= 100 &&
        item.value.length > 0 &&
        item.detail.length > 0
      ),
    "Autonomous run envelope should expose bounded evidence rows.",
    baseline.autonomous_run_envelope,
  );
  const runGuard = baseline.autonomous_profit_run_guard;
  assert(runGuard?.mode === "autonomous-profit-run-guard", "Autonomous profit run guard should be present.", runGuard);
  assert(
    ["accelerate", "compound", "protect", "tighten", "refresh", "cooldown", "blocked", "idle"].includes(runGuard.status),
    "Autonomous profit run guard should expose a known status.",
    runGuard,
  );
  assert(
    ["increase-cadence", "keep-running", "tighten-size", "protect-wallet", "refresh-proof", "cooldown", "stand-down"].includes(runGuard.action),
    "Autonomous profit run guard should expose a known action.",
    runGuard,
  );
  assert(typeof runGuard.can_keep_running === "boolean", "Autonomous profit run guard should disclose keep-running permission.", runGuard);
  assert(typeof runGuard.can_increase_cadence === "boolean", "Autonomous profit run guard should disclose cadence permission.", runGuard);
  assert(typeof runGuard.blocks_fresh_buy === "boolean", "Autonomous profit run guard should disclose fresh-buy blocking.", runGuard);
  assert(runGuard.profit_guard_score >= 0 && runGuard.profit_guard_score <= 100, "Autonomous profit run guard score should be bounded.", runGuard);
  assert(runGuard.max_next_fills >= 0, "Autonomous profit run guard should publish non-negative fill caps.", runGuard);
  assert(runGuard.cadence_seconds >= 1 && runGuard.cadence_seconds <= 60, "Autonomous profit run guard should publish bounded cadence.", runGuard);
  assert(runGuard.next_review_seconds >= 1 && runGuard.next_review_seconds <= 60, "Autonomous profit run guard should publish bounded review timing.", runGuard);
  assert(runGuard.items.length === 8, "Autonomous profit run guard should expose eight evidence rows.", runGuard);
  assert(
    ["wallet", "forecast", "velocity", "objective", "memory", "churn", "lane", "run"].every((id) =>
      runGuard.items.some((item) => item.id === id && ["pass", "watch", "fail"].includes(item.status) && item.value.length > 0 && item.detail.length > 0)
    ),
    "Autonomous profit run guard should expose bounded evidence by guard lane.",
    runGuard,
  );
  assert(
    runGuard.controls.some((control) => control.includes("cannot guarantee profit")),
    "Autonomous profit run guard should disclose the profit-guarantee boundary.",
    runGuard,
  );
  const dailyProfitLock = baseline.autonomous_daily_profit_lock;
  assert(dailyProfitLock?.mode === "autonomous-daily-profit-lock", "Autonomous daily profit lock should be present.", dailyProfitLock);
  assert(["run", "lock-profit", "harvest", "protect", "cooldown", "stand-down"].includes(dailyProfitLock.status), "Autonomous daily profit lock should expose a known status.", dailyProfitLock);
  assert(["trade", "lock-gains", "harvest", "protect-only", "cooldown", "stand-down"].includes(dailyProfitLock.action), "Autonomous daily profit lock should expose a known action.", dailyProfitLock);
  assert(["open", "harvest-only", "protect-only", "paused", "stand-down"].includes(dailyProfitLock.loop_permission), "Autonomous daily profit lock should expose a known loop permission.", dailyProfitLock);
  assert(typeof dailyProfitLock.fresh_buy_allowed === "boolean", "Autonomous daily profit lock should publish fresh-buy permission.", dailyProfitLock);
  assert(typeof dailyProfitLock.protect_sell_allowed === "boolean", "Autonomous daily profit lock should publish protective-sell permission.", dailyProfitLock);
  assert(dailyProfitLock.target_net_pnl_usd > 0, "Autonomous daily profit lock should publish a positive target.", dailyProfitLock);
  assert(dailyProfitLock.target_remaining_usd >= 0, "Autonomous daily profit lock should publish non-negative target gap.", dailyProfitLock);
  assert(dailyProfitLock.stop_loss_usd > 0, "Autonomous daily profit lock should publish a positive stop loss.", dailyProfitLock);
  assert(dailyProfitLock.loss_budget_remaining_usd >= 0, "Autonomous daily profit lock should publish non-negative loss room.", dailyProfitLock);
  assert(dailyProfitLock.deploy_allowed_usd >= 0 && dailyProfitLock.release_required_usd >= 0, "Autonomous daily profit lock should publish bounded deploy/release numbers.", dailyProfitLock);
  assert(dailyProfitLock.max_next_fills >= 0, "Autonomous daily profit lock should publish non-negative fill cap.", dailyProfitLock);
  assert(dailyProfitLock.review_after_seconds > 0, "Autonomous daily profit lock should publish positive review timing.", dailyProfitLock);
  assert(dailyProfitLock.items.length === 6, "Autonomous daily profit lock should expose six evidence rows.", dailyProfitLock);
  assert(
    dailyProfitLock.items.every((item) =>
      ["target", "loss", "drawdown", "fresh-buy", "release", "memory"].includes(item.id) &&
      ["pass", "watch", "fail"].includes(item.status) &&
      item.value.length > 0 &&
      item.detail.length > 0
    ),
    "Autonomous daily profit lock evidence rows should be bounded.",
    dailyProfitLock,
  );
  assert(
    dailyProfitLock.controls.some((control) => control.includes("daily/session paper circuit breaker")) &&
      dailyProfitLock.controls.some((control) => control.includes("cannot guarantee profit")),
    "Autonomous daily profit lock should disclose paper circuit-breaker scope and profit boundary.",
    dailyProfitLock,
  );
  const replayGate = baseline.autonomous_replay_gate;
  assert(replayGate?.mode === "autonomous-replay-gate", "Autonomous replay gate should be present.", replayGate);
  assert(["approve", "size-down", "protect", "refresh", "blocked", "learning"].includes(replayGate.status), "Autonomous replay gate should expose a known status.", replayGate);
  assert(["approve-size", "reduce-size", "protect-only", "refresh-replay", "stand-down", "learn-more"].includes(replayGate.action), "Autonomous replay gate should expose a known action.", replayGate);
  assert(typeof replayGate.can_spend === "boolean", "Autonomous replay gate should publish spend permission.", replayGate);
  assert(replayGate.replay_score >= 0 && replayGate.replay_score <= 100, "Autonomous replay gate score should be bounded.", replayGate);
  assert(replayGate.size_multiplier >= 0 && replayGate.size_multiplier <= 1.5, "Autonomous replay gate size multiplier should be bounded.", replayGate);
  assert(replayGate.max_next_fills >= 0 && replayGate.max_next_fills <= 6, "Autonomous replay gate fill cap should be bounded.", replayGate);
  assert(["base", "breakout", "rug-risk"].includes(replayGate.best_regime), "Autonomous replay gate should publish a known best regime.", replayGate);
  assert(["base", "breakout", "rug-risk"].includes(replayGate.worst_regime), "Autonomous replay gate should publish a known worst regime.", replayGate);
  assert(replayGate.items.length === 6, "Autonomous replay gate should expose six evidence rows.", replayGate);
  assert(
    ["forward", "regime", "rug", "scorecard", "ticket", "queue"].every((id) =>
      replayGate.items.some((item) => item.id === id && ["pass", "watch", "fail"].includes(item.status) && item.score >= 0 && item.score <= 100 && item.value.length > 0 && item.detail.length > 0)
    ),
    "Autonomous replay gate should expose bounded evidence rows.",
    replayGate,
  );
  assert(
    replayGate.controls.some((control) => control.includes("base, breakout, and rug-risk")) &&
      replayGate.controls.some((control) => control.includes("cannot predict future PnL")),
    "Autonomous replay gate should disclose replay proof and paper-only boundaries.",
    replayGate,
  );
  const burstFillPlan = baseline.autonomous_burst_fill_plan;
  assert(burstFillPlan?.mode === "autonomous-burst-fill-plan", "Autonomous burst fill plan should be present.", burstFillPlan);
  assert(typeof burstFillPlan.plan_id === "string" && burstFillPlan.plan_id.includes(`burst-plan-${baseline.paper_account.cycle}`), "Autonomous burst fill plan should publish a cycle-scoped id.", burstFillPlan);
  assert(burstFillPlan.cycle === baseline.paper_account.cycle, "Autonomous burst fill plan should track the paper account cycle.", burstFillPlan);
  assert(["burst", "single", "protect", "refresh", "blocked", "idle"].includes(burstFillPlan.status), "Autonomous burst fill plan should expose a known status.", burstFillPlan);
  assert(["paper-ledger-only", "read-only-route-refresh", "blocked-paper-only"].includes(burstFillPlan.execution_boundary), "Autonomous burst fill plan should expose a known execution boundary.", burstFillPlan);
  assert(burstFillPlan.child_fill_count >= 0 && burstFillPlan.child_fill_count <= burstFillPlan.max_child_fills, "Autonomous burst fill plan child count should be bounded.", burstFillPlan);
  assert(burstFillPlan.max_child_fills <= dailyProfitLock.max_next_fills, "Autonomous burst fill plan should obey the daily profit lock fill cap.", { burstFillPlan, dailyProfitLock });
  assert(burstFillPlan.max_child_fills >= 0 && burstFillPlan.max_child_fills <= 6, "Autonomous burst fill plan max children should be bounded.", burstFillPlan);
  assert(burstFillPlan.feedback_child_fill_ceiling >= 0 && burstFillPlan.feedback_child_fill_ceiling <= 6, "Autonomous burst fill plan feedback ceiling should be bounded.", burstFillPlan);
  assert(burstFillPlan.max_child_fills <= burstFillPlan.feedback_child_fill_ceiling, "Autonomous burst fill plan should obey the prior feedback fill ceiling.", burstFillPlan);
  assert(burstFillPlan.max_child_fills <= dataFreshnessGate.max_next_fills, "Autonomous burst fill plan should obey the data freshness gate fill cap.", { burstFillPlan, dataFreshnessGate });
  assert(burstFillPlan.max_child_fills <= replayGate.max_next_fills, "Autonomous burst fill plan should obey the replay gate fill cap.", { burstFillPlan, replayGate });
  assert(burstFillPlan.prior_size_multiplier >= 0 && burstFillPlan.prior_size_multiplier <= 1.5, "Autonomous burst fill plan prior multiplier should be bounded.", burstFillPlan);
  assert(["clear", "tradeable", "refresh", "backfill", "blocked", "sample"].includes(burstFillPlan.data_gate_status), "Autonomous burst fill plan should keep the data freshness gate status.", burstFillPlan);
  assert(burstFillPlan.data_size_multiplier >= 0 && burstFillPlan.data_size_multiplier <= 1.5, "Autonomous burst fill plan data multiplier should be bounded.", burstFillPlan);
  assert(["approve", "size-down", "protect", "refresh", "blocked", "learning"].includes(burstFillPlan.replay_gate_status), "Autonomous burst fill plan should keep the replay gate status.", burstFillPlan);
  assert(burstFillPlan.replay_size_multiplier >= 0 && burstFillPlan.replay_size_multiplier <= 1.5, "Autonomous burst fill plan replay multiplier should be bounded.", burstFillPlan);
  assert(
    burstFillPlan.prior_feedback_action === null ||
      ["increase-next-burst", "keep-next-burst", "halve-next-burst", "protect-only", "refresh-proof", "stand-down", "observe"].includes(burstFillPlan.prior_feedback_action),
    "Autonomous burst fill plan should publish a known prior feedback action.",
    burstFillPlan,
  );
  assert(burstFillPlan.total_notional_usd >= 0 && burstFillPlan.child_notional_usd >= 0, "Autonomous burst fill plan should publish non-negative sizing.", burstFillPlan);
  assert(burstFillPlan.max_slippage_bps >= 50 && burstFillPlan.max_slippage_bps <= 2000, "Autonomous burst fill plan slippage should be bounded.", burstFillPlan);
  assert(burstFillPlan.fill_cadence_seconds >= 1 && burstFillPlan.next_review_seconds >= 1, "Autonomous burst fill plan should publish positive timing.", burstFillPlan);
  assert(burstFillPlan.children.length > 0, "Autonomous burst fill plan should publish child rows.", burstFillPlan);
  assert(
    burstFillPlan.children.every((child) =>
      ["ready", "capped", "refresh", "blocked", "idle"].includes(child.status) &&
      child.notional_usd >= 0 &&
      child.expected_edge_usd >= 0 &&
      child.max_slippage_bps >= 50 &&
      typeof child.can_execute_paper === "boolean"
    ),
    "Autonomous burst fill plan child rows should be bounded.",
    burstFillPlan,
  );
  assert(
    burstFillPlan.controls.some((control) => control.includes("child paper fills")) &&
      burstFillPlan.controls.some((control) => control.includes("prior burst feedback")) &&
      burstFillPlan.controls.some((control) => control.includes("data freshness gate multiplier")) &&
      burstFillPlan.controls.some((control) => control.includes("replay gate multiplier")) &&
      burstFillPlan.controls.some((control) => control.includes("Cannot sign") || control.includes("cannot sign")),
    "Autonomous burst fill plan should disclose child-fill scope and signer boundary.",
    burstFillPlan,
  );
  const burstOutcomeFeedback = baseline.autonomous_burst_outcome_feedback;
  assert(burstOutcomeFeedback?.mode === "autonomous-burst-outcome-feedback", "Autonomous burst outcome feedback should be present.", burstOutcomeFeedback);
  assert(["scale", "keep", "tighten", "protect", "blocked", "idle"].includes(burstOutcomeFeedback.status), "Autonomous burst outcome feedback should expose a known status.", burstOutcomeFeedback);
  assert(["increase-next-burst", "keep-next-burst", "halve-next-burst", "protect-only", "refresh-proof", "stand-down", "observe"].includes(burstOutcomeFeedback.action), "Autonomous burst outcome feedback should expose a known action.", burstOutcomeFeedback);
  assert(typeof burstOutcomeFeedback.can_scale_next_burst === "boolean", "Autonomous burst outcome feedback should publish scale permission.", burstOutcomeFeedback);
  assert(typeof burstOutcomeFeedback.should_halve_next_burst === "boolean", "Autonomous burst outcome feedback should publish tighten permission.", burstOutcomeFeedback);
  assert(typeof burstOutcomeFeedback.blocks_fresh_buy === "boolean", "Autonomous burst outcome feedback should publish fresh-buy block.", burstOutcomeFeedback);
  assert(burstOutcomeFeedback.outcome_score >= 0 && burstOutcomeFeedback.outcome_score <= 100, "Autonomous burst outcome feedback score should be bounded.", burstOutcomeFeedback);
  assert(burstOutcomeFeedback.fill_efficiency_pct >= 0 && burstOutcomeFeedback.fill_efficiency_pct <= 100, "Autonomous burst outcome feedback fill efficiency should be bounded.", burstOutcomeFeedback);
  assert(burstOutcomeFeedback.paper_quality_score >= 0 && burstOutcomeFeedback.paper_quality_score <= 100, "Autonomous burst outcome feedback paper quality should be bounded.", burstOutcomeFeedback);
  assert(burstOutcomeFeedback.churn_score >= 0 && burstOutcomeFeedback.churn_score <= 100, "Autonomous burst outcome feedback churn score should be bounded.", burstOutcomeFeedback);
  assert(burstOutcomeFeedback.projected_friction_usd >= 0, "Autonomous burst outcome feedback should publish non-negative projected friction.", burstOutcomeFeedback);
  assert(burstOutcomeFeedback.max_next_child_fills >= 0 && burstOutcomeFeedback.max_next_child_fills <= 6, "Autonomous burst outcome feedback fill ceiling should be bounded.", burstOutcomeFeedback);
  assert(burstOutcomeFeedback.review_after_seconds > 0, "Autonomous burst outcome feedback should publish positive review timing.", burstOutcomeFeedback);
  assert(burstOutcomeFeedback.items.length === 6, "Autonomous burst outcome feedback should expose six evidence rows.", burstOutcomeFeedback);
  assert(
    ["edge", "fill-quality", "churn", "wallet", "daily-lock", "route"].every((id) =>
      burstOutcomeFeedback.items.some((item) => item.id === id && ["pass", "watch", "fail"].includes(item.status) && item.score >= 0 && item.score <= 100 && item.value.length > 0 && item.detail.length > 0)
    ),
    "Autonomous burst outcome feedback should expose bounded evidence rows.",
    burstOutcomeFeedback,
  );
  assert(
    burstOutcomeFeedback.controls.some((control) => control.includes("next-cycle size multiplier")) &&
      burstOutcomeFeedback.controls.some((control) => control.includes("paper-trading feedback only")),
    "Autonomous burst outcome feedback should disclose size-feedback and paper-only boundaries.",
    burstOutcomeFeedback,
  );
  const burstFillExecution = baseline.autonomous_burst_fill_execution;
  assert(burstFillExecution?.mode === "autonomous-burst-fill-execution", "Autonomous burst fill execution should be present.", burstFillExecution);
  assert(["applied", "ready", "blocked", "idle"].includes(burstFillExecution.status), "Autonomous burst fill execution should expose a known status.", burstFillExecution);
  assert(typeof burstFillExecution.ledger_applied === "boolean", "Autonomous burst fill execution should publish ledger-applied state.", burstFillExecution);
  assert(burstFillExecution.requested_child_count >= 0 && burstFillExecution.requested_child_count <= 6, "Autonomous burst fill execution requested children should be bounded.", burstFillExecution);
  assert(burstFillExecution.applied_child_count >= 0 && burstFillExecution.applied_child_count <= burstFillExecution.requested_child_count, "Autonomous burst fill execution applied children should be bounded.", burstFillExecution);
  assert(burstFillExecution.planned_notional_usd >= 0 && burstFillExecution.applied_notional_usd >= 0, "Autonomous burst fill execution should publish non-negative notional.", burstFillExecution);
  assert(Array.isArray(burstFillExecution.last_trade_ids), "Autonomous burst fill execution should publish applied trade ids.", burstFillExecution);
  assert(
    burstFillExecution.controls.some((control) => control.includes("weighted-average paper scale-ins")) &&
      burstFillExecution.controls.some((control) => control.includes("Local paper ledger only")),
    "Autonomous burst fill execution should disclose scale-in and local-paper boundaries.",
    burstFillExecution,
  );
  const profitAccountability = baseline.autonomous_profit_accountability;
  assert(profitAccountability?.mode === "autonomous-profit-accountability", "Autonomous profit accountability should be present.", profitAccountability);
  assert(["press", "compound", "tighten", "protect", "blocked", "learning"].includes(profitAccountability.status), "Autonomous profit accountability should expose a known status.", profitAccountability);
  assert(["press-size", "keep-size", "tighten-size", "protect-wallet", "refresh-proof", "stand-down"].includes(profitAccountability.action), "Autonomous profit accountability should expose a known action.", profitAccountability);
  assert(typeof profitAccountability.making_money === "boolean", "Autonomous profit accountability should publish paper money-making state.", profitAccountability);
  assert(profitAccountability.accountability_score >= 0 && profitAccountability.accountability_score <= 100, "Autonomous profit accountability score should be bounded.", profitAccountability);
  assert(profitAccountability.next_size_multiplier >= 0 && profitAccountability.next_size_multiplier <= 1.5, "Autonomous profit accountability next multiplier should be bounded.", profitAccountability);
  assert(profitAccountability.max_next_fills >= 0 && profitAccountability.max_next_fills <= 6, "Autonomous profit accountability next fills should be bounded.", profitAccountability);
  assert(profitAccountability.fill_count >= 0 && profitAccountability.blocked_count >= 0, "Autonomous profit accountability should publish non-negative fill/block counts.", profitAccountability);
  assert(profitAccountability.items.length === 6, "Autonomous profit accountability should expose six evidence rows.", profitAccountability);
  assert(
    ["wallet", "scorecard", "fills", "burst", "directive", "session"].every((id) =>
      profitAccountability.items.some((item) => item.id === id && ["pass", "watch", "fail"].includes(item.status) && item.score >= 0 && item.score <= 100 && item.value.length > 0 && item.detail.length > 0)
    ),
    "Autonomous profit accountability should expose bounded evidence rows.",
    profitAccountability,
  );
  const loopThrottle = baseline.autonomous_loop_throttle;
  assert(loopThrottle?.mode === "autonomous-loop-throttle", "Autonomous loop throttle should be present.", loopThrottle);
  assert(["sprint", "cycle", "protect", "refresh", "cooldown", "blocked", "idle"].includes(loopThrottle.status), "Autonomous loop throttle should expose a known status.", loopThrottle);
  assert(["run-sprint", "run-cycle", "protect-book", "refresh-market", "cooldown", "stand-down"].includes(loopThrottle.action), "Autonomous loop throttle should expose a known action.", loopThrottle);
  assert(typeof loopThrottle.can_run === "boolean" && typeof loopThrottle.should_refresh_first === "boolean", "Autonomous loop throttle should expose run and refresh decisions.", loopThrottle);
  assert(loopThrottle.ticks >= 1 && loopThrottle.ticks <= 12, "Autonomous loop throttle ticks should be bounded.", loopThrottle);
  assert(loopThrottle.max_total_fills >= 0 && loopThrottle.max_total_fills <= 24, "Autonomous loop throttle fill cap should be bounded.", loopThrottle);
  assert(loopThrottle.max_fresh_buys >= 0 && loopThrottle.max_fresh_buys <= loopThrottle.max_total_fills, "Autonomous loop throttle fresh-buy cap should respect total fills.", loopThrottle);
  assert(loopThrottle.max_protective_sells >= 1 && loopThrottle.max_protective_sells <= 6, "Autonomous loop throttle protective-sell cap should be bounded.", loopThrottle);
  assert(loopThrottle.cadence_seconds >= 1 && loopThrottle.cadence_seconds <= 45, "Autonomous loop throttle cadence should be bounded.", loopThrottle);
  assert(loopThrottle.size_multiplier >= 0 && loopThrottle.size_multiplier <= 1.5, "Autonomous loop throttle size multiplier should be bounded.", loopThrottle);
  assert(loopThrottle.throttle_score >= 0 && loopThrottle.throttle_score <= 100, "Autonomous loop throttle score should be bounded.", loopThrottle);
  assert(loopThrottle.summary.length > 0 && loopThrottle.next_action.length > 0, "Autonomous loop throttle should explain its decision.", loopThrottle);
  assert(loopThrottle.items.length === 6, "Autonomous loop throttle should expose six evidence rows.", loopThrottle);
  assert(
    ["planner", "envelope", "guard", "lock", "accountability", "session"].every((id) =>
      loopThrottle.items.some((item) => item.id === id && ["pass", "watch", "fail"].includes(item.status) && item.score >= 0 && item.score <= 100 && item.value.length > 0 && item.detail.length > 0)
    ),
    "Autonomous loop throttle should expose bounded evidence rows.",
    loopThrottle,
  );
  const wakePlan = baseline.autonomous_wake_plan;
  assert(wakePlan?.mode === "autonomous-wake-plan", "Autonomous wake plan should be present.", wakePlan);
  assert(["minute", "sprint", "cycle", "protect", "refresh", "cooldown", "blocked"].includes(wakePlan.status), "Autonomous wake plan should expose a known status.", wakePlan);
  assert(["profit-velocity", "data-freshness", "loop-throttle", "run-envelope", "profit-guard"].includes(wakePlan.trigger), "Autonomous wake plan should expose a known trigger.", wakePlan);
  assert(["run-minute", "run-loop", "refresh-read", "stand-down"].includes(wakePlan.next_client_action), "Autonomous wake plan should expose a known client action.", wakePlan);
  assert(typeof wakePlan.can_auto_watch_run === "boolean" && typeof wakePlan.should_refresh_first === "boolean", "Autonomous wake plan should expose run and refresh decisions.", wakePlan);
  assert(wakePlan.next_wake_seconds >= 1 && wakePlan.next_wake_seconds <= 60, "Autonomous wake plan should bound the next browser wake.", wakePlan);
  assert(wakePlan.next_wake_at && !Number.isNaN(Date.parse(wakePlan.next_wake_at)), "Autonomous wake plan should publish a parseable next wake time.", wakePlan);
  assert(wakePlan.queued_action_count >= 0, "Autonomous wake plan should expose non-negative queued actions.", wakePlan);
  assert(wakePlan.max_total_fills >= 0 && wakePlan.max_total_fills <= 24, "Autonomous wake plan should bound total fills.", wakePlan);
  assert(wakePlan.max_fresh_buys >= 0 && wakePlan.max_fresh_buys <= wakePlan.max_total_fills, "Autonomous wake plan fresh buys should respect total fills.", wakePlan);
  assert(wakePlan.max_protective_sells >= 1 && wakePlan.max_protective_sells <= 6, "Autonomous wake plan protective sells should be bounded.", wakePlan);
  assert(wakePlan.deploy_budget_usd >= 0 && wakePlan.release_budget_usd >= 0, "Autonomous wake plan should expose non-negative capital budgets.", wakePlan);
  assert(wakePlan.summary.length > 0 && wakePlan.next_action.length > 0, "Autonomous wake plan should explain its decision.", wakePlan);
  assert(
    wakePlan.controls.some((control) => control.includes("Server-authored next wake plan")) &&
      wakePlan.controls.some((control) => control.includes("cannot sign")),
    "Autonomous wake plan should disclose server authority and live-trading boundary.",
    wakePlan,
  );
  assert(wakePlan.items.length === 6, "Autonomous wake plan should expose six evidence rows.", wakePlan);
  assert(
    ["velocity", "freshness", "throttle", "envelope", "guard", "queue"].every((id) =>
      wakePlan.items.some((item) => item.id === id && ["pass", "watch", "fail"].includes(item.status) && item.score >= 0 && item.score <= 100 && item.value.length > 0 && item.detail.length > 0)
    ),
    "Autonomous wake plan should expose bounded evidence rows.",
    wakePlan,
  );
  if (wakePlan.status === "minute") {
    assert(wakePlan.next_client_action === "run-minute", "Minute wake plan should run the minute loop.", wakePlan);
  }
  if (wakePlan.status === "refresh") {
    assert(wakePlan.next_client_action === "refresh-read" && wakePlan.should_refresh_first === true, "Refresh wake plan should refresh before acting.", wakePlan);
  }
  const loopFeedback = baseline.autonomous_loop_feedback;
  assert(loopFeedback?.mode === "autonomous-loop-feedback", "Autonomous loop feedback should be present.", loopFeedback);
  assert(["press", "keep", "tighten", "protect", "cooldown", "learning", "idle"].includes(loopFeedback.status), "Loop feedback should expose a known status.", loopFeedback);
  assert(loopFeedback.feedback_score >= 0 && loopFeedback.feedback_score <= 100, "Loop feedback score should be bounded.", loopFeedback);
  assert(loopFeedback.size_multiplier >= 0 && loopFeedback.size_multiplier <= 1.35, "Loop feedback size multiplier should be bounded.", loopFeedback);
  assert(loopFeedback.cadence_seconds > 0 && loopFeedback.cadence_seconds <= 30, "Loop feedback cadence should be bounded.", loopFeedback);
  assert(loopFeedback.max_next_fills >= 0 && loopFeedback.max_next_fills <= 6, "Loop feedback fill cap should be bounded.", loopFeedback);
  assert(typeof loopFeedback.should_pause_fresh_buys === "boolean" && typeof loopFeedback.should_protect_first === "boolean", "Loop feedback should publish pause/protect decisions.", loopFeedback);
  assert(loopFeedback.items.length === 5, "Loop feedback should expose five evidence rows.", loopFeedback);
  assert(
    ["tick-pnl", "wallet", "fills", "tactic", "session"].every((id) =>
      loopFeedback.items.some((item) => item.id === id && ["pass", "watch", "fail"].includes(item.status) && item.score >= 0 && item.score <= 100 && item.value.length > 0 && item.detail.length > 0)
    ),
    "Loop feedback should expose bounded evidence rows.",
    loopFeedback,
  );
  assert(loopFeedback.controls.some((control) => control.includes("Feeds size, cadence, fill caps")), "Loop feedback should disclose that it feeds the throttle.", loopFeedback);
  const profitIntegrity = baseline.autonomous_profit_integrity_circuit;
  assert(profitIntegrity?.mode === "autonomous-profit-integrity-circuit", "Autonomous profit integrity circuit should be present.", profitIntegrity);
  assert(["press", "continue", "probe", "protect", "cooldown", "blocked", "learning"].includes(profitIntegrity.status), "Profit integrity should expose a known status.", profitIntegrity);
  assert(["scale", "trade", "probe", "protect-only", "cooldown", "stand-down"].includes(profitIntegrity.permission), "Profit integrity should expose a known permission.", profitIntegrity);
  assert(["increase-frequency", "keep-running", "single-probe", "protect-wallet", "cooldown", "stand-down"].includes(profitIntegrity.action), "Profit integrity should expose a known action.", profitIntegrity);
  assert(profitIntegrity.integrity_score >= 0 && profitIntegrity.integrity_score <= 100, "Profit integrity score should be bounded.", profitIntegrity);
  assert(profitIntegrity.size_multiplier >= 0 && profitIntegrity.size_multiplier <= 1.35, "Profit integrity size multiplier should be bounded.", profitIntegrity);
  assert(profitIntegrity.cadence_seconds > 0 && profitIntegrity.cadence_seconds <= 45, "Profit integrity cadence should be bounded.", profitIntegrity);
  assert(profitIntegrity.max_next_fills >= 0 && profitIntegrity.max_next_fills <= 6, "Profit integrity fill cap should be bounded.", profitIntegrity);
  assert(typeof profitIntegrity.can_continue === "boolean" && typeof profitIntegrity.should_pause_fresh_buys === "boolean" && typeof profitIntegrity.should_protect_first === "boolean", "Profit integrity should publish continue/pause/protect decisions.", profitIntegrity);
  assert(profitIntegrity.items.length === 6, "Profit integrity should expose six evidence rows.", profitIntegrity);
  assert(
    ["validator", "forecast", "execution", "safety", "accountability", "loop"].every((id) =>
      profitIntegrity.items.some((item) => item.id === id && ["pass", "watch", "fail"].includes(item.status) && item.score >= 0 && item.score <= 100 && item.value.length > 0 && item.detail.length > 0)
    ),
    "Profit integrity should expose bounded validator, forecast, execution, safety, accountability, and loop evidence rows.",
    profitIntegrity,
  );
  assert(
    profitIntegrity.controls.some((control) => control.includes("Closes the autonomous profit loop")) &&
      profitIntegrity.controls.some((control) => control.includes("Feeds a single size multiplier")),
    "Profit integrity should disclose closed-loop proof and throttle feedback.",
    profitIntegrity,
  );
  const loopTickReport = baseline.autonomous_loop_tick;
  assert(loopTickReport?.mode === "autonomous-loop-tick", "Autonomous loop tick report should be present.", loopTickReport);
  assert(loopTickReport.requested === false, "Baseline loop tick report should be idle until requested.", loopTickReport);
  assert(["idle", "refreshed", "session-run", "stand-down"].includes(loopTickReport.status), "Autonomous loop tick report should expose a known status.", loopTickReport);
  assert(["none", "run-sprint", "run-cycle", "protect-book", "refresh-market", "cooldown", "stand-down"].includes(loopTickReport.action), "Autonomous loop tick report should expose a known action.", loopTickReport);
  assert(loopTickReport.selected_tactic_label === baseline.autonomous_strategy_selector.selected_label, "Baseline loop tick should carry the selected tactic label.", loopTickReport);
  assert(["none", "press", "probe", "compound", "protect", "refresh", "cooldown", "idle"].includes(loopTickReport.selected_tactic_status), "Loop tick tactic status should be known.", loopTickReport);
  assert(loopTickReport.tactic_confidence_score >= 0 && loopTickReport.tactic_confidence_score <= 100, "Loop tick tactic confidence should be bounded.", loopTickReport);
  assert(loopTickReport.tactic_max_trade_usd >= 0, "Loop tick tactic cap should be non-negative.", loopTickReport);
  assert(loopTickReport.tactic_cadence_seconds >= 0, "Loop tick tactic cadence should be non-negative.", loopTickReport);
  assert(loopTickReport.summary.length > 0 && loopTickReport.next_action.length > 0, "Autonomous loop tick report should explain itself.", loopTickReport);
  assert(
    profitAccountability.controls.some((control) => control.includes("paper wallet PnL")) &&
      profitAccountability.controls.some((control) => control.includes("Local paper-accountability only")),
    "Autonomous profit accountability should disclose profit proof and paper-only boundaries.",
    profitAccountability,
  );
  assert(baseline.autonomous_execution_quality_arbiter?.mode === "autonomous-execution-quality-arbiter", "Execution quality arbiter should be present.", baseline.autonomous_execution_quality_arbiter);
  assert(
    ["execute", "selective", "paper-only", "repair", "blocked", "idle"].includes(baseline.autonomous_execution_quality_arbiter.status),
    "Execution quality arbiter should expose a known status.",
    baseline.autonomous_execution_quality_arbiter,
  );
  assert(baseline.autonomous_execution_quality_arbiter.selected_score >= 0 && baseline.autonomous_execution_quality_arbiter.selected_score <= 100, "Execution quality arbiter should publish a bounded selected score.", baseline.autonomous_execution_quality_arbiter);
  assert(baseline.autonomous_execution_quality_arbiter.max_buy_usd >= 0, "Execution quality arbiter should publish a non-negative max buy.", baseline.autonomous_execution_quality_arbiter);
  assert(baseline.autonomous_execution_quality_arbiter.release_usd >= 0, "Execution quality arbiter should publish a non-negative release amount.", baseline.autonomous_execution_quality_arbiter);
  assert(baseline.autonomous_execution_quality_arbiter.fastest_review_seconds > 0, "Execution quality arbiter should publish a positive review cadence.", baseline.autonomous_execution_quality_arbiter);
  assert(baseline.autonomous_execution_quality_arbiter.summary.length > 0, "Execution quality arbiter should summarize its decision.", baseline.autonomous_execution_quality_arbiter);
  assert(baseline.autonomous_execution_quality_arbiter.next_action.length > 0, "Execution quality arbiter should publish a next action.", baseline.autonomous_execution_quality_arbiter);
  assert(
    baseline.autonomous_execution_quality_arbiter.controls.some((control) => control.includes("Final fresh-buy arbiter")),
    "Execution quality arbiter should disclose that it gates fresh buys.",
    baseline.autonomous_execution_quality_arbiter,
  );
  assert(
    baseline.autonomous_execution_quality_arbiter.items.every((item) =>
      ["command-center", "high-frequency", "opportunity-race", "market-intelligence", "market-pulse", "trend-chase", "reentry-hunter", "portfolio-protect", "route-profit", "wallet-growth"].includes(item.lane) &&
      ["execute-paper", "protect", "rehearse", "requote", "resize", "block"].includes(item.action) &&
      ["ready", "watch", "blocked"].includes(item.status) &&
      ["buy", "sell", "hold"].includes(item.side) &&
      ["paper-ledger", "jupiter-v2-managed", "jupiter-router-submit", "helius-sender", "blocked"].includes(item.landing_path) &&
      item.execution_score >= 0 &&
      item.execution_score <= 100 &&
      item.landing_score >= 0 &&
      item.landing_score <= 100 &&
      item.pre_submit_score >= 0 &&
      item.pre_submit_score <= 100 &&
      item.fill_quality_score >= 0 &&
      item.fill_quality_score <= 100 &&
      item.mev_risk_score >= 0 &&
      item.mev_risk_score <= 100 &&
      item.cost_bps >= 0 &&
      item.max_notional_usd >= 0 &&
      item.review_after_seconds > 0
    ),
    "Execution quality arbiter rows should expose bounded route, landing, fill, and MEV evidence.",
    baseline.autonomous_execution_quality_arbiter,
  );
  assert(baseline.autonomous_token_safety_clearance?.mode === "autonomous-token-safety-clearance", "Token safety clearance should be present.", baseline.autonomous_token_safety_clearance);
  assert(
    ["cleared", "selective", "blocked", "exit-only", "idle"].includes(baseline.autonomous_token_safety_clearance.status),
    "Token safety clearance should expose a known status.",
    baseline.autonomous_token_safety_clearance,
  );
  assert(baseline.autonomous_token_safety_clearance.average_safety_score >= 0 && baseline.autonomous_token_safety_clearance.average_safety_score <= 100, "Token safety clearance should publish a bounded average score.", baseline.autonomous_token_safety_clearance);
  assert(baseline.autonomous_token_safety_clearance.max_buy_usd >= 0, "Token safety clearance should publish a non-negative max buy.", baseline.autonomous_token_safety_clearance);
  assert(baseline.autonomous_token_safety_clearance.fastest_review_seconds > 0, "Token safety clearance should publish a positive review cadence.", baseline.autonomous_token_safety_clearance);
  assert(baseline.autonomous_token_safety_clearance.summary.length > 0, "Token safety clearance should summarize its decision.", baseline.autonomous_token_safety_clearance);
  assert(baseline.autonomous_token_safety_clearance.next_action.length > 0, "Token safety clearance should publish a next action.", baseline.autonomous_token_safety_clearance);
  assert(
    baseline.autonomous_token_safety_clearance.controls.some((control) => control.includes("fresh local paper buys")),
    "Token safety clearance should disclose that it gates fresh paper buys.",
    baseline.autonomous_token_safety_clearance,
  );
  assert(
    baseline.autonomous_token_safety_clearance.items.every((item) =>
      ["cleared", "probe-only", "blocked", "exit-only"].includes(item.clearance) &&
      item.safety_score >= 0 &&
      item.safety_score <= 100 &&
      item.risk_score >= 0 &&
      item.risk_score <= 100 &&
      item.holder_score >= 0 &&
      item.holder_score <= 100 &&
      item.liquidity_score >= 0 &&
      item.liquidity_score <= 100 &&
      item.promotion_score >= 0 &&
      item.promotion_score <= 100 &&
      item.landing_score >= 0 &&
      item.landing_score <= 100 &&
      item.route_score >= 0 &&
      item.route_score <= 100 &&
      item.max_buy_usd >= 0 &&
      item.review_after_seconds > 0
    ),
    "Token safety clearance rows should expose bounded safety evidence.",
    baseline.autonomous_token_safety_clearance,
  );
  assert(baseline.autonomous_reflex_operator?.mode === "autonomous-reflex-operator", "Autonomous reflex operator should be present.", baseline.autonomous_reflex_operator);
  assert(
    ["press", "protect", "refresh", "observe", "stand-down", "blocked", "idle"].includes(baseline.autonomous_reflex_operator.status),
    "Autonomous reflex operator should expose a known status.",
    baseline.autonomous_reflex_operator,
  );
  assert(baseline.autonomous_reflex_operator.summary.length > 0, "Autonomous reflex operator should summarize its decision.", baseline.autonomous_reflex_operator);
  assert(baseline.autonomous_reflex_operator.next_action.length > 0, "Autonomous reflex operator should publish a next action.", baseline.autonomous_reflex_operator);
  assert(baseline.autonomous_reflex_operator.reflex_score >= 0 && baseline.autonomous_reflex_operator.reflex_score <= 100, "Autonomous reflex score should be bounded.", baseline.autonomous_reflex_operator);
  assert(baseline.autonomous_reflex_operator.safety_score >= 0 && baseline.autonomous_reflex_operator.safety_score <= 100, "Autonomous reflex safety score should be bounded.", baseline.autonomous_reflex_operator);
  assert(baseline.autonomous_reflex_operator.execution_score >= 0 && baseline.autonomous_reflex_operator.execution_score <= 100, "Autonomous reflex execution score should be bounded.", baseline.autonomous_reflex_operator);
  assert(baseline.autonomous_reflex_operator.wallet_heat_score >= 0 && baseline.autonomous_reflex_operator.wallet_heat_score <= 100, "Autonomous reflex wallet heat should be bounded.", baseline.autonomous_reflex_operator);
  assert(baseline.autonomous_reflex_operator.max_notional_usd >= 0, "Autonomous reflex should expose a non-negative action cap.", baseline.autonomous_reflex_operator);
  assert(baseline.autonomous_reflex_operator.review_after_seconds > 0, "Autonomous reflex should expose a positive review cadence.", baseline.autonomous_reflex_operator);
  assert(typeof baseline.autonomous_reflex_operator.should_tick_now === "boolean", "Autonomous reflex should disclose tick readiness.", baseline.autonomous_reflex_operator);
  assert(typeof baseline.autonomous_reflex_operator.should_refresh_market === "boolean", "Autonomous reflex should disclose market refresh readiness.", baseline.autonomous_reflex_operator);
  assert(typeof baseline.autonomous_reflex_operator.should_refresh_routes === "boolean", "Autonomous reflex should disclose route refresh readiness.", baseline.autonomous_reflex_operator);
  assert(typeof baseline.autonomous_reflex_operator.can_paper_trade === "boolean", "Autonomous reflex should disclose paper trade readiness.", baseline.autonomous_reflex_operator);
  assert(
    baseline.autonomous_reflex_operator.controls.some((control) => control.includes("local paper-ledger intent")),
    "Autonomous reflex should disclose its local paper boundary.",
    baseline.autonomous_reflex_operator,
  );
  assert(
    baseline.autonomous_reflex_operator.items.length > 0 &&
      baseline.autonomous_reflex_operator.items.every((item) =>
        ["profit-route", "tick-plan", "market-pulse", "wallet-protect", "route-refresh"].includes(item.source) &&
        ["paper-buy", "paper-sell", "refresh-route", "refresh-market", "protect", "observe", "stand-down"].includes(item.action) &&
        ["now", "next", "watch", "blocked"].includes(item.priority) &&
        item.score >= 0 &&
        item.score <= 100 &&
        item.notional_usd >= 0 &&
        item.safety_score >= 0 &&
        item.safety_score <= 100 &&
        item.execution_score >= 0 &&
        item.execution_score <= 100 &&
        item.wallet_heat_score >= 0 &&
        item.wallet_heat_score <= 100 &&
        item.review_after_seconds > 0
      ),
    "Autonomous reflex rows should expose bounded next-action evidence.",
    baseline.autonomous_reflex_operator,
  );
  assert(baseline.autonomous_cash_deployment_director?.mode === "autonomous-cash-deployment-director", "Cash deployment director should be present.", baseline.autonomous_cash_deployment_director);
  assert(
    ["deploy", "scout", "hold", "protect", "blocked", "idle"].includes(baseline.autonomous_cash_deployment_director.status),
    "Cash deployment director should expose a known status.",
    baseline.autonomous_cash_deployment_director,
  );
  assert(["fresh-buy", "protect-sell", "refresh-first", "observe", "none"].includes(baseline.autonomous_cash_deployment_director.paper_intent), "Cash deployment director should expose a known paper intent.", baseline.autonomous_cash_deployment_director);
  assert(baseline.autonomous_cash_deployment_director.summary.length > 0, "Cash deployment director should summarize its decision.", baseline.autonomous_cash_deployment_director);
  assert(baseline.autonomous_cash_deployment_director.next_action.length > 0, "Cash deployment director should publish a next action.", baseline.autonomous_cash_deployment_director);
  assert(baseline.autonomous_cash_deployment_director.cash_usd >= 0, "Cash deployment director should expose non-negative cash.", baseline.autonomous_cash_deployment_director);
  assert(baseline.autonomous_cash_deployment_director.reserve_usd >= 0, "Cash deployment director should expose non-negative reserves.", baseline.autonomous_cash_deployment_director);
  assert(baseline.autonomous_cash_deployment_director.deploy_now_usd >= 0, "Cash deployment director should expose non-negative deploy amount.", baseline.autonomous_cash_deployment_director);
  assert(baseline.autonomous_cash_deployment_director.target_exposure_pct >= 0 && baseline.autonomous_cash_deployment_director.target_exposure_pct <= 64, "Cash deployment target exposure should be bounded.", baseline.autonomous_cash_deployment_director);
  assert(baseline.autonomous_cash_deployment_director.confidence_score >= 0 && baseline.autonomous_cash_deployment_director.confidence_score <= 100, "Cash deployment confidence should be bounded.", baseline.autonomous_cash_deployment_director);
  assert(baseline.autonomous_cash_deployment_director.review_after_seconds > 0, "Cash deployment director should expose a positive review cadence.", baseline.autonomous_cash_deployment_director);
  assert(typeof baseline.autonomous_cash_deployment_director.can_deploy_paper === "boolean", "Cash deployment director should disclose paper deploy readiness.", baseline.autonomous_cash_deployment_director);
  assert(
    baseline.autonomous_cash_deployment_director.controls.some((control) => control.includes("bounded paper cash-deployment")),
    "Cash deployment director should disclose its paper cash-deployment boundary.",
    baseline.autonomous_cash_deployment_director,
  );
  assert(
    baseline.autonomous_cash_deployment_director.items.length >= 6 &&
      baseline.autonomous_cash_deployment_director.items.every((item) =>
        ["cash", "reflex", "safety", "execution", "wallet", "reserve"].includes(item.id) &&
        ["pass", "watch", "fail"].includes(item.status) &&
        item.score >= 0 &&
        item.score <= 100 &&
        item.label.length > 0 &&
        item.value.length > 0 &&
        item.detail.length > 0
      ),
    "Cash deployment rows should expose bounded sizing evidence.",
    baseline.autonomous_cash_deployment_director,
  );
  assert(baseline.autonomous_profit_navigator?.mode === "autonomous-profit-navigator", "Profit navigator should be present.", baseline.autonomous_profit_navigator);
  assert(
    ["attack", "scout", "compound", "harvest", "protect", "stand-down", "blocked", "idle"].includes(baseline.autonomous_profit_navigator.status),
    "Profit navigator should expose a known status.",
    baseline.autonomous_profit_navigator,
  );
  assert(["buy", "sell", "hold"].includes(baseline.autonomous_profit_navigator.primary_side), "Profit navigator should expose a known primary side.", baseline.autonomous_profit_navigator);
  assert(
    ["paper-buy", "paper-sell", "protect", "harvest", "refresh", "observe", "blocked"].includes(baseline.autonomous_profit_navigator.primary_action),
    "Profit navigator should expose a known primary action.",
    baseline.autonomous_profit_navigator,
  );
  assert(baseline.autonomous_profit_navigator.summary.length > 0, "Profit navigator should summarize the autonomous posture.", baseline.autonomous_profit_navigator);
  assert(baseline.autonomous_profit_navigator.next_action.length > 0, "Profit navigator should publish a next action.", baseline.autonomous_profit_navigator);
  assert(baseline.autonomous_profit_navigator.wallet_equity_usd >= 0, "Profit navigator should expose non-negative wallet equity.", baseline.autonomous_profit_navigator);
  assert(baseline.autonomous_profit_navigator.deploy_usd >= 0, "Profit navigator should expose non-negative deploy size.", baseline.autonomous_profit_navigator);
  assert(baseline.autonomous_profit_navigator.release_usd >= 0, "Profit navigator should expose non-negative release size.", baseline.autonomous_profit_navigator);
  assert(baseline.autonomous_profit_navigator.reserve_usd >= 0, "Profit navigator should expose non-negative reserve.", baseline.autonomous_profit_navigator);
  assert(baseline.autonomous_profit_navigator.max_trade_usd >= 0, "Profit navigator should expose non-negative max trade size.", baseline.autonomous_profit_navigator);
  assert(baseline.autonomous_profit_navigator.confidence_score >= 0 && baseline.autonomous_profit_navigator.confidence_score <= 100, "Profit navigator confidence should be bounded.", baseline.autonomous_profit_navigator);
  assert(baseline.autonomous_profit_navigator.risk_score >= 0 && baseline.autonomous_profit_navigator.risk_score <= 100, "Profit navigator risk should be bounded.", baseline.autonomous_profit_navigator);
  assert(baseline.autonomous_profit_navigator.urgency_seconds > 0, "Profit navigator should expose a positive urgency cadence.", baseline.autonomous_profit_navigator);
  assert(typeof baseline.autonomous_profit_navigator.can_advance_paper === "boolean", "Profit navigator should disclose paper advance readiness.", baseline.autonomous_profit_navigator);
  assert(
    baseline.autonomous_profit_navigator.controls.some((control) => control.includes("wallet trajectory")),
    "Profit navigator should disclose its fused wallet/route/safety boundary.",
    baseline.autonomous_profit_navigator,
  );
  assert(
    baseline.autonomous_profit_navigator.items.length >= 7 &&
      baseline.autonomous_profit_navigator.items.every((item) =>
        ["wallet", "cash", "route", "execution", "safety", "portfolio", "cadence"].includes(item.id) &&
        ["pass", "watch", "fail"].includes(item.status) &&
        item.score >= 0 &&
        item.score <= 100 &&
        item.label.length > 0 &&
        item.value.length > 0 &&
        item.detail.length > 0
      ),
    "Profit navigator rows should expose wallet, cash, route, execution, safety, portfolio, and cadence evidence.",
    baseline.autonomous_profit_navigator,
  );
  assert(baseline.autonomous_profit_forecast?.mode === "autonomous-profit-forecast", "Profit forecast should be present.", baseline.autonomous_profit_forecast);
  assert(
    ["press", "probe", "harvest", "protect", "wait", "blocked", "idle"].includes(baseline.autonomous_profit_forecast.status),
    "Profit forecast should expose a known status.",
    baseline.autonomous_profit_forecast,
  );
  assert(baseline.autonomous_profit_forecast.summary.length > 0, "Profit forecast should summarize the next window.", baseline.autonomous_profit_forecast);
  assert(baseline.autonomous_profit_forecast.next_action.length > 0, "Profit forecast should publish a next action.", baseline.autonomous_profit_forecast);
  assert(baseline.autonomous_profit_forecast.horizon_seconds >= 30 && baseline.autonomous_profit_forecast.horizon_seconds <= 300, "Profit forecast horizon should be bounded.", baseline.autonomous_profit_forecast);
  assert(baseline.autonomous_profit_forecast.starting_equity_usd >= 0, "Profit forecast should expose non-negative starting equity.", baseline.autonomous_profit_forecast);
  assert(baseline.autonomous_profit_forecast.projected_equity_usd >= 0, "Profit forecast should expose non-negative projected equity.", baseline.autonomous_profit_forecast);
  assert(baseline.autonomous_profit_forecast.worst_case_drawdown_pct >= 0 && baseline.autonomous_profit_forecast.worst_case_drawdown_pct <= 30, "Profit forecast drawdown should be bounded.", baseline.autonomous_profit_forecast);
  assert(baseline.autonomous_profit_forecast.recommended_size_usd >= 0, "Profit forecast should expose non-negative recommended size.", baseline.autonomous_profit_forecast);
  assert(baseline.autonomous_profit_forecast.confidence_score >= 0 && baseline.autonomous_profit_forecast.confidence_score <= 100, "Profit forecast confidence should be bounded.", baseline.autonomous_profit_forecast);
  assert(baseline.autonomous_profit_forecast.invalidation.length > 0, "Profit forecast should publish an invalidation rule.", baseline.autonomous_profit_forecast);
  assert(
    baseline.autonomous_profit_forecast.controls.some((control) => control.includes("next local paper-trading window")),
    "Profit forecast should disclose its paper forecast boundary.",
    baseline.autonomous_profit_forecast,
  );
  assert(
    baseline.autonomous_profit_forecast.points.length >= 6 &&
      baseline.autonomous_profit_forecast.points.every((point) =>
        point.id.length > 0 &&
        point.label.length > 0 &&
        point.tick >= 0 &&
        ["buy", "sell", "hold", "protect"].includes(point.action) &&
        point.equity_usd >= 0 &&
        point.drawdown_pct >= 0 &&
        point.drawdown_pct <= 30
      ),
    "Profit forecast should expose bounded deterministic equity points.",
    baseline.autonomous_profit_forecast,
  );
  assert(
    baseline.autonomous_profit_forecast.items.length >= 5 &&
      baseline.autonomous_profit_forecast.items.every((item) =>
        ["edge", "wallet", "risk", "cash", "protection"].includes(item.id) &&
        ["pass", "watch", "fail"].includes(item.status) &&
        item.score >= 0 &&
        item.score <= 100 &&
        item.label.length > 0 &&
        item.value.length > 0 &&
        item.detail.length > 0
      ),
    "Profit forecast rows should expose edge, wallet, risk, cash, and protection evidence.",
    baseline.autonomous_profit_forecast,
  );
  assert(baseline.autonomous_forecast_feedback?.mode === "autonomous-forecast-feedback", "Forecast feedback should be present.", baseline.autonomous_forecast_feedback);
  assert(
    ["press", "keep", "probe", "tighten", "protect", "blocked", "idle"].includes(baseline.autonomous_forecast_feedback.status),
    "Forecast feedback should expose a known status.",
    baseline.autonomous_forecast_feedback,
  );
  assert(baseline.autonomous_forecast_feedback.summary.length > 0, "Forecast feedback should summarize forecast calibration.", baseline.autonomous_forecast_feedback);
  assert(baseline.autonomous_forecast_feedback.next_action.length > 0, "Forecast feedback should publish a next action.", baseline.autonomous_forecast_feedback);
  assert(typeof baseline.autonomous_forecast_feedback.direction_correct === "boolean", "Forecast feedback should disclose direction correctness.", baseline.autonomous_forecast_feedback);
  assert(baseline.autonomous_forecast_feedback.accuracy_score >= 0 && baseline.autonomous_forecast_feedback.accuracy_score <= 100, "Forecast feedback accuracy should be bounded.", baseline.autonomous_forecast_feedback);
  assert(baseline.autonomous_forecast_feedback.next_size_multiplier >= 0 && baseline.autonomous_forecast_feedback.next_size_multiplier <= 1.18, "Forecast feedback next-size multiplier should be bounded.", baseline.autonomous_forecast_feedback);
  assert(baseline.autonomous_forecast_feedback.recommended_size_usd >= 0, "Forecast feedback should expose non-negative recommended size.", baseline.autonomous_forecast_feedback);
  assert(baseline.autonomous_forecast_feedback.cadence_seconds > 0, "Forecast feedback should expose a positive cadence.", baseline.autonomous_forecast_feedback);
  assert(
    baseline.autonomous_forecast_feedback.controls.some((control) => control.includes("daemon-memory wallet movement")),
    "Forecast feedback should disclose its daemon-memory calibration boundary.",
    baseline.autonomous_forecast_feedback,
  );
  assert(
    baseline.autonomous_forecast_feedback.items.length >= 5 &&
      baseline.autonomous_forecast_feedback.items.every((item) =>
        ["forecast", "realized", "error", "sizing", "cadence"].includes(item.id) &&
        ["pass", "watch", "fail"].includes(item.status) &&
        item.score >= 0 &&
        item.score <= 100 &&
        item.label.length > 0 &&
        item.value.length > 0 &&
        item.detail.length > 0
      ),
    "Forecast feedback rows should expose forecast, realized, error, sizing, and cadence evidence.",
    baseline.autonomous_forecast_feedback,
  );
  assert(baseline.autonomous_alpha_conviction?.mode === "autonomous-alpha-conviction", "Alpha conviction should be present.", baseline.autonomous_alpha_conviction);
  assert(
    ["attack", "selective", "protect", "blocked", "idle"].includes(baseline.autonomous_alpha_conviction.status),
    "Alpha conviction should expose a known status.",
    baseline.autonomous_alpha_conviction,
  );
  assert(baseline.autonomous_alpha_conviction.summary.length > 0, "Alpha conviction should summarize the ranked setup.", baseline.autonomous_alpha_conviction);
  assert(baseline.autonomous_alpha_conviction.next_action.length > 0, "Alpha conviction should publish a next action.", baseline.autonomous_alpha_conviction);
  assert(baseline.autonomous_alpha_conviction.average_conviction_score >= 0 && baseline.autonomous_alpha_conviction.average_conviction_score <= 100, "Alpha conviction average should be bounded.", baseline.autonomous_alpha_conviction);
  assert(baseline.autonomous_alpha_conviction.average_signal_to_noise_ratio >= 0, "Alpha conviction should expose non-negative signal/noise.", baseline.autonomous_alpha_conviction);
  assert(baseline.autonomous_alpha_conviction.max_size_usd >= 0, "Alpha conviction should expose non-negative max size.", baseline.autonomous_alpha_conviction);
  assert(baseline.autonomous_alpha_conviction.expected_edge_usd >= 0, "Alpha conviction should expose non-negative expected edge.", baseline.autonomous_alpha_conviction);
  assert(baseline.autonomous_alpha_conviction.fastest_review_seconds > 0, "Alpha conviction should expose a positive review cadence.", baseline.autonomous_alpha_conviction);
  assert(
    baseline.autonomous_alpha_conviction.controls.some((control) => control.includes("signal/noise")),
    "Alpha conviction should disclose its fused signal/noise evidence.",
    baseline.autonomous_alpha_conviction,
  );
  assert(
    baseline.autonomous_alpha_conviction.items.length > 0 &&
      baseline.autonomous_alpha_conviction.items.every((item) =>
        ["buy", "probe", "hold", "trim", "avoid", "protect"].includes(item.action) &&
        ["trade", "watch", "blocked", "protect"].includes(item.status) &&
        item.conviction_score >= 0 &&
        item.conviction_score <= 100 &&
        item.signal_score >= 0 &&
        item.velocity_score >= 0 &&
        item.pulse_score >= 0 &&
        item.route_score >= 0 &&
        item.safety_score >= 0 &&
        item.forecast_fit_score >= 0 &&
        item.wallet_score >= 0 &&
        item.risk_score >= 0 &&
        item.max_size_usd >= 0 &&
        item.review_after_seconds > 0 &&
        item.thesis.length > 0 &&
        item.evidence.length >= 3
      ),
    "Alpha conviction rows should expose bounded fused candidate evidence.",
    baseline.autonomous_alpha_conviction,
  );
  assert(baseline.autonomous_execution_escalator?.mode === "autonomous-execution-escalator", "Execution escalator should be present.", baseline.autonomous_execution_escalator);
  assert(
    ["paper-ready", "order-ready", "signature-needed", "submit-ready", "confirming", "blocked", "idle"].includes(baseline.autonomous_execution_escalator.status),
    "Execution escalator should expose a known status.",
    baseline.autonomous_execution_escalator,
  );
  assert(
    ["paper-fill", "build-order", "request-signature", "submit-signed", "poll-confirmation", "rebuild", "stand-down"].includes(baseline.autonomous_execution_escalator.stage),
    "Execution escalator should expose a known stage.",
    baseline.autonomous_execution_escalator,
  );
  assert(["buy", "sell", "hold"].includes(baseline.autonomous_execution_escalator.selected_side), "Execution escalator should expose an executable side.", baseline.autonomous_execution_escalator);
  assert(baseline.autonomous_execution_escalator.readiness_score >= 0 && baseline.autonomous_execution_escalator.readiness_score <= 100, "Execution escalator readiness should be bounded.", baseline.autonomous_execution_escalator);
  assert(baseline.autonomous_execution_escalator.live_readiness_score >= 0 && baseline.autonomous_execution_escalator.live_readiness_score <= 100, "Execution escalator live readiness should be bounded.", baseline.autonomous_execution_escalator);
  assert(baseline.autonomous_execution_escalator.paper_notional_usd >= 0, "Execution escalator should expose non-negative paper notional.", baseline.autonomous_execution_escalator);
  assert(baseline.autonomous_execution_escalator.expected_edge_usd >= 0, "Execution escalator should expose non-negative expected edge.", baseline.autonomous_execution_escalator);
  assert(baseline.autonomous_execution_escalator.estimated_cost_usd >= 0, "Execution escalator should expose non-negative estimated cost.", baseline.autonomous_execution_escalator);
  assert(baseline.autonomous_execution_escalator.ttl_seconds >= 0, "Execution escalator should expose a non-negative TTL.", baseline.autonomous_execution_escalator);
  assert(typeof baseline.autonomous_execution_escalator.can_autonomous_paper_fill === "boolean", "Execution escalator should disclose paper-fill readiness.", baseline.autonomous_execution_escalator);
  assert(typeof baseline.autonomous_execution_escalator.can_request_signature === "boolean", "Execution escalator should disclose signature readiness.", baseline.autonomous_execution_escalator);
  assert(typeof baseline.autonomous_execution_escalator.can_submit_signed_payload === "boolean", "Execution escalator should disclose signed-submit readiness.", baseline.autonomous_execution_escalator);
  assert(baseline.autonomous_execution_escalator.next_action.length > 0, "Execution escalator should publish a next action.", baseline.autonomous_execution_escalator);
  assert(
    baseline.autonomous_execution_escalator.controls.some((control) => control.includes("paper fill")),
    "Execution escalator should disclose its staged escalation boundary.",
    baseline.autonomous_execution_escalator,
  );
  assert(
    baseline.autonomous_execution_escalator.items.length >= 7 &&
      baseline.autonomous_execution_escalator.items.every((item) =>
        ["alpha", "order", "pre-submit", "signer", "live-gate", "relay", "confirm"].includes(item.id) &&
        ["pass", "watch", "fail"].includes(item.status) &&
        item.score >= 0 &&
        item.score <= 100 &&
        item.label.length > 0 &&
        item.value.length > 0 &&
        item.detail.length > 0
      ),
    "Execution escalator rows should expose alpha, order, pre-submit, signer, live-gate, relay, and confirmation evidence.",
    baseline.autonomous_execution_escalator,
  );
  assert(baseline.autonomous_size_governor?.mode === "autonomous-size-governor", "Size governor should be present.", baseline.autonomous_size_governor);
  assert(
    ["press", "scale", "probe", "halve", "protect", "pause", "idle"].includes(baseline.autonomous_size_governor.status),
    "Size governor should expose a known status.",
    baseline.autonomous_size_governor,
  );
  assert(["buy", "sell", "hold"].includes(baseline.autonomous_size_governor.selected_side), "Size governor should expose the selected side.", baseline.autonomous_size_governor);
  assert(baseline.autonomous_size_governor.base_size_usd >= 0, "Size governor should expose non-negative base size.", baseline.autonomous_size_governor);
  assert(baseline.autonomous_size_governor.capped_size_usd >= 0, "Size governor should expose non-negative capped size.", baseline.autonomous_size_governor);
  assert(baseline.autonomous_size_governor.final_size_usd >= 0, "Size governor should expose non-negative final size.", baseline.autonomous_size_governor);
  assert(baseline.autonomous_size_governor.size_multiplier >= 0, "Size governor should expose a non-negative size multiplier.", baseline.autonomous_size_governor);
  assert(baseline.autonomous_size_governor.confidence_score >= 0 && baseline.autonomous_size_governor.confidence_score <= 100, "Size governor confidence should be bounded.", baseline.autonomous_size_governor);
  assert(baseline.autonomous_size_governor.risk_budget_usd >= 0, "Size governor should expose non-negative risk budget.", baseline.autonomous_size_governor);
  assert(baseline.autonomous_size_governor.stop_budget_usd >= 0, "Size governor should expose non-negative stop budget.", baseline.autonomous_size_governor);
  assert(baseline.autonomous_size_governor.max_loss_usd >= 0, "Size governor should expose non-negative max loss.", baseline.autonomous_size_governor);
  assert(baseline.autonomous_size_governor.required_edge_usd >= 0, "Size governor should expose non-negative required edge.", baseline.autonomous_size_governor);
  assert(
    ["press", "selective", "tighten", "protect", "cold-start"].includes(baseline.autonomous_size_governor.outcome_discipline_status),
    "Size governor should expose outcome discipline status.",
    baseline.autonomous_size_governor,
  );
  assert(baseline.autonomous_size_governor.outcome_discipline_multiplier >= 0, "Size governor should expose outcome discipline multiplier.", baseline.autonomous_size_governor);
  assert(baseline.autonomous_size_governor.outcome_sample_size >= 0, "Size governor should expose outcome sample size.", baseline.autonomous_size_governor);
  assert(
    baseline.autonomous_size_governor.outcome_win_rate_pct >= 0 &&
      baseline.autonomous_size_governor.outcome_win_rate_pct <= 100,
    "Size governor outcome win rate should be bounded.",
    baseline.autonomous_size_governor,
  );
  assert(baseline.autonomous_size_governor.outcome_profit_factor >= 0, "Size governor should expose outcome profit factor.", baseline.autonomous_size_governor);
  assert(typeof baseline.autonomous_size_governor.outcome_expectancy_usd === "number", "Size governor should expose outcome expectancy.", baseline.autonomous_size_governor);
  assert(baseline.autonomous_size_governor.outcome_summary.length > 0, "Size governor should explain outcome discipline.", baseline.autonomous_size_governor);
  assert(
    baseline.autonomous_size_governor.outcome_memory_bias === baseline.autonomous_outcome_memory_governor.next_bias,
    "Size governor should consume the outcome memory next-cycle bias.",
    { size: baseline.autonomous_size_governor, memory: baseline.autonomous_outcome_memory_governor },
  );
  assert(
    baseline.autonomous_size_governor.outcome_memory_status === baseline.autonomous_outcome_memory_governor.status,
    "Size governor should mirror outcome memory status.",
    { size: baseline.autonomous_size_governor, memory: baseline.autonomous_outcome_memory_governor },
  );
  assert(baseline.autonomous_size_governor.outcome_memory_multiplier >= 0, "Size governor should expose applied outcome-memory multiplier.", baseline.autonomous_size_governor);
  assert(
    baseline.autonomous_size_governor.outcome_memory_score === baseline.autonomous_outcome_memory_governor.memory_score,
    "Size governor should expose the outcome memory score it used.",
    { size: baseline.autonomous_size_governor, memory: baseline.autonomous_outcome_memory_governor },
  );
  assert(typeof baseline.autonomous_size_governor.outcome_memory_blocks_fresh_buy === "boolean", "Size governor should disclose whether memory blocked fresh buys.", baseline.autonomous_size_governor);
  assert(
    baseline.autonomous_size_governor.items.some((item) => item.id === "outcome-memory"),
    "Size governor checks should include applied outcome-memory sizing.",
    baseline.autonomous_size_governor,
  );
  assert(baseline.autonomous_size_governor.cadence_seconds > 0, "Size governor should expose positive cadence.", baseline.autonomous_size_governor);
  assert(typeof baseline.autonomous_size_governor.can_trade_paper === "boolean", "Size governor should disclose paper trading readiness.", baseline.autonomous_size_governor);
  assert(typeof baseline.autonomous_size_governor.live_blocked === "boolean", "Size governor should disclose live boundary.", baseline.autonomous_size_governor);
  assert(baseline.autonomous_size_governor.next_action.length > 0, "Size governor should publish a next action.", baseline.autonomous_size_governor);
  assert(
    baseline.autonomous_size_governor.controls.some((control) => control.includes("next-size")),
    "Size governor should disclose how it converts evidence into next-size decisions.",
    baseline.autonomous_size_governor,
  );
  assert(
    baseline.autonomous_size_governor.items.length >= 10 &&
      baseline.autonomous_size_governor.items.every((item) =>
        ["alpha", "execution", "forecast", "wallet", "profit", "learning", "command", "memory", "outcome", "outcome-memory", "risk"].includes(item.id) &&
        ["pass", "watch", "fail"].includes(item.status) &&
        item.score >= 0 &&
        item.score <= 100 &&
        item.label.length > 0 &&
        item.value.length > 0 &&
        item.detail.length > 0
      ),
    "Size governor rows should expose alpha, execution, forecast, wallet, profit, learning, command, memory, outcome, and risk evidence.",
    baseline.autonomous_size_governor,
  );
  assert(baseline.autonomous_pressure_tape?.mode === "autonomous-pressure-tape", "Pressure tape should be present.", baseline.autonomous_pressure_tape);
  assert(
    ["press", "scalp", "protect", "refresh", "pause", "idle"].includes(baseline.autonomous_pressure_tape.status),
    "Pressure tape should expose a known status.",
    baseline.autonomous_pressure_tape,
  );
  assert(["buy", "sell", "hold"].includes(baseline.autonomous_pressure_tape.leader_side), "Pressure tape should expose a leader side.", baseline.autonomous_pressure_tape);
  assert(baseline.autonomous_pressure_tape.pressure_score >= 0 && baseline.autonomous_pressure_tape.pressure_score <= 100, "Pressure tape score should be bounded.", baseline.autonomous_pressure_tape);
  assert(baseline.autonomous_pressure_tape.buy_pressure_score >= 0 && baseline.autonomous_pressure_tape.buy_pressure_score <= 100, "Pressure tape buy pressure should be bounded.", baseline.autonomous_pressure_tape);
  assert(baseline.autonomous_pressure_tape.sell_pressure_score >= 0 && baseline.autonomous_pressure_tape.sell_pressure_score <= 100, "Pressure tape sell pressure should be bounded.", baseline.autonomous_pressure_tape);
  assert(baseline.autonomous_pressure_tape.refresh_pressure_score >= 0 && baseline.autonomous_pressure_tape.refresh_pressure_score <= 100, "Pressure tape refresh pressure should be bounded.", baseline.autonomous_pressure_tape);
  assert(baseline.autonomous_pressure_tape.tape_change_score >= 0 && baseline.autonomous_pressure_tape.tape_change_score <= 100, "Pressure tape situation-change score should be bounded.", baseline.autonomous_pressure_tape);
  assert(baseline.autonomous_pressure_tape.urgent_change_count === baseline.tape_memory.urgent_count, "Pressure tape should mirror urgent situation changes from tape memory.", {
    pressure: baseline.autonomous_pressure_tape,
    tape: baseline.tape_memory,
  });
  assert(baseline.autonomous_pressure_tape.situation_regime === baseline.situation_monitor.regime, "Pressure tape should publish the active situation regime.", {
    pressure: baseline.autonomous_pressure_tape,
    situation: baseline.situation_monitor,
  });
  assert(baseline.autonomous_pressure_tape.reaction_window_seconds > 0 && baseline.autonomous_pressure_tape.reaction_window_seconds <= baseline.autonomous_pressure_tape.cadence_seconds, "Pressure tape should expose a bounded situation-aware reaction window.", baseline.autonomous_pressure_tape);
  assert(baseline.autonomous_pressure_tape.max_next_actions >= 0, "Pressure tape should expose non-negative action capacity.", baseline.autonomous_pressure_tape);
  assert(baseline.autonomous_pressure_tape.max_notional_usd >= 0, "Pressure tape should expose non-negative max notional.", baseline.autonomous_pressure_tape);
  assert(baseline.autonomous_pressure_tape.cadence_seconds > 0, "Pressure tape should expose positive cadence.", baseline.autonomous_pressure_tape);
  assert(typeof baseline.autonomous_pressure_tape.paper_trade_ready === "boolean", "Pressure tape should disclose paper readiness.", baseline.autonomous_pressure_tape);
  assert(typeof baseline.autonomous_pressure_tape.live_blocked === "boolean", "Pressure tape should disclose live boundary.", baseline.autonomous_pressure_tape);
  assert(baseline.autonomous_pressure_tape.next_action.length > 0, "Pressure tape should publish a next action.", baseline.autonomous_pressure_tape);
  assert(
    baseline.autonomous_pressure_tape.controls.some((control) => control.includes("next-minute")),
    "Pressure tape should disclose its next-minute control boundary.",
    baseline.autonomous_pressure_tape,
  );
  assert(
    baseline.autonomous_pressure_tape.controls.some((control) => control.includes("situation-change memory")),
    "Pressure tape should disclose its situation-change memory input.",
    baseline.autonomous_pressure_tape,
  );
  assert(
    baseline.autonomous_pressure_tape.items.length >= 8 &&
      baseline.autonomous_pressure_tape.items.every((item) =>
        ["size", "market", "fast-race", "tick-plan", "positions", "wallet", "profit", "situation"].includes(item.id) &&
        ["pass", "watch", "fail"].includes(item.status) &&
        item.score >= 0 &&
        item.score <= 100 &&
        item.label.length > 0 &&
        item.value.length > 0 &&
        item.detail.length > 0
      ),
    "Pressure tape rows should expose size, market, fast-race, tick-plan, position, wallet, profit, and situation evidence.",
    baseline.autonomous_pressure_tape,
  );
  assert(baseline.autonomous_pressure_execution?.mode === "pressure-tape-paper-execution", "Pressure execution should be present.", baseline.autonomous_pressure_execution);
  assert(
    ["queued", "applied", "blocked", "idle"].includes(baseline.autonomous_pressure_execution.status),
    "Pressure execution should expose a known status.",
    baseline.autonomous_pressure_execution,
  );
  assert(["buy", "sell", "hold"].includes(baseline.autonomous_pressure_execution.selected_side), "Pressure execution should expose selected side.", baseline.autonomous_pressure_execution);
  assert(["press", "scalp", "protect", "refresh", "pause", "idle"].includes(baseline.autonomous_pressure_execution.selected_posture), "Pressure execution should expose selected posture.", baseline.autonomous_pressure_execution);
  assert(typeof baseline.autonomous_pressure_execution.paper_trade_ready === "boolean", "Pressure execution should disclose paper readiness.", baseline.autonomous_pressure_execution);
  assert(typeof baseline.autonomous_pressure_execution.ledger_applied === "boolean", "Pressure execution should disclose ledger application.", baseline.autonomous_pressure_execution);
  assert(baseline.autonomous_pressure_execution.execution_boundary === "paper-ledger-only", "Pressure execution should stay paper-ledger-only.", baseline.autonomous_pressure_execution);
  assert(baseline.autonomous_pressure_execution.paper_size_usd >= 0, "Pressure execution should expose non-negative paper size.", baseline.autonomous_pressure_execution);
  assert(typeof baseline.autonomous_pressure_execution.projected_cash_delta_usd === "number", "Pressure execution should expose projected cash delta.", baseline.autonomous_pressure_execution);
  assert(typeof baseline.autonomous_pressure_execution.projected_exposure_delta_usd === "number", "Pressure execution should expose projected exposure delta.", baseline.autonomous_pressure_execution);
  assert(baseline.autonomous_pressure_execution.pressure_score >= 0 && baseline.autonomous_pressure_execution.pressure_score <= 100, "Pressure execution score should be bounded.", baseline.autonomous_pressure_execution);
  assert(baseline.autonomous_pressure_execution.review_after_seconds > 0, "Pressure execution should expose positive review cadence.", baseline.autonomous_pressure_execution);
  assert(baseline.autonomous_pressure_execution.summary.length > 0, "Pressure execution should summarize its status.", baseline.autonomous_pressure_execution);
  assert(baseline.autonomous_pressure_execution.next_action.length > 0, "Pressure execution should publish a next action.", baseline.autonomous_pressure_execution);
  assert(
    baseline.autonomous_pressure_execution.controls.some((control) => control.includes("paper-ledger")),
    "Pressure execution should disclose its paper-ledger boundary.",
    baseline.autonomous_pressure_execution,
  );
  assert(baseline.autonomous_action_queue?.mode === "autonomous-action-queue", "Autonomous action queue should be present.", baseline.autonomous_action_queue);
  assert(
    ["executing", "attack", "scalp", "protect", "prepare", "blocked", "watch", "idle"].includes(baseline.autonomous_action_queue.status),
    "Autonomous action queue should expose a known status.",
    baseline.autonomous_action_queue,
  );
  assert(["buy", "sell", "scalp", "protect", "harvest", "refresh", "hold", "blocked"].includes(baseline.autonomous_action_queue.leader_action), "Autonomous action queue should expose a known leader action.", baseline.autonomous_action_queue);
  assert(
    ["clear", "protect-first"].includes(baseline.autonomous_action_queue.fresh_buy_protection_status),
    "Autonomous action queue should expose a known fresh-buy protection status.",
    baseline.autonomous_action_queue,
  );
  assert(baseline.autonomous_action_queue.fresh_buy_blocked_count >= 0, "Autonomous action queue should expose a non-negative trigger-coverage block count.", baseline.autonomous_action_queue);
  assert(
    baseline.autonomous_action_queue.fresh_buy_blocker === null || typeof baseline.autonomous_action_queue.fresh_buy_blocker === "string",
    "Autonomous action queue should expose an optional fresh-buy blocker.",
    baseline.autonomous_action_queue,
  );
  assert(
    ["snipe", "probe", "confirm", "late-chase", "fade", "blocked", "idle", "missing"].includes(baseline.autonomous_action_queue.launch_timing_status),
    "Autonomous action queue should expose a known launch-timing queue gate.",
    baseline.autonomous_action_queue,
  );
  assert(baseline.autonomous_action_queue.launch_timing_blocked_count >= 0, "Autonomous action queue should expose a non-negative launch-timing block count.", baseline.autonomous_action_queue);
  assert(typeof baseline.autonomous_action_queue.launch_timing_allows_fresh_buys === "boolean", "Autonomous action queue should disclose launch-timing fresh-buy permission.", baseline.autonomous_action_queue);
  assert(
    baseline.autonomous_action_queue.launch_timing_blocker === null || typeof baseline.autonomous_action_queue.launch_timing_blocker === "string",
    "Autonomous action queue should expose an optional launch-timing blocker.",
    baseline.autonomous_action_queue,
  );
  assert(
    baseline.autonomous_action_queue.controls.some((control) => control.includes("Launch timing can boost")),
    "Autonomous action queue should disclose launch timing as an execution gate.",
    baseline.autonomous_action_queue,
  );
  if (!baseline.autonomous_action_queue.launch_timing_allows_fresh_buys) {
    assert(baseline.autonomous_action_queue.launch_timing_blocker, "Launch timing gate should explain why fresh buys are blocked.", baseline.autonomous_action_queue);
    assert(
      baseline.autonomous_action_queue.items
        .filter((item) => item.side === "buy" && (item.action === "buy" || item.action === "scalp"))
        .every((item) =>
          item.status === "blocked" &&
          item.paper_trade_ready === false &&
          item.blockers.some((blocker) =>
            blocker === baseline.autonomous_action_queue.launch_timing_blocker ||
            blocker.includes("Launch timing") ||
            blocker.includes("launch timing")
          )
        ),
      "Launch timing should block fresh queue buy lanes when it rejects the chase.",
      baseline.autonomous_action_queue,
    );
  }
  if (baseline.autonomous_action_queue.fresh_buy_protection_status === "protect-first") {
    assert(baseline.autonomous_session_planner.max_fresh_buys === 0, "Protect-first trigger coverage should zero planned fresh buys.", {
      queue: baseline.autonomous_action_queue,
      planner: baseline.autonomous_session_planner,
    });
    assert(
      baseline.autonomous_action_queue.items
        .filter((item) => item.side === "buy" && (item.action === "buy" || item.action === "scalp") && !item.ledger_applied)
        .every((item) => item.status === "blocked" && item.paper_trade_ready === false),
      "Protect-first trigger coverage should block fresh buy/scalp queue items.",
      baseline.autonomous_action_queue,
    );
  }
  assert(baseline.autonomous_action_queue.fastest_review_seconds > 0, "Autonomous action queue should expose positive review cadence.", baseline.autonomous_action_queue);
  assert(baseline.autonomous_action_queue.items.length > 0, "Autonomous action queue should rank existing autonomous lanes.", baseline.autonomous_action_queue);
  assert(baseline.autonomous_action_queue.items.every((item) =>
    ["command-center", "pressure-tape", "tradeability", "high-frequency", "opportunity-race", "portfolio-protect", "portfolio-tape", "market-pulse", "trend-chase", "watchlist-rotation"].includes(item.lane) &&
    ["ready", "queued", "applied", "blocked", "watch", "idle"].includes(item.status) &&
    ["buy", "sell", "scalp", "protect", "harvest", "refresh", "hold", "blocked"].includes(item.action) &&
    item.execution_boundary === "paper-ledger-only" &&
    item.score >= 0 &&
    item.score <= 100 &&
    item.review_after_seconds > 0 &&
    item.reason.length > 0
  ), "Autonomous action queue items should expose ranked lane evidence.", baseline.autonomous_action_queue);
  assert(
    baseline.autonomous_action_queue.items.some((item) => item.lane === "tradeability"),
    "Autonomous action queue should rank the fillability/tradeability lane.",
    baseline.autonomous_action_queue,
  );
  assert(
    baseline.autonomous_action_queue.controls.some((control) => control.includes("Ranks the command center")),
    "Autonomous action queue should disclose its ranking role.",
    baseline.autonomous_action_queue,
  );
  assert(baseline.autonomous_action_queue_execution?.mode === "autonomous-action-queue-execution", "Autonomous action queue execution should be present.", baseline.autonomous_action_queue_execution);
  assert(
    ["queued", "applied", "blocked", "idle"].includes(baseline.autonomous_action_queue_execution.status),
    "Autonomous action queue execution should expose a known status.",
    baseline.autonomous_action_queue_execution,
  );
  assert(["buy", "sell", "hold"].includes(baseline.autonomous_action_queue_execution.selected_side), "Action queue execution should expose a known side.", baseline.autonomous_action_queue_execution);
  assert(["buy", "sell", "scalp", "protect", "harvest", "refresh", "hold", "blocked"].includes(baseline.autonomous_action_queue_execution.selected_action), "Action queue execution should expose a known action.", baseline.autonomous_action_queue_execution);
  assert(["requesting", "ready", "blocked", "watching", "idle"].includes(baseline.autonomous_action_queue_execution.route_refresh_status), "Action queue execution should expose route freshness status.", baseline.autonomous_action_queue_execution);
  assert(typeof baseline.autonomous_action_queue_execution.route_refresh_vetoed === "boolean", "Action queue execution should disclose route veto status.", baseline.autonomous_action_queue_execution);
  assert(
    baseline.autonomous_action_queue_execution.route_refresh_blocker === null ||
      typeof baseline.autonomous_action_queue_execution.route_refresh_blocker === "string",
    "Action queue execution should expose a nullable route blocker.",
    baseline.autonomous_action_queue_execution,
  );
  assert(["chase", "probe", "harvest", "expired", "cooldown", "idle", "missing"].includes(baseline.autonomous_action_queue_execution.alpha_decay_status), "Action queue execution should expose alpha timing status.", baseline.autonomous_action_queue_execution);
  assert(typeof baseline.autonomous_action_queue_execution.alpha_decay_vetoed === "boolean", "Action queue execution should disclose alpha timing veto status.", baseline.autonomous_action_queue_execution);
  assert(
    baseline.autonomous_action_queue_execution.alpha_decay_blocker === null ||
      typeof baseline.autonomous_action_queue_execution.alpha_decay_blocker === "string",
    "Action queue execution should expose a nullable alpha timing blocker.",
    baseline.autonomous_action_queue_execution,
  );
  assert(typeof baseline.autonomous_action_queue_execution.paper_trade_ready === "boolean", "Action queue execution should disclose paper readiness.", baseline.autonomous_action_queue_execution);
  assert(typeof baseline.autonomous_action_queue_execution.ledger_applied === "boolean", "Action queue execution should disclose ledger application.", baseline.autonomous_action_queue_execution);
  assert(baseline.autonomous_action_queue_execution.execution_boundary === "paper-ledger-only", "Action queue execution should stay paper-ledger-only.", baseline.autonomous_action_queue_execution);
  assert(baseline.autonomous_action_queue_execution.paper_size_usd >= 0, "Action queue execution should expose non-negative paper size.", baseline.autonomous_action_queue_execution);
  assert(typeof baseline.autonomous_action_queue_execution.projected_cash_delta_usd === "number", "Action queue execution should expose projected cash delta.", baseline.autonomous_action_queue_execution);
  assert(typeof baseline.autonomous_action_queue_execution.projected_exposure_delta_usd === "number", "Action queue execution should expose projected exposure delta.", baseline.autonomous_action_queue_execution);
  assert(baseline.autonomous_action_queue_execution.review_after_seconds > 0, "Action queue execution should expose positive review cadence.", baseline.autonomous_action_queue_execution);
  assert(baseline.autonomous_action_queue_execution.summary.length > 0, "Action queue execution should summarize its status.", baseline.autonomous_action_queue_execution);
  assert(baseline.autonomous_action_queue_execution.next_action.length > 0, "Action queue execution should publish a next action.", baseline.autonomous_action_queue_execution);
  assert(
    baseline.autonomous_action_queue_execution.controls.some((control) => control.includes("top-ranked action-queue paper trade")),
    "Action queue execution should disclose that it owns the top queue fill.",
    baseline.autonomous_action_queue_execution,
  );
  assert(
    baseline.autonomous_action_queue_execution.controls.some((control) => control.includes("route-refresh execution")),
    "Action queue execution should disclose the route freshness veto.",
    baseline.autonomous_action_queue_execution,
  );
  assert(
    baseline.autonomous_action_queue_execution.controls.some((control) => control.includes("alpha timing decay")),
    "Action queue execution should disclose the alpha timing veto.",
    baseline.autonomous_action_queue_execution,
  );
  if (baseline.autonomous_action_queue_execution.route_refresh_vetoed) {
    assert(baseline.autonomous_action_queue_execution.status === "blocked", "Route-vetoed action queue execution should block the fill.", baseline.autonomous_action_queue_execution);
    assert(baseline.autonomous_action_queue_execution.paper_trade_ready === false, "Route-vetoed action queue execution should not be paper ready.", baseline.autonomous_action_queue_execution);
    assert(Boolean(baseline.autonomous_action_queue_execution.route_refresh_blocker), "Route-vetoed action queue execution should include the blocker.", baseline.autonomous_action_queue_execution);
  }
  if (baseline.autonomous_action_queue_execution.alpha_decay_vetoed) {
    assert(baseline.autonomous_action_queue_execution.status === "blocked", "Alpha-vetoed action queue execution should block the fill.", baseline.autonomous_action_queue_execution);
    assert(baseline.autonomous_action_queue_execution.paper_trade_ready === false, "Alpha-vetoed action queue execution should not be paper ready.", baseline.autonomous_action_queue_execution);
    assert(Boolean(baseline.autonomous_action_queue_execution.alpha_decay_blocker), "Alpha-vetoed action queue execution should include the blocker.", baseline.autonomous_action_queue_execution);
  }
  assert(baseline.autonomous_session_planner?.mode === "autonomous-session-planner", "Autonomous session planner should be present.", baseline.autonomous_session_planner);
  assert(
    ["run-now", "probe", "refresh-first", "protect", "cooldown", "blocked", "idle"].includes(baseline.autonomous_session_planner.status),
    "Autonomous session planner should expose a known status.",
    baseline.autonomous_session_planner,
  );
  assert(
    ["attack", "probe", "refresh", "protect", "cooldown", "observe"].includes(baseline.autonomous_session_planner.session_kind),
    "Autonomous session planner should expose a known session kind.",
    baseline.autonomous_session_planner,
  );
  assert(baseline.autonomous_session_planner.planned_ticks >= 0, "Autonomous session planner should expose non-negative tick count.", baseline.autonomous_session_planner);
  assert(baseline.autonomous_session_planner.max_total_fills >= 1, "Autonomous session planner should cap total fills.", baseline.autonomous_session_planner);
  assert(baseline.autonomous_session_planner.max_fresh_buys >= 0, "Autonomous session planner should cap fresh buys.", baseline.autonomous_session_planner);
  assert(baseline.autonomous_session_planner.max_protective_sells >= 0, "Autonomous session planner should cap protective sells.", baseline.autonomous_session_planner);
  assert(typeof baseline.autonomous_session_planner.route_refresh_required === "boolean", "Autonomous session planner should disclose route-refresh need.", baseline.autonomous_session_planner);
  assert(baseline.autonomous_session_planner.summary.length > 0, "Autonomous session planner should summarize its plan.", baseline.autonomous_session_planner);
  assert(baseline.autonomous_session_planner.next_action.length > 0, "Autonomous session planner should publish a next action.", baseline.autonomous_session_planner);
  assert(
    baseline.autonomous_session_planner.controls.some((control) => control.includes("bounded autonomous paper session")),
    "Autonomous session planner should disclose its bounded paper-session role.",
    baseline.autonomous_session_planner,
  );
  assert(
    baseline.autonomous_session_planner.controls.some((control) => control.includes("Cannot sign")),
    "Autonomous session planner should disclose that it cannot sign or submit.",
    baseline.autonomous_session_planner,
  );
  assert(
    JSON.stringify(baseline.autonomous_session_planner.steps.map((step) => step.id)) === JSON.stringify(["scanner", "queue", "profit", "route", "tick", "portfolio", "risk"]),
    "Autonomous session planner should expose the seven expected evidence steps.",
    baseline.autonomous_session_planner,
  );
  assert(baseline.autonomous_session_planner.steps.every((step) =>
    ["pass", "watch", "fail"].includes(step.status) &&
    ["paper-session", "paper-probe", "refresh-routes", "protect-book", "observe", "stand-down"].includes(step.action) &&
    step.score >= 0 &&
    step.score <= 100 &&
    step.detail.length > 0
  ), "Autonomous session planner evidence steps should be scored and explainable.", baseline.autonomous_session_planner);
  assert(baseline.autonomous_execution_heartbeat?.mode === "autonomous-execution-heartbeat", "Autonomous execution heartbeat should be present.", baseline.autonomous_execution_heartbeat);
  assert(
    ["press", "protect", "refresh", "pause", "cooldown", "blocked", "idle"].includes(baseline.autonomous_execution_heartbeat.status),
    "Autonomous execution heartbeat should expose a known status.",
    baseline.autonomous_execution_heartbeat,
  );
  assert(
    ["press", "protect", "refresh", "pause", "observe"].includes(baseline.autonomous_execution_heartbeat.primary_action),
    "Autonomous execution heartbeat should expose a known primary action.",
    baseline.autonomous_execution_heartbeat,
  );
  assert(baseline.autonomous_execution_heartbeat.heartbeat_score >= 0 && baseline.autonomous_execution_heartbeat.heartbeat_score <= 100, "Autonomous execution heartbeat score should be bounded.", baseline.autonomous_execution_heartbeat);
  assert(baseline.autonomous_execution_heartbeat.next_tick_seconds > 0, "Autonomous execution heartbeat should expose next loop timing.", baseline.autonomous_execution_heartbeat);
  assert(baseline.autonomous_execution_heartbeat.ticks_per_minute >= 0, "Autonomous execution heartbeat should expose non-negative tick throughput.", baseline.autonomous_execution_heartbeat);
  assert(baseline.autonomous_execution_heartbeat.trade_budget_usd >= 0, "Autonomous execution heartbeat should expose non-negative trade budget.", baseline.autonomous_execution_heartbeat);
  assert(typeof baseline.autonomous_execution_heartbeat.should_advance_paper === "boolean", "Autonomous execution heartbeat should disclose paper-advance readiness.", baseline.autonomous_execution_heartbeat);
  assert(typeof baseline.autonomous_execution_heartbeat.should_refresh_routes === "boolean", "Autonomous execution heartbeat should disclose route-refresh readiness.", baseline.autonomous_execution_heartbeat);
  assert(typeof baseline.autonomous_execution_heartbeat.should_protect_first === "boolean", "Autonomous execution heartbeat should disclose protect-first readiness.", baseline.autonomous_execution_heartbeat);
  assert(baseline.autonomous_execution_heartbeat.next_action.length > 0, "Autonomous execution heartbeat should publish a next action.", baseline.autonomous_execution_heartbeat);
  assert(
    JSON.stringify(baseline.autonomous_execution_heartbeat.items.map((item) => item.id)) === JSON.stringify(["wallet", "queue", "route", "velocity", "churn", "risk", "trigger-cover"]),
    "Autonomous execution heartbeat should expose the expected loop checks.",
    baseline.autonomous_execution_heartbeat,
  );
  assert(baseline.autonomous_execution_heartbeat.items.every((item) =>
    ["pass", "watch", "fail"].includes(item.status) &&
    item.score >= 0 &&
    item.score <= 100 &&
    item.value.length > 0 &&
    item.detail.length > 0
  ), "Autonomous execution heartbeat checks should be scored and explainable.", baseline.autonomous_execution_heartbeat);
  assert(
    baseline.autonomous_execution_heartbeat.controls.some((control) => control.includes("paper-ledger")),
    "Autonomous execution heartbeat should disclose the paper-ledger boundary.",
    baseline.autonomous_execution_heartbeat,
  );
  assert(baseline.autonomous_trap_radar?.mode === "autonomous-trap-radar", "Autonomous trap radar should be present.", baseline.autonomous_trap_radar);
  assert(
    ["chase", "probe", "refresh", "trap", "exit-only", "watch", "idle"].includes(baseline.autonomous_trap_radar.status),
    "Autonomous trap radar should expose a known status.",
    baseline.autonomous_trap_radar,
  );
  assert(baseline.autonomous_trap_radar.summary.length > 0, "Autonomous trap radar should summarize the current chase/trap read.", baseline.autonomous_trap_radar);
  assert(baseline.autonomous_trap_radar.next_action.length > 0, "Autonomous trap radar should publish a next action.", baseline.autonomous_trap_radar);
  assert(baseline.autonomous_trap_radar.items.length > 0, "Autonomous trap radar should score visible candidates.", baseline.autonomous_trap_radar);
  assert(baseline.autonomous_trap_radar.trap_count >= 0, "Autonomous trap radar trap count should be non-negative.", baseline.autonomous_trap_radar);
  assert(baseline.autonomous_trap_radar.chase_count >= 0, "Autonomous trap radar chase count should be non-negative.", baseline.autonomous_trap_radar);
  assert(baseline.autonomous_trap_radar.probe_count >= 0, "Autonomous trap radar probe count should be non-negative.", baseline.autonomous_trap_radar);
  assert(baseline.autonomous_trap_radar.max_chase_usd >= 0, "Autonomous trap radar max chase size should be non-negative.", baseline.autonomous_trap_radar);
  assert(baseline.autonomous_trap_radar.fastest_review_seconds > 0, "Autonomous trap radar should publish a positive review cadence.", baseline.autonomous_trap_radar);
  assert(
    baseline.autonomous_trap_radar.controls.some((control) => control.includes("Moonshot-style momentum")) &&
      baseline.autonomous_trap_radar.controls.some((control) => control.includes("exit-liquidity traps")),
    "Autonomous trap radar should disclose its momentum-versus-trap boundary.",
    baseline.autonomous_trap_radar,
  );
  assert(baseline.autonomous_trap_radar.items.every((item) =>
    item.token_id.length > 0 &&
    item.symbol.length > 0 &&
    ["chase", "probe", "refresh", "trap", "exit-only", "watch"].includes(item.verdict) &&
    item.trap_score >= 0 &&
    item.trap_score <= 100 &&
    item.chase_score >= 0 &&
    item.chase_score <= 100 &&
    item.organic_score >= 0 &&
    item.organic_score <= 100 &&
    item.paid_hype_score >= 0 &&
    item.paid_hype_score <= 100 &&
    item.liquidity_stress_score >= 0 &&
    item.liquidity_stress_score <= 100 &&
    item.holder_risk_score >= 0 &&
    item.holder_risk_score <= 100 &&
    item.sell_pressure_score >= 0 &&
    item.sell_pressure_score <= 100 &&
    item.route_gap_score >= 0 &&
    item.route_gap_score <= 100 &&
    item.wallet_heat_score >= 0 &&
    item.wallet_heat_score <= 100 &&
    item.max_chase_usd >= 0 &&
    item.review_after_seconds > 0 &&
    item.reason.length > 0 &&
    item.evidence.length > 0
  ), "Autonomous trap radar items should expose bounded chase/trap evidence.", baseline.autonomous_trap_radar);
  assert(baseline.autonomous_profit_validator?.mode === "autonomous-profit-validator", "Autonomous profit validator should be present.", baseline.autonomous_profit_validator);
  assert(
    ["validated", "scale", "probe", "protect", "refresh", "pause", "blocked", "learning"].includes(baseline.autonomous_profit_validator.status),
    "Autonomous profit validator should expose a known status.",
    baseline.autonomous_profit_validator,
  );
  assert(
    ["scale", "trade", "probe", "protect-only", "refresh-first", "stand-down"].includes(baseline.autonomous_profit_validator.permission),
    "Autonomous profit validator should expose a known permission.",
    baseline.autonomous_profit_validator,
  );
  assert(baseline.autonomous_profit_validator.profit_score >= 0 && baseline.autonomous_profit_validator.profit_score <= 100, "Autonomous profit validator score should be bounded.", baseline.autonomous_profit_validator);
  assert(typeof baseline.autonomous_profit_validator.can_press === "boolean", "Autonomous profit validator should disclose press readiness.", baseline.autonomous_profit_validator);
  assert(typeof baseline.autonomous_profit_validator.should_reduce_size === "boolean", "Autonomous profit validator should disclose size reduction.", baseline.autonomous_profit_validator);
  assert(typeof baseline.autonomous_profit_validator.should_pause_new_entries === "boolean", "Autonomous profit validator should disclose fresh-entry pause state.", baseline.autonomous_profit_validator);
  assert(typeof baseline.autonomous_profit_validator.should_protect_first === "boolean", "Autonomous profit validator should disclose protect-first state.", baseline.autonomous_profit_validator);
  assert(baseline.autonomous_profit_validator.cadence_seconds > 0, "Autonomous profit validator should expose a positive cadence.", baseline.autonomous_profit_validator);
  assert(baseline.autonomous_profit_validator.next_action.length > 0, "Autonomous profit validator should publish a next action.", baseline.autonomous_profit_validator);
  assert(
    JSON.stringify(baseline.autonomous_profit_validator.items.map((item) => item.id)) === JSON.stringify(["forecast", "realized", "friction", "route", "sizing", "drawdown", "trap"]),
    "Autonomous profit validator should expose the seven expected proof checks.",
    baseline.autonomous_profit_validator,
  );
  assert(baseline.autonomous_profit_validator.items.every((item) =>
    ["pass", "watch", "fail"].includes(item.status) &&
    item.score >= 0 &&
    item.score <= 100 &&
    item.value.length > 0 &&
    item.detail.length > 0
  ), "Autonomous profit validator proof checks should be scored and explainable.", baseline.autonomous_profit_validator);
  assert(
    baseline.autonomous_profit_validator.controls.some((control) => control.includes("paper-ledger")),
    "Autonomous profit validator should disclose the paper-ledger boundary.",
    baseline.autonomous_profit_validator,
  );
  assert(baseline.autonomous_candle_conviction?.mode === "autonomous-candle-conviction", "Autonomous candle conviction should be present.", baseline.autonomous_candle_conviction);
  assert(
    ["confirm", "probe", "refresh", "protect", "reject", "idle"].includes(baseline.autonomous_candle_conviction.status),
    "Autonomous candle conviction should expose a known status.",
    baseline.autonomous_candle_conviction,
  );
  assert(
    ["chase", "probe", "refresh", "protect", "reject", "watch"].includes(baseline.autonomous_candle_conviction.action),
    "Autonomous candle conviction should expose a known action.",
    baseline.autonomous_candle_conviction,
  );
  for (const field of ["conviction_score", "chart_score", "momentum_score", "volume_score", "structure_score", "risk_score"]) {
    assert(
      baseline.autonomous_candle_conviction[field] >= 0 && baseline.autonomous_candle_conviction[field] <= 100,
      `Autonomous candle conviction ${field} should be bounded.`,
      baseline.autonomous_candle_conviction,
    );
  }
  assert(typeof baseline.autonomous_candle_conviction.refresh_required === "boolean", "Autonomous candle conviction should disclose refresh state.", baseline.autonomous_candle_conviction);
  assert(baseline.autonomous_chart_proof_target?.mode === "autonomous-chart-proof-target", "Autonomous chart proof target should be present.", baseline.autonomous_chart_proof_target);
  assert(["ready", "waiting", "blocked"].includes(baseline.autonomous_chart_proof_target.status), "Autonomous chart proof target should expose a known status.", baseline.autonomous_chart_proof_target);
  assert(
    baseline.autonomous_chart_proof_target.target_symbol === baseline.autonomous_candle_conviction.target_symbol,
    "Autonomous chart proof target should mirror the candle conviction target.",
    { target: baseline.autonomous_chart_proof_target, candle: baseline.autonomous_candle_conviction },
  );
  assert(baseline.autonomous_chart_proof_target.timeframe === "minute", "Autonomous chart proof target should request minute candles.", baseline.autonomous_chart_proof_target);
  assert(baseline.autonomous_chart_proof_target.candle_limit === 48, "Autonomous chart proof target should request a bounded candle window.", baseline.autonomous_chart_proof_target);
  assert(typeof baseline.autonomous_chart_proof_target.should_fetch === "boolean", "Autonomous chart proof target should disclose whether a fetch is needed.", baseline.autonomous_chart_proof_target);
  assert(baseline.autonomous_chart_proof_target.reason.length > 0, "Autonomous chart proof target should explain the selected target.", baseline.autonomous_chart_proof_target);
  assert(baseline.autonomous_now_decision?.mode === "autonomous-now-decision", "Autonomous now decision should be present.", baseline.autonomous_now_decision);
  assert(
    ["attack", "probe", "protect", "refresh", "loop", "blocked", "watch", "idle"].includes(baseline.autonomous_now_decision.status),
    "Autonomous now decision should expose a known status.",
    baseline.autonomous_now_decision,
  );
  assert(
    ["paper-buy", "paper-probe", "paper-sell", "protect", "refresh-route", "refresh-candles", "stand-down", "watch", "run-loop"].includes(baseline.autonomous_now_decision.action),
    "Autonomous now decision should expose a known action.",
    baseline.autonomous_now_decision,
  );
  assert(baseline.autonomous_now_decision.decision_score >= 0 && baseline.autonomous_now_decision.decision_score <= 100, "Autonomous now decision score should be bounded.", baseline.autonomous_now_decision);
  assert(baseline.autonomous_now_decision.target_symbol === baseline.autonomous_execution_runway.target_symbol, "Autonomous now decision should mirror the runway target.", {
    now: baseline.autonomous_now_decision,
    runway: baseline.autonomous_execution_runway,
  });
  assert(baseline.autonomous_now_decision.execution_boundary === baseline.autonomous_execution_runway.execution_boundary, "Autonomous now decision should expose the same execution boundary as the runway.", {
    now: baseline.autonomous_now_decision,
    runway: baseline.autonomous_execution_runway,
  });
  assert(baseline.autonomous_now_decision.chart_proof_required === (baseline.autonomous_execution_runway.should_refresh_chart || baseline.autonomous_chart_proof_target.should_fetch || baseline.autonomous_chart_proof_target.status === "blocked"), "Autonomous now decision should mirror chart-proof refresh pressure.", {
    now: baseline.autonomous_now_decision,
    runway: baseline.autonomous_execution_runway,
    target: baseline.autonomous_chart_proof_target,
  });
  assert(baseline.autonomous_now_decision.route_refresh_required === (baseline.autonomous_execution_runway.should_refresh_route || baseline.autonomous_order_ticket.route_required || baseline.autonomous_order_ticket_execution.status === "route-refresh"), "Autonomous now decision should mirror route-refresh pressure.", baseline.autonomous_now_decision);
  if (baseline.autonomous_now_decision.route_refresh_required) {
    assert(baseline.autonomous_now_decision.button_label === "Refresh read", "Route-refresh now decisions should prefer the read-only route refresh button.", baseline.autonomous_now_decision);
  } else if (baseline.autonomous_now_decision.chart_proof_required) {
    assert(baseline.autonomous_now_decision.button_label === "Proof + tick", "Chart-refresh now decisions should prefer the smart proof plus tick button.", baseline.autonomous_now_decision);
  }
  assert(typeof baseline.autonomous_now_decision.can_auto_paper === "boolean", "Autonomous now decision should disclose auto-paper permission.", baseline.autonomous_now_decision);
  assert(typeof baseline.autonomous_now_decision.can_auto_watch_run === "boolean", "Autonomous now decision should disclose auto-watch permission.", baseline.autonomous_now_decision);
  assert(baseline.autonomous_now_decision.proof.map((item) => item.id).join(",") === "market,route,chart,wallet,loop,ticket", "Autonomous now decision should expose the expected proof stack.", baseline.autonomous_now_decision);
  assert(baseline.autonomous_now_decision.proof.every((item) =>
    ["pass", "watch", "fail"].includes(item.status) &&
    item.score >= 0 &&
    item.score <= 100 &&
    item.value.length > 0 &&
    item.detail.length > 0
  ), "Autonomous now decision proof stack should be scored and explainable.", baseline.autonomous_now_decision);
  assert(baseline.autonomous_make_money_pulse?.mode === "autonomous-make-money-pulse", "Autonomous make-money pulse should be present.", baseline.autonomous_make_money_pulse);
  assert(
    ["attack", "probe", "harvest", "protect", "refresh", "cooldown", "blocked", "observe"].includes(baseline.autonomous_make_money_pulse.status),
    "Autonomous make-money pulse should expose a known status.",
    baseline.autonomous_make_money_pulse,
  );
  assert(
    ["paper-attack", "paper-probe", "paper-harvest", "paper-protect", "refresh-proof", "cooldown", "stand-down", "observe"].includes(baseline.autonomous_make_money_pulse.action),
    "Autonomous make-money pulse should expose a known action.",
    baseline.autonomous_make_money_pulse,
  );
  assert(baseline.autonomous_make_money_pulse.pulse_score >= 0 && baseline.autonomous_make_money_pulse.pulse_score <= 100, "Autonomous make-money pulse score should be bounded.", baseline.autonomous_make_money_pulse);
  assert(baseline.autonomous_make_money_pulse.items.map((item) => item.id).join(",") === "wallet,market,profit,protection,loop,quality", "Autonomous make-money pulse should fuse the expected lanes.", baseline.autonomous_make_money_pulse);
  assert(baseline.autonomous_make_money_pulse.items.every((item) =>
    ["pass", "watch", "fail"].includes(item.status) &&
    item.score >= 0 &&
    item.score <= 100 &&
    item.value.length > 0 &&
    item.detail.length > 0
  ), "Autonomous make-money pulse lanes should be scored and explainable.", baseline.autonomous_make_money_pulse);
  assert(baseline.autonomous_make_money_pulse.controls.some((control) => control.includes("Single make-money pulse")), "Autonomous make-money pulse should disclose the fused verdict contract.", baseline.autonomous_make_money_pulse);
  assert(baseline.autonomous_profit_benchmark?.mode === "autonomous-profit-benchmark", "Autonomous profit benchmark should be present.", baseline.autonomous_profit_benchmark);
  assert(
    ["beating-cash", "lagging-cash", "beating-selected", "lagging-selected", "protecting-capital", "learning"].includes(baseline.autonomous_profit_benchmark.status),
    "Autonomous profit benchmark should expose a known status.",
    baseline.autonomous_profit_benchmark,
  );
  assert(baseline.autonomous_profit_benchmark.benchmark_score >= 0 && baseline.autonomous_profit_benchmark.benchmark_score <= 100, "Autonomous profit benchmark score should be bounded.", baseline.autonomous_profit_benchmark);
  assert(baseline.autonomous_profit_benchmark.items.map((item) => item.id).join(",") === "cash,selected-coin,hot-coin,risk,execution", "Autonomous profit benchmark should expose the expected alpha lanes.", baseline.autonomous_profit_benchmark);
  assert(baseline.autonomous_profit_benchmark.items.every((item) =>
    ["pass", "watch", "fail"].includes(item.status) &&
    item.score >= 0 &&
    item.score <= 100 &&
    item.value.length > 0 &&
    item.detail.length > 0
  ), "Autonomous profit benchmark lanes should be scored and explainable.", baseline.autonomous_profit_benchmark);
  assert(baseline.autonomous_profit_benchmark.controls.some((control) => control.includes("idle cash")), "Autonomous profit benchmark should disclose its cash baseline.", baseline.autonomous_profit_benchmark);
  assert(baseline.autonomous_alpha_feedback_loop?.mode === "autonomous-alpha-feedback-loop", "Autonomous alpha feedback loop should be present.", baseline.autonomous_alpha_feedback_loop);
  assert(
    ["press", "retarget", "tighten", "protect", "learn", "idle"].includes(baseline.autonomous_alpha_feedback_loop.status),
    "Autonomous alpha feedback should expose a known status.",
    baseline.autonomous_alpha_feedback_loop,
  );
  assert(
    ["increase-bias", "retarget-hot-lane", "tighten-size", "protect-capital", "collect-evidence", "stand-down"].includes(baseline.autonomous_alpha_feedback_loop.action),
    "Autonomous alpha feedback should expose a known action.",
    baseline.autonomous_alpha_feedback_loop,
  );
  assert(baseline.autonomous_alpha_feedback_loop.feedback_score >= 0 && baseline.autonomous_alpha_feedback_loop.feedback_score <= 100, "Autonomous alpha feedback score should be bounded.", baseline.autonomous_alpha_feedback_loop);
  assert(baseline.autonomous_alpha_feedback_loop.size_bias >= 0 && baseline.autonomous_alpha_feedback_loop.size_bias <= 1.2, "Autonomous alpha feedback size bias should be bounded.", baseline.autonomous_alpha_feedback_loop);
  assert(baseline.autonomous_alpha_feedback_loop.items.map((item) => item.id).join(",") === "benchmark,gap,target,sizing,protection", "Autonomous alpha feedback should expose the expected learning lanes.", baseline.autonomous_alpha_feedback_loop);
  assert(baseline.autonomous_alpha_feedback_loop.items.every((item) =>
    ["pass", "watch", "fail"].includes(item.status) &&
    item.score >= 0 &&
    item.score <= 100 &&
    item.value.length > 0 &&
    item.detail.length > 0
  ), "Autonomous alpha feedback lanes should be scored and explainable.", baseline.autonomous_alpha_feedback_loop);
  assert(baseline.autonomous_alpha_feedback_loop.controls.some((control) => control.includes("Alpha feedback turns benchmark gaps")), "Autonomous alpha feedback should disclose its learning contract.", baseline.autonomous_alpha_feedback_loop);
  assert(baseline.autonomous_profit_thesis_verifier?.mode === "autonomous-profit-thesis-verifier", "Autonomous profit thesis verifier should be present.", baseline.autonomous_profit_thesis_verifier);
  assert(
    ["validated", "probing", "retarget", "tighten", "protect", "blocked", "learning"].includes(baseline.autonomous_profit_thesis_verifier.status),
    "Autonomous profit thesis should expose a known status.",
    baseline.autonomous_profit_thesis_verifier,
  );
  assert(
    ["press-thesis", "probe-thesis", "retarget-thesis", "tighten-size", "protect-capital", "block-thesis", "collect-evidence"].includes(baseline.autonomous_profit_thesis_verifier.action),
    "Autonomous profit thesis should expose a known action.",
    baseline.autonomous_profit_thesis_verifier,
  );
  assert(baseline.autonomous_profit_thesis_verifier.thesis_score >= 0 && baseline.autonomous_profit_thesis_verifier.thesis_score <= 100, "Autonomous profit thesis score should be bounded.", baseline.autonomous_profit_thesis_verifier);
  assert(baseline.autonomous_profit_thesis_verifier.sizing_multiplier >= 0 && baseline.autonomous_profit_thesis_verifier.sizing_multiplier <= 1.2, "Autonomous profit thesis sizing multiplier should be bounded.", baseline.autonomous_profit_thesis_verifier);
  assert(baseline.autonomous_profit_thesis_verifier.items.map((item) => item.id).join(",") === "setup,evidence,outcome,alpha,risk", "Autonomous profit thesis should expose the expected verification lanes.", baseline.autonomous_profit_thesis_verifier);
  assert(baseline.autonomous_profit_thesis_verifier.items.every((item) =>
    ["pass", "watch", "fail"].includes(item.status) &&
    item.score >= 0 &&
    item.score <= 100 &&
    item.value.length > 0 &&
    item.detail.length > 0
  ), "Autonomous profit thesis lanes should be scored and explainable.", baseline.autonomous_profit_thesis_verifier);
  assert(baseline.autonomous_profit_thesis_verifier.controls.some((control) => control.includes("idle cash")), "Autonomous profit thesis should disclose its cash comparison contract.", baseline.autonomous_profit_thesis_verifier);
  assert(baseline.autonomous_opportunity_ranker?.mode === "autonomous-opportunity-ranker", "Autonomous opportunity ranker should be present.", baseline.autonomous_opportunity_ranker);
  assert(
    ["attack-ready", "probe-ready", "retarget", "protect", "refresh", "blocked", "learning", "idle"].includes(baseline.autonomous_opportunity_ranker.status),
    "Autonomous opportunity ranker should expose a known status.",
    baseline.autonomous_opportunity_ranker,
  );
  assert(baseline.autonomous_opportunity_ranker.best_score >= 0 && baseline.autonomous_opportunity_ranker.best_score <= 100, "Autonomous opportunity ranker best score should be bounded.", baseline.autonomous_opportunity_ranker);
  assert(baseline.autonomous_opportunity_ranker.items.length > 0, "Autonomous opportunity ranker should expose ranked candidates.", baseline.autonomous_opportunity_ranker);
  assert(baseline.autonomous_opportunity_ranker.items.every((item) =>
    ["attack", "probe", "watch", "refresh", "protect", "blocked"].includes(item.status) &&
    ["paper-attack", "paper-probe", "watch", "refresh-proof", "protect-capital", "block"].includes(item.action) &&
    item.opportunity_score >= 0 &&
    item.opportunity_score <= 100 &&
    item.scanner_score >= 0 &&
    item.scanner_score <= 100 &&
    item.alpha_quality_score >= 0 &&
    item.alpha_quality_score <= 100 &&
    item.trap_clearance_score >= 0 &&
    item.trap_clearance_score <= 100 &&
    item.tradeability_score >= 0 &&
    item.tradeability_score <= 100 &&
    item.thesis_fit_score >= 0 &&
    item.thesis_fit_score <= 100 &&
    item.noise_score >= 0 &&
    item.noise_score <= 100 &&
    item.symbol.length > 0 &&
    item.decision.length > 0
  ), "Autonomous opportunity ranker candidates should be scored and explainable.", baseline.autonomous_opportunity_ranker);
  assert(baseline.autonomous_opportunity_ranker.controls.some((control) => control.includes("scanner readiness")), "Autonomous opportunity ranker should disclose its ranking contract.", baseline.autonomous_opportunity_ranker);
  assert(baseline.autonomous_rotation_director?.mode === "autonomous-rotation-director", "Autonomous rotation director should be present.", baseline.autonomous_rotation_director);
  assert(
    ["rotate-now", "retarget", "protect", "harvest", "hold", "blocked", "idle"].includes(baseline.autonomous_rotation_director.status),
    "Autonomous rotation director should expose a known status.",
    baseline.autonomous_rotation_director,
  );
  assert(
    ["rotate-capital", "retarget-hot-coin", "protect-position", "harvest-profit", "hold-current", "stand-down"].includes(baseline.autonomous_rotation_director.action),
    "Autonomous rotation director should expose a known action.",
    baseline.autonomous_rotation_director,
  );
  assert(baseline.autonomous_rotation_director.rotation_score >= 0 && baseline.autonomous_rotation_director.rotation_score <= 100, "Autonomous rotation score should be bounded.", baseline.autonomous_rotation_director);
  assert(baseline.autonomous_rotation_director.items.map((item) => item.id).join(",") === "candidate,release,capital,profit,integrity", "Autonomous rotation director should expose the expected evidence rows.", baseline.autonomous_rotation_director);
  assert(baseline.autonomous_rotation_director.items.every((item) =>
    ["pass", "watch", "fail"].includes(item.status) &&
    item.score >= 0 &&
    item.score <= 100 &&
    item.value.length > 0 &&
    item.detail.length > 0
  ), "Autonomous rotation director rows should be scored and explainable.", baseline.autonomous_rotation_director);
  assert(baseline.autonomous_rotation_director.controls.some((control) => control.includes("local-paper only")), "Autonomous rotation director should disclose its paper-only boundary.", baseline.autonomous_rotation_director);
  assert(baseline.autonomous_rotation_director.controls.some((control) => control.includes("does not churn")), "Autonomous rotation director should disclose churn discipline.", baseline.autonomous_rotation_director);
  assert(baseline.autonomous_opportunity_rank_execution?.mode === "opportunity-rank-paper-execution", "Ranked opportunity paper execution should be present.", baseline.autonomous_opportunity_rank_execution);
  assert(
    ["queued", "applied", "blocked", "idle"].includes(baseline.autonomous_opportunity_rank_execution.status),
    "Ranked opportunity paper execution should expose a known status.",
    baseline.autonomous_opportunity_rank_execution,
  );
  assert(
    baseline.autonomous_opportunity_rank_execution.selected_action === null ||
      ["paper-attack", "paper-probe", "watch", "refresh-proof", "protect-capital", "block"].includes(baseline.autonomous_opportunity_rank_execution.selected_action),
    "Ranked opportunity paper execution should expose a known selected action.",
    baseline.autonomous_opportunity_rank_execution,
  );
  assert(baseline.autonomous_opportunity_rank_execution.paper_size_usd >= 0, "Ranked opportunity paper execution size should be non-negative.", baseline.autonomous_opportunity_rank_execution);
  assert(
    baseline.autonomous_opportunity_rank_execution.opportunity_score >= 0 &&
      baseline.autonomous_opportunity_rank_execution.opportunity_score <= 100,
    "Ranked opportunity paper execution score should be bounded.",
    baseline.autonomous_opportunity_rank_execution,
  );
  assert(
    baseline.autonomous_opportunity_rank_execution.execution_boundary === "paper-ledger-only",
    "Ranked opportunity execution must stay inside the paper-ledger boundary.",
    baseline.autonomous_opportunity_rank_execution,
  );
  assert(
    baseline.autonomous_opportunity_rank_execution.controls.some((control) => control.includes("local paper-ledger buy candidate")),
    "Ranked opportunity execution should disclose its paper-only candidate contract.",
    baseline.autonomous_opportunity_rank_execution,
  );
  assert(typeof baseline.autonomous_candle_conviction.proof_target_matched === "boolean", "Autonomous candle conviction should disclose proof target lock state.", baseline.autonomous_candle_conviction);
  assert(
    baseline.autonomous_candle_conviction.saved_proof_symbol === null ||
      typeof baseline.autonomous_candle_conviction.saved_proof_symbol === "string",
    "Autonomous candle conviction should expose the saved proof symbol when available.",
    baseline.autonomous_candle_conviction,
  );
  assert(
    baseline.autonomous_candle_conviction.proof_target_mismatch === null ||
      typeof baseline.autonomous_candle_conviction.proof_target_mismatch === "string",
    "Autonomous candle conviction should expose target mismatch text when saved proof cannot be used.",
    baseline.autonomous_candle_conviction,
  );
  assert(typeof baseline.autonomous_candle_conviction.blocks_fresh_buy === "boolean", "Autonomous candle conviction should disclose fresh-buy blocking.", baseline.autonomous_candle_conviction);
  assert(baseline.autonomous_candle_conviction.max_size_multiplier >= 0, "Autonomous candle conviction max-size multiplier should be non-negative.", baseline.autonomous_candle_conviction);
  assert(baseline.autonomous_candle_conviction.review_after_seconds > 0, "Autonomous candle conviction should expose a positive review cadence.", baseline.autonomous_candle_conviction);
  assert(baseline.autonomous_candle_conviction.summary.length > 0, "Autonomous candle conviction should summarize chart proof.", baseline.autonomous_candle_conviction);
  assert(baseline.autonomous_candle_conviction.next_action.length > 0, "Autonomous candle conviction should publish a next action.", baseline.autonomous_candle_conviction);
  assert(
    JSON.stringify(baseline.autonomous_candle_conviction.items.map((item) => item.id)) === JSON.stringify(["momentum", "volume", "structure", "refresh", "risk"]),
    "Autonomous candle conviction should expose the five expected candle checks.",
    baseline.autonomous_candle_conviction,
  );
  assert(baseline.autonomous_candle_conviction.items.every((item) =>
    ["pass", "watch", "fail"].includes(item.status) &&
    item.score >= 0 &&
    item.score <= 100 &&
    item.detail.length > 0
  ), "Autonomous candle conviction checks should be scored and explainable.", baseline.autonomous_candle_conviction);
  assert(
    baseline.autonomous_candle_conviction.controls.some((control) => control.includes("GeckoTerminal-style")) &&
      baseline.autonomous_candle_conviction.controls.some((control) => control.includes("local paper buys")),
    "Autonomous candle conviction should disclose chart-source and paper-only boundaries.",
    baseline.autonomous_candle_conviction,
  );
  assert(baseline.autonomous_order_ticket?.mode === "autonomous-order-ticket", "Autonomous order ticket should be present.", baseline.autonomous_order_ticket);
  assert(
    ["ready", "protect", "refresh", "blocked", "watch", "idle"].includes(baseline.autonomous_order_ticket.status),
    "Autonomous order ticket should expose a known status.",
    baseline.autonomous_order_ticket,
  );
  assert(["buy", "sell", "hold"].includes(baseline.autonomous_order_ticket.side), "Autonomous order ticket should expose a known side.", baseline.autonomous_order_ticket);
  assert(baseline.autonomous_order_ticket.ticket_id.length > 0, "Autonomous order ticket should expose a deterministic ticket id.", baseline.autonomous_order_ticket);
  assert(baseline.autonomous_order_ticket.paper_notional_usd >= 0, "Autonomous order ticket paper notional should be non-negative.", baseline.autonomous_order_ticket);
  assert(baseline.autonomous_order_ticket.max_trade_usd >= 0, "Autonomous order ticket max trade should be non-negative.", baseline.autonomous_order_ticket);
  assert(baseline.autonomous_order_ticket.review_after_seconds > 0, "Autonomous order ticket should expose a positive review cadence.", baseline.autonomous_order_ticket);
  assert(baseline.autonomous_order_ticket.confidence_score >= 0 && baseline.autonomous_order_ticket.confidence_score <= 100, "Autonomous order ticket confidence should be bounded.", baseline.autonomous_order_ticket);
  assert(baseline.autonomous_order_ticket.trap_score >= 0 && baseline.autonomous_order_ticket.trap_score <= 100, "Autonomous order ticket trap score should be bounded.", baseline.autonomous_order_ticket);
  assert(baseline.autonomous_order_ticket.route_score >= 0 && baseline.autonomous_order_ticket.route_score <= 100, "Autonomous order ticket route score should be bounded.", baseline.autonomous_order_ticket);
  assert(baseline.autonomous_order_ticket.wallet_heat_score >= 0 && baseline.autonomous_order_ticket.wallet_heat_score <= 100, "Autonomous order ticket wallet heat should be bounded.", baseline.autonomous_order_ticket);
  assert(
    ["attack", "scalp", "rotate", "distribute", "protect", "chop", "idle"].includes(baseline.autonomous_order_ticket.regime_status),
    "Autonomous order ticket should expose a known regime status.",
    baseline.autonomous_order_ticket,
  );
  assert(
    ["attack", "scalp", "probe", "rotate", "trim", "protect", "avoid", "missing"].includes(baseline.autonomous_order_ticket.regime_action),
    "Autonomous order ticket should expose a known regime action.",
    baseline.autonomous_order_ticket,
  );
  assert(baseline.autonomous_order_ticket.regime_score >= 0 && baseline.autonomous_order_ticket.regime_score <= 100, "Autonomous order ticket regime score should be bounded.", baseline.autonomous_order_ticket);
  assert(typeof baseline.autonomous_order_ticket.regime_required === "boolean", "Autonomous order ticket should disclose whether regime blocks fresh buys.", baseline.autonomous_order_ticket);
  assert(
    ["confirmed", "probe", "requote", "protect", "blocked", "idle", "route", "resize", "slice", "clear", "watch", "paper", "missing"].includes(baseline.autonomous_order_ticket.friction_status),
    "Autonomous order ticket should expose a known friction status.",
    baseline.autonomous_order_ticket,
  );
  assert(
    ["confirm", "probe", "requote", "wait", "block", "protect", "route", "resize", "slice", "allow", "split", "private-route", "tighten-slippage", "paper", "missing"].includes(baseline.autonomous_order_ticket.friction_action),
    "Autonomous order ticket should expose a known friction action.",
    baseline.autonomous_order_ticket,
  );
  assert(baseline.autonomous_order_ticket.friction_score >= 0 && baseline.autonomous_order_ticket.friction_score <= 100, "Autonomous order ticket friction score should be bounded.", baseline.autonomous_order_ticket);
  assert(baseline.autonomous_order_ticket.friction_cost_bps >= 0, "Autonomous order ticket friction cost should be non-negative.", baseline.autonomous_order_ticket);
  assert(baseline.autonomous_order_ticket.friction_impact_bps >= 0, "Autonomous order ticket friction impact should be non-negative.", baseline.autonomous_order_ticket);
  assert(baseline.autonomous_order_ticket.friction_slippage_bps >= 0, "Autonomous order ticket friction slippage should be non-negative.", baseline.autonomous_order_ticket);
  assert(baseline.autonomous_order_ticket.friction_mev_risk_score >= 0 && baseline.autonomous_order_ticket.friction_mev_risk_score <= 100, "Autonomous order ticket MEV risk should be bounded.", baseline.autonomous_order_ticket);
  assert(typeof baseline.autonomous_order_ticket.friction_required === "boolean", "Autonomous order ticket should disclose whether friction requires refresh or blocks fresh buys.", baseline.autonomous_order_ticket);
  assert(
    ["chase", "probe", "harvest", "expired", "cooldown", "idle", "missing"].includes(baseline.autonomous_order_ticket.timing_status),
    "Autonomous order ticket should expose a known timing status.",
    baseline.autonomous_order_ticket,
  );
  assert(
    ["chase", "probe", "hold", "harvest", "expire", "block", "missing"].includes(baseline.autonomous_order_ticket.timing_action),
    "Autonomous order ticket should expose a known timing action.",
    baseline.autonomous_order_ticket,
  );
  assert(baseline.autonomous_order_ticket.timing_score >= 0 && baseline.autonomous_order_ticket.timing_score <= 100, "Autonomous order ticket timing score should be bounded.", baseline.autonomous_order_ticket);
  assert(baseline.autonomous_order_ticket.timing_freshness_score >= 0 && baseline.autonomous_order_ticket.timing_freshness_score <= 100, "Autonomous order ticket timing freshness should be bounded.", baseline.autonomous_order_ticket);
  assert(baseline.autonomous_order_ticket.timing_decay_seconds >= 0, "Autonomous order ticket timing decay should be non-negative.", baseline.autonomous_order_ticket);
  assert(typeof baseline.autonomous_order_ticket.timing_required === "boolean", "Autonomous order ticket should disclose whether timing requires refresh or blocks fresh buys.", baseline.autonomous_order_ticket);
  assert(
    ["press", "scale", "probe", "halve", "protect", "pause", "idle"].includes(baseline.autonomous_order_ticket.size_governor_status),
    "Autonomous order ticket should disclose a known size governor status.",
    baseline.autonomous_order_ticket,
  );
  assert(typeof baseline.autonomous_order_ticket.size_governor_can_trade_paper === "boolean", "Autonomous order ticket should disclose size governor paper readiness.", baseline.autonomous_order_ticket);
  assert(baseline.autonomous_order_ticket.size_governor_final_size_usd >= 0, "Autonomous order ticket should disclose a non-negative size governor cap.", baseline.autonomous_order_ticket);
  assert(baseline.autonomous_order_ticket.size_governor_memory_multiplier >= 0, "Autonomous order ticket should disclose a non-negative memory multiplier.", baseline.autonomous_order_ticket);
  assert(typeof baseline.autonomous_order_ticket.size_governor_memory_blocked === "boolean", "Autonomous order ticket should disclose memory fresh-buy blocking.", baseline.autonomous_order_ticket);
  assert(
    baseline.autonomous_order_ticket.size_governor_status === baseline.autonomous_size_governor.status &&
      baseline.autonomous_order_ticket.size_governor_final_size_usd === baseline.autonomous_size_governor.final_size_usd &&
      baseline.autonomous_order_ticket.size_governor_memory_multiplier === baseline.autonomous_size_governor.outcome_memory_multiplier &&
      baseline.autonomous_order_ticket.size_governor_memory_blocked === baseline.autonomous_size_governor.outcome_memory_blocks_fresh_buy,
    "Autonomous order ticket should mirror the active size governor cap and memory decision.",
    { ticket: baseline.autonomous_order_ticket, governor: baseline.autonomous_size_governor },
  );
  if (baseline.autonomous_order_ticket.side === "buy") {
    assert(
      baseline.autonomous_order_ticket.paper_notional_usd <= baseline.autonomous_order_ticket.size_governor_final_size_usd,
      "Fresh-buy order ticket should not exceed the size governor final cap.",
      { ticket: baseline.autonomous_order_ticket, governor: baseline.autonomous_size_governor },
    );
    if (baseline.autonomous_order_ticket.size_governor_memory_blocked) {
      assert(
        baseline.autonomous_order_ticket.can_auto_paper === false &&
          baseline.autonomous_order_ticket.status === "blocked",
        "Outcome-memory blocks should stop fresh-buy paper tickets.",
        { ticket: baseline.autonomous_order_ticket, governor: baseline.autonomous_size_governor },
      );
    }
  }
  assert(typeof baseline.autonomous_order_ticket.can_auto_paper === "boolean", "Autonomous order ticket should disclose paper apply readiness.", baseline.autonomous_order_ticket);
  assert(baseline.autonomous_order_ticket.can_live_execute === false, "Autonomous order ticket should keep live execution false.", baseline.autonomous_order_ticket);
  assert(
    ["paper-ledger-only", "read-only-route-refresh", "read-only-chart-refresh", "blocked-paper-only"].includes(baseline.autonomous_order_ticket.execution_boundary),
    "Autonomous order ticket should expose a known execution boundary.",
    baseline.autonomous_order_ticket,
  );
  assert(baseline.autonomous_order_ticket.summary.length > 0, "Autonomous order ticket should summarize the next action.", baseline.autonomous_order_ticket);
  assert(baseline.autonomous_order_ticket.next_action.length > 0, "Autonomous order ticket should publish a next action.", baseline.autonomous_order_ticket);
  assert(
    JSON.stringify(baseline.autonomous_order_ticket.evidence.map((item) => item.id)) === JSON.stringify(["profit", "trap", "route", "wallet", "regime", "friction", "timing", "candle", "exit"]),
    "Autonomous order ticket should expose the nine expected evidence checks.",
    baseline.autonomous_order_ticket,
  );
  assert(baseline.autonomous_order_ticket.evidence.every((item) =>
    ["pass", "watch", "fail"].includes(item.status) &&
    item.score >= 0 &&
    item.score <= 100 &&
    item.detail.length > 0
  ), "Autonomous order ticket evidence should be scored and explainable.", baseline.autonomous_order_ticket);
  assert(
    baseline.autonomous_order_ticket.controls.some((control) => control.includes("paper-ledger")) &&
      baseline.autonomous_order_ticket.controls.some((control) => control.includes("live signing")) &&
      baseline.autonomous_order_ticket.controls.some((control) => control.includes("size governor")),
    "Autonomous order ticket should disclose paper-only and live-signing boundaries.",
    baseline.autonomous_order_ticket,
  );
  assert(baseline.autonomous_order_ticket_execution?.mode === "autonomous-order-ticket-execution", "Autonomous order ticket execution receipt should be present.", baseline.autonomous_order_ticket_execution);
  assert(
    ["queued", "applied", "route-refresh", "protect-only", "blocked", "idle"].includes(baseline.autonomous_order_ticket_execution.status),
    "Autonomous order ticket execution should expose a known status.",
    baseline.autonomous_order_ticket_execution,
  );
  assert(baseline.autonomous_order_ticket_execution.ticket_id === baseline.autonomous_order_ticket.ticket_id, "Order-ticket execution should mirror the ticket id.", {
    ticket: baseline.autonomous_order_ticket,
    execution: baseline.autonomous_order_ticket_execution,
  });
  assert(baseline.autonomous_order_ticket_execution.side === baseline.autonomous_order_ticket.side, "Order-ticket execution should mirror the ticket side.", {
    ticket: baseline.autonomous_order_ticket,
    execution: baseline.autonomous_order_ticket_execution,
  });
  assert(baseline.autonomous_order_ticket_execution.lane === baseline.autonomous_order_ticket.lane, "Order-ticket execution should mirror the ticket lane.", {
    ticket: baseline.autonomous_order_ticket,
    execution: baseline.autonomous_order_ticket_execution,
  });
  assert(typeof baseline.autonomous_order_ticket_execution.paper_trade_ready === "boolean", "Order-ticket execution should disclose paper-trade readiness.", baseline.autonomous_order_ticket_execution);
  assert(typeof baseline.autonomous_order_ticket_execution.ledger_applied === "boolean", "Order-ticket execution should disclose whether the paper ledger already applied the ticket.", baseline.autonomous_order_ticket_execution);
  assert(
    ["paper-ledger-only", "read-only-route-refresh", "blocked-paper-only"].includes(baseline.autonomous_order_ticket_execution.execution_boundary),
    "Order-ticket execution should expose a known paper/read-only boundary.",
    baseline.autonomous_order_ticket_execution,
  );
  assert(baseline.autonomous_order_ticket_execution.paper_size_usd >= 0, "Order-ticket execution should expose non-negative paper size.", baseline.autonomous_order_ticket_execution);
  assert(baseline.autonomous_order_ticket_execution.confidence_score === baseline.autonomous_order_ticket.confidence_score, "Order-ticket execution should mirror ticket confidence.", {
    ticket: baseline.autonomous_order_ticket,
    execution: baseline.autonomous_order_ticket_execution,
  });
  assert(baseline.autonomous_order_ticket_execution.route_required === baseline.autonomous_order_ticket.route_required, "Order-ticket execution should mirror route-refresh need.", {
    ticket: baseline.autonomous_order_ticket,
    execution: baseline.autonomous_order_ticket_execution,
  });
  assert(
    baseline.autonomous_order_ticket_execution.controls.some((control) => control.includes("local paper execution receipt")) &&
      baseline.autonomous_order_ticket_execution.controls.some((control) => control.includes("live execution remains false")),
    "Order-ticket execution should disclose local paper-only controls.",
    baseline.autonomous_order_ticket_execution,
  );
  if (baseline.autonomous_order_ticket_execution.paper_trade_ready) {
    assert(baseline.autonomous_order_ticket_execution.paper_trade, "Ready order-ticket execution should include a paper trade payload.", baseline.autonomous_order_ticket_execution);
    assert(baseline.autonomous_order_ticket.can_live_execute === false, "Ready order-ticket execution must not enable live execution.", baseline.autonomous_order_ticket);
  }
  assert(baseline.autonomous_execution_cadence?.mode === "autonomous-execution-cadence-governor", "Autonomous execution cadence governor should be present.", baseline.autonomous_execution_cadence);
  assert(
    ["burst", "refresh", "protect", "cooldown", "blocked", "idle"].includes(baseline.autonomous_execution_cadence.status),
    "Autonomous execution cadence should expose a known status.",
    baseline.autonomous_execution_cadence,
  );
  assert(
    ["dex-discovery", "pair-refresh", "route-quote", "wallet-protect", "signal-watch"].includes(baseline.autonomous_execution_cadence.primary_lane),
    "Autonomous execution cadence should expose a known primary lane.",
    baseline.autonomous_execution_cadence,
  );
  assert(baseline.autonomous_execution_cadence.next_poll_seconds > 0, "Autonomous execution cadence should expose a positive next poll.", baseline.autonomous_execution_cadence);
  assert(baseline.autonomous_execution_cadence.next_trade_window_seconds > 0, "Autonomous execution cadence should expose a positive trade window.", baseline.autonomous_execution_cadence);
  assert(baseline.autonomous_execution_cadence.dex_discovery_budget_per_minute <= 60, "Autonomous execution cadence should respect discovery source budget.", baseline.autonomous_execution_cadence);
  assert(baseline.autonomous_execution_cadence.dex_pair_budget_per_minute <= 300, "Autonomous execution cadence should respect pair refresh source budget.", baseline.autonomous_execution_cadence);
  assert(baseline.autonomous_execution_cadence.route_quote_budget_per_minute <= 30, "Autonomous execution cadence should respect local route quote budget.", baseline.autonomous_execution_cadence);
  assert(typeof baseline.autonomous_execution_cadence.stale_order_ticket === "boolean", "Autonomous execution cadence should disclose stale ticket state.", baseline.autonomous_execution_cadence);
  assert(typeof baseline.autonomous_execution_cadence.should_refresh_market === "boolean", "Autonomous execution cadence should disclose market refresh intent.", baseline.autonomous_execution_cadence);
  assert(typeof baseline.autonomous_execution_cadence.should_refresh_routes === "boolean", "Autonomous execution cadence should disclose route refresh intent.", baseline.autonomous_execution_cadence);
  assert(typeof baseline.autonomous_execution_cadence.should_run_daemon_tick === "boolean", "Autonomous execution cadence should disclose paper daemon intent.", baseline.autonomous_execution_cadence);
  assert(typeof baseline.autonomous_execution_cadence.should_protect_wallet === "boolean", "Autonomous execution cadence should disclose wallet protection intent.", baseline.autonomous_execution_cadence);
  assert(baseline.autonomous_execution_cadence.items.length === 5, "Autonomous execution cadence should expose five monitored lanes.", baseline.autonomous_execution_cadence);
  assert(baseline.autonomous_execution_cadence.items.every((item) =>
    ["dex-discovery", "pair-refresh", "route-quote", "wallet-protect", "signal-watch"].includes(item.id) &&
    ["now", "next", "watch", "blocked"].includes(item.priority) &&
    item.cadence_seconds > 0 &&
    item.budget_per_minute > 0 &&
    item.budget_per_minute <= item.source_limit_per_minute &&
    item.utilization_pct >= 0 &&
    item.utilization_pct <= 100 &&
    item.reason.length > 0
  ), "Autonomous execution cadence lanes should be bounded and explainable.", baseline.autonomous_execution_cadence);
  assert(
    baseline.autonomous_execution_cadence.controls.some((control) => control.includes("DEX Screener-style")) &&
      baseline.autonomous_execution_cadence.controls.some((control) => control.includes("Jupiter-style")),
    "Autonomous execution cadence should disclose source-budget and route/signing boundaries.",
    baseline.autonomous_execution_cadence,
  );
  assert(baseline.autonomous_scalp_exit_autopilot?.mode === "autonomous-scalp-exit-autopilot", "Autonomous scalp exit autopilot should be present.", baseline.autonomous_scalp_exit_autopilot);
  assert(
    ["eject", "trim", "harvest", "trail", "press", "hold", "blocked", "idle"].includes(baseline.autonomous_scalp_exit_autopilot.status),
    "Autonomous scalp exit autopilot should expose a known status.",
    baseline.autonomous_scalp_exit_autopilot,
  );
  assert(
    ["eject", "trim", "harvest", "trail", "press", "hold", "refresh", "stand-down"].includes(baseline.autonomous_scalp_exit_autopilot.selected_action),
    "Autonomous scalp exit autopilot should expose a known selected action.",
    baseline.autonomous_scalp_exit_autopilot,
  );
  assert(baseline.autonomous_scalp_exit_autopilot.scalp_score >= 0 && baseline.autonomous_scalp_exit_autopilot.scalp_score <= 100, "Autonomous scalp exit score should be bounded.", baseline.autonomous_scalp_exit_autopilot);
  assert(typeof baseline.autonomous_scalp_exit_autopilot.can_release_paper === "boolean", "Autonomous scalp exit autopilot should disclose paper release readiness.", baseline.autonomous_scalp_exit_autopilot);
  assert(typeof baseline.autonomous_scalp_exit_autopilot.paper_trade_ready === "boolean", "Autonomous scalp exit autopilot should disclose paper trade readiness.", baseline.autonomous_scalp_exit_autopilot);
  assert(typeof baseline.autonomous_scalp_exit_autopilot.ledger_applied === "boolean", "Autonomous scalp exit autopilot should disclose whether its paper release is already applied.", baseline.autonomous_scalp_exit_autopilot);
  if (baseline.autonomous_scalp_exit_autopilot.paper_trade_ready) {
    assert(baseline.autonomous_scalp_exit_autopilot.paper_trade?.side === "sell", "Queued scalp-exit paper trade should be sell-side.", baseline.autonomous_scalp_exit_autopilot);
    assert(baseline.autonomous_scalp_exit_autopilot.paper_trade.size_usd > 0, "Queued scalp-exit paper trade should have positive size.", baseline.autonomous_scalp_exit_autopilot.paper_trade);
    assert(baseline.autonomous_scalp_exit_autopilot.paper_trade.reason.includes("Scalp exit autopilot"), "Queued scalp-exit paper trade should explain the scalp-exit source.", baseline.autonomous_scalp_exit_autopilot.paper_trade);
  }
  assert(typeof baseline.autonomous_scalp_exit_autopilot.should_press_winner === "boolean", "Autonomous scalp exit autopilot should disclose winner-press state.", baseline.autonomous_scalp_exit_autopilot);
  assert(typeof baseline.autonomous_scalp_exit_autopilot.should_refresh_routes === "boolean", "Autonomous scalp exit autopilot should disclose route-refresh state.", baseline.autonomous_scalp_exit_autopilot);
  assert(baseline.autonomous_scalp_exit_autopilot.fastest_decision_seconds > 0, "Autonomous scalp exit autopilot should expose a positive decision cadence.", baseline.autonomous_scalp_exit_autopilot);
  assert(baseline.autonomous_scalp_exit_autopilot.next_action.length > 0, "Autonomous scalp exit autopilot should publish a next action.", baseline.autonomous_scalp_exit_autopilot);
  assert(
    baseline.autonomous_scalp_exit_autopilot.items.length === baseline.portfolio.open_positions.length,
    "Autonomous scalp exit autopilot should score every open paper position.",
    baseline.autonomous_scalp_exit_autopilot,
  );
  assert(baseline.autonomous_scalp_exit_autopilot.items.every((item) =>
    ["eject", "trim", "harvest", "trail", "press", "hold", "refresh", "stand-down"].includes(item.action) &&
    ["now", "next", "watch"].includes(item.priority) &&
    item.scalp_score >= 0 &&
    item.scalp_score <= 100 &&
    item.decision_seconds > 0 &&
    item.reason.length > 0 &&
    item.next_action.length > 0
  ), "Autonomous scalp exit items should be scored and explainable.", baseline.autonomous_scalp_exit_autopilot);
  assert(
    baseline.autonomous_scalp_exit_autopilot.controls.some((control) => control.includes("does not sign or submit")) &&
      baseline.autonomous_scalp_exit_autopilot.controls.some((control) => control.includes("one bounded local paper")),
    "Autonomous scalp exit autopilot should disclose that it cannot sign or submit live transactions.",
    baseline.autonomous_scalp_exit_autopilot,
  );
  assert(baseline.autonomous_protection_coordinator?.mode === "autonomous-protection-coordinator", "Autonomous protection coordinator should be present.", baseline.autonomous_protection_coordinator);
  assert(
    ["applied", "queued", "blocked", "watch", "idle"].includes(baseline.autonomous_protection_coordinator.status),
    "Autonomous protection coordinator should expose a known status.",
    baseline.autonomous_protection_coordinator,
  );
  assert(baseline.autonomous_protection_coordinator.release_usd >= 0, "Autonomous protection coordinator should expose non-negative selected release.", baseline.autonomous_protection_coordinator);
  assert(baseline.autonomous_protection_coordinator.lane_release_usd >= 0, "Autonomous protection coordinator should expose non-negative raw lane release.", baseline.autonomous_protection_coordinator);
  assert(baseline.autonomous_protection_coordinator.deduped_release_usd >= 0, "Autonomous protection coordinator should expose non-negative deduped release.", baseline.autonomous_protection_coordinator);
  assert(baseline.autonomous_protection_coordinator.sell_first_release_usd >= 0, "Autonomous protection coordinator should expose non-negative sell-first release.", baseline.autonomous_protection_coordinator);
  assert(
    baseline.autonomous_protection_coordinator.deduped_release_usd <= baseline.autonomous_protection_coordinator.lane_release_usd,
    "Deduped protection release should never exceed raw lane pressure.",
    baseline.autonomous_protection_coordinator,
  );
  assert(baseline.autonomous_protection_coordinator.ready_release_usd >= 0, "Autonomous protection coordinator should expose non-negative ready release.", baseline.autonomous_protection_coordinator);
  assert(baseline.autonomous_protection_coordinator.applied_release_usd >= 0, "Autonomous protection coordinator should expose non-negative applied release.", baseline.autonomous_protection_coordinator);
  assert(baseline.autonomous_protection_coordinator.blocked_release_usd >= 0, "Autonomous protection coordinator should expose non-negative blocked release.", baseline.autonomous_protection_coordinator);
  assert(baseline.autonomous_protection_coordinator.fastest_review_seconds > 0, "Autonomous protection coordinator should expose positive review cadence.", baseline.autonomous_protection_coordinator);
  assert(baseline.autonomous_protection_coordinator.summary.length > 0 && baseline.autonomous_protection_coordinator.next_action.length > 0, "Autonomous protection coordinator should be explainable.", baseline.autonomous_protection_coordinator);
  assert(
    baseline.autonomous_protection_coordinator.controls.some((control) => control.includes("Dedupes")) &&
      baseline.autonomous_protection_coordinator.controls.some((control) => control.includes("cannot sign or submit")) &&
      baseline.autonomous_protection_coordinator.controls.some((control) => control.includes("deduped per held symbol")),
    "Autonomous protection coordinator should disclose dedupe behavior and live-execution boundary.",
    baseline.autonomous_protection_coordinator,
  );
  assert(baseline.autonomous_protection_coordinator.items.every((item) =>
    ["action-queue", "pressure-tape", "position-risk", "portfolio-tape", "scalp-exit", "surveillance"].includes(item.source) &&
    ["applied", "queued", "blocked", "watch"].includes(item.status) &&
    item.release_usd >= 0 &&
    item.review_after_seconds > 0 &&
    item.reason.length > 0 &&
    item.next_action.length > 0
  ), "Autonomous protection coordinator items should be bounded, sourced, and explainable.", baseline.autonomous_protection_coordinator);
  assert(baseline.protective_trigger_coverage?.mode === "protective-trigger-coverage", "Protective trigger coverage should be present.", baseline.protective_trigger_coverage);
  assert(
    ["covered", "plan-ready", "auth-required", "repair", "uncovered", "idle"].includes(baseline.protective_trigger_coverage.status),
    "Protective trigger coverage should expose a known status.",
    baseline.protective_trigger_coverage,
  );
  assert(baseline.protective_trigger_coverage.coverage_pct >= 0 && baseline.protective_trigger_coverage.coverage_pct <= 100, "Protective trigger coverage percentage should be bounded.", baseline.protective_trigger_coverage);
  assert(baseline.protective_trigger_coverage.protected_notional_usd >= 0, "Protective trigger coverage should expose non-negative protected notional.", baseline.protective_trigger_coverage);
  assert(baseline.protective_trigger_coverage.exposed_notional_usd >= 0, "Protective trigger coverage should expose non-negative exposed notional.", baseline.protective_trigger_coverage);
  assert(typeof baseline.protective_trigger_coverage.should_pause_fresh_buys === "boolean", "Protective trigger coverage should disclose fresh-buy pause state.", baseline.protective_trigger_coverage);
  assert(baseline.protective_trigger_coverage.fastest_review_seconds > 0, "Protective trigger coverage should expose a positive review cadence.", baseline.protective_trigger_coverage);
  assert(baseline.protective_trigger_coverage.next_action.length > 0, "Protective trigger coverage should publish a next action.", baseline.protective_trigger_coverage);
  assert(
    baseline.protective_trigger_coverage.items.length === baseline.portfolio.open_positions.length,
    "Protective trigger coverage should score every open paper position.",
    baseline.protective_trigger_coverage,
  );
  assert(baseline.protective_trigger_coverage.items.every((item) =>
    ["create-bracket", "create-stop", "authenticate", "repair", "monitor", "stand-down"].includes(item.action) &&
    ["covered", "planned", "auth-required", "repair", "uncovered", "watch"].includes(item.coverage_status) &&
    ["now", "next", "watch"].includes(item.priority) &&
    item.coverage_score >= 0 &&
    item.coverage_score <= 100 &&
    item.exposed_usd >= 0 &&
    item.reason.length > 0 &&
    item.next_action.length > 0
  ), "Protective trigger coverage items should be scored and explainable.", baseline.protective_trigger_coverage);
  assert(
    baseline.protective_trigger_coverage.controls.some((control) => control.includes("cannot create, cancel, sign, fund, or submit")),
    "Protective trigger coverage should disclose its non-custodial boundary.",
    baseline.protective_trigger_coverage,
  );
  assert(baseline.autonomous_trigger_opportunity?.mode === "autonomous-trigger-opportunity", "Autonomous trigger opportunity should be present.", baseline.autonomous_trigger_opportunity);
  assert(
    ["pre-arm", "protect", "repair", "auth-required", "monitor", "blocked", "idle"].includes(baseline.autonomous_trigger_opportunity.status),
    "Autonomous trigger opportunity should expose a known status.",
    baseline.autonomous_trigger_opportunity,
  );
  assert(["pre-arm", "protect-now", "repair", "authenticate", "monitor", "stand-down"].includes(baseline.autonomous_trigger_opportunity.selected_action), "Autonomous trigger opportunity should expose a known selected action.", baseline.autonomous_trigger_opportunity);
  assert(baseline.autonomous_trigger_opportunity.items.length === baseline.protective_trigger_coverage.items.length, "Autonomous trigger opportunity should rank every protective coverage item.", baseline.autonomous_trigger_opportunity);
  assert(baseline.autonomous_trigger_opportunity.opportunity_score >= 0 && baseline.autonomous_trigger_opportunity.opportunity_score <= 100, "Autonomous trigger opportunity score should be bounded.", baseline.autonomous_trigger_opportunity);
  assert(baseline.autonomous_trigger_opportunity.fastest_review_seconds > 0, "Autonomous trigger opportunity should expose a review cadence.", baseline.autonomous_trigger_opportunity);
  assert(typeof baseline.autonomous_trigger_opportunity.can_prearm_unsigned_trigger === "boolean", "Autonomous trigger opportunity should disclose unsigned pre-arm readiness.", baseline.autonomous_trigger_opportunity);
  assert(typeof baseline.autonomous_trigger_opportunity.should_pause_fresh_buys === "boolean", "Autonomous trigger opportunity should disclose fresh-buy pause state.", baseline.autonomous_trigger_opportunity);
  assert(baseline.autonomous_trigger_opportunity.controls.some((control) => control.includes("protective Trigger opportunities")), "Autonomous trigger opportunity should disclose its source evidence.", baseline.autonomous_trigger_opportunity);
  assert(baseline.autonomous_trigger_opportunity.controls.some((control) => control.includes("cannot sign")), "Autonomous trigger opportunity should disclose its live execution boundary.", baseline.autonomous_trigger_opportunity);
  assert(baseline.autonomous_trigger_opportunity.items.every((item) =>
    ["pre-arm", "protect-now", "repair", "authenticate", "monitor", "stand-down"].includes(item.action) &&
    ["ready", "watch", "blocked", "idle"].includes(item.status) &&
    item.opportunity_score >= 0 &&
    item.opportunity_score <= 100 &&
    item.edge_decay_score >= 0 &&
    item.edge_decay_score <= 100 &&
      item.review_after_seconds > 0 &&
    item.reason.length > 0
  ), "Autonomous trigger opportunity items should be scored and explainable.", baseline.autonomous_trigger_opportunity);
  assert(baseline.autonomous_launch_timing?.mode === "autonomous-launch-timing", "Autonomous launch timing should be present.", baseline.autonomous_launch_timing);
  assert(
    ["snipe", "probe", "confirm", "late-chase", "fade", "blocked", "idle"].includes(baseline.autonomous_launch_timing.status),
    "Autonomous launch timing should expose a known status.",
    baseline.autonomous_launch_timing,
  );
  assert(["snipe-now", "probe", "confirm", "late-chase", "fade", "stand-down"].includes(baseline.autonomous_launch_timing.selected_action), "Autonomous launch timing should expose a known action.", baseline.autonomous_launch_timing);
  assert(baseline.autonomous_launch_timing.timing_score >= 0 && baseline.autonomous_launch_timing.timing_score <= 100, "Autonomous launch timing score should be bounded.", baseline.autonomous_launch_timing);
  assert(baseline.autonomous_launch_timing.fastest_review_seconds > 0, "Autonomous launch timing should expose a review cadence.", baseline.autonomous_launch_timing);
  assert(typeof baseline.autonomous_launch_timing.should_wait_confirmation === "boolean", "Autonomous launch timing should disclose confirmation wait state.", baseline.autonomous_launch_timing);
  assert(typeof baseline.autonomous_launch_timing.should_block_late_chase === "boolean", "Autonomous launch timing should disclose late-chase block state.", baseline.autonomous_launch_timing);
  assert(baseline.autonomous_launch_timing.controls.some((control) => control.includes("Moonshot-style entry timing")), "Autonomous launch timing should disclose its entry timing model.", baseline.autonomous_launch_timing);
  assert(baseline.autonomous_launch_timing.controls.some((control) => control.includes("cannot guarantee profit")), "Autonomous launch timing should disclose its execution boundary.", baseline.autonomous_launch_timing);
  assert(baseline.autonomous_launch_timing.items.length > 0, "Autonomous launch timing should rank launch candidates.", baseline.autonomous_launch_timing);
  assert(baseline.autonomous_launch_timing.items.every((item) =>
    ["fresh-launch", "early-momentum", "migration-window", "crowded-pump", "late-cycle", "blocked"].includes(item.phase) &&
    ["snipe-now", "probe", "confirm", "late-chase", "fade", "stand-down"].includes(item.action) &&
    ["ready", "watch", "blocked"].includes(item.status) &&
    item.timing_score >= 0 &&
    item.timing_score <= 100 &&
    item.early_edge_score >= 0 &&
    item.early_edge_score <= 100 &&
    item.crowding_score >= 0 &&
    item.crowding_score <= 100 &&
    item.paid_hype_score >= 0 &&
    item.paid_hype_score <= 100 &&
    item.review_after_seconds > 0 &&
    item.reason.length > 0
  ), "Autonomous launch timing items should be scored and explainable.", baseline.autonomous_launch_timing);
  assert(baseline.autonomous_route_refresh_execution?.mode === "autonomous-route-refresh-execution", "Autonomous route refresh execution should be present.", baseline.autonomous_route_refresh_execution);
  assert(
    ["requesting", "ready", "blocked", "watching", "idle"].includes(baseline.autonomous_route_refresh_execution.status),
    "Autonomous route refresh execution should expose a known status.",
    baseline.autonomous_route_refresh_execution,
  );
  assert(baseline.autonomous_route_refresh_execution.execution_boundary === "read-only-route-refresh", "Route refresh execution should stay read-only.", baseline.autonomous_route_refresh_execution);
  assert(typeof baseline.autonomous_route_refresh_execution.route_refresh_required === "boolean", "Route refresh execution should disclose refresh need.", baseline.autonomous_route_refresh_execution);
  assert(typeof baseline.autonomous_route_refresh_execution.can_request_readonly_quote === "boolean", "Route refresh execution should disclose quote request readiness.", baseline.autonomous_route_refresh_execution);
  assert(baseline.autonomous_route_refresh_execution.requested_quote_count >= 0, "Route refresh execution should expose non-negative request count.", baseline.autonomous_route_refresh_execution);
  assert(baseline.autonomous_route_refresh_execution.blocked_count >= 0, "Route refresh execution should expose non-negative blocker count.", baseline.autonomous_route_refresh_execution);
  assert(baseline.autonomous_route_refresh_execution.route_confidence_score >= 0, "Route refresh execution should score route confidence.", baseline.autonomous_route_refresh_execution);
  assert(baseline.autonomous_route_refresh_execution.next_refresh_seconds > 0, "Route refresh execution should expose next refresh cadence.", baseline.autonomous_route_refresh_execution);
  assert(baseline.autonomous_route_refresh_execution.next_action.length > 0, "Route refresh execution should publish a next action.", baseline.autonomous_route_refresh_execution);
  assert(
    baseline.autonomous_route_refresh_execution.controls.some((control) => control.includes("read-only quote")) &&
      baseline.autonomous_route_refresh_execution.controls.some((control) => control.includes("cannot sign")),
    "Route refresh execution should disclose read-only/no-signing controls.",
    baseline.autonomous_route_refresh_execution,
  );
  assert(
    JSON.stringify(baseline.autonomous_route_refresh_execution.checks.map((check) => check.id)) === JSON.stringify(["queue", "quote", "budget", "lane", "boundary"]),
    "Route refresh execution should expose the expected checks.",
    baseline.autonomous_route_refresh_execution,
  );
  if (baseline.route_refresh_queue?.status === "refresh-now" || baseline.route_refresh_queue?.status === "queued") {
    assert(baseline.autonomous_route_refresh_execution.route_refresh_required === true, "Queued route refresh work should require route refresh execution.", {
      queue: baseline.route_refresh_queue,
      execution: baseline.autonomous_route_refresh_execution,
    });
  }
  if (baseline.autonomous_route_refresh_execution.selected_lane === "dex-backfill" &&
    (baseline.route_refresh_queue?.status === "refresh-now" || baseline.route_refresh_queue?.status === "queued")) {
    assert(baseline.autonomous_route_refresh_execution.can_request_readonly_quote === true, "DEX backfill route repair should be requestable without a Jupiter quote payload.", baseline.autonomous_route_refresh_execution);
    assert(baseline.autonomous_route_refresh_execution.selected_quote_request === null, "DEX backfill route repair should not invent a Jupiter quote request payload.", baseline.autonomous_route_refresh_execution);
  }
  if (baseline.autonomous_route_refresh_execution.selected_lane === "jupiter-quote" &&
    baseline.autonomous_route_refresh_execution.can_request_readonly_quote) {
    assert(baseline.autonomous_route_refresh_execution.selected_quote_request !== null, "Jupiter quote route repair should include a read-only quote request payload.", baseline.autonomous_route_refresh_execution);
  }
  assert(baseline.autonomous_execution_adapter_readiness?.mode === "autonomous-execution-adapter-readiness", "Execution adapter readiness should be present.", baseline.autonomous_execution_adapter_readiness);
  assert(
    ["swap-v2-ready", "signature-gated", "credential-gated", "refresh-required", "migration-required", "paper-only", "blocked", "idle"].includes(baseline.autonomous_execution_adapter_readiness.status),
    "Execution adapter readiness should expose a known status.",
    baseline.autonomous_execution_adapter_readiness,
  );
  assert(
    ["jupiter-swap-v2", "jupiter-quote-v1", "helius-sender", "solana-rpc", "paper-ledger", "not-configured"].includes(baseline.autonomous_execution_adapter_readiness.active_adapter),
    "Execution adapter readiness should expose a known active adapter.",
    baseline.autonomous_execution_adapter_readiness,
  );
  assert(
    ["jupiter-quote-v1", "none"].includes(baseline.autonomous_execution_adapter_readiness.quote_provider),
    "Execution adapter readiness should separate quote provider from Swap V2 order execution.",
    baseline.autonomous_execution_adapter_readiness,
  );
  assert(typeof baseline.autonomous_execution_adapter_readiness.quote_request_ready === "boolean", "Execution adapter should expose quote request readiness.", baseline.autonomous_execution_adapter_readiness);
  assert(typeof baseline.autonomous_execution_adapter_readiness.swap_v2_order_ready === "boolean", "Execution adapter should expose Swap V2 order readiness.", baseline.autonomous_execution_adapter_readiness);
  assert(typeof baseline.autonomous_execution_adapter_readiness.signer_ready === "boolean", "Execution adapter should expose signer readiness.", baseline.autonomous_execution_adapter_readiness);
  assert(typeof baseline.autonomous_execution_adapter_readiness.submit_ready === "boolean", "Execution adapter should expose submit readiness.", baseline.autonomous_execution_adapter_readiness);
  assert(typeof baseline.autonomous_execution_adapter_readiness.paper_fallback_active === "boolean", "Execution adapter should expose paper fallback state.", baseline.autonomous_execution_adapter_readiness);
  assert(baseline.autonomous_execution_adapter_readiness.credential_block_count >= 0, "Execution adapter should expose non-negative credential blockers.", baseline.autonomous_execution_adapter_readiness);
  assert(baseline.autonomous_execution_adapter_readiness.migration_block_count >= 0, "Execution adapter should expose non-negative migration blockers.", baseline.autonomous_execution_adapter_readiness);
  assert(baseline.autonomous_execution_adapter_readiness.fastest_ttl_seconds >= 0, "Execution adapter should expose a bounded TTL window.", baseline.autonomous_execution_adapter_readiness);
  assert(
    baseline.autonomous_execution_adapter_readiness.readiness_score >= 0 &&
      baseline.autonomous_execution_adapter_readiness.readiness_score <= 100,
    "Execution adapter readiness score should be bounded.",
    baseline.autonomous_execution_adapter_readiness,
  );
  assert(
    baseline.autonomous_execution_adapter_readiness.controls.some((control) => control.includes("Swap V2")) &&
      baseline.autonomous_execution_adapter_readiness.controls.some((control) => control.includes("does not sign swaps")),
    "Execution adapter readiness should disclose Swap V2 and no-signing controls.",
    baseline.autonomous_execution_adapter_readiness,
  );
  assert(
    JSON.stringify(baseline.autonomous_execution_adapter_readiness.items.map((item) => item.id)) === JSON.stringify(["quote", "order", "landing", "signature", "relay", "boundary"]),
    "Execution adapter readiness should expose the expected adapter checks.",
    baseline.autonomous_execution_adapter_readiness,
  );
  assert(
    baseline.autonomous_execution_adapter_readiness.items.every((item) =>
      ["pass", "watch", "fail"].includes(item.status) &&
      item.label.length > 0 &&
      item.detail.length > 0
    ),
    "Execution adapter readiness checks should be bounded and explainable.",
    baseline.autonomous_execution_adapter_readiness,
  );
  assert(baseline.autonomous_symbol_quarantine?.mode === "autonomous-symbol-quarantine", "Symbol quarantine governor should be present.", baseline.autonomous_symbol_quarantine);
  assert(
    ["clear", "selective", "quarantine", "exit-only", "idle"].includes(baseline.autonomous_symbol_quarantine.status),
    "Symbol quarantine should expose a known status.",
    baseline.autonomous_symbol_quarantine,
  );
  assert(baseline.autonomous_symbol_quarantine.max_quarantine_score >= 0 && baseline.autonomous_symbol_quarantine.max_quarantine_score <= 100, "Symbol quarantine should score the hottest risk.", baseline.autonomous_symbol_quarantine);
  assert(baseline.autonomous_symbol_quarantine.summary.length > 0, "Symbol quarantine should explain its status.", baseline.autonomous_symbol_quarantine);
  assert(baseline.autonomous_symbol_quarantine.next_action.length > 0, "Symbol quarantine should publish a next action.", baseline.autonomous_symbol_quarantine);
  assert(
    baseline.autonomous_symbol_quarantine.controls.some((control) => control.includes("symbol-level paper buy permission")),
    "Symbol quarantine should disclose that it governs symbol-level paper buys.",
    baseline.autonomous_symbol_quarantine,
  );
  assert(
    baseline.autonomous_symbol_quarantine.items.every((item) =>
      ["allow", "probe-only", "quarantine", "exit-only"].includes(item.status) &&
      item.quarantine_score >= 0 &&
      item.quarantine_score <= 100 &&
      typeof item.max_buy_usd === "number"
    ),
    "Symbol quarantine rows should publish bounded symbol permissions.",
    baseline.autonomous_symbol_quarantine,
  );
  assert(
    Array.isArray(baseline.autonomous_tick_plan.items) && baseline.autonomous_tick_plan.items.length > 0,
    "Tick plan should expose ranked local actions.",
    baseline.autonomous_tick_plan,
  );
  assert(
    baseline.autonomous_tick_plan.controls.some((control) => control.includes("local paper tick")),
    "Tick plan should disclose the local paper-tick boundary.",
    baseline.autonomous_tick_plan,
  );
  assert(
    baseline.autonomous_tick_plan.controls.some((control) => control.includes("cannot sign")),
    "Tick plan should disclose that it cannot sign or submit.",
    baseline.autonomous_tick_plan,
  );
  assert(baseline.position_surveillance_matrix?.mode === "position-surveillance-matrix", "Position surveillance matrix should be present.", baseline.position_surveillance_matrix);
  assert(
    ["exit-now", "harvest", "refresh", "defend", "watch", "idle"].includes(baseline.position_surveillance_matrix.status),
    "Position surveillance matrix should return a known status.",
    baseline.position_surveillance_matrix,
  );
  assert(
    baseline.position_surveillance_matrix.watched_count === baseline.portfolio.open_positions.length,
    "Position surveillance matrix should watch every open paper position.",
    baseline.position_surveillance_matrix,
  );
  assert(
    baseline.position_surveillance_matrix.items.length === baseline.portfolio.open_positions.length,
    "Position surveillance matrix should expose one row per open paper position.",
    baseline.position_surveillance_matrix,
  );
  assert(
    baseline.position_surveillance_matrix.items.every((item) =>
      typeof item.stop_distance_pct === "number" &&
      typeof item.target_distance_pct === "number" &&
      typeof item.confidence_score === "number" &&
      item.evidence.length > 0
    ),
    "Position surveillance matrix rows should include stop, target, confidence, and evidence.",
    baseline.position_surveillance_matrix,
  );
  assert(
    baseline.position_surveillance_matrix.controls.some((control) => control.includes("every open paper position")),
    "Position surveillance matrix should disclose its portfolio-wide scope.",
    baseline.position_surveillance_matrix,
  );
  assert(baseline.portfolio_price_action_guard?.mode === "portfolio-price-action-guard", "Portfolio price-action guard should be present.", baseline.portfolio_price_action_guard);
  assert(
    ["eject", "trim", "harvest", "press", "watch", "idle"].includes(baseline.portfolio_price_action_guard.status),
    "Portfolio price-action guard should return a known status.",
    baseline.portfolio_price_action_guard,
  );
  assert(
    baseline.portfolio_price_action_guard.watched_count === baseline.portfolio.open_positions.length,
    "Portfolio price-action guard should score every open paper position.",
    baseline.portfolio_price_action_guard,
  );
  assert(
    baseline.portfolio_price_action_guard.items.length === baseline.portfolio.open_positions.length,
    "Portfolio price-action guard should expose one row per held paper coin.",
    baseline.portfolio_price_action_guard,
  );
  assert(
    baseline.portfolio_price_action_guard.items.every((item) =>
      typeof item.velocity_score === "number" &&
      typeof item.flow_score === "number" &&
      typeof item.exit_pressure_score === "number" &&
      item.evidence.length > 0
    ),
    "Portfolio price-action guard rows should include tape scores and evidence.",
    baseline.portfolio_price_action_guard,
  );
  assert(
    baseline.portfolio_price_action_guard.controls.some((control) => control.includes("fast price-action tape")),
    "Portfolio price-action guard should disclose its fast-tape scope.",
    baseline.portfolio_price_action_guard,
  );
  assert(baseline.trend_velocity_scanner?.mode === "trend-velocity-scanner", "Trend velocity scanner should be present.", baseline.trend_velocity_scanner);
  assert(
    ["hot", "selective", "cooldown", "blocked", "idle"].includes(baseline.trend_velocity_scanner.status),
    "Trend velocity scanner should return a known status.",
    baseline.trend_velocity_scanner,
  );
  assert(
    Array.isArray(baseline.trend_velocity_scanner.items) && baseline.trend_velocity_scanner.items.length > 0,
    "Trend velocity scanner should rank hot coin candidates.",
    baseline.trend_velocity_scanner,
  );
	  assert(
	    baseline.trend_velocity_scanner.controls.some((control) => control.includes("Moonshot-style hot coin flow")),
	    "Trend velocity scanner should disclose the hot-coin scoring role.",
	    baseline.trend_velocity_scanner,
	  );
  assert(baseline.autonomous_market_pulse?.mode === "autonomous-market-pulse", "Autonomous market pulse should be present.", baseline.autonomous_market_pulse);
  assert(
    ["attack", "selective", "protect", "cooldown", "idle"].includes(baseline.autonomous_market_pulse.status),
    "Autonomous market pulse should return a known status.",
    baseline.autonomous_market_pulse,
  );
  assert(
    Array.isArray(baseline.autonomous_market_pulse.items) && baseline.autonomous_market_pulse.items.length > 0,
    "Autonomous market pulse should rank decision-grade hot tape rows.",
    baseline.autonomous_market_pulse,
  );
  assert(
    baseline.autonomous_market_pulse.controls.some((control) => control.includes("signal/noise")) &&
      baseline.autonomous_market_pulse.controls.some((control) => control.includes("cannot sign")),
    "Autonomous market pulse should disclose signal fusion and paper-only limits.",
    baseline.autonomous_market_pulse,
  );
  assert(
    baseline.autonomous_market_pulse.items.every((item) =>
      ["attack", "probe", "watch", "protect", "stand-down"].includes(item.action) &&
      typeof item.pulse_score === "number" &&
      typeof item.organic_momentum_score === "number" &&
      typeof item.blended_edge_score === "number" &&
      typeof item.source_confirmation_score === "number" &&
      typeof item.promotion_risk_score === "number" &&
      item.review_after_seconds > 0 &&
      item.evidence.length > 0
    ),
    "Autonomous market pulse rows should include bounded action scores and evidence.",
    baseline.autonomous_market_pulse,
  );
  assert(
    typeof baseline.autonomous_market_pulse.average_organic_momentum_score === "number" &&
      typeof baseline.autonomous_market_pulse.organic_attack_count === "number" &&
      baseline.autonomous_market_pulse.controls.some((control) => control.includes("organic-momentum")),
    "Autonomous market pulse should expose the organic momentum attack gate.",
    baseline.autonomous_market_pulse,
  );
  assert(baseline.market_pulse_execution?.mode === "market-pulse-paper-execution", "Market pulse execution should be present.", baseline.market_pulse_execution);
  assert(
    ["queued", "applied", "blocked", "idle"].includes(baseline.market_pulse_execution.status),
    "Market pulse execution should return a known status.",
    baseline.market_pulse_execution,
  );
  assert(baseline.market_pulse_execution.execution_boundary === "paper-ledger-only", "Market pulse execution must stay paper-only.", baseline.market_pulse_execution);
  assert(
    baseline.market_pulse_execution.controls.some((control) => control.includes("top market-pulse")) &&
      baseline.market_pulse_execution.controls.some((control) => control.includes("paper-ledger-only")),
    "Market pulse execution should disclose its paper-only lane.",
    baseline.market_pulse_execution,
  );
  if (baseline.market_pulse_execution.paper_trade) {
    assert(baseline.market_pulse_execution.paper_trade.side === "buy", "Market pulse execution should only create fresh paper buys.", baseline.market_pulse_execution);
    assert(baseline.market_pulse_execution.paper_trade.reason.includes("Market pulse"), "Market pulse paper trade should identify its source.", baseline.market_pulse_execution);
  }
	  assert(baseline.trend_chase_execution?.mode === "trend-chase-paper-execution", "Trend chase execution should be present.", baseline.trend_chase_execution);
	  assert(
	    ["queued", "applied", "blocked", "idle"].includes(baseline.trend_chase_execution.status),
	    "Trend chase execution should return a known status.",
	    baseline.trend_chase_execution,
	  );
	  assert(baseline.trend_chase_execution.execution_boundary === "paper-ledger-only", "Trend chase execution should stay paper-only.", baseline.trend_chase_execution);
	  assert(typeof baseline.trend_chase_execution.uses_scout_reserve === "boolean", "Trend chase execution should disclose scout reserve usage.", baseline.trend_chase_execution);
	  assert(baseline.trend_chase_execution.scout_reserve_usd >= 0, "Trend chase execution should expose the scout reserve size.", baseline.trend_chase_execution);
	  assert(
	    baseline.trend_chase_execution.controls.some((control) => control.includes("hot/probe trend-velocity candidate")),
	    "Trend chase execution should disclose the hot/probe conversion role.",
	    baseline.trend_chase_execution,
	  );
	  assert(
	    baseline.trend_chase_execution.controls.some((control) => control.includes("scout reserve")),
	    "Trend chase execution should disclose sample-mode scout reserve rules.",
	    baseline.trend_chase_execution,
	  );
	  assert(baseline.scout_lifecycle?.mode === "scout-lifecycle-controller", "Scout lifecycle controller should be present.", baseline.scout_lifecycle);
	  assert(
	    ["harvest", "trim", "stop", "tighten", "watch", "idle"].includes(baseline.scout_lifecycle.status),
	    "Scout lifecycle should return a known status.",
	    baseline.scout_lifecycle,
	  );
	  assert(baseline.scout_lifecycle.execution_boundary === "paper-ledger-only", "Scout lifecycle should stay paper-only.", baseline.scout_lifecycle);
	  assert(baseline.scout_lifecycle.watched_count >= 0, "Scout lifecycle should expose watched scout count.", baseline.scout_lifecycle);
	  assert(
	    baseline.scout_lifecycle.controls.some((control) => control.includes("scout-origin")),
	    "Scout lifecycle should disclose scout-origin monitoring.",
	    baseline.scout_lifecycle,
	  );
	  if (baseline.autonomous_position_risk_execution.paper_trade) {
	    assert(baseline.autonomous_position_risk_execution.paper_trade.side === "sell", "Position risk execution should only sell held risk.", baseline.autonomous_position_risk_execution);
	  }
	  if (baseline.portfolio_tape_guard_execution.paper_trade) {
	    assert(baseline.portfolio_tape_guard_execution.paper_trade.side === "sell", "Portfolio tape guard execution should only sell held risk.", baseline.portfolio_tape_guard_execution);
	  }
  if (baseline.autonomous_opportunity_race_execution.status !== "idle") {
    assert(
      baseline.autonomous_monitor.triggers.some((trigger) => trigger.id === "opportunity-race-execution"),
      "Race execution should feed the autonomous monitor when active.",
      baseline.autonomous_monitor,
    );
  }
  assert(baseline.autonomous_trade_readiness_gate?.live_submission_allowed === false, "Live submission must stay disabled in smoke.");

  const badSource = await postTrading({ source: "live-wallet" });
  assert(badSource.response.status === 422, "Invalid market source should be rejected.", badSource.payload);
  assert(badSource.payload.error === "source must be sample or live-dex.", "Invalid source error should be specific.", badSource.payload);

  const badBurst = await postTrading({ autonomous_burst: { action: "run", max_protective_sells: 0 } });
  assert(badBurst.response.status === 422, "Invalid autonomous burst limit should be rejected.", badBurst.payload);
  assert(
    badBurst.payload.error === "autonomous_burst.max_protective_sells must be an integer from 1 to 6.",
    "Invalid burst error should be specific.",
    badBurst.payload,
  );

  const badSession = await postTrading({ autonomous_session: { action: "run", ticks: 0 } });
  assert(badSession.response.status === 422, "Invalid autonomous session tick count should be rejected.", badSession.payload);
  assert(
    badSession.payload.error === "autonomous_session.ticks must be an integer from 1 to 12.",
    "Invalid session error should be specific.",
    badSession.payload,
  );

  const badPolicyMode = await postTrading({ autonomous_session: { action: "run", policy_mode: "reckless" } });
  assert(badPolicyMode.response.status === 422, "Invalid autonomous session policy mode should be rejected.", badPolicyMode.payload);
  assert(
    badPolicyMode.payload.error === "autonomous_session.policy_mode must be auto or manual.",
    "Invalid policy mode error should be specific.",
    badPolicyMode.payload,
  );

  const badLoop = await postTrading({ autonomous_loop: { action: "run" } });
  assert(badLoop.response.status === 422, "Invalid autonomous loop action should be rejected.", badLoop.payload);
  assert(
    badLoop.payload.error === "autonomous_loop.action must be tick.",
    "Invalid loop action error should be specific.",
    badLoop.payload,
  );

  const badRouteRefresh = await postTrading({ route_refresh: { action: "swap-now" } });
  assert(badRouteRefresh.response.status === 422, "Invalid route refresh action should be rejected.", badRouteRefresh.payload);
  assert(
    badRouteRefresh.payload.error === "route_refresh.action must be request-quote.",
    "Invalid route refresh error should be specific.",
    badRouteRefresh.payload,
  );

  const routeRefresh = await postTrading({
    scenario: "base",
    source: "sample",
    account: "persistent",
    advance: false,
    route_refresh: {
      action: "request-quote",
    },
  });
  assert(routeRefresh.response.status === 200, "Read-only route refresh request should be accepted.", routeRefresh.payload);
  assert(routeRefresh.payload.autonomous_route_refresh_execution?.execution_boundary === "read-only-route-refresh", "Route refresh request must stay read-only.", routeRefresh.payload.autonomous_route_refresh_execution);
  assert(routeRefresh.payload.execution_gate?.live_execution_enabled === false, "Route refresh request must not enable live execution.", routeRefresh.payload.execution_gate);

  const dryRunSignerSetup = await postTrading({
    scenario: "base",
    source: "sample",
    account: "persistent",
    advance: false,
    execution: {
      mode: "dry-run",
      kill_switch: false,
      wallet_public_key: "11111111111111111111111111111111",
      signer_simulation_enabled: true,
      signer_session_label: "smoke-dry-run-rehearsal",
      signer_network: "devnet",
      max_trade_usd: 100,
      daily_spend_cap_usd: 10_000,
      max_slippage_bps: 150,
    },
  });
  assert(dryRunSignerSetup.response.status === 200, "Dry-run signer setup should be accepted.", dryRunSignerSetup.payload);
  assert(dryRunSignerSetup.payload.execution_readiness.config.mode === "dry-run", "Dry-run signer setup should switch to dry-run mode.", dryRunSignerSetup.payload.execution_readiness.config);
  assert(dryRunSignerSetup.payload.execution_readiness.config.kill_switch === false, "Dry-run signer setup should clear only the dry-run kill-switch rehearsal.", dryRunSignerSetup.payload.execution_readiness.config);
  assert(dryRunSignerSetup.payload.execution_readiness.config.wallet_public_key === "11111111111111111111111111111111", "Dry-run signer setup should scope a public wallet key.", dryRunSignerSetup.payload.execution_readiness.config);
  assert(dryRunSignerSetup.payload.execution_readiness.config.signer_simulation_enabled === true, "Dry-run signer setup should enable signer simulation metadata.", dryRunSignerSetup.payload.execution_readiness.config);
  assert(dryRunSignerSetup.payload.autonomous_custody_mandate.wallet_public_key === "11111111111111111111111111111111", "Dry-run signer setup should flow wallet scope into custody mandate.", dryRunSignerSetup.payload.autonomous_custody_mandate);
  assert(dryRunSignerSetup.payload.autonomous_custody_mandate.remaining_cap_usd > 0, "Dry-run signer setup should leave dry-run spend capacity for order rehearsal.", dryRunSignerSetup.payload.autonomous_custody_mandate);
  assert(dryRunSignerSetup.payload.autonomous_signer_ops.controls.some((control) => control.includes("private keys")), "Dry-run signer setup should keep private keys outside the app.", dryRunSignerSetup.payload.autonomous_signer_ops);
  assert(dryRunSignerSetup.payload.execution_gate.live_execution_enabled === false, "Dry-run signer setup must not enable live execution.", dryRunSignerSetup.payload.execution_gate);
  assert(dryRunSignerSetup.payload.autonomous_live_autonomy_readiness.can_trade_real_capital === false, "Dry-run signer setup must not permit real-capital trading.", dryRunSignerSetup.payload.autonomous_live_autonomy_readiness);

  const orderRehearsal = await postTrading({
    scenario: "breakout",
    source: "live-dex",
    account: "ephemeral",
    advance: false,
    execution: {
      mode: "dry-run",
      kill_switch: false,
      wallet_public_key: "11111111111111111111111111111111",
      signer_simulation_enabled: true,
      signer_session_label: "smoke-order-rehearsal",
      signer_network: "devnet",
      max_trade_usd: 500,
      daily_spend_cap_usd: 10_000,
      max_slippage_bps: 150,
    },
  });
  assert(orderRehearsal.response.status === 200, "Dry-run live DEX order rehearsal should be accepted.", orderRehearsal.payload);
  assert(orderRehearsal.payload.market_source.mode === "live-dex", "Order rehearsal should use the live DEX read lane.", orderRehearsal.payload.market_source);
  assert(orderRehearsal.payload.execution_readiness.config.mode === "dry-run", "Order rehearsal should keep execution in dry-run mode.", orderRehearsal.payload.execution_readiness.config);
  assert(orderRehearsal.payload.execution_readiness.config.daily_spend_cap_usd === 10_000, "Order rehearsal should carry enough dry-run cap for route/order proof.", orderRehearsal.payload.execution_readiness.config);
  assert(orderRehearsal.payload.pre_submit_rehearsal?.mode === "pre-submit-rehearsal", "Order rehearsal should expose pre-submit rehearsal evidence.", orderRehearsal.payload.pre_submit_rehearsal);
  assert(orderRehearsal.payload.autonomous_order_handoff?.mode === "autonomous-order-handoff", "Order rehearsal should expose order handoff evidence.", orderRehearsal.payload.autonomous_order_handoff);
  assert(orderRehearsal.payload.wallet_holdings_adapter?.mode === "read-only-wallet-holdings", "Order rehearsal should expose the read-only wallet holdings adapter.", orderRehearsal.payload.wallet_holdings_adapter);
  assert(orderRehearsal.payload.wallet_holdings_adapter?.controls?.some((control) => control.includes("Does not request signatures")), "Wallet holdings adapter must disclose the no-signing boundary.", orderRehearsal.payload.wallet_holdings_adapter);
  assert(orderRehearsal.payload.live_wallet_accounting_readiness?.mode === "live-wallet-accounting-readiness", "Order rehearsal should expose live wallet accounting readiness.", orderRehearsal.payload.live_wallet_accounting_readiness);
  assert(orderRehearsal.payload.live_wallet_accounting_readiness?.live_execution_permission === "blocked", "Wallet accounting readiness should not unlock live execution.", orderRehearsal.payload.live_wallet_accounting_readiness);
  assert(orderRehearsal.payload.live_wallet_accounting_readiness?.wallet_mutation_permission === "blocked", "Wallet accounting readiness should keep wallet mutation blocked.", orderRehearsal.payload.live_wallet_accounting_readiness);
  assert(orderRehearsal.payload.live_wallet_accounting_readiness?.checks?.some((check) => check.id === "pricing-coverage"), "Wallet accounting readiness should include pricing coverage evidence.", orderRehearsal.payload.live_wallet_accounting_readiness);
  assert(
    orderRehearsal.payload.discovery_tape?.sources?.some((source) => source.id === "portfolio-watch" && source.status === "ok"),
    "Order rehearsal should include held-position watchlist market refresh evidence.",
    orderRehearsal.payload.discovery_tape,
  );
  assert(
    orderRehearsal.payload.execution_plans?.some((plan) =>
      plan.side === "sell" &&
      plan.source === "jupiter" &&
      plan.output_mint === "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" &&
      plan.input_amount_source === "watchlist" &&
      [5, 6, 9].includes(plan.input_token_decimals)
    ),
    "Order rehearsal should quote at least one decimal-aware held-position protective sell route to USDC.",
    orderRehearsal.payload.execution_plans,
  );
  assert(orderRehearsal.payload.execution_gate.live_execution_enabled === false, "Order rehearsal must not enable live execution.", orderRehearsal.payload.execution_gate);
  assert(orderRehearsal.payload.autonomous_live_autonomy_readiness.can_trade_real_capital === false, "Order rehearsal must not permit real-capital trading.", orderRehearsal.payload.autonomous_live_autonomy_readiness);

  const reset = await postTrading({
    scenario: "base",
    source: "sample",
    account: "persistent",
    reset: true,
    advance: false,
  });
  assert(reset.response.status === 200, "Paper reset should succeed.", reset.payload);

  const tick = await postTrading({
    scenario: "breakout",
    source: "sample",
    account: "persistent",
    daemon: true,
    advance: false,
    autonomous_burst: {
      action: "run",
      protect_book: true,
      max_protective_sells: 3,
      min_release_usd: 25,
    },
  });
  assert(tick.response.status === 200, "Autonomous daemon tick should succeed.", tick.payload);
  assert(tick.payload.paper_daemon?.requested === true, "Daemon tick should be recorded as requested.", tick.payload.paper_daemon);
  assert(tick.payload.execution_gate?.live_execution_enabled === false, "Smoke tick must not enable live execution.", tick.payload.execution_gate);
  assert(tick.payload.autonomous_trade_mission?.next_action?.length > 0, "Mission should explain the next action.");
  assert(Array.isArray(tick.payload.autonomous_burst_scheduler?.items), "Burst scheduler should return lane items.");
  assert(tick.payload.autonomous_burst_scheduler.items.length > 0, "Burst scheduler should have at least one lane item.");
  assert(tick.payload.autonomous_tick_plan?.mode === "autonomous-tick-plan", "Daemon tick should keep the tick plan.", tick.payload.autonomous_tick_plan);
  assert(tick.payload.autonomous_tick_plan.items.length > 0, "Daemon tick plan should keep ranked actions.", tick.payload.autonomous_tick_plan);

  await postTrading({
    scenario: "breakout",
    source: "sample",
    account: "persistent",
    reset: true,
    advance: false,
  });
  const commandFirst = await postTrading({
    scenario: "breakout",
    source: "sample",
    account: "persistent",
    advance: true,
  });
  const commandFirstSell = commandFirst.payload.trade_tape.find((trade) => trade.id.startsWith("paper-command-") && trade.side === "sell");
  assert(commandFirst.response.status === 200, "First command bridge advance should succeed.", commandFirst.payload);
  assert(!commandFirstSell, "Command bridge should not sell a just-opened same-cycle paper entry.", commandFirst.payload.trade_tape);
  assert(commandFirst.payload.autonomous_command_center_execution.status === "queued", "First advance should queue the next command bridge action.", commandFirst.payload.autonomous_command_center_execution);
  const commandSecond = await postTrading({
    scenario: "breakout",
    source: "sample",
    account: "persistent",
    advance: true,
  });
  const queueFill = commandSecond.payload.autonomous_action_queue_execution.paper_trade;
  const queuedLedgerTrade = queueFill
    ? commandSecond.payload.trade_tape.find((trade) => trade.id === queueFill.id)
    : null;
  assert(commandSecond.response.status === 200, "Second command bridge advance should succeed.", commandSecond.payload);
  if (commandSecond.payload.autonomous_action_queue_execution.route_refresh_vetoed || commandSecond.payload.autonomous_action_queue_execution.alpha_decay_vetoed) {
    assert(commandSecond.payload.autonomous_action_queue_execution.status === "blocked", "Vetoed second advance should block the queue fill.", commandSecond.payload.autonomous_action_queue_execution);
    assert(commandSecond.payload.autonomous_action_queue_execution.paper_trade_ready === false, "Vetoed second advance should not expose a ready paper fill.", commandSecond.payload.autonomous_action_queue_execution);
    assert(!queuedLedgerTrade, "Vetoed second advance should not record a queue-owned ledger fill.", commandSecond.payload.autonomous_action_queue_execution);
  } else {
    assert(commandSecond.payload.autonomous_action_queue_execution.status === "applied", "Second advance should let the action queue own the applied paper fill.", commandSecond.payload.autonomous_action_queue_execution);
    assert(queueFill?.status === "paper-filled", "Action queue execution should point at an applied paper fill.", commandSecond.payload.autonomous_action_queue_execution);
    assert(queuedLedgerTrade?.id === queueFill.id, "Action queue execution should point at the recorded ledger trade.", { queueFill, tradeTape: commandSecond.payload.trade_tape });
  }
  assert(commandSecond.payload.autonomous_action_queue_execution.selected_lane !== null, "Action queue execution should disclose the winning lane.", commandSecond.payload.autonomous_action_queue_execution);
  assert(commandSecond.payload.autonomous_action_queue_execution.execution_boundary === "paper-ledger-only", "Action queue execution should stay paper-only.", commandSecond.payload.autonomous_action_queue_execution);
  assert(commandSecond.payload.autonomous_tick_bundle_feedback.next_bundle_trade_cap >= 0, "Tick bundle feedback should keep publishing the next cap after queue-owned fills.", commandSecond.payload.autonomous_tick_bundle_feedback);
  assert(commandSecond.payload.autonomous_command_center_execution.status === "queued" || commandSecond.payload.autonomous_command_center_execution.status === "blocked" || commandSecond.payload.autonomous_command_center_execution.status === "applied", "Command bridge should keep reporting its supporting lane state.", commandSecond.payload.autonomous_command_center_execution);
  assert(commandSecond.payload.autonomous_command_performance.command_trade_count >= 0, "Command performance should keep publishing command-owned fill counts.", commandSecond.payload.autonomous_command_performance);
  assert(typeof commandSecond.payload.autonomous_command_performance.net_contribution_usd === "number", "Command performance should score net contribution.", commandSecond.payload.autonomous_command_performance);
  assert(commandSecond.payload.execution_gate?.live_execution_enabled === false, "Command bridge smoke must not enable live execution.", commandSecond.payload.execution_gate);
  const sessionBaseline = await postTrading({
    scenario: "breakout",
    source: "sample",
    account: "persistent",
    reset: true,
    advance: false,
  });

  const session = await postTrading({
    scenario: "breakout",
    source: "sample",
    account: "persistent",
    autonomous_session: {
      action: "run",
      policy_mode: "auto",
    },
  });
  assert(session.response.status === 200, "Autonomous paper session should succeed.", session.payload);
  assert(session.payload.autonomous_session_run?.requested === true, "Session run should be marked requested.", session.payload.autonomous_session_run);
  assert(session.payload.autonomous_session_run.policy_mode === "auto", "Session should run in auto policy mode.", session.payload.autonomous_session_run);
  assert(session.payload.autonomous_session_run.policy_status !== "none", "Session should record the policy it followed.", session.payload.autonomous_session_run);
  assert(session.payload.autonomous_session_run.planner_status === sessionBaseline.payload.autonomous_session_planner.status, "Session should record the planner status it followed.", {
    run: session.payload.autonomous_session_run,
    planner: sessionBaseline.payload.autonomous_session_planner,
  });
  assert(session.payload.autonomous_session_run.planner_session_kind === sessionBaseline.payload.autonomous_session_planner.session_kind, "Session should record the planner session kind.", {
    run: session.payload.autonomous_session_run,
    planner: sessionBaseline.payload.autonomous_session_planner,
  });
  assert(session.payload.autonomous_session_run.planner_target_symbol === sessionBaseline.payload.autonomous_session_planner.target_symbol, "Session should record the planner target.", {
    run: session.payload.autonomous_session_run,
    planner: sessionBaseline.payload.autonomous_session_planner,
  });
  assert(session.payload.autonomous_session_run.planner_route_refresh_required === sessionBaseline.payload.autonomous_session_planner.route_refresh_required, "Session should record planner route-refresh need.", {
    run: session.payload.autonomous_session_run,
    planner: sessionBaseline.payload.autonomous_session_planner,
  });
  assert(session.payload.autonomous_session_run.completed_ticks >= 1, "Session should complete at least one paper tick.", session.payload.autonomous_session_run);
  assert(session.payload.autonomous_session_run.max_total_fills === sessionBaseline.payload.autonomous_session_planner.max_total_fills, "Session should expose the planner fill cap.", {
    run: session.payload.autonomous_session_run,
    planner: sessionBaseline.payload.autonomous_session_planner,
  });
  assert(session.payload.autonomous_session_run.summary.length > 0, "Session should summarize the wallet outcome.", session.payload.autonomous_session_run);
  assert(session.payload.autonomous_session_run.summary.includes("under auto") && session.payload.autonomous_session_run.summary.includes("planner"), "Session summary should prove it followed the auto planner.", session.payload.autonomous_session_run);
  const oneFillSession = await postTrading({
    scenario: "breakout",
    source: "sample",
    account: "ephemeral",
    autonomous_session: {
      action: "run",
      policy_mode: "manual",
      ticks: 12,
      protect_book: true,
      max_protective_sells: 3,
      min_release_usd: 25,
      max_total_fills: 1,
    },
  });
  assert(oneFillSession.response.status === 200, "One-fill autonomous paper session should succeed.", oneFillSession.payload);
  assert(oneFillSession.payload.autonomous_session_run.max_total_fills === 1, "One-fill session should echo the one-fill cap.", oneFillSession.payload.autonomous_session_run);
  assert(oneFillSession.payload.autonomous_session_run.fill_count <= 1, "One-fill session should not exceed the requested fill cap.", oneFillSession.payload.autonomous_session_run);
  assert(oneFillSession.payload.autonomous_session_run.protective_sell_count <= 1, "One-fill session should not exceed the requested protective-sell cap.", oneFillSession.payload.autonomous_session_run);
  assert(oneFillSession.payload.autonomous_session_run.summary.includes("1-fill planner cap"), "One-fill session summary should disclose the active fill cap.", oneFillSession.payload.autonomous_session_run);
  const protectMinuteBaselineResponse = await request("/api/web3-trading?scenario=base&source=sample&account=ephemeral&advance=false");
  const protectMinuteBaseline = await readJson(protectMinuteBaselineResponse);
  assert(protectMinuteBaselineResponse.status === 200, "Protect-minute baseline should load.", protectMinuteBaseline);
  assert(protectMinuteBaseline.autonomous_wake_plan?.status === "minute", "Protect-minute baseline should expose a next-minute wake plan.", protectMinuteBaseline.autonomous_wake_plan);
  assert(protectMinuteBaseline.autonomous_wake_plan.next_client_action === "run-minute", "Protect-minute baseline should ask the client to run a minute.", protectMinuteBaseline.autonomous_wake_plan);
  assert(protectMinuteBaseline.autonomous_profit_velocity_governor?.loop_permission === "protect-only", "Protect-minute baseline should be protect-only.", protectMinuteBaseline.autonomous_profit_velocity_governor);
  assert(protectMinuteBaseline.autonomous_loop_throttle?.can_run === false, "Protect-minute baseline should prove the stricter backend throttle is blocked.", protectMinuteBaseline.autonomous_loop_throttle);
  const protectMinuteTick = await postTrading({
    scenario: "base",
    source: "sample",
    account: "ephemeral",
    autonomous_loop: {
      action: "tick",
    },
  });
  assert(protectMinuteTick.response.status === 200, "Protect-minute backend loop tick should succeed.", protectMinuteTick.payload);
  assert(protectMinuteTick.payload.autonomous_loop_tick?.status === "session-run", "Protect-minute backend loop tick should run the bounded paper protect session instead of standing down.", protectMinuteTick.payload.autonomous_loop_tick);
  assert(protectMinuteTick.payload.autonomous_loop_tick.action === "protect-book", "Protect-minute backend loop tick should disclose the protect-book fallback.", protectMinuteTick.payload.autonomous_loop_tick);
  assert(protectMinuteTick.payload.autonomous_loop_tick.summary.includes("protect-minute"), "Protect-minute backend loop tick should name the wake-minute protect path.", protectMinuteTick.payload.autonomous_loop_tick);
  assert(protectMinuteTick.payload.autonomous_session_run?.requested === true, "Protect-minute backend loop tick should request a paper session.", protectMinuteTick.payload.autonomous_session_run);
  assert(
    protectMinuteTick.payload.autonomous_session_run.max_total_fills <= Math.max(1, protectMinuteBaseline.autonomous_wake_plan.max_total_fills, protectMinuteBaseline.autonomous_profit_velocity_governor.max_trades_next_minute),
    "Protect-minute backend loop tick should use wake-plan and velocity fill caps.",
    {
      baseline: protectMinuteBaseline.autonomous_wake_plan,
      velocity: protectMinuteBaseline.autonomous_profit_velocity_governor,
      session: protectMinuteTick.payload.autonomous_session_run,
    },
  );
  assert(protectMinuteTick.payload.autonomous_session_run.protective_sell_count <= protectMinuteBaseline.autonomous_wake_plan.max_protective_sells, "Protect-minute backend loop tick should respect the wake-plan protective-sell cap.", {
    baseline: protectMinuteBaseline.autonomous_wake_plan,
    session: protectMinuteTick.payload.autonomous_session_run,
  });
  const loopTick = await postTrading({
    scenario: "breakout",
    source: "sample",
    account: "persistent",
    autonomous_loop: {
      action: "tick",
    },
  });
  assert(loopTick.response.status === 200, "Autonomous loop tick should succeed.", loopTick.payload);
  assert(loopTick.payload.autonomous_loop_throttle?.mode === "autonomous-loop-throttle", "Autonomous loop tick should return throttle state.", loopTick.payload.autonomous_loop_throttle);
  assert(loopTick.payload.autonomous_wake_plan?.mode === "autonomous-wake-plan", "Autonomous loop tick should return the server-authored wake plan.", loopTick.payload.autonomous_wake_plan);
  assert(["minute", "sprint", "cycle", "protect", "refresh", "cooldown", "blocked"].includes(loopTick.payload.autonomous_wake_plan.status), "Autonomous loop tick wake plan should expose a known status.", loopTick.payload.autonomous_wake_plan);
  assert(["run-minute", "run-loop", "refresh-read", "stand-down"].includes(loopTick.payload.autonomous_wake_plan.next_client_action), "Autonomous loop tick wake plan should expose a known next action.", loopTick.payload.autonomous_wake_plan);
  assert(loopTick.payload.autonomous_wake_plan.next_wake_seconds > 0, "Autonomous loop tick wake plan should publish the next wake interval.", loopTick.payload.autonomous_wake_plan);
  assert(loopTick.payload.autonomous_market_intake_plan?.mode === "autonomous-market-intake-plan", "Autonomous loop tick should return the provider intake plan.", loopTick.payload.autonomous_market_intake_plan);
  assert(["attack", "refresh", "watch", "blocked", "sample"].includes(loopTick.payload.autonomous_market_intake_plan.status), "Autonomous loop tick intake plan should expose a known status.", loopTick.payload.autonomous_market_intake_plan);
  assert(loopTick.payload.autonomous_market_intake_plan.items.length === 6, "Autonomous loop tick intake plan should keep provider lanes.", loopTick.payload.autonomous_market_intake_plan);
  assert(loopTick.payload.autonomous_loop_feedback?.mode === "autonomous-loop-feedback", "Autonomous loop tick should return loop feedback.", loopTick.payload.autonomous_loop_feedback);
  assert(["press", "keep", "tighten", "protect", "cooldown", "learning", "idle"].includes(loopTick.payload.autonomous_loop_feedback.status), "Autonomous loop tick feedback should expose a known status.", loopTick.payload.autonomous_loop_feedback);
  assert(loopTick.payload.autonomous_loop_feedback.feedback_score >= 0 && loopTick.payload.autonomous_loop_feedback.feedback_score <= 100, "Autonomous loop tick feedback score should be bounded.", loopTick.payload.autonomous_loop_feedback);
  assert(loopTick.payload.autonomous_loop_feedback.size_multiplier >= 0 && loopTick.payload.autonomous_loop_feedback.size_multiplier <= 1.35, "Autonomous loop tick feedback size multiplier should be bounded.", loopTick.payload.autonomous_loop_feedback);
  assert(loopTick.payload.autonomous_loop_feedback.cadence_seconds > 0 && loopTick.payload.autonomous_loop_feedback.cadence_seconds <= 30, "Autonomous loop tick feedback cadence should be bounded.", loopTick.payload.autonomous_loop_feedback);
  assert(loopTick.payload.autonomous_loop_tick?.mode === "autonomous-loop-tick", "Autonomous loop tick should return a tick receipt.", loopTick.payload.autonomous_loop_tick);
  assert(loopTick.payload.autonomous_loop_tick.requested === true, "Autonomous loop tick receipt should be marked requested.", loopTick.payload.autonomous_loop_tick);
  assert(["refreshed", "session-run", "stand-down"].includes(loopTick.payload.autonomous_loop_tick.status), "Autonomous loop tick receipt should describe the action taken.", loopTick.payload.autonomous_loop_tick);
  assert(loopTick.payload.autonomous_loop_tick.selected_tactic_label === loopTick.payload.autonomous_strategy_selector.selected_label, "Autonomous loop tick receipt should carry the tactic selected by the strategy selector.", loopTick.payload.autonomous_loop_tick);
  assert(["press", "probe", "compound", "protect", "refresh", "cooldown", "idle"].includes(loopTick.payload.autonomous_loop_tick.selected_tactic_status), "Autonomous loop tick receipt should expose a known tactic status.", loopTick.payload.autonomous_loop_tick);
  assert(loopTick.payload.autonomous_loop_tick.tactic_confidence_score >= 0 && loopTick.payload.autonomous_loop_tick.tactic_confidence_score <= 100, "Autonomous loop tick receipt should bound tactic confidence.", loopTick.payload.autonomous_loop_tick);
  assert(loopTick.payload.autonomous_loop_tick.tactic_max_trade_usd >= 0, "Autonomous loop tick receipt should expose non-negative tactic cap.", loopTick.payload.autonomous_loop_tick);
  assert(loopTick.payload.autonomous_loop_tick.tactic_cadence_seconds >= 0, "Autonomous loop tick receipt should expose non-negative tactic cadence.", loopTick.payload.autonomous_loop_tick);
  assert(loopTick.payload.autonomous_loop_tick.summary.length > 0, "Autonomous loop tick receipt should summarize the action.", loopTick.payload.autonomous_loop_tick);
  assert(loopTick.payload.autonomous_loop_tick.ended_cycle >= loopTick.payload.autonomous_loop_tick.started_cycle, "Autonomous loop tick receipt should expose monotonic cycle movement.", loopTick.payload.autonomous_loop_tick);
  assert(["sprint", "cycle", "protect", "refresh", "cooldown", "blocked", "idle"].includes(loopTick.payload.autonomous_loop_throttle.status), "Autonomous loop tick should expose a known throttle status.", loopTick.payload.autonomous_loop_throttle);
  assert(loopTick.payload.autonomous_loop_throttle.summary.length > 0, "Autonomous loop tick should explain the backend decision.", loopTick.payload.autonomous_loop_throttle);
  assert(
    !loopTick.payload.autonomous_loop_throttle.can_run ||
      loopTick.payload.autonomous_session_run.requested === true ||
      loopTick.payload.autonomous_loop_throttle.status === "refresh",
    "Autonomous loop tick should either run a session, refresh evidence, or disclose that it cannot run.",
    {
      throttle: loopTick.payload.autonomous_loop_throttle,
      session: loopTick.payload.autonomous_session_run,
    },
  );
  const sessionReloadResponse = await request("/api/web3-trading?scenario=breakout&source=sample&account=persistent&advance=false");
  const sessionReload = await readJson(sessionReloadResponse);
  assert(sessionReloadResponse.status === 200, "Autonomous session memory reload should succeed.", sessionReload);
  assert(sessionReload.autonomous_session_run?.requested === true, "Last autonomous session should persist after reload.", sessionReload.autonomous_session_run);
  assert(sessionReload.autonomous_session_run.summary === session.payload.autonomous_session_run.summary, "Reloaded session should keep the latest run summary.", {
    run: session.payload.autonomous_session_run,
    reload: sessionReload.autonomous_session_run,
  });
  assert(sessionReload.autonomous_session_run.completed_ticks === session.payload.autonomous_session_run.completed_ticks, "Reloaded session should keep completed tick count.", {
    run: session.payload.autonomous_session_run,
    reload: sessionReload.autonomous_session_run,
  });
  assert(sessionReload.autonomous_loop_tick?.requested === true, "Last backend loop tick should persist after reload.", sessionReload.autonomous_loop_tick);
  assert(sessionReload.autonomous_loop_tick.status === loopTick.payload.autonomous_loop_tick.status, "Reloaded backend loop tick should keep the last status.", {
    run: loopTick.payload.autonomous_loop_tick,
    reload: sessionReload.autonomous_loop_tick,
  });
  assert(sessionReload.autonomous_loop_tick.action === loopTick.payload.autonomous_loop_tick.action, "Reloaded backend loop tick should keep the last action.", {
    run: loopTick.payload.autonomous_loop_tick,
    reload: sessionReload.autonomous_loop_tick,
  });
  assert(sessionReload.autonomous_loop_tick.summary === loopTick.payload.autonomous_loop_tick.summary, "Reloaded backend loop tick should keep the last decision summary.", {
    run: loopTick.payload.autonomous_loop_tick,
    reload: sessionReload.autonomous_loop_tick,
  });
  const pressTargetSymbol = sessionReload.autonomous_chart_proof_target?.target_symbol ??
    sessionReload.autonomous_candle_conviction?.target_symbol ??
    sessionReload.autonomous_market_evidence_fusion?.leader_symbol ??
    "FARTCOIN";
  const candleRecord = await postTrading({
    scenario: "breakout",
    source: "sample",
    account: "persistent",
    advance: false,
    candle_refresh: {
      action: "record",
      provider: "geckoterminal",
      source: "geckoterminal-public",
      symbol: pressTargetSymbol,
      pool: `${pressTargetSymbol.toLowerCase()}-solana-smoke-pool`,
      network: "solana",
      timeframe: "minute",
      candle_count: 48,
      last_price_usd: 0.000025,
      fetched_at: "2026-06-18T12:00:00.000Z",
      signal: {
        action: "press",
        confidence: 88,
        momentum_score: 91,
        volume_score: 86,
        risk_score: 18,
        review_after_seconds: 10,
        summary: `Press ${pressTargetSymbol} from fresh OHLCV evidence.`,
        blockers: [],
      },
      paper_decision: {
        action: "paper-buy",
        side: "buy",
        notional_usd: 125,
        reason: `Press ${pressTargetSymbol} in paper after candle confirmation.`,
        blockers: [],
      },
    },
  });
  assert(candleRecord.response.status === 200, "Candle refresh memory record should succeed.", candleRecord.payload);
  assert(candleRecord.payload.autonomous_candle_refresh?.requested === true, "Candle refresh receipt should be marked requested.", candleRecord.payload.autonomous_candle_refresh);
  assert(candleRecord.payload.autonomous_candle_refresh.status === "ready", "Candle refresh receipt should be ready after a valid OHLCV record.", candleRecord.payload.autonomous_candle_refresh);
  assert(candleRecord.payload.autonomous_candle_refresh.symbol === pressTargetSymbol, "Candle refresh receipt should carry the recorded active target.", candleRecord.payload.autonomous_candle_refresh);
  assert(candleRecord.payload.autonomous_candle_refresh.signal_action === "press", "Candle refresh receipt should carry the candle signal.", candleRecord.payload.autonomous_candle_refresh);
  assert(candleRecord.payload.autonomous_candle_refresh.paper_action === "paper-buy", "Candle refresh receipt should carry the paper decision.", candleRecord.payload.autonomous_candle_refresh);
  assert(candleRecord.payload.autonomous_candle_conviction.status === "confirm", "Recorded press candles should confirm the autonomous candle conviction.", candleRecord.payload.autonomous_candle_conviction);
  assert(candleRecord.payload.autonomous_candle_conviction.refresh_required === false, "Recorded press candles should clear the candle refresh-first gate.", candleRecord.payload.autonomous_candle_conviction);
  assert(candleRecord.payload.autonomous_candle_conviction.summary.includes("recorded OHLCV confirmation"), "Candle conviction should explain it consumed recorded OHLCV memory.", candleRecord.payload.autonomous_candle_conviction);
  const candleReloadResponse = await request("/api/web3-trading?scenario=breakout&source=sample&account=persistent&advance=false");
  const candleReload = await readJson(candleReloadResponse);
  assert(candleReload.autonomous_candle_refresh?.requested === true, "Candle refresh receipt should survive reload.", candleReload.autonomous_candle_refresh);
  assert(candleReload.autonomous_candle_refresh.summary === candleRecord.payload.autonomous_candle_refresh.summary, "Reloaded candle refresh should keep the summary.", {
    record: candleRecord.payload.autonomous_candle_refresh,
    reload: candleReload.autonomous_candle_refresh,
  });
  assert(candleReload.autonomous_candle_conviction.status === "confirm", "Reloaded candle memory should keep candle conviction confirmed.", candleReload.autonomous_candle_conviction);
  assert(candleReload.autonomous_candle_conviction.refresh_required === false, "Reloaded candle memory should keep refresh-first cleared.", candleReload.autonomous_candle_conviction);
  const mismatchBaselineResponse = await request("/api/web3-trading?scenario=base&source=sample&account=persistent&reset=true&advance=false");
  const mismatchBaseline = await readJson(mismatchBaselineResponse);
  assert(mismatchBaselineResponse.status === 200, "Mismatched chart-proof baseline should load.", mismatchBaseline);
  const mismatchActiveSymbol = mismatchBaseline.autonomous_chart_proof_target?.target_symbol ??
    mismatchBaseline.autonomous_candle_conviction?.target_symbol ??
    mismatchBaseline.autonomous_market_evidence_fusion?.leader_symbol ??
    "FARTCOIN";
  const mismatchSavedSymbol = mismatchActiveSymbol === "BONK" ? "WIF" : "BONK";
  const mismatchedProofTick = await postTrading({
    scenario: "base",
    source: "sample",
    account: "persistent",
    advance: false,
    candle_refresh: {
      action: "record",
      provider: "sample",
      source: "local-price-action-tape",
      symbol: mismatchSavedSymbol,
      pool: `${mismatchSavedSymbol.toLowerCase()}-solana-smoke-pool`,
      network: "solana",
      timeframe: "minute",
      candle_count: 24,
      last_price_usd: 0.000022,
      fetched_at: "2026-06-18T12:02:00.000Z",
      signal: {
        action: "probe",
        confidence: 72,
        momentum_score: 76,
        volume_score: 70,
        risk_score: 32,
        review_after_seconds: 15,
        summary: `Probe ${mismatchSavedSymbol} after the chart gate refreshes.`,
        blockers: [],
      },
      paper_decision: {
        action: "paper-buy",
        side: "buy",
        notional_usd: 90,
        reason: `${mismatchSavedSymbol} chart proof should not clear ${mismatchActiveSymbol}.`,
        blockers: [],
      },
    },
    autonomous_loop: {
      action: "tick",
    },
  });
  assert(mismatchedProofTick.response.status === 200, "Mismatched chart-proof backend loop tick should still return a safe state.", mismatchedProofTick.payload);
  assert(mismatchedProofTick.payload.autonomous_candle_refresh?.symbol === mismatchSavedSymbol, "Mismatched chart-proof tick should retain the saved proof symbol.", mismatchedProofTick.payload.autonomous_candle_refresh);
  assert(mismatchedProofTick.payload.autonomous_candle_conviction.target_symbol === mismatchActiveSymbol, "Mismatched chart-proof tick should keep the active autonomous target.", mismatchedProofTick.payload.autonomous_candle_conviction);
  assert(mismatchedProofTick.payload.autonomous_candle_conviction.saved_proof_symbol === mismatchSavedSymbol, "Mismatched chart-proof tick should disclose the saved proof symbol.", mismatchedProofTick.payload.autonomous_candle_conviction);
  assert(mismatchedProofTick.payload.autonomous_candle_conviction.proof_target_matched === false, "Mismatched chart-proof tick should not mark proof as target matched.", mismatchedProofTick.payload.autonomous_candle_conviction);
  assert(mismatchedProofTick.payload.autonomous_chart_proof_target.target_symbol === mismatchActiveSymbol, "Mismatched chart-proof tick should keep the server proof target on the active coin.", mismatchedProofTick.payload.autonomous_chart_proof_target);
  assert(mismatchedProofTick.payload.autonomous_chart_proof_target.saved_proof_symbol === mismatchSavedSymbol, "Mismatched chart-proof target should disclose the mismatched saved proof.", mismatchedProofTick.payload.autonomous_chart_proof_target);
  assert(mismatchedProofTick.payload.autonomous_chart_proof_target.should_fetch === true, "Mismatched chart-proof target should still request fresh proof for the active coin.", mismatchedProofTick.payload.autonomous_chart_proof_target);
  assert(
    mismatchedProofTick.payload.autonomous_candle_conviction.proof_target_mismatch?.includes(mismatchSavedSymbol) &&
      mismatchedProofTick.payload.autonomous_candle_conviction.proof_target_mismatch.includes(mismatchActiveSymbol),
    "Mismatched chart-proof tick should explain why the saved proof cannot clear the active target.",
    mismatchedProofTick.payload.autonomous_candle_conviction,
  );
  assert(mismatchedProofTick.payload.autonomous_candle_conviction.refresh_required === true, "Mismatched chart-proof tick should keep the active target in refresh-first mode.", mismatchedProofTick.payload.autonomous_candle_conviction);
  const bundledTargetSymbol = mismatchedProofTick.payload.autonomous_chart_proof_target?.target_symbol ?? mismatchActiveSymbol;
  const bundledProofTick = await postTrading({
    scenario: "base",
    source: "sample",
    account: "persistent",
    reset: true,
    advance: false,
    candle_refresh: {
      action: "record",
      provider: "sample",
      source: "local-price-action-tape",
      symbol: bundledTargetSymbol,
      pool: `${bundledTargetSymbol.toLowerCase()}-solana-smoke-pool`,
      network: "solana",
      timeframe: "minute",
      candle_count: 24,
      last_price_usd: 0.000022,
      fetched_at: "2026-06-18T12:03:00.000Z",
      signal: {
        action: "probe",
        confidence: 72,
        momentum_score: 76,
        volume_score: 70,
        risk_score: 32,
        review_after_seconds: 15,
        summary: `Probe ${bundledTargetSymbol} after the chart gate refreshes.`,
        blockers: [],
      },
      paper_decision: {
        action: "paper-buy",
        side: "buy",
        notional_usd: 90,
        reason: `${bundledTargetSymbol} chart proof clears a bounded paper probe before the backend loop tick.`,
        blockers: [],
      },
    },
    autonomous_loop: {
      action: "tick",
    },
  });
  assert(bundledProofTick.response.status === 200, "Bundled chart-proof backend loop tick should succeed.", bundledProofTick.payload);
  assert(bundledProofTick.payload.autonomous_loop_tick?.requested === true, "Bundled chart-proof tick should return a requested loop receipt.", bundledProofTick.payload.autonomous_loop_tick);
  assert(["refreshed", "session-run", "stand-down"].includes(bundledProofTick.payload.autonomous_loop_tick.status), "Bundled chart-proof tick should take a known backend action.", bundledProofTick.payload.autonomous_loop_tick);
  assert(bundledProofTick.payload.autonomous_candle_refresh?.requested === true, "Bundled chart-proof tick should record candle memory in the same response.", bundledProofTick.payload.autonomous_candle_refresh);
  assert(bundledProofTick.payload.autonomous_candle_refresh.symbol === bundledTargetSymbol, "Bundled chart-proof tick should keep the chart-proof target.", bundledProofTick.payload.autonomous_candle_refresh);
  assert(bundledProofTick.payload.autonomous_candle_refresh.paper_action === "paper-buy", "Bundled chart-proof tick should keep the paper decision.", bundledProofTick.payload.autonomous_candle_refresh);
  assert(bundledProofTick.payload.autonomous_candle_conviction.saved_proof_symbol === bundledTargetSymbol, "Bundled chart-proof tick should disclose the saved proof symbol.", bundledProofTick.payload.autonomous_candle_conviction);
  assert(bundledProofTick.payload.autonomous_candle_conviction.proof_target_matched === true, "Bundled chart-proof tick should mark target-matched chart proof.", bundledProofTick.payload.autonomous_candle_conviction);
  assert(bundledProofTick.payload.autonomous_candle_conviction.proof_target_mismatch === null, "Bundled chart-proof tick should have no target mismatch.", bundledProofTick.payload.autonomous_candle_conviction);
  assert(bundledProofTick.payload.autonomous_candle_conviction.refresh_required === false, "Bundled chart-proof tick should clear candle refresh before the backend decision returns.", bundledProofTick.payload.autonomous_candle_conviction);
  assert(bundledProofTick.payload.autonomous_chart_proof_target.target_symbol === bundledTargetSymbol, "Bundled chart-proof tick should keep the server-authored proof target.", bundledProofTick.payload.autonomous_chart_proof_target);
  assert(bundledProofTick.payload.autonomous_chart_proof_target.proof_target_matched === true, "Bundled chart-proof target should show matched proof.", bundledProofTick.payload.autonomous_chart_proof_target);
  assert(bundledProofTick.payload.autonomous_chart_proof_target.should_fetch === false, "Bundled chart-proof target should stop requesting candles once proof is matched.", bundledProofTick.payload.autonomous_chart_proof_target);
  const bundledReloadResponse = await request("/api/web3-trading?scenario=base&source=sample&account=persistent&advance=false");
  const bundledReload = await readJson(bundledReloadResponse);
  assert(bundledReloadResponse.status === 200, "Bundled chart-proof tick reload should succeed.", bundledReload);
  assert(bundledReload.autonomous_loop_tick?.summary === bundledProofTick.payload.autonomous_loop_tick.summary, "Bundled chart-proof tick should persist the backend loop decision.", {
    run: bundledProofTick.payload.autonomous_loop_tick,
    reload: bundledReload.autonomous_loop_tick,
  });
  assert(bundledReload.autonomous_candle_refresh?.summary === bundledProofTick.payload.autonomous_candle_refresh.summary, "Bundled chart-proof tick should persist the chart-proof receipt.", {
    run: bundledProofTick.payload.autonomous_candle_refresh,
    reload: bundledReload.autonomous_candle_refresh,
  });
  assert(bundledReload.autonomous_candle_conviction.target_symbol === bundledTargetSymbol, "Bundled chart-proof tick reload should keep the candle target in conviction memory.", bundledReload.autonomous_candle_conviction);
  assert(bundledReload.autonomous_candle_conviction.proof_target_matched === true, "Bundled chart-proof tick reload should keep the target lock matched.", bundledReload.autonomous_candle_conviction);
  assert(bundledReload.autonomous_chart_proof_target.target_symbol === bundledTargetSymbol, "Bundled chart-proof tick reload should keep the server proof target.", bundledReload.autonomous_chart_proof_target);
  assert(
    sessionReload.autonomous_policy_optimizer.items.some((item) => item.id === "session-policy" && item.detail === session.payload.autonomous_session_run.summary),
    "Policy optimizer should learn from the persisted last session.",
    sessionReload.autonomous_policy_optimizer,
  );
  assert(session.payload.autonomous_execution_heartbeat?.mode === "autonomous-execution-heartbeat", "Session response should keep execution heartbeat state.", session.payload.autonomous_execution_heartbeat);
  assert(session.payload.autonomous_execution_heartbeat.next_tick_seconds > 0, "Session heartbeat should keep publishing the next loop timing.", session.payload.autonomous_execution_heartbeat);
  assert(session.payload.autonomous_trap_radar?.mode === "autonomous-trap-radar", "Session response should keep trap radar state.", session.payload.autonomous_trap_radar);
  assert(
    ["chase", "probe", "refresh", "trap", "exit-only", "watch", "idle"].includes(session.payload.autonomous_trap_radar.status),
    "Session trap radar should keep a known status.",
    session.payload.autonomous_trap_radar,
  );
  assert(session.payload.autonomous_trap_radar.items.length > 0, "Session trap radar should keep scored candidates.", session.payload.autonomous_trap_radar);
  assert(session.payload.autonomous_profit_validator?.mode === "autonomous-profit-validator", "Session response should keep profit validator state.", session.payload.autonomous_profit_validator);
  assert(["scale", "trade", "probe", "protect-only", "refresh-first", "stand-down"].includes(session.payload.autonomous_profit_validator.permission), "Session profit validator should keep a known permission.", session.payload.autonomous_profit_validator);
  assert(session.payload.autonomous_profit_validator.items.some((item) => item.id === "trap"), "Session profit validator should keep the trap proof check.", session.payload.autonomous_profit_validator);
  assert(session.payload.autonomous_order_ticket?.mode === "autonomous-order-ticket", "Session response should keep order ticket state.", session.payload.autonomous_order_ticket);
  assert(["ready", "protect", "refresh", "blocked", "watch", "idle"].includes(session.payload.autonomous_order_ticket.status), "Session order ticket should keep a known status.", session.payload.autonomous_order_ticket);
  assert(session.payload.autonomous_order_ticket.can_live_execute === false, "Session order ticket should keep live execution false.", session.payload.autonomous_order_ticket);
  assert(["attack", "scalp", "rotate", "distribute", "protect", "chop", "idle"].includes(session.payload.autonomous_order_ticket.regime_status), "Session order ticket should keep a known regime status.", session.payload.autonomous_order_ticket);
  assert(["attack", "scalp", "probe", "rotate", "trim", "protect", "avoid", "missing"].includes(session.payload.autonomous_order_ticket.regime_action), "Session order ticket should keep a known regime action.", session.payload.autonomous_order_ticket);
  assert(session.payload.autonomous_order_ticket.evidence.some((item) => item.id === "regime"), "Session order ticket should keep regime evidence.", session.payload.autonomous_order_ticket);
  assert(["confirmed", "probe", "requote", "protect", "blocked", "idle", "route", "resize", "slice", "clear", "watch", "paper", "missing"].includes(session.payload.autonomous_order_ticket.friction_status), "Session order ticket should keep a known friction status.", session.payload.autonomous_order_ticket);
  assert(["confirm", "probe", "requote", "wait", "block", "protect", "route", "resize", "slice", "allow", "split", "private-route", "tighten-slippage", "paper", "missing"].includes(session.payload.autonomous_order_ticket.friction_action), "Session order ticket should keep a known friction action.", session.payload.autonomous_order_ticket);
  assert(session.payload.autonomous_order_ticket.evidence.some((item) => item.id === "friction"), "Session order ticket should keep friction evidence.", session.payload.autonomous_order_ticket);
  assert(["chase", "probe", "harvest", "expired", "cooldown", "idle", "missing"].includes(session.payload.autonomous_order_ticket.timing_status), "Session order ticket should keep a known timing status.", session.payload.autonomous_order_ticket);
  assert(["chase", "probe", "hold", "harvest", "expire", "block", "missing"].includes(session.payload.autonomous_order_ticket.timing_action), "Session order ticket should keep a known timing action.", session.payload.autonomous_order_ticket);
  assert(session.payload.autonomous_order_ticket.evidence.some((item) => item.id === "timing"), "Session order ticket should keep timing evidence.", session.payload.autonomous_order_ticket);
  assert(session.payload.autonomous_order_ticket_execution?.mode === "autonomous-order-ticket-execution", "Session response should keep order-ticket execution receipt.", session.payload.autonomous_order_ticket_execution);
  assert(
    ["queued", "applied", "route-refresh", "protect-only", "blocked", "idle"].includes(session.payload.autonomous_order_ticket_execution.status),
    "Session order-ticket execution should keep a known status.",
    session.payload.autonomous_order_ticket_execution,
  );
  assert(session.payload.autonomous_order_ticket_execution.ticket_id === session.payload.autonomous_order_ticket.ticket_id, "Session order-ticket execution should mirror the ticket id.", {
    ticket: session.payload.autonomous_order_ticket,
    execution: session.payload.autonomous_order_ticket_execution,
  });
  assert(session.payload.autonomous_order_ticket_execution.side === session.payload.autonomous_order_ticket.side, "Session order-ticket execution should mirror ticket side.", {
    ticket: session.payload.autonomous_order_ticket,
    execution: session.payload.autonomous_order_ticket_execution,
  });
  assert(session.payload.autonomous_order_ticket_execution.paper_size_usd >= 0, "Session order-ticket execution should keep non-negative paper size.", session.payload.autonomous_order_ticket_execution);
  assert(
    ["paper-ledger-only", "read-only-route-refresh", "blocked-paper-only"].includes(session.payload.autonomous_order_ticket_execution.execution_boundary),
    "Session order-ticket execution should stay in paper/read-only boundaries.",
    session.payload.autonomous_order_ticket_execution,
  );
  assert(session.payload.autonomous_candle_conviction?.mode === "autonomous-candle-conviction", "Session response should keep candle conviction state.", session.payload.autonomous_candle_conviction);
  assert(
    ["confirm", "probe", "refresh", "protect", "reject", "idle"].includes(session.payload.autonomous_candle_conviction.status),
    "Session candle conviction should keep a known status.",
    session.payload.autonomous_candle_conviction,
  );
  assert(session.payload.autonomous_candle_conviction.items.length === 5, "Session candle conviction should keep five chart checks.", session.payload.autonomous_candle_conviction);
  assert(session.payload.autonomous_execution_cadence?.mode === "autonomous-execution-cadence-governor", "Session response should keep execution cadence state.", session.payload.autonomous_execution_cadence);
  assert(["burst", "refresh", "protect", "cooldown", "blocked", "idle"].includes(session.payload.autonomous_execution_cadence.status), "Session execution cadence should keep a known status.", session.payload.autonomous_execution_cadence);
  assert(session.payload.autonomous_execution_cadence.next_poll_seconds > 0, "Session execution cadence should keep publishing next poll timing.", session.payload.autonomous_execution_cadence);
  assert(session.payload.autonomous_execution_cadence.items.length === 5, "Session execution cadence should keep five monitored lanes.", session.payload.autonomous_execution_cadence);
  assert(session.payload.autonomous_reaction_loop?.mode === "autonomous-reaction-loop", "Session response should keep autonomous reaction loop state.", session.payload.autonomous_reaction_loop);
  assert(["press", "scalp", "protect", "refresh", "cooldown", "blocked", "observe"].includes(session.payload.autonomous_reaction_loop.status), "Session reaction loop should keep a known status.", session.payload.autonomous_reaction_loop);
  assert(["buy-now", "scalp-buy", "sell-now", "trim-now", "refresh-route", "refresh-chart", "cooldown", "stand-down", "observe"].includes(session.payload.autonomous_reaction_loop.action), "Session reaction loop should keep a known action.", session.payload.autonomous_reaction_loop);
  assert(session.payload.autonomous_reaction_loop.invalidates_in_seconds > 0, "Session reaction loop should keep positive invalidation timing.", session.payload.autonomous_reaction_loop);
  assert(session.payload.autonomous_reaction_loop.items.length === 7, "Session reaction loop should keep seven evidence rows.", session.payload.autonomous_reaction_loop);
  assert(session.payload.autonomous_landing_optimizer?.mode === "autonomous-landing-optimizer", "Session response should keep autonomous landing optimizer state.", session.payload.autonomous_landing_optimizer);
  assert(["land-now", "priority", "managed", "paper", "refresh", "fee-drag", "signature-gated", "blocked", "idle"].includes(session.payload.autonomous_landing_optimizer.status), "Session landing optimizer should keep a known status.", session.payload.autonomous_landing_optimizer);
  assert(["submit-managed", "use-sender", "router-submit", "paper-fill", "refresh-route", "tighten-fees", "request-signature", "stand-down", "observe"].includes(session.payload.autonomous_landing_optimizer.action), "Session landing optimizer should keep a known action.", session.payload.autonomous_landing_optimizer);
  assert(["paper-ledger", "jupiter-v2-managed", "jupiter-router-submit", "helius-sender", "blocked"].includes(session.payload.autonomous_landing_optimizer.selected_path), "Session landing optimizer should keep a known path.", session.payload.autonomous_landing_optimizer);
  assert(session.payload.autonomous_landing_optimizer.items.length === 6, "Session landing optimizer should keep six evidence rows.", session.payload.autonomous_landing_optimizer);
  assert(session.payload.autonomous_run_envelope?.mode === "autonomous-run-envelope", "Session response should keep autonomous run envelope state.", session.payload.autonomous_run_envelope);
  assert(["running", "armed", "protect", "refresh", "observe", "cooldown", "blocked", "idle"].includes(session.payload.autonomous_run_envelope.status), "Session run envelope should keep a known status.", session.payload.autonomous_run_envelope);
  assert(["run-session", "protect-book", "refresh-route", "refresh-market", "paper-observe", "cooldown", "stand-down"].includes(session.payload.autonomous_run_envelope.action), "Session run envelope should keep a known action.", session.payload.autonomous_run_envelope);
  assert(session.payload.autonomous_run_envelope.next_wake_seconds > 0 && session.payload.autonomous_run_envelope.next_wake_seconds <= 60, "Session run envelope should keep bounded wake timing.", session.payload.autonomous_run_envelope);
  assert(session.payload.autonomous_run_envelope.items.length === 7, "Session run envelope should keep seven evidence rows.", session.payload.autonomous_run_envelope);
  assert(session.payload.autonomous_profit_run_guard?.mode === "autonomous-profit-run-guard", "Session response should keep autonomous profit run guard state.", session.payload.autonomous_profit_run_guard);
  assert(session.payload.autonomous_profit_run_guard.items.length === 8, "Session profit run guard should keep eight evidence rows.", session.payload.autonomous_profit_run_guard);
  assert(session.payload.autonomous_data_freshness_gate?.mode === "autonomous-data-freshness-gate", "Session response should keep autonomous data freshness gate state.", session.payload.autonomous_data_freshness_gate);
  assert(["clear", "tradeable", "refresh", "backfill", "blocked", "sample"].includes(session.payload.autonomous_data_freshness_gate.status), "Session data freshness gate should keep a known status.", session.payload.autonomous_data_freshness_gate);
  assert(session.payload.autonomous_data_freshness_gate.data_score >= 0 && session.payload.autonomous_data_freshness_gate.data_score <= 100, "Session data freshness gate should keep a bounded score.", session.payload.autonomous_data_freshness_gate);
  assert(session.payload.autonomous_data_freshness_gate.size_multiplier >= 0 && session.payload.autonomous_data_freshness_gate.size_multiplier <= 1.5, "Session data freshness gate should keep bounded size.", session.payload.autonomous_data_freshness_gate);
  assert(session.payload.autonomous_data_freshness_gate.max_next_fills >= 0 && session.payload.autonomous_data_freshness_gate.max_next_fills <= 6, "Session data freshness gate should keep bounded next fills.", session.payload.autonomous_data_freshness_gate);
  assert(session.payload.autonomous_data_freshness_gate.items.length === 6, "Session data freshness gate should keep six evidence rows.", session.payload.autonomous_data_freshness_gate);
  assert(session.payload.autonomous_replay_gate?.mode === "autonomous-replay-gate", "Session response should keep autonomous replay gate state.", session.payload.autonomous_replay_gate);
  assert(["approve", "size-down", "protect", "refresh", "blocked", "learning"].includes(session.payload.autonomous_replay_gate.status), "Session replay gate should keep a known status.", session.payload.autonomous_replay_gate);
  assert(session.payload.autonomous_replay_gate.replay_score >= 0 && session.payload.autonomous_replay_gate.replay_score <= 100, "Session replay gate should keep a bounded score.", session.payload.autonomous_replay_gate);
  assert(session.payload.autonomous_replay_gate.size_multiplier >= 0 && session.payload.autonomous_replay_gate.size_multiplier <= 1.5, "Session replay gate should keep bounded size.", session.payload.autonomous_replay_gate);
  assert(session.payload.autonomous_replay_gate.max_next_fills >= 0 && session.payload.autonomous_replay_gate.max_next_fills <= 6, "Session replay gate should keep bounded next fills.", session.payload.autonomous_replay_gate);
  assert(session.payload.autonomous_replay_gate.items.length === 6, "Session replay gate should keep six evidence rows.", session.payload.autonomous_replay_gate);
  assert(session.payload.autonomous_burst_fill_plan?.mode === "autonomous-burst-fill-plan", "Session response should keep autonomous burst fill plan state.", session.payload.autonomous_burst_fill_plan);
  assert(typeof session.payload.autonomous_burst_fill_plan.plan_id === "string" && session.payload.autonomous_burst_fill_plan.plan_id.includes(`burst-plan-${session.payload.paper_account.cycle}`), "Session burst fill plan should keep a cycle-scoped id.", session.payload.autonomous_burst_fill_plan);
  assert(session.payload.autonomous_burst_fill_plan.cycle === session.payload.paper_account.cycle, "Session burst fill plan should keep the paper account cycle.", session.payload.autonomous_burst_fill_plan);
  assert(["burst", "single", "protect", "refresh", "blocked", "idle"].includes(session.payload.autonomous_burst_fill_plan.status), "Session burst fill plan should keep a known status.", session.payload.autonomous_burst_fill_plan);
  assert(session.payload.autonomous_burst_fill_plan.children.length > 0, "Session burst fill plan should keep child rows.", session.payload.autonomous_burst_fill_plan);
  assert(session.payload.autonomous_burst_fill_plan.max_child_fills <= session.payload.autonomous_burst_fill_plan.feedback_child_fill_ceiling, "Session burst fill plan should keep obeying feedback ceiling.", session.payload.autonomous_burst_fill_plan);
  assert(session.payload.autonomous_burst_fill_plan.max_child_fills <= session.payload.autonomous_data_freshness_gate.max_next_fills, "Session burst fill plan should keep obeying data freshness ceiling.", session.payload.autonomous_burst_fill_plan);
  assert(session.payload.autonomous_burst_fill_plan.max_child_fills <= session.payload.autonomous_replay_gate.max_next_fills, "Session burst fill plan should keep obeying replay gate ceiling.", session.payload.autonomous_burst_fill_plan);
  assert(session.payload.autonomous_market_evidence_fusion?.mode === "autonomous-market-evidence-fusion", "Session response should keep market evidence fusion state.", session.payload.autonomous_market_evidence_fusion);
  assert(["attack", "selective", "refresh", "protect", "blocked", "watch", "sample", "idle"].includes(session.payload.autonomous_market_evidence_fusion.status), "Session market evidence fusion should keep a known status.", session.payload.autonomous_market_evidence_fusion);
  assert(session.payload.autonomous_market_evidence_fusion.max_next_fills <= session.payload.autonomous_data_freshness_gate.max_next_fills, "Session market evidence fusion should keep obeying data freshness fill cap.", session.payload.autonomous_market_evidence_fusion);
  assert(session.payload.autonomous_signal_noise_trade_decision?.mode === "autonomous-signal-noise-trade-decision", "Session response should keep signal/noise trade decision state.", session.payload.autonomous_signal_noise_trade_decision);
  assert(["attack", "probe", "protect", "refresh", "blocked", "watch", "idle"].includes(session.payload.autonomous_signal_noise_trade_decision.status), "Session signal/noise trade decision should keep a known status.", session.payload.autonomous_signal_noise_trade_decision);
  assert(session.payload.autonomous_signal_noise_trade_decision.max_next_fills <= session.payload.autonomous_data_freshness_gate.max_next_fills, "Session signal/noise trade decision should keep obeying data freshness fill cap.", session.payload.autonomous_signal_noise_trade_decision);
  assert(session.payload.autonomous_signal_noise_trade_decision.recommended_size_usd >= 0, "Session signal/noise trade decision should keep a non-negative paper size.", session.payload.autonomous_signal_noise_trade_decision);
  assert(session.payload.autonomous_execution_runway?.mode === "autonomous-execution-runway", "Session response should keep execution runway state.", session.payload.autonomous_execution_runway);
  assert(["attack", "probe", "protect", "refresh", "blocked", "watch", "idle"].includes(session.payload.autonomous_execution_runway.status), "Session execution runway should keep a known status.", session.payload.autonomous_execution_runway);
  assert(session.payload.autonomous_execution_runway.steps.length === 5, "Session execution runway should keep the five-step timeline.", session.payload.autonomous_execution_runway);
  assert(session.payload.autonomous_execution_runway.next_tick_seconds > 0, "Session execution runway should keep positive next-tick timing.", session.payload.autonomous_execution_runway);
  assert(["paper-ledger-only", "read-only-route-refresh", "read-only-chart-refresh", "blocked-paper-only"].includes(session.payload.autonomous_execution_runway.execution_boundary), "Session execution runway should keep a known boundary.", session.payload.autonomous_execution_runway);
  assert(session.payload.autonomous_burst_fill_plan.prior_size_multiplier >= 0 && session.payload.autonomous_burst_fill_plan.prior_size_multiplier <= 1.5, "Session burst fill plan should keep bounded prior multiplier.", session.payload.autonomous_burst_fill_plan);
  assert(session.payload.autonomous_burst_fill_plan.data_size_multiplier >= 0 && session.payload.autonomous_burst_fill_plan.data_size_multiplier <= 1.5, "Session burst fill plan should keep bounded data multiplier.", session.payload.autonomous_burst_fill_plan);
  assert(session.payload.autonomous_burst_fill_plan.replay_size_multiplier >= 0 && session.payload.autonomous_burst_fill_plan.replay_size_multiplier <= 1.5, "Session burst fill plan should keep bounded replay multiplier.", session.payload.autonomous_burst_fill_plan);
  assert(session.payload.autonomous_burst_outcome_feedback?.mode === "autonomous-burst-outcome-feedback", "Session response should keep autonomous burst outcome feedback state.", session.payload.autonomous_burst_outcome_feedback);
  assert(["scale", "keep", "tighten", "protect", "blocked", "idle"].includes(session.payload.autonomous_burst_outcome_feedback.status), "Session burst outcome feedback should keep a known status.", session.payload.autonomous_burst_outcome_feedback);
  assert(session.payload.autonomous_burst_outcome_feedback.items.length === 6, "Session burst outcome feedback should keep six evidence rows.", session.payload.autonomous_burst_outcome_feedback);
  assert(session.payload.autonomous_burst_fill_execution?.mode === "autonomous-burst-fill-execution", "Session response should keep autonomous burst fill execution state.", session.payload.autonomous_burst_fill_execution);
  assert(["applied", "ready", "blocked", "idle"].includes(session.payload.autonomous_burst_fill_execution.status), "Session burst fill execution should keep a known status.", session.payload.autonomous_burst_fill_execution);
  assert(session.payload.autonomous_burst_fill_execution.applied_child_count <= session.payload.autonomous_burst_fill_execution.requested_child_count, "Session burst fill execution should keep bounded applied children.", session.payload.autonomous_burst_fill_execution);
  assert(session.payload.autonomous_profit_accountability?.mode === "autonomous-profit-accountability", "Session response should keep autonomous profit accountability state.", session.payload.autonomous_profit_accountability);
  assert(["press", "compound", "tighten", "protect", "blocked", "learning"].includes(session.payload.autonomous_profit_accountability.status), "Session profit accountability should keep a known status.", session.payload.autonomous_profit_accountability);
  assert(session.payload.autonomous_profit_accountability.accountability_score >= 0 && session.payload.autonomous_profit_accountability.accountability_score <= 100, "Session profit accountability should keep a bounded score.", session.payload.autonomous_profit_accountability);
  assert(session.payload.autonomous_profit_accountability.max_next_fills >= 0 && session.payload.autonomous_profit_accountability.max_next_fills <= 6, "Session profit accountability should keep bounded next fills.", session.payload.autonomous_profit_accountability);
  assert(session.payload.autonomous_profit_accountability.items.length === 6, "Session profit accountability should keep six evidence rows.", session.payload.autonomous_profit_accountability);
  assert(session.payload.autonomous_loop_throttle?.mode === "autonomous-loop-throttle", "Session response should keep autonomous loop throttle state.", session.payload.autonomous_loop_throttle);
  assert(["sprint", "cycle", "protect", "refresh", "cooldown", "blocked", "idle"].includes(session.payload.autonomous_loop_throttle.status), "Session loop throttle should keep a known status.", session.payload.autonomous_loop_throttle);
  assert(["run-sprint", "run-cycle", "protect-book", "refresh-market", "cooldown", "stand-down"].includes(session.payload.autonomous_loop_throttle.action), "Session loop throttle should keep a known action.", session.payload.autonomous_loop_throttle);
  assert(session.payload.autonomous_loop_throttle.ticks >= 1 && session.payload.autonomous_loop_throttle.ticks <= 12, "Session loop throttle should keep bounded ticks.", session.payload.autonomous_loop_throttle);
  assert(session.payload.autonomous_loop_throttle.max_total_fills >= 0 && session.payload.autonomous_loop_throttle.max_total_fills <= 24, "Session loop throttle should keep bounded fill caps.", session.payload.autonomous_loop_throttle);
  assert(session.payload.autonomous_loop_throttle.size_multiplier >= 0 && session.payload.autonomous_loop_throttle.size_multiplier <= 1.5, "Session loop throttle should keep bounded size multiplier.", session.payload.autonomous_loop_throttle);
  assert(session.payload.autonomous_loop_throttle.items.length === 6, "Session loop throttle should keep six evidence rows.", session.payload.autonomous_loop_throttle);
  assert(session.payload.autonomous_wake_plan?.mode === "autonomous-wake-plan", "Session response should keep the autonomous wake plan.", session.payload.autonomous_wake_plan);
  assert(["minute", "sprint", "cycle", "protect", "refresh", "cooldown", "blocked"].includes(session.payload.autonomous_wake_plan.status), "Session wake plan should keep a known status.", session.payload.autonomous_wake_plan);
  assert(["run-minute", "run-loop", "refresh-read", "stand-down"].includes(session.payload.autonomous_wake_plan.next_client_action), "Session wake plan should keep a known next action.", session.payload.autonomous_wake_plan);
  assert(session.payload.autonomous_wake_plan.next_wake_seconds > 0, "Session wake plan should keep the next wake interval.", session.payload.autonomous_wake_plan);
  assert(session.payload.autonomous_market_intake_plan?.mode === "autonomous-market-intake-plan", "Session response should keep the autonomous market intake plan.", session.payload.autonomous_market_intake_plan);
  assert(["attack", "refresh", "watch", "blocked", "sample"].includes(session.payload.autonomous_market_intake_plan.status), "Session market intake plan should keep a known status.", session.payload.autonomous_market_intake_plan);
  assert(session.payload.autonomous_market_intake_plan.items.length === 6, "Session market intake plan should keep six provider lanes.", session.payload.autonomous_market_intake_plan);
  assert(session.payload.autonomous_market_intake_plan.provider_budget_status === session.payload.market_ingestion_plan.provider_budget_status, "Session market intake plan should mirror provider budget status.", session.payload.autonomous_market_intake_plan);
  assert(session.payload.autonomous_scalp_exit_autopilot?.mode === "autonomous-scalp-exit-autopilot", "Session response should keep scalp exit autopilot state.", session.payload.autonomous_scalp_exit_autopilot);
  assert(session.payload.autonomous_scalp_exit_autopilot.items.length === session.payload.portfolio.open_positions.length, "Session scalp exit autopilot should keep every open paper position scored.", session.payload.autonomous_scalp_exit_autopilot);
  assert(session.payload.autonomous_policy_optimizer?.mode === "autonomous-policy-optimizer", "Policy optimizer should be present.", session.payload.autonomous_policy_optimizer);
  assert(
    ["attack", "selective", "protect", "cooldown"].includes(session.payload.autonomous_policy_optimizer.status),
    "Policy optimizer should return a known posture.",
    session.payload.autonomous_policy_optimizer,
  );
  assert(
    ["snipe", "scalp", "compound", "harvest", "protect", "stand-down"].includes(session.payload.autonomous_policy_optimizer.desk_mode),
    "Policy optimizer should expose a known autonomous desk mode.",
    session.payload.autonomous_policy_optimizer,
  );
  assert(session.payload.autonomous_policy_optimizer.desk_mode_confidence >= 0 && session.payload.autonomous_policy_optimizer.desk_mode_confidence <= 100, "Policy desk mode confidence should be bounded.", session.payload.autonomous_policy_optimizer);
  assert(session.payload.autonomous_policy_optimizer.fresh_entry_permission === session.payload.churn_efficiency_auditor.entry_permission, "Policy mode should mirror the churn fresh-entry gate.", session.payload.autonomous_policy_optimizer);
  assert(session.payload.autonomous_policy_optimizer.allowed_actions.includes("watch"), "Policy mode should expose allowed autonomous actions.", session.payload.autonomous_policy_optimizer);
  assert(session.payload.autonomous_policy_optimizer.mode_reason.length > 0, "Policy mode should explain its operating mode.", session.payload.autonomous_policy_optimizer);
  assert(session.payload.autonomous_policy_optimizer.mode_controls.some((item) => item.includes("Desk mode")), "Policy mode should publish mode controls.", session.payload.autonomous_policy_optimizer);
  assert(session.payload.autonomous_policy_optimizer.recommended_session_ticks >= 1, "Policy optimizer should size the next paper session.", session.payload.autonomous_policy_optimizer);
  assert(session.payload.autonomous_policy_optimizer.items.length >= 4, "Policy optimizer should expose decision evidence.", session.payload.autonomous_policy_optimizer);
  assert(session.payload.autonomous_edge_verifier?.mode === "autonomous-edge-verifier", "Session response should keep edge verifier state.", session.payload.autonomous_edge_verifier);
  assert(session.payload.autonomous_edge_stack?.mode === "autonomous-edge-stack", "Session response should keep edge stack state.", session.payload.autonomous_edge_stack);
  assert(session.payload.autonomous_edge_stack_execution?.mode === "autonomous-edge-stack-execution", "Session response should keep edge stack execution state.", session.payload.autonomous_edge_stack_execution);
  assert(session.payload.autonomous_edge_stack_execution.execution_boundary === "paper-ledger-or-readonly-route", "Session edge stack execution should keep its bounded paper/read-only boundary.", session.payload.autonomous_edge_stack_execution);
  assert(session.payload.autonomous_execution_adapter_readiness?.mode === "autonomous-execution-adapter-readiness", "Session response should keep execution adapter readiness.", session.payload.autonomous_execution_adapter_readiness);
  assert(
    ["swap-v2-ready", "signature-gated", "credential-gated", "refresh-required", "migration-required", "paper-only", "blocked", "idle"].includes(session.payload.autonomous_execution_adapter_readiness.status),
    "Session execution adapter readiness should keep a known status.",
    session.payload.autonomous_execution_adapter_readiness,
  );
  assert(
    ["jupiter-swap-v2", "jupiter-quote-v1", "helius-sender", "solana-rpc", "paper-ledger", "not-configured"].includes(session.payload.autonomous_execution_adapter_readiness.active_adapter),
    "Session execution adapter readiness should keep a known active adapter.",
    session.payload.autonomous_execution_adapter_readiness,
  );
  assert(session.payload.autonomous_execution_adapter_readiness.readiness_score >= 0 && session.payload.autonomous_execution_adapter_readiness.readiness_score <= 100, "Session execution adapter score should stay bounded.", session.payload.autonomous_execution_adapter_readiness);
  assert(session.payload.autonomous_opportunity_race?.mode === "autonomous-opportunity-race", "Session response should keep opportunity race state.", session.payload.autonomous_opportunity_race);
  assert(
    ["attack", "probe", "protect", "stand-down", "idle"].includes(session.payload.autonomous_opportunity_race.status),
    "Session opportunity race should return a known status.",
    session.payload.autonomous_opportunity_race,
	  );
	  assert(session.payload.high_frequency_profit_race_execution?.mode === "high-frequency-paper-execution", "Session response should keep high-frequency execution state.", session.payload.high_frequency_profit_race_execution);
	  assert(session.payload.high_frequency_profit_race_execution.execution_boundary === "paper-ledger-only", "Session high-frequency execution should stay paper-only.", session.payload.high_frequency_profit_race_execution);
	  assert(session.payload.autonomous_opportunity_race_execution?.mode === "opportunity-race-paper-execution", "Session response should keep opportunity race execution state.", session.payload.autonomous_opportunity_race_execution);
	  assert(session.payload.autonomous_opportunity_race_execution.execution_boundary === "paper-ledger-only", "Session race execution should stay paper-only.", session.payload.autonomous_opportunity_race_execution);
	  assert(session.payload.trend_chase_execution?.mode === "trend-chase-paper-execution", "Session response should keep trend chase execution state.", session.payload.trend_chase_execution);
	  assert(session.payload.trend_chase_execution.execution_boundary === "paper-ledger-only", "Session trend chase execution should stay paper-only.", session.payload.trend_chase_execution);
	  assert(session.payload.trend_chase_execution.scout_reserve_usd >= 0, "Session trend chase execution should keep scout reserve metadata.", session.payload.trend_chase_execution);
	  assert(session.payload.scout_lifecycle?.mode === "scout-lifecycle-controller", "Session response should keep scout lifecycle state.", session.payload.scout_lifecycle);
	  assert(session.payload.scout_lifecycle.execution_boundary === "paper-ledger-only", "Session scout lifecycle should stay paper-only.", session.payload.scout_lifecycle);
	  assert(session.payload.scout_lifecycle.watched_count >= 0, "Session scout lifecycle should expose watched count.", session.payload.scout_lifecycle);
	  assert(session.payload.autonomous_position_risk_execution?.mode === "autonomous-position-risk-execution", "Session response should keep position risk execution state.", session.payload.autonomous_position_risk_execution);
  assert(session.payload.autonomous_position_risk_execution.execution_boundary === "paper-ledger-only", "Session position risk execution should stay paper-only.", session.payload.autonomous_position_risk_execution);
  assert(session.payload.portfolio_tape_guard_execution?.mode === "portfolio-tape-guard-execution", "Session response should keep portfolio tape guard execution state.", session.payload.portfolio_tape_guard_execution);
  assert(session.payload.portfolio_tape_guard_execution.execution_boundary === "paper-ledger-only", "Session portfolio tape guard execution should stay paper-only.", session.payload.portfolio_tape_guard_execution);
  assert(session.payload.autonomous_strategy_attribution?.mode === "autonomous-strategy-attribution", "Session response should keep strategy attribution state.", session.payload.autonomous_strategy_attribution);
  assert(
    ["scale", "selective", "tighten", "protect", "learning", "idle"].includes(session.payload.autonomous_strategy_attribution.status),
    "Session strategy attribution should return a known status.",
    session.payload.autonomous_strategy_attribution,
  );
  assert(session.payload.autonomous_policy_optimizer.attribution_size_bias > 0, "Session policy should keep attribution bias.", session.payload.autonomous_policy_optimizer);
  assert(session.payload.autonomous_profit_objective?.mode === "autonomous-profit-objective", "Session response should keep profit objective state.", session.payload.autonomous_profit_objective);
  assert(session.payload.autonomous_profit_objective.session_profit_target_usd >= 0, "Session profit objective should keep session target.", session.payload.autonomous_profit_objective);
  assert(session.payload.autonomous_profit_control?.mode === "autonomous-profit-control", "Session response should keep profit control state.", session.payload.autonomous_profit_control);
  assert(session.payload.autonomous_profit_control.cadence_seconds > 0, "Session profit control should keep cadence guidance.", session.payload.autonomous_profit_control);
  assert(session.payload.autonomous_command_center?.mode === "autonomous-command-center", "Session response should keep command center state.", session.payload.autonomous_command_center);
  assert(session.payload.autonomous_command_center.items.length > 0, "Session command center should keep ranked commands.", session.payload.autonomous_command_center);
  assert(session.payload.autonomous_command_center.items.every((item) => typeof item.rehearsal_score === "number"), "Session command center should keep command rehearsal scores.", session.payload.autonomous_command_center);
  assert(session.payload.autonomous_command_center_execution?.mode === "command-center-paper-execution", "Session response should keep command center execution state.", session.payload.autonomous_command_center_execution);
  assert(session.payload.autonomous_command_center_execution.execution_boundary === "paper-ledger-only", "Session command center execution should stay paper-only.", session.payload.autonomous_command_center_execution);
  assert(typeof session.payload.autonomous_command_center_execution.rehearsal_score === "number", "Session command center execution should keep rehearsal metadata.", session.payload.autonomous_command_center_execution);
  assert(session.payload.autonomous_command_performance?.mode === "autonomous-command-performance", "Session response should keep command performance state.", session.payload.autonomous_command_performance);
  assert(typeof session.payload.autonomous_command_performance.next_size_multiplier === "number", "Session command performance should keep size guidance.", session.payload.autonomous_command_performance);
  assert(session.payload.autonomous_profit_learning?.mode === "autonomous-profit-learning", "Session response should keep profit learning state.", session.payload.autonomous_profit_learning);
  assert(session.payload.autonomous_profit_learning.items.length >= 5, "Session profit learning should keep feedback rows.", session.payload.autonomous_profit_learning);
  assert(typeof session.payload.autonomous_profit_learning.deploy_bias_usd === "number", "Session profit learning should keep deploy bias.", session.payload.autonomous_profit_learning);
  assert(session.payload.autonomous_profit_allocation_plan?.mode === "autonomous-profit-allocation-plan", "Session response should keep profit allocation state.", session.payload.autonomous_profit_allocation_plan);
  assert(session.payload.autonomous_profit_allocation_plan.cadence_seconds > 0, "Session profit allocation should keep cadence guidance.", session.payload.autonomous_profit_allocation_plan);
  assert(typeof session.payload.autonomous_profit_allocation_plan.deploy_budget_usd === "number", "Session profit allocation should keep deploy budget.", session.payload.autonomous_profit_allocation_plan);
  assert(session.payload.autonomous_market_intelligence?.mode === "autonomous-market-intelligence", "Session response should keep market intelligence state.", session.payload.autonomous_market_intelligence);
  assert(session.payload.autonomous_market_intelligence.items.length > 0, "Session market intelligence should keep ranked rows.", session.payload.autonomous_market_intelligence);
  assert(typeof session.payload.autonomous_market_intelligence.deploy_bias_usd === "number", "Session market intelligence should keep deploy bias.", session.payload.autonomous_market_intelligence);
  assert(session.payload.market_intelligence_execution?.mode === "market-intelligence-paper-execution", "Session response should keep market intelligence execution state.", session.payload.market_intelligence_execution);
  assert(session.payload.market_intelligence_execution.execution_boundary === "paper-ledger-only", "Session market intelligence execution should stay paper-only.", session.payload.market_intelligence_execution);
  assert(session.payload.autonomous_watchlist_rotation?.mode === "autonomous-watchlist-rotation", "Session response should keep watchlist rotation state.", session.payload.autonomous_watchlist_rotation);
  assert(session.payload.autonomous_watchlist_rotation.items.length > 0, "Session watchlist rotation should keep ranked targets.", session.payload.autonomous_watchlist_rotation);
  assert(typeof session.payload.autonomous_watchlist_rotation.expected_edge_usd === "number", "Session watchlist rotation should keep expected edge.", session.payload.autonomous_watchlist_rotation);
  assert(session.payload.watchlist_rotation_execution?.mode === "watchlist-rotation-paper-execution", "Session response should keep watchlist rotation execution state.", session.payload.watchlist_rotation_execution);
  assert(session.payload.watchlist_rotation_execution.execution_boundary === "paper-ledger-only", "Session watchlist rotation execution should stay paper-only.", session.payload.watchlist_rotation_execution);
  assert(
    session.payload.autonomous_policy_optimizer.items.some((item) => item.id === "strategy-policy"),
    "Session policy should keep lane-attribution evidence.",
    session.payload.autonomous_policy_optimizer,
  );
  assert(
    session.payload.autonomous_trade_mission.steps.some((step) => step.id === "mission-race-execution"),
    "Session mission should preserve the race execution runway step.",
    session.payload.autonomous_trade_mission,
  );
  assert(session.payload.autonomous_tick_plan?.mode === "autonomous-tick-plan", "Session response should keep the tick plan.", session.payload.autonomous_tick_plan);
  assert(session.payload.autonomous_tick_plan.items.length > 0, "Session tick plan should keep ranked actions.", session.payload.autonomous_tick_plan);
  assert(session.payload.position_surveillance_matrix?.mode === "position-surveillance-matrix", "Session response should keep the position surveillance matrix.", session.payload.position_surveillance_matrix);
  assert(session.payload.position_surveillance_matrix.watched_count === session.payload.portfolio.open_positions.length, "Session matrix should keep every open paper position watched.", session.payload.position_surveillance_matrix);
  assert(session.payload.portfolio_price_action_guard?.mode === "portfolio-price-action-guard", "Session response should keep the portfolio price-action guard.", session.payload.portfolio_price_action_guard);
  assert(session.payload.portfolio_price_action_guard.watched_count === session.payload.portfolio.open_positions.length, "Session guard should keep every open paper position scored.", session.payload.portfolio_price_action_guard);
  assert(session.payload.trend_velocity_scanner?.mode === "trend-velocity-scanner", "Session response should keep trend velocity scanner.", session.payload.trend_velocity_scanner);
  assert(session.payload.trend_velocity_scanner.items.length > 0, "Session trend velocity scanner should keep ranked candidates.", session.payload.trend_velocity_scanner);
  assert(session.payload.autonomous_market_pulse?.mode === "autonomous-market-pulse", "Session response should keep autonomous market pulse.", session.payload.autonomous_market_pulse);
  assert(session.payload.autonomous_market_pulse.items.length > 0, "Session market pulse should keep ranked candidates.", session.payload.autonomous_market_pulse);
  assert(session.payload.market_pulse_execution?.mode === "market-pulse-paper-execution", "Session response should keep market pulse execution.", session.payload.market_pulse_execution);
  assert(
    session.payload.autonomous_policy_optimizer.min_expected_edge_usd >= session.payload.autonomous_edge_verifier.min_required_edge_usd,
    "Policy optimizer should inherit the verifier's edge hurdle.",
    { policy: session.payload.autonomous_policy_optimizer, verifier: session.payload.autonomous_edge_verifier },
  );
  assert(session.payload.execution_gate?.live_execution_enabled === false, "Session must not enable live execution.", session.payload.execution_gate);

  await postTrading({
    scenario: "base",
    source: "sample",
    account: "persistent",
    reset: true,
    advance: false,
  });

  const daemonRun = await runWeb3AutonomousDaemon({
    baseUrl,
    scenario: "base",
    source: "sample",
    runnerId: "implicit-daemon-runner",
    maxTicks: 1,
    intervalMs: 0,
    heartbeatWhenGated: true,
    exitOnBlocked: false,
  });
  assert(daemonRun.paper_only === true, "Autonomous daemon smoke run must remain paper-only.", daemonRun);
  assert(daemonRun.events.length === 1, "Autonomous daemon smoke run should execute one bounded tick.", daemonRun);
  assert(daemonRun.events[0].status === "posted", "Autonomous daemon smoke run should post a leased backend tick.", daemonRun);
  assert(["acquired", "renewed", "replayed", "expired"].includes(daemonRun.events[0].lease_status), "Autonomous daemon smoke run should return a recorded non-conflicting lease status.", daemonRun);
  assert(daemonRun.events[0].active_runner_id === "implicit-daemon-runner" || daemonRun.events[0].active_runner_id === null, "Autonomous daemon smoke run should own or safely idle the lease.", daemonRun);
  assert(["ready", "refresh-first", "sample-only", "throttled", "blocked", "idle"].includes(daemonRun.events[0].market_worker), "Autonomous daemon smoke run should report a known market worker status.", daemonRun);
  assert(typeof daemonRun.events[0].market_worker_lane === "string" && daemonRun.events[0].market_worker_lane.length > 0, "Autonomous daemon smoke run should report the market worker lane.", daemonRun);
  assert(daemonRun.events[0].settlement_watchdog === "not-requested", "Autonomous daemon should not request settlement watchdog without relayed signature evidence.", daemonRun);

  await postTrading({
    scenario: "base",
    source: "sample",
    account: "persistent",
    reset: true,
    advance: false,
  });

  const supervisorRun = await runWeb3DaemonSupervisor({
    baseUrl,
    scenario: "base",
    source: "sample",
    runnerId: "smoke-supervisor-runner",
    rounds: 2,
    ticksPerRound: 1,
    intervalMs: 0,
    roundDelayMs: 0,
    statusPath: "/tmp/mastermold-web3-daemon-supervisor-smoke.json",
  });
  assert(supervisorRun.mode === "web3-daemon-supervisor", "Supervisor should return a durable receipt shape.", supervisorRun);
  assert(supervisorRun.status === "completed", "Supervisor should complete a two-round paper run.", supervisorRun);
  assert(supervisorRun.paper_only === true, "Supervisor must remain paper-only.", supervisorRun);
  assert(supervisorRun.live_execution_permission === "blocked" && supervisorRun.wallet_mutation_permission === "blocked", "Supervisor receipt should block live execution and wallet mutation.", supervisorRun);
  assert(supervisorRun.round === 2 && supervisorRun.posted_ticks >= 2, "Supervisor should renew one stable runner lease across two paper daemon ticks.", supervisorRun);
  assert(typeof supervisorRun.net_pnl_usd === "number" && typeof supervisorRun.max_drawdown_usd === "number", "Supervisor should track paper PnL and drawdown fields.", supervisorRun);
  assert(supervisorRun.loss_brake_tripped === false, "Two-round smoke supervisor should not trip the loss brake.", supervisorRun);
  assert(supervisorRun.controls.some((control) => control.includes("paper daemon")), "Supervisor receipt should disclose its paper daemon boundary.", supervisorRun);
  assert(supervisorRun.controls.some((control) => control.includes("stable runner id")), "Supervisor receipt should disclose stable lease ownership.", supervisorRun);
  const targetReceipt = buildSupervisorReceipt({
    config: {
      runnerId: "synthetic-target-runner",
      baseUrl,
      scenario: "base",
      source: "sample",
      rounds: 3,
      ticksPerRound: 1,
      targetNetPnlUsd: 10,
      maxDrawdownUsd: 100,
      maxConsecutiveBlockedRounds: 5,
      maxConsecutiveErrorRounds: 3,
    },
    startedAt: new Date(0).toISOString(),
    aggregate: {
      postedTicks: 2,
      blockedTicks: 0,
      dryRunTicks: 0,
      routeRefreshRequests: 0,
      consecutiveBlockedRounds: 0,
      consecutiveErrorRounds: 0,
      startEquityUsd: 1_000,
      lastEquityUsd: 1_015,
      peakEquityUsd: 1_015,
      maxObservedDrawdownUsd: 0,
      lastEvent: { status: "posted", next_action: "Profit target held.", equity_usd: 1_015 },
      lastError: null,
    },
    round: 2,
    status: "completed",
    stopReason: "Paper profit target hit at $15.",
  });
  assert(targetReceipt.profit_target_hit === true && targetReceipt.net_pnl_usd === 15, "Supervisor receipt should mark target-hit paper PnL.", targetReceipt);
  const brakeReceipt = buildSupervisorReceipt({
    config: {
      runnerId: "synthetic-brake-runner",
      baseUrl,
      scenario: "base",
      source: "sample",
      rounds: 3,
      ticksPerRound: 1,
      targetNetPnlUsd: 25,
      maxDrawdownUsd: 10,
      maxConsecutiveBlockedRounds: 5,
      maxConsecutiveErrorRounds: 3,
    },
    startedAt: new Date(0).toISOString(),
    aggregate: {
      postedTicks: 2,
      blockedTicks: 0,
      dryRunTicks: 0,
      routeRefreshRequests: 0,
      consecutiveBlockedRounds: 0,
      consecutiveErrorRounds: 0,
      startEquityUsd: 1_000,
      lastEquityUsd: 990,
      peakEquityUsd: 1_005,
      maxObservedDrawdownUsd: 15,
      lastEvent: { status: "posted", next_action: "Loss brake held.", equity_usd: 990 },
      lastError: null,
    },
    round: 2,
    status: "circuit-open",
    stopReason: "Loss brake opened after -$10 paper PnL and $15 max drawdown.",
  });
  assert(brakeReceipt.loss_brake_tripped === true && brakeReceipt.status === "circuit-open", "Supervisor receipt should trip the drawdown loss brake.", brakeReceipt);
  const forwardRun = await runWeb3AutonomousForwardRun({
    baseUrl,
    scenario: "all",
    source: "sample",
    runnerId: "smoke-forward-runner",
    ticks: 2,
    intervalMs: 0,
    heartbeatWhenGated: true,
    minNetPnlUsd: 0,
  });
  assert(forwardRun.mode === "web3-autonomous-forward-suite", "Autonomous forward suite should return a multi-regime report.", forwardRun);
  assert(forwardRun.paper_only === true, "Autonomous forward suite must stay paper-only.", forwardRun);
  assert(forwardRun.scenario_count === 3, "Autonomous forward suite should cover base, breakout, and rug-risk regimes.", forwardRun);
  assert(forwardRun.requested_ticks_per_scenario === 2 && forwardRun.posted_ticks >= 3, "Autonomous forward suite should execute bounded daemon ticks in each regime.", forwardRun);
  assert(forwardRun.advanced_ticks >= 1, "Autonomous forward suite should advance at least one local paper tick from a clean high-signal wallet.", forwardRun);
  assert(forwardRun.trade_count_delta >= 1, "Autonomous forward suite should record at least one bounded local paper fill.", forwardRun);
  assert(forwardRun.advanced_scenario_count >= 1 && forwardRun.traded_scenario_count >= 1, "Autonomous forward suite should disclose which regimes actually moved paper capital.", forwardRun);
  assert(["base", "breakout", "rug-risk"].every((scenario) => forwardRun.scenarios.some((report) => report.scenario === scenario)), "Autonomous forward suite should include all sample regimes.", forwardRun);
  assert(typeof forwardRun.net_pnl_usd === "number" && typeof forwardRun.target_met === "boolean", "Autonomous forward suite should quantify aggregate paper PnL and target status.", forwardRun);
  assert(typeof forwardRun.hot_coin_baseline_pnl_usd === "number" && typeof forwardRun.hot_coin_alpha_usd === "number", "Autonomous forward suite should compare agent PnL against the best visible coin baseline.", forwardRun);
  assert(["beat-hot-coin-suite", "lagged-hot-coin-suite"].includes(forwardRun.hot_coin_baseline_verdict), "Autonomous forward suite should publish a known hot-coin baseline verdict.", forwardRun);
  assert(typeof forwardRun.deployed_notional_usd === "number" && forwardRun.deployed_notional_usd > 0, "Autonomous forward suite should disclose how much paper capital it actually deployed.", forwardRun);
  assert(typeof forwardRun.deployed_hot_coin_baseline_pnl_usd === "number" && typeof forwardRun.deployed_hot_coin_alpha_usd === "number", "Autonomous forward suite should compare deployed paper capital against the same-notional hot-coin baseline.", forwardRun);
  assert(["beat-deployed-hot-coin-suite", "lagged-deployed-hot-coin-suite"].includes(forwardRun.deployed_hot_coin_baseline_verdict), "Autonomous forward suite should publish a known deployed-notional hot-coin verdict.", forwardRun);
  assert(forwardRun.scenarios.every((report) => typeof report.hot_coin_alpha_usd === "number" && typeof report.agent_return_pct === "number"), "Every forward scenario should expose visible-market alpha metrics.", forwardRun.scenarios);
  assert(forwardRun.scenarios.every((report) => typeof report.deployed_notional_usd === "number" && typeof report.deployed_hot_coin_alpha_usd === "number"), "Every forward scenario should expose same-notional deployed alpha metrics.", forwardRun.scenarios);
  assert(forwardRun.scenarios.find((report) => report.scenario === "breakout")?.events?.[0]?.next_action?.includes("FARTCOIN"), "Breakout forward run should scout the visible momentum leader instead of defaulting to the safest large cap.", forwardRun.scenarios);
  assert(["all-profitable", "mixed-target-met", "flat-target-met", "profitable-below-target", "not-profitable"].includes(forwardRun.verdict), "Autonomous forward suite should publish a known profit verdict.", forwardRun);
  const repeatRun = await runWeb3AutonomousForwardRun({
    baseUrl,
    scenario: "all",
    source: "sample",
    runnerId: "smoke-repeat-runner",
    runs: 2,
    ticks: 2,
    intervalMs: 0,
    heartbeatWhenGated: true,
    minNetPnlUsd: 0,
  });
  assert(repeatRun.mode === "web3-autonomous-forward-repeat", "Autonomous repeat proof should return a repeatability report.", repeatRun);
  assert(repeatRun.paper_only === true && repeatRun.run_count === 2, "Autonomous repeat proof should stay paper-only and run the requested count.", repeatRun);
  assert(typeof repeatRun.hit_rate_pct === "number" && typeof repeatRun.consistency_score === "number", "Autonomous repeat proof should quantify hit rate and consistency.", repeatRun);
  assert(typeof repeatRun.max_cumulative_drawdown_usd === "number" && typeof repeatRun.average_net_pnl_usd === "number", "Autonomous repeat proof should quantify drawdown and average PnL.", repeatRun);
  assert(typeof repeatRun.deployed_hot_coin_alpha_usd === "number" && ["beat-deployed-hot-coin-repeat", "lagged-deployed-hot-coin-repeat"].includes(repeatRun.deployed_hot_coin_baseline_verdict), "Autonomous repeat proof should compare repeat deployed capital against the same-notional hot-coin baseline.", repeatRun);
  assert(repeatRun.proof_gate_status === "passed" && repeatRun.promotion_permission === "paper-promote", "Autonomous repeat proof should expose a passed paper-promotion gate when all thresholds are met.", repeatRun);
  assert(repeatRun.hit_rate_met === true && repeatRun.drawdown_met === true && repeatRun.deployed_alpha_met === true && repeatRun.consistency_met === true, "Autonomous repeat proof should disclose each promotion threshold result.", repeatRun);
  assert(Array.isArray(repeatRun.proof_gate_blockers) && repeatRun.proof_gate_blockers.length === 0, "Autonomous repeat proof should not carry blockers when the proof gate passes.", repeatRun);
  assert(repeatRun.runs.every((report) => report.mode === "web3-autonomous-forward-suite" && report.scenario_count === 3), "Autonomous repeat proof should rerun the multi-regime suite by default.", repeatRun.runs);
  const promotionGuard = buildPaperPromotionGuardReport({
    config: {
      baseUrl,
      scenario: "all",
      source: "sample",
      minNetPnlUsd: 0,
      minHitRatePct: 100,
      minDeployedAlphaUsd: 0,
      maxDrawdownUsd: 1_000,
      minConsistencyScore: 80,
    },
    repeatProof: repeatRun,
  });
  assert(promotionGuard.mode === "web3-paper-promotion-guard", "Paper promotion guard should publish a dedicated report mode.", promotionGuard);
  assert(promotionGuard.paper_only === true && promotionGuard.live_execution_permission === "blocked", "Paper promotion guard must not grant live execution.", promotionGuard);
  assert(["scale-paper", "selective-paper", "protect-paper", "blocked"].includes(promotionGuard.status), "Paper promotion guard should publish a known promotion posture.", promotionGuard);
  assert(promotionGuard.promotion_permission !== "blocked" && promotionGuard.can_start_supervised_paper === true, "Passing repeat proof should permit bounded supervised paper autonomy.", promotionGuard);
  assert(promotionGuard.recommended_paper_size_multiplier > 0 && promotionGuard.recommended_supervisor_rounds > 0, "Promotion guard should recommend bounded paper size and supervised rounds.", promotionGuard);
  assert(promotionGuard.full_wallet_hot_coin_alpha_usd < 0 ? promotionGuard.status === "selective-paper" : promotionGuard.status !== "blocked", "Negative full-wallet hot-coin alpha should keep promotion selective instead of scaling blindly.", promotionGuard);
  assert(promotionGuard.controls.some((control) => control.includes("cannot sign")), "Promotion guard should disclose the paper-only execution boundary.", promotionGuard);
  const promotedAutopilotReceipt = buildPromotedPaperAutopilotReport({
    config: {
      baseUrl,
      scenario: "breakout",
      promotionScenario: "all",
      source: "sample",
      runnerId: "synthetic-promoted-autopilot",
      maxSupervisorRounds: 2,
    },
    startedAt: new Date(0).toISOString(),
    promotion: promotionGuard,
    resetReceipt: { paper_account: { cycle: 0 } },
    supervisor: {
      mode: "web3-daemon-supervisor",
      status: "completed",
      round: 2,
      requested_rounds: 2,
      ticks_per_round: 1,
      posted_ticks: 2,
      blocked_ticks: 0,
      net_pnl_usd: 22,
      target_net_pnl_usd: 65.65,
      max_drawdown_limit_usd: 118.17,
      profit_target_hit: false,
      loss_brake_tripped: false,
      next_action: "Review the receipt before extending runtime.",
    },
  });
  assert(promotedAutopilotReceipt.mode === "web3-promoted-paper-autopilot", "Promoted paper autopilot should publish a dedicated receipt mode.", promotedAutopilotReceipt);
  assert(promotedAutopilotReceipt.paper_only === true && promotedAutopilotReceipt.live_execution_permission === "blocked", "Promoted paper autopilot must stay paper-only.", promotedAutopilotReceipt);
  assert(promotedAutopilotReceipt.status === "completed" && promotedAutopilotReceipt.applied_supervisor_rounds === 2, "Promoted paper autopilot should apply bounded supervisor rounds when promotion passes.", promotedAutopilotReceipt);
  assert(promotedAutopilotReceipt.promotion_permission === promotionGuard.promotion_permission && promotedAutopilotReceipt.posted_ticks === 2, "Promoted paper autopilot should connect promotion permission to posted supervisor ticks.", promotedAutopilotReceipt);
  const blockedRepeatGate = buildForwardRepeatReport({
    config: {
      baseUrl,
      scenario: "all",
      source: "sample",
      runnerId: "smoke-blocked-repeat-gate",
      runs: 1,
      ticks: 2,
      minNetPnlUsd: 0,
      minHitRatePct: 100,
      minDeployedAlphaUsd: 10_000,
      maxDrawdownUsd: 0,
      minConsistencyScore: 100,
    },
    startedAt: new Date(0).toISOString(),
    runs: [forwardRun],
  });
  assert(blockedRepeatGate.proof_gate_status === "blocked" && blockedRepeatGate.target_met === false, "Autonomous repeat proof should block promotion when deployed-alpha thresholds are not met.", blockedRepeatGate);
  assert(blockedRepeatGate.proof_gate_blockers.some((blocker) => blocker.includes("deployed alpha")), "Autonomous repeat proof should explain deployed-alpha gate failures.", blockedRepeatGate);
  const blockedPromotionGuard = buildPaperPromotionGuardReport({
    config: {
      baseUrl,
      scenario: "all",
      source: "sample",
      minNetPnlUsd: 500,
      minHitRatePct: 100,
      minDeployedAlphaUsd: 9_999,
      maxDrawdownUsd: 1,
      minConsistencyScore: 99,
    },
    repeatProof: blockedRepeatGate,
  });
  assert(blockedPromotionGuard.status === "blocked" && blockedPromotionGuard.exit_code === 1, "Paper promotion guard should block autonomy when repeat proof gates fail.", blockedPromotionGuard);
  assert(blockedPromotionGuard.can_start_supervised_paper === false && blockedPromotionGuard.recommended_paper_size_multiplier === 0, "Blocked promotion guard should not allow supervised paper expansion.", blockedPromotionGuard);
  const blockedPromotedAutopilot = buildPromotedPaperAutopilotReport({
    config: {
      baseUrl,
      scenario: "breakout",
      promotionScenario: "all",
      source: "sample",
      runnerId: "synthetic-blocked-promoted-autopilot",
      maxSupervisorRounds: 2,
    },
    startedAt: new Date(0).toISOString(),
    promotion: blockedPromotionGuard,
    resetReceipt: null,
    supervisor: null,
  });
  assert(blockedPromotedAutopilot.status === "blocked" && blockedPromotedAutopilot.exit_code === 1, "Promoted paper autopilot should not start supervisor when promotion is blocked.", blockedPromotedAutopilot);
  assert(blockedPromotedAutopilot.applied_supervisor_rounds === 0 && blockedPromotedAutopilot.posted_ticks === 0, "Blocked promoted autopilot should not post paper ticks.", blockedPromotedAutopilot);
  const livePreflight = buildLiveCapitalPreflightReport({
    config: {
      baseUrl,
      scenario: "breakout",
      source: "sample",
      requireRepeatProof: true,
      allowLiveReady: false,
      requireLiveReady: false,
    },
    state: tick.payload,
    repeatProof: repeatRun,
  });
  assert(livePreflight.mode === "web3-live-capital-preflight", "Live-capital preflight should publish a dedicated report mode.", livePreflight);
  assert(livePreflight.paper_only === true && livePreflight.live_execution_permission === "blocked", "Live-capital preflight must not grant live execution from local paper state.", livePreflight);
  assert(livePreflight.daemon_can_trade_real_capital === false, "Live-capital preflight should verify daemon handoff cannot trade real capital.", livePreflight);
  assert(livePreflight.repeat_proof_status === "passed" && livePreflight.repeat_promotion_permission === "paper-promote", "Live-capital preflight should consume the repeat proof gate before considering any stronger action.", livePreflight);
  assert(["blocked-as-expected", "paper-only", "blocked"].includes(livePreflight.status), "Live-capital preflight should publish a known live-boundary status.", livePreflight);
  const landingDrill = buildLiveLandingDrillReport({
    config: {
      baseUrl,
      scenario: "breakout",
      source: "sample",
      allowLiveReady: false,
    },
    state: tick.payload,
  });
  assert(landingDrill.mode === "web3-live-landing-drill", "Live landing drill should publish a dedicated report mode.", landingDrill);
  assert(landingDrill.paper_only === true && landingDrill.live_execution_permission === "blocked", "Live landing drill must not grant live execution from local paper state.", landingDrill);
  assert(["blocked-as-expected", "paper-only", "manual-review-required", "blocked"].includes(landingDrill.status), "Live landing drill should publish a known landing-boundary status.", landingDrill);
  assert(landingDrill.items.map((item) => item.id).join(",") === "route,order,blockhash,fees,slippage,signer,relay,confirmation,boundary", "Live landing drill should cover route, order, blockhash, fees, slippage, signer, relay, confirmation, and boundary evidence.", landingDrill);
  assert(typeof landingDrill.blockhash_lifetime_ready === "boolean" && typeof landingDrill.priority_fee_ready === "boolean" && typeof landingDrill.slippage_guard_ready === "boolean", "Live landing drill should expose landing-readiness booleans.", landingDrill);
  assert(landingDrill.controls.some((control) => control.includes("never signs")), "Live landing drill should disclose its no-signing boundary.", landingDrill);
  const unsafeLivePreflight = buildLiveCapitalPreflightReport({
    config: {
      baseUrl,
      scenario: "breakout",
      source: "sample",
      requireRepeatProof: true,
      allowLiveReady: false,
      requireLiveReady: false,
    },
    state: {
      ...tick.payload,
      autonomous_live_autonomy_readiness: {
        ...tick.payload.autonomous_live_autonomy_readiness,
        status: "live-ready",
        can_trade_real_capital: true,
      },
    },
    repeatProof: repeatRun,
  });
  assert(unsafeLivePreflight.status === "blocked" && unsafeLivePreflight.exit_code === 1, "Live-capital preflight should fail closed if live readiness appears without explicit allowance.", unsafeLivePreflight);
  assert(unsafeLivePreflight.blockers.some((blocker) => blocker.includes("--allow-live-ready")), "Live-capital preflight should explain missing explicit live allowance.", unsafeLivePreflight);
  const unsafeLandingDrill = buildLiveLandingDrillReport({
    config: {
      baseUrl,
      scenario: "breakout",
      source: "sample",
      allowLiveReady: false,
    },
    state: {
      ...tick.payload,
      autonomous_live_autonomy_readiness: {
        ...tick.payload.autonomous_live_autonomy_readiness,
        status: "live-ready",
        can_trade_real_capital: true,
      },
    },
  });
  assert(unsafeLandingDrill.status === "blocked" && unsafeLandingDrill.exit_code === 1, "Live landing drill should fail closed if live readiness appears without explicit allowance.", unsafeLandingDrill);
  assert(unsafeLandingDrill.blockers.some((blocker) => blocker.includes("--allow-live-ready")), "Live landing drill should explain missing explicit live allowance.", unsafeLandingDrill);
  const settlementReconciliation = buildSettlementReconciliationReport({
    config: {
      baseUrl,
      scenario: "breakout",
      source: "sample",
      requireReconciledRelay: false,
    },
    state: tick.payload,
  });
  assert(settlementReconciliation.mode === "web3-settlement-reconciliation", "Settlement reconciliation should publish a dedicated report mode.", settlementReconciliation);
  assert(settlementReconciliation.paper_only === true && settlementReconciliation.live_execution_permission === "blocked", "Settlement reconciliation should never grant live execution permission.", settlementReconciliation);
  assert(["blocked-as-expected", "polling-required", "reconciled", "blocked"].includes(settlementReconciliation.status), "Settlement reconciliation should publish a known status.", settlementReconciliation);
  assert(settlementReconciliation.status === "blocked-as-expected", "Default local settlement reconciliation should be blocked as expected without live signed relay evidence.", settlementReconciliation);
  const unsafeRelayedSettlement = buildSettlementReconciliationReport({
    config: {
      baseUrl,
      scenario: "breakout",
      source: "sample",
      requireReconciledRelay: false,
    },
    state: {
      ...tick.payload,
      signed_transaction_relay: {
        ...tick.payload.signed_transaction_relay,
        status: "relayed",
        latest_signature: null,
        request_id: null,
        payload_hash: null,
        confirmation_status: null,
      },
      execution_audit: {
        ...tick.payload.execution_audit,
        latest: {
          ...(tick.payload.execution_audit.latest ?? {}),
          status: "relayed",
          relay_signature: null,
          request_id: null,
          payload_hash: null,
          confirmation_status: null,
        },
      },
    },
  });
  assert(unsafeRelayedSettlement.status === "blocked" && unsafeRelayedSettlement.exit_code === 1, "Settlement reconciliation should fail closed when relayed status lacks signature, request id, payload hash, or lifecycle evidence.", unsafeRelayedSettlement);
  assert(unsafeRelayedSettlement.blockers.some((blocker) => blocker.includes("signature")), "Settlement reconciliation should explain missing relay signature evidence.", unsafeRelayedSettlement);
  const unsafeConfirmedSettlement = buildSettlementReconciliationReport({
    config: {
      baseUrl,
      scenario: "breakout",
      source: "sample",
      requireReconciledRelay: true,
    },
    state: {
      ...tick.payload,
      signed_transaction_relay: {
        ...tick.payload.signed_transaction_relay,
        status: "confirmed",
        latest_signature: "5yntheticSignatureForSmoke",
        request_id: "smoke-request",
        payload_hash: "sha256:smoke",
        confirmation_status: "confirmed",
      },
      execution_audit: {
        ...tick.payload.execution_audit,
        latest: {
          ...(tick.payload.execution_audit.latest ?? {}),
          status: "confirmed",
          relay_signature: "5yntheticSignatureForSmoke",
          request_id: "smoke-request",
          payload_hash: "sha256:smoke",
          confirmation_status: "confirmed",
        },
      },
      transaction_lifecycle: {
        ...tick.payload.transaction_lifecycle,
        status: "confirming",
        items: [],
      },
    },
  });
  assert(unsafeConfirmedSettlement.status === "blocked" && unsafeConfirmedSettlement.blockers.some((blocker) => blocker.includes("landed lifecycle")), "Settlement reconciliation should require a landed lifecycle before treating confirmation as reconciled.", unsafeConfirmedSettlement);
  const portfolioMirrorGuard = buildPortfolioMirrorGuardReport({
    config: {
      baseUrl,
      scenario: "breakout",
      source: "sample",
      maxMirrorFillUsd: 1_000,
      requireReconciledFill: false,
    },
    state: tick.payload,
  });
  assert(portfolioMirrorGuard.mode === "web3-portfolio-mirror-guard", "Portfolio mirror guard should publish a dedicated report mode.", portfolioMirrorGuard);
  assert(portfolioMirrorGuard.paper_only === true && portfolioMirrorGuard.live_execution_permission === "blocked", "Portfolio mirror guard should never grant live execution permission.", portfolioMirrorGuard);
  assert(portfolioMirrorGuard.status === "blocked-as-expected" && portfolioMirrorGuard.portfolio_mirror_permission === "blocked", "Default local portfolio mirror should remain blocked without landed signed fill evidence.", portfolioMirrorGuard);
  const landedMirrorState = {
    ...tick.payload,
    signed_transaction_relay: {
      ...tick.payload.signed_transaction_relay,
      status: "confirmed",
      latest_plan_id: "smoke-plan",
      latest_symbol: "BONK",
      latest_side: "buy",
      latest_signature: "5yntheticSignatureForMirrorSmoke",
      request_id: "smoke-request",
      payload_hash: "sha256:smoke",
      confirmation_status: "confirmed",
    },
    execution_audit: {
      ...tick.payload.execution_audit,
      latest: {
        ...(tick.payload.execution_audit.latest ?? {}),
        status: "confirmed",
        plan_id: "smoke-plan",
        symbol: "BONK",
        side: "buy",
        relay_signature: "5yntheticSignatureForMirrorSmoke",
        request_id: "smoke-request",
        payload_hash: "sha256:smoke",
        confirmation_status: "confirmed",
      },
    },
    transaction_lifecycle: {
      ...tick.payload.transaction_lifecycle,
      status: "confirming",
      items: [
        {
          id: "tx-life-smoke",
          plan_id: "smoke-plan",
          symbol: "BONK",
          side: "buy",
          stage: "landed",
          status_label: "landed",
          request_id: "smoke-request",
          payload_hash: "sha256:smoke",
          simulated_signature: null,
          signed_transaction_required: true,
          last_valid_block_height: null,
          expires_in_seconds: null,
          submit_path: "solana-rpc",
          retry_after: null,
          next_step: "Record fill, update portfolio, and close the lifecycle item.",
          blockers: [],
        },
      ],
    },
    autonomous_order_handoff: {
      ...tick.payload.autonomous_order_handoff,
      items: [
        {
          id: "handoff-smoke",
          plan_id: "smoke-plan",
          symbol: "BONK",
          side: "buy",
          action: "poll-confirmation",
          request_id: "smoke-request",
          payload_hash: "sha256:smoke",
          notional_usd: 250,
          blockers: [],
        },
      ],
    },
  };
  const mirrorReady = buildPortfolioMirrorGuardReport({
    config: {
      baseUrl,
      scenario: "breakout",
      source: "sample",
      maxMirrorFillUsd: 1_000,
      requireReconciledFill: true,
    },
    state: landedMirrorState,
  });
  assert(mirrorReady.status === "mirror-ready" && mirrorReady.portfolio_mirror_permission === "audit-ready", "Portfolio mirror guard should allow only fully evidenced, landed, bounded fills to reach audit-ready state.", mirrorReady);
  assert(mirrorReady.idempotency_key && mirrorReady.fill_notional_usd === 250, "Portfolio mirror guard should expose idempotency and fill-notional evidence.", mirrorReady);
  const oversizedMirror = buildPortfolioMirrorGuardReport({
    config: {
      baseUrl,
      scenario: "breakout",
      source: "sample",
      maxMirrorFillUsd: 100,
      requireReconciledFill: true,
    },
    state: landedMirrorState,
  });
  assert(oversizedMirror.status === "blocked" && oversizedMirror.blockers.some((blocker) => blocker.includes("guard cap")), "Portfolio mirror guard should fail closed when landed fill notional exceeds the mirror cap.", oversizedMirror);
  const invalidMirrorApply = await postTrading({
    scenario: "breakout",
    source: "sample",
    account: "persistent",
    advance: false,
    portfolio_mirror: {
      action: "apply",
      max_fill_usd: 0,
    },
  });
  assert(invalidMirrorApply.response.status === 422, "Portfolio mirror apply should reject invalid max fill caps at the API boundary.", invalidMirrorApply.payload);
  assert(String(invalidMirrorApply.payload.error ?? "").includes("portfolio_mirror.max_fill_usd"), "Portfolio mirror validation should explain invalid max fill caps.", invalidMirrorApply.payload);
  const blockedMirrorApply = await postTrading({
    scenario: "breakout",
    source: "sample",
    account: "persistent",
    advance: false,
    portfolio_mirror: {
      action: "apply",
      max_fill_usd: 1_000,
      fill_price_usd: 0.0000125,
      filled_quantity: 20_000_000,
    },
  });
  assert(blockedMirrorApply.response.status === 200, "Blocked portfolio mirror apply should return the current trading state.", blockedMirrorApply.payload);
  assert(blockedMirrorApply.payload.portfolio_mirror_apply?.mode === "portfolio-mirror-apply", "Portfolio mirror apply should return a dedicated report.", blockedMirrorApply.payload.portfolio_mirror_apply);
  assert(blockedMirrorApply.payload.portfolio_mirror_apply.status === "blocked", "Portfolio mirror apply should block without confirmed signed settlement evidence.", blockedMirrorApply.payload.portfolio_mirror_apply);
  assert(blockedMirrorApply.payload.portfolio_mirror_apply.live_execution_permission === "blocked" && blockedMirrorApply.payload.portfolio_mirror_apply.wallet_mutation_permission === "blocked", "Portfolio mirror apply should not grant live or wallet mutation permission.", blockedMirrorApply.payload.portfolio_mirror_apply);
  assert(blockedMirrorApply.payload.portfolio_mirror_apply.blockers.some((blocker) => blocker.includes("confirmed signed relay")), "Portfolio mirror apply should explain missing confirmed relay evidence.", blockedMirrorApply.payload.portfolio_mirror_apply);
  const invalidConfirmationPoll = await postTrading({
    scenario: "breakout",
    source: "sample",
    account: "persistent",
    advance: false,
    confirmation_poll: {
      action: "peek",
    },
  });
  assert(invalidConfirmationPoll.response.status === 422, "Signature confirmation polling should reject unknown actions at the API boundary.", invalidConfirmationPoll.payload);
  assert(String(invalidConfirmationPoll.payload.error ?? "").includes("confirmation_poll.action"), "Signature confirmation polling validation should explain invalid actions.", invalidConfirmationPoll.payload);
  const blockedConfirmationPoll = await postTrading({
    scenario: "breakout",
    source: "sample",
    account: "persistent",
    advance: false,
    confirmation_poll: {
      action: "poll",
      search_transaction_history: true,
    },
  });
  assert(blockedConfirmationPoll.response.status === 200, "Blocked signature confirmation poll should return the current trading state.", blockedConfirmationPoll.payload);
  assert(blockedConfirmationPoll.payload.signature_confirmation_poll?.mode === "signature-confirmation-poll", "Signature confirmation polling should return a dedicated report.", blockedConfirmationPoll.payload.signature_confirmation_poll);
  assert(blockedConfirmationPoll.payload.signature_confirmation_poll.status === "blocked", "Signature confirmation polling should block without a stored relayed signature.", blockedConfirmationPoll.payload.signature_confirmation_poll);
  assert(blockedConfirmationPoll.payload.signature_confirmation_poll.live_execution_permission === "blocked" && blockedConfirmationPoll.payload.signature_confirmation_poll.wallet_mutation_permission === "blocked", "Signature confirmation polling should not grant live or wallet mutation permission.", blockedConfirmationPoll.payload.signature_confirmation_poll);
  assert(blockedConfirmationPoll.payload.signature_confirmation_poll.blockers.some((blocker) => blocker.includes("stored relayed signature")), "Signature confirmation polling should explain missing relayed signature evidence.", blockedConfirmationPoll.payload.signature_confirmation_poll);
  const invalidFillReconcile = await postTrading({
    scenario: "breakout",
    source: "sample",
    account: "persistent",
    advance: false,
    fill_reconcile: {
      action: "inspect",
    },
  });
  assert(invalidFillReconcile.response.status === 422, "Settlement fill reconciliation should reject unknown actions at the API boundary.", invalidFillReconcile.payload);
  assert(String(invalidFillReconcile.payload.error ?? "").includes("fill_reconcile.action"), "Settlement fill reconciliation validation should explain invalid actions.", invalidFillReconcile.payload);
  const blockedFillReconcile = await postTrading({
    scenario: "breakout",
    source: "sample",
    account: "persistent",
    advance: false,
    fill_reconcile: {
      action: "reconcile",
      commitment: "confirmed",
      max_fill_usd: 1_000,
    },
  });
  assert(blockedFillReconcile.response.status === 200, "Blocked settlement fill reconciliation should return the current trading state.", blockedFillReconcile.payload);
  assert(blockedFillReconcile.payload.settlement_fill_reconciliation?.mode === "settlement-fill-reconciliation", "Settlement fill reconciliation should return a dedicated report.", blockedFillReconcile.payload.settlement_fill_reconciliation);
  assert(blockedFillReconcile.payload.settlement_fill_reconciliation.status === "blocked", "Settlement fill reconciliation should block without confirmed signed settlement evidence.", blockedFillReconcile.payload.settlement_fill_reconciliation);
  assert(blockedFillReconcile.payload.settlement_fill_reconciliation.live_execution_permission === "blocked" && blockedFillReconcile.payload.settlement_fill_reconciliation.wallet_mutation_permission === "blocked", "Settlement fill reconciliation should not grant live or wallet mutation permission.", blockedFillReconcile.payload.settlement_fill_reconciliation);
  assert(blockedFillReconcile.payload.settlement_fill_reconciliation.portfolio_mirror_permission === "blocked" && blockedFillReconcile.payload.settlement_fill_reconciliation.mirror_apply_request === null, "Settlement fill reconciliation should not emit a mirror apply request while blocked.", blockedFillReconcile.payload.settlement_fill_reconciliation);
  assert(blockedFillReconcile.payload.settlement_fill_reconciliation.blockers.some((blocker) => blocker.includes("stored relayed signature")), "Settlement fill reconciliation should explain missing relayed signature evidence.", blockedFillReconcile.payload.settlement_fill_reconciliation);
  const invalidSettlementWatchdog = await postTrading({
    scenario: "breakout",
    source: "sample",
    account: "persistent",
    advance: false,
    settlement_watchdog: {
      action: "inspect",
    },
  });
  assert(invalidSettlementWatchdog.response.status === 422, "Autonomous settlement watchdog should reject unknown actions at the API boundary.", invalidSettlementWatchdog.payload);
  assert(String(invalidSettlementWatchdog.payload.error ?? "").includes("settlement_watchdog.action"), "Settlement watchdog validation should explain invalid actions.", invalidSettlementWatchdog.payload);
  const blockedSettlementWatchdog = await postTrading({
    scenario: "breakout",
    source: "sample",
    account: "persistent",
    advance: false,
    settlement_watchdog: {
      action: "run",
      apply_mirror: true,
      max_fill_usd: 1_000,
      search_transaction_history: true,
    },
  });
  assert(blockedSettlementWatchdog.response.status === 200, "Blocked autonomous settlement watchdog should return the current trading state.", blockedSettlementWatchdog.payload);
  assert(blockedSettlementWatchdog.payload.autonomous_settlement_watchdog?.mode === "autonomous-settlement-watchdog", "Settlement watchdog should return a dedicated report.", blockedSettlementWatchdog.payload.autonomous_settlement_watchdog);
  assert(blockedSettlementWatchdog.payload.autonomous_settlement_watchdog.status === "blocked", "Settlement watchdog should block without a stored relayed signature.", blockedSettlementWatchdog.payload.autonomous_settlement_watchdog);
  assert(blockedSettlementWatchdog.payload.autonomous_settlement_watchdog.live_execution_permission === "blocked" && blockedSettlementWatchdog.payload.autonomous_settlement_watchdog.wallet_mutation_permission === "blocked", "Settlement watchdog should not grant live or wallet mutation permission.", blockedSettlementWatchdog.payload.autonomous_settlement_watchdog);
  assert(blockedSettlementWatchdog.payload.autonomous_settlement_watchdog.poll_status === "blocked", "Settlement watchdog should expose the blocked poll status.", blockedSettlementWatchdog.payload.autonomous_settlement_watchdog);
  assert(blockedSettlementWatchdog.payload.autonomous_settlement_watchdog.blockers.some((blocker) => blocker.includes("stored relayed signature")), "Settlement watchdog should explain missing relayed signature evidence.", blockedSettlementWatchdog.payload.autonomous_settlement_watchdog);
  const daemonSettlementBody = buildDaemonTickBody({
    ...tick.payload,
    signed_transaction_relay: {
      ...tick.payload.signed_transaction_relay,
      status: "confirmed",
      latest_signature: "5NfRelaySignature111111111111111111111111111111111111111",
    },
    execution_audit: {
      ...tick.payload.execution_audit,
      latest: {
        ...(tick.payload.execution_audit.latest ?? {}),
        status: "confirmed",
        relay_signature: "5NfRelaySignature111111111111111111111111111111111111111",
      },
    },
  }, {
    scenario: "breakout",
    source: "sample",
    runnerId: "smoke-settlement-runner",
  }, "smoke-settlement-request");
  assert(daemonSettlementBody.settlement_watchdog?.action === "run", "Daemon tick body should request the settlement watchdog when confirmed relay evidence exists.", daemonSettlementBody);
  assert(daemonSettlementBody.settlement_watchdog.apply_mirror === true, "Daemon settlement watchdog should explicitly request guarded mirror apply.", daemonSettlementBody);
  assert(daemonSettlementBody.settlement_watchdog.max_fill_usd > 0, "Daemon settlement watchdog should carry a bounded fill cap.", daemonSettlementBody);
  const daemonMarketRefreshBody = buildDaemonTickBody({
    ...tick.payload,
    autonomous_daemon_handoff: {
      ...tick.payload.autonomous_daemon_handoff,
      market_worker: {
        ...tick.payload.autonomous_daemon_handoff.market_worker,
        status: "refresh-first",
        lane: "route-quotes",
        provider: "jupiter-quote-api",
        endpoint: "/swap/v1/quote-readonly",
        action: "poll",
        read_only: true,
        route_refresh_first: true,
        can_feed_paper_loop: false,
      },
    },
  }, {
    scenario: "breakout",
    source: "live-dex",
    runnerId: "smoke-market-worker-runner",
  }, "smoke-market-worker-request");
  assert(daemonMarketRefreshBody.route_refresh?.action === "request-quote", "Daemon tick body should request read-only route refreshes when the market worker marks route quotes refresh-first.", daemonMarketRefreshBody);
  const daemonSampleMarketBody = buildDaemonTickBody(tick.payload, {
    scenario: "breakout",
    source: "sample",
    runnerId: "smoke-sample-worker-runner",
  }, "smoke-sample-market-worker-request");
  assert(daemonSampleMarketBody.route_refresh === undefined, "Daemon tick body should not request live route refreshes while the market worker is sample-only.", daemonSampleMarketBody);

  const summary = {
    baseUrl,
    scenario: tick.payload.scenario,
    daemonRunner: daemonRun.events[0].status,
    daemonLease: daemonRun.events[0].lease_status,
    daemonMarketWorker: daemonRun.events[0].market_worker,
    daemonMarketWorkerLane: daemonRun.events[0].market_worker_lane,
    forwardVerdict: forwardRun.verdict,
    forwardNetPnl: forwardRun.net_pnl_usd,
    forwardTargetMet: forwardRun.target_met,
    forwardScenarios: forwardRun.scenario_count,
    forwardTradedScenarios: forwardRun.traded_scenario_count,
    forwardHotCoinAlpha: forwardRun.hot_coin_alpha_usd,
    forwardHotCoinVerdict: forwardRun.hot_coin_baseline_verdict,
    forwardDeployedAlpha: forwardRun.deployed_hot_coin_alpha_usd,
    forwardDeployedVerdict: forwardRun.deployed_hot_coin_baseline_verdict,
    repeatVerdict: repeatRun.verdict,
    repeatHitRate: repeatRun.hit_rate_pct,
    repeatDrawdown: repeatRun.max_cumulative_drawdown_usd,
    repeatDeployedAlpha: repeatRun.deployed_hot_coin_alpha_usd,
    repeatGate: repeatRun.proof_gate_status,
    livePreflight: livePreflight.status,
    livePreflightPermission: livePreflight.live_execution_permission,
    settlement: settlementReconciliation.status,
    settlementPermission: settlementReconciliation.live_execution_permission,
    portfolioMirror: portfolioMirrorGuard.status,
    portfolioMirrorPermission: portfolioMirrorGuard.portfolio_mirror_permission,
    portfolioMirrorApply: blockedMirrorApply.payload.portfolio_mirror_apply.status,
    confirmationPoll: blockedConfirmationPoll.payload.signature_confirmation_poll.status,
    fillReconcile: blockedFillReconcile.payload.settlement_fill_reconciliation.status,
    fillMirrorRequest: Boolean(blockedFillReconcile.payload.settlement_fill_reconciliation.mirror_apply_request),
    settlementWatchdog: blockedSettlementWatchdog.payload.autonomous_settlement_watchdog.status,
    settlementWatchdogAction: blockedSettlementWatchdog.payload.autonomous_settlement_watchdog.action,
    daemonStatus: tick.payload.paper_daemon.status,
    mission: tick.payload.autonomous_trade_mission.status,
    burst: tick.payload.autonomous_burst_scheduler.status,
    sessionStatus: session.payload.autonomous_session_run.status,
    sessionPnl: session.payload.autonomous_session_run.net_pnl_usd,
    policy: session.payload.autonomous_policy_optimizer.status,
    edgePermission: session.payload.autonomous_edge_verifier.permission,
    edgeStack: session.payload.autonomous_edge_stack.permission,
    edgeScore: session.payload.autonomous_edge_stack.edge_score,
    edgeAction: session.payload.autonomous_edge_stack_execution.selected_action,
    edgeActionStatus: session.payload.autonomous_edge_stack_execution.status,
	    laneBias: session.payload.autonomous_policy_optimizer.attribution_size_bias,
	    race: session.payload.autonomous_opportunity_race.status,
	    raceExecution: session.payload.autonomous_opportunity_race_execution.status,
	    trendChase: session.payload.trend_chase_execution.status,
	    trendScoutReserve: session.payload.trend_chase_execution.scout_reserve_usd,
	    scoutLifecycle: session.payload.scout_lifecycle.status,
	    scoutWatched: session.payload.scout_lifecycle.watched_count,
    positionRiskExecution: session.payload.autonomous_position_risk_execution.status,
    positionSurveillance: session.payload.position_surveillance_matrix.status,
    portfolioTapeGuard: session.payload.portfolio_price_action_guard.status,
    portfolioTapeExecution: session.payload.portfolio_tape_guard_execution.status,
    strategyAttribution: session.payload.autonomous_strategy_attribution.status,
    tickPlan: session.payload.autonomous_tick_plan.status,
    tickPlanSeconds: session.payload.autonomous_tick_plan.tick_seconds,
    trendVelocity: session.payload.trend_velocity_scanner.status,
    marketPulse: session.payload.autonomous_market_pulse.status,
    marketPulseLeader: session.payload.autonomous_market_pulse.leader_symbol,
    marketPulseExecution: session.payload.market_pulse_execution.status,
    highFrequencyRace: session.payload.high_frequency_profit_race.status,
    highFrequencyExecution: session.payload.high_frequency_profit_race_execution.status,
    highFrequencyExpectedPerMinute: session.payload.high_frequency_profit_race.expected_profit_per_minute_usd,
    commandCenter: session.payload.autonomous_command_center.status,
    commandAction: session.payload.autonomous_command_center.primary_action,
    commandExecution: session.payload.autonomous_command_center_execution.status,
    commandPerformance: session.payload.autonomous_command_performance.status,
    commandNet: session.payload.autonomous_command_performance.net_contribution_usd,
    orderRegime: session.payload.autonomous_order_ticket.regime_status,
    orderRegimeAction: session.payload.autonomous_order_ticket.regime_action,
    orderRegimeScore: session.payload.autonomous_order_ticket.regime_score,
    orderFriction: session.payload.autonomous_order_ticket.friction_status,
    orderFrictionAction: session.payload.autonomous_order_ticket.friction_action,
    orderFrictionScore: session.payload.autonomous_order_ticket.friction_score,
    orderTiming: session.payload.autonomous_order_ticket.timing_status,
    orderTimingAction: session.payload.autonomous_order_ticket.timing_action,
    orderTimingScore: session.payload.autonomous_order_ticket.timing_score,
    orderTicketExecution: session.payload.autonomous_order_ticket_execution.status,
    orderTicketLedgerApplied: session.payload.autonomous_order_ticket_execution.ledger_applied,
    candleConviction: session.payload.autonomous_candle_conviction.status,
    candleScore: session.payload.autonomous_candle_conviction.conviction_score,
    executionCadence: session.payload.autonomous_execution_cadence.status,
    executionCadenceLane: session.payload.autonomous_execution_cadence.primary_lane,
    executionCadencePollSeconds: session.payload.autonomous_execution_cadence.next_poll_seconds,
    marketIntelligence: session.payload.autonomous_market_intelligence.status,
    marketLeader: session.payload.autonomous_market_intelligence.leader_symbol,
    marketIntelligenceExecution: session.payload.market_intelligence_execution.status,
    watchlistRotation: session.payload.autonomous_watchlist_rotation.status,
    watchlistRotationExecution: session.payload.watchlist_rotation_execution.status,
    profitLearning: session.payload.autonomous_profit_learning.status,
    profitLearningSize: session.payload.autonomous_profit_learning.size_multiplier,
    profitControl: session.payload.autonomous_profit_control.status,
    profitControlDeploy: session.payload.autonomous_profit_control.deploy_now_usd,
    profitLaneScoreboard: session.payload.autonomous_profit_lane_scoreboard.status,
    profitLaneLeader: session.payload.autonomous_profit_lane_scoreboard.leader_lane,
    profitLaneMakeMoney: session.payload.autonomous_profit_lane_scoreboard.make_money_score,
    positionSituation: session.payload.autonomous_position_situation_board.status,
    positionSituationLeader: session.payload.autonomous_position_situation_board.leader_symbol,
    freshBuyBlocked: session.payload.autonomous_position_situation_board.fresh_buy_blocked,
    tradingDirective: session.payload.autonomous_trading_directive.action,
    directiveStatus: session.payload.autonomous_trading_directive.status,
    directiveSymbol: session.payload.autonomous_trading_directive.symbol,
    directiveOutcome: session.payload.autonomous_directive_outcome_auditor.status,
    directiveOutcomeAction: session.payload.autonomous_directive_outcome_auditor.action,
    reactionLoop: session.payload.autonomous_reaction_loop.status,
    reactionAction: session.payload.autonomous_reaction_loop.action,
    reactionInvalidatesIn: session.payload.autonomous_reaction_loop.invalidates_in_seconds,
    landingOptimizer: session.payload.autonomous_landing_optimizer.status,
    landingAction: session.payload.autonomous_landing_optimizer.action,
    landingPath: session.payload.autonomous_landing_optimizer.selected_path,
    landingProbability: session.payload.autonomous_landing_optimizer.landing_probability_pct,
    runEnvelope: session.payload.autonomous_run_envelope.status,
    runAction: session.payload.autonomous_run_envelope.action,
    runNextWake: session.payload.autonomous_run_envelope.next_wake_seconds,
    runConfidence: session.payload.autonomous_run_envelope.run_confidence_score,
    profitRunGuard: session.payload.autonomous_profit_run_guard.status,
    profitRunAction: session.payload.autonomous_profit_run_guard.action,
    profitRunGuardScore: session.payload.autonomous_profit_run_guard.profit_guard_score,
    profitRunMaxFills: session.payload.autonomous_profit_run_guard.max_next_fills,
    dataFreshnessGate: session.payload.autonomous_data_freshness_gate.status,
    dataFreshnessScore: session.payload.autonomous_data_freshness_gate.data_score,
    dataFreshnessAction: session.payload.autonomous_data_freshness_gate.action,
    dataFreshnessLane: session.payload.autonomous_data_freshness_gate.next_refresh_lane,
    dataFreshnessNextSize: session.payload.autonomous_data_freshness_gate.size_multiplier,
    dataFreshnessNextFills: session.payload.autonomous_data_freshness_gate.max_next_fills,
    marketFusion: session.payload.autonomous_market_evidence_fusion.status,
    marketFusionLeader: session.payload.autonomous_market_evidence_fusion.leader_symbol,
    marketFusionAction: session.payload.autonomous_market_evidence_fusion.leader_action,
    marketFusionScore: session.payload.autonomous_market_evidence_fusion.fusion_score,
    marketFusionProviderLane: session.payload.autonomous_market_evidence_fusion.provider_lane,
    marketFusionFills: session.payload.autonomous_market_evidence_fusion.max_next_fills,
    replayGate: session.payload.autonomous_replay_gate.status,
    replayGateScore: session.payload.autonomous_replay_gate.replay_score,
    replayGateAction: session.payload.autonomous_replay_gate.action,
    replayGateNextSize: session.payload.autonomous_replay_gate.size_multiplier,
    replayGateNextFills: session.payload.autonomous_replay_gate.max_next_fills,
    burstFillPlan: session.payload.autonomous_burst_fill_plan.status,
    burstChildFills: session.payload.autonomous_burst_fill_plan.child_fill_count,
    burstChildNotional: session.payload.autonomous_burst_fill_plan.child_notional_usd,
    burstMaxSlippageBps: session.payload.autonomous_burst_fill_plan.max_slippage_bps,
    burstPriorFeedback: session.payload.autonomous_burst_fill_plan.prior_feedback_action,
    burstPriorMultiplier: session.payload.autonomous_burst_fill_plan.prior_size_multiplier,
    burstFeedbackCeiling: session.payload.autonomous_burst_fill_plan.feedback_child_fill_ceiling,
    burstFeedback: session.payload.autonomous_burst_outcome_feedback.status,
    burstFeedbackAction: session.payload.autonomous_burst_outcome_feedback.action,
    burstFeedbackNextMultiplier: session.payload.autonomous_burst_outcome_feedback.next_size_multiplier,
    burstFeedbackNetEdge: session.payload.autonomous_burst_outcome_feedback.net_expected_edge_usd,
    burstExecution: session.payload.autonomous_burst_fill_execution.status,
    burstExecutionApplied: session.payload.autonomous_burst_fill_execution.applied_child_count,
    burstExecutionNotional: session.payload.autonomous_burst_fill_execution.applied_notional_usd,
    profitAccountability: session.payload.autonomous_profit_accountability.status,
    profitAccountabilityScore: session.payload.autonomous_profit_accountability.accountability_score,
    profitAccountabilityAction: session.payload.autonomous_profit_accountability.action,
    profitAccountabilityNextSize: session.payload.autonomous_profit_accountability.next_size_multiplier,
    profitAccountabilityNextFills: session.payload.autonomous_profit_accountability.max_next_fills,
    executionAdapter: session.payload.autonomous_execution_adapter_readiness.status,
    executionAdapterActive: session.payload.autonomous_execution_adapter_readiness.active_adapter,
    providerBudget: session.payload.market_ingestion_plan.provider_budget_status,
    liveExecution: tick.payload.execution_gate.live_execution_enabled,
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  console.error(`Start the app first, or set WEB3_TRADING_BASE_URL. Tried: ${baseUrl}`);
  process.exit(1);
});
