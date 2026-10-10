import { z } from 'zod';
import { eq, and, desc, ilike, sql as dsql } from 'drizzle-orm';
import {
  LISTING_TYPES, PROPERTY_TYPES, SEGMENTS, FURNISHINGS, PROPERTY_STATUSES, FEATURE_KINDS,
} from '@kaya/shared';
import type { PropertyListItem, PropertyDetail, Page } from '@kaya/shared';
import { withTenant, type Tx } from '../../db/client';
import { properties, propertyImages, propertyFeatures, owners, users } from '../../db/schema';
import { notFound } from '../../lib/errors';
import { parse } from '../../lib/validate';
import { type Auth, uuidField, pagingQuery, agentRef, requireProperty } from '../crm/common';
import { recordAudit } from '../../lib/audit';

export const propertyCreate = z.object({
  reference: z.string().trim().min(1).max(40),
  title: z.string().trim().min(1).max(200),
  listingType: z.enum(LISTING_TYPES),
  propertyType: z.enum(PROPERTY_TYPES),
  segment: z.enum(SEGMENTS).default('RESIDENTIAL'),
  price: z.number().min(0),
  currency: z.string().trim().length(3).default('KES'),
  location: z.string().trim().min(1).max(200),
  neighborhood: z.string().trim().max(100).nullable().optional(),
  city: z.string().trim().min(1).max(100).default('Nairobi'),
  address: z.string().trim().max(300).nullable().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  bedrooms: z.number().int().min(0).nullable().optional(),
  bathrooms: z.number().int().min(0).nullable().optional(),
  sizeSqm: z.number().min(0).nullable().optional(),
  parkingSpaces: z.number().int().min(0).nullable().optional(),
  furnishing: z.enum(FURNISHINGS).nullable().optional(),
  availableFrom: z.string().trim().max(40).nullable().optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  videoUrl: z.string().trim().max(500).nullable().optional(),
  virtualTourUrl: z.string().trim().max(500).nullable().optional(),
  internalNotes: z.string().trim().max(2000).nullable().optional(),
  ownerId: uuidField,
  assignedAgentId: uuidField.nullable().optional(),
});

export const propertyUpdate = propertyCreate.partial().extend({
  status: z.enum(PROPERTY_STATUSES).optional(),
});

export const propertyListQuery = pagingQuery.extend({
  search: z.string().trim().max(200).optional(),
  status: z.enum(PROPERTY_STATUSES).optional(),
  listingType: z.enum(LISTING_TYPES).optional(),
  propertyType: z.enum(PROPERTY_TYPES).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  bedrooms: z.coerce.number().int().min(0).optional(),
});

export const featureInput = z.object({
  key: z.string().trim().min(1).max(60),
  label: z.string().trim().min(1).max(100),
  kind: z.enum(FEATURE_KINDS).default('AMENITY'),
});

export const imageInput = z.object({
  url: z.string().trim().min(1).max(1000),
  alt: z.string().trim().max(200).nullable().optional(),
  isCover: z.boolean().default(false),
});

function mapProperty(row: typeof properties.$inferSelect, agentName: string | null, coverImageUrl: string | null): PropertyListItem {
  return {
    id: row.id,
    reference: row.reference,
    title: row.title,
    listingType: row.listingType,
    propertyType: row.propertyType,
    segment: row.segment,
    price: row.price,
    currency: row.currency,
    location: row.location,
    neighborhood: row.neighborhood,
    city: row.city,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    status: row.status,
    coverImageUrl,
    assignedAgent: agentRef(row.assignedAgentId, agentName),
  };
}

export async function listProperties(a: Auth, query: unknown): Promise<Page<PropertyListItem>> {
  const q = parse(propertyListQuery, query);
  return withTenant(a.organizationId, async (tx) => {
    const conds = [eq(properties.organizationId, a.organizationId)];
    if (q.status) conds.push(eq(properties.status, q.status));
    if (q.listingType) conds.push(eq(properties.listingType, q.listingType));
    if (q.propertyType) conds.push(eq(properties.propertyType, q.propertyType));
    if (q.bedrooms !== undefined) conds.push(eq(properties.bedrooms, q.bedrooms));
    if (q.search) conds.push(ilike(properties.title, `%${q.search}%`));
    const where = and(...conds);

    const rows = await tx
      .select({ p: properties, agentName: users.name })
      .from(properties)
      .leftJoin(users, eq(users.id, properties.assignedAgentId))
      .where(where)
      .orderBy(desc(properties.createdAt))
      .limit(q.pageSize).offset((q.page - 1) * q.pageSize);

    const [totalRow] = await tx.select({ count: dsql<number>`count(*)::int` }).from(properties).where(where);

    const items = await Promise.all(rows.map(async (r) => {
      const [cover] = await tx.select({ url: propertyImages.url }).from(propertyImages)
        .where(and(eq(propertyImages.propertyId, r.p.id), eq(propertyImages.isCover, true)));
      return mapProperty(r.p, r.agentName, cover?.url ?? null);
    }));

    return { items, total: totalRow?.count ?? 0, page: q.page, pageSize: q.pageSize };
  });
}

async function hydrate(tx: Tx, organizationId: string, id: string): Promise<PropertyDetail> {
  const [row] = await tx
    .select({ p: properties, agentName: users.name })
    .from(properties)
    .leftJoin(users, eq(users.id, properties.assignedAgentId))
    .where(and(eq(properties.id, id), eq(properties.organizationId, organizationId)));
  if (!row) throw notFound('Property');

  const images = await tx.select().from(propertyImages).where(eq(propertyImages.propertyId, id)).orderBy(propertyImages.position);
  const features = await tx.select().from(propertyFeatures).where(eq(propertyFeatures.propertyId, id));
  const cover = images.find((i) => i.isCover) ?? images[0] ?? null;

  return {
    ...mapProperty(row.p, row.agentName, cover?.url ?? null),
    address: row.p.address,
    lat: row.p.lat,
    lng: row.p.lng,
    sizeSqm: row.p.sizeSqm,
    parkingSpaces: row.p.parkingSpaces,
    furnishing: row.p.furnishing,
    availableFrom: row.p.availableFrom,
    description: row.p.description,
    videoUrl: row.p.videoUrl,
    virtualTourUrl: row.p.virtualTourUrl,
    internalNotes: row.p.internalNotes,
    ownerId: row.p.ownerId,
    images: images.map((i) => ({ id: i.id, url: i.url, alt: i.alt, isCover: i.isCover, position: i.position })),
    features: features.map((f) => ({ id: f.id, key: f.key, label: f.label, kind: f.kind })),
    listedAt: row.p.listedAt?.toISOString() ?? null,
  };
}

export async function getProperty(a: Auth, id: string): Promise<PropertyDetail> {
  parse(uuidField, id);
  return withTenant(a.organizationId, (tx) => hydrate(tx, a.organizationId, id));
}

export async function createProperty(a: Auth, body: unknown): Promise<PropertyDetail> {
  const input = parse(propertyCreate, body);
  return withTenant(a.organizationId, async (tx) => {
    const [owner] = await tx.select({ id: owners.id }).from(owners).where(and(eq(owners.id, input.ownerId), eq(owners.organizationId, a.organizationId)));
    if (!owner) throw notFound('Owner');

    const [row] = await tx.insert(properties).values({
      organizationId: a.organizationId,
      reference: input.reference,
      title: input.title,
      listingType: input.listingType,
      propertyType: input.propertyType,
      segment: input.segment,
      price: input.price,
      currency: input.currency,
      location: input.location,
      neighborhood: input.neighborhood ?? null,
      city: input.city,
      address: input.address ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      bedrooms: input.bedrooms ?? null,
      bathrooms: input.bathrooms ?? null,
      sizeSqm: input.sizeSqm ?? null,
      parkingSpaces: input.parkingSpaces ?? null,
      furnishing: input.furnishing ?? null,
      availableFrom: input.availableFrom ?? null,
      description: input.description ?? null,
      videoUrl: input.videoUrl ?? null,
      virtualTourUrl: input.virtualTourUrl ?? null,
      internalNotes: input.internalNotes ?? null,
      ownerId: input.ownerId,
      assignedAgentId: input.assignedAgentId ?? a.userId,
      listedAt: new Date(),
      createdById: a.userId,
      updatedById: a.userId,
    }).returning();
    if (!row) throw notFound('Property');

    await recordAudit(tx, {
      organizationId: a.organizationId, actorId: a.userId, action: 'CREATE', entityType: 'property', entityId: row.id,
      summary: `Listed property ${row.title}`,
    });
    return hydrate(tx, a.organizationId, row.id);
  });
}

export async function updateProperty(a: Auth, id: string, body: unknown): Promise<PropertyDetail> {
  parse(uuidField, id);
  const input = parse(propertyUpdate, body);
  return withTenant(a.organizationId, async (tx) => {
    await requireProperty(tx, a.organizationId, id);
    await tx.update(properties).set({ ...input, updatedById: a.userId }).where(eq(properties.id, id));
    return hydrate(tx, a.organizationId, id);
  });
}

export async function deleteProperty(a: Auth, id: string): Promise<void> {
  parse(uuidField, id);
  await withTenant(a.organizationId, async (tx) => {
    await requireProperty(tx, a.organizationId, id);
    await tx.delete(properties).where(eq(properties.id, id));
  });
}

export async function addImage(a: Auth, id: string, body: unknown): Promise<PropertyDetail> {
  parse(uuidField, id);
  const input = parse(imageInput, body);
  return withTenant(a.organizationId, async (tx) => {
    await requireProperty(tx, a.organizationId, id);
    if (input.isCover) {
      await tx.update(propertyImages).set({ isCover: false }).where(eq(propertyImages.propertyId, id));
    }
    const [row] = await tx.select({ count: dsql<number>`count(*)::int` }).from(propertyImages).where(eq(propertyImages.propertyId, id));
    await tx.insert(propertyImages).values({ propertyId: id, url: input.url, alt: input.alt ?? null, isCover: input.isCover, position: row?.count ?? 0 });
    return hydrate(tx, a.organizationId, id);
  });
}

export async function removeImage(a: Auth, id: string, imageId: string): Promise<PropertyDetail> {
  parse(uuidField, id);
  parse(uuidField, imageId);
  return withTenant(a.organizationId, async (tx) => {
    await requireProperty(tx, a.organizationId, id);
    await tx.delete(propertyImages).where(and(eq(propertyImages.id, imageId), eq(propertyImages.propertyId, id)));
    return hydrate(tx, a.organizationId, id);
  });
}

export async function addFeature(a: Auth, id: string, body: unknown): Promise<PropertyDetail> {
  parse(uuidField, id);
  const input = parse(featureInput, body);
  return withTenant(a.organizationId, async (tx) => {
    await requireProperty(tx, a.organizationId, id);
    await tx.insert(propertyFeatures).values({ propertyId: id, key: input.key, label: input.label, kind: input.kind })
      .onConflictDoUpdate({ target: [propertyFeatures.propertyId, propertyFeatures.key], set: { label: input.label, kind: input.kind } });
    return hydrate(tx, a.organizationId, id);
  });
}

export async function removeFeature(a: Auth, id: string, featureId: string): Promise<PropertyDetail> {
  parse(uuidField, id);
  parse(uuidField, featureId);
  return withTenant(a.organizationId, async (tx) => {
    await requireProperty(tx, a.organizationId, id);
    await tx.delete(propertyFeatures).where(and(eq(propertyFeatures.id, featureId), eq(propertyFeatures.propertyId, id)));
    return hydrate(tx, a.organizationId, id);
  });
}
