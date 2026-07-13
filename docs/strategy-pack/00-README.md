# Master Mold Strategy Pack

Version 2.0, 2026-07-12. The source pack arrived as a proposal. This tracked repository copy lives at `docs/strategy-pack/`; its implementation and runtime status are maintained in [IMPLEMENTATION-PLAN.md](./IMPLEMENTATION-PLAN.md) and [COMPLETION-AUDIT.md](./COMPLETION-AUDIT.md). Every original code claim in the pack was re-verified against the source tree on 2026-07-12 (file paths, symbol names, line numbers, parameter values, and store schemas).

## For the implementing agent: ingestion protocol

1. Read `MANIFEST.json`. It is the machine-readable index: build order, dependencies, files each spec creates and edits, verify commands.
2. Implement ONE spec per session, in manifest order: 01, 04, 05, 02, 03, 08, 06, 07.
3. Per spec: read the `agent_contract` YAML block at the top, then the full spec, then execute the Implementation checklist in order. The checklists are ordered for a reason (schema before wiring, pure functions before shells, tests with each step, regressions before behavior changes).
4. After every spec: `bun run typecheck`, `bun test tests`, `npm run privacy:audit`. All three must pass before the spec is done.
5. Never touch (the constitution, listed in every spec and the manifest): `AutopilotCaps` defaults, kill-switch logic (`control.ts`), the go-live gate (`gate.ts`), the policy engine's hard checks (`policy.ts`), the `CONSTITUTION` in `params.ts`.
6. Every new strategy runs shadow-first through `evaluateV3Shadow` and the (per-strategy, after Spec 02) promotion gate. No new module gets a paper or live fill path on day one.
7. Keep the pure/IO split: signal math is pure and unit-tested; fetches stay in the daemon shell and `fetch*` helpers. If something cannot be tested without the network, its design is wrong.
8. Where a spec and the code disagree, the code wins; note the discrepancy in your report rather than improvising a bridge.

## Problem

Master Mold paper trades but barely acts and shows no edge. Root causes, in order of impact:

1. The v2 trend-pullback entry is six ANDed gates on time-based sampling (20s ticks, 13-minute window, DexScreener h1/h24). In choppy or quiet markets nothing passes, so the bot generates almost no trades and no learning data. This is the documented failure mode of time-based sampling (Gradzki 2025).
2. The universe is 9 static majors: the assets with the least exploitable inefficiency (Schwertfeger 2026).
3. The paper cost model is flat per-side fees; the v2 edge gate reasons against a 0.6% constant. Measured, per-mint cost data exists (the rehearsal loop) but is stored as free text and consumed by nothing.
4. The v3 alpha-router lane (`CandidateSignal` -> EV gate -> router -> shadow -> promotion) is the right architecture but is shadow-only, its one scorer (xsec) is flagged inverted in `docs/BACKLOG.md`, and its promotion flag is global rather than per-strategy.

## Solution

Three evidence-backed strategy modules on the existing v3 plumbing (CUSUM event engine, Bar Portion overlay/module, Drift short lane), an honest quote-derived cost model, a liquidity-tiered dynamic universe, a replay harness with frozen promotion and demotion criteria, and a measurement-only cross-venue scout. Nothing touches caps, the kill switch, or the go-live gate. Phases: 01+04+05 foundation, 02+03+08 alpha and referee, 06 expansion, 07 ML.

## Sources

| Source | What it contributes | Specs |
|---|---|---|
| Gradzki, Wojcik, Lessmann 2025 (Financial Innovation 11:136) | CUSUM event sampling + triple-barrier exits. ETH +91.6%/yr net of 0.1%/side fees vs -44% buy-and-hold over the same 5 test quarters, Sharpe up to 2.0 in the grid. Dollar bars and next-bar labeling lose money. Full ML pipeline for Phase 3. | 02, 07 |
| Stoikov et al. 2024 (Cornell FEM, SSRN 5066176) | Bar Portion signal BP = (C-O)/(H-L), contrarian, monotonic across 73% of a 30-coin universe. Maker-lane calibrations (spread ~4-5x vol, refresh 3-5 min, cooldown 8-9 min) for a future CLOB lane. | 03, 06 |
| Schwertfeger, Vogt 2026 (J. Banking and Finance 188:107721) | Realized (not backtested) DEX-CEX arb economics: fee-aware minimum-spread formula, 5bp requote rule, size-vs-TVL limits, ~50-65bp real cost stacks. Direct finding: aggregator routing kills intra-Solana pool arb, so the `quote_arb` idea is a dead end. | 05, 06 |
| Deutscher thread (X, 2026) | Process only: backtest before promoting, refine from trade logs. | 08 |
| Polymarket thread (X, paid partnership) | Liquidity-capture-over-prediction mindset; venue out of scope. The rigorous version is the Stoikov maker lane. | 06 appendix |

## File index

| # | File | Phase | Effort | Depends on |
|---|---|---|---|---|
| 01 | 01-diagnosis-and-quick-wins.md | 0 | hours | none |
| 04 | 04-spec-universe-expansion.md | 0 | 1-2 days | none |
| 05 | 05-spec-execution-cost-and-speed.md | 0 | 2 days | 01 |
| 02 | 02-spec-cusum-event-engine.md | 1 | 2-3 days | 01 |
| 03 | 03-spec-bar-portion.md | 1 | 1-2 days | 02 |
| 08 | 08-spec-backtest-and-promotion.md | 1 | 2-3 days | 02, 05 |
| 06 | 06-spec-cross-venue-and-perps.md | 2 | 2 days | 02, 05 |
| 07 | 07-spec-ml-pipeline.md | 3 | 1-2 weeks | 02 + 4 weeks shadow data |

## Cross-cutting corrections baked into v2.0 (agent: these override any earlier draft)

1. Rehearsal cost data exists only as free-text `web3_memory` summaries today; Spec 01 adds the structured `rehearsals` table FIRST, and Spec 05 consumes it.
2. `ExitWatchRow` requires a `trade_id` and has no kind field; Spec 03 uses its own `veto_watches` table instead of reusing exit watches.
3. Store rows are JSON docs over SQLite (`insertRow` id/ts/data): new position/trade fields are TypeScript type changes plus call sites, not SQL migrations.
4. The v3 promotion flag is global today (`store.v3Promotion()`, calibrated over all strategies pooled at `daemon.ts:835`); Spec 02 makes promotion per-strategy, and Specs 06/08 assume that.

## Reality check

Paper results are regime-dependent: Gradzki's profits concentrated in high-volatility episodes and the same pipeline on BTC was marginal (+20.4%, Sharpe 0.51). Stoikov's live test made $1-3/day per $500. Schwertfeger's arb needed dedicated infrastructure and still ate a $4,350 inventory loss. Nothing here guarantees profit. The pack's claim is narrower: these modules generate materially more decisions, measure their own edge honestly, promote only on evidence, and demote automatically when edge disappears. Paper mode stays the default until the promotion and go-live gates say otherwise. Not financial advice; live capital and sizing remain operator decisions.
