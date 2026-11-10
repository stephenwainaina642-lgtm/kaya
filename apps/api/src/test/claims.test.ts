import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { setupTenant, truncateAll } from './helpers';

const app = createApp();

async function setup() {
  const t = await setupTenant('ORG_ADMIN', 'GROWTH');
  const h = t.authHeader;
  const owner = (await request(app).post('/api/owners').set(h).send({ fullName: 'O', phone: '0722000001' })).body;
  const prop = (await request(app).post('/api/properties').set(h).send({
    title: 'Unit 7', reference: 'U-7', listingType: 'RENT', propertyType: 'APARTMENT', price: 20000, location: 'Nyali', bathrooms: 1, ownerId: owner.id,
  })).body;
  const tenant = (await request(app).post('/api/clients').set(h).send({ fullName: 'Tina Tenant', phone: '0733000001' })).body;
  const lease = (await request(app).post('/api/rent/leases').set(h).send({ propertyId: prop.id, tenantId: tenant.id, rentAmount: 20000, dueDay: 1, startDate: '2026-08-01' })).body;
  await request(app).post('/api/rent/charges/generate').set(h).send({ period: '2026-08' });
  await request(app).post('/api/rent/charges/generate').set(h).send({ period: '2026-09' });
  const token = (await request(app).post(`/api/rent/leases/${lease.id}/portal-link`).set(h)).body.token;
  return { t, h, lease, token };
}

describe('tenant payment claims', () => {
  beforeEach(truncateAll);

  it('shows the agency pay instructions on the tenant link', async () => {
    const { h, token } = await setup();
    expect((await request(app).get(`/api/public/tenant-portal/${token}`)).body.payInfo).toBeNull();
    await request(app).patch('/api/org/branding').set(h).send({ rentPaymentInfo: 'Paybill 247247, account: your unit number' });
    expect((await request(app).get(`/api/public/tenant-portal/${token}`)).body.payInfo).toBe('Paybill 247247, account: your unit number');
  });

  it('records nothing until an agent confirms, then pays the oldest month first', async () => {
    const { h, token } = await setup();
    const bad = await request(app).post(`/api/public/tenant-portal/${token}/claims`).send({ amount: 5000, mpesaCode: 'nope' });
    expect(bad.status).toBe(422);

    const ok = await request(app).post(`/api/public/tenant-portal/${token}/claims`).send({ amount: 30000, mpesaCode: 'shk4abc123' });
    expect(ok.status).toBe(201);
    expect((await request(app).post(`/api/public/tenant-portal/${token}/claims`).send({ amount: 100, mpesaCode: 'SHK4ABC123' })).status).toBe(409);
    expect((await request(app).get(`/api/public/tenant-portal/${token}`)).body.claims).toMatchObject([{ amount: 30000, mpesaCode: 'SHK4ABC123', status: 'PENDING' }]);

    const before = (await request(app).get('/api/rent/summary').set(h)).body;
    const list = (await request(app).get('/api/rent/claims').set(h)).body;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ tenantName: 'Tina Tenant', amount: 30000 });

    const res = await request(app).post(`/api/rent/claims/${list[0].id}/confirm`).set(h);
    expect(res.status).toBe(200);
    expect(res.body.applied).toBe(2); // August in full (20,000) and 10,000 of September
    const charges = (await request(app).get('/api/rent/charges').set(h).query({ period: '2026-08' })).body;
    expect(charges[0]).toMatchObject({ paidAmount: 20000, status: 'PAID' });
    const sep = (await request(app).get('/api/rent/charges').set(h).query({ period: '2026-09' })).body;
    expect(sep[0]).toMatchObject({ paidAmount: 10000 });
    expect(before).toBeTruthy();

    expect((await request(app).post(`/api/rent/claims/${list[0].id}/confirm`).set(h)).status).toBe(409);
    expect((await request(app).get('/api/rent/claims').set(h)).body).toHaveLength(0);
    expect((await request(app).post(`/api/public/tenant-portal/${token}/claims`).send({ amount: 100, mpesaCode: 'SHK4ABC123' })).status).toBe(409);
  });

  it('refuses to confirm more than the tenant owes, and rejected codes can be resubmitted', async () => {
    const { h, token } = await setup();
    await request(app).post(`/api/public/tenant-portal/${token}/claims`).send({ amount: 90000, mpesaCode: 'ABCDE12345' });
    const [c] = (await request(app).get('/api/rent/claims').set(h)).body;
    expect((await request(app).post(`/api/rent/claims/${c.id}/confirm`).set(h)).status).toBe(422);
    expect((await request(app).post(`/api/rent/claims/${c.id}/reject`).set(h)).status).toBe(204);
    expect((await request(app).post(`/api/public/tenant-portal/${token}/claims`).send({ amount: 20000, mpesaCode: 'ABCDE12345' })).status).toBe(201);
  });

  it('rejects unknown links and non-rent roles', async () => {
    const { token } = await setup();
    expect((await request(app).post('/api/public/tenant-portal/' + 'x'.repeat(30) + '/claims').send({ amount: 1, mpesaCode: 'ABCDE12345' })).status).toBe(404);
    expect(token.length).toBeGreaterThan(20);
    const t2 = await setupTenant('AGENT', 'GROWTH');
    expect((await request(app).get('/api/rent/claims').set(t2.authHeader)).status).toBe(403);
  });
});
