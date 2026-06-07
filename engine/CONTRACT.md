# Engine ⇄ Dashboard contract (v1)

The Python engine and the Next.js dashboard talk through **files, not RPC**. One
JSON bundle per dated run lands in the data-drop directory; the dashboard reads the
newest valid bundle and falls back to seeds when none exists. Pydantic validates on
write, zod validates on read. If this file and the code ever disagree, the zod schema
in `src/db/engine-data.ts` and the Pydantic models in `engine/mastermold_engine/`
are the source of truth — this document explains them.

## Location & naming

- Directory: `engine/out/` (gitignored), overridable via `ENGINE_OUT_DIR`.
- One file per run date: `engine-run-YYYY-MM-DD.json`.
- The dashboard ingests the **newest** file by `run.run_date`. Re-running a date
  overwrites that date's file, which keeps ingestion **idempotent by run date**
  (Phase 1.5 SQLite import keys on `run_date`).

## Bitemporal honesty (non-negotiable)

Every artifact carries `event_time` and `knowledge_time`.

- `event_time` — when the fact was true in the world (e.g. the market session the run
  analyzed, a news item's publish time).
- `knowledge_time` — when the engine learned it / wrote the file. Stamped at
  file-write time by the engine. **Never backdated.** Ingestion never rewrites it.

The dashboard's as-of replay returns only rows with `knowledge_time <= as_of`, so a
bundle whose `knowledge_time` is in the future relative to the requested as-of is
correctly invisible. A bundle whose `run.knowledge_time` is in the future relative to
*wall-clock now* is rejected as a look-ahead violation.

## Bundle shape

```jsonc
{
  "schema_version": 1,
  "run": {
    "run_date": "2026-06-08",                 // YYYY-MM-DD, the analyzed session
    "event_time": "2026-06-08T13:30:00.000Z", // session open analyzed
    "knowledge_time": "2026-06-08T13:42:11.000Z", // when this file was written
    "provider": "anthropic",                  // single provider for both tiers
    "models": { "quick_think": "claude-haiku-4-5", "deep_think": "claude-sonnet-4-6" },
    "watchlist": ["NVDA", "HOOD", "BTC", "ETH", "aUSDC"],
    "triggered_tickers": ["NVDA"],            // earned a full agent run this day
    "cost": {                                 // from TradingAgents' StatsCallbackHandler
      "llm_calls": 34, "tool_calls": 12,
      "prompt_tokens": 120342, "completion_tokens": 8123,
      "usd": 0.42                             // 0 on a quiet day (no agent runs)
    },
    "stages": {                               // per-stage status, for /review
      "data_refresh": "ok", "screener": "ok",
      "agent_runs": 1, "outcome_resolution": "ok"
    }
  },

  "briefing_cards": [
    {
      // matches src/db/schema.ts BriefingCard, plus nested drivers
      "id": "engine_card_2026-06-08_NVDA",
      "date": "2026-06-08",
      "rank": 1,
      "headline": "NVIDIA: data-center demand reaccelerates into print",
      "why_now": "...",                       // News Analyst report distilled
      "relevance_note": "Largest equity weight in the watchlist.",
      "bull_case": "...",                     // ResearchPlan.bull_case_summary (added field)
      "bear_case": "...",                     // ResearchPlan.bear_case_summary (added field)
      "conviction": 8,                        // magnitude 1-10, see conviction.py
      "horizon": "3-6 months",                // PortfolioDecision.time_horizon
      "status": "actionable",                 // or "nothing_actionable"
      "asset_ids": ["asset_nvda"],            // resolved to seeded asset ids when known
      "event_time": "2026-06-08T13:30:00.000Z",
      "knowledge_time": "2026-06-08T13:42:11.000Z",
      "drivers": [
        {
          "id": "engine_driver_2026-06-08_NVDA_1",
          "briefing_card_id": "engine_card_2026-06-08_NVDA",
          "label": "Hyperscaler capex guide raised",
          "direction": "bullish",            // bullish | bearish
          "weight": 0.8,                      // 0-1, from DriverList extractor
          "color": "#34d399",                // assigned by direction (see adapter)
          "source_citation": "News Analyst — 2026-06-07 capex roundup",
          "event_time": "2026-06-08T13:30:00.000Z",
          "knowledge_time": "2026-06-08T13:42:11.000Z"
        }
      ]
    }
  ],

  "alerts": [
    {
      // matches src/db/schema.ts Alert; produced by the Stage-1 screener (no LLM)
      "id": "engine_alert_2026-06-08_NVDA_zret",
      "asset_id": "asset_nvda",
      "tier": "T1",                           // T0 | T1 | T2 by |z|
      "z_score": 2.4,
      "message": "NVDA 1-day return +4.1% (z=2.4)",
      "rationale": "Daily return is 2.4σ above its 30-session mean; screener trigger.",
      "created_at": "2026-06-08T13:42:11.000Z",
      "acknowledged": false,
      "useful_feedback": null,
      "event_time": "2026-06-08T13:30:00.000Z",
      "knowledge_time": "2026-06-08T13:42:11.000Z"
    }
  ],

  // Phase 2 (journal/memory loop). Empty arrays in Phase 1.
  "journal_sync": {
    "pending_entries": [
      // DecisionJournalEntry-shaped: thesis, signals[], conviction, horizon,
      // falsification_condition (PM-generated), logged_at, briefing_card_id.
      // Logged BEFORE the outcome window — today's new decisions.
    ],
    "resolved_entries": [
      // DecisionJournalEntry-shaped: decisions logged on earlier runs that this run
      // resolved. Carried so the dashboard's track-record-by-tier is self-contained.
    ],
    "outcomes": [
      // OutcomeScore-shaped: journal_entry_id, resolved_at, pnl_note,
      // thesis_played_out (sign(alpha) matches direction), outcome_score (alpha-scaled).
      // process_score stays operator-scored — the engine never emits it.
    ],
    "reflections": [
      // ReflectionUpdate-shaped: strategy_belief_id, evidence_summary,
      // significance_passed, applied. Output of the significance gate.
    ],
    "beliefs": [
      // StrategyBelief-shaped: confidence moved ONLY by beliefs.evaluate_gate
      // (N consistent same-direction outcomes). A single outcome cannot flip a belief.
    ]
  }
}
```

## Provenance

The dashboard stamps every fact it surfaces with a provenance label:

- `"Engine output"` — sourced from a valid bundle. Detail carries the run timestamp
  and model names so the operator can see *which* run and *which* models produced it.
- `"Demo data"` — sourced from `src/db/seed-data.ts`. The permanent zero-config
  fallback; also the review/demo mode.

A surface is never silently half-and-half: briefing cards and alerts come wholesale
from the bundle when one is present and valid, or wholesale from seeds when it is not.

## Validation & fallback rules (read side)

The dashboard treats a bundle as usable only if **all** hold:

1. JSON parses and matches the zod schema (`schema_version === 1`).
2. `run.knowledge_time` is not in the future relative to wall-clock now (no look-ahead).
3. At least one of `briefing_cards` / `alerts` is non-empty **or** a card explicitly
   carries `status: "nothing_actionable"` (an honest quiet day is valid, not empty).

Otherwise the dashboard falls back to seeds and surfaces a visible notice on
`/review` describing why (missing, unparseable, schema-invalid, or future-stamped).
