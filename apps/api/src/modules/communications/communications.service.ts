import { z } from 'zod';
import { and, eq, desc, sql as dsql } from 'drizzle-orm';
import { COMM_CHANNELS } from '@kaya/shared';
import type { CommunicationItem, CommunicationPage } from '@kaya/shared';
import { withTenant } from '../../db/client';
import { communications, leads, clients, owners, users } from '../../db/schema';
import { type Auth, pagingQuery, pageWindow } from '../crm/common';

export const communicationsQuery = pagingQuery.extend({
  channel: z.enum(COMM_CHANNELS).optional(),
  contactKind: z.enum(['lead', 'client', 'owner']).optional(),
});

export async function listCommunications(a: Auth, q: z.infer<typeof communicationsQuery>): Promise<CommunicationPage> {
  return withTenant(a.organizationId, async (tx) => {
    const { limit, offset } = pageWindow(q);

    const conditions = [eq(communications.organizationId, a.organizationId)];
    if (q.channel) conditions.push(eq(communications.channel, q.channel));
    // contactKind filtering is applied after fetch below, since the kind depends on which FK is set

    const rows = await tx
      .select({
        c: communications,
        leadName: leads.fullName,
        clientName: clients.fullName,
        ownerName: owners.fullName,
        ownerCompany: owners.companyName,
        userName: users.name,
      })
      .from(communications)
      .leftJoin(leads, eq(leads.id, communications.leadId))
      .leftJoin(clients, eq(clients.id, communications.clientId))
      .leftJoin(owners, eq(owners.id, communications.ownerId))
      .leftJoin(users, eq(users.id, communications.userId))
      .where(and(...conditions))
      .orderBy(desc(communications.occurredAt))
      .limit(limit + 1)
      .offset(offset);

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);

    const items: CommunicationItem[] = page
      .map((r) => {
        const contact = r.c.leadId
          ? { kind: 'lead' as const, id: r.c.leadId, name: r.leadName ?? 'Lead' }
          : r.c.clientId
            ? { kind: 'client' as const, id: r.c.clientId, name: r.clientName ?? 'Client' }
            : r.c.ownerId
              ? { kind: 'owner' as const, id: r.c.ownerId, name: r.ownerName ?? r.ownerCompany ?? 'Owner' }
              : null;
        return {
          id: r.c.id,
          channel: r.c.channel,
          direction: r.c.direction,
          subject: r.c.subject,
          body: r.c.body,
          deliveryStatus: r.c.deliveryStatus,
          durationSeconds: r.c.durationSeconds,
          contact,
          user: r.c.userId ? { id: r.c.userId, name: r.userName ?? 'User' } : null,
          occurredAt: r.c.occurredAt.toISOString(),
        };
      })
      .filter((item) => !q.contactKind || item.contact?.kind === q.contactKind);

    const [totalRow] = await tx
      .select({ c: dsql<number>`count(*)::int` })
      .from(communications)
      .where(eq(communications.organizationId, a.organizationId));

    return { items, total: totalRow?.c ?? items.length };
  });
}
