import { randomBytes } from 'node:crypto';
import { and, asc, eq, lt, ne, sql } from 'drizzle-orm';
import { effectivePlan, periodLabel, planHasModule, type ReminderResult } from '@kaya/shared';
import { withTenant } from '../../db/client';
import { systemDb } from '../../db/system';
import { clients, leases, organizations, properties, rentCharges } from '../../db/schema';
import { recordAudit } from '../../lib/audit';
import { sendSms, smsConfigured } from '../../lib/sms';
import { appUrl } from '../../config/env';
import { z } from 'zod';
import { parse } from '../../lib/validate';
import type { Auth } from '../crm/common';

/** A tenant is not texted again within this many days. */
export const REMINDER_COOLDOWN_DAYS = 3;

/**
 * Texts every tenant with overdue rent one SMS (not one per month), with their
 * balance and their private link. Skips tenants with no mobile number and
 * anyone reminded in the last few days, so pressing the button twice is safe.
 */
export async function sendRentReminders(a: Auth, now = new Date()): Promise<ReminderResult> {
  const result: ReminderResult = { sent: 0, noPhone: 0, recentlyReminded: 0, failed: 0, smsConfigured: smsConfigured() };
  if (!result.smsConfigured) return result;
  const today = now.toISOString().slice(0, 10);
  const cutoff = new Date(now.getTime() - REMINDER_COOLDOWN_DAYS * 86_400_000);
  const [org] = await systemDb.select({ name: organizations.name, currency: organizations.currency }).from(organizations).where(eq(organizations.id, a.organizationId));

  const kes = (n: number) => `${org?.currency ?? 'KES'} ${n.toLocaleString('en-US')}`;
  return withTenant(a.organizationId, async (tx) => {
    const rows = await tx.select({
      leaseId: leases.id, token: leases.portalToken, reminded: leases.reminderSentAt, phone: clients.phone, tenantName: clients.fullName,
      propertyTitle: properties.title, period: rentCharges.period, amount: rentCharges.amount, paid: rentCharges.paidAmount,
    })
      .from(rentCharges)
      .innerJoin(leases, eq(leases.id, rentCharges.leaseId))
      .innerJoin(properties, eq(properties.id, leases.propertyId))
      .innerJoin(clients, eq(clients.id, leases.tenantId))
      .where(and(ne(rentCharges.status, 'PAID'), lt(rentCharges.dueDate, today), eq(leases.status, 'ACTIVE')))
      .orderBy(asc(rentCharges.period));

    const byLease = new Map<string, typeof rows>();
    for (const r of rows) byLease.set(r.leaseId, [...(byLease.get(r.leaseId) ?? []), r]);

    for (const [leaseId, charges] of byLease) {
      const first = charges[0]!;
      if (first.reminded && first.reminded > cutoff) { result.recentlyReminded++; continue; }
      const owed = charges.reduce((s, c) => s + (c.amount - c.paid), 0);
      if (owed <= 0) continue;
      let token = first.token;
      if (!token) {
        token = randomBytes(24).toString('base64url');
        await tx.update(leases).set({ portalToken: token }).where(eq(leases.id, leaseId));
      }
      const months = charges.length === 1 ? periodLabel(first.period) : `${charges.length} months`;
      const text = `Hello ${first.tenantName.split(' ')[0]}, your rent for ${first.propertyTitle} is overdue: ${kes(owed)} (${months}). See your balance: ${appUrl}/tenant/${token} - ${org?.name ?? 'Your agent'}`;
      if (!first.phone) { result.noPhone++; continue; }
      const ok = await sendSms(first.phone, text);
      if (ok) {
        await tx.update(leases).set({ reminderSentAt: now }).where(eq(leases.id, leaseId));
        result.sent++;
      } else if (/^(?:\+?254|0)?[17]\d{8}$/.test(first.phone.replace(/[\s\-().]/g, ''))) result.failed++;
      else result.noPhone++;
    }
    if (result.sent > 0) await recordAudit(tx, {
      organizationId: a.organizationId, actorId: a.userId, action: 'UPDATE', entityType: 'organization', entityId: a.organizationId,
      summary: `Sent ${result.sent} rent reminder text${result.sent === 1 ? '' : 's'}`,
    });
    return result;
  });
}

/** The hour (local) from which the daily automatic run may go out, so tenants are not texted at night. */
export const AUTO_REMINDER_HOUR = 9;

const localParts = (now: Date, timeZone: string) => {
  let tz = timeZone;
  try { new Intl.DateTimeFormat('en-CA', { timeZone: tz }); } catch { tz = 'Africa/Nairobi'; }
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(now).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
};

export async function getAutoReminders(a: Auth): Promise<{ enabled: boolean; smsConfigured: boolean }> {
  const [o] = await systemDb.select({ on: organizations.autoReminders }).from(organizations).where(eq(organizations.id, a.organizationId));
  return { enabled: o?.on ?? false, smsConfigured: smsConfigured() };
}

/** Turning it on never texts anyone the same day: today counts as already run. */
export async function setAutoReminders(a: Auth, body: unknown, now = new Date()) {
  const { enabled } = parse(z.object({ enabled: z.boolean() }), body);
  const [org] = await systemDb.select({ tz: organizations.timezone }).from(organizations).where(eq(organizations.id, a.organizationId));
  await systemDb.update(organizations).set({ autoReminders: enabled, reminderLastRunOn: enabled ? localParts(now, org?.tz ?? 'Africa/Nairobi').date : null })
    .where(eq(organizations.id, a.organizationId));
  await withTenant(a.organizationId, (tx) => recordAudit(tx, {
    organizationId: a.organizationId, actorId: a.userId, action: 'UPDATE', entityType: 'organization', entityId: a.organizationId,
    summary: enabled ? 'Turned on automatic overdue-rent SMS reminders' : 'Turned off automatic overdue-rent SMS reminders',
  }));
  return getAutoReminders(a);
}

/**
 * Once per local day per agency, from 09:00 agency time, texts tenants with overdue rent.
 * The day is claimed with one conditional UPDATE so two instances cannot both send, and the
 * per-tenant cooldown still applies. If every send failed the claim is released to retry.
 */
export async function sweepAutoReminders(now = new Date()): Promise<{ organizations: number; sent: number }> {
  if (!smsConfigured()) return { organizations: 0, sent: 0 };
  const rows = await systemDb.select({
    id: organizations.id, tz: organizations.timezone, plan: organizations.plan, planExpiresAt: organizations.planExpiresAt,
    suspendedAt: organizations.suspendedAt, last: organizations.reminderLastRunOn,
  }).from(organizations).where(eq(organizations.autoReminders, true));
  let orgs = 0;
  let sent = 0;
  for (const o of rows) {
    try {
      const local = localParts(now, o.tz);
      if (o.suspendedAt || local.hour < AUTO_REMINDER_HOUR || o.last === local.date) continue;
      if (!planHasModule(effectivePlan(o.plan, o.planExpiresAt, now), 'rentManagement')) continue;
      const claimed = await systemDb.update(organizations).set({ reminderLastRunOn: local.date })
        .where(and(eq(organizations.id, o.id), sql`${organizations.reminderLastRunOn} IS DISTINCT FROM ${local.date}`))
        .returning({ id: organizations.id });
      if (!claimed.length) continue;
      const r = await sendRentReminders({ organizationId: o.id, userId: null, role: 'ORG_ADMIN', name: 'Kaya' } as unknown as Auth, now);
      if (r.sent === 0 && r.failed > 0) { await systemDb.update(organizations).set({ reminderLastRunOn: o.last }).where(eq(organizations.id, o.id)); continue; }
      orgs++;
      sent += r.sent;
    } catch (err) {
      console.error(`[auto-reminders] failed for organization ${o.id}`, err);
    }
  }
  return { organizations: orgs, sent };
}
