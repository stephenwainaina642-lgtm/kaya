import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { truncateAll, setupTenant, createUser } from './helpers';

const app = createApp();

describe('sample data', () => {
  beforeEach(async () => { await truncateAll(); });

  it('loads demo records, keeps the checklist honest, and removes only its own', async () => {
    const t = await setupTenant();
    await request(app).post('/api/leads').set(t.authHeader).send({ fullName: 'My Real Lead', phone: '+254799000001' });

    const loaded = await request(app).post('/api/onboarding/sample-data').set(t.authHeader);
    expect(loaded.status).toBe(201);
    expect(loaded.body.sampleLoaded).toBe(true);
    // demo properties must not tick "add your first property"
    expect(loaded.body.steps.find((s: any) => s.key === 'property').done).toBe(false);
    expect(loaded.body.steps.find((s: any) => s.key === 'lead').done).toBe(true);

    expect((await request(app).get('/api/leads').set(t.authHeader)).body.total).toBe(7);
    expect((await request(app).get('/api/properties').set(t.authHeader)).body.total).toBe(5);
    expect((await request(app).post('/api/onboarding/sample-data').set(t.authHeader)).status).toBe(409);

    const removed = await request(app).delete('/api/onboarding/sample-data').set(t.authHeader);
    expect(removed.status).toBe(200);
    expect(removed.body.sampleLoaded).toBe(false);
    const leads = await request(app).get('/api/leads').set(t.authHeader);
    expect(leads.body.total).toBe(1);
    expect(leads.body.items[0].fullName).toBe('My Real Lead');
    expect((await request(app).get('/api/properties').set(t.authHeader)).body.total).toBe(0);
  });

  it('is isolated per agency and admin-only', async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    await request(app).post('/api/onboarding/sample-data').set(a.authHeader);
    expect((await request(app).get('/api/leads').set(b.authHeader)).body.total).toBe(0);
    const agent = await createUser(a.org.id, { role: 'AGENT' });
    const h = { Authorization: `Bearer ${agent.token}` };
    expect((await request(app).delete('/api/onboarding/sample-data').set(h)).status).toBe(403);
    expect((await request(app).post('/api/onboarding/sample-data').set(h)).status).toBe(403);
  });
});
