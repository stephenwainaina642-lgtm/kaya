import { z } from 'zod';
import { and, eq, sql as dsql } from 'drizzle-orm';
import { MAINTENANCE_CATEGORIES, effectivePlan, planHasModule } from '@kaya/shared';
import { systemDb } from '../../db/system';
import { withTenant } from '../../db/client';
import { clients, followUps, leases, maintenanceRequests, organizations, properties } from '../../db/schema';
import { notFound } from '../../lib/errors';
import { parse } from '../../lib/validate';
import { recordAudit } from '../../lib/audit';
import { mergeTriage, triageReport } from './triage';

const input = z.object({
  fullName: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(7).max(30).regex(/^\+?[0-9 ()-]+$/, 'Phone numbers can only contain digits'),
  category: z.enum(MAINTENANCE_CATEGORIES).default('OTHER'),
  urgent: z.boolean().default(false),
  message: z.string().trim().min(5).max(2000),
  // Honeypot: real visitors never see this field. A bot that fills it gets a
  // normal-looking success and nothing is created.
  website: z.string().max(200).optional(),
});

const digits = (v: string) => v.replace(/\D/g, '');
const nice = (s: string) => s[0] + s.slice(1).toLowerCase();

/**
 * Public "report a problem" form for tenants. The tenant is recognised by the
 * phone number on their active lease, so nobody can attach a report to a
 * property they don't rent just by guessing, and the property list is never
 * exposed. A report from an unrecognised number becomes an unassigned
 * follow-up for the agency to sort out by hand. Either way the visitor sees
 * the same reply, so the form can't be used to discover who rents what.
 */
export async function submitRepairReport(slug: string, body: unknown, ip: string | null): Promise<void> {
  const data = parse(input, body);
  if (data.website) return;

  const [org] = await systemDb.select().from(organizations).where(eq(organizations.slug, slug));
  if (!org || org.suspendedAt || !planHasModule(effectivePlan(org.plan, org.planExpiresAt), 'rentManagement')) {
    throw notFound('Agency');
  }

  const key = digits(data.phone).slice(-9);
  // AI triage is a bonus: only for plans that include AI, and any failure leaves the tenant's own choices.
  const raw = planHasModule(effectivePlan(org.plan, org.planExpiresAt), 'aiInsights') ? await triageReport(data.message) : null;
  const triage = mergeTriage({ category: data.category, urgent: data.urgent }, raw);
  const urgent = triage.priority === 'URGENT' || triage.priority === 'HIGH';
  const summary = `${nice(triage.category)}: ${triage.summary || data.message.replace(/\s+/g, ' ').slice(0, 70)}`;
  const details = `${data.message}\n\nReported through the tenant link by ${data.fullName} (${data.phone}).`;

  await withTenant(org.id, async (tx) => {
    const [match] = key.length === 9
      ? await tx.select({
        propertyId: leases.propertyId, tenantId: leases.tenantId, tenantName: clients.fullName,
        propertyTitle: properties.title, propertyAgent: properties.assignedAgentId, tenantAgent: clients.assignedAgentId,
      }).from(leases)
        .innerJoin(clients, eq(clients.id, leases.tenantId))
        .innerJoin(properties, eq(properties.id, leases.propertyId))
        .where(and(eq(leases.status, 'ACTIVE'), dsql`right(regexp_replace(${clients.phone}, '\D', '', 'g'), 9) = ${key}`))
        .limit(1)
      : [];

    if (!match) {
      await tx.insert(followUps).values({
        organizationId: org.id,
        title: `Unmatched repair report from ${data.fullName}`,
        notes: `${details}\n\nThis number is not on an active lease, so no repair was logged. Add it under Maintenance if it is genuine.`,
        dueAt: new Date(),
        priority: urgent ? 'HIGH' : 'MEDIUM',
      });
      return;
    }

    const [row] = await tx.insert(maintenanceRequests).values({
      organizationId: org.id, propertyId: match.propertyId, tenantId: match.tenantId,
      title: summary, description: details, category: triage.category, priority: triage.priority,
    }).returning({ id: maintenanceRequests.id });

    await tx.insert(followUps).values({
      organizationId: org.id,
      title: `${urgent ? 'Urgent repair' : 'Repair'} reported: ${match.propertyTitle}`,
      notes: `${match.tenantName} reported: ${data.message.slice(0, 300)}`,
      dueAt: new Date(),
      priority: urgent ? 'HIGH' : 'MEDIUM',
      clientId: match.tenantId,
      assignedToId: match.propertyAgent ?? match.tenantAgent ?? null,
    });
    await recordAudit(tx, {
      organizationId: org.id, actorId: null, action: 'CREATE', entityType: 'maintenance', entityId: row!.id,
      summary: `Repair reported by tenant ${match.tenantName}: ${summary}${triage.aiUsed ? ' (AI triaged)' : ''}`,
    });
  });
  void ip;
}
