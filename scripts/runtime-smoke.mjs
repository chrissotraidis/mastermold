#!/usr/bin/env node
// scripts/runtime-smoke.mjs — repeatable runtime proof for the core product loop.
//
// Starts a dev server against a temp MASTERMOLD_DB and an empty ENGINE_OUT_DIR,
// then asserts the truths that stabilization established:
//   1. /api/health is core-only (no web3_* receipt keys, details_url present);
//   2. adding a manual holding through /api/portfolio flips Portfolio, Today,
//      Settings health, chat, and the daily report to manual-portfolio truth,
//      with no sample holdings left visible.
//
// It needs no credentials, never touches the real .data/ store, and exits
// nonzero with a plain reason when a truth regresses. Network access is only
// used by the daily-report market fetch, which has its own safe fallback.
//
// Usage: node scripts/runtime-smoke.mjs [--port=4031]

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = Number((process.argv.find((arg) => arg.startsWith("--port=")) ?? "--port=4031").split("=")[1]);
const base = `http://127.0.0.1:${port}`;
const dbDir = mkdtempSync(join(tmpdir(), "mm-smoke-db-"));
const engineDir = mkdtempSync(join(tmpdir(), "mm-smoke-engine-"));

const failures = [];
function check(name, ok, detail = "") {
  const label = ok ? "ok " : "FAIL";
  console.log(`[${label}] ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(name);
}

async function fetchJson(path, init) {
  const response = await fetch(`${base}${path}`, init);
  return { status: response.status, body: await response.json() };
}

async function fetchText(path, init) {
  const response = await fetch(`${base}${path}`, init);
  return { status: response.status, body: await response.text() };
}

// bun may not be on PATH (fresh VPS shells often miss ~/.bun/bin) — prefer
// the copy npm install vendors into node_modules/.bin, then known homes.
const bunBin =
  [join(process.cwd(), "node_modules", ".bin", "bun"), join(process.env.HOME ?? "", ".bun", "bin", "bun")].find(
    existsSync,
  ) ?? (spawnSync("bun", ["--version"], { stdio: "ignore" }).error === undefined ? "bun" : null);

if (!bunBin) {
  console.error("bun not found (node_modules/.bin, ~/.bun/bin, PATH) — run npm install first.");
  process.exit(1);
}

const server = spawn(
  bunBin,
  ["run", "--bun", "dev", "-H", "127.0.0.1", "-p", String(port)],
  {
    env: {
      ...process.env,
      MASTERMOLD_DB: join(dbDir, "mastermold.db"),
      AUTOPILOT_DB: join(dbDir, "autopilot.db.json"),
      ENGINE_OUT_DIR: engineDir,
    },
    stdio: "ignore",
    detached: true,
  },
);

let cleaned = false;
function cleanup() {
  if (cleaned) return;
  cleaned = true;
  try {
    if (server.pid) process.kill(-server.pid, "SIGTERM");
    else server.kill("SIGTERM");
  } catch {
    try {
      server.kill("SIGTERM");
    } catch {}
  }
  rmSync(dbDir, { recursive: true, force: true });
  rmSync(engineDir, { recursive: true, force: true });
}

process.on("exit", cleanup);
process.on("SIGINT", () => process.exit(130));

async function waitForServer(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(
    `dev server did not answer on ${base} within ${timeoutMs / 1000}s. ` +
      "Next dev allows one instance per machine — stop any other `next dev` (e.g. the port-4002 app) and rerun.",
  );
}

try {
  await waitForServer();

  // 1. Core health shape.
  const health = await fetchJson("/api/health");
  const healthKeys = Object.keys(health.body);
  check("health responds 200", health.status === 200);
  check(
    "health has core keys only",
    ["status", "service", "checks", "details_url"].every((key) => healthKeys.includes(key)),
    healthKeys.join(","),
  );
  check(
    "health has no web3_* receipt keys",
    healthKeys.every((key) => !key.startsWith("web3_")),
  );
  check("health points at /api/autopilot", health.body.details_url === "/api/autopilot");

  // 2. Manual holding flips every surface to manual truth.
  const added = await fetchJson("/api/portfolio", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      symbol: "AAPL",
      asset_name: "Apple",
      asset_class: "equity",
      venue: "NASDAQ",
      quantity: 4,
      price: 200,
    }),
  });
  check("manual holding accepted", added.status === 200);
  check("portfolio data_state is Manual portfolio", added.body.summary?.data_state === "Manual portfolio");
  check(
    "no sample holdings remain visible",
    Array.isArray(added.body.holdings) && added.body.holdings.every((holding) => holding.source_label === "Manual entry"),
  );
  check("daily review source is Manual holdings", added.body.daily_review?.source_label === "Manual holdings");

  const report = await fetchJson("/api/daily-report", { method: "POST" });
  const reportBody = report.body.report ?? report.body;
  const reportSourceOk = reportBody.portfolio_source === "Manual holdings";
  check("daily report names Manual holdings", reportSourceOk, reportSourceOk ? "" : String(reportBody.portfolio_source ?? report.status));

  const today = await fetchText("/");
  check("Today renders manual portfolio context", today.body.includes("Manual portfolio"));

  const healthSurface = await fetchText("/settings");
  const reviewSourceSnippet = healthSurface.body.match(/Portfolio source.{0,240}/s)?.[0]?.replace(/\s+/g, " ").slice(0, 240) ?? "Portfolio source not found";
  const settingsSourceOk = healthSurface.body.includes("Portfolio source") && healthSurface.body.includes("Manual holdings");
  check(
    "Settings health names the manual portfolio source",
    settingsSourceOk,
    settingsSourceOk ? "" : reviewSourceSnippet,
  );

  const chat = await fetchText("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "what portfolio source is active?" }),
  });
  check("chat says manual entries", /manual entr/i.test(chat.body));
} catch (error) {
  check("smoke run completed", false, error instanceof Error ? error.message : String(error));
}

if (failures.length > 0) {
  console.error(`\nSmoke failed: ${failures.length} check(s) regressed → ${failures.join("; ")}`);
  process.exit(1);
}
console.log("\nSmoke passed: core health and manual-portfolio truth all hold.");
process.exit(0);
