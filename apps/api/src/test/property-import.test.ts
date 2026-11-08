import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { setupTenant, truncateAll, createUser } from './helpers';

const app = createApp();

describe('property import', () => {
  beforeEach(truncateAll);

  it('creates properties and landlords, skips repeats, and reports bad rows', async () => {
    const t = await setupTenant('ORG_ADMIN', 'GROWTH');
    const h = t.authHeader;
    const rows = [
      { title: 'Kilimani 2BR', listingType: 'rent', propertyType: 'apartment', price: 'KES 85,000', location: 'Kilimani', bedrooms: '2', bathrooms: '2', ownerName: 'Grace Wanjiru', ownerPhone: '0711 000 001' },
      { title: 'Lavington Cottage', price: '60000', location: 'Lavington', ownerPhone: '0711000001' }, // same landlord, defaults
      { title: 'Kilimani 2BR', price: '85000', location: 'kilimani', ownerPhone: '0711000001' }, // repeat in file
      { title: 'No Price', location: 'Karen', ownerName: 'X', ownerPhone: '0722000002' },
      { title: 'Bad Type', price: '1000', location: 'Karen', propertyType: 'castle', ownerName: 'X', ownerPhone: '0722000002' },
      { title: 'New Landlord No Name', price: '1000', location: 'Karen', ownerPhone: '0733000003' },
    ];
    const res = await request(app).post('/api/properties/import').set(h).send({ rows });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ created: 2, ownersCreated: 1, duplicates: 1 });
    expect(res.body.invalid.map((i: { row: number }) => i.row)).toEqual([4, 5, 6]);

    const list = (await request(app).get('/api/properties').set(h)).body;
    expect(list.total).toBe(2);
    const k = list.items.find((p: { title: string }) => p.title === 'Kilimani 2BR');
    expect(k).toMatchObject({ price: 85_000, bedrooms: 2, listingType: 'RENT', status: 'AVAILABLE' });
    expect(k.reference).toMatch(/^IMP-/);

    // Re-running the same file adds nothing.
    const again = await request(app).post('/api/properties/import').set(h).send({ rows: rows.slice(0, 2) });
    expect(again.body).toMatchObject({ created: 0, ownersCreated: 0, duplicates: 2 });
  });

  it('keeps a viewer out', async () => {
    const t = await setupTenant('ORG_ADMIN', 'GROWTH');
    const viewer = await createUser(t.org.id, { role: 'VIEWER' });
    const res = await request(app).post('/api/properties/import').set({ Authorization: `Bearer ${viewer.token}` }).send({ rows: [{}] });
    expect(res.status).toBe(403);
  });
});
