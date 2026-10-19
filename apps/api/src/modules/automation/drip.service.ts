import { z } from 'zod';
import { eq, and, asc, count as dcount } from 'drizzle-orm';
import { LEAD_SOURCES, CONTACT_METHODS, FOLLOW_UP_PRIORITIES } from '@kaya/shared';
import type { DripSequence, DripEnrollment, Page } from '@kaya/shared';
import { withTenant, type Tx } from '../../db/client';
import { systemDb } from '../../db/system';
import { dripSequences, dripSequenceSteps, dripEnrollments, leads, clients, followUps } from '../../db/schema';
import { notFound, invalid } from '../../lib/errors';
import { parse } from '../../lib/validate';
import { type Auth, uuidField, nameField, pagingQuery, pageWindow } from '../crm/common';

export const dripStepInput = z.object({
  offsetHours: z.number().int().min(0).max(24 * 90), // up to ~3 months out
  title: nameField,
  notes: z.string().trim().max(1000).nullable().optional(),
  channel: z.enum(CONTACT_METHODS).nullable().optional(),
  priority: z.enum(FOLLOW_UP_PRIORITIES).default('MEDIUM'),
});

export const dripSequenceInput = z.object({
  name: nameField,
  description: z.string().trim().max(500).nullable().optional(),
  active: z.boolean().default(true),
  sourceFilter: z.enum(LEAD_SOURCES).nullable().optional(),
  steps: z.array(dripStepInput).min(1).max(20),
});

async function hydrateSequence(tx: Tx, row: typeof dripSequences.$inferSelect): Promise<DripSequence> {
  const [steps, [activeRow]] = await Promise.all([
    tx.select().from(dripSequenceSteps).where(eq(dripSequenceSteps.sequenceId, row.id)).orderBy(asc(dripSequenceSteps.stepOrder)),
    tx.select({ c: dcount() }).from(dripEnrollments).where(and(eq(dripEnrollments.sequenceId, row.id), eq(dripEnrollments.status, 'ACTIVE'))),
  ]);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    active: row.active,
    sourceFilter: row.sourceFilter,
    steps: steps.map((s) => ({
      id: s.id, stepOrder: s.stepOrder, offsetHours: s.offsetHours, title: s.title, notes: s.notes, channel: s.channel, priority: s.priority,
    })),
    activeEnrollments: activeRow?.c ?? 0,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listSequences(a: Auth): Promise<DripSequence[]> {
  return withTenant(a.organizationId, async (tx) => {
    const rows = await tx.select().from(dripSequences).where(eq(dripSequences.organizationId, a.organizationId)).orderBy(asc(dripSequences.createdAt));
    return Promise.all(rows.map((r) => hydrateSequence(tx, r)));
  });
}

export async function createSequence(a: Auth, body: unknown): Promise<DripSequence> {
  const input = parse(dripSequenceInput, body);
  return withTenant(a.organizationId, async (tx) => {
    const [row] = await tx.insert(dripSequences).values({
      organizationId: a.organizationId,
      name: input.name,
      description: input.description ?? null,
      active: input.active,
      sourceFilter: input.sourceFilter ?? null,
      createdById: a.userId,
      updatedById: a.userId,
    }).returning();
    if (!row) throw notFound('Drip sequence');
    await tx.insert(dripSequenceSteps).values(
      input.steps.map((s, i) => ({
        sequenceId: row.id,
        stepOrder: i + 1,
        offsetHours: s.offsetHours,
        title: s.title,
        notes: s.notes ?? null,
        channel: s.channel ?? null,
        priority: s.priority,
      })),
    );
    return hydrateSequence(tx, row);
  });
}

export async function updateSequence(a: Auth, id: string, body: unknown): Promise<DripSequence> {
  parse(uuidField, id);
  const input = parse(dripSequenceInput, body);
  return withTenant(a.organizationId, async (tx) => {
    const [existing] = await tx.select().from(dripSequences).where(and(eq(dripSequences.id, id), eq(dripSequences.organizationId, a.organizationId)));
    if (!existing) throw notFound('Drip sequence');
    await tx.update(dripSequences).set({
      name: input.name,
      description: input.description ?? null,
      active: input.active,
      sourceFilter: input.sourceFilter ?? null,
      updatedById: a.userId,
    }).where(eq(dripSequences.id, id));
    // Steps are small, editor-managed lists — replacing them wholesale on
    // every save is simpler and safer than diffing, and in-flight
    // enrollments track progress by step *index* (cursorStep), not id, so
    // this doesn't disturb anyone already partway through the sequence
    // (though it can shift what a given index means if steps are reordered
    // — acceptable for a v1 editor; a future version could warn on that).
    await tx.delete(dripSequenceSteps).where(eq(dripSequenceSteps.sequenceId, id));
    await tx.insert(dripSequenceSteps).values(
      input.steps.map((s, i) => ({
        sequenceId: id,
        stepOrder: i + 1,
        offsetHours: s.offsetHours,
        title: s.title,
        notes: s.notes ?? null,
        channel: s.channel ?? null,
        priority: s.priority,
      })),
    );
    const [row] = await tx.select().from(dripSequences).where(eq(dripSequences.id, id));
    return hydrateSequence(tx, row!);
  });
}

export async function deleteSequence(a: Auth, id: string): Promise<void> {
  parse(uuidField, id);
  await withTenant(a.organizationId, async (tx) => {
    const [existing] = await tx.select().from(dripSequences).where(and(eq(dripSequences.id, id), eq(dripSequences.organizationId, a.organizationId)));
    if (!existing) throw notFound('Drip sequence');
    await tx.delete(dripSequences).where(eq(dripSequences.id, id));
  });
}

export const enrollmentListQuery = pagingQuery.extend({
  status: z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED']).optional(),
});

export async function listEnrollments(a: Auth, query: unknown): Promise<Page<DripEnrollment>> {
  const q = parse(enrollmentListQuery, query);
  return withTenant(a.organizationId, async (tx) => {
    const conds = [eq(dripEnrollments.organizationId, a.organizationId)];
    if (q.status) conds.push(eq(dripEnrollments.status, q.status));
    const where = and(...conds);
    const { limit, offset } = pageWindow(q);

    const [rows, [totalRow]] = await Promise.all([
      tx.select({
        enrollment: dripEnrollments,
        sequenceName: dripSequences.name,
        leadName: leads.fullName,
        clientName: clients.fullName,
        totalSteps: dcount(dripSequenceSteps.id),
      })
        .from(dripEnrollments)
        .innerJoin(dripSequences, eq(dripSequences.id, dripEnrollments.sequenceId))
        .leftJoin(leads, eq(leads.id, dripEnrollments.leadId))
        .leftJoin(clients, eq(clients.id, dripEnrollments.clientId))
        .leftJoin(dripSequenceSteps, eq(dripSequenceSteps.sequenceId, dripSequences.id))
        .where(where)
        .groupBy(dripEnrollments.id, dripSequences.name, leads.fullName, clients.fullName)
        .orderBy(asc(dripEnrollments.enrolledAt))
        .limit(limit).offset(offset),
      tx.select({ c: dcount() }).from(dripEnrollments).where(where),
    ]);

    return {
      items: rows.map((r) => ({
        id: r.enrollment.id,
        sequenceId: r.enrollment.sequenceId,
        sequenceName: r.sequenceName,
        contactName: r.leadName ?? r.clientName ?? 'Unknown contact',
        leadId: r.enrollment.leadId,
        clientId: r.enrollment.clientId,
        status: r.enrollment.status,
        stepsDone: r.enrollment.cursorStep,
        stepsTotal: r.totalSteps,
        enrolledAt: r.enrollment.enrolledAt.toISOString(),
        completedAt: r.enrollment.completedAt?.toISOString() ?? null,
      })),
      total: totalRow?.c ?? 0,
      page: q.page,
      pageSize: q.pageSize,
    };
  });
}

export async function cancelEnrollment(a: Auth, id: string): Promise<void> {
  parse(uuidField, id);
  await withTenant(a.organizationId, async (tx) => {
    const [existing] = await tx.select().from(dripEnrollments).where(and(eq(dripEnrollments.id, id), eq(dripEnrollments.organizationId, a.organizationId)));
    if (!existing) throw notFound('Enrollment');
    if (existing.status !== 'ACTIVE') throw invalid({ status: 'Only active enrollments can be cancelled' });
    await tx.update(dripEnrollments).set({ status: 'CANCELLED', completedAt: new Date() }).where(eq(dripEnrollments.id, id));
    await tx.update(followUps)
      .set({ status: 'CANCELLED' })
      .where(and(eq(followUps.dripEnrollmentId, id), eq(followUps.status, 'PENDING')));
  });
}

/**
 * Called from leads.service.createLead right after a lead is inserted.
 * Enrolls the new lead into every active sequence whose sourceFilter is
 * null (any source) or matches the lead's source. Runs inside the same
 * transaction as the lead insert, so it either commits with the lead or
 * not at all.
 */
export async function enrollLeadInMatchingSequences(tx: Tx, organizationId: string, leadId: string, source: string): Promise<void> {
  const activeSequences = await tx
    .select()
    .from(dripSequences)
    .where(and(eq(dripSequences.organizationId, organizationId), eq(dripSequences.active, true)));
  if (activeSequences.length === 0) return;

  // sourceFilter null means "any source" — filtering in JS (rather than a
  // SQL `or(isNull, eq)`) keeps this readable for what's at most a handful
  // of sequences per org.
  const toEnroll = activeSequences.filter((r) => r.sourceFilter === null || r.sourceFilter === source);
  if (toEnroll.length === 0) return;

  await tx.insert(dripEnrollments).values(
    toEnroll.map((seq) => ({
      organizationId,
      sequenceId: seq.id,
      leadId,
      clientId: null,
      status: 'ACTIVE' as const,
      cursorStep: 0,
    })),
  );
}

/**
 * The in-process sweep that advances every org's active drip enrollments —
 * see modules/automation/scheduler.ts for what calls this and how often.
 * Runs cross-tenant via systemDb (a background job, not a tenant request),
 * materializing a real follow_ups row for each step whose offset has
 * elapsed since enrollment, then marking the enrollment COMPLETED once
 * every step has fired. Idempotent per step: cursorStep only advances
 * forward, so re-running the sweep never double-creates a follow-up.
 */
export async function sweepDripEnrollments(now: Date = new Date()): Promise<{ stepsCreated: number; completed: number }> {
  const active = await systemDb.select().from(dripEnrollments).where(eq(dripEnrollments.status, 'ACTIVE'));
  let stepsCreated = 0;
  let completed = 0;

  for (const enrollment of active) {
    const steps = await systemDb
      .select()
      .from(dripSequenceSteps)
      .where(eq(dripSequenceSteps.sequenceId, enrollment.sequenceId))
      .orderBy(asc(dripSequenceSteps.stepOrder));
    if (steps.length === 0) continue;

    const elapsedHours = (now.getTime() - enrollment.enrolledAt.getTime()) / 3_600_000;
    let cursor = enrollment.cursorStep;
    let assignedToId: string | null = null;

    while (cursor < steps.length && steps[cursor]!.offsetHours <= elapsedHours) {
      const step = steps[cursor]!;
      if (assignedToId === null) {
        assignedToId = await resolveEnrollmentAssignee(enrollment.leadId, enrollment.clientId);
      }
      await systemDb.insert(followUps).values({
        organizationId: enrollment.organizationId,
        title: step.title,
        notes: step.notes,
        dueAt: now,
        priority: step.priority,
        channel: step.channel,
        leadId: enrollment.leadId,
        clientId: enrollment.clientId,
        assignedToId,
        dripEnrollmentId: enrollment.id,
      });
      stepsCreated += 1;
      cursor += 1;
    }

    if (cursor !== enrollment.cursorStep) {
      const done = cursor >= steps.length;
      await systemDb.update(dripEnrollments)
        .set({ cursorStep: cursor, status: done ? 'COMPLETED' : 'ACTIVE', completedAt: done ? now : null })
        .where(eq(dripEnrollments.id, enrollment.id));
      if (done) completed += 1;
    }
  }

  return { stepsCreated, completed };
}

async function resolveEnrollmentAssignee(leadId: string | null, clientId: string | null): Promise<string | null> {
  if (leadId) {
    const [row] = await systemDb.select({ assignedAgentId: leads.assignedAgentId }).from(leads).where(eq(leads.id, leadId));
    return row?.assignedAgentId ?? null;
  }
  if (clientId) {
    const [row] = await systemDb.select({ assignedAgentId: clients.assignedAgentId }).from(clients).where(eq(clients.id, clientId));
    return row?.assignedAgentId ?? null;
  }
  return null;
}
