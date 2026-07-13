# Strategy Pack Completion Audit

Audited against the current worktree and running paper daemon through 2026-07-13. This document separates software completion from empirical evidence that can only accumulate over time. A green test is cited only where it directly exercises the requirement.

## Repository and runtime baseline

| Requirement | Evidence | Status |
|---|---|---|
| Start from latest Mastermold | Fresh `git fetch --prune`; `HEAD...origin/main` is `0 0` at base commit `909b77872f61fee3ba08f706736aad207642c5a8` | Proven |
| Keep Next.js App Router and `/api/health` | Production route manifest contains the App Router pages and `/api/health`; health returns HTTP 200 | Proven |
| Provide an app-visible truth surface | `app/review/page.tsx` reports working, sample/local, credential-gated, and missing capabilities; `/review` returns HTTP 200 | Proven |
| Run locally | Bundled Node 24 dev server listens only on `127.0.0.1:4002`; paper daemon PID and heartbeat are live | Proven |
| Preserve hard safety constitution | `DEFAULT_AUTOPILOT_CAPS` remains 25/50/100/5/20%/0.05 SOL; kill-switch logic, `gate.ts`, policy hard checks, and `CONSTITUTION` are unchanged. Control updates now additionally fail closed against weakening any default cap. | Proven |
| Do not imply live authority | Live wallet is unprovisioned, go-live gate is closed, and API boundary says paper cannot move funds | Proven |

## Spec-by-spec checklist

### 01 — Diagnosis and quick wins

| Checklist item | Direct evidence | Status |
|---|---|---|
| Structured rehearsal rows, ordering, cap | `RehearsalRow` and store methods in `src/autopilot/store.ts`; SQLite regressions in `tests/autopilot-store-sqlite.test.ts` | Complete |
| Daemon rehearsal wiring | `src/autopilot/daemon.ts` appends the structured result while retaining the memory summary | Complete |
| Median/p95 helpers and filtering | `src/autopilot/rehearsal-stats.ts`; quoted-fill self-comparisons are basis-stamped and excluded so structural zeros cannot replace tier fallbacks | Complete |
| Measured cost chain with flat fallback | Pure `DecisionInput` cost injection; daemon and rehearsal-stat regressions cover measured/flat behavior and `cost_source` | Complete |
| Retire xsec from ranking | `enabledModulesFor()` never contains `xsec`; `tests/autopilot-v3-shadow.test.ts` asserts all regimes | Complete |
| Apply atomic parameter changeset | Durable `param_changelog` row contains the exact seven changes and prescribed reason | Complete |

`xsec` still emits skip-only observation rows for calibration. Those rows are not ranked candidates and cannot create an intent; this preserves the pack's instruction to keep the module and calibration path without giving the inverted scorer authority.

### 04 — Liquidity-tiered dynamic universe

| Checklist item | Direct evidence | Status |
|---|---|---|
| Tier B floors, ranking, hysteresis, rug/exit-only/denylist/age behavior | `src/autopilot/v3/universe-tiers.ts`; `tests/autopilot-universe-tiers.test.ts` | Complete |
| On-chain decimals and fail-closed cache | `src/autopilot/mint-meta.ts`; `tests/autopilot-mint-meta.test.ts` verifies known layouts and all nine Tier A mints | Complete |
| Durable Tier B, metadata, denylist state | SQLite/legacy migration coverage in store tests | Complete |
| Shared `decimalsFor` consumers | Rehearsal, execution-cost, and live-executor paths use the static-first resolver | Complete |
| Daemon boot, batching, rotation, exit-only behavior | Daemon integration plus persisted arbitrary-mint fixtures | Complete |
| Two-position Tier B limit | Independent policy rejection test for a third Tier B position; global cap unchanged | Complete |

### 05 — Honest execution costs and requote discipline

| Checklist item | Direct evidence | Status |
|---|---|---|
| Quote-derived component model | `src/autopilot/v3/execution-cost.ts`; exact fixture math and no-double-count assertions in core tests | Complete |
| Quoted paper fills with flat fallback | `src/autopilot/executor.ts`; operating-layer tests assert quoted price, embedded fee, fallback, and `fill_basis` | Complete |
| Strict 5bp/20s requote | Boundary and `requote: edge gone` tests in V3 core and daemon suites | Complete |
| Cost precedence | Modeled → measured → flat regressions in `tests/autopilot-daemon.test.ts` | Complete |
| Latency and drift evidence | Optional ledger timestamps, daily p50/p95 row, and residual-drift alerts in `src/autopilot/execution-telemetry.ts` with direct tests | Complete |
| Two-week optimization claim | No optimization claim is made; timer starts only when timed paper fills exist | Collecting |

### 02 — CUSUM event engine

| Checklist item | Direct evidence | Status |
|---|---|---|
| Symmetric cumulative filter | `src/autopilot/v3/cusum.ts`; accumulation, reset, clamp, invalid-price, and cadence tests in `tests/autopilot-cusum.test.ts` | Complete |
| Exact CUSUM/triple-barrier candidate | `src/autopilot/v3/cusum-tb.ts`; direction, guards, EV, feature, and barrier fixtures | Complete |
| TP/deadline and per-strategy state | Store types/methods plus persistence and promotion tests | Complete |
| Protective exit semantics | Daemon tests prove deadline against positive trend, TP override, and legacy behavior | Complete |
| Event-bypass shadow wiring | Synthetic drift integration writes exactly one `cusum_tb` snapshot | Complete |
| Strategy-isolated calibration/authority | Calibration is direction-adjusted, excludes `drift_perp`, and promotion tests prove xsec rows cannot promote CUSUM | Complete |
| Event-bypass cost reachability | Actionable events request real quotes before falling back; regression proves spot entry and exact held-exit quote shapes | Complete |
| Event-cadence sanity | Synthetic fixture produces 2.0/day, but early live paper evidence was roughly 9.8/day/mint; durable per-event rate monitoring now warns after a six-hour floor without retuning | Collecting, initially high |
| Real market event evidence | Real breaches occurred before the correction; the new durable event ledger starts a truthful fresh observation clock after restart | Collecting |

### 03 — Bar Portion overlay and module

| Checklist item | Direct evidence | Status |
|---|---|---|
| Five-minute bars, BP, ATR, EMA, boundaries | `src/autopilot/v3/bars.ts`; hand-computed and boundary fixtures in `tests/autopilot-bars.test.ts` | Complete |
| Veto watches and 30-minute marks | Store/marking loop plus learning-substrate tests | Complete |
| One-bar entry deferral | Bypass is valid only on the immediate successor bar; a lapsed setup clears stale state and reevaluates | Complete |
| Standalone contrarian candidate | Guard, sign, EV, and falling-knife fixtures in the Bar Portion suite | Complete |
| Shadow registration | Extreme-bar integration writes a `bar_portion` snapshot | Complete |
| Real veto/taken comparison | Requires at least 40 marked vetoes; current real count is below the floor | Collecting |

### 08 — Replay, promotion, and anti-overfit rules

| Checklist item | Direct evidence | Status |
|---|---|---|
| Keyless replay acquisition and parsers | `scripts/fetch-replay-data.ts`; fixture-backed Coinbase/Kraken/GeckoTerminal tests | Complete |
| Deterministic replay and pessimistic ties | Production replay package and golden two-event fixture in `tests/autopilot-replay.test.ts` | Complete |
| Walk-forward schedule enforcement | Future-reference throw test and chronological config hashing | Complete |
| Reports and 2× cost | Report writer always emits base and doubled-cost rows | Complete |
| Frozen promotion/demotion | Seven per-strategy checks, operator-only confirmation, and downside-only demotion boundary tests | Complete |
| Baseline v2 replay | 104,969 Coinbase SOL five-minute bars over roughly 12 months; result is honestly negative and not recorded as promotion evidence | Complete |
| Real module promotion | Requires 150 labels, 40 entries, positive net edge, calibrated EV, positive replay quarters, and operator confirmation | Collecting |

### 06 — Cross-venue scout and Drift short shadow

| Checklist item | Direct evidence | Status |
|---|---|---|
| Bidirectional gap math and graduation boundaries | `src/autopilot/v3/cex-gap.ts`; exact fee/streak/boundary fixtures | Complete |
| Durable observations, completed-week aggregates, and listing cache | Atomic aggregate updates plus raw-rotation graduation and restart persistence tests | Complete |
| Timeout/error-disciplined CEX shells | `src/autopilot/v3/cex-gap-fetch.ts`; 404, batching, parsing, and error fixtures | Complete |
| Detached daemon and Analyst summary | Scout integration and summary activity rows; continues in off/paper without touching the hot path | Complete |
| Funding-adjusted Drift down breach | Candidate, persistence, and paper-co-pilot exclusion tests | Complete |
| Three-week graduation evidence | Real observation archive is growing; no group can graduate before three consecutive weeks | Collecting |

### 07 — ML pipeline

| Checklist item | Direct evidence | Status |
|---|---|---|
| TypeScript/Python CUSUM and barrier parity | Shared fixtures asserted by Bun and pytest | Complete |
| Source-consistent acquisition/cache | `engine/ml/data.py` and cache tests; compliant 1.57M-row Coinbase cache retained locally | Complete |
| Labels, purge, embargo, and no overlap | `engine/ml/events.py` and `labels.py`; `engine/tests/test_ml.py` asserts generated folds have no label-window overlap and honor the two-day embargo | Complete |
| Frozen features and train-only scaling | `engine/ml/features.py`; leakage and constant-feature tests | Complete |
| Residual Conv1d/LSTM training pipeline | Model/train modules plus fixture smoke and nine-member real ensemble | Complete |
| Exact-event inference contract | Daemon retains exact event keys across ticks for up to 60 seconds; a fresh scorer reply attaches once and timeout falls back once to rules | Complete |
| First compliant real training run | Model `1ad7b905809d4a9c` trained on 1,096 days of one-minute SOL data and failed both frozen criteria | Complete, rejected |
| Activation | `APPROVED_MODEL` is absent; result-card and 28-day shadow gates fail closed | Correctly held |

## Adversarial review remediation — 2026-07-13

The external review found nine real implementation defects. All nine were reproduced before repair; none was dismissed because earlier tests were green.

| Finding | Corrective evidence | Status |
|---|---|---|
| Rehearsal slippage self-comparison | Fill basis is persisted; quoted-fill rows cannot enter the fallback slippage estimator | Fixed |
| Newest-first anti-churn pairing | `realizedRoundTrips` sorts a copy chronologically; newest-first and chronological fixtures now agree | Fixed |
| Exposed/weak control plane | Dev/start bind to loopback, POST requires loopback Host plus exact loopback Origin, and all six caps reject weakening beyond defaults | Fixed |
| Tier B symbol collision | Empty/case-insensitive collisions with Tier A or another accepted Tier B symbol are rejected | Fixed |
| CUSUM calibration direction | Spot down returns are sign-adjusted; `drift_perp` synthetic rows are excluded | Fixed |
| CUSUM conservative-cost dead gate | Event bypass obtains executable spot quotes before cached/tier fallback cost | Fixed |
| Stale BP bypass | Only an immediately succeeding closed bar may consume a deferral | Fixed |
| CEX raw-cap graduation dead end | Atomic durable UTC-week aggregates preserve three completed weeks beyond raw rotation | Fixed |
| Same-tick ML lookup | Pending exact event keys survive ticks for the 60-second freshness budget, then resolve exactly once | Fixed |

No finding changed a strategy threshold, promotion criterion, default cap, kill-switch rule, go-live gate, policy hard check, or model approval state.

## Verification ledger

- `bun test tests`: 640 passed, 0 failed, 4,656 assertions across 75 files after the adversarial repairs and migration-race regression.
- `engine/.venv/bin/python -m pytest engine/tests -q`: 32 passed, 2 optional-checkout skips.
- `bun run typecheck`: passed.
- `npm run privacy:audit`: passed across 419 tracked and untracked candidate files.
- `git diff --check`: passed.
- Bundled Node 24 `npm run build`: compiled, typechecked, generated all routes, and passed the release artifact audit. Remaining build warnings are the pre-existing broad dynamic traces in `src/db/scan.ts`.
- `bun run paper:check`: read-only runtime monitor passed against the real lane. It fails nonzero on unhealthy app state, unexpected live mode, default-cap drift, stale daemon/evidence, or recent runtime errors; a deliberate kill switch is warning-only and is never auto-released. It also pairs the ledger into round trips and reports wins, losses, realized P&L, consecutive losses, and the exact anti-churn entry-pause deadline.

## Live evidence state at audit time

- Paper mode began at `2026-07-12T22:43:24.468Z`; kill switch is clear and daemon is live.
- The 13-minute V2 window is warm. All nine Tier A assets are receiving explicit evaluations; the current risk-off tape rejected every entry rather than forcing a trade.
- Price history, five-minute V3 observation rows, and cross-venue observations are advancing.
- The first two V2 paper entries arrived after the tape turned through the frozen gates: WETH at `2026-07-13T00:10:14.449Z` and SOL at `2026-07-13T00:20:25.553Z`, each for $25. Both used fresh quoted fills with the route fee embedded (`fee_usd=0`, `fill_basis="quoted"`), and entry decision-to-fill latency was 65ms/58ms. SOL reached its original 2.1% volatility-scaled hard stop at `2026-07-13T01:59:28.487Z` and exited for $24.4741, realizing -$0.5259. WETH reached its original 1.91% stop at `2026-07-13T03:11:56.837Z` and exited for $24.5060, realizing -$0.4940. Both protective sells closed the full quantities through quoted fills; their decision-to-fill latencies were 137ms/129ms. Post-review correction: newest-first pairing meant the resulting two-loss pause was not enforced at runtime. The ledger happened to contain no buy before its intended `2026-07-13T05:11:56.837Z` deadline; JUP opened at `05:58:37.991Z`. Chronological pairing is now fixed and directly tested. WBTC then opened at `06:46:14.684Z`; two positions were open and UTC-day paper entry spend had reached the unchanged $100/$100 hard ceiling.
- The first Bar Portion overlay veto deferred WETH on a `BP=0.895` full-body up bar and received its one-time 30-minute mark at +93.08bp. The later WETH setup still passed and entered on the next eligible bar. This is one counterfactual sample, not evidence for or against the overlay.
- Six structured quote rehearsals were present at that checkpoint: the WETH/SOL/JUP/WBTC entries and two protective exits. All quoted successfully. Post-review correction: because those rehearsals compared a fresh quote with a just-quoted paper fill, their residual gaps were self-comparisons and are no longer eligible for the slippage estimator. They remain route/latency evidence, while the conservative tier fallback remains authoritative until independent flat-reference samples satisfy the floor.
- The labeling pass waits until a snapshot is six hours old, then atomically backfills its 30-minute, 2-hour, and 6-hour marks from persisted price history. At the `2026-07-13T05:05Z` checkpoint, the first five real rows had resolved: all were pre-existing `xsec` skip observations (JTO, PYTH, WBTC, JTO, and RAY), with non-null returns and two-hour excursions. They prove the delayed-label pipeline is operating, but `xsec` is observation-only and its rows cannot contribute to CUSUM or Bar Portion promotion. Those promotion and ML clocks remain closed until their own full evidence floors are met.
- The corrected processes restarted without changing paper state, caps, positions, or model approval. A first-start consistency check caught one 34-row CEX batch between the raw backfill snapshot and durable totals; a versioned monotonic reconciliation now raises retained-week totals once and can never lower older durable history after raw rotation. At the final `2026-07-13T09:43Z` checkpoint, raw and durable CEX totals both equaled 5,064 and `bun run paper:check` returned `status: ok`: 410 candidate snapshots, 142 labeled snapshots, two open positions, six trades, no recent errors/halts, and unchanged realized P&L of -$1.0199. `lsof` showed only `127.0.0.1:4002`; a control POST without `Origin` returned HTTP 403.
- At the `2026-07-13T14:22Z` material checkpoint, the seventh fill completed the third round trip and reduced the open book from two positions to one. All three completed round trips were losses; realized P&L declined to `-$1.2234`, and the frozen consecutive-loss guard paused new entries until `2026-07-13T16:01:30.426Z`. `bun run paper:check` still returned `status: ok` with a live paper daemon, default caps, 517 candidates, 323 labels, 6,832 CEX-gap observations, and no errors, halts, failures, or warnings. This result does not satisfy or relax any promotion gate.
- At the `2026-07-13T15:22Z` material checkpoint, the eighth fill profitably closed the last open position. The aggregate moved to four completed round trips—one win and three losses—with realized P&L of `+$0.2438`, zero open positions, and no active consecutive-loss pause. `bun run paper:check` remained `status: ok` with default caps, 576 candidates, 376 labels, 7,240 CEX-gap observations, and no errors, halts, failures, or warnings. This tiny sample remains collecting state and does not meet any strategy-promotion, live-candidate, or profitability criterion.
- At `2026-07-13T16:52Z`, the monitor truthfully failed because the local app and daemon were offline and all primary evidence feeds were stale. The processes were restarted without changing paper state, caps, credentials, approvals, or strategy parameters. At `16:54Z`, `/api/health`, the daemon heartbeat, price history, label backfill, and CEX observations were current again; the book remained flat at four round trips and `+$0.2438`. Candidate freshness briefly stayed failed because the outage was outside the 20-minute safe warm-start cutoff, so stale bars were not ingested. A fresh candidate arrived at `16:54:37Z`, and the `16:58Z` follow-up returned `status: ok` with no errors, halts, failures, or warnings. This was an operational evidence interruption, not a reason to relax the freshness boundary.

## Ongoing evidence lifecycle

The software delivery goal is complete. Empirical collection continues through the armed paper daemon, `bun run paper:check`, and the task-attached 30-minute heartbeat: real CUSUM events, Bar Portion vetoes, resolved forward labels, timed fills, three cross-venue weeks, four paper weeks, positive walk-forward replay evidence, and an independently passing ML model. These are operational promotion gates, not unfinished implementation. None may be shortened or marked passing merely to create activity.

The final completion audit re-fetched upstream (`HEAD...origin/main = 0/0` at the implementation base), verified every manifest artifact, received HTTP 200 from `/api/health`, `/api/autopilot`, and `/review`, and received `status: ok` from the real paper monitor after the final production rebuild.
