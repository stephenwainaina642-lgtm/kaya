import { z } from 'zod';
import { and, desc, eq, sql as dsql, type SQL } from 'drizzle-orm';
import { MAINTENANCE_CATEGORIES, MAINTENANCE_PRIORITIES, MAINTENANCE_STATUSES } from '@kaya/shared';
import type { MaintenanceItem, MaintenanceStatus } from '@kaya/shared';
import { withTenant, type Tx } from '../../db/client';
import { clients, maintenanceRequests as m, properties, users } from '../../db/schema';
import { notFound } from '../../lib/errors';
import { parse } from '../../lib/validate';
import { recordAudit } from '../../lib/audit';
import { type Auth, uuidField } from '../crm/common';

const cost = z.number().int().min(0).max(100_000_000);
const text = (max: number) => z.string().trim().max(max);

const createInput = z.object({
  propertyId: uuidField,
  tenantId: uuidField.nullable().optional(),
  title: text(140).min(2),
  description: text(2000).nullable().optional(),
  category: z.enum(MAINTENANCE_CATEGORIES).default('OTHER'),
  priority: z.enum(MAINTENANCE_PRIORITIES).default('MEDIUM'),
  assignedToId: uuidField.nullable().optional(),
  vendorName: text(120).nullable().optional(),
  vendorPhone: text(30).nullable().optional(),
  estimatedCost: cost.nullable().optional(),
});

// Everything but the property can change later; a request belongs to one property for life.
const updateInput = createInput.omit({ propertyId: true }).partial().extend({
  status: z.enum(MAINTENANCE_STATUSES).optional(),
  actualCost: cost.nullable().optional(),
  chargeToLandlord: z.boolean().optional(),
});

const severity = dsql`CASE ${m.priority} WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END`;
const openFirst = dsql`CASE ${m.status} WHEN 'OPEN' THEN 0 WHEN 'IN_PROGRESS' THEN 1 ELSE 2 END`;

function select(tx: Tx) {
  return tx.select({
    id: m.id, propertyId: m.propertyId, propertyTitle: properties.title,
    tenantId: m.tenantId, tenantName: clients.fullName,
    title: m.title, description: m.description, category: m.category, priority: m.priority, status: m.status,
    assignedToId: m.assignedToId, assignedToName: users.name,
    vendorName: m.vendorName, vendorPhone: m.vendorPhone,
    estimatedCost: m.estimatedCost, actualCost: m.actualCost, chargeToLandlord: m.chargeToLandlord,
    resolvedAt: m.resolvedAt, createdAt: m.createdAt,
  })
    .from(m)
    .innerJoin(properties, eq(properties.id, m.propertyId))
    .leftJoin(clients, eq(clients.id, m.tenantId))
    .leftJoin(users, eq(users.id, m.assignedToId));
}

type Row = Awaited<ReturnType<ReturnType<typeof select>['limit']>>[number];
const toItem = (r: Row): MaintenanceItem => ({
  ...r,
  category: r.category as MaintenanceItem['category'],
  priority: r.priority as MaintenanceItem['priority'],
  status: r.status as MaintenanceStatus,
  resolvedAt: r.resolvedAt?.toISOString() ?? null,
  createdAt: r.createdAt.toISOString(),
});

export async function listMaintenance(a: Auth, query: { status?: string; propertyId?: string }): Promise<MaintenanceItem[]> {
  const conds: SQL[] = [];
  if (query.status && (MAINTENANCE_STATUSES as readonly string[]).includes(query.status)) conds.push(eq(m.status, query.status));
  if (query.propertyId) conds.push(eq(m.propertyId, parse(uuidField, query.propertyId)));
  return withTenant(a.organizationId, async (tx) => {
    const rows = await select(tx).where(conds.length ? and(...conds) : undefined).orderBy(openFirst, severity, desc(m.createdAt)).limit(300);
    return rows.map(toItem);
  });
}

async function assertRefs(tx: Tx, input: { propertyId?: string; tenantId?: string | null; assignedToId?: string | null }) {
  if (input.propertyId) {
    const [p] = await tx.select({ id: properties.id }).from(properties).where(eq(properties.id, input.propertyId));
    if (!p) throw notFound('Property');
  }
  if (input.tenantId) {
    const [c] = await tx.select({ id: clients.id }).from(clients).where(eq(clients.id, input.tenantId));
    if (!c) throw notFound('Tenant');
  }
  if (input.assignedToId) {
    const [u] = await tx.select({ id: users.id }).from(users).where(eq(users.id, input.assignedToId));
    if (!u) throw notFound('User');
  }
}

export async function createMaintenance(a: Auth, body: unknown): Promise<MaintenanceItem> {
  const input = parse(createInput, body);
  return withTenant(a.organizationId, async (tx) => {
    await assertRefs(tx, input);
    const [row] = await tx.insert(m).values({
      organizationId: a.organizationId, ...input,
      tenantId: input.tenantId ?? null, description: input.description || null,
      assignedToId: input.assignedToId ?? null, vendorName: input.vendorName || null, vendorPhone: input.vendorPhone || null,
      estimatedCost: input.estimatedCost ?? null, createdById: a.userId,
    }).returning({ id: m.id });
    await recordAudit(tx, {
      organizationId: a.organizationId, actorId: a.userId, action: 'CREATE', entityType: 'maintenance', entityId: row!.id,
      summary: `Logged ${input.priority.toLowerCase()} repair: ${input.title}`,
    });
    const [item] = await select(tx).where(eq(m.id, row!.id));
    return toItem(item!);
  });
}

export async function updateMaintenance(a: Auth, id: string, body: unknown): Promise<MaintenanceItem> {
  parse(uuidField, id);
  const input = parse(updateInput, body);
  return withTenant(a.organizationId, async (tx) => {
    const [current] = await tx.select().from(m).where(eq(m.id, id)).for('update');
    if (!current) throw notFound('Maintenance request');
    await assertRefs(tx, input);

    const patch: Partial<typeof m.$inferInsert> = { updatedAt: new Date() };
    for (const k of ['title', 'category', 'priority', 'assignedToId', 'tenantId', 'estimatedCost', 'actualCost', 'chargeToLandlord'] as const) {
      if (input[k] !== undefined) (patch as Record<string, unknown>)[k] = input[k];
    }
    for (const k of ['description', 'vendorName', 'vendorPhone'] as const) {
      if (input[k] !== undefined) patch[k] = input[k] || null;
    }
    if (input.status && input.status !== current.status) {
      patch.status = input.status;
      // Finished work is stamped once; reopening clears it so a later finish gets its own date.
      patch.resolvedAt = input.status === 'DONE' ? new Date() : null;
    }
    await tx.update(m).set(patch).where(eq(m.id, id));
    await recordAudit(tx, {
      organizationId: a.organizationId, actorId: a.userId, action: 'UPDATE', entityType: 'maintenance', entityId: id,
      summary: input.status && input.status !== current.status ? `Repair marked ${input.status.toLowerCase().replace('_', ' ')}: ${current.title}` : `Updated repair: ${current.title}`,
    });
    const [item] = await select(tx).where(eq(m.id, id));
    return toItem(item!);
  });
}

export async function deleteMaintenance(a: Auth, id: string): Promise<void> {
  parse(uuidField, id);
  await withTenant(a.organizationId, async (tx) => {
    const [row] = await tx.delete(m).where(eq(m.id, id)).returning({ title: m.title });
    if (!row) throw notFound('Maintenance request');
    await recordAudit(tx, {
      organizationId: a.organizationId, actorId: a.userId, action: 'DELETE', entityType: 'maintenance', entityId: id, summary: `Deleted repair: ${row.title}`,
    });
  });
}
