# Experiment Decisions

## 2026-07-13: Parallel Accounts Instead of Shared Paper Promotion

**Decision:** Run each strategy in a separate synthetic account while preserving
the existing primary paper bot.

**Why:** A shared account confounds opportunity, sizing, cash, and exit effects.
It cannot answer whether a strategy had edge or merely encountered a different
book state. Isolated accounts make the comparison causal enough to learn from.

**Safety:** Experiment code has no live mode and no live-executor dependency.
Each arm can be paused independently. Results never auto-promote a strategy.

## 2026-07-13: V2 Is the Control

**Decision:** Keep the current V2 trend-pullback strategy unchanged as the
benchmark and test Bar Portion as a separate veto treatment.

**Why:** Replacing the control while testing new modules would remove the
baseline needed to attribute differences.
