import type { RentPaymentItem, TenantStatement } from '@kaya/shared';

export interface TenantSummary {
  totalPaid: number;
  chargedToDate: number;
  /** Months whose due date has passed, and how many of those were paid in full on or before the due date. */
  monthsDue: number;
  monthsOnTime: number;
  lastPayment: RentPaymentItem | null;
  /** Every payment, newest first, with the month it was for. */
  payments: (RentPaymentItem & { period: string })[];
  /** Months with money still owing whose due date has passed. */
  monthsBehind: number;
  /** The next date rent falls due, or null when it cannot be worked out. */
  nextDue: Date | null;
}

const endOfDay = (iso: string) => new Date(`${iso.slice(0, 10)}T23:59:59.999+03:00`).getTime();

/** Everything the tenant summary shows, derived from the statement the server already sends. */
export function summariseTenant(st: TenantStatement, dueDay: number, now = new Date()): TenantSummary {
  const today = now.toISOString().slice(0, 10);
  const payments = st.rows.flatMap((r) => r.payments.map((p) => ({ ...p, period: r.period })))
    .sort((a, b) => +new Date(b.paidAt) - +new Date(a.paidAt));
  const past = st.rows.filter((r) => r.dueDate.slice(0, 10) < today && r.charged > 0);
  const monthsOnTime = past.filter((r) => {
    if (r.paid < r.charged) return false;
    const last = Math.max(...r.payments.map((p) => +new Date(p.paidAt)), 0);
    return last <= endOfDay(r.dueDate);
  }).length;
  const monthsBehind = past.filter((r) => r.paid < r.charged).length;

  // Next occurrence of the due day on or after today (clamped for short months).
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const on = (year: number, month: number) => new Date(Date.UTC(year, month, Math.min(dueDay, new Date(Date.UTC(year, month + 1, 0)).getUTCDate())));
  let next: Date | null = on(y, m);
  if (next.toISOString().slice(0, 10) < today) next = on(y, m + 1);

  return {
    totalPaid: st.totals.paid, chargedToDate: st.totals.charged, monthsDue: past.length, monthsOnTime,
    lastPayment: payments[0] ?? null, payments, monthsBehind, nextDue: next,
  };
}
