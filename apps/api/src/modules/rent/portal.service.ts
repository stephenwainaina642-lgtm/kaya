import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { and, eq, inArray, notInArray } from 'drizzle-orm';
import { effectivePlan, periodLabel, planHasModule, type PortalView } from '@kaya/shared';
import { withTenant } from '../../db/client';
import { systemDb } from '../../db/system';
import { clients, leases, maintenanceRequests, organizations, owners, properties } from '../../db/schema';
import { notFound } from '../../lib/errors';
import { parse } from '../../lib/validate';
import { recordAudit } from '../../lib/audit';
import { type Auth, uuidField } from '../crm/common';
import { ownerStatement, currentPeriod } from './rent.service';
import { appUrl } from '../../config/env';
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
    ownerId: owners.id, organizationId: owners.organizationId, agencyName: organizations.name,
    plan: organizations.plan, planExpiresAt: organizations.planExpiresAt, suspendedAt: organizations.suspendedAt,
  }).from(owners).innerJoin(organizations, eq(organizations.id, owners.organizationId)).where(eq(owners.portalToken, token));
  if (!hit || hit.suspendedAt || !planHasModule(effectivePlan(hit.plan, hit.planExpiresAt), 'rentManagement')) throw notFound('Page');

  const auth = { organizationId: hit.organizationId } as Auth;
  const statement = await ownerStatement(auth, hit.ownerId, period);
  const { units, openRepairs } = await withTenant(hit.organizationId, async (tx) => {
    const props = await tx.select({ id: properties.id, title: properties.title, location: properties.location })
      .from(properties).where(eq(properties.ownerId, hit.ownerId));
    if (!props.length) return { units: [], openRepairs: [] };
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
    const title = new Map(props.map((p) => [p.id, p.title]));
    return {
      units: props.map((p) => ({ propertyTitle: p.title, location: p.location, tenantName: byProp.get(p.id)?.tenantName ?? null, rent: byProp.get(p.id)?.rent ?? null })),
      openRepairs: repairs.map((r) => ({ title: r.title, propertyTitle: title.get(r.propertyId) ?? '', priority: r.priority, status: r.status, createdAt: r.createdAt.toISOString() })),
    };
  });
  return { agencyName: hit.agencyName, ownerName: statement.ownerName, period, statement, units, openRepairs };
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
  const [org] = await systemDb.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, a.organizationId));
  const mail = ownerStatementEmail({
    agencyName: org?.name ?? 'Your agent', ownerName: st.ownerName, periodLabel: periodLabel(period),
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
