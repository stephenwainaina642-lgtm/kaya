import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { truncateAll, setupTenant, createUser } from './helpers';

const app = createApp();

describe('global search', () => {
  beforeEach(async () => { await truncateAll(); });

  it('finds records across types, including a phone typed in local format', async () => {
    const t = await setupTenant();
    await request(app).post('/api/leads').set(t.authHeader).send({ fullName: 'Wanjiku Kamau', phone: '+254722123456' });
    const owner = await request(app).post('/api/owners').set(t.authHeader).send({ fullName: 'Kamau Holdings Owner', phone: '+254733000111' });
    await request(app).post('/api/properties').set(t.authHeader).send({
      reference: 'KAM-001', title: 'Kamau Gardens Apartment', listingType: 'RENT', propertyType: 'APARTMENT',
      price: 100000, location: 'Kilimani', ownerId: owner.body.id,
    });

    const byName = await request(app).get('/api/search').query({ q: 'kamau' }).set(t.authHeader);
    expect(byName.status).toBe(200);
    expect(byName.body.hits.map((h: any) => h.type).sort()).toEqual(['lead', 'owner', 'property']);
    expect(byName.body.hits.find((h: any) => h.type === 'lead').to).toMatch(/^\/leads\//);

    const byPhone = await request(app).get('/api/search').query({ q: '0722 123 456' }).set(t.authHeader);
    expect(byPhone.body.hits).toHaveLength(1);
    expect(byPhone.body.hits[0].title).toBe('Wanjiku Kamau');
  });

  it('treats wildcards literally, rejects tiny queries, and stays inside the agency', async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    await request(app).post('/api/leads').set(a.authHeader).send({ fullName: 'Plain Person', phone: '+254700555001' });
    await request(app).post('/api/leads').set(b.authHeader).send({ fullName: 'Plain Neighbour', phone: '+254700555002' });
    expect((await request(app).get('/api/search').query({ q: '%%' }).set(a.authHeader)).body.hits).toHaveLength(0);
    expect((await request(app).get('/api/search').query({ q: 'p' }).set(a.authHeader)).status).toBe(422);
    const res = await request(app).get('/api/search').query({ q: 'plain' }).set(a.authHeader);
    expect(res.body.hits.map((h: any) => h.title)).toEqual(['Plain Person']);
    expect((await request(app).get('/api/search').query({ q: 'plain' })).status).toBe(401);
  });

  it("only shows an agent their own leads", async () => {
    const t = await setupTenant();
    await request(app).post('/api/leads').set(t.authHeader).send({ fullName: 'Admin Owned Lead', phone: '+254700666001' });
    const agent = await createUser(t.org.id, { role: 'AGENT' });
    const res = await request(app).get('/api/search').query({ q: 'admin owned' }).set({ Authorization: `Bearer ${agent.token}` });
    expect(res.status).toBe(200);
    expect(res.body.hits.filter((h: any) => h.type === 'lead')).toHaveLength(0);
  });
});
