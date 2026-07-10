/**
 * In-app daily scheduler. macOS TCC blocks launchd agents from executing under
 * ~/Documents, so OS-level scheduling silently fails on the laptop; scheduling
 * inside the web service works everywhere the app runs (dev, standalone, Zo).
 *
 * Every few minutes: if it is past the morning-run time and no daily report is
 * saved for today, run the market scan then the daily report — the same chain
 * as bin/daily-run, called in-process. Failures log and retry on a later check
 * (runMarketScan single-flights, and the report row is idempotent per day).
 */

const CHECK_EVERY_MS = 5 * 60 * 1000;
// The morning read fires after this LOCAL time. On a UTC-clocked VPS, set
// MASTERMOLD_READ_AFTER (e.g. "12:15" for 7:15 ET) instead of changing the
// system timezone. Malformed values fall back to the 7:15 default.
const [RUN_AFTER_HOUR, RUN_AFTER_MINUTE] = parseRunAfter(process.env.MASTERMOLD_READ_AFTER);

function parseRunAfter(raw: string | undefined): [number, number] {
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw?.trim() ?? "");
  if (match) {
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) return [hour, minute];
  }
  return [7, 15];
}

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.MASTERMOLD_DISABLE_SCHEDULER === "1") return;

  const globalScope = globalThis as { __mastermoldDailyScheduler?: boolean };
  if (globalScope.__mastermoldDailyScheduler) return; // HMR / double-register guard
  globalScope.__mastermoldDailyScheduler = true;

  console.log(
    `[mastermold] in-app scheduler armed: morning read after ${RUN_AFTER_HOUR}:${String(RUN_AFTER_MINUTE).padStart(2, "0")} local, checks every ${CHECK_EVERY_MS / 60000}m`,
  );

  let running = false;

  const check = async () => {
    if (running) return;
    const now = new Date();
    if (now.getHours() < RUN_AFTER_HOUR || (now.getHours() === RUN_AFTER_HOUR && now.getMinutes() < RUN_AFTER_MINUTE)) {
      return;
    }

    try {
      const { getLatestDailyReport, runDailyReportRefresh } = await import("@/src/db/daily-report");
      const today = now.toISOString().slice(0, 10);
      if (getLatestDailyReport()?.run_date === today) return;

      running = true;
      const { runMarketScan, scanRunnerAvailable } = await import("@/src/db/scan");
      console.log(`[mastermold] in-app scheduler: running the ${today} morning read`);
      if (scanRunnerAvailable()) {
        await runMarketScan({ trigger: "scheduled" });
      }
      const report = await runDailyReportRefresh();
      console.log(`[mastermold] in-app scheduler: ${report.ok ? "daily report saved" : `report failed: ${report.detail}`}`);
    } catch (error) {
      console.error("[mastermold] in-app scheduler check failed:", error);
    } finally {
      running = false;
    }
  };

  setInterval(() => void check(), CHECK_EVERY_MS);
  // One immediate check so a server booted after 07:15 still gets its read.
  setTimeout(() => void check(), 15_000);
}
