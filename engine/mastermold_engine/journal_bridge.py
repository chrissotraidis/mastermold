"""Phase 2 bridge: TradingAgents memory loop <-> dashboard journal/outcome JSON.

Every engine briefing card writes a Phase A pending entry to ``TradingMemoryLog``
(already built into ``propagate()``); this bridge mirrors it as a
``DecisionJournalEntry`` and, after Phase B resolution, maps the measured result to an
``OutcomeScore`` and the Reflector's lesson to a ``ReflectionUpdate``. ``process_score``
stays operator-scored in the UI (it measures decision hygiene the engine cannot self-
grade honestly), so the bridge never emits it.

The building blocks are pure (standard library) and unit-testable; the memory-log read
and Reflector call are the integration seams that need the engine venv.
"""

from __future__ import annotations

from typing import Any, Optional


def card_to_pending_entry(card: dict[str, Any], *, falsification_condition: str) -> dict[str, Any]:
    """Mirror an actionable briefing card as a logged-before-outcome journal entry.

    The thesis is the PM rationale (carried on the card as bull/bear framing), the
    signals are the driver labels, and the falsification condition is PM-generated
    (open question 2). ``logged_at`` == the card's ``knowledge_time`` so the entry is
    provably logged before any outcome window opens.
    """
    return {
        "id": f"engine_journal_{card['date']}_{_symbol_of(card)}",
        "briefing_card_id": card["id"],
        "thesis": card.get("bull_case") or card.get("headline", ""),
        "signals": [d["label"] for d in card.get("drivers", [])],
        "conviction": card["conviction"],
        "horizon": card["horizon"],
        "falsification_condition": falsification_condition,
        "logged_at": card["knowledge_time"],
        "event_time": card["event_time"],
        "knowledge_time": card["knowledge_time"],
    }


def outcome_to_score(
    *,
    journal_entry_id: str,
    resolved_at: str,
    event_time: str,
    knowledge_time: str,
    alpha: float,
    direction: str,
    pnl_note: str,
) -> dict[str, Any]:
    """Map a Phase B result to an OutcomeScore.

    ``thesis_played_out`` = sign(alpha) matches the thesis direction.
    ``outcome_score`` scales alpha to a 0-10 score (5 == flat). ``process_score`` is
    intentionally omitted — it stays operator-scored in the UI.
    """
    bullish = direction == "bullish"
    played_out = (alpha > 0) if bullish else (alpha < 0)
    return {
        "id": f"score_{journal_entry_id}",
        "journal_entry_id": journal_entry_id,
        "resolved_at": resolved_at,
        "pnl_note": pnl_note,
        "thesis_played_out": played_out,
        "outcome_score": _scale_alpha(alpha if bullish else -alpha),
        "event_time": event_time,
        "knowledge_time": knowledge_time,
    }


def _scale_alpha(signed_alpha: float) -> float:
    """Map signed alpha (~ -0.1..0.1 over a short horizon) to a 0-10 score, 5 == flat."""
    score = 5.0 + signed_alpha * 50.0
    return round(max(0.0, min(10.0, score)), 1)


def _symbol_of(card: dict[str, Any]) -> str:
    return (card.get("asset_ids") or ["x"])[0].replace("asset_", "").upper()


def read_pending_from_memory_log(memory_log) -> list[dict[str, Any]]:  # pragma: no cover
    """Integration seam: read Phase A pending entries from TradingMemoryLog (engine venv)."""
    raise NotImplementedError("Reads TradingMemoryLog in the engine venv; see README.")
