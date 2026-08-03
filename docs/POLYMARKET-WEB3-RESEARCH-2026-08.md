# Polymarket and Web3 research pass — August 2026

This note records the evidence behind Master Mold's second strategy-expansion
pass. It is deliberately a research and measurement plan, not a claim that a
new signal will make money. New strategy authority remains shadow-first and
live execution remains separately gated.

The later hardening audit found that PolySniper's intended correlation,
cross-market arbitrage, copy-trading, and weather scope was much broader than
this native lane, while several reference weather/execution paths were only
partially wired. The current truth is maintained in the
[PolySniper capability audit](POLYSNIPER-CAPABILITY-MATRIX.md).

## What changed at Polymarket

- Polymarket now exposes three distinct public surfaces: Gamma for discovery,
  Data API for public trades/positions/holders, and CLOB for order books,
  spreads, midpoints, and price history. Public reads require no credentials;
  order management does.
  [API overview](https://docs.polymarket.com/api-reference/introduction)
- CLOB V2 replaced V1 in production on 2026-04-28 with no V1 compatibility.
  The ignored PolySniper reference therefore remains a strategy reference, not
  a live execution dependency.
  [Changelog](https://docs.polymarket.com/changelog)
- The unauthenticated market WebSocket supplies full books, price-level
  changes, last trades, best bid/ask, new markets, and resolutions. Tick-size
  changes are operationally important.
  [Market channel](https://docs.polymarket.com/market-data/websocket/market-channel)
- Fee policy changed substantially in 2026. Many categories now charge
  price-dependent taker fees and fund daily maker rebates. `feesEnabled` and
  the market `feeSchedule` must be read rather than assumed.
  [Maker rebates](https://docs.polymarket.com/market-makers/maker-rebates)
- Negative-risk events permit conversion among mutually exclusive outcomes,
  but augmented events can contain a changing `Other` definition. These need a
  dedicated event-level model and cannot be treated as ordinary binary books.
  [Negative risk](https://docs.polymarket.com/advanced/neg-risk)

## Findings that change the strategy

1. **Execution quality matters at least as much as picking the outcome.** A
   2026 study of resolved Polymarket trades reports that profitable bots were
   distinguished by execution rather than forecast accuracy. Another broad
   study finds successful traders disproportionately provide liquidity while
   losing traders take it. Master Mold therefore records executable bid/ask,
   spread, and forward markout—not only the Gamma last price.
   [Execution study](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6191618),
   [profit concentration study](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6443103)
2. **Order-book signals need strict validity gates.** Order-flow imbalance has
   a well-established relationship with short-horizon price impact, but a new
   Polymarket microstructure study finds public-feed trade-direction inference
   only slightly better than chance. The first brain pass uses observable
   resting depth imbalance and executable markouts; it does not infer signed
   trade flow from the feed.
   [Order-flow imbalance](https://arxiv.org/abs/1011.6402),
   [Polymarket microstructure](https://arxiv.org/abs/2604.24366)
3. **Arbitrage exists, but execution and depth are the constraint.** Research
   identifies single-market rebalancing and cross-market combinatorial
   arbitrage. NBA order-book reconstruction finds single-market anomalies rare
   and brief, with most combinatorial opportunities limited to small size.
   Master Mold exposes parity dislocations as shadow observations and records
   executable size; it does not call a price-sum difference guaranteed profit.
   [General arbitrage study](https://arxiv.org/abs/2508.03474),
   [NBA arbitrage study](https://arxiv.org/abs/2605.00864)
4. **Longshot/favorite effects are hypotheses, not universal rules.** Recent
   evidence varies by venue and category. Probability buckets must be evaluated
   by category, time-to-resolution, liquidity, and actual resolution rather
   than installing a global “buy favorites” rule.
   [Recent bias study](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6858200)
5. **The brain needs proper probability evaluation.** Brier score and its
   calibration/refinement decomposition measure whether a probability model is
   honest and useful. Small samples do not justify a flexible recalibrator.
   Master Mold starts with fixed buckets and only permits learned calibration
   after a large, independently resolved sample.
   [Proper scoring rules](https://doi.org/10.1198/016214506000001437),
   [calibration and refinement](https://arxiv.org/abs/0806.0813)
6. **Wallet copying is exposed to selection and information risk.** Current
   studies find profits highly concentrated and evidence of informed trading,
   but public leaderboards alone do not prove persistent transferable skill.
   Wallet following belongs in a shadow model with resolved-market,
   execution-adjusted, out-of-sample attribution.
   [Informed trading](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6426778),
   [earnings markets](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6685139)

## Polymarket brain design

The brain is a separate ignored SQLite database (`POLYMARKET_BRAIN_DB`, default
`.data/polymarket-brain.db`). It does not replace or read the paper-account
store. It records:

- five-minute strategy observations with strategy ID and full thesis;
- Gamma probability plus executable CLOB bid, ask, midpoint, spread, top-book
  depth, and depth imbalance;
- 15-minute, one-hour, and four-hour executable markouts when later quotes are
  available;
- due closed-market reads batched through Gamma by market ID; only exactly one
  terminal 1.0 outcome with all alternatives at 0.0 is treated as decisive;
- actual binary results and Brier scores for the selected market probability,
  with ambiguous/invalid resolutions recorded but excluded from calibration;
- bounded public market-channel events for at most 50 current token IDs,
  including deduplicated top-of-book changes, trades, and tick-size changes;
  stream data retains seven days or 100,000 events, whichever is smaller, and
  exposes actual retained time coverage because the count cap can fill in less
  than 24 hours;
- one-minute absolute and reported-side trade markouts, without claiming that
  the public BUY/SELL field identifies the maker or taker;
- per-strategy count, hit rate, mean net markout, resolved count, and mean Brier;
- cycle health and source failures without deleting prior evidence.

Initial shadow hypotheses:

- `momentum`: the existing liquid binary 24-hour move setup;
- `book_pressure`: tight-spread markets with materially one-sided resting
  depth, evaluated only by later executable bid;
- `binary_parity`: combined YES/NO asks below payout after a conservative
  buffer, with executable size recorded;
- `maker_spread`: sufficiently wide, deep books that may reward passive
  quoting; this remains research-only because fill probability and actual
  maker/taker role are not observable from this feed.

### Public market-stream contract

The runtime connects to
`wss://ws-subscriptions-clob.polymarket.com/ws/market` without credentials. It
subscribes with `assets_ids`, `type: market`, and
`custom_feature_enabled: true`; sends the literal `PING` every ten seconds;
and accepts both the initial array of `book` snapshots and later object events.
It normalizes unordered snapshots before deriving best bid/ask, treats a
`price_change` size of zero as a valid level removal, and dynamically updates
the bounded token set after each five-minute discovery cycle. Disconnects use
a one-to-thirty-second exponential retry and remain visible in health/UI state.

Polymarket's changelog says the former 100-token channel limit was removed.
Master Mold nevertheless keeps its own 50-token cap so one public feed cannot
grow the research database or event loop without bound. Set
`POLYMARKET_STREAM_ENABLED=0` to disable this optional ingestion path; doing so
does not change paper or live authority.
[WebSocket overview](https://docs.polymarket.com/market-data/websocket/overview),
[market channel](https://docs.polymarket.com/market-data/websocket/market-channel),
[order book](https://docs.polymarket.com/trading/orderbook),
[changelog](https://docs.polymarket.com/changelog)

Promotion is deliberately difficult: at least 100 independently labeled
one-hour observations, positive mean execution-adjusted markout, a hit rate
above 52%, and no stale-data condition. Promotion grants paper-candidate status
only. It cannot grant live authority.

## Autonomy ladder

1. **Observe:** public discovery, CLOB books, snapshots, forward labels, and
   decisive final outcomes.
2. **Shadow:** compare strategy candidates against skipped controls and costs.
3. **Paper candidate:** only after the promotion gate; still operator-visible.
4. **Paper autonomous:** fixed caps, kill switch, attribution, and automatic
   downside-only demotion.
5. **Live candidate:** separate reviewed CLOB V2 signer/funder implementation,
   geographic eligibility, allowances, heartbeat/cancel-all behavior, at least
   28 paper days, and an operator decision.

## Web3 implications

Master Mold's Web3 lane already has the correct shadow → label → calibrate →
promote plumbing, honest execution costs, and volatility-scaled stops. The
August evidence says the existing trend-pullback strategy has no demonstrated
edge, so this pass must not loosen its gate.

Research-backed priorities are:

1. **Funding/basis, stress-adjusted.** Perpetual funding keeps contracts near
   spot but constrained arbitrage capital and basis risk remain material.
   Funding candidates should use recent rate dispersion, sign persistence,
   basis stress, both-leg costs, and margin headroom—not extrapolate the latest
   rate unchanged.
   [Perpetual basis risk](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5036933),
   [no-arbitrage pricing](https://www.nber.org/papers/w32936)
2. **Execution-aware cross-venue evidence.** Crypto venues fragment price
   discovery; limit submissions/cancellations contribute materially. Persist
   venue-specific top-of-book and markouts before enabling relative-value
   execution.
   [Crypto order flow](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4867599)
3. **Risk-managed momentum only.** Recent crypto research supports studying
   volatility-managed momentum, but Master Mold's own `xsec` and `trending`
   scores are inverted. Volatility scaling cannot rescue an inverted signal;
   those lanes remain observation-only until new forward evidence says
   otherwise.
   [Risk-managed crypto momentum](https://www.sciencedirect.com/science/article/pii/S1544612325011377)
4. **Maker and MEV-aware execution.** Drift exposes DLOB L2/L3 and post-only
   semantics; Jito provides protected/revert-protected transaction paths. These
   are future execution improvements after a strategy passes its evidence
   gates, not reasons to trade a losing signal faster.
   [Drift DLOB](https://docs.drift.trade/developers/drift-sdk/dlob),
   [Jito low-latency send](https://docs.jito.wtf/lowlatencytxnsend/)

## Explicit non-claims

- No strategy in this note has proven future profitability.
- Public market or wallet data can be noisy, manipulated, stale, or selected
  after success.
- Paper fills, markouts, Brier scores, and replay results are evidence tools,
  not a promise of live returns.
- The research pass does not connect a wallet or broaden remote-control
  authority.
