"""Stage 1: deterministic z-score screener.

Two jobs, one computation (this is why alerts live in Phase 1, not Phase 3):

1. Emit Alert JSON (T0/T1/T2 + z_score) for the dashboard's alert feed.
2. Select which tickers earn a full (paid) agent run in Stage 2.

No LLM is ever involved in this path. Pure standard library (no numpy) so the math is
unit-testable under the system Python. Inputs are the per-ticker daily series the
Stage-0 cache already fetched; the screener never hits the network itself.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal, Optional, Sequence

Tier = Literal["T0", "T1", "T2"]


@dataclass(frozen=True)
class SignalReading:
    """One signal's latest value scored against its trailing window."""

    name: str            # "return_z" | "volume_z" | "news_count_z"
    latest: float        # most-recent session value
    mean: float
    std: float
    z: float             # (latest - mean) / std, 0.0 when std == 0


@dataclass
class TickerScreen:
    symbol: str
    asset_id: Optional[str]
    readings: list[SignalReading] = field(default_factory=list)

    @property
    def peak_abs_z(self) -> float:
        return max((abs(r.z) for r in self.readings), default=0.0)

    @property
    def peak_reading(self) -> Optional[SignalReading]:
        if not self.readings:
            return None
        return max(self.readings, key=lambda r: abs(r.z))


def zscore(series: Sequence[float], *, lookback: int) -> SignalReading | None:
    """Z-score the last value of ``series`` against the preceding ``lookback`` values.

    Returns ``None`` when there is not enough history (need at least 2 prior points).
    A zero-variance window yields ``z = 0.0`` rather than a division error — a flat
    series is, correctly, never a trigger.
    """
    if len(series) < 3:
        return None
    latest = float(series[-1])
    window = [float(x) for x in series[-(lookback + 1):-1]]  # exclude the latest point
    if len(window) < 2:
        return None
    mean = sum(window) / len(window)
    variance = sum((x - mean) ** 2 for x in window) / len(window)
    std = variance ** 0.5
    z = 0.0 if std == 0 else (latest - mean) / std
    return SignalReading(name="", latest=latest, mean=mean, std=std, z=z)


def tier_for(abs_z: float, tiers: dict[str, float]) -> Tier | None:
    """Map |z| to an alert tier using config thresholds, or None when below T2."""
    if abs_z >= tiers["T0"]:
        return "T0"
    if abs_z >= tiers["T1"]:
        return "T1"
    if abs_z >= tiers["T2"]:
        return "T2"
    return None


def screen_ticker(
    symbol: str,
    asset_id: Optional[str],
    signals: dict[str, Sequence[float]],
    *,
    lookback: int,
    enabled: dict[str, bool] | None = None,
) -> TickerScreen:
    """Compute z-scores for each enabled signal series for one ticker."""
    enabled = enabled or {}
    screen = TickerScreen(symbol=symbol, asset_id=asset_id)
    for name, series in signals.items():
        if enabled and not enabled.get(name, True):
            continue
        reading = zscore(series, lookback=lookback)
        if reading is None:
            continue
        screen.readings.append(
            SignalReading(name=name, latest=reading.latest, mean=reading.mean, std=reading.std, z=reading.z)
        )
    return screen


def is_triggered(screen: TickerScreen, *, trigger_z: float, always_run: bool) -> bool:
    """A ticker earns a full agent run if any |z| clears the trigger, or it is a floor ticker."""
    return always_run or screen.peak_abs_z >= trigger_z


_SIGNAL_PHRASE = {
    "return_z": "1-day return",
    "volume_z": "volume",
    "news_count_z": "news volume",
}


def alert_message(symbol: str, reading: SignalReading) -> str:
    phrase = _SIGNAL_PHRASE.get(reading.name, reading.name)
    if reading.name == "return_z":
        value = f"{reading.latest * 100:+.1f}%"
    elif reading.name == "volume_z":
        value = f"{reading.latest / reading.mean:.1f}x avg" if reading.mean else f"{reading.latest:.4g}"
    else:
        value = f"{reading.latest:.4g}"
    return f"{symbol} {phrase} {value} (z={reading.z:+.1f})"


def alert_rationale(reading: SignalReading) -> str:
    phrase = _SIGNAL_PHRASE.get(reading.name, reading.name)
    sigma = abs(reading.z)
    side = "above" if reading.z >= 0 else "below"
    return (
        f"{phrase.capitalize()} is {sigma:.1f}σ {side} its trailing mean "
        f"({reading.mean:.4g}); deterministic screener trigger, no model involved."
    )
