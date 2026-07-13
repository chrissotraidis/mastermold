from __future__ import annotations
from dataclasses import dataclass
from typing import Iterable, Optional

@dataclass(frozen=True)
class EventWindow:
    start_ms: int
    end_ms: int

def triple_barrier_label(entry_price: float, max_loss_bps: float, horizon_bars: int, bars: list[dict], keep_vertical: bool = True):
    if entry_price <= 0 or max_loss_bps <= 0 or horizon_bars <= 0: return None
    target = entry_price * (1 + max_loss_bps / 10_000); stop = entry_price * (1 - max_loss_bps / 10_000)
    observed = bars[:horizon_bars]
    for index, bar in enumerate(observed):
        high, low, close = float(bar["h"]), float(bar["l"]), float(bar["c"])
        if high < low: return None
        target_hit, stop_hit = high >= target, low <= stop
        if target_hit and stop_hit: return {"label": -1, "hit_index": index, "vertical": False, "reason": "stop_same_bar_tie"}
        if stop_hit: return {"label": -1, "hit_index": index, "vertical": False, "reason": "stop"}
        if target_hit: return {"label": 1, "hit_index": index, "vertical": False, "reason": "take_profit"}
    if len(observed) < horizon_bars or not keep_vertical: return None
    return {"label": 1 if float(observed[-1]["c"]) >= entry_price else -1, "hit_index": horizon_bars - 1, "vertical": True, "reason": "vertical"}

def purged_walk_forward_splits(windows: list[EventWindow], test_blocks: Iterable[tuple[int, int]], embargo_ms: int = 2 * 86_400_000):
    """Expanding splits; no train label window may overlap test or prior embargo."""
    splits = []; prior_embargoes: list[tuple[int, int]] = []
    for test_start, test_end in test_blocks:
        test = [i for i, row in enumerate(windows) if row.start_ms >= test_start and row.start_ms < test_end]
        train = []
        for i, row in enumerate(windows):
            if row.start_ms >= test_start or row.end_ms >= test_start: continue
            if any(row.start_ms < end and row.end_ms >= start for start, end in prior_embargoes): continue
            train.append(i)
        splits.append({"train": train, "test": test, "test_start_ms": test_start, "test_end_ms": test_end})
        prior_embargoes.append((test_end, test_end + embargo_ms))
    return splits

def assert_no_overlap(windows: list[EventWindow], split: dict):
    test_start, test_end = split["test_start_ms"], split["test_end_ms"]
    for index in split["train"]:
        row = windows[index]
        if row.start_ms < test_end and row.end_ms >= test_start:
            raise AssertionError("purging failed: training barrier window overlaps test")
