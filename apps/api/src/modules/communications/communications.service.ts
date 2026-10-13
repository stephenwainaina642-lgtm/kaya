import { z } from 'zod';
import { and, eq, desc, sql as dsql } from 'drizzle-orm';
import { COMM_CHANNELS, COMM_DIRECTIONS, COMM_DELIVERY } from '@kaya/shared';
import type { CommunicationItem, CommunicationPage } from '@kaya/shared';
import { withTenant, type Tx } from '../../db/client';
import { communications, leads, clients, owners, users } from '../../db/schema';
import { type Auth, pagingQuery, pageWindow, uuidField, isoDate } from '../crm/common';
import { parse } from '../../lib/validate';
import { invalid, notFound } from '../../lib/errors';
import { recordAudit } from '../../lib/audit';

export const communicationsQuery = pagingQuery.extend({
  channel: z.enum(COMM_CHANNELS).optional(),
  contactKind: z.enum(['lead', 'client', 'owner']).optional(),
});

export const communicationCreate = z
  .object({
    channel: z.enum(COMM_CHANNELS),
    direction: z.enum(COMM_DIRECTIONS).default('OUTBOUND'),
    subject: z.string().trim().max(200).nullable().optional(),
    body: z.string().trim().max(5000).nullable().optional(),
    occurredAt: isoDate.optional(),
    durationSeconds: z.coerce.number().int().min(0).nullable().optional(),
    deliveryStatus: z.enum(COMM_DELIVERY).nullable().optional(),
    leadId: uuidField.nullable().optional(),
    clientId: uuidField.nullable().optional(),
    ownerId: uuidField.nullable().optional(),
    propertyId: uuidField.nullable().optional(),
    dealId: uuidField.nullable().optional(),
  })
  .refine((v) => [v.leadId, v.clientId, v.ownerId].filter(Boolean).length === 1, {
    message: 'Exactly one of leadId, clientId or ownerId must be set',
    path: ['leadId'],
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

async function hydrate(tx: Tx, organizationId: string, id: string): Promise<CommunicationItem> {
  const [row] = await tx
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
    .where(and(eq(communications.id, id), eq(communications.organizationId, organizationId)));
  if (!row) throw notFound('Communication');

  const contact = row.c.leadId
    ? { kind: 'lead' as const, id: row.c.leadId, name: row.leadName ?? 'Lead' }
    : row.c.clientId
      ? { kind: 'client' as const, id: row.c.clientId, name: row.clientName ?? 'Client' }
      : row.c.ownerId
        ? { kind: 'owner' as const, id: row.c.ownerId, name: row.ownerName ?? row.ownerCompany ?? 'Owner' }
        : null;

  return {
    id: row.c.id,
    channel: row.c.channel,
    direction: row.c.direction,
    subject: row.c.subject,
    body: row.c.body,
    deliveryStatus: row.c.deliveryStatus,
    durationSeconds: row.c.durationSeconds,
    contact,
    user: row.c.userId ? { id: row.c.userId, name: row.userName ?? 'User' } : null,
    occurredAt: row.c.occurredAt.toISOString(),
  };
}

export async function createCommunication(a: Auth, body: unknown): Promise<CommunicationItem> {
  const input = parse(communicationCreate, body);

  return withTenant(a.organizationId, async (tx) => {
    if (input.leadId) {
      const [row] = await tx.select({ id: leads.id }).from(leads).where(and(eq(leads.id, input.leadId), eq(leads.organizationId, a.organizationId)));
      if (!row) throw invalid({ leadId: 'Lead not found' });
    }
    if (input.clientId) {
      const [row] = await tx.select({ id: clients.id }).from(clients).where(and(eq(clients.id, input.clientId), eq(clients.organizationId, a.organizationId)));
      if (!row) throw invalid({ clientId: 'Client not found' });
    }
    if (input.ownerId) {
      const [row] = await tx.select({ id: owners.id }).from(owners).where(and(eq(owners.id, input.ownerId), eq(owners.organizationId, a.organizationId)));
      if (!row) throw invalid({ ownerId: 'Owner not found' });
    }

    const [row] = await tx
      .insert(communications)
      .values({
        organizationId: a.organizationId,
        channel: input.channel,
        direction: input.direction,
        subject: input.subject ?? null,
        body: input.body ?? null,
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
        durationSeconds: input.durationSeconds ?? null,
        deliveryStatus: input.deliveryStatus ?? null,
        leadId: input.leadId ?? null,
        clientId: input.clientId ?? null,
        ownerId: input.ownerId ?? null,
        propertyId: input.propertyId ?? null,
        dealId: input.dealId ?? null,
        userId: a.userId,
      })
      .returning();
    if (!row) throw notFound('Communication');

    await recordAudit(tx, {
      organizationId: a.organizationId,
      actorId: a.userId,
      action: 'COMMUNICATION_LOGGED',
      entityType: 'communication',
      entityId: row.id,
      after: { channel: row.channel, direction: row.direction },
      summary: `Logged a ${row.channel.toLowerCase()} communication`,
    });

    return hydrate(tx, a.organizationId, row.id);
  });
}
