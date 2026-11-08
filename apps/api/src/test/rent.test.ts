import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { createApp } from '../app';
import { systemDb } from '../db/system';
import { organizations } from '../db/schema';
import { testOutbox } from '../lib/mailer';
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

describe('automatic rent raising', () => {
  beforeEach(async () => { await truncateAll(); });

  it('raises the current month for every eligible agency, once, and skips suspended or ineligible ones', async () => {
    const { sweepRentCharges } = await import('../modules/rent/rent.service');
    const a = await setupTenant('ORG_ADMIN', 'GROWTH');
    const suspended = await setupTenant('ORG_ADMIN', 'GROWTH');
    const starter = await setupTenant('ORG_ADMIN', 'GROWTH');
    await seed(a.authHeader);
    await seed(suspended.authHeader);
    await seed(starter.authHeader);
    await systemDb.update(organizations).set({ suspendedAt: new Date() }).where(eq(organizations.id, suspended.org.id));
    await systemDb.update(organizations).set({ plan: 'STARTER' }).where(eq(organizations.id, starter.org.id));

    const now = new Date('2026-04-15T10:00:00Z');
    expect(await sweepRentCharges(now)).toEqual({ organizations: 1, created: 1 });
    expect((await request(app).get('/api/rent/charges?period=2026-04').set(a.authHeader)).body).toHaveLength(1);
    expect(await sweepRentCharges(now)).toEqual({ organizations: 0, created: 0 }); // hourly re-run is a no-op

    const next = await sweepRentCharges(new Date('2026-05-01T00:30:00Z')); // a new month rolls over by itself
    expect(next.created).toBe(1);
  });
});

describe('lease expiry alerts and renewal', () => {
  beforeEach(async () => { await truncateAll(); });

  it('raises one follow-up per lease term inside the 60-day window, and none outside it', async () => {
    const { sweepLeaseExpiry } = await import('../modules/rent/rent.service');
    const { followUps } = await import('../db/schema');
    const soon = await setupTenant('ORG_ADMIN', 'GROWTH');
    const far = await setupTenant('ORG_ADMIN', 'GROWTH');
    const open = await setupTenant('ORG_ADMIN', 'GROWTH');
    await seed(soon.authHeader, 50_000, { endDate: '2026-06-20' });
    await seed(far.authHeader, 50_000, { endDate: '2026-12-31' });
    await seed(open.authHeader);

    const now = new Date('2026-05-01T08:00:00Z'); // 50 days before 20 June
    expect(await sweepLeaseExpiry(now)).toEqual({ alerts: 1 });
    const rows = await systemDb.select().from(followUps).where(eq(followUps.organizationId, soon.org.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ priority: 'MEDIUM', status: 'PENDING' });
    expect(rows[0]!.title).toContain('Tenant Tom');
    expect(rows[0]!.notes).toContain('2026-06-20');
    expect(rows[0]!.clientId).toBeTruthy();
    expect(await systemDb.select().from(followUps).where(eq(followUps.organizationId, far.org.id))).toHaveLength(0);
    expect(await systemDb.select().from(followUps).where(eq(followUps.organizationId, open.org.id))).toHaveLength(0);

    expect(await sweepLeaseExpiry(now)).toEqual({ alerts: 0 }); // hourly re-runs never repeat it
  });

  it('marks an alert urgent inside 14 days, and ignores ended leases', async () => {
    const { sweepLeaseExpiry } = await import('../modules/rent/rent.service');
    const { followUps } = await import('../db/schema');
    const t = await setupTenant('ORG_ADMIN', 'GROWTH');
    const { lease } = await seed(t.authHeader, 50_000, { endDate: '2026-06-20' });
    await sweepLeaseExpiry(new Date('2026-06-10T08:00:00Z'));
    expect((await systemDb.select().from(followUps).where(eq(followUps.organizationId, t.org.id)))[0]!.priority).toBe('HIGH');

    const t2 = await setupTenant('ORG_ADMIN', 'GROWTH');
    const second = await seed(t2.authHeader, 50_000, { endDate: '2026-06-20' });
    await request(app).post(`/api/rent/leases/${second.lease.body.id}/end`).set(t2.authHeader).send({});
    expect(await sweepLeaseExpiry(new Date('2026-06-10T08:00:00Z'))).toEqual({ alerts: 0 });
    void lease;
  });

  it('renews a lease, validates the dates, and re-arms the alert for the new term', async () => {
    const { sweepLeaseExpiry } = await import('../modules/rent/rent.service');
    const { followUps } = await import('../db/schema');
    const t = await setupTenant('ORG_ADMIN', 'GROWTH');
    const { lease } = await seed(t.authHeader, 50_000, { endDate: '2026-06-20' });
    await sweepLeaseExpiry(new Date('2026-05-01T08:00:00Z'));

    const bad = await request(app).post(`/api/rent/leases/${lease.body.id}/renew`).set(t.authHeader).send({ endDate: '2026-06-01' });
    expect(bad.status).toBe(422);
    const ok = await request(app).post(`/api/rent/leases/${lease.body.id}/renew`).set(t.authHeader).send({ endDate: '2027-06-20', rentAmount: 55_000 });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ endDate: '2027-06-20', rentAmount: 55_000 });

    expect(await sweepLeaseExpiry(new Date('2026-05-02T08:00:00Z'))).toEqual({ alerts: 0 }); // far away again
    expect(await sweepLeaseExpiry(new Date('2027-05-01T08:00:00Z'))).toEqual({ alerts: 1 }); // next term alerts
    expect(await systemDb.select().from(followUps).where(eq(followUps.organizationId, t.org.id))).toHaveLength(2);

    await request(app).post(`/api/rent/leases/${lease.body.id}/end`).set(t.authHeader).send({});
    expect((await request(app).post(`/api/rent/leases/${lease.body.id}/renew`).set(t.authHeader).send({ endDate: '2028-01-01' })).status).toBe(409);
    const agent = await createUser(t.org.id, { role: 'AGENT' });
    expect((await request(app).post(`/api/rent/leases/${lease.body.id}/renew`).set({ Authorization: `Bearer ${agent.token}` }).send({ endDate: '2028-01-01' })).status).toBe(403);
  });
  it('emails a receipt to the tenant, and refuses when the tenant has no email', async () => {
    const t = await setupTenant('ORG_ADMIN', 'GROWTH');
    const h = t.authHeader;
    const { lease, tenant } = await seed(h);
    await request(app).post('/api/rent/charges/generate').set(h).send({ period: '2026-03' });
    const charges = (await request(app).get('/api/rent/charges').set(h).query({ period: '2026-03' })).body;
    const charge = (charges.items ?? charges)[0];
    await request(app).post(`/api/rent/charges/${charge.id}/payments`).set(h).send({ amount: 20_000, method: 'MPESA', reference: 'abc123' });
    const [pay] = (await request(app).get(`/api/rent/charges/${charge.id}/payments`).set(h)).body;

    const noEmail = await request(app).post(`/api/rent/payments/${pay.id}/email-receipt`).set(h);
    expect(noEmail.status).toBe(422);

    await request(app).patch(`/api/clients/${tenant.id}`).set(h).send({ email: 'tom@example.com' });
    testOutbox.length = 0;
    const ok = await request(app).post(`/api/rent/payments/${pay.id}/email-receipt`).set(h);
    expect(ok.status).toBe(200);
    expect(ok.body.to).toBe('tom@example.com');
    expect(testOutbox).toHaveLength(1);
    expect(testOutbox[0]!.text).toContain('20,000');
    expect(testOutbox[0]!.text).toContain('30,000');
    expect(lease.status).toBe(201);
  });
});
