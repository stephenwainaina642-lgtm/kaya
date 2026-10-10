import { and, eq, inArray } from 'drizzle-orm';
import type { MatchScore, PropertyMatch, PropertyMatchPage, PersonMatch, PersonMatchPage } from '@kaya/shared';
import { withTenant, type Tx } from '../../db/client';
import { properties, propertyImages, propertyFeatures, users, leads, clients, requirements, clientPropertyMatches } from '../../db/schema';
import { type Auth, pagingQuery, pageWindow, agentRef } from '../crm/common';
import { getRequirements, type RequirementsInput } from '../crm/requirements';
import { z } from 'zod';

type Verdict = 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';

function verdictFor(total: number): Verdict {
  if (total >= 85) return 'EXCELLENT';
  if (total >= 65) return 'GOOD';
  if (total >= 40) return 'FAIR';
  return 'POOR';
}

/** Scores a single property against a set of requirements. Each sub-score is 0-100. */
export function scoreMatch(
  req: Pick<RequirementsInput, 'budgetMin' | 'budgetMax' | 'locations' | 'bedroomsMin' | 'propertyTypes' | 'amenities'>,
  property: {
    price: number;
    location: string;
    neighborhood: string | null;
    city: string;
    bedrooms: number | null;
    propertyType: string;
    featureKeys: string[];
  },
): MatchScore {
  // Budget: 100 if within range; degrades the further outside the band.
  let budget = 100;
  if (req.budgetMin != null || req.budgetMax != null) {
    const min = req.budgetMin ?? 0;
    const max = req.budgetMax ?? Infinity;
    if (property.price < min) {
      const gap = min === 0 ? 1 : (min - property.price) / min;
      budget = Math.max(0, 100 - gap * 150);
    } else if (property.price > max) {
      const gap = max === Infinity ? 0 : (property.price - max) / max;
      budget = Math.max(0, 100 - gap * 150);
    }
  }

  // Location: match against location/neighborhood/city text.
  let location = 100;
  if (req.locations.length > 0) {
    const haystack = [property.location, property.neighborhood, property.city]
      .filter(Boolean)
      .map((s) => s!.toLowerCase());
    const hit = req.locations.some((l) => haystack.some((h) => h.includes(l.toLowerCase()) || l.toLowerCase().includes(h)));
    location = hit ? 100 : 20;
  }

  // Bedrooms: meets-or-exceeds minimum scores full; shortfall degrades per room.
  let bedrooms = 100;
  if (req.bedroomsMin != null) {
    if (property.bedrooms == null) bedrooms = 50;
    else if (property.bedrooms >= req.bedroomsMin) bedrooms = 100;
    else bedrooms = Math.max(0, 100 - (req.bedroomsMin - property.bedrooms) * 35);
  }

  // Property type: exact match or no preference.
  let propertyType = 100;
  if (req.propertyTypes.length > 0) {
    propertyType = req.propertyTypes.includes(property.propertyType as never) ? 100 : 15;
  }

  // Amenities: proportion of requested amenities present.
  let amenities = 100;
  if (req.amenities.length > 0) {
    const have = new Set(property.featureKeys.map((k) => k.toLowerCase()));
    const matched = req.amenities.filter((a) => have.has(a.toLowerCase())).length;
    amenities = Math.round((matched / req.amenities.length) * 100);
  }

  const total = Math.round(budget * 0.35 + location * 0.25 + bedrooms * 0.15 + propertyType * 0.15 + amenities * 0.1);

  return { total, budget: Math.round(budget), location: Math.round(location), bedrooms: Math.round(bedrooms), propertyType: Math.round(propertyType), amenities: Math.round(amenities) };
}

async function activePropertiesWithFeatures(tx: Tx, organizationId: string) {
  const rows = await tx
    .select({
      id: properties.id,
      reference: properties.reference,
      title: properties.title,
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
    .from(properties)
    .leftJoin(users, eq(users.id, properties.assignedAgentId))
    .where(and(eq(properties.organizationId, organizationId), eq(properties.status, 'AVAILABLE')));

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const [images, features] = await Promise.all([
    tx.select().from(propertyImages).where(inArray(propertyImages.propertyId, ids)),
    tx.select().from(propertyFeatures).where(inArray(propertyFeatures.propertyId, ids)),
  ]);

  return rows.map((r) => ({
    row: r,
    coverUrl: images.find((i) => i.propertyId === r.id && i.isCover)?.url ?? images.find((i) => i.propertyId === r.id)?.url ?? null,
    featureKeys: features.filter((f) => f.propertyId === r.id).map((f) => f.key),
  }));
}

function toListItem(r: Awaited<ReturnType<typeof activePropertiesWithFeatures>>[number]) {
  return {
    id: r.row.id,
    reference: r.row.reference,
    title: r.row.title,
    listingType: r.row.listingType,
    propertyType: r.row.propertyType,
    segment: r.row.segment,
    price: r.row.price,
    currency: r.row.currency,
    location: r.row.location,
    neighborhood: r.row.neighborhood,
    city: r.row.city,
    bedrooms: r.row.bedrooms,
    bathrooms: r.row.bathrooms,
    status: r.row.status,
    coverImageUrl: r.coverUrl,
    assignedAgent: agentRef(r.row.assignedAgentId, r.row.agentName),
  };
}

export const matchQuery = pagingQuery.extend({ minScore: z.coerce.number().min(0).max(100).default(0) });

export async function matchPropertiesForContact(
  a: Auth,
  ref: { leadId?: string; clientId?: string },
  query: unknown,
): Promise<PropertyMatchPage> {
  const q = matchQuery.parse(query);
  return withTenant(a.organizationId, async (tx) => {
    const req = await getRequirements(tx, ref);
    const candidates = await activePropertiesWithFeatures(tx, a.organizationId);

    let dismissedIds = new Set<string>();
    let savedScores = new Map<string, number>();
    if (ref.clientId) {
      const saved = await tx.select().from(clientPropertyMatches).where(eq(clientPropertyMatches.clientId, ref.clientId));
      dismissedIds = new Set(saved.filter((s) => s.dismissed).map((s) => s.propertyId));
    }

    const scored: PropertyMatch[] = candidates
      .filter((c) => !dismissedIds.has(c.row.id))
      .map((c) => {
        const score = req
          ? scoreMatch(req, { price: c.row.price, location: c.row.location, neighborhood: c.row.neighborhood, city: c.row.city, bedrooms: c.row.bedrooms, propertyType: c.row.propertyType, featureKeys: c.featureKeys })
          : { total: 0, budget: 0, location: 0, bedrooms: 0, propertyType: 0, amenities: 0 };
        return { property: toListItem(c), score, verdict: verdictFor(score.total), dismissed: false };
      })
      .filter((m) => m.score.total >= q.minScore)
      .sort((x, y) => y.score.total - x.score.total);

    const { limit, offset } = pageWindow(q);
    return { items: scored.slice(offset, offset + limit), total: scored.length };
  });
}

export async function matchPeopleForProperty(a: Auth, propertyId: string, query: unknown): Promise<PersonMatchPage> {
  const q = matchQuery.parse(query);
  return withTenant(a.organizationId, async (tx) => {
    const [prop] = await tx.select().from(properties).where(and(eq(properties.id, propertyId), eq(properties.organizationId, a.organizationId)));
    if (!prop) return { items: [], total: 0 };
    const features = await tx.select().from(propertyFeatures).where(eq(propertyFeatures.propertyId, propertyId));
    const featureKeys = features.map((f) => f.key);

    const [leadRows, clientRows] = await Promise.all([
      tx.select({ id: leads.id, name: leads.fullName }).from(leads).where(and(eq(leads.organizationId, a.organizationId))),
      tx.select({ id: clients.id, name: clients.fullName }).from(clients).where(and(eq(clients.organizationId, a.organizationId))),
    ]);

    const reqRows = await tx.select().from(requirements).where(eq(requirements.organizationId, a.organizationId));
    const byLead = new Map(reqRows.filter((r) => r.leadId).map((r) => [r.leadId as string, r]));
    const byClient = new Map(reqRows.filter((r) => r.clientId).map((r) => [r.clientId as string, r]));

    const items: PersonMatch[] = [];
    for (const l of leadRows) {
      const r = byLead.get(l.id);
      if (!r) continue;
      const score = scoreMatch(
        { budgetMin: r.budgetMin, budgetMax: r.budgetMax, locations: r.locations, bedroomsMin: r.bedroomsMin, propertyTypes: r.propertyTypes, amenities: r.amenities },
        { price: prop.price, location: prop.location, neighborhood: prop.neighborhood, city: prop.city, bedrooms: prop.bedrooms, propertyType: prop.propertyType, featureKeys },
      );
      if (score.total >= q.minScore) items.push({ contact: { kind: 'lead', id: l.id, name: l.name }, score, verdict: verdictFor(score.total) });
    }
    for (const c of clientRows) {
      const r = byClient.get(c.id);
      if (!r) continue;
      const score = scoreMatch(
        { budgetMin: r.budgetMin, budgetMax: r.budgetMax, locations: r.locations, bedroomsMin: r.bedroomsMin, propertyTypes: r.propertyTypes, amenities: r.amenities },
        { price: prop.price, location: prop.location, neighborhood: prop.neighborhood, city: prop.city, bedrooms: prop.bedrooms, propertyType: prop.propertyType, featureKeys },
      );
      if (score.total >= q.minScore) items.push({ contact: { kind: 'client', id: c.id, name: c.name }, score, verdict: verdictFor(score.total) });
    }

    items.sort((x, y) => y.score.total - x.score.total);
    const { limit, offset } = pageWindow(q);
    return { items: items.slice(offset, offset + limit), total: items.length };
  });
}

export async function dismissMatch(a: Auth, clientId: string, propertyId: string): Promise<void> {
  await withTenant(a.organizationId, async (tx) => {
    const existing = await tx.select({ id: clientPropertyMatches.id }).from(clientPropertyMatches).where(and(eq(clientPropertyMatches.clientId, clientId), eq(clientPropertyMatches.propertyId, propertyId)));
    if (existing[0]) {
      await tx.update(clientPropertyMatches).set({ dismissed: true }).where(eq(clientPropertyMatches.id, existing[0].id));
    } else {
      await tx.insert(clientPropertyMatches).values({ organizationId: a.organizationId, clientId, propertyId, score: 0, breakdown: {}, dismissed: true });
    }
  });
}

export async function undismissMatch(a: Auth, clientId: string, propertyId: string): Promise<void> {
  await withTenant(a.organizationId, async (tx) => {
    await tx.update(clientPropertyMatches).set({ dismissed: false }).where(and(eq(clientPropertyMatches.clientId, clientId), eq(clientPropertyMatches.propertyId, propertyId)));
  });
}
