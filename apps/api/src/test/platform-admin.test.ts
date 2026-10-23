import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { createApp } from '../app';
import { truncateAll, createOrg, createPlatformAdmin } from './helpers';
import { systemDb } from '../db/system';
import { platformAdmins } from '../db/schema';

const app = createApp();

describe('platform operator console', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('requires a valid operator token for every platform-admin route', async () => {
    const res = await request(app).get('/api/platform/stats');
    expect(res.status).toBe(401);
  });

  it('reports aggregate stats and the most recently onboarded organizations', async () => {
    const operator = await createPlatformAdmin();
    await createOrg('Older Agency', 'STARTER');
    await new Promise((r) => setTimeout(r, 10));
    const newest = await createOrg('Newest Agency', 'GROWTH');

    const res = await request(app).get('/api/platform/stats').set(operator.authHeader);
    expect(res.status).toBe(200);
    expect(res.body.totalOrganizations).toBe(2);
    expect(res.body.recentOrganizations[0].id).toBe(newest.id);
    expect(res.body.recentOrganizations[0].plan).toBe('GROWTH');
  });

  it('locks the operator account after 5 wrong passwords in a row', async () => {
    const operator = await createPlatformAdmin({ email: 'ops@test.kaya' });

    for (let i = 0; i < 5; i++) {
      const res = await request(app).post('/api/platform/auth/login').send({ email: operator.email, password: 'wrong' });
      expect(res.status).toBe(401);
    }

    // Correct password is now rejected too, until the cooldown passes.
    const lockedOut = await request(app).post('/api/platform/auth/login').send({ email: operator.email, password: 'Test!Pass1234' });
    expect(lockedOut.status).toBe(423);

    await systemDb.update(platformAdmins).set({ lockedUntil: new Date(Date.now() - 1000) }).where(eq(platformAdmins.email, operator.email));
    const recovered = await request(app).post('/api/platform/auth/login').send({ email: operator.email, password: 'Test!Pass1234' });
    expect(recovered.status).toBe(200);
  });
});
