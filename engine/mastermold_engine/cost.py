"""Per-run cost telemetry surfaced on the dashboard's /review page.

TradingAgents already ships ``cli/stats_handler.py`` (``StatsCallbackHandler``) that
counts LLM calls, tool calls, and tokens in/out, threaded through
``TradingAgentsGraph(callbacks=...)``. We reuse it as-is (Optimization 5, zero new
code) and only convert its totals into the bundle's ``run.cost`` dict, applying a
price table to estimate USD. A quiet day with no agent runs reports all zeros.
"""

from __future__ import annotations

from dataclasses import dataclass

# USD per 1M tokens (input, output). Keep in sync with the chosen provider/models.
# Anthropic list prices are the default-tier estimate; actuals still depend on
# prompt caching (Phase 4), which only lowers the input figure. OpenRouter/deepseek
# is the likely cheap production tier — roughly an order of magnitude less.
_PRICE_PER_MTOK = {
    "claude-haiku-4-5": (1.0, 5.0),
    "claude-sonnet-4-6": (3.0, 15.0),
    "deepseek/deepseek-chat": (0.28, 0.88),
    "deepseek/deepseek-reasoner": (0.55, 2.19),
}


@dataclass
class RunCost:
    llm_calls: int = 0
    tool_calls: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    usd: float = 0.0

    def as_dict(self) -> dict:
        return {
            "llm_calls": self.llm_calls,
            "tool_calls": self.tool_calls,
            "prompt_tokens": self.prompt_tokens,
            "completion_tokens": self.completion_tokens,
            "usd": round(self.usd, 4),
        }


def estimate_usd(prompt_tokens: int, completion_tokens: int, model: str) -> float:
    inp, out = _PRICE_PER_MTOK.get(model, (0.0, 0.0))
    return prompt_tokens / 1_000_000 * inp + completion_tokens / 1_000_000 * out


def from_stats_handler(handler, *, quick_model: str, deep_model: str) -> RunCost:
    """Convert a StatsCallbackHandler's totals into a RunCost.

    The handler exposes per-call token counts; lacking a per-call model attribution we
    price prompt/completion totals at the deep tier as a conservative upper bound. The
    figure is an estimate, labelled as such on /review; the call/token counts are exact.
    """
    cost = RunCost(
        llm_calls=getattr(handler, "llm_calls", 0),
        tool_calls=getattr(handler, "tool_calls", 0),
        prompt_tokens=getattr(handler, "prompt_tokens", getattr(handler, "tokens_in", 0)),
        completion_tokens=getattr(handler, "completion_tokens", getattr(handler, "tokens_out", 0)),
    )
    cost.usd = estimate_usd(cost.prompt_tokens, cost.completion_tokens, deep_model)
    return cost
