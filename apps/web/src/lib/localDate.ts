/** "2026-03" as a month and year in the reader's language (March 2026 / mars 2026 / Machi 2026). */
export function localPeriod(period: string, lang: string): string {
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return period;
  try { return new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1))); } catch { return period; }
}

export function localDay(iso: string, lang: string): string {
  try { return new Date(iso).toLocaleDateString(lang === 'en' ? 'en-KE' : lang); } catch { return iso; }
}

/** Short month name in the reader's language (Jun / juin / Jun), for chart axes. */
export function localMonthShort(period: string, lang: string): string {
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return period;
  try { return new Intl.DateTimeFormat(lang, { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1))).replace('.', ''); } catch { return period; }
}
