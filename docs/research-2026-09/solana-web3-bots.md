# Solana/Web3 trading bots for a small retail operator — September 2026

Status: research memo, shadow-only recommendations. No paper or live authority is granted or implied.
Date: 2026-09-26. Scope: Master Mold Web3 lab (`src/autopilot/v3/*`).

## 1. Question and answer

**Question:** Which Solana/Web3 bot strategies plausibly make money for a small retail operator after realistic costs, and what should Master Mold do with its v3 lane (`cusum_tb`, the carry shadow book, smart-wallet discovery)?

**Answer:** The published evidence gathered in this pass says the reliable winners on Solana are the transaction-ordering businesses: searchers and validators capturing MEV, and the Jito/validator stack that collects tips. Retail bots mostly pay that tax through tips, failed transactions, and sandwich losses rather than collect it. None of the categories we looked at gives a small operator a structural edge; the only ones worth measuring are slow-horizon, cost-dominated hypotheses where latency does not decide the outcome. For Master Mold: **keep `cusum_tb` as a shadow hypothesis, but do not treat +61bp on 63 labels as evidence of edge**; retire the inverted and flat scorers from any ranking role; rename the carry book as a funding monitor and replace it with a two-leg ledger before it informs anything; and keep smart-wallet copying shadow-only with its assumed return prior removed.

## 2. What the evidence says

**MEV is real, large, and concentrated with sophisticated actors.** A peer-reviewed IMC 2025 measurement of four months of early-2025 Jito data found 521,903 suspected sandwich attacks, about $7.7M in victim losses, about $9.7M in attacker gains, and more than $2.4M spent by users on defensive bundles ([Gerzon et al., IMC '25](https://cnitarot.github.io/papers/imc26_solana.pdf); [program](https://conferences.sigcomm.org/imc/2025/program/)). The loss figure is a lower bound: it counts only SOL-denominated trades, which leaves out about 28% of attacks. Sandwich bundles were about 0.038% of all Jito bundles and the median victim loss was about $5, so the harm is broad and shallow rather than concentrated on large trades. The implication for a retail bot is defensive: market-order swaps on thin pools are the victim side of this table.

**Tips flow to validators and stakers.** Jito reports its tip system had paid roughly $674M to stakers and validators entering 2025, with tips near half of Solana's "real economic value," and that TipRouter processed more than $250M between February and July 2025 ([Jito TipRouter](https://www.jito.network/blog/what-is-jito-tiprouter/), [TipRouter upgrade](https://www.jito.network/blog/tiprouter-upgrade-facilitating-priority-fees/)). These are the payees of the latency race; a retail bot competing for the same slots is a payer.

**Bots fail a lot, and failure costs money.** An ISSTA 2025 study of about 2.9 billion non-vote Solana transactions found bot-initiated transactions failed 58.43% of the time versus 6.22% for humans in the arXiv version; the final ISSTA version reportedly gives 73.4% ([ISSTA page](https://conf.researchr.org/details/issta-2025/issta-2025-papers/65/Why-Does-My-Transaction-Fail-A-First-Look-at-Failed-Transactions-on-the-Solana-Block)). Either way, most bot attempts lose the race before landing ([Zheng et al., arXiv 2504.18055](https://arxiv.org/abs/2504.18055); [ISSTA PDF](https://zhiyuan-wan.github.io/assets/publications/zheng_issta_25_solana.pdf)). The study covers all bot types, not only arbitrage, so the 58% is an upper-level signal, not an arbitrage-specific rate.

**Funding/basis carry is limits-to-arbitrage compensation, not free yield.** The repo's August research already established this: BIS finds carry spikes coincide with short-side liquidation risk ([BIS WP 1087](https://www.bis.org/publ/work1087.htm)); friction-aware perpetual studies find returns driven as much by basis convergence as funding ([He et al.](https://arxiv.org/abs/2212.06888)); and a 2026 DeFi basis execution study reports material asymmetric spot wedges ([Krestenko et al.](https://arxiv.org/abs/2605.05089)). Drift's liquidation mechanics govern the short leg ([Drift liquidation engine](https://docs.drift.trade/protocol/trading/liquidations/liquidation-engine)).

**Gaps in this pass (stated, not filled):** searches on pump.fun graduation/rug rates and trader profitability distributions, and on concentrated-liquidity LP returns and impermanent loss, did not return usable primary sources in this session. The SKIP recommendations for memecoin sniping and LP below rest on the MEV/failure evidence above and the repo's own results, and should be re-sourced before being quoted externally.

## 3. Mapping to Master Mold

| Area | What exists | What is missing |
|---|---|---|
| `cusum_tb` (`cusum.ts`, `cusum-tb.ts`) | Symmetric CUSUM events, 2.2×h triple barrier, 24h horizon, edge ratio 0.15 clamped [0.05, 0.30], Drift short expression at 7bp round trip taker. | Calibration scores buckets on **2h** `return_2h_bps` (`calibration.ts`), while the trade is defined on a **24h** barrier, so the +61bp is measured on a different clock than the trade. Bucket separation is gross of cost. Drift-perp rows are correctly excluded from promotion (`promotion.ts`), halving usable evidence. 63 labels vs a 150-label gate. |
| Carry book (`carry-book.ts`, `funding-basis.ts`) | Funding-only synthetic accrual on $100 notional, placeholder 20bp friction, honest header comment. | No spot leg, no basis mark-to-market, no margin/liquidation, no measured cost. Its APR output can look like yield. |
| Smart wallets (`smart-wallets.ts`, `wallet-discovery.ts`) | Balance-delta buy detection, anti-bot win-rate band, trade-count ceilings, 6h report cards, human Follow click. | `COPY_BPS_PER_WALLET = 90` hard-codes an expected return from outside research; leaderboard selection is in-sample; no latency-to-copy measurement. |
| CEX gap (`cex-gap.ts`) | Fee-adjusted DEX–CEX observations with a 3-consecutive-week graduation rule. | Nothing needed; it self-archives to monthly if no edge. |
| Execution cost (`execution-cost.ts`) | Quote-first Jupiter cost; `priority_fee_bps`/`failed_tx_bps` fields exist. | Tip, priority fee, and failure costs are not measured from real landings; paper fills cannot observe sandwiching. |

The known results — v2 net negative over 43 paper trips, `xsec` −25bp inverted, `trending` −227bp inverted, `bar_portion` ~0 — are consistent with the external picture: fast directional signals on public data carry no demonstrated edge after cost.

## 4. BUILD list (shadow only)

1. **`cusum_tb` horizon-matched re-scoring.** Hypothesis: high-magnitude CUSUM events beat low-magnitude ones *on the traded 24h barrier outcome, net of cost*. Data: existing snapshots plus barrier-hit labels (first-touch TP/SL/deadline). Accounting: Jupiter reverse-quote cost both legs, next-bar entry, pessimistic same-bar stop. Gate (pre-registered, untouched period): ≥150 new labels, net mean >+20bp with bootstrap 90% interval above zero, clustered by day and mint; fail if separation reverses sign on the held-out half. Effort: small (label function + evaluator).
2. **Two-leg carry ledger replacing the funding-only book.** Hypothesis: persistent positive Drift funding survives spot+perp entry/exit, basis moves, and margin. Data: synchronized Jupiter spot quotes and Drift mark/oracle/funding each cycle. Accounting: both-leg taker cost, basis mark-to-market, collateral haircut, liquidation-distance stress at 2× observed basis moves, USDC opportunity cost. Gate: 8 weeks, positive net P&L in the stressed case and no simulated liquidation. Effort: medium.
3. **Execution-cost truth sampler (no trades).** Hypothesis: modeled `priority_fee_bps` and `failed_tx_bps` are understated. Data: public recent-prioritization-fee reads and Jito tip-floor data at each would-enter, logged against notional. Gate: if measured tip+priority+expected-failure cost exceeds 25% of any strategy's modeled gross edge, that strategy's EV is recomputed before it may continue. Effort: small.
4. **Forward-only copy-wallet test.** Hypothesis: wallets selected on data *before* date D earn positive net 6h/24h returns *after* D when copied with measured delay. Accounting: entry at our quote at detection time + observed detection lag, not the wallet's fill; remove the 90bp prior. Gate: ≥100 graded copies from ≥10 wallets, net mean >0 with interval above zero; otherwise stop. Effort: small–medium.

## 5. SKIP list

- **MEV/atomic arbitrage and sandwiching:** payees are searchers/validators; bot failure rates near 58% and tip competition are the retail cost ([ISSTA](https://arxiv.org/abs/2504.18055), [IMC '25](https://cnitarot.github.io/papers/imc26_solana.pdf)). Sandwiching is also harmful to users.
- **Memecoin/launch sniping:** latency race plus rug exposure; the one profitable v2 name (a meme-tier asset) is one sample. Not sourced further in this pass.
- **Concentrated-liquidity LP bot:** needs active rebalancing against informed flow; no primary evidence gathered here supports retail profitability. Revisit only with sourced LP return data.
- **`xsec`, `trending`:** inverted; retire from ranking and stop spending labels. **`bar_portion`:** flat; retire or keep only as a v2 veto arm already under experiment.
- **ML gating of `cusum_tb`:** do not activate until the rule-based signal passes build item 1; a classifier on 63 labels will fit noise.
- **Faster execution (Jito bundles) for current signals:** speed does not fix a signal without edge ([Jito low-latency send](https://docs.jito.wtf/lowlatencytxnsend/) remains a later protective tool).

## 6. Open risks

- **Eligibility and rules:** perp venue access varies by jurisdiction and venue terms; fee tiers (the 7bp Drift figure dates to 2026-07-12) and funding formulas change. Human review before any credential or capital use.
- **Small-sample false discovery:** four signals were scored and one looked good; with 63 labels and several horizons, a +61bp winner is expected by chance. Pre-register and use an untouched period.
- **Clock mismatch:** 2h labels judging a 24h trade can flip conclusions.
- **Unobservable harms in paper:** sandwiching, failed landings, and tip bidding are invisible to quote-based paper fills.
- **Venue/stablecoin/oracle failure** affects carry asymmetrically.

## 7. Sources

- https://cnitarot.github.io/papers/imc26_solana.pdf
- https://conferences.sigcomm.org/imc/2025/program/
- https://conf.researchr.org/details/issta-2025/issta-2025-papers/65/Why-Does-My-Transaction-Fail-A-First-Look-at-Failed-Transactions-on-the-Solana-Block
- https://www.jito.network/blog/what-is-jito-tiprouter/
- https://www.jito.network/blog/tiprouter-upgrade-facilitating-priority-fees/
- https://www.jito.network/restaking/tiprouter/learn-more/
- https://arxiv.org/abs/2504.18055
- https://zhiyuan-wan.github.io/assets/publications/zheng_issta_25_solana.pdf
- https://www.bis.org/publ/work1087.htm
- https://arxiv.org/abs/2212.06888
- https://arxiv.org/abs/2605.05089
- https://docs.drift.trade/protocol/trading/liquidations/liquidation-engine
- https://docs.jito.wtf/lowlatencytxnsend/

