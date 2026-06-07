"""Map a TradingAgents PM rating + debate signal to a dashboard conviction/status.

Pure functions, standard library only, so this module is unit-testable without the
LLM stack, yfinance, or pydantic. The agent pipeline produces a 5-tier
``PortfolioRating`` (Buy / Overweight / Hold / Underweight / Sell); the dashboard's
``BriefingCard`` wants a 1-10 ``conviction`` magnitude and a ``status``.

Design decision (the plan is internally ambiguous here, so this is the resolution):

The plan sketches both "Sell=1-2" and "a high-conviction Sell renders honestly as a
bearish card, not a low score." Those conflict if a single number must be both a
*directional* score and a *strength* score. The dashboard schema settles it: a
``BriefingCard`` has a single ``conviction`` (1-10) and **no direction field**, while
each ``Driver`` carries ``direction`` (bullish | bearish). The journal also tiers
``conviction`` as *strength* ("7-10 high conviction").

So ``conviction`` here is the **magnitude of the view** (how strong, regardless of
side) and ``direction`` is returned separately for the adapter to colour drivers and
frame the bull/bear emphasis. A strong Sell therefore becomes a high-conviction
*bearish* card (conviction ~9, direction bearish), exactly as the "not a low score"
instruction asks — never a misleading conviction of 1.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

Rating = Literal["Buy", "Overweight", "Hold", "Underweight", "Sell"]
Direction = Literal["bullish", "bearish", "neutral"]
Status = Literal["actionable", "nothing_actionable"]

# Base conviction *magnitude* band per rating, before the debate-confidence nudge.
# Buy/Sell are strong-view ratings (high magnitude); Overweight/Underweight moderate;
# Hold is a weak/balanced view that sits at the actionable floor or collapses.
_BASE_MAGNITUDE: dict[str, int] = {
    "Buy": 9,
    "Sell": 9,
    "Overweight": 6,
    "Underweight": 6,
    "Hold": 4,
}

_DIRECTION: dict[str, Direction] = {
    "Buy": "bullish",
    "Overweight": "bullish",
    "Hold": "neutral",
    "Underweight": "bearish",
    "Sell": "bearish",
}


@dataclass(frozen=True)
class Conviction:
    conviction: int          # 1-10 magnitude of view strength
    direction: Direction     # bullish | bearish | neutral
    status: Status           # actionable | nothing_actionable


def map_conviction(
    rating: str,
    *,
    debate_confidence: float = 0.5,
    strong_driver_count: int = 0,
) -> Conviction:
    """Map a PM ``rating`` to a dashboard conviction.

    Args:
        rating: one of Buy / Overweight / Hold / Underweight / Sell.
        debate_confidence: 0-1 signal from the judges / debate margin. Nudges the
            magnitude by up to +/-1 within the rating's band so a lopsided debate
            reads stronger than a coin-flip one. Defaults to 0.5 (neutral nudge).
        strong_driver_count: number of drivers with weight above the "strong"
            threshold. A Hold with no strong drivers collapses to
            ``nothing_actionable`` — the honest, zero-cost quiet-day outcome.

    Raises:
        ValueError: on an unknown rating, so a provider drift never silently maps to
            a default conviction.
    """
    key = rating.strip().title()
    if key not in _BASE_MAGNITUDE:
        raise ValueError(f"unknown PM rating: {rating!r}")

    base = _BASE_MAGNITUDE[key]
    nudge = round((_clamp01(debate_confidence) - 0.5) * 2)  # -1, 0, or +1
    magnitude = _clamp(base + nudge, lo=1, hi=10)

    direction = _DIRECTION[key]

    status: Status = "actionable"
    if key == "Hold" and strong_driver_count == 0:
        status = "nothing_actionable"

    return Conviction(conviction=magnitude, direction=direction, status=status)


def conviction_tier(conviction: int) -> str:
    """Mirror the dashboard's journal tiers so engine and UI agree on bucketing."""
    if conviction <= 3:
        return "1-3"
    if conviction <= 6:
        return "4-6"
    return "7-10"


def _clamp(value: int, *, lo: int, hi: int) -> int:
    return max(lo, min(hi, value))


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))
