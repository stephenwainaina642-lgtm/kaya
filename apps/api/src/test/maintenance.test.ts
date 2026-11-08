import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { createApp } from '../app';
import { systemDb } from '../db/system';
import { organizations, maintenanceRequests } from '../db/schema';
import { truncateAll, setupTenant, createUser } from './helpers';

const app = createApp();
type H = Record<string, string>;

async function seedProperty(h: H) {
  const owner = (await request(app).post('/api/owners').set(h).send({ fullName: 'Grace Wanjiru', phone: '+254722000001' })).body;
  const property = (await request(app).post('/api/properties').set(h).send({
    reference: `PRP-${Math.random().toString(36).slice(2, 8)}`, title: 'Kilimani 2BR', listingType: 'RENT',
    propertyType: 'APARTMENT', price: 80_000, location: 'Kilimani', bedrooms: 2, bathrooms: 2, ownerId: owner.id,
  })).body;
  return { owner, property };
}

describe('maintenance requests', () => {
  beforeEach(async () => { await truncateAll(); });

  it('logs a repair, works it through to done, and stamps the finish date once', async () => {
    const t = await setupTenant('ORG_ADMIN', 'GROWTH');
    const { property } = await seedProperty(t.authHeader);
    const created = await request(app).post('/api/maintenance').set(t.authHeader).send({
      propertyId: property.id, title: 'Burst pipe in bathroom', category: 'PLUMBING', priority: 'URGENT', estimatedCost: 8000,
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ status: 'OPEN', priority: 'URGENT', propertyTitle: 'Kilimani 2BR', resolvedAt: null });

    const prog = await request(app).patch(`/api/maintenance/${created.body.id}`).set(t.authHeader).send({ status: 'IN_PROGRESS', vendorName: 'Pipe Pros', vendorPhone: '0711222333' });
    expect(prog.body).toMatchObject({ status: 'IN_PROGRESS', vendorName: 'Pipe Pros', resolvedAt: null });

    const done = await request(app).patch(`/api/maintenance/${created.body.id}`).set(t.authHeader).send({ status: 'DONE', actualCost: 7500 });
    expect(done.body.status).toBe('DONE');
    expect(done.body.resolvedAt).toBeTruthy();
    const stamp = done.body.resolvedAt;
    const again = await request(app).patch(`/api/maintenance/${created.body.id}`).set(t.authHeader).send({ status: 'DONE', actualCost: 7600 });
    expect(again.body.resolvedAt).toBe(stamp); // not re-stamped
    const reopened = await request(app).patch(`/api/maintenance/${created.body.id}`).set(t.authHeader).send({ status: 'OPEN' });
    expect(reopened.body.resolvedAt).toBeNull();
  });

  it('lists open and urgent work first, and filters by status', async () => {
    const t = await setupTenant('ORG_ADMIN', 'GROWTH');
    const { property } = await seedProperty(t.authHeader);
    const mk = (title: string, priority: string) => request(app).post('/api/maintenance').set(t.authHeader).send({ propertyId: property.id, title, priority });
    const low = (await mk('Paint touch-up', 'LOW')).body;
    await mk('Broken lock', 'URGENT');
    await mk('Leaky tap', 'MEDIUM');
    await request(app).patch(`/api/maintenance/${low.id}`).set(t.authHeader).send({ status: 'DONE' });

    const all = (await request(app).get('/api/maintenance').set(t.authHeader)).body;
    expect(all.map((r: any) => r.title)).toEqual(['Broken lock', 'Leaky tap', 'Paint touch-up']);
    expect((await request(app).get('/api/maintenance?status=DONE').set(t.authHeader)).body).toHaveLength(1);
  });

  it('deducts recharged repair costs from the landlord statement, only for that month and only when finished', async () => {
    const t = await setupTenant('ORG_ADMIN', 'GROWTH');
    const { owner, property } = await seedProperty(t.authHeader);
    const tenant = (await request(app).post('/api/clients').set(t.authHeader).send({ fullName: 'Tenant Tom', phone: '+254733000009' })).body;
    await request(app).post('/api/rent/leases').set(t.authHeader).send({ propertyId: property.id, tenantId: tenant.id, rentAmount: 100_000, startDate: '2026-01-01', feeBps: 1000 });
    await request(app).post('/api/rent/charges/generate').set(t.authHeader).send({ period: '2026-03' });
    const c = (await request(app).get('/api/rent/charges?period=2026-03').set(t.authHeader)).body[0];
    await request(app).post(`/api/rent/charges/${c.id}/payments`).set(t.authHeader).send({ amount: 100_000, method: 'BANK' });

    const mk = async (title: string, patch: Record<string, unknown>) => {
      const r = (await request(app).post('/api/maintenance').set(t.authHeader).send({ propertyId: property.id, title })).body;
      await request(app).patch(`/api/maintenance/${r.id}`).set(t.authHeader).send(patch);
      return r.id as string;
    };
    const counted = await mk('Replace tap', { status: 'DONE', actualCost: 4_000, chargeToLandlord: true });
    await mk('Absorbed by agency', { status: 'DONE', actualCost: 9_000, chargeToLandlord: false });
    await mk('Not finished yet', { status: 'IN_PROGRESS', actualCost: 5_000, chargeToLandlord: true });
    const lastMonth = await mk('Done in February', { status: 'DONE', actualCost: 2_000, chargeToLandlord: true });
    for (const id of [counted]) await systemDb.update(maintenanceRequests).set({ resolvedAt: new Date('2026-03-12T09:00:00Z') }).where(eq(maintenanceRequests.id, id));
    await systemDb.update(maintenanceRequests).set({ resolvedAt: new Date('2026-02-20T09:00:00Z') }).where(eq(maintenanceRequests.id, lastMonth));

    const st = (await request(app).get(`/api/rent/statements/${owner.id}?period=2026-03`).set(t.authHeader)).body;
    expect(st.deductions).toHaveLength(1);
    expect(st.deductions[0]).toMatchObject({ title: 'Replace tap', amount: 4_000 });
    // 100,000 collected, 10% fee, no tax: 90,000 net before repairs, minus 4,000
    expect(st.totals).toMatchObject({ collected: 100_000, managementFee: 10_000, maintenance: 4_000, netToLandlord: 86_000 });

    const csv = (await request(app).get(`/api/rent/statements/${owner.id}?period=2026-03&format=csv`).set(t.authHeader)).text;
    expect(csv).toContain('Repair: Replace tap');
  });

  it('is isolated per agency, plan-gated, and agents can log but not delete', async () => {
    const a = await setupTenant('ORG_ADMIN', 'GROWTH');
    const b = await setupTenant('ORG_ADMIN', 'GROWTH');
    const { property } = await seedProperty(a.authHeader);
    const r = (await request(app).post('/api/maintenance').set(a.authHeader).send({ propertyId: property.id, title: 'Broken gate' })).body;

    expect((await request(app).get('/api/maintenance').set(b.authHeader)).body).toEqual([]);
    expect((await request(app).patch(`/api/maintenance/${r.id}`).set(b.authHeader).send({ status: 'DONE' })).status).toBe(404);
    expect((await request(app).post('/api/maintenance').set(b.authHeader).send({ propertyId: property.id, title: 'Cross-tenant' })).status).toBe(404);

    const agent = await createUser(a.org.id, { role: 'AGENT' });
    const ah = { Authorization: `Bearer ${agent.token}` };
    expect((await request(app).post('/api/maintenance').set(ah).send({ propertyId: property.id, title: 'Logged by agent' })).status).toBe(201);
    expect((await request(app).delete(`/api/maintenance/${r.id}`).set(ah)).status).toBe(403);
    expect((await request(app).delete(`/api/maintenance/${r.id}`).set(a.authHeader)).status).toBe(204);
    expect((await request(app).post('/api/maintenance').set(a.authHeader).send({ propertyId: property.id, title: 'x', priority: 'SOON' })).status).toBe(422);

    await systemDb.update(organizations).set({ plan: 'STARTER' }).where(eq(organizations.id, a.org.id));
    expect((await request(app).get('/api/maintenance').set(a.authHeader)).status).toBe(403);
  });
  it('takes tenant repair reports on a public link, matching by phone and never leaking who rents what', async () => {
    const t = await setupTenant('ORG_ADMIN', 'GROWTH');
    const h = t.authHeader;
    const { property } = await seedProperty(h);
    const tenant = (await request(app).post('/api/clients').set(h).send({ fullName: 'Tenant Tom', phone: '+254733000009' })).body;
    await request(app).post('/api/rent/leases').set(h).send({ propertyId: property.id, tenantId: tenant.id, rentAmount: 80_000, dueDay: 5, startDate: '2026-01-01' });
    const url = `/api/public/organizations/${t.org.slug}/repair-reports`;

    // A different number format for the same phone still matches.
    const ok = await request(app).post(url).send({ fullName: 'Tom', phone: '0733 000 009', category: 'PLUMBING', urgent: true, message: 'Water is leaking under the kitchen sink' });
    expect(ok.status).toBe(201);
    const list = (await request(app).get('/api/maintenance').set(h)).body;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ propertyId: property.id, tenantId: tenant.id, category: 'PLUMBING', priority: 'URGENT', status: 'OPEN' });

    // Unknown number: same reply, no repair created, but the agency gets a follow-up.
    const stranger = await request(app).post(url).send({ fullName: 'Nobody', phone: '0799 111 222', message: 'Something is broken here' });
    expect(stranger.status).toBe(201);
    expect((await request(app).get('/api/maintenance').set(h)).body).toHaveLength(1);
    const fu = await request(app).get('/api/follow-ups').set(h);
    expect(JSON.stringify(fu.body)).toContain('Unmatched repair report');

    // Honeypot creates nothing; bad input is rejected; unknown agency is a 404.
    await request(app).post(url).send({ fullName: 'Bot', phone: '0733000009', message: 'spam spam spam', website: 'http://x' });
    expect((await request(app).get('/api/maintenance').set(h)).body).toHaveLength(1);
    expect((await request(app).post(url).send({ fullName: 'Tom', phone: '0733000009', message: 'x' })).status).toBe(422);
    expect((await request(app).post('/api/public/organizations/nope-nope/repair-reports').send({ fullName: 'Tom', phone: '0733000009', message: 'Leaking roof' })).status).toBe(404);
  });

  it('does not accept repair reports for an agency without rent management', async () => {
    const t = await setupTenant('ORG_ADMIN', 'STARTER');
    const res = await request(app).post(`/api/public/organizations/${t.org.slug}/repair-reports`).send({ fullName: 'Tom', phone: '0733000009', message: 'Leaking roof' });
    expect(res.status).toBe(404);
  });
});
