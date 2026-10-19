import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { truncateAll, setupTenant } from './helpers';
import { systemDb } from '../db/system';
import { leads, clients } from '../db/schema';

const app = createApp();

// The test environment deliberately has no ANTHROPIC_API_KEY configured (see
// apps/api/.env.test) — these tests exercise the two things that are real and
// verifiable without spending money on a live API call: the Growth+ plan gate,
// and the honest 503 a workspace sees until its platform admin adds a key.
// (A GROWTH/PRO org with a key configured would reach the real Claude call,
// which is exercised manually / in staging, not in this automated suite.)

describe('AI endpoints', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('blocks a STARTER org from every AI endpoint with an upgrade message', async () => {
    const { authHeader } = await setupTenant('ORG_ADMIN', 'STARTER');

    const scoreRes = await request(app).post('/api/ai/leads/00000000-0000-0000-0000-000000000000/score').set(authHeader);
    expect(scoreRes.status).toBe(403);
    expect(scoreRes.body.error.code).toBe('PLAN_UPGRADE_REQUIRED');
    expect(scoreRes.body.error.details.requiredPlan).toBe('GROWTH');

    const draftRes = await request(app)
      .post('/api/ai/draft-message')
      .set(authHeader)
      .send({ contactType: 'lead', contactId: '00000000-0000-0000-0000-000000000000', channel: 'whatsapp' });
    expect(draftRes.status).toBe(403);
    expect(draftRes.body.error.code).toBe('PLAN_UPGRADE_REQUIRED');

    const summarizeRes = await request(app)
      .post('/api/ai/summarize')
      .set(authHeader)
      .send({ contactType: 'lead', contactId: '00000000-0000-0000-0000-000000000000' });
    expect(summarizeRes.status).toBe(403);
    expect(summarizeRes.body.error.code).toBe('PLAN_UPGRADE_REQUIRED');

    const nextRes = await request(app).get('/api/ai/next-actions').set(authHeader);
    expect(nextRes.status).toBe(403);
    expect(nextRes.body.error.code).toBe('PLAN_UPGRADE_REQUIRED');
  });

  it('lets a GROWTH org past the plan gate but reports AI as not configured (no API key in test env)', async () => {
    const { org, authHeader } = await setupTenant('ORG_ADMIN', 'GROWTH');
    const [lead] = await systemDb.insert(leads).values({
      organizationId: org.id, fullName: 'Juma Otieno', phone: '+254700000010', source: 'WEBSITE',
    }).returning();
    if (!lead) throw new Error('failed to create test lead');

    const scoreRes = await request(app).post(`/api/ai/leads/${lead.id}/score`).set(authHeader);
    expect(scoreRes.status).toBe(503);
    expect(scoreRes.body.error.code).toBe('AI_NOT_CONFIGURED');

    const draftRes = await request(app)
      .post('/api/ai/draft-message')
      .set(authHeader)
      .send({ contactType: 'lead', contactId: lead.id, channel: 'whatsapp' });
    expect(draftRes.status).toBe(503);
    expect(draftRes.body.error.code).toBe('AI_NOT_CONFIGURED');

    const nextRes = await request(app).get('/api/ai/next-actions').set(authHeader);
    expect(nextRes.status).toBe(503);
    expect(nextRes.body.error.code).toBe('AI_NOT_CONFIGURED');
  });

  it('short-circuits to AI-not-configured before input validation runs (the config gate is a router-level middleware ahead of every route handler)', async () => {
    const { authHeader } = await setupTenant('ORG_ADMIN', 'PRO');

    const res = await request(app)
      .post('/api/ai/draft-message')
      .set(authHeader)
      .send({ contactType: 'lead', contactId: 'not-a-uuid', channel: 'whatsapp' });

    // Even malformed input gets the honest "not configured" response rather than a
    // validation error, since the availability check is cheaper and runs first.
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('AI_NOT_CONFIGURED');
  });

  it('rejects AI requests referencing a client in another tenant the same way (plan + config gates still apply)', async () => {
    const { org, authHeader } = await setupTenant('ORG_ADMIN', 'GROWTH');
    const [client] = await systemDb.insert(clients).values({
      organizationId: org.id, fullName: 'Amina Hassan', phone: '+254700000011',
    }).returning();
    if (!client) throw new Error('failed to create test client');

    const res = await request(app)
      .post('/api/ai/summarize')
      .set(authHeader)
      .send({ contactType: 'client', contactId: client.id });

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('AI_NOT_CONFIGURED');
  });
});
