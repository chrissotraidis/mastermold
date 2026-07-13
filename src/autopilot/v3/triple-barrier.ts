export type BarrierBar = { h: number; l: number; c: number };
export type BarrierLabel = { label: -1 | 1; hit_index: number; vertical: boolean; reason: "take_profit" | "stop" | "stop_same_bar_tie" | "vertical" };

/** Shared pessimistic label math for TS replay and Python-training parity. */
export function labelTripleBarrier(input: { entry_price: number; max_loss_bps: number; horizon_bars: number; bars: BarrierBar[] }): BarrierLabel | null {
  if (!(input.entry_price > 0) || !(input.max_loss_bps > 0) || !Number.isInteger(input.horizon_bars) || input.horizon_bars <= 0) return null;
  const target = input.entry_price * (1 + input.max_loss_bps / 10_000);
  const stop = input.entry_price * (1 - input.max_loss_bps / 10_000);
  const observed = input.bars.slice(0, input.horizon_bars);
  for (let index = 0; index < observed.length; index += 1) {
    const bar = observed[index]; if (![bar.h, bar.l, bar.c].every(Number.isFinite) || bar.h < bar.l) return null;
    const targetHit = bar.h >= target; const stopHit = bar.l <= stop;
    if (targetHit && stopHit) return { label: -1, hit_index: index, vertical: false, reason: "stop_same_bar_tie" };
    if (stopHit) return { label: -1, hit_index: index, vertical: false, reason: "stop" };
    if (targetHit) return { label: 1, hit_index: index, vertical: false, reason: "take_profit" };
  }
  if (observed.length < input.horizon_bars) return null;
  return { label: observed.at(-1)!.c >= input.entry_price ? 1 : -1, hit_index: input.horizon_bars - 1, vertical: true, reason: "vertical" };
}
