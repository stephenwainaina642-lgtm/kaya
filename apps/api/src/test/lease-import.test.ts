import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { setupTenant, truncateAll } from './helpers';
import { parseDate, parseMoney } from '../modules/rent/import.service';

const app = createApp();

describe('parsing helpers', () => {
  it('reads Kenyan-style money and dates', () => {
    expect(parseMoney('KES 85,000')).toBe(85_000);
    expect(parseMoney('85000/=')).toBe(85_000);
    expect(parseMoney('abc')).toBeNull();
    expect(parseDate('01/03/2026')).toBe('2026-03-01');
    expect(parseDate('2026-3-1')).toBe('2026-03-01');
    expect(parseDate('31/02/2026')).toBeNull();
    expect(parseDate('')).toBeNull();
  });
});

describe('lease import', () => {
  beforeEach(truncateAll);

  async function property(h: Record<string, string>, title: string, ownerId?: string) {
    const owner = ownerId ? { id: ownerId } : (await request(app).post('/api/owners').set(h).send({ fullName: 'Grace Wanjiru', phone: '+254711000001' })).body;
    const res = await request(app).post('/api/properties').set(h).send({
      reference: `PRP-${Math.random().toString(36).slice(2, 8)}`, title, ownerId: owner.id, listingType: 'RENT',
      propertyType: 'APARTMENT', price: 85_000, location: 'Kilimani', bedrooms: 2, bathrooms: 2,
    });
    expect(res.status).toBe(201);
    return res.body;
  }

  it('creates leases and tenants, skips properties already let, and reports bad rows', async () => {
    const t = await setupTenant('ORG_ADMIN', 'GROWTH');
    const h = t.authHeader;
    const first = await property(h, 'Kilimani 2BR');
    await property(h, 'Lavington Cottage', first.ownerId);
    const rows = [
      { property: 'kilimani 2br', tenantName: 'Amina Yusuf', tenantPhone: '0722 000 000', rent: 'KES 85,000', deposit: '170000', dueDay: '5', startDate: '01/01/2026', feePercent: '10%' },
      { property: 'Lavington Cottage', tenantName: 'Brian Otieno', tenantPhone: '0733000111', rent: '60000', startDate: '2026-02-01' },
      { property: 'Kilimani 2BR', tenantName: 'Second Tenant', tenantPhone: '0744000222', rent: '85000', startDate: '2026-02-01' }, // same property again
      { property: 'Nowhere House', tenantName: 'X', tenantPhone: '0755000333', rent: '1000', startDate: '2026-02-01' },
      { property: 'Lavington Cottage', tenantName: 'Y', tenantPhone: '12', rent: '1000', startDate: '2026-02-01' },
      { property: 'Lavington Cottage', tenantName: 'Z', tenantPhone: '0766000444', rent: '1000', startDate: 'soon' },
    ];
    const res = await request(app).post('/api/rent/leases/import').set(h).send({ rows });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ created: 2, tenantsCreated: 2, skipped: 1 });
    expect(res.body.invalid.map((i: { row: number }) => i.row)).toEqual([4, 5, 6]);
    expect(res.body.invalid[0].reason).toContain('Nowhere House');

    const list = (await request(app).get('/api/rent/leases').set(h)).body;
    const amina = list.find((l: { tenantName: string }) => l.tenantName === 'Amina Yusuf');
    expect(amina).toMatchObject({ rentAmount: 85_000, depositAmount: 170_000, dueDay: 5, feeBps: 1000, status: 'ACTIVE' });

    // Running the same file again changes nothing.
    const again = await request(app).post('/api/rent/leases/import').set(h).send({ rows: rows.slice(0, 2) });
    expect(again.body).toMatchObject({ created: 0, tenantsCreated: 0, skipped: 2 });
  });

  it('is limited to managers on a plan with rent management', async () => {
    const starter = await setupTenant('ORG_ADMIN', 'STARTER');
    expect((await request(app).post('/api/rent/leases/import').set(starter.authHeader).send({ rows: [{}] })).status).toBe(403);
  });
});
