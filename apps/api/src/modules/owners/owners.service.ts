import { z } from 'zod';
import { eq, and, desc, ilike, or, sql as dsql } from 'drizzle-orm';
import { COMMISSION_ARRANGEMENTS, COMM_CHANNELS } from '@kaya/shared';
import type { OwnerListItem, OwnerDetail, Page } from '@kaya/shared';
import { withTenant, type Tx } from '../../db/client';
import { owners, properties, activities, communications } from '../../db/schema';
import { notFound } from '../../lib/errors';
import { parse } from '../../lib/validate';
import { type Auth, uuidField, pagingQuery } from '../crm/common';

export const ownerCreate = z.object({
  fullName: z.string().trim().max(200).nullable().optional(),
  companyName: z.string().trim().max(200).nullable().optional(),
  phone: z.string().trim().min(5).max(30),
  email: z.string().email().nullable().optional(),
  whatsapp: z.string().trim().max(30).nullable().optional(),
  agreementType: z.string().trim().max(100).nullable().optional(),
  agreementStart: z.string().trim().max(40).nullable().optional(),
  agreementEnd: z.string().trim().max(40).nullable().optional(),
  commissionArrangement: z.enum(COMMISSION_ARRANGEMENTS).nullable().optional(),
  commissionRate: z.number().min(0).max(100).nullable().optional(),
  commissionFixedAmount: z.number().min(0).nullable().optional(),
  agreementNotes: z.string().trim().max(2000).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const ownerUpdate = ownerCreate.partial();

export const ownerListQuery = pagingQuery.extend({
  search: z.string().trim().max(200).optional(),
});

export const ownerContactLogInput = z.object({
  channel: z.enum(COMM_CHANNELS),
  inbound: z.boolean().default(false),
  body: z.string().trim().max(5000).nullable().default(null),
});

function mapOwner(row: typeof owners.$inferSelect, propertyCount: number): OwnerListItem {
  return {
    id: row.id,
    fullName: row.fullName,
    companyName: row.companyName,
    phone: row.phone,
    email: row.email,
    propertyCount,
  };
}

async function propertyCountFor(tx: Tx, ownerId: string): Promise<number> {
  const [row] = await tx.select({ count: dsql<number>`count(*)::int` }).from(properties).where(eq(properties.ownerId, ownerId));
  return row?.count ?? 0;
}

export async function listOwners(a: Auth, query: unknown): Promise<Page<OwnerListItem>> {
  const q = parse(ownerListQuery, query);
  return withTenant(a.organizationId, async (tx) => {
    const conds = [eq(owners.organizationId, a.organizationId)];
    if (q.search) {
      conds.push(or(ilike(owners.fullName, `%${q.search}%`), ilike(owners.companyName, `%${q.search}%`), ilike(owners.phone, `%${q.search}%`))!);
    }
    const where = and(...conds);
    const rows = await tx.select().from(owners).where(where).orderBy(desc(owners.createdAt)).limit(q.pageSize).offset((q.page - 1) * q.pageSize);
    const [totalRow] = await tx.select({ count: dsql<number>`count(*)::int` }).from(owners).where(where);
    const items = await Promise.all(rows.map(async (r) => mapOwner(r, await propertyCountFor(tx, r.id))));
    return { items, total: totalRow?.count ?? 0, page: q.page, pageSize: q.pageSize };
  });
}

async function hydrate(tx: Tx, organizationId: string, id: string): Promise<OwnerDetail> {
  const [row] = await tx.select().from(owners).where(and(eq(owners.id, id), eq(owners.organizationId, organizationId)));
  if (!row) throw notFound('Owner');
  return {
    ...mapOwner(row, await propertyCountFor(tx, id)),
    whatsapp: row.whatsapp,
    agreementType: row.agreementType,
    agreementStart: row.agreementStart,
    agreementEnd: row.agreementEnd,
    commissionArrangement: row.commissionArrangement,
    commissionRate: row.commissionRate,
    commissionFixedAmount: row.commissionFixedAmount,
    agreementNotes: row.agreementNotes,
    notes: row.notes,
  };
}

export async function getOwner(a: Auth, id: string): Promise<OwnerDetail> {
  parse(uuidField, id);
  return withTenant(a.organizationId, (tx) => hydrate(tx, a.organizationId, id));
}

export async function requireOwner(tx: Tx, organizationId: string, id: string) {
  const [row] = await tx.select().from(owners).where(and(eq(owners.id, id), eq(owners.organizationId, organizationId)));
  if (!row) throw notFound('Owner');
  return row;
}

export async function createOwner(a: Auth, body: unknown): Promise<OwnerDetail> {
  const input = parse(ownerCreate, body);
  return withTenant(a.organizationId, async (tx) => {
    const [row] = await tx.insert(owners).values({
      organizationId: a.organizationId,
      ...input,
      createdById: a.userId,
      updatedById: a.userId,
    }).returning();
    if (!row) throw notFound('Owner');
    return hydrate(tx, a.organizationId, row.id);
  });
}

export async function updateOwner(a: Auth, id: string, body: unknown): Promise<OwnerDetail> {
  parse(uuidField, id);
  const input = parse(ownerUpdate, body);
  return withTenant(a.organizationId, async (tx) => {
    await requireOwner(tx, a.organizationId, id);
    await tx.update(owners).set({ ...input, updatedById: a.userId }).where(eq(owners.id, id));
    return hydrate(tx, a.organizationId, id);
  });
}

export async function deleteOwner(a: Auth, id: string): Promise<void> {
  parse(uuidField, id);
  await withTenant(a.organizationId, async (tx) => {
    await requireOwner(tx, a.organizationId, id);
    await tx.delete(owners).where(eq(owners.id, id));
  });
}

export async function logOwnerContact(a: Auth, id: string, body: unknown): Promise<OwnerDetail> {
  parse(uuidField, id);
  const input = parse(ownerContactLogInput, body);
  return withTenant(a.organizationId, async (tx) => {
    const owner = await requireOwner(tx, a.organizationId, id);
    const occurredAt = new Date();
    await tx.insert(communications).values({
      organizationId: a.organizationId,
      channel: input.channel,
      direction: input.inbound ? 'INBOUND' : 'OUTBOUND',
      subject: 'Logged contact',
      body: input.body,
      occurredAt,
      ownerId: id,
      userId: a.userId,
    });
    await tx.insert(activities).values({
      organizationId: a.organizationId,
      type: input.channel,
      title: `Contacted owner ${owner.fullName ?? owner.companyName ?? ''}`.trim(),
      body: input.body,
      actorId: a.userId,
      occurredAt,
    });
    return hydrate(tx, a.organizationId, id);
  });
}
