import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { truncateAll, setupTenant } from './helpers';

const app = createApp();

describe('leads', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('creates and retrieves a lead', async () => {
    const { authHeader } = await setupTenant();
    const createRes = await request(app).post('/api/leads').set(authHeader).send({
      fullName: 'Amina Hassan', phone: '+254712345678', source: 'WEBSITE', temperature: 'HOT',
    });
    expect(createRes.status).toBe(201);
    expect(createRes.body.fullName).toBe('Amina Hassan');
    expect(createRes.body.status).toBe('NEW');

    const getRes = await request(app).get(`/api/leads/${createRes.body.id}`).set(authHeader);
    expect(getRes.status).toBe(200);
    expect(getRes.body.phone).toBe('+254712345678');
  });

  it('rejects a duplicate phone number within the same org', async () => {
    const { authHeader } = await setupTenant();
    await request(app).post('/api/leads').set(authHeader).send({ fullName: 'First', phone: '+254700000001' });
    const dup = await request(app).post('/api/leads').set(authHeader).send({ fullName: 'Second', phone: '+254700000001' });
    expect(dup.status).toBe(409);
  });

  it('allows the same phone number across different organizations', async () => {
    const tenantA = await setupTenant();
    const tenantB = await setupTenant();
    const a = await request(app).post('/api/leads').set(tenantA.authHeader).send({ fullName: 'A', phone: '+254700000099' });
    const b = await request(app).post('/api/leads').set(tenantB.authHeader).send({ fullName: 'B', phone: '+254700000099' });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
  });

  it('requires a lostReason when setting status to LOST', async () => {
    const { authHeader } = await setupTenant();
    const lead = await request(app).post('/api/leads').set(authHeader).send({ fullName: 'C', phone: '+254700000002' });
    const noReason = await request(app).post(`/api/leads/${lead.body.id}/status`).set(authHeader).send({ status: 'LOST' });
    expect(noReason.status).toBe(422);

    const withReason = await request(app)
      .post(`/api/leads/${lead.body.id}/status`)
      .set(authHeader)
      .send({ status: 'LOST', lostReason: 'Went with a competitor' });
    expect(withReason.status).toBe(200);
    expect(withReason.body.status).toBe('LOST');
  });

  it('qualifies a lead into a client and carries requirements over', async () => {
    const { authHeader } = await setupTenant();
    const lead = await request(app).post('/api/leads').set(authHeader).send({
      fullName: 'Dennis', phone: '+254700000003',
      requirements: { intent: 'BUY', budgetMin: 5000000, budgetMax: 9000000 },
    });
    expect(lead.status).toBe(201);

    const qualified = await request(app).post(`/api/leads/${lead.body.id}/qualify`).set(authHeader);
    expect(qualified.status).toBe(200);
    expect(qualified.body.clientId).toBeTruthy();

    const client = await request(app).get(`/api/clients/${qualified.body.clientId}`).set(authHeader);
    expect(client.status).toBe(200);
    expect(client.body.requirements?.budgetMin).toBe(5000000);

    const leadAfter = await request(app).get(`/api/leads/${lead.body.id}`).set(authHeader);
    expect(leadAfter.body.status).toBe('QUALIFIED');
  });

  it('does not leak leads across organizations (RLS)', async () => {
    const tenantA = await setupTenant();
    const tenantB = await setupTenant();
    const lead = await request(app).post('/api/leads').set(tenantA.authHeader).send({ fullName: 'Secret', phone: '+254700000004' });

    const fromB = await request(app).get(`/api/leads/${lead.body.id}`).set(tenantB.authHeader);
    expect(fromB.status).toBe(404);

    const listB = await request(app).get('/api/leads').set(tenantB.authHeader);
    expect(listB.status).toBe(200);
    expect(listB.body.items).toHaveLength(0);
  });

  it('logs contact and updates lastContactedAt / status from NEW to CONTACTED', async () => {
    const { authHeader } = await setupTenant();
    const lead = await request(app).post('/api/leads').set(authHeader).send({ fullName: 'Grace', phone: '+254700000005' });
    expect(lead.body.status).toBe('NEW');

    const contact = await request(app)
      .post(`/api/leads/${lead.body.id}/contact`)
      .set(authHeader)
      .send({ channel: 'WHATSAPP', inbound: true, body: 'Hi, I am interested in this property' });
    expect(contact.status).toBe(200);
    expect(contact.body.status).toBe('CONTACTED');
    expect(contact.body.lastContactedAt).toBeTruthy();

    const timeline = await request(app).get(`/api/leads/${lead.body.id}/timeline`).set(authHeader);
    expect(timeline.status).toBe(200);
    expect(timeline.body.items.length).toBeGreaterThan(0);
  });
});
