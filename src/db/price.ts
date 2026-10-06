/**
 * Unit prices are not dollar totals: a token can trade at $0.00000913, and
 * rounding that to cents (or to 8 decimals) silently turns a real position
 * into $0. Dollar-and-up prices keep cents; normal sub-dollar prices keep 8
 * decimals; anything smaller keeps 6 significant digits.
 */
export function roundPrice(value: number) {
  if (!Number.isFinite(value) || value === 0) return value;
  if (value >= 1) return Math.round(value * 100) / 100;
  if (Math.abs(value) >= 1e-4) return Math.round(value * 1e8) / 1e8;
  return Number(value.toPrecision(6));
}
