import { z } from 'zod';
import { and, asc, desc, eq, inArray, ne, sql as dsql } from 'drizzle-orm';
import { effectivePlan, planHasModule } from '@kaya/shared';
import type { PaymentClaim } from '@kaya/shared';
import { withTenant } from '../../db/client';
import { systemDb } from '../../db/system';
import { clients, leases, organizations, paymentClaims, properties, rentCharges, rentPayments } from '../../db/schema';
import { AppError, conflict, notFound } from '../../lib/errors';
import { parse } from '../../lib/validate';
import { recordAudit } from '../../lib/audit';
import { type Auth, uuidField } from '../crm/common';
import { chargeStatus } from './rent.service';

const MAX_PENDING_PER_LEASE = 5;

export const claimInput = z.object({
  amount: z.number().int().min(1).max(100_000_000),
  // M-Pesa confirmation codes are 10 letters and digits, e.g. SHK4ABC123.
  mpesaCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{10}$/, 'M-Pesa codes are 10 letters and numbers, like SHK4ABC123'),
});

/** Public: a tenant on their secret link tells the agency they have paid. Nothing is recorded until an agent confirms it. */
export async function submitClaim(token: string, body: unknown): Promise<void> {
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) throw notFound('Page');
  const input = parse(claimInput, body);
  const [hit] = await systemDb.select({
    leaseId: leases.id, organizationId: leases.organizationId, plan: organizations.plan, planExpiresAt: organizations.planExpiresAt, suspendedAt: organizations.suspendedAt,
  }).from(leases).innerJoin(organizations, eq(organizations.id, leases.organizationId)).where(eq(leases.portalToken, token));
  if (!hit || hit.suspendedAt || !planHasModule(effectivePlan(hit.plan, hit.planExpiresAt), 'rentManagement')) throw notFound('Page');

  await withTenant(hit.organizationId, async (tx) => {
    const pending = await tx.select({ n: dsql<number>`count(*)::int` }).from(paymentClaims)
      .where(and(eq(paymentClaims.leaseId, hit.leaseId), eq(paymentClaims.status, 'PENDING')));
    if ((pending[0]?.n ?? 0) >= MAX_PENDING_PER_LEASE) throw new AppError(429, 'RATE_LIMITED', 'You already have several payments waiting. Your agent will confirm them shortly.');
    // The same code can only be claimed once and can never be one that is already recorded.
    const [claimed] = await tx.select({ id: paymentClaims.id }).from(paymentClaims)
      .where(and(eq(paymentClaims.mpesaCode, input.mpesaCode), ne(paymentClaims.status, 'REJECTED'))).limit(1);
    const [recorded] = await tx.select({ id: rentPayments.id }).from(rentPayments)
      .where(and(eq(rentPayments.method, 'MPESA'), inArray(rentPayments.reference, [input.mpesaCode]))).limit(1);
    if (claimed || recorded) throw conflict('That M-Pesa code has already been submitted.', 'DUPLICATE_REFERENCE');
    await tx.insert(paymentClaims).values({ organizationId: hit.organizationId, leaseId: hit.leaseId, amount: input.amount, mpesaCode: input.mpesaCode });
  });
}

export async function listClaims(a: Auth, status = 'PENDING'): Promise<PaymentClaim[]> {
  return withTenant(a.organizationId, async (tx) => {
    const rows = await tx.select({
      id: paymentClaims.id, amount: paymentClaims.amount, mpesaCode: paymentClaims.mpesaCode, status: paymentClaims.status, createdAt: paymentClaims.createdAt,
      tenantName: clients.fullName, propertyTitle: properties.title,
    }).from(paymentClaims)
      .innerJoin(leases, eq(leases.id, paymentClaims.leaseId))
      .innerJoin(clients, eq(clients.id, leases.tenantId))
      .innerJoin(properties, eq(properties.id, leases.propertyId))
      .where(eq(paymentClaims.status, status)).orderBy(desc(paymentClaims.createdAt)).limit(100);
    return rows.map((r) => ({ ...r, status: r.status as PaymentClaim['status'], createdAt: r.createdAt.toISOString() }));
  });
}

/** Turns a claim into real payments, oldest unpaid month first, in one transaction. */
export async function confirmClaim(a: Auth, id: string): Promise<{ applied: number }> {
  parse(uuidField, id);
  return withTenant(a.organizationId, async (tx) => {
    const [claim] = await tx.select().from(paymentClaims).where(eq(paymentClaims.id, id)).for('update');
    if (!claim) throw notFound('Claim');
    if (claim.status !== 'PENDING') throw conflict('That claim has already been handled.');

    const charges = await tx.select().from(rentCharges)
      .where(and(eq(rentCharges.leaseId, claim.leaseId), ne(rentCharges.status, 'PAID')))
      .orderBy(asc(rentCharges.dueDate)).for('update');
    const owed = charges.reduce((s, c) => s + (c.amount - c.paidAmount), 0);
    if (claim.amount > owed) {
      throw new AppError(422, 'VALIDATION_FAILED', `This tenant only owes ${owed.toLocaleString('en-US')}. Reject the claim, or check the amount.`);
    }

    let left = claim.amount;
    let n = 0;
    for (const c of charges) {
      if (left <= 0) break;
      const part = Math.min(left, c.amount - c.paidAmount);
      n++;
      await tx.insert(rentPayments).values({
        organizationId: a.organizationId, chargeId: c.id, amount: part, method: 'MPESA',
        reference: n === 1 ? claim.mpesaCode : `${claim.mpesaCode}/${n}`, recordedById: a.userId,
      });
      const paid = c.paidAmount + part;
      await tx.update(rentCharges).set({ paidAmount: paid, status: chargeStatus(c.amount, paid) }).where(eq(rentCharges.id, c.id));
      left -= part;
    }
    await tx.update(paymentClaims).set({ status: 'CONFIRMED', resolvedAt: new Date(), resolvedById: a.userId }).where(eq(paymentClaims.id, id));
    await recordAudit(tx, {
      organizationId: a.organizationId, actorId: a.userId, action: 'CREATE', entityType: 'rent_payment', entityId: claim.leaseId,
      summary: `Confirmed tenant payment claim ${claim.mpesaCode} for ${claim.amount.toLocaleString('en-US')}`,
    });
    return { applied: n };
  });
}

export async function rejectClaim(a: Auth, id: string): Promise<void> {
  parse(uuidField, id);
  await withTenant(a.organizationId, async (tx) => {
    const done = await tx.update(paymentClaims).set({ status: 'REJECTED', resolvedAt: new Date(), resolvedById: a.userId })
      .where(and(eq(paymentClaims.id, id), eq(paymentClaims.status, 'PENDING'))).returning({ id: paymentClaims.id });
    if (!done.length) throw notFound('Claim');
  });
}
