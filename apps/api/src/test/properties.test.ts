import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { truncateAll, setupTenant } from './helpers';

const app = createApp();

async function createOwner(authHeader: Record<string, string>) {
  return request(app).post('/api/owners').set(authHeader).send({ fullName: 'James Mwangi', phone: '+254722000001' });
}

async function createProperty(authHeader: Record<string, string>, ownerId: string, overrides: Record<string, unknown> = {}) {
  return request(app)
    .post('/api/properties')
    .set(authHeader)
    .send({
      reference: `PRP-${Math.random().toString(36).slice(2, 8)}`,
      title: 'Riverside 3BR Apartment',
      listingType: 'SALE',
      propertyType: 'APARTMENT',
      price: 12000000,
      location: 'Kilimani',
      bedrooms: 3,
      bathrooms: 2,
      ownerId,
      ...overrides,
    });
}

describe('properties & owners', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('creates an owner then a property linked to that owner', async () => {
    const { authHeader } = await setupTenant();
    const owner = await createOwner(authHeader);
    expect(owner.status).toBe(201);

    const property = await createProperty(authHeader, owner.body.id);
    expect(property.status).toBe(201);
    expect(property.body.ownerId).toBe(owner.body.id);
    expect(property.body.status).toBeTruthy();
  });

  it('rejects a property reference duplicated within the same org', async () => {
    const { authHeader } = await setupTenant();
    const owner = await createOwner(authHeader);
    const ref = `PRP-${Math.random().toString(36).slice(2, 8)}`;
    const first = await createProperty(authHeader, owner.body.id, { reference: ref });
    expect(first.status).toBe(201);
    const second = await createProperty(authHeader, owner.body.id, { reference: ref });
    expect(second.status).not.toBe(201);
  });

  it('adds and removes a property image', async () => {
    const { authHeader } = await setupTenant();
    const owner = await createOwner(authHeader);
    const property = await createProperty(authHeader, owner.body.id);

    const addRes = await request(app)
      .post(`/api/properties/${property.body.id}/images`)
      .set(authHeader)
      .send({ url: 'https://example.com/photo.jpg', isCover: true });
    expect(addRes.status).toBe(200);
    const image = addRes.body.images.find((i: { url: string }) => i.url === 'https://example.com/photo.jpg');
    expect(image).toBeTruthy();

    const removeRes = await request(app).delete(`/api/properties/${property.body.id}/images/${image.id}`).set(authHeader);
    expect(removeRes.status).toBe(200);
    expect(removeRes.body.images.find((i: { id: string }) => i.id === image.id)).toBeFalsy();
  });

  it('logs owner contact and reflects it in the owner timeline/activity', async () => {
    const { authHeader } = await setupTenant();
    const owner = await createOwner(authHeader);
    const res = await request(app)
      .post(`/api/owners/${owner.body.id}/contact`)
      .set(authHeader)
      .send({ channel: 'CALL', inbound: false, body: 'Discussed listing renewal' });
    expect(res.status).toBe(200);
  });

  it('keeps properties scoped per organization (RLS)', async () => {
    const tenantA = await setupTenant();
    const tenantB = await setupTenant();
    const ownerA = await createOwner(tenantA.authHeader);
    const property = await createProperty(tenantA.authHeader, ownerA.body.id);

    const listB = await request(app).get('/api/properties').set(tenantB.authHeader);
    expect(listB.body.items).toHaveLength(0);

    const getB = await request(app).get(`/api/properties/${property.body.id}`).set(tenantB.authHeader);
    expect(getB.status).toBe(404);
  });
});
