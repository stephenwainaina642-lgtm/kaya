import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { setupTenant, truncateAll } from './helpers';
import { sniffImage } from '../modules/properties/photos.service';

const app = createApp();
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

describe('photo upload', () => {
  beforeEach(truncateAll);

  it('recognises real image bytes only', () => {
    expect(sniffImage(PNG)).toBe('image/png');
    expect(sniffImage(Buffer.from('<svg onload=alert(1)></svg> padding padding'))).toBeNull();
    expect(sniffImage(Buffer.from('%PDF-1.4 padding padding padding'))).toBeNull();
  });

  it('shares one upload across a whole building, serves it publicly, and keeps files until the last use is removed', async () => {
    const t = await setupTenant('ORG_ADMIN', 'GROWTH');
    const h = t.authHeader;
    const owner = (await request(app).post('/api/owners').set(h).send({ fullName: 'O', phone: '0722000001' })).body;
    await request(app).post('/api/properties/bulk').set(h).send({
      building: 'Photo Court', ownerId: owner.id, location: 'Kilimani', listingType: 'RENT', propertyType: 'APARTMENT', floors: 2, unitsPerFloor: 2, price: 20000,
    });

    const bad = await request(app).post('/api/properties/buildings/Photo%20Court/photos').set(h).attach('files', Buffer.from('<svg></svg> not an image at all'), 'x.png');
    expect(bad.status).toBe(422);

    const ok = await request(app).post('/api/properties/buildings/Photo%20Court/photos').set(h).attach('files', PNG, 'front.png');
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ units: 4, photos: 1 });

    const items = (await request(app).get('/api/properties').set(h).query({ pageSize: 20 })).body.items;
    const detail = (await request(app).get(`/api/properties/${items[0].id}`).set(h)).body;
    expect(detail.images).toHaveLength(1);
    expect(detail.images[0].isCover).toBe(true);
    const img = await request(app).get(detail.images[0].url);
    expect(img.status).toBe(200);
    expect(img.headers['content-type']).toBe('image/png');

    // Only chosen units
    const only = await request(app).post('/api/properties/buildings/Photo%20Court/photos').set(h).field('unitIds', items[1].id).attach('files', PNG, 'b.png');
    expect(only.body.units).toBe(1);

    // Another agency can't attach photos to this one's units
    const other = await setupTenant('ORG_ADMIN', 'GROWTH');
    expect((await request(app).post(`/api/properties/${items[0].id}/photos`).set(other.authHeader).attach('files', PNG, 'z.png')).status).toBe(404);

    // Removing one unit's copy leaves the others' photo working
    await request(app).delete(`/api/properties/${items[0].id}/images/${detail.images[0].id}`).set(h);
    const second = (await request(app).get(`/api/properties/${items[2].id}`).set(h)).body;
    expect((await request(app).get(second.images[0].url)).status).toBe(200);

    expect((await request(app).get('/api/public/photos/not-a-uuid')).status).toBe(404);
  });
});

describe('owner portal units', () => {
  beforeEach(truncateAll);
  it('shows each owner their units with state, advertising and listing link, but only their own', async () => {
    const t = await setupTenant('ORG_ADMIN', 'GROWTH');
    const h = t.authHeader;
    const mine = (await request(app).post('/api/owners').set(h).send({ fullName: 'Mine', phone: '0722000001' })).body;
    const theirs = (await request(app).post('/api/owners').set(h).send({ fullName: 'Theirs', phone: '0722000002' })).body;
    for (const [o, name] of [[mine, 'Mine Court'], [theirs, 'Theirs Court']] as const) {
      await request(app).post('/api/properties/bulk').set(h).send({ building: name, ownerId: o.id, location: 'X', listingType: 'RENT', propertyType: 'APARTMENT', floors: 1, unitsPerFloor: 2, price: 10000 });
    }
    const units = (await request(app).get('/api/properties/buildings/Mine%20Court').set(h)).body.unitList;
    await request(app).post(`/api/properties/${units[0].id}/advertise`).set(h).send({ advertised: true });
    const tenant = (await request(app).post('/api/clients').set(h).send({ fullName: 'Tina Tenant', phone: '0733000001' })).body;
    await request(app).post('/api/rent/leases').set(h).send({ propertyId: units[1].id, tenantId: tenant.id, rentAmount: 10000, dueDay: 1, startDate: '2025-01-01' });
    await request(app).post(`/api/properties/${units[0].id}/photos`).set(h).attach('files', PNG, 'a.png');

    const link = (await request(app).post(`/api/rent/owners/${mine.id}/portal-link`).set(h)).body;
    const view = (await request(app).get(`/api/public/portal/${link.token}`)).body;
    expect(view.units).toHaveLength(2);
    const vacant = view.units.find((u: { state: string }) => u.state === 'VACANT');
    const taken = view.units.find((u: { state: string }) => u.state === 'LET');
    expect(vacant).toMatchObject({ advertised: true, listPrice: 10000, building: 'Mine Court' });
    expect(vacant.listingPath).toMatch(new RegExp(`^/listings/${t.org.slug}/`));
    expect(vacant.coverImageUrl).toMatch(/^\/api\/public\/photos\//);
    expect(taken).toMatchObject({ tenantName: 'Tina Tenant', rent: 10000, advertised: false, listingPath: null });
    expect(JSON.stringify(view)).not.toContain('Theirs');
  });
});
