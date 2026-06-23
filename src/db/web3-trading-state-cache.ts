import {
  getWeb3TradingStateAsync,
  type TradingAccountMode,
  type TradingMarketSource,
  type TradingScenario,
  type Web3TradingState,
} from "@/src/db/web3-trading";

export type CachedWeb3TradingStateInput = {
  account: TradingAccountMode;
  source: TradingMarketSource;
  scenario: TradingScenario;
  cycles?: number;
};

const DEFAULT_TTL_MS = 30_000;
const DEFAULT_STALE_TTL_MS = 120_000;
const WARM_DELAY_MS = 450;

const web3TradingStateCache = new Map<
  string,
  {
    freshUntil: number;
    staleUntil: number;
    promise: Promise<Web3TradingState>;
    value?: Web3TradingState;
  }
>();
const pendingWarmTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function getCachedWeb3TradingState(
  input: CachedWeb3TradingStateInput,
  ttlMs = DEFAULT_TTL_MS,
  staleTtlMs = DEFAULT_STALE_TTL_MS,
) {
  if (isTestRuntime()) {
    return getWeb3TradingStateAsync(input);
  }

  const key = web3TradingStateCacheKey(input);
  const now = Date.now();
  const cached = web3TradingStateCache.get(key);

  if (cached && cached.freshUntil > now) {
    return cached.promise;
  }

  if (cached?.value && cached.staleUntil > now) {
    refreshCachedWeb3TradingStateInBackground(key, input, ttlMs, staleTtlMs, cached.value);
    return Promise.resolve(cached.value);
  }

  return refreshCachedWeb3TradingState(key, input, ttlMs, staleTtlMs, cached?.value);
}

export function peekCachedWeb3TradingState(input: CachedWeb3TradingStateInput) {
  if (isTestRuntime()) return null;

  const cached = web3TradingStateCache.get(web3TradingStateCacheKey(input));
  if (!cached?.value || cached.staleUntil <= Date.now()) return null;

  return cached.value;
}

export function warmCachedWeb3TradingState(
  input: CachedWeb3TradingStateInput,
  ttlMs = DEFAULT_TTL_MS,
  staleTtlMs = DEFAULT_STALE_TTL_MS,
) {
  if (isTestRuntime()) return;

  const key = web3TradingStateCacheKey(input);
  const cached = web3TradingStateCache.get(key);
  if (cached && cached.freshUntil > Date.now()) return;
  if (!cached?.value) return;
  if (pendingWarmTimers.has(key)) return;

  const timer = setTimeout(() => {
    pendingWarmTimers.delete(key);
    void getCachedWeb3TradingState(input, ttlMs, staleTtlMs).catch(() => {});
  }, WARM_DELAY_MS);
  pendingWarmTimers.set(key, timer);
  timer.unref?.();
}

export function clearCachedWeb3TradingState(input?: CachedWeb3TradingStateInput) {
  if (!input) {
    web3TradingStateCache.clear();
    for (const timer of pendingWarmTimers.values()) clearTimeout(timer);
    pendingWarmTimers.clear();
    return;
  }

  const key = web3TradingStateCacheKey(input);
  web3TradingStateCache.delete(key);
  const timer = pendingWarmTimers.get(key);
  if (timer) clearTimeout(timer);
  pendingWarmTimers.delete(key);
}

function web3TradingStateCacheKey({ account, source, scenario, cycles = 0 }: CachedWeb3TradingStateInput) {
  return `${account}:${source}:${scenario}:${cycles}`;
}

function isTestRuntime() {
  return process.env.NODE_ENV === "test" || process.env.npm_lifecycle_event === "test";
}

function refreshCachedWeb3TradingState(
  key: string,
  input: CachedWeb3TradingStateInput,
  ttlMs: number,
  staleTtlMs: number,
  staleValue?: Web3TradingState,
) {
  const now = Date.now();
  const promise = getWeb3TradingStateAsync(input)
    .then((value) => {
      web3TradingStateCache.set(key, {
        freshUntil: Date.now() + ttlMs,
        staleUntil: Date.now() + staleTtlMs,
        promise: Promise.resolve(value),
        value,
      });
      return value;
    })
    .catch((error) => {
      if (staleValue) {
        web3TradingStateCache.set(key, {
          freshUntil: Date.now() + Math.min(ttlMs, 5_000),
          staleUntil: Date.now() + staleTtlMs,
          promise: Promise.resolve(staleValue),
          value: staleValue,
        });
      } else {
        web3TradingStateCache.delete(key);
      }
      throw error;
    });

  web3TradingStateCache.set(key, {
    freshUntil: now + ttlMs,
    staleUntil: now + staleTtlMs,
    promise,
    value: staleValue,
  });

  return promise;
}

function refreshCachedWeb3TradingStateInBackground(
  key: string,
  input: CachedWeb3TradingStateInput,
  ttlMs: number,
  staleTtlMs: number,
  staleValue: Web3TradingState,
) {
  const now = Date.now();
  web3TradingStateCache.set(key, {
    freshUntil: now + Math.min(ttlMs, 5_000),
    staleUntil: now + staleTtlMs,
    promise: Promise.resolve(staleValue),
    value: staleValue,
  });

  void getWeb3TradingStateAsync(input)
    .then((value) => {
      web3TradingStateCache.set(key, {
        freshUntil: Date.now() + ttlMs,
        staleUntil: Date.now() + staleTtlMs,
        promise: Promise.resolve(value),
        value,
      });
    })
    .catch(() => {
      web3TradingStateCache.set(key, {
        freshUntil: Date.now() + Math.min(ttlMs, 5_000),
        staleUntil: Date.now() + staleTtlMs,
        promise: Promise.resolve(staleValue),
        value: staleValue,
      });
    });
}
