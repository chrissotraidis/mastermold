from __future__ import annotations
from dataclasses import dataclass
import math
from typing import Iterable, Optional

@dataclass
class CusumState:
    s_pos: float = 0.0
    s_neg: float = 0.0
    last_price: float = 0.0
    events: int = 0

def cusum_threshold_pct(sigma_daily_pct: Optional[float]) -> float:
    if sigma_daily_pct is None or not math.isfinite(sigma_daily_pct):
        return 2.5
    return min(5.0, max(1.5, 0.5 * sigma_daily_pct))

def cusum_step(state: CusumState, price: float, h_pct: float, ts_ms: int):
    if not math.isfinite(price) or price <= 0 or not math.isfinite(state.last_price) or state.last_price <= 0:
        state.last_price = price
        return None
    threshold = h_pct / 100.0
    if not math.isfinite(threshold) or threshold <= 0:
        state.last_price = price
        return None
    value = math.log(price / state.last_price)
    state.last_price = price
    state.s_pos = max(0.0, state.s_pos + value)
    state.s_neg = min(0.0, state.s_neg + value)
    if state.s_pos >= threshold:
        magnitude = state.s_pos
        state.s_pos = state.s_neg = 0.0; state.events += 1
        return {"direction": "up", "magnitude": magnitude, "ts_ms": ts_ms}
    if state.s_neg <= -threshold:
        magnitude = -state.s_neg
        state.s_pos = state.s_neg = 0.0; state.events += 1
        return {"direction": "down", "magnitude": magnitude, "ts_ms": ts_ms}
    return None

def extract_events(prices: Iterable[Optional[float]], h_pct: float, step_ms: int = 300_000):
    values = list(prices)
    if not values: return []
    first = float("nan") if values[0] is None else float(values[0])
    state = CusumState(last_price=first); out = []
    for index, raw in enumerate(values[1:], 1):
        event = cusum_step(state, float("nan") if raw is None else float(raw), h_pct, index * step_ms)
        if event: out.append({"index": index, **event})
    return out
