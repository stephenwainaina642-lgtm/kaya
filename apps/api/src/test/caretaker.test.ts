import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { setupTenant, createUser, truncateAll } from './helpers';
import { can, dataScope } from '@kaya/shared';

const app = createApp();

describe('caretaker role', () => {
  beforeEach(truncateAll);

  it('permissions are limited to repairs and viewing units', () => {
    for (const p of ['maintenance:view', 'maintenance:create', 'maintenance:edit', 'properties:view'] as const) expect(can('CARETAKER', p)).toBe(true);
    for (const p of ['rent:view', 'clients:view', 'leads:view', 'dashboard:view', 'owners:view', 'properties:edit', 'maintenance:delete', 'reports:view'] as const) {
      expect(can('CARETAKER', p)).toBe(false);
    }
    expect(dataScope('CARETAKER', 'properties')).toBe('own');
  });

  it('can log repairs but is locked out of money, people and the dashboard', async () => {
    const t = await setupTenant('ORG_ADMIN', 'GROWTH');
    const owner = (await request(app).post('/api/owners').set(t.authHeader).send({ fullName: 'O', phone: '0722000001' })).body;
    const care = await createUser(t.org.id, { role: 'CARETAKER' });
    const h = { Authorization: `Bearer ${care.token}` };
    const property = (await request(app).post('/api/properties').set(t.authHeader).send({
      title: 'Unit 1', reference: 'U-1', listingType: 'RENT', propertyType: 'APARTMENT', price: 20000, location: 'Nyali', bathrooms: 1, ownerId: owner.id, assignedAgentId: care.id,
    })).body;

    const made = await request(app).post('/api/maintenance').set(h).send({ propertyId: property.id, title: 'Leaking tap', priority: 'LOW' });
    expect(made.status).toBe(201);
    expect((await request(app).get('/api/maintenance').set(h)).status).toBe(200);
    expect((await request(app).delete(`/api/maintenance/${made.body.id}`).set(h)).status).toBe(403);

    for (const path of ['/api/rent/charges', '/api/clients', '/api/leads', '/api/dashboard', '/api/owners', '/api/reports/summary', '/api/team/members']) {
      expect([403, 404], path).toContain((await request(app).get(path).set(h)).status);
    }
    expect((await request(app).get('/api/dashboard').set(h)).status).toBe(403);
    expect((await request(app).get('/api/team/members').set(h)).status).toBe(403);
    expect((await request(app).get('/api/rent/charges').set(h)).status).toBe(403);
    expect((await request(app).post('/api/properties/bulk').set(h).send({})).status).toBe(403);
  });

  it('can be invited by an admin', async () => {
    const t = await setupTenant('ORG_ADMIN', 'GROWTH');
    const res = await request(app).post('/api/team/members').set(t.authHeader).send({ name: 'Peter Caretaker', email: 'peter@test.kaya', role: 'CARETAKER' });
    expect([200, 201]).toContain(res.status);
  });
});
