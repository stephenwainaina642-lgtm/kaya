import { z } from 'zod';
import { eq, and, desc, ilike, or, sql as dsql } from 'drizzle-orm';
import { CLIENT_STATUSES, LEAD_TYPES } from '@kaya/shared';
import type { ClientListItem, ClientDetail, Page } from '@kaya/shared';
import { withTenant } from '../../db/client';
import { clients, users } from '../../db/schema';
import { notFound } from '../../lib/errors';
import { parse } from '../../lib/validate';
import {
  type Auth, uuidField, nameField, tagsField, pagingQuery, pageWindow, clientScope, agentRef, resolveAssignee, requireClient,
} from '../crm/common';
import { findDuplicate, duplicateError } from '../crm/duplicates';
import { requirementsInput, saveRequirements, getRequirements } from '../crm/requirements';
import { contactLogInput, logContact, loadTimeline, timelineQuery } from '../crm/timeline';
import { recordAudit } from '../../lib/audit';

export const clientCreate = z.object({
  fullName: nameField,
  phone: z.string().trim().min(5).max(30),
  whatsapp: z.string().trim().max(30).nullable().optional(),
  email: z.string().email().nullable().optional(),
  leadType: z.enum(LEAD_TYPES).default('BUYER'),
  tags: tagsField,
  notes: z.string().trim().max(2000).nullable().optional(),
  assignedAgentId: uuidField.nullable().optional(),
  requirements: requirementsInput.optional(),
});

export const clientUpdate = clientCreate.partial().extend({
  status: z.enum(CLIENT_STATUSES).optional(),
});

export const clientListQuery = pagingQuery.extend({
  search: z.string().trim().max(200).optional(),
  status: z.enum(CLIENT_STATUSES).optional(),
  assignedAgentId: uuidField.optional(),
});

function mapClient(row: typeof clients.$inferSelect, agentName: string | null): ClientListItem {
  return {
    id: row.id,
    fullName: row.fullName,
    phone: row.phone,
    email: row.email,
    status: row.status,
    leadType: row.leadType,
    assignedAgent: agentRef(row.assignedAgentId, agentName),
    lastContactedAt: row.lastContactedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listClients(a: Auth, query: unknown): Promise<Page<ClientListItem>> {
  const q = parse(clientListQuery, query);
  return withTenant(a.organizationId, async (tx) => {
    const scope = clientScope(a);
    const conds = [eq(clients.organizationId, a.organizationId)];
    if (scope === 'own') conds.push(eq(clients.assignedAgentId, a.userId));
    if (q.status) conds.push(eq(clients.status, q.status));
    if (q.assignedAgentId) conds.push(eq(clients.assignedAgentId, q.assignedAgentId));
    if (q.search) conds.push(or(ilike(clients.fullName, `%${q.search}%`), ilike(clients.phone, `%${q.search}%`))!);
    const where = and(...conds);

    const { limit, offset } = pageWindow(q);
    const [rows, totalRow] = await Promise.all([
      tx.select({ client: clients, agentName: users.name })
        .from(clients)
        .leftJoin(users, eq(users.id, clients.assignedAgentId))
        .where(where)
        .orderBy(desc(clients.createdAt))
        .limit(limit).offset(offset),
      tx.select({ count: dsql<number>`count(*)::int` }).from(clients).where(where),
    ]);

    return {
      items: rows.map((r) => mapClient(r.client, r.agentName)),
      total: totalRow[0]?.count ?? 0,
      page: q.page,
      pageSize: q.pageSize,
    };
  });
}

async function hydrateClient(tx: Parameters<Parameters<typeof withTenant>[1]>[0], organizationId: string, id: string): Promise<ClientDetail> {
  const [row] = await tx
    .select({ client: clients, agentName: users.name })
    .from(clients)
    .leftJoin(users, eq(users.id, clients.assignedAgentId))
    .where(and(eq(clients.id, id), eq(clients.organizationId, organizationId)));
  if (!row) throw notFound('Client');
  const reqs = await getRequirements(tx, { clientId: id });
  return {
    ...mapClient(row.client, row.agentName),
    whatsapp: row.client.whatsapp,
    tags: row.client.tags,
    notes: row.client.notes,
    leadId: row.client.leadId,
    requirements: reqs,
  };
}

export async function getClient(a: Auth, id: string): Promise<ClientDetail> {
  parse(uuidField, id);
  return withTenant(a.organizationId, (tx) => hydrateClient(tx, a.organizationId, id));
}

export async function createClient(a: Auth, body: unknown): Promise<ClientDetail> {
  const input = parse(clientCreate, body);
  return withTenant(a.organizationId, async (tx) => {
    const dup = await findDuplicate(tx, a.organizationId, input.phone);
    if (dup) throw duplicateError(dup);

    const assignedAgentId = await resolveAssignee(a, input.assignedAgentId ?? undefined, true);
    const [row] = await tx.insert(clients).values({
      organizationId: a.organizationId,
      fullName: input.fullName,
      phone: input.phone,
      whatsapp: input.whatsapp ?? null,
      email: input.email ?? null,
      leadType: input.leadType,
      tags: input.tags,
      notes: input.notes ?? null,
      assignedAgentId,
      createdById: a.userId,
      updatedById: a.userId,
    }).returning();
    if (!row) throw notFound('Client');

    if (input.requirements) {
      await saveRequirements(tx, a.organizationId, { clientId: row.id }, input.requirements);
    }
    await recordAudit(tx, {
      organizationId: a.organizationId, actorId: a.userId, action: 'CREATE', entityType: 'client', entityId: row.id,
      summary: `Created client ${row.fullName}`,
    });
    return hydrateClient(tx, a.organizationId, row.id);
  });
}

export async function updateClient(a: Auth, id: string, body: unknown): Promise<ClientDetail> {
  parse(uuidField, id);
  const input = parse(clientUpdate, body);
  return withTenant(a.organizationId, async (tx) => {
    await requireClient(tx, a.organizationId, id);
    if (input.phone) {
      const dup = await findDuplicate(tx, a.organizationId, input.phone, id);
      if (dup) throw duplicateError(dup);
    }
    const { requirements: reqInput, ...rest } = input;
    await tx.update(clients).set({ ...rest, updatedById: a.userId }).where(eq(clients.id, id));
    if (reqInput) {
      await saveRequirements(tx, a.organizationId, { clientId: id }, reqInput);
    }
    return hydrateClient(tx, a.organizationId, id);
  });
}

export async function logClientContact(a: Auth, id: string, body: unknown): Promise<ClientDetail> {
  parse(uuidField, id);
  const input = parse(contactLogInput, body);
  return withTenant(a.organizationId, async (tx) => {
    await requireClient(tx, a.organizationId, id);
    await logContact(tx, a, 'Logged contact', { clientId: id }, input);
    return hydrateClient(tx, a.organizationId, id);
  });
}

export async function saveClientRequirements(a: Auth, id: string, body: unknown): Promise<ClientDetail> {
  parse(uuidField, id);
  const input = parse(requirementsInput, body);
  return withTenant(a.organizationId, async (tx) => {
    await requireClient(tx, a.organizationId, id);
    await saveRequirements(tx, a.organizationId, { clientId: id }, input);
    return hydrateClient(tx, a.organizationId, id);
  });
}

export async function getClientTimeline(a: Auth, id: string, query: unknown) {
  parse(uuidField, id);
  const q = parse(timelineQuery, query);
  return withTenant(a.organizationId, async (tx) => {
    await requireClient(tx, a.organizationId, id);
    return loadTimeline(tx, { clientId: id }, q);
  });
}

export async function deleteClient(a: Auth, id: string): Promise<void> {
  parse(uuidField, id);
  await withTenant(a.organizationId, async (tx) => {
    await requireClient(tx, a.organizationId, id);
    await tx.delete(clients).where(eq(clients.id, id));
  });
}
