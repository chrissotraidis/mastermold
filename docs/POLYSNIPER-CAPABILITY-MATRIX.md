# PolySniper capability audit and Master Mold hardening

This is the operating contract for Master Mold's Polymarket lane. It separates
what the PolySniper reference intended, what that reference actually completed,
and what Master Mold is allowed to do now.

## Bottom line

Master Mold does **not** currently reproduce PolySniper. Its only autonomous
Polymarket behavior is data collection and protective simulator exits; the losing momentum baseline no longer has entry authority. Weather is a station-matched
shadow lab; it produces raw ensemble observations but cannot place paper or live
weather bets. Live Polymarket execution remains locked.

| Strategy | PolySniper intent | Reference reality | Master Mold authority |
| --- | --- | --- | --- |
| 24-hour momentum | Not a named reference strategy | N/A | **Shadow only:** retired paper baseline; promotion gate required before new entries |
| Correlation divergence | Trade a laggard after a linked leader reprices | Agent, pair monitor, lag/correlation maintenance, and executor exist; pair quality and transferable edge are not production-proven | **Missing** |
| Cross-market logic arbitrage | Trade date-stacked, mutually exclusive, or exhaustive clusters | Multi-leg monitor/executor exist, but a batch request is not atomic and partial fills can require manual intervention. The reference's date-stacked "by March / by June / by December" NO-arbitrage example is logically invalid: an event occurring by March can make every later "by" market resolve YES. | **Missing**; single-market YES/NO parity remains shadow-only |
| Wallet copy trading | Detect followed-wallet changes and mirror entries/exits | Polls public position snapshots; the monitor labels every new outcome token as `YES`, and polling can miss intermediate trades | **Missing** |
| Weather | Ensemble forecast, station observation, forecast changes, bot defense, and managed exits | Substantial architecture, but the agent hard-codes YES direction and placeholder spread/agreement values; some reductions are log-only and its weather exit path closes the database row without executing a sell | **Observe only:** exact event/source/station audit plus raw ensemble bucket probabilities |
| Maker spread | Planned | Not implemented in the reference catalog | **Shadow only:** displayed-spread research, without fill or inventory modeling |
| Counting theta | Planned | Not implemented | **Missing** |
| Economic events | Planned | Not implemented | **Missing** |
| Sports latency | Marked infeasible without expensive low-latency data | Not implemented | **Unsupported** |

## The paper strategy that actually trades

Every five minutes, when explicitly armed, the lane may open at most one $5
paper position. It selects the outcome in the direction of the market's
24-hour YES price change and requires all of the following:

- active binary market with an enabled order book and at least six hours before its stated end time;
- no negative-risk event mechanics and no enabled market fee schedule;
- at least $25,000 liquidity and $10,000 24-hour volume;
- an absolute 24-hour move of at least 3%;
- selected outcome price between 8 cents and 92 cents;
- fixed account, per-trade, daily-loss, open-position, and duplicate-outcome
  policy checks.

An entry now walks the displayed CLOB asks for the full paper stake. An exit
walks displayed bids for the full position. Insufficient depth means no action.
The automatic exits are a 5% executable-price take-profit, 3% executable-price
stop-loss, or four-hour hold limit. Decisively resolved markets settle any
remaining paper position at $1 for the winning token or $0 for the losing token,
so a vanished post-resolution book cannot strand the simulator position.

This is more honest than the former Gamma-price-plus-fixed-slippage simulation,
but it is still a snapshot model. It does not consume the public book or model
latency, queueing, hidden liquidity, adverse movement, or future fill state.

## Control boundary

Status reads are available wherever the dashboard is safely exposed. State-changing
Polymarket controls require an exact loopback host, port, and origin. A Tailscale
Serve or other reverse-proxy view is therefore intentionally read-only; use an SSH
tunnel and open `http://localhost:4002` for control. This preserves the existing
no-authentication security boundary instead of turning tailnet membership into
wallet or bot authority.

## Weather shadow methodology

The weather panel deliberately starts narrower than the reference:

1. Discover upcoming events with Polymarket's numeric `daily-temperature` tag
   (`103040`), not the broad `weather` tag.
2. Read every event's resolution description and source. Polymarket itself says
   resolution rules define the source, end date, and edge cases and should be
   read before trading. [Resolution](https://docs.polymarket.com/concepts/resolution)
3. Support model enrichment only when the parser proves a Wunderground ICAO
   station and a whole-degree Celsius rule. Other sources and precision rules
   stay unsupported.
4. Resolve that ICAO station to official station coordinates through the US
   Aviation Weather Center station API.
5. Request individual ECMWF IFS 0.25-degree ensemble members from Open-Meteo at
   those station coordinates. Open-Meteo describes ensembles as distributions
   of perturbed forecasts and explicitly notes that model choice depends on
   region and horizon. [Ensemble API](https://open-meteo.com/en/docs/ensemble-api)
6. Round each raw member to the market's whole-degree buckets and display the
   resulting member fraction beside the indicative market YES price.

That fraction is **not a calibrated fair probability**. Statistical
post-processing such as Ensemble Model Output Statistics exists precisely
because raw ensemble spread and station outcomes are not automatically
calibrated. [Gneiting et al., 2005](https://journals.ametsoc.org/view/journals/mwre/133/5/mwr2904.1.xml)

## Weather paper gate

Weather must remain observation-only until all of these are evidenced:

- immutable capture of event rules, source, station, precision, bucket set,
  fee schedule, forecast issue time, and later observation/resolution;
- station-specific historical bias and dispersion calibration, evaluated
  out-of-sample with Brier score for buckets and CRPS for the full temperature
  distribution;
- comparison against the contemporaneous market probability as a baseline,
  not merely a positive raw-model/market gap;
- executable CLOB depth on entry and exit plus Polymarket's dynamic taker fee.
  CLOB V2 determines fees at match time, and makers are currently uncharged
  while takers pay the market formula. [V2 migration](https://docs.polymarket.com/v2-migration)
- source-integrity and station-anomaly handling, including fail-closed behavior
  when rules, stations, precision, or revision cutoffs change;
- enough independently resolved shadow observations across cities, horizons,
  and weather regimes to pre-register a paper promotion threshold;
- a paper-only implementation with fixed caps and no ability to promote itself
  to live.

## Live execution gate

No reference live client should be copied. Any future live pass must use the
current CLOB V2 SDK and independently verify:

- signer, deposit/funder wallet, token allowance, balance, and authenticated
  heartbeat/cancel-all behavior;
- market tick, minimum size, negative-risk setting, and dynamic fee parameters;
- the public market WebSocket for fresh book, price, tick-size, and resolution
  events, plus the authenticated user channel for order/fill lifecycle. Polymarket
  recommends WebSockets instead of polling for live books.
  [Orderbook](https://docs.polymarket.com/trading/orderbook)
- FOK versus FAK behavior. FOK is all-or-nothing per order and FAK accepts
  partial fills; submitting several legs in one batch request does not make the
  group atomic. [Order lifecycle](https://docs.polymarket.com/concepts/order-lifecycle)
- geographic eligibility immediately before order placement. Polymarket
  provides a geoblock endpoint and says blocked-region orders are rejected.
  [Geographic restrictions](https://docs.polymarket.com/api-reference/geoblock)
- an explicit operator decision after a separately defined paper evidence
  window.

## Copy-trading caution

The public Data API exposes both positions and individual trades. A future
copy-research implementation should use timestamped trade records rather than
infer all activity from periodic position diffs, while still accounting for
reporting delay, selection bias, slippage, and exits.
[Data API trades](https://docs.polymarket.com/api-reference/core/get-trades-for-a-user-or-markets)

No strategy in this document is claimed to be profitable. Paper results,
markouts, ensemble probabilities, and Brier scores are evidence tools, not
returns or investment advice.
