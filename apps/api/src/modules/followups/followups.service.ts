import { z } from 'zod';
import { eq, and, lt, gte, desc, asc, sql as dsql, type SQL } from 'drizzle-orm';
import { FOLLOW_UP_PRIORITIES, CONTACT_METHODS } from '@kaya/shared';
import type { FollowUpItem, FollowUpPage } from '@kaya/shared';
import { dayBounds } from '@kaya/shared';
import { withTenant, type Tx } from '../../db/client';
import { followUps, leads, clients } from '../../db/schema';
import { notFound, invalid, conflict } from '../../lib/errors';
import { parse } from '../../lib/validate';
import { type Auth, uuidField, pagingQuery, followUpScope, agentRef, requireLead, requireClient, orgTimezone } from '../crm/common';
import { users } from '../../db/schema';

export const followUpCreate = z
  .object({
    title: z.string().trim().min(1).max(200),
    notes: z.string().trim().max(2000).nullable().optional(),
    dueAt: z.string().datetime({ offset: true }),
    priority: z.enum(FOLLOW_UP_PRIORITIES).default('MEDIUM'),
    channel: z.enum(CONTACT_METHODS).nullable().optional(),
    leadId: uuidField.optional(),
    clientId: uuidField.optional(),
    assignedToId: uuidField.optional(),
  })
  .refine((v) => Boolean(v.leadId) !== Boolean(v.clientId), {
    message: 'Exactly one of leadId or clientId must be set',
    path: ['leadId'],
  });

export const followUpUpdate = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  dueAt: z.string().datetime({ offset: true }).optional(),
  priority: z.enum(FOLLOW_UP_PRIORITIES).optional(),
  channel: z.enum(CONTACT_METHODS).nullable().optional(),
  assignedToId: uuidField.optional(),
});

export const followUpListQuery = pagingQuery.extend({
  view: z.enum(['overdue', 'today', 'upcoming', 'completed']).default('today'),
  assignedToId: uuidField.optional(),
});

function mapFollowUp(row: typeof followUps.$inferSelect, agentName: string | null, contactName: string): FollowUpItem {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    dueAt: row.dueAt.toISOString(),
    status: row.status,
    priority: row.priority,
    channel: row.channel,
    leadId: row.leadId,
    clientId: row.clientId,
    contactName,
    assignedTo: agentRef(row.assignedToId, agentName),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

export async function insertFollowUp(
  tx: Tx,
  a: Auth,
  input: z.infer<typeof followUpCreate>,
): Promise<string> {
  if (input.leadId) await requireLead(tx, a.organizationId, input.leadId);
  if (input.clientId) await requireClient(tx, a.organizationId, input.clientId);
  const [row] = await tx.insert(followUps).values({
    organizationId: a.organizationId,
    title: input.title,
    notes: input.notes ?? null,
    dueAt: new Date(input.dueAt),
    priority: input.priority,
    channel: input.channel ?? null,
    leadId: input.leadId ?? null,
    clientId: input.clientId ?? null,
    assignedToId: input.assignedToId ?? a.userId,
  }).returning({ id: followUps.id });
  if (!row) throw notFound('Follow-up');

  const table = input.leadId ? leads : clients;
  const id = input.leadId ?? input.clientId!;
  await tx.update(table).set({ nextFollowUpAt: new Date(input.dueAt) }).where(eq(table.id, id));

  return row.id;
}

export async function createFollowUp(a: Auth, body: unknown): Promise<FollowUpItem> {
  const input = parse(followUpCreate, body);
  return withTenant(a.organizationId, async (tx) => {
    const id = await insertFollowUp(tx, a, input);
    return requireFollowUp(tx, a.organizationId, id).then((r) => hydrate(tx, r));
  });
}

async function hydrate(tx: Tx, row: typeof followUps.$inferSelect): Promise<FollowUpItem> {
  const [agent] = row.assignedToId ? await tx.select({ name: users.name }).from(users).where(eq(users.id, row.assignedToId)) : [null];
  const contactName = await resolveContactName(tx, row);
  return mapFollowUp(row, agent?.name ?? null, contactName);
}

async function resolveContactName(tx: Tx, row: typeof followUps.$inferSelect): Promise<string> {
  if (row.leadId) {
    const [l] = await tx.select({ fullName: leads.fullName }).from(leads).where(eq(leads.id, row.leadId));
    return l?.fullName ?? 'Unknown';
  }
  if (row.clientId) {
    const [c] = await tx.select({ fullName: clients.fullName }).from(clients).where(eq(clients.id, row.clientId));
    return c?.fullName ?? 'Unknown';
  }
  return 'Unknown';
}

export async function requireFollowUp(tx: Tx, organizationId: string, id: string) {
  const [row] = await tx.select().from(followUps).where(and(eq(followUps.id, id), eq(followUps.organizationId, organizationId)));
  if (!row) throw notFound('Follow-up');
  return row;
}

export async function refreshNextFollowUp(tx: Tx, organizationId: string, ref: { leadId?: string | null; clientId?: string | null }): Promise<void> {
  const cond = ref.leadId
    ? and(eq(followUps.leadId, ref.leadId), eq(followUps.status, 'PENDING'))
    : and(eq(followUps.clientId, ref.clientId!), eq(followUps.status, 'PENDING'));
  const [next] = await tx.select({ dueAt: followUps.dueAt }).from(followUps).where(cond).orderBy(asc(followUps.dueAt)).limit(1);
  const table = ref.leadId ? leads : clients;
  const id = ref.leadId ?? ref.clientId!;
  await tx.update(table).set({ nextFollowUpAt: next?.dueAt ?? null }).where(eq(table.id, id));
}

export async function updateFollowUp(a: Auth, id: string, body: unknown): Promise<FollowUpItem> {
  parse(uuidField, id);
  const input = parse(followUpUpdate, body);
  return withTenant(a.organizationId, async (tx) => {
    const row = await requireFollowUp(tx, a.organizationId, id);
    if (row.status !== 'PENDING') throw conflict('Only pending follow-ups can be edited', 'FOLLOW_UP_CLOSED');
    const update: Record<string, unknown> = { ...input };
    if (input.dueAt) update.dueAt = new Date(input.dueAt);
    await tx.update(followUps).set(update).where(eq(followUps.id, id));
    if (input.dueAt) await refreshNextFollowUp(tx, a.organizationId, { leadId: row.leadId, clientId: row.clientId });
    const updated = await requireFollowUp(tx, a.organizationId, id);
    return hydrate(tx, updated);
  });
}

const nextFollowUpSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  dueAt: z.string().datetime({ offset: true }).optional(),
  priority: z.enum(FOLLOW_UP_PRIORITIES).optional(),
  channel: z.enum(CONTACT_METHODS).nullable().optional(),
  assignedToId: uuidField.optional(),
});

export async function completeFollowUp(a: Auth, id: string, body: unknown): Promise<FollowUpItem> {
  parse(uuidField, id);
  const input = parse(z.object({ next: nextFollowUpSchema.optional() }), body ?? {});
  return withTenant(a.organizationId, async (tx) => {
    const row = await requireFollowUp(tx, a.organizationId, id);
    if (row.status !== 'PENDING') throw conflict('Follow-up is already closed', 'FOLLOW_UP_CLOSED');
    await tx.update(followUps).set({ status: 'COMPLETED', completedAt: new Date() }).where(eq(followUps.id, id));
    await refreshNextFollowUp(tx, a.organizationId, { leadId: row.leadId, clientId: row.clientId });

    if (input.next?.title && input.next.dueAt) {
      await insertFollowUp(tx, a, {
        title: input.next.title,
        notes: input.next.notes ?? null,
        dueAt: input.next.dueAt,
        priority: input.next.priority ?? 'MEDIUM',
        channel: input.next.channel ?? null,
        leadId: row.leadId ?? undefined,
        clientId: row.clientId ?? undefined,
        assignedToId: input.next.assignedToId ?? row.assignedToId ?? undefined,
      });
    }
    const updated = await requireFollowUp(tx, a.organizationId, id);
    return hydrate(tx, updated);
  });
}

export async function deleteFollowUp(a: Auth, id: string): Promise<void> {
  parse(uuidField, id);
  await withTenant(a.organizationId, async (tx) => {
    const row = await requireFollowUp(tx, a.organizationId, id);
    await tx.delete(followUps).where(eq(followUps.id, id));
    await refreshNextFollowUp(tx, a.organizationId, { leadId: row.leadId, clientId: row.clientId });
  });
}

export async function listFollowUps(a: Auth, query: unknown): Promise<FollowUpPage> {
  const q = parse(followUpListQuery, query);
  return withTenant(a.organizationId, async (tx) => {
    const tz = await orgTimezone(tx, a.organizationId);
    const { start, end } = dayBounds(new Date(), tz);
    const scope = followUpScope(a);

    const base = [eq(followUps.organizationId, a.organizationId)];
    if (scope === 'own') base.push(eq(followUps.assignedToId, a.userId));
    if (q.assignedToId) base.push(eq(followUps.assignedToId, q.assignedToId));

    const countFor = async (extra: SQL) => {
      const [row] = await tx.select({ count: dsql<number>`count(*)::int` }).from(followUps).where(and(...base, extra));
      return row?.count ?? 0;
    };

    const counts = {
      overdue: await countFor(and(eq(followUps.status, 'PENDING'), lt(followUps.dueAt, start))!),
      today: await countFor(and(eq(followUps.status, 'PENDING'), gte(followUps.dueAt, start), lt(followUps.dueAt, end))!),
      upcoming: await countFor(and(eq(followUps.status, 'PENDING'), gte(followUps.dueAt, end))!),
      completed: await countFor(eq(followUps.status, 'COMPLETED')),
    };

    let viewCond: SQL;
    if (q.view === 'overdue') viewCond = and(eq(followUps.status, 'PENDING'), lt(followUps.dueAt, start))!;
    else if (q.view === 'today') viewCond = and(eq(followUps.status, 'PENDING'), gte(followUps.dueAt, start), lt(followUps.dueAt, end))!;
    else if (q.view === 'upcoming') viewCond = and(eq(followUps.status, 'PENDING'), gte(followUps.dueAt, end))!;
    else viewCond = eq(followUps.status, 'COMPLETED');

    const where = and(...base, viewCond);
    const rows = await tx
      .select({ f: followUps, agentName: users.name })
      .from(followUps)
      .leftJoin(users, eq(users.id, followUps.assignedToId))
      .where(where)
      .orderBy(q.view === 'completed' ? desc(followUps.completedAt) : asc(followUps.dueAt))
      .limit(q.pageSize).offset((q.page - 1) * q.pageSize);

    const items = await Promise.all(rows.map(async (r) => mapFollowUp(r.f, r.agentName, await resolveContactName(tx, r.f))));
    const [totalRow] = await tx.select({ count: dsql<number>`count(*)::int` }).from(followUps).where(where);

    return { items, total: totalRow?.count ?? 0, counts };
  });
}
