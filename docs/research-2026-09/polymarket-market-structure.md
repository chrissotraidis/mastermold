# Polymarket market structure: what a small participant can actually earn

Status: research memo, shadow-only recommendations. Date: 2026-09-26. No trading authority is added or implied.

## 1. Question and answer

**Question.** Can a small retail/VPS participant earn money from Polymarket's structure itself (maker rebates, liquidity rewards, spread capture, YES+NO parity, negative-risk basket conversion, and fee-free versus fee-bearing markets), and which shadow experiments are worth running?

**Answer.** Probably not much. Maker rebates are worth less than one price tick per share even in the best case. Real single-market arbitrage is rare, lasts seconds, and has little depth. The one structural income source that pays for resting orders without a fill is **liquidity rewards**, and it only makes money if the reward share beats the adverse selection taken on fills. That can be measured in shadow from public data. Negative-risk basket mispricing is the second question worth a cheap monitor. Master Mold also has a **fee-model defect** to fix before any other P&L numbers are trusted, because it treats `takerBaseFee` as the fee rate.

## 2. What the evidence says

**Fees (current docs).** Taker fee = `C × feeRate × p × (1 − p)`. Makers are never charged. Rates are: crypto 0.07, sports 0.05, finance/politics/mentions/tech 0.04, economics/culture/weather/other 0.05, geopolitics 0 ([fees](https://docs.polymarket.com/trading/fees)). The sports rate rose from 0.03 to 0.05, and the sports maker rebate fell from 25% to 15%, on 2026-07-10 ([changelog](https://docs.polymarket.com/changelog)). The per-market truth is `feeSchedule` {rate, exponent, takerOnly, rebateRate} ([market details](https://docs.polymarket.com/market-data/market-details)).

A live Gamma snapshot of the top 100 markets by 24h volume, taken 2026-09-26, showed mixed schedules. 25 markets had rate 0 (`zero_fees`: NFL/college spreads, totals, moneylines). 20 had 0.05/0.15, 17 had 0.04/0.25, 8 had 0.07/0.20, 8 had 0.03/0.25 (`sports_fees_v2` futures), and 16 had no schedule. Every market with a schedule also carried `takerBaseFee=1000`, including the rate-0 ones. **`takerBaseFee` is therefore not the fee rate.**

**Maker rebates.** Rebates are paid daily and fee-curve weighted: `your_fee_equivalent / total_fee_equivalent × pool`, computed per market, with a $1 minimum payout ([maker rebates](https://docs.polymarket.com/market-makers/maker-rebates)). *Estimate:* at p = 0.50, the maximum rebate if you are the only filled maker is 0.05·0.25·15% ≈ **0.19¢/share** in sports, 0.25¢ in 0.04/25% categories, and 0.35¢ in crypto. All of these are below a 1¢ tick. A rebate cannot pay for a toxic fill.

**Liquidity rewards.** The order score is `((v − s)/v)² · b`, measured from a size-cutoff-adjusted midpoint. The book is sampled once per minute at a random offset (1,440 samples per UTC day). Each sample takes the minimum of the two sides. Single-sided quotes score at 1/3 when the midpoint is in [0.10, 0.90] and must be two-sided outside that range ([liquidity rewards](https://docs.polymarket.com/market-makers/liquidity-rewards)). Amounts under $1 are not paid and do not roll over ([help center](https://help.polymarket.com/en/articles/13364466-liquidity-rewards)). In the snapshot, 95 of 100 markets had reward settings (typical max spread 4.5¢, min size 20–200 shares). Only 23 showed a funded daily rate: median $100/day, max $1,000, about $5.4k/day total. The `/rewards/markets/current` endpoint lists many markets at $1/day. The $1M August crypto TWAP reward program has ended.

**Arbitrage.** Across April 2024 to April 2025, Saguillo et al. estimate about $40M of realized arbitrage. Single-condition rebalancing accounts for $5.90M (buying YES+NO below $1) and $4.68M (selling above $1). Only about 1% of detected election opportunities were captured, and fees were excluded ([arXiv 2508.03474](https://arxiv.org/abs/2508.03474), [AFT 2025 PDF](https://drops.dagstuhl.de/storage/00lipics/lipics-vol354-aft2025/LIPIcs.AFT.2025.27/LIPIcs.AFT.2025.27.pdf)). Most of that period came before 2026 fees. For NBA markets (Feb–Mar 2026, 75M L1 snapshots), Cheng et al. found **7** valid single-market episodes across 3,042 markets, with a median life of 3.6 s and **$210.19** total at $100/episode. They also found 290 moneyline/spread combinatorial episodes (median about 101 bp), but 76.9% were limited to about 14.8 shares. Post-game stale books produced false signals, with a median spread of 7,532 bp ([arXiv 2605.00864](https://arxiv.org/abs/2605.00864)).

**Neg-risk.** One NO share can be converted atomically into one YES share in every other outcome through the Neg Risk Adapter. In augmented events, only named outcomes should be traded; "Other" changes meaning as placeholders are named ([negative risk](https://docs.polymarket.com/concepts/negative-risk)).

**Latency and queue.** The crypto taker delay is 150 ms (it was 250 ms, then 50 ms on Aug 17, then 150 ms on Sep 4). Sports markets have game delays. Delayed orders cannot be canceled ([order lifecycle](https://docs.polymarket.com/concepts/order-lifecycle), [changelog](https://docs.polymarket.com/changelog)). After a matching-engine restart, the book runs in post-only mode for 2 minutes ([matching engine](https://docs.polymarket.com/trading/matching-engine)). Public-feed trade direction is only about 59% accurate ([arXiv 2604.24366](https://arxiv.org/abs/2604.24366)).

## 3. Mapping to Master Mold

- `markets.ts` sets `fees_enabled` from `feesEnabled || takerBaseFee > 0`. It flags the fee-free NFL markets as fee markets and never reads `feeSchedule`.
- `wallets.ts` `walletFollowFeeUsd` computes `(takerBaseFee/10000) × min(p, 1−p) × shares`. At 50¢ in sports that gives 5¢/share, while the documented formula gives 1.25¢, so it **overstates the fee by about 4×**. The error is conservative for the follow-arm, but the stored bps are wrong. Recompute the stored rows with the documented formula.
- `strategies.ts` `binary_parity` skips fee markets and all neg-risk markets. `maker_spread` selects 2–8¢ spreads, yet 95% of top markets quote at 1¢ or less, so it samples exactly the thin, wide books where adverse selection is worst. No code reads reward settings (`rewardsMinSize`, `rewardsMaxSpread`, `clobRewards`).
- `stream.ts` has the public market channel (50-token cap). There is no user channel, no order lifecycle, and no event-level neg-risk model (`catalog.ts` lists `cross_market_arbitrage` as missing).
- Earlier results still apply. The public-signal momentum/book-pressure lane lost money (-$28.47 over 173 trips), and the LLM analyst scored worse than the market prior. Structural edges are the remaining category that does not require being smarter than the price.

## 4. BUILD (shadow only)

**B0. Fee truth (prerequisite, about 0.5 day).** Parse `feeSchedule`, use `rate·p·(1−p)`, store both the schedule and the fee type, and re-derive wallet-follow P&L. Gate: all fee numbers in `/review` come from the schedule, with unknown treated as unknown.

**B1. Liquidity-reward shadow maker (about 3–5 days).**
- *Hypothesis:* in funded markets ($50+/day) with a midpoint in [0.2, 0.8], a virtual two-sided quote at the minimum size, 1–2¢ from the adjusted midpoint, earns more reward than it loses to adverse fills.
- *Data:* reward config per market; per-minute book snapshots to compute our Q against the displayed competition (an upper bound, since hidden competition is unknown); trades from the stream.
- *Accounting:* count a virtual fill only when trades exhaust all displayed size ahead at our price (pessimistic queue). Mark every fill at 1 min, 15 min, and at resolution. Charge zero maker fee. Rebates count as a bonus only. Include capital locked at min size × 2 per market and inventory that must be unwound as taker, paying the fee.
- *Gate:* ≥14 UTC days, ≥20 markets, cluster-bootstrapped lower bound of (reward − markout − unwind fees) > 0, and a result that does not depend on 1–2 markets.

**B2. Neg-risk basket monitor (about 3 days).**
- *Hypothesis:* in named-outcome neg-risk events, Σ YES asks < 1, or a NO-plus-convert route beating a direct YES, appears with enough depth to exceed fees.
- *Data:* event membership, every outcome's book from the stream, and the `negRiskOther`/placeholder flags.
- *Accounting:* each leg's taker fee (Σ rate·pᵢ(1−pᵢ)); the minimum executable depth across legs; leg risk, using a lifetime of at least 2 s measured on our own clock; gas/relayer for conversion; exclusion of augmented "Other".
- *Gate:* ≥10 episodes/week with net ≥ $2 at ≥20 shares that persist longer than measured latency, over 4 weeks.

**B3. Binary parity, fee-inclusive (about 1 day).** Extend `binary_parity` to fee markets as a falsification control. The edge must exceed 2·rate·p(1−p) (about 2.5¢ per pair near 50¢ in sports). Log both sides of the sum (combined asks < 1 and combined bids > 1). Gate: same as B2. Expect it to fail, and keep the result as evidence.

## 5. SKIP

- **Autonomous maker/rebate farming.** Rebates are below a tick, and a retail VPS loses queue and cancel races.
- **In-play sports and 5/15-minute crypto.** Taker/game delays, uncancelable pending orders, and median 3.6 s arb windows favor co-located bots.
- **Trading "Other" or placeholders** in augmented neg-risk events.
- **Chasing taker-rebate tiers.** Bronze needs $2,000 of 30-day weighted volume for a 3% rebate on fees ([taker rebates](https://docs.polymarket.com/programs/taker-rebates)). It rewards volume, not edge. Self-matching is prohibited.
- **Late-game and post-game "arbs."** They are mostly stale-book artifacts.

## 6. Open risks

- **Legal/geographic eligibility.** This was not researched here and needs current human review before any credential or capital is used.
- **Rule churn.** The sports fee and rebate, the taker delay (changed three times since August), and reward pools all change without notice. Store the schedule version with every row.
- **Reward competition is unobservable.** Hidden or future quoters shrink the share, so B1's Q share is an upper bound.
- **False discovery.** Many markets and parameters make a lucky winner likely. Pre-register B1–B3 configurations, split by event cluster, and keep the wallet-lane lesson in mind: one weekend is not evidence.

## 7. Sources

- https://docs.polymarket.com/trading/fees
- https://docs.polymarket.com/market-makers/maker-rebates
- https://docs.polymarket.com/market-makers/liquidity-rewards
- https://help.polymarket.com/en/articles/13364466-liquidity-rewards
- https://docs.polymarket.com/market-data/market-details
- https://docs.polymarket.com/concepts/negative-risk
- https://docs.polymarket.com/concepts/order-lifecycle
- https://docs.polymarket.com/trading/matching-engine
- https://docs.polymarket.com/programs/taker-rebates
- https://docs.polymarket.com/market-makers/overview
- https://docs.polymarket.com/changelog
- https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=500&order=volume24hr&ascending=false (snapshot 2026-09-26)
- https://clob.polymarket.com/rewards/markets/current
- https://arxiv.org/abs/2508.03474
- https://drops.dagstuhl.de/storage/00lipics/lipics-vol354-aft2025/LIPIcs.AFT.2025.27/LIPIcs.AFT.2025.27.pdf
- https://arxiv.org/abs/2605.00864
- https://arxiv.org/abs/2604.24366
