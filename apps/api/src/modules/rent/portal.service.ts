import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { and, desc, eq, gt, gte, inArray, lt, lte, notInArray, sql } from 'drizzle-orm';
import { effectivePlan, periodLabel, planHasModule, type PortalOwing, type PortalTrendPoint, type PortalUnit, type PortalView, type TenantPortalView } from '@kaya/shared';
import { withTenant } from '../../db/client';
import { systemDb } from '../../db/system';
import { clients, leases, maintenanceRequests, organizations, owners, paymentClaims, properties, propertyImages, rentCharges } from '../../db/schema';
import { notFound } from '../../lib/errors';
import { parse } from '../../lib/validate';
import { recordAudit } from '../../lib/audit';
import { type Auth, uuidField } from '../crm/common';
import { ownerStatement, currentPeriod, tenantStatement } from './rent.service';
import { appUrl } from '../../config/env';
import { canCollectByMpesa } from './mpesa-pay.service';
import { ownerStatementEmail, sendMail } from '../../lib/mailer';
import { AppError } from '../../lib/errors';

const periodField = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM');

export async function getPortalLink(a: Auth, ownerId: string): Promise<{ token: string | null }> {
  parse(uuidField, ownerId);
  return withTenant(a.organizationId, async (tx) => {
    const [o] = await tx.select({ token: owners.portalToken }).from(owners).where(eq(owners.id, ownerId));
    if (!o) throw notFound('Owner');
    return { token: o.token };
  });
}

/** Creates the landlord's link, or replaces it (the old link stops working at once). */
export async function createPortalLink(a: Auth, ownerId: string): Promise<{ token: string }> {
  parse(uuidField, ownerId);
  const token = randomBytes(24).toString('base64url');
  await withTenant(a.organizationId, async (tx) => {
    const done = await tx.update(owners).set({ portalToken: token }).where(eq(owners.id, ownerId)).returning({ id: owners.id });
    if (!done.length) throw notFound('Owner');
    await recordAudit(tx, {
      organizationId: a.organizationId, actorId: a.userId, action: 'UPDATE', entityType: 'owner', entityId: ownerId, summary: 'Created landlord portal link',
    });
  });
  return { token };
}

export async function revokePortalLink(a: Auth, ownerId: string): Promise<void> {
  parse(uuidField, ownerId);
  await withTenant(a.organizationId, async (tx) => {
    const done = await tx.update(owners).set({ portalToken: null }).where(eq(owners.id, ownerId)).returning({ id: owners.id });
    if (!done.length) throw notFound('Owner');
    await recordAudit(tx, {
      organizationId: a.organizationId, actorId: a.userId, action: 'UPDATE', entityType: 'owner', entityId: ownerId, summary: 'Revoked landlord portal link',
    });
  });
}

/**
 * Public, read-only view for a landlord. The link's secret is the only
 * credential, so every failure looks the same (404) and nothing editable or
 * personal beyond tenant names and rent is exposed.
 */
export async function getPortal(token: string, periodInput?: string): Promise<PortalView> {
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) throw notFound('Page');
  const period = parse(periodField, periodInput ?? currentPeriod());
  const [hit] = await systemDb.select({
    ownerId: owners.id, organizationId: owners.organizationId, agencyName: organizations.name, agencySlug: organizations.slug, currency: organizations.currency,
    plan: organizations.plan, planExpiresAt: organizations.planExpiresAt, suspendedAt: organizations.suspendedAt,
  }).from(owners).innerJoin(organizations, eq(organizations.id, owners.organizationId)).where(eq(owners.portalToken, token));
  if (!hit || hit.suspendedAt || !planHasModule(effectivePlan(hit.plan, hit.planExpiresAt), 'rentManagement')) throw notFound('Page');

  const auth = { organizationId: hit.organizationId } as Auth;
  const statement = await ownerStatement(auth, hit.ownerId, period);
  const { units, openRepairs, owing, expiring } = await withTenant(hit.organizationId, async (tx) => {
    const props = await tx.select({
      id: properties.id, title: properties.title, location: properties.location, building: properties.building, unitNumber: properties.unitNumber,
      price: properties.price, listingType: properties.listingType, status: properties.status, advertised: properties.advertised,
    }).from(properties).where(eq(properties.ownerId, hit.ownerId)).orderBy(properties.building, properties.unitNumber, properties.title);
    if (!props.length) return { units: [], openRepairs: [], owing: [] as PortalOwing[], expiring: 0 };
    const ids = props.map((p) => p.id);
    const active = await tx.select({ propertyId: leases.propertyId, rent: leases.rentAmount, tenantName: clients.fullName })
      .from(leases).innerJoin(clients, eq(clients.id, leases.tenantId))
      .where(and(inArray(leases.propertyId, ids), eq(leases.status, 'ACTIVE')));
    const byProp = new Map(active.map((l) => [l.propertyId, l]));
    const repairs = await tx.select({
      title: maintenanceRequests.title, propertyId: maintenanceRequests.propertyId, priority: maintenanceRequests.priority,
      status: maintenanceRequests.status, createdAt: maintenanceRequests.createdAt,
    }).from(maintenanceRequests)
      .where(and(inArray(maintenanceRequests.propertyId, ids), notInArray(maintenanceRequests.status, ['DONE', 'CANCELLED'])));
    const covers = await tx.select({ propertyId: propertyImages.propertyId, url: propertyImages.url, isCover: propertyImages.isCover, position: propertyImages.position })
      .from(propertyImages).where(inArray(propertyImages.propertyId, ids)).orderBy(desc(propertyImages.isCover), propertyImages.position);
    const cover = new Map<string, string>();
    for (const c of covers) if (!cover.has(c.propertyId)) cover.set(c.propertyId, c.url);
    const title = new Map(props.map((p) => [p.id, p.title]));
    const todayIso = new Date().toISOString().slice(0, 10);
    const behind = await tx.select({
      leaseId: leases.id, propertyTitle: properties.title, tenantName: clients.fullName, owed: sql<number>`sum(${rentCharges.amount} - ${rentCharges.paidAmount})::int`, months: sql<number>`count(*)::int`,
    }).from(rentCharges)
      .innerJoin(leases, eq(leases.id, rentCharges.leaseId))
      .innerJoin(properties, eq(properties.id, leases.propertyId))
      .innerJoin(clients, eq(clients.id, leases.tenantId))
      .where(and(inArray(leases.propertyId, ids), eq(leases.status, 'ACTIVE'), lt(rentCharges.dueDate, todayIso), gt(rentCharges.amount, rentCharges.paidAmount)))
      .groupBy(leases.id, properties.title, clients.fullName)
      .orderBy(desc(sql`sum(${rentCharges.amount} - ${rentCharges.paidAmount})`));
    const soon = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
    const [ending] = await tx.select({ n: sql<number>`count(*)::int` }).from(leases)
      .where(and(inArray(leases.propertyId, ids), eq(leases.status, 'ACTIVE'), gte(leases.endDate, todayIso), lte(leases.endDate, soon)));
    return {
      owing: behind.map((b): PortalOwing => ({ propertyTitle: b.propertyTitle, tenantName: b.tenantName, amount: b.owed, months: b.months })),
      expiring: ending?.n ?? 0,
      units: props.map((p): PortalUnit => {
        const let_ = byProp.has(p.id);
        const live = !let_ && p.advertised && p.status === 'AVAILABLE';
        return {
          propertyTitle: p.title, location: p.location, tenantName: byProp.get(p.id)?.tenantName ?? null, rent: byProp.get(p.id)?.rent ?? null,
          building: p.building, unitNumber: p.unitNumber, listPrice: p.price, listingType: p.listingType as 'RENT' | 'SALE',
          state: let_ ? 'LET' : p.status === 'AVAILABLE' ? 'VACANT' : 'OTHER', advertised: live,
          listingPath: live ? `/listings/${hit.agencySlug}/${p.id}` : null, coverImageUrl: cover.get(p.id) ?? null,
        };
      }),
      openRepairs: repairs.map((r) => ({ title: r.title, propertyTitle: title.get(r.propertyId) ?? '', priority: r.priority, status: r.status, createdAt: r.createdAt.toISOString() })),
    };
  });
  // The last six months, oldest first, so the landlord sees direction and not just one number.
  const periods = Array.from({ length: 6 }, (_, i) => {
    const [y, m] = period.split('-').map(Number) as [number, number];
    const d = new Date(Date.UTC(y, m - 1 - (5 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
  const trend: PortalTrendPoint[] = await Promise.all(periods.map(async (p) => {
    const st = p === period ? statement : await ownerStatement(auth, hit.ownerId, p);
    return { period: p, expected: st.totals.rentDue, collected: st.totals.collected, net: st.totals.netToLandlord };
  }));
  const let_ = units.filter((u) => u.state === 'LET').length;
  const portfolio = {
    units: units.length, let: let_, vacant: units.filter((u) => u.state === 'VACANT').length,
    occupancy: units.length ? let_ / units.length : 0,
    monthlyRent: units.reduce((s, u) => s + (u.state === 'LET' ? u.rent ?? 0 : 0), 0),
    owedByTenants: owing.reduce((s, o) => s + o.amount, 0), leasesEndingSoon: expiring,
  };
  return { agencyName: hit.agencyName, agencySlug: hit.agencySlug, currency: hit.currency, ownerName: statement.ownerName, period, statement, units, openRepairs, trend, owing, portfolio };
}

export interface EmailStatementResult { sent: boolean; to: string }

/** Emails one landlord their statement for a month, with their private link when they have (or are given) one. */
export async function emailOwnerStatement(a: Auth, ownerId: string, periodInput: string | undefined, includeLink = true): Promise<EmailStatementResult> {
  parse(uuidField, ownerId);
  const period = parse(periodField, periodInput ?? currentPeriod());
  const [o] = await withTenant(a.organizationId, (tx) => tx.select({ email: owners.email, token: owners.portalToken }).from(owners).where(eq(owners.id, ownerId)));
  if (!o) throw notFound('Owner');
  if (!o.email) throw new AppError(422, 'VALIDATION_FAILED', 'This landlord has no email address. Add one to their owner record first.');
  const st = await ownerStatement(a, ownerId, period);
  if (st.lines.length === 0) throw new AppError(409, 'NOTHING_TO_SEND', 'No rent was raised for this landlord in that month.', {});
  const token = includeLink ? (o.token ?? (await createPortalLink(a, ownerId)).token) : null;
  const [org] = await systemDb.select({ name: organizations.name, currency: organizations.currency }).from(organizations).where(eq(organizations.id, a.organizationId));
  const mail = ownerStatementEmail({
    currency: org?.currency, agencyName: org?.name ?? 'Your agent', ownerName: st.ownerName, periodLabel: periodLabel(period),
    collected: st.totals.collected, feeAndTax: st.totals.managementFee + st.totals.withholding, repairs: st.totals.maintenance, net: st.totals.netToLandlord,
    lines: st.lines.map((l) => ({ property: l.propertyTitle, tenant: l.tenantName, rentDue: l.rentDue, collected: l.collected })),
    portalUrl: token ? `${appUrl}/portal/${token}` : null,
  });
  const sent = await sendMail({ to: o.email, ...mail });
  if (!sent) throw new AppError(503, 'EMAIL_NOT_SENT', 'The email could not be sent right now. Check that email is set up, then try again.');
  await withTenant(a.organizationId, (tx) => recordAudit(tx, {
    organizationId: a.organizationId, actorId: a.userId, action: 'UPDATE', entityType: 'owner', entityId: ownerId, summary: `Emailed ${periodLabel(period)} statement to ${st.ownerName}`,
  }));
  return { sent: true, to: o.email };
}

export interface EmailAllResult { sent: number; noEmail: number; nothingToSend: number; failed: number }

/** Emails every landlord who has an address and rent activity in the month. One failure never stops the rest. */
export async function emailAllStatements(a: Auth, periodInput: string | undefined): Promise<EmailAllResult> {
  const period = parse(periodField, periodInput ?? currentPeriod());
  const all = await withTenant(a.organizationId, (tx) => tx.select({ id: owners.id, email: owners.email }).from(owners));
  const out: EmailAllResult = { sent: 0, noEmail: 0, nothingToSend: 0, failed: 0 };
  for (const o of all) {
    if (!o.email) { out.noEmail++; continue; }
    try {
      await emailOwnerStatement(a, o.id, period);
      out.sent++;
    } catch (err) {
      if (err instanceof AppError && err.code === 'NOTHING_TO_SEND') out.nothingToSend++;
      else out.failed++;
    }
  }
  return out;
}

const scheduleInput = z.object({ day: z.number().int().min(1).max(28).nullable() });

const previousPeriod = (now: Date) => {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

export async function getStatementSchedule(a: Auth): Promise<{ day: number | null; lastPeriod: string | null }> {
  const [o] = await systemDb.select({ day: organizations.statementEmailDay, lastPeriod: organizations.statementEmailLastPeriod })
    .from(organizations).where(eq(organizations.id, a.organizationId));
  return { day: o?.day ?? null, lastPeriod: o?.lastPeriod ?? null };
}

/**
 * Turns the automatic monthly landlord email on (for a day of the month) or off.
 * Turning it on after that day has already passed this month starts next month,
 * so enabling it never fires a surprise send; the manual buttons cover that.
 */
export async function setStatementSchedule(a: Auth, body: unknown, now: Date = new Date()) {
  const { day } = parse(scheduleInput, body);
  const skipThisMonth = day !== null && now.getUTCDate() >= day;
  await systemDb.update(organizations).set({
    statementEmailDay: day, statementEmailLastPeriod: skipThisMonth ? previousPeriod(now) : null,
  }).where(eq(organizations.id, a.organizationId));
  await withTenant(a.organizationId, (tx) => recordAudit(tx, {
    organizationId: a.organizationId, actorId: a.userId, action: 'UPDATE', entityType: 'organization', entityId: a.organizationId,
    summary: day === null ? 'Turned off automatic landlord statement emails' : `Automatic landlord statement emails set for day ${day} of each month`,
  }));
  return getStatementSchedule(a);
}

/**
 * Sends last month's statements for every agency whose chosen day has arrived. The month is
 * claimed with one conditional UPDATE before sending, so two instances (or two hourly runs)
 * cannot both send. If nothing at all could be sent (email not set up), the claim is released
 * and the next run tries again.
 */
export async function sweepStatementEmails(now: Date = new Date()): Promise<{ organizations: number; sent: number }> {
  const period = previousPeriod(now);
  const due = await systemDb.select({
    id: organizations.id, day: organizations.statementEmailDay, plan: organizations.plan,
    planExpiresAt: organizations.planExpiresAt, suspendedAt: organizations.suspendedAt, last: organizations.statementEmailLastPeriod,
  }).from(organizations).where(sql`${organizations.statementEmailDay} IS NOT NULL`);
  let orgs = 0;
  let sentTotal = 0;
  for (const o of due) {
    try {
      if (o.suspendedAt || o.last === period || now.getUTCDate() < (o.day ?? 99)) continue;
      if (!planHasModule(effectivePlan(o.plan, o.planExpiresAt, now), 'rentManagement')) continue;
      const claimed = await systemDb.update(organizations).set({ statementEmailLastPeriod: period })
        .where(and(eq(organizations.id, o.id), sql`${organizations.statementEmailLastPeriod} IS DISTINCT FROM ${period}`))
        .returning({ id: organizations.id });
      if (!claimed.length) continue;
      const result = await emailAllStatements({ organizationId: o.id, userId: null, role: 'ORG_ADMIN', name: 'Kaya' } as unknown as Auth, period);
      if (result.sent === 0 && result.failed > 0) {
        await systemDb.update(organizations).set({ statementEmailLastPeriod: o.last }).where(eq(organizations.id, o.id));
        continue;
      }
      orgs++;
      sentTotal += result.sent;
    } catch (err) {
      console.error(`[statement-emails] failed for organization ${o.id}`, err);
    }
  }
  return { organizations: orgs, sent: sentTotal };
}

export async function getTenantLink(a: Auth, leaseId: string): Promise<{ token: string | null }> {
  parse(uuidField, leaseId);
  return withTenant(a.organizationId, async (tx) => {
    const [l] = await tx.select({ token: leases.portalToken }).from(leases).where(eq(leases.id, leaseId));
    if (!l) throw notFound('Lease');
    return { token: l.token };
  });
}

export async function createTenantLink(a: Auth, leaseId: string): Promise<{ token: string }> {
  parse(uuidField, leaseId);
  const token = randomBytes(24).toString('base64url');
  await withTenant(a.organizationId, async (tx) => {
    const done = await tx.update(leases).set({ portalToken: token }).where(eq(leases.id, leaseId)).returning({ id: leases.id });
    if (!done.length) throw notFound('Lease');
    await recordAudit(tx, {
      organizationId: a.organizationId, actorId: a.userId, action: 'UPDATE', entityType: 'lease', entityId: leaseId, summary: 'Created tenant portal link',
    });
  });
  return { token };
}

export async function revokeTenantLink(a: Auth, leaseId: string): Promise<void> {
  parse(uuidField, leaseId);
  await withTenant(a.organizationId, async (tx) => {
    const done = await tx.update(leases).set({ portalToken: null }).where(eq(leases.id, leaseId)).returning({ id: leases.id });
    if (!done.length) throw notFound('Lease');
    await recordAudit(tx, {
      organizationId: a.organizationId, actorId: a.userId, action: 'UPDATE', entityType: 'lease', entityId: leaseId, summary: 'Revoked tenant portal link',
    });
  });
}

/** Public, read-only view for a tenant: their own balance and payment history, nothing else. */
export async function getTenantPortal(token: string): Promise<TenantPortalView> {
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) throw notFound('Page');
  const [hit] = await systemDb.select({
    leaseId: leases.id, organizationId: leases.organizationId, rentAmount: leases.rentAmount, dueDay: leases.dueDay,
    agencyName: organizations.name, currency: organizations.currency, agencySlug: organizations.slug,
    plan: organizations.plan, planExpiresAt: organizations.planExpiresAt, suspendedAt: organizations.suspendedAt, payInfo: organizations.rentPaymentInfo,
  }).from(leases).innerJoin(organizations, eq(organizations.id, leases.organizationId)).where(eq(leases.portalToken, token));
  if (!hit || hit.suspendedAt || !planHasModule(effectivePlan(hit.plan, hit.planExpiresAt), 'rentManagement')) throw notFound('Page');
  const statement = await tenantStatement({ organizationId: hit.organizationId } as Auth, hit.leaseId);
  const claims = await withTenant(hit.organizationId, (tx) => tx.select({
    amount: paymentClaims.amount, mpesaCode: paymentClaims.mpesaCode, status: paymentClaims.status, createdAt: paymentClaims.createdAt,
  }).from(paymentClaims).where(eq(paymentClaims.leaseId, hit.leaseId)).orderBy(desc(paymentClaims.createdAt)).limit(5));
  return {
    canPayNow: await canCollectByMpesa(hit.organizationId), payInfo: hit.payInfo, claims: claims.map((c) => ({ ...c, status: c.status as 'PENDING' | 'CONFIRMED' | 'REJECTED', createdAt: c.createdAt.toISOString() })),
    agencyName: hit.agencyName, currency: hit.currency, agencySlug: hit.agencySlug, tenantName: statement.tenantName, propertyTitle: statement.propertyTitle,
    rentAmount: hit.rentAmount, dueDay: hit.dueDay, statement,
  };
}
