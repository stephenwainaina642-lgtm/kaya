import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { truncateAll, setupTenant, createUser } from './helpers';

const app = createApp();

describe('plan gating', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('blocks a STARTER org from the deals pipeline with an upgrade message', async () => {
    const { authHeader } = await setupTenant('ORG_ADMIN', 'STARTER');

    const res = await request(app).get('/api/deals/board').set(authHeader);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PLAN_UPGRADE_REQUIRED');
    expect(res.body.error.details.requiredPlan).toBe('GROWTH');
  });

  it('blocks a STARTER org from the matching and shortlists modules', async () => {
    const { authHeader } = await setupTenant('ORG_ADMIN', 'STARTER');

    const matchingRes = await request(app).get('/api/matching/properties/00000000-0000-0000-0000-000000000000/contacts').set(authHeader);
    expect(matchingRes.status).toBe(403);
    expect(matchingRes.body.error.code).toBe('PLAN_UPGRADE_REQUIRED');

    const shortlistsRes = await request(app).get('/api/shortlists/clients/00000000-0000-0000-0000-000000000000').set(authHeader);
    expect(shortlistsRes.status).toBe(403);
    expect(shortlistsRes.body.error.code).toBe('PLAN_UPGRADE_REQUIRED');
  });

  it('allows a GROWTH org into the deals pipeline but still blocks the audit log (Pro-only)', async () => {
    const { authHeader } = await setupTenant('ORG_ADMIN', 'GROWTH');

    const dealsRes = await request(app).get('/api/deals/board').set(authHeader);
    expect(dealsRes.status).toBe(200);

    const auditRes = await request(app).get('/api/audit').set(authHeader);
    expect(auditRes.status).toBe(403);
    expect(auditRes.body.error.details.requiredPlan).toBe('PRO');
  });

  it('allows a PRO org into the audit log', async () => {
    const { authHeader } = await setupTenant('MANAGER', 'PRO');

    const res = await request(app).get('/api/audit').set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });

  it('caps STARTER orgs at 3 users and rejects inviting a 4th', async () => {
    const { org, authHeader } = await setupTenant('ORG_ADMIN', 'STARTER');
    // setupTenant already created 1 (the admin) — add 2 more to reach the cap of 3.
    await createUser(org.id, { email: 'agent2@test.kaya' });
    await createUser(org.id, { email: 'agent3@test.kaya' });

    const res = await request(app)
      .post('/api/team/members')
      .set(authHeader)
      .send({ name: 'Fourth Agent', email: 'agent4@test.kaya', role: 'AGENT' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PLAN_UPGRADE_REQUIRED');
  });

  it('does not cap GROWTH orgs at 3 users', async () => {
    const { org, authHeader } = await setupTenant('ORG_ADMIN', 'GROWTH');
    await createUser(org.id, { email: 'agent2@test.kaya' });
    await createUser(org.id, { email: 'agent3@test.kaya' });

    const res = await request(app)
      .post('/api/team/members')
      .set(authHeader)
      .send({ name: 'Fourth Agent', email: 'agent4@test.kaya', role: 'AGENT' });

    expect(res.status).toBe(201);
  });
});
