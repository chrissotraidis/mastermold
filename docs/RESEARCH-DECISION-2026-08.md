# Master Mold research decision — August 2026

Status: **research complete; no strategy promotion**
Date: 2026-08-03
Scope: weather calibration, Polymarket maker execution, and Web3 funding/basis
Safety: no credentials, wallet, production authority, Zo deployment, paper/live order, or strategy-threshold change

## Executive decision

The new Polymarket tab is a useful **research and observability surface**, not an autonomous trader. The current evidence does not justify adding authority to weather, maker, momentum, book-pressure, or funding/basis strategies.

The next valuable work is narrowly defined data capture and falsification:

1. **Weather first:** archive issuance-time ensemble members, exact market rules/station mapping, and official observed extrema; then calibrate out of sample.
2. **Funding/basis second:** build a two-leg, execution- and margin-aware shadow ledger. The existing positive-funding screen is not an executable delta-neutral strategy.
3. **Maker last:** do not assume displayed spread capture. Authenticated order lifecycle plus authoritative on-chain fills and conservative queue accounting are prerequisites. A retail/VPS maker is especially exposed to latency and adverse-selection selection effects.

This ordering favors a plausible informational edge with modest infrastructure over latency competition or leveraged carry. None is currently proven profitable.

## What was researched

The ignored local corpus under `ref/research/` contains 32 source snapshots:

| Workstream | Primary papers | Current official sources | Core question |
|---|---:|---:|---|
| Weather calibration | 6 | 5 | Are raw ensemble-member frequencies calibrated for the exact resolution variable? |
| Polymarket maker execution | 6 | 5 | Does quoted spread survive queueing, fills, markout, inventory, fees, rebates, and latency? |
| Web3 funding/basis | 5 | 5 | Is the displayed carry executable after both legs, financing, margin, liquidation, and operational risk? |

Every cached source has retrieval metadata, URL, access/license note, SHA-256, key claims, assumptions, costs, limitations, applicability, contradictions, and confidence recorded in the ignored source indexes. Eight named acquire/read/challenge/synthesis iterations are recorded. PDF conclusions and decisive result pages were text-extracted and rendered/screenshot-checked; claims below are paraphrases rather than copied passages.

## Baseline truth from Master Mold

The code and local runtime agree on the safety boundary:

- Web3 and Polymarket execution modes are off and live authority remains locked.
- The Polymarket stream and brain collect useful public observations and forward markouts, but those observations do not contain an account’s queue position or authenticated maker fill lifecycle.
- Existing momentum and book-pressure observations have materially negative forward markouts in the current local sample. They are falsification evidence, not candidates for promotion.
- `maker_spread` has observation/resolution labels but no fill/queue/adverse-selection ledger. It cannot establish maker P&L.
- Weather output is explicitly shadow-only and uncalibrated.
- Funding ingestion is useful and stale-aware, but it observes one derivative venue; there is no implemented spot hedge, synchronized two-leg fill, or liquidation-capital simulation.

These statements intentionally omit wallet, account, holding, and private runtime details.

## Decision table

| Workstream | What the evidence says | What is missing in Master Mold | Decision now |
|---|---|---|---|
| Weather | Raw ensembles are commonly biased and under-dispersed. EMOS/BMA often improve calibration, but optimal windows and models vary by station, lead, geography, and model regime. Calibration requires sharpness and proper-score evaluation, not PIT/Brier alone. | Forecast run/model version, raw-member archive, market-rule hash, exact station/local-day/rounding mapping, official observed extrema with revisions, and walk-forward calibration. | **Proceed only with archive + evaluator.** Keep all weather probabilities shadow-only. Start with climatology/raw/EMOS; add BMA/time-series EMOS only if held-out diagnostics justify it. |
| Polymarket maker | Displayed spread is not realized spread. Public-feed aggressor inference can be near chance; queue position, cancellation location, order size, inventory, and adverse selection determine fills and P&L. Rebates apply only to actual executed maker liquidity and are competitive/ex-post. | Authenticated order IDs/lifecycle, on-chain `OrderFilled` join, conservative queue-ahead bounds, actual fees/rebates, partial fills, cancel races, latency clocks, inventory and executable unwind. | **Do not build an autonomous maker yet.** Collect public shadow data; later use an isolated paper/sandbox account if available. Promote only on lower-bound realized P&L, never displayed spread. |
| Funding/basis | Perpetual funding is a price-anchoring transfer, not guaranteed yield. Historical convergence backtests can look strong, while BIS evidence shows margin segmentation and carry spikes can predict short-side liquidations. Live basis execution studies find material, asymmetric wedges. | Spot leg, executable spot depth, synchronized fill ordering, hedge error, financing/borrow/opportunity cost, point-in-time margin, liquidation, gas/bridge/withdrawal, venue/oracle/stablecoin failure, and causal P&L components. | **Rename mentally as a funding monitor, not a delta-neutral trader.** Build a shadow two-leg ledger and collateral stress engine before considering paper execution. |

## 1. Weather betting: what a credible feature would trade

The intended weather feature is not “bet when many ensemble members land in a bin.” It would trade only when a calibrated issuance-time probability for the exact resolution event exceeds an executable market price by more than a conservative cost and uncertainty buffer.

For a market such as “highest temperature at airport X on local date D is Y°F,” the event definition must freeze:

- the market’s full resolution rules and named source;
- station identifier and any station/source mismatch;
- local-day boundary, max versus min, unit conversion, and integer-bin/rounding convention;
- numerical model, run initialization, model version, member values, interpolation, and retrieval time;
- observed source/product, quality flags, preliminary/final revision, and final resolved bin.

The first comparison should be seasonal climatology versus raw ensemble frequency versus simple Gaussian EMOS. A more complex BMA or seasonal/autoregressive EMOS is justified only after it improves untouched walk-forward CRPS/Brier and subgroup calibration. The literature’s 20-, 25-, 40-, 90-day, and multi-year choices are contradictory in a useful way: the training window is a parameter to validate, not a constant to copy.

Required test gates are defined in `ref/research/weather/notes/experiment-spec.md`. The minimum conclusion available today is **not calibrated; abstain**.

Key evidence: [Jobst, Möller, and Groß (2024)](https://arxiv.org/abs/2402.00555), [Díaz et al. (2018)](https://arxiv.org/abs/1809.04042), [Gneiting et al. (2005)](https://sites.stat.washington.edu/raftery/Research/PDF/gneiting2005.pdf), [Raftery et al. (2005)](https://sites.stat.washington.edu/raftery/Research/PDF/fadoua2005.pdf), [Gneiting, Balabdaoui, and Raftery (2007)](https://sites.stat.washington.edu/raftery/Research/PDF/Gneiting2007jrssb.pdf), and [Gneiting and Raftery (2007)](https://sites.stat.washington.edu/raftery/Research/PDF/Gneiting2007jasa.pdf). Operational constraints come from [ECMWF Open Data](https://www.ecmwf.int/en/forecasts/datasets/open-data), [Open-Meteo Ensemble API](https://open-meteo.com/en/docs/ensemble-api), [NOAA ISD](https://www.ncei.noaa.gov/products/land-based-station/integrated-surface-database), [AWC API](https://aviationweather.gov/data/api/), and [Polymarket resolution rules](https://docs.polymarket.com/concepts/resolution).

## 2. Polymarket maker: why the current simulator is optimistic

The current maker observation effectively asks whether a wide, deep book exists and records an assumed best-bid entry. It explicitly does not model the variables that decide whether a maker earns the spread:

1. **Queue:** displayed size ahead must trade or cancel before a resting order fills. Without order IDs, cancellation position is ambiguous and naïve models overestimate execution.
2. **Selection:** a resting quote is more likely to fill when someone wants to trade through it. The post-fill price path, not the pre-fill spread, reveals whether the fill was toxic.
3. **Direction truth:** a 2026 Polymarket study joined the public feed to on-chain fills and found public-feed trade-direction inference only about 59% accurate volume-weighted. Direction-dependent metrics need authoritative on-chain `OrderFilled` events.
4. **Lifecycle:** only the authenticated user channel can prove submit, acknowledge, rest, partial fill, confirm, cancel, fail, and remaining quantity for this account.
5. **Economics:** makers currently pay zero Polymarket fee, but rebates are paid only on executed maker liquidity, per market and ex post. Inventory liquidation, transfer/settlement, and adverse-selection markout still cost money.
6. **Latency:** Polymarket documents region-specific matching infrastructure and possible co-location. A general-purpose VPS must measure its actual submit/ack/cancel races rather than assume competitiveness.

The appropriate paper model reports pessimistic/base/optimistic queue bounds. A strategy fails if it is profitable only when every depth decrement is assumed to advance our order. It also fails if rebates are required to overcome negative 60-second/resolution markout.

Required lifecycle schema, P&L identity, minimum sample, and rejection gates are in `ref/research/polymarket-maker/notes/experiment-spec.md`.

Key evidence: [Dubach (2026)](https://arxiv.org/abs/2604.24366), [Huang, Lehalle, and Rosenbaum](https://arxiv.org/abs/1312.0563), [Cont, Kukanov, and Stoikov](https://arxiv.org/abs/1011.6402), [Guéant, Lehalle, and Fernandez-Tapia](https://arxiv.org/abs/1105.3115), [Xu, Gould, and Howison](https://arxiv.org/abs/1907.06230), and [Bodor and Carlier](https://arxiv.org/abs/2405.18594). Venue semantics and economics come from Polymarket’s current [market channel](https://docs.polymarket.com/market-data/websocket/market-channel), [user channel](https://docs.polymarket.com/market-data/websocket/user-channel), [fees](https://docs.polymarket.com/trading/fees), [maker rebates](https://docs.polymarket.com/market-makers/maker-rebates), and [trading overview](https://docs.polymarket.com/trading/overview).

## 3. Web3 funding/basis: what “delta neutral” must mean

A legitimate base trade is equal-filled-notional long spot plus short perpetual. Current positive funding can be part of expected P&L, but it is not the position and is not guaranteed to persist.

The ledger must separate:

`funding + basis convergence - entry/exit spread and impact - fees + rebates - financing/borrow opportunity cost - gas/transfer - rehedging - liquidation - residual delta P&L`.

This matters because two apparently conflicting research results are both plausible:

- A friction-aware historical perpetual study found high Sharpe for deviations beyond fee bands, often driven more by basis convergence than funding.
- BIS evidence shows apparently large carry reflects limits to arbitrage; separate collateral and basis widening can liquidate the short futures leg before convergence.

The correct response is not to choose the optimistic paper. It is to reproduce both mechanisms with Master Mold’s actual instruments, venues, point-in-time rules, executable depth, and conservative latency. A recent DeFi basis study reinforces the execution issue: its routed sample reported material side-asymmetric spot wedges and still excluded some costs; the paper also leaves a synchronized capacity frontier open.

Required fields, causal ledger, stresses, and evidence gates are in `ref/research/web3-funding-basis/notes/experiment-spec.md`.

Key evidence: [BIS Crypto carry](https://www.bis.org/publ/work1087.htm), [He et al. (2024)](https://arxiv.org/abs/2212.06888), [Ackerer, Hugonnier, and Jermann (2024)](https://arxiv.org/abs/2310.11771), [Kim and Park (2025)](https://arxiv.org/abs/2506.08573), and [Krestenko et al. (2026)](https://arxiv.org/abs/2605.05089). Drift-specific truth comes from the current [Data API glossary](https://docs.drift.trade/developers/data-api/glossary), [liquidation engine](https://docs.drift.trade/protocol/trading/liquidations/liquidation-engine), [perpetuals overview](https://docs.drift.trade/protocol/trading/perpetuals-trading), [auction behavior](https://docs.drift.trade/protocol/trading/perpetuals-trading/auction-parameters), and [risk documentation](https://docs.drift.trade/protocol/borrow-lend/amplify/risk).

## Residual risks that research cannot remove

| Risk | Why it remains | Required disposition |
|---|---|---|
| Regime/model drift | Forecast models, exchange APIs, fees, funding rules, and matching contracts change. | Store versions and raw payload hashes; segment evaluation at regime boundaries; fail stale/unknown. |
| Selection and survivorship | Only resolved/active/liquid markets or surviving tokens can inflate results. | Point-in-time universe including closed/delisted/no-trade cases; log abstentions and failed acquisitions. |
| Non-independence | Bins from one weather event, related Polymarket markets, and crypto assets share shocks. | Event/market/time-clustered splits and bootstrap; cap concentration. |
| Clock uncertainty | Queue and two-leg results can reverse at subsecond horizons. | Monotonic receive clocks, exchange/on-chain timestamps, measured skew and gap flags. |
| Operational/venue failure | RPC, oracle, bridge, smart contract, exchange, stablecoin, or network can fail asymmetrically. | Explicit stress and kill behavior; never infer safety from delta alone. |
| Legal/geographic/tax | Eligibility and treatment can change and are not resolved by a backtest. | Separate up-to-date human review before any credential or capital use. |
| Small-sample false discovery | Many markets/strategies/subgroups make a lucky winner likely. | Pre-registration, untouched test periods, multiple-testing control, minimum samples, and no manual cherry-picking. |

## Minimal implementation sequence

This is the smallest sensible next build, and it deliberately does not add trading authority:

1. Add immutable research schemas and append-only capture for weather issuance/outcomes, Polymarket raw public events, and Drift/spot synchronized quotes.
2. Add dataset-integrity reports: gaps, clock skew, duplicates, version changes, rule/station ambiguity, and point-in-time parameter coverage.
3. Add three offline evaluators matching the experiment specifications, with pre-registered configuration hashes and chronological splits.
4. Surface their status in `/review` and the existing tabs as `insufficient`, `failed`, or `shadow-qualified`; never convert missing evidence into zero or a pass.
5. Only after a shadow pass, design isolated paper capture for account-level order lifecycle. Live authority remains a separate manual project.

## Build / do-not-build conclusion

- **Build now:** weather provenance archive, official outcome alignment, offline calibration evaluator; public maker/on-chain research join; Web3 two-leg quote/margin shadow ledger.
- **Do not build now:** autonomous maker orders, weather paper/live betting, cross-venue carry execution, adaptive strategy tuning, or any wallet/credential flow.
- **Retire as claims:** “ensemble share equals probability,” “displayed spread equals maker profit,” and “positive funding equals delta-neutral yield.”

The honest status is that Master Mold now has useful research plumbing and a clear path to falsify three ideas. It still has no demonstrated profitable autonomous strategy, and the new research does not pretend otherwise.
