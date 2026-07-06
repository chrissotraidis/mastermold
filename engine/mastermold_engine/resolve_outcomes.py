"""Entry point: Phase B outcome resolution for pending journal entries.

Reuses Stage 0's cached prices to fetch returns, computes alpha vs. an auto-detected
benchmark, runs the Reflector (already built into the framework) for the lesson, and
maps the result through ``journal_bridge`` into OutcomeScore + ReflectionUpdate JSON.
Also scores any closed paper rounds off the same outcome data (Phase 3). Reflections
are batchable via the provider's batch API once volume justifies it (Optimization 7).

    uv run python -m mastermold_engine.resolve_outcomes --date 2026-06-08
"""

from __future__ import annotations


def auto_benchmark(asset_class: str) -> str:
    """Pick the benchmark a decision's alpha is measured against."""
    return {"equity": "SPY", "crypto": "BTC-USD", "defi": "ETH-USD"}.get(asset_class, "SPY")


def alpha_vs_benchmark(asset_return: float, benchmark_return: float) -> float:
    """Excess return over the benchmark across the resolution window."""
    return asset_return - benchmark_return


def main(argv: list[str] | None = None) -> int:  # pragma: no cover
    raise NotImplementedError(
        "Phase B resolution runs in the engine venv (cached prices + Reflector); see README."
    )


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
