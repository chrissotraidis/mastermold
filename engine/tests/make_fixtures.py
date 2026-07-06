"""Generate dashboard ingestion fixtures from the real adapter/assembly code.

These bundles are what a run *would* write to engine/out/. Producing them through
``adapter`` + ``assemble_run`` (rather than hand-authoring JSON) guarantees the
fixtures stay field-for-field faithful to the contract. The LLM-derived card text is
stubbed (no keys here); the deterministic shape, ids, drivers, alerts, conviction, and
bitemporal stamps are real.

    cd engine && python tests/make_fixtures.py
writes ../tests/fixtures/engine/engine-run-{active,quiet}.json under the repo root.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from mastermold_engine import adapter  # noqa: E402
from mastermold_engine.cost import RunCost  # noqa: E402
from mastermold_engine.journal_bridge import card_to_pending_entry  # noqa: E402
from mastermold_engine.run_briefing import assemble_run, run_screener_stage  # noqa: E402
from journal_fixture import build_journal_sync  # noqa: E402

REPO = Path(__file__).resolve().parent.parent.parent
FIX = REPO / "tests" / "fixtures" / "engine"

CONFIG = {
    "provider": "anthropic",
    "models": {"quick_think": "claude-haiku-4-5", "deep_think": "claude-sonnet-4-6"},
    "watchlist": [
        {"symbol": "NVDA", "asset_id": "asset_nvda"},
        {"symbol": "HOOD", "asset_id": "asset_hood"},
        {"symbol": "BTC", "asset_id": "asset_btc"},
        {"symbol": "ETH", "asset_id": "asset_eth"},
        {"symbol": "aUSDC", "asset_id": "asset_usdc_aave"},
    ],
    "screener": {"tiers": {"T0": 3.0, "T1": 2.0, "T2": 1.5}},
}

# Realistic-ish trailing series: daily returns ~2.2% std, volumes ~7% std, 1-2 news/day.
_NOISE = [0.018, -0.022, 0.031, -0.015, 0.024, -0.028, 0.012, -0.019, 0.026, -0.021,
          0.017, -0.024, 0.029, -0.016, 0.022, -0.027, 0.014, -0.020, 0.025, -0.018]
_VOL = [100.0, 93.0, 108.0, 91.0, 104.0, 96.0, 110.0, 89.0, 106.0, 99.0,
        102.0, 94.0, 107.0, 92.0, 103.0, 97.0, 109.0, 90.0, 105.0, 98.0]
_NEWS = [1.0, 2.0, 1.0, 2.0, 1.0, 2.0, 1.0, 2.0, 1.0, 2.0,
         1.0, 2.0, 1.0, 2.0, 1.0, 2.0, 1.0, 2.0, 1.0, 2.0]


def _calm(last_ret=0.004, last_vol=100.0, last_news=1.0):
    return {
        "return_z": _NOISE + [last_ret],
        "volume_z": _VOL + [last_vol],
        "news_count_z": _NEWS + [last_news],
    }


def build_active(run_date="2026-06-05"):
    et = f"{run_date}T13:30:00.000Z"
    kt = f"{run_date}T13:42:11.000Z"
    signals = {
        "NVDA": _calm(last_ret=0.071, last_vol=108.0, last_news=2.0),   # return z~3.2 T0 -> trigger
        "HOOD": _calm(last_ret=-0.041, last_vol=118.0, last_news=2.0),  # gap down on heavy volume -> trigger (bearish)
        "BTC": _calm(last_ret=0.050, last_vol=105.0, last_news=2.0),    # return z~2.3 T1 -> trigger
        "ETH": _calm(last_ret=0.006, last_vol=100.0, last_news=1.0),    # calm -> no trigger
        "aUSDC": _calm(last_ret=0.0005, last_vol=100.0, last_news=1.0), # calm -> no trigger
    }
    screens, triggered = run_screener_stage(
        CONFIG["watchlist"], signals, lookback=20, trigger_z=1.5, always_run={"NVDA"}
    )

    nvda_card = adapter.build_card(
        symbol="NVDA", asset_id="asset_nvda", run_date=run_date, event_time=et, knowledge_time=kt,
        pm_rating="Buy",
        headline="NVIDIA: data-center demand reaccelerates into the print",
        why_now="Two hyperscalers raised FY capex guidance this week and a supplier flagged tight HBM supply, lifting near-term revenue visibility ahead of earnings.",
        relevance_note="Largest equity weight in the watchlist; an always-run floor ticker.",
        bull_case="Capex upgrades from the top cloud buyers point to another beat-and-raise, and supply tightness supports pricing power through the next two quarters.",
        bear_case="The setup is crowded and the multiple already prices acceleration; any guide that merely meets expectations could trigger a sharp unwind.",
        time_horizon="3-6 months",
        drivers=[
            {"label": "Hyperscaler capex guide raised", "direction": "bullish", "weight": 0.85, "source_citation": "News Analyst — 2026-06-07 capex roundup"},
            {"label": "HBM supply tightening", "direction": "bullish", "weight": 0.62, "source_citation": "Fundamentals Analyst — supplier channel checks"},
            {"label": "Crowded positioning into print", "direction": "bearish", "weight": 0.55, "source_citation": "Sentiment Analyst — options skew"},
            {"label": "Multiple prices in acceleration", "direction": "bearish", "weight": 0.41, "source_citation": "Fundamentals Analyst — forward EV/S"},
        ],
        debate_confidence=0.78,
    )

    btc_card = adapter.build_card(
        symbol="BTC", asset_id="asset_btc", run_date=run_date, event_time=et, knowledge_time=kt,
        pm_rating="Overweight",
        headline="Bitcoin: ETF inflows resume as funding stays contained",
        why_now="Spot-ETF net inflows turned positive for a fifth straight session while perp funding held near neutral, a constructive combination after three weeks of outflows.",
        relevance_note="Core crypto holding; funding-rate context is thin on the free data tier (see /review).",
        bull_case="Persistent ETF demand against flat issuance tightens float, and contained funding means the move is spot-led rather than leverage-driven.",
        bear_case="A macro risk-off or a single large unlock could erase a week of inflows quickly; crypto data depth here is limited.",
        time_horizon="4-8 weeks",
        drivers=[
            {"label": "ETF net inflows resume", "direction": "bullish", "weight": 0.7, "source_citation": "News Analyst — 2026-06-07 flows"},
            {"label": "Funding near neutral", "direction": "bullish", "weight": 0.5, "source_citation": "Market Analyst — perp funding"},
            {"label": "Macro risk-off tail", "direction": "bearish", "weight": 0.45, "source_citation": "Sentiment Analyst — cross-asset"},
        ],
        debate_confidence=0.6,
    )

    hood_card = adapter.build_card(
        symbol="HOOD", asset_id="asset_hood", run_date=run_date, event_time=et, knowledge_time=kt,
        pm_rating="Underweight",
        headline="Robinhood: payment-for-order-flow scrutiny weighs on the print",
        why_now="A regulatory headline revived PFOF-ban speculation and the stock gapped down on heavy volume, with sell-side notes trimming transaction-revenue estimates.",
        relevance_note="Smaller equity weight; included because the down move cleared the screener.",
        bull_case="Rate-sensitive net-interest revenue and a growing funded-account base partly offset transaction-revenue risk.",
        bear_case="A PFOF ban would hit the highest-margin revenue line directly, and the volume spike suggests institutions are de-risking ahead of clarity.",
        time_horizon="1-3 months",
        drivers=[
            {"label": "PFOF-ban headline risk", "direction": "bearish", "weight": 0.8, "source_citation": "News Analyst — 2026-06-08 regulatory wire"},
            {"label": "Estimate cuts to transaction revenue", "direction": "bearish", "weight": 0.6, "source_citation": "Fundamentals Analyst — sell-side revisions"},
            {"label": "Net-interest revenue cushion", "direction": "bullish", "weight": 0.4, "source_citation": "Fundamentals Analyst — NIR mix"},
        ],
        debate_confidence=0.65,
    )

    cards = [nvda_card, btc_card, hood_card]

    cost = RunCost(llm_calls=34, tool_calls=12, prompt_tokens=121000, completion_tokens=8200)
    from mastermold_engine.cost import estimate_usd
    cost.usd = estimate_usd(cost.prompt_tokens, cost.completion_tokens, "claude-sonnet-4-6")

    pending_entries = [
        card_to_pending_entry(
            nvda_card,
            falsification_condition="Data-center revenue grows <10% QoQ at the next print, or NVDA closes below the 50-day moving average for three consecutive sessions.",
        )
    ]
    journal_sync = build_journal_sync(
        pending_entries, resolved_at=kt, knowledge_time=kt, event_time=et
    )

    return assemble_run(
        run_date=run_date, event_time=et, knowledge_time=kt, config=CONFIG,
        screens=screens, triggered=triggered, agent_cards=cards, cost=cost,
        journal_sync=journal_sync,
    )


def build_quiet(run_date="2026-06-04"):
    et = f"{run_date}T13:30:00.000Z"
    kt = f"{run_date}T13:41:02.000Z"
    signals = {e["symbol"]: _calm() for e in CONFIG["watchlist"]}
    screens, triggered = run_screener_stage(
        CONFIG["watchlist"], signals, lookback=20, trigger_z=1.5, always_run=set()
    )
    return assemble_run(
        run_date=run_date, event_time=et, knowledge_time=kt, config=CONFIG,
        screens=screens, triggered=triggered, agent_cards=[], cost=RunCost(),
    )


def main():
    FIX.mkdir(parents=True, exist_ok=True)
    active = build_active()
    quiet = build_quiet()
    (FIX / "engine-run-active.json").write_text(json.dumps(active, indent=2), encoding="utf-8")
    (FIX / "engine-run-quiet.json").write_text(json.dumps(quiet, indent=2), encoding="utf-8")
    print(f"wrote fixtures to {FIX}")
    print(f"  active: {len(active['briefing_cards'])} cards, {len(active['alerts'])} alerts, "
          f"triggered={active['run']['triggered_tickers']}, ${active['run']['cost']['usd']}")
    print(f"  quiet : {len(quiet['briefing_cards'])} cards, {len(quiet['alerts'])} alerts, "
          f"${quiet['run']['cost']['usd']}")


if __name__ == "__main__":
    main()
