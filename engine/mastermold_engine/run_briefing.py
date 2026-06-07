"""Entry point: one dated run over the watchlist, as a staged funnel.

    Stage 0  data refresh (free)   -> shared per-ticker + one global cache
    Stage 1  screener (free)       -> alerts + the list of triggered tickers
    Stage 2  agent runs (paid)     -> full pipeline ONLY for triggered tickers
    Stage 4  export                -> write the run bundle

Cost scales with market activity, not with the calendar: a quiet day where nothing
triggers costs zero LLM spend and renders an honest "nothing actionable today".

The deterministic stages (1 + the assembly/export) are factored into pure functions
that ``engine/tests/`` exercise offline. Stages 0 and 2 (network + LLM) are wired in
``main`` behind the engine venv. Usage:

    uv run python -m mastermold_engine.run_briefing --date 2026-06-08
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Sequence

from . import adapter, screener
from .cost import RunCost
from .export import write_bundle


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def run_screener_stage(
    watchlist: Sequence[dict[str, Any]],
    signals_by_symbol: dict[str, dict[str, Sequence[float]]],
    *,
    lookback: int,
    trigger_z: float,
    always_run: set[str],
    enabled: dict[str, bool] | None = None,
) -> tuple[list[screener.TickerScreen], list[str]]:
    """Run the deterministic screener over cached signals. Returns (screens, triggered)."""
    screens: list[screener.TickerScreen] = []
    triggered: list[str] = []
    for entry in watchlist:
        symbol = entry["symbol"]
        signals = signals_by_symbol.get(symbol)
        if not signals:
            continue
        screen = screener.screen_ticker(
            symbol, entry.get("asset_id"), signals, lookback=lookback, enabled=enabled
        )
        screens.append(screen)
        if screener.is_triggered(screen, trigger_z=trigger_z, always_run=symbol in always_run):
            triggered.append(symbol)
    return screens, triggered


def assemble_run(
    *,
    run_date: str,
    event_time: str,
    knowledge_time: str,
    config: dict[str, Any],
    screens: list[screener.TickerScreen],
    triggered: list[str],
    agent_cards: list[dict[str, Any]],
    cost: RunCost,
    journal_sync: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Pure assembly of the run bundle from screener + (already-built) agent cards."""
    tiers = config["screener"]["tiers"]
    alerts = adapter.build_alerts_from_screens(
        screens, tiers, run_date=run_date, event_time=event_time, knowledge_time=knowledge_time
    )

    cards = list(agent_cards)
    if not any(c["status"] == "actionable" for c in cards):
        cards = [adapter.nothing_actionable_card(
            run_date=run_date, event_time=event_time, knowledge_time=knowledge_time
        )]
    cards = adapter.rank_cards(cards)

    run_meta = {
        "run_date": run_date,
        "event_time": event_time,
        "knowledge_time": knowledge_time,
        "provider": config.get("provider", "anthropic"),
        "models": config.get("models", {}),
        "watchlist": [e["symbol"] for e in config["watchlist"]],
        "triggered_tickers": triggered,
        "cost": cost.as_dict(),
        "stages": {
            "data_refresh": "ok",
            "screener": "ok",
            "agent_runs": len(triggered),
            "outcome_resolution": "skipped",
        },
    }
    return adapter.assemble_bundle(
        run_meta=run_meta, cards=cards, alerts=alerts, journal_sync=journal_sync
    )


def main(argv: list[str] | None = None) -> int:  # pragma: no cover
    """Full funnel: load config, Stage 0 fetch, screen, run agents, export.

    The network (Stage 0) and LLM (Stage 2) seams require the engine venv and keys in
    engine/.env. See ``engine/README.md`` for the exact wiring against
    ``tradingagents.graph.trading_graph.TradingAgentsGraph.propagate``.
    """
    raise NotImplementedError(
        "Full funnel runs in the engine venv with provider keys; deterministic stages are "
        "covered by engine/tests. See engine/README.md."
    )


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
