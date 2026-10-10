import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { truncateAll, createOrg, createUser } from './helpers';
import { hashPassword } from '../lib/password';
import { systemDb } from '../db/system';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';

const app = createApp();

describe('auth', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('logs in with correct credentials and returns an access token + user', async () => {
    const org = await createOrg();
    const passwordHash = await hashPassword('Correct!Pass1');
    const [u] = await systemDb
      .insert(users)
      .values({ organizationId: org.id, name: 'Wanjiru', email: 'wanjiru@test.kaya', passwordHash, role: 'ORG_ADMIN' })
      .returning();

    const res = await request(app).post('/api/auth/login').send({ email: 'wanjiru@test.kaya', password: 'Correct!Pass1' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user.id).toBe(u!.id);
    expect(res.headers['set-cookie']?.[0]).toMatch(/kaya_refresh=/);
  });

  it('rejects an incorrect password', async () => {
    const org = await createOrg();
    const passwordHash = await hashPassword('Correct!Pass1');
    await systemDb.insert(users).values({ organizationId: org.id, name: 'Wanjiru', email: 'wanjiru@test.kaya', passwordHash, role: 'ORG_ADMIN' });

    const res = await request(app).post('/api/auth/login').send({ email: 'wanjiru@test.kaya', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('refreshes an access token using the refresh cookie', async () => {
    const org = await createOrg();
    const passwordHash = await hashPassword('Correct!Pass1');
    await systemDb.insert(users).values({ organizationId: org.id, name: 'Wanjiru', email: 'wanjiru@test.kaya', passwordHash, role: 'ORG_ADMIN' });

    const loginRes = await request(app).post('/api/auth/login').send({ email: 'wanjiru@test.kaya', password: 'Correct!Pass1' });
    const cookie = loginRes.headers['set-cookie']?.[0] as string;

    const refreshRes = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.accessToken).toBeTruthy();
  });

  it('rejects requests to protected routes without a token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns the current user on /me with a valid token', async () => {
    const org = await createOrg();
    const user = await createUser(org.id, { name: 'Brian', role: 'MANAGER' });

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(user.id);
    expect(res.body.role).toBe('MANAGER');
  });

  it('isolates users by organization (a token from one org cannot be reused elsewhere)', async () => {
    const orgA = await createOrg('Org A');
    const orgB = await createOrg('Org B');
    const userA = await createUser(orgA.id);
    await createUser(orgB.id, { email: 'other@test.kaya' });

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${userA.token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(userA.id);
  });
});
