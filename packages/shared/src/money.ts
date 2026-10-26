import type { CurrencyCode } from './enums';

/**
 * Formats an amount with its ISO currency code as a prefix (e.g. "KES 1,500",
 * "USD 2.5M") rather than a currency symbol — deliberately, since a CRM that
 * serves agencies in more than one country will show amounts in more than
 * one currency side by side, and symbols like "$" are ambiguous across them
 * (US dollars vs several others) in a way three-letter ISO codes aren't.
 */
export function formatMoney(amount: number, currency: CurrencyCode | string = 'KES', opts?: { compact?: boolean }): string {
  if (opts?.compact) {
    const abs = Math.abs(amount);
    if (abs >= 1_000_000) return `${currency} ${(amount / 1_000_000).toFixed(abs % 1_000_000 === 0 ? 0 : 1)}M`;
    if (abs >= 1_000) return `${currency} ${(amount / 1_000).toFixed(abs % 1_000 === 0 ? 0 : 1)}K`;
  }
  const formatted = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(Math.abs(amount));
  const sign = amount < 0 ? '-' : '';
  return `${sign}${currency} ${formatted}`;
}

/** @deprecated use formatMoney(amount, currency, opts) — kept only so older call sites that genuinely always mean KES (seed data, fixed-currency copy) don't need a currency threaded through. */
export function formatKes(amount: number, opts?: { compact?: boolean }): string {
  return formatMoney(amount, 'KES', opts);
}
