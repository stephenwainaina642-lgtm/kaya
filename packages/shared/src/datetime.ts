/** Returns the UTC offset in minutes for a given instant in a given IANA timezone. */
function offsetMinutes(at: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = dtf.formatToParts(at).reduce<Record<string, string>>((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  const asUTC = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second),
  );
  return Math.round((asUTC - at.getTime()) / 60000);
}

/** Midnight-to-midnight bounds (as UTC instants) for the local day of `at` in `timeZone`. */
export function dayBounds(at: Date, timeZone: string): { start: Date; end: Date } {
  const offset = offsetMinutes(at, timeZone);
  const local = new Date(at.getTime() + offset * 60000);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const d = local.getUTCDate();
  const startLocalMidnightAsUTC = Date.UTC(y, m, d, 0, 0, 0);
  const start = new Date(startLocalMidnightAsUTC - offset * 60000);
  const end = new Date(start.getTime() + 24 * 60 * 60000);
  return { start, end };
}

export function relativeDay(at: Date, timeZone: string, now: Date = new Date()): 'past' | 'today' | 'future' {
  const { start, end } = dayBounds(now, timeZone);
  if (at < start) return 'past';
  if (at >= end) return 'future';
  return 'today';
}

export function startOfMonth(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
}

export function startOfYear(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), 0, 1));
}

export function addMonths(at: Date, n: number): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + n, at.getUTCDate()));
}

export function monthKey(at: Date): string {
  const y = at.getUTCFullYear();
  const m = String(at.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
