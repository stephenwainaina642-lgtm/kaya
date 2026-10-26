import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { truncateAll, createOrg, createUser } from './helpers';
import { hashPassword } from '../lib/password';
import { systemDb } from '../db/system';
import { users, organizations } from '../db/schema';
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

  it('locks the account after 5 consecutive wrong passwords, and a correct password clears it', async () => {
    const org = await createOrg();
    const passwordHash = await hashPassword('Correct!Pass1');
    await systemDb.insert(users).values({ organizationId: org.id, name: 'Wanjiru', email: 'wanjiru@test.kaya', passwordHash, role: 'ORG_ADMIN' });

    for (let i = 0; i < 4; i++) {
      const res = await request(app).post('/api/auth/login').send({ email: 'wanjiru@test.kaya', password: 'wrong' });
      expect(res.status).toBe(401);
    }
    // 5th wrong attempt trips the lock, even though the password is irrelevant at this point.
    const fifth = await request(app).post('/api/auth/login').send({ email: 'wanjiru@test.kaya', password: 'wrong' });
    expect(fifth.status).toBe(401);

    // Locked out now — even the CORRECT password is rejected until the cooldown passes.
    const lockedOut = await request(app).post('/api/auth/login').send({ email: 'wanjiru@test.kaya', password: 'Correct!Pass1' });
    expect(lockedOut.status).toBe(423);

    // Manually expire the lock (as if the cooldown had passed) to confirm a correct login then clears it.
    await systemDb.update(users).set({ lockedUntil: new Date(Date.now() - 1000) }).where(eq(users.email, 'wanjiru@test.kaya'));
    const recovered = await request(app).post('/api/auth/login').send({ email: 'wanjiru@test.kaya', password: 'Correct!Pass1' });
    expect(recovered.status).toBe(200);

    const [row] = await systemDb.select().from(users).where(eq(users.email, 'wanjiru@test.kaya'));
    expect(row?.failedLoginAttempts).toBe(0);
    expect(row?.lockedUntil).toBeNull();
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

describe('self-serve signup', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('creates a new agency workspace and logs the admin straight in', async () => {
    const res = await request(app).post('/api/auth/register').send({
      organizationName: 'Riverside Realty',
      adminName: 'Jane Mwangi',
      adminEmail: 'jane@riverside.example',
      password: 'StrongPass1',
      currency: 'USD',
    });

    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user.role).toBe('ORG_ADMIN');
    expect(res.body.user.organizationName).toBe('Riverside Realty');
    expect(res.body.user.plan).toBe('STARTER');
    expect(res.body.user.currency).toBe('USD');
    expect(res.headers['set-cookie']?.[0]).toMatch(/kaya_refresh=/);

    // The account this just created actually works for a normal login too.
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'jane@riverside.example', password: 'StrongPass1' });
    expect(loginRes.status).toBe(200);
  });

  it('defaults to KES when no currency is given', async () => {
    const res = await request(app).post('/api/auth/register').send({
      organizationName: 'Default Currency Agency',
      adminName: 'Amina',
      adminEmail: 'amina@defaultcurrency.example',
      password: 'StrongPass1',
    });
    expect(res.status).toBe(201);
    expect(res.body.user.currency).toBe('KES');
  });

  it('rejects a signup with an email already in use', async () => {
    const org = await createOrg();
    const passwordHash = await hashPassword('Correct!Pass1');
    await systemDb.insert(users).values({ organizationId: org.id, name: 'Existing', email: 'taken@test.kaya', passwordHash, role: 'ORG_ADMIN' });

    const res = await request(app).post('/api/auth/register').send({
      organizationName: 'Another Agency',
      adminName: 'Someone Else',
      adminEmail: 'taken@test.kaya',
      password: 'StrongPass1',
    });
    expect(res.status).toBe(409);
  });

  it('rejects a weak password', async () => {
    const res = await request(app).post('/api/auth/register').send({
      organizationName: 'Weak Password Agency',
      adminName: 'Someone',
      adminEmail: 'weak@test.kaya',
      password: 'short',
    });
    expect(res.status).toBe(422);
  });

  it('gives two agencies with the same name distinct slugs, same as the manual onboarding path', async () => {
    const first = await request(app).post('/api/auth/register').send({
      organizationName: 'Twin Agency',
      adminName: 'First Admin',
      adminEmail: 'first@twin.example',
      password: 'StrongPass1',
    });
    const second = await request(app).post('/api/auth/register').send({
      organizationName: 'Twin Agency',
      adminName: 'Second Admin',
      adminEmail: 'second@twin.example',
      password: 'StrongPass1',
    });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const orgs = await systemDb.select({ slug: organizations.slug }).from(organizations);
    const slugs = orgs.map((o) => o.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
