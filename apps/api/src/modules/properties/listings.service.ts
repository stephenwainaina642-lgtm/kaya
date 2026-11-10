import { eq, and, desc, sql as dsql } from 'drizzle-orm';
import type { PublicListings, PublicListingCard, PublicListingDetail } from '@kaya/shared';
import { systemDb } from '../../db/system';
import { withTenant } from '../../db/client';
import { organizations, properties, propertyImages, propertyFeatures, users } from '../../db/schema';
import { notFound } from '../../lib/errors';
import { toPublicLogoUrl } from '../../lib/branding';

async function agencyBySlug(slug: string) {
  const [org] = await systemDb.select().from(organizations).where(eq(organizations.slug, slug));
  if (!org || org.suspendedAt) throw notFound('Agency');
  return org;
}

const agencyView = (org: typeof organizations.$inferSelect): PublicListings['agency'] => ({
  name: org.name, slug: org.slug, logoUrl: toPublicLogoUrl(org.slug, org.logoUrl), brandColor: org.brandColor, phone: org.phone ?? null,
});

// A unit with an active lease is taken, whatever its status flag says.
export const notLeased = dsql`not exists (select 1 from leases l where l.property_id = ${properties.id} and l.status = 'ACTIVE')`;

const live = (orgId: string) => and(
  eq(properties.organizationId, orgId), eq(properties.advertised, true), eq(properties.status, 'AVAILABLE'), notLeased,
);

/** Only units the agency opted in (advertised) and that are still available; never owner, notes or internal data. */
export async function getPublicListings(slug: string): Promise<PublicListings> {
  const org = await agencyBySlug(slug);
  const items = await withTenant(org.id, async (tx) => {
    const rows = await tx.select().from(properties).where(live(org.id)).orderBy(desc(properties.listedAt)).limit(200);
    return Promise.all(rows.map(async (p): Promise<PublicListingCard> => {
      const [cover] = await tx.select({ url: propertyImages.url }).from(propertyImages)
        .where(and(eq(propertyImages.propertyId, p.id), eq(propertyImages.isCover, true)));
      return {
        id: p.id, title: p.title, listingType: p.listingType, propertyType: p.propertyType, price: p.price, currency: p.currency,
        location: p.location, city: p.city, bedrooms: p.bedrooms, bathrooms: p.bathrooms, building: p.building,
        coverImageUrl: cover?.url ?? null,
      };
    }));
  });
  return { agency: agencyView(org), items };
}

export async function getPublicListing(slug: string, id: string): Promise<PublicListingDetail> {
  const org = await agencyBySlug(slug);
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound('Listing');
  return withTenant(org.id, async (tx) => {
    const [row] = await tx.select({ p: properties, agentName: users.name }).from(properties)
      .leftJoin(users, eq(users.id, properties.assignedAgentId))
      .where(and(live(org.id), eq(properties.id, id)));
    if (!row) throw notFound('Listing');
    const p = row.p;
    const images = await tx.select().from(propertyImages).where(eq(propertyImages.propertyId, id)).orderBy(propertyImages.position);
    const features = await tx.select().from(propertyFeatures).where(eq(propertyFeatures.propertyId, id));
    const cover = images.find((i) => i.isCover) ?? images[0];
    return {
      id: p.id, title: p.title, listingType: p.listingType, propertyType: p.propertyType, price: p.price, currency: p.currency,
      location: p.location, city: p.city, bedrooms: p.bedrooms, bathrooms: p.bathrooms, building: p.building,
      coverImageUrl: cover?.url ?? null,
      description: p.description, sizeSqm: p.sizeSqm, parkingSpaces: p.parkingSpaces, furnishing: p.furnishing, availableFrom: p.availableFrom,
      images: images.map((i) => ({ url: i.url, alt: i.alt })), features: features.map((f) => ({ label: f.label })),
      agent: row.agentName ? { name: row.agentName.split(' ')[0]! } : null,
      agency: agencyView(org),
    };
  });
}
