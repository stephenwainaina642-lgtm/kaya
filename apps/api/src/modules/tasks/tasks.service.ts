import { z } from 'zod';
import { eq, and, lt, desc, asc, sql as dsql, type SQL } from 'drizzle-orm';
import { TASK_PRIORITIES, TASK_STATUSES } from '@kaya/shared';
import type { TaskItem, TaskPage } from '@kaya/shared';
import { withTenant, type Tx } from '../../db/client';
import { tasks, leads, clients, users } from '../../db/schema';
import { notFound } from '../../lib/errors';
import { parse } from '../../lib/validate';
import { type Auth, uuidField, pagingQuery, taskScope, agentRef, requireLead, requireClient } from '../crm/common';

export const taskCreate = z.object({
  title: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(2000).nullable().optional(),
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
  priority: z.enum(TASK_PRIORITIES).default('MEDIUM'),
  leadId: uuidField.nullable().optional(),
  clientId: uuidField.nullable().optional(),
  assignedToId: uuidField.optional(),
});

export const taskUpdate = taskCreate.partial();

export const taskStatusInput = z.object({ status: z.enum(TASK_STATUSES) });

export const taskListQuery = pagingQuery.extend({
  view: z.enum(['open', 'overdue', 'completed']).default('open'),
  assignedToId: uuidField.optional(),
});

function mapTask(row: typeof tasks.$inferSelect, agentName: string | null): TaskItem {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    dueAt: row.dueAt?.toISOString() ?? null,
    status: row.status,
    priority: row.priority,
    leadId: row.leadId,
    clientId: row.clientId,
    assignedTo: agentRef(row.assignedToId, agentName),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

async function hydrate(tx: Tx, row: typeof tasks.$inferSelect): Promise<TaskItem> {
  const [agent] = row.assignedToId ? await tx.select({ name: users.name }).from(users).where(eq(users.id, row.assignedToId)) : [null];
  return mapTask(row, agent?.name ?? null);
}

export async function requireTask(tx: Tx, organizationId: string, id: string) {
  const [row] = await tx.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.organizationId, organizationId)));
  if (!row) throw notFound('Task');
  return row;
}

export async function createTask(a: Auth, body: unknown): Promise<TaskItem> {
  const input = parse(taskCreate, body);
  return withTenant(a.organizationId, async (tx) => {
    if (input.leadId) await requireLead(tx, a.organizationId, input.leadId);
    if (input.clientId) await requireClient(tx, a.organizationId, input.clientId);
    const [row] = await tx.insert(tasks).values({
      organizationId: a.organizationId,
      title: input.title,
      notes: input.notes ?? null,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      priority: input.priority,
      leadId: input.leadId ?? null,
      clientId: input.clientId ?? null,
      assignedToId: input.assignedToId ?? a.userId,
    }).returning();
    if (!row) throw notFound('Task');
    return hydrate(tx, row);
  });
}

export async function updateTask(a: Auth, id: string, body: unknown): Promise<TaskItem> {
  parse(uuidField, id);
  const input = parse(taskUpdate, body);
  return withTenant(a.organizationId, async (tx) => {
    await requireTask(tx, a.organizationId, id);
    const update: Record<string, unknown> = { ...input };
    if (input.dueAt !== undefined) update.dueAt = input.dueAt ? new Date(input.dueAt) : null;
    await tx.update(tasks).set(update).where(eq(tasks.id, id));
    const updated = await requireTask(tx, a.organizationId, id);
    return hydrate(tx, updated);
  });
}

export async function setTaskStatus(a: Auth, id: string, body: unknown): Promise<TaskItem> {
  parse(uuidField, id);
  const input = parse(taskStatusInput, body);
  return withTenant(a.organizationId, async (tx) => {
    await requireTask(tx, a.organizationId, id);
    await tx.update(tasks).set({
      status: input.status,
      completedAt: input.status === 'COMPLETED' ? new Date() : null,
    }).where(eq(tasks.id, id));
    const updated = await requireTask(tx, a.organizationId, id);
    return hydrate(tx, updated);
  });
}

export async function deleteTask(a: Auth, id: string): Promise<void> {
  parse(uuidField, id);
  await withTenant(a.organizationId, async (tx) => {
    await requireTask(tx, a.organizationId, id);
    await tx.delete(tasks).where(eq(tasks.id, id));
  });
}

export async function listTasks(a: Auth, query: unknown): Promise<TaskPage> {
  const q = parse(taskListQuery, query);
  return withTenant(a.organizationId, async (tx) => {
    const scope = taskScope(a);
    const base = [eq(tasks.organizationId, a.organizationId)];
    if (scope === 'own') base.push(eq(tasks.assignedToId, a.userId));
    if (q.assignedToId) base.push(eq(tasks.assignedToId, q.assignedToId));

    const countFor = async (extra: SQL) => {
      const [row] = await tx.select({ count: dsql<number>`count(*)::int` }).from(tasks).where(and(...base, extra));
      return row?.count ?? 0;
    };
    const now = new Date();
    const counts = {
      open: await countFor(eq(tasks.status, 'OPEN')),
      overdue: await countFor(and(eq(tasks.status, 'OPEN'), lt(tasks.dueAt, now))!),
      completed: await countFor(eq(tasks.status, 'COMPLETED')),
    };

    let viewCond: SQL;
    if (q.view === 'open') viewCond = eq(tasks.status, 'OPEN');
    else if (q.view === 'overdue') viewCond = and(eq(tasks.status, 'OPEN'), lt(tasks.dueAt, now))!;
    else viewCond = eq(tasks.status, 'COMPLETED');

    const where = and(...base, viewCond);
    const rows = await tx
      .select({ t: tasks, agentName: users.name })
      .from(tasks)
      .leftJoin(users, eq(users.id, tasks.assignedToId))
      .where(where)
      .orderBy(q.view === 'completed' ? desc(tasks.completedAt) : asc(tasks.dueAt))
      .limit(q.pageSize).offset((q.page - 1) * q.pageSize);

    const [totalRow] = await tx.select({ count: dsql<number>`count(*)::int` }).from(tasks).where(where);

    return { items: rows.map((r) => mapTask(r.t, r.agentName)), total: totalRow?.count ?? 0, counts };
  });
}
