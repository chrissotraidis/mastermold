"""Integration test: the schema delta against the REAL TradingAgents schemas.

The deterministic unit tests cover the mapping math; this proves the part that
actually touches the upstream framework:

1. The additive fork delta (DriverList + ResearchPlan bull/bear summaries +
   PortfolioDecision.falsification_condition) applies to the *real* TradingAgents
   pydantic models — the extended schemas keep every original field AND validate the
   new ones.
2. Real structured-agent outputs (instances of those extended schemas) plus a real
   ``AgentState``-shaped final_state flow through the adapter / journal_bridge /
   assembly into a contract-shaped bundle.
3. Every artifact produced from real agent output carries non-empty event_time and
   knowledge_time, with knowledge_time never before event_time and never in the
   future (no backdating / no look-ahead).

It writes the resulting bundle to tests/fixtures/engine-integration/ so a Bun test
(tests/engine-integration-contract.test.ts) can validate the SAME file against the
zod contract — a cross-language proof that a bundle built from real TradingAgents
schema instances passes the dashboard's ingestion schema.

Requires pydantic (the engine venv). The full LLM run still requires provider keys;
this isolates and proves the integration seam without them. Run:

    /tmp/mm-engine-venv/bin/python engine/tests/test_integration.py
"""

import importlib.util
import json
import sys
import pytest
from datetime import datetime, timezone
from pathlib import Path

ENGINE = Path(__file__).resolve().parent.parent
REPO = ENGINE.parent
sys.path.insert(0, str(ENGINE))

from mastermold_engine import adapter, screener  # noqa: E402
from mastermold_engine.cost import RunCost, estimate_usd  # noqa: E402
from mastermold_engine.journal_bridge import card_to_pending_entry, outcome_to_score  # noqa: E402
from mastermold_engine.run_briefing import assemble_run  # noqa: E402
from mastermold_engine.schemas import (  # noqa: E402
    DriverList,
    extend_portfolio_decision,
    extend_research_plan,
)

# Load the REAL TradingAgents schemas module directly by path (the package __init__
# pulls in langgraph; the schemas module's only deps are pydantic + stdlib). When the
# fork is pip-installed this is just `from tradingagents.agents.schemas import ...`.
_TA_SCHEMAS = REPO / "ref" / "TradingAgents" / "tradingagents" / "agents" / "schemas.py"


def _load_real_ta_schemas():
    if not _TA_SCHEMAS.exists():
        pytest.skip("optional ignored ref/TradingAgents checkout is not installed")
    spec = importlib.util.spec_from_file_location("ta_schemas_real", _TA_SCHEMAS)
    module = importlib.util.module_from_spec(spec)
    # Register before exec so the module's own globals (PortfolioRating, etc.) are
    # resolvable by name when the extended subclasses rebuild forward refs. With the
    # pip-installed fork this is just `import tradingagents.agents.schemas`.
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_delta_extends_real_schemas():
    ta = _load_real_ta_schemas()
    ResearchPlanExt = extend_research_plan(ta.ResearchPlan)
    PortfolioDecisionExt = extend_portfolio_decision(ta.PortfolioDecision)

    rp_fields = set(ResearchPlanExt.model_fields)
    # original fork fields preserved
    assert {"recommendation", "rationale", "strategic_actions"} <= rp_fields
    # additive fields present
    assert {"bull_case_summary", "bear_case_summary"} <= rp_fields

    pm_fields = set(PortfolioDecisionExt.model_fields)
    assert {"rating", "executive_summary", "investment_thesis"} <= pm_fields
    assert "falsification_condition" in pm_fields

    # the extended schemas actually validate with the new fields populated
    plan = ResearchPlanExt(
        recommendation=ta.PortfolioRating.BUY,
        rationale="Bull case carried the debate on capex acceleration.",
        strategic_actions="Initiate, size to 5%, add on a pullback to the 50-day.",
        bull_case_summary="Capex upgrades point to a beat-and-raise; supply tightness supports pricing.",
        bear_case_summary="Crowded into the print; any in-line guide risks a sharp unwind.",
    )
    assert plan.recommendation == ta.PortfolioRating.BUY
    assert plan.bull_case_summary.startswith("Capex")

    decision = PortfolioDecisionExt(
        rating=ta.PortfolioRating.BUY,
        executive_summary="Initiate long; 3-6 month horizon; stop on a 50-day breakdown.",
        investment_thesis="Data-center demand reaccelerates into the print on hyperscaler capex.",
        time_horizon="3-6 months",
        falsification_condition="Data-center revenue grows <10% QoQ at the next print.",
    )
    assert decision.falsification_condition.startswith("Data-center")

    # DriverList (the only genuinely new model) validates and enforces 2-4 drivers.
    drivers = DriverList(
        drivers=[
            {"label": "Hyperscaler capex guide raised", "direction": "bullish", "weight": 0.85, "source_citation": "News Analyst"},
            {"label": "Crowded positioning into print", "direction": "bearish", "weight": 0.55, "source_citation": "Sentiment Analyst"},
        ]
    )
    assert len(drivers.drivers) == 2
    return ta, plan, decision, drivers


def _real_final_state(run_date, plan, decision):
    """A final_state with the real AgentState keys (markdown reports + judge decisions)."""
    return {
        "company_of_interest": "NVDA",
        "asset_type": "stock",
        "trade_date": run_date,
        "market_report": "Price reclaimed the 50-day on rising volume; RSI 61, not yet extended.",
        "sentiment_report": "Options skew rich into the print; retail attention elevated.",
        "news_report": "Two hyperscalers raised FY capex guidance; supplier flagged tight HBM supply.",
        "fundamentals_report": "Forward EV/S elevated but DC revenue growth reaccelerating.",
        "investment_plan": plan.rationale,
        "trader_investment_plan": "Buy; entry on strength, stop below the 50-day.",
        "final_trade_decision": decision.executive_summary,
    }


def test_real_agent_output_flows_through_adapter_with_bitemporal_stamps():
    ta, plan, decision, drivers = test_delta_extends_real_schemas()

    run_date = "2026-06-03"
    event_time = f"{run_date}T13:30:00.000Z"
    knowledge_time = f"{run_date}T13:42:11.000Z"
    now = datetime(2026, 6, 7, 0, 0, tzinfo=timezone.utc)

    final_state = _real_final_state(run_date, plan, decision)
    assert final_state["company_of_interest"] == "NVDA"  # uses the real AgentState shape

    # Map the REAL structured objects into a dashboard card.
    card = adapter.build_card(
        symbol=final_state["company_of_interest"],
        asset_id="asset_nvda",
        run_date=run_date,
        event_time=event_time,
        knowledge_time=knowledge_time,
        pm_rating=decision.rating.value,                 # real PortfolioRating enum
        headline="NVIDIA: data-center demand reaccelerates into the print",
        why_now=final_state["news_report"],
        relevance_note="Largest equity weight in the watchlist.",
        bull_case=plan.bull_case_summary,                # added ResearchPlan field
        bear_case=plan.bear_case_summary,                # added ResearchPlan field
        time_horizon=decision.time_horizon or "3-6 months",
        drivers=[d.model_dump() for d in drivers.drivers],  # real DriverList -> drivers
        debate_confidence=0.78,
    )
    assert card["conviction"] >= 8 and card["status"] == "actionable"  # Buy -> high conviction

    # Journal entry uses the PM-generated falsification condition (added PM field).
    pending = card_to_pending_entry(card, falsification_condition=decision.falsification_condition)
    assert pending["falsification_condition"] == decision.falsification_condition
    assert pending["thesis"]  # PM rationale / bull case carried over

    # A resolved outcome via the bridge (Phase B shape), to exercise outcomes too.
    outcome = outcome_to_score(
        journal_entry_id=pending["id"], resolved_at=knowledge_time,
        event_time=event_time, knowledge_time=knowledge_time,
        alpha=0.03, direction="bullish", pnl_note="+3.0% vs SPY over the window",
    )

    # A deterministic screener alert over a synthetic series (no LLM in this path).
    series = ([0.018, -0.022, 0.031, -0.015, 0.024, -0.028] * 4) + [0.072]
    sig = {"return_z": series, "volume_z": [100.0] * len(series), "news_count_z": [1.0] * len(series)}
    sc = screener.screen_ticker("NVDA", "asset_nvda", sig, lookback=20)

    config = {
        "provider": "anthropic",
        "models": {"quick_think": "claude-haiku-4-5", "deep_think": "claude-sonnet-4-6"},
        "watchlist": [{"symbol": "NVDA", "asset_id": "asset_nvda"}],
        "screener": {"tiers": {"T0": 3.0, "T1": 2.0, "T2": 1.5}},
    }
    cost = RunCost(llm_calls=34, tool_calls=12, prompt_tokens=121000, completion_tokens=8200)
    cost.usd = estimate_usd(cost.prompt_tokens, cost.completion_tokens, "claude-sonnet-4-6")

    bundle = assemble_run(
        run_date=run_date, event_time=event_time, knowledge_time=knowledge_time,
        config=config, screens=[sc], triggered=["NVDA"], agent_cards=[card], cost=cost,
        journal_sync={
            "pending_entries": [pending], "resolved_entries": [],
            "outcomes": [outcome], "reflections": [], "beliefs": [],
        },
    )

    # --- Bitemporal honesty on EVERY artifact built from real agent output ---
    now_ms = now.timestamp() * 1000
    artifacts = []
    for c in bundle["briefing_cards"]:
        artifacts.append(c)
        artifacts.extend(c["drivers"])
    artifacts.extend(bundle["alerts"])
    artifacts.extend(bundle["journal_sync"]["pending_entries"])
    artifacts.extend(bundle["journal_sync"]["outcomes"])
    assert artifacts, "expected artifacts to check"
    for art in artifacts:
        assert art.get("event_time"), f"missing event_time: {art.get('id')}"
        assert art.get("knowledge_time"), f"missing knowledge_time: {art.get('id')}"
        et = _ms(art["event_time"])
        kt = _ms(art["knowledge_time"])
        assert kt >= et, f"knowledge_time before event_time (backdated): {art.get('id')}"
        assert kt <= now_ms, f"knowledge_time in the future (look-ahead): {art.get('id')}"

    # The run itself is also honestly stamped and not in the future.
    assert _ms(bundle["run"]["knowledge_time"]) <= now_ms
    assert bundle["alerts"], "screener should have emitted an alert for the spike"

    # Write the real-schema-derived bundle for the cross-language zod contract check.
    out = REPO / "tests" / "fixtures" / "engine-integration"
    out.mkdir(parents=True, exist_ok=True)
    (out / f"engine-run-{run_date}.json").write_text(json.dumps(bundle, indent=2), encoding="utf-8")
    return bundle


def _ms(iso: str) -> float:
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp() * 1000


def _run_all():
    test_delta_extends_real_schemas()
    print("  ok  test_delta_extends_real_schemas")
    bundle = test_real_agent_output_flows_through_adapter_with_bitemporal_stamps()
    print("  ok  test_real_agent_output_flows_through_adapter_with_bitemporal_stamps")
    print(
        f"\nintegration OK — real TA schema delta -> bundle: "
        f"{len(bundle['briefing_cards'])} card(s), {len(bundle['alerts'])} alert(s), "
        f"conviction={bundle['briefing_cards'][0]['conviction']}, wrote fixture for zod check"
    )


if __name__ == "__main__":
    _run_all()
