import { z } from 'zod';
import { eq, and, desc, ilike, or, sql as dsql } from 'drizzle-orm';
import {
  LEAD_SOURCES, LEAD_STATUSES, TEMPERATURES, LEAD_TYPES,
} from '@kaya/shared';
import type { LeadListItem, LeadDetail, Page } from '@kaya/shared';
import { withTenant } from '../../db/client';
import { leads, clients, users } from '../../db/schema';
import { notFound, invalid } from '../../lib/errors';
import { parse } from '../../lib/validate';
import {
  type Auth, uuidField, nameField, tagsField, pagingQuery, pageWindow, leadScope, agentRef, resolveAssignee, requireLead,
} from '../crm/common';
import { findDuplicate, duplicateError } from '../crm/duplicates';
import { requirementsInput, saveRequirements, getRequirements, moveRequirementsToClient } from '../crm/requirements';
import { contactLogInput, logContact, loadTimeline, timelineQuery } from '../crm/timeline';
import { recordAudit } from '../../lib/audit';
import { applyAutoAssignRule } from '../automation/rules.service';
import { enrollLeadInMatchingSequences } from '../automation/drip.service';

export const leadCreate = z.object({
  fullName: nameField,
  phone: z.string().trim().min(5).max(30),
  whatsapp: z.string().trim().max(30).nullable().optional(),
  email: z.string().email().nullable().optional(),
  source: z.enum(LEAD_SOURCES).default('OTHER'),
  temperature: z.enum(TEMPERATURES).default('WARM'),
  leadType: z.enum(LEAD_TYPES).default('BUYER'),
  tags: tagsField,
  notes: z.string().trim().max(2000).nullable().optional(),
  assignedAgentId: uuidField.nullable().optional(),
  requirements: requirementsInput.optional(),
});

export const leadUpdate = leadCreate.partial();

export const leadStatusInput = z.object({
  status: z.enum(LEAD_STATUSES),
  lostReason: z.string().trim().max(500).nullable().optional(),
});

export const leadListQuery = pagingQuery.extend({
  search: z.string().trim().max(200).optional(),
  status: z.enum(LEAD_STATUSES).optional(),
  temperature: z.enum(TEMPERATURES).optional(),
  assignedAgentId: uuidField.optional(),
});

function mapLead(row: typeof leads.$inferSelect, agentName: string | null): LeadListItem {
  return {
    id: row.id,
    fullName: row.fullName,
    phone: row.phone,
    email: row.email,
    source: row.source,
    status: row.status,
    temperature: row.temperature,
    leadType: row.leadType,
    assignedAgent: agentRef(row.assignedAgentId, agentName),
    nextFollowUpAt: row.nextFollowUpAt?.toISOString() ?? null,
    lastContactedAt: row.lastContactedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listLeads(a: Auth, query: unknown): Promise<Page<LeadListItem>> {
  const q = parse(leadListQuery, query);
  return withTenant(a.organizationId, async (tx) => {
    const scope = leadScope(a);
    const conds = [eq(leads.organizationId, a.organizationId)];
    if (scope === 'own') conds.push(eq(leads.assignedAgentId, a.userId));
    if (q.status) conds.push(eq(leads.status, q.status));
    if (q.temperature) conds.push(eq(leads.temperature, q.temperature));
    if (q.assignedAgentId) conds.push(eq(leads.assignedAgentId, q.assignedAgentId));
    if (q.search) conds.push(or(ilike(leads.fullName, `%${q.search}%`), ilike(leads.phone, `%${q.search}%`))!);
    const where = and(...conds);

    const { limit, offset } = pageWindow(q);
    const [rows, totalRow] = await Promise.all([
      tx.select({ lead: leads, agentName: users.name })
        .from(leads)
        .leftJoin(users, eq(users.id, leads.assignedAgentId))
        .where(where)
        .orderBy(desc(leads.createdAt))
        .limit(limit).offset(offset),
      tx.select({ count: dsql<number>`count(*)::int` }).from(leads).where(where),
    ]);

    return {
      items: rows.map((r) => mapLead(r.lead, r.agentName)),
      total: totalRow[0]?.count ?? 0,
      page: q.page,
      pageSize: q.pageSize,
    };
  });
}

async function hydrateLead(tx: Parameters<Parameters<typeof withTenant>[1]>[0], organizationId: string, id: string): Promise<LeadDetail> {
  const [row] = await tx
    .select({ lead: leads, agentName: users.name })
    .from(leads)
    .leftJoin(users, eq(users.id, leads.assignedAgentId))
    .where(and(eq(leads.id, id), eq(leads.organizationId, organizationId)));
  if (!row) throw notFound('Lead');
  const reqs = await getRequirements(tx, { leadId: id });
  return {
    ...mapLead(row.lead, row.agentName),
    whatsapp: row.lead.whatsapp,
    tags: row.lead.tags,
    notes: row.lead.notes,
    lostReason: row.lead.lostReason,
    clientId: row.lead.clientId,
    firstResponseAt: row.lead.firstResponseAt?.toISOString() ?? null,
    wonAt: row.lead.wonAt?.toISOString() ?? null,
    lostAt: row.lead.lostAt?.toISOString() ?? null,
    requirements: reqs,
  };
}

export async function getLead(a: Auth, id: string): Promise<LeadDetail> {
  parse(uuidField, id);
  return withTenant(a.organizationId, (tx) => hydrateLead(tx, a.organizationId, id));
}

export async function createLead(a: Auth, body: unknown): Promise<LeadDetail> {
  const input = parse(leadCreate, body);
  return withTenant(a.organizationId, async (tx) => {
    const dup = await findDuplicate(tx, a.organizationId, input.phone);
    if (dup) throw duplicateError(dup);

    // An explicit assignedAgentId is the agent's own choice and always wins.
    // Otherwise, give the org's auto-assignment rules (if any) first say —
    // falling back to the existing default (assign to whoever's creating
    // the lead) when no active rule matches.
    let assignedAgentId: string | null;
    if (input.assignedAgentId) {
      assignedAgentId = await resolveAssignee(a, input.assignedAgentId, true);
    } else {
      assignedAgentId = await applyAutoAssignRule(tx, a.organizationId, input.source);
      if (!assignedAgentId) assignedAgentId = await resolveAssignee(a, undefined, true);
    }
    const [row] = await tx.insert(leads).values({
      organizationId: a.organizationId,
      fullName: input.fullName,
      phone: input.phone,
      whatsapp: input.whatsapp ?? null,
      email: input.email ?? null,
      source: input.source,
      temperature: input.temperature,
      leadType: input.leadType,
      tags: input.tags,
      notes: input.notes ?? null,
      assignedAgentId,
      createdById: a.userId,
      updatedById: a.userId,
    }).returning();
    if (!row) throw notFound('Lead');

    if (input.requirements) {
      await saveRequirements(tx, a.organizationId, { leadId: row.id }, input.requirements);
    }
    await enrollLeadInMatchingSequences(tx, a.organizationId, row.id, input.source);
    await recordAudit(tx, {
      organizationId: a.organizationId, actorId: a.userId, action: 'CREATE', entityType: 'lead', entityId: row.id,
      summary: `Created lead ${row.fullName}`,
    });
    return hydrateLead(tx, a.organizationId, row.id);
  });
}

export async function updateLead(a: Auth, id: string, body: unknown): Promise<LeadDetail> {
  parse(uuidField, id);
  const input = parse(leadUpdate, body);
  return withTenant(a.organizationId, async (tx) => {
    await requireLead(tx, a.organizationId, id);
    if (input.phone) {
      const dup = await findDuplicate(tx, a.organizationId, input.phone, id);
      if (dup) throw duplicateError(dup);
    }
    const { requirements: reqInput, ...rest } = input;
    await tx.update(leads).set({ ...rest, updatedById: a.userId }).where(eq(leads.id, id));
    if (reqInput) {
      await saveRequirements(tx, a.organizationId, { leadId: id }, reqInput);
    }
    return hydrateLead(tx, a.organizationId, id);
  });
}

export async function setLeadStatus(a: Auth, id: string, body: unknown): Promise<LeadDetail> {
  parse(uuidField, id);
  const input = parse(leadStatusInput, body);
  if (input.status === 'LOST' && !input.lostReason) {
    throw invalid({ lostReason: 'A reason is required when marking a lead as lost' });
  }
  return withTenant(a.organizationId, async (tx) => {
    const before = await requireLead(tx, a.organizationId, id);
    const update: Record<string, unknown> = { status: input.status, updatedById: a.userId };
    if (input.status === 'LOST') {
      update.lostReason = input.lostReason;
      update.lostAt = new Date();
    }
    if (input.status === 'WON') update.wonAt = new Date();
    await tx.update(leads).set(update).where(eq(leads.id, id));
    await recordAudit(tx, {
      organizationId: a.organizationId, actorId: a.userId, action: 'STATUS_CHANGE', entityType: 'lead', entityId: id,
      before: { status: before.status }, after: { status: input.status },
      summary: `Lead status changed from ${before.status} to ${input.status}`,
    });
    return hydrateLead(tx, a.organizationId, id);
  });
}

export async function logLeadContact(a: Auth, id: string, body: unknown): Promise<LeadDetail> {
  parse(uuidField, id);
  const input = parse(contactLogInput, body);
  return withTenant(a.organizationId, async (tx) => {
    await requireLead(tx, a.organizationId, id);
    await logContact(tx, a, 'Logged contact', { leadId: id }, input);
    return hydrateLead(tx, a.organizationId, id);
  });
}

export async function saveLeadRequirements(a: Auth, id: string, body: unknown): Promise<LeadDetail> {
  parse(uuidField, id);
  const input = parse(requirementsInput, body);
  return withTenant(a.organizationId, async (tx) => {
    await requireLead(tx, a.organizationId, id);
    await saveRequirements(tx, a.organizationId, { leadId: id }, input);
    return hydrateLead(tx, a.organizationId, id);
  });
}

export async function getLeadTimeline(a: Auth, id: string, query: unknown) {
  parse(uuidField, id);
  const q = parse(timelineQuery, query);
  return withTenant(a.organizationId, async (tx) => {
    await requireLead(tx, a.organizationId, id);
    return loadTimeline(tx, { leadId: id }, q);
  });
}

export async function qualifyLead(a: Auth, id: string): Promise<LeadDetail> {
  parse(uuidField, id);
  return withTenant(a.organizationId, async (tx) => {
    const lead = await requireLead(tx, a.organizationId, id);
    if (lead.clientId) throw invalid({ _root: 'Lead has already been qualified into a client' });

    const [client] = await tx.insert(clients).values({
      organizationId: a.organizationId,
      fullName: lead.fullName,
      phone: lead.phone,
      whatsapp: lead.whatsapp,
      email: lead.email,
      leadType: lead.leadType,
      tags: lead.tags,
      notes: lead.notes,
      leadId: lead.id,
      assignedAgentId: lead.assignedAgentId,
      createdById: a.userId,
      updatedById: a.userId,
    }).returning();
    if (!client) throw notFound('Client');

    await moveRequirementsToClient(tx, lead.id, client.id);
    await tx.update(leads).set({ clientId: client.id, status: 'QUALIFIED', updatedById: a.userId }).where(eq(leads.id, id));
    await recordAudit(tx, {
      organizationId: a.organizationId, actorId: a.userId, action: 'QUALIFY', entityType: 'lead', entityId: id,
      summary: `Qualified lead ${lead.fullName} into a client`,
    });
    return hydrateLead(tx, a.organizationId, id);
  });
}

export async function deleteLead(a: Auth, id: string): Promise<void> {
  parse(uuidField, id);
  await withTenant(a.organizationId, async (tx) => {
    await requireLead(tx, a.organizationId, id);
    await tx.delete(leads).where(eq(leads.id, id));
  });
}
