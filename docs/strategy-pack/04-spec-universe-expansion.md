# 04. Spec: Liquidity-Tiered Dynamic Universe

```yaml
agent_contract:
  spec: 04-universe-expansion
  goal: Grow the tradable set from 9 static majors to majors + up to 12 auto-rotated liquid tokens, with on-chain decimals resolution.
  creates:
    - src/autopilot/v3/universe-tiers.ts   # pure tier B selection
    - src/autopilot/mint-meta.ts           # decimals resolution + cache (impure fetch, pure parse)
    - tests for both
  edits:
    - path: src/autopilot/store.ts
      change: tier_b and mint_meta tables (JSON doc rows) + methods
    - path: src/autopilot/daemon.ts
      change: tradable set = Tier A + persisted Tier B; tier B mints join the batched price call and feed cache; daily selectTierB run in the existing daily block; exit-only flip for dropped tokens
    - path: src/autopilot/rehearsal.ts, src/autopilot/live-executor.ts, src/autopilot/v3/execution-cost.ts
      change: read decimals through one decimalsFor(mint) helper (static MINT_DECIMALS first, then mint_meta); fail closed on null
    - path: src/autopilot/policy.ts
      change: max_tier_b_positions = 2 soft limit via PolicyContext
  verify:
    - bun run typecheck
    - bun test tests
    - npm run privacy:audit
  done_when: a persisted tier B token is priced, evaluated, and policy-capped in integration tests; all 9 Tier A mints resolve decimals identically to the current hardcoded map
```

## Problem

`UNIVERSE` (`src/autopilot/universe.ts`) is 9 static majors. Consequences: (a) the bot watches assets whose inefficiencies are already arbitraged tight (Schwertfeger 2026: majors' cross-venue spreads rarely exceed 10bp, and aggregators keep intra-Solana pools aligned); (b) Specs 02-03 have the least to work with exactly where the bot looks; (c) adding a token requires editing `UNIVERSE` plus `MINT_DECIMALS` (`rehearsal.ts:24`, imported by `live-executor.ts` and `v3/execution-cost.ts`; a missing entry makes them refuse the mint). The v3 trending radar (`v3/trending.ts`) already discovers tokens but nothing graduates into a tradable set.

## Solution

- Tier A (anchor): the current 9 majors, static, hand-curated. File unchanged.
- Tier B (rotation): up to 12 tokens auto-selected daily from the trending radar by hard floors with hysteresis. Tradable by v2 and v3 (through the EV gate) with tier-scoped caps.
- Tier C (observation): everything else the radar sees; shadow snapshots only, as today.

## Architecture

### Tier B selection (pure, `src/autopilot/v3/universe-tiers.ts`)

Input candidates are `TrendingToken` rows (`v3/trending.ts:23`: `mint, symbol, price_usd, price_change_h1_pct, price_change_h24_pct, volume_h24_usd, liquidity_usd, sources, rank, boost_amount`).

```typescript
export type TierBToken = {
  symbol: string; mint: string;
  liquidity_usd: number; volume_h24_usd: number;
  first_seen_ts: string;
  added_ts: string;
  below_exit_floor_days: number;   // hysteresis counter
};

export type TierBConfig = {
  max_tokens: number;              // 12
  min_liquidity_usd: number;       // 750_000
  min_volume_h24_usd: number;      // 1_000_000
  min_age_days: number;            // 14 (rug/honeypot risk decays with age)
  exit_liquidity_usd: number;      // 500_000
  exit_grace_days: number;         // 3
};

export function selectTierB(
  current: TierBToken[],
  candidates: TrendingToken[],
  denylist: Set<string>,
  cfg: TierBConfig,
  now_ms: number,
): { next: TierBToken[]; added: TierBToken[]; dropped: Array<{ token: TierBToken; reason: string }> };
```

Rules:

- Enter only if ALL floors pass and there is room; rank surplus by `volume_h24_usd * sqrt(liquidity_usd)` (traded-and-deep beats merely-deep).
- Hysteresis: enter at 750k liquidity; drop only after 3 consecutive daily evaluations below 500k. Drop immediately if liquidity < 250k or the token vanishes from the feed (rug signature).
- Hard exclusions: `EXCLUDED_MINTS` (`trending.ts:50`), Tier A mints, the operator denylist (store-backed, dashboard-appendable), and any mint whose decimals did not resolve.
- A dropped token with an open position flips to exit-only (no new entries); the position exits via its own barriers. Never force-liquidate on tier changes.
- Age: track `first_seen_ts` in the store from the radar's first sighting; candidates younger than 14 days are ineligible (the radar has no pair-age field, so first-sighting age is the proxy; note this in code).

### On-chain decimals (`src/autopilot/mint-meta.ts`)

`fetchMintDecimals(mint, rpcUrl)`: `getAccountInfo` (base64) and parse the SPL mint layout (decimals = u8 at byte offset 44), or `getParsedAccountInfo`. Route through the guarded RPC resolution (`src/helius/rpc-url.ts`) so the Helius credit firewall applies. Cache forever in `mint_meta` rows `{mint, symbol, decimals, resolved_at}`.

`decimalsFor(mint): number | null` (pure over provided rows): static `MINT_DECIMALS` first, then `mint_meta`, else null = untradable, fail closed. Refactor the three import sites to use it.

### Consumption

- Daemon: tradable set = Tier A + persisted Tier B. `fetchPrices` (`daemon.ts:494`) already batches arbitrary mints via `extraMints`; add tier B. DexScreener feed fan-out grows by <= 12 mints against the 60s cache; use the multi-token endpoint (comma-separated addresses) if per-mint GETs approach rate limits.
- v2 `decide()` iterates the tradable set instead of `UNIVERSE` (mechanical; gates are per-symbol already). `paperFeeRateFor` (`daemon.ts:925`) keeps classifying non-Tier-A as the memecoin tier until Spec 05 lands quote-derived costs.
- v3 modules get `tier: "A" | "B"` in features so calibration splits edge by tier.
- Tier-scoped risk: tier B entries use `min(caps.max_trade_usd, 15)` notional; new `max_tier_b_positions = 2` in `PolicyContext`, enforced like max_positions. `AutopilotCaps` unchanged.

### Cadence and persistence

Daily `selectTierB` in the existing daily block (near the Analyst trigger); persist tier B; log adds/drops to activity with reasons; `notifyOperator` on changes. Boot loads persisted tier B.

## Constraints

- Tier A stays static and code-defined; automation expands, never edits it.
- Never trade a mint without resolved decimals.
- No SolanaTracker budget impact: selection consumes the radar's keyless sources.

## Implementation checklist (ordered)

1. `universe-tiers.ts` + tests: floors, ranking, hysteresis (oscillating 600-800k liquidity neither enters nor exits), rug drop, exit-only flip, denylist, age gate.
2. `mint-meta.ts` + tests: layout parse against a known mint account fixture; cache hit; fail-closed; regression: all 9 Tier A mints match `MINT_DECIMALS` exactly.
3. Store tables + methods (tier_b, mint_meta, denylist) + tests.
4. `decimalsFor` refactor at the three import sites (behavior identical for Tier A).
5. Daemon integration: price batching, daily selection, boot load, exit-only flip; integration test with a persisted fixture token.
6. Policy: `max_tier_b_positions` + test (third tier B entry rejected).
7. Verify commands.

## Open questions

1. `min_age_days = 14` trades recall for safety. A separate "young token" lane with its own tiny cap is possible later, only after base tiers prove out.
2. Tier B tokens feed the Spec 06 CEX gap scout automatically when listed; the scout's listing probe handles it.
