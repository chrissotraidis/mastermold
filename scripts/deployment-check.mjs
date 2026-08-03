#!/usr/bin/env node
// Read-only acceptance check for a running Master Mold deployment.
// It never mutates app state and treats service health separately from
// decision readiness. Use --expect-auth only against the external HTTPS URL.

const urlArg = process.argv.find((arg) => arg.startsWith("--url="));
const base = (urlArg?.slice("--url=".length) || process.env.MASTERMOLD_URL || "http://127.0.0.1:4002").replace(/\/$/, "");
const expectAuth = process.argv.includes("--expect-auth");
const username = process.env.MASTERMOLD_CHECK_USERNAME || (process.env.MASTERMOLD_VIEWER_PASSWORD ? "viewer" : "");
const password = process.env.MASTERMOLD_CHECK_PASSWORD || process.env.MASTERMOLD_VIEWER_PASSWORD || "";
const authorization = username && password
  ? `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`
  : null;

const failures = [];
const warnings = [];

function result(kind, label, detail = "") {
  console.log(`[${kind}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (kind === "FAIL") failures.push(label);
  if (kind === "WARN") warnings.push(label);
}

async function request(path, authenticated = true) {
  const headers = new Headers();
  if (authenticated && authorization) headers.set("authorization", authorization);
  return fetch(`${base}${path}`, { headers, redirect: "manual", signal: AbortSignal.timeout(10_000) });
}

try {
  if (expectAuth) {
    const anonymous = await request("/api/health", false);
    result(anonymous.status === 401 ? "OK" : "FAIL", "external anonymous access is challenged", `HTTP ${anonymous.status}`);
  }

  const healthResponse = await request("/api/health");
  const health = await healthResponse.json().catch(() => null);
  result(healthResponse.status === 200 ? "OK" : "FAIL", "health endpoint responds", `HTTP ${healthResponse.status}`);
  result(health?.status === "ok" ? "OK" : "FAIL", "core stores are operational", String(health?.status ?? "invalid response"));
  result(health?.checks?.database?.status === "ok" ? "OK" : "FAIL", "application database is readable", String(health?.checks?.database?.status ?? "missing"));
  result(health?.checks?.autopilot?.status !== "error" ? "OK" : "FAIL", "Web3 research store is readable", String(health?.checks?.autopilot?.status ?? "missing"));
  result(health?.checks?.polymarket?.status !== "error" ? "OK" : "FAIL", "Polymarket research store is readable", String(health?.checks?.polymarket?.status ?? "missing"));

  const dailyStatus = health?.checks?.daily_report?.status;
  result(dailyStatus === "fresh" ? "OK" : "WARN", "daily decision read is fresh", String(dailyStatus ?? "missing"));
  const backupStatus = health?.checks?.backup?.status;
  result(backupStatus === "fresh" ? "OK" : "WARN", "local backup is fresh", String(backupStatus ?? "missing"));
  const readiness = health?.readiness;
  result(readiness?.decision_support === "ready" ? "OK" : "WARN", "decision support readiness", `${readiness?.decision_support ?? "missing"}${readiness?.reasons?.length ? `: ${readiness.reasons.join(" ")}` : ""}`);
  result(readiness?.live_trading === "locked" ? "OK" : "FAIL", "live trading remains locked", String(readiness?.live_trading ?? "missing"));

  for (const path of ["/", "/portfolio", "/journal", "/settings", "/review", "/api/evaluation/forward-proof"]) {
    const response = await request(path);
    result(response.status === 200 ? "OK" : "FAIL", `${path} is reachable`, `HTTP ${response.status}`);
  }
} catch (error) {
  result("FAIL", "deployment check completed", error instanceof Error ? error.message : String(error));
}

console.log(`\nDeployment check: ${failures.length} failure(s), ${warnings.length} readiness warning(s).`);
if (warnings.length) console.log("Warnings are not service failures; resolve them before relying on personal decision support.");
process.exit(failures.length ? 1 : 0);
