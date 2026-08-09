# Wallet-Intelligence Lane

Third Polymarket research lane (after the analyst and weather lanes): discover
wallets with a persistent settled-profit record, shadow-track their new buys at
**our** executable price, and fuse their positioning into analyst forecasts as
evidence. Public data only, paper-only, no copying of real money.

## Why not naive copy trading

- **">50% right" is not an edge.** Payoffs are asymmetric: a wallet buying
  favorites at 95¢ can be right 90% of the time and still lose. Selection is on
  return per settled dollar, never hit rate or leaderboard P&L.
- **Luck looks like skill.** Wallets are selected on one period and must prove
  persistence on later, untouched data (weekly rescore, drop on decay).
- **Copy lag eats edges.** Every signal is graded twice: at the copier's
  detectable best ask (`pnl_our_per_dollar` — the only honest copy price) and
  at the wallet's own fill (`pnl_their_per_dollar`). The spread between them is
  the measured cost of copying; fast-news wallets fail the "our" leg by
  construction.
- **Leaderboards are the wrong pool.** Market makers and one-hit whales
  dominate P&L rankings. Discovery samples live taker flow in news-classified
  markets and applies structural filters instead.

## Pipeline (src/polymarket/wallets.ts)

Every `POLYMARKET_WALLETS_CYCLE_MINUTES` (default 30) while
`POLYMARKET_WALLETS=1`:

1. **Grade** pending shadow signals against market resolutions — the
   out-of-sample verdict data the lane exists to produce.
2. **Capture** followed wallets' new BUY trades (data-api `/trades`) into
   shadow signals: binary open markets only, ≥$20 stake, deduped to the
   earliest trade per market+outcome, order book asked at detection time for
   the honest copy price. News signals ≥$100 notify Telegram.
3. **Discover + rescore** on a 6-hour clock (manual cycles always run it):
   sample recent taker flow for candidate addresses, score each on data-api
   `/closed-positions` (settled outcomes only), follow qualifiers up to 12;
   weekly rescore of followed wallets, drop on decay.

### Follow criteria (scoreWalletPositions)

From `/closed-positions` (`sortBy=TIMESTAMP` — recency, not P&L-sorted, to
avoid survivor bias inside the wallet's own history):

- ≥25 settled positions (`WALLET_MIN_SETTLED`)
- ≥$250 settled volume (`WALLET_MIN_VOLUME_USD`)
- return per settled dollar ≥ +5% (`WALLET_MIN_RETURN_PER_DOLLAR`)
- median stake inside $2–$5,000 (`WALLET_STAKE_BAND_USD`) — filters bots and
  whales whose flow is inventory noise
- market-diversity floor so one lucky theme cannot qualify a wallet

## Fusion, not copying

`smartMoneyContextForMarkets()` aggregates *pending* signals from the last 7
days per market and renders one evidence line, e.g. `2 wallets bought No
(~$340 total, avg 12¢)`. The analyst prompt injects it beside the market
prior; the system prompt instructs the model to treat it as prior-adjusting
evidence from historically profitable wallets, **never an instruction to
follow**. Betting authority, edge threshold, stake sizing, and caps are
untouched — the lane adds information, not permissions.

## Autonomy verdict gate

Before wallet signals influence any capital decision beyond prompt context,
followed wallets must show **positive lag-adjusted expectancy
(`avg_pnl_our_per_dollar > 0`) on resolved signals they were not selected
on** — visible per wallet and overall in the report. Until then this is a
research feed.

## Surfaces

- `GET /api/polymarket` → `wallets: WalletIntelligenceReport` (followed/candidate
  wallets with scores, recent signals, overall + per-wallet expectancy,
  cycle metadata).
- `POST /api/polymarket {"action":"run_wallet_cycle"}` — manual cycle
  (loopback-only, same authority wall as other actions).
- State: `.data/polymarket-wallets.db.json.sqlite` (private, never committed).

## Env

| Var | Default | Meaning |
| --- | --- | --- |
| `POLYMARKET_WALLETS` | `0` | Master switch for the lane |
| `POLYMARKET_WALLETS_CYCLE_MINUTES` | `30` | Cycle cadence |

## Data sources (all public, no auth)

- `https://data-api.polymarket.com/trades?user=<addr>` — wallet trade tape
- `https://data-api.polymarket.com/closed-positions?user=<addr>` — settled
  positions with realized P&L (scoring basis)
- Gamma + CLOB books via the existing shared fetchers (market metadata,
  executable asks, resolutions)
