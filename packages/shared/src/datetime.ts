export interface DayBounds {
  start: Date;
  end: Date;
}

/** Midnight-to-midnight bounds for the calendar day containing `at`, in the given IANA timeZone, returned as UTC instants. */
export function dayBounds(at: Date, timeZone: string): DayBounds {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(at).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value;
    return acc;
  }, {});
  const localMidnightUTC = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day), 0, 0, 0,
  );
  const localNowUTC = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) === 24 ? 0 : Number(parts.hour), Number(parts.minute), Number(parts.second),
  );
  const offsetMs = localNowUTC - at.getTime();
  const start = new Date(localMidnightUTC - offsetMs);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

export function relativeDay(at: Date, timeZone: string, from: Date = new Date()): 'past' | 'today' | 'future' {
  const { start, end } = dayBounds(from, timeZone);
  if (at < start) return 'past';
  if (at >= end) return 'future';
  return 'today';
}

export function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export function startOfYear(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
}

export function addMonths(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate()));
}

export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
