# LLM forecasting on prediction markets — research memo (2026-09)

Status: research only. No code, configuration, or trading mode was changed.

## 1. Question and answer

Can a cheap LLM analyst beat Polymarket prices, and if so, where and how should Master Mold test it?

Probably not on its own, and not the way the `:online` lane was built. The best published systems reach roughly crowd level only with heavy retrieval, ensembling, and careful aggregation, and they are scored against forecasting crowds rather than liquid real-money markets. Halawi et al. (2024) got a Brier of 0.179 against a crowd aggregate of 0.149. On ForecastBench, standard models without scaffolding still trail the superforecaster median, and only tuned, tool-using tournament entries sit near or slightly above it. Master Mold's analyst is a single flash model with generic web search, so its measured result (Brier 0.2289 against the market's 0.2066 over 779 resolved forecasts) is what that evidence predicts. The cheap next step is to reuse the 779 graded rows offline, learn how far the model should be allowed to move away from the price, and test that out of sample before spending anything more on inference.

## 2. What the evidence says

- **Retrieval plus ensembling approaches the crowd without beating it.** Halawi et al. built a retrieval-augmented system that searches news, produces several forecasts, and aggregates them. On 914 test questions it scored Brier 0.179 and 71.5% accuracy, against 0.149 and 77.0% for the human crowd aggregate ([arXiv:2402.18563](https://arxiv.org/abs/2402.18563); [NeurIPS 2024](https://papers.nips.cc/paper_files/paper/2024/hash/5a5acfd0876c940d81619c1dc60e7748-Abstract-Conference.html); [summary](https://www.alignmentforum.org/posts/K2F9g2aQubd7kwEr3/approaching-human-level-forecasting-with-language-models-2)). Those questions come from forecasting platforms, and the paper's comparison is to a crowd. It says nothing about beating a liquid market after costs.
- **Plain models still trail humans; tuned systems reach parity.** ForecastBench scores with a difficulty-adjusted Brier Index, where higher is better and 50 means always answering 50% ([leaderboards](https://www.forecastbench.org/leaderboards/); [methodology](https://www.forecastbench.org/assets/pdfs/forecastbench_updated_methodology.pdf)). On the current boards the superforecaster median scores 68.0 on the baseline board (no tools) and 68.9 on the tournament board (search, scaffolding, and ensembling allowed) ([baseline](https://www.forecastbench.org/baseline/); [tournament](https://www.forecastbench.org/tournament/)). The best model entries sit a few points below the human median on the baseline board and near it on the tournament board; per-model scores change nightly and are not quoted here because they could not be re-verified.
- **Retrieved news can make forecasts worse.** arXiv:2607.20441 studies about 93,000 predictions on 111 Ukraine-related prediction markets across four models. It finds that English-language news pushed models toward predicting territorial capture, and that these biased calls were wrong 64–72% of the time. Adding Ukrainian military-analysis sources reduced the bias without removing it (Khandoga et al., "Belief Propagation in LLM World Models: Measuring Strategic Information Bias with Prediction Markets", May 2026, [arXiv:2607.20441](https://arxiv.org/abs/2607.20441)). **Correction for the repo:** `docs/analyst-lane.md` and `src/polymarket/analyst.ts` cite this paper as showing that conditioning on the market price beats the market. The paper uses market prices as a calibration *reference* for measuring source bias; its summary says nothing about conditioning on the market price beating the market, so that claim should be dropped from the repo.
- **Not verified here.** Searches for the Metaculus AI benchmark, Prophet Arena, and Paleka et al.'s "Pitfalls in evaluating language model forecasters" returned nothing usable in this pass. They are not cited, and no claim below depends on them.

## 3. How this maps to Master Mold

What already exists, per `src/polymarket/analyst.ts` and `src/llm/completion.ts`:

- A prompt that treats the price as a prior, a single call at temperature 0.1, and strict-JSON output with probability, confidence, and rationale.
- A 10-point edge gate that never bets on low confidence.
- Brier grading of both model and market on every row.
- Edge-bucket virtual $1 bets, a news/heartbeat split, event-cluster caps, and a self track-record line fed back into the prompt.
- LLM routing through OpenCode Go at a flat rate, with OpenRouter as the metered fallback. `POLYMARKET_ANALYST_MODEL` is unset, so `:online` is off.

Why `:online` probably underperformed, stated as hypotheses the stored data can test:

1. **Confidence was inverted.** High-confidence calls scored 0.2526 against the market's 0.1790 on the same markets. The model moved furthest exactly when it was wrong. The 2607.20441 result suggests one mechanism: generic search snippets carry slanted framing that a small model accepts as evidence.
2. **There was no aggregation.** Halawi and the top ForecastBench entries combine several forecasts. Master Mold used one low-temperature sample, which has the highest variance of any design.
3. **The sample was mostly sharply priced markets.** Most rows were heartbeat markets (sports, esports, daily crypto), where public information is already in the price within minutes. Generic search cannot add information there, only noise.
4. **The model was allowed to move without limit.** Nothing capped the size of a move away from the market prior. Any noisy forecaster scored against a well-calibrated market loses Brier when its moves are unshrunk.

What is missing:

- A post-hoc calibration or shrinkage layer.
- Multi-sample aggregation.
- A retrieval source with timestamp and provenance, so the analyst can see which source moved a forecast.
- Clustered significance testing on the news gate.
- An analysis of how analyst agreement relates to the wallet follow-arm.

## 4. BUILD list: shadow-mode experiments only

1. **Offline shrinkage fit on existing rows (first step).**
   - *Hypothesis:* `p = market + w·(model − market)` with a fitted `w` between 0 and 1, fitted per category and per confidence level, scores no worse than the market. Some category may show `w > 0`.
   - *Data:* the 779 graded rows, which need no new calls.
   - *Accounting:* none, because nothing trades. Split chronologically, and bootstrap by event cluster.
   - *Gate:* a held-out news `w` whose confidence interval excludes 0. Otherwise conclude that the model adds nothing and stop there.
   - *Effort:* about half a day, as a script or report.
2. **No-search ensemble on the flat-rate primary.**
   - *Hypothesis:* the median of 5 samples at temperature 0.7, shrunk with the `w` from experiment 1, cuts variance enough to reach market parity on news.
   - *Data:* forward news forecasts. OpenCode Go is flat rate, so the marginal cost is roughly zero, subject to rate limits. That is an estimate.
   - *Accounting:* Brier only, plus virtual bets at the recorded ask with taker fees applied using the documented formula.
   - *Gate:* at least 40 resolved news event clusters, ensemble Brier at or below market Brier, and positive fee-adjusted virtual P&L in the 5-point-and-up bucket.
   - *Effort:* about 1 day.
3. **Curated retrieval A/B test.**
   - *Hypothesis:* narrow, timestamped sources beat both no search and generic `:online`. Candidate sources are the resolution source named in the Gamma rules, official feeds, and a fixed news list.
   - *Data:* the same markets forecast with and without retrieval, with snippets stored for audit.
   - *Accounting:* retrieval cost per forecast, a freshness timestamp for every snippet, and a leakage check that each snippet predates the forecast.
   - *Gate:* a paired Brier improvement over the no-search arm on at least 40 clusters. Only a pass here counts as the "new evidence" that `AGENTS.md` requires before any web search returns.
   - *Effort:* 2–3 days.
4. **Analyst as a filter on the wallet follow-arm.**
   - *Hypothesis:* match-winner follows where the analyst does not disagree have higher fee-adjusted EV.
   - *Data:* follow-arm rows joined to analyst forecasts on the same market.
   - *Accounting:* the existing lag-honest ask and fee modeling. The lead itself is in-sample from one weekend, so treat any interaction as exploratory.
   - *Gate:* the pre-registered follow-arm verdict bar of at least 30 resolved follows across more than one weekend, with the filtered subset beating the unfiltered one.
   - *Effort:* about half a day.

## 5. SKIP list

- **Re-enabling OpenRouter `:online`.** It is metered on top of tokens and measured worse than the market, especially at high confidence.
- **LLM edge-seeking on heartbeat sports and crypto markets.** They are priced fast and carry taker fees, and no published result shows a latency-free LLM edge there.
- **Buying a premium model before experiment 1.** Even frontier baseline models trail the superforecaster median on ForecastBench. Model size does not fix an unshrunk, single-sample design.
- **Fine-tuning or building a scaffolding framework.** The labeled sample is too small, and it goes against the repo's do-not-over-engineer rule.
- **Treating the self track-record prompt line as learning.** It is uncontrolled context. Calibration should come from a fitted layer outside the model.

## 6. Open risks

- **Eligibility.** Polymarket's legal and geographic eligibility for the operator, and the tax treatment, need separate human review before any credentials or capital are used.
- **Venue rule changes.** Fee schedules (`takerBaseFee` on sports), resolution rules, and market supply can change and invalidate past gates.
- **False discovery.** Categories, buckets, and arms multiply the number of comparisons. Pre-register each gate, cluster by event, and keep a chronological holdout.
- **Contamination.** Model knowledge cutoffs and retrieved text published after the forecast time can leak outcomes. Store snippet timestamps.
- **Benchmark drift.** The ForecastBench figures above are one snapshot of a leaderboard that updates nightly.

## 7. Sources

- https://arxiv.org/abs/2402.18563
- https://papers.nips.cc/paper_files/paper/2024/hash/5a5acfd0876c940d81619c1dc60e7748-Abstract-Conference.html
- https://www.alignmentforum.org/posts/K2F9g2aQubd7kwEr3/approaching-human-level-forecasting-with-language-models-2
- https://www.forecastbench.org/leaderboards/
- https://www.forecastbench.org/baseline/
- https://www.forecastbench.org/tournament/
- https://www.forecastbench.org/assets/pdfs/forecastbench_updated_methodology.pdf
- https://arxiv.org/abs/2607.20441
