/// <reference types="node" />

/**
 * The daily heartbeat: run the Python engine's staged funnel from the app.
 *
 * `POST /api/scan` (or a scheduler hitting the same path — a Zo Automation, cron,
 * or launchd job can also just run `bin/engine-briefing`) spawns the engine,
 * which fetches market data, screens the watchlist, runs paid agent analysis
 * only for triggered tickers, and writes a dated JSON bundle. The app then
 * ingests the bundle, settles due paper rounds, and refreshes the chat-context
 * snapshot. Every attempt — including failures — is recorded and visible, so a
 * scan that did not happen never silently leaves stale advice on screen.
 *
 * Advisory-only invariant: the engine reads market data and writes JSON. There
 * is no brokerage, wallet, or order path anywhere in this flow.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ageLabel, engineOutDir, getEngineStatus, ingestNewestEngineRun } from "./engine-data";
import { initializeMarketBrain } from "./brain";
import { resolveDueRounds } from "./paper-lifecycle";
import { recordProductMetric } from "./metrics";
import { store } from "./store";

const SCAN_TIMEOUT_MS = 6 * 60 * 1000;

export type ScanAttempt = {
  id: string;
  trigger: string;
  started_at: string;
  finished_at: string | null;
  status: "running" | "ok" | "failed";
  detail: string;
  run_date: string | null;
  usd: number | null;
};

export type ScanRunResult =
  | {
      ok: true;
      run_date: string;
      usd: number;
      triggered: number;
      cards: number;
      alerts: number;
      detail: string;
    }
  | { ok: false; detail: string };

let inFlight: Promise<ScanRunResult> | null = null;

/** True when this machine can run the engine at all (venv or uv present). */
export function scanRunnerAvailable(): boolean {
  const root = process.cwd();
  return (
    existsSync(join(root, "engine", ".venv", "bin", "python")) ||
    existsSync(join(root, "bin", "engine-briefing"))
  );
}

export function isScanRunning(): boolean {
  return inFlight !== null;
}

/** Run today's market scan. Concurrent calls share the same run. */
export function runMarketScan(input: { trigger?: string } = {}): Promise<ScanRunResult> {
  if (inFlight) return inFlight;
  inFlight = executeScan(input.trigger ?? "manual").finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function executeScan(trigger: string): Promise<ScanRunResult> {
  const startedAt = new Date().toISOString();
  const runDate = startedAt.slice(0, 10);
  const attemptId = `scan_${Date.now().toString(36)}`;

  recordAttempt({ id: attemptId, trigger, started_at: startedAt, status: "running", detail: "Scan started.", run_date: runDate, usd: null, finished_at: null });

  const engine = await spawnEngine(runDate);
  const finishedAt = new Date().toISOString();

  if (!engine.ok) {
    recordAttempt({
      id: attemptId,
      trigger,
      started_at: startedAt,
      finished_at: finishedAt,
      status: "failed",
      detail: engine.detail,
      run_date: runDate,
      usd: null,
    });
    return { ok: false, detail: engine.detail };
  }

  // Ingest the fresh bundle and settle everything that depends on it.
  ingestNewestEngineRun();
  resolveDueRounds();
  try {
    await initializeMarketBrain();
  } catch {
    // Chat-context refresh is best-effort; the scan itself succeeded.
  }

  const status = getEngineStatus();
  const bundle = status.state === "live" ? status.bundle : null;
  const usd = bundle?.run.cost.usd ?? 0;
  const detail = bundle
    ? `Scan finished: ${bundle.briefing_cards.length} idea(s), ${bundle.alerts.length} alert(s), ${bundle.run.triggered_tickers.length} ticker(s) analyzed, $${usd.toFixed(usd > 0 && usd < 0.01 ? 4 : 2)}.`
    : "Scan finished but no bundle was readable.";

  recordAttempt({
    id: attemptId,
    trigger,
    started_at: startedAt,
    finished_at: finishedAt,
    status: bundle ? "ok" : "failed",
    detail,
    run_date: bundle?.run.run_date ?? runDate,
    usd: bundle ? usd : null,
  });

  if (!bundle) return { ok: false, detail };
  return {
    ok: true,
    run_date: bundle.run.run_date,
    usd,
    triggered: bundle.run.triggered_tickers.length,
    cards: bundle.briefing_cards.length,
    alerts: bundle.alerts.length,
    detail,
  };
}

function spawnEngine(runDate: string): Promise<{ ok: true } | { ok: false; detail: string }> {
  const root = process.cwd();
  const venvPython = join(root, "engine", ".venv", "bin", "python");
  const useVenv = existsSync(venvPython);
  const command = useVenv ? venvPython : join(root, "bin", "engine-briefing");
  const args = useVenv
    ? ["-m", "mastermold_engine.run_briefing", "--date", runDate]
    : ["--date", runDate];

  if (!existsSync(command)) {
    return Promise.resolve({
      ok: false,
      detail:
        "Engine is not set up on this machine (engine/.venv missing). See engine/README.md — the app keeps working on the last saved read.",
    });
  }

  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: join(root, "engine"),
      env: {
        ...process.env,
        ENGINE_OUT_DIR: engineOutDir(),
        // Default to the direct synthesis path for interactive scans: the full
        // TradingAgents graph can stall on un-timeboxed data fetches. Set
        // MASTERMOLD_ENGINE_ADAPTER=auto in the environment to re-enable it.
        MASTERMOLD_ENGINE_ADAPTER: process.env.MASTERMOLD_ENGINE_ADAPTER ?? "direct",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderrTail = "";
    let stdoutTail = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-600);
    });
    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutTail = (stdoutTail + chunk.toString()).slice(-600);
    });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ ok: false, detail: "Scan timed out after 6 minutes and was stopped." });
    }, SCAN_TIMEOUT_MS);

    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, detail: `Scan could not start: ${error.message}` });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ ok: true });
      else
        resolve({
          ok: false,
          detail: `Scan exited with code ${code}. ${lastLine(stderrTail) || lastLine(stdoutTail) || "No output captured."}`,
        });
    });
  });
}

function lastLine(text: string): string {
  return (
    text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .pop() ?? ""
  );
}

function recordAttempt(attempt: ScanAttempt) {
  recordProductMetric({
    event: "scan_attempt",
    surface: "today",
    entity_id: attempt.id,
    value: attempt.status === "ok" ? 1 : 0,
    metadata: { ...attempt },
  });
}

/** Recent scan attempts (newest first), including failures, for honest run history. */
export function getScanAttempts(limit = 10): ScanAttempt[] {
  const seen = new Map<string, ScanAttempt>();
  for (const event of store().productEvents(200)) {
    if (event.event !== "scan_attempt") continue;
    const meta = event.metadata as Partial<ScanAttempt> | null;
    if (!meta || typeof meta !== "object" || typeof meta.id !== "string") continue;
    // productEvents is newest-first; keep the latest record per attempt id.
    if (!seen.has(meta.id)) {
      seen.set(meta.id, {
        id: meta.id,
        trigger: meta.trigger ?? "manual",
        started_at: meta.started_at ?? event.created_at,
        finished_at: meta.finished_at ?? null,
        status: meta.status === "ok" || meta.status === "failed" ? meta.status : "running",
        detail: meta.detail ?? "",
        run_date: meta.run_date ?? null,
        usd: typeof meta.usd === "number" ? meta.usd : null,
      });
    }
    if (seen.size >= limit) break;
  }
  return [...seen.values()];
}

/** One-line scan status for headers: last attempt + read age. */
export function getScanStatusLine(): string {
  const status = getEngineStatus();
  const lastAttempt = getScanAttempts(1)[0] ?? null;
  if (status.state === "live") {
    const age = ageLabel(status.ageHours);
    if (lastAttempt?.status === "failed") {
      return `Last scan attempt failed; showing the read from ${age}.`;
    }
    return `Market read from ${age}.`;
  }
  if (lastAttempt?.status === "failed") return "Last scan attempt failed; showing sample data.";
  return "No market scan saved yet.";
}
