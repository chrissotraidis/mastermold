"""Build the Phase-2 journal_sync block for the dashboard fixtures.

Produces resolved engine decisions across conviction tiers (with measured alpha →
OutcomeScore via journal_bridge), plus StrategyBeliefs whose confidence is moved ONLY
through the real significance gate (beliefs.evaluate_gate), so the dashboard's track
record and "reflection significance gate" surfaces are computed from genuine engine
output shapes — not hand-faked. No keys/network: the bridge and gate are pure.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from mastermold_engine import beliefs, journal_bridge  # noqa: E402


def _entry(eid, briefing_card_id, thesis, signals, conviction, horizon, fals, logged_at):
    et = logged_at
    return {
        "id": eid,
        "briefing_card_id": briefing_card_id,
        "thesis": thesis,
        "signals": signals,
        "conviction": conviction,
        "horizon": horizon,
        "falsification_condition": fals,
        "logged_at": logged_at,
        "event_time": et,
        "knowledge_time": logged_at,
    }


# Six resolved decisions spanning the 1-3 / 4-6 / 7-10 tiers, logged across May and
# resolved by the run. (conviction, direction, alpha, won?) drives the track record.
_RESOLVED = [
    ("engine_journal_2026-05-12_NVDA", "Megacap AI momentum into capex season", ["Capex guide raised", "HBM tight"], 9, "bullish", 0.041, "2026-05-12T13:30:00.000Z"),
    ("engine_journal_2026-05-14_MSFT", "Cloud reacceleration underappreciated", ["Azure bookings", "Copilot attach"], 8, "bullish", 0.022, "2026-05-14T13:30:00.000Z"),
    ("engine_journal_2026-05-15_TSLA", "Delivery miss thesis on demand softening", ["Inventory days up", "Price cuts"], 8, "bearish", 0.012, "2026-05-15T13:30:00.000Z"),
    ("engine_journal_2026-05-18_HOOD", "PFOF overhang priced too lightly", ["Reg headline", "Estimate cuts"], 5, "bullish", -0.019, "2026-05-18T13:30:00.000Z"),
    ("engine_journal_2026-05-20_BTC", "ETF inflows resume after washout", ["Net inflows", "Funding neutral"], 6, "bullish", 0.016, "2026-05-20T13:30:00.000Z"),
    ("engine_journal_2026-05-22_ETH", "Exploratory L2 fee-burn tilt", ["Fee burn", "Restaking"], 2, "bullish", 0.006, "2026-05-22T13:30:00.000Z"),
]


def build_journal_sync(pending_entries, *, resolved_at, knowledge_time, event_time):
    resolved_entries = []
    outcomes = []
    for eid, thesis, signals, conviction, direction, alpha, logged_at in _RESOLVED:
        resolved_entries.append(
            _entry(eid, None, thesis, signals, conviction, "4-8 weeks",
                   "Alpha vs benchmark turns against the thesis over the horizon.", logged_at)
        )
        outcomes.append(
            journal_bridge.outcome_to_score(
                journal_entry_id=eid, resolved_at=resolved_at,
                event_time=event_time, knowledge_time=knowledge_time,
                alpha=alpha, direction=direction,
                pnl_note=f"{'+' if alpha >= 0 else ''}{alpha * 100:.1f}% vs benchmark over the window",
            )
        )

    beliefs_block, reflections = _build_beliefs(knowledge_time, event_time)

    return {
        "pending_entries": pending_entries,
        "resolved_entries": resolved_entries,
        "outcomes": outcomes,
        "reflections": reflections,
        "beliefs": beliefs_block,
    }


def _belief(bid, name, statement, confidence, knowledge_time):
    return {
        "id": bid,
        "name": name,
        "statement": statement,
        "confidence": round(confidence, 4),
        "updated_at": knowledge_time,
        "event_time": knowledge_time,
        "knowledge_time": knowledge_time,
    }


def _reflection(rid, belief_id, summary, significance_passed, applied, created_at):
    return {
        "id": rid,
        "strategy_belief_id": belief_id,
        "evidence_summary": summary,
        "significance_passed": significance_passed,
        "applied": applied,
        "created_at": created_at,
        "event_time": created_at,
        "knowledge_time": created_at,
    }


def _build_beliefs(knowledge_time, event_time):
    """Move belief confidence ONLY through beliefs.evaluate_gate (the real gate)."""
    # Belief A: five consistent positive outcomes -> gate passes, confidence nudges up.
    a_refl = [beliefs.ReflectionInput("belief_ai_momentum", alpha=a, created_at=d)
              for a, d in [(0.02, "2026-05-12"), (0.018, "2026-05-14"), (0.03, "2026-05-16"),
                           (0.012, "2026-05-19"), (0.025, "2026-05-21")]]
    a_gate = beliefs.evaluate_gate(a_refl, n=5)
    a_conf = beliefs.apply_delta(0.55, a_gate.confidence_delta if a_gate else 0.0)

    # Belief B: mixed signs -> gate blocks, confidence held (one outcome can't flip it).
    b_refl = [beliefs.ReflectionInput("belief_crypto_meanrevert", alpha=a, created_at=d)
              for a, d in [(0.02, "2026-05-13"), (-0.015, "2026-05-17"), (0.01, "2026-05-20"),
                           (-0.008, "2026-05-22"), (0.004, "2026-05-24")]]
    b_gate = beliefs.evaluate_gate(b_refl, n=5)
    b_conf = beliefs.apply_delta(0.50, b_gate.confidence_delta if b_gate else 0.0)

    beliefs_block = [
        _belief("belief_ai_momentum", "Megacap AI momentum persists through capex cycles",
                "Capex-driven demand keeps megacap AI names trending until guidance rolls over.",
                a_conf, knowledge_time),
        _belief("belief_crypto_meanrevert", "Crypto funding spikes mean-revert within weeks",
                "Elevated perp funding tends to normalize, fading leverage-led moves.",
                b_conf, knowledge_time),
    ]

    reflections = [
        _reflection("refl_ai_momentum", "belief_ai_momentum",
                    "Five consecutive megacap AI decisions resolved with positive alpha; the same-direction streak cleared the gate, nudging confidence up by one step.",
                    bool(a_gate and a_gate.significance_passed), bool(a_gate and a_gate.significance_passed),
                    knowledge_time),
        _reflection("refl_crypto_meanrevert", "belief_crypto_meanrevert",
                    "Recent crypto funding decisions resolved with mixed alpha; the gate blocked any confidence move — a single outcome cannot flip the belief.",
                    bool(b_gate and b_gate.significance_passed), bool(b_gate and b_gate.significance_passed),
                    knowledge_time),
    ]
    return beliefs_block, reflections
