"""The reflection significance gate the spec promises but V0 never computed.

Reflections (each carrying the measured alpha sign of a resolved decision) accumulate
against a named StrategyBelief. A belief's confidence only moves after ``n`` recent
outcomes agree on direction — a single outcome can never flip a belief, exactly as the
schema comment requires. Pure standard-library logic so it is unit-testable without
the LLM stack; the inputs (structured reflections with measured alpha) come free from
the Phase B loop.

This is deliberately conservative. Five outcomes is a tiny sample and ~5-day alpha is
noisy (see the plan's Risks): the gate exists to prevent over-updating, and confidence
shifts are suggestions, not findings, until the journal has real depth.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Sequence

Direction = Literal["supports", "refutes"]


@dataclass(frozen=True)
class ReflectionInput:
    belief_id: str
    alpha: float          # measured alpha vs benchmark for the resolved decision
    created_at: str       # ISO; used only for recency ordering


@dataclass(frozen=True)
class GateResult:
    belief_id: str
    significance_passed: bool
    direction: Direction | None        # the consistent direction, if the gate passed
    confidence_delta: float            # 0.0 unless the gate passed
    streak: int                        # length of the consistent recent run considered


# A passed gate nudges confidence by a fixed, small step in the streak's direction.
_CONFIDENCE_STEP = 0.05


def evaluate_gate(
    reflections: Sequence[ReflectionInput],
    *,
    n: int = 5,
) -> GateResult | None:
    """Decide whether the most recent ``n`` reflections for one belief move it.

    All reflections passed in must concern the *same* belief. Returns ``None`` when
    there is not yet enough evidence (fewer than ``n`` reflections). The gate passes
    only when the most recent ``n`` reflections share a non-zero alpha sign.
    """
    if not reflections:
        return None
    belief_id = reflections[0].belief_id
    if any(r.belief_id != belief_id for r in reflections):
        raise ValueError("evaluate_gate expects reflections for a single belief")

    ordered = sorted(reflections, key=lambda r: r.created_at)
    recent = ordered[-n:]
    if len(recent) < n:
        return GateResult(belief_id, significance_passed=False, direction=None,
                          confidence_delta=0.0, streak=len(recent))

    signs = [_sign(r.alpha) for r in recent]
    if 0 in signs or len(set(signs)) != 1:
        return GateResult(belief_id, significance_passed=False, direction=None,
                          confidence_delta=0.0, streak=_trailing_streak(signs))

    consistent = signs[0]
    direction: Direction = "supports" if consistent > 0 else "refutes"
    delta = _CONFIDENCE_STEP if consistent > 0 else -_CONFIDENCE_STEP
    return GateResult(belief_id, significance_passed=True, direction=direction,
                      confidence_delta=delta, streak=n)


def apply_delta(confidence: float, delta: float) -> float:
    """Move a belief's confidence by ``delta``, clamped to [0, 1]."""
    return max(0.0, min(1.0, round(confidence + delta, 4)))


def _sign(x: float) -> int:
    if x > 0:
        return 1
    if x < 0:
        return -1
    return 0


def _trailing_streak(signs: list[int]) -> int:
    if not signs:
        return 0
    last = signs[-1]
    if last == 0:
        return 0
    streak = 0
    for s in reversed(signs):
        if s == last:
            streak += 1
        else:
            break
    return streak
