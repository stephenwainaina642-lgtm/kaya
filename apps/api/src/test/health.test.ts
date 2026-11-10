import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { setupTenant, createUser, truncateAll } from './helpers';
import { scoreHealth, type HealthInputs } from '../modules/rent/health.service';

const base: HealthInputs = {
  currency: 'KES', charged: 100_000, collected: 100_000, overdueTenants: 0, rentalUnits: 10, letUnits: 10,
  openRepairs: 0, agedRepairs: 0, urgentRepairs: 0, lapsedLeases: 0, expiringSoon: 0,
};

describe('scoreHealth', () => {
  it('scores a perfect portfolio 100 with nothing to fix', () => {
    const h = scoreHealth(base);
    expect(h).toMatchObject({ score: 100, label: 'Excellent', actions: [] });
  });

  it('weights collection and occupancy most, and ranks fixes by points regained', () => {
    const h = scoreHealth({ ...base, collected: 60_000, overdueTenants: 4, letUnits: 7, agedRepairs: 2 });
    // collection 60*.4 + occupancy 70*.3 + repairs 70*.15 + leases 100*.15 = 24+21+10.5+15
    expect(h.score).toBe(71);
    expect(h.label).toBe('Healthy');
    expect(h.actions.map((a) => a.to)).toEqual(['/rent', '/buildings', '/maintenance']);
    expect(h.actions[0]!.gain).toBeGreaterThan(h.actions[1]!.gain);
    expect(h.actions[0]!.text).toMatch(/4 tenants behind/);
  });

  it('leaves out what it cannot measure instead of scoring it zero', () => {
    const empty = scoreHealth({ ...base, charged: 0, collected: 0, rentalUnits: 0, letUnits: 0 });
    expect(empty.components.filter((c) => c.score === null)).toHaveLength(3);
    expect(empty.score).toBe(100); // only repairs measurable, and clean
    const onlyNew = scoreHealth({ ...base, charged: 0, collected: 0, rentalUnits: 0, letUnits: 0, agedRepairs: 7 });
    expect(onlyNew.score).toBe(0);
    expect(onlyNew.label).toBe('At risk');
  });

  it('clamps and never goes outside 0-100', () => {
    const h = scoreHealth({ ...base, collected: 500_000, lapsedLeases: 9, agedRepairs: 20, urgentRepairs: 20 });
    for (const c of h.components) { expect(c.score).toBeGreaterThanOrEqual(0); expect(c.score).toBeLessThanOrEqual(100); }
    expect(h.score).toBeLessThanOrEqual(100);
  });
});

describe('portfolio health endpoint', () => {
  beforeEach(truncateAll);
  it('reflects real rent, occupancy and repairs, and is closed to roles without rent access', async () => {
    const t = await setupTenant('ORG_ADMIN', 'GROWTH');
    const h = t.authHeader;
    const owner = (await request(app).post('/api/owners').set(h).send({ fullName: 'O', phone: '0722000001' })).body;
    const mk = async (ref: string) => (await request(app).post('/api/properties').set(h).send({
      title: ref, reference: ref, listingType: 'RENT', propertyType: 'APARTMENT', price: 20000, location: 'X', bathrooms: 1, ownerId: owner.id,
    })).body;
    const [p1] = [await mk('H-1'), await mk('H-2')];
    const tenant = (await request(app).post('/api/clients').set(h).send({ fullName: 'Tina', phone: '0712345678' })).body;
    await request(app).post('/api/rent/leases').set(h).send({ propertyId: p1.id, tenantId: tenant.id, rentAmount: 20000, dueDay: 1, startDate: '2025-01-01' });
    await request(app).post('/api/rent/charges/generate').set(h).send({ period: new Date(Date.now() - 20 * 86_400_000).toISOString().slice(0, 7) });

    const res = await request(app).get('/api/rent/health').set(h);
    expect(res.status).toBe(200);
    const byKey = Object.fromEntries(res.body.components.map((c: { key: string }) => [c.key, c]));
    expect(byKey.OCCUPANCY.score).toBe(50);
    expect(byKey.COLLECTION.score).toBe(0);
    expect(res.body.score).toBeGreaterThan(0);
    expect(res.body.actions.length).toBeGreaterThan(0);
    const care = await createUser(t.org.id, { role: 'CARETAKER' });
    expect((await request(app).get('/api/rent/health').set({ Authorization: `Bearer ${care.token}` })).status).toBe(403);
  });
});

const app = createApp();
