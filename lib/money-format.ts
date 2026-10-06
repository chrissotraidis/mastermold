export function formatMoney(value: number, options: { cents?: boolean; compact?: boolean } = {}) {
  if (options.compact && Math.abs(value) >= 100_000) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(value);
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: options.cents ? 2 : 0,
    maximumFractionDigits: options.cents ? 2 : 0,
  }).format(value);
}

export function formatPrice(value: number) {
  if (value === 0) return "$0";
  if (value >= 1) return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
  return `$${value.toPrecision(3).replace(/0+$/, "")}`;
}

export function formatQuantity(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: value < 1 ? 6 : 4 }).format(value);
}

export function formatSignedMoney(value: number) {
  const rounded = Math.round(value);
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  return `${sign}${formatMoney(Math.abs(value))}`;
}

export function formatSignedPct(value: number, digits = 1) {
  const rounded = Number(value.toFixed(digits));
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(digits)}%`;
}

export function toneFor(value: number | null | undefined) {
  if (!value || Math.abs(value) < 0.05) return "text-on-surface-variant";
  return value > 0 ? "text-engine" : "text-critical";
}

export function relativeTime(iso: string | null, now = Date.now()) {
  if (!iso) return "never";
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms)) return "unknown";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export const ASSET_CLASS_LABEL: Record<string, string> = {
  equity: "Stocks & funds",
  crypto: "Crypto",
  defi: "On-chain",
  cash: "Cash",
};
