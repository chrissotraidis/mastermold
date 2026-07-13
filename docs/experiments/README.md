# Parallel Paper Experiments

Mastermold runs strategy experiments as isolated paper accounts. Each arm gets
the same timestamped market observations and execution-cost model, but owns its
cash, positions, fills, limits, equity curve, pause state, and decision trace.
No experiment can submit a live intent or share the primary paper portfolio.

## Initial Cohort

| Arm | Strategy | Treatment |
| --- | --- | --- |
| `v2-control` | V2 trend-pullback | Unchanged benchmark logic |
| `v2-bp-veto` | V2 trend-pullback | Reject entries after a full-body up bar |
| `cusum-tb` | CUSUM + triple barrier | Trade only `cusum_tb` shadow candidates |
| `xsec` | Cross-sectional momentum | Trade only `xsec` shadow candidates |
| `trending` | Trending tokens | Trade only `trending` shadow candidates |

Every arm starts with synthetic $1,000 cash, caps entries at $25, limits open
positions to three, and uses the same modeled round-trip cost supplied by the
daemon. Configuration is hashed into the run. Changing a frozen parameter
starts a new run instead of rewriting prior evidence. The V2 parameter snapshot
and an explicit strategy-version label are part of that hash.

## Evidence Contract

The ignored local experiment database records:

- frozen run configuration and status;
- every accepted or blocked decision with its reason;
- entries, exits, fees, and realized P&L;
- open positions and high-water marks;
- five-minute equity marks;
- cash, drawdown, daily spend, and pause state.

The dashboard compares net P&L, net basis points, wins, expectancy, profit
factor, max drawdown, cost, turnover, and completed round trips. Confidence is
`provisional` below 30 exits, `directional` from 30 to 99, and `stronger` from
100 onward. Seven days is the first operational review, not a promotion gate.
No arm automatically changes another arm, the main paper strategy, or live
trading.

Generate or refresh the current private weekly review with:

```bash
bun run experiments:report
```

The report is written under ignored `reports/private/experiments/` and must not
be committed because a real installation's trading evidence is private. The
running daemon refreshes the current week's report every six hours; the command
is the manual fallback.

## Operating Rules

1. Do not tune an active run. Create a new frozen run.
2. Compare arms over the same timestamps and costs.
3. Diagnose inactivity from recorded rejections before lowering standards.
4. Treat small samples as evidence collection, not proof of edge.
5. Keep raw databases and generated reports local; commit only sanitized docs.
6. Pause a failing arm independently. The primary kill switch remains separate.

See [experiment template](TEMPLATE.md), [change log](CHANGELOG.md), and
[decision log](DECISIONS.md).
