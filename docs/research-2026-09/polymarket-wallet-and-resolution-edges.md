# Polymarket wallet and resolution edges — research memo (2026-09)

Status: research only. No strategy promotion, and no paper or live authority change.

## 1. Question and answer

**Question:** Which Polymarket informational or behavioral edges should Master Mold test next? The candidates are copying wallets, resolution and "near-certain" pricing, longshot/favorite bias, comparing sports prices with sharp books, and news latency. Is the wallet follow-arm a sound forward test?

**Answer:** Keep the wallet follow-arm, but it cannot answer its own question yet. Recent Polymarket studies find that profit is highly concentrated. They also find it is driven more by execution (limit orders, entry price and timing) than by forecasting. So a taker who copies a profitable wallet may be copying the part of its edge that does not transfer. The positive 35-75¢ match-winner cell may also be a price-band effect rather than wallet skill, because favorite/longshot effects on Polymarket depend heavily on price band and category. The follow-arm has no control that buys the same band without a wallet signal, so it cannot separate those two explanations. Its ≥30-follow gate is also far too small to tell +0.24/$ from zero. Its fee model is likely about 3-4× more pessimistic than the current documented sports formula. The next build is a frozen-cohort follow-arm plus an unconditional control arm and closing-price capture. Longshot buying and news-latency trading should be skipped.

## 2. What the evidence says

- **Profit is concentrated in a few execution-driven wallets.** Akey, Grégoire, Harvie and Martineau (SSRN 6443103, rev. June 2026) find that the top 1% of profitable wallets captured about 76.5% of aggregate profit. Winners disproportionately use limit orders and provide liquidity, while losers use market orders. About 70% of users lose money. The public wallet dataset is at [Hugging Face](https://huggingface.co/datasets/vgregoire/polymarket-users). (Persistence of wallet skill was not re-verified for this memo; treat it as unknown.)
- **Execution matters more than information.** Della Vedova (SSRN 6191618) finds that forecast accuracy and profitability are nearly independent. Entry price and timing largely determine returns.
- **Measure skill at entry prices.** Buying into nearly resolved markets mechanically inflates hit rates (reasoning, not a cited result here), so skill should be measured out of sample at prices available when the trade was made.
- **Favorite-longshot bias depends on category and weighting.** Cardozo and Rivero-Wildemauwe (arXiv 2609.12878; 588M trades, 2.48M accounts) report these results:
  - Buys below 10¢ lost about 19.3¢ per dollar.
  - Buys at or above 90¢ earned about +0.83¢ per dollar.
  - The sign flips under event-grouped weighting: longshots lose 6.3% equal-weighted but gain 4.1% when grouped by parent event.
  - The bias shows up in politics and crypto and is reported absent in sports.

- **Sports fees.** The current docs give the taker fee as `C × feeRate × p × (1−p)`, with sports `feeRate = 0.05`. That is at most $1.25 per 100 shares at 50¢. Makers pay nothing. The docs say to read the rate per market rather than hardcode it ([fees](https://docs.polymarket.com/trading/fees)).
- **Not freshly researched in this pass:** UMA dispute statistics, Pinnacle/closing-line comparisons, and news-latency studies. I gathered no new primary sources for them, so the recommendations below on those topics rest on mechanism and the repo's own evidence and are labeled that way. The repo's earlier notes already cite [resolution rules](https://docs.polymarket.com/concepts/resolution), public-feed direction inference at about 59% accuracy ([arXiv 2604.24366](https://arxiv.org/abs/2604.24366)), and evidence of informed trading ([SSRN 6426778](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6426778)).

## 3. Mapping to Master Mold

**What exists** (`src/polymarket/wallets.ts`):

- Discovery samples taker flow and scores wallets on `/closed-positions` with these filters: ≥25 settled, ≥$250 volume, ≥+5%/$, a median-stake band, and profit in both the early and late halves of the wallet's own history.
- Signals record our best ask at detection, the wallet's fill price, and the lag.
- Evidence is reported at market level.
- The follow-arm takes match_winner signals at 35-75¢: $5 stake, max 10 open, one per market, fee stored per row, hold to resolution.

**Gaps that matter:**

1. **No control arm.** Given that favorite/longshot effects vary by band and are reported absent in sports (Cardozo et al.), a positive follow P&L could come from the band alone. The only honest comparison is follow minus an unconditional buy of the same band at the same moment.
2. **The fee model probably diverges from the docs.** `walletFollowFeeUsd` uses `takerBaseFee/10000 × min(p,1−p) × shares`. With the observed `takerBaseFee=1000`, a 50¢ fill costs 5.0¢/share, while the documented formula gives 1.25¢/share. At 70¢ the figures are 3.0¢ vs 1.05¢ (my arithmetic). This is conservative and recoverable because the bps is stored, but it can fail a real edge.
3. **The persistence check is in-sample.** The early and late halves both come from the same history used for selection, and they include late, near-certain entries (the Yang bias). The follow cohort also changes on every 6-hour discovery and weekly rescore, so the forward sample is never cleanly out of sample.
4. **The gate is statistically underpowered.** At an average entry around 55¢, one binary bet's return per dollar has an SD of about 0.9. Thirty follows give a standard error of about ±0.16/$, and detecting +0.10/$ at two standard errors needs roughly 300 independent markets. These are estimates.
5. **Fills and exits are not modeled.** The arm uses the top ask only; that is acceptable at $5 but will not scale. It ignores the wallet's own sells, so "hold to resolution" can diverge from what the wallet actually did.
6. **No closing-price capture or external sharp line**, so feedback waits for resolution.

I could not find a local wallet store in this checkout, so the arm's forward results were not inspected.

## 4. BUILD (shadow/paper only)

**B1. Frozen cohort + control arm** (effort: about 1-2 days)

- **Hypothesis:** follows beat an unconditional buy of the same kind and band.
- **Data needed:** freeze the wallet list on a pre-registered date. For every follow, log a control: the same market type and band, a market with no followed-wallet signal, bought at the same time relative to kickoff.
- **Accounting:**
  - Fees under both the stored formula and the documented `feeRate × p(1−p)` formula.
  - Size-aware fills walked through the book.
  - Lag and ask drift from their fill to our ask, as a crowding proxy.
  - Capital days locked.
  - Match-level clustering, counting one match once.
- **Gate:**
  - ≥300 resolved markets across ≥6 weekends and ≥3 leagues.
  - Follow-minus-control EV/$ has a lower 95% bound above 0 under a match- and wallet-clustered bootstrap.
  - The result stays positive with the two top wallets removed.
- **Fail:** the difference is ≤0, or the result depends on a single wallet.

**B2. Closing-price value (CLV)** (effort: about 1 day)

- **Hypothesis:** followed entries beat the Polymarket price at event start. This gives a faster, lower-variance read than resolution.
- **Data needed:** the mid/ask at kickoff for both follows and controls.
- **Accounting:** measure against the executable price, not the midpoint.
- **Gate:** mean CLV above 0 with a clustered CI after 150 markets. It must also agree in sign with B1.
- Comparing against Pinnacle or other sharp books is a later option, only if a lawful data source exists; it is untested and was not researched here.

**B3. Entry-time wallet scoring** (effort: about 1 day)

- **Hypothesis:** requalifying wallets only on entries made more than 2 hours before resolution, at entry-time prices, removes Yang-style inflation and improves forward results.
- **Gate:** the rescored cohort does at least as well as the current cohort on B1 metrics.

**B4. Near-certain carry ledger** (effort: about 2 days, shadow only)

- **Hypothesis:** contracts at ≥90¢ earn small positive returns (+0.83¢/$ per Cardozo et al.) that are worth their capital lockup.
- **Accounting:**
  - Annualized return net of fee (which is small at extreme prices because of the `p(1−p)` term) and days to settlement.
  - Invalid and disputed outcomes, including the time capital is stuck.
  - Clustering by event.
- **Gate:** positive net return after the worst observed dispute or invalid loss over at least 200 independent events.
- UMA dispute rates are unverified here and must be measured, not assumed.

## 5. SKIP

- **Buying longshots below 10-35¢.** The literature reports about −19.3¢/$ below 10¢, and the repo's own <35¢ cell is −0.54/$.
- **A universal "buy favorites" rule for sports.** The bias is reported absent in sports, and the sign changes with weighting.
- **News-latency sniping.** It needs latency the repo does not have, and wallet news signals were negative in the repo's data (−0.15/$). The LLM news lane also scored worse than the market prior.
- **Copying leaderboards or high-frequency bot wallets.** Their edge is liquidity provision and timing, which a lagged taker cannot copy.
- **Increasing stake or wallet count** before B1 passes.

## 6. Open risks

- **Legal and geographic eligibility** is unresolved and requires separate human review before any credential or capital is used.
- **Venue rules can change.** Fee formulas, per-market fee rates, and resolution rules change, and reported fee rates have been inconsistent. Store the raw fee fields and rule text for every row.
- **Multiple testing.** The band was chosen from about 16 kind×band cells over one weekend driven by two wallets. Expect regression toward zero.
- **Correlation.** Several markets on the same match, and bot wallets that clip one position many times, make signals less independent than they look.
- **Crowding.** Other copiers are invisible. Only the drift between the wallet's fill and our ask, and the price move after a signal, can reveal them.

## 7. Sources

- https://docs.polymarket.com/trading/fees
- https://help.polymarket.com/en/articles/13364478-trading-fees
- https://ssrn.com/abstract=6443103
- https://ssrn.com/abstract=6191618
- https://arxiv.org/abs/2609.12878
- https://docs.polymarket.com/concepts/resolution (cited in earlier repo notes)
- https://arxiv.org/abs/2604.24366 (cited in earlier repo notes)
- https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6426778 (cited in earlier repo notes)
