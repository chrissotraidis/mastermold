"""Entry point: one dated run over the watchlist, as a staged funnel.

    Stage 0  data refresh (free)   -> shared per-ticker + one global cache
    Stage 1  screener (free)       -> alerts + the list of triggered tickers
    Stage 2  agent runs (paid)     -> full pipeline ONLY for triggered tickers
    Stage 4  export                -> write the run bundle

Cost scales with market activity, not with the calendar: a quiet day where nothing
triggers costs zero LLM spend and renders an honest "nothing urgent today".

The deterministic stages (1 + the assembly/export) are factored into pure functions
that ``engine/tests/`` exercise offline. Stages 0 and 2 (network + LLM) are wired in
``main`` behind the engine venv. Usage:

    uv run python -m mastermold_engine.run_briefing --date 2026-06-08
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Sequence

from . import adapter, screener
from .cost import RunCost, estimate_usd, from_stats_handler
from .export import write_bundle

DEFAULT_CONFIG: dict[str, Any] = {
    "provider": "openrouter",
    "openrouter_base_url": "https://openrouter.ai/api/v1",
    "models": {
        "quick_think": "deepseek/deepseek-chat",
        "deep_think": "deepseek/deepseek-chat",
    },
    "watchlist": [
        {"symbol": "NVDA", "asset_id": "asset_nvda", "asset_class": "equity"},
        {"symbol": "HOOD", "asset_id": "asset_hood", "asset_class": "equity"},
        {"symbol": "BTC", "asset_id": "asset_btc", "asset_class": "crypto"},
        {"symbol": "ETH", "asset_id": "asset_eth", "asset_class": "crypto"},
        {"symbol": "aUSDC", "asset_id": "asset_usdc_aave", "asset_class": "defi"},
    ],
    "always_run": ["NVDA"],
    "temperature": 0.2,
    "selected_analysts": ["market", "social", "news", "fundamentals"],
    "screener": {
        "lookback_sessions": 30,
        "trigger_z": 1.5,
        "tiers": {"T0": 3.0, "T1": 2.0, "T2": 1.5},
        "signals": {
            "return_z": {"enabled": True},
            "volume_z": {"enabled": True},
            "news_count_z": {"enabled": True},
        },
    },
}


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
    """Executable funnel: load config, screen, synthesize cards with live inference, export.

    This is the first live-inference path. It uses the contract/adapter that the
    TradingAgents fork will feed, but calls the configured OpenAI-compatible provider
    directly for card synthesis until the full graph dependency is pinned.
    """
    parser = argparse.ArgumentParser(description="Run a Master Mold briefing export.")
    parser.add_argument("--date", default=datetime.now(timezone.utc).date().isoformat())
    parser.add_argument("--config", default=str(Path(__file__).resolve().parent.parent / "config.yml"))
    args = parser.parse_args(argv)

    load_env(Path(args.config).with_name(".env"))
    config = load_config(Path(args.config))
    event_time = f"{args.date}T13:30:00.000Z"
    knowledge_time = now_iso()
    signals = synthetic_signals(config["watchlist"])
    screener_cfg = config["screener"]
    screens, triggered = run_screener_stage(
        config["watchlist"],
        signals,
        lookback=int(screener_cfg.get("lookback_sessions", 30)),
        trigger_z=float(screener_cfg.get("trigger_z", 1.5)),
        always_run=set(config.get("always_run", [])),
        enabled={
            name: bool(settings.get("enabled", True))
            for name, settings in screener_cfg.get("signals", {}).items()
            if isinstance(settings, dict)
        },
    )

    agent_cards, total_cost, adapter_status, adapter_detail = run_agent_stage(
        config=config,
        screens=screens,
        triggered=triggered,
        run_date=args.date,
        event_time=event_time,
        knowledge_time=knowledge_time,
    )

    bundle = assemble_run(
        run_date=args.date,
        event_time=event_time,
        knowledge_time=knowledge_time,
        config=config,
        screens=screens,
        triggered=triggered,
        agent_cards=agent_cards,
        cost=total_cost,
        journal_sync={"pending_entries": build_pending_entries(agent_cards, knowledge_time), "outcomes": [], "reflections": []},
    )
    bundle["run"]["stages"]["data_refresh"] = "synthetic_signals"
    bundle["run"]["stages"]["agent_adapter"] = adapter_status
    bundle["run"]["stages"]["agent_adapter_detail"] = adapter_detail
    path = write_bundle(bundle)
    print(f"Wrote {path}")
    return 0


def run_agent_stage(
    *,
    config: dict[str, Any],
    screens: list[screener.TickerScreen],
    triggered: list[str],
    run_date: str,
    event_time: str,
    knowledge_time: str,
) -> tuple[list[dict[str, Any]], RunCost, str, dict[str, Any]]:
    mode = os.environ.get("MASTERMOLD_ENGINE_ADAPTER", "auto").strip().lower()
    if not triggered:
        return [], RunCost(), "quiet_no_agent_runs", adapter_detail(
            mode=mode,
            status="skipped",
            config=config,
            reason="No ticker crossed the screener threshold.",
            attempted_graph=False,
            fallback=None,
        )

    if mode in {"auto", "tradingagents"}:
        cards, cost, status, detail = try_tradingagents_cards(
            config=config,
            screens=screens,
            triggered=triggered,
            run_date=run_date,
            event_time=event_time,
            knowledge_time=knowledge_time,
        )
        if cards:
            return cards, cost, status, detail
        if mode == "tradingagents":
            raise RuntimeError(f"TradingAgents adapter did not produce cards: {detail.get('reason') or status}")
        fallback_detail = {
            **detail,
            "status": "fallback",
            "fallback": "openrouter_direct",
        }
    else:
        fallback_detail = adapter_detail(
            mode=mode,
            status="direct",
            config=config,
            reason="TradingAgents graph skipped by adapter mode.",
            attempted_graph=False,
            fallback="openrouter_direct",
        )

    cards: list[dict[str, Any]] = []
    total_cost = RunCost()
    for symbol in triggered:
        entry = next((item for item in config["watchlist"] if item["symbol"] == symbol), None)
        if not entry:
            continue
        card, cost = infer_card(
            config=config,
            entry=entry,
            screen=next((screen for screen in screens if screen.symbol == symbol), None),
            run_date=run_date,
            event_time=event_time,
            knowledge_time=knowledge_time,
        )
        cards.append(card)
        add_cost(total_cost, cost)
    return cards, total_cost, "openrouter_direct", fallback_detail


def add_cost(total: RunCost, cost: RunCost) -> None:
    total.llm_calls += cost.llm_calls
    total.tool_calls += cost.tool_calls
    total.prompt_tokens += cost.prompt_tokens
    total.completion_tokens += cost.completion_tokens
    total.usd += cost.usd


def try_tradingagents_cards(
    *,
    config: dict[str, Any],
    screens: list[screener.TickerScreen],
    triggered: list[str],
    run_date: str,
    event_time: str,
    knowledge_time: str,
) -> tuple[list[dict[str, Any]], RunCost, str, dict[str, Any]]:
    """Attempt the full TradingAgents boundary when its dependency stack is installed."""
    detail = adapter_detail(
        mode=os.environ.get("MASTERMOLD_ENGINE_ADAPTER", "auto").strip().lower(),
        status="attempting",
        config=config,
        reason="TradingAgentsGraph.propagate boundary selected.",
        attempted_graph=True,
        fallback=None,
    )
    try:
        repo_root = Path(__file__).resolve().parents[2]
        ref_path = repo_root / "ref" / "TradingAgents"
        if ref_path.exists():
            sys.path.insert(0, str(ref_path))
        from cli.stats_handler import StatsCallbackHandler  # type: ignore
        from tradingagents.default_config import DEFAULT_CONFIG  # type: ignore
        from tradingagents.graph.trading_graph import TradingAgentsGraph  # type: ignore
    except Exception as exc:
        detail["status"] = "unavailable"
        detail["reason"] = f"{type(exc).__name__}: {str(exc)[:180]}"
        return [], RunCost(), "tradingagents_unavailable", detail

    cards: list[dict[str, Any]] = []
    total_cost = RunCost()
    try:
        ta_config = build_tradingagents_config(DEFAULT_CONFIG.copy(), config)
        stats_handler = StatsCallbackHandler()
        graph = TradingAgentsGraph(
            selected_analysts=list(config.get("selected_analysts") or ["market", "social", "news", "fundamentals"]),
            debug=False,
            config=ta_config,
            callbacks=[stats_handler],
        )
        for symbol in triggered:
            entry = next((item for item in config["watchlist"] if item["symbol"] == symbol), None)
            if not entry:
                continue
            _, decision = graph.propagate(
                symbol,
                run_date,
                asset_type="crypto" if entry.get("asset_class") in {"crypto", "defi"} else "stock",
            )
            cards.append(card_from_tradingagents_decision(
                entry=entry,
                decision=decision,
                screen=next((screen for screen in screens if screen.symbol == symbol), None),
                run_date=run_date,
                event_time=event_time,
                knowledge_time=knowledge_time,
            ))
        total_cost = from_stats_handler(
            stats_handler,
            quick_model=str(config["models"].get("quick_think") or ""),
            deep_model=str(config["models"].get("deep_think") or ""),
        )
    except Exception as exc:
        if os.environ.get("MASTERMOLD_ENGINE_ADAPTER") == "tradingagents":
            raise
        detail["status"] = "failed"
        detail["reason"] = f"{type(exc).__name__}: {str(exc)[:180]}"
        return [], RunCost(), "tradingagents_failed", detail

    detail["status"] = "succeeded"
    detail["reason"] = f"TradingAgentsGraph.propagate returned {len(cards)} card(s)."
    return cards, total_cost, "tradingagents_graph", detail


def adapter_detail(
    *,
    mode: str,
    status: str,
    config: dict[str, Any],
    reason: str,
    attempted_graph: bool,
    fallback: str | None,
) -> dict[str, Any]:
    models = config.get("models", {})
    return {
        "mode": mode,
        "status": status,
        "attempted_graph": attempted_graph,
        "fallback": fallback,
        "reason": reason,
        "provider": config.get("provider", "openrouter"),
        "base_url": config.get("openrouter_base_url", "https://openrouter.ai/api/v1"),
        "models": {
            "quick_think": models.get("quick_think"),
            "deep_think": models.get("deep_think"),
        },
        "selected_analysts": list(config.get("selected_analysts") or []),
    }


def build_tradingagents_config(defaults: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
    defaults["llm_provider"] = config.get("provider", "openrouter")
    defaults["backend_url"] = config.get("openrouter_base_url")
    defaults["quick_think_llm"] = config["models"].get("quick_think")
    defaults["deep_think_llm"] = config["models"].get("deep_think")
    defaults["max_debate_rounds"] = int(config.get("max_debate_rounds", 1))
    defaults["max_risk_discuss_rounds"] = int(config.get("max_risk_discuss_rounds", 1))
    defaults["checkpoint_enabled"] = bool(config.get("checkpoint_enabled", False))
    defaults["temperature"] = config.get("temperature", 0.2)
    defaults["memory_log_max_entries"] = config.get("memory_log_max_entries")
    return defaults


def card_from_tradingagents_decision(
    *,
    entry: dict[str, Any],
    decision: Any,
    screen: screener.TickerScreen | None,
    run_date: str,
    event_time: str,
    knowledge_time: str,
) -> dict[str, Any]:
    text = stringify_decision(decision)
    return adapter.build_card(
        symbol=entry["symbol"],
        asset_id=entry.get("asset_id"),
        run_date=run_date,
        event_time=event_time,
        knowledge_time=knowledge_time,
        pm_rating=extract_rating(text),
        headline=f"{entry['symbol']}: TradingAgents synthesis",
        why_now=text[:500] or "TradingAgents graph produced a portfolio-manager decision.",
        relevance_note="Generated through TradingAgentsGraph.propagate with the configured watchlist context.",
        bull_case=extract_section(text, "bull") or "See TradingAgents synthesis.",
        bear_case=extract_section(text, "bear") or "See TradingAgents synthesis.",
        time_horizon=extract_section(text, "horizon") or "2-4 weeks",
        drivers=drivers_from_screen(screen),
        debate_confidence=0.65,
    )


def stringify_decision(decision: Any) -> str:
    if isinstance(decision, str):
        return decision.strip()
    if hasattr(decision, "model_dump_json"):
        return decision.model_dump_json()
    if isinstance(decision, dict):
        return json.dumps(decision)
    return str(decision).strip()


def extract_rating(text: str) -> str:
    for rating in ("Buy", "Overweight", "Hold", "Underweight", "Sell"):
        if re.search(rf"\b{rating}\b", text, re.IGNORECASE):
            return rating
    return "Hold"


def extract_section(text: str, label: str) -> str:
    match = re.search(rf"{label}[^:]*:\s*(.+?)(?:\n[A-Z][^:\n]{{2,30}}:|$)", text, flags=re.IGNORECASE | re.DOTALL)
    return match.group(1).strip()[:700] if match else ""


def drivers_from_screen(screen: screener.TickerScreen | None) -> list[dict[str, Any]]:
    if not screen or not screen.readings:
        return clean_drivers([])
    drivers: list[dict[str, Any]] = []
    for reading in sorted(screen.readings, key=lambda r: abs(r.z), reverse=True)[:3]:
        drivers.append({
            "label": f"{reading.name} trigger",
            "direction": "bullish" if reading.z >= 0 else "bearish",
            "weight": min(max(abs(reading.z) / 10, 0.25), 0.95),
            "source_citation": "TradingAgents graph + deterministic screener",
        })
    return clean_drivers(drivers)


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


def load_config(path: Path) -> dict[str, Any]:
    try:
        import yaml  # type: ignore
    except Exception:
        return DEFAULT_CONFIG
    if not path.exists():
        return DEFAULT_CONFIG
    loaded = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    return deep_merge(DEFAULT_CONFIG, loaded)


def deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    merged = dict(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def synthetic_signals(watchlist: Sequence[dict[str, Any]]) -> dict[str, dict[str, Sequence[float]]]:
    """Deterministic placeholder until Stage 0 market/news fetch is wired."""
    signals: dict[str, dict[str, Sequence[float]]] = {}
    base_returns = [0.004, -0.003, 0.005, -0.004, 0.003, -0.002] * 6
    base_volume = [100.0, 98.0, 103.0, 97.0, 101.0, 99.0] * 6
    for idx, entry in enumerate(watchlist):
      latest_return = 0.055 if idx == 0 else 0.004 + idx * 0.001
      latest_volume = 210.0 if idx == 0 else 100.0 + idx
      signals[entry["symbol"]] = {
          "return_z": [*base_returns, latest_return],
          "volume_z": [*base_volume, latest_volume],
          "news_count_z": ([1.0, 2.0] * 18) + [4.0 if idx == 0 else 1.0],
      }
    return signals


def infer_card(
    *,
    config: dict[str, Any],
    entry: dict[str, Any],
    screen: screener.TickerScreen | None,
    run_date: str,
    event_time: str,
    knowledge_time: str,
) -> tuple[dict[str, Any], RunCost]:
    model = config["models"].get("deep_think") or config["models"].get("quick_think")
    provider = config.get("provider", "openrouter")
    if provider != "openrouter":
        raise RuntimeError("Live engine inference currently supports provider: openrouter")
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY is required for live engine inference")

    prompt = build_card_prompt(entry, screen)
    payload = {
        "model": model,
        "temperature": float(config.get("temperature", 0.2)),
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are the card synthesis step for an advisory-only personal financial copilot. "
                    "Return only valid JSON. Do not imply authority to trade or move funds."
                ),
            },
            {"role": "user", "content": prompt},
        ],
    }
    response = call_openrouter(
        config.get("openrouter_base_url", "https://openrouter.ai/api/v1"),
        api_key,
        payload,
    )
    content = response["choices"][0]["message"]["content"]
    parsed = parse_json_object(content)
    usage = response.get("usage") or {}
    prompt_tokens = int(usage.get("prompt_tokens") or max(len(prompt) // 4, 1))
    completion_tokens = int(usage.get("completion_tokens") or max(len(content) // 4, 1))
    cost = RunCost(
        llm_calls=1,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        usd=estimate_usd(prompt_tokens, completion_tokens, model),
    )
    return (
        adapter.build_card(
            symbol=entry["symbol"],
            asset_id=entry.get("asset_id"),
            run_date=run_date,
            event_time=event_time,
            knowledge_time=knowledge_time,
            pm_rating=clean_rating(parsed.get("pm_rating")),
            headline=str(parsed.get("headline") or f"{entry['symbol']}: review required")[:160],
            why_now=str(parsed.get("why_now") or "Screener selected this ticker for review."),
            relevance_note=str(parsed.get("relevance_note") or "Mapped from the configured watchlist."),
            bull_case=str(parsed.get("bull_case") or ""),
            bear_case=str(parsed.get("bear_case") or ""),
            time_horizon=str(parsed.get("time_horizon") or "2-4 weeks"),
            drivers=clean_drivers(parsed.get("drivers")),
            debate_confidence=float(parsed.get("debate_confidence") or 0.6),
        ),
        cost,
    )


def build_pending_entries(cards: Sequence[dict[str, Any]], knowledge_time: str) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for card in cards:
        if card.get("status") != "actionable":
            continue
        entries.append({
            "id": f"engine_journal_{card['date']}_{card['id'].split('_')[-1]}",
            "briefing_card_id": card["id"],
            "thesis": card["headline"],
            "signals": [driver["label"] for driver in card.get("drivers", [])][:4],
            "conviction": card["conviction"],
            "horizon": card["horizon"],
            "falsification_condition": (
                card.get("bear_case")
                or "The thesis is wrong if the cited drivers reverse before the stated horizon."
            ),
            "logged_at": knowledge_time,
            "event_time": card["event_time"],
            "knowledge_time": knowledge_time,
        })
    return entries


def build_card_prompt(entry: dict[str, Any], screen: screener.TickerScreen | None) -> str:
    readings = []
    for reading in screen.readings if screen else []:
        readings.append({
            "signal": reading.name,
            "latest": reading.latest,
            "mean": reading.mean,
            "z": round(reading.z, 3),
        })
    return json.dumps({
        "task": "Create one briefing card for this watchlist ticker.",
        "ticker": entry,
        "screener_readings": readings,
        "required_json_shape": {
            "pm_rating": "Buy | Overweight | Hold | Underweight | Sell",
            "headline": "short headline",
            "why_now": "why it matters today",
            "relevance_note": "why it matters to holdings/watchlist",
            "bull_case": "concise bull case",
            "bear_case": "concise bear case",
            "time_horizon": "e.g. 2-4 weeks",
            "debate_confidence": "number from 0 to 1",
            "drivers": [
                {
                    "label": "2-8 word driver",
                    "direction": "bullish | bearish",
                    "weight": "number from 0 to 1",
                    "source_citation": "Screener or model reasoning source",
                }
            ],
        },
        "constraints": [
            "Use 2-4 drivers.",
            "Do not recommend direct trade execution.",
            "Mention that this is advisory context when relevant.",
        ],
    })


def call_openrouter(base_url: str, api_key: str, payload: dict[str, Any]) -> dict[str, Any]:
    url = base_url.rstrip("/") + "/chat/completions"
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": os.environ.get("NEXT_PUBLIC_APP_URL", "http://localhost:4002"),
            "X-Title": "Master Mold Engine",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:300]
        raise RuntimeError(f"OpenRouter request failed with HTTP {exc.code}: {detail}") from exc


def parse_json_object(content: str) -> dict[str, Any]:
    text = content.strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.IGNORECASE)
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, flags=re.DOTALL)
        if not match:
            raise
        parsed = json.loads(match.group(0))
    if not isinstance(parsed, dict):
        raise ValueError("model returned JSON, but not an object")
    return parsed


def clean_rating(value: Any) -> str:
    rating = str(value or "Hold").strip().title()
    return rating if rating in {"Buy", "Overweight", "Hold", "Underweight", "Sell"} else "Hold"


def clean_drivers(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        value = []
    drivers: list[dict[str, Any]] = []
    for item in value[:4]:
        if not isinstance(item, dict):
            continue
        direction = str(item.get("direction") or "bullish").lower()
        drivers.append({
            "label": str(item.get("label") or "Screener trigger")[:80],
            "direction": "bearish" if direction == "bearish" else "bullish",
            "weight": max(0.1, min(float(item.get("weight") or 0.5), 1.0)),
            "source_citation": str(item.get("source_citation") or "OpenRouter card synthesis")[:120],
        })
    if len(drivers) < 2:
        drivers.extend([
            {
                "label": "Screener trigger",
                "direction": "bullish",
                "weight": 0.7,
                "source_citation": "Deterministic screener",
            },
            {
                "label": "Model uncertainty",
                "direction": "bearish",
                "weight": 0.4,
                "source_citation": "OpenRouter card synthesis",
            },
        ])
    if not any(driver["direction"] == "bearish" for driver in drivers):
        weakest = min(range(len(drivers)), key=lambda index: drivers[index]["weight"])
        drivers[weakest] = {
            "label": "Counter-case uncertainty",
            "direction": "bearish",
            "weight": min(float(drivers[weakest]["weight"]), 0.45),
            "source_citation": "OpenRouter card synthesis",
        }
    if not any(driver["direction"] == "bullish" for driver in drivers):
        strongest = max(range(len(drivers)), key=lambda index: drivers[index]["weight"])
        drivers[strongest] = {
            "label": "Screener trigger",
            "direction": "bullish",
            "weight": max(float(drivers[strongest]["weight"]), 0.65),
            "source_citation": "Deterministic screener",
        }
    return drivers[:4]


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
