#!/usr/bin/env node

const DEFAULT_BASE_URL = "http://localhost:4010";
const LIVE_QUERY = "source=live-dex&account=persistent&scenario=breakout&cycles=0";

const config = parseArgs(process.argv.slice(2));
const baseUrl = (config.baseUrl || process.env.WEB3_RUNNING_APP_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
const results = [];

function parseArgs(args) {
  const parsed = {};
  for (const arg of args) {
    if (arg.startsWith("--base-url=")) parsed.baseUrl = arg.slice("--base-url=".length);
    if (arg === "--json") parsed.json = true;
  }
  return parsed;
}

function fail(message, detail) {
  const suffix = detail === undefined ? "" : `\n${typeof detail === "string" ? detail : JSON.stringify(detail, null, 2)}`;
  throw new Error(`${message}${suffix.slice(0, 4000)}`);
}

function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}

function record(name, status, detail = "") {
  results.push({ name, status, detail });
}

async function request(path, { timeoutMs = 30_000, ...init } = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  });
}

async function requestJson(path) {
  const response = await request(path);
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    fail(`${path} should return JSON.`, text);
  }
  return { response, json };
}

async function requestText(path) {
  const response = await request(path);
  const text = await response.text();
  return { response, text };
}

async function requestTextUntil(path, markers, { timeoutMs = 60_000, readTimeoutMs = 30_000, maxBytes = 750_000 } = {}) {
  const response = await request(path, { timeoutMs });
  assert(response.body, `${path} should return a readable response body.`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const startedAt = Date.now();
  let text = "";
  let done = false;

  try {
    while (!done) {
      assert(Date.now() - startedAt < timeoutMs, `${path} did not deliver the required UI markers before timeout.`, {
        markers: missingMarkerLabels(text, markers),
        bytes: text.length,
      });

      const chunk = await Promise.race([
        reader.read(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("stream-read-timeout")), readTimeoutMs)),
      ]);

      if (chunk.done) break;
      text += decoder.decode(chunk.value, { stream: true });
      assert(text.length <= maxBytes, `${path} exceeded the running-app smoke read limit before all markers appeared.`, {
        markers: missingMarkerLabels(text, markers),
        bytes: text.length,
      });
      done = missingMarkers(text, markers).length === 0;
    }
  } catch (error) {
    if (error?.message === "stream-read-timeout") {
      fail(`${path} stalled before delivering the required UI markers.`, {
        markers: missingMarkerLabels(text, markers),
        bytes: text.length,
      });
    }
    throw error;
  } finally {
    await reader.cancel().catch(() => {});
  }

  text += decoder.decode();
  return { response, text };
}

function includesAny(text, labels) {
  return labels.some((label) => text.includes(label));
}

function missingMarkers(text, markers) {
  return markers.filter((marker) => !marker.test(text));
}

function missingMarkerLabels(text, markers) {
  return missingMarkers(text, markers).map((marker) => marker.source);
}

async function verifyHealth() {
  const { response, json } = await requestJson("/api/health");
  assert(response.status === 200, "Health endpoint should return 200.", { status: response.status, json });
  assert(json.status === "ok", "Health endpoint should report ok.", json);
  assert(json.web3_live_canary_proof?.actual_live_trade_tested === false, "Health should truthfully report no actual live canary trade yet.", json.web3_live_canary_proof);
  assert(json.web3_live_canary_proof?.live_execution_permission === "blocked", "Health should keep live execution blocked.", json.web3_live_canary_proof);
  assert(json.web3_live_canary_proof?.wallet_mutation_permission === "blocked", "Health should keep wallet mutation blocked.", json.web3_live_canary_proof);
  record("health", "pass", "local app is responding and live-trade authority is blocked");
}

async function verifyTradingPage() {
  const requiredMarkers = [
    /No real trade tested yet/,
    /Actual live trade test ledger/,
    /Funded wallet trade/,
    /not attempted/,
    /Trading live canary console/,
    /Dedicated trading wallet/,
    /live blocked/,
    /(Net worth|wallet curve|Wallet equity)/,
    /private keys/,
    /seed phrases/,
  ];
  const { response, text } = await requestTextUntil(`/trading?${LIVE_QUERY}`, requiredMarkers);
  assert(response.status === 200, "Trading page should return 200.", { status: response.status });
  assert(text.length > 50_000, "Trading page should return the real cockpit HTML, not a tiny fallback.", { length: text.length });
  assert(!text.includes("This site can't be reached"), "Trading page should not render the browser network error page.");
  assert(!text.includes("This page did not load"), "Trading page should not render the route-error fallback.");
  assert(text.includes("No real trade tested yet"), "Trading page should say no real live trade has been tested.", text);
  assert(text.includes("Actual live trade test ledger"), "Trading page should expose the actual live-trade test ledger.", text);
  assert(text.includes("Funded wallet trade") && text.includes("not attempted"), "Trading page should say the funded wallet trade was not attempted.", text);
  assert(text.includes("Trading live canary console"), "Trading page should render the live canary console.", text);
  assert(text.includes("Dedicated trading wallet"), "Trading page should show the dedicated wallet gate.", text);
  assert(text.includes("live blocked"), "Trading page should make the live-money block visible.", text);
  assert(includesAny(text, ["Net worth", "wallet curve", "Wallet equity"]), "Trading page should expose a wallet/net-worth chart surface.", text);
  assert(text.includes("private keys") && text.includes("seed phrases"), "Trading page should repeat the never-provide wallet-secret boundary.", text);
  record("trading-page", "pass", "live DEX trading cockpit renders with live-test ledger, live block, wallet gate, canary console, and net-worth surface");
}

async function verifyCanaryReceipt() {
  const { response, json } = await requestJson(`/api/web3-live-trade-canary?${LIVE_QUERY}`);
  assert(response.status === 200, "Live canary receipt should return 200.", { status: response.status, json });
  assert(json.actual_live_trade_tested === false, "Live canary receipt should report no actual funded trade tested yet.", json);
  assert(json.real_funds_moved_by_this_app === false, "Live canary receipt should report no real funds moved by the app.", json);
  assert(json.can_submit_from_app_now === false, "Live canary receipt should keep app submission disabled.", json);
  assert(json.live_execution_permission === "blocked", "Live canary receipt should keep live execution blocked.", json);
  assert(json.transaction_submission_permission === "blocked", "Live canary receipt should keep transaction submission blocked.", json);
  assert(json.wallet_mutation_permission === "blocked", "Live canary receipt should keep wallet mutation blocked.", json);
  record("live-canary-receipt", "pass", json.next_action || "funded canary remains blocked");
}

async function verifyLiveTestLedger() {
  const { response, json } = await requestJson(`/api/web3-live-test-ledger?${LIVE_QUERY}`);
  assert(response.status === 200, "Live-test ledger should return 200.", { status: response.status, json });
  assert(json.mode === "web3-live-test-ledger", "Live-test ledger should expose the expected mode.", json);
  assert(json.actual_live_trade_tested === false, "Live-test ledger should report no actual funded trade tested yet.", json);
  assert(json.funded_trade_attempted_by_this_app === false, "Live-test ledger should report no funded trade attempted by the app.", json);
  assert(json.live_execution_permission === "blocked", "Live-test ledger should keep live execution blocked.", json);
  assert(json.wallet_mutation_permission === "blocked", "Live-test ledger should keep wallet mutation blocked.", json);
  assert(Array.isArray(json.rows) && json.rows.length === 5, "Live-test ledger should expose five evidence rows.", json);
  const fundedRow = json.rows.find((row) => row.id === "funded-wallet-trade");
  assert(fundedRow?.value === "not attempted", "Live-test ledger funded row should say not attempted.", fundedRow);
  assert(fundedRow?.counts_as_funded_trade_proof === true, "Live-test ledger should mark only the funded row as funded proof.", fundedRow);
  assert(json.rows.filter((row) => row.id !== "funded-wallet-trade").every((row) => row.counts_as_funded_trade_proof === false), "Live-test ledger should not count paper/read/rehearsal rows as funded proof.", json.rows);
  record("live-test-ledger", "pass", json.summary || "paper/read/rehearsal evidence is separate from funded proof");
}

async function verifyLiveUsabilitySummary() {
  const { response, json } = await requestJson(`/api/web3-live-usability-summary?${LIVE_QUERY}`);
  assert(response.status === 200, "Live-usability summary should return 200.", { status: response.status, json });
  assert(json.mode === "web3-live-usability-summary", "Live-usability summary should expose the expected mode.", json);
  assert(json.actual_live_trade_tested === false, "Live-usability summary should report no actual funded trade tested yet.", json);
  assert(json.can_trade_real_capital_now === false, "Live-usability summary should keep real-capital trading unusable.", json);
  assert(json.can_run_unattended_now === false, "Live-usability summary should keep unattended trading disabled.", json);
  assert(json.live_execution_permission === "blocked", "Live-usability summary should keep live execution blocked.", json);
  assert(json.wallet_mutation_permission === "blocked", "Live-usability summary should keep wallet mutation blocked.", json);
  assert(json.lanes?.find((lane) => lane.id === "funded-wallet-trade")?.status === "blocked", "Live-usability summary should block the funded wallet lane.", json.lanes);
  assert(json.lanes?.find((lane) => lane.id === "autonomous-real-capital")?.status === "blocked", "Live-usability summary should block autonomous real capital.", json.lanes);
  assert(json.summary.includes("Not usable for funded autonomous trading yet"), "Live-usability summary should answer the usability question directly.", json);
  record("live-usability-summary", "pass", json.next_action || "funded autonomy remains unusable");
}

async function verifyCurrentBlocker() {
  const { response, json } = await requestJson(`/api/web3-live-usability-blockers?${LIVE_QUERY}&rows=all`);
  assert(response.status === 200, "Live-usability blockers should return 200.", { status: response.status, json });
  assert(json.status === "operator-input-needed", "Live-usability blockers should be waiting for operator input.", json);
  assert(json.current_input?.id === "dedicated-trading-wallet", "Current input should be the dedicated public trading wallet.", json.current_input);
  assert(json.current_input?.private_key_storage === "blocked", "Current input should block private-key storage.", json.current_input);
  assert(json.current_input?.seed_phrase_storage === "blocked", "Current input should block seed-phrase storage.", json.current_input);
  assert(json.next_blocker?.href?.includes("#web3-live-canary-console"), "Next blocker should point to the trading live canary console.", json.next_blocker);
  record("current-blocker", "pass", json.next_action || "dedicated public wallet is the current gate");
}

async function main() {
  await verifyHealth();
  await verifyTradingPage();
  await verifyCanaryReceipt();
  await verifyLiveTestLedger();
  await verifyLiveUsabilitySummary();
  await verifyCurrentBlocker();

  const summary = {
    status: "pass",
    base_url: baseUrl,
    actual_live_trade_tested: false,
    funded_trade_attempted_by_this_check: false,
    live_execution_permission: "blocked",
    wallet_mutation_permission: "blocked",
    results,
  };

  if (config.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log("Web3 running-app smoke passed.");
  console.log(`Base URL: ${summary.base_url}`);
  console.log("Actual funded trade tested: no");
  console.log("Funded trade attempted by this check: no");
  console.log("Live execution: blocked");
  console.log("Wallet mutation: blocked");
  for (const result of results) {
    console.log(`- ${result.name}: ${result.status} - ${result.detail}`);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
