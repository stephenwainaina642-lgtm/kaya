import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { setupTenant, truncateAll, createUser } from './helpers';

const app = createApp();

async function seedLease(h: Record<string, string>) {
  const owner = (await request(app).post('/api/owners').set(h).send({ fullName: 'Grace Wanjiru', phone: '+254722000001' })).body;
  const property = (await request(app).post('/api/properties').set(h).send({
    reference: 'PRP-1', title: 'Kilimani 2BR', listingType: 'RENT', propertyType: 'APARTMENT', price: 50_000, location: 'Kilimani', bedrooms: 2, bathrooms: 2, ownerId: owner.id,
  })).body;
  const tenant = (await request(app).post('/api/clients').set(h).send({ fullName: 'Tenant Tom', phone: '+254733000009' })).body;
  const lease = (await request(app).post('/api/rent/leases').set(h).send({ propertyId: property.id, tenantId: tenant.id, rentAmount: 50_000, dueDay: 5, startDate: '2026-01-01', feeBps: 1000 })).body;
  return { lease };
}

describe('tenant portal', () => {
  beforeEach(truncateAll);

  it('shows a tenant only their own balance through a secret link that can be revoked', async () => {
    const t = await setupTenant('ORG_ADMIN', 'GROWTH');
    const h = t.authHeader;
    const { lease } = await seedLease(h);
    await request(app).post('/api/rent/charges/generate').set(h).send({ period: '2026-03' });
    const charge = (await request(app).get('/api/rent/charges').set(h).query({ period: '2026-03' })).body[0];
    await request(app).post(`/api/rent/charges/${charge.id}/payments`).set(h).send({ amount: 20_000, method: 'CASH' });

    expect((await request(app).get(`/api/rent/leases/${lease.id}/portal-link`).set(h)).body.token).toBeNull();
    const { token } = (await request(app).post(`/api/rent/leases/${lease.id}/portal-link`).set(h)).body;
    expect(token).toHaveLength(32);

    const view = await request(app).get(`/api/public/tenant-portal/${token}`);
    expect(view.status).toBe(200);
    expect(view.headers['cache-control']).toBe('no-store');
    expect(view.body).toMatchObject({ tenantName: 'Tenant Tom', propertyTitle: 'Kilimani 2BR', rentAmount: 50_000, dueDay: 5, agencySlug: t.org.slug });
    expect(view.body.statement.totals).toMatchObject({ charged: 50_000, paid: 20_000, balance: 30_000 });
    // No contact details, landlord or fee terms leak to the tenant.
    const raw = JSON.stringify(view.body);
    expect(raw).not.toContain('254733000009');
    expect(raw).not.toContain('Grace');
    expect(raw).not.toContain('feeBps');

    // Re-issuing replaces it; the old link dies at once.
    const second = (await request(app).post(`/api/rent/leases/${lease.id}/portal-link`).set(h)).body.token;
    expect((await request(app).get(`/api/public/tenant-portal/${token}`)).status).toBe(404);
    expect((await request(app).get(`/api/public/tenant-portal/${second}`)).status).toBe(200);

    expect((await request(app).delete(`/api/rent/leases/${lease.id}/portal-link`).set(h)).status).toBe(204);
    expect((await request(app).get(`/api/public/tenant-portal/${second}`)).status).toBe(404);
  });

  it('refuses guesses, agents, other agencies and agencies off the plan', async () => {
    const t = await setupTenant('ORG_ADMIN', 'GROWTH');
    const h = t.authHeader;
    const { lease } = await seedLease(h);
    expect((await request(app).get('/api/public/tenant-portal/not-a-real-token-at-all-1234')).status).toBe(404);
    expect((await request(app).get('/api/public/tenant-portal/short')).status).toBe(404);

    const agent = await createUser(t.org.id, { role: 'AGENT' });
    expect((await request(app).post(`/api/rent/leases/${lease.id}/portal-link`).set({ Authorization: `Bearer ${agent.token}` })).status).toBe(403);

    const other = await setupTenant('ORG_ADMIN', 'GROWTH');
    expect((await request(app).post(`/api/rent/leases/${lease.id}/portal-link`).set(other.authHeader)).status).toBe(404);
  });
});
