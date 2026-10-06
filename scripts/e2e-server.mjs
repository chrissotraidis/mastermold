/**
 * Starts the built app for browser tests on port 4012 with every data store in
 * a fresh temp folder, so e2e runs never read or write the operator's .data/.
 * Model keys are blanked: e2e must never spend or call a provider.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Playwright may stop this server before the exit hook runs, so clear earlier runs' folders first.
for (const name of readdirSync(tmpdir())) {
  if (name.startsWith("mm-e2e-")) rmSync(join(tmpdir(), name), { recursive: true, force: true });
}
const dir = mkdtempSync(join(tmpdir(), "mm-e2e-"));
const env = {
  ...process.env,
  HOSTNAME: "127.0.0.1",
  PORT: process.env.E2E_PORT ?? "4012",
  MASTERMOLD_STORE: "json",
  MASTERMOLD_DB: join(dir, "mastermold.db"),
  AUTOPILOT_DB: join(dir, "autopilot.db.json"),
  AUTOPILOT_EXPERIMENT_DB: join(dir, "autopilot-experiments.sqlite"),
  POLYMARKET_DB: join(dir, "polymarket.db.json"),
  POLYMARKET_BRAIN_DB: join(dir, "polymarket-brain.db"),
  POLYMARKET_WEATHER_DB: join(dir, "polymarket-weather.db"),
  ENGINE_OUT_DIR: join(dir, "engine-out"),
  POLYMARKET_ANALYST: "0",
  POLYMARKET_WALLETS: "0",
  POLYMARKET_WALLET_FOLLOW: "0",
  POLYMARKET_EXPLORATION: "0",
  OPENCODE_GO_API_KEY: "",
  OPENROUTER_API_KEY: "",
  ANTHROPIC_API_KEY: "",
  OPENAI_API_KEY: "",
  LLM_API_KEY: "",
  LLM_FALLBACK_API_KEY: "",
  MASTERMOLD_DISABLE_SCHEDULER: "1",
};
console.log(`[e2e] data dir ${dir}`);
const child = spawn("node", ["--experimental-sqlite", "--disable-warning=ExperimentalWarning", ".next/standalone/server.js"], { env, stdio: "inherit" });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => {
  rmSync(dir, { recursive: true, force: true });
  process.exit(code ?? 0);
});
