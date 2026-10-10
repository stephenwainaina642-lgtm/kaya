export function formatKes(amount: number, opts?: { compact?: boolean }): string {
  if (opts?.compact) {
    const abs = Math.abs(amount);
    if (abs >= 1_000_000) return `KES ${(amount / 1_000_000).toFixed(abs % 1_000_000 === 0 ? 0 : 1)}M`;
    if (abs >= 1_000) return `KES ${(amount / 1_000).toFixed(abs % 1_000 === 0 ? 0 : 1)}K`;
  }
  const formatted = new Intl.NumberFormat('en-KE', {
    maximumFractionDigits: 0,
  }).format(Math.abs(amount));
  const sign = amount < 0 ? '-' : '';
  return `${sign}KES ${formatted}`;
}
