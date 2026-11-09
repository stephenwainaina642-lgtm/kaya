import { randomBytes } from 'node:crypto';
import { and, asc, eq, lt, ne } from 'drizzle-orm';
import { periodLabel, type ReminderResult } from '@kaya/shared';
import { withTenant } from '../../db/client';
import { systemDb } from '../../db/system';
import { clients, leases, organizations, properties, rentCharges } from '../../db/schema';
import { recordAudit } from '../../lib/audit';
import { sendSms, smsConfigured } from '../../lib/sms';
import { appUrl } from '../../config/env';
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
