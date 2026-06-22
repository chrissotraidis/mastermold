import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_STALE_MS = 15 * 60 * 1000;
const POLL_MS = 500;

export async function withWeb3StateMutationLock(label, run, options = {}) {
  if (process.env.WEB3_STATE_LOCK_DISABLED === "1") return run();
  const lockDir = options.lockDir ?? join(process.cwd(), "data", ".web3-state-mutation.lock");
  const timeoutMs = positiveInteger(process.env.WEB3_STATE_LOCK_TIMEOUT_MS, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const staleMs = positiveInteger(process.env.WEB3_STATE_LOCK_STALE_MS, options.staleMs ?? DEFAULT_STALE_MS);
  const startedAt = Date.now();
  await acquireLock(lockDir, label, startedAt, timeoutMs, staleMs);
  try {
    return await run();
  } finally {
    await rm(lockDir, { recursive: true, force: true });
  }
}

async function acquireLock(lockDir, label, startedAt, timeoutMs, staleMs) {
  for (;;) {
    try {
      await mkdir(lockDir);
      await writeFile(join(lockDir, "owner.json"), JSON.stringify({
        label,
        pid: process.pid,
        acquired_at: new Date().toISOString(),
      }, null, 2));
      return;
    } catch (error) {
      if (!error || error.code !== "EEXIST") throw error;
      if (await removeStaleLock(lockDir, staleMs)) continue;
      if (Date.now() - startedAt >= timeoutMs) {
        const owner = await readLockOwner(lockDir);
        throw new Error(`Timed out waiting for Web3 state mutation lock held by ${owner}. Run one Web3 verifier/smoke command at a time, or remove ${lockDir} if the holder is gone.`);
      }
      await sleep(POLL_MS);
    }
  }
}

async function removeStaleLock(lockDir, staleMs) {
  try {
    const info = await stat(lockDir);
    if (Date.now() - info.mtimeMs < staleMs) return false;
    await rm(lockDir, { recursive: true, force: true });
    return true;
  } catch (error) {
    if (error && error.code === "ENOENT") return true;
    throw error;
  }
}

async function readLockOwner(lockDir) {
  try {
    const text = await readFile(join(lockDir, "owner.json"), "utf8");
    const owner = JSON.parse(text);
    return `${owner.label ?? "unknown"} pid ${owner.pid ?? "unknown"} since ${owner.acquired_at ?? "unknown"}`;
  } catch {
    return `unknown holder at ${lockDir}`;
  }
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
