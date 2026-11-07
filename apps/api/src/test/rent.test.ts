import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { createApp } from '../app';
import { systemDb } from '../db/system';
import { organizations } from '../db/schema';
import { truncateAll, setupTenant, createUser } from './helpers';

const app = createApp();
type H = Record<string, string>;

async function seed(h: H, rentAmount = 50_000, extra: Record<string, unknown> = {}) {
  const owner = (await request(app).post('/api/owners').set(h).send({ fullName: 'Grace Wanjiru', phone: '+254722000001' })).body;
  const property = (await request(app).post('/api/properties').set(h).send({
    reference: `PRP-${Math.random().toString(36).slice(2, 8)}`, title: 'Kilimani 2BR', listingType: 'RENT',
    propertyType: 'APARTMENT', price: rentAmount, location: 'Kilimani', bedrooms: 2, bathrooms: 2, ownerId: owner.id,
  })).body;
  const tenant = (await request(app).post('/api/clients').set(h).send({ fullName: 'Tenant Tom', phone: '+254733000009' })).body;
  const lease = await request(app).post('/api/rent/leases').set(h).send({
    propertyId: property.id, tenantId: tenant.id, rentAmount, dueDay: 5, startDate: '2026-01-01', feeBps: 1000, ...extra,
  });
  return { owner, property, tenant, lease };
}

describe('rent management', () => {
  beforeEach(async () => { await truncateAll(); });

  it('creates a lease, generates rent once per month, and records payments with correct balances', async () => {
    const t = await setupTenant('ORG_ADMIN', 'GROWTH');
    const { lease } = await seed(t.authHeader);
    expect(lease.status).toBe(201);
    expect(lease.body).toMatchObject({ rentAmount: 50_000, status: 'ACTIVE', ownerName: 'Grace Wanjiru', tenantName: 'Tenant Tom' });

    const gen = await request(app).post('/api/rent/charges/generate').set(t.authHeader).send({ period: '2026-03' });
    expect(gen.body).toMatchObject({ created: 1, alreadyExisted: 0 });
    const again = await request(app).post('/api/rent/charges/generate').set(t.authHeader).send({ period: '2026-03' });
    expect(again.body).toMatchObject({ created: 0, alreadyExisted: 1 }); // never bills twice

    const charges = (await request(app).get('/api/rent/charges?period=2026-03').set(t.authHeader)).body;
    expect(charges).toHaveLength(1);
    expect(charges[0]).toMatchObject({ amount: 50_000, balance: 50_000, status: 'UNPAID', dueDate: '2026-03-05' });

    const p1 = await request(app).post(`/api/rent/charges/${charges[0].id}/payments`).set(t.authHeader).send({ amount: 20_000, method: 'MPESA', reference: 'qa12bc34de' });
    expect(p1.status).toBe(201);
    expect(p1.body).toMatchObject({ paidAmount: 20_000, balance: 30_000, status: 'PARTIAL' });
    const p2 = await request(app).post(`/api/rent/charges/${charges[0].id}/payments`).set(t.authHeader).send({ amount: 30_000, method: 'BANK' });
    expect(p2.body).toMatchObject({ balance: 0, status: 'PAID' });

    const history = (await request(app).get(`/api/rent/charges/${charges[0].id}/payments`).set(t.authHeader)).body;
    expect(history.map((p: any) => p.amount)).toEqual([20_000, 30_000]);
    expect(history[0].reference).toBe('QA12BC34DE'); // normalised
  });

  it('refuses overpayment, repeated M-Pesa codes, a second active lease, and bad input', async () => {
    const t = await setupTenant('ORG_ADMIN', 'GROWTH');
    const { property, tenant } = await seed(t.authHeader);
    await request(app).post('/api/rent/charges/generate').set(t.authHeader).send({ period: '2026-03' });
    const c = (await request(app).get('/api/rent/charges?period=2026-03').set(t.authHeader)).body[0];

    expect((await request(app).post(`/api/rent/charges/${c.id}/payments`).set(t.authHeader).send({ amount: 50_001, method: 'CASH' })).status).toBe(422);
    expect((await request(app).post(`/api/rent/charges/${c.id}/payments`).set(t.authHeader).send({ amount: 0, method: 'CASH' })).status).toBe(422);
    expect((await request(app).post(`/api/rent/charges/${c.id}/payments`).set(t.authHeader).send({ amount: 1000, method: 'BITCOIN' })).status).toBe(422);
    await request(app).post(`/api/rent/charges/${c.id}/payments`).set(t.authHeader).send({ amount: 1000, method: 'MPESA', reference: 'ABC123XYZ9' });
    expect((await request(app).post(`/api/rent/charges/${c.id}/payments`).set(t.authHeader).send({ amount: 1000, method: 'MPESA', reference: 'abc123xyz9' })).status).toBe(409);

    const second = await request(app).post('/api/rent/leases').set(t.authHeader).send({ propertyId: property.id, tenantId: tenant.id, rentAmount: 1, startDate: '2026-02-01' });
    expect(second.status).toBe(409);
    expect((await request(app).post('/api/rent/charges/generate').set(t.authHeader).send({ period: '2026-13' })).status).toBe(422);
  });

  it('does not let two simultaneous payments overpay one charge', async () => {
    const t = await setupTenant('ORG_ADMIN', 'GROWTH');
    await seed(t.authHeader);
    await request(app).post('/api/rent/charges/generate').set(t.authHeader).send({ period: '2026-03' });
    const c = (await request(app).get('/api/rent/charges?period=2026-03').set(t.authHeader)).body[0];
    const results = await Promise.all([1, 2].map(() =>
      request(app).post(`/api/rent/charges/${c.id}/payments`).set(t.authHeader).send({ amount: 30_000, method: 'CASH' })));
    expect(results.map((r) => r.status).sort()).toEqual([201, 422]);
    const after = (await request(app).get('/api/rent/charges?period=2026-03').set(t.authHeader)).body[0];
    expect(after.paidAmount).toBe(30_000);
  });

  it('skips ended leases and leases not yet started when generating rent', async () => {
    const t = await setupTenant('ORG_ADMIN', 'GROWTH');
    const { lease } = await seed(t.authHeader);
    await request(app).post(`/api/rent/leases/${lease.body.id}/end`).set(t.authHeader).send({ endDate: '2026-02-28' });
    expect((await request(app).post('/api/rent/charges/generate').set(t.authHeader).send({ period: '2026-03' })).body.created).toBe(0);
    expect((await request(app).post('/api/rent/charges/generate').set(t.authHeader).send({ period: '2025-12' })).body.created).toBe(0);
    expect((await request(app).post(`/api/rent/leases/${lease.body.id}/end`).set(t.authHeader).send({})).status).toBe(409);
  });

  it('builds the landlord statement from what was collected, less fee and withholding', async () => {
    const t = await setupTenant('ORG_ADMIN', 'GROWTH');
    const { owner } = await seed(t.authHeader, 100_000, { feeBps: 1000, withholdingBps: 750 });
    await request(app).post('/api/rent/charges/generate').set(t.authHeader).send({ period: '2026-03' });
    const c = (await request(app).get('/api/rent/charges?period=2026-03').set(t.authHeader)).body[0];
    await request(app).post(`/api/rent/charges/${c.id}/payments`).set(t.authHeader).send({ amount: 80_000, method: 'MPESA', reference: 'RENT000001' });

    const st = (await request(app).get(`/api/rent/statements/${owner.id}?period=2026-03`).set(t.authHeader)).body;
    // 80,000 collected; fee 10% = 8,000; withholding 7.5% of the remaining 72,000 = 5,400; net 66,600
    expect(st.lines[0]).toMatchObject({ rentDue: 100_000, collected: 80_000, managementFee: 8_000, withholding: 5_400, netToLandlord: 66_600 });
    expect(st.totals.netToLandlord).toBe(66_600);

    const csv = await request(app).get(`/api/rent/statements/${owner.id}?period=2026-03&format=csv`).set(t.authHeader);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('TOTAL');

    const overview = (await request(app).get('/api/rent/overview?period=2026-03').set(t.authHeader)).body;
    expect(overview).toMatchObject({ expected: 100_000, collected: 80_000, outstanding: 20_000, activeLeases: 1 });
    expect(overview.collectionRate).toBeCloseTo(0.8);
  });

  it('reports arrears for overdue unpaid rent only', async () => {
    const t = await setupTenant('ORG_ADMIN', 'GROWTH');
    await seed(t.authHeader);
    await request(app).post('/api/rent/charges/generate').set(t.authHeader).send({ period: '2026-03' });
    const a = (await request(app).get('/api/rent/arrears').set(t.authHeader)).body;
    expect(a.rows).toHaveLength(1);
    expect(a.total).toBe(50_000);
    expect(a.rows[0].daysOverdue).toBeGreaterThan(0);
    expect(a.rows[0].tenantName).toBe('Tenant Tom');
  });

  it('is isolated per agency, manager-only, and gated by plan', async () => {
    const a = await setupTenant('ORG_ADMIN', 'GROWTH');
    const b = await setupTenant('ORG_ADMIN', 'GROWTH');
    const { owner } = await seed(a.authHeader);
    await request(app).post('/api/rent/charges/generate').set(a.authHeader).send({ period: '2026-03' });

    expect((await request(app).get('/api/rent/charges?period=2026-03').set(b.authHeader)).body).toEqual([]);
    expect((await request(app).get('/api/rent/leases').set(b.authHeader)).body).toEqual([]);
    expect((await request(app).get(`/api/rent/statements/${owner.id}`).set(b.authHeader)).status).toBe(404);

    const agent = await createUser(a.org.id, { role: 'AGENT' });
    expect((await request(app).get('/api/rent/leases').set({ Authorization: `Bearer ${agent.token}` })).status).toBe(403);
    expect((await request(app).get('/api/rent/leases')).status).toBe(401);

    await systemDb.update(organizations).set({ plan: 'STARTER' }).where(eq(organizations.id, a.org.id));
    expect((await request(app).get('/api/rent/leases').set(a.authHeader)).status).toBe(403);
  });
});
