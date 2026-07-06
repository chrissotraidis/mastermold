"""Offline tests for the engine's deterministic mapping modules.

No keys, no network, no LLM stack. Runs under pytest *or* as a plain script:

    cd engine && python tests/test_deterministic.py

Importable on Python 3.9+ (the modules use `from __future__ import annotations`).
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from mastermold_engine import adapter, beliefs, conviction, journal_bridge, screener  # noqa: E402
from mastermold_engine.cost import from_stats_handler  # noqa: E402
from mastermold_engine.run_briefing import (  # noqa: E402
    adapter_detail,
    assemble_run,
    build_tradingagents_config,
    run_agent_stage,
    run_screener_stage,
)
from mastermold_engine.cost import RunCost  # noqa: E402


# --- conviction -------------------------------------------------------------

def test_conviction_buy_is_high_bullish_actionable():
    c = conviction.map_conviction("Buy", debate_confidence=0.9, strong_driver_count=3)
    assert c.direction == "bullish"
    assert c.conviction >= 8
    assert c.status == "actionable"


def test_conviction_strong_sell_is_high_magnitude_bearish_not_low_score():
    # The "not a low score" rule: a confident Sell is a high-conviction bearish card.
    c = conviction.map_conviction("Sell", debate_confidence=0.9, strong_driver_count=2)
    assert c.direction == "bearish"
    assert c.conviction >= 8, "strong Sell must read as high conviction, not 1-2"


def test_conviction_hold_without_strong_drivers_collapses():
    c = conviction.map_conviction("Hold", debate_confidence=0.5, strong_driver_count=0)
    assert c.status == "nothing_actionable"
    c2 = conviction.map_conviction("Hold", debate_confidence=0.5, strong_driver_count=2)
    assert c2.status == "actionable"


def test_conviction_unknown_rating_raises():
    try:
        conviction.map_conviction("Moon")
    except ValueError:
        return
    raise AssertionError("unknown rating should raise")


# --- screener ---------------------------------------------------------------

def test_zscore_flat_series_is_zero():
    r = screener.zscore([5.0] * 10, lookback=8)
    assert r is not None and r.z == 0.0


def test_zscore_spike_triggers():
    series = ([1.0, -1.0] * 10) + [10.0]  # baseline std == 1.0, latest is 10σ out
    r = screener.zscore(series, lookback=20)
    assert r is not None and r.z > 3.0


def test_tier_mapping():
    tiers = {"T0": 3.0, "T1": 2.0, "T2": 1.5}
    assert screener.tier_for(3.5, tiers) == "T0"
    assert screener.tier_for(2.2, tiers) == "T1"
    assert screener.tier_for(1.6, tiers) == "T2"
    assert screener.tier_for(1.0, tiers) is None


def test_is_triggered_honours_always_run():
    s = screener.TickerScreen(symbol="X", asset_id=None)
    assert screener.is_triggered(s, trigger_z=1.5, always_run=True) is True
    assert screener.is_triggered(s, trigger_z=1.5, always_run=False) is False


# --- adapter ----------------------------------------------------------------

def _sample_drivers():
    return [
        {"label": "Capex raised", "direction": "bullish", "weight": 0.8, "source_citation": "News"},
        {"label": "Valuation stretched", "direction": "bearish", "weight": 0.4, "source_citation": "Fund."},
    ]


def test_build_card_shape_and_driver_colors():
    card = adapter.build_card(
        symbol="NVDA", asset_id="asset_nvda", run_date="2026-06-08",
        event_time="2026-06-08T13:30:00.000Z", knowledge_time="2026-06-08T13:42:11.000Z",
        pm_rating="Buy", headline="NVDA reaccelerates", why_now="capex", relevance_note="top weight",
        bull_case="demand", bear_case="valuation", time_horizon="3-6 months",
        drivers=_sample_drivers(), debate_confidence=0.8,
    )
    assert card["id"] == "engine_card_2026-06-08_NVDA"
    assert card["asset_ids"] == ["asset_nvda"]
    assert card["status"] == "actionable"
    assert card["drivers"][0]["weight"] >= card["drivers"][1]["weight"]  # sorted desc
    colors = {d["direction"]: d["color"] for d in card["drivers"]}
    assert colors["bullish"] == "#34d399" and colors["bearish"] == "#fb7185"
    for d in card["drivers"]:
        assert d["briefing_card_id"] == card["id"]
        assert d["event_time"] and d["knowledge_time"]


def test_rank_cards_orders_by_conviction_and_strips_internal_key():
    c1 = adapter.build_card(
        symbol="A", asset_id="a", run_date="2026-06-08", event_time="t", knowledge_time="t",
        pm_rating="Overweight", headline="A", why_now="", relevance_note="", bull_case="",
        bear_case="", time_horizon="1m", drivers=_sample_drivers(), debate_confidence=0.5)
    c2 = adapter.build_card(
        symbol="B", asset_id="b", run_date="2026-06-08", event_time="t", knowledge_time="t",
        pm_rating="Buy", headline="B", why_now="", relevance_note="", bull_case="",
        bear_case="", time_horizon="1m", drivers=_sample_drivers(), debate_confidence=0.9)
    ranked = adapter.rank_cards([c1, c2])
    assert ranked[0]["headline"] == "B"  # higher conviction first
    assert ranked[0]["rank"] == 1 and ranked[1]["rank"] == 2
    assert "_direction" not in ranked[0]


# --- run_briefing: quiet day funnel ----------------------------------------

_CONFIG = {
    "provider": "openrouter",
    "openrouter_base_url": "https://openrouter.ai/api/v1",
    "models": {"quick_think": "deepseek/deepseek-chat", "deep_think": "deepseek/deepseek-chat"},
    "selected_analysts": ["market", "social", "news", "fundamentals"],
    "watchlist": [{"symbol": "NVDA", "asset_id": "asset_nvda"}, {"symbol": "BTC", "asset_id": "asset_btc"}],
    "screener": {"tiers": {"T0": 3.0, "T1": 2.0, "T2": 1.5}},
}


def test_quiet_day_zero_cost_nothing_actionable():
    # Flat signals -> nothing triggers -> no agent cards -> nothing_actionable, $0.
    flat = {"return_z": [0.0] * 25, "volume_z": [100.0] * 25, "news_count_z": [1.0] * 25}
    screens, triggered = run_screener_stage(
        _CONFIG["watchlist"], {"NVDA": flat, "BTC": flat},
        lookback=20, trigger_z=1.5, always_run=set(),
    )
    assert triggered == []
    bundle = assemble_run(
        run_date="2026-06-08", event_time="2026-06-08T13:30:00.000Z",
        knowledge_time="2026-06-08T13:42:11.000Z", config=_CONFIG,
        screens=screens, triggered=triggered, agent_cards=[], cost=RunCost(),
    )
    assert bundle["schema_version"] == 1
    assert bundle["run"]["cost"]["usd"] == 0.0
    cards = bundle["briefing_cards"]
    assert len(cards) == 1 and cards[0]["status"] == "nothing_actionable"
    assert bundle["run"]["triggered_tickers"] == []


def test_quiet_agent_stage_skips_graph_and_records_metadata():
    cards, cost, status, detail = run_agent_stage(
        config=_CONFIG,
        screens=[],
        triggered=[],
        run_date="2026-06-08",
        event_time="2026-06-08T13:30:00.000Z",
        knowledge_time="2026-06-08T13:42:11.000Z",
    )
    assert cards == []
    assert cost.llm_calls == 0
    assert status == "quiet_no_agent_runs"
    assert detail["status"] == "skipped"
    assert detail["attempted_graph"] is False
    assert detail["provider"] == "openrouter"
    assert detail["base_url"] == "https://openrouter.ai/api/v1"


def test_tradingagents_config_receives_openrouter_backend_and_models():
    defaults = {
        "llm_provider": "anthropic",
        "backend_url": "https://api.anthropic.com",
        "quick_think_llm": "old-fast",
        "deep_think_llm": "old-deep",
    }
    merged = build_tradingagents_config(defaults, _CONFIG)
    assert merged["llm_provider"] == "openrouter"
    assert merged["backend_url"] == "https://openrouter.ai/api/v1"
    assert merged["quick_think_llm"] == "deepseek/deepseek-chat"
    assert merged["deep_think_llm"] == "deepseek/deepseek-chat"
    assert merged["temperature"] == 0.2


def test_adapter_detail_records_selected_analysts():
    detail = adapter_detail(
        mode="auto",
        status="attempting",
        config=_CONFIG,
        reason="test",
        attempted_graph=True,
        fallback=None,
    )
    assert detail["selected_analysts"] == ["market", "social", "news", "fundamentals"]


def test_cost_conversion_reads_tradingagents_token_fields():
    handler = type("Handler", (), {
        "llm_calls": 3,
        "tool_calls": 5,
        "tokens_in": 1200,
        "tokens_out": 340,
    })()
    cost = from_stats_handler(
        handler,
        quick_model="deepseek/deepseek-chat",
        deep_model="deepseek/deepseek-chat",
    )
    assert cost.llm_calls == 3
    assert cost.tool_calls == 5
    assert cost.prompt_tokens == 1200
    assert cost.completion_tokens == 340
    assert cost.usd > 0


def test_active_day_emits_alert_and_triggers():
    # Realistic baselines carry small variance; the final session spikes well beyond it.
    noise = [0.005, -0.004, 0.006, -0.005, 0.004, -0.003, 0.005, -0.006, 0.003, -0.004] * 2
    vol_noise = [100.0, 98.0, 103.0, 97.0, 101.0, 99.0, 102.0, 96.0, 104.0, 100.0] * 2
    spike = {"return_z": noise + [0.08], "volume_z": vol_noise + [260.0], "news_count_z": [1.0, 2.0] * 10 + [2.0]}
    calm = {"return_z": noise + [0.004], "volume_z": vol_noise + [100.0], "news_count_z": [1.0, 2.0] * 10 + [1.0]}
    screens, triggered = run_screener_stage(
        _CONFIG["watchlist"], {"NVDA": spike, "BTC": calm},
        lookback=20, trigger_z=1.5, always_run=set(),
    )
    assert "NVDA" in triggered and "BTC" not in triggered
    bundle = assemble_run(
        run_date="2026-06-08", event_time="2026-06-08T13:30:00.000Z",
        knowledge_time="2026-06-08T13:42:11.000Z", config=_CONFIG,
        screens=screens, triggered=triggered, agent_cards=[], cost=RunCost(),
    )
    assert any(a["asset_id"] == "asset_nvda" for a in bundle["alerts"])
    for a in bundle["alerts"]:
        assert a["tier"] in {"T0", "T1", "T2"} and a["event_time"] and a["knowledge_time"]


# --- beliefs significance gate ---------------------------------------------

def test_gate_needs_n_consistent_outcomes():
    refl = [beliefs.ReflectionInput("b1", alpha=0.02, created_at=f"2026-06-0{i}") for i in range(1, 5)]
    res = beliefs.evaluate_gate(refl, n=5)
    assert res is not None and res.significance_passed is False  # only 4 < 5


def test_gate_passes_on_five_consistent_and_moves_confidence():
    refl = [beliefs.ReflectionInput("b1", alpha=0.02, created_at=f"2026-06-0{i}") for i in range(1, 6)]
    res = beliefs.evaluate_gate(refl, n=5)
    assert res.significance_passed is True and res.direction == "supports"
    assert beliefs.apply_delta(0.5, res.confidence_delta) > 0.5


def test_gate_blocks_on_mixed_signs():
    refl = [beliefs.ReflectionInput("b1", alpha=a, created_at=f"2026-06-0{i}")
            for i, a in enumerate([0.02, -0.01, 0.03, 0.02, 0.01], start=1)]
    res = beliefs.evaluate_gate(refl, n=5)
    assert res.significance_passed is False  # one outcome can't flip; mixed blocks


# --- journal bridge ---------------------------------------------------------

def test_outcome_played_out_logic():
    bull = journal_bridge.outcome_to_score(
        journal_entry_id="j1", resolved_at="t", event_time="t", knowledge_time="t",
        alpha=0.03, direction="bullish", pnl_note="up 3% vs SPY")
    assert bull["thesis_played_out"] is True and bull["outcome_score"] > 5
    assert "process_score" not in bull  # stays operator-scored
    bear_right = journal_bridge.outcome_to_score(
        journal_entry_id="j2", resolved_at="t", event_time="t", knowledge_time="t",
        alpha=-0.03, direction="bearish", pnl_note="down 3%")
    assert bear_right["thesis_played_out"] is True


def _run_all():
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    passed = 0
    for fn in fns:
        fn()
        passed += 1
        print(f"  ok  {fn.__name__}")
    print(f"\n{passed}/{len(fns)} deterministic engine tests passed")


if __name__ == "__main__":
    _run_all()
