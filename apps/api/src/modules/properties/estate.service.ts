import { z } from 'zod';
import { eq, and, inArray, isNotNull, lt, ne, sql as dsql } from 'drizzle-orm';
import { LISTING_TYPES, PROPERTY_TYPES } from '@kaya/shared';
import type { BuildingSummary, BuildingDetail, PropertyNetwork, NetworkContact, PropertyDetail } from '@kaya/shared';
import { withTenant } from '../../db/client';
import { systemDb } from '../../db/system';
import {
  properties, owners, users, leases, rentCharges, clients, leads, viewings, deals, organizations,
} from '../../db/schema';
import { conflict, invalid, notFound } from '../../lib/errors';
import { parse } from '../../lib/validate';
import { type Auth, uuidField, requireProperty } from '../crm/common';
import { recordAudit } from '../../lib/audit';
import { getProperty } from './properties.service';
import { notLeased } from './listings.service';

const MAX_UNITS = 400;

export const bulkUnitsInput = z.object({
  building: z.string().trim().min(1).max(120),
  ownerId: uuidField,
  location: z.string().trim().min(1).max(200),
  city: z.string().trim().min(1).max(100).default('Nairobi'),
  listingType: z.enum(LISTING_TYPES),
  propertyType: z.enum(PROPERTY_TYPES),
  floors: z.number().int().min(1).max(60),
  unitsPerFloor: z.number().int().min(1).max(40),
  startFloor: z.number().int().min(0).max(100).default(1),
  bedrooms: z.number().int().min(0).nullable().optional(),
  bathrooms: z.number().int().min(0).nullable().optional(),
  price: z.number().min(0),
  currency: z.string().trim().length(3).optional(),
  assignedAgentId: uuidField.nullable().optional(),
});

/** Unit labels: floor 3, position 2 -> "302"; position 12 -> "312"; ground floor 0 -> "G02". */
export function unitLabels(floors: number, perFloor: number, startFloor: number): string[] {
  const out: string[] = [];
  for (let f = 0; f < floors; f++) {
    const floor = startFloor + f;
    for (let n = 1; n <= perFloor; n++) {
      out.push(`${floor === 0 ? 'G' : floor}${String(n).padStart(2, '0')}`);
    }
  }
  return out;
}

const refPrefix = (building: string) =>
  building.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'BLDG';

export async function createBulkUnits(a: Auth, body: unknown): Promise<{ created: number; building: string }> {
  const input = parse(bulkUnitsInput, body);
  const labels = unitLabels(input.floors, input.unitsPerFloor, input.startFloor);
  if (labels.length > MAX_UNITS) throw invalid({ floors: `That is ${labels.length} units; create at most ${MAX_UNITS} at a time.` });

  let currency = input.currency;
  if (!currency) {
    const [org] = await systemDb.select({ currency: organizations.currency }).from(organizations).where(eq(organizations.id, a.organizationId));
    currency = org?.currency ?? 'KES';
  }
  const prefix = refPrefix(input.building);

  return withTenant(a.organizationId, async (tx) => {
    const [owner] = await tx.select({ id: owners.id }).from(owners)
      .where(and(eq(owners.id, input.ownerId), eq(owners.organizationId, a.organizationId)));
    if (!owner) throw notFound('Owner');

    const refs = labels.map((l) => `${prefix}-${l}`);
    const clash = await tx.select({ reference: properties.reference }).from(properties)
      .where(and(eq(properties.organizationId, a.organizationId), inArray(properties.reference, refs))).limit(3);
    if (clash.length) {
      throw conflict(`Units already exist for ${input.building} (e.g. ${clash.map((c) => c.reference).join(', ')}). Pick a different building name.`);
    }

    await tx.insert(properties).values(labels.map((label, i) => ({
      organizationId: a.organizationId,
      reference: refs[i]!,
      title: `${input.building} – Unit ${label}`,
      listingType: input.listingType,
      propertyType: input.propertyType,
      price: input.price,
      currency: currency!,
      location: input.location,
      city: input.city,
      bedrooms: input.bedrooms ?? null,
      bathrooms: input.bathrooms ?? null,
      building: input.building,
      unitNumber: label,
      ownerId: input.ownerId,
      assignedAgentId: input.assignedAgentId ?? a.userId,
      listedAt: new Date(),
      createdById: a.userId,
      updatedById: a.userId,
    })));

    await recordAudit(tx, {
      organizationId: a.organizationId, actorId: a.userId, action: 'CREATE', entityType: 'property', entityId: owner.id,
      summary: `Created ${labels.length} units in ${input.building}`,
    });
    return { created: labels.length, building: input.building };
  });
}

async function loadBuildings(a: Auth, only?: string) {
  const today = new Date().toISOString().slice(0, 10);
  return withTenant(a.organizationId, async (tx) => {
    const conds = [eq(properties.organizationId, a.organizationId), isNotNull(properties.building)];
    if (only) conds.push(eq(properties.building, only));
    const props = await tx.select({ p: properties, ownerName: dsql<string>`coalesce(${owners.companyName}, ${owners.fullName}, '')` })
      .from(properties).innerJoin(owners, eq(owners.id, properties.ownerId)).where(and(...conds));
    if (props.length === 0) return { props, active: [], arrears: [] as { propertyId: string; owed: number }[] };

    const ids = props.map((r) => r.p.id);
    const active = await tx.select({
      propertyId: leases.propertyId, rent: leases.rentAmount, tenantName: clients.fullName,
    }).from(leases).innerJoin(clients, eq(clients.id, leases.tenantId))
      .where(and(eq(leases.status, 'ACTIVE'), inArray(leases.propertyId, ids)));
    const arrears = await tx.select({
      propertyId: leases.propertyId,
      owed: dsql<number>`coalesce(sum(${rentCharges.amount} - ${rentCharges.paidAmount}), 0)::int`,
    }).from(rentCharges).innerJoin(leases, eq(leases.id, rentCharges.leaseId))
      .where(and(ne(rentCharges.status, 'PAID'), lt(rentCharges.dueDate, today), inArray(leases.propertyId, ids)))
      .groupBy(leases.propertyId);
    return { props, active, arrears };
  });
}

function summarise(name: string, rows: Awaited<ReturnType<typeof loadBuildings>>): BuildingSummary {
  const mine = rows.props.filter((r) => r.p.building === name);
  const first = mine[0]!.p;
  const occupiedIds = new Set(rows.active.map((l) => l.propertyId));
  const occupied = mine.filter((r) => occupiedIds.has(r.p.id)).length;
  const vacant = mine.filter((r) => !occupiedIds.has(r.p.id) && r.p.status === 'AVAILABLE').length;
  const ids = new Set(mine.map((r) => r.p.id));
  const monthlyRent = rows.active.filter((l) => ids.has(l.propertyId)).reduce((s, l) => s + l.rent, 0);
  const potentialRent = mine.reduce((s, r) => s + (r.p.listingType === 'RENT' ? r.p.price : 0), 0);
  return {
    building: name,
    location: first.location,
    city: first.city,
    ownerNames: [...new Set(mine.map((r) => r.ownerName).filter(Boolean))],
    units: mine.length,
    occupied,
    vacant,
    other: mine.length - occupied - vacant,
    occupancyPct: mine.length ? Math.round((occupied / mine.length) * 100) : 0,
    monthlyRent,
    potentialRent: Math.max(potentialRent, monthlyRent),
    currency: first.currency,
    arrears: rows.arrears.filter((r) => ids.has(r.propertyId)).reduce((s, r) => s + r.owed, 0),
  };
}

export async function listBuildings(a: Auth): Promise<BuildingSummary[]> {
  const rows = await loadBuildings(a);
  const names = [...new Set(rows.props.map((r) => r.p.building!))].sort();
  return names.map((n) => summarise(n, rows));
}

export async function getBuilding(a: Auth, name: string): Promise<BuildingDetail> {
  const rows = await loadBuildings(a, name);
  if (rows.props.length === 0) throw notFound('Building');
  const tenant = new Map(rows.active.map((l) => [l.propertyId, l.tenantName] as const));
  const owed = new Map(rows.arrears.map((r) => [r.propertyId, r.owed] as const));
  const unitList = rows.props
    .map((r) => ({
      id: r.p.id, unitNumber: r.p.unitNumber, title: r.p.title, bedrooms: r.p.bedrooms, price: r.p.price,
      status: tenant.has(r.p.id) ? ('LET' as const) : r.p.status,
      tenantName: tenant.get(r.p.id) ?? null, arrears: owed.get(r.p.id) ?? 0, advertised: r.p.advertised,
    }))
    .sort((x, y) => (x.unitNumber ?? '').localeCompare(y.unitNumber ?? '', undefined, { numeric: true }));
  return { ...summarise(name, rows), unitList };
}

/** Owner, agent, current tenant and every buyer/tenant with a viewing or deal on this property. */
export async function getPropertyNetwork(a: Auth, id: string): Promise<PropertyNetwork> {
  parse(uuidField, id);
  return withTenant(a.organizationId, async (tx) => {
    const p = await requireProperty(tx, a.organizationId, id);

    const [owner] = await tx.select().from(owners).where(eq(owners.id, p.ownerId));
    const [agent] = p.assignedAgentId
      ? await tx.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.id, p.assignedAgentId))
      : [];

    const [lease] = await tx.select({
      id: clients.id, name: clients.fullName, phone: clients.phone, rent: leases.rentAmount, since: leases.startDate,
    }).from(leases).innerJoin(clients, eq(clients.id, leases.tenantId))
      .where(and(eq(leases.propertyId, id), eq(leases.status, 'ACTIVE'))).limit(1);

    const viewRows = await tx.select({
      clientId: viewings.clientId, leadId: viewings.leadId, at: viewings.scheduledAt, agentName: users.name,
      cName: clients.fullName, cPhone: clients.phone, lName: leads.fullName, lPhone: leads.phone,
    }).from(viewings)
      .leftJoin(clients, eq(clients.id, viewings.clientId))
      .leftJoin(leads, eq(leads.id, viewings.leadId))
      .leftJoin(users, eq(users.id, viewings.agentId))
      .where(eq(viewings.propertyId, id));

    const dealRows = await tx.select({
      clientId: deals.clientId, name: clients.fullName, phone: clients.phone, dealName: deals.name,
      agentName: users.name, at: deals.createdAt,
    }).from(deals).innerJoin(clients, eq(clients.id, deals.clientId))
      .leftJoin(users, eq(users.id, deals.agentId)).where(eq(deals.propertyId, id));

    const map = new Map<string, NetworkContact>();
    for (const v of viewRows) {
      const kind = v.clientId ? 'CLIENT' : 'LEAD';
      const cid = (v.clientId ?? v.leadId)!;
      const key = `${kind}:${cid}`;
      if (map.has(key)) continue;
      map.set(key, {
        kind, id: cid, name: (v.cName ?? v.lName) ?? 'Unknown', phone: (v.cPhone ?? v.lPhone) ?? '',
        stage: 'VIEWING', detail: 'Viewing booked', agentName: v.agentName, at: new Date(v.at).toISOString(),
      });
    }
    for (const d of dealRows) {
      map.set(`CLIENT:${d.clientId}`, {
        kind: 'CLIENT', id: d.clientId, name: d.name, phone: d.phone ?? '', stage: 'DEAL',
        detail: d.dealName, agentName: d.agentName, at: new Date(d.at).toISOString(),
      });
    }
    const interested = [...map.values()].sort((x, y) =>
      (x.stage === y.stage ? 0 : x.stage === 'DEAL' ? -1 : 1) || y.at.localeCompare(x.at));

    return {
      owner: owner ? {
        id: owner.id, name: owner.companyName ?? owner.fullName ?? 'Owner', phone: owner.phone, email: owner.email, whatsapp: owner.whatsapp,
      } : null,
      agent: agent ? { id: agent.id, name: agent.name, email: agent.email } : null,
      interested,
      tenant: lease ? { id: lease.id, name: lease.name, phone: lease.phone ?? '', rentAmount: lease.rent, since: lease.since } : null,
    };
  });
}

export async function setAdvertised(a: Auth, id: string, advertised: boolean): Promise<PropertyDetail> {
  parse(uuidField, id);
  await withTenant(a.organizationId, async (tx) => {
    await requireProperty(tx, a.organizationId, id);
    await tx.update(properties).set({ advertised, updatedById: a.userId }).where(eq(properties.id, id));
  });
  return getProperty(a, id);
}

/** Switch a whole building's vacant units on or off the public listings page in one go. */
export async function setBuildingAdvertised(a: Auth, building: string, advertised: boolean): Promise<{ updated: number }> {
  return withTenant(a.organizationId, async (tx) => {
    const rows = await tx.update(properties).set({ advertised, updatedById: a.userId })
      .where(and(eq(properties.organizationId, a.organizationId), eq(properties.building, building), eq(properties.status, 'AVAILABLE'), notLeased))
      .returning({ id: properties.id });
    return { updated: rows.length };
  });
}
