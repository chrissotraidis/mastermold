# Wallet-Intelligence Lane — Evidence Audit (2026-08-10)

Deep audit of the first ~36 hours of resolved shadow signals (226 resolved,
10-12 followed wallets). This document records what the data actually says,
the three measurement defects it exposed, and the policy the paper follow-arm
now tests forward. Update it when the follow-arm sample grows.

## Headline findings

1. **The "news edge" was a classification artifact.** 119 of 137 resolved
   "news" signals were soccer match-winner markets ("Will CF América win on
   2026-08-09?") that the v1 classifier missed — no league slug prefix, no
   "vs" in the question. True news signals were 14-18 rows at roughly
   breakeven-to-negative. Classifier v2 (`classifyAnalystMarket`) closes the
   hole and reclassifies stored rows at boot in both the analyst and wallet
   stores.

2. **Signal-level expectancy overstates independence.** Wallet `0xdc41…` is
   itself a bot: it accumulated CF América in ~$45 clips every ~30 minutes
   for 14 hours at a constant 46¢. That is one decision producing 20
   winning "signals". The honest statistic is market-level (each market
   weighted once): `computeWalletEvidence` now reports both, and the
   market-level view is the headline.

3. **The edge is real but narrow: match-winner markets, mid-band entries.**
   Corrected, market-clustered expectancy at OUR lagged ask:

   | Kind | Markets | Market-level EV/$ |
   |---|---|---|
   | match_winner | 46 | **+0.24** |
   | esports_crypto | 60 | −0.08 |
   | news (true) | 8-14 | −0.15 |
   | spread | 8 | −0.30 |

   By entry band, match-winner only (signal-level): 35-55¢ **+1.10/$**
   (48W/53), 55-75¢ **+0.30/$** (30W/38), <35¢ −0.54/$, ≥75¢ −0.14/$.
   Longshots and heavy favorites are both negative; the band matters.

4. **Copy lag is cheap here.** Average slippage vs their fill was ~0.6¢ on
   match winners at ~10 min detection lag — these are slower positional
   accumulations, not news snipes, which is exactly the copyable profile.

## Caveats this document must keep repeating

- **One weekend of resolutions** (Aug 8-10), concentrated in Liga MX / MLS /
  Scandinavian and Portuguese leagues, driven mostly by two wallets. A hot
  sports weekend can look like skill.
- **The band policy is derived in-sample.** The follow-arm's forward results
  are the only out-of-sample test. Do not widen stakes or caps on the
  strength of the in-sample matrix.
- **Match-winner markets carry taker fees** (observed `takerBaseFee=1000` on
  Gamma). Shadow-signal expectancy ignores them; the follow-arm models them
  at entry (`walletFollowFeeUsd`, documented CLOB formula
  `rate × min(p, 1−p) × shares`) and stores the bps per row so P&L can be
  recomputed if the formula is wrong.

## The paper follow-arm (POLYMARKET_WALLET_FOLLOW=1)

Policy, hard-coded in `src/polymarket/wallets.ts`:

- Follows **match_winner** signals only, at OUR detected ask, within
  **35-75¢**, $5 paper stake, max 10 open, one per market, fees modeled at
  entry, hold to resolution.
- Settles in the wallet cycle's grading pass; realized P&L and fee totals in
  the `wallets.follow` block of `/api/polymarket`.
- Verdict bar before this arm influences any live-money discussion:
  **positive net (fee-adjusted) paper P&L over ≥30 resolved follows spanning
  more than one weekend**, alongside the existing lag-honest signal
  expectancy staying positive out-of-sample.

## Related fixes shipped with this audit

- Analyst news gate: cluster cap (`analystEventClusterKey`, max 3 pending per
  event family) so date-ladder markets (eleven Iranian-blockade variants)
  cannot fill the 40-resolved gate with one correlated outcome.
- Wallet discovery now filters by kind (news OR match_winner), not category —
  otherwise classifier v2 would have stopped sampling the flow the
  profitable wallets came from.
- Weather strict gate now states in its detail line that it cannot fill from
  the current provider (all Open-Meteo runs are partial-provenance);
  `market_relative` is the operative weather evidence view.
