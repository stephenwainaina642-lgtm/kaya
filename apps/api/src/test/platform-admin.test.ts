import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { truncateAll, createOrg, createPlatformAdmin } from './helpers';

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
});
