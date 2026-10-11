# Strategy decision — September 2026

Status: **research merged; shadow-only build list adopted; no trading authority added.**
Date: 2026-09-26. Inputs: four parallel research memos in this folder, plus the repo's own August evidence
([RESEARCH-DECISION-2026-08](../RESEARCH-DECISION-2026-08.md), [STRATEGY-REVIEW-2026-08](../STRATEGY-REVIEW-2026-08.md),
[analyst-lane](../analyst-lane.md), [POLYMARKET-WALLET-EVIDENCE](../POLYMARKET-WALLET-EVIDENCE.md)).

| Memo | Question |
|---|---|
| [polymarket-market-structure.md](polymarket-market-structure.md) | Can a small participant earn from rebates, liquidity rewards, parity and neg-risk baskets? |
| [polymarket-wallet-and-resolution-edges.md](polymarket-wallet-and-resolution-edges.md) | Does copying profitable wallets work, and what would prove it? |
| [llm-forecasting.md](llm-forecasting.md) | Can an LLM beat the market price, and why did the :online analyst lose? |
| [solana-web3-bots.md](solana-web3-bots.md) | What actually earns on Solana for a retail bot, and what to do with the v3 lane? |

Each memo was corrected after its agent reported unverified numbers; claims that could not be re-verified were removed or marked as reasoning.

## The honest summary

Nothing Master Mold has tried so far has shown a profit, and the published evidence says why: on Polymarket
roughly 70% of wallets lose and the top 1% take about three quarters of profits, mostly by providing liquidity
with limit orders rather than by predicting better. On Solana the reliable winners control transaction ordering;
a retail bot pays those costs. The best published LLM forecasters approach a forecasting crowd but none has been
shown to beat a liquid real-money market after fees.

So the next generation of the labs stops looking for a clever price signal and instead measures the few edges
that do not require being smarter than the market, with accounting pessimistic enough that a pass means something.

## Cross-cutting fixes (do first)

1. **Polymarket fee truth.** Both Polymarket memos independently found that the repo treats Gamma's `takerBaseFee`
   as the fee rate. It is not: every fee-enabled market carries `takerBaseFee=1000`, including fee-free NFL markets.
   The documented taker fee is `shares × rate × p × (1 − p)` from each market's `feeSchedule`. The wallet follow-arm
   currently overstates fees about 4× at 50¢, and `markets.ts` flags fee-free markets as fee markets.
2. **Pre-registered gates everywhere.** Every experiment below states its sample size and pass/fail rule before it
   collects data, splits by event/match/day clusters, and reports a lower confidence bound, never a point estimate.

## Polymarket lab — build (shadow only)

| # | Experiment | Why it survives the evidence | Gate (pre-registered) |
|---|---|---|---|
| P1 | Fee truth (above) | Every other number depends on it | All fees come from `feeSchedule`; unknown stays unknown |
| P2 | Liquidity-reward shadow maker | The only structural income paid without a fill; testable from public data | ≥14 UTC days, ≥20 markets, lower bound of reward − markout − unwind fees > 0, not driven by 1–2 markets |
| P3 | Neg-risk basket monitor | Multi-outcome mispricing is the second structural question; cheap to observe | ≥10 episodes/week net ≥ $2 at ≥20 shares persisting longer than measured latency, 4 weeks |
| P4 | Binary parity, fee-inclusive | Falsification control; expected to fail | Same as P3 |
| P5 | Wallet follow-arm v2: frozen cohort + no-signal control arm + closing-price value | The one positive lead, but it cannot currently separate wallet skill from a price-band effect | ≥300 resolved markets, ≥6 weekends, ≥3 leagues; follow − control lower bound > 0; survives removing the top two wallets |
| P6 | Analyst shrinkage fit on the 779 graded rows | Zero inference cost; tells us whether the model adds anything at all | Held-out news weight `w` with an interval excluding 0, else stop the analyst lane |
| P7 | Weather forecast-revision lag (added 2026-10-11, [spec](../P7-FORECAST-REVISION.md)) | Tests a timing edge, not a better forecast: the market prices the forecast well, but may lag a new model run | ≥150 graded signal fills, ≥20 stations, ≥14 UTC days; day-clustered lower bound of signal − matched control > 0 after fees; positive without the top two stations |

**Skip:** autonomous maker/rebate farming, in-play sports and 5/15-minute crypto, "Other" placeholder outcomes,
taker-rebate tier chasing, post-game "arbs", longshot buying, a blanket buy-favorites rule, news-latency sniping,
copying leaderboard/bot wallets, re-enabling OpenRouter `:online`, premium models or fine-tuning before P6.

## Web3 lab — build (shadow only)

| # | Experiment | Gate |
|---|---|---|
| W1 | Keep `cusum_tb`, but re-score it on the traded 24h barrier outcome net of cost (its +61bp was 2h pre-cost on 63 labels) | ≥150 new labels, net mean > +20bp with a 90% interval above zero, clustered by day and mint |
| W2 | Replace the funding-only carry book with a two-leg spot+perp ledger with margin and liquidation stress | 8 weeks, positive net in the stressed case, no simulated liquidation |
| W3 | Execution-cost truth sampler (priority fees, Jito tips, failure rate) | If measured cost > 25% of a strategy's modeled gross edge, recompute its EV before it continues |
| W4 | Forward-only copy-wallet test with the hard-coded 90bp prior removed | ≥100 graded copies from ≥10 wallets, net mean > 0 with interval above zero |

**Retire:** `xsec` and `trending` (both inverted), `bar_portion` (flat). **Skip:** MEV/sandwiching, memecoin sniping,
concentrated-liquidity LP bots, ML gating on 63 labels, faster execution for signals without edge.

## Boundaries that do not change

Paper trading stays off, live execution stays locked, experiments stay paused. Nothing in this decision arms a
lane; it defines what would have to be measured, and passed, before anyone asks. Legal and geographic eligibility
for any real-money use needs separate human review.
