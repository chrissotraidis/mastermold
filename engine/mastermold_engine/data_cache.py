"""Stage 0: one shared data fetch per ticker per day, plus one global news fetch.

Stock TradingAgents re-fetches per agent invocation — ``get_global_news`` runs five
yfinance queries *per ticker* (Optimization 2), and the yfinance vendor layer has no
cache. Here Stage 0 fetches once per day into ``engine/out/cache/<date>/`` and thin
tool wrappers serve every downstream consumer (screener, analysts, Phase B resolution,
paper scoring) from that cache. One yfinance hit per ticker per day, which also keeps
clear of the free tier's rate limits.

The fetch itself lives behind ``yfinance`` (the engine venv); the cache read/derive
helpers are pure so the screener can be exercised on cached fixtures offline. Network
calls are confined to ``refresh_ticker`` / ``refresh_global_news``.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Sequence

from .export import out_dir


def cache_dir(run_date: str) -> Path:
    return out_dir() / "cache" / run_date


def _cache_file(run_date: str, key: str) -> Path:
    return cache_dir(run_date) / f"{key}.json"


def read_cached(run_date: str, key: str) -> dict[str, Any] | None:
    path = _cache_file(run_date, key)
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def write_cached(run_date: str, key: str, payload: dict[str, Any]) -> Path:
    path = _cache_file(run_date, key)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return path


# --- Derivations the screener consumes (pure) ------------------------------


def daily_returns(closes: Sequence[float]) -> list[float]:
    """Simple session-over-session returns from a close series."""
    out: list[float] = []
    for prev, cur in zip(closes, closes[1:]):
        out.append(0.0 if prev == 0 else (cur - prev) / prev)
    return out


def screener_signals(ohlcv: dict[str, Any], news_counts: Sequence[float]) -> dict[str, list[float]]:
    """Turn a cached OHLCV record + daily news counts into the screener's signal series."""
    closes = [float(bar["close"]) for bar in ohlcv.get("bars", [])]
    volumes = [float(bar["volume"]) for bar in ohlcv.get("bars", [])]
    return {
        "return_z": daily_returns(closes),
        "volume_z": volumes,
        "news_count_z": [float(c) for c in news_counts],
    }


# --- Network seams (require the engine venv + yfinance) --------------------


def refresh_ticker(run_date: str, yf_symbol: str) -> dict[str, Any]:  # pragma: no cover
    """Fetch + cache one ticker's OHLCV/news for the day. Network-bound.

    Implementation note: call ``tradingagents.dataflows`` (the vendor yfinance layer)
    once, normalise to ``{"bars": [{ts, open, high, low, close, volume}], "news": [...]}``,
    and ``write_cached(run_date, yf_symbol, payload)``. Returns the cached payload.
    """
    raise NotImplementedError(
        "Stage 0 network fetch runs in the engine venv with yfinance; see README."
    )


def refresh_global_news(run_date: str) -> dict[str, Any]:  # pragma: no cover
    """Fetch + cache the shared macro/global news ONCE for the whole run. Network-bound."""
    raise NotImplementedError(
        "Stage 0 global news fetch runs in the engine venv; served to every agent via a cache wrapper."
    )
