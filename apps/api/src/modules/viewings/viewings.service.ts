import { z } from 'zod';
import { and, eq, gte, lte, ne, desc } from 'drizzle-orm';
import { VIEWING_STATUSES, INTEREST_LEVELS } from '@kaya/shared';
import type { ViewingItem, ViewingPage, ViewingConflict } from '@kaya/shared';
import { withTenant, type Tx } from '../../db/client';
import { viewings, viewingFeedback, properties, propertyImages, clients, leads, users, activities } from '../../db/schema';
import { notFound, conflict as conflictError } from '../../lib/errors';
import { parse } from '../../lib/validate';
import { type Auth, uuidField, pagingQuery, pageWindow, agentRef } from '../crm/common';
import { recordAudit } from '../../lib/audit';

export const viewingCreate = z
  .object({
    propertyId: uuidField,
    clientId: uuidField.nullable().optional(),
    leadId: uuidField.nullable().optional(),
    agentId: uuidField.nullable().optional(),
    scheduledAt: z.string().datetime({ offset: true }),
    durationMinutes: z.number().int().min(10).max(480).default(30),
    meetingLocation: z.string().trim().max(300).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    reminderMinutesBefore: z.number().int().min(0).max(1440).nullable().optional(),
  })
  .refine((v) => v.clientId || v.leadId, { message: 'clientId or leadId is required', path: ['clientId'] });

export const viewingUpdate = z.object({
  scheduledAt: z.string().datetime({ offset: true }).optional(),
  durationMinutes: z.number().int().min(10).max(480).optional(),
  meetingLocation: z.string().trim().max(300).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  agentId: uuidField.optional(),
});

export const viewingFeedbackInput = z.object({
  interestLevel: z.enum(INTEREST_LEVELS),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  feedback: z.string().trim().max(2000).nullable().optional(),
  objections: z.string().trim().max(2000).nullable().optional(),
  nextAction: z.string().trim().max(500).nullable().optional(),
  followUpDate: z.string().trim().max(40).nullable().optional(),
});

export const viewingListQuery = pagingQuery.extend({
  view: z.enum(['upcoming', 'past', 'all']).default('upcoming'),
  status: z.enum(VIEWING_STATUSES).optional(),
  agentId: uuidField.optional(),
});

async function hydrate(tx: Tx, row: typeof viewings.$inferSelect): Promise<ViewingItem> {
  const [prop] = await tx.select({ id: properties.id, title: properties.title, location: properties.location }).from(properties).where(eq(properties.id, row.propertyId));
  const [cover] = await tx.select({ url: propertyImages.url }).from(propertyImages).where(and(eq(propertyImages.propertyId, row.propertyId), eq(propertyImages.isCover, true))).limit(1);
  const [agent] = await tx.select({ name: users.name }).from(users).where(eq(users.id, row.agentId));
  const client = row.clientId ? (await tx.select({ id: clients.id, name: clients.fullName, phone: clients.phone }).from(clients).where(eq(clients.id, row.clientId)))[0] ?? null : null;
  const lead = row.leadId ? (await tx.select({ id: leads.id, name: leads.fullName, phone: leads.phone }).from(leads).where(eq(leads.id, row.leadId)))[0] ?? null : null;
  const [fb] = await tx.select().from(viewingFeedback).where(eq(viewingFeedback.viewingId, row.id));

  return {
    id: row.id,
    property: { id: prop?.id ?? row.propertyId, title: prop?.title ?? 'Unknown', location: prop?.location ?? '', coverImageUrl: cover?.url ?? null },
    client,
    lead,
    agent: agentRef(row.agentId, agent?.name ?? null)!,
    scheduledAt: row.scheduledAt.toISOString(),
    durationMinutes: row.durationMinutes,
    status: row.status,
    meetingLocation: row.meetingLocation,
    notes: row.notes,
    feedback: fb ? { interestLevel: fb.interestLevel, rating: fb.rating, feedback: fb.feedback, objections: fb.objections, nextAction: fb.nextAction, followUpDate: fb.followUpDate } : null,
  };
}

export async function requireViewing(tx: Tx, organizationId: string, id: string) {
  const [row] = await tx.select().from(viewings).where(and(eq(viewings.id, id), eq(viewings.organizationId, organizationId)));
  if (!row) throw notFound('Viewing');
  return row;
}

async function detectConflict(tx: Tx, organizationId: string, agentId: string, scheduledAt: Date, durationMinutes: number, excludeId?: string): Promise<ViewingConflict | null> {
  const start = scheduledAt;
  const end = new Date(scheduledAt.getTime() + durationMinutes * 60_000);
  const rows = await tx
    .select()
    .from(viewings)
    .where(
      and(
        eq(viewings.organizationId, organizationId),
        eq(viewings.agentId, agentId),
        eq(viewings.status, 'SCHEDULED'),
        excludeId ? ne(viewings.id, excludeId) : undefined,
      ),
    );
  for (const r of rows) {
    const rStart = r.scheduledAt;
    const rEnd = new Date(r.scheduledAt.getTime() + r.durationMinutes * 60_000);
    if (start < rEnd && rStart < end) {
      return { agentId, conflictingViewingId: r.id, scheduledAt: r.scheduledAt.toISOString() };
    }
  }
  return null;
}

export async function listViewings(a: Auth, query: unknown): Promise<ViewingPage> {
  const q = parse(viewingListQuery, query);
  return withTenant(a.organizationId, async (tx) => {
    const now = new Date();
    const conds = [eq(viewings.organizationId, a.organizationId)];
    if (q.status) conds.push(eq(viewings.status, q.status));
    if (q.agentId) conds.push(eq(viewings.agentId, q.agentId));
    if (q.view === 'upcoming') conds.push(gte(viewings.scheduledAt, now));
    if (q.view === 'past') conds.push(lte(viewings.scheduledAt, now));

    const all = await tx.select().from(viewings).where(and(...conds)).orderBy(q.view === 'past' ? desc(viewings.scheduledAt) : viewings.scheduledAt);
    const { limit, offset } = pageWindow(q);
    const page = all.slice(offset, offset + limit);
    const items = await Promise.all(page.map((r) => hydrate(tx, r)));

    const countsRows = await tx.select().from(viewings).where(eq(viewings.organizationId, a.organizationId));
    const counts = {
      scheduled: countsRows.filter((r) => r.status === 'SCHEDULED').length,
      completed: countsRows.filter((r) => r.status === 'COMPLETED').length,
      cancelled: countsRows.filter((r) => r.status === 'CANCELLED').length,
      noShow: countsRows.filter((r) => r.status === 'NO_SHOW').length,
    };

    return { items, total: all.length, counts };
  });
}

export async function getViewing(a: Auth, id: string): Promise<ViewingItem> {
  parse(uuidField, id);
  return withTenant(a.organizationId, async (tx) => hydrate(tx, await requireViewing(tx, a.organizationId, id)));
}

export async function createViewing(a: Auth, body: unknown): Promise<ViewingItem> {
  const input = parse(viewingCreate, body);
  return withTenant(a.organizationId, async (tx) => {
    const agentId = input.agentId ?? a.userId;
    const scheduledAt = new Date(input.scheduledAt);
    const existingConflict = await detectConflict(tx, a.organizationId, agentId, scheduledAt, input.durationMinutes);
    if (existingConflict) throw conflictError('Agent already has a viewing scheduled at this time', 'VIEWING_CONFLICT');

    const [row] = await tx
      .insert(viewings)
      .values({
        organizationId: a.organizationId,
        propertyId: input.propertyId,
        clientId: input.clientId ?? null,
        leadId: input.leadId ?? null,
        agentId,
        scheduledAt,
        durationMinutes: input.durationMinutes,
        meetingLocation: input.meetingLocation ?? null,
        notes: input.notes ?? null,
        reminderMinutesBefore: input.reminderMinutesBefore ?? 60,
        createdById: a.userId,
        updatedById: a.userId,
      })
      .returning();
    if (!row) throw notFound('Viewing');

    await tx.insert(activities).values({
      organizationId: a.organizationId,
      type: 'VIEWING',
      title: 'Viewing scheduled',
      actorId: a.userId,
      leadId: input.leadId ?? null,
      clientId: input.clientId ?? null,
      propertyId: input.propertyId,
      viewingId: row.id,
    });

    return hydrate(tx, row);
  });
}

export async function updateViewing(a: Auth, id: string, body: unknown): Promise<ViewingItem> {
  parse(uuidField, id);
  const input = parse(viewingUpdate, body);
  return withTenant(a.organizationId, async (tx) => {
    const existing = await requireViewing(tx, a.organizationId, id);
    const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : existing.scheduledAt;
    const durationMinutes = input.durationMinutes ?? existing.durationMinutes;
    const agentId = input.agentId ?? existing.agentId;
    if (input.scheduledAt || input.durationMinutes || input.agentId) {
      const c = await detectConflict(tx, a.organizationId, agentId, scheduledAt, durationMinutes, id);
      if (c) throw conflictError('Agent already has a viewing scheduled at this time', 'VIEWING_CONFLICT');
    }
    await tx
      .update(viewings)
      .set({ scheduledAt, durationMinutes, agentId, meetingLocation: input.meetingLocation ?? existing.meetingLocation, notes: input.notes ?? existing.notes, updatedById: a.userId })
      .where(eq(viewings.id, id));
    return hydrate(tx, await requireViewing(tx, a.organizationId, id));
  });
}

export async function cancelViewing(a: Auth, id: string, reason?: string): Promise<ViewingItem> {
  parse(uuidField, id);
  return withTenant(a.organizationId, async (tx) => {
    await requireViewing(tx, a.organizationId, id);
    await tx.update(viewings).set({ status: 'CANCELLED', notes: reason ?? undefined, updatedById: a.userId }).where(eq(viewings.id, id));
    return hydrate(tx, await requireViewing(tx, a.organizationId, id));
  });
}

export async function markNoShow(a: Auth, id: string): Promise<ViewingItem> {
  parse(uuidField, id);
  return withTenant(a.organizationId, async (tx) => {
    await requireViewing(tx, a.organizationId, id);
    await tx.update(viewings).set({ status: 'NO_SHOW', updatedById: a.userId }).where(eq(viewings.id, id));
    return hydrate(tx, await requireViewing(tx, a.organizationId, id));
  });
}

export async function completeViewing(a: Auth, id: string, body: unknown): Promise<ViewingItem> {
  parse(uuidField, id);
  const input = parse(viewingFeedbackInput, body);
  return withTenant(a.organizationId, async (tx) => {
    const existing = await requireViewing(tx, a.organizationId, id);
    await tx.update(viewings).set({ status: 'COMPLETED', completedAt: new Date(), updatedById: a.userId }).where(eq(viewings.id, id));
    await tx
      .insert(viewingFeedback)
      .values({ viewingId: id, interestLevel: input.interestLevel, rating: input.rating ?? null, feedback: input.feedback ?? null, objections: input.objections ?? null, nextAction: input.nextAction ?? null, followUpDate: input.followUpDate ?? null })
      .onConflictDoUpdate({
        target: viewingFeedback.viewingId,
        set: { interestLevel: input.interestLevel, rating: input.rating ?? null, feedback: input.feedback ?? null, objections: input.objections ?? null, nextAction: input.nextAction ?? null, followUpDate: input.followUpDate ?? null },
      });

    await recordAudit(tx, { organizationId: a.organizationId, actorId: a.userId, action: 'COMPLETE', entityType: 'viewing', entityId: id, summary: `Viewing completed (${input.interestLevel})` });

    return hydrate(tx, await requireViewing(tx, a.organizationId, id));
  });
}

export async function deleteViewing(a: Auth, id: string): Promise<void> {
  parse(uuidField, id);
  await withTenant(a.organizationId, async (tx) => {
    await requireViewing(tx, a.organizationId, id);
    await tx.delete(viewings).where(eq(viewings.id, id));
  });
}
