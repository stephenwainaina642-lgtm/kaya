import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { and, eq, inArray, asc, sql as dsql } from 'drizzle-orm';
import type { ShortlistSummary, ShortlistDetail, ShortlistItem, PublicShortlist, PublicProperty, PortalDocument } from '@kaya/shared';
import { withTenant, type Tx } from '../../db/client';
import { systemDb } from '../../db/system';
import {
  clientShortlists, shortlistItems, clients, properties, propertyImages, users, organizations,
  documents, documentSignatures,
} from '../../db/schema';
import { notFound } from '../../lib/errors';
import { parse } from '../../lib/validate';
import { type Auth, uuidField, textField, requireClient, requireProperty, agentRef } from '../crm/common';
import { recordAudit } from '../../lib/audit';

export const shortlistCreate = z.object({
  clientId: uuidField,
  title: textField(200),
});

function newShareToken(): string {
  return randomBytes(16).toString('hex');
}

async function hydrate(tx: Tx, organizationId: string, id: string): Promise<ShortlistDetail> {
  const [row] = await tx
    .select({
      id: clientShortlists.id,
      title: clientShortlists.title,
      clientId: clientShortlists.clientId,
      clientName: clients.fullName,
      shareToken: clientShortlists.shareToken,
      shareExpiresAt: clientShortlists.shareExpiresAt,
      createdAt: clientShortlists.createdAt,
    })
    .from(clientShortlists)
    .innerJoin(clients, eq(clients.id, clientShortlists.clientId))
    .where(and(eq(clientShortlists.id, id), eq(clientShortlists.organizationId, organizationId)));
  if (!row) throw notFound('Shortlist');

  const items = await tx
    .select({
      id: shortlistItems.id,
      note: shortlistItems.note,
      position: shortlistItems.position,
      propertyId: properties.id,
      reference: properties.reference,
      title2: properties.title,
      listingType: properties.listingType,
      propertyType: properties.propertyType,
      segment: properties.segment,
      price: properties.price,
      currency: properties.currency,
      location: properties.location,
      neighborhood: properties.neighborhood,
      city: properties.city,
      bedrooms: properties.bedrooms,
      bathrooms: properties.bathrooms,
      status: properties.status,
      assignedAgentId: properties.assignedAgentId,
      agentName: users.name,
    })
    .from(shortlistItems)
    .innerJoin(properties, eq(properties.id, shortlistItems.propertyId))
    .leftJoin(users, eq(users.id, properties.assignedAgentId))
    .where(eq(shortlistItems.shortlistId, id))
    .orderBy(asc(shortlistItems.position));

  const propIds = items.map((i) => i.propertyId);
  const images = propIds.length ? await tx.select().from(propertyImages).where(inArray(propertyImages.propertyId, propIds)) : [];

  const mapped: ShortlistItem[] = items.map((i) => ({
    id: i.id,
    note: i.note,
    position: i.position,
    property: {
      id: i.propertyId,
      reference: i.reference,
      title: i.title2,
      listingType: i.listingType,
      propertyType: i.propertyType,
      segment: i.segment,
      price: i.price,
      currency: i.currency,
      location: i.location,
      neighborhood: i.neighborhood,
      city: i.city,
      bedrooms: i.bedrooms,
      bathrooms: i.bathrooms,
      status: i.status,
      coverImageUrl: images.find((img) => img.propertyId === i.propertyId && img.isCover)?.url ?? images.find((img) => img.propertyId === i.propertyId)?.url ?? null,
      assignedAgent: agentRef(i.assignedAgentId, i.agentName),
    },
  }));

  return {
    id: row.id,
    title: row.title,
    clientId: row.clientId,
    clientName: row.clientName,
    itemCount: mapped.length,
    shareToken: row.shareToken,
    shareExpiresAt: row.shareExpiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    items: mapped,
  };
}

export async function listShortlistsForClient(a: Auth, clientId: string): Promise<ShortlistSummary[]> {
  parse(uuidField, clientId);
  return withTenant(a.organizationId, async (tx) => {
    await requireClient(tx, a.organizationId, clientId);
    const rows = await tx
      .select({ id: clientShortlists.id, title: clientShortlists.title, shareToken: clientShortlists.shareToken, shareExpiresAt: clientShortlists.shareExpiresAt, createdAt: clientShortlists.createdAt, clientId: clientShortlists.clientId, clientName: clients.fullName })
      .from(clientShortlists)
      .innerJoin(clients, eq(clients.id, clientShortlists.clientId))
      .where(and(eq(clientShortlists.organizationId, a.organizationId), eq(clientShortlists.clientId, clientId)));

    const counts = await tx
      .select({ shortlistId: shortlistItems.shortlistId })
      .from(shortlistItems)
      .where(inArray(shortlistItems.shortlistId, rows.map((r) => r.id)));
    const countMap = new Map<string, number>();
    for (const c of counts) countMap.set(c.shortlistId, (countMap.get(c.shortlistId) ?? 0) + 1);

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      clientId: r.clientId,
      clientName: r.clientName,
      itemCount: countMap.get(r.id) ?? 0,
      shareToken: r.shareToken,
      shareExpiresAt: r.shareExpiresAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  });
}

export async function getShortlist(a: Auth, id: string): Promise<ShortlistDetail> {
  parse(uuidField, id);
  return withTenant(a.organizationId, (tx) => hydrate(tx, a.organizationId, id));
}

export async function createShortlist(a: Auth, body: unknown): Promise<ShortlistDetail> {
  const input = parse(shortlistCreate, body);
  return withTenant(a.organizationId, async (tx) => {
    await requireClient(tx, a.organizationId, input.clientId);
    const [row] = await tx
      .insert(clientShortlists)
      .values({ organizationId: a.organizationId, clientId: input.clientId, title: input.title, shareToken: newShareToken(), createdById: a.userId, updatedById: a.userId })
      .returning({ id: clientShortlists.id });
    if (!row) throw notFound('Shortlist');
    await recordAudit(tx, { organizationId: a.organizationId, actorId: a.userId, action: 'CREATE', entityType: 'shortlist', entityId: row.id, summary: `Created shortlist "${input.title}"` });
    return hydrate(tx, a.organizationId, row.id);
  });
}

export async function addPropertyToShortlist(a: Auth, id: string, body: unknown): Promise<ShortlistDetail> {
  parse(uuidField, id);
  const input = parse(z.object({ propertyId: uuidField, note: z.string().trim().max(500).nullable().optional() }), body);
  return withTenant(a.organizationId, async (tx) => {
    const [existing] = await tx.select({ id: clientShortlists.id }).from(clientShortlists).where(and(eq(clientShortlists.id, id), eq(clientShortlists.organizationId, a.organizationId)));
    if (!existing) throw notFound('Shortlist');
    await requireProperty(tx, a.organizationId, input.propertyId);
    const [countRow] = await tx.select({ count: dsql<number>`count(*)::int` }).from(shortlistItems).where(eq(shortlistItems.shortlistId, id));
    await tx
      .insert(shortlistItems)
      .values({ shortlistId: id, propertyId: input.propertyId, note: input.note ?? null, position: countRow?.count ?? 0 })
      .onConflictDoUpdate({ target: [shortlistItems.shortlistId, shortlistItems.propertyId], set: { note: input.note ?? null } });
    return hydrate(tx, a.organizationId, id);
  });
}

export async function removePropertyFromShortlist(a: Auth, id: string, propertyId: string): Promise<ShortlistDetail> {
  parse(uuidField, id);
  parse(uuidField, propertyId);
  return withTenant(a.organizationId, async (tx) => {
    const [existing] = await tx.select({ id: clientShortlists.id }).from(clientShortlists).where(and(eq(clientShortlists.id, id), eq(clientShortlists.organizationId, a.organizationId)));
    if (!existing) throw notFound('Shortlist');
    await tx.delete(shortlistItems).where(and(eq(shortlistItems.shortlistId, id), eq(shortlistItems.propertyId, propertyId)));
    return hydrate(tx, a.organizationId, id);
  });
}

export async function deleteShortlist(a: Auth, id: string): Promise<void> {
  parse(uuidField, id);
  await withTenant(a.organizationId, async (tx) => {
    const [existing] = await tx.select({ id: clientShortlists.id }).from(clientShortlists).where(and(eq(clientShortlists.id, id), eq(clientShortlists.organizationId, a.organizationId)));
    if (!existing) throw notFound('Shortlist');
    await tx.delete(clientShortlists).where(eq(clientShortlists.id, id));
  });
}

/**
 * No-auth: resolves a public share token to its underlying shortlist row,
 * using the privileged connection since the caller has no organization
 * context yet. Shared by getPublicShortlist below and by modules/portal,
 * which reuses the same share link for viewing requests and document
 * signing — the client's whole self-service portal lives behind one token.
 */
export async function resolveShareToken(token: string): Promise<typeof clientShortlists.$inferSelect> {
  const [row] = await systemDb.select().from(clientShortlists).where(eq(clientShortlists.shareToken, token));
  if (!row) throw notFound('Shortlist');
  if (row.shareExpiresAt && row.shareExpiresAt.getTime() < Date.now()) throw notFound('Shortlist');
  return row;
}

export async function getPublicShortlist(token: string): Promise<PublicShortlist> {
  const row = await resolveShareToken(token);

  const [org] = await systemDb.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, row.organizationId));

  const items = await systemDb
    .select({
      note: shortlistItems.note,
      position: shortlistItems.position,
      title: properties.title,
      listingType: properties.listingType,
      propertyType: properties.propertyType,
      price: properties.price,
      currency: properties.currency,
      location: properties.location,
      bedrooms: properties.bedrooms,
      bathrooms: properties.bathrooms,
      propertyId: properties.id,
    })
    .from(shortlistItems)
    .innerJoin(properties, eq(properties.id, shortlistItems.propertyId))
    .where(eq(shortlistItems.shortlistId, row.id))
    .orderBy(asc(shortlistItems.position));

  const propIds = items.map((i) => i.propertyId);
  const images = propIds.length ? await systemDb.select().from(propertyImages).where(inArray(propertyImages.propertyId, propIds)) : [];

  const mapped: { property: PublicProperty; note: string | null }[] = items.map((i) => ({
    note: i.note,
    property: {
      id: i.propertyId,
      title: i.title,
      listingType: i.listingType,
      propertyType: i.propertyType,
      price: i.price,
      currency: i.currency,
      location: i.location,
      bedrooms: i.bedrooms,
      bathrooms: i.bathrooms,
      images: images.filter((img) => img.propertyId === i.propertyId).map((img) => ({ id: img.id, url: img.url, alt: img.alt, isCover: img.isCover, position: img.position })),
    },
  }));

  const docRows = await systemDb
    .select({ d: documents, signedAt: documentSignatures.signedAt })
    .from(documents)
    .leftJoin(documentSignatures, eq(documentSignatures.documentId, documents.id))
    .where(eq(documents.clientId, row.clientId));
  const portalDocuments: PortalDocument[] = docRows.map((d) => ({
    id: d.d.id,
    name: d.d.name,
    requiresSignature: d.d.requiresSignature,
    signed: d.signedAt !== null,
    signedAt: d.signedAt?.toISOString() ?? null,
  }));

  return { title: row.title, agencyName: org?.name ?? 'Kaya', items: mapped, documents: portalDocuments };
}
