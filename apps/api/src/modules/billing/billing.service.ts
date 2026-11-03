import { z } from 'zod';
import { timingSafeEqual } from 'node:crypto';
import { and, count, desc, eq, gt } from 'drizzle-orm';
import { BILLING_MONTHS, PLANS, effectivePlan, quoteKes, PLAN_LABELS } from '@kaya/shared';
import type { BillingOverview, BillingPayment, Plan } from '@kaya/shared';
import { env } from '../../config/env';
import { systemDb } from '../../db/system';
import { withTenant } from '../../db/client';
import { billingPayments, organizations, users } from '../../db/schema';
import { AppError, conflict, notFound } from '../../lib/errors';
import { parse } from '../../lib/validate';
import { mpesaConfigured, stkPush, stkQuery, toMsisdn } from '../../lib/mpesa';
import { type Auth } from '../crm/common';

const PLAN_RANK: Record<Plan, number> = { STARTER: 0, GROWTH: 1, PRO: 2 };

const checkoutInput = z.object({
  plan: z.enum(PLANS),
  months: z.union([z.literal(BILLING_MONTHS[0]), z.literal(BILLING_MONTHS[1])]),
  phone: z.string().trim().min(9).max(20),
});

function toDto(r: typeof billingPayments.$inferSelect): BillingPayment {
  return {
    id: r.id,
    plan: r.plan,
    months: r.months,
    seats: r.seats,
    amount: r.amount,
    status: r.status as BillingPayment['status'],
    mpesaReceipt: r.mpesaReceipt,
    failureReason: r.failureReason,
    createdAt: r.createdAt.toISOString(),
    paidAt: r.paidAt?.toISOString() ?? null,
  };
}

async function seatCount(organizationId: string): Promise<number> {
  const [row] = await systemDb.select({ c: count() }).from(users).where(eq(users.organizationId, organizationId));
  return Math.max(1, row?.c ?? 1);
}

export async function getBilling(a: Auth): Promise<BillingOverview> {
  const [org] = await systemDb.select().from(organizations).where(eq(organizations.id, a.organizationId));
  if (!org) throw notFound('Organization');
  const payments = await withTenant(a.organizationId, (tx) =>
    tx.select().from(billingPayments).orderBy(desc(billingPayments.createdAt)).limit(10),
  );
  return {
    plan: org.plan,
    effectivePlan: effectivePlan(org.plan, org.planExpiresAt),
    expiresAt: org.planExpiresAt?.toISOString() ?? null,
    seats: await seatCount(a.organizationId),
    paymentsEnabled: mpesaConfigured(),
    payments: payments.map(toDto),
  };
}

export async function startCheckout(a: Auth, body: unknown): Promise<BillingPayment> {
  const input = parse(checkoutInput, body);
  if (!mpesaConfigured()) {
    throw new AppError(503, 'PAYMENTS_DISABLED', 'Online payments are not set up yet. Please contact Kaya to upgrade.');
  }
  if (input.plan === 'STARTER') throw conflict('Starter is the free entry plan; choose Growth or Pro.', 'INVALID_PLAN');
  const msisdn = toMsisdn(input.phone);
  if (!msisdn) throw new AppError(422, 'VALIDATION_FAILED', 'Enter a valid Safaricom number, e.g. 0712 345 678.', { fields: { phone: 'Invalid M-Pesa number' } });

  const [org] = await systemDb.select().from(organizations).where(eq(organizations.id, a.organizationId));
  if (!org) throw notFound('Organization');
  if (PLAN_RANK[input.plan] < PLAN_RANK[effectivePlan(org.plan, org.planExpiresAt)]) {
    throw conflict('You are already on a higher plan. Contact Kaya to change down.', 'INVALID_PLAN');
  }

  // One prompt at a time: a second tap while the first PIN prompt is still on
  // the phone would otherwise stack payments.
  const recent = new Date(Date.now() - 2 * 60_000);
  const [inflight] = await systemDb.select({ id: billingPayments.id }).from(billingPayments)
    .where(and(eq(billingPayments.organizationId, a.organizationId), eq(billingPayments.status, 'PENDING'), gt(billingPayments.createdAt, recent)))
    .limit(1);
  if (inflight) throw conflict('A payment is already waiting for your PIN. Check your phone, or try again in a couple of minutes.', 'PAYMENT_IN_PROGRESS');

  const seats = await seatCount(a.organizationId);
  const amount = quoteKes(input.plan, seats, input.months);
  const [row] = await systemDb.insert(billingPayments).values({
    organizationId: a.organizationId, plan: input.plan, months: input.months, seats, amount, phone: msisdn, createdById: a.userId,
  }).returning();
  if (!row) throw new AppError(500, 'INTERNAL', 'Could not start the payment.');

  try {
    const push = await stkPush({
      msisdn, amount,
      reference: `KAYA-${row.id.slice(0, 6).toUpperCase()}`,
      description: `${PLAN_LABELS[input.plan]} plan`,
    });
    const [updated] = await systemDb.update(billingPayments)
      .set({ checkoutRequestId: push.checkoutRequestId, merchantRequestId: push.merchantRequestId })
      .where(eq(billingPayments.id, row.id)).returning();
    return toDto(updated ?? row);
  } catch (err) {
    await systemDb.update(billingPayments)
      .set({ status: 'FAILED', failureReason: err instanceof Error ? err.message.slice(0, 200) : 'Could not start payment' })
      .where(eq(billingPayments.id, row.id));
    throw err;
  }
}

function addMonths(from: Date, months: number): Date {
  const d = new Date(from);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

/**
 * Settles a payment exactly once. The PENDING->final transition is a single
 * conditional UPDATE, so a duplicate callback, or a callback racing the
 * status poll, can never extend the plan twice.
 */
async function settle(
  payment: typeof billingPayments.$inferSelect,
  outcome: { ok: true; receipt: string | null } | { ok: false; reason: string },
): Promise<void> {
  await systemDb.transaction(async (tx) => {
    const [claimed] = await tx.update(billingPayments)
      .set(outcome.ok
        ? { status: 'PAID', paidAt: new Date(), mpesaReceipt: outcome.receipt }
        : { status: 'FAILED', failureReason: outcome.reason.slice(0, 200) })
      .where(and(eq(billingPayments.id, payment.id), eq(billingPayments.status, 'PENDING')))
      .returning({ id: billingPayments.id });
    if (!claimed || !outcome.ok) return;

    const [org] = await tx.select().from(organizations).where(eq(organizations.id, payment.organizationId));
    if (!org) return;
    const now = new Date();
    const stillActive = org.planExpiresAt && org.planExpiresAt > now && org.plan === payment.plan;
    const base = stillActive ? org.planExpiresAt! : now; // renewing early never wastes paid time
    await tx.update(organizations)
      .set({ plan: payment.plan, planExpiresAt: addMonths(base, payment.months) })
      .where(eq(organizations.id, org.id));
  });
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function isValidCallbackSecret(secret: string): boolean {
  return !!env.MPESA_CALLBACK_SECRET && safeEqual(secret, env.MPESA_CALLBACK_SECRET);
}

interface StkCallbackBody {
  Body?: { stkCallback?: {
    CheckoutRequestID?: string;
    ResultCode?: number;
    ResultDesc?: string;
    CallbackMetadata?: { Item?: { Name: string; Value?: string | number }[] };
  } };
}

export async function handleMpesaCallback(body: unknown): Promise<void> {
  const cb = (body as StkCallbackBody)?.Body?.stkCallback;
  if (!cb?.CheckoutRequestID) return;
  const [payment] = await systemDb.select().from(billingPayments).where(eq(billingPayments.checkoutRequestId, cb.CheckoutRequestID));
  if (!payment) return;

  if (cb.ResultCode !== 0) {
    await settle(payment, { ok: false, reason: cb.ResultDesc || 'Payment was not completed' });
    return;
  }
  const items = new Map((cb.CallbackMetadata?.Item ?? []).map((i) => [i.Name, i.Value]));
  const paid = Number(items.get('Amount'));
  // Never grant a plan for less than was asked: a mismatch is held as a
  // failure for a human to look at, not silently accepted.
  if (!Number.isFinite(paid) || paid < payment.amount) {
    console.error(`[billing] M-Pesa amount mismatch for payment ${payment.id}: expected ${payment.amount}, got ${paid}`);
    await settle(payment, { ok: false, reason: `Amount mismatch (expected ${payment.amount}, got ${paid})` });
    return;
  }
  await settle(payment, { ok: true, receipt: items.get('MpesaReceiptNumber') ? String(items.get('MpesaReceiptNumber')) : null });
}

export async function getPayment(a: Auth, id: string): Promise<BillingPayment> {
  parse(z.string().uuid(), id);
  let [row] = await withTenant(a.organizationId, (tx) => tx.select().from(billingPayments).where(eq(billingPayments.id, id)));
  if (!row) throw notFound('Payment');

  // The callback normally lands within seconds. If it hasn't, ask Safaricom
  // directly rather than leaving the customer staring at a spinner.
  if (row.status === 'PENDING' && row.checkoutRequestId && Date.now() - row.createdAt.getTime() > 25_000 && mpesaConfigured()) {
    try {
      const q = await stkQuery(row.checkoutRequestId);
      if (q) {
        await settle(row, q.resultCode === 0 ? { ok: true, receipt: null } : { ok: false, reason: q.resultDesc || 'Payment was not completed' });
        [row] = await withTenant(a.organizationId, (tx) => tx.select().from(billingPayments).where(eq(billingPayments.id, id)));
      }
    } catch (err) {
      console.warn('[billing] M-Pesa status query failed', err);
    }
  }
  return toDto(row!);
}
