"""The additive schema delta MasterMold needs from TradingAgents.

The integration plan calls for exactly three small, additive changes to the agent
schemas — everything else is mapping. Per the plan's constraint ("Engine
modifications go in the fork or the engine package, never as untracked edits inside
the cloned study copy"), these live here in the engine package rather than as edits
to `ref/TradingAgents/`. When the fork is pinned as a dependency, fold these three
additions into the fork's `tradingagents/agents/schemas.py`; until then the engine
imports them from here and registers them with the graph.

The three additions (and why each is free in a call the pipeline already makes):

1. DriverList — ONE structured-output call over all four analyst reports, distilling
   them into 2-4 drivers per card (Optimization 6a). The only genuinely new LLM step.
2. ResearchPlan.bull_case_summary / .bear_case_summary — two fields on the schema the
   Research Manager already fills, so the card's bull/bear cases come for free instead
   of a separate summarization call (Optimization 6b).
3. PortfolioDecision.falsification_condition — one field so the PM emits the journal's
   falsification condition directly (open question 2: PM-generated is the chosen
   default), preserving "logged before outcome" without a derivation pass.

Requires Python 3.10+ and pydantic v2 (the engine venv). Not imported by the
dashboard or the deterministic screener/conviction paths.
"""

from __future__ import annotations

import sys
from typing import Literal

from pydantic import BaseModel, Field


# --- Addition 1: DriverList -------------------------------------------------


class Driver(BaseModel):
    """One distilled driver behind a briefing card's thesis."""

    label: str = Field(description="Short driver label, e.g. 'Hyperscaler capex guide raised'. <= 8 words.")
    direction: Literal["bullish", "bearish"] = Field(
        description="Whether this driver supports the bull or the bear side."
    )
    weight: float = Field(
        ge=0.0, le=1.0,
        description="Relative importance of this driver to the thesis, 0-1. Strongest driver near 1.0.",
    )
    source_citation: str = Field(
        description="Which analyst report and date this came from, e.g. 'News Analyst — 2026-06-07 capex roundup'."
    )


class DriverList(BaseModel):
    """2-4 drivers distilled from all four analyst reports in a single call."""

    drivers: list[Driver] = Field(
        min_length=2, max_length=4,
        description=(
            "The 2-4 highest-signal drivers behind the recommendation, mixing both "
            "directions where the evidence does. Order by descending weight."
        ),
    )


DRIVER_EXTRACTOR_INSTRUCTION = (
    "Read the market, news, sentiment, and fundamentals analyst reports below. "
    "Distill the 2-4 highest-signal drivers behind the investment view. For each, give "
    "a short label, whether it is bullish or bearish, a 0-1 weight for its importance, "
    "and cite which analyst report it came from. Do not invent signals not present in "
    "the reports."
)


# --- Additions 2 & 3: extend the real fork schemas at runtime -----------------
#
# These two are FIELD additions to existing fork schemas, not new models. Rather than
# fork the schema in two places, we *subclass* the real TradingAgents schemas and add
# the fields — additive, so the original fields and the fork's markdown renderers keep
# working unchanged. The fork pins ``tradingagents``; until then ``load_fork_schemas``
# raises ImportError and the engine tests load the real schemas by path to prove the
# extension integrates. (See engine/tests/test_integration.py.)

_BULL_SUMMARY_DESC = (
    "2-3 sentence summary of the strongest bull argument from the debate, written for "
    "a dashboard card. Plain, specific, no hedging."
)
_BEAR_SUMMARY_DESC = (
    "2-3 sentence summary of the strongest bear argument from the debate, written for "
    "a dashboard card. Plain, specific, no hedging."
)
_FALSIFICATION_DESC = (
    "A single, concrete, observable condition that would prove this thesis wrong within "
    "the stated horizon — the journal's falsification test, logged before the outcome. "
    "State a measurable trigger, e.g. 'data-center revenue grows <10% QoQ next print' — "
    "not a vague 'if it falls'."
)


def _rebuild_with_base_namespace(cls: type[BaseModel], base: type[BaseModel]) -> None:
    """Resolve inherited forward-ref annotations (the fork uses PEP 563) against the
    base class's own module namespace so the extended model is fully defined."""
    ns = dict(vars(sys.modules[base.__module__]))
    cls.model_rebuild(force=True, _types_namespace=ns)


def extend_research_plan(base: type[BaseModel]) -> type[BaseModel]:
    """Return a subclass of the fork's ResearchPlan with the two card-summary fields."""

    class ResearchPlanExt(base):  # type: ignore[valid-type, misc]
        bull_case_summary: str = Field(description=_BULL_SUMMARY_DESC)
        bear_case_summary: str = Field(description=_BEAR_SUMMARY_DESC)

    ResearchPlanExt.__name__ = "ResearchPlan"
    _rebuild_with_base_namespace(ResearchPlanExt, base)
    return ResearchPlanExt


def extend_portfolio_decision(base: type[BaseModel]) -> type[BaseModel]:
    """Return a subclass of the fork's PortfolioDecision with the falsification field."""

    class PortfolioDecisionExt(base):  # type: ignore[valid-type, misc]
        falsification_condition: str = Field(description=_FALSIFICATION_DESC)

    PortfolioDecisionExt.__name__ = "PortfolioDecision"
    _rebuild_with_base_namespace(PortfolioDecisionExt, base)
    return PortfolioDecisionExt


def load_fork_schemas() -> dict:
    """Import the installed fork's schemas and return the delta-extended versions.

    Raises ImportError when ``tradingagents`` is not installed (i.e. outside the engine
    venv). The graph registers these extended schemas in place of the originals.
    """
    from tradingagents.agents.schemas import (  # type: ignore  # noqa: F401
        PortfolioDecision,
        ResearchPlan,
    )

    return {
        "ResearchPlan": extend_research_plan(ResearchPlan),
        "PortfolioDecision": extend_portfolio_decision(PortfolioDecision),
        "DriverList": DriverList,
    }
