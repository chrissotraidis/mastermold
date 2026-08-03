# Master Mold gated hardening review — 2026-08-03

This is the decision record from the end-to-end hardening pass. It records what
the application is useful for, what the evidence rejects, and what remains
locked. It contains no account, wallet, credential, or private portfolio data.

## Product decision

Master Mold is a personal investment **decision and evidence system**. Its
useful loop is: current sources → a short Today decision inbox → explicit
Save/Watch/Pass response → provenance-linked journal outcome and lesson. It is
not currently a profitable autonomous trader, and the UI, health route, and
review surface must not imply otherwise.

The Web3 entry strategy is retired. Polymarket live execution is unavailable.
The Polymarket momentum baseline and all weather output remain shadow-only.
Missing or stale portfolio/report inputs cannot create a scored journal call.

## Gated findings

| Gate | Observed result | Decision |
| --- | --- | --- |
| Access and secret handling | Remote reads require configured credentials; remote viewer writes, cross-origin writes, and excessive mutation attempts fail closed. Browser-entered keys are session-only and excluded from backup. | Keep. No public bind without distinct operator/viewer credentials. |
| Product truth | Service uptime and decision readiness are separate. The global kill control is explicitly a UI drill; Web3 and Polymarket authority are separately reported. | Keep live trading locked. |
| Decision loop | Today exposes at most three plays and persists Save/Watch/Pass. A saved call carries report/source provenance; stale or sample context can only be watched or passed. | This is the primary product value. Grade outcomes instead of adding more dashboards. |
| Recovery | Daily snapshots are assembled atomically, use private permissions, and reject corrupt same-day snapshots. `npm run backup:verify` restores into an isolated temp directory and validates JSON plus SQLite integrity without touching live `.data/`. | Run the drill after migrations and at least monthly. |
| Web3 autonomy | The retired directional strategy has negative evidence. Funding/basis and pair-relative-value are multi-leg hypotheses without synchronized paper execution. | They are now explicitly excluded from paper promotion and live candidacy; stale stored authority is automatically demoted. |
| Polymarket autonomy | In the 2026-08-03 local evidence snapshot, momentum had 763 one-hour labels with a −318.4 bp mean and 4% hit rate; book pressure had 397 labels with a −378.1 bp mean and 2% hit rate. | Reject both as entry strategies. Do not tune thresholds around this result. |
| Weather | The archive had rules, stations, resolutions, and 12 raw ensemble captures, but zero admissible aligned cases because all captures lacked a stable model-run identifier and official station outcomes were not yet archived. | Useful research plumbing, no calibrated probability and no bet. |

## Online re-check and redirection

Current official Polymarket documentation confirms that fees are determined
per market at match time, maker rebates depend on liquidity that actually
executes, post-only orders can be rejected, fills have a multi-stage lifecycle,
and geographic eligibility must be checked before order placement. These facts
reinforce the existing decision not to treat displayed spread, a batch request,
or a VPS quote as realized profit:

- [Polymarket fees](https://docs.polymarket.com/trading/fees)
- [Maker rebates](https://docs.polymarket.com/market-makers/maker-rebates)
- [Order lifecycle](https://docs.polymarket.com/concepts/order-lifecycle)
- [Geographic restrictions](https://docs.polymarket.com/api-reference/geoblock)

For weather, current Open-Meteo documentation exposes model-update metadata,
but also warns that its distributed API is eventually consistent. The
operational ensemble response still does not bind its values to an immutable
run ID. Open-Meteo's Single Runs API preserves an exact initialization time,
but a future implementation must first prove that the selected exact-run
source supplies the same required ensemble members and was available before
the trading decision. A separate metadata lookup must not be loosely joined to
an ensemble response and called complete provenance:

- [Model updates and availability](https://open-meteo.com/en/docs/model-updates)
- [Single Runs API](https://open-meteo.com/en/docs/single-runs-api)
- [Ensemble API](https://open-meteo.com/en/docs/ensemble-api)
- [Polymarket resolution rules](https://docs.polymarket.com/concepts/resolution)

The existing ignored `ref/research/` corpus already contains the needed papers,
official source snapshots, experiment specifications, hashes, and limitations
for weather calibration, Polymarket making, and Web3 funding/basis. More broad
paper collection is not the bottleneck. Valid point-in-time data is.

## Residual risks and required disposition

| Residual risk | Current disposition |
| --- | --- |
| No strategy has demonstrated positive net expectancy | Keep every autonomous entry lane off. A losing system does not improve by executing faster. |
| Weather run provenance and official observed extrema are missing | Capture an immutable exact run and authoritative station outcome, or abstain. Never synthesize historical forecast runs. |
| Funding/pair screens omit synchronized legs, margin, and liquidation | Observe only. No paper promotion until an adapter records both fills, clock gap, residual delta, all costs, margin, and stress. |
| Maker queue, adverse selection, and account fill lifecycle are absent | Do not build an autonomous maker. If revisited, start with authenticated paper lifecycle capture and pessimistic queue bounds. |
| Strategies and markets are dependent; samples invite false discovery | Pre-register one hypothesis, use chronological/event-clustered evaluation, retain abstentions, and keep an untouched test period. |
| Venue rules, fees, geoblocking, APIs, and legal treatment can change | Re-check primary sources before any credential or capital pass. This review grants no legal or trading authority. |
| One VPS remains a failure domain | Keep off-host snapshots, monitor disk/age, and run the isolated restore drill. A local backup alone is not disaster recovery. |

## Next evidence gate

Do not add another strategy now. Let the current collectors run while the
operator uses and grades the Today loop. The next autonomous-strategy build is
authorized only when one narrowly scoped proposal includes all of the
following before implementation:

1. exact point-in-time source and outcome contracts;
2. an execution model matching every required leg;
3. frozen costs, sample floor, chronological split, rejection rule, and
   concentration limit;
4. shadow evidence that passes without threshold changes;
5. a separate paper adapter with fixed caps and automatic downside-only
   demotion;
6. an explicit human decision. Live authority remains a later project.
