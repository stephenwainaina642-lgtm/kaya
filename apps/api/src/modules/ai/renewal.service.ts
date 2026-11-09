import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import type { RenewalSuggestion } from '@kaya/shared';
import { withTenant } from '../../db/client';
import { systemDb } from '../../db/system';
import { clients, leases, organizations, properties, rentCharges, rentPayments } from '../../db/schema';
import { askClaudeForJson } from '../../lib/ai';
import { notFound, conflict } from '../../lib/errors';
import { parse } from '../../lib/validate';
import { type Auth, uuidField } from '../crm/common';

export const MAX_RISE = 0.15;

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2);
}

/** Keeps the AI's number honest: a whole 500 shillings, no cut, and at most a 15% rise. */
export function clampRent(current: number, proposed: unknown): number {
  const cap = Math.floor(Math.round(current * (100 + MAX_RISE * 100)) / 100 / 500) * 500; // integer maths: 50_000 * 1.15 is 57499.999… in floats
  const n = typeof proposed === 'number' && Number.isFinite(proposed) ? Math.round(proposed / 500) * 500 : current;
  return Math.max(current, Math.min(n, Math.max(cap, current)));
}

export function describePayments(h: { onTime: number; late: number; unpaid: number }): string {
  const total = h.onTime + h.late + h.unpaid;
  if (total === 0) return 'No rent history yet.';
  return `Of the last ${total} month${total === 1 ? '' : 's'}: ${h.onTime} paid on time, ${h.late} paid late, ${h.unpaid} not fully paid.`;
}

export async function renewalSuggestion(a: Auth, leaseId: string): Promise<RenewalSuggestion> {
  parse(uuidField, leaseId);
  const today = new Date().toISOString().slice(0, 10);
  const ctx = await withTenant(a.organizationId, async (tx) => {
    const [l] = await tx.select({
      id: leases.id, rent: leases.rentAmount, status: leases.status, endDate: leases.endDate, startDate: leases.startDate,
      tenantName: clients.fullName, propertyTitle: properties.title, location: properties.location, bedrooms: properties.bedrooms,
    }).from(leases).innerJoin(clients, eq(clients.id, leases.tenantId)).innerJoin(properties, eq(properties.id, leases.propertyId)).where(eq(leases.id, leaseId));
    if (!l) throw notFound('Lease');
    if (l.status !== 'ACTIVE') throw conflict('Only an active lease can be renewed.', 'LEASE_ENDED');

    const peers = await tx.select({ rent: leases.rentAmount, location: properties.location, bedrooms: properties.bedrooms })
      .from(leases).innerJoin(properties, eq(properties.id, leases.propertyId))
      .where(and(eq(leases.status, 'ACTIVE'), ne(leases.id, leaseId)));
    const comps = peers.filter((p) => p.location.trim().toLowerCase() === l.location.trim().toLowerCase() && p.bedrooms === l.bedrooms).map((p) => p.rent);

    const charges = await tx.select({ id: rentCharges.id, due: rentCharges.dueDate, amount: rentCharges.amount, paid: rentCharges.paidAmount, status: rentCharges.status })
      .from(rentCharges).where(eq(rentCharges.leaseId, leaseId)).orderBy(desc(rentCharges.period)).limit(12);
    const pays = charges.length ? await tx.select({ chargeId: rentPayments.chargeId, paidAt: rentPayments.paidAt }).from(rentPayments).where(inArray(rentPayments.chargeId, charges.map((c) => c.id))) : [];
    const lastPaid = new Map<string, number>();
    for (const p of pays) lastPaid.set(p.chargeId, Math.max(lastPaid.get(p.chargeId) ?? 0, p.paidAt.getTime()));
    const h = { onTime: 0, late: 0, unpaid: 0 };
    for (const c of charges.filter((x) => x.due <= today)) {
      if (c.paid < c.amount) h.unpaid++;
      else if ((lastPaid.get(c.id) ?? 0) <= Date.parse(c.due) + 4 * 86_400_000) h.onTime++;
      else h.late++;
    }
    return { l, comps, h };
  });
  const [org] = await systemDb.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, a.organizationId));
  const comparables = ctx.comps.length >= 2 ? { count: ctx.comps.length, median: median(ctx.comps) } : null;
  const paymentSummary = describePayments(ctx.h);

  const raw = await askClaudeForJson<{ suggestedRent?: unknown; rationale?: unknown; message?: unknown }>(
    `You help a Kenyan property management agency (${org?.name ?? 'the agency'}) renew tenancies fairly. Amounts are KES per month. ` +
      'Propose a new monthly rent: keep it unchanged for a tenant with a poor payment record you want to retain carefully, or raise it modestly (typically 0-10%) for a reliable tenant, ' +
      `never above ${Math.round(MAX_RISE * 100)}% and, if comparable rents are given, no higher than needed to approach the comparable median. ` +
      'Write a rationale of at most 2 sentences using only the data given, and a warm, professional renewal offer message of at most 4 sentences that states the new rent and asks the tenant to confirm. ' +
      'Do not invent legal notice periods, fees or deadlines. Return JSON: {"suggestedRent": <number>, "rationale": "...", "message": "..."}.',
    [
      `Tenant first name: ${ctx.l.tenantName.split(' ')[0]}`, `Property: ${ctx.l.propertyTitle}`, `Current rent: ${ctx.l.rent}`,
      `Lease started: ${ctx.l.startDate}; ends: ${ctx.l.endDate ?? 'open-ended'}`, paymentSummary,
      comparables ? `Comparable active leases (same area and bedrooms): ${comparables.count}, median rent ${comparables.median}` : 'No comparable rents available.',
    ].join('\n'),
    700,
  );
  const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  const suggestedRent = clampRent(ctx.l.rent, raw.suggestedRent);
  return {
    currentRent: ctx.l.rent, suggestedRent, comparables, paymentSummary,
    rationale: clip(raw.rationale, 400),
    message: clip(raw.message, 700),
  };
}
