"""MasterMold engine: TradingAgents wrapped as a staged, screener-gated funnel.

Deterministic, dependency-light modules (conviction, screener, adapter, beliefs,
journal_bridge, cost, export) carry the mapping logic and are unit-testable under a
plain Python without the LLM stack. The schema delta (schemas), Stage 0 fetch
(data_cache), and the run entry points (run_briefing, resolve_outcomes) integrate
TradingAgents and require the engine venv + provider keys.
"""

__all__ = [
    "adapter",
    "beliefs",
    "conviction",
    "cost",
    "data_cache",
    "export",
    "journal_bridge",
    "screener",
]

__version__ = "0.1.0"
