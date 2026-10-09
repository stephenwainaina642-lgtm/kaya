import { z } from 'zod';
import { eq, and, lt, desc } from 'drizzle-orm';
import { COMM_CHANNELS } from '@kaya/shared';
import type { TimelineEntry, TimelinePage } from '@kaya/shared';
import type { Tx } from '../../db/client';
import type { Auth } from './common';
import { activities, communications, leads, clients, users } from '../../db/schema';

export const contactLogInput = z.object({
  channel: z.enum(COMM_CHANNELS),
  inbound: z.boolean().default(false),
  body: z.string().trim().max(5000).nullable().default(null),
});

export type ContactLogInput = z.infer<typeof contactLogInput>;

export async function touchContact(
  tx: Tx,
  a: Auth,
  ref: { leadId?: string | null; clientId?: string | null },
  at: Date,
  direction: 'INBOUND' | 'OUTBOUND' = 'OUTBOUND',
  isRealContact = true,
): Promise<void> {
  if (!isRealContact) return;
  if (ref.leadId) {
    const update: Record<string, unknown> = { lastContactedAt: at };
    if (direction === 'INBOUND') {
      const [lead] = await tx.select({ firstResponseAt: leads.firstResponseAt, status: leads.status }).from(leads).where(eq(leads.id, ref.leadId));
      if (lead && !lead.firstResponseAt) update.firstResponseAt = at;
      if (lead && lead.status === 'NEW') update.status = 'CONTACTED';
    }
    await tx.update(leads).set(update).where(eq(leads.id, ref.leadId));
  } else if (ref.clientId) {
    await tx.update(clients).set({ lastContactedAt: at }).where(eq(clients.id, ref.clientId));
  }
}

export async function logContact(
  tx: Tx,
  a: Auth,
  subject: string,
  ref: { leadId?: string | null; clientId?: string | null },
  input: ContactLogInput,
): Promise<void> {
  const occurredAt = new Date();
  await tx.insert(communications).values({
    organizationId: a.organizationId,
    channel: input.channel,
    direction: input.inbound ? 'INBOUND' : 'OUTBOUND',
    subject,
    body: input.body,
    occurredAt,
    leadId: ref.leadId ?? null,
    clientId: ref.clientId ?? null,
    userId: a.userId,
  });
  await tx.insert(activities).values({
    organizationId: a.organizationId,
    type: input.channel,
    title: subject,
    body: input.body,
    actorId: a.userId,
    leadId: ref.leadId ?? null,
    clientId: ref.clientId ?? null,
    occurredAt,
  });
  await touchContact(tx, a, ref, occurredAt, input.inbound ? 'INBOUND' : 'OUTBOUND');
}

export const timelineQuery = z.object({
  cursor: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export async function loadTimeline(
  tx: Tx,
  ref: { leadId?: string | null; clientId?: string | null },
  q: { cursor?: string; limit: number },
): Promise<TimelinePage> {
  const scopeCond = ref.leadId ? eq(activities.leadId, ref.leadId) : eq(activities.clientId, ref.clientId!);
  const where = q.cursor ? and(scopeCond, lt(activities.occurredAt, new Date(q.cursor))) : scopeCond;

  const rows = await tx
    .select({ a: activities, actorName: users.name, actorId: users.id })
    .from(activities)
    .leftJoin(users, eq(users.id, activities.actorId))
    .where(where)
    .orderBy(desc(activities.occurredAt))
    .limit(q.limit + 1);

  const hasMore = rows.length > q.limit;
  const page = rows.slice(0, q.limit);

  const items: TimelineEntry[] = page.map((r) => ({
    id: r.a.id,
    type: r.a.type,
    title: r.a.title,
    body: r.a.body,
    actor: r.actorId && r.actorName ? { id: r.actorId, name: r.actorName } : null,
    metadata: (r.a.metadata as Record<string, unknown>) ?? null,
    occurredAt: r.a.occurredAt.toISOString(),
  }));

  return {
    items,
    nextCursor: hasMore ? page[page.length - 1]!.a.occurredAt.toISOString() : null,
  };
}
