# Strategy Review — August 2026

Written 2026-08-01, before the planned system expansion (prediction-market
venue, broader scope). This is the honest record of what the current strategy
did and did not do, so the rebuild starts from evidence instead of memory.
All numbers are paper-mode results from the live daemon's own stores; the
snapshot date is 2026-08-01 and the paper book started at $1,000 with a $25
per-trade cap.

## Verdict up front

The current v2 trend-pullback book has **no demonstrated edge**. Equity after
three weeks of realized round trips is $999.27 — net **-$4.97** across 43
completed trades. The infrastructure around the strategy (risk caps,
kill-switch, shadow evaluation, promotion gates, honest cost model) worked as
designed; the entry/exit logic it was protecting did not make money. No
strategy has passed a promotion gate; the go-live gate has never opened. That
is the system working: paper mode's job was to answer "does this deserve real
money?" and the answer for this version is no.

## Results (realized round trips, 2026-07-16 → 2026-07-31)

| Metric | Value |
|---|---|
| Round trips with realized P&L | 43 |
| Win rate | 37% (16/43) |
| Net P&L | -$4.97 |
| Average win | +$0.27 |
| Average loss | -$0.34 |
| Book equity | $999.27 (from $1,000) |

Exit-reason breakdown (the story is here):

| Exit | Trips | Net P&L |
|---|---|---|
| Hard stops (-1.2% legacy, up to -3.0% dynamic) | 18 | **-$8.24** |
| Take profits (2R target, +2.4% to +6.4%) | 6 | +$3.03 |
| Armed trails | 15 | +$0.30 |
| Time stops (24h) | 4 | -$0.08 |

The nightly analyst memo (2026-08-01) on the most recent window: 17 round
trips, 52.9% win rate, expectancy +0.11bp — statistically zero. One meme-tier
asset (ANSEM) carried the window at +$1.38 while every major (SOL, WBTC,
WETH) lost.

## Shadow-signal calibration (the v3 lane's own scorecard)

The v3 alpha lane runs every candidate signal shadow-first and labels
outcomes. Calibration as of 2026-08-01, high-conviction bucket vs low:

| Signal | Separation | Reading |
|---|---|---|
| `xsec` | **-25bp (inverted)** | High-conviction picks lose more. Retired from ranking 2026-07-13; emits observation rows only. |
| `trending` | **-227bp (inverted)** | Worst offender. |
| `bar_portion` | ~0 | No separation either way. |
| `cusum_tb` | **+61bp (correct)** | Only directionally correct signal — but just 63 labeled samples, cusum edge ratio 0.15. |

Promotion state: all four strategies `ready: false, eligible: false`. Nothing
earned promotion in three weeks of continuous shadow evaluation.

## Pros — what this strategy generation got right

1. **Risk discipline held.** Caps ($25/trade), the hard-stop ladder, loss-streak
   pauses (24 in the last window), and the closed go-live gate meant a
   no-edge strategy cost $4.97, not the book. The failure mode was cheap.
2. **The system measured its own lack of edge.** Shadow labeling, forward
   outcome tracking, and the nightly analyst produced the calibration table
   above without human bookkeeping. Most hobby bots never learn they are
   losing; this one wrote it in its own memo.
3. **Honest execution accounting.** Quoted paper fills with fill-basis
   stamping, measured per-mint cost chains, and the 5bp/20s requote rule mean
   paper results are not inflated by fantasy fills.
4. **The v3 architecture is sound and reusable.** CUSUM event engine,
   per-strategy promotion gates, liquidity-tiered universe, pure/IO split with
   647 passing tests. The plumbing survives the strategy that ran through it —
   this is exactly what the expansion should build on.
5. **One genuine positive lead.** `cusum_tb` is the only signal whose
   high-conviction bucket outperforms (+61bp). Small sample, but it is the
   surviving hypothesis.

## Cons — why it lost

1. **Stop geometry eats the payoff math.** The design assumes 2R winners, but
   the -1.2% legacy hard stop is inside crypto intraday noise: 18 hard stops
   produced -$8.24, more than the entire net loss. Winners averaging +$0.27
   against losers averaging -$0.34 at a 37% win rate is negative expectancy by
   construction — the 2R target is rarely reached before the stop fires.
2. **Trend gates starve the book.** Six ANDed entry gates on time-based
   sampling generate few trades in quiet regimes (16+ skips for missing the
   +2.5% 24h gate by <0.6pp in one window). Patient is correct, but it also
   means three weeks bought only 63 labeled samples for the one promising
   signal — measurement is starving.
3. **The universe held the least exploitable assets.** Majors (SOL, WBTC,
   WETH) all lost; the single profitable name was a meme-tier asset. This
   matches the strategy pack's diagnosis: static majors have the least
   inefficiency to harvest.
4. **Two of four signals are inverted, one is flat.** Hand-scored momentum
   ideas (`xsec`, `trending`) actively point the wrong way; only the
   literature-derived event signal shows edge. Intuition lost to measurement.
5. **Even success would be economically irrelevant at this size.** With $25
   positions, a good month is single dollars. Paper mode measures edge, not
   income — fine — but it means the current configuration has no path to
   mattering without both an edge and a size/venue rethink.

## Implications for the expansion

- **Keep:** the v3 evidence loop (shadow → label → calibrate → promote), the
  risk constitution and gates, the honest cost model, the backup regime,
  per-strategy promotion. New venues (e.g. prediction markets) should enter
  as new candidate lanes on this plumbing, shadow-first, exactly like
  `cusum_tb` did.
- **Rebuild:** entry/exit geometry (stop distance vs target must survive
  measured volatility), signal set (retire inverted scorers; `cusum_tb` is
  the seed hypothesis), universe policy (majors-only is a dead end for edge).
- **Preserve the history.** The paper book, decisions, labels, and calibration
  data are the only assets three weeks of runtime produced. Runtime state is
  private and lives outside this repo (see [PRIVACY.md](PRIVACY.md) and the
  backup section of [OPERATIONS.md](OPERATIONS.md)); labeled off-repo
  snapshots exist as of 2026-08-01. A rebuild must migrate these stores, not
  reset them.

## Method note

Numbers were computed directly from the daemon's SQLite stores (trades with
realized P&L stamps, equity points, calibration observations, the analyst
memo singleton) on 2026-08-01. Realized-P&L stamping began 2026-07-16 with
the risk-based sizing change; earlier fills exist in the store but carry no
per-trip attribution, so they are excluded from the table above.
