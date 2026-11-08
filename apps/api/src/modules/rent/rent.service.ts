import { z } from 'zod';
import { and, asc, eq, gte, inArray, isNull, lt, lte, ne, sql as dsql } from 'drizzle-orm';
import { RENT_PAYMENT_METHODS, effectivePlan, periodLabel, planHasModule } from '@kaya/shared';
import type {
  ArrearsReport, ChargeStatus, GenerateRentResult, LeaseItem, OwnerStatement, RentChargeItem,
  RentOverview, RentPaymentItem, StatementDeduction, StatementLine,
} from '@kaya/shared';
import { withTenant, type Tx } from '../../db/client';
import { systemDb } from '../../db/system';
import { clients, followUps, leases, maintenanceRequests, organizations, owners, properties, rentCharges, rentPayments } from '../../db/schema';
import { AppError, conflict, notFound } from '../../lib/errors';
import { parse } from '../../lib/validate';
import { recordAudit } from '../../lib/audit';
import { sendMail, rentReceiptEmail } from '../../lib/mailer';
import { type Auth, uuidField } from '../crm/common';

const periodField = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM');
const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine((d) => !Number.isNaN(Date.parse(d)), 'Invalid date');

export const leaseCreate = z.object({
  propertyId: uuidField,
  tenantId: uuidField,
  rentAmount: z.number().int().min(1).max(100_000_000),
  depositAmount: z.number().int().min(0).max(1_000_000_000).default(0),
  dueDay: z.number().int().min(1).max(28).default(1),
  startDate: dateField,
  endDate: dateField.nullable().optional(),
  feeBps: z.number().int().min(0).max(5000).default(0),
  withholdingBps: z.number().int().min(0).max(5000).default(0),
}).refine((v) => !v.endDate || v.endDate > v.startDate, { message: 'End date must be after the start date', path: ['endDate'] });

const renewInput = z.object({
  endDate: dateField,
  rentAmount: z.number().int().min(1).max(100_000_000).optional(),
});

/** How far ahead of a lease ending the agent is alerted. */
export const EXPIRY_ALERT_DAYS = 60;

const paymentInput = z.object({
  amount: z.number().int().min(1).max(1_000_000_000),
  method: z.enum(RENT_PAYMENT_METHODS),
  reference: z.string().trim().max(60).nullable().optional(),
  paidAt: z.string().datetime({ offset: true }).optional(),
});

const pad = (n: number) => String(n).padStart(2, '0');
export const currentPeriod = (d = new Date()) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
const lastDayOf = (period: string) => {
  const [y, m] = period.split('-').map(Number) as [number, number];
  return `${period}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
};
const bps = (amount: number, rate: number) => Math.round((amount * rate) / 10_000);

function chargeStatus(amount: number, paid: number): ChargeStatus {
  return paid <= 0 ? 'UNPAID' : paid >= amount ? 'PAID' : 'PARTIAL';
}

function leaseSelect(tx: Tx) {
  return tx.select({
    id: leases.id, propertyId: leases.propertyId, propertyTitle: properties.title,
    tenantId: leases.tenantId, tenantName: clients.fullName,
    ownerId: properties.ownerId, ownerName: owners.fullName,
    rentAmount: leases.rentAmount, depositAmount: leases.depositAmount, dueDay: leases.dueDay,
    startDate: leases.startDate, endDate: leases.endDate,
    feeBps: leases.feeBps, withholdingBps: leases.withholdingBps, status: leases.status,
  })
    .from(leases)
    .innerJoin(properties, eq(properties.id, leases.propertyId))
    .innerJoin(clients, eq(clients.id, leases.tenantId))
    .leftJoin(owners, eq(owners.id, properties.ownerId));
}

export async function listLeases(a: Auth, status?: string): Promise<LeaseItem[]> {
  return withTenant(a.organizationId, async (tx) => {
    const q = leaseSelect(tx);
    const rows = await (status === 'ACTIVE' || status === 'ENDED' ? q.where(eq(leases.status, status)) : q).orderBy(asc(properties.title));
    return rows as LeaseItem[];
  });
}

export async function createLease(a: Auth, body: unknown): Promise<LeaseItem> {
  const input = parse(leaseCreate, body);
  return withTenant(a.organizationId, async (tx) => {
    // Locking the property row serialises concurrent attempts to lease it.
    const [prop] = await tx.select({ id: properties.id }).from(properties).where(eq(properties.id, input.propertyId)).for('update');
    if (!prop) throw notFound('Property');
    const [tenant] = await tx.select({ id: clients.id }).from(clients).where(eq(clients.id, input.tenantId));
    if (!tenant) throw notFound('Tenant');
    const [active] = await tx.select({ id: leases.id }).from(leases)
      .where(and(eq(leases.propertyId, input.propertyId), eq(leases.status, 'ACTIVE'))).limit(1);
    if (active) throw conflict('This property already has an active lease. End it first.', 'LEASE_EXISTS');

    const [row] = await tx.insert(leases).values({
      organizationId: a.organizationId, ...input, endDate: input.endDate ?? null,
    }).returning({ id: leases.id });
    await recordAudit(tx, {
      organizationId: a.organizationId, actorId: a.userId, action: 'CREATE', entityType: 'lease', entityId: row!.id,
      summary: `Created lease at KES ${input.rentAmount}/month`,
    });
    const [item] = await leaseSelect(tx).where(eq(leases.id, row!.id));
    return item as LeaseItem;
  });
}

export async function endLease(a: Auth, id: string, endDate?: string): Promise<LeaseItem> {
  parse(uuidField, id);
  const end = endDate ? parse(dateField, endDate) : new Date().toISOString().slice(0, 10);
  return withTenant(a.organizationId, async (tx) => {
    const [lease] = await tx.select().from(leases).where(eq(leases.id, id)).for('update');
    if (!lease) throw notFound('Lease');
    if (lease.status === 'ENDED') throw conflict('This lease has already ended.', 'LEASE_ENDED');
    await tx.update(leases).set({ status: 'ENDED', endDate: end }).where(eq(leases.id, id));
    await recordAudit(tx, {
      organizationId: a.organizationId, actorId: a.userId, action: 'UPDATE', entityType: 'lease', entityId: id, summary: 'Ended lease',
    });
    const [item] = await leaseSelect(tx).where(eq(leases.id, id));
    return item as LeaseItem;
  });
}

export async function renewLease(a: Auth, id: string, body: unknown): Promise<LeaseItem> {
  parse(uuidField, id);
  const input = parse(renewInput, body);
  return withTenant(a.organizationId, async (tx) => {
    const [lease] = await tx.select().from(leases).where(eq(leases.id, id)).for('update');
    if (!lease) throw notFound('Lease');
    if (lease.status !== 'ACTIVE') throw conflict('Only an active lease can be renewed. Create a new lease instead.', 'LEASE_ENDED');
    if (input.endDate <= lease.startDate || (lease.endDate && input.endDate <= lease.endDate)) {
      throw new AppError(422, 'VALIDATION_FAILED', 'The new end date must be after the current one.', { fields: { endDate: 'Must be later than the current end date' } });
    }
    await tx.update(leases).set({
      endDate: input.endDate,
      rentAmount: input.rentAmount ?? lease.rentAmount,
      expiryAlertSentAt: null, // the new term gets its own alert
    }).where(eq(leases.id, id));
    await recordAudit(tx, {
      organizationId: a.organizationId, actorId: a.userId, action: 'UPDATE', entityType: 'lease', entityId: id,
      summary: `Renewed lease to ${input.endDate}${input.rentAmount && input.rentAmount !== lease.rentAmount ? ` at KES ${input.rentAmount}/month` : ''}`,
    });
    const [item] = await leaseSelect(tx).where(eq(leases.id, id));
    return item as LeaseItem;
  });
}

/**
 * Raises one rent charge per active lease for the period. Safe to run again:
 * the (lease, period) unique key turns repeats into no-ops, so a double click
 * or a monthly re-run never bills a tenant twice. The first month is charged
 * in full (no proration) — agencies adjust by recording what was actually agreed.
 */
async function raiseCharges(tx: Tx, organizationId: string, period: string): Promise<{ created: number; alreadyExisted: number }> {
  const first = `${period}-01`;
  const last = lastDayOf(period);
  const active = await tx.select().from(leases).where(and(eq(leases.status, 'ACTIVE'), dsql`${leases.startDate} <= ${last}`));
  const due = active.filter((l) => !l.endDate || l.endDate >= first);
  let created = 0;
  for (const l of due) {
    const inserted = await tx.insert(rentCharges).values({
      organizationId, leaseId: l.id, period,
      dueDate: `${period}-${pad(l.dueDay)}`, amount: l.rentAmount,
    }).onConflictDoNothing({ target: [rentCharges.leaseId, rentCharges.period] }).returning({ id: rentCharges.id });
    created += inserted.length;
  }
  return { created, alreadyExisted: due.length - created };
}

export async function generateCharges(a: Auth, body: unknown): Promise<GenerateRentResult> {
  const { period } = parse(z.object({ period: periodField }), body);
  return withTenant(a.organizationId, async (tx) => {
    const r = await raiseCharges(tx, a.organizationId, period);
    if (r.created) {
      await recordAudit(tx, {
        organizationId: a.organizationId, actorId: a.userId, action: 'CREATE', entityType: 'rent_charge', entityId: a.organizationId,
        summary: `Generated ${r.created} rent charges for ${period}`,
      });
    }
    return { period, ...r };
  });
}

/**
 * Background job: raises the current month's rent for every agency that has
 * active leases, so nobody has to remember to press the button. Safe to run
 * as often as you like, and from several server instances at once, because
 * the (lease, period) unique key makes repeats no-ops. Skips suspended
 * agencies and plans without rent management.
 */
export async function sweepRentCharges(now: Date = new Date()): Promise<{ organizations: number; created: number }> {
  const period = currentPeriod(now);
  const orgRows = await systemDb.selectDistinct({ id: leases.organizationId }).from(leases).where(eq(leases.status, 'ACTIVE'));
  let organizationsTouched = 0;
  let total = 0;
  for (const { id } of orgRows) {
    try {
      const [org] = await systemDb.select({ plan: organizations.plan, planExpiresAt: organizations.planExpiresAt, suspendedAt: organizations.suspendedAt })
        .from(organizations).where(eq(organizations.id, id));
      if (!org || org.suspendedAt || !planHasModule(effectivePlan(org.plan, org.planExpiresAt, now), 'rentManagement')) continue;
      const created = await withTenant(id, async (tx) => {
        const r = await raiseCharges(tx, id, period);
        if (r.created) {
          await recordAudit(tx, {
            organizationId: id, actorId: null, action: 'CREATE', entityType: 'rent_charge', entityId: id,
            summary: `Automatically raised ${r.created} rent charges for ${period}`,
          });
        }
        return r.created;
      });
      if (created) { organizationsTouched++; total += created; }
    } catch (err) {
      // One agency's problem must not stop the others.
      console.error(`[rent-scheduler] failed for organization ${id}`, err);
    }
  }
  return { organizations: organizationsTouched, created: total };
}

function chargeSelect(tx: Tx) {
  return tx.select({
    id: rentCharges.id, leaseId: rentCharges.leaseId, propertyTitle: properties.title, tenantName: clients.fullName,
    period: rentCharges.period, dueDate: rentCharges.dueDate, amount: rentCharges.amount,
    paidAmount: rentCharges.paidAmount, status: rentCharges.status,
  })
    .from(rentCharges)
    .innerJoin(leases, eq(leases.id, rentCharges.leaseId))
    .innerJoin(properties, eq(properties.id, leases.propertyId))
    .innerJoin(clients, eq(clients.id, leases.tenantId));
}

const toCharge = (r: Omit<RentChargeItem, 'balance'>): RentChargeItem => ({ ...r, balance: r.amount - r.paidAmount });

export async function listCharges(a: Auth, query: { period?: string }): Promise<RentChargeItem[]> {
  const period = parse(periodField, query.period ?? currentPeriod());
  return withTenant(a.organizationId, async (tx) => {
    const rows = await chargeSelect(tx).where(eq(rentCharges.period, period)).orderBy(asc(rentCharges.dueDate), asc(properties.title));
    return rows.map((r) => toCharge(r as Omit<RentChargeItem, 'balance'>));
  });
}

export async function recordPayment(a: Auth, chargeId: string, body: unknown): Promise<RentChargeItem> {
  parse(uuidField, chargeId);
  const input = parse(paymentInput, body);
  return withTenant(a.organizationId, async (tx) => {
    // Lock the charge so two payments recorded at once can't both pass the
    // balance check and overpay it.
    const [charge] = await tx.select().from(rentCharges).where(eq(rentCharges.id, chargeId)).for('update');
    if (!charge) throw notFound('Rent charge');
    const balance = charge.amount - charge.paidAmount;
    if (input.amount > balance) {
      throw new AppError(422, 'VALIDATION_FAILED', `Amount is more than the outstanding balance of KES ${balance}.`, { fields: { amount: `Maximum KES ${balance}` } });
    }
    if (input.method === 'MPESA' && input.reference) {
      const [dup] = await tx.select({ id: rentPayments.id }).from(rentPayments)
        .where(and(eq(rentPayments.method, 'MPESA'), eq(rentPayments.reference, input.reference.toUpperCase()))).limit(1);
      if (dup) throw conflict('That M-Pesa code has already been recorded.', 'DUPLICATE_REFERENCE');
    }
    await tx.insert(rentPayments).values({
      organizationId: a.organizationId, chargeId, amount: input.amount, method: input.method,
      reference: input.reference ? input.reference.toUpperCase() : null,
      paidAt: input.paidAt ? new Date(input.paidAt) : new Date(), recordedById: a.userId,
    });
    const paid = charge.paidAmount + input.amount;
    await tx.update(rentCharges).set({ paidAmount: paid, status: chargeStatus(charge.amount, paid) }).where(eq(rentCharges.id, chargeId));
    await recordAudit(tx, {
      organizationId: a.organizationId, actorId: a.userId, action: 'CREATE', entityType: 'rent_payment', entityId: chargeId,
      summary: `Recorded KES ${input.amount} ${input.method} rent payment`,
    });
    const [item] = await chargeSelect(tx).where(eq(rentCharges.id, chargeId));
    return toCharge(item as Omit<RentChargeItem, 'balance'>);
  });
}

export async function listPayments(a: Auth, chargeId: string): Promise<RentPaymentItem[]> {
  parse(uuidField, chargeId);
  return withTenant(a.organizationId, async (tx) => {
    const rows = await tx.select().from(rentPayments).where(eq(rentPayments.chargeId, chargeId)).orderBy(asc(rentPayments.paidAt));
    return rows.map((r) => ({
      id: r.id, amount: r.amount, method: r.method as RentPaymentItem['method'], reference: r.reference, paidAt: r.paidAt.toISOString(),
    }));
  });
}

/** Emails a rent receipt for one payment to the tenant's address on their client record. */
export async function emailReceipt(a: Auth, paymentId: string): Promise<{ sent: boolean; to: string }> {
  parse(uuidField, paymentId);
  const row = await withTenant(a.organizationId, async (tx) => {
    const [r] = await tx.select({
      paymentId: rentPayments.id, amount: rentPayments.amount, method: rentPayments.method, reference: rentPayments.reference, paidAt: rentPayments.paidAt,
      period: rentCharges.period, rentAmount: rentCharges.amount, paidToDate: rentCharges.paidAmount,
      tenantName: clients.fullName, tenantEmail: clients.email, propertyTitle: properties.title,
    }).from(rentPayments)
      .innerJoin(rentCharges, eq(rentPayments.chargeId, rentCharges.id))
      .innerJoin(leases, eq(rentCharges.leaseId, leases.id))
      .innerJoin(clients, eq(leases.tenantId, clients.id))
      .innerJoin(properties, eq(leases.propertyId, properties.id))
      .where(eq(rentPayments.id, paymentId));
    return r ?? null;
  });
  if (!row) throw notFound('Payment');
  if (!row.tenantEmail) {
    throw new AppError(422, 'VALIDATION_FAILED', 'This tenant has no email address. Add one to their client record first.');
  }
  const [org] = await systemDb.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, a.organizationId));
  const method = row.method === 'MPESA' ? 'M-Pesa' : row.method[0] + row.method.slice(1).toLowerCase();
  const mail = rentReceiptEmail({
    agencyName: org?.name ?? 'Your agent', tenantName: row.tenantName, propertyTitle: row.propertyTitle,
    periodLabel: periodLabel(row.period), receiptNo: `RCT-${row.paymentId.replace(/-/g, '').slice(0, 8).toUpperCase()}`,
    amount: row.amount, method, reference: row.reference,
    paidOn: row.paidAt.toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' }),
    rentAmount: row.rentAmount, paidToDate: row.paidToDate, balance: row.rentAmount - row.paidToDate,
  });
  const sent = await sendMail({ to: row.tenantEmail, ...mail });
  if (!sent) throw new AppError(503, 'EMAIL_NOT_SENT', 'The email could not be sent right now. Check that email is set up, then try again.');
  await withTenant(a.organizationId, (tx) => recordAudit(tx, {
    organizationId: a.organizationId, actorId: a.userId, action: 'UPDATE', entityType: 'rent_payment', entityId: paymentId,
    summary: `Emailed rent receipt to ${row.tenantName}`,
  }));
  return { sent: true, to: row.tenantEmail };
}

export async function getOverview(a: Auth, query: { period?: string }): Promise<RentOverview> {
  const period = parse(periodField, query.period ?? currentPeriod());
  return withTenant(a.organizationId, async (tx) => {
    const [row] = await tx.select({
      expected: dsql<number>`coalesce(sum(${rentCharges.amount}), 0)::int`,
      collected: dsql<number>`coalesce(sum(${rentCharges.paidAmount}), 0)::int`,
    }).from(rentCharges).where(eq(rentCharges.period, period));
    const [active] = await tx.select({ c: dsql<number>`count(*)::int` }).from(leases).where(eq(leases.status, 'ACTIVE'));
    const expected = row?.expected ?? 0;
    const collected = row?.collected ?? 0;
    return {
      period, expected, collected, outstanding: expected - collected,
      collectionRate: expected > 0 ? collected / expected : 0, activeLeases: active?.c ?? 0,
    };
  });
}

export async function getArrears(a: Auth): Promise<ArrearsReport> {
  const today = new Date().toISOString().slice(0, 10);
  return withTenant(a.organizationId, async (tx) => {
    const rows = await tx.select({
      chargeId: rentCharges.id, propertyTitle: properties.title, tenantName: clients.fullName, tenantPhone: clients.phone,
      period: rentCharges.period, dueDate: rentCharges.dueDate, amount: rentCharges.amount, paidAmount: rentCharges.paidAmount,
    })
      .from(rentCharges)
      .innerJoin(leases, eq(leases.id, rentCharges.leaseId))
      .innerJoin(properties, eq(properties.id, leases.propertyId))
      .innerJoin(clients, eq(clients.id, leases.tenantId))
      .where(and(ne(rentCharges.status, 'PAID'), lt(rentCharges.dueDate, today)))
      .orderBy(asc(rentCharges.dueDate));
    const mapped = rows.map((r) => ({
      chargeId: r.chargeId, propertyTitle: r.propertyTitle, tenantName: r.tenantName, tenantPhone: r.tenantPhone ?? null,
      period: r.period, dueDate: r.dueDate, balance: r.amount - r.paidAmount,
      daysOverdue: Math.floor((Date.parse(today) - Date.parse(r.dueDate)) / 86_400_000),
    }));
    return { total: mapped.reduce((s, r) => s + r.balance, 0), rows: mapped };
  });
}

/**
 * What the agency owes a landlord for a month: rent collected, less its own
 * management fee and any tax the agency withholds on the landlord's behalf.
 * Uses what was actually *collected*, never what was merely billed.
 */
export async function ownerStatement(a: Auth, ownerId: string, periodInput?: string): Promise<OwnerStatement> {
  parse(uuidField, ownerId);
  const period = parse(periodField, periodInput ?? currentPeriod());
  return withTenant(a.organizationId, async (tx) => {
    const [owner] = await tx.select({ id: owners.id, fullName: owners.fullName }).from(owners).where(eq(owners.id, ownerId));
    if (!owner) throw notFound('Owner');
    const props = await tx.select({ id: properties.id }).from(properties).where(eq(properties.ownerId, ownerId));
    const rows = props.length === 0 ? [] : await tx.select({
      leaseId: leases.id, propertyTitle: properties.title, tenantName: clients.fullName,
      amount: rentCharges.amount, paid: rentCharges.paidAmount, feeBps: leases.feeBps, withholdingBps: leases.withholdingBps,
    })
      .from(rentCharges)
      .innerJoin(leases, eq(leases.id, rentCharges.leaseId))
      .innerJoin(properties, eq(properties.id, leases.propertyId))
      .innerJoin(clients, eq(clients.id, leases.tenantId))
      .where(and(eq(rentCharges.period, period), inArray(leases.propertyId, props.map((p) => p.id))))
      .orderBy(asc(properties.title));

    const lines: StatementLine[] = rows.map((r) => {
      const managementFee = bps(r.paid, r.feeBps);
      const withholding = bps(r.paid - managementFee, r.withholdingBps);
      return {
        leaseId: r.leaseId, propertyTitle: r.propertyTitle, tenantName: r.tenantName,
        rentDue: r.amount, collected: r.paid, managementFee, withholding, netToLandlord: r.paid - managementFee - withholding,
      };
    });

    // Repairs finished this month that the agency is recharging to the landlord.
    const monthStart = new Date(`${period}-01T00:00:00Z`);
    const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));
    const repairs = props.length === 0 ? [] : await tx.select({
      requestId: maintenanceRequests.id, propertyTitle: properties.title, title: maintenanceRequests.title, amount: maintenanceRequests.actualCost,
    })
      .from(maintenanceRequests)
      .innerJoin(properties, eq(properties.id, maintenanceRequests.propertyId))
      .where(and(
        inArray(maintenanceRequests.propertyId, props.map((p) => p.id)),
        eq(maintenanceRequests.status, 'DONE'), eq(maintenanceRequests.chargeToLandlord, true),
        gte(maintenanceRequests.resolvedAt, monthStart), lt(maintenanceRequests.resolvedAt, monthEnd),
      ))
      .orderBy(asc(maintenanceRequests.resolvedAt));
    const deductions: StatementDeduction[] = repairs.filter((r) => (r.amount ?? 0) > 0).map((r) => ({
      requestId: r.requestId, propertyTitle: r.propertyTitle, title: r.title, amount: r.amount!,
    }));
    const maintenance = deductions.reduce((s, d) => s + d.amount, 0);

    const sum = (k: keyof StatementLine) => lines.reduce((s, l) => s + (l[k] as number), 0);
    return {
      ownerId, ownerName: owner.fullName ?? 'Owner', period, lines, deductions,
      totals: {
        rentDue: sum('rentDue'), collected: sum('collected'), managementFee: sum('managementFee'), withholding: sum('withholding'),
        maintenance, netToLandlord: sum('netToLandlord') - maintenance,
      },
    };
  });
}

const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

/**
 * Background job: when an active lease is within EXPIRY_ALERT_DAYS of its end
 * date, raises one follow-up for the property's agent (or the tenant's agent)
 * to discuss renewal. The alert is stamped on the lease so it fires once per
 * term; renewing clears the stamp. Same eligibility rules as the rent sweep.
 */
export async function sweepLeaseExpiry(now: Date = new Date()): Promise<{ alerts: number }> {
  const today = now.toISOString().slice(0, 10);
  const horizon = addDays(now, EXPIRY_ALERT_DAYS).toISOString().slice(0, 10);
  const due = await systemDb.select({ id: leases.id, organizationId: leases.organizationId })
    .from(leases)
    .where(and(eq(leases.status, 'ACTIVE'), isNull(leases.expiryAlertSentAt), lte(leases.endDate, horizon)));

  const byOrg = new Map<string, string[]>();
  for (const l of due) byOrg.set(l.organizationId, [...(byOrg.get(l.organizationId) ?? []), l.id]);

  let alerts = 0;
  for (const [orgId, leaseIds] of byOrg) {
    try {
      const [org] = await systemDb.select({ plan: organizations.plan, planExpiresAt: organizations.planExpiresAt, suspendedAt: organizations.suspendedAt })
        .from(organizations).where(eq(organizations.id, orgId));
      if (!org || org.suspendedAt || !planHasModule(effectivePlan(org.plan, org.planExpiresAt, now), 'rentManagement')) continue;
      alerts += await withTenant(orgId, async (tx) => {
        const rows = await tx.select({
          id: leases.id, endDate: leases.endDate, rentAmount: leases.rentAmount, tenantId: leases.tenantId,
          tenantName: clients.fullName, tenantAgent: clients.assignedAgentId,
          propertyTitle: properties.title, propertyAgent: properties.assignedAgentId,
        })
          .from(leases)
          .innerJoin(properties, eq(properties.id, leases.propertyId))
          .innerJoin(clients, eq(clients.id, leases.tenantId))
          .where(and(inArray(leases.id, leaseIds), isNull(leases.expiryAlertSentAt)));
        for (const l of rows) {
          const daysLeft = Math.round((Date.parse(l.endDate!) - Date.parse(today)) / 86_400_000);
          await tx.insert(followUps).values({
            organizationId: orgId,
            title: `Lease renewal: ${l.tenantName}, ${l.propertyTitle}`,
            notes: daysLeft >= 0
              ? `This lease ends on ${l.endDate} (${daysLeft} day${daysLeft === 1 ? '' : 's'} left). Rent is KES ${l.rentAmount}/month. Agree a renewal or plan the handover.`
              : `This lease ended on ${l.endDate} and is still marked active. Renew it or end it in the Rent section.`,
            dueAt: now,
            priority: daysLeft <= 14 ? 'HIGH' : 'MEDIUM',
            clientId: l.tenantId,
            assignedToId: l.propertyAgent ?? l.tenantAgent ?? null,
          });
          await tx.update(leases).set({ expiryAlertSentAt: now }).where(eq(leases.id, l.id));
        }
        return rows.length;
      });
    } catch (err) {
      console.error(`[rent-scheduler] lease expiry alerts failed for organization ${orgId}`, err);
    }
  }
  return { alerts };
}
