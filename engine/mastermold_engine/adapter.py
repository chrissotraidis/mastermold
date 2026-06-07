"""Stage 4 export adapter: agent outputs -> dashboard bundle JSON.

The pipeline produces prose reports plus three structured artifacts (ResearchPlan,
PortfolioDecision, DriverList). This module maps those into the
`engine-run-YYYY-MM-DD.json` bundle described in ``engine/CONTRACT.md``, field-for-
field against `src/db/schema.ts`. The building blocks are pure functions (standard
library only) so the mapping is unit-testable without the LLM stack: ``run_briefing``
parses the structured artifacts, then hands plain values to ``build_card`` here.
"""

from __future__ import annotations

from typing import Any, Iterable, Optional

from .conviction import map_conviction
from .screener import SignalReading, TickerScreen, alert_message, alert_rationale, tier_for

# Driver colours by direction, matching the dashboard's emerald/rose palette tones.
_DRIVER_COLOR = {"bullish": "#34d399", "bearish": "#fb7185"}
STRONG_DRIVER_WEIGHT = 0.6


def build_driver(
    card_id: str,
    index: int,
    *,
    label: str,
    direction: str,
    weight: float,
    source_citation: str,
    event_time: str,
    knowledge_time: str,
) -> dict[str, Any]:
    return {
        "id": f"{card_id}_d{index}",
        "briefing_card_id": card_id,
        "label": label,
        "direction": direction,
        "weight": round(float(weight), 3),
        "color": _DRIVER_COLOR.get(direction, "#94a3b8"),
        "source_citation": source_citation,
        "event_time": event_time,
        "knowledge_time": knowledge_time,
    }


def build_card(
    *,
    symbol: str,
    asset_id: Optional[str],
    run_date: str,
    event_time: str,
    knowledge_time: str,
    pm_rating: str,
    headline: str,
    why_now: str,
    relevance_note: str,
    bull_case: str,
    bear_case: str,
    time_horizon: str,
    drivers: Iterable[dict[str, Any]],
    debate_confidence: float = 0.5,
) -> dict[str, Any]:
    """Assemble a single BriefingCard (+ nested drivers) from parsed agent output."""
    card_id = f"engine_card_{run_date}_{symbol}"
    driver_dicts = list(drivers)
    strong = sum(1 for d in driver_dicts if float(d.get("weight", 0)) >= STRONG_DRIVER_WEIGHT)

    conv = map_conviction(
        pm_rating, debate_confidence=debate_confidence, strong_driver_count=strong
    )

    built_drivers = [
        build_driver(
            card_id,
            i + 1,
            label=d["label"],
            direction=d["direction"],
            weight=d["weight"],
            source_citation=d["source_citation"],
            event_time=event_time,
            knowledge_time=knowledge_time,
        )
        for i, d in enumerate(driver_dicts)
    ]
    # Heaviest drivers first; ties broken by label for deterministic output.
    built_drivers.sort(key=lambda d: (-d["weight"], d["label"]))

    return {
        "id": card_id,
        "date": run_date,
        "rank": 0,  # assigned by rank_cards once the whole watchlist is built
        "headline": headline,
        "why_now": why_now,
        "relevance_note": relevance_note,
        "bull_case": bull_case,
        "bear_case": bear_case,
        "conviction": conv.conviction,
        "horizon": time_horizon,
        "status": conv.status,
        "asset_ids": [asset_id] if asset_id else [],
        "event_time": event_time,
        "knowledge_time": knowledge_time,
        "drivers": built_drivers,
        # carried for ranking + journal bridge, not part of the card schema:
        "_direction": conv.direction,
    }


def nothing_actionable_card(*, run_date: str, event_time: str, knowledge_time: str) -> dict[str, Any]:
    """The honest quiet-day card: nothing triggered, zero LLM spend."""
    card_id = f"engine_card_{run_date}_quiet"
    return {
        "id": card_id,
        "date": run_date,
        "rank": 1,
        "headline": "Nothing actionable today",
        "why_now": "No watchlist ticker cleared the screener; no material change detected.",
        "relevance_note": "A quiet day is a first-class outcome — no agent runs, no LLM cost.",
        "bull_case": "",
        "bear_case": "",
        "conviction": 0,
        "horizon": "—",
        "status": "nothing_actionable",
        "asset_ids": [],
        "event_time": event_time,
        "knowledge_time": knowledge_time,
        "drivers": [],
        "_direction": "neutral",
    }


def rank_cards(cards: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Rank actionable cards by descending conviction; drop the internal _direction key."""
    actionable = [c for c in cards if c["status"] == "actionable"]
    actionable.sort(key=lambda c: (-c["conviction"], c["headline"]))
    if actionable:
        ranked = actionable
    else:
        # Only quiet-day card(s): keep one, ranked first.
        ranked = cards[:1]
    for i, card in enumerate(ranked):
        card["rank"] = i + 1
        card.pop("_direction", None)
    return ranked


def build_alert(
    screen: TickerScreen,
    reading: SignalReading,
    tier: str,
    *,
    run_date: str,
    event_time: str,
    knowledge_time: str,
) -> dict[str, Any]:
    return {
        "id": f"engine_alert_{run_date}_{screen.symbol}_{reading.name}",
        "asset_id": screen.asset_id,
        "tier": tier,
        "z_score": round(reading.z, 2),
        "message": alert_message(screen.symbol, reading),
        "rationale": alert_rationale(reading),
        "created_at": knowledge_time,
        "acknowledged": False,
        "useful_feedback": None,
        "event_time": event_time,
        "knowledge_time": knowledge_time,
    }


def build_alerts_from_screens(
    screens: Iterable[TickerScreen],
    tiers: dict[str, float],
    *,
    run_date: str,
    event_time: str,
    knowledge_time: str,
) -> list[dict[str, Any]]:
    """Emit one alert per ticker for its peak-|z| signal that clears T2."""
    alerts: list[dict[str, Any]] = []
    for screen in screens:
        reading = screen.peak_reading
        if reading is None:
            continue
        tier = tier_for(abs(reading.z), tiers)
        if tier is None:
            continue
        alerts.append(
            build_alert(
                screen, reading, tier,
                run_date=run_date, event_time=event_time, knowledge_time=knowledge_time,
            )
        )
    # Highest tier first (T0 < T1 < T2 lexically already), then by |z| desc.
    alerts.sort(key=lambda a: (a["tier"], -abs(a["z_score"])))
    return alerts


def assemble_bundle(
    *,
    run_meta: dict[str, Any],
    cards: list[dict[str, Any]],
    alerts: list[dict[str, Any]],
    journal_sync: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    return {
        "schema_version": 1,
        "run": run_meta,
        "briefing_cards": cards,
        "alerts": alerts,
        "journal_sync": journal_sync
        or {"pending_entries": [], "outcomes": [], "reflections": []},
    }
