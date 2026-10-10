export interface FormatKesOptions {
  compact?: boolean;
  decimals?: boolean;
}

export function formatKes(amount: number, opts: FormatKesOptions = {}): string {
  const { compact = false, decimals = false } = opts;
  if (compact && Math.abs(amount) >= 1_000_000) {
    return `KES ${(amount / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (compact && Math.abs(amount) >= 1_000) {
    return `KES ${(amount / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  }
  const formatted = amount.toLocaleString('en-KE', {
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  });
  return `KES ${formatted}`;
}
