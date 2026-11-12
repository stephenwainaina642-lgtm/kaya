import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { setupTenant, truncateAll } from './helpers';
import { unitLabels } from '../modules/properties/estate.service';

const app = createApp();

describe('unit labels', () => {
  it('numbers units floor by floor', () => {
    expect(unitLabels(2, 3, 1)).toEqual(['101', '102', '103', '201', '202', '203']);
    expect(unitLabels(1, 2, 0)).toEqual(['G01', 'G02']);
  });
});

describe('estates, network and public listings', () => {
  beforeEach(truncateAll);

  async function seed(h: Record<string, string>) {
    const owner = (await request(app).post('/api/owners').set(h).send({ fullName: 'Grace Wanjiru', phone: '+254722000001' })).body;
    const bulk = await request(app).post('/api/properties/bulk').set(h).send({
      building: 'Nyali Heights', ownerId: owner.id, location: 'Nyali', city: 'Mombasa', listingType: 'RENT', propertyType: 'APARTMENT',
      floors: 3, unitsPerFloor: 4, bedrooms: 2, bathrooms: 1, price: 30_000,
    });
    return { owner, bulk };
  }

  it('creates a block of units, refuses a duplicate, and summarises occupancy and arrears', async () => {
    const t = await setupTenant('ORG_ADMIN', 'GROWTH');
    const h = t.authHeader;
    const { owner, bulk } = await seed(h);
    expect(bulk.status).toBe(201);
    expect(bulk.body.created).toBe(12);
    expect((await request(app).post('/api/properties/bulk').set(h).send({
      building: 'Nyali Heights', ownerId: owner.id, location: 'Nyali', listingType: 'RENT', propertyType: 'APARTMENT', floors: 1, unitsPerFloor: 1, price: 1,
    })).status).toBe(409);
    expect((await request(app).post('/api/properties/bulk').set(h).send({
      building: 'Huge', ownerId: owner.id, location: 'X', listingType: 'RENT', propertyType: 'APARTMENT', floors: 60, unitsPerFloor: 40, price: 1,
    })).status).toBe(422);

    const list = (await request(app).get('/api/properties').set(h).query({ pageSize: 50 })).body.items;
    const unit = list.find((p: { unitNumber: string }) => p.unitNumber === '102');
    const tenant = (await request(app).post('/api/clients').set(h).send({ fullName: 'Tenant Tom', phone: '+254733000009' })).body;
    await request(app).post('/api/rent/leases').set(h).send({ propertyId: unit.id, tenantId: tenant.id, rentAmount: 30_000, dueDay: 1, startDate: '2025-01-01' });
    await request(app).post('/api/rent/charges/generate').set(h).send({ period: '2025-02' });

    const buildings = (await request(app).get('/api/properties/buildings').set(h)).body;
    expect(buildings).toHaveLength(1);
    expect(buildings[0]).toMatchObject({ building: 'Nyali Heights', units: 12, occupied: 1, vacant: 11, occupancyPct: 8, monthlyRent: 30_000, potentialRent: 360_000 });
    expect(buildings[0].arrears).toBeGreaterThan(0);

    const detail = (await request(app).get('/api/properties/buildings/Nyali%20Heights').set(h)).body;
    expect(detail.unitList).toHaveLength(12);
    expect(detail.unitList.find((u: { unitNumber: string }) => u.unitNumber === '102')).toMatchObject({ status: 'LET', tenantName: 'Tenant Tom' });
    expect(detail.unitList.find((u: { unitNumber: string }) => u.unitNumber === '102').openIssues).toBe(0);

    // A repair raised against the unit is flagged on that unit, and clears once it is done.
    const issue = (await request(app).post('/api/maintenance').set(h).send({ propertyId: unit.id, title: 'Bathroom tap leaking', category: 'PLUMBING', priority: 'HIGH' })).body;
    const flagged = (await request(app).get('/api/properties/buildings/Nyali%20Heights').set(h)).body.unitList;
    expect(flagged.find((u: { unitNumber: string }) => u.unitNumber === '102').openIssues).toBe(1);
    expect(flagged.find((u: { unitNumber: string }) => u.unitNumber === '101').openIssues).toBe(0);
    await request(app).patch(`/api/maintenance/${issue.id}`).set(h).send({ status: 'DONE' });
    const cleared = (await request(app).get('/api/properties/buildings/Nyali%20Heights').set(h)).body.unitList;
    expect(cleared.find((u: { unitNumber: string }) => u.unitNumber === '102').openIssues).toBe(0);
    expect((await request(app).get('/api/properties/buildings/Nope').set(h)).status).toBe(404);
  });

  it('shows owner, agent, tenant and interested buyers on one property', async () => {
    const t = await setupTenant('ORG_ADMIN', 'GROWTH');
    const h = t.authHeader;
    await seed(h);
    const unit = (await request(app).get('/api/properties').set(h).query({ pageSize: 50 })).body.items[0];
    const net = await request(app).get(`/api/properties/${unit.id}/network`).set(h);
    expect(net.status).toBe(200);
    expect(net.body.owner).toMatchObject({ name: 'Grace Wanjiru' });
    expect(net.body.agent).toBeTruthy();
    expect(net.body.interested).toEqual([]);
    expect(net.body.tenant).toBeNull();
  });

  it('publishes only opted-in, available units and hides internal data', async () => {
    const t = await setupTenant('ORG_ADMIN', 'GROWTH');
    const h = t.authHeader;
    await seed(h);
    expect((await request(app).get(`/api/public/listings/${t.org.slug}`)).body.items).toEqual([]);

    // A leased unit must never be advertised, even if its status flag still says AVAILABLE.
    const all = (await request(app).get('/api/properties').set(h).query({ pageSize: 50 })).body.items;
    const taken = all[0];
    const tn = (await request(app).post('/api/clients').set(h).send({ fullName: 'Tenant Tom', phone: '+254733000009' })).body;
    await request(app).post('/api/rent/leases').set(h).send({ propertyId: taken.id, tenantId: tn.id, rentAmount: 30_000, dueDay: 1, startDate: '2025-01-01' });
    await request(app).post(`/api/properties/${taken.id}/advertise`).set(h).send({ advertised: true });
    expect((await request(app).get(`/api/public/listings/${t.org.slug}/${taken.id}`)).status).toBe(404);

    const adv = await request(app).post('/api/properties/buildings/Nyali%20Heights/advertise').set(h).send({ advertised: true });
    expect(adv.body.updated).toBe(11);

    const pub = await request(app).get(`/api/public/listings/${t.org.slug}`);
    expect(pub.status).toBe(200);
    expect(pub.body.items).toHaveLength(11);
    const id = pub.body.items[0].id;
    const one = await request(app).get(`/api/public/listings/${t.org.slug}/${id}`);
    expect(one.status).toBe(200);
    const raw = JSON.stringify(one.body);
    expect(raw).not.toContain('Grace');
    expect(raw).not.toContain('internalNotes');
    expect(raw).not.toContain('ownerId');

    await request(app).patch(`/api/properties/${id}`).set(h).send({ status: 'LET' });
    expect((await request(app).get(`/api/public/listings/${t.org.slug}/${id}`)).status).toBe(404);
    await request(app).post(`/api/properties/${pub.body.items[1].id}/advertise`).set(h).send({ advertised: false });
    expect((await request(app).get(`/api/public/listings/${t.org.slug}`)).body.items).toHaveLength(9);
    expect((await request(app).get('/api/public/listings/no-such-agency')).status).toBe(404);
  });
});
